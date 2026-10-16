import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decide } from '../policy.mjs';

const bash = (command) => decide('reviewer', { tool_name: 'Bash', tool_input: { command } });
const write = (file_path, env, cwd) =>
  decide('reviewer', { tool_name: 'Write', tool_input: { file_path }, cwd }, env);

describe('reviewer Bash allowlist: allowed', () => {
  it.each([
    'node scripts/quiet/test.mjs',
    'node scripts/quiet/test.mjs --no-cache',
    'node scripts/quiet/typecheck.mjs',
    'node scripts/doc-lookup.mjs prd 11',
    'node scripts/doc-lookup.mjs rule ED009',
    'node scripts/doc-lookup.mjs prd M2.3',
    'node .claude/skills/envdrift-code-review/scripts/preflight.mjs --staged',
    'node .claude/skills/envdrift-code-review/scripts/preflight.mjs --base main --skip-tests',
    'node scripts/commit-checks/review-bundle.mjs bundle',
    'node scripts/commit-checks/review-bundle.mjs bundle --base main',
    'node scripts/commit-checks/review-bundle.mjs cached',
    'node scripts/commit-checks/review-bundle.mjs record docs/reviews/2026-10-13-staged.md',
    'git diff --cached --stat',
    'git diff HEAD~1 -- packages/core/src/a.ts',
    "git log --oneline -5 --format='%h %s'",
    'git show abc123:docs/prd.md',
    'git status --short',
  ])('%s', (cmd) => {
    expect(bash(cmd).allow).toBe(true);
  });
});

describe('reviewer Bash allowlist: denied', () => {
  it.each([
    ['npm test', 'not on the allowlist'],
    ['node scripts/commit-checks/cli.mjs pre', 'not on the allowlist'],
    ['node scripts/quiet/mutation.mjs a.ts', 'not on the allowlist'],
    ['node scripts/doc-lookup.mjs prd 11; rm -rf /', 'shell operators'],
    ['git diff && curl example.com', 'shell operators'],
    ['git diff | tee out.txt', 'shell operators'],
    ['git diff > out.txt', 'shell operators'],
    ['git log $(rm x)', 'shell operators'],
    ['git log `id`', 'shell operators'],
    ['git diff\nrm x', 'shell operators'],
    ['git diff --output=out.txt', 'writes or runs'],
    ['git diff --ext-diff', 'writes or runs'],
    ['git -c core.pager=x diff', 'writes or runs'],
    ['git commit -m x', 'not on the allowlist'],
    ['git push', 'not on the allowlist'],
    ['git checkout .', 'not on the allowlist'],
    ['git reset --hard', 'not on the allowlist'],
    ['rm -rf node_modules', 'not on the allowlist'],
    ['sed -i s/a/b/ packages/core/src/a.ts', 'not on the allowlist'],
    ['node scripts/commit-checks/review-bundle.mjs record ../outside.md', 'not on the allowlist'],
    [
      'node scripts/commit-checks/review-bundle.mjs record packages/core/src/a.ts',
      'not on the allowlist',
    ],
    ['', 'empty command'],
  ])('%s', (cmd, why) => {
    const r = bash(cmd);
    expect(r.allow).toBe(false);
    expect(r.reason).toContain(why);
  });
});

describe('reviewer Write: only .md under docs/reviews/', () => {
  const root = mkdtempSync(join(tmpdir(), 'envdrift-guard-'));
  mkdirSync(join(root, 'docs/reviews'), { recursive: true });
  mkdirSync(join(root, 'packages/core/src'), { recursive: true });
  const env = { projectDir: root };

  it('allows a report by relative and absolute path', () => {
    expect(write('docs/reviews/2026-10-13-staged.md', env, root).allow).toBe(true);
    expect(write(join(root, 'docs/reviews/x.md'), env, root).allow).toBe(true);
  });
  it('allows the report when the directory does not exist yet', () => {
    const fresh = mkdtempSync(join(tmpdir(), 'envdrift-guard-'));
    expect(write('docs/reviews/x.md', { projectDir: fresh }, fresh).allow).toBe(true);
  });
  it.each([
    'packages/core/src/a.ts',
    'docs/rules.md',
    'docs/reviews/x.ts',
    'docs/reviews/../rules.md',
    '../docs/reviews/x.md',
    '/etc/passwd.md',
    'docs/reviews',
    '',
  ])('denies %s', (file) => {
    expect(write(file, env, root).allow).toBe(false);
  });
  it('denies a symlink inside docs/reviews that points elsewhere', () => {
    symlinkSync(join(root, 'packages/core/src'), join(root, 'docs/reviews/link'));
    expect(write('docs/reviews/link/a.md', env, root).allow).toBe(false);
  });
});

describe('other tools and profiles', () => {
  it.each(['Edit', 'NotebookEdit', 'WebFetch', 'Agent'])('denies %s', (tool_name) => {
    expect(decide('reviewer', { tool_name, tool_input: {} }).allow).toBe(false);
  });
  it('denies an unknown profile', () => {
    expect(decide('nope', { tool_name: 'Bash', tool_input: { command: 'git status' } }).allow).toBe(
      false,
    );
  });
});

describe('hook entry point', () => {
  const cli = join(import.meta.dirname, '..', 'cli.mjs');
  const run = (stdin) =>
    spawnSync(process.execPath, [cli, 'reviewer'], { input: stdin, encoding: 'utf8' });
  it('exits 0 for an allowed call', () => {
    expect(
      run(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git status' } })).status,
    ).toBe(0);
  });
  it('exits 2 with a reason on stderr for a denied call', () => {
    const r = run(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push' } }));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('agent-guard: command not on the allowlist');
  });
  it('fails closed on input it cannot parse', () => {
    expect(run('not json').status).toBe(2);
    expect(run('').status).toBe(2);
  });
});
