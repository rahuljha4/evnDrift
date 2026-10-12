# Review: uncommitted changes under packages/

## 1. Scope and verdict
- Scope: `git diff HEAD` plus untracked files, limited to `packages/` (`.claude/` and `docs/reviews/` ignored). Files: `packages/core/package.json`, `src/model.ts`, `src/parse/keys.ts`, `src/rules/{ED001,ED009,ED010,index}.ts`, `test/rules/*`.
- Date: 2026-10-12
- Verdict: CHANGES REQUIRED
- Reason: several hard-rule breaks (core I/O, a `value` property, console.log, unpinned dependency, rules missing tests) and ED009 has inverted semantics.

## 2. Pre-flight results
```
CHECK SCOPE INFO - base=HEAD changed_files=4 untracked_files=12
CHECK TEST PASS - npm test exit 0 (Tests 96 passed (96))
CHECK TYPECHECK PASS - npm run typecheck exit 0
CHECK LINT FAIL - npm run lint exit 1: 1:1 error 'node:fs' import is restricted from being used. core is pure: do file I/O in packages/cli adapters no-restricted-imports | | /var/www/evnDrift/packages/core/src/rules/ED001.ts | 5:29 error Unexpected any. Specify a different type @typescript-eslint/no-explicit-any | | ✖ 7 problems (7 errors, 0 warnings)
CHECK FORMAT FAIL packages/core/src/parse/keys.ts prettier --check reports formatting differences
CHECK FORMAT FAIL packages/core/test/rules/helpers.ts prettier --check reports formatting differences
CHECK CORE_IO FAIL packages/core/src/model.ts:1 core imports "node:fs" (hard rule 2: core has no I/O)
CHECK CORE_IO WARN packages/core/src/model.ts:3 core calls Date.now() (non-determinism risk, hard rule 5)
CHECK CONSOLE FAIL packages/core/src/rules/ED001.ts:9 console.log in core (core must not print; reporters return strings)
CHECK VALUE_PROP FAIL packages/core/src/parse/keys.ts:5 exported type "KeyEntry" has a property named "value" (hard rule 1 / ADR 0006)
CHECK WARN_LEAK FAIL packages/core/src/parse/keys.ts:18 warning interpolates "line", which may hold file content or a value (SEC-08, hard rule 1); use file:line and names only
CHECK NEW_DEP FAIL packages/core/package.json:16 NEW dependencies "lodash": "^4.17.21" (not an exact pin, rule 7) (no row in docs/architecture/dependencies.md); needs a justification in the commit message
CHECK RULE_TESTS FAIL packages/core/test/rules/ED001.test.ts ED001 has no test titled "ED001 negative" (hard rule 3: positive, negative, suppression)
CHECK RULE_TESTS FAIL packages/core/test/rules/ED001.test.ts ED001 has no test titled "ED001 suppression" (hard rule 3: positive, negative, suppression)
CHECK PATTERN_IDS PASS docs/patterns-catalogue.md 24 catalogue IDs and 24 pattern-ID tests agree
SUMMARY FAIL=10 WARN=1 PASS=3 INFO=1 SKIP=0
```

## 3. Findings
### BLOCKER
1. **core imports node:fs and reads files** — `packages/core/src/model.ts:1`
   - Problem: `loadExample` calls `readFileSync` (line 6); lint fails on it.
   - Why it matters: CLAUDE.md hard rule 2 (core is pure). Also unrequested; `model.ts` is not a PRD module.
   - Fix: delete; I/O belongs in `packages/cli/src/io`.
2. **Exported type has a `value` property and holds values** — `packages/core/src/parse/keys.ts:5`
   - Problem: `KeyEntry.value` is exported and returned from `parseKeys` (lines 22-23, 26).
   - Why it matters: hard rule 1 / ADR 0006; parsers return only `Declaration`.
   - Fix: drop `KeyEntry` and `entries`; return `Declaration[]` and warnings only.
3. **Warning interpolates raw line content** — `packages/core/src/parse/keys.ts:18`
   - Problem: `cannot parse "${line}"` can echo a secret value.
   - Why it matters: hard rule 1, SEC-08.
   - Fix: `${file}:${i + 1}: cannot parse line (no '=')`.
4. **ED009 semantics inverted** — `packages/core/src/rules/ED009.ts:8`
   - Problem: condition is `refs.every((r) => !r.hasFallback)`, so it fires when no reference has a fallback. PRD §11 / D5 says ED009 fires when every reference HAS a fallback (those without go to ED002).
   - Why it matters: wrong rule semantics (BLOCKER tier). Its tests hide this: the positive test (`ED009.test.ts:6`) uses a reference with no fallback.
   - Fix: `refs.every((r) => r.hasFallback)`; fix tests (see HIGH).
