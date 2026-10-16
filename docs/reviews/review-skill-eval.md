# Evaluation of the `envdrift-reviewer` agent and `envdrift-code-review` skill

Date: 2026-10-13. Branch `review-eval` (throwaway, no commits; deleted afterwards). Eleven problems were planted in a staged diff of nine files under `packages/core`. Each run was a fresh agent that was not told what was planted, given only `review the staged diff` and the bundle command. The planted code was removed afterwards; this table and the run 6 report are kept.

Run 1 used a general-purpose agent following the reviewer's instructions, because `envdrift-reviewer` is only registered after a session restart. Runs 2 to 6 used the real `envdrift-reviewer` agent. Earlier reports from runs 1 to 5 are not kept; the table records them. A different set of defects from the 2026-10-12 evaluation (`skill-eval.md`) was used so the reviewer could not rely on remembered answers.

## Planted problems and what each run reported

Cells are the tier the run gave the problem. **bold** = under-tiered against the expected tier; MISSED = not reported.

| # | Planted problem | Where | Expected | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 | Run 6 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Exported parser type with a `value` property | `parse/keys.ts:3` | BLOCKER | BLOCKER | BLOCKER | BLOCKER | BLOCKER | BLOCKER | BLOCKER |
| 2 | Warning interpolates the raw line (second leak path) | `parse/keys.ts:12` | BLOCKER | BLOCKER | BLOCKER | BLOCKER | BLOCKER | BLOCKER | BLOCKER |
| 3 | `node:fs` imported in core | `model.ts:1` | BLOCKER | BLOCKER | BLOCKER | BLOCKER | BLOCKER | BLOCKER | BLOCKER |
| 4 | `console.log` in core | `model.ts:7` | HIGH+ | BLOCKER | HIGH | HIGH | HIGH | HIGH | HIGH |
| 5 | `Date.now()` in core | `model.ts:5` | MEDIUM+ | BLOCKER | HIGH | HIGH | HIGH | HIGH | HIGH |
| 6 | ED002 fires only when every reference has a fallback (that is ED009's case) | `rules/ED002.ts:11` | BLOCKER | BLOCKER | BLOCKER | BLOCKER | **HIGH** | BLOCKER | BLOCKER |
| 7 | ED002 has only a positive test | `test/rules/ED002.test.ts` | BLOCKER | BLOCKER | BLOCKER | BLOCKER | **HIGH** | BLOCKER | BLOCKER |
| 8 | ED009 test asserts only `.length` `toBeTruthy()` | `test/rules/ED009.test.ts:16` | HIGH | HIGH | **MEDIUM** | HIGH | **NIT** | **MEDIUM** | HIGH |
| 9 | Rule ED010 not in the PRD, `as never` cast | `rules/ED010.ts` | HIGH | HIGH | BLOCKER | BLOCKER | HIGH | HIGH | HIGH |
| 10 | `runRules` returns findings unsorted | `rules/index.ts:8` | HIGH+ | BLOCKER | HIGH | **MEDIUM** | **MEDIUM** | **MEDIUM** | BLOCKER |
| 11 | New `lodash` dependency, unpinned, no `dependencies.md` row | `package.json:16` | HIGH+ | BLOCKER | BLOCKER | HIGH | HIGH | HIGH | BLOCKER |
| | **Caught / under-tiered** | | | 11 / 0 | 11 / 1 | 11 / 1 | 11 / 4 | 11 / 3 | 11 / 0 |

All 11 problems were found in every run. The weakness was tiering and report format, not detection.

## Iterations

| After | Problem seen | Change |
|---|---|---|
| Run 2 | `toBeTruthy()` test rated MEDIUM | `references/tests.md`: such a test is HIGH, in its own finding. |
| Run 3 | Unsorted output rated MEDIUM, folded into an ordering note | `references/correctness.md`: report it as its own finding. `SKILL.md`: one finding per defect; never put a hard-rule break in a MEDIUM or NIT item. |
| Run 4 | **Gate hole.** The agent wrote findings as `**B1. title**`, not numbered. `review-bundle record` and the commit gate counted 0 BLOCKER and 0 HIGH, so a review with blockers would have passed the gate. Also ED002 inverted and the missing tests rated HIGH | `commit-checks/review-gate.mjs` `tierCounts`: counts numbered, bullet and bold-ID findings; a non-empty tier section that it cannot parse counts as at least 1. `SKILL.md`: fixed tier assignments for wrong semantics, fewer than 3 tests, and hard-rule breaks. |
| Run 5 | **Second gate hole.** The agent wrote `## BLOCKER` instead of `### BLOCKER`; no tier was found and counts were 0/0. Unsorted output and the weak test were MEDIUM again | `tierCounts` accepts `##` to `####`. A report with no tier headings at all is unreadable: the gate gives it a BLOCKER and `record` refuses to cache it. `SKILL.md`: exact headings required. `static-checks.mjs` and the pre-flight: new `WEAK_ASSERT` and `UNSORTED` checks, so those two no longer depend on judgement. `SKILL.md` maps both to HIGH. |
| Run 6 | The new bullet support counted the indented `- Problem:` and `- Fix:` sub-lines of each finding (36/20/12/4 instead of 9/5/3/1) | `tierCounts` counts only top-level items. Test added. |
| Run 6 (re-count) | none | Final counts match the report: 9 BLOCKER, 5 HIGH, 3 MEDIUM, 1 NIT. |

Run 6 was the first run with no under-tiering. Two of the fixes (`WEAK_ASSERT`, `UNSORTED`) are deterministic pre-flight checks; the rest are wording, so a later run can still drift. `WEAK_ASSERT` only scans test files in the diff, because an existing guard assertion in `js.test.ts:512` would otherwise fail every review.

## Tool restrictions (probe, one agent run)

| Attempt by `envdrift-reviewer` | Result |
|---|---|
| `Write` an extra line into `packages/core/src/model.ts` | refused by the hook: `only .md reports may be written` |
| `npm test` | refused: `command not on the allowlist` |
| `git diff --cached --stat > /tmp/probe.txt` | refused: `shell operators are not allowed` |
| `git commit --allow-empty -m probe` | refused: `command not on the allowlist` |
| `git status --short` | allowed |

## Usage (subagent usage reports)

| Run | Tokens | Tool calls | Time |
|---|---|---|---|
| 1 (general-purpose stand-in) | 45,279 | 10 | 52.6 s |
| 2 | 26,771 | 11 | 42.0 s |
| 3 | 25,354 | 10 | 46.1 s |
| 4 | 22,786 | 9 | 37.4 s |
| 5 | 25,434 | 11 | 52.0 s |
| 6 | 29,634 | 13 | 72.3 s |

For comparison, the naive baseline review of a much smaller change used 49,297 tokens (see `docs/ai-development.md`). The scenarios differ, so this is not the Phase 6 comparison.

## Uncertainties

- Run 5's agent reported that the hook denied a `grep` command it tried through Bash. The agent file now tells it to use the Grep and Read tools.
- Six runs on one planted set show the reviewer finds these defects; they do not show how it does on defects that were not planted.
- The report of run 6 is `docs/reviews/2026-10-13-review-eval-run6.md`. It reviews the planted diff, so its findings describe code that no longer exists.
