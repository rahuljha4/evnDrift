// Thin, read-only wrappers around git. execFileSync only: no shell, so it behaves the
// same in Git Bash on Windows.
import { execFileSync } from 'node:child_process';

/** @param {string[]} args @param {{ cwd?: string, allowFail?: boolean }} [opts] */
export function git(args, opts = {}) {
  try {
    return execFileSync('git', args, {
      cwd: opts.cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    if (opts.allowFail) return null;
    throw e;
  }
}

export const repoRoot = () => git(['rev-parse', '--show-toplevel']).trim();

/** Staged files: [{ status: 'A'|'M'|'D'|'R'..., path }] with posix paths. */
export function stagedFiles(cwd) {
  const out = git(['diff', '--cached', '--name-status', '--no-renames', '-z'], { cwd });
  const parts = out.split('\0').filter(Boolean);
  const files = [];
  for (let i = 0; i + 1 < parts.length; i += 2)
    files.push({ status: parts[i], path: parts[i + 1] });
  return files;
}

/** Added lines in the staged diff: [{ path, line, text }] (line is the new-file line number). */
export function stagedAddedLines(cwd) {
  const diff = git(
    ['diff', '--cached', '--no-color', '--no-ext-diff', '--unified=0', '--no-renames'],
    { cwd },
  );
  return parseAddedLines(diff);
}

/** @param {string} diff */
export function parseAddedLines(diff) {
  const added = [];
  let path = null;
  let line = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      path = raw.startsWith('+++ b/') ? raw.slice(6) : null;
    } else if (raw.startsWith('@@')) {
      const m = /\+(\d+)(?:,\d+)?/.exec(raw);
      line = m ? Number(m[1]) : 0;
    } else if (raw.startsWith('+') && !raw.startsWith('+++') && path) {
      added.push({ path, line, text: raw.slice(1) });
      line++;
    }
  }
  return added;
}

/** Size in bytes of the staged blob for a path, or 0. */
export function stagedSize(path, cwd) {
  const out = git(['cat-file', '-s', `:${path}`], { cwd, allowFail: true });
  return out ? Number(out.trim()) : 0;
}

/** Content of a file at HEAD (or the staged index when ref is ':'), or null. */
export function show(ref, path, cwd) {
  return git(['show', `${ref}:${path}`], { cwd, allowFail: true });
}
