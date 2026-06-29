/**
 * Object placement on the walkable terrain. Objects are dropped onto the ground surface at the
 * exact height from the shared GroundSampler, so they land correctly instead of floating or
 * sinking. Pure (no Three.js) and unit-tested.
 */

import type { GroundSampler } from "./ground";

export type V3 = [number, number, number];

export interface GroundPlacement {
  position: V3;
  /** Identity-ish: objects stand upright (+Y up) on the flat world. */
  quaternion: [number, number, number, number];
}

/** Place an object at (x,z) resting on the ground, lifted by `lift` so it drops and settles. */
export function placeOnGround(x: number, z: number, sampler: GroundSampler, lift = 0): GroundPlacement {
  const y = sampler.heightAt(x, z) + lift;
  return { position: [x, y, z], quaternion: [0, 0, 0, 1] };
}

/** Local terrain steepness at (x,z): the largest height difference to nearby sample points. */
export function slopeAt(sampler: GroundSampler, x: number, z: number, step = 1.5): number {
  const h = sampler.heightAt(x, z);
  let max = 0;
  for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]] as const) {
    max = Math.max(max, Math.abs(sampler.heightAt(x + dx, z + dz) - h));
  }
  return max / step; // rise over run
}

/** True when a spot is good to spawn on: on land (not river) and reasonably flat. */
export function isSpawnable(sampler: GroundSampler, x: number, z: number, maxSlope = 0.6): boolean {
  return !sampler.isRiver(x, z) && slopeAt(sampler, x, z) <= maxSlope;
}

/**
 * Pick a clear spawn point a few steps **in front of the player**, on flat ground and off the
 * river, so created objects appear where the player is looking and don't end up buried in a hill
 * or a building. Spirals outward if the ideal spot is too steep.
 */
export function pickSpawnInFront(
  sampler: GroundSampler,
  player: { x: number; z: number },
  forward: { x: number; z: number },
  distance = 7,
): { x: number; z: number } {
  const size = sampler.config.size;
  const clamp = (v: number) => Math.max(-size + 6, Math.min(size - 6, v));
  const fx = forward.x || 0;
  const fz = forward.z || 1;
  const flen = Math.hypot(fx, fz) || 1;
  const baseX = player.x + (fx / flen) * distance;
  const baseZ = player.z + (fz / flen) * distance;

  let fallback = { x: clamp(baseX), z: clamp(baseZ) };
  for (let ring = 0; ring <= 5; ring++) {
    const r = ring * 3;
    const steps = ring === 0 ? 1 : 8;
    for (let s = 0; s < steps; s++) {
      const a = (s / steps) * Math.PI * 2;
      const x = clamp(baseX + Math.cos(a) * r);
      const z = clamp(baseZ + Math.sin(a) * r);
      if (ring === 0) fallback = { x, z };
      if (isSpawnable(sampler, x, z)) return { x, z };
    }
  }
  return fallback;
}
