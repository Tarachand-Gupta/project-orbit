import { describe, it, expect } from "vitest";
import { PROVIDERS, PROVIDER_IDS, getProvider, resolveBaseUrl, resolveModel, providerNeedsKey } from "./providers";

describe("provider registry", () => {
  it("includes the top-10 BYO-key providers plus local + custom", () => {
    for (const id of ["local", "openai", "anthropic", "gemini", "groq", "openrouter", "xai", "nvidia", "mistral", "deepseek", "custom"]) {
      expect(PROVIDER_IDS, id).toContain(id);
    }
  });

  it("only local needs no key; every keyed provider has a base URL or is custom/google", () => {
    expect(providerNeedsKey("local")).toBe(false);
    for (const p of PROVIDERS) {
      if (p.id === "local") continue;
      expect(providerNeedsKey(p.id), p.id).toBe(true);
      if (p.apiStyle === "openai" && !p.editableBaseUrl) {
        expect(p.baseUrl, p.id).toMatch(/^https:\/\//);
      }
    }
  });

  it("resolveBaseUrl: a user override wins over the registry default", () => {
    expect(resolveBaseUrl("groq")).toBe("https://api.groq.com/openai/v1");
    expect(resolveBaseUrl("groq", "https://my.gateway/v1")).toBe("https://my.gateway/v1");
    expect(resolveBaseUrl("custom", "https://x/v1")).toBe("https://x/v1");
    expect(resolveBaseUrl("custom")).toBe(""); // custom has no default
  });

  it("resolveModel: the user's pick wins, else the provider's first curated model", () => {
    expect(resolveModel("openai")).toBe(PROVIDERS.find((p) => p.id === "openai")!.models[0]);
    expect(resolveModel("openai", "gpt-4.1")).toBe("gpt-4.1");
    expect(resolveModel("openai", "  ")).toBe(PROVIDERS.find((p) => p.id === "openai")!.models[0]);
  });

  it("getProvider returns undefined for unknown ids", () => {
    expect(getProvider("nope")).toBeUndefined();
    expect(getProvider("anthropic")?.apiStyle).toBe("anthropic");
  });
});
