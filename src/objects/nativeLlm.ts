/**
 * Direct client → Gemini generation for the NATIVE DESKTOP app only.
 *
 * The packaged macOS build (orbit-native) serves the game from the zero://app origin with no
 * dev server behind it, so POST /api/generate has nothing to answer it (WebKit even fails the
 * relative-URL parse: "The string did not match the expected pattern"). Instead, the packaging
 * step bundles the repo's GEMINI_API_KEY into `native-config.json` INSIDE the .app (written by
 * orbit-native/frontend/write-native-config.mjs — gitignored, never in browser builds), and this
 * module calls the Gemini REST API directly with it. Browser deployments never take this path.
 */

import { toObjectSpec, type LlmSpec } from "./specSchema";
import { SYSTEM, RAW_JSON_HINT, extractJson, coerceLlmSpec, sanitizeBaseUrl } from "./llmShared";
import type { ObjectSpec } from "./spec";

const GEMINI_MODEL = "gemini-3.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

interface NativeConfig {
  geminiApiKey?: string;
}

let configPromise: Promise<NativeConfig | null> | null = null;

/** The key bundled into the .app at package time (null in dev / browser / key-less builds). */
function nativeConfig(): Promise<NativeConfig | null> {
  configPromise ??= fetch("native-config.json")
    .then((r) => (r.ok ? (r.json() as Promise<NativeConfig>) : null))
    .catch(() => null);
  return configPromise;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
}

/**
 * Generate an ObjectSpec by calling Gemini directly. Throws on any failure (caller logs and
 * keeps the local object). `userKey` (from the in-game provider settings) beats the bundled key.
 */
export async function nativeGenerate(
  prompt: string,
  id: string,
  provider: string,
  signal: AbortSignal,
  userKey?: string,
): Promise<ObjectSpec> {
  if (provider !== "gemini") {
    throw new Error(`only Gemini is available in the desktop app (got "${provider}")`);
  }
  const key = userKey || (await nativeConfig())?.geminiApiKey;
  if (!key) {
    throw new Error("no Gemini key bundled — rebuild the app with GEMINI_API_KEY in the repo .env");
  }

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM + RAW_JSON_HINT }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: "application/json",
        // Explicit ceiling: some serving tiers default low and silently truncate the JSON.
        maxOutputTokens: 16384,
        // Same as the server proxy: skip extended thinking — it adds ~25s for these small specs.
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  const data = (await res.json()) as GeminiResponse;
  if (!res.ok) throw new Error(data.error?.message ?? `Gemini HTTP ${res.status}`);

  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  if (!text) throw new Error("Gemini returned no content");
  const llm: LlmSpec = coerceLlmSpec(extractJson(text));
  return toObjectSpec(llm, id, prompt);
}

/**
 * Direct client → OpenAI-compatible endpoint for the NATIVE app's "custom" provider (the
 * packaged app has no proxy). Works with CORS-permissive endpoints (OpenRouter, Groq, most
 * self-hosted gateways); endpoints that block browser origins will fail here and the local
 * object spawns instead. Same SSRF-ish guard as the server (https-only, public hosts).
 */
export async function nativeCustomGenerate(
  prompt: string,
  id: string,
  baseUrl: string,
  model: string,
  key: string,
  signal: AbortSignal,
): Promise<ObjectSpec> {
  const safeBase = sanitizeBaseUrl(baseUrl);
  if (!safeBase) throw new Error("custom base URL must be a public https endpoint");
  if (!model) throw new Error("custom provider needs a model name");
  if (!key) throw new Error("custom provider needs your API key");

  const res = await fetch(`${safeBase}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    signal,
    body: JSON.stringify({
      model,
      temperature: 0.6,
      messages: [
        { role: "system", content: SYSTEM + RAW_JSON_HINT },
        { role: "user", content: prompt },
      ],
    }),
  });
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(data.error?.message ?? `custom endpoint HTTP ${res.status}`);
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("custom endpoint returned no content");
  const llm: LlmSpec = coerceLlmSpec(extractJson(text));
  return toObjectSpec(llm, id, prompt);
}
