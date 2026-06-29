<aside>
⚙️

Companion to the **PRD — AI-Driven Planet Sandbox Game**. This document specifies the recommended tech stack, architecture, and the generation approach. Recommendations are backed by current (2025–2026) ecosystem research; key sources are cited inline.

</aside>

## 1. Architecture at a Glance

Project Orbit is a **client-heavy WebGL game** with thin authoritative services for the shared clock, object generation, and per-user persistence.

```
Browser (React + R3F + Three.js + Rapier WASM)
  ├─ Render loop (planet, ocean, day/night)
  ├─ Physics world (Rapier)
  ├─ HUD (glass-morphism React overlay)
  ├─ Object sandbox (error-boundaried generated objects)
  └─ Prompt client ──►
                          Generation Service (LLM + optional text-to-3D API)
                          Time Service (global day/night clock)
                          Persistence (per-user world state)
```

- **Single-player-per-instance**: there is no real-time multiplayer state sync to build in v1. The only globally shared value is the **clock**, which can be derived client-side from a server-anchored time, so the networking surface is intentionally tiny.

## 2. Recommended Tech Stack

| Layer | Recommendation | Why |
| --- | --- | --- |
| Rendering | **Three.js (latest)** via **React Three Fiber (R3F)**  • **drei** | Brainstorm specifies Three.js with polygon/mesh support. R3F gives a declarative, component-per-object model that maps cleanly to per-object error boundaries. |
| Physics | **Rapier** (`@dimforge/rapier3d`) via **@react-three/rapier** | Rust/WASM engine; maintained and far faster than cannon-es, which is effectively unmaintained and "hundreds of times slower." |
| UI / HUD | **React** overlay with **CSS `backdrop-filter`** glass-morphism, **Tailwind**  • CSS variables | HUD lives in DOM above the canvas; CSS variables expose `--glass-blur` / `--glass-opacity` for dev-tunable frostness & transparency. |
| Object controls | **Leva** (or custom React panel) | Sliders, checkboxes, number steppers map directly to Leva controls; can be skinned glass-morphic. |
| State | **Zustand** | Lightweight, works great with R3F; transient store avoids re-render churn in the render loop. |
| Build | **Vite** (+ `vite-plugin-wasm`, `vite-plugin-top-level-await`) | Required to load Rapier's WASM bundle cleanly. |
| Generation | **LLM (user's connected model)** producing a constrained object spec/code, optional **text-to-3D mesh API** (Meshy / Tripo) for asset-grade objects | See §4. Keeps core mechanics model-independent while letting visual fidelity scale with the model. |
| Backend | **Node (Edge/serverless)** for time anchor + generation proxy; **WebSocket or Durable Objects** only if/when co-presence is added | Minimal footprint for v1. |
| Persistence | **Postgres** (world/object configs as JSON) + object/asset blob storage | Per-user world snapshots. |

## 3. World Rendering

### 3.1 The planet

- Represent the planet as an **icosphere** (subdivided icosahedron) for even, low-poly triangle distribution.
- Generate islands by displacing vertices with layered noise (e.g. simplex) thresholded against sea level; assign **flat-shaded** low-poly materials (`flatShading: true`) by biome/height band.
- Ocean is a separate slightly larger sphere with a stylized animated low-poly water shader.
- **Gravity points toward planet center** — Rapier gravity is applied per-body as a vector toward the core rather than a global down vector, and the character/camera "up" aligns to the surface normal.

### 3.2 Scaling factor

- A single `WORLD_SCALE` config (planet radius, island size multipliers, object base scale) read from env/config at build.
- During development it is editable behind the collapsible dev panel; at deploy it is **frozen to one value** and the control is hidden.

### 3.3 Day / night cycle (globally synced)

- Compute sun azimuth/elevation from a **single shared timestamp** so every player sees the same time of day simultaneously.
- Anchor to server time (NTP-style offset fetched once) mapped to the chosen US timezone, so local device clocks can't desync the world.
- Drive a directional "sun" light + sky/ambient color ramp + ocean tint from the cycle. No light/dark UI mode — lighting is purely world-driven.

## 4. AI Object Generation — Approach (Core Decision)

The brainstorm gives two strong constraints that shape the approach:

1. *"core mechanics must always be solid regardless of model quality"*
2. *"every spawned object must have an error boundary… bad generated code… removed silently"*

Constraint #2 implies the model emits **something executable/declarative that can fail** — i.e. a spec or code, not just a static download. Recommended: a **hybrid, spec-first pipeline**.

### 4.1 Recommended: Constrained Object Spec (primary) + Text-to-3D mesh (optional enrichment)

1. **Prompt → structured spec.** The LLM converts the prompt into a strict JSON **Object Spec** validated against a schema (see ¤7). The spec references low-poly primitive parts, transforms, materials, **physics tags**, and exposed config parameters. Because it is schema-validated, it is safe and model-independent — a weak model still yields a valid (if blocky) object; core mechanics never break.
2. **Spec → mesh.** A deterministic client-side **builder** turns the spec into Three.js geometry (composed primitives / parametric generators). This is the guaranteed-stable path.
3. **Optional enrichment.** For higher fidelity when the model/budget allows, request a mesh from a **text-to-3D API** returning **glTF/GLB** (Meshy or Tripo are the strongest game-oriented options; Tripo is fastest with a solid developer API, Meshy excels at stylized/low-poly output). The GLB is swapped in once it arrives while physics tags from the spec are retained.

**Why not pure text-to-3D?** Current text-to-3D generation takes ~30–60s+ and often needs topology cleanup — acceptable as async enrichment, but too slow/unreliable to be the only path for an interactive "type and it appears" feel. **Why not pure LLM-writes-Three.js-code?** Free-form generated code is the highest-risk path; we constrain it to a validated spec and only sandbox raw code as an advanced/optional mode.

### 4.2 Quality scales with the model

- Weak model → valid spec with primitive parts (blocky but functional + correct physics).
- Strong model → richer spec, more parts/params, and/or a high-quality GLB; large structures (Taj Mahal) can include explorable interiors.

## 5. Object Sandbox & Error Boundaries

- Each spawned object renders inside its **own React error boundary** so a faulty object cannot blank the canvas.
- **Important nuance:** React error boundaries only catch errors thrown during React render/lifecycle. Async failures (glTF decode, loader errors, physics asserts) must be caught explicitly with try/catch around the builder/loader and surfaced into the boundary, then logged. (This is a known R3F gotcha — useGLTF/useLoader async errors can escape boundaries.)
- If raw generated code is ever executed (advanced mode), run it in an **isolated sandbox** — a sandboxed `<iframe>`/Web Worker with no DOM/network access — rather than `eval` in the main context, to prevent prototype-pollution / escape attacks.
- **On failure:** unmount the object, free its Rapier body, **remove it silently**, push a structured entry to the debug log, and light the **top-right error indicator**.

### 5.1 Debug log & notifications

- A central **error log store** (Zustand) records `{ objectId, prompt, phase, error, stack, timestamp }`.
- Top-right indicator badges the unseen error count; clicking opens a **glass-morphic debug log window**.
- Expose the log via a typed API (`game.debug.getLogs()`) and/or a read endpoint so **agents can fetch logs and self-correct** — regenerate the spec and re-spawn.

## 6. Physics System (Rapier)

- Maintain a Rapier physics world stepped in the render loop; each object gets a **RigidBody + Collider** derived from its spec.
- **Physics tags** on the spec map to material presets: `mass`, `density`, `restitution`, `friction`, plus semantic flags like `flammable`, `rigid`, `liquid`.
- **Interactions** via Rapier collision/contact events:
    - *Fire + wood*: contact between an emitter tagged `fire` and a body tagged `flammable` starts an ignition timer → material/visual state change.
    - *Bowling ball + pins*: standard rigid-body collision with tuned mass/restitution.
- Use **capsule/convex colliders** for generated meshes (full trimesh colliders are costly and prone to tunneling); enable CCD for fast objects to avoid pass-through.

## 7. Object Spec & Configuration API

The **Object Spec** is the contract between the model, the builder, the controls panel, and agents. A single schema powers generation, the bottom-right controls UI, and the documented API reference.

```json
{
  "id": "obj_supercar_01",
  "type": "vehicle",
  "parts": [{ "primitive": "box", "size": [4,1,2], "material": "paint_red" }],
  "physics": { "mass": 1500, "friction": 0.7, "flammable": false },
  "config": {
    "topSpeed":   { "type": "slider",  "min": 0, "max": 400, "step": 5, "value": 250 },
    "headlights": { "type": "checkbox", "value": true },
    "wheelCount": { "type": "stepper", "min": 3, "max": 8, "value": 4, "multipliers": [5,10,20] }
  }
}
```

- The **controls panel** (bottom-right, fixed size, tab view) is rendered automatically from `config`: `slider` → slider, `checkbox` → toggle, `stepper` → number stepper with **5×/10×/20×** multipliers.
- The same schema is published as the **API reference** surfaced to users and agents, so complex objects (racing tracks: thickness, layout, segments) expose as many configs as the model provides.

## 8. Glass-Morphism HUD

- HUD is a React layer above the WebGL canvas (canvas is `pointer-events:none` where the HUD needs clicks).
- Frosted glass via `backdrop-filter: blur(var(--glass-blur)) saturate(180%)` + translucent background + subtle high-contrast border (border improves legibility/accessibility, per NN/g guidance).
- Dev-tunable tokens: `--glass-blur` (frostness) and `--glass-opacity` (transparency), wired to the collapsible dev panel; locked at deploy.
- HUD regions: **center-bottom** prompt toggle/input, **bottom-right** object controls, **top-right** error indicator + debug window, **collapsible** dev/scale settings.
- Apply `backdrop-filter` sparingly (it is GPU-costly) so it doesn't compete with the 3D render budget; include `-webkit-` prefix.

## 9. Persistence & Backend

- **Per-user world** persisted as JSON: list of object specs + transforms + config overrides; rehydrated on load by replaying the builder.
- **Time service:** lightweight endpoint returning authoritative timestamp; client computes day/night locally from the offset.
- **Generation proxy:** server-side endpoint that holds API keys, calls the user's LLM and (optionally) the text-to-3D provider, validates specs against the schema before returning.
- Co-presence (multiple players in one world) is **out of scope for v1**; if added later, use an authoritative-server / delta-snapshot model (or Durable Objects per world).

## 10. Performance Budget

- Target 60 FPS on mid-tier laptops; cap concurrent dynamic bodies and use **instancing** for repeated low-poly elements.
- Prefer simple colliders (capsule/convex) over trimesh; sleep idle bodies.
- Lazy-load and cache generated GLBs; impose a per-instance object limit with graceful eviction.
- Keep `backdrop-filter` surfaces small/few; avoid full-screen blurs.

## 11. Recommended Default Stack (TL;DR)

> **React + TypeScript + Vite · Three.js + React Three Fiber + drei · Rapier (@react-three/rapier) · Zustand · Tailwind + CSS `backdrop-filter` glass-morphism · Leva-style object controls · schema-validated Object Spec generation (LLM) with optional Meshy/Tripo glTF enrichment · per-object React error boundaries + sandboxed execution · thin Node/serverless backend for time, generation proxy, and per-user persistence.**
> 

## 12. Key Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Text-to-3D latency (~30–60s) breaks "instant" feel | Spec-first instant build; mesh enrichment swaps in async |
| Weak models → broken objects | Schema validation + primitive fallback; core mechanics never depend on model quality |
| Generated code crashes game | Per-object error boundaries + sandboxed iframe/worker; silent removal + logging |
| Async loader errors escape React boundaries | Explicit try/catch around loaders, surfaced into boundary store |
| Physics tunneling / instability | Convex/capsule colliders, CCD, body sleeping |
| `backdrop-filter` GPU cost | Limit count/size of glass surfaces; tune blur |