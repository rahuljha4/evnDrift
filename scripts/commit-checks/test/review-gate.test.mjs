import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stagedDiffHash } from '../diff-hash.mjs';
import { checkReviewGate, parseReport } from '../review-gate.mjs';

const H = 'a'.repeat(64);
const report = (hash, blockers = [], highs = []) => ({
  file: 'docs/reviews/x.md',
  text: `# Review\n\nStaged-diff-sha256: ${hash}\n\n## 3. Findings\n### BLOCKER\n${blockers.map((b, i) => `${i + 1}. **${b}** — \`a.ts:1\``).join('\n') || 'none'}\n### HIGH\n${highs.map((b, i) => `${i + 1}. **${b}** — \`a.ts:2\``).join('\n') || 'none'}\n### MEDIUM\n1. **style** — \`a.ts:3\`\n`,
});
const rules = (type, hash, reports) => checkReviewGate(type, hash, reports).map((f) => f.rule);

describe('parseReport', () => {
  it('reads the hash and counts BLOCKER and HIGH items but not MEDIUM', () => {
    expect(parseReport(report(H, ['a', 'b'], ['c']).text)).toEqual({
      hash: H,
      blockers: 2,
      highs: 1,
    });
    expect(parseReport(report(H).text)).toEqual({ hash: H, blockers: 0, highs: 0 });
    expect(parseReport('no hash here').hash).toBeNull();
  });
});

describe('checkReviewGate', () => {
  it('passes for commit types that are not gated', () => {
    expect(rules('docs', H, [])).toEqual([]);
    expect(rules('chore', H, [])).toEqual([]);
  });
  it('REV-1 fails for feat, fix and refactor without a matching report', () => {
    for (const t of ['feat', 'fix', 'refactor']) expect(rules(t, H, [])).toEqual(['REV-1']);
  });
  it('REV-1 fails when the report is for an older diff (hash mismatch)', () => {
    expect(rules('feat', H, [report('b'.repeat(64))])).toEqual(['REV-1']);
  });
  it('REV-1 fails when nothing is staged', () => {
    expect(rules('feat', 'none', [report(H)])).toEqual(['REV-1']);
  });
  it('REV-2 fails when the matching report has BLOCKER or HIGH findings', () => {
    expect(rules('fix', H, [report(H, ['leak'])])).toEqual(['REV-2']);
    expect(rules('fix', H, [report(H, [], ['weak test'])])).toEqual(['REV-2']);
  });
  it('passes with a matching clean report', () => {
    expect(rules('feat', H, [report(H)])).toEqual([]);
  });
});

describe('stagedDiffHash (real git repository)', () => {
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  const repo = () => {
    const d = mkdtempSync(join(tmpdir(), 'commit-checks-'));
    git(d, 'init', '-q');
    git(d, 'config', 'user.email', 't@t');
    git(d, 'config', 'user.name', 't');
    writeFileSync(join(d, 'a.txt'), 'one\n');
    git(d, 'add', 'a.txt');
    git(d, 'commit', '-q', '-m', 'base');
    return d;
  };
  it('is "none" when nothing is staged', () => {
    expect(stagedDiffHash(repo())).toBe('none');
  });
  it('changes when the staged diff changes and is stable otherwise', () => {
    const d = repo();
    writeFileSync(join(d, 'a.txt'), 'two\n');
    git(d, 'add', 'a.txt');
    const h1 = stagedDiffHash(d);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(stagedDiffHash(d)).toBe(h1);
    writeFileSync(join(d, 'a.txt'), 'three\n');
    git(d, 'add', 'a.txt');
    expect(stagedDiffHash(d)).not.toBe(h1);
  });
  it('ignores staged files under docs/reviews', () => {
    const d = repo();
    writeFileSync(join(d, 'a.txt'), 'two\n');
    git(d, 'add', 'a.txt');
    const before = stagedDiffHash(d);
    mkdirSync(join(d, 'docs/reviews'), { recursive: true });
    writeFileSync(join(d, 'docs/reviews/r.md'), `Staged-diff-sha256: ${before}\n`);
    git(d, 'add', 'docs/reviews/r.md');
    expect(stagedDiffHash(d)).toBe(before);
  });
});
