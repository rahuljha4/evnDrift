# Dependencies

> Implements [PRD §8 Technology](../prd.md#8-architecture) and [§15.6 supply chain](../prd.md#15-security-and-privacy-non-negotiable).

## Policy

1. **Pin exact versions.** The root `.npmrc` sets `save-exact=true`, and `package-lock.json` is committed.
2. **Justify each new dependency in its commit message.** State what it does, why the standard library is not enough, and what the alternatives were.
3. **Keep the runtime dependency count minimal.** The CLI bundle is built by tsup. Runtime deps are still declared in `packages/cli/package.json`, so `npm audit` can see them.
4. **Run `npm audit --audit-level=high` in CI.** A high or critical advisory fails the build.
5. **Add a dependency only in the milestone task that first needs it.** Nothing is installed speculatively.
6. **Load heavy or optional SDKs lazily.** They are only loaded on the code path that needs them (AWS SSM).

## Runtime dependencies

| Package | Lives in | Why | Added | Lazy? | Alternatives rejected |
|---|---|---|---|---|---|
| `@babel/parser` | core | One parser for JS/JSX/TS/TSX with `errorRecovery`; accurate locations | M0.2 | No | TypeScript compiler API (heavier, slower without type info); `acorn` (no TS); regex (comments and strings cause false positives) — [ADR 0001](adr/0001-babel-parser-hand-written-walker.md) |
| `yaml` | core (compose, config schema input), cli (config load) | Compose and config parsing; line numbers via `LineCounter`; alias limits | M1.2 / M3.2 | No | `js-yaml` (weaker positional info) |
| `zod` | core | Config validation with readable error paths and defaults | M1.2 | No | `ajv` + JSON Schema (more verbose errors); hand-written validation |
| `commander` | cli | Subcommands, flags, help | M2.3 | No | `yargs` (larger); `node:util.parseArgs` (no subcommand help) |
| `ignore` | cli | Exact `.gitignore` semantics | M2.1 | No | Hand-rolled gitignore matching (error-prone) |
| `picomatch` | core (ignore globs such as `npm_*`), cli (include/exclude) | Fast glob matching without fs access | M1.3 / M2.1 | No | `minimatch` (slower); `micromatch` (wraps picomatch) |
| `@aws-sdk/client-ssm` | cli | `GetParametersByPath` for the `aws-ssm` source | M5.1 | **Yes**, `await import()` in `sources/aws-ssm.ts` | Raw SigV4 HTTP (security-sensitive to hand-roll) |

## Action dependencies (Proposal)

The PRD does not name these. They are listed here so the decision is visible. Final choice at M4.2.

| Package | Lives in | Why | Alternative |
|---|---|---|---|
| `@actions/core` | action | Inputs, `$GITHUB_STEP_SUMMARY`, `setFailed`, annotations | Read `INPUT_*` from env and write the summary file directly |
| `@actions/github` | action | Authenticated Octokit + PR context for comment upsert | `fetch` against the REST API with `GITHUB_TOKEN` |

Both are bundled into `dist/index.js`, so users never install them.

## Development dependencies

| Package | Why | Added |
|---|---|---|
| `typescript` | Strict typecheck, project references | M0.0 |
| `@types/node` | Node typings. Pinned to 22.x (bumped from 20.19.43 in M0.1): `vitest@5.0.3` declares a peer of `@types/node` `^22 \|\| >=24`, and `npm i` failed with ERESOLVE on 20.x. Runtime floor stays Node ≥ 20 ([ADR 0010](adr/0010-node20-esm-only.md)); avoid Node-22-only APIs, because typings will not flag them. | M0.0, bumped M0.1 |
| `vitest` | Test runner (ESM-native, fast) | M0.0 |
| `@vitest/coverage-v8` | Coverage; core ≥ 90% lines | M0.0 |
| `eslint`, `@eslint/js`, `typescript-eslint` | Linting, including the core purity restrictions | M0.0 |
| `eslint-config-prettier` | Turns off lint rules that conflict with Prettier | M0.0 |
| `prettier` | Formatting | M0.0 |
| `tsup` | Single ESM bundles for the bin and the Action | M2.5 |
| `fast-check` | Property tests: parsers never throw and never emit values | M0.1 / M3.1 |
| `execa` | Runs the built CLI in integration and golden tests | M2.3 |
| `@stryker-mutator/core`, `@stryker-mutator/vitest-runner` | Mutation testing on core; score ≥ 80% | M6.1 |
| `aws-sdk-client-mock` | Mocked SSM client: pagination, access denied, throttling | M5.1 |

## Node built-ins used

| Module | Where | Note |
|---|---|---|
| `node:crypto` | core (`rules/index.ts`) | sha1 fingerprint; computation only, so allowed in core |
| `node:fs/promises`, `node:path` | cli | Banned in core by ESLint |
| `node:child_process` (`execFile`) | cli `io/git.ts` | No shell; args passed as an array |
