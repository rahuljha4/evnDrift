# EnvDrift — Product Requirements Document v2.1

| Field | Value |
|---|---|
| Product | EnvDrift |
| Owner | Rahul |
| Context | Build With AI Hackathon 2026 (FiftyFive) — individual entry |
| Build window | 8 Oct – 30 Oct 2026, submission EOD 30 Oct |
| Status | **Locked for build.** Changes go through the change log in section 20. |
| Supersedes | PRD v2.0 (8 Oct) |
| Intended reader | Rahul, and Claude Code working in this repository |

> **For Claude Code:** this file is the source of truth for *what* to build. `CLAUDE.md` is the source of truth for *how* to work in this repo. If the two conflict, stop and ask. Do not invent requirements that are not in this document; propose them instead.

---

## 1. Summary

EnvDrift is a command-line tool and GitHub Action that checks, **before deployment**, that every environment variable a JavaScript/TypeScript codebase reads is declared in `.env.example` and in each configured environment, and that no secret is exposed to the browser or committed to Git. It reads variable **names only** and never prints, stores, or transmits a value.

**One-line pitch:** "Your build passed, your tests passed, and production crashed because `STRIPE_WEBHOOK_SECRET` wasn't set. EnvDrift catches that in the pull request."

## 2. Problem

Configuration drift breaks deployments where the code itself is correct:

1. A variable is added in code but never added to production config, so the app crashes or misbehaves after deploy.
2. `.env.example` goes stale, so new joiners lose hours working out what to set.
3. Staging and production drift apart silently.
4. Unused variables pile up because nobody can prove they're safe to remove.
5. A secret gets a frontend prefix (`NEXT_PUBLIC_`, `VITE_`) and ships to every browser.
6. A real `.env` file is committed to Git.

Existing tools cover parts of this: dotenv linters check file syntax, and runtime validators (envalid, zod schemas) fail at app startup, which is after deployment. EnvDrift's gap is the **static, pre-deploy comparison of code usage against every environment**. *(Owner to verify prior art with a search before submission and update this paragraph.)*

## 3. Users

| Persona | Need | Primary touchpoint |
|---|---|---|
| Developer (primary) | Know before pushing that a new variable is declared everywhere | CLI, local |
| Reviewer / tech lead | See config impact of a PR at a glance | PR comment |
| Release owner | Block deploys missing production config | CI check |
| New joiner | Accurate `.env.example` | `envdrift fix --example` |

## 4. Goals, non-goals, success criteria

### Goals
1. One command reports every env variable the code reads, with file:line.
2. Compares usage against `.env.example` and every configured environment.
3. Fails CI on error-level findings with a clear, actionable message.
4. Never exposes a configuration value in any output.
5. Low false-positive rate: every finding is actionable or explicitly suppressible.

### Non-goals (this hackathon)
- Writing to or syncing any config store.
- Hosted dashboard or SaaS backend.
- Languages other than JS/TS (Python moved to roadmap).
- Kubernetes, Terraform, Vercel/Netlify APIs, AWS Secrets Manager.
- Runtime validation inside the app.
- AI inside the product (see section 15).

### Success criteria (submission)
- J1, J2, J3 (section 7) work end to end; J4 works if M5 lands.
- Installable with `npx @rahulkumar/envdrift` from npm, or from a packed tarball if publishing is blocked.
- Core coverage ≥ 90% lines; Stryker mutation score on `packages/core` ≥ 80%.
- Redaction end-to-end test passes for every output format.
- Precision check on 3 real open-source repos documented in `docs/benchmark.md`.
- `docs/ai-log.md` has ≥ 8 real entries with the context change each one caused.

## 5. Current state (9 Oct)

*(v2.1: v2.0 described a spike that does not exist in this repository. Corrected here; the spike work is now milestone M0.)*

Done (M0.0):
- Monorepo scaffold: npm workspaces `packages/core`, `packages/cli`, `packages/action`; strict TypeScript; ESLint (core purity enforced) + Prettier; Vitest; CI workflow (lint, format, typecheck, test, audit).
- `packages/core/src/types.ts` — section 9 types.
- Documentation set: `docs/functional/`, `docs/architecture/` (incl. ADRs), `docs/system/`, `docs/patterns-catalogue.md` (drafted, under review), `docs/rules.md`, `CLAUDE.md`, `.claude/commands/`.

