# Workflow setup — code review, commits, agents, token optimisation

You are setting up the AI-assisted development workflow for the EnvDrift repository. Build it in phases. **Stop at the end of every phase**, show me what changed and the results, and wait for my approval before starting the next phase.

## General rules for this whole task
- Check the current Claude Code documentation for the format and location of skills, subagents, slash commands, tool restrictions, model selection, and usage reporting. Use project-level locations so everything is committed with the repo. If anything below conflicts with the current format, follow the current format and tell me what you changed.
- No new npm dependencies, except Stryker if it isn't installed yet (justify it). Hooks and scripts are plain Node (ESM) and must work on macOS, Linux, and Windows Git Bash.
- Every script you write gets unit tests (a positive and a negative case per rule or behaviour).
- Never commit, push, amend, or bypass hooks during this setup. I will make the first commit using the new `/commit` flow at the end.
- If you get something wrong and I correct it, add an entry to `docs/ai-log.md` (use `/log-ai-failure`).

Names used throughout:

| Kind | Name | Purpose |
|---|---|---|
| Skill | `envdrift-code-review` | how to review code in this repo |
| Skill | `envdrift-commit` | checked, convention-following commits |
| Subagent | `envdrift-reviewer` | independent, read-only review in a fresh context |
| Subagent | `envdrift-test-auditor` | verifies tests protect the change and what the commit says about them |
| Command | `/review` | runs `envdrift-reviewer` on the staged diff (or a task ID) |
| Command | `/commit` | runs the `envdrift-commit` skill |

Existing commands `/add-rule`, `/add-pattern`, `/log-ai-failure` stay, updated to follow Phase 1.

---

## Phase 0 — Read, plan, and record a baseline

1. Read `CLAUDE.md`, `.claude/commands/`, `docs/patterns-catalogue.md`, and from `docs/prd.md` only the section list plus sections 6, 11, 15, 17, 18, 19.
2. Show me a plan: every file you'll create or change, one line each, grouped by phase.
3. **Baseline measurement** (before any optimisation exists): make a small realistic change on a throwaway branch `baseline-eval` (for example, a stub of rule ED006 with one test). Review it the naive way: read the whole PRD, run `npm test` and `npm run typecheck` with full output, and write a review. Record the token usage and time from Claude Code's usage reporting in `docs/ai-development.md` under "Token baseline". Then delete the branch's changes.

Stop and wait for approval.

---

## Phase 1 — Foundations (token-efficient by design)

### 1.1 Quiet tool wrappers — `scripts/quiet/`
Skills, agents, and hooks must call these, never the raw commands.
- `test` — on pass, one line (`tests: 142 passed in 3.1s`); on fail, only failing test names, assertion message, and file:line, max 40 lines.
- `typecheck` — on pass, one line; on fail, only the errors, max 30 lines.
- `mutation` — Stryker limited to given source files; prints the score and surviving mutants as `file:line — mutation — test needed`, max 20 lines. If it would exceed 3 minutes, skip and print `mutation: skipped (time limit)`. Never print a score that wasn't measured.

### 1.2 Doc lookup — `scripts/doc-lookup.mjs`
- `node scripts/doc-lookup.mjs prd 11` prints only PRD section 11; also accepts a decision ID (`D5`) or task ID (`M2.3`) and prints the matching row or section.
- `node scripts/doc-lookup.mjs rule ED009` prints that rule's entry from `docs/rules.md`.
- `node scripts/doc-lookup.mjs pattern P07` prints that row from `docs/patterns-catalogue.md`.
- Skills, agents, and commands never read these files whole; they use this script for the parts they need.

### 1.3 Result cache — `.cache/commit-checks/` (gitignored)
- Key: `git write-tree` of the staged content.
- Stores tests, typecheck, commit checks, review verdict, and audit result as JSON.
- Any script, skill, agent, or hook reuses a cached result for the same tree instead of re-running. Changing staged content changes the key, so stale results are never reused.

