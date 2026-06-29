/**
 * DEV-only test hooks. Exposed on window.__orbitTest in development/test builds so the headless
 * e2e suite can deterministically exercise internal paths (e.g. the error log → indicator flow)
 * without shipping these affordances to production.
 */

import { useDebugStore, type LogPhase } from "@/state/debugStore";
import { useGameStore } from "@/state/store";
import { usePlayerStore } from "@/state/playerStore";
import { getBody } from "@/objects/bodyRegistry";
import { resetInput } from "@/player/input";

export interface OrbitTestHooks {
  pushLog: (message: string, phase?: LogPhase) => void;
  unseen: () => number;
  state: () => ReturnType<typeof useGameStore.getState>;
  /** Player world position (transient). */
  playerPos: () => [number, number, number];
  /** Force the player to enter a vehicle by id (bypasses proximity, for tests). */
  enterVehicle: (id: string) => void;
  /** Current driving vehicle id, or null. */
  drivingId: () => string | null;
  /** Current driven/flown speed (m/s); 0 on foot. Reflects the live config-tuned speed. */
  vehicleSpeed: () => number;
  /** Live world position of a spawned object. */
  objectPos: (id: string) => [number, number, number] | null;
  /** Live linear-velocity magnitude of a spawned object (for kick/punch tests). */
  objectSpeed: (id: string) => number;
  /** Live signed vertical velocity (linvel.y) of a spawned object — distinguishes climb from sink. */
  objectVelY: (id: string) => number;
  /** Relocate the player + face a heading (radians). */
  teleport: (x: number, z: number, yaw?: number) => void;
  /** Reset transient control state (held keys, queued events, current vehicle) so tests are isolated. */
  resetControls: () => void;
}

declare global {
  interface Window {
    __orbitTest?: OrbitTestHooks;
  }
}

export function installTestHooks(): void {
  if (typeof window === "undefined") return;
  // Vite replaces import.meta.env.DEV with a literal; tree-shaken out of prod builds.
  if (!import.meta.env.DEV) return;
  window.__orbitTest = {
    pushLog: (message, phase = "render") =>
      useDebugStore.getState().push({ phase, level: "error", message }),
    unseen: () => useDebugStore.getState().unseen,
    state: () => useGameStore.getState(),
    playerPos: () => usePlayerStore.getState().position,
    enterVehicle: (id) => usePlayerStore.getState().enterVehicle(id),
    drivingId: () => usePlayerStore.getState().drivingId,
    vehicleSpeed: () => usePlayerStore.getState().speed,
    objectPos: (id) => {
      const body = getBody(id);
      if (body) {
        const t = body.translation();
        return [t.x, t.y, t.z];
      }
      return useGameStore.getState().objects[id]?.position ?? null;
    },
    objectSpeed: (id) => {
      const body = getBody(id);
      if (!body) return 0;
      const v = body.linvel();
      return Math.hypot(v.x, v.y, v.z);
    },
    objectVelY: (id) => getBody(id)?.linvel().y ?? 0,
    teleport: (x, z, yaw) => {
      const ps = usePlayerStore.getState();
      if (typeof yaw === "number") ps.setCameraYaw(yaw);
      ps.teleportTo([x, 0, z]);
    },
    resetControls: () => {
      resetInput();
      const ps = usePlayerStore.getState();
      if (ps.drivingId) ps.exitVehicle(ps.position);
      ps.setSpeed(0);
      ps.teleportTo([0, 0, 0]);
      ps.setCameraYaw(0);
    },
  };
}
