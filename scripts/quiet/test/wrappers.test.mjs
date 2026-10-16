// The wrappers run against a throwaway git repo whose "vitest", "tsc" and "stryker" are tiny
// fake scripts, so no real test run is nested inside this one.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runMutation } from '../mutation.mjs';
import { runTests } from '../test.mjs';
import { runTypecheck } from '../typecheck.mjs';

const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' });
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'envdrift-quiet-test-'));
  g(dir, 'init', '-q');
  writeFileSync(join(dir, '.gitignore'), '.cache/\nnode_modules/\ncalls.log\n');
  g(dir, 'add', '.gitignore');
  return dir;
}
function put(dir, rel, body) {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
}
// Fake vitest: appends to calls.log, writes the JSON report named by --outputFile.
const fakeVitest = (report) => `
import { appendFileSync, writeFileSync } from 'node:fs';
appendFileSync('calls.log', 'run\\n');
const out = process.argv.find((a) => a.startsWith('--outputFile=')).slice(13);
writeFileSync(out, ${JSON.stringify(JSON.stringify(report))});
process.exit(${report.numFailedTests ? 1 : 0});
`;
const calls = (dir) =>
  existsSync(join(dir, 'calls.log'))
    ? readFileSync(join(dir, 'calls.log'), 'utf8').trim().split('\n').length
    : 0;

describe('runTests', () => {
  it('prints one line on pass and reuses the result for an unchanged tree', () => {
    const dir = repo();
    put(
      dir,
      'node_modules/vitest/vitest.mjs',
      fakeVitest({ numPassedTests: 7, numFailedTests: 0, numTotalTests: 7, testResults: [] }),
    );
    const first = runTests({ root: dir });
    expect(first).toMatchObject({ ok: true, cached: false });
    expect(first.text).toMatch(/^tests: 7 passed in \d+\.\ds$/);
    const second = runTests({ root: dir });
    expect(second.cached).toBe(true);
    expect(second.text).toMatch(/^tests: 7 passed in \d+\.\ds \(cached\)$/);
    expect(calls(dir)).toBe(1);
  });

  it('runs again after the tree changes and when --no-cache is asked for', () => {
    const dir = repo();
    put(
      dir,
      'node_modules/vitest/vitest.mjs',
      fakeVitest({ numPassedTests: 1, numFailedTests: 0, numTotalTests: 1, testResults: [] }),
    );
    runTests({ root: dir });
    put(dir, 'src.txt', 'changed');
    expect(runTests({ root: dir }).cached).toBe(false);
    expect(runTests({ root: dir, useCache: false }).cached).toBe(false);
    expect(calls(dir)).toBe(3);
  });

  it('prints the failing test on failure', () => {
    const dir = repo();
    put(
      dir,
      'node_modules/vitest/vitest.mjs',
      fakeVitest({
        numPassedTests: 0,
        numFailedTests: 1,
        numTotalTests: 1,
        testResults: [
          {
            name: join(dir, 'a.test.ts'),
            assertionResults: [
              { fullName: 'it breaks', status: 'failed', failureMessages: ['Error: boom'] },
            ],
          },
        ],
      }),
    );
    const r = runTests({ root: dir });
    expect(r.ok).toBe(false);
    expect(r.text).toContain('FAIL it breaks (a.test.ts)');
  });

  it('says so when vitest is not installed', () => {
    const r = runTests({ root: repo() });
    expect(r.ok).toBe(false);
    expect(r.text).toContain('vitest is not installed');
  });
});

describe('runTypecheck', () => {
  it('prints one line on pass and caches it', () => {
    const dir = repo();
    put(dir, 'node_modules/typescript/bin/tsc', 'process.exit(0);');
    expect(runTypecheck({ root: dir }).text).toMatch(/^typecheck: ok in \d+\.\ds$/);
    expect(runTypecheck({ root: dir }).text).toMatch(/\(cached\)$/);
  });
  it('prints only the errors on failure', () => {
    const dir = repo();
    put(
      dir,
      'node_modules/typescript/bin/tsc',
      "console.log('a.ts(1,1): error TS2304: Cannot find name x.'); process.exit(2);",
    );
    const r = runTypecheck({ root: dir });
    expect(r.ok).toBe(false);
    expect(r.text.split('\n')[1]).toBe('a.ts(1,1): error TS2304: Cannot find name x.');
  });
});

describe('runMutation', () => {
  it('skips and says so when Stryker is not installed', () => {
    expect(runMutation({ files: ['a.ts'], root: repo() })).toEqual({
      ok: true,
      text: 'mutation: skipped (stryker not installed)',
    });
  });
  it('asks for files', () => {
    expect(runMutation({ files: [], root: repo() }).ok).toBe(false);
  });
  it('skips with a time-limit message instead of a score when Stryker is too slow', () => {
    const dir = repo();
    put(dir, 'node_modules/@stryker-mutator/core/bin/stryker.js', 'setTimeout(() => {}, 60000);');
    const r = runMutation({ files: ['a.ts'], root: dir, timeoutMs: 300 });
    expect(r.text).toBe('mutation: skipped (time limit)');
    expect(r.score).toBeUndefined();
  });
  it('prints the measured score from the report Stryker wrote', () => {
    const dir = repo();
    const report = {
      files: {
        'a.ts': {
          mutants: [
            { status: 'Killed', mutatorName: 'X', location: { start: { line: 1 } } },
            {
              status: 'Survived',
              mutatorName: 'Y',
              replacement: 'false',
              location: { start: { line: 2 } },
            },
          ],
        },
      },
    };
    put(
      dir,
      'node_modules/@stryker-mutator/core/bin/stryker.js',
      `
import { writeFileSync } from 'node:fs';
const out = process.argv[process.argv.indexOf('--jsonReporter.fileName') + 1];
writeFileSync(out, ${JSON.stringify(JSON.stringify(report))});`,
    );
    const r = runMutation({ files: ['a.ts'], root: dir });
    expect(r.text.split('\n')[0]).toBe(
      'mutation: 50.0% (1 killed, 1 survived, 0 no coverage) of 2',
    );
    expect(r.text).toContain('a.ts:2 — Y → false');
  });
  it('prints no score when Stryker leaves no report', () => {
    const dir = repo();
    put(dir, 'node_modules/@stryker-mutator/core/bin/stryker.js', "console.error('config error');");
    const r = runMutation({ files: ['a.ts'], root: dir });
    expect(r.ok).toBe(false);
    expect(r.text).toBe('mutation: stryker produced no report: config error');
  });
});
