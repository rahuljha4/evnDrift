---
name: milestone-task
description: Run one EnvDrift milestone task end to end (PRD §19 IDs such as M0.3, M1.1, M2.4) the way this repo wants it done. Use this whenever the user says start, do, continue, or "next" for a milestone or task ID, asks to implement a PRD §19 item or the next EnvDrift feature, or says "let's build X" for something the PRD schedules, even if they never name the skill. Covers reading the acceptance row, plan mode, surfacing open questions, tests first, checks, doc sync, /review and the commit hand-off. Do not use it for a single rule (use add-rule), a single extraction pattern (use add-pattern), or a diff review (use review).
---

# Milestone task

CLAUDE.md lists the hard rules. This skill is the procedure for applying them to one PRD §19 task, plus the traps that cost time in earlier tasks. Follow it in order. Each step exists because skipping it produced rework or a silent wrong decision.

## 1. Orient (read before planning)

- Read the task's row in `docs/prd.md` §19: its **Acceptance** column is the definition of done.
- Read the doc that owns the behaviour (CLAUDE.md "Doc map"): usually `docs/functional/*`, `docs/architecture/modules-*.md`, `docs/patterns-catalogue.md` or `docs/functional/rules/EDxxx.md`.
- Run `git status`. If earlier tasks are still uncommitted, say so now. Mixed work in one commit is hard for Rahul to review, so plan to propose separate commits.
- Check what earlier tasks already left behind (placeholders such as `looksSecret: false`, `// M1.1:` markers). The task usually completes those instead of starting fresh.

## 2. Plan mode first

Enter plan mode (CLAUDE.md workflow). The plan restates the **task ID**, the **PRD section** it implements, and the **files** to touch, then the test list and the verification commands.

Treat each of these as a decision that belongs to Rahul, not to you:

- Rows marked ⚠, and text saying "Open question", "Proposal" or "Owner review".
- A conflict between two docs, or between a doc and the PRD. The PRD wins, but do not edit it silently: propose the change-log line.
- A choice the docs do not settle (message wording, a new type, a dependency).

Ask with AskUserQuestion, one batch, with a recommended option. If the answer is ambiguous or two answers contradict each other, say so and propose one resolution in the plan instead of guessing. Do not invent requirements; propose them.

## 3. Tests first

Write the tests as their own step and run them **before any implementation file exists**. Read the failure and confirm it fails for the right reason (a missing module is fine for new code; a wrong expectation is not). Say so in the hand-off ("tests failed first: <reason>"). Writing tests and implementation together is the usual way this step gets skipped, and then nobody knows whether the tests can fail at all. Test titles carry the catalogue, rule or FR ID (`it('P01: …')`). No value from a config file may appear in a test name or in expected output.

When a test needs a source column or line, compute it with a script (`python3 -c "print(s.index('x')+1)"`). Hand-counted columns were wrong more than once, and the failure looks like a bug in the code.

## 4. Implement

Smallest change that makes the tests pass. Keep to the hard rules: values never leave parsers, `packages/core` has no I/O, output is sorted explicitly, a bad file becomes a warning and the scan continues. Warnings and errors carry names and line numbers, never content.

## 5. Checks

Run all of: `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`. Run `npm run test:coverage` when `packages/core` changed (core lines ≥ 90 %). Run `npx prettier --write` on changed docs and code, then re-run the checks.

Repo-specific traps:

- The `rtk` hook rewrites `npx vitest …` and can swallow the output. Use `rtk proxy npx vitest run …` to see it, then `rm -rf .vitest` because the wrapper leaves that directory behind.
- `npm i` can fail with ERESOLVE from an existing peer-dependency conflict. Do not reach for `--legacy-peer-deps`. Explain the conflict and ask whether to bump the conflicting package.
- New dependencies: pin the exact version (`-E`), add or update the row in `docs/architecture/dependencies.md`, and keep the justification for the commit message (what it does, why the standard library is not enough, alternatives).

## 6. Docs in the same diff

When behaviour changed, update the owning doc (CLAUDE.md "Doc map"). Typical misses: warning texts in `docs/system/error-handling.md`, `docs/functional/sources.md`, `docs/architecture/modules-core.md`, catalogue rows and notes, `docs/output-schema.json`. Never reuse a retired catalogue or rule ID; list it in the "Retired" table instead.

## 7. Review (a required step)

Run `/review` on the diff (it uses the `envdrift-code-review` skill), using the Skill tool. If you cannot invoke it (for example a non-interactive run), do the review yourself against the checklists in `.claude/skills/envdrift-code-review/references/`, running its pre-flight script first, and write the findings in the same format (`[severity] path:line: problem → fix`). Say in the hand-off which route you took. Do not end with "please run /review": the review is part of the task, not a follow-up for Rahul.

Fix every `block` and `should` finding. List the `nit`s as left or logged. If the review finds a doc gap, fix the doc rather than trimming the code. Re-run the checks after fixes.

## 8. Hand-off

Claude does not commit. Finish with:

- What was done against the Acceptance row, and what was not.
- Check results (test count, coverage for touched files).
- Suggested commit message(s) in the form `Mx.y: summary`, with the **exact file list** that belongs to this task. Run `git status` first: if earlier tasks are still uncommitted, say so explicitly, name which files are theirs, and note shared files (such as `index.ts` or a doc) where only some hunks belong to this task. Include the dependency justification lines in the message that adds the dependency.
- PRD change-log proposals and open questions that remain.
- `/log-ai-failure` text only for mistakes that actually happened and were caught. Never invent entries; judges read `docs/ai-log.md`.
- The next task from §19.

## Before you hand off, check yourself

1. Did I watch the tests fail before implementing, and say so?
2. Did I run the review (or the checklist) and report its findings?
3. Are all four checks green, and coverage if core changed?
4. Does the commit suggestion name this task's files and mention any mixed tree?
5. Did I leave a `.vitest/` directory, a stray file, or a commit behind?
