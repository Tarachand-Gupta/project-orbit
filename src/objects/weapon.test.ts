import { describe, it, expect } from "vitest";
import type { ObjectSpec, ControlSpec } from "./spec";
import { resolveWeaponTuning, shotImpulse } from "./weapon";

function gun(config: Record<string, ControlSpec>): ObjectSpec {
  return {
    id: "g",
    type: "gun",
    label: "Gun",
    parts: [{ primitive: "box", size: [1, 1, 1], material: "steel" }],
    physics: { mass: 4, friction: 0.6, restitution: 0.1, flammable: false },
    config,
  };
}
const slider = (value: number, min: number, max: number): ControlSpec => ({ type: "slider", value, min, max });
const checkbox = (value: boolean): ControlSpec => ({ type: "checkbox", value });

describe("resolveWeaponTuning", () => {
  it("reads force/range and derives cooldown from fire rate", () => {
    const t = resolveWeaponTuning(gun({ force: slider(120, 5, 200), range: slider(100, 10, 200), fireRate: slider(10, 1, 20) }));
    expect(t.force).toBe(120);
    expect(t.range).toBe(100);
    expect(t.cooldown).toBeCloseTo(0.1); // 10 shots/s → 0.1s apart
    expect(t.automatic).toBe(false);
  });
  it("honours the full-auto checkbox and falls back to sane defaults", () => {
    expect(resolveWeaponTuning(gun({ automatic: checkbox(true) })).automatic).toBe(true);
    const d = resolveWeaponTuning(gun({}));
    expect(d.force).toBeGreaterThan(0);
    expect(d.range).toBeGreaterThan(0);
    expect(d.cooldown).toBeGreaterThan(0);
  });
});

describe("shotImpulse", () => {
  it("pushes along the shot direction with an upward kick, scaled by force & mass", () => {
    const weak = shotImpulse(20, 4, [0, 0, 1]);
    const strong = shotImpulse(200, 4, [0, 0, 1]);
    expect(strong[2]).toBeGreaterThan(weak[2]); // more force → more shove
    expect(strong[1]).toBeGreaterThan(0); // upward component
    const light = shotImpulse(60, 1, [1, 0, 0]);
    const heavy = shotImpulse(60, 100, [1, 0, 0]);
    expect(heavy[0]).toBeGreaterThan(light[0]); // heavier needs more impulse to move similarly
  });
});
