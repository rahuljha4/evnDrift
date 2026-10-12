# Review: uncommitted changes (git diff HEAD + untracked)

## 1. Scope and verdict
- Scope: `git diff HEAD` (packages/core/package.json) plus 10 untracked files: `packages/core/src/model.ts`, `src/parse/keys.ts`, `src/rules/{ED001,ED009,ED010,index}.ts`, `test/rules/{ED001,ED009,ED010}.test.ts`, `test/rules/helpers.ts`. Default scope; no task ID given.
- Date: 2026-10-12
- Verdict: CHANGES REQUIRED
- Reason: Breaks hard rules 1, 2, 3, 5 and 7, and ED009 has inverted semantics that its test does not catch.

## 2. Pre-flight results
```
CHECK SCOPE INFO - base=HEAD changed_files=1 untracked_files=10
CHECK TEST PASS - npm test exit 0 (Tests 96 passed (96))
CHECK TYPECHECK PASS - npm run typecheck exit 0
CHECK CORE_IO FAIL packages/core/src/model.ts:1 core imports "node:fs" (hard rule 2: core has no I/O)
CHECK CORE_IO WARN packages/core/src/model.ts:3 core calls Date.now() (non-determinism risk, hard rule 5)
CHECK CONSOLE FAIL packages/core/src/rules/ED001.ts:9 console.log in core (core must not print; reporters return strings)
CHECK VALUE_PROP FAIL packages/core/src/parse/keys.ts:5 exported type "KeyEntry" has a property named "value" (hard rule 1 / ADR 0006)
CHECK NEW_DEP FAIL packages/core/package.json:16 NEW dependencies "lodash": "^4.17.21" (not an exact pin, rule 7) (no row in docs/architecture/dependencies.md); needs a justification in the commit message
CHECK RULE_TESTS FAIL packages/core/test/rules/ED001.test.ts ED001 has no test titled "ED001 negative" (hard rule 3: positive, negative, suppression)
CHECK RULE_TESTS FAIL packages/core/test/rules/ED001.test.ts ED001 has no test titled "ED001 suppression" (hard rule 3: positive, negative, suppression)
CHECK PATTERN_IDS PASS docs/patterns-catalogue.md 24 catalogue IDs and 24 pattern-ID tests agree
SUMMARY FAIL=6 WARN=1 PASS=3 INFO=1 SKIP=0
```

## 3. Findings
### BLOCKER
1. **Core imports node:fs** — `packages/core/src/model.ts:1`
   - Problem: `readFileSync` imported and used in `loadExample` (line 5-6).
   - Why it matters: CLAUDE.md hard rule 2 (core is pure; ESLint should forbid it).
   - Fix: Delete `loadExample` from core. File reading belongs in `packages/cli/src/io`. Core receives text.
2. **Parser exports a raw value** — `packages/core/src/parse/keys.ts:5` (also 23)
   - Problem: exported `KeyEntry` has `value: string`, and `parseKeys` returns `entries` containing the raw value to callers.
   - Why it matters: Hard rule 1 / ADR 0006 (no exported type with `value`; values never leave parsers). Direct leak path.
   - Fix: Remove `KeyEntry` and `entries`. Return only `Declaration[]` and warnings.
3. **Warning leaks line content** — `packages/core/src/parse/keys.ts:18`
   - Problem: `cannot parse "${line}"` puts the raw line (which may be `SECRET` text or a value fragment) in a warning.
   - Why it matters: Hard rule 1 and security checklist: warnings carry `file:line` only.
   - Fix: `${file}:${i + 1}: cannot parse line`.
4. **ED009 condition inverted** — `packages/core/src/rules/ED009.ts:8`
   - Problem: fires when `refs.every((r) => !r.hasFallback)`. Spec (`docs/functional/rules/ED009.md`, "Fires when") requires every reference to HAVE a fallback. As written it fires exactly in the ED002 case and misses the real ED009 case, breaking ED002/ED009 mutual exclusion (ADR 0005).
   - Why it matters: Wrong rule semantics, PRD §11.
   - Fix: `refs.every((r) => r.hasFallback)`. Fix tests (see HIGH 1).
5. **console.log in core** — `packages/core/src/rules/ED001.ts:9`
   - Problem: debug print of the variable name in a pure rule.
   - Why it matters: Core must not do I/O (rule 2); stdout pollution breaks `--format json`.
   - Fix: remove.
6. **Rules ED001 and ED010 lack required tests, ED010 is not in the PRD** — `packages/core/src/rules/ED001.ts:3`, `packages/core/src/rules/ED010.ts:3`
   - Problem: ED001 has one test (pre-flight RULE_TESTS FAIL). ED010 is not in PRD §11 nor `RuleId` (`types.ts:70` allows ED001-ED009 only), hence the `'ED010' as never` cast at ED010.ts:8, and has no spec in `docs/functional/rules/`.
   - Why it matters: Hard rule 3 (3 tests per rule); CLAUDE.md "do not invent requirements"; hard rule 10.
   - Fix: add ED001 negative and suppression tests; delete ED010 (and its test and `index.ts` import) or propose it to Rahul via a PRD change.
