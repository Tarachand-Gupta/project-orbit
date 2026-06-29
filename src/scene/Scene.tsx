import { Suspense, useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import * as THREE from "three";
import { useGameStore } from "@/state/store";
import { samplerFor } from "@/objects/spawn";
import { Terrain } from "@/world/Terrain";
import { River } from "@/world/River";
import { Roads } from "@/world/Roads";
import { Jungle } from "@/world/Jungle";
import { Buildings } from "@/world/Buildings";
import { Lighting } from "@/world/Lighting";
import { Player } from "@/player/Player";
import { SpawnedObject } from "@/objects/SpawnedObject";
import { BurnController } from "@/objects/BurnController";
import { PostFX } from "./PostFX";
import { PerfProbe } from "./PerfProbe";

function ObjectsLayer({ sampler }: { sampler: ReturnType<typeof samplerFor> }) {
  const objects = useGameStore((s) => s.objects);
  const order = useGameStore((s) => s.order);
  return (
    <>
      {order.map((id) => {
        const obj = objects[id];
        if (!obj || obj.errored || obj.hidden) return null;
        return <SpawnedObject key={id} data={obj} sampler={sampler} />;
      })}
    </>
  );
}

export function Scene() {
  const world = useGameStore((s) => s.world);
  const solidObstacles = useGameStore((s) => s.solidObstacles);
  const sampler = useMemo(() => samplerFor(world), [world]);

  useEffect(() => {
    const id = requestAnimationFrame(() => document.body.setAttribute("data-scene-ready", "true"));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <Canvas
      // Crisp low-poly polygon look: full resolution + soft shadows + filmic tone mapping.
      shadows="soft"
      dpr={[1, 2]}
      // Tone mapping is applied by the PostFX ToneMapping effect, so disable it on the renderer.
      // preserveDrawingBuffer lets the Cmd+C screenshot shortcut read the canvas pixels.
      gl={{ antialias: true, powerPreference: "high-performance", toneMapping: THREE.NoToneMapping, preserveDrawingBuffer: true }}
      camera={{ position: [0, 8, -14], fov: 60, near: 0.1, far: world.size * 6 }}
      onCreated={({ scene }) => {
        scene.background = new THREE.Color("#bfe3f5");
        // Atmospheric haze for depth, like the references.
        scene.fog = new THREE.Fog("#cfe6f2", world.size * 0.8, world.size * 2.4);
      }}
    >
      <Lighting world={world} />
      <Suspense fallback={null}>
        <Physics gravity={[0, -26, 0]} timeStep="vary">
          <Terrain sampler={sampler} />
          <Roads sampler={sampler} />
          <Buildings sampler={sampler} />
          <Player sampler={sampler} />
          <ObjectsLayer sampler={sampler} />
          <Jungle sampler={sampler} solid={solidObstacles} />
          <BurnController />
        </Physics>
        {/* Non-colliding scenery */}
        <River sampler={sampler} />
      </Suspense>
      <PostFX />
      <PerfProbe />
    </Canvas>
  );
}
