// Review-gate hash (docs/conventions/commits.md §1.4). Shared by the hook, the CLI and the
// code-review skill's pre-flight, so a report and the hook always agree.
import { createHash } from 'node:crypto';
import { git } from './git.mjs';

export const HASH_ARGS = [
  'diff',
  '--cached',
  '--no-color',
  '--no-ext-diff',
  '--',
  '.',
  ':(exclude)docs/reviews',
];

/** sha256 of the staged diff excluding docs/reviews, or 'none' when nothing is staged. */
export function stagedDiffHash(cwd) {
  const diff = git(HASH_ARGS, { cwd });
  if (diff.trim() === '') return 'none';
  return createHash('sha256').update(diff).digest('hex');
}
