# Evaluation of the `envdrift-code-review` skill

Date: 2026-10-12. Method: plant known defects as an **uncommitted** diff on `main`, run the skill in a **fresh subagent that was not told what was planted**, then compare the report with the answer key. The planted code was removed afterwards; only the reports and this table are kept.

Deviation from the request: no `skill-eval` branch was created. You asked for the eval to be committed on the same branch as the other work, so the planted diff lived uncommitted on `main` and was reverted by explicit path. Run reports are saved as `skill-eval-run1.md` .. `skill-eval-run3.md` (one per iteration) instead of one file, so each iteration stays readable. The skill's own default filename was overridden for these runs.

## Planted problems (12)

| # | Planted problem | Where | Expected tier | Run 1 | Run 2 | Run 3 |
|---|---|---|---|---|---|---|
| 1 | Parser result type has a `value` property and returns values | `parse/keys.ts:5` | BLOCKER | BLOCKER | BLOCKER | BLOCKER |
| 2 | `node:fs` imported in core | `model.ts:1` | BLOCKER | BLOCKER | BLOCKER | BLOCKER |
| 3 | Rule with only a positive test | `rules/ED001` | BLOCKER | BLOCKER (merged with #9) | BLOCKER | BLOCKER |
| 4 | ED009 fires when a fallback is absent (inverted) | `rules/ED009.ts:8` | BLOCKER | BLOCKER | BLOCKER | BLOCKER |
| 5 | Test that only checks `toBeTruthy()` | `ED009.test.ts` | HIGH | HIGH | HIGH | HIGH |
| 6 | Unsorted findings array | `rules/index.ts:7` | HIGH or BLOCKER | BLOCKER (merged with #10) | HIGH | **MEDIUM (under-tiered)** |
| 7 | `console.log` in core | `rules/ED001.ts:9` | HIGH or above | BLOCKER | BLOCKER | BLOCKER |
| 8 | Unpinned `lodash` with no `dependencies.md` row | `packages/core/package.json:16` | HIGH or BLOCKER | HIGH | BLOCKER | BLOCKER |
| 9 | Behaviour outside the PRD (rule ED010, `as never` cast) | `rules/ED010.ts` | HIGH | BLOCKER (merged with #3) | HIGH | HIGH |
| 10 | `Date.now()` in core | `model.ts:3` | MEDIUM or HIGH | BLOCKER (merged with #6) | MEDIUM | MEDIUM |
| 11 | Warning interpolates the raw line (value-leak path) | `parse/keys.ts:18` | BLOCKER | BLOCKER | **HIGH, buried in another finding (partial miss)** | BLOCKER (own finding) |
| 12 | `as any` without a comment | `rules/ED001.ts:5` | MEDIUM or above | MEDIUM | HIGH | HIGH |

Caught in every run: 12 of 12. Run 2 was a partial miss on #11 (wrong tier and not its own finding). Run 3 under-tiered #6.

## Iteration log

| Iteration | Skill state | Result | Change made |
|---|---|---|---|
| 1 | v1: SKILL.md, 6 checklists, pre-flight with `TEST TYPECHECK CORE_IO CONSOLE VALUE_PROP NEW_DEP RULE_TESTS PATTERN_IDS` | 12/12 caught; verdict CHANGES REQUIRED; 7 BLOCKER. The report's Uncertainties said lint and format were not run, so lint-only evidence (the ESLint core-purity rule) was unverified. | Added `LINT` and `FORMAT` checks (format only on files in scope, because a repo-wide check also flags unrelated local files). |
| 2 | v1 + LINT/FORMAT | 12/12 caught, lint/format now reported. **Partial miss:** #11, the warning that quotes a raw line, was folded into a "duplicate parser" finding at HIGH. | Added the `WARN_LEAK` pre-flight check (AST: `warnings.push` / `new Error` arguments that interpolate `line`, `raw`, `text`, `content`, `value`, …). Checked it has no false positives on the committed code. Added a SKILL.md rule: every value-leak path is its own BLOCKER; added the matching line to the security checklist. |
| 3 | v1 + LINT/FORMAT/WARN_LEAK | 12/12 caught; #11 is its own BLOCKER. **Tier drift:** #6 (unsorted output) was MEDIUM with a hedge ("harmless if a later sort stage applies"). | Added a line to `correctness.md`: handing findings out of core without the sort is a hard-rule-5 finding, and a later stage may only excuse it if that stage exists and is cited. **Not re-run after this last edit.** |

## What this evaluation does and does not show

- The pre-flight alone catches 6 of the 12 (#1, #2, #3, #7, #8, #10; plus #11 after iteration 2). The other defects need the manual review: ED009 inversion (#4), weak assertion (#5), unsorted output (#6), unrequested scope (#9), `any` (#12). All of those were found by the reviewer in all three runs, so the checklists do work.
- Planted defects were written by the same AI that wrote the skill, so they are probably easier to spot than real ones. 12 problems in a small diff is also far denser than a real review.
- Run-to-run variation in tiers is real (#6, #8, #9, #10, #12 moved between runs). The tier rules are guidance, not a guarantee.
- The reviewer also found genuine defects in the planted code that were **not** planted (for example ED001 firing on every reference when no example is configured, and message/fix text that differs from `docs/functional/rules/ED001.md`). Those are not counted in the table.
- Run 1's subagent hand-back message was the literal text `placeholder`, although its report file was complete. Grading was therefore done from the report files, not from the hand-backs.
- Reproduce: plant the defects, then ask a fresh agent to "review the uncommitted changes under packages/ with the envdrift-code-review skill". Answer key and the planted files are not kept in the repo on purpose.
