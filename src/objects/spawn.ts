/**
 * Spawn orchestration — the "type and it appears" pipeline (PRD §5.1).
 *
 * prompt → generate spec → validate (schema) → place on the planet surface → add to store.
 * Every phase is guarded: an invalid spec falls back to a generic primitive object, and any
 * thrown error is logged and surfaced via the error indicator rather than crashing the game.
 */

import { generateSpec } from "./generator";
import { validateSpec } from "./spec";
import { createGroundSampler, type GroundSampler } from "@/world/ground";
import { placeOnGround, pickSpawnInFront } from "@/world/placement";
import { forwardFromYaw } from "@/player/locomotion";
import { specBoundingRadius } from "./geometry";
import { getBody } from "./bodyRegistry";
import { groundSpec } from "./normalize";
import { ensureRotors } from "./rotors";
import { useGameStore, type SpawnedObject } from "@/state/store";
import { usePlayerStore } from "@/state/playerStore";
import { logError } from "@/state/debugStore";
import type { WorldConfig } from "@/config/world";
import { enrichWithLLM } from "./llm";

let spawnCounter = 0;
export function nextObjectId(): string {
  spawnCounter += 1;
  return `obj_${spawnCounter}_${spawnCounter * 2654435761 % 100000}`;
}

// Cache one ground sampler per world signature so we don't rebuild noise on every spawn.
let cachedSampler: { key: string; sampler: GroundSampler } | null = null;
export function samplerFor(world: WorldConfig): GroundSampler {
  const key = `${world.size}|${world.segments}|${world.hillAmplitude}|${world.noiseScale}|${world.seed}|${world.riverWidth}|${world.riverDepth}|${world.flatRadius}`;
  if (cachedSampler?.key === key) return cachedSampler.sampler;
  const sampler = createGroundSampler(world);
  cachedSampler = { key, sampler };
  return sampler;
}

export interface SpawnResult {
  ok: boolean;
  id?: string;
  label?: string;
  source?: "template" | "generic";
  /** True when an AI model is generating and the object will appear once it's done. */
  pending?: boolean;
  error?: string;
}

export interface SpawnOptions {
  /**
   * Spawn the deterministic local template/generic object immediately, skipping AI generation
   * even when a cloud provider is selected. Used by the prompt box's typeahead suggestions —
   * picking a known object should be instant.
   */
  forceLocal?: boolean;
}

/** Drop height (~5 feet) so spawned objects fall gently to the ground instead of popping in. */
const DROP_HEIGHT = 1.6;

/** Compute a clear spot in front of the player and add the object there, dropping from above. */
function placeAndAdd(spec: ObjectSpecLike, world: WorldConfig): void {
  const sampler = samplerFor(world);
  const playerState = usePlayerStore.getState();
  const player = playerState.position;
  const [fx, fz] = forwardFromYaw(playerState.cameraYaw);
  const radius = specBoundingRadius(spec.parts);

  // Don't spawn on top of an existing object — keep clear of every other object's footprint.
  const others = Object.values(useGameStore.getState().objects)
    .filter((o) => !o.hidden)
    .map((o) => {
      const body = getBody(o.spec.id);
      const t = body ? body.translation() : { x: o.position[0], z: o.position[2] };
      return { x: t.x, z: t.z, r: specBoundingRadius(o.spec.parts) };
    });
  const clearOf = (x: number, z: number) => others.every((e) => Math.hypot(e.x - x, e.z - z) > e.r + radius + 1.2);

  // Bigger objects spawn a bit further; try increasing distances until the spot is clear.
  const base = Math.max(4.5, 4 + radius * 1.15);
  let pt = pickSpawnInFront(sampler, { x: player[0], z: player[2] }, { x: fx, z: fz }, base);
  for (let d = base; d <= base + 44; d += 4) {
    const cand = pickSpawnInFront(sampler, { x: player[0], z: player[2] }, { x: fx, z: fz }, d);
    if (clearOf(cand.x, cand.z)) {
      pt = cand;
      break;
    }
  }

  const { position, quaternion } = placeOnGround(pt.x, pt.z, sampler, DROP_HEIGHT);
  useGameStore.getState().addObject({ spec, position, quaternion, createdAt: Date.now() });
}

