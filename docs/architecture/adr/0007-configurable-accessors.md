# ADR 0007: Configurable wrapper accessors

- **Status:** Accepted
- **Date:** 2026-10-08
- **PRD reference:** D7, §10.1

## Context
Many real codebases read env through wrappers such as `getEnv('X')`, `env.get('X')`, or `config.get('X')`. Without support for these, such repos look like they reference almost nothing, which produces a flood of ED003 findings and misses every ED001 and ED002.

## Decision
The config option `accessors: string[]` lists the callee names or member paths, for example `["getEnv", "env.get", "config.get"]`. For a matching call:
- If the first argument is a string literal, or a template literal with no expressions, it becomes a `Reference` with `via: 'accessor'`.
- If the first argument is anything else, it becomes ED005 `computed-key`.
- A fallback is detected when a second argument is present, or when the call is the left operand of `??` or `||`.
- The pre-filter also lets a file through when it contains any accessor name.

The default is `[]`, because there are no implicit accessors.

## Consequences
- Positive:
  - Static and deterministic.
  - Covers the most common real-world indirection.
- Negative:
  - Matching is by name only. A non-env function that happens to share the same name will produce false references, so users choose accessor names carefully.
  - Accessors are cut-order item 4: they are dropped if the schedule slips.

## Alternatives considered
| Option | Why not |
|---|---|
| Auto-detect wrappers | Needs data-flow analysis (ADR 0004) |
| Hard-code common names | Surprising false positives |

## Evidence / validation plan
- Catalogue rows A01–A04 have tests (M1.6).
- The real-repo benchmark includes at least one repo that uses a wrapper.
