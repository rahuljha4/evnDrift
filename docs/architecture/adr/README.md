# Architecture Decision Records

ADRs 0001–0010 record the locked decisions D1–D10 from [PRD §6](../../prd.md#6-locked-decisions). ADR 0011 records D11, added in PRD v2.1. To change any of them, you need a PRD change-log entry **and** a new ADR that supersedes the old one. Use the [template](0000-template.md).

| ADR | PRD | Title | Status | Date |
|---|---|---|---|---|
| [0001](0001-babel-parser-hand-written-walker.md) | D1 | `@babel/parser` + hand-written walker | Accepted | 2026-10-08 |
| [0002](0002-exclude-test-files-by-default.md) | D2 | Exclude test files by default | Accepted | 2026-10-08 |
| [0003](0003-dynamic-access-downgrades-unused.md) | D3 | Dynamic access downgrades ED003 to info | Accepted | 2026-10-08 |
| [0004](0004-report-aliases-not-follow.md) | D4 | Report aliases as ED005; do not follow them | Accepted | 2026-10-08 |
| [0005](0005-fallback-missing-is-ed009.md) | D5 | Missing variable with fallback is ED009, not ED002 | Accepted | 2026-10-08 |
| [0006](0006-values-never-leave-parsers.md) | D6 | Values never leave parsers | Accepted | 2026-10-08 |
| [0007](0007-configurable-accessors.md) | D7 | Configurable wrapper accessors | Accepted | 2026-10-08 |
| [0008](0008-distribution-npm-and-action.md) | D8 | Distribute as npm package + GitHub Action | Accepted | 2026-10-08 |
| [0009](0009-no-ai-at-runtime.md) | D9 | No AI at runtime | Accepted | 2026-10-08 |
| [0010](0010-node20-esm-only.md) | D10 | Node ≥ 20, ESM only | Accepted | 2026-10-08 |
| [0011](0011-scoped-npm-package-name.md) | D11 | Scoped npm package name | Accepted | 2026-10-09 |