### 1.4 Lean `CLAUDE.md` (under 60 lines)
Keep only: purpose (2 lines), layout, commands, the existing hard rules, and short sections for Code review, Commits, Agents, and Session habits, each pointing to a doc. Move anything longer into `docs/`. Session habits (3 lines max): one milestone task per session; clear context after each commit; compact long sessions; don't re-read files already read unless they changed.

Update `/add-rule`, `/add-pattern`, and `/log-ai-failure` to use the doc-lookup script and quiet wrappers.

Stop and wait for approval.

---

## Phase 2 — Code review: skill and reviewer agent

### 2.1 Skill `envdrift-code-review`
Reviews a staged diff (default), files, a commit range, or a task ID against the PRD and the project's hard rules, and produces a prioritised, evidence-based report. **Reviews only; never edits source, tests, or docs.**

Its description must make it trigger for requests to review code, a diff, a PR, a commit, or a milestone task in this repo, and not for general questions about the code or for writing new code.

Keep `SKILL.md` short: trigger, workflow, report format, and which reference file to load when.

**Workflow**
1. **Scope.** Work out what is being reviewed and state it at the top of the report.
2. **Pre-flight script** (bundled with the skill; exits 0 even when it finds problems; one line per check, passes collapsed into a count, detail only for failures). It must:
   - run tests and typecheck through the quiet wrappers (or reuse the cache)
   - flag imports of fs, net, http, child_process, or reads of process.env inside `packages/core/src`
   - flag any exported type or interface with a property named `value`, anywhere in `packages`
   - flag console.log / console.error inside `packages/core/src`
   - flag new dependencies in any package.json compared with the base
   - list rule files in `packages/core/src/rules` with no matching test file
   - list pattern IDs in the catalogue with no test of the same ID, and the reverse
3. **Manual review** against reference checklists in the skill folder, loading only those relevant to the files in scope:
   - `security-and-redaction.md` — values never leave parsers (PRD D6, §15); no secrets in logs or errors; symlink and file-size safety; read-only guarantee; least-privilege AWS
   - `architecture.md` — core purity; adapters at the edges; one rule per file; pure `(model) => Finding[]` rules; no scope beyond the PRD
   - `correctness.md` — rule semantics exactly as PRD §11 (ED002 vs ED009, D3 downgrade, suppression syntax); deterministic sorted output; 1-based positions; path normalisation; exit codes 0/1/2
   - `tests.md` — positive, negative, and suppression tests per rule; specific assertions, not truthiness or lengths; no test that would pass with the implementation deleted or inverted; golden fixtures updated when output changes
   - `typescript.md` — strict typing; no `any` without a reason; no non-null assertions on untrusted input; errors never crash the scan
   - `docs.md` — PRD, rules, catalogue, README in sync with behaviour
4. **Report.**

**Severity tiers** (exactly these)
- **BLOCKER** — breaks a CLAUDE.md hard rule, leaks or could leak a value, wrong rule semantics, failing tests or typecheck
- **HIGH** — a bug or missing test that would let a real defect through; behaviour not in the PRD ("unrequested scope")
- **MEDIUM** — maintainability, unclear code, docs out of sync
- **NIT** — style or naming; optional

Each finding: tier, title, file:line, what's wrong, why it matters (cite the PRD section or CLAUDE.md rule), and a concrete fix. A finding without a real file and line isn't a finding.

**Report structure** saved to `docs/reviews/YYYY-MM-DD-<scope>.md`:
1. Scope, verdict (APPROVE / APPROVE WITH FIXES / CHANGES REQUIRED), and `Staged-diff-sha256:` from `git diff --cached` (or "none")
2. Pre-flight results
3. Findings by tier
4. What was checked and passed (short)
5. Uncertainties: anything not verified, stated plainly

**Reviewer rules:** no padding, praise, or generic advice; separate facts (seen in code or tool output) from judgement; never claim a command ran unless the pre-flight ran it.

