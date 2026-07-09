# CLAUDE.md — orbit-native (native macOS app)

Complete handoff brief for agents working on the **native macOS build** of Project Orbit.
Read the root `CLAUDE.md` first for the game itself; this file covers everything native.

## What this is and how it was built (July 2026)

Project Orbit packaged as a real macOS app using the **Vercel Native SDK**
(https://native-sdk.dev — a Zig-powered cross-platform shell that hosts a WebView).
Scaffolded with `native init orbit-native --frontend vite`, then rewired:

- **No forked game code.** `frontend/` is a thin shim; its `dev`/`build` npm scripts delegate to
  the root game (`npm --prefix ../..`). The WebView renders the actual root game.
  - Dev: the shell loads `http://127.0.0.1:5191/?native=1` (the root Vite server).
  - Packaged: `frontend/dist` is a copy of the root `dist`, served from the `zero://app` origin.
- **Native fidelity mode**: `../src/config/native.ts` detects the shell (`?native=1` in dev,
  `zero:` protocol / `window.zero` when packaged), sets `document.documentElement.dataset.native`,
  and raises fidelity: retina DPR, 2048² sun-shadow map (`Lighting.tsx`), richer bloom
  (`PostFX.tsx`). All guarded by `IS_NATIVE` — browser + e2e paths are unchanged.
- Identity: bundle id `dev.orbit.project-orbit`, display name **Project Orbit**, window 1280×800.
  Kept in sync in BOTH `app.zon` and `src/main.zig` (`runWithOptions` + `dev_origins`) — the
  manifest does not auto-propagate into the Zig runner; change them together.

Status: everything below is verified working. Committed on branch **`native-macos-app`**
(kept off `main` for review; no git remote is configured yet, so nothing is pushed).

## Toolchain (all already installed on this machine)

- `native` CLI 0.4.0 (`npm install -g @native-sdk/cli`), Zig **0.16.0** (`brew install zig`,
  in `/opt/homebrew/bin` — export PATH if a shell can't find it), Xcode CLT, Node 20.
- `native doctor` checks the toolchain. `native skills get core|native-ui|automation` prints the
  SDK's own agent guides — **read `core` before non-trivial shell changes**; don't rely on model
  knowledge of this SDK, it's too new.

## Commands (run from `orbit-native/`)

```bash
zig build                      # compile the shell binary only (fast sanity check)
zig build dev                  # root Vite on :5191 + native window w/ hot reload  ← daily driver
zig build dev -Dautomation=true# same, plus the automation harness (see Testing)
zig build run                  # build game dist once, run shell against bundled assets
zig build test                 # Zig unit tests — run WITH `zig build` (lazy-analysis gotcha)
zig build package              # → zig-out/package/orbit-native-0.1.0-macos-Debug.app
zig build package -Doptimize=ReleaseFast   # optimized .app
native validate app.zon        # manifest check
open zig-out/package/*.app     # launch the packaged app
```

## How to test (agent playbook)

Layered, cheapest first. After ANY change run 1–3; run 4–5 when the change affects the shell,
rendering fidelity, or packaging.

1. **Root game checks** (from repo root): `npm run typecheck` · `npm run test` (116 unit tests)
   · `npm run test:e2e` (20 Playwright tests: render/HUD/spawn/walk/drive/fly/weapons/persist).
   E2E exercises the exact frontend the native app renders. Port 5191 must be free — kill stale
   Vite: `lsof -ti tcp:5191 | xargs kill`.
2. **Shell checks** (from `orbit-native/`): `zig build && zig build test` · `native validate app.zon`.
3. **Automation harness** (headless-ish runtime smoke; works without any permission grants):
   ```bash
   zig build dev -Dautomation=true      # or run the packaged binary from this cwd
   native automate wait                 # blocks until ready=true
   native automate assert 'ready=true' 'url="http://127.0.0.1:5191/\?native=1"'
   native automate snapshot             # window + webview metadata
   ```
   Files live in `.zig-cache/native-sdk-automation/` **relative to the cwd the app ran from**.
   It verifies the shell (window, source URL, frames) but CANNOT capture WebView pixels or DOM.
4. **Pixel proof** (needs macOS **Screen Recording** permission — already granted to this
   environment): `osascript -e 'tell application id "dev.orbit.project-orbit" to activate'`,
   then `screencapture -x -o shot.png` and READ the image. Expect: window titled "Project
   Orbit", low-poly world, glass HUD, **60 fps** in the perf pill (top-left). A wallpaper-only
   image means Screen Recording is NOT actually granted — `screencapture` exits 0 regardless,
   so always look at the image before trusting it.
5. **Interactive play-test** (needs computer-use approval for `dev.orbit.project-orbit` — only
   grantable in an interactive session, NOT in scheduled runs; `request_access` in a scheduled
   run fails permanently, don't retry). Once granted: click the window, then WASD walk, `C` or
   `/` opens the prompt box (type e.g. "create a car" and check an object appears), `E` near a
   vehicle to enter/drive, arrows steer. The game also exposes `window.game` (spawn/list/save…)
   and DEV-only `window.__orbitTest` — in dev mode you can drive those through the Vite page in
   a normal browser at `http://127.0.0.1:5191/?native=1` for the same code path minus the shell.

## AI generation & .env (important nuance)

Gemini enrichment is served by the ROOT project's Vite dev middleware (`POST /api/generate`,
key `GEMINI_API_KEY` from repo-root `.env`, server-side only). Therefore:
- `zig build dev` / `zig build run` → AI generation **works** (dev middleware present).
- packaged `.app` standalone → no dev server → enrichment fails gracefully → deterministic
  **local template objects** (offline-first by design). A "LLM (gemini) error, kept local object"
  line in the in-game Debug log is this fallback working, NOT a bug.
- Follow-up if standalone AI is wanted: add a Zig bridge command (`native skills get core`,
  "Add a native bridge command" recipe) that proxies to Gemini with the same key, and point
  `src/objects/llm.ts` at `window.zero.invoke(...)` when `IS_NATIVE && !dev`.

## Adding features — which layer

| Change | Where |
|---|---|
| Game behavior/UI/rendering | Root `src/` (normal game workflow; native inherits it) |
| Native-only rendering tweaks | `../src/config/native.ts` flags, consumed by Scene/Lighting/PostFX |
| Window size/title, permissions, origins, packaging | `app.zon` **and mirror in `src/main.zig`** |
| Native capabilities (dialogs, more windows, bridge commands) | `src/main.zig` (handlers) + `src/runner.zig` (policy) + `app.zon` (allowlist) — see `native skills get core --full` |
| Build steps | `build.zig` (frontend build/copy is `frontend/package.json`'s `build` script) |

## Gotchas (hard-won, don't rediscover)

- **Port is 5191, not 5173** (root Vite pins it with `strictPort`). It appears in `app.zon`
  (dev url + allowed_origins) and `src/main.zig` (`dev_origins`). 5173 references from the
  scaffold are gone — don't reintroduce them.
- `zig build test` alone can pass on broken code (Zig lazy analysis) — always pair with `zig build`.
- `build.zig` hardcodes `default_native_sdk_path` into the global npm install of the CLI; if the
  CLI is updated/moved, pass `-Dnative-sdk-path=...` or regenerate.
- Build artifacts are gitignored: `orbit-native/zig-out`, `orbit-native/.zig-cache`,
  `orbit-native/frontend/dist`. Don't commit them.
- The packaged `.app` is unsigned (`--signing none` default) — fine locally; signing/notarization
  via `native package --signing identity` when distribution matters.
- macOS `screencapture` silently returns wallpaper-only shots without Screen Recording permission
  (exit code still 0) — verify image content, and prefer `native automate` assertions for CI.
- Computer-use `request_access` needs the app running as a **bundled .app** (a bare zig-out
  binary has no stable identity to grant); use bundle id `dev.orbit.project-orbit`.
- The e2e suite and the native dev shell can't run simultaneously (both want port 5191).
- **WKWebView ≠ Chromium — test rendering bugs with Playwright's `webkit` engine.** The player
  used to spawn buried to the waist ONLY in the native app: WebKit's slower prod boot let the
  capsule fall into the still-building terrain trimesh and wedge inside it (Chromium's timing
  skipped the window; dev builds skipped it too). Player.tsx now holds the capsule (gravity off,
  glued to the analytic surface) until a downward raycast confirms a collider beneath. If a bug
  appears only in the native app, reproduce with `npx playwright install webkit` + a headless
  `webkit.launch()` against `npm run preview` (prod build!) before touching Zig — engine + build
  mode are the usual suspects, and headless WebKit iterates 10× faster than repackaging.

## Current verified state (2026-07-09)

- `zig build` clean (7.25 MB binary, WebKit linked) · `zig build test` pass · manifest valid.
- `zig build package` produced `orbit-native-0.1.0-macos-Debug.app`; launched; screenshots show
  the world at 60 fps with the refined native path active.
- Root: typecheck clean, 116/116 vitest, 20/20 Playwright e2e.
- Not yet done: git remote/push, release signing, standalone-bundle AI bridge (see above),
  app icon is still the SDK default (`assets/icon.png`).
