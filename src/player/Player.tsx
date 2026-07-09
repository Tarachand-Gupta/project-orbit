import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { RigidBody, CapsuleCollider, useRapier, type RapierRigidBody } from "@react-three/rapier";
import { Avatar } from "./Avatar";
import { pollInput } from "./input";
import { inputToMove, cameraOffset, forwardFromYaw, headingFromDir } from "./locomotion";
import { usePlayerStore } from "@/state/playerStore";
import { useGameStore } from "@/state/store";
import { getBody } from "@/objects/bodyRegistry";
import { interactionFor, type ObjectSpec } from "@/objects/spec";
import { specBoundingRadius, specBounds } from "@/objects/geometry";
import { resolveDriveTuning, resolveFlyTuning } from "@/objects/tuning";
import { resolveWeaponTuning, shotImpulse } from "@/objects/weapon";
import { emitTracer } from "@/objects/weaponFx";
import { ObjectMesh } from "@/objects/ObjectMesh";
import { setFireOnClick } from "./input";
import { vehicleVerticalStep } from "./vehicleAir";
import { slideMove } from "./vehicleCollide";
import { supportsRaycastPhysics } from "@/vehicles/raycastVehicle";
import type { GroundSampler } from "@/world/ground";

const WALK_SPEED = 7;
const RUN_SPEED = 11;
const JUMP_SPEED = 9;
const CAPSULE_HALF = 0.6;
const CAPSULE_RADIUS = 0.42;
const FOOT_OFFSET = CAPSULE_HALF + CAPSULE_RADIUS;
const INTERACT_RANGE = 6;

const CAM_DISTANCE = 9;
const CAM_HEIGHT = 4.5;
const DRIVE_CAM_DISTANCE = 13;
const DRIVE_CAM_HEIGHT = 6.5;
const FLY_CAM_DISTANCE = 18;
const FLY_CAM_HEIGHT = 8;
const VEHICLE_DECEL = 13; // coast-down when the throttle is released (inertia)
const GROUND_CLEARANCE = 0.12;

// Rapier RigidBodyType numeric constants.
const BODY_KINEMATIC_POSITION = 2;
const BODY_KINEMATIC_VELOCITY = 3;

const v = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const q = new THREE.Quaternion();
// Temps for terrain-conforming vehicle orientation.
const upVec = new THREE.Vector3();
const fwdVec = new THREE.Vector3();
const rightVec = new THREE.Vector3();
const basisFwd = new THREE.Vector3();
const basisMat = new THREE.Matrix4();
const seatQuat = new THREE.Quaternion();
const riderYawQuat = new THREE.Quaternion();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const _euler = new THREE.Euler();
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** True when this object is a drivable ground vehicle using the real raycast-vehicle physics. */
function isRealisticGround(spec: ObjectSpec): boolean {
  if (!useGameStore.getState().realisticVehicles) return false;
  if (interactionFor(spec).mode !== "drive") return false;
  const t = spec.type.toLowerCase();
  if (t.includes("boat") || t.includes("ship")) return false;
  return supportsRaycastPhysics(spec);
}

/**
 * Third-person player controller. On foot, a locked capsule walks the terrain under gravity.
 * Pressing E near an interactable enters it (drive cars/bikes, fly planes). Driven vehicles are
 * driven as a **kinematic body that follows the terrain height**, so they glide smoothly over
 * hills/roads and never get stuck on collider edges. The rider avatar is shown seated on it.
 */
