import { describe, expect, it } from "vitest";
import { closeJson, extractJson, coerceLlmSpec, sanitizeBaseUrl } from "./llmShared";

describe("extractJson", () => {
  it("parses clean JSON", () => {
    expect(extractJson('{"a": 1}')).toEqual({ a: 1 });
  });

  it("unwraps markdown fences", () => {
    expect(extractJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it("recovers JSON truncated before the final closing brace (observed Gemini REST output)", () => {
    const truncated = '{"label": "tank", "parts": [{"primitive": "box", "size": [1, 2, 3]}]';
    expect(extractJson(truncated)).toEqual({ label: "tank", parts: [{ primitive: "box", size: [1, 2, 3] }] });
  });

  it("recovers JSON truncated mid-array", () => {
    const truncated = '{"label": "car", "parts": [{"primitive": "box", "size": [1, 2';
    const out = extractJson(truncated) as { label: string; parts: Array<{ size: number[] }> };
    expect(out.label).toBe("car");
    expect(out.parts[0].size[0]).toBe(1);
  });

  it("recovers JSON truncated mid-string value", () => {
    const truncated = '{"label": "tan';
    expect(extractJson(truncated)).toEqual({});
  });

  it("recovers JSON truncated at a dangling key", () => {
    const truncated = '{"label": "tank", "physics": {"mass": 100, "frict';
    expect(extractJson(truncated)).toEqual({ label: "tank", physics: { mass: 100 } });
  });
});

describe("closeJson", () => {
  it("appends missing closers in nesting order", () => {
    expect(JSON.parse(closeJson('{"a": [{"b": 1}'))).toEqual({ a: [{ b: 1 }] });
  });

  it("leaves complete JSON intact", () => {
    expect(JSON.parse(closeJson('{"a": 1}'))).toEqual({ a: 1 });
  });

  it("ignores brackets inside strings", () => {
    expect(JSON.parse(closeJson('{"a": "[{", "b": [1'))).toEqual({ a: "[{", b: [1] });
  });
});

describe("coerceLlmSpec on recovered output", () => {
  it("turns a truncated-then-recovered response into a usable spec", () => {
    const truncated = '{"type": "vehicle", "label": "Tank", "parts": [{"primitive": "box", "size": [2, 1, 3], "material": "steel"}], "physics": {"mass": 5000, "friction": 0.8, "restitution": 0.1, "flammable": false}, "config": [';
    const spec = coerceLlmSpec(extractJson(truncated));
    expect(spec.label).toBe("Tank");
    expect(spec.parts.length).toBe(1);
    expect(spec.physics.mass).toBe(5000);
  });
});

describe("sanitizeBaseUrl (custom provider guard)", () => {
  it("accepts real https endpoints and strips trailing slashes", () => {
    expect(sanitizeBaseUrl("https://api.openai.com/v1/")).toBe("https://api.openai.com/v1");
    expect(sanitizeBaseUrl("https://openrouter.ai/api/v1")).toBe("https://openrouter.ai/api/v1");
    expect(sanitizeBaseUrl("  https://api.groq.com/openai/v1  ")).toBe("https://api.groq.com/openai/v1");
  });

  it("rejects http, loopback, raw IPs, credentials, and garbage", () => {
    expect(sanitizeBaseUrl("http://api.openai.com/v1")).toBeNull();
    expect(sanitizeBaseUrl("https://localhost:11434/v1")).toBeNull();
    expect(sanitizeBaseUrl("https://10.0.0.5/v1")).toBeNull();
    expect(sanitizeBaseUrl("https://192.168.1.10/v1")).toBeNull();
    expect(sanitizeBaseUrl("https://user:pass@api.example.com/v1")).toBeNull();
    expect(sanitizeBaseUrl("https://ollama.local/v1")).toBeNull();
    expect(sanitizeBaseUrl("not a url")).toBeNull();
    expect(sanitizeBaseUrl("")).toBeNull();
    expect(sanitizeBaseUrl(undefined)).toBeNull();
  });
});
