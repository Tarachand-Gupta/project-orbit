/**
 * Auto-rotors: guarantee that any rotorcraft (helicopter, chopper, drone, gyrocopter…) has
 * spinning rotor blades, even when the generator/LLM forgot to tag them. The local helicopter
 * template already declares `spin`, but an AI-enriched or generic rotorcraft might not — so the
 * user's "the rotors should be rotating" expectation never depends on the model getting it right.
 *
 * Heuristic: a main rotor blade is a long, flat, horizontal part (box or cylinder) sitting in the
 * upper half of the craft. We tag the widest such part(s) with a Y-axis spin and make sure a
 * `rotorSpeed` control exists so the blade speed (and lift, see tuning) is panel-adjustable.
 * Pure + unit-tested.
 */

import type { ObjectSpec, PartSpec } from "./spec";
import { specBounds } from "./geometry";

const ROTORCRAFT = /helicopter|chopper|\bheli\b|quadcopter|gyrocopter|gyrocraft|\bcopter\b|\bdrone\b/;

function isRotorcraft(spec: ObjectSpec): boolean {
  const hay = `${spec.type} ${spec.label ?? ""} ${spec.prompt ?? ""}`.toLowerCase();
  return ROTORCRAFT.test(hay);
}

/** Horizontal span and vertical thickness of a part, used to spot flat blade-like geometry. */
function bladeShape(p: PartSpec): { horiz: number; vert: number } {
  if (p.primitive === "box") {
    return { horiz: Math.max(p.size[0] ?? 0, p.size[2] ?? 0), vert: p.size[1] ?? 0 };
  }
  if (p.primitive === "cylinder") {
    // cylinder size = [rTop, rBottom, height]; a long thin cylinder laid flat reads as the height.
    return { horiz: p.size[2] ?? 0, vert: Math.max(p.size[0] ?? 0, p.size[1] ?? 0) * 2 };
  }
  return { horiz: 0, vert: Infinity };
}

/**
 * Return a copy of the spec with rotor blades guaranteed to spin. No-op for non-rotorcraft, for
 * specs that already declare any `spin`, or when no blade-like part is found.
 */
export function ensureRotors(spec: ObjectSpec): ObjectSpec {
  if (!isRotorcraft(spec)) return spec;
  if (spec.parts.some((p) => p.spin)) return spec; // generator already animated something

  const b = specBounds(spec.parts);
  const height = Math.max(0.001, b.max[1] - b.min[1]);
  const width = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]);
  const upperY = b.min[1] + height * 0.45;
  const minSpan = Math.max(1.5, width * 0.4);

  let tagged = false;
  const parts = spec.parts.map((p) => {
    if (p.primitive !== "box" && p.primitive !== "cylinder") return p;
    const pos = p.position ?? [0, 0, 0];
    if (pos[1] < upperY) return p; // blades sit on top
    const { horiz, vert } = bladeShape(p);
    if (horiz >= minSpan && horiz > vert * 3) {
      tagged = true;
      return { ...p, spin: { axis: "y" as const, speed: 16, config: "rotorSpeed" } };
    }
    return p;
  });

  if (!tagged) return spec;

  const config = { ...spec.config };
  if (!config.rotorSpeed) {
    config.rotorSpeed = { type: "slider", value: 1, min: 0, max: 3, step: 0.1, tab: "Flight", label: "Rotor speed" };
  }
  return { ...spec, parts, config };
}
