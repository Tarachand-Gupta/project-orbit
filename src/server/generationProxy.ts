/**
 * Server-side generation proxy (Tech Doc §9) built on the Vercel AI SDK. Handles two POST routes:
 *   - /api/generate — prompt → constrained Object Spec, from the user's chosen provider.
 *   - /api/models   — list the models available for a provider+key (populates the model picker).
 *
 * Bring-your-own-key, ALWAYS in production: the deployment ships no server keys (an open-source
 * project's key on a public endpoint would be drained within hours). The one exception is a
 * self-hoster who sets ALLOW_SERVER_KEYS=1 + GEMINI_API_KEY (api/generate.ts). Every other
 * provider is keyed by the per-request client key.
 *
 * Provider-agnostic via a shared registry (src/objects/providers.ts). Routing by API style:
 *   - google    → @ai-sdk/google `generateObject` (native structured output, very reliable).
 *   - anthropic → @ai-sdk/anthropic `generateText` + tolerant JSON parse.
 *   - openai    → @ai-sdk/openai-compatible against the provider's base URL (OpenAI, Groq,
 *                 OpenRouter, xAI, NVIDIA, Mistral, DeepSeek, or any custom endpoint).
 * The client validates the result again and falls back to the local generator on any failure —
 * core mechanics never depend on a model.
 *
 * The endpoint is public + unauthenticated, so it is hardened: same-origin check for browsers,
 * per-client rate limit, request-body cap, generic upstream errors, and custom/OpenAI endpoints
 * run through ssrfGuard (DNS→private-IP check, no redirects).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { generateObject, generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
// .js extensions on relative imports are load-bearing for the Vercel function (api/generate.ts):
// its compiled ESM output resolves specifiers verbatim at runtime. Vite/vitest map .js -> .ts.
import { LlmSpecSchema, toObjectSpec, type LlmSpec } from "../objects/specSchema.js";
import { SYSTEM, RAW_JSON_HINT, extractJson, coerceLlmSpec, sanitizeBaseUrl } from "../objects/llmShared.js";
import { getProvider, type ApiStyle } from "../objects/providers.js";
import { guardedFetch } from "./ssrfGuard.js";

/**
 * An error whose message is safe (and useful) to show the caller — a configuration problem they
 * can fix, like a missing key or an oversized request. Everything else is genericized before it
 * leaves the server so upstream/internal detail isn't leaked to an anonymous caller.
 */
class UserFacingError extends Error {}

// Best-effort in-memory rate limit. This deflects casual abuse of the public, unauthenticated
// endpoint (compute/bandwidth cost on the owner's account); it is per warm serverless instance,
// so a durable limiter (Vercel KV / Upstash) keyed by IP is the production-grade upgrade.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 40; // requests per client per window
const MAX_BODY_BYTES = 32_768; // a prompt + endpoint config is tiny; cap to avoid buffering abuse
const rateHits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (rateHits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  rateHits.set(ip, recent);
  if (rateHits.size > 5000) {
    for (const [k, v] of rateHits) if (v.every((t) => now - t >= RATE_WINDOW_MS)) rateHits.delete(k);
  }
  return recent.length > RATE_MAX;
}

function clientIp(req: IncomingMessage): string {
  const fwd = req.headers["x-forwarded-for"];
  const first = Array.isArray(fwd) ? fwd[0] : fwd?.split(",")[0];
  return (first || req.socket.remoteAddress || "unknown").trim();
}

export interface ProxyEnv {
  /** Optional server-side Gemini key — used ONLY when a self-hoster sets ALLOW_SERVER_KEYS=1. */
  GEMINI_API_KEY?: string;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    let over = false;
    req.on("data", (c: Buffer) => {
      size += c.length;
      // Stop *storing* past the cap (bounds memory) but keep draining so the response can flush
      // cleanly instead of resetting the socket. The platform (Vercel) bounds total inbound size.
      if (size > MAX_BODY_BYTES) over = true;
      else data += c;
    });
    req.on("end", () => (over ? reject(new UserFacingError("request too large")) : resolve(data)));
    req.on("error", reject);
  });
}

