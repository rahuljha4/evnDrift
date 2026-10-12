# ADR 0008: Distribute as an npm package plus a GitHub Action in the same repo

- **Status:** Accepted
- **Date:** 2026-10-08
- **PRD reference:** D8, §14, §19 M7.1

## Context
The tool has to run locally (J1, J3, J4) and in pull requests (J2). There is no budget or time for hosting. The judges must be able to install it and see it working.

## Decision
- The CLI is published to npm with a bin named `envdrift`. Users run it with `npx`. The package name is set by [ADR 0011](0011-scoped-npm-package-name.md).
- The GitHub Action lives in the same repository under `packages/action`. It is referenced as `uses: <gh-user>/envdrift@v0`, with a bundled `dist/index.js` on the tag.
- "Deployment" means a published package plus a working Action on a public demo repo PR.
- Fallback: if npm publishing is blocked, attach a packed tarball (`npm pack`) to the release.

## Consequences
- Positive:
  - No servers to run.
  - One version of the logic serves both the CLI and the Action.
- Negative:
  - The bundled Action `dist/` must be committed on release tags.
  - Actions are versioned by Git tags, separately from npm semver.
  - `uses: <gh-user>/envdrift@v0` needs `action.yml` at the repo root, but the stub is in `packages/action/`. Resolve before M4.2 (root `action.yml` recommended; see [modules-action.md](../modules-action.md)).

## Alternatives considered
| Option | Why not |
|---|---|
| Docker-based Action | Slower start-up, and an extra image to maintain |
| Separate Action repo | Two release processes; the versions drift |
| Hosted SaaS | Explicit non-goal |

## Evidence / validation plan
- M2.5: `npm pack` and `npx` smoke test in CI.
- M4.2: the Action runs on a public demo repo PR, and its comment updates in place.
- M7.1: `npx @rahulkumar/envdrift --version` works on a clean machine.
- Process: [system/release.md](../../system/release.md).
