---
name: envdrift-commit
description: Checks the staged changes against docs/conventions/commits.md, drafts a commit message that explains why, what and which tests cover it, and creates the commit only after the user confirms and every check passes. Use when the user asks to commit, make a commit, "commit this", or runs /commit in the EnvDrift repo. Not for questions about Git or the commit history, and never pushes.
when_to_use: Triggers - "commit this", "commit it", "make a commit", "commit the staged changes", "/commit". Do not trigger for "what did the last commit change", "explain git rebase", "show the history", or "push".
argument-hint: "[task ID, e.g. M2.3]"
allowed-tools: Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git show *) Bash(git ls-files *) Bash(node scripts/commit-checks/cli.mjs *)
---

# EnvDrift commit

Every rule comes from [docs/conventions/commits.md](../../../docs/conventions/commits.md). Read it first. The checks live in `scripts/commit-checks/` and also run in the Git hooks, so reuse them through `node scripts/commit-checks/cli.mjs` and never reimplement one. A message that passes here passes the hooks, because it is the same code.

## Hard rules

- Never use `--no-verify`, never bypass or disable a hook, never change `core.hooksPath`.
- Never amend, rebase, reset, force-push or push. Pushing is always the user's.
- Never commit without the user's explicit "yes" in step 6.
- Never claim a check passed unless it actually ran in this session. Quote the `ran:` and `skipped:` lines of the CLI output.
- Never use `git add -A` or `git add .`. Stage only by explicit path.
- Never change source code or tests to make a check pass without asking first.

## Workflow

1. **Status.** Run `git status`. Say which files are staged, which are unstaged and which are untracked; unstaged changes matter because `npm test` runs on the working tree. If nothing is staged, propose which files belong to the task and stage them by explicit path only after the user agrees.
2. **One task.** Check the staged files all belong to one task (the scope in the subject). If they do not, propose a split (which files in which commit) and stop. This is the one rule only you can check; a hook cannot.
3. **Run the checks.** `node scripts/commit-checks/cli.mjs pre` (files, secrets, `npm test`, typecheck, dogfood). Read its `ran` and `skipped` lines. The dogfood check is skipped until the CLI exists; say so.
4. **Review gate.** Decide the commit type from the change. For `feat`, `fix` or `refactor`, run `node scripts/commit-checks/cli.mjs gate <type>`. If no matching report exists, run the `envdrift-code-review` skill on the **staged** changes (`--staged`), then re-run the gate. A report with BLOCKER or HIGH findings blocks the commit; list them.
5. **Draft the message.** Follow [references/message-writing.md](references/message-writing.md): read the full staged diff (`git diff --cached`) and the PRD section for the task before writing. Draft, then check the draft against section 1.2 of the conventions and rewrite it if any point fails. If the *why* cannot be found in the diff, the PRD or the conversation, ask the user **one** question instead of inventing a reason. Never say the tests cover something the staged tests do not, and never state as fact something you only reasoned (for example that a test fails on the old code) unless you ran it. Write the message to a temporary file outside the repository and run `node scripts/commit-checks/cli.mjs msg <file>`; fix every failure it reports.
6. **Confirm.** Show a summary: staged files; pass, fail or skipped for each check; the review verdict; the full commit message. Wait for the user's "yes". Anything else means no commit.
7. **Commit.** `git commit -F <file>` so the hooks run. Never add `--no-verify`.
8. **Report.** Show the new commit hash and subject (`git log -1 --format='%h %s'`). Delete the temporary file.

## When a check fails

Do not commit. List each failure with its rule ID, the offending file or text, and the fix from the CLI output. You may fix only clearly mechanical things yourself (message format, a missing trailer); show the change and re-run the checks. For anything else (source, tests, docs content) tell the user what to change and ask before touching it.

Do not add a `Co-Authored-By` trailer: the owner does not want one in this repository. Add it only if the user asks for it in the current conversation.
