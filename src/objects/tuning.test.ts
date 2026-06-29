import { describe, it, expect } from "vitest";
import type { ObjectSpec, ControlSpec } from "./spec";
import {
  controlFraction,
  configNum,
  configBool,
  resolveDriveTuning,
  resolveFlyTuning,
  resolveBodyTuning,
} from "./tuning";

function spec(config: Record<string, ControlSpec>, physics?: Partial<ObjectSpec["physics"]>): ObjectSpec {
  return {
    id: "t",
    type: "vehicle",
    label: "Test",
    parts: [{ primitive: "box", size: [1, 1, 1], material: "steel" }],
    physics: { mass: 100, friction: 0.6, restitution: 0.1, flammable: false, ...physics },
    config,
  };
}

const slider = (value: number, min: number, max: number): ControlSpec => ({ type: "slider", value, min, max });
const checkbox = (value: boolean): ControlSpec => ({ type: "checkbox", value });

describe("controlFraction", () => {
  it("normalises a value within its declared range", () => {
    expect(controlFraction(slider(0, 0, 100))).toBe(0);
    expect(controlFraction(slider(50, 0, 100))).toBeCloseTo(0.5);
    expect(controlFraction(slider(100, 0, 100))).toBe(1);
  });
  it("clamps out-of-range and rejects checkboxes / degenerate ranges", () => {
    expect(controlFraction(slider(200, 0, 100))).toBe(1);
    expect(controlFraction(checkbox(true))).toBeNull();
    expect(controlFraction(slider(5, 5, 5))).toBeNull();
    expect(controlFraction(undefined)).toBeNull();
  });
});

describe("configNum / configBool", () => {
  it("reads numeric values by candidate keys with fallback", () => {
    const s = spec({ topSpeed: slider(120, 0, 300) });
    expect(configNum(s, ["topSpeed"], 0)).toBe(120);
    expect(configNum(s, ["missing"], 42)).toBe(42);
  });
  it("reads booleans and treats numeric !=0 as true", () => {
    expect(configBool(spec({ glow: checkbox(true) }), ["glow"], false)).toBe(true);
    expect(configBool(spec({ glow: slider(1, 0, 1) }), ["glow"], false)).toBe(true);
    expect(configBool(spec({}), ["glow"], true)).toBe(true);
  });
});

describe("resolveDriveTuning", () => {
  it("maps the topSpeed slider position onto a playable band, monotonically", () => {
    const slow = resolveDriveTuning(spec({ topSpeed: slider(40, 0, 400) }));
    const fast = resolveDriveTuning(spec({ topSpeed: slider(360, 0, 400) }));
    expect(fast.topSpeed).toBeGreaterThan(slow.topSpeed);
    expect(slow.topSpeed).toBeGreaterThanOrEqual(8);
    expect(fast.topSpeed).toBeLessThanOrEqual(55);
  });
  it("falls back to a sane default with no speed control", () => {
    const t = resolveDriveTuning(spec({}));
    expect(t.topSpeed).toBeGreaterThan(0);
    expect(t.turnRate).toBeGreaterThan(0);
    expect(t.accel).toBeGreaterThan(0);
  });
  it("handling control changes the turn rate", () => {
    const sluggish = resolveDriveTuning(spec({ handling: slider(0, 0, 10) }));
    const nimble = resolveDriveTuning(spec({ handling: slider(10, 0, 10) }));
    expect(nimble.turnRate).toBeGreaterThan(sluggish.turnRate);
  });
});

describe("resolveFlyTuning", () => {
  it("a stopped rotor kills climb; spinning it restores climb", () => {
    const stopped = resolveFlyTuning(spec({ rotorSpeed: slider(0, 0, 3) }));
    const spinning = resolveFlyTuning(spec({ rotorSpeed: slider(3, 0, 3) }));
    expect(stopped.climbRate).toBe(0);
    expect(spinning.climbRate).toBeGreaterThan(0);
  });
  it("liftPower raises the climb rate", () => {
    const weak = resolveFlyTuning(spec({ liftPower: slider(0.3, 0.3, 2) }));
    const strong = resolveFlyTuning(spec({ liftPower: slider(2, 0.3, 2) }));
    expect(strong.climbRate).toBeGreaterThan(weak.climbRate);
  });
  it("fixed-wing (no rotor control) is treated as fully spun up", () => {
    expect(resolveFlyTuning(spec({ topSpeed: slider(60, 10, 160) })).rotor).toBe(1);
  });
});

describe("resolveBodyTuning", () => {
  it("scale control scales the body, clamped", () => {
    expect(resolveBodyTuning(spec({ scale: slider(3, 0.2, 5) })).scale).toBe(3);
    expect(resolveBodyTuning(spec({ scale: slider(100, 0.2, 5) })).scale).toBe(12);
    expect(resolveBodyTuning(spec({})).scale).toBe(1);
  });
  it("mass + bounciness overrides only when the control exists", () => {
    const b = resolveBodyTuning(spec({ mass: slider(250, 1, 500), bounciness: slider(0.8, 0, 1) }));
    expect(b.mass).toBe(250);
    expect(b.restitution).toBeCloseTo(0.8);
    const none = resolveBodyTuning(spec({}));
    expect(none.mass).toBeNull();
    expect(none.restitution).toBeNull();
  });
});
