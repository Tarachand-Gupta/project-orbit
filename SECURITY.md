# Security Policy

Thanks for helping keep Project Orbit and its players safe.

## Reporting a vulnerability

**Please report security issues privately — do not open a public issue for anything exploitable.**

Use GitHub's private reporting: on the repository, go to **Security → Report a vulnerability**
(GitHub Security Advisories). That opens a private channel with the maintainers.

Please include:

- what the issue is and where (file/endpoint/URL),
- steps to reproduce or a proof of concept,
- the impact you think it has.

You'll get an acknowledgement as soon as the maintainer sees it (this is a hobby project, so
expect days, not hours). Once a fix ships, we're happy to credit you unless you'd rather stay
anonymous.

## Scope

In scope:

- the web app and landing site (`src/`), the generation proxy (`api/generate.ts`,
  `src/server/`), the native desktop shell (`orbit-native/`), and the CI/release workflows.

Especially interesting: anything that could let a third party **abuse the public
`/api/generate` endpoint** (which is unauthenticated by design), reach a non-public network
from it (SSRF), or cause an owner/deployer to leak a key or incur cost.

Out of scope:

- a player entering their *own* API key and sending it to a *provider they chose* — that's the
  intended bring-your-own-key design, not a vulnerability;
- issues that require a malicious build a user installed themselves, or physical/local access to
  a player's machine;
- missing hardening that has no concrete exploit (please still mention it, just not as a
  vulnerability report).

## Design notes relevant to security

- **Bring-your-own-key, enforced in code.** The public deployment ships no server keys; the
  serverless function ignores provider env keys unless `ALLOW_SERVER_KEYS=1` is explicitly set.
- **The proxy is hardened**: per-client rate limiting, a same-origin check for browser callers,
  a request-body cap, generic upstream errors, and an SSRF guard that resolves custom endpoints
  and refuses private/loopback/link-local addresses (`src/server/ssrfGuard.ts`).
- Released desktop apps are **key-less** and **unsigned** — on macOS, right-click → Open the
  first time. Never distribute a locally-built `.app`; a local build can bake your dev `.env`
  key into the bundle.
