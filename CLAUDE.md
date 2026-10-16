# CLAUDE.md — how to work in this repo

EnvDrift is a CLI and GitHub Action that statically checks that every environment variable a JS/TS codebase reads is declared in `.env.example` and in every configured environment, and that no secret is browser-exposed or committed. It handles **names only**, never values.

- **What** to build: [`docs/prd.md`](docs/prd.md) (v2.1, locked). **How** to work: this file. If they conflict, **stop and ask** Rahul. Do not invent requirements; propose them.
- Milestones: [PRD §5](docs/prd.md#5-current-state-9-oct), [§19](docs/prd.md#19-delivery-plan). Doc map: [docs/README.md](docs/README.md).

## Layout

```
packages/core/    pure logic: extract/, parse/, rules/, report/, config/, types.ts   (@envdrift/core, private)
packages/cli/     I/O adapters + commands: commands/, io/, sources/, bin.ts        (@rahulkumar/envdrift, bin `envdrift`)
packages/action/  GitHub Action wrapper: action.yml, src/index.ts                  (private)
fixtures/         golden repos: <name>/ + expected.json   (FAKE .env files on purpose)
docs/             prd, rules, patterns-catalogue, ai-log, conventions/, functional/, architecture/, system/
scripts/          quiet/ (token-lean test/typecheck/mutation), commit-checks/, doc-lookup.mjs
.claude/          commands/ (add-rule, add-pattern, review, commit, log-ai-failure), skills/
```

## Commands

```bash
npm test | npm run test:coverage | npm run typecheck | npm run lint | npm run format:check
node scripts/quiet/test.mjs        # one line on pass; failures only (skills, agents, hooks use this)
node scripts/quiet/typecheck.mjs   # same for tsc
node scripts/doc-lookup.mjs prd 11 # one PRD section / D5 / M2.3; also `rule ED009`, `pattern P07`
```
Single test: `npx vitest run packages/core/test/extract/js.test.ts` or `-t P01`. Node ≥ 20, ESM only, exact versions in `.npmrc`.

## Hard rules (never break; `/review` checks these)

1. **Values never leave parsers** ([ADR 0006](docs/architecture/adr/0006-values-never-leave-parsers.md)). Parsers return `Declaration { name, file, line, hasValue, looksSecret }`. No exported type has a property named `value`. A value never appears in findings, warnings, errors, logs, snapshots or test names. `looksLikeSecret` is called **only inside parsers**.
2. **`packages/core` is pure**: no `fs`, network, `child_process` or `process.env` (ESLint enforces). I/O lives in `packages/cli/src/io` and `sources`.
3. **Every rule has one file** (`rules/EDxxx.ts`) and **≥ 3 tests**: positive, negative, suppression. Rules are pure `(model: ScanModel) => Finding[]`.
4. **Patterns**: one commit adds the catalogue row, a test named with the same ID (`it('P01: …')`) and the implementation (`/add-pattern`). Never support a pattern not in the catalogue.
5. **Deterministic output.** Sort by severity, ruleId, name, file, line. Posix paths relative to root. Never depend on Map/Set/fs-walk order or timestamps.
6. **Errors don't crash the scan.** A parse failure is a warning, the file is skipped. Exit 2 is for tool, config or source errors, each with a one-line cause and next step ([error-handling](docs/system/error-handling.md)).
7. **Dependencies.** None without a justification in the commit message and a row in [dependencies.md](docs/architecture/dependencies.md). Exact versions. `@aws-sdk/client-ssm` is lazy-imported only.
8. **Read-only.** Only `init` (writes config) and `fix` (writes `.env.example`) write files.
9. **No AI or network at runtime** (D9). Network only for a configured `aws-ssm` source.
10. Locked decisions D1–D11 ([PRD §6](docs/prd.md#6-locked-decisions)) are not reopened without a PRD change-log entry.

## Code review

`/review` runs the `envdrift-code-review` skill (`.claude/skills/envdrift-code-review/`): read-only, saves a report to `docs/reviews/` with tiers BLOCKER / HIGH / MEDIUM / NIT. Fix BLOCKER and HIGH before commit, or log them.

## Agents

`envdrift-reviewer` (`.claude/agents/`) reviews the staged diff in a fresh, read-only context; `/review` runs it and reuses a cached verdict for the same tree. The main session may not reword or downgrade its findings. More: [docs/ai-development.md](docs/ai-development.md).

## Commits

Commit only through `/commit` (the `envdrift-commit` skill), only after Rahul's explicit confirmation. Never push, amend, rebase, reset or use `--no-verify`. No `Co-Authored-By` trailer. Rules: [docs/conventions/commits.md](docs/conventions/commits.md), enforced by `.githooks/` and the skill.

## Session habits

One milestone task per session. Clear context after each commit; compact long sessions. Don't re-read files already read unless they changed; use `doc-lookup` and the quiet wrappers. Task flow: plan mode, tests first, green checks, `/review`, Rahul reads the diff, `/commit` ([workflow](docs/conventions/workflow.md)).
