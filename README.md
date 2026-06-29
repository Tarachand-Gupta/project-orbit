# Project Orbit 🌴🚗

A browser-based, AI-driven third-person sandbox game. Walk a **pixel character** through a large
explorable world — jungle hills, dirt roads, a settlement, and a winding river — and **summon
physics objects by typing**: "create a supercar", "create the Taj Mahal", "create a campfire".
Create a car and you can **get in and drive it** over the terrain. Real-world-synced day/night,
frosted-glass HUD.

React + Three.js (R3F) + Rapier physics + Zustand. Object generation runs **offline by default**
(deterministic templates) and is **enriched by AI** (Vercel AI SDK → Gemini / DeepSeek / Kimi)
when configured.

## Quick start

```bash
npm install
npm run dev            # http://localhost:5191
```

**Controls:** WASD / arrows to walk · mouse (click to lock) to look · Shift run · Space jump ·
**E** to drive a car you created · the ✦ bar (center-bottom) to create anything. The gear
(top-left) opens dev/scale/time settings.

### AI generation (optional)

Put keys in `.env` (already gitignored):

```
GEMINI_API_KEY=...
DIGITALOCEAN_API_KEY=...     # serves Kimi k2.6 & DeepSeek v4 Pro
```

Pick a provider in the dev panel (default **Gemini 3.5 Flash**). Keys are used **server-side only**
via a Vite dev-middleware proxy (`/api/generate`) and never reach the browser. Without keys the
game still works fully on the local generator.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 5191 |
| `npm run build` | Type-check + production build |
| `npm run test` | Vitest unit tests |
| `npm run test:e2e` | Playwright headless tests (walk + drive + spawn + persistence) |
| `npm run test:all` | Unit + e2e |

First e2e run needs the browser: `npx playwright install chromium`.

## How generation works

A prompt becomes a schema-validated **Object Spec** (parts + physics tags + config), built into
low-poly Three.js primitives instantly. With AI enabled, the spec is upgraded asynchronously by
the model (via the AI SDK's `generateObject` with a Zod schema) — so weak/slow models can never
break core mechanics; they only raise fidelity.

## Programmatic API

`window.game` — `spawn`, `list`, `get`, `setConfig`, `describe`, `getLogs`, `save`, `load`,
`setProvider`, `setTimeOfDay`, … for power-users and AI agents (agents read `getLogs()` to
self-correct). See `CLAUDE.md` for the full map.
