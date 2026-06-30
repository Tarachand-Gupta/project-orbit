/**
 * Object Spec — the single contract that powers generation, the builder, the controls
 * panel, and the API reference (Tech Doc §7). Kept dependency-free so it can be unit-tested
 * and reused by agents.
 */

export type PrimitiveKind =
  | "box"
  | "sphere"
  | "cylinder"
  | "cone"
  | "capsule"
  | "torus"
  | "tetrahedron";

export type Vec3 = [number, number, number];

/** Optional continuous spin for a part (rotors, wheels, fans). Can be driven live by a config control. */
export interface SpinSpec {
  axis: "x" | "y" | "z";
  /** Base angular speed in radians/second. */
  speed: number;
  /** Optional config key whose numeric value multiplies the speed (live control). */
  config?: string;
}

export interface PartSpec {
  primitive: PrimitiveKind;
  /** Size semantics depend on primitive: box=[w,h,d], sphere=[r], cylinder=[rTop,rBottom,h], etc. */
  size: number[];
  /** Local offset from the object origin. */
  position?: Vec3;
  /** Euler rotation in radians. */
  rotation?: Vec3;
  /** Named material from the palette, or a hex color string. */
  material: string;
  /** Optional continuous rotation (e.g. a helicopter rotor). */
  spin?: SpinSpec;
}

export interface PhysicsSpec {
  mass: number;
  friction: number;
  restitution: number;
  /** Real-world material semantic tags driving interactions (Tech Doc §6). */
  flammable: boolean;
  /** Emits fire — ignites nearby flammable bodies on contact. */
  fire?: boolean;
  /** Fixed bodies do not move (terrain fixtures, buildings sitting still). */
  fixed?: boolean;
}

export type ControlType = "slider" | "checkbox" | "stepper";

export interface ControlSpec {
  type: ControlType;
  label?: string;
  /** Which tab in the controls panel this belongs to. */
  tab?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Stepper multipliers — PRD §4.6 requires 5×/10×/20×. */
  multipliers?: number[];
  value: number | boolean;
}

/**
 * How the player interacts with an object (the "controls API" — see OBJECT_API.md). Generated
 * objects/agents declare this so anything can be made enterable/drivable/flyable with a standard
 * GTA-style scheme (E to enter, E to exit).
 */
export type InteractionMode = "none" | "drive" | "fly" | "ride" | "wield";

/**
 * How the avatar is posed on the object (the rider-interaction API):
 *  - "sit"         → seated facing forward (cars, boats, bikes, planes)
 *  - "stand"       → standing on top facing forward (hoverboards, segways, platforms)
 *  - "stand-left"  → standing sideways, left foot forward (skateboard/snowboard/surf stance)
 *  - "stand-right" → standing sideways, right foot forward
 */
export type RiderPosture =
  | "sit" // cars, boats, planes — seated upright
  | "straddle" // motorbikes, horses/mounts — leaning forward, legs down the sides
  | "stand" // hoverboards, segways, platforms — standing forward
  | "stand-left" // skateboards/snowboards/surf — sideways stance, left foot forward
  | "stand-right" // sideways stance, right foot forward
  | "lie"; // hang gliders, luge, sleds — lying prone

export interface InteractionSpec {
  mode: InteractionMode;
  /** Verb shown in the prompt, e.g. "drive", "fly", "ride". Defaults from mode. */
  verb?: string;
  /** Seat/foot height offset above the object origin where the rider is placed. */
  seatHeight?: number;
  posture?: RiderPosture;
}

