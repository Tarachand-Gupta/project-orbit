import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { usePerfStore } from "@/state/perfStore";

interface ChromeMemory {
  usedJSHeapSize: number;
  jsHeapSizeLimit: number;
}

/**
 * In-canvas performance probe. Samples FPS / frame-time and the WebGL renderer stats (draw calls,
 * triangles, geometries, textures, programs) plus JS heap usage, and pushes them to the perf
 * store ~3×/second for the resource monitor HUD.
 */
export function PerfProbe() {
  const { gl } = useThree();
  const frames = useRef(0);
  const last = useRef(performance.now());

  useFrame(() => {
    frames.current += 1;
    const now = performance.now();
    const elapsed = now - last.current;
    if (elapsed >= 300) {
      const info = gl.info;
      const mem = (performance as unknown as { memory?: ChromeMemory }).memory;
      usePerfStore.getState().update({
        fps: (frames.current * 1000) / elapsed,
        ms: elapsed / frames.current,
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length ?? 0,
        heapMB: mem ? mem.usedJSHeapSize / 1048576 : null,
        heapLimitMB: mem ? mem.jsHeapSizeLimit / 1048576 : null,
      });
      frames.current = 0;
      last.current = now;
    }
  });

  return null;
}
