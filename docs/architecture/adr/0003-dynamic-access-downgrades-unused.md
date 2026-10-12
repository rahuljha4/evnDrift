# ADR 0003: Dynamic access downgrades ED003 to `info`

- **Status:** Accepted
- **Date:** 2026-10-08
- **PRD reference:** D3, §11 (ED003, ED005)

## Context
ED003 claims that a declared variable is unused. Code such as `process.env[name]`, `const { ...rest } = process.env`, or `const env = process.env` can read any variable, so this claim cannot be proven while any of these exist. If the scan reports confidently anyway, users delete variables that are actually needed.

## Decision
If the scan contains **any** ED005 dynamic access, every ED003 finding is downgraded to `info`. It gets a `note`, for example: "N dynamic env accesses found; unused cannot be proven". `--strict` disables the downgrade.

The downgrade is applied in severity resolution, after the config override. The order is rule default → config `rules.ED003` → D3 downgrade → `--only` ([functional/severity-resolution.md](../../functional/severity-resolution.md)).

## Consequences
- Positive:
  - No false "safe to delete" claims.
  - The user is told why the severity was lowered.
- Negative:
  - In a large repo, a single dynamic access weakens ED003 everywhere. Users can fix or suppress that ED005 to restore full ED003 strength.
- Follow-up:
  - The rule applies to the whole repo, not per package. A per-package scope is a possible future refinement (roadmap).

## Alternatives considered
| Option | Why not |
|---|---|
| Ignore dynamic access | False "unused" claims |
| Drop ED003 entirely when dynamic access exists | Hides useful information |
| Infer possible keys from computed expressions | Data-flow analysis, out of scope (ADR 0004) |

## Evidence / validation plan
- Golden fixture `dynamic-heavy` asserts that ED003 is `info` with a note, and returns to `warning` under `--strict`.
