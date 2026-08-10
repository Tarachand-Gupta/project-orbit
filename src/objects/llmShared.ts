/**
 * Provider-agnostic generation pieces shared by BOTH generation paths:
 *   - the dev-server proxy (src/server/generationProxy.ts — Vite middleware, keys in .env), and
 *   - the native desktop direct path (src/objects/nativeLlm.ts — the packaged macOS app has no
 *     dev server, so it calls Gemini itself with a locally-bundled key).
 * Keep this file free of Node imports — it must bundle for the browser.
 */

import { LlmSpecSchema, type LlmSpec } from "./specSchema.js";

const PRIMITIVES =
  "box[w,h,d], sphere[r], cylinder[rTop,rBottom,h], cone[r,h], capsule[r,length], torus[r,tube], tetrahedron[r]";
const MATERIALS =
  "paint_red, paint_blue, paint_yellow, paint_green, paint_white, paint_black, glass, chrome, rubber, wood, bark, leaf, stone, marble, gold, sand, asphalt, fire, ember, brick, steel (or a #hex color)";

export const SYSTEM = `You are an expert 3D modeler for a low-poly sandbox game. Convert the user's prompt into ONE high-quality Object Spec built from low-poly primitive parts. Prioritize CORRECTNESS, THOROUGHNESS, and VISUAL QUALITY over brevity — take the parts you need to make it clearly recognizable and well-proportioned.

Primitives & their size arrays: ${PRIMITIVES}
Materials: ${MATERIALS}

Modeling rules — THINK CAREFULLY about real-world structure & physics before emitting parts:
- Build centered at the origin, resting ON the ground: the lowest point at y≈0, +y up, forward +z. Never bury or float it.
- Keep total extent within ~30 units; use realistic proportions and a sensible material per part.
- Be thorough: use enough parts (often 12–40) so it really looks like the thing — e.g. a car has a body, cabin, windows, 4 wheels, lights, bumpers; a plane has fuselage, wings, tail, gear; a building has walls, roof, door, windows.
- Get the STRUCTURE physically correct, especially wheels/supports:
  · Wheels are cylinders, ALL THE SAME radius, mounted with their axle along X (rotation [0,0,1.5708]), placed at the corners/sides so the vehicle actually rests on them. A car has 4 wheels (front+back, left+right); a motorbike/bicycle has exactly 2 wheels inline (one at front +z, one at rear -z) of equal size, connected by a frame.
  · Legs/supports come in matched pairs at the base. Symmetry where appropriate (wheels, wings, legs).
- Use color/material variation for visual interest.

Moving parts (spin) — make machines feel alive:
- Give a part a "spin" {axis, speed, config} to rotate it continuously. Helicopter/drone MAIN rotor
  blades spin about axis "y" (speed ~16); tail rotors about "x"; wheels/turbines/fans as appropriate.
- Set spin.config to a control key (e.g. "rotorSpeed") so the matching slider scales the speed live.

Physics:
- Realistic mass (kg), friction & restitution 0..1. Keep restitution low (≤0.2) so it doesn't bounce.
- Large static structures (buildings, towers, bridges, tracks): physics.fixed = true.

Interaction (IMPORTANT — controls API):
- ALWAYS set "interaction". If the player should be able to control it:
  - cars/trucks/buses/karts → type "vehicle", mode "drive", posture "sit".
  - motorbikes/bicycles → type "vehicle", mode "drive", posture "sit".
  - boats/ships → type "boat", mode "drive", posture "sit" (they float on water).
  - planes/jets/helicopters/drones → type "aircraft", mode "fly", posture "sit".
  - hoverboards/segways/platforms → mode "ride", posture "stand".
  - skateboards/snowboards/surfboards → mode "ride", posture "stand-left".
  - mounts/animals/horses → mode "ride", posture "straddle".
  - hang gliders/luge/sleds → mode "fly" or "ride", posture "lie".
  - everything else → mode "none".
- posture options: "sit", "straddle", "stand", "stand-left", "stand-right", "lie".
- Also set interaction.seatHeight = the height above the object origin where the rider's seat/feet
  should be (e.g. a car seat ~0.7, a board deck ~0.3). Posture "sit" seats the avatar; "stand"
  stands it on top.
- The player enters/exits with E (handled by the engine); just declare mode, verb, posture, seatHeight.
- The object is placed flat ON the ground automatically — model it upright, resting at y≈0.

config is an ARRAY of controls; for a checkbox use value 0 or 1. Provide 3–8 useful, real controls grouped into tabs (e.g. Performance, Body, Lights).
Controls that DRIVE BEHAVIOUR live (use these exact keys so the panel actually changes the object):
- "topSpeed" → max drive/fly speed.  "acceleration" → how fast it speeds up.  "handling" → turn/steer rate.
- "liftPower" → helicopter/plane climb rate.  "rotorSpeed" → rotor blade speed + lift (also a spin.config target).
- "scale" → overall size multiplier.  "mass" → weight (kg).  "bounciness" → restitution (0..1).
Give vehicles a topSpeed + acceleration + handling control; aircraft a topSpeed + liftPower (+ rotorSpeed for helicopters).`;

/** Suffix for providers WITHOUT native structured output — demand raw JSON in the exact shape. */
export const RAW_JSON_HINT = `\n\nRespond with ONLY raw JSON matching this shape: { type, label, parts:[{primitive,size,position?,rotation?,material}], physics:{mass,friction,restitution,flammable,fire?,fixed?}, config:[{key,type,label,tab,min,max,step,value}] }. No markdown, no prose.`;

