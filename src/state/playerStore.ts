/**
 * Player + interaction state.
 *
 * `position`/`facing` are transient render-loop values updated every frame and read via
 * getState() (never subscribed) so they don't churn React. `nearbyVehicleId` and `drivingId`
 * drive the HUD interaction prompt and the enter/exit-vehicle flow, so they ARE subscribed.
 */

import { create } from "zustand";

export interface PlayerState {
  /** Live world position of the player (transient — not for subscription). */
  position: [number, number, number];
  /** Camera yaw in radians (transient). */
  cameraYaw: number;
  /** Whether the player is currently moving (transient — drives the walk animation). */
  moving: boolean;
  /** Current speed (m/s) of the vehicle being driven/flown, 0 on foot (transient). */
  speed: number;
  /** Id of a drivable vehicle within interaction range, or null. */
  nearbyVehicleId: string | null;
  /** Id of the vehicle currently being driven, or null when on foot. */
  drivingId: string | null;
  /** Bumped to request the player body teleport to a position (e.g. on exit). */
  teleport: [number, number, number] | null;

  setPosition: (p: [number, number, number]) => void;
  setCameraYaw: (y: number) => void;
  setMoving: (m: boolean) => void;
  setSpeed: (s: number) => void;
  setNearby: (id: string | null) => void;
  enterVehicle: (id: string) => void;
  exitVehicle: (at: [number, number, number]) => void;
  /** Request the on-foot player be moved to a position (consumed next frame). */
  teleportTo: (at: [number, number, number]) => void;
  consumeTeleport: () => [number, number, number] | null;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  position: [0, 2, 0],
  cameraYaw: 0,
  moving: false,
  speed: 0,
  nearbyVehicleId: null,
  drivingId: null,
  teleport: null,

  setPosition: (p) => {
    get().position = p; // mutate in place; transient, no notify
  },
  setCameraYaw: (y) => {
    get().cameraYaw = y;
  },
  setMoving: (m) => {
    get().moving = m;
  },
  setSpeed: (s) => {
    get().speed = s;
  },
  setNearby: (id) => set((s) => (s.nearbyVehicleId === id ? s : { nearbyVehicleId: id })),
  enterVehicle: (id) => set({ drivingId: id, nearbyVehicleId: null }),
  exitVehicle: (at) => set({ drivingId: null, teleport: at }),
  teleportTo: (at) => set({ teleport: at }),
  consumeTeleport: () => {
    const t = get().teleport;
    if (t) set({ teleport: null });
    return t;
  },
}));
