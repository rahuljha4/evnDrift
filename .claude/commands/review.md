---
description: Review the current diff against EnvDrift's hard rules. Reports findings; does not edit.
---

Review the current changes (`git diff HEAD` plus untracked files from `git status`) against the checklist below. **Do not edit any file.** Output a findings list only.

## Checklist (from CLAUDE.md hard rules)
1. **Values never leave parsers.** Check for any exported type or object with a `value` property. Check whether a raw config value can reach a Finding, warning, error message, log, snapshot or test name. Check that `looksLikeSecret` is called only inside parsers.
2. **Core has no I/O.** Check `packages/core` for `fs`, `child_process`, network, `process.env`, `Date.now()` or `Math.random()` (determinism).
3. **Every rule has ≥ 3 tests**: positive, negative and suppression, named `EDxxx positive|negative|suppression`.
4. **Patterns.** Every new extractor behaviour needs a catalogue row and a test with the same ID.
5. **Deterministic findings.** Check that sorting is applied, paths are posix, and fingerprints are stable. Check for no reliance on fs walk or Map insertion order.
6. **Errors don't crash the scan.** Per-file failures must become warnings. Exit 2 is only for tool, config or source errors, and each has a cause and a next step listed in `docs/system/error-handling.md`.
7. **Dependencies.** Each new dependency needs a justification and a row in `docs/architecture/dependencies.md`, and must be pinned exactly. The AWS SDK must be lazy-imported.
8. **Docs drift.** If behaviour changed, check that the owning doc (see the CLAUDE.md doc map) was updated in the same diff.
9. **Tests quality.** Check whether assertions are exact (not just `toBeDefined`/length) and whether the negative case is a genuine near-miss.

## Output format
For each finding, one line: `[severity] path:line: problem → suggested fix (checklist #)`.
Severities are `block` (breaks a hard rule), `should` and `nit`. End with a one-line verdict: `OK to commit` or `Fix N blocking issues first`.
If the review reveals an AI mistake, suggest the `/log-ai-failure` text.
