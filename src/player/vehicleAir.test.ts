import { describe, it, expect } from "vitest";
import { vehicleVerticalStep, type AirState } from "./vehicleAir";

const grounded: AirState = { airborne: false, vy: 0 };
const DT = 1 / 60;

describe("vehicleVerticalStep", () => {
  it("hugs the surface on flat/gentle ground", () => {
    const s = vehicleVerticalStep(2.0, 2.0, 2.0, 20, grounded, DT);
    expect(s.airborne).toBe(false);
    expect(s.y).toBeCloseTo(2.0);
    expect(s.pitch).toBe(0);
  });

  it("launches off a cliff when the ground drops away at speed", () => {
    // Vehicle at y=10, but the ground at the new position is far below (cliff edge).
    const s = vehicleVerticalStep(10, 2, 10, 24, grounded, DT);
    expect(s.airborne).toBe(true);
    expect(s.y).toBeLessThanOrEqual(10.001);
    expect(s.y).toBeGreaterThan(2); // does NOT snap down to the surface
  });

  it("does NOT launch when crawling slowly (avoids jitter)", () => {
    const s = vehicleVerticalStep(10, 2, 10, 1, grounded, DT);
    expect(s.airborne).toBe(false);
    expect(s.y).toBe(2); // just follows terrain down
  });

  it("arcs downward under gravity and eventually lands", () => {
    let state: AirState = { airborne: true, vy: 6 }; // launched upward off a ramp
    let y = 10;
    const surface = 2;
    let landedFrame = -1;
    for (let i = 0; i < 600; i++) {
      const step = vehicleVerticalStep(y, surface, y, 20, state, DT);
      y = step.y;
      state = { airborne: step.airborne, vy: step.vy };
      if (step.landed) {
        landedFrame = i;
        break;
      }
    }
    expect(landedFrame).toBeGreaterThan(0);
    expect(y).toBeCloseTo(surface);
    expect(state.airborne).toBe(false);
  });

  it("rises first then falls when launched upward (ballistic), pitching into the arc", () => {
    const up = vehicleVerticalStep(10, 2, 9.7, 20, { airborne: true, vy: 8 }, DT);
    expect(up.y).toBeGreaterThan(10); // still climbing
    const down = vehicleVerticalStep(10, 2, 10, 20, { airborne: true, vy: -8 }, DT);
    expect(down.y).toBeLessThan(10); // falling
    // Nose tilts opposite ways while rising vs falling (follows the arc).
    expect(Math.sign(up.pitch)).toBe(-Math.sign(down.pitch));
    expect(up.pitch).not.toBe(0);
  });

  it("never goes airborne on water (boats float)", () => {
    const s = vehicleVerticalStep(10, 2, 10, 24, grounded, DT, 32, true);
    expect(s.airborne).toBe(false);
    expect(s.y).toBe(2);
  });
});
