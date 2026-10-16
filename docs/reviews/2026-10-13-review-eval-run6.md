# Review: staged diff (review-eval-run6)

## 1. Scope and verdict
- Scope: `git diff --cached`, 9 files in packages/core (model.ts, parse/keys.ts, rules ED002/ED009/ED010/index, two tests, package.json).
- Staged-diff-sha256: 1218d7ccc37774f8ec45708e81887129847879f3313df827b7db7e4772b9f982
- Date: 2026-10-13
- Verdict: CHANGES REQUIRED
- Reason: Several hard-rule breaks (values in parser type and warning, I/O in core, rule test counts, unpinned dependency, unsorted output) plus inverted ED002 semantics.

## 2. Pre-flight results
```
CHECK SCOPE INFO - staged changed_files=9 untracked_files=0
CHECK TEST PASS - tests: 307 passed in 1.2s
CHECK TYPECHECK PASS - typecheck: ok in 0.6s
CHECK LINT FAIL - npm run lint exit 1: packages/core/src/model.ts 1:1 'node:fs' import is restricted (no-restricted-imports)
CHECK FORMAT FAIL packages/core/test/rules/ED002.test.ts prettier --check reports formatting differences
CHECK FORMAT FAIL packages/core/test/rules/ED009.test.ts prettier --check reports formatting differences
CHECK CORE_IO FAIL packages/core/src/model.ts:1 core imports "node:fs" (hard rule 2: core has no I/O)
CHECK CORE_IO WARN packages/core/src/model.ts:5 core calls Date.now() (non-determinism risk, hard rule 5)
CHECK CONSOLE FAIL packages/core/src/model.ts:7 console.log in core
CHECK CORE_IO WARN packages/core/src/model.ts:7 core calls Date.now() (non-determinism risk, hard rule 5)
CHECK VALUE_PROP FAIL packages/core/src/parse/keys.ts:3 exported type "KeyEntry" has a property named "value" (hard rule 1 / ADR 0006)
CHECK WARN_LEAK FAIL packages/core/src/parse/keys.ts:12 warning interpolates "raw", which may hold file content or a value (SEC-08, hard rule 1)
CHECK NEW_DEP FAIL packages/core/package.json:16 NEW dependencies "lodash": "^4.17.21" (not an exact pin, rule 7) (no row in docs/architecture/dependencies.md)
CHECK RULE_TESTS FAIL packages/core/test/rules/ED002.test.ts ED002 has no test titled "ED002 negative"
CHECK RULE_TESTS FAIL packages/core/test/rules/ED002.test.ts ED002 has no test titled "ED002 suppression"
CHECK RULE_TESTS FAIL packages/core/test/rules/ED009.test.ts ED009 has no test titled "ED009 negative"
CHECK RULE_TESTS FAIL packages/core/test/rules/ED009.test.ts ED009 has no test titled "ED009 suppression"
CHECK RULE_TESTS FAIL packages/core/src/rules/ED010.ts ED010 has no test file (expected packages/core/test/rules/ED010.test.ts)
CHECK PATTERN_IDS PASS docs/patterns-catalogue.md 24 catalogue IDs and 24 pattern-ID tests agree
CHECK WEAK_ASSERT FAIL packages/core/test/rules/ED009.test.ts:16 assertion passes for almost any result: expect(ED009(model).length).toBeTruthy();
CHECK UNSORTED FAIL packages/core/src/rules/index.ts:8 runRules hands findings on and this file never sorts (hard rule 5)
CHECK STAGED_HASH INFO - Staged-diff-sha256: 1218d7ccc37774f8ec45708e81887129847879f3313df827b7db7e4772b9f982
SUMMARY FAIL=15 WARN=2 PASS=3 INFO=2 SKIP=0
```

## 3. Findings
### BLOCKER
1. **Parser type exports a `value` property** — `packages/core/src/parse/keys.ts:3`
   - Problem: `KeyEntry` has `value: string`, filled at line 15 with the text after `=`.
   - Why it matters: hard rule 1, ADR 0006.
   - Fix: return `Declaration { name, file, line, hasValue, looksSecret }` and compute `hasValue`/`looksSecret` inside the parser.
2. **Warning interpolates raw line content** — `packages/core/src/parse/keys.ts:12`
   - Problem: `skipped line N: ${raw}` puts file text, possibly a secret, into a warning.
   - Why it matters: hard rule 1, SEC-08.
   - Fix: use file:line only.
3. **Core reads the filesystem** — `packages/core/src/model.ts:1`
   - Problem: imports `node:fs` and calls `readFileSync`. Lint fails.
   - Why it matters: hard rule 2.
   - Fix: move to packages/cli/src/io.
