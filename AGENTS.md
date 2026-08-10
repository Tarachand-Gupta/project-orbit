# AGENTS.md

Guidance for AI coding agents working in this repo:

- **Start with [CLAUDE.md](CLAUDE.md)** — project overview, architecture map, generation
  pipeline rules, and the dev/test workflow (typecheck + unit + e2e before calling anything
  done). Everything in it applies to all agents, not just Claude.
- The native macOS/Linux desktop shell has its own playbook:
  [orbit-native/CLAUDE.md](orbit-native/CLAUDE.md). Read it before touching anything under
  `orbit-native/`.
- Reusable game-development skills (asset pipelines, QA patterns, Three.js/R3F best practices,
  and more) live under [.agents/skills/](.agents/skills) — each has a `SKILL.md` entry point.
- A programmatic in-game API exists for agents: `window.game`
  (see [OBJECT_API.md](OBJECT_API.md)); `getLogs()` supports self-correction loops.
