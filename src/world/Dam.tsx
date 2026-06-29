import { useMemo } from "react";
import { RigidBody } from "@react-three/rapier";
import { riverCenterZ } from "./ground";
import { damXFor } from "@/config/world";
import type { GroundSampler } from "./ground";

/**
 * A concrete dam spanning the river valley (PRD water feature). A solid fixed wall with a roadway
 * deck on top, buttresses and two spillway openings — you can drive across the top. Placed on the
 * river centreline so it reads as holding the river back.
 */
export function Dam({ sampler }: { sampler: GroundSampler }) {
  const { size, riverWidth, waterLevel } = sampler.config;
  const x = useMemo(() => damXFor(size), [size]);
  const cz = riverCenterZ(x, size);

  const span = riverWidth * 2.6 * 2 + 8; // covers the whole valley + a margin into the banks
  const height = waterLevel + 9; // rises well above the water
  const baseY = waterLevel - 3.5; // foot sunk into the channel bed
  const wallH = height - baseY;
  const thickness = 5;

  return (
    <RigidBody type="fixed" colliders="cuboid" position={[x, 0, cz]}>
      {/* main wall (battered: wider at the base via a second block) */}
      <mesh position={[0, baseY + wallH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[span, wallH, thickness]} />
        <meshStandardMaterial color="#b9b6ad" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, baseY + wallH * 0.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[span, wallH * 0.5, thickness + 3]} />
        <meshStandardMaterial color="#a7a49b" roughness={1} flatShading />
      </mesh>
      {/* roadway deck along the top (drive across) */}
      <mesh position={[0, height + 0.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[span, 0.5, thickness + 1.5]} />
        <meshStandardMaterial color="#6f6c66" roughness={1} flatShading />
      </mesh>
      {/* parapet rails */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, height + 0.9, s * (thickness / 2 + 0.4)]} castShadow>
          <boxGeometry args={[span, 0.8, 0.4]} />
          <meshStandardMaterial color="#cfccc4" roughness={1} flatShading />
        </mesh>
      ))}
      {/* two spillway notches (visual) */}
      {[-span * 0.22, span * 0.22].map((sx, i) => (
        <mesh key={i} position={[sx, height - 1.4, 0]}>
          <boxGeometry args={[span * 0.12, 3, thickness + 4]} />
          <meshStandardMaterial color="#3f6f96" roughness={0.3} metalness={0.2} />
        </mesh>
      ))}
    </RigidBody>
  );
}
