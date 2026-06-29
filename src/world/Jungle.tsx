import { useMemo } from "react";
import * as THREE from "three";
import { RigidBody, CylinderCollider, BallCollider } from "@react-three/rapier";
import { mulberry32 } from "./ground";
import type { GroundSampler } from "./ground";

/**
 * Instanced low-poly jungle + rocks (PRD: "jungle"). Trees are tiered pines (trunk + two/three
 * stacked foliage cones) with per-instance size & color variation; scattered boulders add detail.
 * Everything is instanced so it stays cheap (Tech Doc §10). When `solid`, tree trunks and rocks
 * get static colliders (a compound fixed body) so you can't walk through them.
 */
export function Jungle({ sampler, count = 360, solid = true }: { sampler: GroundSampler; count?: number; solid?: boolean }) {
  const data = useMemo(() => buildScatter(sampler, count), [sampler, count]);

  return (
    <group>
      <Instances matrices={data.trunks} geom={<cylinderGeometry args={[0.18, 0.32, 3, 6]} />} color="#5b4127" />
      <Instances matrices={data.tier1} colors={data.tier1Colors} geom={<coneGeometry args={[1.7, 2.6, 7]} />} />
      <Instances matrices={data.tier2} colors={data.tier2Colors} geom={<coneGeometry args={[1.25, 2.2, 7]} />} />
      <Instances matrices={data.tier3} colors={data.tier3Colors} geom={<coneGeometry args={[0.8, 1.8, 7]} />} />
      <Instances matrices={data.rocks} colors={data.rockColors} geom={<dodecahedronGeometry args={[1, 0]} />} flat />

      {solid && (
        <RigidBody type="fixed" colliders={false} friction={0.9}>
          {data.trunkCols.map((c, i) => (
            <CylinderCollider key={`t${i}`} args={[c.h, c.r]} position={[c.x, c.y, c.z]} />
          ))}
          {data.rockCols.map((c, i) => (
            <BallCollider key={`r${i}`} args={[c.r]} position={[c.x, c.y, c.z]} />
          ))}
        </RigidBody>
      )}
    </group>
  );
}

function Instances({
  matrices,
  colors,
  geom,
  color,
  flat,
}: {
  matrices: THREE.Matrix4[];
  colors?: THREE.Color[];
  geom: React.ReactElement;
  color?: string;
  flat?: boolean;
}) {
  const ref = (mesh: THREE.InstancedMesh | null) => {
    if (!mesh) return;
    for (let i = 0; i < matrices.length; i++) {
      mesh.setMatrixAt(i, matrices[i]);
      if (colors) mesh.setColorAt(i, colors[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  };
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, matrices.length)]} castShadow receiveShadow>
      {geom}
      <meshStandardMaterial color={color ?? "#ffffff"} roughness={1} flatShading={flat} />
    </instancedMesh>
  );
}

function buildScatter(sampler: GroundSampler, count: number) {
  const rng = mulberry32(sampler.config.seed * 31 + 5);
  const size = sampler.config.size;
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const m = () => new THREE.Matrix4();

  const trunks: THREE.Matrix4[] = [];
  const tier1: THREE.Matrix4[] = [], tier2: THREE.Matrix4[] = [], tier3: THREE.Matrix4[] = [];
  const tier1Colors: THREE.Color[] = [], tier2Colors: THREE.Color[] = [], tier3Colors: THREE.Color[] = [];
  const rocks: THREE.Matrix4[] = [], rockColors: THREE.Color[] = [];
  const trunkCols: Array<{ x: number; y: number; z: number; h: number; r: number }> = [];
  const rockCols: Array<{ x: number; y: number; z: number; r: number }> = [];

  const greens = ["#3f7d34", "#356b2c", "#48894a", "#2f5f2c", "#4f8f3e"];
  const greys = ["#8a8d90", "#9aa0a3", "#76797c", "#a7aaad"];

  let placed = 0, tries = 0;
  while (placed < count && tries < count * 8) {
    tries++;
    const x = (rng() * 2 - 1) * (size - 6);
    const z = (rng() * 2 - 1) * (size - 6);
    if (Math.hypot(x, z) < sampler.config.flatRadius + 4) continue;
    if (sampler.isRiver(x, z)) continue;
    const y = sampler.heightAt(x, z);
    if (y > sampler.config.hillAmplitude * 0.82) continue;
    const sc = 0.7 + rng() * 1.0;
    q.setFromAxisAngle(up, rng() * Math.PI * 2);
    s.set(sc, sc, sc);
    const tierGreen = (arr: THREE.Color[]) => arr.push(new THREE.Color(greens[(rng() * greens.length) | 0]));

    trunks.push(m().compose(pos.set(x, y + 1.4 * sc, z), q, s));
    trunkCols.push({ x, y: y + 1.5 * sc, z, h: 1.5 * sc, r: 0.34 * sc });
    tier1.push(m().compose(pos.set(x, y + 3.2 * sc, z), q, s)); tierGreen(tier1Colors);
    tier2.push(m().compose(pos.set(x, y + 4.4 * sc, z), q, s)); tierGreen(tier2Colors);
    if (rng() > 0.4) { tier3.push(m().compose(pos.set(x, y + 5.4 * sc, z), q, s)); tierGreen(tier3Colors); }
    placed++;
  }

  // Boulders scattered on land.
  for (let i = 0; i < Math.floor(count * 0.5); i++) {
    const x = (rng() * 2 - 1) * (size - 6);
    const z = (rng() * 2 - 1) * (size - 6);
    if (sampler.isRiver(x, z)) continue;
    const y = sampler.heightAt(x, z);
    const sc = 0.3 + rng() * 1.1;
    q.setFromEuler(new THREE.Euler(rng() * 0.6, rng() * Math.PI * 2, rng() * 0.6));
    rocks.push(m().compose(pos.set(x, y + sc * 0.5, z), q, s.set(sc, sc * (0.6 + rng() * 0.5), sc)));
    rockColors.push(new THREE.Color(greys[(rng() * greys.length) | 0] || "#8a8d90"));
    rockCols.push({ x, y: y + sc * 0.45, z, r: sc * 0.72 });
  }

  return { trunks, tier1, tier2, tier3, tier1Colors, tier2Colors, tier3Colors, rocks, rockColors, trunkCols, rockCols };
}