export interface ObjectSpec {
  id: string;
  /** Free-form semantic type, e.g. "vehicle", "aircraft", "building", "ball", "tree". */
  type: string;
  /** Human label shown in the HUD. */
  label: string;
  /** The prompt that produced this object (kept for the debug log + agent self-correction). */
  prompt?: string;
  parts: PartSpec[];
  physics: PhysicsSpec;
  config: Record<string, ControlSpec>;
  /** Optional interaction declaration (enter/drive/fly). Inferred from `type` when absent. */
  interaction?: InteractionSpec;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const PRIMITIVES: PrimitiveKind[] = [
  "box",
  "sphere",
  "cylinder",
  "cone",
  "capsule",
  "torus",
  "tetrahedron",
];

const CONTROL_TYPES: ControlType[] = ["slider", "checkbox", "stepper"];

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * Validate an untrusted spec (e.g. from an LLM). Because the spec is schema-validated,
 * even a weak/garbage model cannot break core mechanics — invalid specs are rejected and
 * the caller falls back to a primitive object (Tech Doc §4.1).
 */
export function validateSpec(input: unknown): ValidationResult {
  const errors: string[] = [];
  const spec = input as Partial<ObjectSpec> | null;

  if (!spec || typeof spec !== "object") {
    return { ok: false, errors: ["spec is not an object"] };
  }
  if (typeof spec.id !== "string" || !spec.id) errors.push("id must be a non-empty string");
  if (typeof spec.type !== "string" || !spec.type) errors.push("type must be a non-empty string");
  if (typeof spec.label !== "string" || !spec.label) errors.push("label must be a non-empty string");

  if (!Array.isArray(spec.parts) || spec.parts.length === 0) {
    errors.push("parts must be a non-empty array");
  } else {
    if (spec.parts.length > 200) errors.push("parts exceeds max of 200");
    spec.parts.forEach((p, i) => {
      if (!p || typeof p !== "object") {
        errors.push(`parts[${i}] is not an object`);
        return;
      }
      if (!PRIMITIVES.includes(p.primitive)) errors.push(`parts[${i}].primitive invalid: ${String(p.primitive)}`);
      if (!Array.isArray(p.size) || p.size.length === 0 || !p.size.every(isFiniteNumber)) {
        errors.push(`parts[${i}].size must be an array of finite numbers`);
      } else if (p.size.some((n) => n <= 0 || n > 1000)) {
        errors.push(`parts[${i}].size values must be in (0, 1000]`);
      }
      if (typeof p.material !== "string" || !p.material) errors.push(`parts[${i}].material must be a string`);
      for (const key of ["position", "rotation"] as const) {
        const v = p[key];
        if (v !== undefined && (!Array.isArray(v) || v.length !== 3 || !v.every(isFiniteNumber))) {
          errors.push(`parts[${i}].${key} must be a [x,y,z] of finite numbers`);
        }
      }
    });
  }

  const phys = spec.physics;
  if (!phys || typeof phys !== "object") {
    errors.push("physics must be an object");
  } else {
    if (!isFiniteNumber(phys.mass) || phys.mass < 0) errors.push("physics.mass must be a non-negative number");
    if (!isFiniteNumber(phys.friction) || phys.friction < 0) errors.push("physics.friction must be >= 0");
    if (!isFiniteNumber(phys.restitution) || phys.restitution < 0) errors.push("physics.restitution must be >= 0");
    if (typeof phys.flammable !== "boolean") errors.push("physics.flammable must be a boolean");
  }

  if (spec.interaction !== undefined) {
    const it = spec.interaction;
    if (!it || typeof it !== "object" || !["none", "drive", "fly", "ride", "wield"].includes(it.mode)) {
      errors.push("interaction.mode must be one of none|drive|fly|ride|wield");
    }
  }

  if (!spec.config || typeof spec.config !== "object") {
    errors.push("config must be an object");
  } else {
    for (const [key, ctrl] of Object.entries(spec.config)) {
      if (!ctrl || typeof ctrl !== "object") {
        errors.push(`config.${key} is not an object`);
        continue;
      }
      if (!CONTROL_TYPES.includes(ctrl.type)) errors.push(`config.${key}.type invalid: ${String(ctrl.type)}`);
      if (ctrl.type === "checkbox") {
        if (typeof ctrl.value !== "boolean") errors.push(`config.${key}.value must be boolean for checkbox`);
      } else {
        if (!isFiniteNumber(ctrl.value)) errors.push(`config.${key}.value must be a number for ${ctrl.type}`);
        if (ctrl.min !== undefined && !isFiniteNumber(ctrl.min)) errors.push(`config.${key}.min must be a number`);
        if (ctrl.max !== undefined && !isFiniteNumber(ctrl.max)) errors.push(`config.${key}.max must be a number`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

const WIELD_TYPES = ["gun", "pistol", "rifle", "revolver", "shotgun", "smg", "weapon", "blaster", "raydun", "raygun", "laser", "cannon", "bazooka", "rocket launcher", "launcher", "minigun", "uzi", "ak47", "ak-47", "musket", "sniper"];
const FLY_TYPES = ["aircraft", "plane", "airplane", "jet", "helicopter", "chopper", "drone", "spaceship", "glider", "ufo"];
const DRIVE_TYPES = ["vehicle", "car", "truck", "bus", "van", "jeep", "suv", "buggy", "boat", "ship", "tank", "kart", "atv", "quad", "hovercraft", "motorcycle", "motorbike", "bicycle", "cycle", "bike", "scooter"];
const RIDE_TYPES = ["hoverboard", "skateboard", "surfboard", "snowboard", "longboard", "board", "segway", "horse", "mount", "animal", "dragon", "magic carpet", "carpet"];

// type keyword → forced posture (these override an LLM's posture guess, which is often wrong)
const POSTURE_BY_TYPE: Array<[RegExp, RiderPosture]> = [
  [/skateboard|snowboard|surfboard|longboard/, "stand-left"],
  [/hoverboard|segway|board|magic carpet|carpet/, "stand"],
  // every two-wheeler (motorcycle, motorbike, bike, bicycle, cycle, scooter, moped) → straddle
  [/motorcycle|motorbike|bicycle|moped|scooter|\bbike\b|\bcycle\b/, "straddle"],
  [/horse|\bmount\b|dragon|\banimal\b/, "straddle"],
  [/glider|hang.?glider|luge|sled|sledge/, "lie"],
];

const DEFAULT_SEAT: Record<RiderPosture, number> = {
  sit: 0.6,
  straddle: 0.55,
  stand: 0.28,
  "stand-left": 0.28,
  "stand-right": 0.28,
  lie: 0.45,
};

/**
 * Resolve how the player interacts with an object — the single source of truth for the player
 * controller, HUD prompt, and avatar pose. Always returns a normalized interaction with `mode`,
 * `verb`, `posture`, and `seatHeight` resolved: explicit `spec.interaction` is respected, but the
 * semantic `type` fills the gaps and forces an obvious posture (a skateboard always stands, etc.).
 */
export function interactionFor(spec: ObjectSpec): InteractionSpec {
  const t = spec.type.toLowerCase();
  const explicit = spec.interaction;

  let mode: InteractionMode | undefined = explicit?.mode;
  if (!mode) {
    if (WIELD_TYPES.some((k) => t.includes(k))) mode = "wield";
    else if (FLY_TYPES.some((k) => t.includes(k))) mode = "fly";
    else if (RIDE_TYPES.some((k) => t.includes(k))) mode = "ride";
    else if (DRIVE_TYPES.some((k) => t.includes(k))) mode = "drive";
    else mode = "none";
  }
  if (mode === "none") return { mode: "none" };
  // Weapons are held, not ridden — no posture/seat, just the equip verb.
  if (mode === "wield") return { mode, verb: explicit?.verb ?? "equip" };

  // Posture: a strong type signal overrides the LLM; else use the LLM's posture; else default by mode.
  const forced = POSTURE_BY_TYPE.find(([re]) => re.test(t))?.[1];
  const posture: RiderPosture = forced ?? explicit?.posture ?? (mode === "fly" || mode === "drive" ? "sit" : "stand");

  // Seat height: trust the LLM only within a sane range, else default by posture.
  let seatHeight = explicit?.seatHeight;
  if (seatHeight == null || !Number.isFinite(seatHeight) || seatHeight < 0.1 || seatHeight > 1.8) {
    seatHeight = DEFAULT_SEAT[posture];
  }

  const verb = explicit?.verb ?? (mode === "fly" ? "fly" : mode === "ride" ? "ride" : "drive");
  return { mode, verb, posture, seatHeight };
}

/** Clamp/repair a control value to its declared bounds. Used when applying live edits. */
export function clampControlValue(ctrl: ControlSpec, next: number): number {
  let v = next;
  if (ctrl.min !== undefined) v = Math.max(ctrl.min, v);
  if (ctrl.max !== undefined) v = Math.min(ctrl.max, v);
  return v;
}