export function Player({ sampler }: { sampler: GroundSampler }) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const riderRef = useRef<THREE.Group>(null);
  const heldGunRef = useRef<THREE.Group>(null);
  const fireCooldownRef = useRef(0);
  const { camera, gl } = useThree();
  const { world, rapier } = useRapier();
  const probeRef = useRef<InstanceType<typeof rapier.Ball> | null>(null);
  const worldLimit = sampler.config.size - 3;

  // The weapon the player is holding (subscribed so the held mesh appears/disappears on equip).
  const equippedId = usePlayerStore((s) => s.equippedWeaponId);
  const equippedSpec = useGameStore((s) => (equippedId ? s.objects[equippedId]?.spec ?? null : null));
  useEffect(() => setFireOnClick(!!equippedId), [equippedId]);

  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const craftYawRef = useRef(0);
  const speedRef = useRef(0);
  const airborne = useRef(false); // vehicle is in the air (off a cliff/ramp)
  const vyRef = useRef(0); // vehicle vertical velocity while airborne
  const prevYRef = useRef(0); // previous vehicle Y (to measure ramp climb rate)
  const wasControlling = useRef<string | null>(null);
  const headingRef = useRef(0);
  const snapCam = useRef(false);
  // False until a real collider (terrain/road) is confirmed under the player. Until then the
  // capsule is held on the analytic surface with gravity off, so it can NEVER fall into the
  // still-building terrain trimesh and wedge inside it (WebKit's slower boot hit this).
  const groundReady = useRef(false);

  const spawnY = sampler.heightAt(0, 0) + FOOT_OFFSET + 0.5;

  useEffect(() => {
    const canvas = gl.domElement;
    const onClick = () => {
      if (!usePlayerStore.getState().drivingId) canvas.requestPointerLock?.();
    };
    canvas.addEventListener("click", onClick);
    return () => canvas.removeEventListener("click", onClick);
  }, [gl]);

  useFrame((_, deltaRaw) => {
    const body = bodyRef.current;
    if (!body) return;
    const dt = Math.min(deltaRaw, 0.05);
    const input = pollInput();
    const store = usePlayerStore.getState();
    const controllingId = store.drivingId;

    yawRef.current -= input.mouseDX * 0.0025;
    // Camera pitch (look up/down) with limits: ~22° down to ~30° up. (Non-inverted.)
    pitchRef.current = clamp(pitchRef.current + input.mouseDY * 0.002, -0.38, 0.52);
    store.setCameraYaw(yawRef.current);

    // ---- enter / exit transitions ----
    if (controllingId && wasControlling.current !== controllingId) {
      body.setEnabled(false);
      const craft = getBody(controllingId);
      const obj = useGameStore.getState().objects[controllingId];
      if (craft && obj) {
        const r = craft.rotation();
        q.set(r.x, r.y, r.z, r.w);
        craftYawRef.current = new THREE.Euler().setFromQuaternion(q, "YXZ").y;
        craft.setLinvel({ x: 0, y: 0, z: 0 }, true);
        craft.setAngvel({ x: 0, y: 0, z: 0 }, true);
        const mode = interactionFor(obj.spec).mode;
        // Realistic ground vehicles stay DYNAMIC (VehicleBody drives them). Others become kinematic:
        // drive/ride → kinematic position (terrain-following); fly → kinematic velocity.
        if (!isRealisticGround(obj.spec)) {
          craft.setBodyType(mode === "fly" ? BODY_KINEMATIC_VELOCITY : BODY_KINEMATIC_POSITION, true);
        }
      }
      speedRef.current = 0;
      airborne.current = false;
      vyRef.current = 0;
      prevYRef.current = craft ? craft.translation().y : 0;
      wasControlling.current = controllingId;
      store.setMoving(false);
    }
    if (!controllingId && wasControlling.current) {
      body.setEnabled(true);
      const prev = getBody(wasControlling.current);
      const prevObj = useGameStore.getState().objects[wasControlling.current];
      if (prev && !(prevObj && isRealisticGround(prevObj.spec))) {
        // Hand a kinematic vehicle back to its parked terrain-clamp so it stays glued upright.
        // (Realistic vehicles stay dynamic — they rest on their own suspension.)
        prev.setBodyType(BODY_KINEMATIC_POSITION, true);
      }
      const at = store.consumeTeleport();
      if (at) body.setTranslation({ x: at[0], y: at[1] + FOOT_OFFSET, z: at[2] }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      wasControlling.current = null;
      snapCam.current = true; // jump the camera to the player so you don't end up staring at sky
    }

    if (controllingId) {
      const obj = useGameStore.getState().objects[controllingId];
      const craft = getBody(controllingId);
      if (!obj || !craft) {
        store.exitVehicle(store.position);
        return;
      }
      const interaction = interactionFor(obj.spec);
      if (interaction.mode === "fly") {
        flyCraft(craft, obj.spec, input, dt);
      } else if (isRealisticGround(obj.spec)) {
        // VehicleBody owns the physics — just track the chassis heading and chase it.
        const cr = craft.rotation();
        q.set(cr.x, cr.y, cr.z, cr.w);
        craftYawRef.current = _euler.setFromQuaternion(q, "YXZ").y;
        cameraChase(craft.translation(), craftYawRef.current, DRIVE_CAM_DISTANCE, DRIVE_CAM_HEIGHT, 1.5);
      } else {
        const t = obj.spec.type.toLowerCase();
        const floatY = t.includes("boat") || t.includes("ship") ? sampler.config.waterLevel : null;
        driveCraft(craft, obj.spec, input, dt, floatY);
      }

      // Seat/stand the rider on the vehicle, matching its orientation (tilts with the slope).
      if (riderRef.current) {
        const ct = craft.translation();
        const cr = craft.rotation();
        seatQuat.set(cr.x, cr.y, cr.z, cr.w);
        // Sideways board stances turn the rider 90° while the board still moves forward.
        const posture = interaction.posture;
        if (posture === "stand-left" || posture === "stand-right") {
          riderYawQuat.setFromAxisAngle(Y_AXIS, posture === "stand-left" ? Math.PI / 2 : -Math.PI / 2);
          seatQuat.multiply(riderYawQuat);
        }
        const seat = interaction.seatHeight ?? 0.4;
        upVec.set(0, 1, 0).applyQuaternion(seatQuat);
        riderRef.current.visible = true;
        riderRef.current.position.set(ct.x + upVec.x * seat, ct.y + upVec.y * seat, ct.z + upVec.z * seat);
        riderRef.current.quaternion.copy(seatQuat);
      }

      if (input.interactPressed) {
        const ct = craft.translation();
        const rx = Math.cos(craftYawRef.current);
        const rz = -Math.sin(craftYawRef.current);
        const ex = clamp(ct.x + rx * 3, -worldLimit, worldLimit);
        const ez = clamp(ct.z + rz * 3, -worldLimit, worldLimit);
        store.exitVehicle([ex, sampler.heightAt(ex, ez), ez]);
      }
      return;
    }

    // ---- on foot ----
    // Apply any pending teleport (e.g. dev/test relocation) before reading position.
    const tp = store.consumeTeleport();
    if (tp) {
      const gy = sampler.heightAt(tp[0], tp[2]);
      body.setTranslation({ x: tp[0], y: gy + FOOT_OFFSET, z: tp[2] }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      snapCam.current = true;
    }
    const t = body.translation();
    const px = t.x, py = t.y, pz = t.z;
    store.setPosition([px, py - FOOT_OFFSET, pz]);

    // ---- boot/reload grounding gate ----
    // The large terrain trimesh takes several frames to build (noticeably longer on WKWebView —
    // the native macOS shell — than on Chromium). A dynamic capsule spawned before it exists falls
    // into the half-built mesh and can WEDGE inside the surface, where contact resolution can't
    // eject it (seen as the avatar buried to the waist in the native app). Hold the capsule with
    // gravity off, glued to the analytic surface, until a downward ray confirms a real collider
    // beneath — only then hand it to gravity.
    if (!groundReady.current) {
      const gy = sampler.heightAt(px, pz);
      const probe = new rapier.Ray({ x: px, y: gy + 30, z: pz }, { x: 0, y: -1, z: 0 });
      const hit = world.castRay(probe, 60, true, undefined, undefined, undefined, body);
      if (hit) {
        groundReady.current = true;
        body.setGravityScale(1, true);
      } else {
        body.setGravityScale(0, true);
        body.setTranslation({ x: px, y: gy + FOOT_OFFSET + 0.05, z: pz }, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
    }

    const [mx, mz] = inputToMove(input, yawRef.current);
    const moving = mx !== 0 || mz !== 0;
    const speed = input.run ? RUN_SPEED : WALK_SPEED;
    const cur = body.linvel();
    body.setLinvel({ x: mx * speed, y: cur.y, z: mz * speed }, true);

    const groundY = sampler.heightAt(px, pz);
    // Safety net: keep the player on the terrain surface. Two failure modes are caught here:
    //  • stranded far ABOVE the ground (e.g. exiting a high-flying craft into a bad state), and
    //  • sunk BELOW the surface (wedged inside the trimesh — e.g. spawned/reloaded into a
    //    half-built collider). −0.6 is deeper than any legitimate trimesh-vs-analytic divergence
    //    on slopes (~0.4 max at this grid resolution), so it only fires on true penetration.
    const heightAboveGround = py - FOOT_OFFSET - groundY;
    if (heightAboveGround > 40 || heightAboveGround < -0.6) {
      body.setTranslation({ x: px, y: groundY + FOOT_OFFSET + 0.05, z: pz }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      snapCam.current = true;
    }
    const grounded = py - FOOT_OFFSET - groundY < 0.35 && Math.abs(cur.y) < 4;
    if (input.jump && grounded) {
      // Shift + Space = super (3×-height) jump.
      const jump = input.run ? JUMP_SPEED * 1.75 : JUMP_SPEED;
      body.setLinvel({ x: cur.x, y: jump, z: cur.z }, true);
    }

    // Z = kick (force + lift), X = punch (forward shove) on the nearest object you're facing.
    if (input.kickPressed || input.punchPressed) {
      kickNearby(px, pz, yawRef.current, input.kickPressed);
    }

    store.setMoving(moving);
    store.setSpeed(0);
    if (moving) headingRef.current = headingFromDir(mx, mz);
    if (riderRef.current) {
      riderRef.current.visible = true;
      riderRef.current.position.set(px, py - FOOT_OFFSET, pz);
      riderRef.current.rotation.set(0, THREE.MathUtils.lerp(riderRef.current.rotation.y, headingRef.current, 0.2), 0);
    }

    const nearest = findNearestInteractable(px, pz);
    store.setNearby(nearest);
    if (input.interactPressed) {
      if (store.equippedWeaponId) {
        // Holster: drop the weapon back into the world (it reappears where it was spawned).
        useGameStore.getState().setHidden(store.equippedWeaponId, false);
        store.equipWeapon(null);
      } else if (nearest) {
        const obj = useGameStore.getState().objects[nearest];
        if (obj && interactionFor(obj.spec).mode === "wield") {
          // Pick up the weapon: hide the ground object and hold it.
          useGameStore.getState().setHidden(nearest, true);
          store.equipWeapon(nearest);
        } else {
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          store.enterVehicle(nearest);
        }
      }
    }

    // ---- weapon: aim where the camera looks; fire with F / left-click (raycast + impulse). ----
    fireCooldownRef.current = Math.max(0, fireCooldownRef.current - dt);
    if (store.equippedWeaponId) {
      const gunSpec = useGameStore.getState().objects[store.equippedWeaponId]?.spec;
      if (gunSpec) {
        positionHeldGun(px, py, pz);
        if (input.firePressed && fireCooldownRef.current <= 0) {
          const tune = resolveWeaponTuning(gunSpec);
          fireWeapon(px, py, pz);
          fireCooldownRef.current = tune.cooldown;
        }
      }
    }

    // Orbit the camera vertically by pitch (look up/down) around the player.
    const horiz = Math.cos(pitchRef.current) * CAM_DISTANCE;
    const vert = CAM_HEIGHT + Math.sin(pitchRef.current) * CAM_DISTANCE;
    const off = cameraOffset(yawRef.current, horiz, vert);
    camera.position.lerp(v.set(px + off[0], py + off[1], pz + off[2]), snapCam.current ? 1 : 0.18);
    snapCam.current = false;
    camTarget.set(px, py + 1.2, pz);
    camera.lookAt(camTarget);
  });

  /**
   * Ground vehicle: gradual acceleration/inertia, steering that scales with speed, and the body
   * is **conformed to the terrain slope** (oriented to the surface normal) so it sits ON hills
   * instead of sinking through them, and never gets stuck (kinematic terrain-follow).
   */
  function driveCraft(craft: RapierRigidBody, spec: ObjectSpec, input: ReturnType<typeof pollInput>, dt: number, floatY: number | null) {
    // Live handling from the controls panel (Top speed / Acceleration / Handling sliders).
    const tune = resolveDriveTuning(spec);
    const throttle = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);

    // Acceleration + inertia: ease the speed toward the throttle target; coast down when released.
    const targetSpeed = throttle * tune.topSpeed;
    const rate = (throttle !== 0 ? tune.accel : VEHICLE_DECEL) * dt;
    speedRef.current += clamp(targetSpeed - speedRef.current, -rate, rate);
    if (Math.abs(speedRef.current) < 0.03) speedRef.current = 0;

    // Steering scales with speed (and inverts in reverse), like a real car.
    craftYawRef.current -= steer * tune.turnRate * dt * (speedRef.current / tune.topSpeed);

    const fwd = forwardFromYaw(craftYawRef.current);
    const cur = craft.translation();
    const step = speedRef.current * dt;
    let nx = clamp(cur.x + fwd[0] * step, -worldLimit, worldLimit);
    let nz = clamp(cur.z + fwd[1] * step, -worldLimit, worldLimit);

    // Solid collision: buildings, trees, rocks and other spawned objects block the vehicle. Cheap
    // shape query against the real colliders (terrain excluded); slideMove scrapes along a wall
    // instead of stopping dead, or stops if fully boxed in.
    const r = vehicleRadius(spec);
    const slid = slideMove(cur.x, cur.z, nx, nz, (x, z) => obstacleBlocked(x, z, r, craft));
    nx = slid.x;
    nz = slid.z;
    if (slid.stopped) speedRef.current *= 0.2;

    // Boats float on the river; otherwise the surface is the terrain.
    const terrainY = sampler.heightAt(nx, nz);
    const onWater = floatY !== null && terrainY < floatY;
    const surfaceY = (onWater ? floatY : terrainY) + GROUND_CLEARANCE;

    // ---- Arcade airborne physics: launch off cliffs/ramps, arc under gravity, land (pure step). ----
    const air = vehicleVerticalStep(
      cur.y, surfaceY, prevYRef.current, speedRef.current,
      { airborne: airborne.current, vy: vyRef.current }, dt, 32, onWater,
    );
    airborne.current = air.airborne;
    vyRef.current = air.vy;
    const ny = air.y;
    const pitch = air.pitch;
    craft.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    prevYRef.current = ny;

    // Orient: conform to the slope on the ground; level + pitched into the arc while airborne.
    if (airborne.current) {
      q.setFromEuler(new THREE.Euler(pitch, craftYawRef.current, 0, "YXZ"));
    } else {
      const e = 1.3;
      if (onWater) upVec.set(0, 1, 0);
      else
        upVec.set(
          sampler.heightAt(nx - e, nz) - sampler.heightAt(nx + e, nz),
          2 * e,
          sampler.heightAt(nx, nz - e) - sampler.heightAt(nx, nz + e),
        ).normalize();
      fwdVec.set(Math.sin(craftYawRef.current), 0, Math.cos(craftYawRef.current));
      rightVec.crossVectors(upVec, fwdVec).normalize();
      basisFwd.crossVectors(rightVec, upVec).normalize();
      basisMat.makeBasis(rightVec, upVec, basisFwd);
      q.setFromRotationMatrix(basisMat);
    }
    craft.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });

    const ps = usePlayerStore.getState();
    ps.setPosition([nx, ny, nz]);
    ps.setSpeed(Math.abs(speedRef.current));
    ps.setHeading(craftYawRef.current);
    cameraChase({ x: nx, y: ny, z: nz }, craftYawRef.current, DRIVE_CAM_DISTANCE, DRIVE_CAM_HEIGHT, 1.5);
  }

  /**
   * Aircraft (GTA-style arcade flight, kinematic velocity):
   *   W/S  → forward cyclic (nose dips and the craft accelerates forward / back), with momentum
   *   A/D  → yaw turn (banks into the turn)
   *   Space→ collective up (ascend), Shift → collective down (descend)
   * A helicopter needs its rotor spun up to climb: with the Rotor-speed slider at 0 it sinks and
   * can't take off (resolveFlyTuning gates climb on the rotor). Speed/climb/turn all come live
   * from the controls panel.
   */
  function flyCraft(craft: RapierRigidBody, spec: ObjectSpec, input: ReturnType<typeof pollInput>, dt: number) {
    const tune = resolveFlyTuning(spec);
    const throttle = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const lift = (input.jump ? 1 : 0) - (input.run ? 1 : 0);

    craftYawRef.current -= steer * tune.turnRate * dt;
    const fwd = forwardFromYaw(craftYawRef.current);

    // Forward speed has momentum (eases in/out) so flight feels weighty, not on/off.
    const targetSpeed = throttle * tune.topSpeed;
    const accel = (throttle !== 0 ? tune.topSpeed * 1.1 : tune.topSpeed * 0.7) * dt;
    speedRef.current += clamp(targetSpeed - speedRef.current, -accel, accel);
    if (Math.abs(speedRef.current) < 0.02) speedRef.current = 0;

    const ct = craft.translation();
    // The land is SOLID: the craft can never go below the terrain (+clearance). Check the terrain
    // BOTH here and where we're heading this frame, so flying low into a hillside rides up and over
    // it instead of passing through the mountain.
    const CLEAR = 1.4;
    const nextX = ct.x + fwd[0] * speedRef.current * dt;
    const nextZ = ct.z + fwd[1] * speedRef.current * dt;
    const floorY = Math.max(sampler.heightAt(ct.x, ct.z), sampler.heightAt(nextX, nextZ)) + CLEAR;
    let vy = lift * tune.climbRate;
    // Rotor stopped → no lift, the craft settles gently to the ground (can't take off).
    if (tune.climbRate <= 0.001 && lift > 0) vy = 0;
    if (tune.rotor <= 0.001) vy = ct.y > floorY + 0.05 ? -4 : 0;
    // The land is solid: if the craft is already below the floor (e.g. after a big low-frame-rate
    // step, or flying into rising terrain), hard-snap it back up so it can NEVER tunnel through —
    // then never let it descend below the floor again.
    if (ct.y < floorY) {
      craft.setTranslation({ x: ct.x, y: floorY, z: ct.z }, true);
      if (vy < 0) vy = 0;
    } else if (ct.y + vy * dt < floorY) {
      vy = (floorY - ct.y) / dt; // arrest the descent exactly at the floor
    }
    craft.setLinvel({ x: fwd[0] * speedRef.current, y: vy, z: fwd[1] * speedRef.current }, true);

    // Bank into the turn; nose dips proportional to forward speed (cyclic) — the GTA look.
    const bank = -steer * 0.45;
    const pitch = -(speedRef.current / Math.max(1, tune.topSpeed)) * 0.28;
    q.setFromEuler(new THREE.Euler(pitch, craftYawRef.current, bank, "YXZ"));
    craft.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    craft.setAngvel({ x: 0, y: 0, z: 0 }, true);
    const ps = usePlayerStore.getState();
    ps.setPosition([ct.x, ct.y, ct.z]);
    ps.setSpeed(Math.abs(speedRef.current));
    cameraChase(ct, craftYawRef.current, FLY_CAM_DISTANCE, FLY_CAM_HEIGHT, 2);
  }

  function cameraChase(ct: { x: number; y: number; z: number }, yaw: number, dist: number, height: number, look: number) {
    const off = cameraOffset(yaw, dist, height);
    camera.position.lerp(v.set(ct.x + off[0], ct.y + off[1], ct.z + off[2]), 0.12);
    camTarget.set(ct.x, ct.y + look, ct.z);
    camera.lookAt(camTarget);
  }

  /** Hold the gun at the player's right hand, pointed where the camera aims. */
  function positionHeldGun(px: number, py: number, pz: number) {
    const g = heldGunRef.current;
    if (!g) return;
    g.visible = true;
    const fwd = forwardFromYaw(yawRef.current); // [fx, fz]
    const rx = fwd[1], rz = -fwd[0]; // right = forward rotated 90°
    g.position.set(px + fwd[0] * 0.45 + rx * 0.34, py - FOOT_OFFSET + 1.15, pz + fwd[1] * 0.45 + rz * 0.34);
    g.rotation.set(pitchRef.current * 0.7, yawRef.current, 0);
  }

  /** Fire the equipped weapon: a raycast along the camera aim, an impulse on a struck dynamic body,
   *  a tracer, and a little recoil kick. */
  function fireWeapon(px: number, py: number, pz: number) {
    const id = usePlayerStore.getState().equippedWeaponId;
    const gunSpec = id ? useGameStore.getState().objects[id]?.spec : null;
    if (!gunSpec || !world) return;
    const tune = resolveWeaponTuning(gunSpec);
    // Aim where the player faces (yaw), tilted by the look pitch — deterministic and matches the
    // third-person camera without depending on the camera having settled.
    const fwd = forwardFromYaw(yawRef.current);
    const cp = Math.cos(pitchRef.current);
    fwdVec.set(fwd[0] * cp, -Math.sin(pitchRef.current), fwd[1] * cp).normalize();
    const ox = px + fwdVec.x * 1.3;
    const oy = py - FOOT_OFFSET + 1.2 + fwdVec.y * 1.3;
    const oz = pz + fwdVec.z * 1.3;
    const ray = new rapier.Ray({ x: ox, y: oy, z: oz }, { x: fwdVec.x, y: fwdVec.y, z: fwdVec.z });
    const hit = world.castRay(ray, tune.range, true, undefined, undefined, undefined, bodyRef.current ?? undefined);
    let tx = ox + fwdVec.x * tune.range, ty = oy + fwdVec.y * tune.range, tz = oz + fwdVec.z * tune.range;
    if (hit) {
      const h = hit as unknown as { toi?: number; timeOfImpact?: number; collider: { parent: () => RapierRigidBody | null } };
      const toi = h.toi ?? h.timeOfImpact ?? tune.range;
      tx = ox + fwdVec.x * toi;
      ty = oy + fwdVec.y * toi;
      tz = oz + fwdVec.z * toi;
      const hb = h.collider.parent();
      if (hb && hb.bodyType() === 0) {
        const imp = shotImpulse(tune.force, hb.mass() || 4, [fwdVec.x, fwdVec.y, fwdVec.z]);
        hb.applyImpulseAtPoint({ x: imp[0], y: imp[1], z: imp[2] }, { x: tx, y: ty, z: tz }, true);
      }
    }
    emitTracer([ox, oy, oz], [tx, ty, tz]);
    pitchRef.current = clamp(pitchRef.current + 0.045, -0.38, 0.62); // recoil kick
  }

  /**
   * True if a solid obstacle (building, tree, rock, or any other spawned object) occupies the given
   * spot. The vehicle being driven is excluded via Rapier's own body filter; the terrain is avoided
   * by probing a ball ABOVE the local ground (and excluded again by its `terrain` tag as a backup),
   * so the flat ground never registers as a wall. One reusable Ball query against the live colliders.
   */
  function obstacleBlocked(x: number, z: number, radius: number, craft: RapierRigidBody): boolean {
    if (!world) return false;
    const r = Math.min(radius, 0.85);
    if (!probeRef.current) probeRef.current = new rapier.Ball(r);
    probeRef.current.radius = r;
    const y = sampler.heightAt(x, z) + 1.0; // sit the probe above the ground, around chassis height
    const hit = world.intersectionWithShape(
      { x, y, z },
      { x: 0, y: 0, z: 0, w: 1 },
      probeRef.current,
      undefined,
      undefined,
      undefined,
      craft, // exclude the car's own body — reliable self-filter
      (collider) => {
        const parent = collider.parent();
        if (!parent) return true;
        // Ignore the (disabled) player capsule the car is carrying. Handle comparison is reliable
        // where userData round-tripping is not. The terrain is mainly avoided by probing above it,
        // with the `terrain` tag as a backup for steep slopes.
        if (bodyRef.current && parent.handle === bodyRef.current.handle) return false;
        if ((parent.userData as { terrain?: boolean } | undefined)?.terrain) return false;
        return true; // anything else solid blocks the vehicle
      },
    );
    return hit !== null && hit !== undefined;
  }

  return (
    <>
      <RigidBody
        ref={bodyRef}
        type="dynamic"
        colliders={false}
        position={[0, spawnY, 0]}
        enabledRotations={[false, false, false]}
        mass={70}
        friction={0.2}
        linearDamping={0.05}
        canSleep={false}
        userData={{ player: true }}
        ccd
      >
        <CapsuleCollider args={[CAPSULE_HALF, CAPSULE_RADIUS]} />
      </RigidBody>
      {/* Rider avatar — positioned in world space each frame (on the ground on foot, on the
          vehicle while driving) so we can show the rider seated on a bike/car. */}
      <group ref={riderRef}>
        <Avatar />
      </group>
      {/* Held weapon — rendered in world space at the player's hand while a gun is equipped. */}
      <group ref={heldGunRef} visible={false}>
        {equippedSpec && <ObjectMesh spec={equippedSpec} scale={0.9} />}
      </group>
    </>
  );
}

/** Collision radius for a driven vehicle — roughly its half-width, clamped to a sane range. */
function vehicleRadius(spec: ObjectSpec): number {
  const b = specBounds(spec.parts);
  const width = Math.min(b.max[0] - b.min[0], b.max[2] - b.min[2]);
  return Math.max(0.6, Math.min(2.2, width * 0.45));
}

/** Kick (Z) / punch (X) the nearest object you're facing — applies an impulse scaled by its mass. */
function kickNearby(px: number, pz: number, yaw: number, strong: boolean): void {
  const [fwx, fwz] = forwardFromYaw(yaw);
  const objects = useGameStore.getState().objects;
  let best: RapierRigidBody | null = null;
  let bestD = 3.6;
  for (const [id, o] of Object.entries(objects)) {
    if (o.hidden || o.errored) continue;
    const body = getBody(id);
    if (!body || body.bodyType() !== 0) continue; // dynamic objects only (kinematic vehicles won't react)
    const t = body.translation();
    const dx = t.x - px, dz = t.z - pz;
    const d = Math.hypot(dx, dz);
    if (d > bestD) continue;
    if ((dx * fwx + dz * fwz) / (d || 1) < -0.1) continue; // must be roughly in front of the player
    bestD = d;
    best = body;
  }
  if (best) {
    const mass = best.mass() || 8;
    const power = strong ? 9 : 6; // kick is stronger and lifts more than punch
    const up = strong ? 0.6 : 0.18;
    best.applyImpulse({ x: fwx * power * mass, y: up * power * mass, z: fwz * power * mass }, true);
    best.applyTorqueImpulse({ x: fwz * mass, y: 0, z: -fwx * mass }, true); // a little tumble
  }
}

/**
 * Nearest object the player can interact with (drive/fly/ride). The reach scales with the object's
 * size so you can enter a big helicopter/bus by standing at its edge, not only at its centre.
 */
function findNearestInteractable(px: number, pz: number): string | null {
  const objects = useGameStore.getState().objects;
  let best: string | null = null;
  let bestScore = 0; // how far inside its reach the player is (higher = closer/easier)
  for (const [id, o] of Object.entries(objects)) {
    if (o.errored || o.hidden) continue;
    if (interactionFor(o.spec).mode === "none") continue;
    const body = getBody(id);
    const pos = body ? body.translation() : { x: o.position[0], z: o.position[2] };
    const d = Math.hypot(pos.x - px, pos.z - pz);
    const reach = INTERACT_RANGE + specBoundingRadius(o.spec.parts) * 0.7;
    if (d <= reach) {
      const score = reach - d;
      if (score > bestScore) {
        bestScore = score;
        best = id;
      }
    }
  }
  return best;
}
