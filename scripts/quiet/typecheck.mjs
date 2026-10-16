#!/usr/bin/env node
// Quiet `npm run typecheck`: one line on pass; only the errors on failure (max 30 lines).
// Usage: node scripts/quiet/typecheck.mjs [--no-cache]
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readCache, writeCache, cacheKey } from '../commit-checks/cache.mjs';
import { repoRoot } from '../commit-checks/git.mjs';
import { formatTypecheck, markCached } from './format.mjs';

/** @returns {{ ok: boolean, text: string, cached: boolean }} */
export function runTypecheck({ root = repoRoot(), useCache = true } = {}) {
  const key = useCache ? cacheKey(root) : null;
  if (key) {
    const hit = readCache(root, 'typecheck', key);
    if (hit) return { ...hit, text: markCached(hit.text), cached: true };
  }
  const bin = join(root, 'node_modules/typescript/bin/tsc');
  if (!existsSync(bin))
    return {
      ok: false,
      text: 'typecheck: typescript is not installed. Run `npm install`.',
      cached: false,
    };
  const started = Date.now();
  const r = spawnSync(process.execPath, [bin, '-p', 'tsconfig.json', '--pretty', 'false'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const result = formatTypecheck(`${r.stdout ?? ''}${r.stderr ?? ''}`, {
    ok: r.status === 0,
    ms: Date.now() - started,
  });
  if (key) writeCache(root, 'typecheck', result, key);
  return { ...result, cached: false };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const r = runTypecheck({ useCache: !process.argv.includes('--no-cache') });
  console.log(r.text);
  process.exit(r.ok ? 0 : 1);
}
