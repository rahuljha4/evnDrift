# Evaluation of the commit workflow (hooks + `envdrift-commit` skill)

Date: 2026-10-12. Procedure: on the throwaway branch `commit-eval` (created from `main`; the setup files stayed uncommitted in the working tree so the hooks and skill were active), run 13 cases against the real hooks. Cases 1–5, 7 and 9–12 are expected to be **blocked**; they were run with a script that stages throwaway files by explicit path, runs `git commit -F`, and checks the exit code and the rule IDs printed. Cases 6, 8 and 13 are the skill itself, run by fresh subagents (the user pre-authorised commits on `commit-eval` only, so step 6 was answered "yes"). Afterwards the branch was deleted; its three skill-made commits are summarised in the appendix.

## Case table

"Iteration" is the run in which the result was obtained; every case was run in iteration 1, and the cases changed by a fix were re-run in iteration 2.

| # | Case | Expected | Actual | Iteration |
|---|---|---|---|---|
| 1 | Bad subject format (`update stuff`) | blocked by commit-msg | blocked: `FMT-1` | 1, 2 |
| 2 | Source change, no test change, no trailer | blocked | blocked: `TST-1` (and `REV-1`, because the type was `refactor`) | 1, 2 |
| 3 | New dependency without a `Dependency:` trailer | blocked | blocked: `TRL-2` | 1, 2 |
| 4 | Staged `.env` with a fake value | blocked by pre-commit | blocked: `ENV-1` | 1, 2 |
| 5 | Rule file changed without `docs/rules.md` | blocked | blocked: `DOC-1` | 1, 2 |
| 6 | `feat` commit with no matching review | skill runs the review first | `gate feat` failed `REV-1`; the skill ran `envdrift-code-review --staged`, re-ran the gate, then committed `df02603`. I recomputed the sha256 of the committed diff: it equals the `Staged-diff-sha256` in the report | 1 |
| 7 | Review report from an older diff (hash mismatch) | blocked | blocked: `REV-1`, and in iteration 2 the harness also asserts the message says the report is **stale** (so it is the hash mismatch, not a missing report) | 1, 2 |
| 8 | Clean, valid change | commits after confirmation | `docs(repo)` commit `a6dfd8f`; all checks ran or were reported skipped; review gate correctly not applicable | 1 |
| 9 | `fix(M2.1): fix bug` | blocked as vague | blocked: `Q-1` (plus `Q-2`, `BODY-1`, `TRL-1`) | 1, 2 |
| 10 | `feat(M1.5): added ED009 rule …` | blocked for past tense | blocked: `Q-3` (plus `BODY-1`, `TRL-1`) | 1, 2 |
| 11 | `feat` with no body | blocked | blocked: `BODY-1` | 1, 2 |
| 12 | Body that only lists file names | blocked | blocked: `BODY-2` (plus `BODY-3`, `BODY-4`) | 1, 2 |
| 13 | Skill-drafted message for a real change | passes the hooks; states why, what and test coverage | Iteration 1: `f84ccaf fix(M0.1)`, passed, why/what/tests present and truthful, **but** it stated "the new test fails on the old splitter" without having run it (I ran it afterwards: the claim is true). Iteration 2 (a test-only change, `64e5d01`): passed; the unverified claim was left out | 1, 2 |

## What the first version got wrong (and the fix)

1. **Unverified claim in a commit message (case 13, iteration 1).** The subagent's own report admitted it had not run the old code, yet the message said the test fails on it. Fix: `references/message-writing.md` and `SKILL.md` now say a behavioural statement goes into the message only if it was run in this session, and `docs/conventions/commits.md` lists this under "not enforced by a hook". Iteration 2 complied. It still wrote a sentence "was not checked" into the message body, which is noise; I added a rule against that. **That last edit was not re-run.**
2. **Case 7 could not tell the two `REV-1` situations apart.** Iteration 1 only checked the rule ID, which is also printed when no report exists at all. The harness now asserts the "stale" wording.

## Not covered or not proven

- **Windows Git Bash was not run.** The hooks use no shell and `execFileSync` only, but that is by construction, not by test.
- The skill cases were run by subagents under a stated pre-authorisation, so the real "ask, then wait for yes" interaction with a human was not exercised.
- Cases 6, 8 and 13 ran once each (13 twice); the hook cases are deterministic and ran twice. Skill behaviour varies between runs.
- The review report that each skill run writes stayed **untracked** (the gate reads reports from the working tree and excludes `docs/reviews/` from the hash). Whether reports should be committed with the change is left to you.
- Heuristics can still be fooled: irregular past tense ("wrote") is not caught, and a vague summary of three or more specific-looking words is accepted.

## Appendix: messages written by the skill (the branch was deleted, so they are kept here)

The `feat` message cites PRD §9 and says nothing consumes the constant yet; the first `fix` message gives the wrong behaviour, the approach and a tests line that maps to the staged test (it also contains the unverified claim described above).

```
=== 64e5d01
test(M0.1): cover a lone CR inside a quoted dotenv value

The review of the lone-CR line-ending fix for the dotenv parser
(M0.1, PRD §19) raised a NIT: no test covered a lone carriage return
inside a double-quoted multi-line value.

The new test parses A="x\ry"\rB=2\r and expects A on line 1 and B on
line 3, both with values, and no warnings. Only the test file changes;
the parser is untouched. Whether the test fails on the code before the
lone-CR fix was not checked.

Tests: lone CR inside a double-quoted value; declaration names, line
numbers and hasValue for A and B, and an empty warnings list.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

=== f84ccaf
fix(M0.1): read keys from dotenv files with lone CR line endings

A review of M0.1 found that a .env file with old Mac line endings
(A=1\rB=2) was read as a single line, so only the first key was
found and the rest were missing from the scan. PRD §10.2 requires
the dotenv parser to report every declared key.

The parser now splits lines on \r\n, \r and \n instead of only \r\n
and \n. The \r\n alternative comes first, so CRLF files are still
counted as one break per line and keep their line numbers. The
wrong behaviour was silent: no warning was raised. The new test
fails on the old splitter, which keeps it from returning.

Tests: lone CR file with three keys reports names A, B and C, line
numbers 1, 2 and 3, and hasValue true, false and true; the existing
CRLF test still passes.

Refs: docs/prd.md §10.2
Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

=== df02603
feat(M1.1): export severity levels as a runtime constant

PRD §9 defines Severity as a union type, which disappears at runtime.
Later work in M1 needs the levels as values: severity resolution and
the deterministic sort (error, warning, info) both have to iterate
them, and keeping a second hand-written list would let it drift from
the type.

Add SEVERITIES as a readonly tuple in core types and derive the
Severity union from it, so the type is unchanged for every existing
user. The tuple is ordered most severe first. Nothing consumes it yet;
sorting and resolution are left to their own tasks.

Tests: SEVERITIES lists error, warning and info in exactly that order.

Refs: docs/prd.md §9
Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

=== a6dfd8f
docs(repo): record M0.1 and M0.2 as done in benchmark status

The benchmark status line still read as if no spike work had
happened. M0.1 (dotenv parser) and M0.2 (Babel extractor) are
committed, so the line now says so and names M0.3 as the next step.

Only the status sentence changes; no measurements are added, and
M6.3 remains the full benchmark run.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
```
