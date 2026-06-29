import { describe, it, expect } from "vitest";
import { generateSpec, extractSubject } from "./generator";
import { validateSpec, interactionFor } from "./spec";

describe("extractSubject", () => {
  it("strips create/make verbs and articles", () => {
    expect(extractSubject("create a supercar")).toBe("supercar");
    expect(extractSubject("Please make the Taj Mahal")).toBe("Taj Mahal");
    expect(extractSubject("spawn an oak tree")).toBe("oak tree");
    expect(extractSubject("build some crates")).toBe("crates");
  });
  it("leaves bare nouns untouched", () => {
    expect(extractSubject("rocket")).toBe("rocket");
  });
});

describe("generateSpec", () => {
  const prompts = [
    "create a supercar",
    "create the Taj Mahal",
    "create a racing track",
    "create a bowling ball",
    "make a tree",
    "build a house",
    "spawn a campfire",
    "create a rocket",
    "make a robot",
    "create a crate",
    "a glorbax frobnicator", // unknown → generic
    "",
  ];

  for (const p of prompts) {
    it(`produces a valid spec for "${p}"`, () => {
      const { spec } = generateSpec(p, "obj_test_1");
      const result = validateSpec(spec);
      expect(result.errors).toEqual([]);
      expect(result.ok).toBe(true);
      expect(spec.parts.length).toBeGreaterThan(0);
      expect(Object.keys(spec.config).length).toBeGreaterThan(0);
    });
  }

  it("matches known templates by keyword", () => {
    expect(generateSpec("create a supercar", "id").matched).toBe("supercar");
    expect(generateSpec("create the Taj Mahal", "id").matched).toBe("tajMahal");
    expect(generateSpec("create a racing track", "id").source).toBe("template");
  });

  it("falls back to generic for unknown prompts", () => {
    const r = generateSpec("a glorbax frobnicator", "id");
    expect(r.source).toBe("generic");
  });

  it("is deterministic for the same prompt+id", () => {
    const a = generateSpec("create a mystery widget", "obj_1");
    const b = generateSpec("create a mystery widget", "obj_1");
    expect(JSON.stringify(a.spec)).toBe(JSON.stringify(b.spec));
  });

  it("includes 5x/10x/20x multipliers on steppers", () => {
    const { spec } = generateSpec("create a supercar", "id");
    const stepper = Object.values(spec.config).find((c) => c.type === "stepper");
    expect(stepper?.multipliers).toEqual([5, 10, 20]);
  });

  it("tags campfire as a fire emitter and tree as flammable", () => {
    expect(generateSpec("campfire", "id").spec.physics.fire).toBe(true);
    expect(generateSpec("oak tree", "id").spec.physics.flammable).toBe(true);
  });

  it("makes vehicles drivable, planes flyable, bikes drivable, props non-interactive", () => {
    expect(interactionFor(generateSpec("create a supercar", "id").spec).mode).toBe("drive");
    expect(interactionFor(generateSpec("create an off-road bike", "id").spec).mode).toBe("drive");
    expect(interactionFor(generateSpec("create an airplane", "id").spec).mode).toBe("fly");
    expect(interactionFor(generateSpec("create a tree", "id").spec).mode).toBe("none");
  });

  it("matches bike and plane templates", () => {
    expect(generateSpec("create an off-road bike", "id").matched).toBe("motorcycle");
    expect(generateSpec("create a fighter jet", "id").matched).toBe("airplane");
  });
});

describe("interactionFor", () => {
  const base = { id: "x", label: "X", parts: [{ primitive: "box" as const, size: [1, 1, 1], material: "wood" }], physics: { mass: 1, friction: 0.5, restitution: 0.1, flammable: false }, config: {} };
  it("infers from type when interaction is absent", () => {
    expect(interactionFor({ ...base, type: "car" }).mode).toBe("drive");
    expect(interactionFor({ ...base, type: "helicopter" }).mode).toBe("fly");
    expect(interactionFor({ ...base, type: "rock" }).mode).toBe("none");
  });
  it("prefers an explicit interaction spec", () => {
    expect(interactionFor({ ...base, type: "rock", interaction: { mode: "ride" } }).mode).toBe("ride");
  });
});
