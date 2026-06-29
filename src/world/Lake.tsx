import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { lakeFor } from "@/config/world";
import type { GroundSampler } from "./ground";

/**
 * A large still lake (PRD water feature): a low-poly disc at the water level over the carved basin,
 * with the same gentle bob as the river so the two read as one body of water.
 */
export function Lake({ sampler }: { sampler: GroundSampler }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { size, waterLevel } = sampler.config;
  const lake = useMemo(() => lakeFor(size), [size]);

  useFrame((state) => {
    if (meshRef.current) meshRef.current.position.y = waterLevel + Math.sin(state.clock.elapsedTime * 0.8) * 0.08;
  });

  return (
    <mesh ref={meshRef} position={[lake.x, waterLevel, lake.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[lake.r * 0.98, 48]} />
      <meshStandardMaterial color="#2c7fbf" transparent opacity={0.92} roughness={0.12} metalness={0.25} side={THREE.DoubleSide} />
    </mesh>
  );
}
