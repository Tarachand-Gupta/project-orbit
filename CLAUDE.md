# CLAUDE.md — Project Orbit

Guidance for working in this repo. Read this first.

## What this is

**Project Orbit** — a browser-based, AI-driven sandbox game. You control a **third-person pixel
character** who walks (and drives) around a large explorable world: jungle hills, dirt roads, a
settlement of buildings, and a winding river. You spawn physics-enabled objects by typing natural
language ("create a supercar", "create the Taj Mahal"); if you create a **car you can get in (E)
and drive it** over the terrain. Glass-morphism HUD, real-world-synced day/night.

The game also ships as a **native macOS desktop app** — see `orbit-native/` (a Vercel Native SDK
package in this same repo; it renders THIS game in a WKWebView shell). Read
**`orbit-native/CLAUDE.md`** before touching anything native.

> Note: the original PRD described a spherical *planet*. Per later direction this pivoted to a
> **flat, walkable third-person world** (jungle/roads/buildings/river) with proper grounded
> physics. The PRD/Tech-Doc in `prd-and-docs/` still describe the globe — treat them as the
> source for *features* (generation, physics tags, error boundaries, controls, glass HUD), not
> the world shape.

## Stack

React 18 + TypeScript + Vite · Three.js + React Three Fiber + drei · Rapier physics
(`@react-three/rapier`) · Zustand · Tailwind + CSS `backdrop-filter` glass-morphism · IndexedDB
(`idb`). **AI generation: Vercel AI SDK** (`ai` + `@ai-sdk/google` + `@ai-sdk/openai-compatible`
+ `zod`). Unit tests: Vitest. E2E: Playwright (headless Chromium + SwiftShader WebGL).

## Object generation (offline-first, AI-enriched)

1. A prompt → **instant local object** via the deterministic template engine
   (`src/objects/generator.ts`). This always succeeds — core mechanics never depend on a model.
2. If a cloud provider is selected, `src/objects/spawn.ts` fires an **async enrichment** through
   the server proxy and swaps in a richer, schema-validated spec via `store.replaceSpec`. Never
   blocks; on any failure the local object stays.

Providers (keys in `.env`, server-side only — never bundled):
- **Gemini 3.5 Flash** (`gemini`) — `generateObject` + Zod schema, reliable. **Default.**
- **DeepSeek v4 Pro** (`deepseek`) — `generateText` + tolerant parse.
- **Kimi k2.6** (`kimi`) — slow (~45s); times out gracefully → local fallback.

The proxy lives in `src/server/generationProxy.ts` and is mounted as **Vite dev middleware**
(`POST /api/generate`) by `vite.config.ts` (loads `.env` via `loadEnv`, no `VITE_` prefix so keys
stay server-side). For production this middleware must move to a serverless function (same contract).

## Architecture map

```
src/
  config/      world.ts (flat-world scale, glass, pixelScale, timezone), physics.ts
               native.ts — detects the native macOS shell (?native=1 / zero:// origin) and bumps
               rendering fidelity (retina DPR, 2048 shadow map, richer bloom); browser untouched
  time/        clock.ts — synced day/night sun math + dev time-of-day override (pure, tested)
  world/       ground.ts   — terrain height, river carve, biome color, seeded noise (pure, tested)
               placement.ts — drop objects onto the ground (pure, tested)
               Terrain/River/Roads/Jungle/Buildings/Lighting.tsx — R3F world
  player/      input.ts (key map, tested) · locomotion.ts (move/camera math, tested)
               Player.tsx (capsule controller + follow cam + enter/drive/exit) · Avatar.tsx
  objects/     spec.ts (schema + validation) · specSchema.ts (Zod for the AI SDK)
               generator.ts (offline prompt→spec) · llm.ts (client enrichment call)
               geometry.ts (primitive→three args) · materials.ts · spawn.ts (pipeline)
               ObjectMesh / SpawnedObject / ObjectErrorBoundary / BurnController · bodyRegistry.ts
  state/       store.ts (objects, selection, glass, world, provider) · debugStore.ts · playerStore.ts
  hud/         Hud, PromptBox, ControlsPanel, ErrorIndicator, DebugWindow, DevPanel, Clock,
               InteractionPrompt (drive/exit), ControlsHint
  persistence/ db.ts — IndexedDB world save/load
  api/         gameApi.ts (window.game) · testHooks.ts (window.__orbitTest, DEV only)
  server/      generationProxy.ts — AI SDK generation (dev middleware)
  scene/       Scene.tsx — Canvas + Physics + world + player + objects + pixel rendering
```