const GEN_TIMEOUT_MS = 40_000;
function timeoutSignal(ms: number): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms).unref?.();
  return c.signal;
}

async function generateGemini(prompt: string, model: string, key: string): Promise<LlmSpec> {
  const google = createGoogleGenerativeAI({ apiKey: key });
  const { object } = await generateObject({
    model: google(model),
    schema: LlmSpecSchema,
    system: SYSTEM,
    prompt,
    temperature: 0.7,
    // Disable the model's extended "thinking" — it was adding ~25s/request for these small specs.
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 0, includeThoughts: false } } },
    abortSignal: timeoutSignal(GEN_TIMEOUT_MS),
  });
  return object;
}

async function generateAnthropic(prompt: string, model: string, key: string): Promise<LlmSpec> {
  const anthropic = createAnthropic({ apiKey: key });
  const { text } = await generateText({
    model: anthropic(model),
    system: `${SYSTEM}${RAW_JSON_HINT}`,
    prompt,
    temperature: 0.6,
    abortSignal: timeoutSignal(GEN_TIMEOUT_MS),
  });
  return coerceLlmSpec(extractJson(text));
}

/**
 * Any OpenAI-compatible endpoint (OpenAI, Groq, OpenRouter, xAI, NVIDIA, Mistral, DeepSeek, or a
 * user's custom base URL). guardedFetch re-checks the resolved IP (not just the hostname string)
 * and forbids redirects, so a public name pointing at a private/metadata address can't reach
 * internal hosts. The key is always the user's own.
 */
async function generateOpenAICompatible(prompt: string, baseUrl: string, model: string, key: string): Promise<LlmSpec> {
  const provider = createOpenAICompatible({ name: "byok", baseURL: baseUrl, apiKey: key, fetch: guardedFetch });
  const { text } = await generateText({
    model: provider(model),
    system: `${SYSTEM}${RAW_JSON_HINT}`,
    prompt,
    temperature: 0.6,
    abortSignal: timeoutSignal(GEN_TIMEOUT_MS),
  });
  return coerceLlmSpec(extractJson(text));
}

interface GenParams {
  model: string;
  key: string;
  /** Resolved + sanitized base URL (openai style only). */
  baseUrl: string;
}

function generateOnce(style: ApiStyle, prompt: string, p: GenParams): Promise<LlmSpec> {
  if (style === "google") return generateGemini(prompt, p.model, p.key);
  if (style === "anthropic") return generateAnthropic(prompt, p.model, p.key);
  return generateOpenAICompatible(prompt, p.baseUrl, p.model, p.key);
}

/**
 * Generate with automatic self-correction: retry on timeout/parse/validation failure, feeding the
 * previous error back into the prompt so the model can fix it (PRD §4.7 — agent self-correction).
 */
async function generateWithRetry(style: ApiStyle, prompt: string, p: GenParams, attempts = 2): Promise<LlmSpec> {
  let lastErr = "";
  for (let i = 0; i < attempts; i++) {
    const fixHint = i > 0 ? `\n\nYour previous attempt failed with: "${lastErr}". Return a COMPLETE, valid spec this time — fewer parts is fine if it helps you finish quickly.` : "";
    try {
      return await generateOnce(style, prompt + fixHint, p);
    } catch (err) {
      // A configuration problem (missing key, blocked endpoint) won't fix itself on retry.
      if (err instanceof UserFacingError) throw err;
      lastErr = (err as Error).name === "AbortError" || /abort/i.test((err as Error).message) ? "timeout" : (err as Error).message;
    }
  }
  throw new Error(lastErr || "generation failed");
}

