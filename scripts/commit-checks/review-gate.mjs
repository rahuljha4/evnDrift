// Review gate (docs/conventions/commits.md §1.4).
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fail } from './report.mjs';

export const GATED_TYPES = ['feat', 'fix', 'refactor'];

/** @param {string} text @returns {{ hash: string|null, blockers: number, highs: number }} */
export function parseReport(text) {
  const hash =
    /^\s*(?:[-*]\s*)?Staged-diff-sha256:\s*`?([0-9a-f]{64}|none)`?\s*$/im.exec(text)?.[1] ?? null;
  const count = (tier) => {
    const m = new RegExp(
      `^###\\s+${tier}\\b[^\\n]*\\n([\\s\\S]*?)(?=^###\\s|^##\\s|(?![\\s\\S]))`,
      'm',
    ).exec(text);
    if (!m) return 0;
    return (m[1].match(/^\s*\d+\.\s+\S/gm) ?? []).length;
  };
  return { hash, blockers: count('BLOCKER'), highs: count('HIGH') };
}

/** @param {string} root @returns {{file:string,text:string}[]} */
export function loadReports(root) {
  const dir = join(root, 'docs', 'reviews');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => ({ file: `docs/reviews/${f}`, text: readFileSync(join(dir, f), 'utf8') }));
}

/** @param {string} type @param {string} hash @param {{file:string,text:string}[]} reports */
export function checkReviewGate(type, hash, reports) {
  if (!GATED_TYPES.includes(type)) return [];
  const example =
    'Run the envdrift-code-review skill on the staged changes (it writes docs/reviews/<date>-staged.md with Staged-diff-sha256).';
  if (hash === 'none')
    return [
      fail(
        'REV-1',
        `a ${type} commit needs a staged change to review`,
        undefined,
        'Stage the files for this task first.',
      ),
    ];
  const matching = reports
    .map((r) => ({ ...r, ...parseReport(r.text) }))
    .filter((r) => r.hash === hash);
  if (!matching.length) {
    const stale = reports
      .map((r) => ({ file: r.file, ...parseReport(r.text) }))
      .filter((r) => r.hash && r.hash !== 'none');
    return [
      fail(
        'REV-1',
        `no review report matches the staged diff (${hash.slice(0, 12)}…)${stale.length ? '; reports on other diffs are stale' : ''}`,
        stale.length ? stale[stale.length - 1].file : 'docs/reviews/',
        example,
      ),
    ];
  }
  const clean = matching.filter((r) => r.blockers === 0 && r.highs === 0);
  if (clean.length) return [];
  const worst = matching[matching.length - 1];
  return [
    fail(
      'REV-2',
      `the matching review has ${worst.blockers} BLOCKER and ${worst.highs} HIGH finding(s)`,
      worst.file,
      'Fix the findings (or record why in a new review), restage, and re-run the review.',
    ),
  ];
}