7. **Non-deterministic / unsorted output** — `packages/core/src/model.ts:3`, `packages/core/src/rules/index.ts:7`
   - Problem: module-level `Date.now()` (pre-flight WARN) is a timestamp in core; `runRules` concatenates in an arbitrary order (ED009, ED010, ED001) and does no sorting.
   - Why it matters: Hard rule 5. Judgement: whole `startedAt` export appears unused; ED002-ED008 also missing from the runner (may be intended for later tasks, but no task ID is stated).
   - Fix: remove `startedAt`; sort via the shared findings sort before returning.

### HIGH
1. **ED009 tests are too weak and do not test what they say** — `packages/core/test/rules/ED009.test.ts:5-16`
   - Problem: positive uses `ref('PORT')` (no fallback) and `toBeTruthy()`, so it passes with the inverted logic. "Suppression" (line 14) is not a suppression: it passes only because no environments exist. Negative (line 10) is an unrelated empty input, not a near-miss.
   - Why it matters: tests.md assertion-strength and near-miss rules; rule-3 intent.
   - Fix: positive `ref('PORT', true)` with exact `toEqual` of the finding; negative: same but `ref('PORT', false)` or declared in env; real suppression using an `envdrift-ignore ED009` directive.
2. **New dependency violates rule 7** — `packages/core/package.json:16`
   - Problem: `"lodash": "^4.17.21"` is unpinned, has no row in `docs/architecture/dependencies.md`, and nothing in the diff imports it.
   - Why it matters: Hard rule 7 (exact pin, justification, doc row).
   - Fix: remove it (unused).
3. **ED001 fires when example is not configured** — `packages/core/src/rules/ED001.ts:5-8`
   - Problem: when `example` is null the set is empty and every reference is reported. Spec: "fires when `.env.example` is configured". Also `(model as any).example` bypasses the `ScanModel` type, which already has `example` (types.ts ~60).
   - Why it matters: PRD §11 ED001; typescript checklist (no `any`).
   - Fix: `if (!model.example) return [];` use typed access.
4. **ED001 message/fix text and ordering differ from spec** — `packages/core/src/rules/ED001.ts:14,16`
   - Problem: spec message `<NAME> is read in code but not declared in .env.example`, fix `Add <NAME>= to .env.example (or run: envdrift fix --example)`. Code differs, so the test encodes the wrong strings. Locations are not sorted file then line.
   - Why it matters: docs/functional/rules/ED001.md is the source of truth (docs drift = bug).
   - Fix: use the spec templates; sort locations.
5. **ED009 `environments` and locations unspecified order** — `packages/core/src/rules/ED009.ts:5,9-14`
   - Problem: one finding per (name, env) in Map insertion order. Spec says one finding per name with `environments` sorted listing all missing envs, and locations sorted. Also `column` handled but ED010 omits it (`ED010.ts:12`).
   - Why it matters: Hard rule 5; ADR/spec grouping.
   - Fix: group per name, sort environments and locations.
6. **Possible duplicate dotenv parser** — `packages/core/src/parse/keys.ts:9`
   - Problem: Judgement: commit e01f09f (M0.1) already added a keys-only dotenv parser with redaction; this new parser does not trim names, handle `export`, quotes, or comments, and hard-codes `looksSecret: false`. Not requested by a stated task.
   - Why it matters: Unrequested scope; ED008/ED007 would silently never fire.
   - Fix: delete and reuse the M0.1 parser.

### MEDIUM
1. **ED001 `fingerprint: ''` in all rules** — `ED001.ts:17`, `ED009.ts:17`, `ED010.ts:14`. Judgement: fine if a later step fills it; confirm against `data-model.md`, and make sure the final pipeline does.
2. **Type escapes** — `packages/core/src/rules/ED001.ts:5` (`as any`), `:6` inline-typed callback, `ED010.ts:8` (`as never`). Remove along with fixes above.
3. **Doc sync** — no `docs/functional/rules/ED010.md` or `docs/rules.md` entry for ED010; if kept, they are required.

### NIT
1. `packages/core/src/parse/keys.ts:9` single 130-char line; run `npm run format` (not run by pre-flight).

## 4. Checked and passed
- `npm test` (96 passed) and `npm run typecheck` per pre-flight. Note: passing tests mask the ED009 inversion.
- Catalogue IDs vs pattern tests agree (24/24).
- ED009 tests: all three titled per convention.

## 5. Uncertainties
- No pre-flight SKIPs.
- `npm run lint` and `format:check` were not run by pre-flight; I cannot state they pass. Core purity ESLint rules apparently did not block `node:fs`, unverified.
- Scope is inferred (no task ID); the intended milestone for rules/index.ts is unknown, so the missing ED002-ED008 are not listed as defects.
- `types.ts` was read only by grep (Rule, RuleId, ScanModel.example); full contract (I1-I7) not re-verified.
