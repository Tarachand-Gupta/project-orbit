/**
 * Terrain conforming for vehicles: given an (x,z) and a heading yaw, compute the position ON the
 * ground (terrain height + clearance) and an orientation that sits the vehicle flat on the slope,
 * upright. Used for BOTH parked and driven ground vehicles so they can never float or tilt off.
 */

import * as THREE from "three";
import type { GroundSampler } from "./ground";

const up = new THREE.Vector3();
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
const basisFwd = new THREE.Vector3();
const mat = new THREE.Matrix4();
const q = new THREE.Quaternion();

export interface Conformed {
  y: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

export function conformToTerrain(
  sampler: GroundSampler,
  x: number,
  z: number,
  yaw: number,
  clearance: number,
): Conformed {
  const y = sampler.heightAt(x, z) + clearance;
  const e = 1.3;
  up.set(
    sampler.heightAt(x - e, z) - sampler.heightAt(x + e, z),
    2 * e,
    sampler.heightAt(x, z - e) - sampler.heightAt(x, z + e),
  ).normalize();
  fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
  right.crossVectors(up, fwd).normalize();
  basisFwd.crossVectors(right, up).normalize();
  mat.makeBasis(right, up, basisFwd);
  q.setFromRotationMatrix(mat);
  return { y, qx: q.x, qy: q.y, qz: q.z, qw: q.w };
}
