# Module Reference — `packages/cli`

> Published as `@rahulkumar/envdrift` (placeholder scope, [ADR 0011](adr/0011-scoped-npm-package-name.md)). The bin command is `envdrift`.
> This package is the **only** place where file system, `git`, network, `process.env`, stdout/stderr, and exit codes are touched. All parsing and rule logic is delegated to [core](modules-core.md).

## Summary

| File | Responsibility | Milestone | Test file |
|---|---|---|---|
| `bin.ts` | Entry point, `commander` program, top-level error → exit 2 | M2.3 | `test/integration/*.test.ts` (execa) |
| `commands/scan.ts` | Orchestrates the pipeline | M2.3 | `test/integration/scan.test.ts`, golden fixtures |
| `commands/init.ts` | Detects the project and writes the config | M2.4 | `test/integration/init.test.ts` |
| `commands/explain.ts` | Prints the rule's explain text | M2.4 | `test/integration/explain.test.ts` |
| `commands/fix.ts` | `fix --example` | M5.2 | `test/integration/fix.test.ts` |
| `io/walk.ts` | File discovery | M2.1 | `test/io/walk.test.ts` |
| `io/config.ts` | Loads and validates the config | M2.2 | `test/io/config.test.ts` |
| `io/git.ts` | Lists tracked env files | M3.3 | `test/io/git.test.ts` |
| `sources/dotenv.ts`, `sources/keys.ts` | Source adapters | M2.2 | `test/sources/*.test.ts` |
| `sources/dockerfile.ts` | Source adapter | M3.1 | `test/sources/dockerfile.test.ts` |
| `sources/compose.ts` | Source adapter + env_file resolution | M3.2 | `test/sources/compose.test.ts` |
| `sources/aws-ssm.ts` | SSM adapter (lazy SDK import) | M5.1 | `test/sources/aws-ssm.test.ts` (`aws-sdk-client-mock`) |

## `bin.ts`
```ts
#!/usr/bin/env node
// builds the commander program; routes to commands; maps thrown EnvDriftError → stderr + exit 2
```
- Owns `--version`, `--help`, `--no-color`, and `--cwd`.
- Colour is off when `NO_COLOR` is set or stdout is not a TTY.
- Any unexpected exception prints one line for the cause and one line for the next step, then exits with 2 ([system/error-handling.md](../system/error-handling.md)). A stack trace is printed only when `DEBUG=envdrift`. Proposal: the PRD does not define a debug flag.

