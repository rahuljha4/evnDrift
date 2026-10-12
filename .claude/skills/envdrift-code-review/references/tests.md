# Test quality checklist

Sources: PRD §18; `docs/system/testing-qa.md`; CLAUDE.md hard rules 3 and 4. A rule with fewer than three tests breaks hard rule 3 (**BLOCKER**). Weak tests that would let a defect through are **HIGH**.

## Coverage of the contract
- [ ] Every rule `EDxxx` has at least three tests titled `EDxxx positive`, `EDxxx negative`, `EDxxx suppression` (pre-flight `RULE_TESTS` checks the titles exist; you check they test what they say).
- [ ] Every catalogue row has a test titled `<ID>: …`, and every `<ID>:` test has a row (pre-flight `PATTERN_IDS`). A new extractor behaviour without a row and test breaks hard rule 4.
- [ ] Parsers have a property test: never throws, and no output contains a generated value. Redaction tests plant fake values and assert they appear nowhere in `JSON.stringify(result)`.
- [ ] Test names never contain a config value.

## Assertion strength (hard rule: exact, not "something")
- [ ] Assertions are exact: `toEqual` on the full `Reference[]`/`Finding[]` including line, column, severity, locations, environments. Flag `toBeTruthy`, `toBeDefined`, `not.toBeNull`, `.length > 0`, `toHaveLength` alone, and snapshot-only tests with no reasoning.
- [ ] Mutation check by reading: for each test ask "would this still pass if the implementation were deleted, returned `[]`, or the condition inverted?" If yes, it is a finding. Rules must be tested both ways (fires / does not fire).
- [ ] The negative case is a genuine near-miss (the input differs from the positive by exactly the thing the rule keys on), not an unrelated empty input.
- [ ] Suppression tests show a finding that would fire is removed by the directive, and that a non-matching directive does not remove it.
- [ ] Order-sensitive output has an order assertion (`toEqual` on arrays, not `arrayContaining`).
- [ ] Expected positions are exact and were not copied from the implementation's output without checking the source text.

## Hygiene
- [ ] Golden fixtures (`fixtures/<name>/expected.json`) are updated in the same diff when output changes; `durationMs` is masked.
- [ ] No `.only`, `.skip`, `.todo` left in; no timing-based assertions that flake on CI.
- [ ] Tests live at `packages/<pkg>/test/**` mirroring `src/`, and fixtures contain only fake values.
- [ ] Coverage thresholds hold (core lines ≥ 90 %); a new branch is not left uncovered by an unreachable `catch` unless justified.
