/**
 * Client-side LLM enrichment. Calls the server proxy (/api/generate), validates the returned
 * spec against the schema, and repairs identity fields. Returns null on ANY failure so the
 * caller keeps the deterministic local object — the model only ever *upgrades* fidelity, it
 * can never break the game (Tech Doc §4).
 */

import { validateSpec, type ObjectSpec } from "./spec";
import { logError } from "@/state/debugStore";
import { useGameStore } from "@/state/store";
import { IS_NATIVE } from "@/config/native";
import { nativeGenerate, nativeCustomGenerate } from "./nativeLlm";
import { getProvider, resolveBaseUrl, resolveModel, type ProviderId } from "./providers";

export type Provider = ProviderId;

// Generous — complex objects (helicopters, the Taj Mahal) can take a while, and the proxy retries
// internally. Must exceed the server's own per-attempt timeout so the client doesn't bail early.
const TIMEOUT_MS = 90_000;

interface ProxyResponse {
  spec?: unknown;
  error?: string;
  provider?: string;
  model?: string;
  ms?: number;
}

/**
 * Request an enriched spec from the model. `id`/`label`/`prompt` are forced onto the result so
 * the model can't break object identity.
 */
export async function enrichWithLLM(
  prompt: string,
  id: string,
  provider: Exclude<Provider, "local">,
  fallbackLabel: string,
): Promise<ObjectSpec | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const userKey = useGameStore.getState().apiKeys[provider] || undefined;
  try {
    // Primary path: the server proxy (Vite dev middleware / serverless fn — keys stay off the
    // client). In the packaged native app there is no server behind zero://app, so this throws
    // or 404s; the native direct-Gemini path below takes over with the locally-bundled key.
    let raw: Partial<ObjectSpec> | null = null;
    let proxyError: string | null = null;
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          provider,
          id,
          apiKey: userKey,
          // The chosen model and (for OpenAI-compatible providers) the base URL ride along so the
          // proxy routes to the user's provider. The proxy re-derives the API style from its own
          // copy of the registry and validates the URL — the key is always the user's own.
          model: resolveModel(provider, useGameStore.getState().models[provider]),
          baseUrl: resolveBaseUrl(provider, useGameStore.getState().baseUrls[provider]),
        }),
        signal: controller.signal,
      });
      const data = (await res.json()) as ProxyResponse;
      if (!res.ok || !data.spec) proxyError = `${data.error ?? res.status}`;
      else raw = data.spec as Partial<ObjectSpec>;
    } catch (proxyErr) {
      if ((proxyErr as Error).name === "AbortError") throw proxyErr; // real timeout — don't retry
      proxyError = (proxyErr as Error).message;
    }
    if (!raw && IS_NATIVE) {
      // No proxy behind the packaged app — call the provider directly. Google uses the bundled
      // Gemini path; every OpenAI-compatible provider uses its base URL + model + the user's key.
      const st = useGameStore.getState();
      const style = getProvider(provider)?.apiStyle;
      if (style === "google") {
        raw = await nativeGenerate(prompt, id, "gemini", controller.signal, userKey);
      } else if (style === "openai") {
        raw = await nativeCustomGenerate(
          prompt,
          id,
          resolveBaseUrl(provider, st.baseUrls[provider]),
          resolveModel(provider, st.models[provider]),
          userKey ?? "",
          controller.signal,
        );
      } else {
        throw new Error(`${provider} isn't available in the desktop app yet — use Gemini or an OpenAI-compatible provider`);
      }
    } else if (!raw) {
      logError({
        objectId: id,
        prompt,
        phase: "generate",
        level: "warn",
        message: `LLM (${provider}) unavailable, kept local object: ${proxyError}`,
      });
      return null;
    }
    const candidate: ObjectSpec = {
      ...(raw as ObjectSpec),
      id,
      label: (typeof raw.label === "string" && raw.label) || fallbackLabel,
      prompt,
    };

    const validation = validateSpec(candidate);
    if (!validation.ok) {
      logError({
        objectId: id,
        prompt,
        phase: "validate",
        level: "warn",
        message: `LLM spec failed validation, kept local object: ${validation.errors.slice(0, 3).join("; ")}`,
      });
      return null;
    }
    return candidate;
  } catch (err) {
    const msg = (err as Error).name === "AbortError" ? "timeout" : (err as Error).message;
    logError({
      objectId: id,
      prompt,
      phase: "generate",
      level: "warn",
      message: `LLM (${provider}) error, kept local object: ${msg}`,
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask the proxy which models a provider exposes for the given key, to populate the ⚙ model
 * picker. Returns [] on failure (the UI keeps the provider's curated defaults). Not available in
 * the packaged native app (no proxy) — the curated list + free-text entry cover that case.
 */
export async function fetchModels(provider: ProviderId, apiKey: string, baseUrl?: string): Promise<string[]> {
  if (IS_NATIVE) return [];
  try {
    const res = await fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey, baseUrl }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: unknown };
    return Array.isArray(data.models) ? (data.models.filter((m) => typeof m === "string") as string[]) : [];
  } catch {
    return [];
  }
}
