/**
 * Pure terrain model for the walkable world. Defines the ground height at any (x,z), a winding
 * river carved into it, and biome coloring. No Three.js here so it's fully unit-testable and is
 * the single source of truth shared by the mesh, the physics collider, and object placement
 * (so objects land exactly on the visible ground — fixing the "floating/wavering" issue).
 */

import { createNoise2D } from "simplex-noise";
import type { WorldConfig } from "@/config/world";

/** Seeded PRNG (mulberry32) for deterministic terrain. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GroundSampler {
  /** Ground surface height (y) at a world (x,z). */
  heightAt: (x: number, z: number) => number;
  /** Signed distance from the river centerline at a given x (0 = on the river). */
  riverDistance: (x: number, z: number) => number;
  /** True if (x,z) is over the river channel. */
  isRiver: (x: number, z: number) => boolean;
  /** Biome color {r,g,b} for a surface point, by height & proximity to water. */
  colorAt: (x: number, z: number) => { r: number; g: number; b: number };
  config: WorldConfig;
}

/** The river meanders along Z as a function of X, offset away from the origin settlement. */
function riverCenterZ(x: number, size: number): number {
  const offset = size * 0.34;
  return offset + Math.sin(x / (size * 0.18)) * size * 0.2 + Math.sin(x / (size * 0.05)) * size * 0.05;
}

export function createGroundSampler(config: WorldConfig): GroundSampler {
  const rng = mulberry32(config.seed);
  const noise = createNoise2D(rng);
  const { size, hillAmplitude, noiseScale, flatRadius, riverWidth } = config;

  // Fewer octaves + lower base frequency → broad, rolling, walkable hills (not jagged spikes).
  const fbm = (x: number, z: number): number => {
    const f = noiseScale / size;
    let amp = 1;
    let freq = f * 4;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < 3; o++) {
      sum += amp * noise(x * freq, z * freq);
      norm += amp;
      freq *= 2.1;
      amp *= 0.42;
    }
    return sum / norm; // -1..1
  };

  const smoothstep = (t: number) => {
    const c = Math.max(0, Math.min(1, t));
    return c * c * (3 - 2 * c);
  };

  const riverDistance = (x: number, z: number) => z - riverCenterZ(x, size);

  const heightAt = (x: number, z: number): number => {
    // Base rolling hills (gentle, no sharpening power).
    let h = (fbm(x, z) * 0.5 + 0.5) * hillAmplitude;

    // Flatten a disc around the origin for a clean spawn/settlement area, with a smooth skirt.
    const distOrigin = Math.hypot(x, z);
    if (distOrigin < flatRadius) {
      h *= smoothstep((distOrigin - flatRadius * 0.45) / (flatRadius * 0.55));
    }

    // River: carve a smooth VALLEY (gentle banks, not a gorge) toward the centreline, then sink a
    // water channel below the surface in the middle. This keeps water visible everywhere AND lets
    // roads descend into the valley and a bridge span the channel.
    const rd = Math.abs(riverDistance(x, z));
    const valleyHalf = riverWidth * 2.6;
    if (rd < valleyHalf) {
      const valleyFloor = config.waterLevel + 0.4;
      const vt = smoothstep(rd / valleyHalf); // 0 centre .. 1 valley edge
      h = valleyFloor + (h - valleyFloor) * vt; // ease terrain down to the valley floor
      if (rd < riverWidth) {
        const t = rd / riverWidth;
        h = Math.min(h, config.waterLevel - 0.9 + t * t * 1.1); // water channel
      }
    }
    return h;
  };

  const isRiver = (x: number, z: number) => Math.abs(riverDistance(x, z)) < riverWidth * 0.92;

  // Low-frequency "patch" noise (0..1) → large, smooth regions of slightly different green so the
  // grass has natural shade variation (not a flat paper fill, and not per-polygon grain).
  const patch = (x: number, z: number) => {
    const a = noise(x * 0.02, z * 0.02);
    const b = noise(x * 0.06 + 50, z * 0.06 - 50) * 0.4;
    return Math.max(0, Math.min(1, (a + b) * 0.5 + 0.5));
  };

  const GRASS_LIGHT = hex("#74a84e");
  const GRASS_MID = hex("#588f3c");
  const GRASS_DARK = hex("#456f30");

  const colorAt = (x: number, z: number) => {
    const h = heightAt(x, z);
    const rd = Math.abs(riverDistance(x, z));
    if (rd < riverWidth + 1.5) return hex("#cdb486"); // sandy bank
    if (h < 1.5) {
      // Grass: blend across three greens by the patch noise for natural meadow variation.
      const p = patch(x, z);
      return p < 0.5 ? mix(GRASS_DARK, GRASS_MID, p * 2) : mix(GRASS_MID, GRASS_LIGHT, (p - 0.5) * 2);
    }
    if (h < hillAmplitude * 0.45) {
      const p = patch(x, z) * 0.5 + 0.25;
      return mix(hex("#436b2e"), hex("#557e38"), p); // forest greens
    }
    if (h < hillAmplitude * 0.75) return mix(hex("#67704f"), hex("#79805d"), patch(x, z)); // highland
    if (h < hillAmplitude * 0.92) return mix(hex("#85878a"), hex("#9a9c9f"), patch(x, z)); // rock
    return hex("#f2f4f6"); // snow caps
  };

  return { heightAt, riverDistance, isRiver, colorAt, config };
}

function hex(s: string) {
  const n = parseInt(s.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}
function mix(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, t: number) {
  const k = Math.max(0, Math.min(1, t));
  return { r: a.r + (b.r - a.r) * k, g: a.g + (b.g - a.g) * k, b: a.b + (b.b - a.b) * k };
}

export { riverCenterZ };
