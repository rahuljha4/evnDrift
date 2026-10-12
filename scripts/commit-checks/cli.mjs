#!/usr/bin/env node
// Usage:
//   node scripts/commit-checks/cli.mjs pre [--skip-tests] [--json]
//   node scripts/commit-checks/cli.mjs msg <message-file> [--json]
//   node scripts/commit-checks/cli.mjs gate <type>   (review gate only, e.g. before drafting)
//   node scripts/commit-checks/cli.mjs hash
// Exit 1 when any check fails. Used by the envdrift-commit skill; the hooks call run.mjs directly.
import { readFileSync } from 'node:fs';
import { stagedDiffHash } from './diff-hash.mjs';
import { formatFailures } from './report.mjs';
import { checkReviewGate, loadReports } from './review-gate.mjs';
import { repoRoot } from './git.mjs';
import { runCommitMsg, runPreCommit } from './run.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const json = rest.includes('--json');

function out(result, title) {
  if (json)
    console.log(JSON.stringify({ ...result, files: result.files?.map((f) => f.path) }, null, 2));
  else {
    if (result.failures.length) console.error(formatFailures(result.failures, title));
    else console.log(`${title}: all checks passed`);
    console.log(`ran: ${result.ran.join(', ') || '(none)'}`);
    for (const s of result.skipped) console.log(`skipped: ${s}`);
  }
  process.exit(result.failures.length ? 1 : 0);
}

if (cmd === 'pre')
  out(runPreCommit({ skipTests: rest.includes('--skip-tests') }), 'pre-commit checks');
else if (cmd === 'msg')
  out(
    runCommitMsg({
      raw: readFileSync(
        rest.find((a) => !a.startsWith('--')),
        'utf8',
      ),
    }),
    'commit message checks',
  );
else if (cmd === 'gate') {
  const type = rest.find((a) => !a.startsWith('--')) ?? '';
  out(
    {
      failures: checkReviewGate(type, stagedDiffHash(), loadReports(repoRoot())),
      ran: ['REV-*'],
      skipped: [],
      files: [],
    },
    `review gate (${type})`,
  );
} else if (cmd === 'hash') console.log(stagedDiffHash());
else {
  console.error(
    'usage: cli.mjs pre [--skip-tests] [--json] | msg <file> [--json] | gate <type> | hash',
  );
  process.exit(2);
}
