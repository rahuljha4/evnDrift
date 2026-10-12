# Error Handling

> Implements the exit codes in [PRD §13](../prd.md#13-cli-specification), the Errors row in [§16](../prd.md#16-non-functional-requirements) (NFR-ERR-01, NFR-ERR-02 in [nfr.md](nfr.md)), and the parse-failure behaviour in [§10.1](../prd.md#101-jsts-extraction). CLI flags are in [cli.md](../functional/cli.md).

## 1. Exit codes

| Code | Meaning | When |
|---|---|---|
| **0** | Success | Scan completed and no finding is at or above `--fail-on` (default `error`). This includes `--fail-on never`. Also returned by successful `init`, `explain`, `fix`, `--version` and `--help`. |
| **1** | Findings | Scan completed and at least one finding is at or above `--fail-on`. |
| **2** | Tool error | A config, source, I/O, CLI usage or internal error stopped the command. The report may be incomplete, so it is **not** written. |

Exit 2 always takes precedence over 1. Warnings never change the exit code.

## 2. Principles

1. **Every exit-2 error has two lines on stderr:** a one-line cause and a one-line next step.

   ```
   envdrift: config error: environments.staging.sources[0].type must be one of dotenv | dockerfile | compose | keys | aws-ssm (got "dotnev") [E-CFG-03]
   next: fix envdrift.config.yaml, or run `envdrift init --force` to regenerate it
   ```
2. **Never print a value.** Messages may include only paths, 1-based line and column numbers, variable names, rule IDs, config keys and AWS error codes. Third-party parser errors from `@babel/parser` or `yaml` are re-wrapped with position only, because their messages can quote source text (SEC-08 in [security.md](security.md)).
3. **No stack traces** unless `DEBUG=envdrift` is set (SEC-09). Unexpected exceptions map to `E-CLI-99`.
4. **Partial failure is not failure.** A file or source that can't be parsed produces a **warning**. The file counts in `stats.filesSkipped`, and the scan continues. Only problems that make the result meaningless are exit 2: an invalid config, a configured source file that is missing, or failed SSM access.
5. Error codes are stable identifiers. They are printed in brackets and listed here, and tests assert on them.

## 3. Warnings vs errors

| Situation | Outcome | Where reported |
|---|---|---|
| JS/TS file fails to parse | warning `W-PARSE`, file skipped, scan continues | `ScanResult.warnings`, table footer, stderr summary |
| File over `limits.maxFileBytes` | warning, file skipped | same |
| Binary file (NUL in the first 8 KB) | silently skipped, counted in `filesSkipped` | stats only |
| Symlink pointing outside root | warning, not followed | warnings |
| Duplicate key in a dotenv or keys file | warning on the source | `SourceResult.warnings` |
| Malformed line in a dotenv, keys or Dockerfile source | warning with file:line, line skipped | `SourceResult.warnings` |
| Compose `env_file` missing | warning on the compose source; silent if the entry is `{ path, required: false }` (Proposal, PRD is silent; aligned with [functional/sources.md](../functional/sources.md)). `env_file` often points at a gitignored local `.env`, so an error would break CI. The compose file itself missing is still `E-SRC-01`. | `SourceResult.warnings` |
| SSM path returns no parameters | warning, not error (PRD §10.6) | warnings |
| Suppression comment that matches nothing | `info` warning, only in `--strict` | warnings |
| Not a git repository (ED007 cannot run) | warning; ED007 is skipped | warnings (see `E-GIT-01` for when it is an error) |

## 4. Error catalogue

Message templates use `<placeholders>` for paths, names and keys only.

### Config (`E-CFG`)

| ID | When | Message (cause) | Next step |
|---|---|---|---|
| E-CFG-01 | No config found at `--config` or the default path (`envdrift.config.yaml` / `.yml` in `--cwd`) | `config not found: <path>` | `run \`envdrift init\` to create one, or pass --config <path>` |
| E-CFG-02 | YAML syntax error | `config is not valid YAML at <path>:<line>:<col>` | `fix the YAML syntax at that position` |
| E-CFG-03 | zod schema violation | `config error: <dotted.path> <expected> (got <type>)` (a value is shown only for enum-like config keys, never for env values) | `fix <path>, see docs/functional/configuration.md` |
| E-CFG-04 | `version` missing or not `1` | `unsupported config version <n>` | `set \`version: 1\`` |
| E-CFG-05 | `root` does not exist | `scan root not found: <path>` | `fix \`root\` in <config>` |

### Sources (`E-SRC`)

| ID | When | Message | Next step |
|---|---|---|---|
| E-SRC-01 | A configured source file is missing (dotenv, dockerfile, compose, keys, or `example`). A missing compose `env_file` is a warning, not this error | `source not found: <env>/<type>: <path>` | `create the file, fix the path, or remove the source from the config` |
| E-SRC-02 | A configured source file is entirely unparseable (for example compose YAML is invalid) | `cannot parse <type> source <path>:<line>` | `fix the file syntax; envdrift does not guess` |
| E-SRC-03 | Compose `service` filter names a service that doesn't exist | `service "<name>" not found in <path>` | `use one of: <service names>` |

### I/O (`E-IO`)

| ID | When | Message | Next step |
|---|---|---|---|
| E-IO-01 | A required file is unreadable (EACCES) | `cannot read <path>: permission denied` | `check file permissions` |
| E-IO-02 | `--output` path is not writable | `cannot write report to <path>` | `choose a writable --output path` |
| E-IO-03 | `init` or `fix` cannot write its target | `cannot write <path>` | `check permissions on the directory` |

An unreadable **scanned code file** (as opposed to a configured source) is a warning, not E-IO-01.

### Git (`E-GIT`)

| ID | When | Message | Next step |
|---|---|---|---|
| E-GIT-01 | ED007 is explicitly enabled (`rules.ED007: error|warning`) and `git` is not installed or `git ls-files` fails | `git not available; cannot check committed .env files (ED007)` | `install git, run inside a git checkout, or set rules.ED007: off` |

Proposal (PRD is silent): when ED007 is at its default setting and the directory is not a git repository, a warning is emitted instead.

### AWS SSM (`E-SSM`)

| ID | When | Message | Next step |
|---|---|---|---|
| E-SSM-01 | No AWS credentials resolved | `aws-ssm source <path>: no AWS credentials found` | `configure credentials (env, profile, or OIDC in CI); see README "AWS SSM"` |
| E-SSM-02 | `AccessDeniedException` | `aws-ssm source <path>: access denied (ssm:GetParametersByPath)`, followed by the minimal IAM policy JSON for the configured path ([security.md §3](security.md#3-minimal-iam-policy-aws-ssm-source)) | `attach the policy above to the role or user running envdrift` |
| E-SSM-03 | Throttling persists after 3 retries with backoff | `aws-ssm source <path>: throttled after 3 retries` | `retry later or reduce concurrent jobs` |
| E-SSM-04 | Invalid region or network failure | `aws-ssm source <path>: cannot reach SSM in <region> (<error code>)` | `check \`region\` and network access` |

### CLI usage (`E-CLI`)

| ID | When | Message | Next step |
|---|---|---|---|
| E-CLI-01 | Unknown flag or bad flag value (for example `--format xml`, `--fail-on maybe`) | `invalid option: <flag> <reason>` | `run \`envdrift <command> --help\`` |
| E-CLI-02 | Unknown rule ID in `explain` or `--only` | `unknown rule <ID>` | `valid rules: ED001 … ED009` |
| E-CLI-03 | `--env` names an environment that is not in the config | `unknown environment <name>` | `configured environments: <names>` |
| E-CLI-04 | `init` and a config already exists, without `--force` | `config already exists: <path>` | `use --force to overwrite` |
| E-CLI-05 | `fix` without `--example` | `fix requires --example (the only supported target)` | `run \`envdrift fix --example\`` |
| E-CLI-06 | `fix --example` but `example` is `null` or missing in the config | `no .env.example configured` | `set \`example:\` in the config` |
| E-CLI-07 | Multiple `--format` values without `--output` (Proposal: PRD §13 implies `--output` is needed) | `--output is required when more than one format is given` | `add --output <basename>` |
| E-CLI-99 | Unexpected internal error | `internal error: <error class>` | `re-run with DEBUG=envdrift and report the issue` |

## 5. Testing

Every catalogue ID has at least one integration test (execa against the built CLI). Each test asserts:
- exit code 2;
- exactly two stderr lines, ending in `[<ID>]` and starting with `next:` respectively (for E-SSM-02, the policy block follows);
- that no fixture value appears in the output (shares the planted-secrets helper).

See [testing-qa.md §5](testing-qa.md#5-integration-tests-execa).
