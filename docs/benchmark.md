# Benchmark — precision and performance

Requirements: [PRD §4](prd.md#4-goals-non-goals-success-criteria) (3 real repos, precision), [§16](prd.md#16-non-functional-requirements) (2,000 files in < 10 s), and [§18](prd.md#18-qa-strategy). The method is defined in [system/testing-qa.md](system/testing-qa.md) and the targets in [system/nfr.md](system/nfr.md).

**Status:** nothing measured yet. M0.3 runs the spike comparison and M6.3 runs the full benchmark.

## Environment (fill on each run)

| Field | Value |
|---|---|
| Date | |
| EnvDrift commit | |
| Machine (CPU, RAM, OS) | |
| Node version | |

## 1. Spike: AST vs grep on umami (M0.3)

Procedure:
1. Clone `umami-software/umami` at a pinned commit.
2. Run `scripts/spike-scan.ts`.
3. Run `grep -rhoE "process\.env\.[A-Z0-9_]+"` on the same include set.
4. Diff the two name sets. Explain every name that only one side found.

| Repo @ commit | Files | AST names | grep names | Agreed | AST-only (why) | grep-only (why) | Time |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

## 2. Precision on real repos (M6.3)

For each repo, hand-check a sample of findings (all errors, plus up to 20 warnings).
Precision = true positives / sampled findings. "True positive" means the finding is actionable or correctly needs suppression.

| Repo @ commit | Why chosen | Files | Findings (E/W/I) | Sampled | TP | FP | Precision | Notes / FP causes |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |
| | | | | | | | | |
| | | | | | | | | |

## 3. Performance (M6.3)

Run `envdrift scan --format json` with a cold start, 5 runs, and report the median.

| Repo / synthetic | Files scanned | Files skipped | Median duration | Target | Pass |
|---|---|---|---|---|---|
| synthetic 2,000-file repo | 2,000 | | | < 10 s | |
| | | | | | |

## 4. Mutation testing (M6.1)

| Date | Package | Score before | Weak tests found | Score after | ai-log rows |
|---|---|---|---|---|---|
| | packages/core | | | | |
