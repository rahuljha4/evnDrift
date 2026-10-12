# Docs checklist

Sources: CLAUDE.md "Doc map" and workflow step 6 ("Docs and code drift is a bug"); PRD §17. Drift between behaviour and its owning doc is **MEDIUM**; a PRD conflict with no change-log entry is **HIGH**.

For each behaviour change in the diff, find the owning doc and confirm it changed in the same diff:

| Behaviour | Doc that must agree |
|---|---|
| Requirements, locked decisions, milestones | `docs/prd.md` (change-log entry for any change; never silently edited) |
| Rule semantics, severity, locations | `docs/functional/rules/EDxxx.md` and `docs/rules.md` (explain text) |
| Extraction patterns | `docs/patterns-catalogue.md` (row, status, retired IDs) |
| CLI flags, config, sources, outputs, Action | `docs/functional/*.md`, `docs/output-schema.json` |
| Types, invariants, fingerprint, sort | `docs/architecture/data-model.md` |
| Module responsibilities and signatures | `docs/architecture/modules-core.md`, `modules-cli.md`, `modules-action.md` |
| New or changed dependency | `docs/architecture/dependencies.md` (exact pin, justification in commit message) |
| Security guarantees | `docs/system/security.md` |
| Warning/error text, exit codes | `docs/system/error-handling.md` |
| Test strategy, fixtures | `docs/system/testing-qa.md` |
| An AI mistake caught during the task | `docs/ai-log.md` via `/log-ai-failure`, plus the context change (CLAUDE.md, a command or skill) in the same commit |
| Anything a user reads | `README.md` |

- [ ] Code and the doc state the same thing (message wording, ID lists, defaults, signatures, milestone IDs).
- [ ] A doc marked "Open question" or "Proposal" is not silently resolved by the code; the resolution is recorded with the owner's decision or a proposed change-log line.
- [ ] Retired or renamed IDs are listed, not reused; links and anchors still resolve.
- [ ] Commit-ready: the task ID appears where the milestone table expects it.
