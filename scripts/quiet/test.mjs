#!/usr/bin/env node
// Quiet `npm test`: one line on pass; failing test names, the assertion line and file:line
// on failure (max 40 lines). Reuses a cached result for an unchanged tree.
// Usage: node scripts/quiet/test.mjs [--no-cache]
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readCache, writeCache, cacheKey } from '../commit-checks/cache.mjs';
import { repoRoot } from '../commit-checks/git.mjs';
import { formatTestResult, markCached, stripAnsi } from './format.mjs';

/** @returns {{ ok: boolean, text: string, cached: boolean }} */
export function runTests({ root = repoRoot(), useCache = true } = {}) {
  const key = useCache ? cacheKey(root) : null;
  if (key) {
    const hit = readCache(root, 'tests', key);
    if (hit) return { ...hit, text: markCached(hit.text), cached: true };
  }
  const bin = join(root, 'node_modules/vitest/vitest.mjs');
  if (!existsSync(bin))
    return { ok: false, text: 'tests: vitest is not installed. Run `npm install`.', cached: false };
  const dir = mkdtempSync(join(tmpdir(), 'envdrift-quiet-'));
  const outFile = join(dir, 'report.json');
  const started = Date.now();
  try {
    const r = spawnSync(
      process.execPath,
      [bin, 'run', '--reporter=json', `--outputFile=${outFile}`],
      {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    let json;
    try {
      json = JSON.parse(readFileSync(outFile, 'utf8'));
    } catch {
      const why =
        stripAnsi(`${r.stderr ?? ''}${r.stdout ?? ''}`)
          .split('\n')
          .find((l) => l.trim()) ?? 'no output';
      return {
        ok: false,
        text: `tests: vitest produced no report: ${why.slice(0, 200)}`,
        cached: false,
      };
    }
    const result = formatTestResult(json, { root, ms: Date.now() - started });
    if (key) writeCache(root, 'tests', result, key);
    return { ...result, cached: false };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const r = runTests({ useCache: !process.argv.includes('--no-cache') });
  console.log(r.text);
  process.exit(r.ok ? 0 : 1);
}
