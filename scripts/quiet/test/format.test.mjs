import { describe, expect, it } from 'vitest';
import {
  capLines,
  firstFrame,
  formatMutation,
  formatTestResult,
  formatTypecheck,
  markCached,
} from '../format.mjs';

const ROOT = '/repo';

describe('capLines', () => {
  it('keeps short lists unchanged', () => {
    expect(capLines(['a', 'b'], 3)).toEqual(['a', 'b']);
  });
  it('cuts to max lines, the last one counting what was dropped', () => {
    const out = capLines(
      Array.from({ length: 50 }, (_, i) => `l${i}`),
      40,
    );
    expect(out).toHaveLength(40);
    expect(out[39]).toBe('... 11 more lines');
  });
});

describe('firstFrame', () => {
  it('returns the first frame outside node_modules, relative to the root', () => {
    const stack =
      'at /repo/node_modules/vitest/x.js:1:1\n at /repo/packages/core/test/a.test.ts:12:5';
    expect(firstFrame(stack, ROOT)).toBe('packages/core/test/a.test.ts:12');
  });
  it('returns null when there is no frame', () => {
    expect(firstFrame('AssertionError: nope', ROOT)).toBeNull();
  });
});

describe('formatTestResult', () => {
  const pass = { numPassedTests: 142, numFailedTests: 0, numTotalTests: 142, testResults: [] };
  it('prints one line on pass', () => {
    expect(formatTestResult(pass, { root: ROOT, ms: 3100 })).toEqual({
      ok: true,
      text: 'tests: 142 passed in 3.1s',
    });
  });
  it('mentions skipped tests only when there are some', () => {
    const r = formatTestResult({ ...pass, numPendingTests: 2 }, { root: ROOT, ms: 1000 });
    expect(r.text).toBe('tests: 142 passed, 2 skipped in 1.0s');
  });
  it('lists only the failing test, its assertion and file:line', () => {
    const json = {
      numPassedTests: 1,
      numFailedTests: 1,
      numTotalTests: 2,
      testResults: [
        {
          name: '/repo/packages/core/test/a.test.ts',
          status: 'failed',
          assertionResults: [
            { fullName: 'good', status: 'passed', failureMessages: [] },
            {
              fullName: 'ED002 positive: reports the read',
              status: 'failed',
              failureMessages: [
                'AssertionError: expected 1 to be 2\n    at /repo/packages/core/test/a.test.ts:20:7',
              ],
            },
          ],
        },
      ],
    };
    const r = formatTestResult(json, { root: ROOT, ms: 500 });
    expect(r.ok).toBe(false);
    expect(r.text.split('\n')).toEqual([
      'tests: FAILED 1 (1 passed, 2 total) in 0.5s',
      'FAIL ED002 positive: reports the read (packages/core/test/a.test.ts:20)',
      '  AssertionError: expected 1 to be 2',
    ]);
  });
  it('reports a suite that failed to load even with no failed assertion', () => {
    const json = {
      numPassedTests: 0,
      numFailedTests: 0,
      numTotalTests: 0,
      testResults: [
        {
          name: '/repo/x.test.ts',
          status: 'failed',
          message: 'Cannot find module',
          assertionResults: [],
        },
      ],
    };
    const r = formatTestResult(json, { root: ROOT, ms: 100 });
    expect(r.ok).toBe(false);
    expect(r.text).toContain('FAIL suite x.test.ts did not run');
    expect(r.text).toContain('Cannot find module');
  });
  it('never prints more than 40 lines', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      fullName: `t${i}`,
      status: 'failed',
      failureMessages: ['boom'],
    }));
    const json = {
      numPassedTests: 0,
      numFailedTests: 60,
      numTotalTests: 60,
      testResults: [{ name: '/repo/a.ts', assertionResults: many }],
    };
    expect(formatTestResult(json, { root: ROOT, ms: 1 }).text.split('\n')).toHaveLength(40);
  });
});

describe('formatTypecheck', () => {
  it('prints one line on pass', () => {
    expect(formatTypecheck('', { ok: true, ms: 2000 })).toEqual({
      ok: true,
      text: 'typecheck: ok in 2.0s',
    });
  });
  it('prints only the error lines on failure', () => {
    const out =
      "src/a.ts(3,5): error TS2322: Type 'string' is not assignable to type 'number'.\n  detail line\nFound 1 error.";
    const r = formatTypecheck(out, { ok: false, ms: 1000 });
    expect(r.ok).toBe(false);
    expect(r.text.split('\n')).toEqual([
      'typecheck: FAILED 1 error in 1.0s',
      "src/a.ts(3,5): error TS2322: Type 'string' is not assignable to type 'number'.",
    ]);
  });
  it('caps at 30 lines', () => {
    const out = Array.from({ length: 80 }, (_, i) => `a.ts(${i},1): error TS1: bad`).join('\n');
    expect(formatTypecheck(out, { ok: false, ms: 1 }).text.split('\n')).toHaveLength(30);
  });
  it('shows raw output when tsc fails without a diagnostic', () => {
    const r = formatTypecheck("error: Cannot read file 'tsconfig.json'", { ok: false, ms: 1 });
    expect(r.text).toContain("Cannot read file 'tsconfig.json'");
  });
});

describe('formatMutation', () => {
  const report = {
    files: {
      '/repo/packages/core/src/rules/ED002.ts': {
        mutants: [
          { status: 'Killed', mutatorName: 'EqualityOperator', location: { start: { line: 5 } } },
          { status: 'Killed', mutatorName: 'BooleanLiteral', location: { start: { line: 6 } } },
          { status: 'Timeout', mutatorName: 'BlockStatement', location: { start: { line: 7 } } },
          {
            status: 'Survived',
            mutatorName: 'ConditionalExpression',
            replacement: 'true',
            location: { start: { line: 9 } },
          },
          {
            status: 'NoCoverage',
            mutatorName: 'StringLiteral',
            replacement: '""',
            location: { start: { line: 3 } },
          },
        ],
      },
    },
  };
  it('computes the score from measured mutants and lists survivors as file:line — mutation — test needed', () => {
    const r = formatMutation(report, { root: ROOT });
    const lines = r.text.split('\n');
    expect(lines[0]).toBe('mutation: 60.0% (3 killed, 1 survived, 1 no coverage) of 5');
    expect(lines[1]).toBe(
      'packages/core/src/rules/ED002.ts:3 — StringLiteral → "" — test needed: no test reaches this line',
    );
    expect(lines[2]).toBe(
      'packages/core/src/rules/ED002.ts:9 — ConditionalExpression → true — test needed: assert the result that this change would alter',
    );
    expect(r.score).toBe(60);
  });
  it('prints no score when nothing was mutated', () => {
    const r = formatMutation({ files: {} });
    expect(r.text).toBe('mutation: no mutants generated for these files');
    expect(r.score).toBeUndefined();
  });
  it('caps output at 20 lines', () => {
    const mutants = Array.from({ length: 40 }, (_, i) => ({
      status: 'Survived',
      mutatorName: 'X',
      location: { start: { line: i + 1 } },
    }));
    const r = formatMutation({ files: { 'a.ts': { mutants } } });
    expect(r.text.split('\n')).toHaveLength(20);
  });
});

describe('markCached', () => {
  it('marks only the first line', () => {
    expect(markCached('tests: FAILED 1\nFAIL x')).toBe('tests: FAILED 1 (cached)\nFAIL x');
  });
});
