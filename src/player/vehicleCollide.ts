/**
 * Pure slide-collision resolution for the kinematic vehicle. Given the current XZ, the desired next
 * XZ, and a `blocked(x,z)` predicate (true when a solid obstacle occupies that spot), return where
 * the vehicle should actually end up: straight through if clear, sliding along one axis if a wall is
 * in the way, or stopped if fully boxed in. Kept pure so it's unit-testable without the physics world.
 */

export interface SlideResult {
  x: number;
  z: number;
  /** True when both axes were blocked (the vehicle is wedged and should shed speed). */
  stopped: boolean;
}

export function slideMove(
  curX: number,
  curZ: number,
  nextX: number,
  nextZ: number,
  blocked: (x: number, z: number) => boolean,
): SlideResult {
  if (!blocked(nextX, nextZ)) return { x: nextX, z: nextZ, stopped: false };
  // Blocked straight ahead — try sliding along each axis so you scrape past a wall, not stop dead.
  if (!blocked(nextX, curZ)) return { x: nextX, z: curZ, stopped: false };
  if (!blocked(curX, nextZ)) return { x: curX, z: nextZ, stopped: false };
  return { x: curX, z: curZ, stopped: true };
}
