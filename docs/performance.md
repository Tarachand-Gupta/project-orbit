# Performance posture: WebGPU, threads, and where the frame time actually goes

_Last reviewed: July 2026._

## The short answer

Project Orbit renders with **WebGL2** (Three.js `WebGLRenderer` via React Three Fiber v8), runs
**physics on the main thread** (Rapier compiled to WASM), and does **not** use WebGPU or worker
threads today. That is a deliberate posture, not an oversight — this document explains why, what
we already do instead, and the exact conditions under which WebGPU / workers would start paying
for their complexity.

## Why WebGL2 and not WebGPU (in 2026)

**Coverage.** WebGL2 runs everywhere we ship: Safari/Chrome/Firefox on macOS, Chrome/Edge on
Windows, Chrome/Firefox on Linux, and — critically — **WKWebView**, which is what the native
macOS app renders through. WebGPU coverage is close but still uneven at the edges we care about:
Linux Chrome has only recently stabilized, Firefox support is new, and WKWebView's WebGPU story
lags Safari itself. The native app alone makes WebGL2 the only zero-caveat choice.

**The ecosystem seam.** Moving to WebGPU in Three.js means `WebGPURenderer` + the TSL node
material system, which requires React Three Fiber v9 and drops
`@react-three/postprocessing`/`postprocessing` (WebGL-only — our bloom/vignette pipeline) for the
TSL post-processing stack. It's a real migration, not a flag flip.

**The workload doesn't ask for it.** WebGPU wins when you're bound on draw-call/CPU submission
overhead (thousands of draws), need compute shaders, or push heavy per-frame uploads. Orbit is a
low-poly, flat-shaded, pixel-art game that renders at a deliberately **reduced DPR**
(`world.pixelScale`) — the GPU is mostly idle. Profiling shows frame time dominated by
JavaScript + physics, which WebGPU does nothing for.

## "Multiple threads" — what's true today

A browser already gives us more parallelism than it appears:

- The **GPU process** is a separate OS process in every modern browser — WebGL command execution,
  rasterization, and compositing don't run on our JS thread.
- **Rapier is WASM** (near-native SIMD-ish speed), but stepped from the main thread.
- Audio, networking, IndexedDB persistence are already off-thread by platform design.

What we deliberately have **not** done:

- **Physics in a Web Worker.** Possible (Rapier supports it), but every read/write between the
  controller code and bodies becomes an async message or a SharedArrayBuffer protocol. SAB
  requires COOP/COEP headers, which would break the zero-config embed story and complicate the
  WKWebView shell. With ~dozens of dynamic bodies (`MAX_OBJECTS` caps the world), a step costs
  well under a millisecond — a worker would add latency and complexity to save time we're not
  spending.
- **OffscreenCanvas rendering worker.** Safari/WKWebView support arrived late and events must be
  proxied; the render thread isn't our bottleneck.

## What we do instead (the optimizations that actually matter here)

| Technique | Where |
| --- | --- |
| GPU instancing — the whole jungle (trunks, 3 canopy tiers, rocks) is 5 draw calls | `src/world/Jungle.tsx` |
| Reduced-resolution rendering (pixel-art DPR) + `image-rendering: pixelated` upscale | `src/config/world.ts`, `Scene.tsx` |
| One terrain trimesh collider built once from the exact visual geometry | `src/world/ground.ts` |
| Convex **hull** colliders for spawned objects (never per-triangle) | `SpawnedObject.tsx` |
| Object cap + spawn clearance so worst-case body count is bounded | `src/state/store.ts`, `spawn.ts` |
| Pure logic outside React — no per-frame React re-renders; the frame loop reads Zustand imperatively | repo convention |
| Native shell raises fidelity only where the hardware is known (retina DPR, 2048² shadows) | `src/config/native.ts` |
| The landing page never loads the engine — the game is a code-split chunk behind `/play` | `src/main.tsx` |

## What would change our mind

Adopt **WebGPU** when all of these are true:
1. WKWebView (native shell) exposes it reliably;
2. R3F v9 + a TSL post pipeline reach parity for our bloom/vignette;
3. a feature genuinely needs it — e.g. GPU-computed particles/boids, massive instanced crowds, or
   compute-based terrain erosion.

Move **physics to a worker** when the object cap rises enough that `world.step()` shows up above
~2 ms on mid-range hardware in the profiler (`L` → debug panel shows the live budget; the perf
chip states the current threading model honestly).

Both are tracked as roadmap items — contributions welcome, but land the profiler evidence first.
The right first PR is a benchmark scene, not a renderer swap.
