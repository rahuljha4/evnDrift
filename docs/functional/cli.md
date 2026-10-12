# CLI specification

Source: [PRD §13](../prd.md#13-cli-specification).

| Item | Value |
|---|---|
| Package | `@rahulkumar/envdrift` ([ADR 0011](../architecture/adr/0011-scoped-npm-package-name.md)) |
| Binary | `envdrift` |
| Runtime | Node ≥ 20, ESM only ([ADR 0010](../architecture/adr/0010-node20-esm-only.md)) |

```text
envdrift scan    [--config <path>] [--format table|json|markdown|sarif[,…]] [--output <path>]
                 [--only <ID,…>] [--env <name,…>] [--fail-on error|warning|never]
                 [--strict] [--no-color] [--cwd <dir>]
envdrift init    [--force] [--cwd <dir>]
envdrift explain <ruleId>
envdrift fix     --example [--prune] [--dry-run]
envdrift --version | --help
```

## Exit codes

| Code | Meaning |
|---|---|
| **0** | No findings at or above `--fail-on`. Also used for successful `init`, `explain`, `fix`, `--version` and `--help`. |
| **1** | At least one finding at or above `--fail-on`. Only `scan` returns 1. |
| **2** | Tool, config or source error. Every exit-2 message has a one-line cause and a one-line next step. The error catalogue (`E-CLI-NN`, `E-CFG-NN`, `E-SRC-NN`, `E-IO-NN`, `E-SSM-NN`) is in [error-handling.md](../system/error-handling.md). |

---

## scan

### FR-CLI-01 — `scan`
Runs the full pipeline: config → sources → model → rules → suppression → severity → reporters → exit code ([data-flow.md](../architecture/data-flow.md)).

**Acceptance criteria**
- On fixture `clean`, it exits 0 and the table output reports "0 errors, 0 warnings, 0 info".
- On fixture `demo-app`, the JSON output equals `fixtures/demo-app/expected.json` byte for byte.
- A JS/TS parse failure in one file does not abort the scan. The failure is a warning, and the file is counted in `filesSkipped`.

### Flags

| Flag | Type | Default | Behaviour |
|---|---|---|---|
| `--config <path>` | path | auto-discover | Loads this config file. Without it, the CLI looks for `envdrift.config.yaml`, then `envdrift.config.yml`, in `--cwd` ([FR-CFG-01](configuration.md#fr-cfg-01--discovery)). |
| `--format <list>` | comma list of `table`, `json`, `markdown`, `sarif` | `table` | Selects the reporters. See [FR-CLI-02](#fr-cli-02----format-and---output). |
| `--output <path>` | path stem | none | The destination for the second and later formats. |
| `--only <ID,…>` | comma list of `ED001`…`ED009` | all | Keeps only the listed rules. This is the last step of severity resolution. |
| `--env <name,…>` | comma list of environment names | all configured | Limits environment-dependent checks to these environments. |
| `--fail-on <level>` | `error` \| `warning` \| `never` | `error` | The threshold for exit 1. |
| `--strict` | boolean | `false` | Disables the D3 downgrade, and reports unmatched suppressions as `info` warnings. |
| `--no-color` | boolean | `false` | Disables ANSI colour. |
| `--cwd <dir>` | path | `process.cwd()` | The working directory for config discovery and relative paths. |

### FR-CLI-02 — `--format` and `--output`

**Rules**
- The **first** format is always written to stdout.
- Each later format is written to `<output>.<ext>`. The extensions are:

  | Format | Extension |
  |---|---|
  | `table` | `.txt` |
  | `json` | `.json` |
  | `markdown` | `.md` |
  | `sarif` | `.sarif` |

  Example: `--format table,json,sarif --output report` writes the table to stdout, plus `report.json` and `report.sarif`.
- Duplicate formats in the list are rejected with exit 2.
- More than one format without `--output` is rejected with exit 2, whose next step is "add --output <path>".

> **Open question:** what should happen when `--output` is given with a single format? *Proposal:* the single format still goes to stdout **and** is also written to `<output>.<ext>`. This keeps "first → stdout" invariant and makes CI usage simple.

**Acceptance criteria**
- Output files contain exactly what the same format prints to stdout in a single-format run.
- No output file is written when the scan exits 2 before reporting.

### FR-CLI-03 — `--only`
- This filter is applied **after** config overrides and the D3 downgrade ([severity-resolution.md](severity-resolution.md)).
- Findings from other rules are dropped. They are not counted as suppressed and do not affect the exit code.
- An unknown rule ID gives exit 2.
- `--only` does not re-enable a rule that the config set to `off`.

> **Open question:** should `--only ED003` re-enable ED003 if the config has `ED003: off`? *Proposal:* no. Config `off` wins, and the CLI prints a warning.

### FR-CLI-04 — `--env`
- This flag restricts ED002, ED003 (environment declarations), ED004 and ED009 to the named environments.
- ED001, ED005, ED006, ED007 and ED008 are unaffected.
- Sources of environments that are not selected are **not read**. This avoids SSM network calls for environments that were not requested.
- An unknown environment name gives exit 2.
- ED004 needs at least 2 selected environments. With `--env production` alone it cannot fire.

### FR-CLI-05 — `--fail-on` and exit code

| `--fail-on` | Exit 1 when |
|---|---|
| `error` (default) | At least one finding with severity `error` |
| `warning` | At least one finding with severity `error` or `warning` |
| `never` | Never. Exit 0 unless there is a tool error. |

Exit 2 always takes precedence over 0 or 1.

### FR-CLI-06 — `--strict`
- Disables the D3 downgrade of ED003 ([rules/ED003.md](rules/ED003.md)).
- Every suppression comment that matched no finding produces an `info`-level warning in `warnings[]` ([suppression.md](suppression.md#fr-sup-04--unmatched-suppressions)).

### FR-CLI-07 — Colour and TTY
Colour is disabled when any of these is true:
- `--no-color` is given.
- `NO_COLOR` is set to any non-empty value.
- stdout is not a TTY.

Severity is always printed as the text `ERROR` / `WARNING` / `INFO`, never as colour alone ([PRD §16](../prd.md#16-non-functional-requirements)). The json, markdown and sarif formats never contain ANSI codes.

### FR-CLI-08 — `--config` and `--cwd`
- `--cwd` is resolved first.
- A relative `--config` is resolved against `--cwd`.
- The config's `root` is resolved relative to the **config file's directory** ([configuration.md](configuration.md)).
- All paths in output are relative to `root` and use `/` separators.

### Examples
```bash
envdrift scan                                    # table to stdout, fail on error
envdrift scan --format json > result.json        # machine-readable
envdrift scan --format table,sarif --output out  # table to stdout, out.sarif written
envdrift scan --only ED003                       # J3 clean-up
envdrift scan --env production --fail-on warning
envdrift scan --strict                           # no D3 downgrade
```

---

## init

### FR-CLI-09 — `init`

**Behaviour**
- Detects the following and writes `envdrift.config.yaml` in `--cwd`:
  - `.env.example`.
  - `Dockerfile`.
  - Compose files (`docker-compose*.y{a,}ml`, `compose*.y{a,}ml`).
  - Frontend prefixes from `package.json` `dependencies` and `devDependencies`:

    | Dependency | Prefix |
    |---|---|
    | `next` | `NEXT_PUBLIC_` |
    | `vite` | `VITE_` |
    | `react-scripts` | `REACT_APP_` |
    | `expo` | `EXPO_PUBLIC_` |

- Prints one line per detected item and a "Next:" hint.
- If a config already exists, `init` exits 2 unless `--force` is given. The error catalogue entry is `E-CLI` ([error-handling.md](../system/error-handling.md)).
- Writes only the config file ([PRD §15.2](../prd.md#15-security-and-privacy-non-negotiable)).

**Acceptance criteria**
- The generated config validates against the schema.
- Running `init` twice without `--force` leaves the first file unchanged.
- No file other than the config is created or modified.

> **Open question:** which environment should detected Dockerfile and compose files be assigned to? *Proposal:* a single `production` environment containing the detected sources, with a comment telling the user to split them per environment.

---

## explain

### FR-CLI-10 — `explain <ruleId>`

**Behaviour**
- Prints the explain text for the rule from [`docs/rules.md`](../rules.md), which is bundled at build time.
- Exits 0.
- An unknown ID gives exit 2 and lists the valid IDs.
- Matching is case-insensitive (`ed003` works).

**Acceptance criteria**
- For each of ED001–ED009, the output is non-empty and contains the rule's slug.
- A test asserts that the rule semantics in `docs/rules.md` match the [§11 table](../prd.md#11-rules).

---

## fix

### FR-CLI-11 — `fix --example [--prune] [--dry-run]`

**Behaviour**
- Rewrites the configured `.env.example`. See [journeys.md J4](journeys.md#fr-j-04--j4-onboarding).
- `--example` is required. Running `fix` without it gives exit 2.
- If the config has `example: null`, `fix` exits 2.
- `--dry-run` prints a diff and writes nothing.
- `--prune` removes declarations that have no reference.
- Names in `ignore` are never added or pruned.
- Keys that carry an `# envdrift-ignore ED003` suppression are never pruned.

**Acceptance criteria**
- Comments, blank lines and key order are preserved.
- Missing keys are appended under `# Added by envdrift` with an empty value, in sorted order.
- The command is idempotent: a second run is a no-op with an empty diff.

---

## --version / --help

### FR-CLI-12
- `--version` prints the package version only and exits 0.
- `--help` (also `<command> --help`) prints usage and exits 0.
- Both must work from a packed tarball via `npx` (smoke test, M2.5).
