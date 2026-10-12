# ADR 0001: `@babel/parser` with a hand-written walker

- **Status:** Accepted
- **Date:** 2026-10-08
- **PRD reference:** D1, §10.1

## Context
EnvDrift has to find every environment variable read in `.js .jsx .mjs .cjs .ts .tsx .mts .cts` files, with an accurate file, line, and column. It also has to avoid false positives from comments and strings. A grep-style approach cannot tell `process.env.X` in code from the same text inside a comment, string, or template. Type information is not needed: the patterns are syntactic (see [patterns-catalogue.md](../../patterns-catalogue.md)).

## Decision
Parse every file with `@babel/parser`, using the plugins `jsx`, `typescript`, and `importMeta`, with `errorRecovery: true`. Walk the AST with a small hand-written recursive walker that handles only the node types the catalogue patterns need. Do not use `@babel/traverse`.

## Consequences
- Positive:
  - One dependency covers all eight file types.
  - Locations are accurate.
  - Comments and strings never count as references.
  - The walker is easy to test pattern by pattern.
- Negative:
  - There is no scope analysis, so detecting a shadowed `process` (catalogue N03) needs a minimal scope tracker of our own.
  - Babel columns are 0-based and must be converted to 1-based.
- Follow-up: a parse failure produces a warning and the file is counted as skipped ([system/error-handling.md](../../system/error-handling.md)).

## Alternatives considered
| Option | Why not |
|---|---|
| Regex / grep | Matches inside comments and strings. Cannot detect fallbacks or destructuring |
| TypeScript compiler API | Heavier and slower. Type info is not needed. Two code paths (JS vs TS) are tempting |
| `acorn` / `espree` | No TypeScript or JSX in one package |
| `@babel/traverse` | Large dependency. Scope tracking is more than we need |
| SWC / oxc (native) | Native binaries complicate `npx` and the Action on all platforms |

## Evidence / validation plan
- **Pending.** PRD v2.0 §5 cited a spike benchmark on umami: 82/82 names agreed with grep, and grep's one extra match was inside a comment, with a scan time under 1 s for 113 files. **The spike code does not exist in this repository** (found 9 Oct 2026). The benchmark will be re-run in **M0.3** (`scripts/spike-scan.ts`) and recorded in [benchmark.md](../../benchmark.md). If the result differs materially, this ADR is revisited.
- Per-pattern tests: one test per catalogue ID (M0.2).
- Performance target: 2,000 files in under 10 s ([system/nfr.md](../../system/nfr.md)).
