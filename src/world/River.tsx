import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { riverCenterZ } from "./ground";
import type { GroundSampler } from "./ground";

/**
 * A winding low-poly river (PRD: "a river"). A ribbon mesh follows the meandering centerline at
 * the water level, with gentle animated waves. It's visual + a calm surface; the carved channel
 * in the terrain is what actually holds it.
 */
export function River({ sampler }: { sampler: GroundSampler }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { size, riverWidth, waterLevel } = sampler.config;

  const { geometry, base } = useMemo(() => {
    const segs = 120;
    const verts: number[] = [];
    const indices: number[] = [];
    // Half-width where the carved bed meets the water surface (so water fills the channel, not the banks).
    const w = riverWidth * 0.64;
    for (let i = 0; i <= segs; i++) {
      const x = -size + (i / segs) * size * 2;
      const cz = riverCenterZ(x, size);
      verts.push(x, waterLevel, cz - w, x, waterLevel, cz + w);
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      indices.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const baseArr = new Float32Array(geo.attributes.position.array as Float32Array);
    return { geometry: geo, base: baseArr };
  }, [size, riverWidth, waterLevel]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const bx = base[i * 3];
      const bz = base[i * 3 + 2];
      pos.setY(i, base[i * 3 + 1] + Math.sin(t * 1.2 + bx * 0.3 + bz * 0.2) * 0.18);
    }
    pos.needsUpdate = true;
  });

  return (
    <mesh ref={meshRef} geometry={geometry} receiveShadow>
      <meshStandardMaterial
        color="#2f86c4"
        transparent
        opacity={0.9}
        roughness={0.15}
        metalness={0.2}
        flatShading
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
