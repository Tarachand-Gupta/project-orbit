import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGameStore } from "@/state/store";
import { logError } from "@/state/debugStore";
import { BURN_DURATION } from "@/config/physics";

/**
 * Manages ignition lifecycle (Tech Doc §6): a flammable body marked `burning` (by contact
 * with a fire emitter) glows, then is consumed and removed after BURN_DURATION seconds.
 * Runs inside the Canvas so it can use the render-loop clock.
 */
export function BurnController() {
  const startTimes = useRef<Map<string, number>>(new Map());

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const { objects, removeObject } = useGameStore.getState();
    const times = startTimes.current;

    for (const [id, obj] of Object.entries(objects)) {
      if (obj.burning) {
        if (!times.has(id)) times.set(id, t);
        else if (t - times.get(id)! > BURN_DURATION) {
          times.delete(id);
          logError({
            objectId: id,
            phase: "runtime",
            level: "info",
            message: `${obj.spec.label} burned away`,
          });
          removeObject(id);
        }
      } else if (times.has(id)) {
        times.delete(id);
      }
    }
    // Clean up timers for objects that no longer exist.
    for (const id of times.keys()) {
      if (!objects[id]) times.delete(id);
    }
  });

  return null;
}
