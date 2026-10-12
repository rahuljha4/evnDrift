# Severity resolution and exit code

| Item | Value |
|---|---|
| Source | [PRD §11](../prd.md#11-rules), [§13](../prd.md#13-cli-specification) |
| Milestone | M1.5 (core), M2.3 (CLI flags) |
| Implementation | `packages/core/src/rules/index.ts` |

## FR-SEV-01 — Resolution order

Each finding's final severity is computed in this fixed order:

1. **Rule default:** the value in the §11 table.
2. **Config override:** `rules.<ID>` in the config, one of `error`, `warning`, `info` or `off`.
3. **D3 downgrade:** ED003 only. If the model has any dynamic access and `--strict` is not set, the severity becomes `info` and a `note` is added ([ED003](rules/ED003.md)).
4. **`--only` filter:** findings of rules not listed are removed.

Suppression runs before this sequence ([suppression.md](suppression.md)).

The `ScanResult.summary` counts are computed **after** step 4. The exit code is computed from those counts.

## FR-SEV-02 — `off`
- `rules.<ID>: off` removes the rule's findings entirely. Implementations may skip running the rule.
- Findings from an `off` rule are not counted as suppressed.
- `--only` cannot re-enable an `off` rule; a warning is printed ([cli.md](cli.md#fr-cli-03----only)).

## FR-SEV-03 — `--fail-on`

| `--fail-on` | Exit 1 if |
|---|---|
| `error` (default) | `summary.error > 0` |
| `warning` | `summary.error + summary.warning > 0` |
| `never` | Never |

Tool, config and source errors exit 2, which overrides 0 and 1.

## Worked examples

| # | Rule | Config | Dynamic access? | Flags | Final severity | Shown? | Exit (default `--fail-on`) |
|---|---|---|---|---|---|---|---|
| 1 | ED003 | — | no | — | warning | yes | 0 |
| 2 | ED003 | — | yes | — | info (+ note) | yes | 0 |
| 3 | ED003 | — | yes | `--strict` | warning | yes | 0 |
| 4 | ED003 | `ED003: error` | yes | — | info (+ note) | yes | 0 |
| 5 | ED003 | `ED003: error` | yes | `--strict` | error | yes | 1 |
| 6 | ED009 | `ED009: error` | — | — | error | yes | 1 |
| 7 | ED002 | — | — | `--only ED003` | — | no | 0 (unless other ED003 errors) |
| 8 | ED002 | `ED002: off` | — | — | — | no | 0 |
| 9 | ED001 | — | — | `--fail-on never` | error | yes | 0 |
| 10 | ED009 | — | — | `--fail-on warning` | warning | yes | 1 |
| 11 | ED003 | `ED003: off` | — | `--only ED003` | — | no (warning printed) | 0 |

> **Open question:** in example 4, D3 downgrades a finding that the user explicitly escalated to `error`. This follows the PRD order literally. *Proposal:* keep the PRD order. The note tells the user to use `--strict`. Revisit this if the benchmark shows confusion.

## Required tests (`packages/core/test/rules/index.test.ts`)
- One test per row of the worked-examples table.
- An `off` rule produces no findings and is not counted.
- `summary` counts match the final findings after `--only`.
