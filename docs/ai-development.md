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

## Token baseline

Measured 2026-10-13, before any workflow optimisation (Phase 0 of `docs/setup/workflow-setup-prompt.md`).

| Item | Value |
|---|---|
| Scenario | stub of rule ED006 (`rules/ED006.ts`) plus 1 test, reviewed the naive way |
| Naive flow | whole `docs/prd.md` read, whole `CLAUDE.md`, unfiltered `npm test` and `npm run typecheck`, free-form review |
| Total tokens (subagent usage report) | 49,297 |
| Tool calls | 14 |
| Wall time | 60.5 s |
| Result | CHANGES REQUESTED: 1 BLOCKER, 4 HIGH, 5 MEDIUM, 4 NIT |

Caveats:
- The run happened in an isolated worktree based on the repo's first commit (`d0f1f6b`), not `main`. It had no review or commit skills and a 570-line PRD (main has 571). Treat it as approximate.
- Test and typecheck output was about 12 lines, because the repo has almost no code yet. Output filtering will save little here; reading the PRD whole (about 12.5k tokens) is the main avoidable cost.
- Figures cover the subagent only, not the orchestrating session.
- For the Phase 6 comparison, use the same scenario and the same measure (subagent usage report) on a `main`-based branch.

## 8. What didn't work / lessons
