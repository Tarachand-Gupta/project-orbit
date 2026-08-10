# Contributing to Project Orbit

Thanks for wanting to make the sandbox weirder and better. This guide gets you from clone to
merged PR.

## Setup

```bash
git clone https://github.com/Tarachand-Gupta/project-orbit
cd project-orbit
npm install
npx playwright install chromium   # once, for the e2e suite
npm run dev                       # http://localhost:5191/play
```

- The dev server is **pinned to port 5191** (`strictPort`) — free it if something else holds it.
- No API keys needed: the `local` provider generates everything deterministically. AI providers
  are optional (`.env`, see README).
- The native macOS/Linux shell lives in `orbit-native/` and needs Zig 0.16 + the
  `@native-sdk/cli` npm package — only required if you're touching the shell. Read
  `orbit-native/CLAUDE.md` first.

## Branch model

| Branch | Purpose |
| --- | --- |
| `dev` | default branch — all PRs target this |
| `main` | release branch — merging `dev → main` publishes a GitHub release + deploys the site |

## Before you open a PR

Run the same three gates CI runs:

```bash
npm run typecheck   # must be clean
npm run test        # Vitest unit tests — add tests for new pure logic
npm run test:e2e    # Playwright — add an assertion for new user-facing features
```

The e2e suite uses the `local` provider and a fixed time of day so it's fast, free, and
deterministic — never make a test hit a real LLM API.

Tests tagged `@motion` assert real-time physics (driving speeds, walk distances) and only run
reliably on real hardware — CI skips them (GitHub's shared runners can't hold real-time
simulation under software WebGL), so **run the full suite locally before opening a PR**.

## Conventions (the short version)

- **Pure logic stays out of React.** Generation, physics math, placement, input mapping live in
  plain `.ts` modules (`src/objects/*.ts`, `src/world/*.ts`, `src/player/*.ts`) so they're
  unit-testable without a GL context. React components consume them.
- **The Object Spec is the contract.** Extending it means updating `src/objects/spec.ts`
  (+ `validateSpec`), `specSchema.ts` (Zod, for the AI SDK), and the docs together.
- Every spawned object stays wrapped in `ObjectErrorBoundary`; async failures route to
  `logError()` — a bad object must never crash the game.
- New interactive HUD elements get a `data-testid`.
- Match the flat-shaded, low-poly/pixel art direction.
- `CLAUDE.md` (root and `orbit-native/`) is the living architecture map — if your change makes
  it stale, update it in the same PR.

## Good first contributions

- New object **templates** (`src/objects/generator.ts`) — add keywords + a builder, plus a unit
  test. Instant gratification: your object becomes a ⚡ typeahead suggestion.
- New **materials** (`src/objects/materials.ts`) or **controls** wiring (`src/objects/tuning.ts`).
- World details: more building variety, river props, road decals (`src/world/`).
- Bug reports with a repro — the debug log (`L` in game, or `window.game.getLogs()`) is gold.

## PR checklist

- [ ] `npm run typecheck` · `npm run test` · `npm run test:e2e` all pass locally
- [ ] New pure logic has unit tests; new user-facing behavior has an e2e assertion
- [ ] No API keys, `.env` values, or build artifacts in the diff
- [ ] Screenshots/video for visual changes (headless: see `tests/e2e` for the SwiftShader flags)

## Code of conduct

Be kind, assume good intent, keep feedback about the code. This project follows the
[Contributor Covenant](CODE_OF_CONDUCT.md); by participating you agree to it. To report a
security issue, see [SECURITY.md](SECURITY.md).
