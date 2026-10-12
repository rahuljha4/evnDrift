// Entry points used by .githooks/*, cli.mjs and the envdrift-commit skill. Same code path
// everywhere, so a check that passes in the skill passes in the hook.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { stagedDiffHash } from './diff-hash.mjs';
import { stagedAddedLines, stagedFiles, repoRoot } from './git.mjs';
import { checkMessage, parseMessage } from './message.mjs';
import { checkReviewGate, loadReports } from './review-gate.mjs';
import { checkSecrets } from './secrets.mjs';
import { addedDepsFromGit, checkStagedFiles, newAiLogRows, sizeOfStaged } from './staged.mjs';
import { parseTaskIds } from './tasks.mjs';
import { fail } from './report.mjs';

const isDocsOnly = (files) =>
  files.length > 0 && files.every((f) => f.path.startsWith('docs/') || f.path.endsWith('.md'));

function npm(root, args) {
  const r = spawnSync('npm', args, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return {
    ok: r.status === 0,
    output: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-12).join('\n'),
  };
}

/** Checks that need only the staged files and the working tree (pre-commit). */
export function runPreCommit({ root = repoRoot(), skipTests = false, env = process.env } = {}) {
  const files = stagedFiles(root);
  const failures = [];
  const ran = [];
  const skipped = [];
  if (!files.length) return { failures, ran, skipped: ['everything: nothing is staged'], files };

  failures.push(...checkStagedFiles(files, sizeOfStaged(root)));
  ran.push('ENV-1', 'SIZE-1', 'BUILD-1');
  failures.push(...checkSecrets(stagedAddedLines(root)));
  ran.push('SECRET-1', 'SECRET-2');

  const fast = env.FAST === '1' && isDocsOnly(files);
  if (skipTests) skipped.push('TEST-1 npm test, TYPE-1 typecheck: skipped by --skip-tests');
  else if (fast)
    skipped.push(
      'TEST-1 npm test, TYPE-1 typecheck: skipped because FAST=1 and the commit is docs-only',
    );
  else {
    const t = npm(root, ['test']);
    ran.push('TEST-1');
    if (!t.ok)
      failures.push(
        fail(
          'TEST-1',
          '`npm test` fails',
          t.output.split('\n').slice(-3).join(' | '),
          'Fix the failing tests, then re-stage.',
        ),
      );
    const c = npm(root, ['run', 'typecheck']);
    ran.push('TYPE-1');
    if (!c.ok)
      failures.push(
        fail(
          'TYPE-1',
          '`npm run typecheck` fails',
          c.output.split('\n').slice(-3).join(' | '),
          'Fix the type errors, then re-stage.',
        ),
      );
  }

  const bin = join(root, 'packages/cli/dist/bin.js');
  if (!existsSync(bin))
    skipped.push(
      'DOGFOOD-1 envdrift scan: SKIPPED, CLI not built (packages/cli/dist/bin.js missing)',
    );
  else {
    const r = spawnSync(process.execPath, [bin, 'scan', '--fail-on', 'error'], {
      cwd: root,
      encoding: 'utf8',
    });
    ran.push('DOGFOOD-1');
    if (r.status !== 0)
      failures.push(
        fail(
          'DOGFOOD-1',
          '`envdrift scan --fail-on error` fails on this repository',
          `${(r.stdout ?? '').split('\n').slice(0, 3).join(' | ')}`,
          'Fix the findings or suppress them with envdrift-ignore.',
        ),
      );
  }
  return { failures, ran, skipped, files };
}

/** Checks that need the commit message (commit-msg). `raw` is the message text. */
export function runCommitMsg({ raw, root = repoRoot() }) {
  const files = stagedFiles(root);
  const prd = readFileSync(join(root, 'docs/prd.md'), 'utf8');
  const taskIds = parseTaskIds(prd);
  const ctx = {
    taskIds,
    stagedFiles: files,
    addedDeps: addedDepsFromGit(root),
    newAiLogRows: newAiLogRows(stagedAddedLines(root)),
  };
  const failures = checkMessage(raw, ctx);
  const ran = ['FMT-*', 'Q-*', 'BODY-*', 'TRL-*', 'TST-1', 'DOC-1', 'DOC-2'];
  const type = /^([a-z]+)\(/.exec(parseMessage(raw).subject)?.[1];
  if (type) {
    failures.push(...checkReviewGate(type, stagedDiffHash(root), loadReports(root)));
    ran.push('REV-*');
  }
  return { failures, ran, skipped: [], files };
}
