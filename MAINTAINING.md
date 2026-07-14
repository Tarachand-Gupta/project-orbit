# Maintainer playbook

For the repo owner: how to review contributions, cut releases, and keep the deploy healthy.

## The flow at a glance

```
contributor PR ──▶ dev (default branch, CI must pass) ──▶ merge dev → main
                                                             │
                                          ┌──────────────────┴──────────────────┐
                                          ▼                                     ▼
                              GitHub Actions "release"                Vercel production deploy
                              (macOS .app + Linux build                (project-orbit.vercel.app)
                               attached to a GitHub Release)
```

The website's download buttons point at `releases/latest/download/<asset>` — they always serve
the newest release automatically. Nothing to update by hand.

## Reviewing a PR (checklist)

1. **CI is green** — the `ci` workflow runs typecheck + unit + e2e on every PR. Red = don't merge.
2. **Read the diff for the three repo rules:**
   - pure logic in plain `.ts` (unit-testable), not buried in components;
   - Object Spec changes touch `spec.ts` + `specSchema.ts` + validation together;
   - no secrets, no committed build artifacts (`dist/`, `zig-out/`, `native-config.json`).
3. **Run it if the change is visual or physical** — `npm run dev`, spawn things, drive a car.
   CI can't feel gameplay.
4. **Native-shell changes** (`orbit-native/`): also run `zig build && zig build test` and read
   the gotchas in `orbit-native/CLAUDE.md` — WKWebView regressions (beep, pointer capture,
   boot-timing physics) are the usual suspects.
5. Squash-merge into `dev` with a descriptive title — it becomes the changelog line.

## Cutting a release

```bash
git checkout main && git pull
git merge dev            # or open a dev → main PR (nicer audit trail)
git push origin main
```

That push triggers:
- **`release` workflow**: packages the native app on macOS + Linux runners and publishes a
  GitHub Release tagged `v<version>-build.<n>` with stable asset names
  (`Project-Orbit-macOS.zip`, `Project-Orbit-linux-x64.tar.gz`).
- **Vercel**: production deploy of the site + game + `/api/generate` function.

Bump `version` in `package.json` on `dev` when you want the release tag to advance.

## Secrets & keys (important)

**Policy: production is bring-your-own-key, always.** No server key is ever configured — not
on Vercel, not in CI, not in release artifacts. Players paste their own key in the ⚙ settings;
the proxy only relays it per-request. An open-source project's own key in a public deployment
would be drained within hours.

| Where | What | Notes |
| --- | --- | --- |
| local `.env` | `GEMINI_API_KEY`, `DIGITALOCEAN_API_KEY` | gitignored; dev-middleware convenience only, and **baked into locally-packaged .apps** — never distribute a locally-built .app |
| Vercel env | **nothing, by policy** | `/api/generate` returns "add your own key in the ⚙ settings" when a request arrives without one |
| GitHub Actions | none | release builds ship key-less apps for the same reason |

## When CI fails on main

The release job is allowed to fail without blocking the deploy (Vercel deploys independently).
Check the Actions tab; the usual culprits are toolchain drift (Zig version, `@native-sdk/cli`
version) — both are pinned in `.github/workflows/release.yml`, update them there.

## Community

- Label friendly work `good first issue` — templates/materials/world props are the best entry
  points (see CONTRIBUTING.md).
- Close PRs that add heavy dependencies for small wins; the whole game budget is "loads fast on
  a school Chromebook".
