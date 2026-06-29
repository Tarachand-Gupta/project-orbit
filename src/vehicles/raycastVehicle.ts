/**
 * Derives a Rapier raycast-vehicle setup (chassis collider box + 4 wheels) from an object spec.
 * Used by VehicleBody to build a DynamicRayCastVehicleController so cars/bikes get real suspension,
 * momentum, collisions, and natural airborne behaviour (see physics-engine-research memory).
 */

import type { ObjectSpec, PartSpec } from "@/objects/spec";
import { specBounds, partRadius } from "@/objects/geometry";

export interface WheelConfig {
  /** Connection point on the chassis, local coords. */
  connection: [number, number, number];
  radius: number;
  /** True for the front (steered) wheels; rear wheels get engine force. */
  steered: boolean;
}

export interface VehicleSetup {
  /** Half-extents + center of the chassis collider (excludes the wheel zone), local coords. */
  chassisHalf: [number, number, number];
  chassisCenter: [number, number, number];
  wheels: WheelConfig[];
  suspensionRestLength: number;
  /** True for a 2-wheeler (bike) — uses 2 inline wheels with wider support. */
  twoWheeled: boolean;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

interface FoundWheel {
  x: number;
  y: number;
  z: number;
  r: number;
}

/**
 * Find the vehicle's ACTUAL wheels — cylinder parts with a horizontal (X) axle near the base — and
 * dedupe co-located tire/hubcap pairs keeping the larger radius. Using the real wheel positions
 * (not bbox-corner guesses) makes the physics wheels line up with the visual ones, so the chassis
 * settles at the correct ride height by construction.
 */
function findWheels(spec: ObjectSpec, b: ReturnType<typeof specBounds>): FoundWheel[] {
  const height = b.max[1] - b.min[1];
  const limit = b.min[1] + height * 0.55;
  const raw: FoundWheel[] = [];
  for (const p of spec.parts) {
    if (p.primitive !== "cylinder") continue;
    const pos = p.position ?? [0, 0, 0];
    const rot = p.rotation ?? [0, 0, 0];
    const axleAlongX = Math.abs(Math.abs(rot[2]) - Math.PI / 2) < 0.6; // rotated about Z → axle ∥ X
    if (!axleAlongX || pos[1] > limit) continue;
    raw.push({ x: pos[0], y: pos[1], z: pos[2], r: p.size[0] ?? 0.35 });
  }
  const byCell = new Map<string, FoundWheel>();
  for (const w of raw) {
    const key = `${Math.round(w.x * 1.5)},${Math.round(w.z * 1.5)}`;
    const ex = byCell.get(key);
    if (!ex || w.r > ex.r) byCell.set(key, w);
  }
  return [...byCell.values()];
}

export function deriveVehicleSetup(spec: ObjectSpec): VehicleSetup {
  const b = specBounds(spec.parts);
  const cx = (b.min[0] + b.max[0]) / 2;
  const cz = (b.min[2] + b.max[2]) / 2;
  const width = b.max[0] - b.min[0];
  const length = b.max[2] - b.min[2];
  const restLength = 0.12;

  const found = findWheels(spec, b);
  let wheels: WheelConfig[];
  let maxWheelTop: number;

  if (found.length >= 2) {
    // Use the real wheels. Connection sits restLength above each wheel center so the wheel rests at
    // its modeled position; front (largest +z) wheels steer, rear wheels drive.
    wheels = found.map((w) => ({
      connection: [w.x, w.y + restLength, w.z],
      radius: w.r,
      steered: w.z > cz + 0.05,
    }));
    // If nothing ended up "front" (all near center), make the foremost wheel(s) steer.
    if (!wheels.some((w) => w.steered)) {
      const fz = Math.max(...found.map((w) => w.z));
      wheels.forEach((w, i) => (w.steered = found[i].z >= fz - 0.05));
    }
    maxWheelTop = Math.max(...found.map((w) => w.y + w.r));
  } else {
    // Fallback for objects with no detectable wheels: 4 bbox-corner wheels.
    const r = clamp((b.max[1] - b.min[1]) * 0.18, 0.24, 0.5);
    const connY = b.min[1] + r;
    const fZ = b.max[2] - r * 0.8, rZ = b.min[2] + r * 0.8;
    const lX = b.min[0] + r * 0.6, rX = b.max[0] - r * 0.6;
    wheels = [
      { connection: [lX, connY + restLength, fZ], radius: r, steered: true },
      { connection: [rX, connY + restLength, fZ], radius: r, steered: true },
      { connection: [lX, connY + restLength, rZ], radius: r, steered: false },
      { connection: [rX, connY + restLength, rZ], radius: r, steered: false },
    ];
    maxWheelTop = b.min[1] + 2 * r;
  }

  const twoWheeled = wheels.length === 2;

  // Chassis collider sits ABOVE the wheels so the suspension (not the box) holds the car up.
  const top = Math.max(b.max[1], maxWheelTop + 0.2);
  const colliderBottom = Math.min(top - 0.2, maxWheelTop + 0.05);
  const chassisHalf: [number, number, number] = [
    Math.max(0.3, (width / 2) * 0.92),
    Math.max(0.15, (top - colliderBottom) / 2),
    Math.max(0.4, (length / 2) * 0.95),
  ];
  const chassisCenter: [number, number, number] = [cx, (colliderBottom + top) / 2, cz];

  return { chassisHalf, chassisCenter, wheels, suspensionRestLength: restLength, twoWheeled };
}

/**
 * Whether this spec should use the raycast-vehicle physics. Currently 4-wheelers only — two-wheelers
 * (bikes) are laterally unstable on raycast wheels, so they stay on the stable kinematic path.
 */
export function supportsRaycastPhysics(spec: ObjectSpec): boolean {
  return !deriveVehicleSetup(spec).twoWheeled;
}

// Tuning shared across vehicles (tweak live).
export const VEHICLE_TUNING = {
  engineForce: 90, // per driven wheel, scaled by mass
  brakeForce: 4,
  maxSteer: 0.5, // radians
  suspensionCompression: 0.82,
  suspensionRelaxation: 0.88,
  maxSuspensionTravel: 0.3,
  frictionSlip: 3.0,
  topSpeed: 26,
};

/** Unused export kept for tree-shake friendliness / future per-type tuning. */
export function _ref(_p: PartSpec): number {
  return partRadius(_p);
}
