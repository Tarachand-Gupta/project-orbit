import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { RigidBody } from "@react-three/rapier";
import { riverCenterZ } from "./ground";
import type { GroundSampler } from "./ground";

/**
 * Dirt jungle roads (PRD: "walkable jungle roads") radiating from the settlement, plus a wooden
 * bridge where the north road crosses the river valley. Roads hug the terrain as a thin **solid**
 * trimesh just above the ground, so the player walks/drives straight onto them.
 */
export function Roads({ sampler }: { sampler: GroundSampler }) {
  const { size } = sampler.config;

  const roads = useMemo(() => {
    const r = Math.min(size * 0.32, 50);
    const crossZ = riverCenterZ(0, size); // river crossing (north)
    const paths: Array<Array<[number, number]>> = [
      [[0, 0], [0, crossZ + 18]], // north road, over the bridge
      [[0, 0], [r, -r * 0.7]],
      [[0, 0], [-r, -r * 0.7]],
      [[0, 0], [-r * 0.75, r * 0.5]],
    ];
    return paths.map((p) => buildRoadGeometry(p, sampler, 3.2));
  }, [sampler, size]);

  // Free the manually-created geometries when they're replaced/unmounted (prevents GPU leaks).
  useEffect(() => () => roads.forEach((g) => g.dispose()), [roads]);

  const bridge = useMemo(() => {
    const cz = riverCenterZ(0, size);
    const len = sampler.config.riverWidth * 2 + 6;
    return { cz, len, y: sampler.config.waterLevel + 0.5 };
  }, [sampler, size]);

  return (
    <group>
      <RigidBody type="fixed" colliders="trimesh" friction={1}>
        {roads.map((geo, i) => (
          <mesh key={i} geometry={geo} receiveShadow>
            <meshStandardMaterial color="#7a5a36" roughness={1} flatShading />
          </mesh>
        ))}
      </RigidBody>

      {/* Wooden plank bridge spanning the river channel (solid deck + railings). */}
      <RigidBody type="fixed" colliders="cuboid" position={[0, bridge.y, bridge.cz]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[7, 0.3, bridge.len]} />
          <meshStandardMaterial color="#8a5a2b" roughness={0.9} flatShading />
        </mesh>
        <mesh position={[3.35, 0.45, 0]} castShadow>
          <boxGeometry args={[0.25, 0.9, bridge.len]} />
          <meshStandardMaterial color="#6b4423" roughness={0.9} flatShading />
        </mesh>
        <mesh position={[-3.35, 0.45, 0]} castShadow>
          <boxGeometry args={[0.25, 0.9, bridge.len]} />
          <meshStandardMaterial color="#6b4423" roughness={0.9} flatShading />
        </mesh>
      </RigidBody>
    </group>
  );
}

/**
 * Build a flush road ribbon that hugs the terrain. Each edge vertex samples the actual terrain
 * height at its own (x,z) with a tiny lift, so the road conforms to the ground (no floating lip,
 * no ledge) and the player walks straight onto it.
 */
function buildRoadGeometry(points: Array<[number, number]>, sampler: GroundSampler, halfWidth: number): THREE.BufferGeometry {
  const samples: Array<[number, number]> = [];
  const SUB = 80; // dense so the ribbon follows terrain triangles closely
  for (let s = 0; s < points.length - 1; s++) {
    const [x0, z0] = points[s];
    const [x1, z1] = points[s + 1];
    for (let k = 0; k < SUB; k++) {
      const t = k / SUB;
      samples.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
    }
  }
  samples.push(points[points.length - 1]);

  const LIFT = 0.06; // just enough to avoid z-fighting with the terrain
  const verts: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    const [x, z] = samples[i];
    const prev = samples[Math.max(0, i - 1)];
    const next = samples[Math.min(samples.length - 1, i + 1)];
    const dx = next[0] - prev[0];
    const dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    const px = -dz / len, pz = dx / len;
    const lx = x + px * halfWidth, lz = z + pz * halfWidth;
    const rx = x - px * halfWidth, rz = z - pz * halfWidth;
    // Each side samples its own terrain height so the road lies flat ON the ground.
    verts.push(lx, sampler.heightAt(lx, lz) + LIFT, lz, rx, sampler.heightAt(rx, rz) + LIFT, rz);
  }
  for (let i = 0; i < samples.length - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    indices.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