### 2.2 Subagent `envdrift-reviewer`
- Runs the `envdrift-code-review` skill in a fresh context so the session that wrote the code doesn't review itself. It judges the diff against `CLAUDE.md` and the PRD only, not the main session's reasoning.
- **Tools:** read-only (read, search, list) plus shell limited to the quiet wrappers, git read commands (diff, log, show, status), the doc-lookup script, and the pre-flight script. It may write only its report under `docs/reviews/`.
- **Model:** the default, stronger model (judgement-heavy).
- **Input bundle** (prepared by the caller, not explored by the agent): `git diff --cached --stat`, then the staged diff of source and test files only, with 3 lines of context. Excluded from the bundle and listed by name only: lockfiles, snapshots, `fixtures/**/expected.json`, `docs/reviews/**`, generated files. It may open other files only when a finding needs it, and says why.
- **Returns to the main session, max 10 lines:** verdict, counts by tier, report path, diff hash.

### 2.3 `/review` command
Prepares the input bundle and runs `envdrift-reviewer`. Reuses a cached review for the same staged tree.

### 2.4 Prove the reviewer works
On a throwaway branch `review-eval`, plant at least six known problems, e.g. a parser returning a `value` field; an fs import in core; a rule with only a positive test; ED009 firing when a fallback is absent; a test that only uses `toBeTruthy()`; an unsorted findings array. Run `/review`. Record a table in `docs/reviews/review-skill-eval.md`: planted problem → caught? → tier. Improve the checklists or pre-flight until all are caught, recording each iteration. Then remove the planted code, keeping the report.

Stop and wait for approval.

---

## Phase 3 — Subagent `envdrift-test-auditor`

- **Purpose:** check that the staged tests actually protect the staged change, and produce the factual "Tests:" line for the commit message.
- **Tools:** read-only plus the quiet test, coverage, and mutation wrappers. No editing.
- **Model:** a smaller, cheaper model (mostly runs tools and summarises).
- **Checks:**
  - every changed function or rule in `packages/*/src` is exercised by a test
  - rules have positive, negative, and suppression tests (PRD §18)
  - assertions check specific values
  - mutation testing on the changed files only, run only when a rule, parser, or extractor file is staged; surviving mutants listed with what a test would need to assert
- **Returns, max 10 lines:** pass/fail, gaps with file:line, mutation score for changed files (or "not run" and why), and a one-line factual summary of what the tests cover.
- Results are cached by staged tree.

Stop and wait for approval.

---

## Phase 4 — Commit conventions, hooks, and the commit skill

### 4.1 Conventions — `docs/conventions/commits.md` (single source of truth)
Every check in the hooks and the skill comes from this document; if a rule isn't written there, it isn't enforced.

**Message format**
- Subject: `<type>(<scope>): <summary>`
  - type: feat | fix | test | refactor | docs | chore | ci | build
  - scope: a milestone task ID from PRD §19 (e.g. `M2.3`); docs, chore, ci, and build commits not tied to a task may use `repo`
  - summary: imperative mood, lower-case first word, no trailing period; whole subject ≤ 72 characters
- Blank line, then the body, wrapped at 72 characters.
- Trailers when they apply:
  - `Refs: docs/prd.md §<section>`
  - `Dependency: <name> — <reason>` for every dependency added to any package.json
  - `No-test-reason: <reason>` when source changes without test changes
  - `AI-log: #<n>` when the commit adds an entry to `docs/ai-log.md`
  - Keep Claude Code's AI co-author trailer when the change was AI-assisted; never remove it.

**Writing good commit messages**
Format alone isn't enough; every message must explain the change to someone reading the history later, including the hackathon judges.
- Subject says what the commit does to the product, specifically enough to understand without the diff (name the rule, command, parser, or behaviour). Good: `feat(M1.5): flag missing variables with fallbacks as ED009`. Bad: `feat(M1.5): update rules`, `fix(M2.1): fix bug`, `chore(repo): changes`.
- Imperative mood; no emojis, "WIP", or tracker noise.
- Body required for every feat and fix, and for any commit touching more than one file under `packages/*/src`:
  - Paragraph 1 — **why**: the problem or PRD requirement, citing the section or decision.
  - Paragraph 2 — **what**: the approach in plain words, including edge cases, trade-offs, and anything deliberately left out.
  - For fixes: the wrong behaviour, how it was found, and how the fix prevents it recurring.
  - A **Tests:** line saying what the tests cover.
  - No lists of file names.

