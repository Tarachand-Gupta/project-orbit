/**
 * Client-side LLM enrichment. Calls the server proxy (/api/generate), validates the returned
 * spec against the schema, and repairs identity fields. Returns null on ANY failure so the
 * caller keeps the deterministic local object — the model only ever *upgrades* fidelity, it
 * can never break the game (Tech Doc §4).
 */

import { validateSpec, type ObjectSpec } from "./spec";
import { logError } from "@/state/debugStore";
import { useGameStore } from "@/state/store";

export type Provider = "local" | "gemini" | "kimi" | "deepseek";

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
  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, provider, id, apiKey: useGameStore.getState().apiKeys[provider] || undefined }),
      signal: controller.signal,
    });
    const data = (await res.json()) as ProxyResponse;
    if (!res.ok || !data.spec) {
      logError({
        objectId: id,
        prompt,
        phase: "generate",
        level: "warn",
        message: `LLM (${provider}) unavailable, kept local object: ${data.error ?? res.status}`,
      });
      return null;
    }

    const raw = data.spec as Partial<ObjectSpec>;
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
