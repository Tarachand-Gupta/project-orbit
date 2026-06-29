import { useMemo } from "react";
import { RigidBody } from "@react-three/rapier";
import { mulberry32 } from "./ground";
import type { GroundSampler } from "./ground";

/**
 * A small settlement of pixel-styled buildings (PRD: "buildings") ringing the spawn area. Each
 * is a solid fixed body (cuboid collider) so the player and vehicles collide with the walls.
 */
export function Buildings({ sampler }: { sampler: GroundSampler }) {
  const houses = useMemo(() => {
    const rng = mulberry32(sampler.config.seed * 17 + 3);
    const ring = sampler.config.flatRadius - 6;
    const list: Array<{ x: number; z: number; w: number; d: number; h: number; rot: number; color: string }> = [];
    const palette = ["#b8704a", "#9a8b6b", "#c2a878", "#8a6f52", "#a85c43"];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.3;
      const r = ring * (0.7 + rng() * 0.3);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      list.push({
        x,
        z,
        w: 4 + rng() * 3,
        d: 4 + rng() * 3,
        h: 3 + rng() * 2.5,
        rot: a + Math.PI,
        color: palette[i % palette.length],
      });
    }
    return list;
  }, [sampler]);

  return (
    <group>
      {houses.map((h, i) => {
        const y = sampler.heightAt(h.x, h.z);
        const roofR = Math.max(h.w, h.d) * 0.8;
        return (
          <RigidBody key={i} type="fixed" colliders="cuboid" position={[h.x, y, h.z]} rotation={[0, h.rot, 0]}>
            {/* stone foundation */}
            <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
              <boxGeometry args={[h.w + 0.3, 0.4, h.d + 0.3]} />
              <meshStandardMaterial color="#7d7a73" roughness={1} flatShading />
            </mesh>
            {/* walls */}
            <mesh position={[0, h.h / 2 + 0.3, 0]} castShadow receiveShadow>
              <boxGeometry args={[h.w, h.h, h.d]} />
              <meshStandardMaterial color={h.color} roughness={1} flatShading />
            </mesh>
            {/* timber trim under the eaves */}
            <mesh position={[0, h.h + 0.35, 0]} castShadow>
              <boxGeometry args={[h.w + 0.15, 0.18, h.d + 0.15]} />
              <meshStandardMaterial color="#4a3526" roughness={1} flatShading />
            </mesh>
            {/* hip roof */}
            <mesh position={[0, h.h + 1.3, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
              <coneGeometry args={[roofR, 2, 4]} />
              <meshStandardMaterial color="#5a3a28" roughness={1} flatShading />
            </mesh>
            {/* chimney */}
            <mesh position={[h.w * 0.28, h.h + 1.4, h.d * 0.18]} castShadow>
              <boxGeometry args={[0.5, 1.6, 0.5]} />
              <meshStandardMaterial color="#6b4a3a" roughness={1} flatShading />
            </mesh>
            {/* door */}
            <mesh position={[0, 1.2, h.d / 2 + 0.02]}>
              <boxGeometry args={[1, 1.8, 0.12]} />
              <meshStandardMaterial color="#3a2a1c" roughness={1} flatShading />
            </mesh>
            {/* windows (front + sides) with warm glow */}
            {[[-h.w * 0.3, 0, h.d / 2 + 0.02, 0], [h.w * 0.3, 0, h.d / 2 + 0.02, 0],
              [h.w / 2 + 0.02, 0, 0, Math.PI / 2], [-h.w / 2 - 0.02, 0, 0, Math.PI / 2]].map((wn, k) => (
              <mesh key={k} position={[wn[0], h.h * 0.62, wn[2]]} rotation={[0, wn[3], 0]}>
                <boxGeometry args={[0.7, 0.7, 0.08]} />
                <meshStandardMaterial color="#cfe8ff" emissive="#ffd98a" emissiveIntensity={0.25} roughness={0.5} />
              </mesh>
            ))}
          </RigidBody>
        );
      })}
    </group>
  );
}
