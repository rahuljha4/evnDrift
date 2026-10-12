# Review: uncommitted changes under packages/

## 1. Scope and verdict
- Scope: `git diff HEAD` plus untracked files, limited to `packages/` (`.claude/` and `docs/reviews/` ignored). Default scope; no task ID given.
- Date: 2026-10-12
- Verdict: CHANGES REQUIRED
- Reason: Multiple hard-rule breaks (core I/O, value-bearing type, console output, unpinned dependency, missing rule tests) and inverted ED009 semantics.

## 2. Pre-flight results
```
CHECK SCOPE INFO - base=HEAD changed_files=3 untracked_files=11
CHECK TEST PASS - npm test exit 0 (Tests 96 passed (96))
CHECK TYPECHECK PASS - npm run typecheck exit 0
CHECK LINT FAIL - npm run lint exit 1: 1:1 error 'node:fs' import is restricted from being used. core is pure: do file I/O in packages/cli adapters no-restricted-imports | | /var/www/evnDrift/packages/core/src/rules/ED001.ts | 5:29 error Unexpected any. Specify a different type @typescript-eslint/no-explicit-any | | ✖ 7 problems (7 errors, 0 warnings)
CHECK FORMAT FAIL packages/core/src/parse/keys.ts prettier --check reports formatting differences
CHECK FORMAT FAIL packages/core/test/rules/helpers.ts prettier --check reports formatting differences
CHECK CORE_IO FAIL packages/core/src/model.ts:1 core imports "node:fs" (hard rule 2: core has no I/O)
CHECK CORE_IO WARN packages/core/src/model.ts:3 core calls Date.now() (non-determinism risk, hard rule 5)
CHECK CONSOLE FAIL packages/core/src/rules/ED001.ts:9 console.log in core (core must not print; reporters return strings)
CHECK VALUE_PROP FAIL packages/core/src/parse/keys.ts:5 exported type "KeyEntry" has a property named "value" (hard rule 1 / ADR 0006)
CHECK NEW_DEP FAIL packages/core/package.json:16 NEW dependencies "lodash": "^4.17.21" (not an exact pin, rule 7) (no row in docs/architecture/dependencies.md); needs a justification in the commit message
CHECK RULE_TESTS FAIL packages/core/test/rules/ED001.test.ts ED001 has no test titled "ED001 negative" (hard rule 3: positive, negative, suppression)
CHECK RULE_TESTS FAIL packages/core/test/rules/ED001.test.ts ED001 has no test titled "ED001 suppression" (hard rule 3: positive, negative, suppression)
CHECK PATTERN_IDS PASS docs/patterns-catalogue.md 24 catalogue IDs and 24 pattern-ID tests agree
SUMMARY FAIL=9 WARN=1 PASS=3 INFO=1 SKIP=0
```

## 3. Findings
### BLOCKER
1. **core imports node:fs and reads files** — `packages/core/src/model.ts:1`
   - Problem: `readFileSync` imported and used in `loadExample` (line 6).
   - Why it matters: Hard rule 2, core is pure; ESLint fails.
   - Fix: Delete; I/O belongs in `packages/cli/src/io`.
2. **Exported type carries a `value` property** — `packages/core/src/parse/keys.ts:5`
   - Problem: `KeyEntry.value` is exported and populated at line 23 and returned from `parseKeys`.
   - Why it matters: Hard rule 1 / ADR 0006, values never leave parsers.
   - Fix: Remove `KeyEntry` and `entries`; return only `Declaration[]` (`hasValue` already covers it).
3. **console.log in core** — `packages/core/src/rules/ED001.ts:9`
   - Problem: Prints on every finding. Core must not print, and rules must be pure.
   - Why it matters: Hard rule 2 (purity), PRD output contract.
   - Fix: Remove.
4. **Unpinned new dependency without justification** — `packages/core/package.json:16`
   - Problem: `"lodash": "^4.17.21"` added; no row in `docs/architecture/dependencies.md`; nothing in core imports lodash (grep of the new files shows none).
   - Why it matters: Hard rule 7 (exact pins, justification and doc row).
   - Fix: Remove it.
5. **ED001 has 1 of the 3 required tests** — `packages/core/src/rules/ED001.ts:3` (tests `packages/core/test/rules/ED001.test.ts`)
   - Problem: Only a positive test; no negative or suppression test.
   - Why it matters: Hard rule 3.
   - Fix: Add `ED001 negative` (name declared in example) and `ED001 suppression` (suppressed location removes finding), plus a null-example case.
