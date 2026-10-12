# Module Reference — `packages/core`

> Package `@envdrift/core`. Private, bundled into the CLI by tsup. **Pure**: no `fs`, `child_process`, network, or `process.env`. ESLint enforces this (see [overview.md §4](overview.md#4-layering-and-the-purity-boundary)).
> The signatures below are the intended public API. Implementation tasks may refine them, but must update this page in the same commit.

## Summary

| File | Responsibility | Milestone | Test file |
|---|---|---|---|
| `types.ts` | Shared types ([data-model.md](data-model.md)) | M1.1 | `test/types.test.ts` (no-`value` assertion) |
| `secrets.ts` | `looksLikeSecret(value)` | M1.1 | `test/secrets.test.ts` |
| `parse/dotenv.ts` | dotenv text → declarations | M0.1 (+`looksSecret` in M1.1) | `test/parse/dotenv.test.ts` |
| `parse/keys.ts` | key list → declarations | M2.2 | `test/parse/keys.test.ts` |
| `parse/dockerfile.ts` | Dockerfile → declarations | M3.1 | `test/parse/dockerfile.test.ts` |
| `parse/compose.ts` | compose YAML → declarations + env_file paths | M3.2 | `test/parse/compose.test.ts` |
| `extract/js.ts` | JS/TS source → references, dynamic accesses | M0.2 (+accessors M1.6) | `test/extract/js.test.ts` |
| `suppress.ts` | Parse and apply `envdrift-ignore` directives | M1.4 | `test/suppress.test.ts` |
| `config/schema.ts` | zod schema + defaults | M1.2 | `test/config/schema.test.ts` |
| `model.ts` | Build `ScanModel` | M1.3 | `test/model.test.ts` |
| `rules/ED00x.ts` | One rule each | M1.5 (ED001/2/3/5/6/9), M3.3 (ED004/7/8) | `test/rules/ED00x.test.ts` |
| `rules/index.ts` | Registry, severity resolution, sort, fingerprint | M1.5 | `test/rules/index.test.ts` |
| `report/table.ts`, `report/json.ts` | Reporters | M2.3 | `test/report/*.test.ts` |
| `report/markdown.ts`, `report/sarif.ts` | Reporters | M4.1 | `test/report/*.test.ts` |
| `index.ts` | Public barrel export | M0.0 | — |

## `types.ts`
Holds all shared types. It has no runtime code except constants such as `SEVERITIES` and `RULE_IDS`. See [data-model.md](data-model.md).

## `secrets.ts`
```ts
export function looksLikeSecret(value: string): boolean;
```
- True on known prefixes: `sk_live_`, `sk_test_`, `rk_live_`, `ghp_`, `gho_`, `github_pat_`, `AKIA`, `ASIA`, `xoxb-`, `xoxp-`, `AIza`, `-----BEGIN`.
- Also true when length ≥ 20, Shannon entropy ≥ 3.5 bits/char, and the value is not a placeholder. Placeholders are `changeme`, `your-*-here`, `xxx…`, `<…>`, `example`, and `localhost` URLs.
- **Only parsers may import this module.** It is not re-exported from `index.ts`.
- Uses linear-time checks only, with no backtracking regex on untrusted input (ReDoS; see [system/security.md](../system/security.md)).

## `parse/dotenv.ts`
```ts
export interface ParsedEnvFile { declarations: Declaration[]; comments: CommentLine[]; warnings: string[] }
export function parseDotenv(text: string, file: string): ParsedEnvFile;
```
- Handles `KEY=value`, `export KEY=value`, quoted values (single, double, multi-line double), inline `#` comments, blank lines, and CRLF.
- Computes `hasValue` and `looksSecret` inside the function, then drops the value ([ADR 0006](adr/0006-values-never-leave-parsers.md)).
- Emits a warning for a duplicate key, giving the name and both line numbers. It also warns on unparseable lines, giving the line number only.
- `comments` contains **only** the `#` lines that start with `envdrift-ignore`, with their line numbers. `suppress.ts` uses them. Other comments are dropped, because a commented-out line such as `# API_KEY=sk_live_…` can contain a value.
- Never throws. A fast-check property test verifies this.

## `parse/keys.ts`
```ts
export function parseKeys(text: string, file: string): ParsedEnvFile;
```
Takes one name per line. `#` starts a comment and blank lines are ignored. Every key gets `hasValue: false` and `looksSecret: false`. Duplicates produce a warning. Never throws.

## `parse/dockerfile.ts`
```ts
export function parseDockerfile(text: string, file: string): { declarations: Declaration[]; warnings: string[] };
```
- Handles `ENV A=1 B="x y"`, legacy `ENV A 1`, `ARG A`, and `ARG A=1`.
- Handles `\` line continuations, comments, and case-insensitive instructions.
- In a multi-stage build, every stage contributes.
- A declaration's `line` is the line where its instruction starts. Never throws.

## `parse/compose.ts`
```ts
export interface ComposeParse {
  declarations: Declaration[];
  envFiles: { service: string; path: string; line: number }[];  // paths as written, unresolved
  warnings: string[];
}
export function parseCompose(text: string, file: string, opts?: { service?: string }): ComposeParse;
```
- Reads `services.*.environment` in list form (`- A=1`, `- A`) or map form (`A: 1`, `A:` null).
- Reads `services.*.env_file` as a string, a list, or `{ path }` objects. It returns the paths and the CLI resolves them.
- `${VAR}` interpolation in values is ignored.
- `service` filters the output to a single service. An unknown service produces a warning.
- Uses `yaml` with an alias-count limit and a max document size, as protection against YAML bombs.

## `extract/js.ts`
```ts
export interface ExtractResult {
  references: Reference[];
  dynamic: DynamicAccess[];
  comments: { line: number; text: string }[];   // only comments containing "envdrift-ignore", for suppress.ts
  warnings: string[];
  parsed: boolean;                               // false → counted as skipped
}
export function extract(text: string, file: string, opts: { accessors: string[] }): ExtractResult;
export function shouldParse(text: string, accessors: string[]): boolean;  // pre-filter
```
- Parses with `@babel/parser`, using the plugins `jsx`, `typescript`, and `importMeta`, in `errorRecovery` mode. A hand-written walker then traverses the AST ([ADR 0001](adr/0001-babel-parser-hand-written-walker.md)).
- The supported patterns are defined **only** in [patterns-catalogue.md](../patterns-catalogue.md). Every catalogue ID has a test with the same ID.
- Aliases are reported as `DynamicAccess { kind: 'alias' }`, not followed ([ADR 0004](adr/0004-report-aliases-not-follow.md)).
- Accessor calls are matched by identifier or member path from `opts.accessors` ([ADR 0007](adr/0007-configurable-accessors.md)).
- A parse failure produces a warning and sets `parsed: false`. It never throws.
- Only `envdrift-ignore` comments are returned. Other comment text is never surfaced, because it may contain values.

## `suppress.ts`
```ts
export interface SuppressionDirective { file: string; line: number; scope: 'line' | 'file'; ruleIds: RuleId[] | 'all' }
export function parseSuppressions(comments: { line: number; text: string }[], file: string, kind: 'code' | 'env'): SuppressionDirective[];
export function applySuppressions(findings: Finding[], directives: SuppressionDirective[], opts: { strict: boolean }):
  { kept: Finding[]; suppressed: number; warnings: string[] };
```
- In code, a directive on the same line or the line above applies to that line. `envdrift-ignore-file` applies to the whole file, but only when it appears within the first 10 lines.
- In env files, a `#` directive applies to the key on the line below it.
- A finding counts as suppressed if **any** of its locations is covered.
- In strict mode, a directive that matches nothing produces an `info` warning.
- Syntax: [functional/suppression.md](../functional/suppression.md).

## `config/schema.ts`
```ts
export const configSchema: z.ZodType<RawConfig>;
export type ResolvedConfig = z.output<typeof configSchema>;
export const BUILTIN_IGNORE: readonly string[];  // NODE_ENV, CI, HOME, PATH, PWD, TZ, npm_*, VERCEL_*, GITHUB_*
export function resolveConfig(raw: unknown): { ok: true; config: ResolvedConfig } | { ok: false; errors: { path: string; expected: string; message: string }[] };
```
This module validates and applies defaults only. The CLI owns reading the file. The full reference is [functional/configuration.md](../functional/configuration.md).

## `model.ts`
```ts
export interface ModelInputs {
  files: { path: string; extract: ExtractResult }[];
  example: SourceResult | null;
  environments: Map<string, SourceResult[]>;
  trackedEnvFiles: Declaration[][];
  stats: { filesScanned: number; filesSkipped: number; durationMs: number };
}
export function buildModel(inputs: ModelInputs, config: ResolvedConfig): ScanModel;
```
- Groups references by name and applies `ignore`, using glob-style matching for entries such as `npm_*`.
- Include and exclude are applied by the walker. `model.ts` re-checks them so the model stays correct for in-memory tests.

## `rules/ED001.ts … ED009.ts`
```ts
export const ED00x: RuleDefinition;  // { id, defaultSeverity, title, run: Rule }
```
- Each rule is pure and lives in its own file. Each has three tests: positive, negative, and suppression.
- The semantics are set by [PRD §11](../prd.md#11-rules). The per-rule specs are [functional/rules/ED001.md](../functional/rules/ED001.md) through [ED009.md](../functional/rules/ED009.md).

## `rules/index.ts`
```ts
export const RULES: readonly RuleDefinition[];
export function runRules(model: ScanModel): Finding[];
export function resolveSeverity(findings: Finding[], opts: { config: ResolvedConfig; strict: boolean; only?: RuleId[]; hasDynamic: boolean }): Finding[];
export function finalize(findings: Finding[], stats: ScanResult['stats'], warnings: string[]): ScanResult;  // sort, fingerprint, summary
```
- Severity is resolved in this order: rule default → config `rules.<ID>` → D3 downgrade → `--only` filter ([functional/severity-resolution.md](../functional/severity-resolution.md)).
- `finalize` applies the ordering and fingerprint defined in [data-model.md](data-model.md#3-fingerprint).

## `report/*.ts`
```ts
export function renderTable(r: ScanResult, opts: { color: boolean }): string;
export function renderJson(r: ScanResult): string;
export function renderMarkdown(r: ScanResult): string;   // includes <!-- envdrift-report -->
export function renderSarif(r: ScanResult, opts: { helpUriBase: string; toolVersion: string }): string;
```
- Reporters are pure string builders and never write to stdout themselves.
- The table output shows severity as text, so it reads correctly without colour.
- The formats are specified in [functional/output-formats.md](../functional/output-formats.md).

## `index.ts`
Re-exports the public API that the CLI uses. It does **not** re-export `secrets.ts`.
