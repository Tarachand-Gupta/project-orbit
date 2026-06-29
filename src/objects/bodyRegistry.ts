/**
 * Registry mapping objectId → live Rapier rigid body. Spawned objects register their body on
 * mount so other systems (notably the vehicle driving controller) can apply forces to a specific
 * object without prop-drilling refs through the scene graph.
 */

import type { RapierRigidBody } from "@react-three/rapier";

const bodies = new Map<string, RapierRigidBody>();

export function registerBody(id: string, body: RapierRigidBody): void {
  bodies.set(id, body);
}

export function unregisterBody(id: string): void {
  bodies.delete(id);
}

export function getBody(id: string): RapierRigidBody | undefined {
  return bodies.get(id);
}
