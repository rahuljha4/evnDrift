import { describe, expect, it } from 'vitest';
import { findUnsortedAggregator, findWeakAssertions } from '../static-checks.mjs';

describe('findWeakAssertions', () => {
  it.each([
    'expect(findings.length).toBeTruthy();',
    'expect(x).toBeDefined();',
    'expect(r).not.toBeNull();',
    'expect(r).not.toBeUndefined();',
    'expect(findings.length).toBeGreaterThan(0);',
    'expect(ok).toBeFalsy();',
  ])('flags %s', (line) => {
    expect(findWeakAssertions(`it('x', () => {\n  ${line}\n});`)).toEqual([
      { line: 2, text: line },
    ]);
  });
  it('accepts exact assertions', () => {
    const text =
      "expect(ED009(model)).toEqual([{ ruleId: 'ED009' }]);\nexpect(r).toHaveLength(0);\nexpect(a).toBe(true);";
    expect(findWeakAssertions(text)).toEqual([]);
  });
  it('ignores a commented-out weak assertion', () => {
    expect(findWeakAssertions('// expect(x).toBeTruthy();')).toEqual([]);
  });
});

describe('findUnsortedAggregator', () => {
  it('flags runRules with no sort in the file', () => {
    const text =
      'export const rules = [];\nexport function runRules(model) {\n  return rules.flatMap((r) => r(model));\n}';
    expect(findUnsortedAggregator(text)).toEqual({ line: 2, name: 'runRules' });
  });
  it('accepts a file that sorts', () => {
    const text =
      'export function runRules(m) {\n  return rules.flatMap((r) => r(m)).sort(compareFindings);\n}';
    expect(findUnsortedAggregator(text)).toBeNull();
  });
  it('accepts a file that calls a sort helper', () => {
    expect(
      findUnsortedAggregator('export function finalize(f) { return sortFindings(f); }'),
    ).toBeNull();
  });
  it('ignores files that do not export an aggregator', () => {
    expect(findUnsortedAggregator('export function helper() { return []; }')).toBeNull();
  });
});
