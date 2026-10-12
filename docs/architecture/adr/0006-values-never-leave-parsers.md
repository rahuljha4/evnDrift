# ADR 0006: Values never leave parsers

- **Status:** Accepted
- **Date:** 2026-10-08
- **PRD reference:** D6, §15.1, §15.7

## Context
EnvDrift reads files that contain real secrets: `.env`, Dockerfiles, compose files, and committed env files. Its output goes to CI logs, PR comments, SARIF uploads, and job summaries, all of which may be public. A single leaked value is a security incident. Two rules need value-derived facts: ED007 needs to know whether a value is present, and ED008 needs to know whether it looks like a secret.

## Decision
- The parsers (`core/parse/*`) are the **only** code that holds a value, and only in local variables.
- Value-dependent facts are computed **inside** the parser and only booleans leave it: `hasValue`, and `looksSecret` via `looksLikeSecret()`.
- No exported type has a property named `value`, and no other property carries a raw value.
- Warnings and errors from parsers contain names, paths, and line numbers only.
- Parsers return only `envdrift-ignore` comment lines, never other comment text, because commented-out lines can hold values.
- The AWS SSM source never requests decryption and never inspects values.
- `secrets.ts` is not exported from the core barrel.

## Consequences
- Positive: leaks are impossible by construction for every downstream module and reporter, and the guarantee can be audited in one folder.
- Negative:
  - New value-based checks need parser changes.
  - `fix --example` must edit lines as opaque strings rather than parse and re-emit them ([data-flow.md §4](../data-flow.md#4-envdrift-fix---example)).

## Alternatives considered
| Option | Why not |
|---|---|
| Carry values and redact in reporters | One missed reporter or log line leaks. Not auditable |
| Hash values | Hashes of low-entropy secrets can be brute-forced. Not needed |

## Evidence / validation plan
- Type-level test (M1.1): no exported type has `value`.
- Property tests: dotenv and keys parsers never output any substring of a planted value.
- End-to-end redaction test (M3.4, M4.4): the `planted-secrets` fixture has fake secrets in `.env`, `.env.example`, Dockerfile, compose, and a committed `.env`. The test runs the built CLI with every format and asserts that no planted string appears in stdout, stderr, or any output file. See [system/security.md](../../system/security.md).
