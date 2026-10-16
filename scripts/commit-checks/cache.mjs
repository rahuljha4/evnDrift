// Result cache shared by the hooks, the CLI, the quiet wrappers, the skills and the agents.
// One JSON file per working state under .cache/commit-checks/ (gitignored).
//
// Key = sha256 of HEAD, the staged diff, the unstaged diff and the untracked files. Tests and
// typecheck run on the working tree, so a key built from the index alone (`git write-tree`)
// could reuse a result for code that has since changed. Any change to staged or working
// content changes the key; stale results are never reused.
//
// docs/reviews/ and .cache/ are left out on purpose: the review report and the cache are
// outputs of the checks, so writing them must not invalidate the results they describe. The
// review gate uses the same exclusion (see diff-hash.mjs).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { git } from './git.mjs';

export const CACHE_KINDS = ['tests', 'typecheck', 'checks', 'review', 'audit'];

const CACHE_DIR = '.cache/commit-checks';

const EXCLUDED = ['.cache/', 'docs/reviews/'];
const PATHSPEC = ['--', '.', ...EXCLUDED.map((p) => `:(exclude)${p.replace(/\/$/, '')}`)];

/** @param {string} root @returns {string | null} null when the key cannot be computed. */
export function cacheKey(root) {
  const opts = { cwd: root, allowFail: true };
  const head = git(['rev-parse', '--verify', '-q', 'HEAD'], opts)?.trim() ?? 'no-head';
  const staged = git(['diff', '--cached', '--no-color', '--no-ext-diff', ...PATHSPEC], opts);
  const unstaged = git(['diff', '--no-color', '--no-ext-diff', ...PATHSPEC], opts);
  const others = git(['ls-files', '--others', '--exclude-standard', '-z'], opts);
  if (staged === null || unstaged === null || others === null) return null;
  const h = createHash('sha256');
  h.update(`head:${head}\nstaged:${staged}\nunstaged:${unstaged}\n`);
  for (const path of others
    .split('\0')
    .filter((p) => p && !EXCLUDED.some((x) => p.startsWith(x)))
    .sort()) {
    const blob = git(['hash-object', '--', path], opts)?.trim();
    h.update(`untracked:${path}:${blob ?? 'unreadable'}\n`);
  }
  return h.digest('hex').slice(0, 40);
}

const fileFor = (root, key) => join(root, CACHE_DIR, `${key}.json`);

/** @param {string} root @param {string} kind @returns {any | null} */
export function readCache(root, kind, key = cacheKey(root)) {
  if (!key) return null;
  try {
    const all = JSON.parse(readFileSync(fileFor(root, key), 'utf8'));
    return all && typeof all === 'object' && kind in all ? all[kind] : null;
  } catch {
    return null; // missing or corrupt file is a miss, never an error
  }
}

/** @param {string} root @param {string} kind @param {unknown} value */
export function writeCache(root, kind, value, key = cacheKey(root)) {
  if (!key) return false;
  let all;
  try {
    all = JSON.parse(readFileSync(fileFor(root, key), 'utf8')) ?? {};
  } catch {
    all = {};
  }
  all[kind] = value;
  mkdirSync(join(root, CACHE_DIR), { recursive: true });
  const target = fileFor(root, key);
  const tmp = `${target}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(all, null, 2));
  renameSync(tmp, target);
  return true;
}