type ObjectSpecLike = SpawnedObject["spec"];

// Normalized prompts with a generation already in flight — a second Create with the same text
// while the model works must NOT queue a second object (the "no duplicates" rule).
const inFlight = new Map<string, string>(); // normalized prompt → object id

/**
 * Generate and place an object from a natural-language prompt.
 *
 * Local provider (and typeahead template picks): the deterministic object appears instantly.
 * Cloud provider: NOTHING spawns until the model answers — the GenerationIndicator shows
 * progress, then exactly ONE object (the enriched spec) is placed. The local template is used
 * only as the failure fallback. This deliberately replaced the old "spawn local now, morph it
 * in place ~10s later" flow: the mid-ride spec swap read as a duplicate object (and could
 * teleport the body you were driving).
 *
 * @param prompt the user/agent text
 */
export function spawnFromPrompt(prompt: string, opts: SpawnOptions = {}): SpawnResult {
  const trimmed = prompt.trim();
  if (!trimmed) return { ok: false, error: "empty prompt" };

  const world = useGameStore.getState().world;
  const id = nextObjectId();

  try {
    const generated = generateSpec(trimmed, id);
    const source = generated.source;
    // Normalize so the object's lowest point is at local y=0 → it rests on the ground (no hover),
    // and guarantee rotorcraft have spinning blades regardless of what the generator produced.
    const spec = ensureRotors(groundSpec(generated.spec));

    const validation = validateSpec(spec);
    if (!validation.ok) {
      logError({
        objectId: id,
        prompt: trimmed,
        phase: "validate",
        level: "error",
        message: `spec failed validation: ${validation.errors.join("; ")}`,
      });
      return { ok: false, id, error: "invalid spec" };
    }

    const provider = useGameStore.getState().provider;

    if (provider === "local" || opts.forceLocal) {
      placeAndAdd(spec, world);
      return { ok: true, id, label: spec.label, source };
    }

    const normalized = trimmed.toLowerCase().replace(/\s+/g, " ");
    if (inFlight.has(normalized)) {
      return { ok: false, id: inFlight.get(normalized), label: spec.label, error: "already generating" };
    }
    inFlight.set(normalized, id);

    // AI mode: generate first, spawn once. The pendingGen entry doubles as the cancellation
    // token — clearing/resetting the world empties it, and then the late result is dropped.
    useGameStore.getState().startGenerating(id, spec.label);
    const cancelled = () => !(id in useGameStore.getState().pendingGen);
    void enrichWithLLM(trimmed, id, provider, spec.label)
      .then((enriched) => {
        if (cancelled()) return;
        if (enriched) {
          placeAndAdd(ensureRotors(groundSpec(enriched)), useGameStore.getState().world);
        } else {
          // Model failed/timed out — offline-first: the deterministic local object still appears.
          placeAndAdd(spec, useGameStore.getState().world);
          logError({
            objectId: id,
            prompt: trimmed,
            phase: "generate",
            level: "info",
            message: `AI generation unavailable — spawned the local ${source} object instead`,
          });
        }
      })
      .catch(() => {
        // enrichWithLLM never throws (returns null) — but never strand the pending entry.
        if (!cancelled()) placeAndAdd(spec, useGameStore.getState().world);
      })
      .finally(() => {
        inFlight.delete(normalized);
        useGameStore.getState().finishGenerating(id);
      });

    return { ok: true, id, label: spec.label, source, pending: true };
  } catch (err) {
    logError({
      objectId: id,
      prompt: trimmed,
      phase: "generate",
      level: "error",
      message: `spawn failed: ${(err as Error).message}`,
      stack: (err as Error).stack,
    });
    return { ok: false, id, error: (err as Error).message };
  }
}
