import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { RigidBody } from "@react-three/rapier";
import type { GroundSampler } from "./ground";

/**
 * The walkable terrain (Tech Doc §3). A grid mesh displaced by the shared GroundSampler with
 * flat-shaded per-vertex biome colors, wrapped in a fixed Rapier **trimesh** collider built from
 * the exact same geometry — so the player and spawned objects collide with precisely the ground
 * they see (no floating, and vehicles can drive over the hills).
 */
export function Terrain({ sampler }: { sampler: GroundSampler }) {
  const geometry = useMemo(() => buildTerrainGeometry(sampler), [sampler]);
  // Dispose the manually-built geometry when it's replaced/unmounted — without this, every world
  // regeneration (and dev HMR) leaks a ~45k-triangle buffer on the GPU, eventually crashing it.
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <RigidBody type="fixed" colliders="trimesh" friction={1}>
      <mesh geometry={geometry} receiveShadow castShadow>
        <meshStandardMaterial vertexColors flatShading roughness={1} metalness={0} />
      </mesh>
    </RigidBody>
  );
}

/**
 * Build NON-INDEXED terrain so each triangle has its own flat color. With flatShading on, every
 * polygon becomes a distinct faceted shade (the low-poly "texture" look) — coloured from the
 * biome at the face centroid plus a small deterministic per-face shade/hue variation, so adjacent
 * polygons differ in tone instead of being one flat fill.
 */
export function buildTerrainGeometry(sampler: GroundSampler): THREE.BufferGeometry {
  const { size, segments } = sampler.config;
  const n = segments;
  const step = (size * 2) / n;

  // Precompute corner heights so each is sampled once.
  const H = new Float32Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      H[j * (n + 1) + i] = sampler.heightAt(-size + i * step, -size + j * step);
    }
  }
  const hAt = (i: number, j: number) => H[j * (n + 1) + i];

  const verts: number[] = [];
  const colors: number[] = [];

  const pushFace = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
  ) => {
    verts.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    // Clean biome colour from the face centroid — NO random tinting. The per-polygon variation
    // comes from flat shading: each facet's normal catches the sun differently, so slopes/bumps
    // shade naturally while flat ground stays even.
    const col = sampler.colorAt((ax + bx + cx) / 3, (az + bz + cz) / 3);
    for (let k = 0; k < 3; k++) colors.push(col.r, col.g, col.b);
  };

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x0 = -size + i * step, x1 = -size + (i + 1) * step;
      const z0 = -size + j * step, z1 = -size + (j + 1) * step;
      const ay = hAt(i, j), by = hAt(i + 1, j), cy = hAt(i + 1, j + 1), dy = hAt(i, j + 1);
      // Two triangles per cell (winding matches the lit side): (a,c,b) and (a,d,c).
      pushFace(x0, ay, z0, x1, cy, z1, x1, by, z0);
      pushFace(x0, ay, z0, x0, dy, z1, x1, cy, z1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}