5. **console.log in core** — `packages/core/src/rules/ED001.ts:9`
   - Problem: debug print; prints names on every finding. Why it matters: core must not print; rules are pure.
   - Fix: remove.
6. **New dependency, unpinned, undocumented** — `packages/core/package.json:16`
   - Problem: `"lodash": "^4.17.21"`; unused anywhere in the diff.
   - Why it matters: hard rule 7 (exact pin, row in dependencies.md, justification).
   - Fix: remove.
7. **ED001 has only 1 of 3 required tests** — `packages/core/src/rules/ED001.ts:3`
   - Problem: only a positive test exists (`ED001.test.ts:5`). Why it matters: hard rule 3.
   - Fix: add negative and suppression tests.

### HIGH
1. **ED001 fires on every reference when `.env.example` is null** — `packages/core/src/rules/ED001.ts:5-6`
   - Problem: PRD §11 says ED001 applies only when `.env.example` is configured. With `example === null`, `declared` is an empty set and every name is reported.
   - Fix: `if (!model.example) return [];`.
2. **Unrequested rule ED010 with a type escape** — `packages/core/src/rules/ED010.ts:8`
   - Problem: ED010 (name > 40 chars) is not in PRD §11; `RuleId` (`types.ts:70`) only allows ED001-ED009, hence `'ED010' as never`.
   - Why it matters: unrequested scope; CLAUDE.md says propose requirements, not invent them. ED010 is also registered in `rules/index.ts:7`.
   - Fix: remove ED010 and its test.
3. **ED009 tests are vacuous or wrong** — `packages/core/test/rules/ED009.test.ts:5-16`
   - Problem: positive uses `toBeTruthy()` on no-fallback input (codifies the bug). The "suppression" test is not suppression: it passes because no environments are configured. No `envdrift-ignore` case exists.
   - Fix: assert the full finding with fallback refs; add a real suppression case (or test at the layer that applies suppression, if not in the rule) and an ED002-territory negative (no fallback, expect `[]`).
4. **ED010 "suppression" test is empty-input** — `packages/core/test/rules/ED010.test.ts:8`
   - Judgement: does not exercise suppression. Moot if ED010 is removed.
5. **`any` cast on model** — `packages/core/src/rules/ED001.ts:5`
   - Problem: `(model as any).example` fails lint. `ScanModel` already has `example` (helpers.ts builds it), so the cast is needless. Fix: use `model.example`.

### MEDIUM
1. **`Date.now()` at module load** — `packages/core/src/model.ts:3`: non-deterministic (hard rule 5). Removed with the file.
2. **Rule run order is not sorted** — `packages/core/src/rules/index.ts:7`: ED009, ED010, ED001. Judgement: harmless if the later sort stage applies, but order by ID anyway. `fingerprint: ''` is a placeholder in all three rules; confirm the pipeline fills it.
3. **keys parser** — `packages/core/src/parse/keys.ts:21`: name is not trimmed, there is no `export ` handling or name validation, and `looksSecret` is hard-coded `false` (line 24). Judgement: ED008 will never fire. Also check whether the keys source (PRD) specifies this format, and add tests (none exist for `keys.ts`; hard-rule-adjacent per tests reference).
4. **Prettier failures** — `packages/core/src/parse/keys.ts:9`, `packages/core/test/rules/helpers.ts:3`: run `npm run format`.
5. **No docs update** — behaviour added with no change to `docs/functional/rules/*` or `docs/rules.md` for ED010.

### NIT
1. `packages/core/src/rules/ED010.ts:12`: omits `column`, unlike the other rules.
2. `packages/core/test/rules/ED010.test.ts:6-8`: one-line arrow tests; style differs from siblings.

## 4. Checked and passed
- `npm test` (96 pass) and `npm run typecheck` pass per pre-flight. Judgement: passing tests mask the ED009 bug.
- Pattern IDs and catalogue agree (pre-flight PATTERN_IDS PASS).
- ED001 message and error severity match PRD §11; ED009 severity (warning) matches.

## 5. Uncertainties
- No pre-flight SKIPs.
- Did not confirm where suppression is applied (rule vs pipeline); the "suppression" test requirement was judged against pre-flight naming.
- Did not check whether the keys-source format is specified in the PRD beyond a grep.
- Did not check that `fingerprint: ''` is filled downstream.
