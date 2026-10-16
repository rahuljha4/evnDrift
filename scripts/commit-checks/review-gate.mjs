// Review gate (docs/conventions/commits.md §1.4).
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fail } from './report.mjs';

export const GATED_TYPES = ['feat', 'fix', 'refactor'];

const NONE = /^(none|no (findings|issues|blockers)|n\/a|nothing)\b/i;
// A finding line, at the top level only (the indented Problem/Why/Fix sub-bullets of a finding are not findings): `1. **title**`, `1) title`, `- **title**`, `**B1. title**`, `**H2: title**`.
const ITEM = /^ {0,1}(?:\d+[.)]|[-*]|\*\*[A-Za-z]{0,2}\d+[.:)])\s*(.*\S)/;

/**
 * Number of findings under each tier heading of a report. Fails safe: a tier section with
 * content that is not "none" counts at least 1 even if no line looks like a finding, so a
 * report in an unexpected format can never read as clean.
 */
export function tierCounts(text) {
  let headings = 0;
  const count = (tier) => {
    const m = new RegExp(
      `^#{2,4}\\s+${tier}\\b[^\\n]*\\n([\\s\\S]*?)(?=^#{1,4}\\s|(?![\\s\\S]))`,
      'm',
    ).exec(text);
    if (!m) return 0;
    headings++;
    const lines = m[1].split('\n').filter((l) => l.trim());
    if (!lines.length) return 0;
    const items = lines.map((l) => ITEM.exec(l)).filter(Boolean);
    const real = items.filter((i) => !NONE.test(i[1].replace(/^\*+/, '')));
    if (real.length) return real.length;
    if (items.length) return 0; // only "- none" style lines
    return NONE.test(lines[0].trim().replace(/^\*+/, '')) && lines.length === 1 ? 0 : 1;
  };
  const counts = {
    blockers: count('BLOCKER'),
    highs: count('HIGH'),
    mediums: count('MEDIUM'),
    nits: count('NIT'),
  };
  return { ...counts, unreadable: headings === 0 };
}

/** @param {string} text @returns {{ hash: string|null, blockers: number, highs: number, unreadable: boolean }} */
export function parseReport(text) {
  const hash =
    /^\s*(?:[-*]\s*)?Staged-diff-sha256:\s*`?([0-9a-f]{64}|none)`?\s*$/im.exec(text)?.[1] ?? null;
  const { blockers, highs, unreadable } = tierCounts(text);
  // No tier headings at all: the findings cannot be read, so the report cannot read as clean.
  return { hash, blockers: unreadable ? Math.max(blockers, 1) : blockers, highs, unreadable };
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
