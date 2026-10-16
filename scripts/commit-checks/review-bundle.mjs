#!/usr/bin/env node
// Input bundle and review cache for the envdrift-reviewer agent (and /review).
//   node scripts/commit-checks/review-bundle.mjs bundle [--base <ref>]   print the bundle
//   node scripts/commit-checks/review-bundle.mjs cached                  print the cached review, exit 1 on a miss
//   node scripts/commit-checks/review-bundle.mjs record <report.md>      cache a finished staged review
// The bundle is what the reviewer reads instead of exploring: the stat, the diff of source and
// test files with 3 lines of context, and the names (only) of everything left out.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readCache, writeCache } from './cache.mjs';
import { stagedDiffHash } from './diff-hash.mjs';
import { git, repoRoot } from './git.mjs';
import { parseReport, tierCounts } from './review-gate.mjs';

const LOCKFILES = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|npm-shrinkwrap\.json)$/;
const GENERATED =
  /(^|\/)(dist|coverage|reports|\.stryker-tmp|node_modules)\/|\.min\.js$|\.generated\.|\.d\.ts$/;
const CODE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;

/**
 * Where a changed path goes in the bundle.
 * @param {string} path posix path
 * @returns {{ include: true } | { include: false, why: string }}
 */
export function classify(path) {
  if (LOCKFILES.test(path)) return { include: false, why: 'lockfile' };
  if (/\.snap$/.test(path) || /(^|\/)__snapshots__\//.test(path))
    return { include: false, why: 'snapshot' };
  if (/^fixtures\/.*\/expected\.json$/.test(path))
    return { include: false, why: 'golden expected.json' };
  if (path.startsWith('docs/reviews/')) return { include: false, why: 'review report' };
  if (GENERATED.test(path)) return { include: false, why: 'generated' };
  if (CODE.test(path) || /(^|\/)package\.json$/.test(path)) return { include: true };
  return { include: false, why: 'not source or test (open on demand)' };
}

/**
 * @param {{ stat: string, diffFor: (paths: string[]) => string, paths: string[] }} input
 */
export function buildBundle({ stat, diffFor, paths }) {
  const included = [];
  const named = [];
  for (const p of paths) {
    const c = classify(p);
    if (c.include) included.push(p);
    else named.push(`${p} (${c.why})`);
  }
  const out = [
    '== stat ==',
    stat.trim() || '(empty)',
    '',
    '== diff: source and test files, 3 lines of context ==',
  ];
  out.push(included.length ? diffFor(included).trimEnd() : '(no source or test files changed)');
  out.push('', '== changed, not shown (names only) ==', ...(named.length ? named : ['(none)']));
  return out.join('\n');
}

/** @param {string} text a review report */
export function summarizeReport(text) {
  const verdict =
    /Verdict:\s*(APPROVE WITH FIXES|APPROVE|CHANGES REQUIRED)/i.exec(text)?.[1]?.toUpperCase() ??
    null;
  const { unreadable, ...counts } = tierCounts(text);
  return { verdict, hash: parseReport(text).hash, counts, unreadable };
}

const lines = (s) => s.split('\n').filter(Boolean);

function bundleCommand(root, base) {
  const range = base ? [base] : ['--cached'];
  const paths = lines(git(['diff', ...range, '--name-only', '--no-renames'], { cwd: root }));
  return buildBundle({
    stat: git(['diff', ...range, '--stat'], { cwd: root }),
    diffFor: (ps) =>
      git(['diff', ...range, '--no-color', '--no-ext-diff', '-U3', '--', ...ps], { cwd: root }),
    paths,
  });
}

/** Ten lines at most: what the main session needs back. */
export function formatSummary({ verdict, counts, report, hash }) {
  return [
    `verdict: ${verdict}`,
    `BLOCKER ${counts.blockers}, HIGH ${counts.highs}, MEDIUM ${counts.mediums}, NIT ${counts.nits}`,
    `report: ${report}`,
    `Staged-diff-sha256: ${hash}`,
  ].join('\n');
}

export function recordReview(root, reportPath) {
  const full = join(root, reportPath);
  if (!existsSync(full)) return { code: 1, out: `review-bundle: no such report: ${reportPath}` };
  const s = summarizeReport(readFileSync(full, 'utf8'));
  const current = stagedDiffHash(root);
  if (!s.verdict) return { code: 1, out: 'review-bundle: report has no Verdict line' };
  if (s.unreadable)
    return {
      code: 1,
      out: 'review-bundle: report has no BLOCKER/HIGH/MEDIUM/NIT headings (use `### BLOCKER` etc.); not cached',
    };
  if (s.hash !== current)
    return {
      code: 1,
      out: `review-bundle: report hash ${s.hash} does not match the staged diff ${current}; not cached`,
    };
  writeCache(root, 'review', { ...s, report: reportPath });
  return { code: 0, out: formatSummary({ ...s, report: reportPath }) };
}

export function cachedReview(root) {
  const hit = readCache(root, 'review');
  if (!hit || !existsSync(join(root, hit.report)))
    return { code: 1, out: 'review-bundle: no cached review for this tree' };
  return { code: 0, out: `${formatSummary(hit)}\n(cached)` };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd, arg, arg2] = process.argv.slice(2);
  const root = repoRoot();
  let r;
  if (cmd === 'bundle')
    r = { code: 0, out: bundleCommand(root, arg === '--base' ? arg2 : undefined) };
  else if (cmd === 'cached') r = cachedReview(root);
  else if (cmd === 'record' && arg) r = recordReview(root, arg);
  else
    r = {
      code: 2,
      out: 'usage: review-bundle.mjs bundle [--base <ref>] | cached | record <report.md>',
    };
  (r.code === 0 ? console.log : console.error)(r.out);
  process.exit(r.code);
}
