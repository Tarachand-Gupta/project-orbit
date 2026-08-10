import { describe, it, expect } from "vitest";
import { sunStateFromFraction, dayFraction, formatWorldTime, wallClock } from "./clock";

describe("sunStateFromFraction", () => {
  it("is night at midnight (fraction 0)", () => {
    const s = sunStateFromFraction(0);
    expect(s.isNight).toBe(true);
    expect(s.daylight).toBe(0);
  });

  it("peaks at noon (fraction 0.5)", () => {
    const s = sunStateFromFraction(0.5);
    expect(s.isNight).toBe(false);
    expect(s.daylight).toBeCloseTo(1, 5);
    expect(s.direction[1]).toBeCloseTo(1, 1); // sun overhead
  });

  it("is at the horizon at sunrise (0.25) and sunset (0.75)", () => {
    expect(sunStateFromFraction(0.25).daylight).toBeCloseTo(0, 5);
    expect(sunStateFromFraction(0.75).daylight).toBeCloseTo(0, 5);
  });

  it("returns a normalized direction vector", () => {
    for (const f of [0, 0.1, 0.25, 0.5, 0.75, 0.9]) {
      const d = sunStateFromFraction(f).direction;
      expect(Math.hypot(d[0], d[1], d[2])).toBeCloseTo(1, 5);
    }
  });

  it("daylight is symmetric around noon", () => {
    expect(sunStateFromFraction(0.4).daylight).toBeCloseTo(sunStateFromFraction(0.6).daylight, 5);
  });
});

describe("dayFraction / wallClock", () => {
  it("produces a fraction in [0,1)", () => {
    const f = dayFraction(Date.now());
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThan(1);
  });

  it("wallClock returns valid hour/minute/second ranges", () => {
    const { h, m, s } = wallClock(Date.now());
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(24);
    expect(m).toBeGreaterThanOrEqual(0);
    expect(m).toBeLessThan(60);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(60);
  });

  it("formats time as HH:MM", () => {
    expect(formatWorldTime(Date.now())).toMatch(/^\d{2}:\d{2}$/);
  });
});