Not started (M0.1–M0.3, section 19):
- `packages/core/src/extract/js.ts` — Babel AST extractor for catalogue patterns P01–P13, F01–F05, D01–D05, N01–N03.
- `packages/core/src/parse/dotenv.ts` — keys-only dotenv parser with a redaction test.
- `scripts/spike-scan.ts` — throwaway; **delete in M2.5** once the CLI replaces it.
- Spike benchmark on umami (names agreed with grep, grep-only extras explained, scan time) — target: v2.0's expected result of full agreement and < 1 s for ~113 files.

## 6. Locked decisions

These resolve the open questions from v1. Do not reopen without a change-log entry.

| # | Decision | Rationale |
|---|---|---|
| D1 | `@babel/parser` + hand-written walker (ADR 0001) | One parser for JS/JSX/TS/TSX; no type info needed |
| D2 | Test files are **excluded** from references by default via `exclude` globs | Test-only variables shouldn't trigger production findings |
| D3 | If the scan contains any ED005 dynamic access, ED003 findings are downgraded to `info` and annotated, unless `--strict` | Dynamic reads mean "unused" can't be proven |
| D4 | Aliases (`const env = process.env`) are reported as ED005, not followed | Following data flow is out of scope; never guess |
| D5 | A reference with a fallback that is missing from an environment produces **ED009**, not ED002 | The app won't crash, but it silently uses a dev default |
| D6 | Value-dependent checks (ED007, ED008) are computed **inside the parser**; only booleans leave it | Keeps the "values never leave the parser" rule absolute |
| D7 | Wrapper accessors (`getEnv('X')`) supported through a configurable `accessors` list | Common in real codebases; static and deterministic |
| D8 | Distribution: npm package `envdrift` (bin) + GitHub Action in the same repo | No hosting needed; "deployment" = published package + working Action |
| D9 | No AI at runtime | CI tools must be deterministic |
| D10 | Node ≥ 20, ESM only | Matches current LTS; simpler build |
| D11 | Publish as scoped `@rahulkumar/envdrift` (scope is a placeholder until the npm account is confirmed); bin command stays `envdrift` (ADR 0011) | `envdrift` is already taken on npm (v2.0.1, checked 9 Oct); section 21 fallback applied |

## 7. User journeys

### J1 — First run (Must, demo core)
1. `npx @rahulkumar/envdrift init` (bin: `envdrift`) → detects `.env.example`, Dockerfile, compose files, frontend prefixes from `package.json` dependencies (next → `NEXT_PUBLIC_`, vite → `VITE_`, react-scripts → `REACT_APP_`, expo → `EXPO_PUBLIC_`); writes `envdrift.config.yaml`; prints what it detected.
2. `npx envdrift scan` → grouped table, summary line, exit code.

### J2 — Catch it in the PR (Must, demo core)
1. PR adds `process.env.SENDGRID_API_KEY`.
2. Action runs, fails, posts one PR comment (updated in place on re-runs) and a job summary.
3. Developer adds the key; re-run passes and the comment updates to "No issues".

### J3 — Clean up (Must)
`envdrift scan --only ED003` lists unused declarations per source; each finding states "no references found in N scanned files".

### J4 — Onboarding (Should)
`envdrift fix --example` rewrites `.env.example`: keeps existing comments and order, appends missing keys (empty value) under a `# Added by envdrift` header, and never removes keys unless `--prune`.

## 8. Architecture

```
envdrift/
├── packages/
│   ├── core/          # pure: no fs, no network, no process.env reads
│   │   ├── src/
│   │   │   ├── extract/js.ts          # code → References, DynamicAccess
│   │   │   ├── parse/dotenv.ts        # dotenv text → Declarations
│   │   │   ├── parse/dockerfile.ts    # Dockerfile text → Declarations
│   │   │   ├── parse/compose.ts       # compose YAML text → Declarations + env_file paths
│   │   │   ├── parse/keys.ts          # plain key list → Declarations
│   │   │   ├── secrets.ts             # looksLikeSecret(value): boolean  (called only by parsers)
│   │   │   ├── suppress.ts            # parse envdrift-ignore comments
│   │   │   ├── model.ts               # build ScanModel from inputs
│   │   │   ├── rules/ED001.ts … ED009.ts
│   │   │   ├── rules/index.ts         # registry, severity resolution
│   │   │   ├── report/table.ts | json.ts | markdown.ts | sarif.ts
│   │   │   ├── config/schema.ts       # zod schema + defaults
│   │   │   └── types.ts
│   │   └── test/
│   ├── cli/           # I/O adapters + commands
│   │   ├── src/
│   │   │   ├── bin.ts
│   │   │   ├── commands/scan.ts | init.ts | explain.ts | fix.ts
│   │   │   ├── io/walk.ts             # file discovery, .gitignore, size limits, no symlinks out of root
│   │   │   ├── io/config.ts           # load + validate YAML
│   │   │   ├── io/git.ts              # git ls-files for ED007
│   │   │   └── sources/dotenv.ts | dockerfile.ts | compose.ts | keys.ts | aws-ssm.ts
│   │   └── test/
│   └── action/        # GitHub Action wrapper around cli
│       ├── action.yml
│       └── src/index.ts
├── fixtures/          # golden repos: <name>/ + expected.json
├── docs/
├── .claude/commands/  # add-rule.md, review.md, log-ai-failure.md
└── CLAUDE.md
```