6. **ED009 condition is inverted** — `packages/core/src/rules/ED009.ts:8`
   - Problem: `refs.every((r) => !r.hasFallback)` fires when NO reference has a fallback. PRD §11 ED009 requires every reference to have a fallback (that case is ED002). The test at `test/rules/ED009.test.ts:5-7` uses a ref without fallback and expects a finding, so the test encodes the bug; the suppression test (line 15) uses a fallback ref with no environments, so it never exercises the real condition.
   - Why it matters: Wrong rule semantics (PRD §11, D5; correctness checklist).
   - Fix: `refs.every((r) => r.hasFallback)`; fix tests so positive uses `ref('PORT', true)` and negative uses a no-fallback ref (near-miss).
7. **ED001 fires on everything when `.env.example` is null** — `packages/core/src/rules/ED001.ts:5-8`
   - Problem: With `example === null`, `declared` is `new Set(undefined)` (empty), so every reference yields an error. PRD §11/§310 says ED001 applies only when `.env.example` is configured.
   - Why it matters: Wrong rule semantics, false errors.
   - Fix: `if (!model.example) return [];`.

### HIGH
1. **ED010 is not in the PRD** — `packages/core/src/rules/ED010.ts:3`
   - Problem: Name-length rule absent from PRD §11 (rules end at ED009); `RuleId` in `types.ts:70` has no ED010, bypassed with `'ED010' as never` at line 8. Also registered in `rules/index.ts:4`.
   - Why it matters: Unrequested scope; locked PRD v2.1; CLAUDE.md says propose, do not invent.
   - Fix: Remove ED010 and its test, or propose via a PRD change.
2. **`as any` bypasses the typed model** — `packages/core/src/rules/ED001.ts:5`
   - Problem: `ScanModel.example` is already typed `SourceResult | null`; the cast and the `d: {name: string}` annotation are unnecessary, and the lint rule fails.
   - Fix: Use `model.example` directly.
3. **`runRules` output is unsorted and ignores suppression/severity** — `packages/core/src/rules/index.ts:7`
   - Problem: Concatenates in ED009, ED010, ED001 order with no sort by severity, ruleId, name, file, line. Judgement: order is also not the ED001-first order a reader would expect.
   - Why it matters: Hard rule 5 (deterministic sorted output).
   - Fix: Sort in one place (or leave to the report stage and do not export a `runRules` that implies final output).
4. **Findings carry empty fingerprint and unsorted locations** — `ED001.ts:17`, `ED009.ts:17`, `ED010.ts:14`
   - Problem: `fingerprint: ''` and locations in reference order; data-model invariants require sha1 fingerprint and sorted locations. Judgement: acceptable only if a later stage fills them; not stated anywhere.
   - Fix: Document the finalise step or compute here.
5. **Tests are weak** — `packages/core/test/rules/ED009.test.ts:7`, `ED010.test.ts:6`
   - Problem: `toBeTruthy()` and `toHaveLength(1)` alone; "suppression" tests (ED009:14, ED010:8) are not suppression tests (no directive).
   - Why it matters: Would still pass if the finding content were wrong; hard rule 3 intent.
   - Fix: `toEqual` on full findings; real suppression cases.

### MEDIUM
1. **Module-level `Date.now()`** — `packages/core/src/model.ts:3`
   - Problem: Non-deterministic export, unused. Judgement: dead code with the file; delete whole file (it also duplicates the role of `types.ts`).
2. **parseKeys silently differs from the existing parser** — `packages/core/src/parse/keys.ts:9-27`
   - Problem: Judgement: M0.1 already added a keys-only dotenv parser; this one handles no quotes, `export`, or CRLF (a `\r` stays in names/values) and hard-codes `looksSecret: false`. Echoes the raw line in a warning (line 18), which can contain a value (hard rule 1: no values in warnings).
   - Fix: Reuse the existing parser; if kept, never put `line` in warnings.
3. **Prettier and lint failures** — `keys.ts`, `test/rules/helpers.ts`; lint reports 7 errors.
   - Fix: `npm run format`, resolve lint.
4. **No docs updated** — `docs/rules.md` / `docs/functional/rules/` not touched for ED001/ED009/ED010 (checked: docs unchanged in git status).

### NIT
1. `ED009.ts:5` iterates `Map`s in insertion order, relying on caller sort. Judgement: fine once sorting is centralised.

## 4. Checked and passed
- `npm test` (96 passed) and `npm run typecheck` pass per pre-flight.
- Pattern ID test/catalogue agreement passes.
- ED009 and ED010 each have three titled tests (titles only; quality in findings above).

## 5. Uncertainties
- No pre-flight SKIPs.
- Passing tests do not validate semantics (ED009 test encodes the inverted condition).
- Did not verify whether a later pipeline stage fills fingerprints, sorts locations and applies suppression.
- ED002 not in the diff; the inverted ED009 interaction with ED002 judged from PRD §11 text and the correctness checklist.

Suggested `/log-ai-failure`: AI-style code added a non-PRD rule (ED010) with `as never`, an inverted ED009 test that encodes the bug, `console.log` and fs in core; add a rule: "derive rule conditions from docs/functional/rules/EDxxx.md before writing tests".
