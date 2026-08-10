import { describe, it, expect } from "vitest";
import { specYBounds, groundSpec, primitiveHalfExtents, specHeight } from "./normalize";
import type { ObjectSpec, PartSpec } from "./spec";
import { generateSpec } from "./generator";

describe("primitiveHalfExtents", () => {
  it("returns box half-sizes", () => {
    expect(primitiveHalfExtents({ primitive: "box", size: [4, 2, 6], material: "x" })).toEqual([2, 1, 3]);
  });
  it("uses radius for a sphere", () => {
    expect(primitiveHalfExtents({ primitive: "sphere", size: [3], material: "x" })).toEqual([3, 3, 3]);
  });
});

describe("specYBounds", () => {
  it("measures a single box at origin", () => {
    const parts: PartSpec[] = [{ primitive: "box", size: [2, 2, 2], material: "x" }];
    const b = specYBounds(parts);
    expect(b.minY).toBeCloseTo(-1, 6);
    expect(b.maxY).toBeCloseTo(1, 6);
  });

  it("accounts for part offsets", () => {
    const parts: PartSpec[] = [{ primitive: "box", size: [2, 2, 2], material: "x", position: [0, 5, 0] }];
    expect(specYBounds(parts).minY).toBeCloseTo(4, 6);
  });

  it("accounts for rotation (a tall box laid on its side is shorter in Y)", () => {
    const upright: PartSpec[] = [{ primitive: "box", size: [1, 6, 1], material: "x" }];
    const onSide: PartSpec[] = [{ primitive: "box", size: [1, 6, 1], material: "x", rotation: [0, 0, Math.PI / 2] }];
    const hUp = specYBounds(upright).maxY - specYBounds(upright).minY;
    const hSide = specYBounds(onSide).maxY - specYBounds(onSide).minY;
    expect(hUp).toBeCloseTo(6, 4);
    expect(hSide).toBeCloseTo(1, 4);
  });
});

describe("groundSpec", () => {
  const spec: ObjectSpec = {
    id: "o",
    type: "prop",
    label: "L",
    parts: [{ primitive: "box", size: [2, 2, 2], material: "x", position: [0, 10, 0] }],
    physics: { mass: 1, friction: 0.5, restitution: 0.2, flammable: false },
    config: {},
  };

  it("shifts the lowest point to y = 0", () => {
    const g = groundSpec(spec);
    expect(specYBounds(g.parts).minY).toBeCloseTo(0, 6);
  });

  it("preserves overall height", () => {
    const g = groundSpec(spec);
    expect(specHeight(g.parts)).toBeCloseTo(specHeight(spec.parts), 6);
  });

  it("grounds every generated template so nothing hovers", () => {
    for (const p of ["create a supercar", "create a rocket", "create the Taj Mahal", "create a tree"]) {
      const { spec } = generateSpec(p, "id");
      const minY = specYBounds(groundSpec(spec).parts).minY;
      expect(Math.abs(minY)).toBeLessThan(1e-5);
    }
  });
});
