import { describe, expect, it } from "vitest";
import { needsRecenter, isWarpSpike, CAPTURE_DEADZONE, CAPTURE_SPIKE_PX } from "./mouseCapture";

describe("needsRecenter", () => {
  it("leaves the cursor alone at the center of the window", () => {
    expect(needsRecenter(640, 400, 1280, 800)).toBe(false);
  });

  it("stays quiet just inside the deadzone", () => {
    const w = 1280;
    const h = 800;
    expect(needsRecenter(w / 2 + w * CAPTURE_DEADZONE - 1, h / 2, w, h)).toBe(false);
  });

  it("recenters when the cursor drifts toward an edge", () => {
    expect(needsRecenter(30, 400, 1280, 800)).toBe(true); // far left
    expect(needsRecenter(1250, 400, 1280, 800)).toBe(true); // far right
    expect(needsRecenter(640, 10, 1280, 800)).toBe(true); // top
    expect(needsRecenter(640, 790, 1280, 800)).toBe(true); // bottom
  });
});

describe("isWarpSpike", () => {
  it("passes ordinary hand motion", () => {
    expect(isWarpSpike(12, -7)).toBe(false);
    expect(isWarpSpike(-90, 40)).toBe(false);
  });

  it("drops the giant post-warp jump on either axis", () => {
    expect(isWarpSpike(CAPTURE_SPIKE_PX + 1, 0)).toBe(true);
    expect(isWarpSpike(0, -(CAPTURE_SPIKE_PX + 1))).toBe(true);
  });
});
