/**
 * Central game state (Zustand). Holds the spawned-object registry, selection, glass/world
 * config, and dev-panel state. Kept free of Three.js imports so reducers are unit-testable.
 */

import { create } from "zustand";
import type { ObjectSpec, ControlSpec } from "@/objects/spec";
import { clampControlValue } from "@/objects/spec";
import type { Provider } from "@/objects/llm";
import { DEFAULT_GLASS, DEFAULT_WORLD, MAX_OBJECTS, type GlassConfig, type WorldConfig } from "@/config/world";

export interface SpawnedObject {
  spec: ObjectSpec;
  /** Surface position the object was placed at (world coords). */
  position: [number, number, number];
  /** Quaternion orientation aligning the object's "up" to the surface normal. */
  quaternion: [number, number, number, number];
  createdAt: number;
  /** Set true when its error boundary trips; the renderer skips broken objects. */
  errored?: boolean;
  /** Ignition state for flammable bodies touched by fire. */
  burning?: boolean;
  /** Hidden/unloaded objects stay in the registry but are not rendered or simulated. */
  hidden?: boolean;
}

export interface GameState {
  objects: Record<string, SpawnedObject>;
  order: string[]; // insertion order for eviction
  selectedId: string | null;

  glass: GlassConfig;
  world: WorldConfig;
  /** Generation provider for prompt → object (local = offline deterministic). */
  provider: Provider;
  /** User-supplied API keys (bring-your-own-key for publishing) — sent to the proxy to override env. */
  apiKeys: Partial<Record<Provider, string>>;
  /** Custom OpenAI-compatible endpoint (provider "custom"): base URL + model name. */
  customBaseUrl: string;
  customModel: string;
  /** When true, trees/rocks are solid (you collide with them). Off = walk/drive through them. */
  solidObstacles: boolean;
  /** When true, ground vehicles use real raycast-vehicle physics (suspension, momentum, collisions). */
  realisticVehicles: boolean;
  devPanelOpen: boolean;
  debugWindowOpen: boolean;
  /** First-launch guide (WelcomeGuide) — starts open until localStorage says it was seen. */
  welcomeOpen: boolean;
  promptOpen: boolean;
  explorerOpen: boolean;
  clockOpen: boolean;
  /** Objects currently being generated/enriched by an AI model (id → label) — drives the spinner. */
  pendingGen: Record<string, string>;

  // actions
  addObject: (obj: SpawnedObject) => void;
  removeObject: (id: string) => void;
  selectObject: (id: string | null) => void;
  setControlValue: (id: string, key: string, value: number | boolean) => void;
  markErrored: (id: string) => void;
  setBurning: (id: string, burning: boolean) => void;
  setHidden: (id: string, hidden: boolean) => void;
  /** Swap an object's spec in place (LLM enrichment), preserving transform & runtime flags. */
  replaceSpec: (id: string, spec: ObjectSpec) => void;
  setProvider: (provider: Provider) => void;
  setApiKey: (provider: Provider, key: string) => void;
  setCustomEndpoint: (patch: { baseUrl?: string; model?: string }) => void;
  setSolidObstacles: (solid: boolean) => void;
  setRealisticVehicles: (on: boolean) => void;

  setGlass: (patch: Partial<GlassConfig>) => void;
  setWorld: (patch: Partial<WorldConfig>) => void;
  toggleDevPanel: (open?: boolean) => void;
  toggleWelcome: (open?: boolean) => void;
  toggleDebugWindow: (open?: boolean) => void;
  togglePrompt: (open?: boolean) => void;
  toggleExplorer: (open?: boolean) => void;
  toggleClock: (open?: boolean) => void;
  startGenerating: (id: string, label: string) => void;
  finishGenerating: (id: string) => void;
  reset: () => void;
  hydrate: (objects: SpawnedObject[]) => void;
}

/** True when the first-launch guide should open (never been dismissed in this browser). */
function loadWelcomePending(): boolean {
  try {
    return localStorage.getItem("orbit.welcomed") !== "1";
  } catch {
    return false; // storage unavailable — don't nag on every load
  }
}

function loadCustomEndpoint(): { customBaseUrl: string; customModel: string } {
  try {
    const raw = JSON.parse(localStorage.getItem("orbit.customEndpoint") || "{}");
    return { customBaseUrl: raw.customBaseUrl || "", customModel: raw.customModel || "" };
  } catch {
    return { customBaseUrl: "", customModel: "" };
  }
}

