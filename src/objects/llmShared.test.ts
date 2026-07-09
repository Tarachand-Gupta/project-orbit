import { describe, expect, it } from "vitest";
import { closeJson, extractJson, coerceLlmSpec } from "./llmShared";

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
