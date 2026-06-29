/**
 * Normalize an Object Spec so its lowest point sits exactly at local y = 0. This fixes objects
 * that hover above (or sink into) the ground — the model/template may center geometry anywhere,
 * so we measure the true vertical AABB (accounting for each part's rotation) and shift every part
 * up by -minY. Pure + unit-tested.
 */

import * as THREE from "three";
import type { ObjectSpec, PartSpec } from "./spec";

/** Axis-aligned half-extents of a primitive in its own local space (before rotation). */
export function primitiveHalfExtents(part: PartSpec): [number, number, number] {
  const s = part.size;
  const n = (i: number, d: number) => (Number.isFinite(s[i]) ? Math.abs(s[i]) : d);
  switch (part.primitive) {
    case "box":
      return [n(0, 1) / 2, n(1, 1) / 2, n(2, 1) / 2];
    case "sphere": {
      const r = n(0, 0.5);
      return [r, r, r];
    }
    case "cylinder": {
      const r = Math.max(n(0, 0.5), n(1, 0.5));
      return [r, n(2, 1) / 2, r];
    }
    case "cone": {
      const r = n(0, 0.5);
      return [r, n(1, 1) / 2, r];
    }
    case "capsule": {
      const r = n(0, 0.4);
      return [r, r + n(1, 1) / 2, r];
    }
    case "torus": {
      const r = n(0, 0.6) + n(1, 0.2);
      return [r, r, n(1, 0.2)];
    }
    case "tetrahedron": {
      const r = n(0, 0.6);
      return [r, r, r];
    }
    default:
      return [0.5, 0.5, 0.5];
  }
}

const _m = new THREE.Matrix4();
const _e = new THREE.Euler();

/** Vertical (Y) AABB of the whole spec in local space. */
export function specYBounds(parts: PartSpec[]): { minY: number; maxY: number } {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const part of parts) {
    const [hx, hy, hz] = primitiveHalfExtents(part);
    const rot = part.rotation ?? [0, 0, 0];
    _e.set(rot[0], rot[1], rot[2], "XYZ");
    _m.makeRotationFromEuler(_e);
    const el = _m.elements;
    // Row for world-Y after rotation: |m[1]|*hx + |m[5]|*hy + |m[9]|*hz
    const vy = Math.abs(el[1]) * hx + Math.abs(el[5]) * hy + Math.abs(el[9]) * hz;
    const cy = part.position?.[1] ?? 0;
    minY = Math.min(minY, cy - vy);
    maxY = Math.max(maxY, cy + vy);
  }
  if (!Number.isFinite(minY)) return { minY: 0, maxY: 0 };
  return { minY, maxY };
}

/** Return a copy of the spec with all parts shifted so the lowest point is at y = 0. */
export function groundSpec(spec: ObjectSpec): ObjectSpec {
  const { minY } = specYBounds(spec.parts);
  if (Math.abs(minY) < 1e-6) return spec;
  return {
    ...spec,
    parts: spec.parts.map((p) => {
      const pos = p.position ?? [0, 0, 0];
      return { ...p, position: [pos[0], pos[1] - minY, pos[2]] as [number, number, number] };
    }),
  };
}

/** Total vertical height of the spec (used to choose a small drop height). */
export function specHeight(parts: PartSpec[]): number {
  const { minY, maxY } = specYBounds(parts);
  return Math.max(0.1, maxY - minY);
}
