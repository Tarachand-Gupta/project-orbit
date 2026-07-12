# Project Orbit 🌴🚗

**Type it. It exists.** An open-source, AI-driven third-person sandbox game. Walk a pixel
character through a low-poly world — jungle hills, dirt roads, a settlement, a winding river —
and **summon physics objects by describing them**: "create a supercar", "create the Taj Mahal",
"create a campfire". If it drives, press **E** and drive it.

![Project Orbit gameplay](public/screenshot.png)

**[▶ Play in your browser](https://project-orbit-ten.vercel.app/play)** ·
**[⬇ Download the native app](https://github.com/Tarachand-Gupta/project-orbit/releases/latest)** (macOS / Linux) ·
**[Website](https://project-orbit-ten.vercel.app)**

## How it works

- **Typeahead**: known objects appear as ⚡ suggestions while you type and spawn **instantly**
  from a deterministic template engine — no API key, no network.
- **AI generation**: anything else is built part-by-part by a model (Gemini / DeepSeek / Kimi via
  the Vercel AI SDK) into a schema-validated **Object Spec** — low-poly primitives + physics tags
  + live controls. If the model fails, the local engine answers instead. Core mechanics never
  depend on a model.
- **Physics**: Rapier (Rust → WASM). Convex hulls, vehicles, fire propagation, ballistics.
- **Native app**: the same game ships as a real macOS/Linux desktop app (Zig + system WebView via
  the Vercel Native SDK) with retina rendering and FPS-style pointer capture. See
  [`orbit-native/`](orbit-native/).

## Quick start

```bash
npm install
npm run dev            # http://localhost:5191  (game at /play, landing page at /)
```

**Controls:** WASD / arrows walk · mouse look (click to lock, Esc frees) · Shift run · Space jump ·
**C** create · **E** enter/exit vehicles · **F** fire · **Z/X** kick/punch · **O/T/L** panels.

### AI generation (optional)

Put keys in `.env` (gitignored):

```
GEMINI_API_KEY=...           # Gemini 3.5 Flash (default provider)
DIGITALOCEAN_API_KEY=...     # serves Kimi k2.6 & DeepSeek v4 Pro
```

Keys stay **server-side**: the Vite dev middleware (and, in production, the Vercel function in
[`api/generate.ts`](api/generate.ts)) proxies generation. You can also bring your own key at
runtime from the ⚙ gear on the Create bar — it's stored only in your browser.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 5191 |
| `npm run build` | Type-check + production build |
| `npm run test` | Vitest unit tests (pure logic: generation, physics math, spec schema) |
| `npm run test:e2e` | Playwright headless tests (walk, drive, fly, spawn, persistence) |
| `npm run test:all` | Both |

First e2e run needs the browser: `npx playwright install chromium`.

## Programmatic API

`window.game` — `spawn`, `list`, `get`, `setConfig`, `describe`, `getLogs`, `save`, `load`,
`setProvider`, `setTimeOfDay`, … for power-users and AI agents (agents read `getLogs()` to
self-correct). See [`CLAUDE.md`](CLAUDE.md) for the architecture map.

## Repository layout

```
src/            the game (React + R3F + Rapier) and the landing page (src/site/)
api/            Vercel serverless generation proxy (production twin of the dev middleware)
orbit-native/   native desktop shell (Zig + WebView) — has its own CLAUDE.md
tests/e2e/      Playwright suite
docs/           performance notes, release/announcement drafts
```

## Contributing

PRs welcome — start with [CONTRIBUTING.md](CONTRIBUTING.md). Branch model: `dev` is the default
target; `main` is the release branch (merges to `main` publish a GitHub release and deploy the
site). Maintainer playbook: [MAINTAINING.md](MAINTAINING.md).

## Roadmap

- **[Iterate on existing objects](https://github.com/Tarachand-Gupta/project-orbit/issues/1)** —
  select something you spawned and refine it with follow-up prompts ("make the wheels bigger").
  Design sketch in the issue; help wanted.
- WebGPU / physics-worker adoption criteria: see [docs/performance.md](docs/performance.md).

## Performance posture

WebGL2 everywhere (the only GPU API that is stable on every OS/browser today), aggressive
instancing, low-DPR pixel-art rendering, main-thread Rapier. Why not WebGPU/workers yet — and
what would earn them — is written up in [docs/performance.md](docs/performance.md).

## License

[MIT](LICENSE) © 2026 Tarachand Gupta
