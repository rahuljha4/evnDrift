# AI log

Every time AI-generated work was wrong, weak or misleading, and a human or a check caught it, add a row here. Use the `/log-ai-failure` command. The **Context change** column is the point of the log: it records what was changed in `CLAUDE.md`, a command, the catalogue, a test or a doc so that the same mistake cannot happen again. If no context change was made, say why.

Target for submission ([PRD §4](prd.md#4-goals-non-goals-success-criteria)): **≥ 8 real entries**. Do not invent or embellish entries. Judges read this file.

| # | Date | Task | What the AI did | How it was caught | Impact if missed | Context change (file + summary) |
|---|---|---|---|---|---|---|
| 1 | 2026-10-12 | envdrift-code-review skill eval | The first version of the review skill (v1) could not say whether lint and format passed, because its pre-flight did not run them. In eval run 2 it also folded a value-leak path (a warning that quotes the raw line) into a different finding at HIGH instead of reporting it as its own BLOCKER. In run 3 it rated an unsorted findings array MEDIUM on the guess that a later stage sorts. | Planted-defect eval (docs/reviews/skill-eval.md): the run reports' Uncertainties section and a comparison with the answer key. | A leaked value is the one defect the product cannot ship with. Under-tiering or burying it would let a BLOCKER pass review. | `preflight.mjs` gained `LINT`, `FORMAT` and `WARN_LEAK`; SKILL.md: every leak path is its own BLOCKER; `references/security-and-redaction.md` and `references/correctness.md` updated. |
| 2 | 2026-10-12 | envdrift-code-review skill eval | A subagent's final hand-back message was the literal text "placeholder" while its report file was complete. | Opened the report file and compared it with the answer key instead of trusting the hand-back. | Grading from the hand-back would have scored the run as empty or invented its content. | No repo rule needed: docs/reviews/skill-eval.md states that grading uses the report files. |
| 3 | 2026-10-12 | envdrift-commit skill eval | The skill wrote "the new test fails on the old splitter" into a fix commit message without having run it. | The subagent's own report admitted it had not run the old code; I then ran it (the claim was true, but unverified when written). | A commit message is permanent history and judged by reviewers; a confident claim that nobody ran can be wrong. | `references/message-writing.md`, `SKILL.md` and `docs/conventions/commits.md`: only verified behaviour goes into a message. |
| 4 | 2026-10-12 | envdrift-commit hook setup | Ran `git add -N .` while smoke-testing the review pre-flight, marking every untracked file as intent-to-add. | I noticed the stray command in the next step's output and restored the index with `git restore --staged .`; no content was lost. | An intent-to-add of the whole tree could have been committed by a later broad `git add`. | None needed in the repo; the skill already forbids `git add -A` and `git add .`. |
| 5 | 2026-10-12 | envdrift-commit hook setup | The first eval harness for case 7 only checked the rule ID `REV-1`, which is also printed when no report exists, so it could not prove the hash-mismatch path. | Reviewing my own test design before the second iteration. | The case would pass even if the hash comparison were broken. | The harness now also asserts the "stale" wording; recorded in `docs/reviews/commit-skill-eval.md`. |

## Categories (for the M7.3 summary)

- **Spec drift**: implemented something not in the PRD or catalogue.
- **Weak test**: the test passes but asserts too little. Usually exposed by Stryker (M6.1).
- **Value leak risk**: code path where a config value could reach output.
- **Purity breach**: I/O or `process.env` in `packages/core`.
- **Non-determinism**: unstable ordering, timestamps or Map iteration in output.
- **Tooling/config**: wrong flag, version or path.
