# ADR 0005: Missing variable with a fallback is ED009, not ED002

- **Status:** Accepted
- **Date:** 2026-10-08
- **PRD reference:** D5, §11 (ED002, ED009)

## Context
`process.env.LOG_LEVEL ?? 'info'` does not crash when `LOG_LEVEL` is unset, but production silently runs with a dev default. Treating that as an `error` (ED002) fails builds for working code. Ignoring it hides a real risk.

## Decision
Two rules split the case. For environment E, when a referenced name is absent from all of E's sources:
- **ED002** (`error`) fires if **at least one** reference has no fallback. It reports the references that lack a fallback.
- **ED009** (`warning`) fires if **every** reference has a fallback. It reports all of those references.

A reference has a fallback when it uses one of the forms in catalogue rows F01–F05 (`??`, `||`, destructuring default, logical assignment, or a fallback through TS wrappers). The in/hasOwn checks (P12 and P13) also count. For accessors, a second argument counts too, as does being the left side of `??` or `||`.

## Consequences
- Positive: errors mean the app will crash. Warnings mean it silently uses a dev default.
- Negative: a fallback such as `|| ''` hides an effectively required variable. Users can promote ED009 to `error` with `rules: { ED009: error }`.

## Alternatives considered
| Option | Why not |
|---|---|
| Ignore fallbacks (always ED002) | Fails builds for working code; users disable the rule |
| Ignore references with fallbacks entirely | Silent dev defaults in production go unnoticed |

## Evidence / validation plan
- Each of ED002 and ED009 has three tests.
- A mixed case is tested explicitly: one reference with a fallback and one without, which gives ED002 only, reporting only the reference without a fallback.
