---
name: envdrift-code-review
description: Reviews a diff, files, a commit range or a milestone task (e.g. M2.3) in the EnvDrift repo against the PRD and CLAUDE.md hard rules and writes a prioritised, evidence-based report to docs/reviews/. Review only: it never edits source, tests or docs. Use when the user asks to review code, a diff, a PR, a commit, a branch, or "review M2.3". Not for general questions about the code and not for writing or fixing code.
when_to_use: Triggers - "review this", "review my diff", "review the PR", "review the last commit", "review M1.5", "check this against the PRD", "/review". Do not trigger for "explain this function", "how does X work", "write a rule", or "fix this bug".
argument-hint: "[task ID | commit range | file paths | --base <ref>]"
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/preflight.mjs *) Bash(node scripts/doc-lookup.mjs *) Bash(node scripts/commit-checks/review-bundle.mjs *) Bash(git diff *) Bash(git log *) Bash(git show *) Bash(git status *) Bash(git ls-files *)
disallowed-tools: Edit NotebookEdit
---

# EnvDrift code review

You review; you do not fix. The only file you may create is the report under `docs/reviews/`. A review that edits what it is judging cannot be trusted, and a finding you cannot point at a file and line for is an opinion, not a finding.

## 1. Scope

Decide what is under review and state it at the top of the report.

- Default: the uncommitted diff (`git diff HEAD`) plus untracked files from `git status`.
- Staged (the commit flow, or "review what I staged"): `git diff --cached`. Pass `--staged` to the pre-flight; it prints a `STAGED_HASH` line.
- Files or paths given: review those files in full.
- A commit or range (`abc123`, `main..HEAD`): `git diff <range>`; pass `--base <ref>` to the pre-flight.
- A task ID (`M2.3`): read the task's row in `docs/prd.md` §19 and review the diff that implements it. Its **Acceptance** column is part of what you check.

If the scope is ambiguous, pick the default and say so under Uncertainties. Do not ask unless the diff is empty.

## 2. Pre-flight (always first)

Run `node ${CLAUDE_SKILL_DIR}/scripts/preflight.mjs [--base <ref> | --staged]`. It is read-only, always exits 0 and prints `CHECK <ID> <PASS|FAIL|WARN|INFO|SKIP> <file:line> <message>` lines and a `SUMMARY`. Copy its results into the report verbatim.

- A pre-flight `FAIL` for `TEST`, `TYPECHECK`, `CORE_IO`, `VALUE_PROP`, `WARN_LEAK` or `PATTERN_IDS`/`RULE_TESTS` is a **BLOCKER** candidate; `CONSOLE`, `NEW_DEP`, `LINT`, `WEAK_ASSERT` and `UNSORTED` failures are at least **HIGH** and each gets its own finding (never inside a MEDIUM item); `FORMAT` failures are **MEDIUM**. Confirm by reading the cited line before you tier it.
- `SKIP` means the check did **not** run. Never write that something passed, ran or was verified unless a pre-flight line says so. List every `SKIP` under Uncertainties.
- The script cannot judge meaning (rule semantics, whether a test is weak, whether a doc is stale). That is the manual review.

## 3. Manual review

Read the diff, then load **only** the reference files that match the files in scope:

| Files in scope | Load |
|---|---|
| any parser, source adapter, reporter, logging, errors, file/network access | [references/security-and-redaction.md](references/security-and-redaction.md) |
| `packages/*/src` structure, new modules, new behaviour | [references/architecture.md](references/architecture.md) |
| `rules/`, `suppress.ts`, `model.ts`, `report/`, sorting, paths, exit codes | [references/correctness.md](references/correctness.md) |
| anything under `test/` or fixtures, or code without tests | [references/tests.md](references/tests.md) |
| any `.ts` file | [references/typescript.md](references/typescript.md) |
| behaviour changes (docs must follow) | [references/docs.md](references/docs.md) |

Check the PRD, not your memory of it, but never read it whole: `node scripts/doc-lookup.mjs prd 11` (also `prd D5`, `prd M2.3`, `rule ED009`, `pattern P07`) prints just the part a finding depends on (§6 decisions, §11 rules, §15 security, §16 NFRs, §18 QA). Behaviour in the diff that the PRD or catalogue does not ask for is **HIGH** ("unrequested scope"), because CLAUDE.md says to propose requirements, not invent them.

## 4. Report

Use [references/report-template.md](references/report-template.md) exactly: tiers, finding fields and section order. For a staged review, the report **must** contain the line `Staged-diff-sha256: <hex>` copied from the pre-flight's `STAGED_HASH` line (the commit gate in `docs/conventions/commits.md` §1.4 matches on it; use `none` if nothing is staged, and `none` for any non-staged scope). Save to `docs/reviews/YYYY-MM-DD-<scope>.md` (create the folder if missing; scope slug like `uncommitted`, `m2-3`, `abc123-def456`) and for a staged review, cache the verdict with `node scripts/commit-checks/review-bundle.mjs record <report>` so `/review` and the commit flow reuse it for the same tree; then print a short summary in chat: verdict, counts per tier, the top three findings, the report path.

## Rules

- Never edit source, tests or docs. Only write the report. Do not "fix as you go", even typos.
- Every finding names a real `file:line` you have read. No line, no finding.
- Use the template's headings exactly: `### BLOCKER`, `### HIGH`, `### MEDIUM`, `### NIT` (three hashes), all four present, and keep the section order. Findings are a numbered list under each, exactly `1. **title** — `file:line``, as in the template. The commit gate counts them in that form. Write `none` under an empty tier.
- Tiers are fixed by the template, not by your sense of effort: wrong rule semantics (PRD §11), a rule with fewer than three tests, and any break of CLAUDE.md hard rules 1-9 are **BLOCKER**. Do not lower one because the fix is small.
- One finding per defect. Never bundle two defects into one item, and never put a hard-rule break (CLAUDE.md rules 1-9) into a MEDIUM or NIT item because it sits near a style note.
- Give every value-leak path (a `value` field, a warning or error that quotes content, a log of parsed text) its **own BLOCKER finding**. Never fold a leak into a finding about something else and never tier it below BLOCKER: it is the one defect the product cannot ship with.
- Separate fact (seen in code or tool output) from judgement, and mark judgement as such.
- No padding: no generic advice, no praise section, no restating the diff.
- Never claim a command or test ran unless the pre-flight output shows it.
- If you could not verify something, say so under Uncertainties instead of guessing.
- If the review reveals a mistake an AI made (not just a human slip), end your chat summary with a suggested `/log-ai-failure` text. Do not write to `docs/ai-log.md` yourself.
