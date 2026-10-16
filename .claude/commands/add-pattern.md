---
description: Add an extraction pattern — catalogue row + failing test first, then implementation
argument-hint: <ID e.g. P14> <description>
---

Add extraction pattern: **$ARGUMENTS**

## Read first
- `docs/patterns-catalogue.md`: the conventions section and the rows near the new ID (`node scripts/doc-lookup.mjs pattern P07` prints one row), the output notation `R(...)`, `D(...)` and `∅`.
- `node scripts/doc-lookup.mjs prd 10.1`, `prd D4` (no alias following) and `prd D7` (accessors). Do not read `docs/prd.md` whole.
- `packages/core/src/extract/js.ts` and `packages/core/test/extract/js.test.ts`.

## Do (in this order, one commit)
1. Add the catalogue row: ID, pattern, example code, exact expected output, and status `draft`. If the ID prefix is wrong for the behaviour (P = reference, F = fallback, D = dynamic, N = negative, A = accessor), stop and say so.
2. Add a test named `'<ID>: <short description>'` asserting the exact `Reference[]` / `DynamicAccess[]`, including line and column. Add a near-miss negative if the pattern could over-match.
3. Run `node scripts/quiet/test.mjs --no-cache` and confirm it **fails**.
4. Implement it in `extract/js.ts` with the smallest change. Do not follow data flow or guess (D4).
5. Run `node scripts/quiet/test.mjs`, `node scripts/quiet/typecheck.mjs` and `npm run lint`. All existing pattern tests must still pass.
6. Set the row status to `done`.

## Done when
- The catalogue row, test and implementation all exist and agree.
- No other pattern's expected output changed. If one did, stop and ask.
