import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stagedDiffHash } from '../diff-hash.mjs';
import { checkReviewGate, parseReport, tierCounts } from '../review-gate.mjs';

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
      unreadable: false,
    });
    expect(parseReport(report(H).text)).toEqual({
      hash: H,
      blockers: 0,
      highs: 0,
      unreadable: false,
    });
    expect(parseReport('no hash here').hash).toBeNull();
  });
});

describe('tierCounts formats', () => {
  const tiers = (blocker, high = 'none') =>
    `### BLOCKER\n${blocker}\n### HIGH\n${high}\n### MEDIUM\nnone\n### NIT\nnone\n`;
  const count = (text) => tierCounts(text);
  it('counts numbered findings', () => {
    expect(count(tiers('1. **a** — `x:1`\n2. **b** — `x:2`')).blockers).toBe(2);
  });
  it('does not count the indented Problem / Why / Fix sub-bullets of a finding', () => {
    const body =
      '1. **leak** — `a.ts:1`\n   - Problem: x\n   - Why it matters: y\n   - Fix: z\n2. **fs** — `b.ts:2`\n   - Problem: x';
    expect(count(tiers(body)).blockers).toBe(2);
  });
  it('counts bold-ID findings like **B1. title**', () => {
    const t = tiers('**B1. Leak** - a.ts:3. Why.\n\n**B2. fs** - b.ts:1. Why.');
    expect(count(t).blockers).toBe(2);
  });
  it('counts bullet findings', () => {
    expect(count(tiers('- **a** — `x:1`\n- **b** — `x:2`')).blockers).toBe(2);
  });
  it.each(['none', 'None.', '- none', 'No findings.', 'n/a', ''])('reads %j as zero', (body) => {
    expect(count(tiers(body)).blockers).toBe(0);
  });
  it('counts an unrecognised non-empty section as at least one, never zero', () => {
    expect(count(tiers('The parser leaks values, see keys.ts line 3.')).blockers).toBe(1);
  });
  it('does not let a finding in one tier count in another', () => {
    const c = count(tiers('none', '1. **h** — `x:1`'));
    expect([c.blockers, c.highs]).toEqual([0, 1]);
  });
  it.each(['##', '###', '####'])('reads tier headings written with %s', (h) => {
    const t = `${h} BLOCKER\n1. **a** — \`x:1\`\n${h} HIGH\nnone\n`;
    expect(count(t)).toMatchObject({ blockers: 1, highs: 0, unreadable: false });
  });
  it('marks a report with no tier headings as unreadable and gives it a blocker', () => {
    const text = `Staged-diff-sha256: ${H}\nVerdict: APPROVE\nAll good.`;
    expect(count(text).unreadable).toBe(true);
    expect(parseReport(text).blockers).toBe(1);
    expect(rules('feat', H, [{ file: 'docs/reviews/x.md', text }])).toContain('REV-2');
  });
  it('blocks the commit gate for a report that uses the bold-ID format', () => {
    const report = {
      file: 'docs/reviews/x.md',
      text: `Staged-diff-sha256: ${H}\n${tiers('**B1. Leak** - a.ts:3. Why.')}`,
    };
    expect(rules('feat', H, [report])).toContain('REV-2');
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
