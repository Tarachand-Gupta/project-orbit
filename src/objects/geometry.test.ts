import { describe, it, expect } from "vitest";
import { geometryFor, partRadius, specBoundingRadius } from "./geometry";
import type { PartSpec } from "./spec";

describe("geometryFor", () => {
  it("maps each primitive to the right geometry", () => {
    expect(geometryFor({ primitive: "box", size: [2, 3, 4], material: "x" }).geometry).toBe("boxGeometry");
    expect(geometryFor({ primitive: "sphere", size: [1], material: "x" }).geometry).toBe("sphereGeometry");
    expect(geometryFor({ primitive: "cylinder", size: [1, 1, 2], material: "x" }).geometry).toBe("cylinderGeometry");
    expect(geometryFor({ primitive: "cone", size: [1, 2], material: "x" }).geometry).toBe("coneGeometry");
    expect(geometryFor({ primitive: "torus", size: [1, 0.3], material: "x" }).geometry).toBe("torusGeometry");
  });

  it("passes box dimensions through", () => {
    expect(geometryFor({ primitive: "box", size: [2, 3, 4], material: "x" }).args.slice(0, 3)).toEqual([2, 3, 4]);
  });

  it("falls back to a box for an unknown primitive", () => {
    const g = geometryFor({ primitive: "blob" as never, size: [1], material: "x" });
    expect(g.geometry).toBe("boxGeometry");
  });

  it("substitutes defaults for non-finite sizes", () => {
    const g = geometryFor({ primitive: "box", size: [NaN, 2, 3], material: "x" });
    expect(g.args[0]).toBe(1);
  });
});

describe("partRadius & specBoundingRadius", () => {
  it("computes a positive radius for each primitive", () => {
    const prims: PartSpec[] = [
      { primitive: "box", size: [2, 2, 2], material: "x" },
      { primitive: "sphere", size: [3], material: "x" },
      { primitive: "cone", size: [1, 4], material: "x" },
    ];
    for (const p of prims) expect(partRadius(p)).toBeGreaterThan(0);
  });

  it("accounts for part offsets in the bounding radius", () => {
    const parts: PartSpec[] = [
      { primitive: "sphere", size: [1], material: "x", position: [0, 0, 0] },
      { primitive: "sphere", size: [1], material: "x", position: [10, 0, 0] },
    ];
    expect(specBoundingRadius(parts)).toBeGreaterThan(10);
  });
});
