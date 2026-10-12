# Data Model

> Implements [PRD §9](../prd.md#9-data-model-core-types). Code lives in `packages/core/src/types.ts`. If this page and the PRD disagree, the PRD wins. Raise the conflict, don't silently pick one.

## 1. Core types (verbatim from PRD §9)

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

type Rule = (model: ScanModel) => Finding[];   // pure, no side effects, one file per rule
```

`ResolvedConfig` is the output type of the zod schema in `config/schema.ts` (all defaults applied). See [functional/configuration.md](../functional/configuration.md).

## 2. Invariants

| # | Invariant | Enforced by |
|---|---|---|
| I1 | No exported type has a property named `value` (or holds raw config values under another name) | Type-level test in `packages/core/test` (M1.1) + [ADR 0006](adr/0006-values-never-leave-parsers.md) + redaction E2E test |
| I2 | `line` and `column` are **1-based** everywhere (Babel columns are 0-based and must be converted) | Extractor tests per pattern |
| I3 | `file` is a POSIX path (`/` separators) **relative to the scan root**, never absolute | `io/walk.ts` normalisation; Windows path test |
| I4 | `message`, `fix`, `note`, and every warning string contain names, paths, and counts only — never values | Redaction E2E test (all formats) |
| I5 | Iteration order of `Map`s and arrays coming from the file system is **never** relied upon for output | Explicit sort before reporting (§4) |
| I6 | `references` contains only names not in `ignore` (user list + built-in defaults unless `ignoreDefaults: false`) | `model.ts` tests |
| I7 | A `Finding` always has at least one `Location` | Rule tests |
| I8 | Rules are pure: same `ScanModel` → same `Finding[]` | Rule tests run twice / property tests |

## 3. Fingerprint

Stable identity for a finding across runs, used for SARIF `partialFingerprints` and for diffing reports.

```
input       = [ruleId, name ?? '', sortedEnvironments.join(','), locations[0].file].join('|')
fingerprint = sha1(input) as lowercase hex
```

- `sortedEnvironments` = `environments` sorted lexicographically, or empty string if absent.
- Line numbers are **excluded** on purpose, so unrelated edits that shift lines do not change the fingerprint.
- `locations[0]` is taken **after** locations are sorted (file, then line, then column).
- Hashing uses `node:crypto` `createHash('sha1')`. It is computation, not I/O, so it is allowed in core.

## 4. Deterministic ordering

Required by [PRD §16](../prd.md#16-non-functional-requirements): same input → byte-identical JSON.

1. **Locations inside a finding:** `file`, `line`, `column` ascending.
2. **Environments inside a finding:** lexicographic.
3. **Findings:** severity (`error` → `warning` → `info`), then `ruleId`, then `name` (missing name sorts first), then first location `file`, then first location `line`.
4. **Warnings:** lexicographic, de-duplicated.
5. String comparison uses plain code-unit ordering (`a < b`), not `localeCompare`, so results do not depend on the machine's locale.

`stats.durationMs` is the only field that varies by design. Golden tests mask it before comparison.

## 5. `ScanResult` as JSON

- The `json` reporter emits `ScanResult` exactly. It is `JSON.stringify(result, null, 2)` with a trailing newline. Keys follow the order of the interface declarations above.
- Schema: [output-schema.json](../output-schema.json), snapshot-tested.
- `summary` always contains all three keys (`error`, `warning`, `info`), including zeros.
- `ScanModel` is internal and never serialised. `Map` fields do not appear in output.

### Versioning policy

- `version: 1` is the contract for the hackathon release.
- **Additive** changes (new optional field, new rule ID) keep `version: 1`.
- **Breaking** changes (rename, removal, type change, semantics change of an existing field) bump to `version: 2` and need a PRD change-log entry.

## 6. Open questions

| # | Question | Proposed resolution |
|---|---|---|
| OQ1 | [PRD §11](../prd.md#11-rules) says suppressed findings are "counted in `stats.suppressed`", but §9 `stats` has no `suppressed` field. The table reporter footer (§13) also shows a suppressed count. | Proposal: add `suppressed: number` to `ScanModel['stats']` (and so to `ScanResult.stats`). This is additive, so it stays `version: 1`. Needs a PRD change-log entry before M1.4. |
| OQ2 | Where do suppression directives live in the model? §9 does not define a type. | Proposal: `SuppressionDirective { file: string; line: number; scope: 'line' \| 'file'; ruleIds: string[] \| 'all' }`, produced by `suppress.ts`. It is internal and not part of `ScanResult`. |
| OQ3 | `ruleId` template type has a 1-digit suffix only. | Fine for ED001–ED009. Adding ED010+ needs a type change (additive). |
