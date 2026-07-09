/**
 * Server-side generation proxy (Tech Doc §9) built on the Vercel AI SDK.
 *
 * Holds the API keys (never shipped to the browser) and turns a prompt into a constrained
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
import { LlmSpecSchema, toObjectSpec, type LlmSpec } from "../objects/specSchema";
import { SYSTEM, RAW_JSON_HINT, extractJson, coerceLlmSpec } from "../objects/llmShared";

export type Provider = "gemini" | "kimi" | "deepseek";

interface ProxyEnv {
  GEMINI_API_KEY?: string;
  DIGITALOCEAN_API_KEY?: string;
}

const DO_BASE = "https://inference.do-ai.run/v1";
const MODEL_IDS: Record<Provider, string> = {
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
async function generateWithRetry(
  provider: Provider,
  prompt: string,
  env: ProxyEnv,
  attempts = 2,
): Promise<LlmSpec> {
  let lastErr = "";
  for (let i = 0; i < attempts; i++) {
    const fixHint = i > 0 ? `\n\nYour previous attempt failed with: "${lastErr}". Return a COMPLETE, valid spec this time — fewer parts is fine if it helps you finish quickly.` : "";
    try {
      if (provider === "gemini") {
        if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
        return await generateGemini(prompt + fixHint, env.GEMINI_API_KEY);
      }
      if (!env.DIGITALOCEAN_API_KEY) throw new Error("DIGITALOCEAN_API_KEY not configured");
      return await generateDigitalOcean(prompt + fixHint, MODEL_IDS[provider], env.DIGITALOCEAN_API_KEY);
    } catch (err) {
      lastErr = (err as Error).name === "AbortError" || /abort/i.test((err as Error).message) ? "timeout" : (err as Error).message;
    }
  }
  throw new Error(lastErr || "generation failed");
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
      const { prompt, provider = "gemini", id = "obj_llm", apiKey } = JSON.parse(raw || "{}") as {
        prompt?: string;
        provider?: Provider;
        id?: string;
        apiKey?: string;
      };
      if (!prompt || typeof prompt !== "string") return send(400, { error: "missing prompt" });

      // A user-supplied key (bring-your-own-key) overrides the server's env keys.
      const effectiveEnv: ProxyEnv = apiKey
        ? provider === "gemini"
          ? { ...env, GEMINI_API_KEY: apiKey }
          : { ...env, DIGITALOCEAN_API_KEY: apiKey }
        : env;

      const t0 = Date.now();
      const llm = await generateWithRetry(provider, prompt, effectiveEnv);
      const spec = toObjectSpec(llm, id, prompt);
      return send(200, { spec, provider, model: MODEL_IDS[provider], ms: Date.now() - t0 });
    } catch (err) {
      return send(502, { error: (err as Error).message });
    }
  };
}