Include this example in the document:

```
feat(M1.5): report missing variables with fallbacks as ED009

PRD §11 and decision D5 split missing variables into two cases.
A read without a fallback crashes or misbehaves, so it stays an
ED002 error. A read with a fallback silently runs on a dev default
in production, which is a different risk and warrants a warning.

ED009 fires for an environment only when every reference to the
variable has a fallback; a single reference without one keeps it
as ED002. Destructuring defaults count as fallbacks.

Tests: positive, negative, and suppression cases; mixed references
where one lacks a fallback.

Refs: docs/prd.md §11
```

**Staged-change rules**
- One task per commit: all staged files relate to the subject's scope.
- Never stage `.env` / `.env.*` other than `.env.example`, `.env.sample`, `.env.template`, or files under fixtures directories.
- No staged file over 1 MB; no build output, coverage, or node_modules.
- A change in `packages/*/src` needs a test change in the same package, unless a `No-test-reason` trailer is present.
- A change in `packages/core/src/rules` needs a `docs/rules.md` change, or the body says why not.
- A change in `packages/core/src/extract` needs a `docs/patterns-catalogue.md` change, or the body says why not.
- A new dependency needs a matching `Dependency:` trailer.
- Tests and typecheck pass.
- No obvious secrets in the staged diff: known prefixes (sk_live_, sk_test_, ghp_, github_pat_, AKIA, ASIA, xoxb-, xoxp-, AIza, -----BEGIN) and high-entropy strings of 20+ characters outside test fixtures.
- Once the EnvDrift CLI exists, `envdrift scan --fail-on error` passes on the repo. Until then, skip this check and say so.

**Review and audit gates**
- feat, fix, and refactor commits need a cached or saved review whose `Staged-diff-sha256` matches the current staged diff, with no BLOCKER or HIGH findings.
- Any commit touching `packages/*/src` needs a passing test-audit result for the current staged tree.
- docs, chore, ci, and build commits that don't touch `packages/*/src` skip both gates and both agents.

### 4.2 Git hooks — `.githooks/`, installed via an npm `prepare` script setting `core.hooksPath`
- Shared logic in `scripts/commit-checks/` as small tested modules; hooks and the skill both use them.
- `pre-commit`: staged-change rules and gates, reusing cached results for the current tree. `FAST=1` may skip tests and typecheck for docs-only commits, never for feat, fix, or refactor.
- `commit-msg`: format, trailers, and the reliable quality checks:
  - reject summaries that are a vague word or phrase alone or with a generic object: fix, fixes, update, updates, changes, misc, wip, tweak, cleanup, stuff, minor, "fix bug", "update code", "small changes"
  - reject summaries under 3 words
  - reject a first word ending in "ed" or "ing", with an allowlist (embed, seed, feed, bring, string, …)
  - require a body where 4.1 requires one; reject bodies made only of file names
- Every failure prints the rule, the offending file, line, or text, and a corrected example.

### 4.3 Skill `envdrift-commit` and `/commit`
Triggers when I ask to commit or "commit this"; not for questions about Git or history.

**Workflow**
1. Show `git status`. If nothing is staged, propose files for the task and stage them by explicit path only after I agree. Never `git add -A` or `git add .`.
2. Check the staged changes belong to one task; if not, propose a split and stop.
3. Run the checks in `docs/conventions/commits.md` via `scripts/commit-checks/`, reusing cached results.
4. For feat, fix, or refactor: get the review from `envdrift-reviewer` (via the `/review` flow). Any BLOCKER or HIGH stops the commit. The main session may not overrule, reword, or downgrade a finding; only I can, explicitly.
5. For any commit touching `packages/*/src`: get the result from `envdrift-test-auditor`. If it reports gaps, stop and show them; I decide whether to add tests or use a `No-test-reason` trailer.
6. Draft the message:
   - read the full staged diff and the task's PRD section (via doc-lookup) first; never write from file names alone
   - follow 4.1 including why, what, trailers, and a **Tests:** line taken from the test-auditor's summary, not the main session's own description
   - check the draft against "Writing good commit messages" and rewrite if any point fails
   - if the why can't be determined from the diff, the PRD, or our conversation, ask me one question instead of inventing a reason
