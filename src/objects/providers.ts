/**
 * Provider registry — the single source of truth for the bring-your-own-key AI providers.
 * Shared by the client (⚙ settings UI + request), the server proxy (routing), and the native
 * direct path. Browser-safe: NO node imports.
 *
 * Project Orbit AI is provider-agnostic (Vercel AI SDK). Most providers speak the OpenAI
 * chat-completions API, so a single path — base URL + model + key — covers them; only Anthropic
 * and Google use their own SDK shape. Each provider ships a sensible default base URL (override
 * for self-hosted/proxied setups) and a few fallback model names; the full model list is fetched
 * live from the provider once a key is present (POST /api/models). Bring your own key — it stays
 * in your browser and is sent only to the provider you pick.
 */

export type ApiStyle = "openai" | "anthropic" | "google";

/** Known provider ids. Keep in sync with the PROVIDERS array below (adding one = two edits). */
export type ProviderId =
  | "local"
  | "openai"
  | "anthropic"
  | "gemini"
  | "groq"
  | "openrouter"
  | "xai"
  | "nvidia"
  | "mistral"
  | "deepseek"
  | "custom";

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  apiStyle: ApiStyle;
  /** Default base URL. Empty for "custom" (the user supplies it) and unused for google. */
  baseUrl: string;
  /** The base URL is user-editable in the UI (custom endpoints / self-hosted gateways). */
  editableBaseUrl?: boolean;
  needsKey: boolean;
  /** Curated fallback models shown before/without a live fetch. First entry is the default. */
  models: string[];
  /** Where to get a key (shown as a hint; no protocol). */
  keyUrl?: string;
  /** One-line description. */
  note?: string;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "local",
    label: "Local (offline templates)",
    apiStyle: "openai",
    baseUrl: "",
    needsKey: false,
    models: [],
    note: "No AI — instant deterministic templates. Zero config, always works.",
  },
  {
    id: "openai",
    label: "OpenAI",
    apiStyle: "openai",
    baseUrl: "https://api.openai.com/v1",
    needsKey: true,
    models: ["gpt-4o-mini", "gpt-4o", "o4-mini"],
    keyUrl: "platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    apiStyle: "anthropic",
    baseUrl: "https://api.anthropic.com",
    needsKey: true,
    models: ["claude-sonnet-5", "claude-haiku-4-5-20251001", "claude-opus-4-8"],
    keyUrl: "console.anthropic.com/settings/keys",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    apiStyle: "google",
    baseUrl: "https://generativelanguage.googleapis.com",
    needsKey: true,
    models: ["gemini-3.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
    keyUrl: "aistudio.google.com/apikey",
    note: "Free tier available — the easiest start.",
  },
  {
    id: "groq",
    label: "Groq",
    apiStyle: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    needsKey: true,
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    keyUrl: "console.groq.com/keys",
    note: "Very fast open models.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    apiStyle: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    needsKey: true,
    models: ["anthropic/claude-sonnet-4.5", "openai/gpt-4o-mini", "google/gemini-2.5-flash"],
    keyUrl: "openrouter.ai/keys",
    note: "One key, hundreds of models.",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    apiStyle: "openai",
    baseUrl: "https://api.x.ai/v1",
    needsKey: true,
    models: ["grok-4", "grok-3-mini"],
    keyUrl: "console.x.ai",
  },
  {
    id: "nvidia",
    label: "NVIDIA NIM",
    apiStyle: "openai",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    needsKey: true,
    models: ["meta/llama-3.3-70b-instruct", "nvidia/llama-3.1-nemotron-70b-instruct"],
    keyUrl: "build.nvidia.com",
  },
  {
    id: "mistral",
    label: "Mistral",
    apiStyle: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    needsKey: true,
    models: ["mistral-large-latest", "mistral-small-latest"],
    keyUrl: "console.mistral.ai/api-keys",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    apiStyle: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    needsKey: true,
    models: ["deepseek-chat", "deepseek-reasoner"],
    keyUrl: "platform.deepseek.com/api_keys",
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    apiStyle: "openai",
    baseUrl: "",
    editableBaseUrl: true,
    needsKey: true,
    models: [],
    note: "Any OpenAI-compatible endpoint — Together, Fireworks, a local llama.cpp / Ollama server…",
  },
];

export const PROVIDER_IDS = PROVIDERS.map((p) => p.id);

export function getProvider(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** Resolve the effective base URL for a provider: a user override wins over the registry default. */
export function resolveBaseUrl(id: string, override?: string): string {
  const o = (override ?? "").trim();
  if (o) return o;
  return getProvider(id)?.baseUrl ?? "";
}

/** The model to use: the user's pick, else the provider's first curated default. */
export function resolveModel(id: string, picked?: string): string {
  const p = (picked ?? "").trim();
  if (p) return p;
  return getProvider(id)?.models[0] ?? "";
}

/** True when `id` is a known provider that requires a key (anything but "local"). */
export function providerNeedsKey(id: string): boolean {
  return getProvider(id)?.needsKey ?? false;
}
