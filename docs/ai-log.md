# AI log

Every time AI-generated work was wrong, weak or misleading, and a human or a check caught it, add a row here. Use the `/log-ai-failure` command. The **Context change** column is the point of the log: it records what was changed in `CLAUDE.md`, a command, the catalogue, a test or a doc so that the same mistake cannot happen again. If no context change was made, say why.

Target for submission ([PRD §4](prd.md#4-goals-non-goals-success-criteria)): **≥ 8 real entries**. Do not invent or embellish entries. Judges read this file.

| # | Date | Task | What the AI did | How it was caught | Impact if missed | Context change (file + summary) |
|---|---|---|---|---|---|---|
| 1 | 2026-10-12 | envdrift-code-review skill eval | The first version of the review skill (v1) could not say whether lint and format passed, because its pre-flight did not run them. In eval run 2 it also folded a value-leak path (a warning that quotes the raw line) into a different finding at HIGH instead of reporting it as its own BLOCKER. In run 3 it rated an unsorted findings array MEDIUM on the guess that a later stage sorts. | Planted-defect eval (docs/reviews/skill-eval.md): the run reports' Uncertainties section and a comparison with the answer key. | A leaked value is the one defect the product cannot ship with. Under-tiering or burying it would let a BLOCKER pass review. | `preflight.mjs` gained `LINT`, `FORMAT` and `WARN_LEAK`; SKILL.md: every leak path is its own BLOCKER; `references/security-and-redaction.md` and `references/correctness.md` updated. |
| 2 | 2026-10-12 | envdrift-code-review skill eval | A subagent's final hand-back message was the literal text "placeholder" while its report file was complete. | Opened the report file and compared it with the answer key instead of trusting the hand-back. | Grading from the hand-back would have scored the run as empty or invented its content. | No repo rule needed: docs/reviews/skill-eval.md states that grading uses the report files. |

## Categories (for the M7.3 summary)

- **Spec drift**: implemented something not in the PRD or catalogue.
- **Weak test**: the test passes but asserts too little. Usually exposed by Stryker (M6.1).
- **Value leak risk**: code path where a config value could reach output.
- **Purity breach**: I/O or `process.env` in `packages/core`.
- **Non-determinism**: unstable ordering, timestamps or Map iteration in output.
- **Tooling/config**: wrong flag, version or path.