7. Show me a summary: staged files, pass/fail per check, reviewer verdict and report path, auditor result and mutation score, and the full message. Wait for my "yes".
8. Commit with `git commit -F <file>` so the hooks run. Report the hash and subject.

If any check fails: don't commit; list each failure and its fix. Offer to fix only mechanical things (message format, a missing trailer); never change source or tests to pass a check without asking me.

**Hard rules:** never use `--no-verify`, disable hooks, or change `core.hooksPath`; never amend, rebase, reset, force-push, or push; never commit without my explicit confirmation; never claim a check passed unless it ran (or a cached result for the same tree exists) in this session.

Stop and wait for approval.

---

## Phase 5 — Documentation

- `CLAUDE.md`: replace "Never commit; the human commits" with "Commit only through `/commit` (envdrift-commit skill), and only after explicit confirmation. Never push." Keep it under 60 lines.
- `docs/prd.md`: update §17 "Workflow per task" to the new commit format, `/review`, `/commit`, and the agents; add a §23 change-log entry.
- `docs/ai-development.md` (create if missing): the workflow end to end; each skill, agent, and command with its purpose; why the two agents are separate from the main session; tool restrictions and model choices with reasons; the token optimisations and why.

Stop and wait for approval.

---

## Phase 6 — End-to-end evaluation

On a throwaway branch `commit-eval`, run these cases and record the results in `docs/reviews/workflow-eval.md` as a table (case → expected → actual). Fix anything that doesn't match and re-run until every case passes, recording each iteration.

1. Bad subject format → blocked by commit-msg
2. Source change with no test change and no trailer → blocked
3. New dependency without a `Dependency:` trailer → blocked
4. Staged `.env` with a fake value → blocked
5. Rule file changed without `docs/rules.md` → blocked
6. feat commit with no matching review → `/commit` runs the reviewer first
7. Review from an older diff (hash mismatch) → blocked
8. Clean, valid change → commits after confirmation
9. Subject `fix(M2.1): fix bug` → blocked as vague
10. Subject `feat(M1.5): added ED009 rule` → blocked for past tense
11. feat commit with no body → blocked
12. Body that only lists file names → blocked
13. Skill-drafted message for a real change → passes the hooks and states why, what, and test coverage
14. Planted BLOCKER in a feat commit → reviewer reports it; commit stops; main session doesn't downgrade it
15. Rule change with only a positive test → auditor reports missing negative and suppression tests
16. Test that only uses `toBeTruthy()` on a changed rule → auditor flags it as weak (surviving mutant if mutation ran)
17. Message drafted with an untrue "Tests:" claim → replaced by the auditor's summary
18. Ask the reviewer to edit a source file → refused by its tool restrictions
19. Same staged tree committed twice in a row (after an abort) → second run reuses cached results, no repeat test run or review
20. docs-only commit → no agents run, hooks pass

**Token comparison:** repeat the Phase 0 baseline scenario (same kind of change) through the full new flow (`/review`, then `/commit`). Record token usage and time, and add a before/after table to `docs/ai-development.md`. If any optimisation hid a real finding during the evaluation (for example, a trimmed diff that left out a relevant file), loosen it for that case, re-run, and log it in `docs/ai-log.md`.

Then remove the evaluation code from the branch, keeping the reports.

**Finish** with: a summary of all files created or changed, the evaluation table, the review-skill evaluation table, and the token before/after table. Don't commit; I'll make the first commit with `/commit`.
