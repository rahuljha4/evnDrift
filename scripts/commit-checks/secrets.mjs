// Secret scan over ADDED lines of the staged diff (docs/conventions/commits.md §1.3).
import { fail } from './report.mjs';

const PREFIXES = [
  'sk_live_',
  'sk_test_',
  'ghp_',
  'github_pat_',
  'AKIA',
  'ASIA',
  'xoxb-',
  'xoxp-',
  'AIza',
  '-----BEGIN',
];
// The scanner defines the prefixes and tests them with fake keys, and the conventions list them.
const SELF = (path) =>
  path.startsWith('scripts/commit-checks/') || path === 'docs/conventions/commits.md';
const SKIP = (path) =>
  SELF(path) ||
  path === 'package-lock.json' ||
  path.endsWith('/package-lock.json') ||
  /(^|\/)fixtures\//.test(path);

/** Shannon entropy in bits per character. */
export function entropy(s) {
  const counts = new Map();
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/** @param {{ path: string, line: number, text: string }[]} added */
export function checkSecrets(added) {
  const failures = [];
  for (const { path, line, text } of added) {
    if (SKIP(path)) continue;
    const where = `${path}:${line}`;
    const prefix = PREFIXES.find((p) => text.includes(p));
    if (prefix) {
      failures.push(
        fail(
          'SECRET-1',
          `added line contains the secret prefix "${prefix}"`,
          where,
          'Remove the value, or move planted fake values into a fixtures/ directory.',
        ),
      );
      continue;
    }
    for (const token of text.match(/[A-Za-z0-9+_=-]{20,}/g) ?? []) {
      // Git object IDs and sha256 digests are not secrets; identifiers without digits are not either.
      if (/^[0-9a-f]{40}$|^[0-9a-f]{64}$/.test(token)) continue;
      if (!/[A-Za-z]/.test(token) || !/[0-9]/.test(token)) continue;
      if (entropy(token) >= 3.5) {
        failures.push(
          fail(
            'SECRET-2',
            `added line has a 20+ character high-entropy token (${token.length} chars, ${entropy(token).toFixed(2)} bits/char)`,
            where,
            'Remove the value; test data belongs under fixtures/.',
          ),
        );
        break;
      }
    }
  }
  return failures;
}