## `commands/scan.ts`
```ts
export interface ScanOptions {
  config?: string; formats: Format[]; output?: string; only?: RuleId[]; env?: string[];
  failOn: 'error' | 'warning' | 'never'; strict: boolean; color: boolean; cwd: string;
}
export async function runScan(opts: ScanOptions): Promise<{ result: ScanResult; rendered: Map<Format, string>; exitCode: 0 | 1 | 2 }>;
```
- This is a programmatic entry point, which the Action reuses. It returns the rendered strings and the exit code and does **not** print or write `--output` files. `bin.ts` does the printing and writing; the Action ignores stdout and uses `rendered` directly.
- It measures total elapsed time and sets `stats.durationMs` just before `finalize`.
- Runs the pipeline described in [data-flow.md §2](data-flow.md#2-envdrift-scan-sequence).
- `--env` limits the run to a subset of the configured environments.
- When several formats are requested, the first goes to stdout. Each of the others goes to `--output` plus its extension ([functional/cli.md](../functional/cli.md)).
- Exit code: 1 if any finding is at or above `--fail-on`, otherwise 0. A config or source error gives 2.

## `commands/init.ts`
```ts
export async function runInit(opts: { cwd: string; force: boolean }): Promise<0 | 2>;
```
- Detects `.env.example`, `Dockerfile*`, and `docker-compose*.yml` / `compose*.yaml`.
- Detects frontend prefixes from the `package.json` dependencies: `next` → `NEXT_PUBLIC_`, `vite` → `VITE_`, `react-scripts` → `REACT_APP_`, `expo` → `EXPO_PUBLIC_`.
- Writes `envdrift.config.yaml` and prints what it detected.
- If a config already exists and `--force` is not set, it refuses and exits 2.

## `commands/explain.ts`
```ts
export function runExplain(ruleId: string): 0 | 2;
```
- Prints the explain text for the rule. The text is embedded at build time from [rules.md](../rules.md), so `docs/` is not read at runtime.
- Mechanism (Proposal): `commands/explain.ts` imports `docs/rules.md` as raw text (tsup `loader: { '.md': 'text' }`; Vitest `?raw`) and splits it on `## EDxxx` headings. The import lives in `packages/cli`, never in core, so core stays free of file access. A test asserts every ID in `RULE_IDS` has a section.
- An unknown ID prints the valid IDs and exits 2.

## `commands/fix.ts`
```ts
export async function runFix(opts: { cwd: string; example: true; prune: boolean; dryRun: boolean; config?: string }): Promise<0 | 2>;
```
- Writes `.env.example` and nothing else. Untouched lines are kept byte for byte.
- Missing keys are appended under `# Added by envdrift` with empty values.
- Keys are removed only when `--prune` is set.
- `--dry-run` prints a diff and writes nothing.
- The value rule: line contents are copied as opaque strings and never printed. The redaction approach is described in [data-flow.md §4](data-flow.md#4-envdrift-fix---example).

## `io/walk.ts`
```ts
export async function walk(opts: { root: string; include: string[]; exclude: string[]; maxFileBytes: number }):
  Promise<{ files: { path: string; text: string }[]; skipped: { path: string; reason: SkipReason }[] }>;
type SkipReason = 'too-large' | 'binary' | 'symlink-outside-root' | 'unreadable' | 'gitignored';
```
- Applies `.gitignore` semantics (via `ignore`), then the include and exclude globs (via `picomatch`).
- Skips files larger than `limits.maxFileBytes`.
- Skips binary files, detected as a NUL byte in the first 8 KB.
- Resolves each symlink with `realpath` and skips it if the target is outside the root.
- Skips `.d.ts` files.
- Returns POSIX paths relative to the root, sorted.

## `io/config.ts`
```ts
export async function loadConfig(opts: { cwd: string; path?: string }): Promise<{ config: ResolvedConfig; configDir: string }>;
```
- Finds the config by trying `envdrift.config.yaml` first, then `.yml`.
- Parses it with `yaml` and validates it with `core/config/schema.ts`.
- `root` is resolved relative to the config file.
- Each validation error prints its path and the expected type, then the command exits 2.

## `io/git.ts`
```ts
export async function trackedEnvFiles(root: string): Promise<string[]>;
```
- Runs `git ls-files -z` with `cwd: root`, using `execFile` rather than a shell.
- Filters the result to `.env` and `.env.*`, excluding `.env.example`, `.env.sample`, and `.env.template`.
- If the root is not a git repo, it returns `[]` and adds a warning. That is not an error.

## `sources/*.ts`
```ts
export interface SourceRead { result: SourceResult; comments: CommentLine[] }   // comments: only `envdrift-ignore` lines, for suppress.ts
export interface SourceAdapter<C> { read(cfg: C, ctx: { configDir: string; root: string }): Promise<SourceRead> }
```
`SourceResult` is part of the model and carries no comments. The adapter returns the parser's `comments` alongside it, and `scan.ts` passes them to `parseSuppressions(…, 'env')`. Without this, `# envdrift-ignore ED003/ED004/ED008` in dotenv and keys files could not reach the suppression stage. `aws-ssm` and `dockerfile` return `comments: []`.
| Adapter | Reads | Core parser | Notes |
|---|---|---|---|
| `dotenv.ts` | file | `parseDotenv` | Missing file → exit 2 (source error) |
| `keys.ts` | file | `parseKeys` | — |
| `dockerfile.ts` | file | `parseDockerfile` | — |
| `compose.ts` | file + each `env_file` | `parseCompose`, `parseDotenv` | `env_file` paths are resolved relative to the compose file and must stay inside the root; `service` filter |
| `aws-ssm.ts` | `GetParametersByPath` (paginated, `Recursive: true`, `WithDecryption: false`) | none; builds declarations directly with `hasValue: true`, `looksSecret: false` | `@aws-sdk/client-ssm` is loaded with `await import()` only here. Name is the last path segment, unless `nameFrom: fullPath` |

The `sourceId` format is `<env>:<type>:<path>`, for example `staging:dotenv:deploy/staging.keys`. The example source's ID is `example`.

AWS error mapping (M5.1):
| Condition | Result |
|---|---|
| Missing credentials | exit 2: "AWS credentials not found" plus a next step |
| `AccessDeniedException` | exit 2 and print the minimal IAM policy |
| Throttling | retry 3× with backoff, then exit 2 |
| Empty path | warning, not an error |
