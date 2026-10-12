# Configuration — `envdrift.config.yaml`

Source: [PRD §12](../prd.md#12-configuration).

- The schema lives in `packages/core/src/config/schema.ts` (zod).
- Loading happens in `packages/cli/src/io/config.ts`.

## FR-CFG-01 — Discovery

**Search order**
1. `--config <path>` if given. Relative paths are resolved against `--cwd`.
2. `envdrift.config.yaml` in `--cwd`.
3. `envdrift.config.yml` in `--cwd`.

**Rules**
- If both `.yaml` and `.yml` exist, `.yaml` is used and a warning is emitted.
- If no config is found, `scan` exits 2 with the next step "run `envdrift init`".

> **Open question:** should `scan` run with built-in defaults when no config exists, instead of exiting 2? *Proposal:* exit 2. An explicit config keeps CI behaviour predictable, and `init` is one command away.

## Field reference

| Field | Type | Default | Notes |
|---|---|---|---|
| `version` | literal `1` | — (**required**) | The schema version. Any other value gives exit 2. |
| `root` | string (path) | `.` | The scan root, relative to the **config file's directory**. All output paths are relative to it. |
| `example` | string (path) \| `null` | `.env.example` | `null` disables ED001, ED008 and the example part of ED003. A configured but missing file gives exit 2 (`E-SRC`). |
| `include` | string[] (globs) | `["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"]` | Code files to scan. `.d.ts` files are always skipped. |
| `exclude` | string[] (globs) | D2 defaults (below) | User values **replace** the defaults; they are not merged. |
| `frontendPrefixes` | string[] | `[]` (`init` fills these in from dependencies) | Used by ED006. |
| `accessors` | string[] | `[]` | Wrapper accessors, e.g. `getEnv` or `config.get` ([ADR 0007](../architecture/adr/0007-configurable-accessors.md)). |
| `environments` | map: name → `{ sources: Source[] }` | `{}` | Names must match `^[A-Za-z0-9_-]+$`. Each environment needs at least 1 source. |
| `ignore` | string[] | `[]` | Names that never produce findings. Merged with the built-in list. |
| `ignoreDefaults` | boolean | `true` | Set to `false` to disable the built-in ignore list. |
| `rules` | map: `ED001`…`ED009` → `error` \| `warning` \| `info` \| `off` | `{}` | Severity overrides ([severity-resolution.md](severity-resolution.md)). |
| `limits.maxFileBytes` | positive integer | `1000000` | Larger files are skipped and counted in `filesSkipped`, with a warning. |

Unknown top-level keys give exit 2. The schema is strict, so typos are caught.

### D2 default `exclude`
```yaml
exclude:
  - "**/*.{test,spec}.*"
  - "**/__tests__/**"
  - "**/{test,tests,e2e,cypress}/**"
```
- Rationale: [ADR 0002](../architecture/adr/0002-exclude-test-files-by-default.md).
- To keep the defaults and add more, copy them into your own list.

### Built-in ignore list
This list always applies unless `ignoreDefaults: false`:

`NODE_ENV`, `CI`, `HOME`, `PATH`, `PWD`, `TZ`, `npm_*`, `VERCEL_*`, `GITHUB_*`

### Glob and pattern semantics
| Context | Semantics |
|---|---|
| `include` / `exclude` | `picomatch` globs, matched against paths relative to `root` using `/` separators. `.gitignore` files are also honoured, using `ignore` semantics ([FR-SRC-11](sources.md#fr-src-11--file-walk-safety)). |
| `ignore` entries | An exact name, or a trailing `*` prefix wildcard (`npm_*`). Matching is case-sensitive. |

> **Open question:** should `ignore` support full globs? *Proposal:* support only exact names and a trailing `*`. Full globs on variable names add surprise for little value.

### FR-CFG-02 — Validation
- The config is validated with zod before any source is read.
- Errors print the YAML path, the expected type and the received type, then exit 2.

### FR-CFG-03 — Defaults
- Every optional field gets the default above.
- The resolved config (`ResolvedConfig`) is fully populated before it reaches `core`.

### FR-CFG-04 — Ignore
- A name in the merged ignore list produces no finding from any rule ([PRD §11](../prd.md#11-rules)).
- Ignored names are removed in `model.ts`. They are not removed by suppression, so they are **not** counted in `suppressed`.

### FR-CFG-05 — Environments and sources
See the per-type schema below. A name is declared in an environment if **any** of its sources declares it.

### FR-CFG-06 — Rule overrides
`rules.<ID>` takes the values `error`, `warning`, `info` or `off`.

### FR-CFG-07 — Prefixes and accessors
- Each `frontendPrefixes` entry must be non-empty.
- Each `accessors` entry is an identifier (`getEnv`) or a dotted member path (`config.get`, `env.get`).

### FR-CFG-08 — Limits
`limits.maxFileBytes` applies to code files **and** source files.

> **Open question:** what should happen when a source file (e.g. a 5 MB `.env`) exceeds the limit? *Proposal:* skip code files with a warning. A configured source file over the limit gives exit 2, because silently dropping a source would cause false ED002 findings.

## Source types

All `path` values are relative to the config file's directory.

| `type` | Fields | Notes |
|---|---|---|
| `dotenv` | `path` (req.) | A dotenv-format file. Also used for "keys with empty values" exports. |
| `keys` | `path` (req.) | One name per line, with `#` comments. |
| `dockerfile` | `path` (req.) | All stages contribute. |
| `compose` | `path` (req.), `service` (opt.) | `env_file` entries are resolved relative to the compose file. `service` limits the source to one service. |
| `aws-ssm` (Should) | `path` (req., e.g. `/myapp/prod/`), `region` (req.), `nameFrom` (`lastSegment` \| `fullPath`, default `lastSegment`) | Network access only happens when this source type is configured. |

> **Open question:** is `region` required, or may it fall back to `AWS_REGION`? *Proposal:* it is optional and falls back to the AWS SDK default chain. A missing region is reported as `E-SSM`.

Source behaviour is specified in [sources.md](sources.md).

## Validation errors

The format is one line per issue, then a next-step line. Exit code 2. Example:

```text
envdrift: invalid config envdrift.config.yaml
  environments.production.sources[0].type: expected one of dotenv | keys | dockerfile | compose | aws-ssm, received "ssm"
  rules.ED010: unknown rule id (valid: ED001–ED009)
Next: fix the fields above; see docs/functional/configuration.md
```

The catalogue entries for these errors are `E-CFG-NN` in [error-handling.md](../system/error-handling.md).

**Acceptance criteria**
- Each schema branch has a valid-config test and an invalid-config test.
- Every error message contains the dotted path.
- A YAML syntax error reports line and column, and exits 2.

## Full example

```yaml
version: 1
root: .
example: .env.example
include: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"]
exclude:
  - "**/*.{test,spec}.*"
  - "**/__tests__/**"
  - "**/{test,tests,e2e,cypress}/**"
frontendPrefixes: [NEXT_PUBLIC_, VITE_]
accessors: [getEnv, config.get]
environments:
  staging:
    sources:
      - type: dotenv
        path: deploy/staging.env.keys
      - type: compose
        path: docker-compose.staging.yml
        service: api
  production:
    sources:
      - type: aws-ssm
        path: /myapp/prod/
        region: ap-south-1
      - type: dockerfile
        path: Dockerfile
ignore: [PORT]
ignoreDefaults: true
rules:
  ED003: warning
  ED009: error
limits:
  maxFileBytes: 1000000
```
