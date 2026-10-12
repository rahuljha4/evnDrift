# ADR 0011: Scoped npm package name

- **Status:** Accepted (scope is a placeholder until the npm account is confirmed)
- **Date:** 2026-10-09
- **PRD reference:** D11 (added in PRD v2.1), §21 risk "npm name `envdrift` taken"

## Context
PRD §21 listed the risk that `envdrift` might already be taken on npm. On 9 Oct 2026, `npm view envdrift` returned an existing package at version 2.0.1, so the unscoped name is not available. The PRD's planned fallback is a scoped name, `@<user>/envdrift`.

## Decision
- The published CLI package is **`@rahulkumar/envdrift`**. `rahulkumar` is a placeholder scope, to be replaced with the real npm username before M7.1. Replacing it is a single find-and-replace.
- The bin command stays **`envdrift`**. Install and run with `npx @rahulkumar/envdrift scan`, or install it globally and use `envdrift scan`.
- The internal core package is `@envdrift/core`. It is private and never published, being bundled into the CLI, so it needs no npm scope ownership.
- Publish with `npm publish --access public` ([system/release.md](../../system/release.md)).

## Consequences
- Positive: the conflict with the existing package is removed, and the bin name stays the same for users.
- Negative:
  - `npx` commands in the docs are longer.
  - The README and demo must use the scoped name.
- Follow-up:
  - Create or confirm the npm account and scope on day 1 of M2.
  - Replace the placeholder everywhere: package.json, README, docs, and the demo script.

## Alternatives considered
| Option | Why not |
|---|---|
| `envdrift-cli` (unscoped) | Owner chose a scoped name, per the PRD fallback |
| Rename the product | Branding is already in the PRD, the demo, and the docs |

## Evidence / validation plan
- M7.1: `npx @rahulkumar/envdrift --version` (or `npx @<real-scope>/envdrift --version`) works on a clean machine.
