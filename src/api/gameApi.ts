/**
 * Typed game API exposed on `window.game` (Tech Doc §5.1, §7).
 *
 * Both human power-users and AI agents use this surface to spawn objects, read the structured
 * debug log for self-correction, inspect/modify object configs, and query the documented
 * configuration schema. It is intentionally side-effect-free to import; call installGameApi().
 */

import { spawnFromPrompt, type SpawnResult } from "@/objects/spawn";
import { getObjectsArray, useGameStore } from "@/state/store";
import { getLogs, type DebugLogEntry } from "@/state/debugStore";
import type { ObjectSpec } from "@/objects/spec";
import { interactionFor } from "@/objects/spec";
import { saveWorld, loadWorld, clearWorld } from "@/persistence/db";
import { setTimeOverride } from "@/time/clock";

export interface ObjectSummary {
  id: string;
  label: string;
  type: string;
  prompt?: string;
  config: ObjectSpec["config"];
  position: [number, number, number];
  errored?: boolean;
  burning?: boolean;
}

export interface GameApi {
  /** Generate and spawn an object from a natural-language prompt. */
  spawn: (prompt: string) => SpawnResult;
  /** List all spawned objects with their live config (the documented API surface). */
  list: () => ObjectSummary[];
  /** Get one object's spec by id. */
  get: (id: string) => ObjectSpec | null;
  /** Select an object (opens its controls panel). */
  select: (id: string | null) => void;
  /** Set a single config control's value (live tuning). */
  setConfig: (id: string, key: string, value: number | boolean) => void;
  /** Remove an object. */
  remove: (id: string) => void;
  /** Hide/unload (true) or show/reload (false) an object — keeps it in the registry. */
  setHidden: (id: string, hidden: boolean) => void;
  /** Remove every object. */
  clear: () => void;
  /** Structured error/debug log — agents read this to self-correct (Tech Doc §5.1). */
  getLogs: () => DebugLogEntry[];
  /** The configuration schema for an object — the published API reference. */
  describe: (id: string) => Record<string, unknown> | null;
  /** Persist the current world to IndexedDB. */
  save: () => Promise<void>;
  /** Load and replace the world from IndexedDB. */
  load: () => Promise<number>;
  /** Tunable glass HUD tokens. */
  setGlass: (patch: { blur?: number; opacity?: number }) => void;
  /** Choose the generation provider: "local" | "gemini" | "kimi" | "deepseek". */
  setProvider: (provider: "local" | "gemini" | "kimi" | "deepseek") => void;
  /** Override the time of day as a 0..1 fraction (0=midnight, 0.5=noon), or null for real time. */
  setTimeOfDay: (fraction: number | null) => void;
  version: string;
}

function summarize(): ObjectSummary[] {
  return getObjectsArray().map((o) => ({
    id: o.spec.id,
    label: o.spec.label,
    type: o.spec.type,
    prompt: o.spec.prompt,
    config: o.spec.config,
    position: o.position,
    errored: o.errored,
    burning: o.burning,
  }));
}

export const gameApi: GameApi = {
  spawn: (prompt) => spawnFromPrompt(prompt),
  list: summarize,
  get: (id) => useGameStore.getState().objects[id]?.spec ?? null,
  select: (id) => useGameStore.getState().selectObject(id),
  setConfig: (id, key, value) => useGameStore.getState().setControlValue(id, key, value),
  remove: (id) => useGameStore.getState().removeObject(id),
  setHidden: (id, hidden) => useGameStore.getState().setHidden(id, hidden),
  clear: () => {
    useGameStore.getState().reset();
    void clearWorld();
  },
  getLogs: () => getLogs(),
  describe: (id) => {
    const spec = useGameStore.getState().objects[id]?.spec;
    if (!spec) return null;
    return {
      id: spec.id,
      type: spec.type,
      label: spec.label,
      physics: spec.physics,
      interaction: interactionFor(spec),
      config: Object.fromEntries(
        Object.entries(spec.config).map(([k, c]) => [
          k,
          { type: c.type, min: c.min, max: c.max, step: c.step, multipliers: c.multipliers, value: c.value },
        ]),
      ),
    };
  },
  save: async () => saveWorld(getObjectsArray()),
  load: async () => {
    const objs = await loadWorld();
    useGameStore.getState().hydrate(objs);
    return objs.length;
  },
  setGlass: (patch) => useGameStore.getState().setGlass(patch),
  setProvider: (provider) => useGameStore.getState().setProvider(provider),
  setTimeOfDay: (fraction) => setTimeOverride(fraction),
  version: "0.1.0",
};

declare global {
  interface Window {
    game: GameApi;
  }
}

export function installGameApi(): void {
  if (typeof window !== "undefined") {
    window.game = gameApi;
  }
}
