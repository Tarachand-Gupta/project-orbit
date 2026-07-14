/**
 * Server-side generation proxy (Tech Doc §9) built on the Vercel AI SDK.
 *
 * In production this is ALWAYS bring-your-own-key: the deployment ships no server keys (an
 * open-source project's key in a public deployment would be drained within hours). Env keys
 * exist only for local dev convenience (.env). Holds keys server-side and turns a prompt into a constrained
 * Object Spec:
 *   - Gemini → `generateObject` with a Zod schema (native structured output, very reliable).
 *   - DigitalOcean (Kimi/DeepSeek, OpenAI-compatible) → `generateText` + tolerant JSON parse,
 *     then the same Zod schema validates it.
 * The result is transformed to the runtime ObjectSpec. The client validates again and falls
 * back to the local deterministic generator on any failure — core mechanics never depend on
 * the model.
 *
 * Runs as Vite dev middleware (POST /api/generate). For production this would move to a
 * serverless function with the same contract.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { generateObject, generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
// .js extensions on relative imports are load-bearing for the Vercel function (api/generate.ts):
// its compiled ESM output resolves specifiers verbatim at runtime. Vite/vitest map .js -> .ts.
import { LlmSpecSchema, toObjectSpec, type LlmSpec } from "../objects/specSchema.js";
import { SYSTEM, RAW_JSON_HINT, extractJson, coerceLlmSpec, sanitizeBaseUrl } from "../objects/llmShared.js";

export type Provider = "gemini" | "kimi" | "deepseek" | "custom";

interface ProxyEnv {
  GEMINI_API_KEY?: string;
  DIGITALOCEAN_API_KEY?: string;
}

const DO_BASE = "https://inference.do-ai.run/v1";
const MODEL_IDS: Record<Exclude<Provider, "custom">, string> = {
  gemini: "gemini-3.5-flash",
  kimi: "kimi-k2.6",
  deepseek: "deepseek-v4-pro",
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const GEN_TIMEOUT_MS = 40_000;
function timeoutSignal(ms: number): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms).unref?.();
  return c.signal;
}

async function generateGemini(prompt: string, key: string): Promise<LlmSpec> {
  const google = createGoogleGenerativeAI({ apiKey: key });
  const { object } = await generateObject({
    model: google(MODEL_IDS.gemini),
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

/**
 * Generate with automatic self-correction: retry on timeout/parse/validation failure, feeding the
 * previous error back into the prompt so the model can fix it (PRD §4.7 — agent self-correction).
 */
interface CustomEndpoint {
  baseUrl: string;
  model: string;
  apiKey: string;
}

async function generateWithRetry(
  provider: Provider,
  prompt: string,
  env: ProxyEnv,
  custom: CustomEndpoint | null,
  attempts = 2,
): Promise<LlmSpec> {
  let lastErr = "";
  for (let i = 0; i < attempts; i++) {
    const fixHint = i > 0 ? `\n\nYour previous attempt failed with: "${lastErr}". Return a COMPLETE, valid spec this time — fewer parts is fine if it helps you finish quickly.` : "";
    try {
      if (provider === "custom") {
        if (!custom) throw new Error("custom provider needs baseUrl, model, and your API key");
        return await generateCustom(prompt + fixHint, custom.baseUrl, custom.model, custom.apiKey);
      }
      if (provider === "gemini") {
        if (!env.GEMINI_API_KEY) throw new Error("no Gemini key — add your own in the \u2699 settings on the Create bar (it stays in your browser)");
        return await generateGemini(prompt + fixHint, env.GEMINI_API_KEY);
      }
      if (!env.DIGITALOCEAN_API_KEY) throw new Error("no API key for this provider — add your own in the \u2699 settings on the Create bar (it stays in your browser)");
      return await generateDigitalOcean(prompt + fixHint, MODEL_IDS[provider], env.DIGITALOCEAN_API_KEY);
    } catch (err) {
      lastErr = (err as Error).name === "AbortError" || /abort/i.test((err as Error).message) ? "timeout" : (err as Error).message;
    }
  }
  throw new Error(lastErr || "generation failed");
}

/**
 * Provider "custom": any OpenAI-compatible endpoint the USER configures (OpenAI, OpenRouter,
 * Groq, Together, ...). Always the user's own base URL + key — the server contributes nothing,
 * it only keeps the request off the browser (CORS) and applies the sanitizeBaseUrl SSRF guard.
 */
async function generateCustom(prompt: string, baseUrl: string, model: string, key: string): Promise<LlmSpec> {
  const provider = createOpenAICompatible({ name: "custom", baseURL: baseUrl, apiKey: key });
  const { text } = await generateText({
    model: provider(model),
    system: `${SYSTEM}${RAW_JSON_HINT}`,
    prompt,
    temperature: 0.6,
    abortSignal: timeoutSignal(GEN_TIMEOUT_MS),
  });
  return coerceLlmSpec(extractJson(text));
}

async function generateDigitalOcean(prompt: string, model: string, key: string): Promise<LlmSpec> {
  const provider = createOpenAICompatible({ name: "digitalocean", baseURL: DO_BASE, apiKey: key });
  const { text } = await generateText({
    model: provider(model),
    system: `${SYSTEM}${RAW_JSON_HINT}`,
    prompt,
    temperature: 0.6,
    abortSignal: timeoutSignal(GEN_TIMEOUT_MS),
  });
  return coerceLlmSpec(extractJson(text));
}

export function createGenerationMiddleware(env: ProxyEnv) {
  return async function generationMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): Promise<void> {
    if (!req.url?.startsWith("/api/generate") || req.method !== "POST") return next();

    const send = (code: number, body: unknown) => {
      res.statusCode = code;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(body));
    };

    try {
      const raw = await readBody(req);
      const { prompt, provider = "gemini", id = "obj_llm", apiKey, baseUrl, model } = JSON.parse(raw || "{}") as {
        prompt?: string;
        provider?: Provider;
        id?: string;
        apiKey?: string;
        baseUrl?: string;
        model?: string;
      };
      if (!prompt || typeof prompt !== "string") return send(400, { error: "missing prompt" });

      let custom: CustomEndpoint | null = null;
      if (provider === "custom") {
        const safeBase = sanitizeBaseUrl(baseUrl);
        if (!safeBase) return send(400, { error: "custom base URL must be a public https endpoint" });
        if (!model || typeof model !== "string") return send(400, { error: "custom provider needs a model name" });
        if (!apiKey) return send(400, { error: "custom provider needs your API key" });
        custom = { baseUrl: safeBase, model, apiKey };
      }

      // A user-supplied key (bring-your-own-key) overrides the server's env keys.
      const effectiveEnv: ProxyEnv = apiKey
        ? provider === "gemini"
          ? { ...env, GEMINI_API_KEY: apiKey }
          : { ...env, DIGITALOCEAN_API_KEY: apiKey }
        : env;

      const t0 = Date.now();
      const llm = await generateWithRetry(provider, prompt, effectiveEnv, custom);
      const spec = toObjectSpec(llm, id, prompt);
      return send(200, { spec, provider, model: provider === "custom" ? model : MODEL_IDS[provider], ms: Date.now() - t0 });
    } catch (err) {
      return send(502, { error: (err as Error).message });
    }
  };
}

