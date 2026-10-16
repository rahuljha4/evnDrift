import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stagedDiffHash } from '../diff-hash.mjs';
import {
  buildBundle,
  cachedReview,
  classify,
  recordReview,
  summarizeReport,
} from '../review-bundle.mjs';

const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' });
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'envdrift-bundle-'));
  g(dir, 'init', '-q');
  g(dir, 'config', 'user.email', 't@example.com');
  g(dir, 'config', 'user.name', 't');
  put(dir, 'README.md', 'x');
  g(dir, 'add', '.');
  g(dir, 'commit', '-qm', 'init');
  return dir;
}
function put(dir, rel, body) {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
}
const report = (hash, extra = '') =>
  `# Review: x\n- Staged-diff-sha256: ${hash}\n- Verdict: APPROVE WITH FIXES\n## 3. Findings\n### BLOCKER\nnone\n### HIGH\n1. **gap** — \`a.ts:1\`\n### MEDIUM\n1. **m** — \`a.ts:2\`\n2. **n** — \`a.ts:3\`\n### NIT\nnone\n${extra}`;

describe('classify', () => {
  it.each([
    ['packages/core/src/rules/ED001.ts', true],
    ['packages/core/test/rules/ED001.test.ts', true],
    ['scripts/commit-checks/cache.mjs', true],
    ['packages/core/package.json', true],
  ])('includes %s', (path, include) => {
    expect(classify(path).include).toBe(include);
  });
  it.each([
    ['package-lock.json', 'lockfile'],
    ['packages/core/test/__snapshots__/a.snap', 'snapshot'],
    ['fixtures/demo-app/expected.json', 'golden expected.json'],
    ['docs/reviews/2026-10-13-x.md', 'review report'],
    ['packages/cli/dist/bin.js', 'generated'],
    ['packages/core/src/x.d.ts', 'generated'],
  ])('lists %s by name only (%s)', (path, why) => {
    expect(classify(path)).toEqual({ include: false, why });
  });
  it('leaves docs and config out of the diff but names them', () => {
    expect(classify('docs/rules.md').include).toBe(false);
  });
});

describe('buildBundle', () => {
  it('puts source and test diffs in the bundle and only the names of the rest', () => {
    const asked = [];
    const out = buildBundle({
      stat: ' 3 files changed',
      paths: ['packages/core/src/a.ts', 'package-lock.json', 'docs/rules.md'],
      diffFor: (ps) => {
        asked.push(ps);
        return 'DIFF OF SOURCE';
      },
    });
    expect(asked).toEqual([['packages/core/src/a.ts']]);
    expect(out).toContain('DIFF OF SOURCE');
    expect(out).toContain('package-lock.json (lockfile)');
    expect(out).toContain('docs/rules.md (not source or test (open on demand))');
  });
  it('does not ask for a diff when nothing relevant changed', () => {
    const out = buildBundle({
      stat: '',
      paths: ['package-lock.json'],
      diffFor: () => {
        throw new Error('should not be called');
      },
    });
    expect(out).toContain('(no source or test files changed)');
  });
});

describe('summarizeReport', () => {
  it('reads verdict, hash and counts per tier', () => {
    expect(summarizeReport(report('a'.repeat(64)))).toEqual({
      verdict: 'APPROVE WITH FIXES',
      hash: 'a'.repeat(64),
      counts: { blockers: 0, highs: 1, mediums: 2, nits: 0 },
      unreadable: false,
    });
  });
  it('returns a null verdict when the report has none', () => {
    expect(summarizeReport('# nothing').verdict).toBeNull();
  });
});

describe('recordReview / cachedReview', () => {
  it('caches a review whose hash matches the staged diff and serves it for the same tree', () => {
    const dir = repo();
    put(dir, 'a.ts', 'export const a = 1;\n');
    g(dir, 'add', 'a.ts');
    put(dir, 'docs/reviews/r.md', report(stagedDiffHash(dir)));
    const rec = recordReview(dir, 'docs/reviews/r.md');
    expect(rec.code).toBe(0);
    expect(rec.out).toContain('verdict: APPROVE WITH FIXES');
    const hit = cachedReview(dir);
    expect(hit.code).toBe(0);
    expect(hit.out).toContain('BLOCKER 0, HIGH 1, MEDIUM 2, NIT 0');
    expect(hit.out.split('\n').length).toBeLessThanOrEqual(10);
  });
  it('refuses to cache a report written for another diff', () => {
    const dir = repo();
    put(dir, 'a.ts', 'export const a = 1;\n');
    g(dir, 'add', 'a.ts');
    put(dir, 'docs/reviews/r.md', report('b'.repeat(64)));
    expect(recordReview(dir, 'docs/reviews/r.md').code).toBe(1);
    expect(cachedReview(dir).code).toBe(1);
  });
  it('misses once the staged content changes', () => {
    const dir = repo();
    put(dir, 'a.ts', 'export const a = 1;\n');
    g(dir, 'add', 'a.ts');
    put(dir, 'docs/reviews/r.md', report(stagedDiffHash(dir)));
    recordReview(dir, 'docs/reviews/r.md');
    put(dir, 'a.ts', 'export const a = 2;\n');
    g(dir, 'add', 'a.ts');
    expect(cachedReview(dir).code).toBe(1);
  });
  it('still hits after the report itself is staged', () => {
    const dir = repo();
    put(dir, 'a.ts', 'export const a = 1;\n');
    g(dir, 'add', 'a.ts');
    put(dir, 'docs/reviews/r.md', report(stagedDiffHash(dir)));
    recordReview(dir, 'docs/reviews/r.md');
    g(dir, 'add', 'docs/reviews/r.md');
    expect(cachedReview(dir).code).toBe(0);
  });
  it('refuses to cache a report whose tier headings cannot be read', () => {
    const dir = repo();
    put(dir, 'a.ts', 'export const a = 1;\n');
    g(dir, 'add', 'a.ts');
    put(
      dir,
      'docs/reviews/r.md',
      `Staged-diff-sha256: ${stagedDiffHash(dir)}\nVerdict: APPROVE\nfine`,
    );
    const r = recordReview(dir, 'docs/reviews/r.md');
    expect(r.code).toBe(1);
    expect(r.out).toContain('no BLOCKER/HIGH/MEDIUM/NIT headings');
  });
  it('rejects a report with no verdict', () => {
    const dir = repo();
    put(dir, 'docs/reviews/r.md', '# nothing');
    expect(recordReview(dir, 'docs/reviews/r.md').code).toBe(1);
  });
});
