---
description: Implement one EnvDrift rule (EDxxx) from PRD §11 with 3 tests and explain text
argument-hint: <ruleId e.g. ED001>
---

Implement rule **$ARGUMENTS**.

## Read first
1. `docs/prd.md` §11: the row for $ARGUMENTS. This is authoritative.
2. `docs/functional/rules/$ARGUMENTS.md`: the full spec, examples and required test names.
3. `docs/functional/severity-resolution.md` and `docs/functional/suppression.md`.
4. `docs/architecture/data-model.md`: Finding shape, fingerprint, sort order.
5. Existing rules in `packages/core/src/rules/` and `rules/index.ts`. Follow their style.

If the PRD row and the functional spec disagree, **stop and ask**. Do not pick one.

## Do (tests first)
1. Create `packages/core/test/rules/$ARGUMENTS.test.ts` with at least these three tests, plus any edge cases listed in the spec:
   - `$ARGUMENTS positive: …`: builds an in-memory `ScanModel` and asserts the exact findings (ruleId, severity, name, locations, environments, message, fix).
   - `$ARGUMENTS negative: …`: a near-miss that must produce no finding.
   - `$ARGUMENTS suppression: …`: the same input as positive with an `envdrift-ignore` comment, or the name in `ignore`, gives no finding.
2. Run the tests and confirm they fail.
3. Create `packages/core/src/rules/$ARGUMENTS.ts`, a pure `Rule`. No I/O, no values, deterministic output.
4. Register it in `packages/core/src/rules/index.ts` with its default severity.
5. Check that the `## $ARGUMENTS` section in `docs/rules.md` matches the implemented behaviour. Update it if wording drifted.
6. Run `npm test && npm run typecheck && npm run lint`.

## Done when
- The 3+ tests pass, and coverage of the new rule file is 100 % lines.
- No `value` property, no `fs` and no `process.env` in the rule.
- `docs/rules.md` and `docs/functional/rules/$ARGUMENTS.md` agree with the code.
- Report: the files touched, the test names, and anything left as an open question.
