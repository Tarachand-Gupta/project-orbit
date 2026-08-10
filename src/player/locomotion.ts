/**
 * Pure third-person locomotion & camera math. No Three.js, so it's unit-tested independently.
 * Yaw convention: forward = (sin yaw, 0, cos yaw); right = (cos yaw, 0, -sin yaw).
 */

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export function forwardFromYaw(yaw: number): Vec2 {
  return [Math.sin(yaw), Math.cos(yaw)];
}

export function rightFromYaw(yaw: number): Vec2 {
  // With the camera behind the player looking +forward (+Y up), screen-right is -X at yaw 0,
  // so the strafe-right vector is the negative of the naive perpendicular. (Fixes A/D inversion.)
  return [-Math.cos(yaw), Math.sin(yaw)];
}

export interface MoveInput {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
}

/**
 * Convert directional input + camera yaw into a normalized world-space [x,z] move direction.
 * Returns [0,0] when there is no input.
 */
export function inputToMove(input: MoveInput, yaw: number): Vec2 {
  const f = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  const r = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (f === 0 && r === 0) return [0, 0];
  const fwd = forwardFromYaw(yaw);
  const rt = rightFromYaw(yaw);
  let x = fwd[0] * f + rt[0] * r;
  let z = fwd[1] * f + rt[1] * r;
  const len = Math.hypot(x, z) || 1;
  x /= len;
  z /= len;
  return [x, z];
}

/** Camera position offset (relative to the follow target) for a third-person trail camera. */
export function cameraOffset(yaw: number, distance: number, height: number): Vec3 {
  const fwd = forwardFromYaw(yaw);
  // Behind the target along -forward, raised by height.
  return [-fwd[0] * distance, height, -fwd[1] * distance];
}

/** The yaw heading implied by a move/look direction [x,z], for orienting the avatar. */
export function headingFromDir(x: number, z: number): number {
  return Math.atan2(x, z);
}
