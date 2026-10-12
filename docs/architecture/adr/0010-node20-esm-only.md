# ADR 0010: Node ≥ 20, ESM only

- **Status:** Accepted
- **Date:** 2026-10-08
- **PRD reference:** D10, §8

## Context
The project needs a single module format and a supported runtime floor. Dual CJS/ESM publishing doubles the build and test matrix. Node 18 is end-of-life.

## Decision
- `"type": "module"` in every package. TypeScript uses `module: NodeNext`, targets ES2022, and runs in strict mode.
- `engines.node: ">=20"` in the published CLI package.
- tsup emits ESM only.
- The GitHub Action runs on the runner-provided `node24` runtime, which satisfies this floor ([modules-action.md](../modules-action.md)).

## Consequences
- Positive:
  - One build output.
  - Top-level `await`.
  - Native `import()` for lazy AWS SDK loading.
- Negative:
  - Cannot be `require()`d from CJS projects on older Node versions. This is acceptable, because the CLI is a bin and not a library.

## Alternatives considered
| Option | Why not |
|---|---|
| Dual CJS + ESM | Build complexity for no user benefit |
| Node ≥ 18 | EOL; missing newer `fs` and test-runner features |

## Evidence / validation plan
- CI runs on Node 20 and on the current LTS ([system/ci-cd.md](../../system/ci-cd.md)).
- M7.1: `npx` works on a clean machine.
