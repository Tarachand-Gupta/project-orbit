import { describe, it, expect } from "vitest";
import { forwardFromYaw, rightFromYaw, inputToMove, cameraOffset, headingFromDir } from "./locomotion";
import { mapKey } from "./input";

const NONE = { forward: false, back: false, left: false, right: false };

describe("locomotion math", () => {
  it("forward at yaw 0 points +Z", () => {
    const f = forwardFromYaw(0);
    expect(f[0]).toBeCloseTo(0, 6);
    expect(f[1]).toBeCloseTo(1, 6);
  });

  it("right is perpendicular to forward", () => {
    for (const yaw of [0, 0.5, 1.2, -2]) {
      const f = forwardFromYaw(yaw);
      const r = rightFromYaw(yaw);
      expect(f[0] * r[0] + f[1] * r[1]).toBeCloseTo(0, 6); // dot = 0
    }
  });

  it("strafe-right at yaw 0 points to screen-right (-X)", () => {
    // Camera trails along -forward (behind +Z); screen-right is -X. Pressing D must move -X.
    const m = inputToMove({ ...NONE, right: true }, 0);
    expect(m[0]).toBeCloseTo(-1, 6);
    expect(m[1]).toBeCloseTo(0, 6);
  });

  it("no input → zero move", () => {
    expect(inputToMove(NONE, 0)).toEqual([0, 0]);
  });

  it("forward input at yaw 0 moves +Z, normalized", () => {
    const m = inputToMove({ ...NONE, forward: true }, 0);
    expect(m[0]).toBeCloseTo(0, 6);
    expect(m[1]).toBeCloseTo(1, 6);
  });

  it("diagonal input stays unit length", () => {
    const m = inputToMove({ ...NONE, forward: true, right: true }, 0);
    expect(Math.hypot(m[0], m[1])).toBeCloseTo(1, 6);
  });

  it("back input reverses forward", () => {
    const m = inputToMove({ ...NONE, back: true }, 0);
    expect(m[1]).toBeCloseTo(-1, 6);
  });

  it("camera trails behind the target along -forward", () => {
    const off = cameraOffset(0, 10, 5);
    expect(off[0]).toBeCloseTo(0, 6);
    expect(off[1]).toBe(5);
    expect(off[2]).toBeCloseTo(-10, 6); // behind +Z forward
  });

  it("headingFromDir matches yaw convention", () => {
    expect(headingFromDir(0, 1)).toBeCloseTo(0, 6);
    expect(headingFromDir(1, 0)).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe("mapKey", () => {
  it("maps WASD + arrows + space + shift + E", () => {
    expect(mapKey("KeyW")).toBe("forward");
    expect(mapKey("ArrowDown")).toBe("back");
    expect(mapKey("KeyA")).toBe("left");
    expect(mapKey("KeyD")).toBe("right");
    expect(mapKey("Space")).toBe("jump");
    expect(mapKey("ShiftLeft")).toBe("run");
    expect(mapKey("KeyE")).toBe("interact");
    expect(mapKey("KeyZ")).toBe(null);
  });
});
