# Benchmark — precision and performance

Requirements: [PRD §4](prd.md#4-goals-non-goals-success-criteria) (3 real repos, precision), [§16](prd.md#16-non-functional-requirements) (2,000 files in < 10 s), and [§18](prd.md#18-qa-strategy). The method is defined in [system/testing-qa.md](system/testing-qa.md) and the targets in [system/nfr.md](system/nfr.md).

**Status:** M0.3 spike measured (section 1, 2026-10-16); the ai-log part of its acceptance is an open question (below). M6.3 runs the full benchmark (sections 2 and 3).

## Environment (fill on each run)

| Field | Value |
|---|---|
| Date | 2026-10-16 (M0.3) |
| EnvDrift commit | the M0.3 commit (parent `98eb291`); extractor unchanged since M0.2 (`e4e2fb4`) |
| Machine (CPU, RAM, OS) | Intel Core Ultra 5 125U (14 threads), 30 GB, Linux 7.0.0 |
| Node version | 24.6.0 |

## 1. Spike: AST vs grep on umami (M0.3)

Procedure:
1. Clone `umami-software/umami` at a pinned commit: `git clone --depth 1 --branch v3.4.0 https://github.com/umami-software/umami .cache/spike/umami`, then check that `git rev-parse 'HEAD^{commit}'` is `ec0ff50388c264ed8ce46f00967e92f7e71476ae`.
2. Run `node scripts/spike-scan.ts .cache/spike/umami --runs 5` (needs Node ≥ 22.18 or 23.6 for built-in type stripping). The file set is `git ls-files`, filtered by the PRD §12 default include and the D2 default excludes.
3. The script runs the grep side in-process over the same file set, with the [testing-qa.md](system/testing-qa.md) regex `process\.env\.[A-Z_][A-Z0-9_]*|import\.meta\.env\.[A-Z_][A-Z0-9_]*`. Cross-checked once with real `grep -hoE` over the same file list: same 68 names.
4. Diff the two name sets. Explain every name that only one side found.

| Repo @ commit | Files | AST names | grep names | Agreed | AST-only (why) | grep-only (why) | Time |
|---|---|---|---|---|---|---|---|
| umami v3.4.0 @ `ec0ff50` | 1,210 (0 parse failures) | 76 | 68 | 67 | 9: camelCase names (`apiUrl`, `basePath`, `cloudMode`, `cloudUrl`, `currentVersion`, `defaultCurrency`, `defaultLocale`, `selfRecord`, `selfTrack`) read with P01 dot access. The grep regex only matches names that start with an upper-case letter or `_` | 1: `UMAMI_API_KEY` in a JSDoc code example (`packages/api-client/src/client.ts:42`), which N01 ignores | cold 164 ms, median of 5: 75 ms |

Result: every difference is explained. Against the grep baseline, the extractor has no miss and no false hit. That says nothing yet about rule precision: the 9 camelCase names are likely ED002 false positives (open question below). With a mixed-case regex (`[A-Za-z_][A-Za-z0-9_]*`), grep finds 77 names: all 76 AST names plus the JSDoc one. The AST also reports 1 dynamic access (D01, `process.env[key]` in `scripts/check-env.js`), which grep cannot see. The output is deterministic: two runs gave identical JSON apart from timing.

Notes:
- The v2.0 estimate of about 113 files predates umami v3. v3.4.0 has 1,210 included files. That is still well under the < 1 s target, and suggests the 2,000-file < 10 s NFR has a large margin (M6.3 measures it properly).
- The 9 camelCase names are not deployment variables. They are keys of the `env` block in umami's `next.config.ts`, which Next.js inlines at build time. Once ED002 exists, they would be reported as missing from `.env.example`.

Open questions (owner: Rahul):
- **Next.js `next.config` `env` keys.** Resolved in PRD v2.3: decision D12, §10.8 and the `nextConfigEnv` option, built in task M1.7. M6.3 should see the 9 umami names dropped.
- **ai-log part of the M0.3 acceptance.** PRD §19 says "differences logged in `docs/ai-log.md`", but none of the umami differences is an AI mistake, and `docs/ai-log.md` forbids invented entries. Proposed PRD change-log line: "M0.3 acceptance: unexplained differences and AI mistakes found during the spike are logged in `docs/ai-log.md`."

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
