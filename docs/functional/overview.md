# Functional specification — overview

This folder describes **what EnvDrift does**, as observed by its users. It is derived from the [PRD](../prd.md). The PRD wins any conflict. If you find one, stop and raise it; do not resolve it silently.

- **Architecture:** how EnvDrift is built is described in [`../architecture/overview.md`](../architecture/overview.md).
- **Cross-cutting qualities:** security, NFRs, testing and errors are covered in [`../system/`](../system/security.md).

## Purpose

EnvDrift is a command-line tool and GitHub Action. It checks, **before deployment**, two things:

- Every environment variable that a JavaScript or TypeScript codebase reads is declared in `.env.example` and in each configured environment.
- No secret is exposed to the browser or committed to Git.

EnvDrift reads variable **names only**. It never prints, stores or transmits a value ([PRD §1](../prd.md#1-summary), [ADR 0006](../architecture/adr/0006-values-never-leave-parsers.md)).

## Document index

| File | Covers | PRD |
|---|---|---|
| [`journeys.md`](journeys.md) | J1–J4 end-to-end user journeys | §7 |
| [`cli.md`](cli.md) | Commands, flags, exit codes | §13 |
| [`configuration.md`](configuration.md) | `envdrift.config.yaml` reference | §12 |
| [`sources.md`](sources.md) | JS/TS extraction and config sources (dotenv, Dockerfile, compose, keys, AWS SSM) | §10 |
| [`rules/`](rules/ED001.md) | One spec per rule, ED001–ED009 | §11 |
| [`suppression.md`](suppression.md) | `envdrift-ignore` comments | §11 |
| [`severity-resolution.md`](severity-resolution.md) | How a finding's final severity is decided | §11, §13 |
| [`output-formats.md`](output-formats.md) | table, json, markdown, sarif | §13 |
| [`github-action.md`](github-action.md) | The GitHub Action wrapper | §14 |

## Personas

| Persona | Need | Primary touchpoint |
|---|---|---|
| Developer (primary) | Know before pushing that a new variable is declared everywhere | CLI, local |
| Reviewer / tech lead | See the config impact of a PR at a glance | PR comment |
| Release owner | Block deploys that are missing production config | CI check |
| New joiner | An accurate `.env.example` | `envdrift fix --example` |

## Goals

1. One command reports every env variable that the code reads, with file:line.
2. Compare that usage against `.env.example` and every configured environment.
3. Fail CI on error-level findings with a clear, actionable message.
4. Never expose a configuration value in any output.
5. Keep the false-positive rate low. Every finding is either actionable or explicitly suppressible.

## Non-goals (hackathon scope)

- Writing to or syncing any config store.
- A hosted dashboard or SaaS backend.
- Languages other than JS/TS.
- Kubernetes, Terraform, Vercel/Netlify APIs, AWS Secrets Manager.
- Runtime validation inside the app.
- AI inside the product ([ADR 0009](../architecture/adr/0009-no-ai-at-runtime.md)).

## Success criteria (submission)

- J1, J2 and J3 work end to end. J4 works if M5 lands.
- Installable with `npx @rahulkumar/envdrift`, or from a packed tarball.
- Core line coverage is ≥ 90%. The Stryker mutation score on `packages/core` is ≥ 80%.
- The redaction end-to-end test passes for every output format.
- Precision is checked on 3 real open-source repos and recorded in [`../benchmark.md`](../benchmark.md).

## Glossary

| Term | Meaning |
|---|---|
| **Reference** | A place in code that reads an environment variable by a statically known name, e.g. `process.env.API_URL`. It carries `name`, `file`, `line`, `column`, `via` and `hasFallback`. |
| **Dynamic access** | A read whose name cannot be known statically: a computed key, rest destructuring, or an alias. It produces ED005 and drives the D3 downgrade. |
| **Declaration** | A variable name found in a config source. It carries `name`, `file`, `line`, `hasValue` and `looksSecret`. It **never** carries a value. |
| **Source** | One configured input that yields declarations: `dotenv`, `dockerfile`, `compose`, `keys` or `aws-ssm`. |
| **Environment** | A named deployment target (e.g. `staging`, `production`) that owns one or more sources. A name is "declared in E" if any of E's sources declares it. |
| **Example** | The `.env.example` file. It is treated separately from environments (ED001, ED008). |
| **Finding** | One rule violation: rule ID, severity, optional name, message, locations, optional environments, fix, fingerprint and optional note. |
| **Fingerprint** | `sha1(ruleId \| name \| environments \| first location file)`. It is stable across runs and is used for SARIF `partialFingerprints` and de-duplication. |
| **Suppression** | An `envdrift-ignore` comment that drops matching findings. Dropped findings are counted, not shown. |
| **Fallback** | A default supplied in code when the variable is absent: `??`, `||`, a destructuring default, or an accessor's second argument. |

## Requirement ID scheme

`FR-<AREA>-NN`. The areas are listed below.

| Area | File |
|---|---|
| `J` | [`journeys.md`](journeys.md) |
| `CLI` | [`cli.md`](cli.md) |
| `CFG` | [`configuration.md`](configuration.md) |
| `SRC` | [`sources.md`](sources.md) |
| `RULE` | [`rules/`](rules/ED001.md), using the IDs `FR-RULE-ED001`…`FR-RULE-ED009` |
| `SUP` | [`suppression.md`](suppression.md) |
| `SEV` | [`severity-resolution.md`](severity-resolution.md) |
| `OUT` | [`output-formats.md`](output-formats.md) |
| `ACT` | [`github-action.md`](github-action.md) |

Milestones follow PRD §19 plus the new **M0** (spike rebuild):

- M0.1: dotenv parser.
- M0.2: JS extractor.
- M0.3: spike benchmark.

## Traceability matrix

Test paths are planned locations. `core/…` means `packages/core/test/…` and `cli/…` means `packages/cli/test/…`.

| FR | Summary | PRD § | Milestone | Planned test / fixture |
|---|---|---|---|---|
| FR-J-01 | First run: `init` then `scan` | 7 (J1) | M2.4 / gate | `cli/init.test.ts`, fixture `demo-app` |
| FR-J-02 | PR check fails, comments, then passes | 7 (J2) | M4.2 | public demo repo PR; `action/comment.test.ts` |
| FR-J-03 | Clean up unused via `--only ED003` | 7 (J3) | M3 | `cli/scan-only.test.ts`, fixture `demo-app` |
| FR-J-04 | Onboarding via `fix --example` | 7 (J4) | M5.2 | `cli/fix.test.ts` |
| FR-CLI-01 | `scan` command | 13 | M2.3 | `cli/scan.test.ts`, fixtures `clean`, `demo-app` |
| FR-CLI-02 | `--format` (multi) and `--output` naming | 13 | M2.3 / M4.1 | `cli/formats.test.ts` |
| FR-CLI-03 | `--only` filter | 13 | M2.3 | `cli/scan-only.test.ts` |
| FR-CLI-04 | `--env` filter | 13 | M2.3 | `cli/scan-env.test.ts`, fixture `compose-multi-env` |
| FR-CLI-05 | `--fail-on` and exit codes | 13 | M2.3 | `cli/exit-codes.test.ts` |
| FR-CLI-06 | `--strict` | 11, 13 | M2.3 | fixture `dynamic-heavy` |
| FR-CLI-07 | Colour: `--no-color`, `NO_COLOR`, non-TTY | 13, 16 | M2.3 | `cli/color.test.ts` |
| FR-CLI-08 | `--config` and `--cwd` resolution | 13 | M2.2 | `cli/config-resolve.test.ts` |
| FR-CLI-09 | `init` detection and overwrite guard | 7, 13 | M2.4 | `cli/init.test.ts` |
| FR-CLI-10 | `explain <ruleId>` | 13 | M2.4 | `cli/explain.test.ts` |
| FR-CLI-11 | `fix --example [--prune] [--dry-run]` | 7, 13 | M5.2 | `cli/fix.test.ts` |
| FR-CLI-12 | `--version` and `--help` | 13 | M2.5 | `cli/smoke.test.ts` (packed tarball) |
| FR-CFG-01 | Config file discovery (`.yaml`/`.yml`) | 12 | M2.2 | `cli/config-resolve.test.ts` |
| FR-CFG-02 | Schema validation and readable errors, exit 2 | 12 | M1.2 | `core/config/schema.test.ts` |
| FR-CFG-03 | Defaults; include/exclude replace semantics | 12 | M1.2 / M1.3 | `core/config/schema.test.ts`, `core/model.test.ts` |
| FR-CFG-04 | `ignore`, built-in ignore list, `ignoreDefaults` | 11, 12 | M1.3 | `core/model.test.ts` |
| FR-CFG-05 | `environments` and per-type source schema | 12 | M1.2 | `core/config/schema.test.ts` |
| FR-CFG-06 | `rules.<ID>` severity overrides | 11, 12 | M1.5 | `core/rules/index.test.ts` |
| FR-CFG-07 | `frontendPrefixes` and `accessors` | 10.1, 12 | M1.2 / M1.6 | `core/config/schema.test.ts` |
| FR-CFG-08 | `limits.maxFileBytes` | 12, 15 | M2.1 | `cli/io/walk.test.ts` |
| FR-CFG-09 | `nextConfigEnv`: drop references to Next.js build-time `env` keys (D12) | 10.8, 12 | M1.7 | `core/extract/next-config.test.ts`, `core/model.test.ts` |
| FR-SRC-01 | JS/TS extraction per patterns catalogue | 10.1 | M0.2 | `core/extract/js.test.ts` (one test per catalogue ID) |
| FR-SRC-02 | Pre-filter on `env` / accessor names | 10.1 | M0.2 / M1.6 | `core/extract/js.test.ts` |
| FR-SRC-03 | Accessor extraction | 10.1 | M1.6 | `core/extract/accessors.test.ts` |
| FR-SRC-04 | Parse failure becomes a warning and the file is skipped | 10.1 | M0.2 | `core/extract/js.test.ts` |
| FR-SRC-05 | dotenv source | 10.2 | M0.1 / M2.2 | `core/parse/dotenv.test.ts` (+ property) |
| FR-SRC-06 | Dockerfile source | 10.3 | M3.1 | `core/parse/dockerfile.test.ts` (+ property) |
| FR-SRC-07 | compose source | 10.4 | M3.2 | `core/parse/compose.test.ts`, fixture `compose-multi-env` |
| FR-SRC-08 | keys source | 10.5 | M2.2 | `core/parse/keys.test.ts` (+ property) |
| FR-SRC-09 | AWS SSM source (Should) | 10.6 | M5.1 | `cli/sources/aws-ssm.test.ts` (mocked) |
| FR-SRC-10 | Secret detection (`looksLikeSecret`) | 10.7 | M1.1 | `core/secrets.test.ts` |
| FR-SRC-11 | File walk safety | 15.4 | M2.1 | `cli/io/walk.test.ts` |
| FR-SRC-12 | Git-tracked env files for ED007 | 11 | M3.3 | `cli/io/git.test.ts`, fixture `committed-env` |
| FR-RULE-ED001 | missing-in-example | 11 | M1.5 | `core/rules/ED001.test.ts` |
| FR-RULE-ED002 | missing-in-env | 11 | M1.5 | `core/rules/ED002.test.ts` |
| FR-RULE-ED003 | unused-declaration (+ D3) | 11 | M1.5 | `core/rules/ED003.test.ts`, fixture `dynamic-heavy` |
| FR-RULE-ED004 | env-mismatch | 11 | M3.3 | `core/rules/ED004.test.ts` |
| FR-RULE-ED005 | dynamic-access | 11 | M1.5 | `core/rules/ED005.test.ts` |
| FR-RULE-ED006 | public-secret | 11 | M1.5 | `core/rules/ED006.test.ts`, fixture `vite-app` |
| FR-RULE-ED007 | committed-env-file | 11 | M3.3 | `core/rules/ED007.test.ts`, fixture `committed-env` |
| FR-RULE-ED008 | example-has-value | 11 | M3.3 | `core/rules/ED008.test.ts` |
| FR-RULE-ED009 | default-masks-missing | 11 | M1.5 | `core/rules/ED009.test.ts` |
| FR-SUP-01 | Code suppression, same line or line above | 11 | M1.4 | `core/suppress.test.ts` |
| FR-SUP-02 | Code suppression, whole file | 11 | M1.4 | `core/suppress.test.ts` |
| FR-SUP-03 | dotenv / keys suppression | 11 | M1.4 | `core/suppress.test.ts` |
| FR-SUP-04 | Unmatched suppression in `--strict` | 11 | M1.4 | `core/suppress.test.ts`, fixture `suppressions` |
| FR-SUP-05 | Suppressed count reported | 11, 13 | M1.4 / M2.3 | fixture `suppressions` |
| FR-SEV-01 | Severity resolution order | 11 | M1.5 | `core/rules/index.test.ts` |
| FR-SEV-02 | `off` disables a rule | 11, 12 | M1.5 | `core/rules/index.test.ts` |
| FR-SEV-03 | `--fail-on` threshold | 13 | M2.3 | `cli/exit-codes.test.ts` |
| FR-OUT-01 | table reporter | 13 | M2.3 | `core/report/table.test.ts` |
| FR-OUT-02 | json reporter = `ScanResult` | 9, 13 | M2.3 | `core/report/json.test.ts` (snapshot + schema) |
| FR-OUT-03 | markdown reporter | 13 | M4.1 | `core/report/markdown.test.ts` (snapshot) |
| FR-OUT-04 | sarif reporter | 13 | M4.1 | `core/report/sarif.test.ts` (schema validation) |
| FR-OUT-05 | Deterministic, sorted output | 16 | M2.3 | `cli/determinism.test.ts` |
| FR-OUT-06 | No value in any output | 15.7 | M3.4 / M4.4 | `cli/redaction.e2e.test.ts`, fixture `planted-secrets` |
| FR-OUT-07 | Paths normalised to `/` | 16 | M2.1 | `cli/io/walk.test.ts` |
| FR-ACT-01 | Action inputs | 14 | M4.2 | `action/inputs.test.ts` |
| FR-ACT-02 | Job summary always written | 14 | M4.2 | `action/summary.test.ts` |
| FR-ACT-03 | Single PR comment, upserted via marker | 14 | M4.2 | `action/comment.test.ts`, demo repo PR |
| FR-ACT-04 | `sarif-file` output | 14 | M4.2 | `action/sarif.test.ts` |
| FR-ACT-05 | Documented minimal permissions and examples | 14 | M4.2 / M7.2 | README review |
| FR-ACT-06 | Action exit status mirrors CLI | 14 | M4.2 | `action/exit.test.ts` |

**Total: 66 functional requirements.**

## Open questions (collected)

Each spec file lists its own open questions with a proposal. Until Rahul decides, the proposal is the working assumption. The most important ones are:

1. `stats.suppressed` is referenced in §11 and §13 but is missing from the §9 `ScanModel['stats']` type. *Proposal:* add `suppressed: number` to `stats` ([severity-resolution.md](severity-resolution.md), [suppression.md](suppression.md)).
2. Do suppressed ED005 accesses still trigger the D3 downgrade? See [rules/ED003.md](rules/ED003.md).
3. ED006 `KEY` uses a substring match, which also matches names like `…_KEYBOARD_…`. See [rules/ED006.md](rules/ED006.md).
4. `--output` behaviour with a single format. See [cli.md](cli.md).
