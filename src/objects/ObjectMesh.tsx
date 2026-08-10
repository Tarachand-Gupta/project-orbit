import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { ObjectSpec, PartSpec } from "./spec";
import { geometryFor } from "./geometry";
import { resolveMaterial } from "./materials";

/**
 * Renders the visual mesh of an object spec by composing low-poly primitives. Parts may declare a
 * `spin` (rotors, wheels, fans), optionally driven live by a config control — so e.g. a
 * helicopter's "Rotor speed" slider actually spins the rotor.
 */
function PartMesh({ part, burning, spinMul }: { part: PartSpec; burning?: boolean; spinMul: number }) {
  const { geometry, args } = geometryFor(part);
  const mat = resolveMaterial(part.material);
  const spinRef = useRef<THREE.Group>(null);

  const color = useMemo(() => new THREE.Color(mat.color), [mat.color]);
  const emissive = useMemo(
    () => new THREE.Color(burning ? "#ff5a00" : mat.emissive ?? "#000000"),
    [mat.emissive, burning],
  );

  useFrame((_, delta) => {
    if (!part.spin || !spinRef.current) return;
    const dt = Math.min(delta, 0.05);
    spinRef.current.rotation[part.spin.axis] += part.spin.speed * spinMul * dt;
  });

  const GeometryTag = geometry as keyof JSX.IntrinsicElements;
  const meshEl = (
    <mesh
      position={part.spin ? [0, 0, 0] : part.position ?? [0, 0, 0]}
      rotation={part.rotation ?? [0, 0, 0]}
      castShadow
      receiveShadow
    >
      {/* @ts-expect-error dynamic three geometry tag */}
      <GeometryTag args={args} />
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={burning ? 1.6 : mat.emissiveIntensity ?? 0}
        metalness={mat.metalness ?? 0}
        roughness={mat.roughness ?? 0.6}
        flatShading
      />
    </mesh>
  );

  // Spinning parts live in a group at the part's position; the group rotates about the spin axis.
  return part.spin ? (
    <group ref={spinRef} position={part.position ?? [0, 0, 0]}>
      {meshEl}
    </group>
  ) : (
    meshEl
  );
}

export function ObjectMesh({ spec, burning, scale = 1 }: { spec: ObjectSpec; burning?: boolean; scale?: number }) {
  return (
    <group scale={scale}>
      {spec.parts.map((part, i) => {
        const spinMul = part.spin?.config ? Number(spec.config[part.spin.config]?.value ?? 1) || 0 : 1;
        return <PartMesh key={i} part={part} burning={burning} spinMul={spinMul} />;
      })}
    </group>
  );
}
