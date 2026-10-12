# How AI was used to build EnvDrift

> Skeleton written in M0.0; completed in M7.3. Hackathon criterion: [PRD §17](prd.md#17-ai-assisted-development-plan-35-of-the-score) (35 % of the score) and [§22](prd.md#22-hackathon-submission-mapping).

## 1. Summary
<!-- 5 lines: tools, model(s), what share of code/tests/docs were AI-drafted, what humans always did. -->

## 2. Context engineering
- `CLAUDE.md`: hard rules and workflow. Changes over time are listed in git log and linked from the AI log.
- `docs/prd.md`: the source of truth for *what* to build. The change log shows each version.
- `docs/patterns-catalogue.md`: shared contract between the human, the AI and the tests.
- `docs/functional/`, `docs/architecture/`, `docs/system/`: specs the AI reads before each task.

## 3. Custom commands
| Command | What it does | Times used | Example commit |
|---|---|---|---|
| `/add-rule` | | | |
| `/add-pattern` | | | |
| `/review` | | | |
| `/log-ai-failure` | | | |

## 4. AI across the lifecycle
| Stage | How AI was used | Human control |
|---|---|---|
| Requirements | | |
| Architecture & ADRs | | |
| Implementation | | |
| Testing | | |
| Review | | |
| Docs & release | | |

## 5. Best AI-log entries (3–5, before → after)
<!-- Pull from ai-log.md; for each: what happened, how caught, context change, evidence link. -->

## 6. AI-assisted QA: mutation testing
<!-- Stryker score before/after, which AI-written tests were weak, how they were strengthened. Link benchmark.md §4. -->

## 7. Guardrails
- Values never leave parsers (ADR 0006) + end-to-end redaction test.
- Core purity enforced by ESLint.
- Plan mode, then tests first, then `/review`, then a human reads the diff before each commit.

## 8. What didn't work / lessons
