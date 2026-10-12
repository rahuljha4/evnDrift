# ADR 0002: Exclude test files from references by default

- **Status:** Accepted
- **Date:** 2026-10-08
- **PRD reference:** D2, §12

## Context
Test files often read variables that are set only by the test harness or CI, such as `TEST_DATABASE_URL`. If those reads counted as references, EnvDrift would demand them in production (ED002) and in `.env.example` (ED001). The result would be noisy, non-actionable findings, which undermines goal 5 (low false-positive rate).

## Decision
The default `exclude` globs are:
```yaml
exclude:
  - "**/*.{test,spec}.*"
  - "**/__tests__/**"
  - "**/{test,tests,e2e,cypress}/**"
```
If the user supplies `exclude`, it **replaces** these defaults rather than merging with them.

## Consequences
- Positive: production findings reflect production code only.
- Negative:
  - A variable read only in tests and declared in `.env.example` will show up as ED003 (unused). Users can suppress it or add it to `ignore`.
  - Users who override `exclude` lose the defaults unless they copy them in. `init` writes the defaults out explicitly, so this is visible.

## Alternatives considered
| Option | Why not |
|---|---|
| Include tests, separate severity | Adds a concept (test references) to every rule |
| Merge user and default excludes | Users cannot re-include test dirs without a negation syntax |

## Evidence / validation plan
- Golden fixture `demo-app` contains a test file reading a test-only variable, and no finding appears for it.
- The real-repo benchmark (M6.3) records how many findings test files would have added.
