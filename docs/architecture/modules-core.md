# Module Reference — `packages/core`

> Package `@envdrift/core`. Private, bundled into the CLI by tsup. **Pure**: no `fs`, `child_process`, network, or `process.env`. ESLint enforces this (see [overview.md §4](overview.md#4-layering-and-the-purity-boundary)).
> The signatures below are the intended public API. Implementation tasks may refine them, but must update this page in the same commit.

## Summary

| File | Responsibility | Milestone | Test file |
|---|---|---|---|
| `types.ts` | Shared types ([data-model.md](data-model.md)) | M0.0 (created), M1.1 (extended) | `test/types.test.ts` (no-`value` assertion) |
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

It also defines `CommentLine { line: number; text: string }`, used by parsers and the extractor to hand `envdrift-ignore` comments to `suppress.ts`. `ResolvedConfig` is declared in `config/schema.ts` and imported into `types.ts` with `import type` only, so no runtime import cycle exists.

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
- Handles `KEY=value`, `export KEY=value` (prefix only when followed by whitespace, so a key named `export` still works), quoted values (single, double, backtick; multi-line double only), inline `#` comments (a `#` at the start of the value or after whitespace), blank lines, a UTF-8 BOM, and CRLF.
- A double-quoted value may span at most 100 lines. An unterminated quote does not swallow later keys: the value is taken as the rest of that line and a warning is emitted. A later stray `"` within 100 lines can still close an earlier unterminated quote (same as common dotenv parsers).
- Computes `hasValue` and `looksSecret` inside the function, then drops the value ([ADR 0006](adr/0006-values-never-leave-parsers.md)).
- Emits a warning for a duplicate key, giving the name and both line numbers. It also warns on unparseable lines (`<file>:<line>: invalid line`) and unterminated quotes (`<file>:<line>: unterminated quote`), giving the line number only. Warnings are de-duplicated and sorted.
- `comments` contains **only** the `#` lines that start with `envdrift-ignore`, with their line numbers. The text is sanitised to `envdrift-ignore` plus any `EDnnn` tokens, so trailing words cannot leak. `envdrift-ignore-file` and similar suffixed forms are not returned for env files. `suppress.ts` uses them. Other comments are dropped, because a commented-out line such as `# API_KEY=sk_live_…` can contain a value.
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
  comments: CommentLine[];                       // only comments containing "envdrift-ignore", for suppress.ts
  warnings: string[];
  parsed: boolean;                               // false → counted as skipped
}
export function extract(text: string, file: string, opts: { accessors: string[] }): ExtractResult;
export function shouldParse(text: string, accessors: string[]): boolean;  // pre-filter
```
- Parses with `@babel/parser` in `errorRecovery` mode, `sourceType: 'unambiguous'`. Plugins follow the file extension: `.ts/.mts/.cts` → `typescript` (JSX off so `<T>x` casts parse); `.tsx` → `typescript` + `jsx`; everything else → `jsx`. `import.meta` needs no plugin in the pinned Babel 7.29. A hand-written walker then traverses the AST ([ADR 0001](adr/0001-babel-parser-hand-written-walker.md)).
- The supported patterns are defined **only** in [patterns-catalogue.md](../patterns-catalogue.md). Every catalogue ID has a test with the same ID.
- Aliases are reported as `DynamicAccess { kind: 'alias' }`, not followed ([ADR 0004](adr/0004-report-aliases-not-follow.md)).
- Accessor calls are matched by identifier or member path from `opts.accessors` ([ADR 0007](adr/0007-configurable-accessors.md)).
- A fatal parse failure produces `<file>: parse error at L:C — skipped` and sets `parsed: false`. A recoverable error produces `… — recovered` and the file is still walked. A stack overflow on pathologically nested code produces `<file>: too deeply nested — skipped`. Warnings never contain source text or Babel's own message. It never throws.
- Shadowing of `process` (catalogue N03) is tracked by a minimal scope tracker inside `js.ts`; see [patterns-catalogue.md](../patterns-catalogue.md#pre-filter-and-failure-behaviour).
- Output arrays are sorted by line, column, then name/kind. Visit order is never relied on.
- `opts.accessors` is accepted but only feeds `shouldParse` until M1.6.
- Only `envdrift-ignore` comments are returned. Other comment text is never surfaced, because it may contain values.

## `suppress.ts`
```ts
export interface SuppressionDirective { file: string; line: number; scope: 'line' | 'file'; ruleIds: RuleId[] | 'all' }
export function parseSuppressions(comments: CommentLine[], file: string, kind: 'code' | 'env'): SuppressionDirective[];
export function applySuppressions(findings: Finding[], directives: SuppressionDirective[], opts: { strict: boolean }):
  { kept: Finding[]; suppressed: number; warnings: string[] };
```
- In code, a directive on the same line or the line above applies to that line. `envdrift-ignore-file` applies to the whole file, but only when it appears within the first 10 lines.
- In env files, a `#` directive applies to the key on the line below it.
- Suppression works on **locations**. Locations covered by a directive for the finding's rule are removed. A finding is dropped only when **all** its locations are removed, and each dropped finding adds 1 to `suppressed`. Partial removal keeps the finding and does not change the count ([functional/suppression.md](../functional/suppression.md)).
- Directives from env-file parsers reach this function through the source adapters ([modules-cli.md](modules-cli.md#sourcests)).
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
- `ScanResult['stats']` is `ScanModel['stats'] & { suppressed: number }`. The model is built before suppression runs, so `suppressed` is added only here. The CLI also overwrites `durationMs` with the total elapsed time just before calling `finalize`.
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
