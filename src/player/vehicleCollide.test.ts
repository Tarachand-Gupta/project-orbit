import { describe, it, expect } from "vitest";
import { slideMove } from "./vehicleCollide";

describe("slideMove", () => {
  it("passes straight through when the path is clear", () => {
    const r = slideMove(0, 0, 1, 1, () => false);
    expect(r).toEqual({ x: 1, z: 1, stopped: false });
  });

  it("slides along X when only the Z move is blocked (wall ahead in Z)", () => {
    // Blocked at any z >= 1, clear otherwise.
    const blocked = (_x: number, z: number) => z >= 1;
    const r = slideMove(0, 0, 1, 1, blocked);
    expect(r).toEqual({ x: 1, z: 0, stopped: false });
  });

  it("slides along Z when only the X move is blocked", () => {
    const blocked = (x: number, _z: number) => x >= 1;
    const r = slideMove(0, 0, 1, 1, blocked);
    expect(r).toEqual({ x: 0, z: 1, stopped: false });
  });

  it("stops (stays put) when boxed in on both axes", () => {
    const r = slideMove(2, 2, 3, 3, () => true);
    expect(r).toEqual({ x: 2, z: 2, stopped: true });
  });

  it("never reports a position inside an obstacle", () => {
    const obstacleAt = (x: number, z: number) => Math.hypot(x - 5, z - 5) < 1.5; // blob around (5,5)
    // Heading straight at the blob from (5,3).
    const r = slideMove(5, 3, 5, 4.0, obstacleAt);
    expect(obstacleAt(r.x, r.z)).toBe(false);
  });
});
