// Runs from `npm install` (the `prepare` script). Points Git at .githooks/ so the commit
// checks install with the repo. Silent no-op outside a git work tree (for example when the
// package is installed from a tarball).
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync } from 'node:fs';

try {
  const inside = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (inside === 'true' && existsSync('.githooks')) {
    execFileSync('git', ['config', 'core.hooksPath', '.githooks']);
    for (const h of ['pre-commit', 'commit-msg']) {
      try {
        chmodSync(`.githooks/${h}`, 0o755);
      } catch {
        /* Windows or missing file */
      }
    }
  }
} catch {
  /* not a git checkout */
}
