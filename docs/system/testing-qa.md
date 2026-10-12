# Testing and QA Strategy

> Implements [PRD §18](../prd.md#18-qa-strategy). Thresholds come from [PRD §4](../prd.md#4-goals-non-goals-success-criteria). Workflow from [PRD §17](../prd.md#17-ai-assisted-development-plan-35-of-the-score).

The PRD says tests are written **first**, and AI-written tests are treated as suspect until mutation testing shows they are strong.

## 1. Test layers

| Layer | What is tested | Tool | Location | Runs in |
|---|---|---|---|---|
| Unit | Extractor patterns, every parser, every rule (3 tests each), suppression, config schema, secret detector, severity resolution, reporters | Vitest | `packages/core/test/**` | `npm test` |
| Property | Dotenv and keys parsers never throw and never output a value; the Dockerfile parser never throws; sort order is total and stable; the secret detector runs in bounded time | fast-check | `packages/core/test/property/**` | `npm test` |
| Golden | `fixtures/<name>/` plus `expected.json`; CLI JSON output compared exactly | Vitest + execa | `packages/cli/test/golden.test.ts` | `npm test` (after build) |
| Integration | Built CLI: exit codes, formats, `--only`, `--fail-on`, `init`, `fix --dry-run`, bad config, missing files, every `E-*` error | execa | `packages/cli/test/integration/**` | `npm test` (after build) |
| Security | End-to-end redaction ([security.md §4](security.md#4-redaction-end-to-end-test-design-sec-07)); symlink escape; huge and binary files; YAML bomb; prototype pollution | Vitest | `packages/cli/test/redaction.test.ts`, `packages/cli/test/io/walk.test.ts`, `packages/core/test/parse/**` | `npm test` |
| AWS | SSM adapter with a mocked client: pagination, access denied, no credentials, throttling, empty path | `aws-sdk-client-mock` | `packages/cli/test/sources/aws-ssm.test.ts` | `npm test` |
| Mutation | `packages/core`, target ≥ 80% | Stryker | `stryker.config.json` (M6.1) | `npm run mutation` (manual or nightly) |
| Real-world | Run on 3 open-source repos, hand-check a sample, record precision | built CLI | [benchmark.md](../benchmark.md) | manual (M0.3, M6.3) |
| Dogfood | EnvDrift scans its own repo | GitHub Actions | `.github/workflows/dogfood.yml` (M4.3) | CI |

## 2. Layout and naming conventions

- Test files are `packages/<pkg>/test/**/*.test.ts` and mirror the `src/` path. For example, `src/parse/dotenv.ts` is tested by `test/parse/dotenv.test.ts`.
- **Pattern tests are named by catalogue ID.** Each row in [patterns-catalogue.md](../patterns-catalogue.md) has exactly one test whose name starts with the ID:

  ```ts
  it('P04: destructuring from process.env yields a Reference per key', ...)
  ```

  Adding a pattern means the catalogue row, the test with the same ID and the implementation, all in one commit.
- **Rule tests come in three per rule**, in `test/rules/ED00N.test.ts`:
  - `positive`: the rule fires with the expected severity, locations and message.
  - `negative`: a closely related input does not fire.
  - `suppression`: an `envdrift-ignore ED00N` comment drops the finding and increments `stats.suppressed`.

  Rules with special interactions add more tests: ED003 with D3 and `--strict`, and ED002/ED009 for D5.
- Tests build `ScanModel`s in memory with helper builders in `packages/core/test/helpers/`. Core tests never touch the filesystem, which keeps core pure.
- CLI tests create temporary directories (`fs.mkdtemp` under `os.tmpdir()`) and clean them up. They never write inside `fixtures/`.
- Snapshots are allowed for reporter output (`toMatchFileSnapshot`). Snapshot updates must be reviewed in the diff and never accepted blindly.

## 3. Golden fixture contract

Each fixture is `fixtures/<name>/` (a small self-contained repo) plus `fixtures/<name>/expected.json`. See [fixtures/README.md](../../fixtures/README.md).

- `expected.json` is exactly the `ScanResult` JSON from `envdrift scan --format json`, with `stats.durationMs` normalised to `0`.
- The harness runs the built CLI with `--cwd fixtures/<name>`. It compares the bytes after normalisation and also asserts the exit code recorded in `fixtures/<name>/expected-exit-code` (Proposal; the default is derived from the findings).
- Fixtures that need git state (ED007) are copied to a temp directory and `git init`-ed by the harness. Fixtures do not contain nested `.git` directories.
- All secret-looking values in fixtures are fake and contain the marker `ENVDRIFT_PLANTED` or an obvious placeholder.

| Fixture | Purpose | Key rules exercised | Milestone |
|---|---|---|---|
| `clean` | No findings, exit 0 | none | M2.3 |
| `demo-app` | The demo story: missing in production, unused, public secret | ED002, ED003, ED006 | M2.3 |
| `monorepo` | Multiple packages, one root `.env.example` | ED001, ED003, path handling | M6.2 |
| `vite-app` | `import.meta.env`, `VITE_` prefix | ED001, ED006 | M6.2 |
| `compose-multi-env` | staging and production via compose, `env_file`, service filter | ED002, ED004, ED009 | M3.2 |
| `committed-env` | Git-tracked `.env` with values | ED007 | M3.3 |
| `dynamic-heavy` | Computed keys and aliases cause the D3 downgrade | ED005, ED003 → info | M6.2 |
| `suppressions` | Line, line-above, file-level and dotenv suppressions; unmatched suppression in `--strict` | all suppressible rules | M6.2 |
| `planted-secrets` | Redaction end-to-end test | ED006, ED007, ED008 | M3.4 |

## 4. Property tests (fast-check)

| Property | Arbitrary | Assertion |
|---|---|---|
| Dotenv parser total | arbitrary unicode strings and line arrays | never throws |
| Dotenv parser redacts | generated `KEY=<value>` lines with random values (≥ 6 chars) | `JSON.stringify(result)` does not contain any value |
| Keys parser total and redacting | as above | as above |
| Dockerfile parser total | random instruction-like lines, continuations, comments | never throws |
| Sort order | shuffled `Finding[]` | sorted output is the same for every permutation |
| Secret detector bounded | strings up to 1 MB | each call completes in < 50 ms; deterministic |

## 5. Integration tests (execa)

- They run against the **built** CLI (`packages/cli/dist/bin.js`) and never against `src/`. This catches bundling errors.
- Each test asserts the exit code, stdout and stderr, and any output files.
- Coverage:
  - exit codes 0, 1 and 2;
  - every `--format`, and multi-format with `--output`;
  - `--only`, `--env`, `--fail-on` (`error`, `warning`, `never`), `--strict`, `--no-color`, `NO_COLOR`;
  - `init` (fresh, existing without `--force`, with `--force`);
  - `explain` (valid and unknown ID);
  - `fix --example --dry-run` and `--prune`;
  - every `E-*` entry in [error-handling.md](error-handling.md).

## 6. Coverage and mutation thresholds

| Metric | Scope | Threshold | Enforced by |
|---|---|---|---|
| Line coverage | `packages/core` | ≥ 90% | `vitest.config.ts` coverage thresholds; CI fails below |
| Line coverage | `packages/cli` | Proposal: ≥ 80% (not in PRD) | report only until agreed |
| Mutation score | `packages/core` | ≥ 80% | Stryker `thresholds.break: 80` (M6.1) |

**Mutation procedure (M6.1):**
1. Run Stryker on `packages/core` and record the **before** score and the surviving mutants in [ai-development.md](../ai-development.md).
2. For each surviving mutant, decide whether the test is weak (strengthen it) or the mutant is equivalent (ignore it, with a comment).
3. Log each weak AI-written test in [ai-log.md](../ai-log.md) with the context change it caused.
4. Re-run and record the **after** score.

## 7. Real-world benchmark procedure

Used at M0.3 (umami spike) and M6.3 (3 repos). Results go in [benchmark.md](../benchmark.md).

1. Pin each repo by commit SHA and record its file count.
2. Run `envdrift scan --format json` and record the findings and `durationMs`.
3. Compare the extracted names with `grep -rhoE "process\.env\.[A-Z_][A-Z0-9_]*|import\.meta\.env\.[A-Z_][A-Z0-9_]*"`. Explain every difference.
4. Hand-check a sample of findings: all error-level findings, plus up to 20 random others. Label each as true positive, false positive or unclear.
5. Precision = true positives / (true positives + false positives). Record false positives with their root cause and log them as AI-log or issue items.
6. Timing: use the median of 5 runs, with the machine spec recorded.

## 8. Dogfood

From M4.3, CI runs the built CLI on this repository with a checked-in `envdrift.config.yaml`. The scan must exit 0. This proves ED007 (no committed `.env`) and gives a live example for the judges.

## 9. Definition of done (per task)

A task (`Mx.y`) is done only when all of these are true:

1. Tests were written before or with the implementation. For patterns and rules, the test IDs match the catalogue or rule ID.
2. `npm run lint && npm run typecheck && npm test` are green locally. Coverage thresholds hold.
3. `/review` was run on the diff, and every finding was fixed or logged.
4. Docs were updated in the same commit when behaviour changed (`rules.md`, `patterns-catalogue.md`, the functional docs, `CLAUDE.md` if a new rule of work emerged).
5. No new dependency without a justification line in the commit message and in [dependencies.md](../architecture/dependencies.md).
6. Any AI mistake caught during the task was logged with `/log-ai-failure`.
7. Rahul has read the diff and committed with `Mx.y: <summary>`.
