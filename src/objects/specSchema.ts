/**
 * Zod schema for LLM structured generation (used with the Vercel AI SDK `generateObject`).
 *
 * The LLM emits a *flat* shape — `config` is an ARRAY of controls rather than a keyed record —
 * because dynamic object keys don't translate to provider structured-output schemas. We then
 * transform it into the runtime ObjectSpec (config as a record). This keeps generation reliable
 * across providers while preserving the single Object Spec contract (Tech Doc §7).
 */

import { z } from "zod";
import type { ObjectSpec, ControlSpec, PrimitiveKind } from "./spec";

export const PrimitiveEnum = z.enum([
  "box",
  "sphere",
  "cylinder",
  "cone",
  "capsule",
  "torus",
  "tetrahedron",
]);

export const LlmPartSchema = z.object({
  primitive: PrimitiveEnum,
  size: z.array(z.number()).min(1).max(3).describe("box[w,h,d], sphere[r], cylinder[rTop,rBottom,h], cone[r,h], capsule[r,len], torus[r,tube], tetrahedron[r]"),
  position: z.array(z.number()).length(3).optional().describe("local [x,y,z] offset; ground is y=0, +y up"),
  rotation: z.array(z.number()).length(3).optional().describe("Euler radians [x,y,z]"),
  material: z.string().describe("a palette name or #hex color"),
});

export const LlmControlSchema = z.object({
  key: z.string(),
  type: z.enum(["slider", "checkbox", "stepper"]),
  label: z.string().optional(),
  tab: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  value: z.number().describe("current value; for checkbox use 0 (off) or 1 (on)"),
});

export const LlmSpecSchema = z.object({
  type: z.string().describe('e.g. "vehicle", "building", "tree", "prop", "character"'),
  label: z.string(),
  parts: z.array(LlmPartSchema).min(1).max(60),
  physics: z.object({
    mass: z.number(),
    friction: z.number(),
    restitution: z.number(),
    flammable: z.boolean(),
    fire: z.boolean().optional(),
    fixed: z.boolean().optional(),
  }),
  config: z.array(LlmControlSchema).max(12),
  interaction: z
    .object({
      mode: z.enum(["none", "drive", "fly", "ride"]),
      verb: z.string().optional(),
      seatHeight: z.number().optional().describe("height above the object where the rider is placed"),
      posture: z
        .enum(["sit", "straddle", "stand", "stand-left", "stand-right", "lie"])
        .optional()
        .describe('rider pose: "sit" (cars/boats/planes), "straddle" (bikes/horses), "stand" (hoverboards), "stand-left"/"stand-right" (skateboards), "lie" (gliders/luge)'),
    })
    .optional()
    .describe('how the player controls it: "drive" (cars), "fly" (planes/jets), "ride" (boards/mounts), or "none"'),
});

export type LlmSpec = z.infer<typeof LlmSpecSchema>;

/** Transform the LLM's flat spec into the runtime ObjectSpec (config record, bool checkboxes). */
export function toObjectSpec(llm: LlmSpec, id: string, prompt: string): ObjectSpec {
  const config: Record<string, ControlSpec> = {};
  for (const c of llm.config) {
    if (!c.key) continue;
    const isCheckbox = c.type === "checkbox";
    config[c.key] = {
      type: c.type,
      label: c.label,
      tab: c.tab ?? "General",
      min: c.min,
      max: c.max,
      step: c.step,
      multipliers: c.type === "stepper" ? [5, 10, 20] : undefined,
      value: isCheckbox ? c.value !== 0 : c.value,
    };
  }
  return {
    id,
    type: llm.type,
    label: llm.label,
    prompt,
    parts: llm.parts.map((p) => ({
      primitive: p.primitive as PrimitiveKind,
      size: p.size,
      position: p.position as [number, number, number] | undefined,
      rotation: p.rotation as [number, number, number] | undefined,
      material: p.material,
    })),
    physics: {
      mass: llm.physics.mass,
      friction: llm.physics.friction,
      restitution: llm.physics.restitution,
      flammable: llm.physics.flammable,
      fire: llm.physics.fire,
      fixed: llm.physics.fixed,
    },
    config,
  };
}
