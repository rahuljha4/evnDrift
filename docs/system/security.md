# Security and Privacy

> Implements [PRD §15](../prd.md#15-security-and-privacy-non-negotiable). These requirements are **non-negotiable**: a change that weakens any of them needs a PRD change-log entry first.
> Related: [ADR 0006 — values never leave parsers](../architecture/adr/0006-values-never-leave-parsers.md), [data model](../architecture/data-model.md), [dependencies](../architecture/dependencies.md).

EnvDrift reads repositories that hold configuration and sometimes secrets. Its whole value depends on users trusting it to read **names only**. The goal of this document is that no configuration value can appear in any output, log, error, cache or network request produced by EnvDrift.

## 1. Security requirements

SEC-01 to SEC-07 map 1:1 to PRD §15 items 1–7. SEC-08 and higher are hardening items derived from them.

| ID | Requirement | Enforcement | Verification | Milestone |
|---|---|---|---|---|
| **SEC-01** | **Values never leave parsers** (D6). No type outside parser internals has a value field. Value-dependent facts (`hasValue`, `looksSecret`) are computed inside the parser and only booleans leave it. | `Declaration` has no `value` property ([data model](../architecture/data-model.md)). Parsers keep the raw value in a local variable that is never returned or thrown. `secrets.ts` is called only from parsers. | Type-level test: no exported type in `packages/core` has a property named `value`. Parser property tests (fast-check) assert the output never contains the input value. End-to-end redaction test (SEC-07). | M0.1, M1.1 |
| **SEC-02** | **Read-only.** Only `init` and `fix` write files: `init` writes the config file and `fix` writes `.env.example`. | Only `commands/init.ts` and `commands/fix.ts` import write APIs. `scan` writes only to `--output` paths the user gave explicitly. | Integration test: snapshot the fixture tree before and after `scan` and confirm it is unchanged. `/review` checks for new write call sites. | M2.3, M2.4, M5.2 |
| **SEC-03** | **No network** unless an `aws-ssm` source is configured. No telemetry. | `@aws-sdk/client-ssm` is lazy-imported (`await import(...)`) only by `sources/aws-ssm.ts`. Core has no network imports (ESLint `no-restricted-imports`). No analytics, no update checks. | Test: a scan with no SSM source does not load the AWS SDK module. ESLint purity rule on `packages/core`. | M1.x, M5.1 |
| **SEC-04** | **File safety:** symlinks are never followed outside the scan root; files over `limits.maxFileBytes` are skipped; binary files (NUL byte in the first 8 KB) are skipped. | `io/walk.ts` resolves `realpath` and rejects targets outside root, checks `stat.size` before reading, and sniffs the first 8 KB. | Walker tests for a symlink escape (file and directory), an oversized file and a binary file. Each test asserts the file is skipped with a warning and no crash. | M2.1 |
| **SEC-05** | **Least privilege for AWS:** only `ssm:GetParametersByPath` on the configured path; decryption is never requested. | The adapter always sends `WithDecryption: false`. It sets `hasValue: true` and `looksSecret: false` and never reads `Parameter.Value`. | Mocked-client test asserts the request has `WithDecryption: false`. A test asserts no `Value` field is read; the mock returns a planted value and the redaction check runs. | M5.1 |
| **SEC-06** | **Supply chain:** pinned dependencies, `npm audit --audit-level=high` in CI, a minimal dependency count, and each new dependency justified in its commit. | `.npmrc` has `save-exact=true`. `package-lock.json` is committed. The audit job runs in CI. [dependencies.md](../architecture/dependencies.md) lists each dependency with its reason. | CI audit job. `/review` flags unjustified dependencies. | M0.0 onward |
| **SEC-07** | **End-to-end redaction test:** a fixture repo with planted fake secrets. The built CLI runs with every format, and the test asserts no planted string appears anywhere. | `fixtures/planted-secrets/` plus a test in `packages/cli/test/redaction.test.ts`. | See [§4](#4-redaction-end-to-end-test-design-sec-07). | M3.4 (table, json), M4.4 (markdown, sarif) |
| SEC-08 | Error messages, warnings and thrown errors never interpolate file content. They may interpolate only paths, line numbers, variable names, rule IDs and config keys. | Error constructors take structured fields. No `String(line)` or raw snippet in messages. Parser errors from `@babel/parser` and `yaml` are re-wrapped with position only (their messages can quote source). | The redaction test also triggers parse failures on files containing planted values. | M0.2, M2.2, M3.x |
| SEC-09 | No stack traces by default. A stack trace is printed only when `DEBUG=envdrift` is set. | The top-level handler in `bin.ts` prints the one-line cause and next step ([error-handling.md](error-handling.md)). | Integration test: a forced internal error with no `DEBUG` set prints no stack. | M2.3 |
| SEC-10 | Config and compose YAML are parsed safely: no custom tags, a bounded alias expansion, and `__proto__`/`constructor` keys are not merged into objects. | `yaml` is parsed with the default (core) schema and `maxAliasCount` is set. zod validation rejects unknown shapes. Compose maps are iterated with `Object.entries` on null-prototype copies. | Unit tests: a billion-laughs YAML returns a warning or error with no hang, and a `__proto__` key does not pollute `Object.prototype`. | M1.2, M3.2 |
| SEC-11 | Secret detection runs in bounded time: no regex with nested quantifiers on untrusted input, and the length is capped before the entropy calculation. | `looksLikeSecret` uses prefix checks plus a linear entropy loop. Placeholder checks use anchored, non-backtracking patterns. | Property test: random strings up to 1 MB complete in under 50 ms each. | M1.1 |
| SEC-12 | The Action requests only the permissions it needs: `contents: read`, plus `pull-requests: write` only when `comment: true`. | The README and [github-action.md](../functional/github-action.md) document the permissions block. The Action never uses a token for anything except the single comment upsert. | Manual review at M4.2. Example workflow in the docs. | M4.2 |
| SEC-13 | This repository contains no real secrets. | `.gitignore` covers `.env*` except the example and fixture files. Dogfood ED007 runs in CI. A final manual secret scan runs before submission. | CI dogfood scan (M4.3). Release checklist ([release.md](release.md)). | M4.3, M8 |

## 2. Threat model

**Assets:**
- configuration values in scanned repos (A1);
- the user's CI token (A2);
- AWS credentials in CI (A3);
- the integrity of the published package and Action (A4);
- the availability of the CI job (A5).

**Trust boundary:** everything inside the scanned repository is **untrusted input**. This matters most when the Action runs on a pull request from a fork.

| ID | Asset | Threat | Vector | Mitigation | Test |
|---|---|---|---|---|---|
| T-01 | A1 | Value printed in a report | A reporter or rule formats a declaration with its value | SEC-01: values never exist outside parsers, so there is nothing to print | Redaction e2e (SEC-07), type-level `value` test |
| T-02 | A1 | Value leaked through an error message | A parser error quotes the offending line, e.g. a YAML or Babel syntax error | SEC-08: re-wrap third-party errors with file:line only | Redaction e2e with malformed files containing planted values |
| T-03 | A1 | Value leaked through a stack trace or debug log | Unhandled exception; verbose logging | SEC-09: no stacks by default; `DEBUG=envdrift` logs paths and names only | Integration test with a forced error |
| T-04 | A1 | Value in a cached or intermediate file | Writing temp files, caching parsed files | No caching to disk; no temp files | `/review` checklist; read-only test (SEC-02) |
| T-05 | A1 | Value in a PR comment or SARIF upload | The markdown or SARIF reporter includes snippets | Reporters receive `Finding`s only; SARIF has no `snippet` or `contextRegion` | Redaction e2e for markdown and sarif (M4.4) |
| T-06 | A1 | Reading files outside the repo | A symlink in the repo points to `/home/runner/.aws/credentials` or `../../` | SEC-04: realpath containment check, no following outside root | Walker symlink-escape tests |
| T-07 | A5 | CI hang or OOM | Huge files, binary blobs, deeply nested ASTs | SEC-04 size and binary limits; per-file try/catch; parse failure means skip | Walker tests; huge-file and binary fixture |
| T-08 | A5 | YAML bomb | Compose or config file with exponential anchors | SEC-10: `maxAliasCount`; parse failure becomes a source warning or exit 2 for config | Unit test with billion-laughs input |
| T-09 | A5, A1 | Prototype pollution | `__proto__:` key in compose `environment` or the config | SEC-10: null-prototype maps; zod strict objects | Unit test asserts `({}).polluted === undefined` |
| T-10 | A5 | ReDoS | Crafted value hits a backtracking regex in `looksLikeSecret`; crafted `include`/`exclude` glob | SEC-11: linear checks; globs come from config owned by the repo (picomatch is linear on paths) | fast-check timing property test |
| T-11 | A2 | Token abuse via an untrusted PR | The workflow uses `pull_request_target` and checks out PR head code, so PR code runs with a write token | Docs recommend `pull_request` (fork PRs get a read-only token; commenting is skipped gracefully). If `pull_request_target` is used, never check out or execute PR code with the token. EnvDrift itself never executes repo code, it only parses it. | Docs review; Action handles 403 on comment as a warning, not a failure |
| T-12 | A2 | Over-broad token permissions | The workflow grants `write-all` | SEC-12: documented minimal `permissions:` block | Example workflow in README |
| T-13 | A3 | Over-broad AWS access or secret decryption | The IAM role has `ssm:*` or `kms:Decrypt` | SEC-05: `WithDecryption: false`; documented minimal policy (below); OIDC role scoped to the repo | Mocked-client test on request params |
| T-14 | A4 | Malicious dependency or compromised update | Transitive dependency takeover | SEC-06: pinned versions, lockfile, `npm audit`, minimal deps, publish with `--provenance` | CI audit job; [release.md](release.md) checklist |
| T-15 | A4 | Tampered Action tag | A moving `v0` tag is retargeted to a malicious commit | Docs recommend pinning by commit SHA for security-sensitive users; release tags are signed (Proposal) | Release checklist |
| T-16 | A1 | Real secrets committed to this repo (fixtures, examples) | Copy-pasting real keys into fixtures | Fixtures use obviously fake values with recognisable prefixes (`sk_test_ENVDRIFT_PLANTED_…`); SEC-13 dogfood plus final scan | Dogfood CI; M8 manual scan |
| T-17 | A1 | Values sent over the network | Telemetry or crash reporting | SEC-03: none exists. The only network traffic is the SSM API call, and it requests no values. | Module-load test |

## 3. Minimal IAM policy (aws-ssm source)

The only permission needed is `ssm:GetParametersByPath` on the configured path. `kms:Decrypt` is **not** needed because decryption is never requested.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EnvDriftListParameterNames",
      "Effect": "Allow",
      "Action": "ssm:GetParametersByPath",
      "Resource": "arn:aws:ssm:<region>:<account-id>:parameter/myapp/prod*"
    }
  ]
}
```

Notes:
- The resource ARN omits the leading `/` of the parameter path (`/myapp/prod/` → `parameter/myapp/prod*`).
- With `WithDecryption: false`, `GetParametersByPath` still returns `Value` for `String` parameters and the ciphertext for `SecureString`. EnvDrift discards the field without reading it, inside the adapter (SEC-05). A Proposal for post-hackathon: switch to `DescribeParameters` with a path filter, which returns no values at all.
- In GitHub Actions, prefer OIDC (`aws-actions/configure-aws-credentials` with `role-to-assume`) over long-lived keys. Scope the role's trust policy to the repository and branch.

## 4. Redaction end-to-end test design (SEC-07)

**Fixture `fixtures/planted-secrets/`:**

| File | Planted content |
|---|---|
| `.env` (committed, triggers ED007) | `STRIPE_SECRET_KEY=sk_live_ENVDRIFT_PLANTED_0001…` |
| `.env.example` (triggers ED008) | `GITHUB_TOKEN=ghp_ENVDRIFT_PLANTED_0002…` |
| `Dockerfile` | `ENV API_TOKEN=ENVDRIFT_PLANTED_0003_high_entropy_…` |
| `docker-compose.yml` | `environment: { DB_PASSWORD: ENVDRIFT_PLANTED_0004… }`, plus `env_file` pointing at a dotenv file with `ENVDRIFT_PLANTED_0005` |
| `deploy/prod.keys` | names only; the control case |
| `src/broken.ts`, `deploy/broken.env` | syntax errors on lines that contain `ENVDRIFT_PLANTED_0006`, to exercise the error path (SEC-08) |
| `src/app.ts` | references the names, including a `NEXT_PUBLIC_` secret name (ED006) |

**Procedure:**
1. Build the CLI (`dist/bin.js`) and initialise the fixture as a git repo in a temp directory so that ED007 sees a tracked `.env`.
2. For each format in `table`, `json`, `markdown`, `sarif`, and for one multi-format run (`--format json,markdown,sarif --output report`), run with `execa`. Also run once with `DEBUG=envdrift`.
3. Collect stdout, stderr and every file under the output paths.
4. Assert that **no** planted string appears anywhere: the full value, its 8-character prefix and suffix fragments, and the base64 encoding of the full value.
5. Assert that the expected findings are present (ED006, ED007, ED008), so the test cannot pass vacuously.

**Placement:** `packages/cli/test/redaction.test.ts`. It runs in the main CI job and must never be skipped, because the PRD cut order says "never cut: redaction test".

## 5. Reporting a vulnerability

Proposal: add a `SECURITY.md` at M7.2 that points to a private contact (GitHub private vulnerability reporting on `<gh-user>/envdrift`).