/** List the model ids a provider exposes for the given key (populates the ⚙ model picker). */
async function listModels(style: ApiStyle, baseUrl: string, key: string): Promise<string[]> {
  const drop = /embed|whisper|tts|dall-e|dalle|moderation|rerank|image|audio|speech|guard/i;
  const clean = (ids: unknown[]): string[] =>
    Array.from(new Set(ids.filter((x): x is string => typeof x === "string" && !drop.test(x)))).sort().slice(0, 80);

  if (style === "google") {
    const res = await guardedFetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=200`);
    const data = (await res.json()) as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> };
    if (!res.ok) throw new Error("model list unavailable");
    const ids = (data.models ?? [])
      .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
      .map((m) => (m.name ?? "").replace(/^models\//, ""));
    return clean(ids);
  }

  if (style === "anthropic") {
    const res = await guardedFetch("https://api.anthropic.com/v1/models?limit=200", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    });
    const data = (await res.json()) as { data?: Array<{ id?: string }> };
    if (!res.ok) throw new Error("model list unavailable");
    return clean((data.data ?? []).map((m) => m.id));
  }

  // openai-compatible
  const res = await guardedFetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${key}` } });
  const data = (await res.json()) as { data?: Array<{ id?: string }> };
  if (!res.ok) throw new Error("model list unavailable");
  return clean((data.data ?? []).map((m) => m.id));
}

export function createGenerationMiddleware(env: ProxyEnv) {
  return async function generationMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): Promise<void> {
    const url = req.url ?? "";
    const isGenerate = url.startsWith("/api/generate");
    const isModels = url.startsWith("/api/models");
    if (req.method !== "POST" || (!isGenerate && !isModels)) return next();

    const send = (code: number, body: unknown) => {
      res.statusCode = code;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(body));
    };

    // Same-origin only for browser callers: if an Origin is present it must match the Host, so
    // another website can't drive this endpoint from a visitor's browser. Non-browser callers
    // (native app, scripts) send no Origin and are governed by the rate limit instead.
    const origin = req.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.host) return send(403, { error: "cross-origin request refused" });
      } catch {
        return send(403, { error: "bad origin" });
      }
    }

    if (rateLimited(clientIp(req))) return send(429, { error: "rate limit — slow down and try again shortly" });

    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as {
        prompt?: string;
        provider?: string;
        id?: string;
        apiKey?: string;
        baseUrl?: string;
        model?: string;
      };
      const provider = body.provider ?? "gemini";
      const info = getProvider(provider);
      if (!info || provider === "local") return send(400, { error: "unknown or unsupported provider" });

      // The one server-key exception (opt-in self-hoster): Gemini only. Everything else is BYOK.
      const key = body.apiKey || (provider === "gemini" ? env.GEMINI_API_KEY : undefined);
      if (info.needsKey && !key) {
        return send(400, { error: `add your ${info.label} API key in the ⚙ settings on the Create bar (it stays in your browser)` });
      }

      // Resolve + sanitize the base URL for OpenAI-compatible providers (user override wins).
      let baseUrl = "";
      if (info.apiStyle === "openai") {
        const wanted = (body.baseUrl && body.baseUrl.trim()) || info.baseUrl;
        const safe = sanitizeBaseUrl(wanted);
        if (!safe) return send(400, { error: "base URL must be a public https endpoint" });
        baseUrl = safe;
      }

      if (isModels) {
        const models = await listModels(info.apiStyle, baseUrl, key ?? "");
        return send(200, { models });
      }

      // /api/generate
      if (!body.prompt || typeof body.prompt !== "string") return send(400, { error: "missing prompt" });
      const model = (typeof body.model === "string" && body.model.trim()) || info.models[0];
      if (!model) return send(400, { error: `pick a model for ${info.label}` });

      const t0 = Date.now();
      const llm = await generateWithRetry(info.apiStyle, body.prompt, { model, key: key ?? "", baseUrl });
      const spec = toObjectSpec(llm, body.id ?? "obj_llm", body.prompt);
      return send(200, { spec, provider, model, ms: Date.now() - t0 });
    } catch (err) {
      // Only surface messages we intentionally marked safe; genericize everything else so upstream
      // provider/host detail (a blind-SSRF oracle, internal error text) can't leak to the caller.
      if (err instanceof UserFacingError) return send(400, { error: err.message });
      console.error("[generate] upstream/internal error:", err);
      return send(502, { error: "generation failed — check your provider, model, and key" });
    }
  };
}
