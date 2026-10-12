# Suppression — `envdrift-ignore`

| Item | Value |
|---|---|
| Source | [PRD §11 — Suppression syntax](../prd.md#11-rules) |
| Milestone | M1.4 |
| Implementation | `packages/core/src/suppress.ts` |

Suppression lets a team accept a specific finding without disabling the rule globally. Suppressed findings are **dropped and counted**.

## Syntax

| Where | Form | Scope |
|---|---|---|
| Code, same line | `foo(process.env.X) // envdrift-ignore ED001` | That line |
| Code, line above | `// envdrift-ignore ED001 ED009` on the line directly above | The next line |
| Code, all rules | `// envdrift-ignore` | That line, or the next line, for every rule |
| Code, whole file | `// envdrift-ignore-file ED005` anywhere in the **first 10 lines** | The whole file, for the listed rules |
| Dotenv or keys file | `# envdrift-ignore ED003` on the line directly above the key | That key |

**Grammar:** `envdrift-ignore(-file)? (ED00[1-9])*`. IDs are separated by whitespace. Matching is case-sensitive.

## FR-SUP-01 — Code, line and line-above
- A suppression comment applies to locations on its own line, or on the immediately following line.
- Both `//` line comments and `/* … */` block comments are recognised.

> **Open question:** the PRD only shows `//`. *Proposal:* also accept block comments, which is needed for JSX (`{/* envdrift-ignore ED006 */}`).

## FR-SUP-02 — Code, whole file
`envdrift-ignore-file` must appear within lines 1–10. Later occurrences are ignored. Under `--strict`, they produce an unmatched warning.

## FR-SUP-03 — Dotenv and keys
- `#` comment on the line above a key.
- Applies to findings whose location is that declaration: ED003, ED004, ED006 and ED008.
- For ED007, it applies on line 1 of a tracked file ([ED007](rules/ED007.md)).

> **Open question:** should suppressions be supported in Dockerfile and compose sources? The PRD lists only dotenv and keys files. *Proposal:* not in the hackathon scope. Use `ignore` instead, and add this to the roadmap.

## Matching semantics

1. Suppression operates on **locations**. A finding location is suppressed if a matching comment covers its file and line for that rule ID.
2. A finding is dropped when **all** of its locations are suppressed. Otherwise, the suppressed locations are removed and the finding is kept.
3. Each dropped finding adds 1 to `suppressed`. Removing some of a finding's locations does not change the count.
4. Suppression runs **after** the rules and **before** severity resolution ([data-flow.md](../architecture/data-flow.md)).
5. `ignore` (config) is not suppression. Ignored names never reach the rules and are not counted.

> **Open question:** rule 2 (partial location removal) is not stated in the PRD. *Proposal:* adopt it. Suppressing one call site of a variable should not hide the same problem at other call sites.

## FR-SUP-04 — Unmatched suppressions
- Under `--strict`, every suppression comment that matched no finding adds an `info`-level entry to `warnings[]`. Example: `src/a.ts:12: envdrift-ignore ED001 matched nothing`.
- Without `--strict`, unmatched suppressions are silent.
- A comment naming an unknown ID (e.g. `ED010`) always produces a warning.

> **Open question:** the PRD says "an info warning". `ScanResult.warnings` is `string[]` with no severity. *Proposal:* prefix the string with `info: `, and do not create a finding. Unmatched suppressions are not rule violations, so they must not affect the exit code.

## FR-SUP-05 — Suppressed count
- The table footer shows `N suppressed`.
- The JSON output exposes `stats.suppressed`.

> **PRD gap (pending change-log entry):** `suppressed` is missing from the §9 `stats` type. *Resolution:* `ScanResult.stats` is `ScanModel['stats'] & { suppressed: number }`, added in `finalize()` because the model is built before suppression runs. See [data-model.md OQ1](../architecture/data-model.md#6-open-questions) and [`output-schema.json`](../output-schema.json).

## Examples

```ts
// envdrift-ignore-file ED005
import { load } from './loader';

const url = process.env.PUBLIC_URL; // envdrift-ignore ED001
// envdrift-ignore ED002 ED009
const region = process.env.AWS_REGION ?? 'ap-south-1';
const all = { ...process.env };     // ED005 suppressed by the file-level comment
```

```dotenv
# .env.example
# envdrift-ignore ED003
OPS_ONLY_FLAG=
```

## Required tests (`packages/core/test/suppress.test.ts`)

| Area | Cases |
|---|---|
| Line | Same line; line above; not two lines above |
| Multi-ID | `ED001 ED009` matches both rules; `ED001` alone does not match ED009 |
| All rules | A bare `envdrift-ignore` |
| File | Within the first 10 lines; at line 11 (ignored) |
| Dotenv / keys | `#` above a key |
| Location handling | Partial location removal; whole-finding drop increments `suppressed` |
| `--strict` | An unmatched comment produces an `info` warning |

The fixture `suppressions` covers this end to end.
