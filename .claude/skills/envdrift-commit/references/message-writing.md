# Writing the commit message

Source: `docs/conventions/commits.md` §1.1 and §1.2. If this file and that one disagree, that one wins.

## Before you write anything

1. `git diff --cached` in full, not only `--stat`. A message written from file names says nothing.
2. The PRD section for the task (`docs/prd.md` §19 row for the scope, plus the section it cites, usually §11 for rules or §10 for parsing). The *why* usually lives there.
3. The staged tests: open them. The tests line may only list what they actually assert.
4. The conversation: the user's reason for the change counts as a source for the *why*.

## Shape

```
<type>(<scope>): <imperative summary, lower-case, no period, ≤ 72 chars in the whole subject>

<why: the problem or PRD requirement, citing the section or decision>

<what: the approach in plain words; edge cases, trade-offs, what was left out>

Tests: <what the staged tests cover>

Refs: docs/prd.md §<section>
Dependency: <name> — <reason>          (one per added dependency)
No-test-reason: <reason>               (source changed, no test changed)
AI-log: #<n>                           (ai-log.md gained row n)
```

- For `fix`: the *what* paragraph also says what the wrong behaviour was, how it was found, and how the fix stops it coming back.
- Wrap at 72 characters. No bullet lists of file names.
- Choose `scope` from the PRD §19 task ID. `repo` only for docs, chore, ci and build commits that belong to no task.

## Self-check before showing the draft (rewrite if any answer is no)

- [ ] Does the subject say what the commit does to the product, in words a reader can understand without the diff? Is it imperative (add, handle, reject), not past tense or -ing?
- [ ] Is it free of vague words (fix, update, changes, misc, cleanup, stuff, minor, small) used as the whole summary, of emojis and of "WIP"?
- [ ] Does paragraph 1 say *why*, with a PRD section or decision? Is that reason actually supported by the diff, the PRD or the conversation? If not, ask one question.
- [ ] Does paragraph 2 say *what*, including non-obvious edge cases and what was deliberately left out?
- [ ] Does the tests line match the staged tests, case by case? Nothing claimed that is not asserted.
- [ ] Is every statement about behaviour **verified**, not reasoned? A claim such as "the new test fails on the old code" or "this was silent before" may go into the message only if you ran it in this session (the old source is available with `git show HEAD:<path>`; you must not edit files to try it, so ask the user to run it or leave the claim out). Reasoned-but-unrun statements are dropped or phrased as what the diff shows. Do not write "X was not checked" into the message either: a commit message states what is true, and open questions go in your reply to the user.
- [ ] Are the trailers right: `Refs` for feat/fix, `Dependency` per added dependency, `No-test-reason` if source changed without tests, `AI-log` if the log gained rows?
- [ ] Does `node scripts/commit-checks/cli.mjs msg <file>` pass?

## Examples

Bad: `feat(M1.5): update rules` (what rules? why?), `fix(M2.1): fix bug`, `chore(repo): changes`, `feat(M1.5): added ED009 rule` (past tense).
Good: `feat(M1.5): flag missing variables with fallbacks as ED009`. Full message: see the example in the conventions document.