**Data flow:** config → sources (adapters read files/SSM, call core parsers) → `ScanModel` → rules → findings → suppression → severity resolution → reporters → exit code.

### Technology

| Concern | Choice |
|---|---|
| Language | TypeScript strict, ESM, Node ≥ 20 |
| Parsing | `@babel/parser`; `yaml` for compose and config |
| Config validation | `zod` |
| CLI args | `commander` |
| Ignore handling | `ignore` (gitignore semantics) + `picomatch` for globs |
| AWS | `@aws-sdk/client-ssm` (lazy-imported only when an `aws-ssm` source is configured) |
| Build | `tsup` → single ESM bundle for `bin` and for the Action |
| Tests | Vitest; `fast-check` (property tests); `execa` (CLI integration); Stryker (mutation) |
| CI | GitHub Actions: lint, typecheck, test, coverage, build, dogfood scan |

## 9. Data model (core types)

```ts
type Severity = 'error' | 'warning' | 'info';

interface Location { file: string; line: number; column?: number }   // 1-based

interface Reference {
  name: string; file: string; line: number; column: number;
  via: 'process.env' | 'import.meta.env' | 'accessor';
  hasFallback: boolean;
}

interface DynamicAccess {
  file: string; line: number; column: number;
  kind: 'computed-key' | 'rest-destructuring' | 'alias';
}

interface Declaration {           // NO value field — ever
  name: string; file: string; line: number;
  hasValue: boolean;              // for ED007
  looksSecret: boolean;           // for ED008, computed in parser
}

interface SourceResult {
  sourceId: string;               // e.g. "example", "staging:dotenv:deploy/staging.keys"
  declarations: Declaration[];
  warnings: string[];
}

interface ScanModel {
  references: Map<string, Reference[]>;      // by name, after exclude/ignore
  dynamic: DynamicAccess[];
  example: SourceResult | null;
  environments: Map<string, SourceResult[]>; // env name → its sources
  trackedEnvFiles: Declaration[][];          // per git-tracked .env* file (ED007)
  config: ResolvedConfig;
  stats: { filesScanned: number; filesSkipped: number; durationMs: number };
}

interface Finding {
  ruleId: `ED00${1|2|3|4|5|6|7|8|9}`;
  severity: Severity;
  name?: string;                  // variable name, if applicable
  message: string;                // one line, no values
  locations: Location[];          // all relevant code/config locations
  environments?: string[];
  fix: string;                    // one line
  fingerprint: string;            // sha1(ruleId|name|environments|first location file) — stable across runs
  note?: string;                  // e.g. D3 downgrade reason
}

interface ScanResult {
  version: 1;
  findings: Finding[];
  summary: Record<Severity, number>;
  stats: ScanModel['stats'];
  warnings: string[];
}
```

`Rule = (model: ScanModel) => Finding[]` — pure, no side effects, one file per rule.

## 10. Extraction and source parsing

### 10.1 JS/TS extraction
Supported patterns are defined **only** in `docs/patterns-catalogue.md`. Adding a pattern = catalogue row + test with the same ID + implementation, in one commit.

