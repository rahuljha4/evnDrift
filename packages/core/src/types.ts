// Core data model — PRD §9 (docs/prd.md#9-data-model-core-types).
// Hard rule (D6, ADR 0006): no exported type may have a property named `value`.

export type Severity = 'error' | 'warning' | 'info';

/** 1-based line and column; `file` is a posix path relative to the scan root. */
export interface Location {
  file: string;
  line: number;
  column?: number;
}

export interface Reference {
  name: string;
  file: string;
  line: number;
  column: number;
  via: 'process.env' | 'import.meta.env' | 'accessor';
  hasFallback: boolean;
}

export interface DynamicAccess {
  file: string;
  line: number;
  column: number;
  kind: 'computed-key' | 'rest-destructuring' | 'alias';
}

/** NO value field — ever. Value-dependent facts are computed inside parsers (D6). */
export interface Declaration {
  name: string;
  file: string;
  line: number;
  /** for ED007 */
  hasValue: boolean;
  /** for ED008, computed in the parser */
  looksSecret: boolean;
}

export interface SourceResult {
  /** e.g. "example", "staging:dotenv:deploy/staging.keys" */
  sourceId: string;
  declarations: Declaration[];
  warnings: string[];
}

/** Placeholder until M1.2 (config/schema.ts) derives it from the zod schema. */
export type ResolvedConfig = Record<string, unknown>;

export interface ScanModel {
  /** by name, after exclude/ignore */
  references: Map<string, Reference[]>;
  dynamic: DynamicAccess[];
  example: SourceResult | null;
  /** env name → its sources */
  environments: Map<string, SourceResult[]>;
  /** per git-tracked .env* file (ED007) */
  trackedEnvFiles: Declaration[][];
  config: ResolvedConfig;
  // Open question (docs/architecture/data-model.md): PRD §11 counts `stats.suppressed`, §9 omits it.
  stats: { filesScanned: number; filesSkipped: number; durationMs: number };
}

export type RuleId = `ED00${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;

export interface Finding {
  ruleId: RuleId;
  severity: Severity;
  /** variable name, if applicable */
  name?: string;
  /** one line, no values */
  message: string;
  /** all relevant code/config locations */
  locations: Location[];
  environments?: string[];
  /** one line */
  fix: string;
  /** sha1(ruleId|name|environments|first location file) — stable across runs */
  fingerprint: string;
  /** e.g. D3 downgrade reason */
  note?: string;
}

export interface ScanResult {
  version: 1;
  findings: Finding[];
  summary: Record<Severity, number>;
  stats: ScanModel['stats'];
  warnings: string[];
}

/** Pure, no side effects, one file per rule. */
export type Rule = (model: ScanModel) => Finding[];
