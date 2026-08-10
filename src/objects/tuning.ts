/**
 * Live tuning resolver — turns an object's `config` controls into the dynamic parameters the
 * driving/flying/physics controllers read EVERY frame. This is what makes the bottom-right
 * controls panel actually affect a spawned object: drag "Top speed" and the car really drives
 * faster, raise "Rotor speed" and the helicopter climbs harder, etc.
 *
 * Design: a slider's *position within its own declared [min,max] range* maps onto a playable
 * band (e.g. 8–55 m/s for ground vehicles). That way the control is meaningful no matter what
 * unit the generator/LLM used (km/h, knots, made-up numbers) — sliding it right is always
 * "more", and the effect stays inside a fun, world-appropriate range. Pure + unit-tested.
 */

import type { ObjectSpec, ControlSpec } from "./spec";

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const lerp = (band: readonly [number, number], f: number) => band[0] + (band[1] - band[0]) * f;

/** First control present among the given keys (case-insensitive on the exact key strings). */
function pick(spec: ObjectSpec, keys: string[]): ControlSpec | undefined {
  const cfg = spec.config ?? {};
  for (const k of keys) if (cfg[k]) return cfg[k];
  // Fall back to a case-insensitive scan so "TopSpeed"/"topspeed" still resolve.
  const lower = keys.map((k) => k.toLowerCase());
  for (const [key, ctrl] of Object.entries(cfg)) {
    if (lower.includes(key.toLowerCase())) return ctrl;
  }
  return undefined;
}

/** Normalised 0..1 position of a numeric control within its declared range, or null. */
export function controlFraction(ctrl: ControlSpec | undefined): number | null {
  if (!ctrl || ctrl.type === "checkbox") return null;
  const v = Number(ctrl.value);
  if (!Number.isFinite(v)) return null;
  const min = Number.isFinite(ctrl.min as number) ? (ctrl.min as number) : 0;
  const max = Number.isFinite(ctrl.max as number) ? (ctrl.max as number) : min + 100;
  if (max <= min) return null;
  return clamp((v - min) / (max - min), 0, 1);
}

/** Raw numeric value of a config control by candidate keys, or a default. */
export function configNum(spec: ObjectSpec, keys: string[], dflt: number): number {
  const ctrl = pick(spec, keys);
  if (!ctrl || ctrl.type === "checkbox") return dflt;
  const v = Number(ctrl.value);
  return Number.isFinite(v) ? v : dflt;
}

/** Boolean value of a config control by candidate keys, or a default. */
export function configBool(spec: ObjectSpec, keys: string[], dflt: boolean): boolean {
  const ctrl = pick(spec, keys);
  if (!ctrl) return dflt;
  if (ctrl.type === "checkbox") return Boolean(ctrl.value);
  return Number(ctrl.value) !== 0;
}

// Playable bands (game units = metres, seconds).
const DRIVE_SPEED_BAND = [8, 55] as const; // m/s  (~29–198 km/h)
const FLY_SPEED_BAND = [12, 70] as const; // m/s
const CLIMB_BAND = [7, 30] as const; // m/s vertical
const TURN_BAND = [1.3, 3.2] as const; // rad/s

export interface DriveTuning {
  /** Top speed in m/s. */
  topSpeed: number;
  /** Acceleration in m/s² (how fast it reaches top speed). */
  accel: number;
  /** Steering rate in rad/s at speed. */
  turnRate: number;
}

/** Resolve ground-vehicle handling from config (topSpeed / acceleration / handling controls). */
export function resolveDriveTuning(spec: ObjectSpec): DriveTuning {
  const speedF = controlFraction(pick(spec, ["topSpeed", "maxSpeed", "speed"]));
  const topSpeed = speedF != null ? lerp(DRIVE_SPEED_BAND, speedF) : 26;

  const accelF = controlFraction(pick(spec, ["acceleration", "accel", "power", "torque"]));
  // Default: reach top speed in ~1.3s. An acceleration control scales 0.4×–2×.
  const accel = topSpeed * (accelF != null ? 0.5 + accelF * 1.5 : 0.85);

  const turnF = controlFraction(pick(spec, ["handling", "turnRate", "steering", "agility"]));
  const turnRate = turnF != null ? lerp(TURN_BAND, turnF) : 2.0;

  return { topSpeed, accel, turnRate };
}

export interface FlyTuning {
  /** Forward top speed in m/s. */
  topSpeed: number;
  /** Vertical climb/descent rate in m/s. */
  climbRate: number;
  /** Yaw turn rate in rad/s. */
  turnRate: number;
  /** Rotor/throttle factor 0..n — gates lift (a stopped rotor can't climb) and scales it. */
  rotor: number;
}

/** Resolve aircraft flight from config (topSpeed / liftPower / rotorSpeed / handling controls). */
export function resolveFlyTuning(spec: ObjectSpec): FlyTuning {
  const speedF = controlFraction(pick(spec, ["topSpeed", "maxSpeed", "speed"]));
  const topSpeed = speedF != null ? lerp(FLY_SPEED_BAND, speedF) : 34;

  const liftF = controlFraction(pick(spec, ["liftPower", "lift", "climbRate", "thrust"]));
  const baseClimb = liftF != null ? lerp(CLIMB_BAND, liftF) : 14;

  const turnF = controlFraction(pick(spec, ["handling", "turnRate", "yawRate", "agility"]));
  const turnRate = turnF != null ? lerp(TURN_BAND, turnF) : 1.7;

  // Rotor: a dedicated rotorSpeed control acts as a throttle multiplier (0 = rotor stopped = no
  // lift). When absent (fixed-wing), treat the rotor as always spun up (1).
  const rotorCtrl = pick(spec, ["rotorSpeed", "rotor", "rpm"]);
  const rotor = rotorCtrl ? Math.max(0, configNum(spec, ["rotorSpeed", "rotor", "rpm"], 1)) : 1;

  // Lift scales with rotor spin but never fully dies until the rotor is truly stopped, so the
  // craft stays responsive across the slider's range.
  const climbRate = baseClimb * Math.min(1, rotor);

  return { topSpeed, climbRate, turnRate, rotor };
}

export interface BodyTuning {
  /** Visual + collider scale multiplier. */
  scale: number;
  /** Mass override in kg, or null to keep the spec's mass. */
  mass: number | null;
  /** Restitution (bounciness) 0..0.95, or null to keep the spec default. */
  restitution: number | null;
}

/**
 * Resolve dynamic-body properties from config: a `scale` multiplier, a `mass` override, and a
 * `bounciness`/`restitution` override. These let the generic-object controls (and any object that
 * exposes them) actually change the physics body live.
 */
export function resolveBodyTuning(spec: ObjectSpec): BodyTuning {
  const scaleCtrl = pick(spec, ["scale"]);
  const scale = scaleCtrl ? clamp(configNum(spec, ["scale"], 1), 0.1, 12) : 1;

  const massCtrl = pick(spec, ["mass", "weight"]);
  const mass = massCtrl ? Math.max(0.1, configNum(spec, ["mass", "weight"], spec.physics.mass)) : null;

  const restCtrl = pick(spec, ["bounciness", "restitution", "bounce"]);
  const restitution = restCtrl ? clamp(configNum(spec, ["bounciness", "restitution", "bounce"], 0.2), 0, 0.95) : null;

  return { scale, mass, restitution };
}
