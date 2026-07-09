import { useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import { sunState } from "@/time/clock";
import type { WorldConfig } from "@/config/world";
import { usePlayerStore } from "@/state/playerStore";
import { SHADOW_MAP_SIZE } from "@/config/native";

const NIGHT_SKY = new THREE.Color("#0a1124");
const DAWN_SKY = new THREE.Color("#e8915c");
const DAY_SKY = new THREE.Color("#9bd0f0");
const NIGHT_AMBIENT = new THREE.Color("#1a2440");
const DAY_AMBIENT = new THREE.Color("#cfe4ff");
const SUN_COLOR = new THREE.Color("#fff4e0");
const tmp = new THREE.Color();

/**
 * Day/night lighting driven by the globally-synced clock (PRD §4.3). A directional "sun" follows
 * the player so the shadow frustum stays tight over the large terrain, and sky/ambient colors
 * ramp with daylight. No light/dark UI toggle — lighting is purely world-driven.
 */
export function Lighting({ world }: { world: WorldConfig }) {
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const starsRef = useRef<THREE.Group>(null);
  const { scene } = useThree();
  const shadowSpan = world.size * 0.4;
  const sunDist = world.size * 1.2;

  useFrame(() => {
    const s = sunState();
    const daylight = s.daylight;
    const p = usePlayerStore.getState().position;

    if (sunRef.current && targetRef.current) {
      targetRef.current.position.set(p[0], 0, p[2]);
      targetRef.current.updateMatrixWorld();
      sunRef.current.position.set(p[0] + s.direction[0] * sunDist, s.direction[1] * sunDist + 20, p[2] + s.direction[2] * sunDist);
      // Softer sun so cast shadows aren't harsh/black — keeps the scene (and the glass HUD over it)
      // readable while the lifted ambient/hemisphere fill below lightens the shadowed areas.
      sunRef.current.intensity = 0.15 + daylight * 1.2;
      sunRef.current.color.copy(SUN_COLOR);
    }

    const dawnFactor = s.isNight ? 0 : Math.max(0, 1 - Math.abs(daylight - 0.15) / 0.15) * 0.6;
    tmp.copy(NIGHT_SKY).lerp(DAY_SKY, daylight);
    tmp.lerp(DAWN_SKY, dawnFactor);
    if (scene.background instanceof THREE.Color) scene.background.copy(tmp);
    else scene.background = tmp.clone();
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(tmp);

    if (ambientRef.current) {
      ambientRef.current.color.copy(NIGHT_AMBIENT).lerp(DAY_AMBIENT, daylight);
      // Lower fill light so the sun's directional component dominates — flat-shaded facets then
      // shade distinctly by slope (the polygon "texture" comes from lighting, not random colour).
      ambientRef.current.intensity = 0.62 + daylight * 0.34;
    }
    if (hemiRef.current) hemiRef.current.intensity = 0.42 + daylight * 0.4;
    if (starsRef.current) starsRef.current.visible = 1 - daylight > 0.05;
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.6} />
      <hemisphereLight ref={hemiRef} color="#bfe0ff" groundColor="#2c4a2c" intensity={0.4} />
      <object3D ref={targetRef} />
      <directionalLight
        ref={sunRef}
        castShadow
        intensity={1.2}
        target={targetRef.current ?? undefined}
        shadow-mapSize-width={SHADOW_MAP_SIZE}
        shadow-mapSize-height={SHADOW_MAP_SIZE}
        shadow-camera-near={1}
        shadow-camera-far={world.size * 3}
        shadow-camera-left={-shadowSpan}
        shadow-camera-right={shadowSpan}
        shadow-camera-top={shadowSpan}
        shadow-camera-bottom={-shadowSpan}
        shadow-bias={-0.0005}
      />
      <group ref={starsRef}>
        <Stars radius={world.size * 4} depth={50} count={2500} factor={4} fade speed={0.5} />
      </group>
    </>
  );
}
