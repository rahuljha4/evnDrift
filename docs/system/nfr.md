# Non-Functional Requirements

> Implements [PRD §16](../prd.md#16-non-functional-requirements). Results are recorded in [benchmark.md](../benchmark.md) (performance) and in CI (everything else).

Status values are **not measured**, **passing** and **failing**. Update the status when the measuring test or benchmark first runs.

## Requirements

| ID | Area | Requirement | Target | Measurement method | Tooling | Milestone | Status |
|---|---|---|---|---|---|---|---|
| NFR-PERF-01 | Performance | Scan a 2,000-file JS/TS repo on a laptop | < 10 s wall time, end to end (`envdrift scan`, cold start) | Run the built CLI 5× on a pinned commit of a real repo with about 2,000 source files. Report the median and max from `hyperfine` (or `time`), and the machine spec. | `hyperfine`, `stats.durationMs` | M6.3 | not measured |
| NFR-PERF-02 | Performance | Pre-filter keeps per-file cost low | Files without `env` or an accessor name are not parsed | Unit test: the parser is not called for files failing the pre-filter (spy). Benchmark: compare files read with files parsed. | Vitest, benchmark | M0.2 | not measured |
| NFR-PERF-03 | Performance | Startup cost when SSM is unused | AWS SDK not loaded | Module-load test (see [security.md](security.md) SEC-03) | Vitest | M5.1 | not measured |
| NFR-DET-01 | Determinism | Same input gives byte-identical JSON | Two runs produce identical bytes | Golden fixtures compare JSON output exactly; an extra test runs each fixture twice and compares the bytes | Vitest + execa | M2.3 | not measured |
| NFR-DET-02 | Determinism | Stable ordering | Findings sorted by severity (error > warning > info), then ruleId, name, file, line | Unit test on the sort function with shuffled input (property test) | fast-check | M1.5 | not measured |
| NFR-DET-03 | Determinism | Stable fingerprints | `fingerprint` unchanged across runs and machines | Fingerprint = sha1(ruleId\|name\|environments\|first location file). Snapshot test; Windows CI job (Proposal) compares against Linux. | Vitest | M1.5 | not measured |
| NFR-DET-04 | Determinism | No timing data in byte-compared output | `durationMs` excluded or normalised in golden comparisons | The golden harness replaces `stats.durationMs` with `0` before comparing | Vitest | M2.3 | not measured |
| NFR-PORT-01 | Portability | Works on macOS, Linux and Windows | All tests pass on all three OSes | CI matrix (Proposal, see [ci-cd.md](ci-cd.md)) | GitHub Actions | M2.5 | not measured |
| NFR-PORT-02 | Portability | Paths normalised to `/` in all output | No `\` in any output path | Unit test on the path normaliser. Windows CI golden run. | Vitest | M2.1 | not measured |
| NFR-PORT-03 | Portability | Node ≥ 20, ESM only | Runs on Node 20, 22 and 24 | CI Node matrix; `engines` field in `package.json` | GitHub Actions | M0.0 | not measured |
| NFR-ERR-01 | Errors | Every exit-2 error has a one-line cause and a one-line next step | 100% of the error catalogue | Each `E-*` ID in [error-handling.md](error-handling.md) has an integration test asserting two lines on stderr and exit code 2 | Vitest + execa | M2.2–M5.1 | not measured |
| NFR-ERR-02 | Errors | Parse failures never crash the scan | Scan completes; the file is counted in `filesSkipped` | Fixture with malformed JS, YAML and Dockerfile | Vitest + execa | M2.3 | not measured |
| NFR-A11Y-01 | Accessibility | Table output readable without colour | Severity printed as text (`error`, `warning`, `info`) | Snapshot test with `--no-color` and with `NO_COLOR=1` | Vitest | M2.3 | not measured |
| NFR-A11Y-02 | Accessibility | Respects `NO_COLOR` and non-TTY | No ANSI escape codes when `NO_COLOR` is set or stdout is not a TTY | Integration test checks the output for `\x1b[` | execa | M2.3 | not measured |

## Quality targets (from PRD §4 success criteria)

These are not in PRD §16 but are tracked here because they gate submission.

| ID | Target | Measurement | Milestone |
|---|---|---|---|
| NFR-QA-01 | Core line coverage ≥ 90% | `npm run test:coverage` threshold in `vitest.config.ts` | M1 onward |
| NFR-QA-02 | Stryker mutation score on `packages/core` ≥ 80% | `npm run mutation` (added M6.1) | M6.1 |
| NFR-QA-03 | Precision documented on 3 real open-source repos | [benchmark.md](../benchmark.md) | M6.3 |

See [testing-qa.md](testing-qa.md) for how each layer is tested.
