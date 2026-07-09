# Project Orbit — Native macOS app

A native **macOS desktop build** of Project Orbit, built with the
[Native SDK](https://native-sdk.dev) (a Zig-powered, cross-platform native shell that hosts a
WebView). This lives in the same repo as the game as a lightweight monorepo package so it shares
the same git history and the same `.env`.

## How it works

The native shell is a tiny Zig app (`src/main.zig`) that opens a real AppKit window and renders
its content in a system **WKWebView**. The WebView content **is the root Project Orbit game** —
there is no forked copy of the game here. `frontend/` is a thin shim whose `dev`/`build` scripts
delegate to the root game (`../..`):

- **Dev**   → the shell loads the root game's Vite dev server at `http://127.0.0.1:5191/?native=1`.
- **Packaged** → `frontend/dist` is a copy of the root game's production `dist`, served from the
  `zero://app` origin.

`?native=1` (and the `zero://` origin in packaged builds) flips the game into a refined rendering
path (`src/config/native.ts` in the root): full retina DPR, higher-resolution sun shadows, and a
richer bloom.

## Prerequisites

- Node.js + npm
- [Zig](https://ziglang.org) `0.16.x`  (`brew install zig`)
- Xcode command-line tools (for the macOS system SDK / WebKit)
- The Native SDK CLI: `npm install -g @native-sdk/cli`

## Commands (run from this folder)

```bash
zig build dev        # start the root game's Vite server + open the native window (hot reload)
zig build run        # build the game once and run against bundled assets
zig build package    # produce zig-out/package/…-macos-….app
zig build test       # native shell unit tests
native validate app.zon
```

For an optimized release:

```bash
zig build package -Doptimize=ReleaseFast
```

## AI object generation & `.env`

The game's AI enrichment (Gemini) is served by the root project's Vite dev middleware, which reads
`GEMINI_API_KEY` from the repo-root `.env` (server-side, never bundled). So **AI generation is live
in `zig build dev` / `zig build run`**. In a fully self-contained packaged `.app` there is no dev
server, so object generation gracefully falls back to the deterministic local template engine
(the game is offline-first by design). Wiring a native Zig bridge that proxies to Gemini using the
same key is the follow-up if AI enrichment is wanted in the standalone bundle.
