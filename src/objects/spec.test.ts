import { describe, it, expect } from "vitest";
import { validateSpec, clampControlValue, type ObjectSpec, type ControlSpec } from "./spec";

const valid: ObjectSpec = {
  id: "obj_1",
  type: "ball",
  label: "Ball",
  parts: [{ primitive: "sphere", size: [1], material: "paint_red" }],
  physics: { mass: 7, friction: 0.3, restitution: 0.2, flammable: false },
  config: { radius: { type: "slider", min: 0, max: 3, step: 0.1, value: 1 } },
};

describe("validateSpec", () => {
  it("accepts a well-formed spec", () => {
    expect(validateSpec(valid)).toEqual({ ok: true, errors: [] });
  });

  it("rejects non-objects", () => {
    expect(validateSpec(null).ok).toBe(false);
    expect(validateSpec(42).ok).toBe(false);
    expect(validateSpec("x").ok).toBe(false);
  });

  it("requires non-empty parts", () => {
    expect(validateSpec({ ...valid, parts: [] }).ok).toBe(false);
  });

  it("rejects invalid primitive kinds", () => {
    const bad = { ...valid, parts: [{ primitive: "blob", size: [1], material: "x" }] };
    expect(validateSpec(bad).ok).toBe(false);
  });

  it("rejects non-finite / out-of-range sizes", () => {
    expect(validateSpec({ ...valid, parts: [{ primitive: "box", size: [NaN], material: "x" }] }).ok).toBe(false);
    expect(validateSpec({ ...valid, parts: [{ primitive: "box", size: [9999], material: "x" }] }).ok).toBe(false);
    expect(validateSpec({ ...valid, parts: [{ primitive: "box", size: [-1], material: "x" }] }).ok).toBe(false);
  });

  it("validates physics fields", () => {
    expect(validateSpec({ ...valid, physics: { ...valid.physics, mass: -1 } }).ok).toBe(false);
    expect(validateSpec({ ...valid, physics: { ...valid.physics, flammable: "yes" as never } }).ok).toBe(false);
  });

  it("validates control value types", () => {
    const badCheckbox = { ...valid, config: { x: { type: "checkbox", value: 1 } } };
    expect(validateSpec(badCheckbox).ok).toBe(false);
    const badSlider = { ...valid, config: { x: { type: "slider", value: true } } };
    expect(validateSpec(badSlider).ok).toBe(false);
  });
});

describe("clampControlValue", () => {
  const ctrl: ControlSpec = { type: "slider", min: 0, max: 10, value: 5 };
  it("clamps below min and above max", () => {
    expect(clampControlValue(ctrl, -5)).toBe(0);
    expect(clampControlValue(ctrl, 50)).toBe(10);
    expect(clampControlValue(ctrl, 7)).toBe(7);
  });
});
