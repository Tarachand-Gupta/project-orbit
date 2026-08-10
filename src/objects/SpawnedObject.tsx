import { useEffect, useRef } from "react";
import { RigidBody, type RapierRigidBody, type RigidBodyTypeString } from "@react-three/rapier";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SpawnedObject as SpawnedObjectData } from "@/state/store";
import { useGameStore } from "@/state/store";
import { usePlayerStore } from "@/state/playerStore";
import { interactionFor } from "./spec";
import { ObjectMesh } from "./ObjectMesh";
import { ObjectErrorBoundary } from "./ObjectErrorBoundary";
import { registerBody, unregisterBody } from "./bodyRegistry";
import { conformToTerrain } from "@/world/conform";
import { VehicleBody } from "./VehicleBody";
import { supportsRaycastPhysics } from "@/vehicles/raycastVehicle";
import { resolveBodyTuning } from "./tuning";
import type { GroundSampler } from "@/world/ground";

interface Props {
  data: SpawnedObjectData;
  sampler: GroundSampler;
}

/**
 * Dispatcher: a drivable ground vehicle (not a boat) uses the real raycast-vehicle physics when
 * that setting is on; everything else uses the standard kinematic/dynamic body below.
 */
export function SpawnedObject({ data, sampler }: Props) {
  const realistic = useGameStore((s) => s.realisticVehicles);
  const interaction = interactionFor(data.spec);
  const t = data.spec.type.toLowerCase();
  const isBoat = t.includes("boat") || t.includes("ship");
  if (realistic && interaction.mode === "drive" && !isBoat && supportsRaycastPhysics(data.spec)) {
    return <VehicleBody data={data} />;
  }
  return <StandardObject data={data} sampler={sampler} />;
}

interface BodyUserData {
  objectId: string;
  fire?: boolean;
  flammable?: boolean;
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/**
 * A spawned object: Rapier rigid body + visual mesh in a per-object error boundary.
 *
 * VEHICLES (anything interactable — drive/fly/ride) are **kinematic** and every frame are clamped
 * to sit flat ON the terrain, upright (conformed to the slope) — so they can NEVER float, tilt,
 * or spawn upside down. The driving controller takes over while you're riding one. Everything
 * else is a normal dynamic body that falls and settles under gravity.
 */
function StandardObject({ data, sampler }: Props) {
  const { spec, position, quaternion } = data;
  const bodyRef = useRef<RapierRigidBody>(null);
  const selectObject = useGameStore((s) => s.selectObject);
  const setBurning = useGameStore((s) => s.setBurning);
  const removeObject = useGameStore((s) => s.removeObject);
  const selectedId = useGameStore((s) => s.selectedId);

  const isFixed = spec.physics.fixed === true;
  const isVehicle = interactionFor(spec).mode !== "none";
  // Live body tuning: a `scale` slider scales the mesh, a `mass` slider sets weight, a
  // `bounciness` slider makes it actually bounce (otherwise restitution stays low to avoid jitter).
  const bodyTune = resolveBodyTuning(spec);
  const mass = Math.max(0.5, bodyTune.mass ?? spec.physics.mass);
  const restitution =
    bodyTune.restitution != null ? bodyTune.restitution : Math.min(spec.physics.restitution ?? 0.1, 0.1);
  const scale = bodyTune.scale;
  const bodyType: RigidBodyTypeString = isVehicle ? "kinematicPosition" : isFixed ? "fixed" : "dynamic";

  useEffect(() => {
    if (bodyRef.current) registerBody(spec.id, bodyRef.current);
    return () => unregisterBody(spec.id);
  }, [spec.id]);

  // Parked vehicles: glue them to the terrain surface, upright, until the player drives them.
  useFrame(() => {
    if (!isVehicle) return;
    const body = bodyRef.current;
    if (!body) return;
    if (usePlayerStore.getState().drivingId === spec.id) return; // being driven — Player controls it
    const t = body.translation();
    const r = body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    const yaw = _e.setFromQuaternion(_q, "YXZ").y;
    const c = conformToTerrain(sampler, t.x, t.z, yaw, 0.05);
    body.setNextKinematicTranslation({ x: t.x, y: c.y, z: t.z });
    body.setNextKinematicRotation({ x: c.qx, y: c.qy, z: c.qz, w: c.qw });
  });

  const userData: BodyUserData = { objectId: spec.id, fire: spec.physics.fire, flammable: spec.physics.flammable };
  const selected = selectedId === spec.id;

  return (
    <ObjectErrorBoundary objectId={spec.id} prompt={spec.prompt} onError={removeObject}>
      <RigidBody
        ref={bodyRef}
        type={bodyType}
        colliders="hull"
        position={position}
        quaternion={new THREE.Quaternion(quaternion[0], quaternion[1], quaternion[2], quaternion[3])}
        mass={mass}
        friction={Math.max(spec.physics.friction, 0.6)}
        restitution={restitution}
        linearDamping={isFixed || isVehicle ? 0 : 0.5}
        angularDamping={isFixed || isVehicle ? 0 : 0.9}
        ccd={!isFixed && !isVehicle}
        userData={userData}
        canSleep={!isFixed && !isVehicle}
        onCollisionEnter={({ other }) => {
          const od = other.rigidBody?.userData as BodyUserData | undefined;
          if (od?.fire && spec.physics.flammable) setBurning(spec.id, true);
          if (userData.fire && od?.flammable && od.objectId) setBurning(od.objectId, true);
        }}
      >
        <group
          onClick={(e) => {
            e.stopPropagation();
            selectObject(spec.id);
          }}
        >
          <ObjectMesh spec={spec} burning={data.burning} scale={scale} />
          {selected && <SelectionHalo />}
        </group>
      </RigidBody>
    </ObjectErrorBoundary>
  );
}

/** Glowing ring under a selected object. */
function SelectionHalo() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
      <ringGeometry args={[1.6, 2.0, 24]} />
      <meshBasicMaterial color="#7dd3fc" transparent opacity={0.7} side={THREE.DoubleSide} />
    </mesh>
  );
}