- File types: `.js .jsx .mjs .cjs .ts .tsx .mts .cts`; skip `.d.ts`.
- Pre-filter: skip files whose text doesn't contain `env` or any configured accessor name.
- Accessors (D7): config `accessors: ["getEnv", "env.get", "config.get"]`. A call whose callee matches (identifier or member path) with a string-literal or no-expression template first argument → `Reference` with `via: 'accessor'`. Non-literal first argument → ED005 `computed-key`. A fallback is detected when a second argument is present, or the call is the left side of `??`/`||`.
- Parse failures → warning, file counted as skipped, scan continues.

### 10.2 Dotenv (`dotenv` source and `.env.example`)
Already built. Additions: `looksSecret` per D6; duplicate keys produce a warning on the source.

### 10.3 Dockerfile (`dockerfile` source)
- `ENV A=1 B="x y"`, legacy `ENV A 1`, `ARG A`, `ARG A=1`.
- Line continuations (`\`), comments, case-insensitive instructions.
- Multi-stage builds: all stages contribute.

### 10.4 docker-compose (`compose` source)
- `services.*.environment` as list (`- A=1`, `- A`) or map (`A: 1`, `A:` null).
- `services.*.env_file` (string or list, including `{ path }` objects) → resolved relative to the compose file by the CLI adapter, parsed as dotenv.
- Optional `service` filter in config to take only one service.
- `${VAR}` interpolation inside values is ignored (values aren't kept).

### 10.5 Keys file (`keys` source)
Plain text, one name per line, `#` comments. For teams that export key lists from their platform.

### 10.6 AWS SSM (`aws-ssm` source, Should)
- `GetParametersByPath` with `Path`, `Recursive: true`, `WithDecryption: false`, paginated.
- Name = last path segment, unless `nameFrom: fullPath`.
- `hasValue: true`, `looksSecret: false` (values not inspected).
- Errors map to exit code 2 with a clear message: credentials missing, `AccessDeniedException` (print the minimal IAM policy), throttling (retry 3× with backoff), empty path (warning, not error).
- Minimal IAM policy is documented in README.

### 10.7 Secret detection (`secrets.ts`, D6)
`looksLikeSecret(value)` returns true if any of:
- Known prefixes: `sk_live_`, `sk_test_`, `rk_live_`, `ghp_`, `gho_`, `github_pat_`, `AKIA`, `ASIA`, `xoxb-`, `xoxp-`, `AIza`, `-----BEGIN`.
- Length ≥ 20 and Shannon entropy ≥ 3.5 bits/char, and not an obvious placeholder (`changeme`, `your-*-here`, `xxx…`, `<…>`, `example`, `localhost` URLs).

## 11. Rules

Semantics below are authoritative. `docs/rules.md` holds the `explain` text and must agree with this section.

General: a variable listed in `ignore` never produces findings. Suppressed findings are dropped and counted in `stats.suppressed`.

| ID | Fires when | Default | Locations reported |
|---|---|---|---|
| **ED001** missing-in-example | `.env.example` is configured and a referenced name has no declaration in it | error | every reference |
| **ED002** missing-in-env | for environment E, a referenced name is absent from all of E's sources **and at least one reference has no fallback** | error | references without fallback |
| **ED003** unused-declaration | a declaration in `.env.example` or any environment has no reference. Downgraded to `info` with a note if any ED005 exists (D3), unless `--strict` | warning | the declaration |
| **ED004** env-mismatch | ≥ 2 environments configured and a name is declared in some but not all of them (independent of code usage) | warning | the declarations, plus `environments` = where it's missing |
| **ED005** dynamic-access | extractor reports a dynamic access | info | the access |
| **ED006** public-secret | a referenced or declared name starts with a configured frontend prefix **and** contains `SECRET`, `PRIVATE`, `TOKEN`, `PASSWORD`, `PASSWD`, `CREDENTIAL`, or `KEY` — except names ending in `PUBLIC_KEY`, `PUBLISHABLE_KEY`, or `SITE_KEY` | error | references and declarations |
| **ED007** committed-env-file | a Git-tracked file matching `.env` or `.env.*` (excluding `.env.example`, `.env.sample`, `.env.template`) has ≥ 1 declaration with `hasValue` | error | the file, line 1 |
| **ED008** example-has-value | a `.env.example` declaration has `looksSecret` | warning | the declaration |
| **ED009** default-masks-missing | for environment E, a referenced name is absent from E **and every reference has a fallback** | warning | the references |

Severity resolution order: rule default → config `rules.<ID>` (`error`/`warning`/`info`/`off`) → D3 downgrade → `--only` filter.

### Suppression syntax
- Code, same line or line above: `// envdrift-ignore ED001` or `// envdrift-ignore ED001 ED009` or `// envdrift-ignore` (all rules).
- Code, whole file: `// envdrift-ignore-file ED005` anywhere in the first 10 lines.
- Dotenv/keys files, line above the key: `# envdrift-ignore ED003`.
- A suppression comment that matches nothing produces an `info` warning in `--strict` mode.

## 12. Configuration

`envdrift.config.yaml` (also accepts `.yml`). Validated with zod; errors print the path and expected type, exit code 2.

```yaml
version: 1
root: .                              # scan root, relative to config file
example: .env.example                # or null to disable ED001/ED003/ED008 on example
include: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"]
exclude:                             # D2 defaults shown; user values replace defaults
  - "**/*.{test,spec}.*"
  - "**/__tests__/**"
  - "**/{test,tests,e2e,cypress}/**"
frontendPrefixes: [NEXT_PUBLIC_, VITE_]
accessors: []                        # e.g. [getEnv, config.get]
environments:
  staging:
    sources:
      - type: dotenv
        path: deploy/staging.env.keys
      - type: compose
        path: docker-compose.staging.yml
        service: api                 # optional
  production:
    sources:
      - type: aws-ssm
        path: /myapp/prod/
        region: ap-south-1
      - type: dockerfile
        path: Dockerfile
ignore: [NODE_ENV, PORT, CI]
rules:
  ED003: warning
  ED009: error
limits:
  maxFileBytes: 1000000
```

Built-in ignore list (always applied, can be disabled with `ignoreDefaults: false`): `NODE_ENV`, `CI`, `HOME`, `PATH`, `PWD`, `TZ`, `npm_*`, `VERCEL_*`, `GITHUB_*`.

## 13. CLI specification

```
envdrift scan    [--config <path>] [--format table|json|markdown|sarif[,…]] [--output <path>]
                 [--only <ID,…>] [--env <name,…>] [--fail-on error|warning|never]
                 [--strict] [--no-color] [--cwd <dir>]
envdrift init    [--force] [--cwd <dir>]
envdrift explain <ruleId>
envdrift fix     --example [--prune] [--dry-run]
envdrift --version | --help
```

- Multiple formats: first goes to stdout, the rest to `--output` with the format extension (e.g. `--output report` → `report.json`, `report.sarif`).
- `--fail-on` default `error`.
- Exit codes: **0** no findings at or above `--fail-on`; **1** findings at or above `--fail-on`; **2** tool, config, or source error.
- Respects `NO_COLOR` and non-TTY output.
- `init` refuses to overwrite an existing config without `--force`.
- `fix` writes only `.env.example`, shows a diff in `--dry-run`.

### Output formats
- **table** — grouped by severity then rule; each finding: rule, name, first location (+N more), environments, fix. Footer: counts, files scanned, duration, suppressed count.
- **json** — `ScanResult` exactly (section 9). Schema in `docs/output-schema.json`; snapshot-tested.
- **markdown** — for PR comments/job summary: summary line, table of errors, collapsible `<details>` for warnings/info, hidden marker `<!-- envdrift-report -->` for comment updating.
- **sarif** — SARIF 2.1.0, one `rule` per ED ID with `helpUri` to the rule doc, `partialFingerprints` from `fingerprint`.

## 14. GitHub Action

`uses: <owner>/envdrift@v0` with inputs:

| Input | Default | Purpose |
|---|---|---|
| `config` | `envdrift.config.yaml` | config path |
| `fail-on` | `error` | as CLI |
| `comment` | `true` | create/update a single PR comment (found via the marker) |
| `sarif-file` | empty | if set, write SARIF there for `github/codeql-action/upload-sarif` |

Always writes the markdown report to `$GITHUB_STEP_SUMMARY`. Needs `pull-requests: write` only when `comment: true`; README documents the permissions block and a full example workflow including SARIF upload and AWS OIDC for SSM.

## 15. Security and privacy (non-negotiable)

1. **Values never leave parsers** (D6). No type outside parser internals has a value field. Lint rule or test asserts no exported type has a property named `value`.
2. **Read-only.** Only `init` and `fix` write files, and only the config and `.env.example`.
3. **No network** unless an `aws-ssm` source is configured. No telemetry.
4. **File safety:** no symlink following outside root; size limit; binary detection (NUL byte in first 8 KB → skip).
5. **Least privilege:** SSM needs only `ssm:GetParametersByPath` on the configured path; decryption never requested.
6. **Supply chain:** pinned dependencies, `npm audit --audit-level=high` in CI, minimal dependency count; each new dependency justified in its commit.
7. **End-to-end redaction test:** a fixture repo with planted fake secrets in `.env`, `.env.example`, Dockerfile, compose, and a committed `.env`; run the built CLI with every format; assert no planted string appears in stdout, stderr, or output files.

**AI in the product:** none (D9). AI is used to build it (section 17).

## 16. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | 2,000-file repo in < 10 s on a laptop; measured in `docs/benchmark.md` |
| Determinism | Same input → byte-identical JSON (sorted findings: severity, ruleId, name, file, line) |
| Portability | Works on macOS, Linux, Windows paths (normalise to `/` in output) |
| Errors | Every exit-2 error has a one-line cause and one-line next step |
| Accessibility | Table output readable without colour; severity shown as text, not colour only |

## 17. AI-assisted development plan (35% of the score)

### Context files (keep current; the judges will read them)
| File | Purpose |
|---|---|
| `CLAUDE.md` | how to work here: layout, commands, hard rules, workflow |
| `docs/prd.md` | this document |
| `docs/patterns-catalogue.md` | extraction patterns ↔ test IDs |
| `docs/functional/` | functional spec: journeys, CLI, config, sources, one file per rule, outputs, Action |
| `docs/architecture/` | architecture overview, data flow, data model, modules, dependencies, ADRs |
| `docs/system/` | security & threat model, NFRs, testing/QA, CI/CD, release, error handling |
| `docs/rules.md` | `explain` text per rule |
| `docs/architecture/adr/NNNN-*.md` | decisions with evidence |
| `docs/ai-log.md` | AI failures → context changes |
| `docs/benchmark.md` | real-repo precision and performance |

### Claude Code custom commands (`.claude/commands/`)
- **`/add-rule <ID>`** — reads section 11 for that rule, creates `rules/<ID>.ts`, adds three tests (positive, negative, suppression), adds the `explain` text to `docs/rules.md`, runs tests.
- **`/add-pattern <ID> <description>`** — adds the catalogue row and failing test first, then the implementation.
- **`/review`** — reviews the current diff against: values never leave parsers; core has no I/O; every rule has three tests; findings are deterministic; errors don't crash the scan; no unjustified dependency. Outputs a findings list; does not edit.
- **`/log-ai-failure`** — appends a row to `docs/ai-log.md` from a short description.

### Workflow per task
1. Plan mode: Claude Code restates the task, the PRD section it implements, and the files it will touch.
2. Tests first, then implementation.
3. `npm test && npm run typecheck` green.
4. `/review` on the diff; fix or log findings.
5. Rahul reads the diff, commits with a message referencing the milestone task ID (e.g. `M2.3: scan command table output`).
6. Any AI mistake caught → `/log-ai-failure`; if it reveals a missing rule, update `CLAUDE.md` in the same commit.

### Evidence folder for submission
`docs/ai-development.md`: how AI was used per lifecycle stage, the custom commands, 3–5 best AI-log entries with before/after, mutation-testing results showing which AI-written tests were weak and how they were fixed.

## 18. QA strategy

| Layer | What | Tool |
|---|---|---|
| Unit | extractor patterns, every parser, every rule (3 tests each), suppression, config schema, secret detector | Vitest |
| Property | dotenv/keys parsers never throw and never output a value; Dockerfile parser never throws | fast-check |
| Golden | `fixtures/<repo>/` + `expected.json`; CLI JSON output compared exactly | Vitest + execa |
| Integration | built CLI: exit codes, formats, `--only`, `--fail-on`, `init`, `fix --dry-run`, bad config, missing files | execa |
| Security | end-to-end redaction (15.7); symlink escape; huge and binary files | Vitest |
| AWS | SSM adapter with mocked client: pagination, access denied, no credentials, throttling, empty path | `aws-sdk-client-mock` |
| Mutation | `packages/core`; target ≥ 80%; record score before and after fixing weak AI tests | Stryker |
| Real-world | run on 3 open-source repos; hand-check a sample of findings; record precision | `docs/benchmark.md` |
| Dogfood | EnvDrift scans its own repo in CI | GitHub Actions |

Required golden fixtures (minimum): `clean` (no findings), `demo-app` (the demo story), `monorepo` (multiple packages, one root example), `vite-app` (`import.meta.env`, `VITE_` prefix), `compose-multi-env` (staging + production), `committed-env` (ED007), `dynamic-heavy` (D3 downgrade), `suppressions`, `planted-secrets` (redaction).

## 19. Delivery plan

Each task is sized for one Claude Code session. **Acceptance** must be true before the commit.

### M0 — Scaffold and spike rebuild (9–11 Oct, alongside M1)
*(v2.1: added because the v2.0 section 5 spike did not exist.)*
| ID | Task | Acceptance |
|---|---|---|
| M0.0 | Repo scaffold + documentation set | lint, format, typecheck, test green; Rahul reviews docs |
| M0.1 | `parse/dotenv.ts` keys-only parser + redaction test | parser tests pass; output never contains a value |
| M0.2 | `extract/js.ts` Babel extractor; review and lock `docs/patterns-catalogue.md` | one test per catalogue ID (P, F, D, N rows) |
| M0.3 | `scripts/spike-scan.ts` + umami grep-vs-AST comparison | result recorded in `docs/benchmark.md`; differences logged in `docs/ai-log.md` |

### M1 — Core model and rules (9–11 Oct)
| ID | Task | Acceptance |
|---|---|---|
| M1.1 | Extend `types.ts` to section 9; add `looksSecret` to dotenv parser; `secrets.ts` | parser + secret detector tests pass; no exported type has `value` |
| M1.2 | `config/schema.ts` with zod + defaults (section 12) | valid/invalid config tests incl. readable error paths |
| M1.3 | `model.ts`: build `ScanModel`, apply include/exclude/ignore | model tests on in-memory inputs |
| M1.4 | `suppress.ts` (section 11 syntax) | tests for line, line-above, file, multi-ID, dotenv |
| M1.5 | Rules ED001, ED002, ED003 (+D3), ED005, ED006, ED009 via `/add-rule` | 3 tests each; severity resolution tests |
| M1.6 | Accessor extraction (10.1) + catalogue rows | pattern tests pass |

### M2 — CLI and J1 (12–14 Oct)
| ID | Task | Acceptance |
|---|---|---|
| M2.1 | `io/walk.ts`: gitignore, include/exclude, size, binary, symlinks | walker tests incl. symlink escape |
| M2.2 | `io/config.ts` + dotenv/keys source adapters | integration tests with temp dirs |
| M2.3 | `scan` command, table + json reporters, exit codes, `--only`, `--fail-on`, `--no-color` | golden fixtures `clean`, `demo-app` pass |
| M2.4 | `explain`, `init` (prefix detection from package.json) | integration tests |
| M2.5 | Build with tsup, `bin` works via `npm pack` + `npx` | smoke test in CI; delete `scripts/spike-scan.ts`; confirm npm scope for D11 |
| **Gate** | **J1 works end to end on `demo-app` and one real repo** | if not met by 14 Oct, drop M5 entirely |

### M3 — More sources and J3 (15–17 Oct)
| ID | Task | Acceptance |
|---|---|---|
| M3.1 | Dockerfile parser + source | parser + property tests |
| M3.2 | Compose parser + source (env_file resolution, service filter) | fixture `compose-multi-env` passes |
| M3.3 | Rules ED004, ED007 (`io/git.ts`), ED008 | 3 tests each; fixture `committed-env` passes |
| M3.4 | Redaction end-to-end test (15.7) | passes for table and json |

### M4 — CI integration and J2 (18–20 Oct)
| ID | Task | Acceptance |
|---|---|---|
| M4.1 | Markdown and SARIF reporters | snapshot tests; SARIF validates against schema |
| M4.2 | GitHub Action (`action.yml`, comment upsert, job summary, sarif-file) | runs on a public demo repo PR; comment updates in place |
| M4.3 | Dogfood workflow in this repo | CI green with EnvDrift scanning itself |
| M4.4 | Redaction test extended to markdown and sarif | passes |

### M5 — Should-haves (21–23 Oct, cut first if behind)
| ID | Task | Acceptance |
|---|---|---|
| M5.1 | AWS SSM source with mocked tests; README IAM policy | all error cases tested |
| M5.2 | `fix --example` with `--dry-run` and `--prune` | J4 works; preserves comments and order |

### M6 — Hardening (24–26 Oct)
| ID | Task | Acceptance |
|---|---|---|
| M6.1 | Stryker on core; strengthen weak tests | score ≥ 80%; before/after logged |
| M6.2 | Remaining golden fixtures (section 18) | all pass |
| M6.3 | Benchmark on 3 real repos (precision sample + timing) | `docs/benchmark.md` written |
| M6.4 | Full `/review` pass over the codebase; fix or log | review notes committed |

### M7 — Ship and document (27–28 Oct)
| ID | Task | Acceptance |
|---|---|---|
| M7.1 | Publish to npm (or attach packed tarball) | `npx @rahulkumar/envdrift --version` works on a clean machine |
| M7.2 | README: install, quick start, config, rules, Action, IAM, limitations | reviewed by Rahul |
| M7.3 | `docs/ai-development.md`, `docs/architecture/`, ADRs complete | matches submission guide sections |

### M8 — Submit (29–30 Oct)
Demo video (≤ 5 min), ZIP with full Git history, final secret scan of the repo, submit by EOD 30 Oct. 30 Oct is buffer only.

### Cut order if behind
1. M5.1 AWS SSM → 2. M5.2 `fix --example` → 3. SARIF → 4. accessors (M1.6) → 5. ED008. Never cut: redaction test, J1, J2, AI log, docs.

## 20. Demo script (≤ 5 min)

| Time | Show |
|---|---|
| 0:00–0:35 | Problem: demo app deploys, production crashes on a missing variable |
| 0:35–1:45 | `npx envdrift init` → `scan`: missing var (ED002), unused var (ED003), `NEXT_PUBLIC_` secret (ED006) |
| 1:45–2:30 | PR adds a variable → Action fails with comment → fix → green |
| 2:30–4:00 | How AI built it: CLAUDE.md, patterns catalogue as shared context, `/add-rule` command, two AI-log entries (grep-vs-AST finding; a weak test exposed by mutation testing) |
| 4:00–5:00 | Engineering: values-never-leave-parser design + redaction test, ADR, benchmark numbers, limitations |

## 21. Risks

| Risk | Mitigation |
|---|---|
| False positives make it noisy | D2, D3, ignore defaults, suppressions; benchmark on real repos |
| Scope creep | Cut order (19); non-goals (4) |
| Value leak | D6 + type-level rule + end-to-end redaction test |
| npm name `envdrift` taken | **Materialised** (checked 9 Oct: `envdrift` v2.0.1 exists). Resolved by D11: scoped `@rahulkumar/envdrift`; confirm scope ownership in M2.5 |
| Action permissions confusion | Documented minimal permissions and example workflow |
| AI-generated tests are shallow | Mutation testing; human review of every test file before commit |

## 22. Hackathon submission mapping

| Guide requirement | Where it lives |
|---|---|
| Product description, problem | README, this PRD |
| ZIP + full Git history | repo |
| Architecture, stack, decisions, limitations, dependencies | `docs/architecture/overview.md`, `docs/architecture/adr/`, `docs/architecture/dependencies.md`, README |
| How AI was used, workflow, context, skills, agents, instructions, guardrails | `docs/ai-development.md`, `CLAUDE.md`, `.claude/commands/` |
| AI-assisted QA | section 18 + `docs/ai-development.md` + mutation results |
| Demo ≤ 5 min | section 20 |
| No secrets in repo | ED007 dogfood + redaction tests + final manual check |
| Pre-existing work disclosure | none; PRD written 8 Oct 2026, repo started 9 Oct 2026 |

## 23. Change log
| Date | Version | Change |
|---|---|---|
| 2026-10-08 | 1.0 | Initial PRD |
| 2026-10-08 | 2.0 | Locked decisions D1–D10; added accessors, keys source, suppression syntax, ED002/ED009 split, D3 downgrade, data model, CLI spec, output formats, Action spec, task-level plan with gates and cut order; Python moved to roadmap |
| 2026-10-09 | 2.1 | Section 5 corrected (spike did not exist) and milestone M0 added; D11 scoped npm name (`envdrift` taken); doc paths in sections 17 and 22 moved to `docs/functional/`, `docs/architecture/`, `docs/system/`; pre-existing work disclosure dated 9 Oct |

## 24. Roadmap (post-hackathon, not in scope)
Python and Go extractors; alias following; Kubernetes, Terraform, Vercel, Netlify sources; Secrets Manager key listing; VS Code extension; pre-commit hook; optional AI-written explanations.
