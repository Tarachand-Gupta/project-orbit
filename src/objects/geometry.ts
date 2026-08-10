/**
 * Pure mapping from a PartSpec primitive to Three.js geometry constructor args.
 * Separated from the React builder so it can be unit-tested without a renderer.
 */

import type { PartSpec, PrimitiveKind } from "./spec";

export type GeometryName =
  | "boxGeometry"
  | "sphereGeometry"
  | "cylinderGeometry"
  | "coneGeometry"
  | "capsuleGeometry"
  | "torusGeometry"
  | "tetrahedronGeometry";

export interface GeometryDescriptor {
  geometry: GeometryName;
  args: number[];
}

// Low-poly segment counts — kept small for the deliberately faceted art style.
const SEG = 12;
const LOW_SEG = 8;

export function geometryFor(part: PartSpec): GeometryDescriptor {
  const s = part.size;
  const n = (i: number, d: number) => (Number.isFinite(s[i]) ? s[i] : d);
  switch (part.primitive as PrimitiveKind) {
    case "box":
      return { geometry: "boxGeometry", args: [n(0, 1), n(1, 1), n(2, 1)] };
    case "sphere":
      return { geometry: "sphereGeometry", args: [n(0, 0.5), SEG, SEG] };
    case "cylinder":
      // size = [radiusTop, radiusBottom, height]
      return { geometry: "cylinderGeometry", args: [n(0, 0.5), n(1, n(0, 0.5)), n(2, 1), SEG] };
    case "cone":
      // size = [radius, height]
      return { geometry: "coneGeometry", args: [n(0, 0.5), n(1, 1), SEG] };
    case "capsule":
      // size = [radius, length]
      return { geometry: "capsuleGeometry", args: [n(0, 0.4), n(1, 1), 4, LOW_SEG] };
    case "torus":
      // size = [radius, tube]
      return { geometry: "torusGeometry", args: [n(0, 0.6), n(1, 0.2), LOW_SEG, SEG] };
    case "tetrahedron":
      return { geometry: "tetrahedronGeometry", args: [n(0, 0.6), 0] };
    default:
      // Unknown primitive — fall back to a box so a malformed spec still renders.
      return { geometry: "boxGeometry", args: [1, 1, 1] };
  }
}

/** Approximate bounding radius of a part, used to size physics colliders and camera framing. */
export function partRadius(part: PartSpec): number {
  const s = part.size;
  switch (part.primitive) {
    case "box":
      return Math.hypot(s[0] ?? 1, s[1] ?? 1, s[2] ?? 1) / 2;
    case "sphere":
      return s[0] ?? 0.5;
    case "cylinder":
      return Math.max(s[0] ?? 0.5, s[1] ?? 0.5, (s[2] ?? 1) / 2);
    case "cone":
      return Math.max(s[0] ?? 0.5, (s[1] ?? 1) / 2);
    case "capsule":
      return (s[0] ?? 0.4) + (s[1] ?? 1) / 2;
    case "torus":
      return (s[0] ?? 0.6) + (s[1] ?? 0.2);
    case "tetrahedron":
      return s[0] ?? 0.6;
    default:
      return 1;
  }
}

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

/** Approximate axis-aligned bounds of a spec (used to size a vehicle chassis + place wheels). */
export function specBounds(parts: PartSpec[]): Bounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    const pos = p.position ?? [0, 0, 0];
    let h: [number, number, number];
    if (p.primitive === "box") {
      h = [(p.size[0] ?? 1) / 2, (p.size[1] ?? 1) / 2, (p.size[2] ?? 1) / 2];
    } else {
      const r = partRadius(p);
      h = [r, r, r];
    }
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], pos[a] - h[a]);
      max[a] = Math.max(max[a], pos[a] + h[a]);
    }
  }
  if (!Number.isFinite(min[0])) return { min: [-1, 0, -1], max: [1, 1, 1] };
  return { min, max };
}

/** Overall bounding radius of a whole spec (max part extent from origin). */
export function specBoundingRadius(parts: PartSpec[]): number {
  let max = 0.5;
  for (const p of parts) {
    const pos = p.position ?? [0, 0, 0];
    const d = Math.hypot(pos[0], pos[1], pos[2]) + partRadius(p);
    if (d > max) max = d;
  }
  return max;
}
