# CLAUDE.md — how to work in this repo

EnvDrift is a CLI and GitHub Action that statically checks that every environment variable a JS/TS codebase reads is declared in `.env.example` and in every configured environment. It also checks that no secret is browser-exposed or committed. It handles **names only** and never touches values in output.

- **What** to build: [`docs/prd.md`](docs/prd.md) (v2.1, locked). **How** to work: this file. If they conflict, **stop and ask** Rahul. Do not invent requirements. Propose them instead.
- Current milestone status: [PRD §5](docs/prd.md#5-current-state-9-oct) and [§19](docs/prd.md#19-delivery-plan).

## Layout

```
packages/core/    pure logic: extract/, parse/, rules/, report/, config/, types.ts   (@envdrift/core, private)
packages/cli/     I/O adapters + commands: commands/, io/, sources/, bin.ts        (@rahulkumar/envdrift, bin `envdrift`)
packages/action/  GitHub Action wrapper: action.yml, src/index.ts                  (private)
fixtures/         golden repos: <name>/ + expected.json   (contain FAKE .env files on purpose)
docs/             prd.md, rules.md, patterns-catalogue.md, ai-log.md, benchmark.md,
                  functional/, architecture/ (+ adr/), system/
.claude/commands/ add-rule, add-pattern, review, log-ai-failure
.claude/skills/   envdrift-code-review (reviews), milestone-task (one PRD §19 task)
```

## Commands

```bash
npm test                 # vitest run (all packages)
npm run test:coverage    # + v8 coverage; core lines ≥ 90 %
npm run typecheck        # tsc strict, no emit
npm run lint             # eslint (includes core purity rules)
npm run format:check     # prettier (npm run format to fix)
```
Run a single test file with `npx vitest run packages/core/test/extract/js.test.ts`, or filter by ID with `-t P01`.
Node ≥ 20, ESM only. `.npmrc` pins exact versions.

## Hard rules (never break; `/review` checks these)

1. **Values never leave parsers** ([ADR 0006](docs/architecture/adr/0006-values-never-leave-parsers.md)). Parsers return `Declaration { name, file, line, hasValue, looksSecret }`. No exported type may have a property named `value`. A value must never appear in findings, warnings, errors, logs, snapshots or test names. Value-dependent checks (`looksLikeSecret`) are called **only inside parsers**.
2. **`packages/core` is pure.** It has no `fs`, no network, no `child_process` and no `process.env`. ESLint enforces this. I/O lives in `packages/cli/src/io` and `packages/cli/src/sources`.
3. **Every rule has exactly one file** (`rules/EDxxx.ts`) and **at least 3 tests**: positive, negative and suppression. Rules are pure: `(model: ScanModel) => Finding[]`.
4. **Patterns**: one commit adds the catalogue row in `docs/patterns-catalogue.md`, a test named with the same ID (`it('P01: …')`) and the implementation. Use `/add-pattern`. Never support a pattern that is not in the catalogue.
5. **Deterministic output.** Sort findings by severity, ruleId, name, file, line. Paths are posix `/`, relative to root. Never depend on Map/Set insertion order from fs walk order or on timestamps.
6. **Errors don't crash the scan.** A parse failure on one file produces a warning, the file is skipped and the scan continues. Exit 2 is reserved for tool, config or source errors. Every exit-2 error has a one-line cause and a one-line next step ([system/error-handling.md](docs/system/error-handling.md)).
7. **Dependencies.** No new dependency without a justification in the commit message and a row in [architecture/dependencies.md](docs/architecture/dependencies.md). Pin exact versions. `@aws-sdk/client-ssm` is lazy-imported only.
8. **Read-only.** Only `init` (writes config) and `fix` (writes `.env.example`) may write files.
9. **No AI or network at runtime** (D9). Network is allowed only for a configured `aws-ssm` source.
10. Locked decisions D1–D11 ([PRD §6](docs/prd.md#6-locked-decisions)) are not reopened without a PRD change-log entry.

## Workflow per task (PRD §17)

1. **Plan mode first.** Restate the task ID (e.g. `M1.2`), the PRD section it implements and the files you'll touch.
2. **Tests first**, then the implementation.
3. `npm test && npm run typecheck && npm run lint` must be green.
4. Run `/review` on the diff (see [Code review](#code-review)). Fix the findings, or log them.
5. Rahul reads the diff and commits. Commit messages reference the task ID, e.g. `M2.3: scan command table output`. Claude does not commit unless asked.
6. If an AI mistake is caught, run `/log-ai-failure`. If it reveals a missing rule, update this file **in the same commit**.

Also update the doc that owns the behaviour when you change it (see the map below). Docs and code drift is a bug.

## Code review

Reviews use the `envdrift-code-review` skill (`.claude/skills/envdrift-code-review/`, also invoked by `/review`). It runs a read-only pre-flight script, applies the checklists in its `references/` folder (security and redaction, architecture, correctness, tests, TypeScript, docs) and never edits source. Reports are saved to `docs/reviews/YYYY-MM-DD-<scope>.md` with tiers BLOCKER / HIGH / MEDIUM / NIT. Fix BLOCKER and HIGH findings before Rahul commits, or log them.

## Doc map (where truth lives)

| Topic | File |
|---|---|
| Requirements, decisions, milestones | `docs/prd.md` |
| Rule semantics: full spec / `explain` text | `docs/functional/rules/EDxxx.md` / `docs/rules.md` |
| Extraction patterns | `docs/patterns-catalogue.md` |
| CLI flags, config, sources, outputs, Action | `docs/functional/*.md` |
| Types, invariants, fingerprint, sort | `docs/architecture/data-model.md` |
| Module responsibilities | `docs/architecture/modules-*.md` |
| Decisions | `docs/architecture/adr/` |
| Security, threat model | `docs/system/security.md` |
| Error IDs and messages | `docs/system/error-handling.md` |
| Test strategy, fixtures, DoD | `docs/system/testing-qa.md` |
| AI mistakes → context changes | `docs/ai-log.md` |
| Code review reports | `docs/reviews/` |

## Placeholders (replace when known)

- `@rahulkumar`: npm scope (D11). Confirm in M2.5.
- `<gh-user>`: GitHub owner, used in the Action `uses:`, repo URLs and SARIF `helpUri`.
