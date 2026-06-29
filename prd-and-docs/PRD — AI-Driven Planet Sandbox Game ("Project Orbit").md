<aside>
📝

**Status:** Draft v1 · **Owner:** Tarachand Gupta · **Source:** AI-Driven Planet Sandbox Game — Design Brainstorm. This PRD captures the product requirements; the companion **Technical Implementation Doc** covers stack and architecture.

</aside>

## 1. Overview

**Project Orbit** is a browser-based, AI-driven 3D sandbox game set on a low-poly **planet** — a spherical globe with multiple islands of varying sizes surrounded by ocean. Each player gets their own complete instance of the world to freely explore, and can generate 3D objects on demand using natural-language prompts (e.g. *"create a supercar"*, *"create the Taj Mahal"*). Generated objects carry real-world physics properties and interact with each other and the world.

The experience is rendered with a deliberately simple, low-density **low-poly art style** and wrapped in a modern **glass-morphism** (frosted-glass) HUD inspired by iOS/macOS 26.

## 2. Vision & Goals

- Make 3D creation feel like *talking*: anyone can summon objects into a living world with a single sentence.
- Keep **core mechanics rock-solid** regardless of which AI model the user has connected — object visual fidelity may scale with model quality, but movement, physics, controls, and world stability must never degrade.
- A calm, beautiful, low-poly planet that is fun to explore even before generating anything.
- A creator-friendly, tweakable system: every generated object is configurable through controls and a documented object API.

### Non-goals (v1)

- No shared/co-op world editing — each player explores their own instance (multiplayer co-presence is a future consideration).
- No light/dark mode toggle — a single real-world-synced day/night cycle drives lighting.
- No photorealism — the art direction is intentionally low-poly.
- No user-adjustable world scale at runtime — scale is configurable in development and locked at deploy.

## 3. Target Users & Personas

| Persona | Description | Primary need |
| --- | --- | --- |
| **The Explorer** | Wants to wander a pretty planet and mess around | Smooth navigation, satisfying world, instant fun |
| **The Prompter** | Loves typing wild ideas and watching them appear | Fast, reliable text-to-object generation |
| **The Tinkerer** | Selects objects and tunes every parameter | Rich object controls + clear configuration API |
| **AI Agents** | Programmatic actors generating/correcting objects | Object API + readable debug logs for self-correction |

## 4. Key Features & Requirements

### 4.1 World Design

- [ ]  Spherical **planet** world: globe containing multiple islands of varying sizes, surrounded by ocean.
- [ ]  **Low-poly / polygon** art style — intentionally simple, low-density textures, yet enjoyable to look at.
- [ ]  **Configurable scaling factor** during development (island size, planet size, etc.); locked to a single scale value at deploy time.
- [ ]  Scale & dev settings hidden under a **collapsible icon** in the UI so they don't clutter the player view.

### 4.2 UI & Controls (Glass Morphism)

- [ ]  All in-game HUD controls use **frosted-glass / glass-morphism** styling (iOS 26 / macOS 26 aesthetic).
- [ ]  Developer-customizable glass **transparency** and **frostness (blur amount)**.
- [ ]  No light/dark mode.
- [ ]  Clean, uncluttered HUD with advanced/dev settings tucked behind the collapsible icon.

### 4.3 Day / Night Cycle

- [ ]  **Real-world-synced** day/night cycle based on a single shared clock (US time), identical for all players simultaneously.
- [ ]  Drives sky, sun/moon position, ambient lighting, and ocean tones.

### 4.4 Per-User Game Instances

- [ ]  Each player receives their **own complete instance** of the world to explore freely.
- [ ]  Player state (spawned objects, positions, configs) persists per user.

### 4.5 AI Prompt & Object Generation

- [ ]  A **prompt box** toggle sits at **center-bottom** of the screen; clicking expands a single-line natural-language input.
- [ ]  Natural-language commands spawn objects (e.g. *"create a supercar"*, *"create the Taj Mahal"*, *"create a racing track"*).
- [ ]  Object quality (visual fidelity, complexity) scales with the user's AI model; **core mechanics remain solid** regardless of model quality.
- [ ]  Larger structures (e.g. Taj Mahal) may be explorable inside if the model supports the detail.

### 4.6 Object Controls & Configuration API

- [ ]  Selecting a spawned object expands an **object controls panel** in the **bottom-right**.
- [ ]  Panel has a **fixed defined size** with a **tab view** of settings and controls.
- [ ]  Controls include **sliders, checkboxes, and number steppers** with increment/decrement and **5×, 10×, 20× multipliers**.
- [ ]  A **guide / API reference** is surfaced to both users and agents, documenting the available configuration options per object.
- [ ]  Complex objects (e.g. racing tracks) can expose many configs (thickness, layout, etc.) depending on model capability.

### 4.7 Error Handling & Safety

- [ ]  Every spawned 3D object/model is wrapped in an **error boundary** to prevent bad generated code from crashing the game.
- [ ]  On error, the object is **removed silently** from the world.
- [ ]  A **top-right notification indicator** alerts the user to object errors.
- [ ]  Clicking the indicator opens a **debug log window** showing error-boundary logs.
- [ ]  AI agents have **programmatic access** to these debug logs for self-correction.

### 4.8 Physics System

- [ ]  Generated objects carry **physics properties** matching their real-world counterparts (mass, material, flammability, etc.).
- [ ]  Objects interact physically with each other and the world. Examples:
    - Fire + wood → wood ignites on contact.
    - Bowling ball + pins → correct collision and knockdown physics.

## 5. User Flows

### 5.1 Generate an object

1. Player clicks the center-bottom prompt toggle → single-line input expands.
2. Player types *"create a supercar"* and submits.
3. System generates the object (mesh + physics tags), wrapped in an error boundary.
4. Object spawns into the world; on failure it is removed silently and the top-right indicator lights up.

### 5.2 Configure an object

1. Player selects a spawned object → bottom-right controls panel expands.
2. Player navigates tabs and adjusts sliders/checkboxes/steppers (with 5×/10×/20× multipliers).
3. Changes apply live; object API reference is available for advanced tuning.

### 5.3 Inspect errors

1. Top-right indicator shows an error occurred.
2. Player clicks it → debug log window opens with error-boundary logs.
3. (Agents read the same logs programmatically to self-correct and re-generate.)

## 6. Success Metrics

| Goal | Metric |
| --- | --- |
| Generation reliability | % of prompts that spawn a stable, non-erroring object |
| Core stability | Crash-free sessions; FPS held above target on mid-tier hardware |
| Engagement | Avg. objects generated per session; session length |
| Tinkering | % of spawned objects that get configured via the panel |
| Recovery | % of errored objects auto-recovered by agent self-correction |

## 7. Open Questions

- Which generation approach is the v1 default — runtime parametric code generation, a text-to-3D mesh API, or a hybrid? (See Technical Implementation Doc for the recommendation.)
- Which specific "US time" timezone anchors the global clock (ET vs. PT)?
- Persistence scope: how long are a user's generated worlds retained?
- Do agents act within a player's instance automatically, or only on request?

## 8. Phased Scope

- **Phase 1 — Playable planet:** low-poly spherical world, islands + ocean, exploration controls, real-world day/night cycle, glass-morphism HUD shell.
- **Phase 2 — Generation core:** prompt box, object generation pipeline, error boundaries + notification/debug log, physics tagging.
- **Phase 3 — Tinkering & agents:** object controls panel, configuration API + reference, agent debug-log access and self-correction.
- **Phase 4 — Polish & scale lock:** performance tuning, scale lock at deploy, advanced object types (racing tracks, explorable interiors).