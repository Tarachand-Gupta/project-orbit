import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RigidBody, CuboidCollider, useRapier, useBeforePhysicsStep, type RapierRigidBody } from "@react-three/rapier";
import type { DynamicRayCastVehicleController } from "@dimforge/rapier3d-compat";
import type { SpawnedObject as SpawnedObjectData } from "@/state/store";
import { useGameStore } from "@/state/store";
import { usePlayerStore } from "@/state/playerStore";
import { ObjectMesh } from "./ObjectMesh";
import { ObjectErrorBoundary } from "./ObjectErrorBoundary";
import { registerBody, unregisterBody } from "./bodyRegistry";
import { peekInput } from "@/player/input";
import { deriveVehicleSetup, VEHICLE_TUNING } from "@/vehicles/raycastVehicle";
import { resolveDriveTuning } from "@/objects/tuning";

interface Props {
  data: SpawnedObjectData;
}

/**
 * A ground vehicle with REAL physics: a dynamic chassis driven by Rapier's
 * DynamicRayCastVehicleController (raycast wheels → suspension, momentum, real collisions, and it
 * goes airborne off ramps/cliffs naturally). The Player handles enter/exit, camera and the rider;
 * this component owns the chassis physics and reads throttle/steer when it's the one being driven.
 */
export function VehicleBody({ data }: Props) {
  const { spec, position, quaternion } = data;
  const bodyRef = useRef<RapierRigidBody>(null);
  const controllerRef = useRef<DynamicRayCastVehicleController | null>(null);
  const { world } = useRapier();

  const selectObject = useGameStore((s) => s.selectObject);
  const removeObject = useGameStore((s) => s.removeObject);
  const selectedId = useGameStore((s) => s.selectedId);
  const selected = selectedId === spec.id;

  const setup = useRef(deriveVehicleSetup(spec)).current;
  const mass = Math.min(60, Math.max(12, spec.physics.mass * 4));

  // Build the vehicle controller once the chassis body exists.
  useEffect(() => {
    const chassis = bodyRef.current;
    if (!chassis) return;
    registerBody(spec.id, chassis);

    const ctrl = world.createVehicleController(chassis);
    ctrl.indexUpAxis = 1; // Y is up
    ctrl.setIndexForwardAxis = 2; // +Z is forward (objects are modeled facing +Z; setter is oddly named)
    for (const w of setup.wheels) {
      ctrl.addWheel(
        { x: w.connection[0], y: w.connection[1], z: w.connection[2] },
        { x: 0, y: -1, z: 0 }, // suspension points down
        { x: -1, y: 0, z: 0 }, // axle along X (wheels roll in Z = forward)
        setup.suspensionRestLength,
        w.radius,
      );
    }
    // Stiffness ∝ per-wheel load so every vehicle settles at a consistent ride height; kept high so
    // the suspension barely compresses (minimal, predictable sink).
    const stiffness = Math.max(28, Math.min(110, (5 * mass) / setup.wheels.length));
    for (let i = 0; i < setup.wheels.length; i++) {
      ctrl.setWheelSuspensionStiffness(i, stiffness);
      ctrl.setWheelSuspensionCompression(i, VEHICLE_TUNING.suspensionCompression);
      ctrl.setWheelSuspensionRelaxation(i, VEHICLE_TUNING.suspensionRelaxation);
      ctrl.setWheelMaxSuspensionTravel(i, VEHICLE_TUNING.maxSuspensionTravel);
      ctrl.setWheelFrictionSlip(i, VEHICLE_TUNING.frictionSlip);
      // Enough force to hold the chassis up on its wheels, but not so rigid the wheels lose grip.
      ctrl.setWheelMaxSuspensionForce(i, mass * 30);
    }
    controllerRef.current = ctrl;

    return () => {
      controllerRef.current = null;
      try {
        world.removeVehicleController(ctrl);
      } catch {
        /* already gone */
      }
      unregisterBody(spec.id);
    };
  }, [spec.id, world, setup]);

  // Apply driving + step the vehicle every physics tick.
  useBeforePhysicsStep((w) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    const driving = usePlayerStore.getState().drivingId === spec.id;
    const input = driving ? peekInput() : null;

    // Live handling from the controls panel: Top speed / Acceleration / Handling sliders feed
    // the real raycast engine force, speed cap and steering so the panel actually drives the car.
    const tune = resolveDriveTuning(useGameStore.getState().objects[spec.id]?.spec ?? spec);
    const throttle = input ? (input.forward ? 1 : 0) - (input.back ? 1 : 0) : 0;
    const steer = input ? (input.left ? 1 : 0) - (input.right ? 1 : 0) : 0;
    const speed = ctrl.currentVehicleSpeed();
    const overTop = Math.abs(speed) > tune.topSpeed;
    // Scale engine force modestly with the requested acceleration (clamped so it can't launch).
    const accelFactor = Math.max(0.5, Math.min(1.3, tune.accel / 26));
    const engineForce = VEHICLE_TUNING.engineForce * accelFactor;
    const engine = overTop ? 0 : throttle * engineForce * mass;
    const brake = !input || throttle === 0 ? VEHICLE_TUNING.brakeForce : 0;
    const maxSteer = VEHICLE_TUNING.maxSteer * (tune.turnRate / 2.0);

    for (let i = 0; i < setup.wheels.length; i++) {
      const wheel = setup.wheels[i];
      ctrl.setWheelEngineForce(i, wheel.steered ? 0 : engine);
      ctrl.setWheelSteering(i, wheel.steered ? steer * maxSteer : 0);
      ctrl.setWheelBrake(i, brake);
    }
    ctrl.updateVehicle(w.timestep);
  });

  return (
    <ObjectErrorBoundary objectId={spec.id} prompt={spec.prompt} onError={removeObject}>
      <RigidBody
        ref={bodyRef}
        type="dynamic"
        colliders={false}
        position={position}
        quaternion={new THREE.Quaternion(quaternion[0], quaternion[1], quaternion[2], quaternion[3])}
        mass={mass}
        friction={0.7}
        linearDamping={0.1}
        angularDamping={0.6}
        // Lock ROLL (lean) so vehicles can't tip/flip — bikes stay upright, cars never land upside
        // down — while still allowing pitch (ramps/jumps) and yaw (steering).
        enabledRotations={[true, true, false]}
        ccd
        canSleep={false}
        userData={{ objectId: spec.id, flammable: spec.physics.flammable }}
      >
        <CuboidCollider args={setup.chassisHalf} position={setup.chassisCenter} />
        <group
          onClick={(e) => {
            e.stopPropagation();
            selectObject(spec.id);
          }}
        >
          <ObjectMesh spec={spec} burning={data.burning} />
          {selected && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
              <ringGeometry args={[1.6, 2.0, 24]} />
              <meshBasicMaterial color="#7dd3fc" transparent opacity={0.7} side={THREE.DoubleSide} />
            </mesh>
          )}
        </group>
      </RigidBody>
    </ObjectErrorBoundary>
  );
}
