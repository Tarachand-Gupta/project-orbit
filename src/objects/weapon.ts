/**
 * Weapon tuning + ballistics — pure helpers the player's firing code reads live from a gun's config
 * controls (Impact force / Range / Fire rate / Full-auto). Kept dependency-free so the shot maths is
 * unit-testable without the physics world.
 */

import type { ObjectSpec } from "./spec";
import { configNum, configBool } from "./tuning";

export interface WeaponTuning {
  /** Impulse magnitude applied to a struck dynamic body (before its mass is factored in). */
  force: number;
  /** Maximum shot distance in world units. */
  range: number;
  /** Minimum seconds between shots (derived from the fire-rate control). */
  cooldown: number;
  /** Whether holding fire keeps shooting. */
  automatic: boolean;
}

export function resolveWeaponTuning(spec: ObjectSpec): WeaponTuning {
  const force = Math.max(1, configNum(spec, ["force", "impact", "power", "damage"], 60));
  const range = Math.max(5, configNum(spec, ["range", "distance"], 80));
  const rate = Math.max(0.5, configNum(spec, ["fireRate", "rof", "rate"], 6));
  const automatic = configBool(spec, ["automatic", "fullAuto", "auto"], false);
  return { force, range, cooldown: 1 / rate, automatic };
}

/**
 * Impulse vector to apply to a struck dynamic body: shove it along the shot direction (scaled by the
 * weapon force and the body's mass, so light props fly and heavy ones barely budge) plus a little
 * upward kick so hits look lively rather than purely horizontal. `dir` must be unit length.
 */
export function shotImpulse(force: number, mass: number, dir: [number, number, number]): [number, number, number] {
  const m = Math.max(0.2, mass);
  const k = force * m * 0.35;
  return [dir[0] * k, dir[1] * k + force * m * 0.12, dir[2] * k];
}
