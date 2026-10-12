# ADR 0004: Report aliases as ED005; do not follow them

- **Status:** Accepted
- **Date:** 2026-10-08
- **PRD reference:** D4, §10.1

## Context
Code such as `const env = process.env; env.API_URL`, or `const { env } = process`, reads variables through an alias. Following aliases requires data-flow analysis: reassignments, function parameters, module boundaries. That is a large, error-prone feature, and any partial version would sometimes guess wrong.

## Decision
The extractor does **not** follow aliases. When it sees an alias it emits `DynamicAccess { kind: 'alias' }`, which becomes an ED005 finding (`info`). Whole-object escapes are reported the same way. Those include passing `process.env` to a function, spreading it, and calling `Object.keys(process.env)` (catalogue D04 and D05).

## Consequences
- Positive:
  - Deterministic.
  - No guessed references.
  - Users see exactly where precision is lost.
- Negative:
  - Reads through an alias are missed as references. They can cause ED001 and ED002 false negatives, and ED003 false positives. The ED003 case is mitigated by ADR 0003.
- Follow-up: alias following is on the roadmap ([PRD §24](../../prd.md#24-roadmap-post-hackathon-not-in-scope)).

## Alternatives considered
| Option | Why not |
|---|---|
| Follow `const` aliases within one scope | Partial and surprising. Still needs scope analysis. Can be revisited post-hackathon |
| Use the TypeScript checker | Heavy. Still incomplete across dynamic code |

## Evidence / validation plan
- Catalogue rows D04 and D05 have tests.
- The real-repo benchmark (M6.3) counts alias occurrences to size the roadmap item.
