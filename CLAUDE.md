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

> Note: the original design brief described a spherical *planet*. The game deliberately pivoted
> to a **flat, walkable third-person world** (jungle/roads/buildings/river) with proper grounded
> physics — if anything anywhere still mentions a globe, the flat world is correct.

## Stack

React 18 + TypeScript + Vite · Three.js + React Three Fiber + drei · Rapier physics
(`@react-three/rapier`) · Zustand · Tailwind + CSS `backdrop-filter` glass-morphism · IndexedDB
(`idb`). **AI generation: Vercel AI SDK** (`ai` + `@ai-sdk/google` + `@ai-sdk/openai-compatible`
+ `zod`). Unit tests: Vitest. E2E: Playwright (headless Chromium + SwiftShader WebGL).

## Object generation (typeahead-first, single spawn)

1. **Typeahead**: as the user types in the prompt box, `suggestTemplates` (generator.ts) offers
   known-template chips ("heli" → ⚡Helicopter); picking one (click or ↑/↓+Enter) spawns that
   deterministic template **instantly** — no AI round-trip.
2. **Create with a cloud provider**: NOTHING spawns until the model answers. The
   GenerationIndicator shows progress; on success exactly ONE object (the enriched spec) is
   placed; on failure the deterministic local object spawns instead (offline-first as the
   fallback, not the first paint). Duplicate submits of the same prompt while one is pending
   are rejected (`inFlight` map in spawn.ts + a 700 ms double-fire guard in PromptBox).
3. **Local provider**: prompt → instant template/generic object, as always.

Never re-introduce the old "spawn local now, `replaceSpec` it ~10s later" morph: the mid-ride
spec swap read as a duplicated object and could rebuild the physics body under the player.
`store.replaceSpec` still exists but nothing in the spawn path calls it. Clearing the world
cancels in-flight generations (`pendingGen` doubles as the cancellation token).

Providers are a **registry** (`src/objects/providers.ts`, browser-safe, the single source of truth
for client UI + proxy + native). Production is **bring-your-own-key only** — the deployment ships no
server keys, by policy; `.env` `GEMINI_API_KEY` is a local-dev convenience only. DEFAULT provider is
`local` (zero-config players get instant templates, never a failed call). The top-10 BYO-key set:
`openai`, `anthropic`, `gemini`, `groq`, `openrouter`, `xai`, `nvidia`, `mistral`, `deepseek`, plus
`custom` (any OpenAI-compatible base URL). Each has a preset base URL (override in the ⚙ settings),
a key field, and a **model picker** whose live list is fetched from the provider (`POST /api/models`)
once a key is present — curated defaults + free-text otherwise. Per-provider key/model/baseUrl are
persisted in localStorage (`orbit.apiKeys` / `orbit.models` / `orbit.baseUrls`). Routing by
`apiStyle`: `google` → `@ai-sdk/google` `generateObject`; `anthropic` → `@ai-sdk/anthropic`
`generateText`; everything else → `@ai-sdk/openai-compatible` against the (sanitized) base URL. The
old Kimi/DeepSeek-via-DigitalOcean routing is gone — DeepSeek is now a direct BYO-key provider.
Adding a provider = one entry in `providers.ts` (+ the `ProviderId` union). The packaged native app
has no proxy: `gemini` uses the bundled-key direct path, OpenAI-compatible providers call their
endpoint directly (CORS-permitting), via `nativeLlm.ts`.

The proxy lives in `src/server/generationProxy.ts` and is mounted as **Vite dev middleware**
(`POST /api/generate`) by `vite.config.ts` (loads `.env` via `loadEnv`, no `VITE_` prefix so keys
stay server-side). Production is the same contract via the `api/generate.ts` serverless function.
The endpoint is public + unauthenticated, so the middleware is **hardened** (`generationProxy.test.ts`):
BYO-key is code-enforced (server keys used only if `ALLOW_SERVER_KEYS=1`), per-client rate limit,
same-origin check for browser callers, 32 KB body cap, generic 502s (safe messages via
`UserFacingError`), and custom endpoints run through `ssrfGuard.ts` (DNS→private-IP check, no
redirects). Keep new provider paths behind these guards.

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
               mouseCapture.ts — native-shell hover mouse-look (pointer-lock emulation; browsers no-op)
               Player.tsx (capsule controller + follow cam + enter/drive/exit) · Avatar.tsx
  objects/     spec.ts (schema + validation) · specSchema.ts (Zod for the AI SDK)
               generator.ts (offline prompt→spec) · llm.ts (client enrichment call)
               geometry.ts (primitive→three args) · materials.ts · spawn.ts (pipeline)
               ObjectMesh / SpawnedObject / ObjectErrorBoundary / BurnController · bodyRegistry.ts
  state/       store.ts (objects, selection, glass, world, provider) · debugStore.ts · playerStore.ts
  hud/         Hud, PromptBox, ControlsPanel, ErrorIndicator, DebugWindow, DevPanel, Clock,
               InteractionPrompt (drive/exit), ControlsHint, WelcomeGuide (first-launch onboarding,
               localStorage "orbit.welcomed", reopenable via ? button; e2e boot() pre-seeds the flag)
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
