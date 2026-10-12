# Output formats

| Item | Value |
|---|---|
| Source | [PRD §13 — Output formats](../prd.md#13-cli-specification), [§9](../prd.md#9-data-model-core-types), [§16](../prd.md#16-non-functional-requirements) |
| Implementation | `packages/core/src/report/{table,json,markdown,sarif}.ts` |
| Reporter shape | Pure functions: `(result: ScanResult, opts) => string` |

All mock outputs below use invented names and no values.

## Common rules

### FR-OUT-05 — Determinism
- Findings are sorted by:
  1. Severity: `error`, then `warning`, then `info`.
  2. `ruleId`.
  3. `name` (findings with no name sort last).
  4. File of the first location.
  5. Line of the first location.
- Each finding's locations are sorted by file, then line, then column.
- `environments` arrays are sorted.
- The same input gives byte-identical JSON.
- `stats.durationMs` is the only non-deterministic field. Golden tests normalise it to `0`.

> **Open question:** should `durationMs` be excluded from the JSON to make it fully byte-identical? *Proposal:* keep it. Golden tests and the determinism test replace it before comparison. The PRD makes `ScanResult` the exact JSON shape.

### FR-OUT-06 — No values
No reporter receives a value, because values never leave parsers ([ADR 0006](../architecture/adr/0006-values-never-leave-parsers.md)). The end-to-end redaction test runs every format against fixture `planted-secrets`. It asserts that no planted string appears in stdout, stderr or output files ([security.md](../system/security.md)).

### FR-OUT-07 — Paths
- All paths are relative to `root` and use `/` separators, including on Windows.
- Lines are 1-based.

---

## FR-OUT-01 — table

The default format, for humans in a terminal.

**Layout**
- Findings are grouped by severity heading (`ERROR`, `WARNING`, `INFO`), then by rule.
- Each finding shows:
  - Rule ID.
  - Name.
  - First location, plus `(+N more)` when there are more.
  - `[environments]`, when set.
  - The fix on an indented second line.
  - The D3 `note`, when present, on a third line.
- Footer: `<E> errors, <W> warnings, <I> info · <F> files scanned · <D> s · <S> suppressed`.
- Warnings from `warnings[]` are printed to **stderr**, after the footer.
- Severity is always shown as text. Colour, when enabled, is decoration only.

```text
ERROR
  ED001  SENDGRID_API_KEY        src/mail.ts:5
         Add SENDGRID_API_KEY= to .env.example (or run: envdrift fix --example)
  ED002  SENDGRID_API_KEY        src/mail.ts:5  [production, staging]
         Add SENDGRID_API_KEY to production (Dockerfile), staging (deploy/staging.env.keys)
INFO
  ED003  LEGACY_REDIS_URL        .env.example:12
         Remove LEGACY_REDIS_URL from .env.example, or reference it in code
         note: downgraded to info: the scan found 2 dynamic env accesses, so unused cannot be proven (use --strict to disable)
  ED005  —                       src/env.ts:3 (+1 more)
         Use a literal name (process.env.NAME), or suppress with // envdrift-ignore ED005 if intentional

2 errors, 0 warnings, 2 info · 118 files scanned · 0.41 s · 1 suppressed
```

When there are no findings, the output is `No issues · 118 files scanned · 0.35 s · 0 suppressed`.

## FR-OUT-02 — json

- The output is exactly `ScanResult` ([PRD §9](../prd.md#9-data-model-core-types), [data-model.md](../architecture/data-model.md)).
- The schema is [`docs/output-schema.json`](../output-schema.json). The output is snapshot-tested and validated against the schema.
- Formatting: 2-space indentation and a trailing newline.

```json
{
  "version": 1,
  "findings": [
    {
      "ruleId": "ED002",
      "severity": "error",
      "name": "SENDGRID_API_KEY",
      "message": "SENDGRID_API_KEY is read without a fallback but missing in: production, staging",
      "locations": [{ "file": "src/mail.ts", "line": 5, "column": 13 }],
      "environments": ["production", "staging"],
      "fix": "Add SENDGRID_API_KEY to production (Dockerfile), staging (deploy/staging.env.keys)",
      "fingerprint": "3f1c…"
    }
  ],
  "summary": { "error": 1, "warning": 0, "info": 0 },
  "stats": { "filesScanned": 118, "filesSkipped": 0, "durationMs": 412, "suppressed": 0 },
  "warnings": []
}
```

Note: `stats.suppressed` is the proposed addition from [suppression.md](suppression.md#fr-sup-05--suppressed-count).

## FR-OUT-03 — markdown

Used for PR comments and `$GITHUB_STEP_SUMMARY`.

**Structure**
1. First line: the hidden marker `<!-- envdrift-report -->`. The Action uses it to find and update its comment.
2. Summary heading: `### EnvDrift: <E> errors, <W> warnings, <I> info`. When there are no findings, the heading is `### EnvDrift: No issues`.
3. A table of **errors**, with columns Rule | Variable | Location | Environments | Fix.
4. A collapsible `<details>` block for **warnings**, and another for **info**. Each contains the same table columns.
5. A footer line with files scanned, duration and suppressed count.
6. If `warnings[]` is non-empty, a `<details>` block of tool warnings.

**Escaping**
- `|` and `<` inside cells are escaped.
- Names and paths are wrapped in backticks.

```markdown
<!-- envdrift-report -->
### EnvDrift: 1 error, 1 warning, 0 info

| Rule | Variable | Location | Environments | Fix |
|---|---|---|---|---|
| ED006 | `VITE_ADMIN_TOKEN` | `src/main.ts:4` | — | Rename without VITE_ and read it server-side; rotate the secret if it was ever deployed |

<details><summary>1 warning</summary>

| Rule | Variable | Location | Environments | Fix |
|---|---|---|---|---|
| ED009 | `API_BASE_URL` | `src/api.ts:1` | production | Add API_BASE_URL to production, or remove the fallback if the variable is required |

</details>

<sub>118 files scanned · 0.41 s · 0 suppressed</sub>
```

> **Open question:** GitHub limits comments to 65,536 characters. *Proposal:*
> - Truncate the warning and info tables first, then the error rows.
> - Add the note "… N more; see the job summary or SARIF".
> - Never truncate the marker or the heading.

## FR-OUT-04 — sarif

The output is SARIF **2.1.0**, validated against the official schema in tests.

| SARIF field | Source |
|---|---|
| `runs[0].tool.driver.name` | `envdrift` |
| `runs[0].tool.driver.version` | Package version |
| `runs[0].tool.driver.rules[]` | One entry per ED ID (all 9, always), with `id`, `name` (slug), `shortDescription`, `helpUri` = `https://github.com/<gh-user>/envdrift/blob/main/docs/functional/rules/ED00X.md` |
| `results[].ruleId` | `ruleId` |
| `results[].level` | `error` → `error`, `warning` → `warning`, `info` → `note` |
| `results[].message.text` | `message` + " — " + `fix` |
| `results[].locations[]` | Each location as `physicalLocation.artifactLocation.uri` (relative, `/`) + `region.startLine` (+ `startColumn` when known) |
| `results[].partialFingerprints` | `{ "envdrift/v1": fingerprint }` |
| `results[].properties` | `{ environments, note }` when present |

**SARIF locations for non-file sources:** for `aws-ssm` declarations, the location is not a repository file. Such results use `logicalLocations` instead of `physicalLocations`, so code scanning does not reject them.

> **Open question:** this `logicalLocations` handling is a proposal. The PRD does not cover it.
