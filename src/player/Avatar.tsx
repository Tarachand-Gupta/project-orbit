import { forwardRef, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { usePlayerStore } from "@/state/playerStore";
import { useGameStore } from "@/state/store";
import { interactionFor } from "@/objects/spec";

/**
 * A low-poly **human** character (not a blocky cube-man): rounded head, tapered torso, and
 * capsule limbs with proper proportions, in an explorer/soldier outfit to match the reference
 * art. Limbs swing from their joints when `moving`. Visual only — physics is the Player capsule.
 */
const SKIN = "#d8a878";
const SHIRT = "#6f7a59";
const VEST = "#54603f";
const PANTS = "#3b4536";
const BOOTS = "#2a2a26";
const HAIR = "#3a2a1c";

export function Avatar() {
  const root = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);

  // Smoothed gait phase so starts/stops ease in rather than snapping (less robotic).
  const gait = useRef(0);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const ps = usePlayerStore.getState();
    const dt = Math.min(delta, 0.05);

    // Posing while controlling a vehicle, by the object's declared posture.
    if (ps.drivingId) {
      gait.current = 0;
      const obj = useGameStore.getState().objects[ps.drivingId];
      const posture = obj ? interactionFor(obj.spec).posture ?? "sit" : "sit";
      const aL = armL.current, aR = armR.current, lL = legL.current, lR = legR.current, rt = root.current;
      const set = (l: THREE.Group | null, x: number, z = 0) => l && l.rotation.set(x, 0, z);
      if (rt) rt.position.y = 0;
      switch (posture) {
        case "stand": // hoverboard/segway — upright, knees soft, arms out for balance
          set(lL, -0.12, 0.12); set(lR, 0.12, -0.12);
          set(aL, -0.25, 0.35); set(aR, -0.25, -0.35);
          rt?.rotation.set(0.05, 0, 0);
          break;
        case "stand-left":
        case "stand-right": { // skateboard/snowboard — wide staggered stance, arms out
          const f = posture === "stand-left" ? 1 : -1;
          set(lL, -0.3 * f, 0.18); set(lR, 0.3 * f, -0.18);
          set(aL, -0.2, 0.5); set(aR, -0.2, -0.5);
          rt?.rotation.set(0.06, 0, 0);
          break;
        }
        case "straddle": // motorbike/horse — lean forward, hands on bars, legs down the sides
          set(lL, -0.55, 0.22); set(lR, -0.55, -0.22);
          set(aL, -0.95); set(aR, -0.95);
          rt?.rotation.set(0.34, 0, 0);
          break;
        case "lie": // glider/luge — prone, body horizontal, arms forward
          set(lL, 0.15, 0.1); set(lR, 0.15, -0.1);
          set(aL, -1.5); set(aR, -1.5);
          rt?.rotation.set(-1.25, 0, 0);
          break;
        default: // sit — cars/boats/planes
          set(lL, -1.35); set(lR, -1.35);
          set(aL, -1.0); set(aR, -1.0);
          rt?.rotation.set(0.18, 0, 0);
      }
      return;
    }

    const moving = ps.moving;
    gait.current = THREE.MathUtils.damp(gait.current, moving ? 1 : 0, 8, dt);
    const g = gait.current;

    // Limbs swing ONLY when actually moving (g→0 when idle → perfectly still, no phantom walk).
    const swing = Math.sin(t * 9) * g * 0.8;
    if (armL.current) armL.current.rotation.x = swing * 0.85;
    if (armR.current) armR.current.rotation.x = -swing * 0.85;
    if (legL.current) legL.current.rotation.x = -swing;
    if (legR.current) legR.current.rotation.x = swing;

    if (root.current) {
      // Vertical bob + gentle forward lean + side sway, all scaled by gait so idle is static.
      root.current.position.y = Math.abs(Math.sin(t * 9)) * 0.07 * g;
      root.current.rotation.x = 0.12 * g;
      root.current.rotation.z = Math.sin(t * 9) * 0.04 * g;
    }
  });

  return (
    <group ref={root}>
      {/* Legs (pivot at hips) — sized so the boots plant on the ground (feet at y≈0). */}
      <Limb ref={legL} pivot={[-0.13, 0.78, 0]} length={0.62} radius={0.12} color={PANTS} boot />
      <Limb ref={legR} pivot={[0.13, 0.78, 0]} length={0.62} radius={0.12} color={PANTS} boot />

      {/* Torso — tapered (broader shoulders, narrower waist) */}
      <mesh position={[0, 1.16, 0]} castShadow>
        <cylinderGeometry args={[0.26, 0.2, 0.74, 16]} />
        <meshStandardMaterial color={SHIRT} roughness={0.9} />
      </mesh>
      {/* Chest vest — rounded so it doesn't read as a box */}
      <mesh position={[0, 1.22, 0.0]} castShadow>
        <capsuleGeometry args={[0.27, 0.34, 6, 16]} />
        <meshStandardMaterial color={VEST} roughness={0.9} />
      </mesh>

      {/* Arms (pivot at shoulders) */}
      <Limb ref={armL} pivot={[-0.32, 1.44, 0]} length={0.44} radius={0.095} color={SHIRT} hand />
      <Limb ref={armR} pivot={[0.32, 1.44, 0]} length={0.44} radius={0.095} color={SHIRT} hand />

      {/* Neck + head */}
      <mesh position={[0, 1.56, 0]} castShadow>
        <cylinderGeometry args={[0.075, 0.085, 0.12, 12]} />
        <meshStandardMaterial color={SKIN} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.72, 0]} castShadow>
        <sphereGeometry args={[0.185, 18, 14]} />
        <meshStandardMaterial color={SKIN} roughness={0.95} />
      </mesh>
      {/* Face: eyes + brow so it reads as a person, not a blank head. */}
      <mesh position={[-0.07, 1.74, 0.16]}>
        <boxGeometry args={[0.05, 0.06, 0.03]} />
        <meshStandardMaterial color="#241c16" roughness={0.6} />
      </mesh>
      <mesh position={[0.07, 1.74, 0.16]}>
        <boxGeometry args={[0.05, 0.06, 0.03]} />
        <meshStandardMaterial color="#241c16" roughness={0.6} />
      </mesh>
      {/* Hair */}
      <mesh position={[0, 1.78, 0]} castShadow>
        <sphereGeometry args={[0.2, 18, 12, 0, Math.PI * 2, 0, Math.PI / 1.8]} />
        <meshStandardMaterial color={HAIR} roughness={0.9} />
      </mesh>
    </group>
  );
}

interface LimbProps {
  pivot: [number, number, number];
  length: number;
  radius: number;
  color: string;
  boot?: boolean;
  hand?: boolean;
}

/** A capsule limb that hangs from a joint group so it can swing about the joint. */
const Limb = forwardRef<THREE.Group, LimbProps>(function Limb(
  { pivot, length, radius, color, boot, hand },
  ref,
) {
  return (
    <group ref={ref} position={pivot}>
      <mesh position={[0, -length / 2, 0]} castShadow>
        <capsuleGeometry args={[radius, length, 6, 16]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      {boot && (
        // Boot sits at the true capsule bottom (pivot - length - radius), stepping forward a touch.
        <mesh position={[0, -length - radius, 0.06]} castShadow>
          <boxGeometry args={[radius * 2.1, radius * 1.3, radius * 3.1]} />
          <meshStandardMaterial color={BOOTS} roughness={0.9} />
        </mesh>
      )}
      {hand && (
        <mesh position={[0, -length - radius, 0]} castShadow>
          <sphereGeometry args={[radius * 1.05, 12, 10]} />
          <meshStandardMaterial color={SKIN} roughness={0.95} />
        </mesh>
      )}
    </group>
  );
});
