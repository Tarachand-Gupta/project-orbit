/**
 * Central world configuration for the walkable third-person world.
 *
 * The world is a large explorable terrain (not a globe): gentle jungle hills, a winding river,
 * dirt roads, a small settlement, and lots of open land to spawn things on. Scale values are
 * tweakable behind the dev panel during development and would be frozen at deploy (PRD §4.1).
 */

export interface WorldConfig {
  /** Half-extent of the square world in world units (world spans -size..+size on X and Z). */
  size: number;
  /** Heightfield grid resolution per axis (more = smoother terrain + costlier collider). */
  segments: number;
  /** Maximum hill height in world units. */
  hillAmplitude: number;
  /** Terrain noise frequency — higher = more, tighter hills. */
  noiseScale: number;
  /** Radius around the origin kept flat for a clean spawn/settlement area. */
  flatRadius: number;
  /** River half-width in world units. */
  riverWidth: number;
  /** How deep the river channel is carved below ground. */
  riverDepth: number;
  /** Water surface height (objects/terrain below this are underwater). */
  waterLevel: number;
  /** Base scale applied to generated objects. */
  objectBaseScale: number;
  /** Deterministic terrain seed. */
  seed: number;
}

export const DEFAULT_WORLD: WorldConfig = {
  // A large open world: half-extent 520 (≈4× the old 160 → ~10× the explorable area), with taller
  // hills and a winding river + a lake. Terrain resolution scaled up so hills stay detailed.
  size: 520,
  segments: 224,
  hillAmplitude: 18,
  noiseScale: 1.6,
  flatRadius: 46,
  riverWidth: 11,
  riverDepth: 2.6,
  waterLevel: -0.5,
  objectBaseScale: 1,
  seed: 7,
};

/** Lake centre + radius, derived from world size so it scales with the world (kept clear of spawn). */
export function lakeFor(size: number): { x: number; z: number; r: number } {
  return { x: -size * 0.4, z: -size * 0.32, r: size * 0.17 };
}

/** Dam location: spans the river valley at this X (a wall holding the river back). */
export function damXFor(size: number): number {
  return size * 0.12;
}

/** Glass-morphism design tokens (Tech Doc §8). Wired to CSS variables so the dev panel can tune them live. */
export interface GlassConfig {
  blur: number; // px — frostness (--glass-blur)
  opacity: number; // 0..1 — translucency of the glass fill (--glass-opacity)
}

export const DEFAULT_GLASS: GlassConfig = {
  blur: 16,
  // A touch more fill so HUD text stays legible over a bright/!busy scene.
  opacity: 0.22,
};

/**
 * US timezone anchor for the globally-synced day/night clock.
 * Open question in the PRD (ET vs PT) — defaulting to Eastern Time.
 */
export const WORLD_TIMEZONE = "America/New_York";

/** Per-instance cap on concurrent spawned objects (Tech Doc §10 — graceful eviction). */
export const MAX_OBJECTS = 60;
