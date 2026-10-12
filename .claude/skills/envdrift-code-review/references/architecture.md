# Architecture checklist

Sources: PRD §6, §8; `docs/architecture/overview.md` and `modules-*.md`; CLAUDE.md hard rules 2, 3, 8, 9, 10.

## Core purity (hard rule 2)
- [ ] `packages/core/src` has no `fs`, `child_process`, network, `process.env`, `Date.now()` or `Math.random()`. `node:crypto` hashing is allowed. Pre-flight `CORE_IO` covers imports and `process.env`; check indirect I/O (a passed-in callback that reads files is still core doing I/O through a side door).
- [ ] Core never prints or exits: reporters return strings, rules return findings.

## Layering
- [ ] I/O, `git`, SSM, stdout/stderr, exit codes live in `packages/cli` (`io/`, `sources/`, `commands/`) and nowhere else. Source adapters read text and call core parsers; they contain no parsing or rule logic.
- [ ] `packages/action` is a thin wrapper that calls `runScan`; it does not duplicate CLI logic.
- [ ] Dependencies point inward: cli → core, action → cli. Core imports nothing from cli or action.

## Rules (hard rule 3)
- [ ] One rule per file `rules/EDxxx.ts`, exported as pure `(model: ScanModel) => Finding[]`: no mutation of the model, no module-level state, no I/O.
- [ ] Severity resolution, suppression, sorting and fingerprints are done outside the rule (`rules/index.ts`, `suppress.ts`).

## Scope discipline
- [ ] Every behaviour change is traceable to a PRD section, a catalogue row or a functional doc. Anything else is "unrequested scope" (HIGH).
- [ ] Locked decisions D1–D11 are not reopened without a PRD change-log entry (hard rule 10).
- [ ] No runtime AI and no network outside `aws-ssm` (D9, hard rule 9).
- [ ] Extraction supports only patterns in `docs/patterns-catalogue.md` (hard rule 4); aliases are reported, never followed (D4).
- [ ] Module responsibilities match `docs/architecture/modules-*.md`; if the code moved a responsibility, the doc changed in the same diff.