export const useGameStore = create<GameState>((set) => ({
  objects: {},
  order: [],
  selectedId: null,
  glass: { ...DEFAULT_GLASS },
  world: { ...DEFAULT_WORLD },
  provider: loadProvider(),
  apiKeys: loadApiKeys(),
  ...loadCustomEndpoint(),
  solidObstacles: true,
  // Default OFF: the stable kinematic arcade controller (smooth accel, always upright, terrain-
  // following, launches off cliffs) is the good default. The raycast path stays an opt-in for
  // experimentation — it can bounce/sink on the headless trimesh and feels unstable.
  realisticVehicles: false,
  devPanelOpen: false,
  debugWindowOpen: false,
  welcomeOpen: loadWelcomePending(),
  promptOpen: false,
  explorerOpen: false,
  clockOpen: false,
  pendingGen: {},

  addObject: (obj) =>
    set((state) => {
      const order = [...state.order, obj.spec.id];
      const objects = { ...state.objects, [obj.spec.id]: obj };
      // Graceful eviction when over the cap (Tech Doc §10).
      while (order.length > MAX_OBJECTS) {
        const evict = order.shift()!;
        delete objects[evict];
      }
      return { objects, order };
    }),

  removeObject: (id) =>
    set((state) => {
      if (!state.objects[id]) return state;
      const objects = { ...state.objects };
      delete objects[id];
      return {
        objects,
        order: state.order.filter((x) => x !== id),
        selectedId: state.selectedId === id ? null : state.selectedId,
      };
    }),

  selectObject: (id) => set({ selectedId: id }),

  setControlValue: (id, key, value) =>
    set((state) => {
      const obj = state.objects[id];
      if (!obj) return state;
      const ctrl = obj.spec.config[key];
      if (!ctrl) return state;
      const nextVal: number | boolean =
        ctrl.type === "checkbox" ? Boolean(value) : clampControlValue(ctrl, Number(value));
      const nextCtrl: ControlSpec = { ...ctrl, value: nextVal };
      const nextSpec: ObjectSpec = {
        ...obj.spec,
        config: { ...obj.spec.config, [key]: nextCtrl },
      };
      return { objects: { ...state.objects, [id]: { ...obj, spec: nextSpec } } };
    }),

  markErrored: (id) =>
    set((state) => {
      const obj = state.objects[id];
      if (!obj) return state;
      return { objects: { ...state.objects, [id]: { ...obj, errored: true } } };
    }),

  setBurning: (id, burning) =>
    set((state) => {
      const obj = state.objects[id];
      if (!obj || obj.burning === burning) return state;
      return { objects: { ...state.objects, [id]: { ...obj, burning } } };
    }),

  setHidden: (id, hidden) =>
    set((state) => {
      const obj = state.objects[id];
      if (!obj || obj.hidden === hidden) return state;
      return {
        objects: { ...state.objects, [id]: { ...obj, hidden } },
        selectedId: hidden && state.selectedId === id ? null : state.selectedId,
      };
    }),

  replaceSpec: (id, spec) =>
    set((state) => {
      const obj = state.objects[id];
      if (!obj) return state;
      // Keep the original id/label so identity & selection are stable.
      const merged: ObjectSpec = { ...spec, id, label: obj.spec.label };
      return { objects: { ...state.objects, [id]: { ...obj, spec: merged } } };
    }),

  setProvider: (provider) => {
    try {
      localStorage.setItem("orbit.provider", provider);
    } catch {
      /* ignore */
    }
    set({ provider });
  },
  setApiKey: (provider, key) =>
    set((state) => {
      const apiKeys = { ...state.apiKeys, [provider]: key };
      try {
        localStorage.setItem("orbit.apiKeys", JSON.stringify(apiKeys));
      } catch {
        /* ignore */
      }
      return { apiKeys };
    }),
  setCustomEndpoint: (patch) =>
    set((state) => {
      const customBaseUrl = patch.baseUrl ?? state.customBaseUrl;
      const customModel = patch.model ?? state.customModel;
      try {
        localStorage.setItem("orbit.customEndpoint", JSON.stringify({ customBaseUrl, customModel }));
      } catch {
        /* ignore */
      }
      return { customBaseUrl, customModel };
    }),
  setSolidObstacles: (solid) => set({ solidObstacles: solid }),
  setRealisticVehicles: (on) => set({ realisticVehicles: on }),

  setGlass: (patch) => set((state) => ({ glass: { ...state.glass, ...patch } })),
  setWorld: (patch) => set((state) => ({ world: { ...state.world, ...patch } })),
  toggleDevPanel: (open) => set((state) => ({ devPanelOpen: open ?? !state.devPanelOpen })),
  toggleWelcome: (open) => set((state) => ({ welcomeOpen: open ?? !state.welcomeOpen })),
  toggleDebugWindow: (open) => set((state) => ({ debugWindowOpen: open ?? !state.debugWindowOpen })),
  togglePrompt: (open) => set((state) => ({ promptOpen: open ?? !state.promptOpen })),
  toggleExplorer: (open) => set((state) => ({ explorerOpen: open ?? !state.explorerOpen })),
  toggleClock: (open) => set((state) => ({ clockOpen: open ?? !state.clockOpen })),
  startGenerating: (id, label) => set((state) => ({ pendingGen: { ...state.pendingGen, [id]: label } })),
  finishGenerating: (id) =>
    set((state) => {
      if (!(id in state.pendingGen)) return state;
      const pendingGen = { ...state.pendingGen };
      delete pendingGen[id];
      return { pendingGen };
    }),

  // pendingGen clears too: it doubles as the cancellation token for in-flight AI generations
  // (spawn.ts drops a late model result whose pending entry is gone).
  reset: () => set({ objects: {}, order: [], selectedId: null, pendingGen: {} }),
  hydrate: (objects) =>
    set(() => {
      const map: Record<string, SpawnedObject> = {};
      const order: string[] = [];
      for (const o of objects.slice(-MAX_OBJECTS)) {
        map[o.spec.id] = o;
        order.push(o.spec.id);
      }
      return { objects: map, order };
    }),
}));

function loadProvider(): Provider {
  try {
    const p = localStorage.getItem("orbit.provider");
    if (p === "gemini" || p === "kimi" || p === "deepseek" || p === "custom" || p === "local") return p;
  } catch {
    /* ignore */
  }
  // Local is the default on purpose: this open-source deployment ships NO server keys, so AI
  // providers are always bring-your-own-key — players opt in via the ⚙ settings (the welcome
  // guide walks them through it). Templates make the zero-config experience instant, not broken.
  return "local";
}

function loadApiKeys(): Partial<Record<Provider, string>> {
  try {
    return JSON.parse(localStorage.getItem("orbit.apiKeys") || "{}");
  } catch {
    return {};
  }
}

// Convenience selector used outside React (the game API).
export function getObjectsArray(): SpawnedObject[] {
  const { objects, order } = useGameStore.getState();
  return order.map((id) => objects[id]).filter(Boolean);
}

// re-export so the store module is the single import surface
export { useGameStore as default };
