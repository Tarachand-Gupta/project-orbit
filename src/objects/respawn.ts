/**
 * Reset spawned objects back to where they were first created. Each SpawnedObject keeps its original
 * drop transform (`position` + `quaternion`); this teleports every live body back to it and zeroes
 * its velocity — a quick "tidy up the sandbox" without removing anything.
 */

import { getBody } from "./bodyRegistry";
import { useGameStore } from "@/state/store";
import { usePlayerStore } from "@/state/playerStore";

export function respawnAll(): number {
  // If the player is driving one of the objects, step out first so the reset isn't fought by the
  // driving controller.
  const ps = usePlayerStore.getState();
  if (ps.drivingId) ps.exitVehicle(ps.position);

  const { objects } = useGameStore.getState();
  let n = 0;
  for (const o of Object.values(objects)) {
    const body = getBody(o.spec.id);
    if (!body) continue; // hidden/unmounted objects re-appear at their original spot anyway
    const [x, y, z] = o.position;
    const [qx, qy, qz, qw] = o.quaternion;
    body.setTranslation({ x, y, z }, true);
    body.setRotation({ x: qx, y: qy, z: qz, w: qw }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    n++;
  }
  return n;
}
