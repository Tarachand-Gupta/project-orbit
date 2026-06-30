import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { stepTracers } from "./weaponFx";

const POOL = 16;
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _dir = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

/**
 * Renders weapon tracers from a reusable pool of thin glowing cylinders, stretched muzzle→impact and
 * faded over their short life. Driven imperatively from the module ring buffer (no re-renders).
 */
export function WeaponTracers() {
  const group = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const tracers = stepTracers(Math.min(delta, 0.05));
    for (let i = 0; i < POOL; i++) {
      const mesh = g.children[i] as THREE.Mesh;
      const t = tracers[i];
      if (!t) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      _from.set(t.from[0], t.from[1], t.from[2]);
      _to.set(t.to[0], t.to[1], t.to[2]);
      const len = _from.distanceTo(_to) || 0.001;
      _mid.addVectors(_from, _to).multiplyScalar(0.5);
      _dir.subVectors(_to, _from).normalize();
      mesh.position.copy(_mid);
      mesh.quaternion.setFromUnitVectors(Y, _dir); // cylinder's axis is Y
      mesh.scale.set(1, len, 1);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, t.ttl / t.max);
    }
  });

  return (
    <group ref={group}>
      {Array.from({ length: POOL }, (_, i) => (
        <mesh key={i} visible={false}>
          <cylinderGeometry args={[0.05, 0.05, 1, 5]} />
          <meshBasicMaterial color="#ffd267" transparent opacity={0} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