The **Object Spec** (`src/objects/spec.ts`) is the single contract: generation, builder, controls
panel, and API reference all read it. Extend the spec + `validateSpec` + `specSchema.ts` together.

## Physics & player notes

- World gravity is normal **down** (`[0,-26,0]`). Terrain has a fixed **trimesh** collider built
  from the exact visual geometry (`buildTerrainGeometry`) so objects land on what they see and
  vehicles drive over the hills. Objects use convex **hull** colliders; CCD on dynamics.
- Player is a locked-rotation **capsule**; movement sets horizontal `linvel`, gravity does Y.
  Camera is a third-person trail cam (mouse-look via pointer lock; WASD relative to yaw).
- **Driving**: spawned objects of `type: "vehicle"` register in `bodyRegistry`. Press **E** near
  one to enter; the player capsule is disabled and `Player.driveVehicle` steers the car body
  (arcade: steered yaw + forward velocity, gravity keeps it grounded). **E** again exits beside it.

## window.game — programmatic API (users & agents)

`spawn`, `list`, `get`, `select`, `setConfig`, `remove`, `clear`, `getLogs` (agent self-correct),
`describe`, `save`, `load`, `setGlass`, `setProvider`, `setTimeOfDay`. In DEV `window.__orbitTest`
exposes internals for e2e (`pushLog`, `playerPos`, `enterVehicle`, `drivingId`, `objectPos`).

## Dev / test workflow — IMPORTANT

After implementing any feature, verify before moving on:
1. `npm run typecheck` — must be clean.
2. `npm run test` — Vitest unit (pure logic: spec, generator, geometry, clock, ground, placement,
   locomotion, store). Add tests for new pure logic.
3. `npm run test:e2e` — Playwright headless (world renders, HUD, spawn, **walk**, **drive**,
   controls, errors, persistence). Add an assertion for new user-facing features.

`npm run test:all` runs both.

For the **native macOS app**, additionally run from `orbit-native/`: `zig build test` and
`native validate app.zon`; full instructions (build, launch, package, GUI verification) live in
`orbit-native/CLAUDE.md`. Changing game code that the native shell touches (`src/config/native.ts`,
anything DPR/shadow/postFX related) means re-verifying BOTH paths — the e2e suite covers the
browser path only.

### Gotchas (don't trip on these)
- Dev server is **pinned to port 5191 with `strictPort`** (5173 is used by another local app).
  `vite.config.ts` and `playwright.config.ts` both reference 5191 — keep them in sync.
- Playwright launches Chromium with SwiftShader flags so **WebGL works headless**. Expect harmless
  `GPU stall due to ReadPixels` / WebGL warnings — allowlisted in `tests/e2e/smoke.spec.ts`.
- **E2E uses the `local` provider + a fixed time-of-day** (`boot()` helper) so tests are fast,
  free, and deterministic. Don't let tests hit the real LLM APIs.
- The scene sets `document.body[data-scene-ready="true"]` after first paint; e2e waits on it.
- Pixel look = low `dpr` (`world.pixelScale`) + `image-rendering: pixelated` on the canvas.
- Rapier WASM loads via `vite-plugin-wasm` + `vite-plugin-top-level-await`;
  `@dimforge/rapier3d-compat` excluded from dep-optimization.

### Conventions
- Keep **pure logic out of React** (`time/`, `world/*.ts`, `objects/*.ts`, `player/*.ts`) so it's
  unit-testable without a GL context.
- Every spawned object stays wrapped in `ObjectErrorBoundary`; async failures route to `logError()`.
- Add `data-testid` to new interactive HUD elements for e2e.
- Match the flat-shaded, low-poly/pixel art direction.