4. **ED002 fallback condition is inverted** — `packages/core/src/rules/ED002.ts:11`
   - Problem: PRD §11 says ED002 fires when code reads the variable without a fallback. The code skips unless every reference has a fallback, so it fires only in the ED009 case and never for a name read without one.
   - Why it matters: wrong rule semantics (PRD §11, ED002).
   - Fix: report when some reference lacks a fallback, and leave the all-fallback case to ED009.
5. **ED002 has fewer than 3 tests** — `packages/core/src/rules/ED002.ts:4`
   - Problem: only a positive test, and it uses `hasFallback: true`, which encodes the inverted behaviour.
   - Why it matters: hard rule 3.
   - Fix: add negative and suppression tests.
6. **ED009 has fewer than 3 tests** — `packages/core/src/rules/ED009.ts:4`
   - Problem: only a positive test exists.
   - Why it matters: hard rule 3.
   - Fix: add negative and suppression tests.
7. **ED010 has no tests** — `packages/core/src/rules/ED010.ts:4`
   - Problem: no test file.
   - Why it matters: hard rule 3.
   - Fix: add three tests, or drop the rule (see HIGH 1).
8. **Unpinned `lodash` dependency without justification** — `packages/core/package.json:16`
   - Problem: caret range, no row in dependencies.md, and no import appears in the diff.
   - Why it matters: hard rule 7.
   - Fix: remove it, or pin exactly with a dependencies.md row and a commit-message justification.
9. **Findings are never sorted** — `packages/core/src/rules/index.ts:8`
   - Problem: `runRules` returns findings in rule order (`[ED009, ED010, ED002]`).
   - Why it matters: hard rule 5.
   - Fix: sort by severity, ruleId, name, file, line.

### HIGH
1. **ED010 is not in the PRD (unrequested scope)** — `packages/core/src/rules/ED010.ts:4`
   - Problem: `doc-lookup rule ED010` found no entry. Line 9 uses `'ED010' as never` to get past the `ruleId` type.
   - Why it matters: CLAUDE.md says to propose requirements, not invent them; hard rule 10.
   - Fix: remove it, or propose it in the PRD first.
2. **`console.log` in core** — `packages/core/src/model.ts:7`
   - Problem: core prints a timing line (pre-flight CONSOLE).
   - Why it matters: core must not print.
   - Fix: delete.
3. **Suppression not handled in ED002/ED009** — `packages/core/src/rules/ED009.ts:5`
   - Problem: neither rule honours `envdrift-ignore` or the `ignore` config.
   - Why it matters: PRD §11 suppress clauses.
   - Fix: Judgement: if suppression lives in a separate step, point the tests at it. Otherwise implement it.
4. **Weak assertion** — `packages/core/test/rules/ED009.test.ts:16`
   - Problem: `expect(...length).toBeTruthy()` passes for almost any result.
   - Why it matters: tests checklist.
   - Fix: assert the exact finding fields.
5. **Non-deterministic `Date.now()` in core** — `packages/core/src/model.ts:5`
   - Problem: used only for the log in HIGH 2.
   - Why it matters: hard rule 5.
   - Fix: delete.

### MEDIUM
1. **Prettier failures** — `packages/core/test/rules/ED002.test.ts:5`
   - Problem: format check fails in both test files.
   - Why it matters: repo format gate.
   - Fix: `npm run format`.
2. **Unvalidated `JSON.parse` cast to `ScanModel`** — `packages/core/src/model.ts:6`
   - Problem: JSON cannot produce the `Map` fields of `ScanModel`. Judgement: the cast is unsound.
   - Why it matters: typescript checklist.
   - Fix: build the model in the cli adapter.
3. **ED009 and ED002 share one condition** — `packages/core/src/rules/ED009.ts:7`
   - Problem: with the inverted ED002, both emit a finding for the same name and environment.
   - Why it matters: noisy duplicate findings.
   - Fix: resolved by the BLOCKER 4 fix.

### NIT
1. **`as const` / `as never` casts in ED010** — `packages/core/src/rules/ED010.ts:9`
   - Problem: casts used to satisfy types.
   - Why it matters: readability.
   - Fix: type the return as `Finding[]`.

## 4. Checked and passed
- Tests (307) and typecheck passed per the pre-flight.
- PATTERN_IDS passed per the pre-flight.

## 5. Uncertainties
- No SKIP lines in the pre-flight.
- ED002 and ED009 semantics come from `doc-lookup rule` summaries. I did not open `docs/functional/rules/*.md` or `types.ts`.
- Whether `ED010` is a valid `ruleId` is inferred from the `as never` cast.
- Suggested `/log-ai-failure`: an AI-written change inverted the ED002 fallback test, put values in a parser type and warning, added I/O and console output to core, invented ED010, and added an unpinned lodash.
