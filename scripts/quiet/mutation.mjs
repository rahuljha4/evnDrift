#!/usr/bin/env node
// Quiet Stryker: mutation score and surviving mutants for the given source files only
// (max 20 lines). Gives up after 3 minutes. Never prints a score that was not measured.
// Usage: node scripts/quiet/mutation.mjs <file> [<file>...]
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { repoRoot } from '../commit-checks/git.mjs';
import { formatMutation } from './format.mjs';

export const TIME_LIMIT_MS = 180_000;

/** @returns {{ ok: boolean, text: string, score?: number }} ok=false only for a tool failure. */
export function runMutation({ files, root = repoRoot(), timeoutMs = TIME_LIMIT_MS }) {
  if (!files?.length) return { ok: false, text: 'mutation: give at least one source file' };
  const bin = join(root, 'node_modules/@stryker-mutator/core/bin/stryker.js');
  if (!existsSync(bin)) return { ok: true, text: 'mutation: skipped (stryker not installed)' };
  const dir = mkdtempSync(join(tmpdir(), 'envdrift-mut-'));
  const outFile = join(dir, 'mutation.json');
  try {
    const r = spawnSync(
      process.execPath,
      [
        bin,
        'run',
        '--mutate',
        files.join(','),
        '--reporters',
        'json',
        '--jsonReporter.fileName',
        outFile,
      ],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    if (r.error?.code === 'ETIMEDOUT') return { ok: true, text: 'mutation: skipped (time limit)' };
    let report;
    try {
      report = JSON.parse(readFileSync(outFile, 'utf8'));
    } catch {
      const why =
        `${r.stderr ?? ''}${r.stdout ?? ''}`.split('\n').find((l) => l.trim()) ?? 'no output';
      return { ok: false, text: `mutation: stryker produced no report: ${why.slice(0, 200)}` };
    }
    return formatMutation(report, { root });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const r = runMutation({ files: process.argv.slice(2).filter((a) => !a.startsWith('--')) });
  console.log(r.text);
  process.exit(r.ok ? 0 : 1);
}