/**
 * Validate a user-supplied OpenAI-compatible base URL (provider "custom"). Returns the
 * normalized origin+path (no trailing slash) or null when unusable. https-only and no
 * loopback/private hosts — the server proxy forwards requests here, so this is also the
 * SSRF guard. Tested.
 */
export function sanitizeBaseUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) || // raw IPv4 (incl. 10/172/192 private ranges)
    host.startsWith("[") // IPv6 literal
  ) {
    return null;
  }
  if (url.username || url.password) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

export function repairJson(s: string): string {
  return s
    .replace(/```(?:json)?/gi, "")
    .replace(/\bNaN\b|\bInfinity\b|\b-Infinity\b|\bundefined\b/g, "0")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/(-?\d(?:\.\d+)?)\s+(-?\d)/g, "$1, $2");
}

/**
 * Close an incomplete JSON document by appending the missing `]`/`}` closers (string-aware).
 * Models occasionally stop emitting right before the final braces — the object is complete
 * enough to use, it just doesn't parse. Trailing partial values are trimmed back to the last
 * complete element first.
 */
export function closeJson(t: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let lastComplete = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (escaped) { escaped = false; continue; }
    if (c === "\\") { escaped = true; continue; }
    if (c === '"') { inString = !inString; if (!inString) lastComplete = i + 1; continue; }
    if (inString) continue;
    if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") { stack.pop(); lastComplete = i + 1; }
    else if (c === ",") lastComplete = i;
  }
  if (inString || stack.length === 0) t = t.slice(0, lastComplete);
  // Drop a dangling key left at the cut ("...,"size"" or "{"size"") and any trailing comma.
  t = t
    .replace(/,\s*"[^"]*"\s*:?\s*$/, "")
    .replace(/([{[])\s*"[^"]*"\s*:?\s*$/, "$1")
    .replace(/,\s*$/, "");
  // Recount closers for the trimmed prefix.
  const closers: string[] = [];
  let s = false, e = false;
  for (const c of t) {
    if (e) { e = false; continue; }
    if (c === "\\") { e = true; continue; }
    if (c === '"') { s = !s; continue; }
    if (s) continue;
    if (c === "{" || c === "[") closers.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") closers.pop();
  }
  return t + closers.reverse().join("");
}

export function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  if (start > 0) t = t.slice(start);
  const end = t.lastIndexOf("}");
  try {
    return JSON.parse(end > 0 ? t.slice(0, end + 1) : t);
  } catch {
    try {
      return JSON.parse(repairJson(end > 0 ? t.slice(0, end + 1) : t));
    } catch {
      // Truncated output (model stopped before the closing braces) — balance and retry.
      return JSON.parse(repairJson(closeJson(t)));
    }
  }
}

/** Tolerantly coerce an arbitrary parsed object into a valid LlmSpec (models drift). */
export function coerceLlmSpec(raw: unknown): LlmSpec {
  const r = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || d);
  const partsIn = Array.isArray(r.parts) ? r.parts : [];
  const parts = partsIn
    .map((p) => p as Record<string, unknown>)
    .filter((p) => p && typeof p.primitive === "string" && Array.isArray(p.size))
    .map((p) => ({
      primitive: p.primitive as LlmSpec["parts"][number]["primitive"],
      size: (p.size as unknown[]).map((n) => num(n, 1)).slice(0, 3),
      position: Array.isArray(p.position) ? (p.position as number[]).map((n) => num(n)).slice(0, 3) : undefined,
      rotation: Array.isArray(p.rotation) ? (p.rotation as number[]).map((n) => num(n)).slice(0, 3) : undefined,
      material: typeof p.material === "string" ? p.material : "stone",
    }));
  const ph = (r.physics ?? {}) as Record<string, unknown>;
  const cfgIn = Array.isArray(r.config) ? r.config : [];
  const config = cfgIn
    .map((c) => c as Record<string, unknown>)
    .filter((c) => c && typeof c.key === "string" && ["slider", "checkbox", "stepper"].includes(c.type as string))
    .map((c) => ({
      key: c.key as string,
      type: c.type as "slider" | "checkbox" | "stepper",
      label: typeof c.label === "string" ? c.label : undefined,
      tab: typeof c.tab === "string" ? c.tab : undefined,
      min: c.min !== undefined ? num(c.min) : undefined,
      max: c.max !== undefined ? num(c.max) : undefined,
      step: c.step !== undefined ? num(c.step) : undefined,
      value: typeof c.value === "boolean" ? (c.value ? 1 : 0) : num(c.value),
    }));
  return LlmSpecSchema.parse({
    type: typeof r.type === "string" ? r.type : "object",
    label: typeof r.label === "string" ? r.label : "Object",
    parts: parts.length ? parts : [{ primitive: "box", size: [1, 1, 1], material: "stone" }],
    physics: {
      mass: num(ph.mass, 10),
      friction: num(ph.friction, 0.6),
      restitution: num(ph.restitution, 0.2),
      flammable: Boolean(ph.flammable),
      fire: ph.fire === undefined ? undefined : Boolean(ph.fire),
      fixed: ph.fixed === undefined ? undefined : Boolean(ph.fixed),
    },
    config,
  });
}
