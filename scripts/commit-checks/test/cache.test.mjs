import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cacheKey, readCache, writeCache } from '../cache.mjs';

const g = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'envdrift-cache-'));
  g(dir, 'init', '-q');
  g(dir, 'config', 'user.email', 't@example.com');
  g(dir, 'config', 'user.name', 't');
  writeFileSync(join(dir, 'a.txt'), 'one\n');
  g(dir, 'add', 'a.txt');
  return dir;
}

describe('cacheKey', () => {
  it('is stable for an unchanged tree', () => {
    const dir = repo();
    expect(cacheKey(dir)).toMatch(/^[0-9a-f]{40}$/);
    expect(cacheKey(dir)).toBe(cacheKey(dir));
  });

  it('changes when staged content changes', () => {
    const dir = repo();
    const before = cacheKey(dir);
    writeFileSync(join(dir, 'a.txt'), 'two\n');
    g(dir, 'add', 'a.txt');
    expect(cacheKey(dir)).not.toBe(before);
  });

  it('changes when a tracked file is edited but not staged', () => {
    const dir = repo();
    const before = cacheKey(dir);
    writeFileSync(join(dir, 'a.txt'), 'edited\n');
    expect(cacheKey(dir)).not.toBe(before);
  });

  it('changes when an untracked file appears or its content changes', () => {
    const dir = repo();
    const before = cacheKey(dir);
    writeFileSync(join(dir, 'new.test.mjs'), 'x');
    const added = cacheKey(dir);
    expect(added).not.toBe(before);
    writeFileSync(join(dir, 'new.test.mjs'), 'y');
    expect(cacheKey(dir)).not.toBe(added);
  });

  it('ignores the cache directory itself even when it is not gitignored', () => {
    const dir = repo();
    const before = cacheKey(dir);
    writeCache(dir, 'tests', { ok: true });
    expect(cacheKey(dir)).toBe(before);
  });

  it('ignores review reports, staged or not, so writing one does not invalidate results', () => {
    const dir = repo();
    const before = cacheKey(dir);
    mkdirSync(join(dir, 'docs/reviews'), { recursive: true });
    writeFileSync(join(dir, 'docs/reviews/r.md'), 'report');
    expect(cacheKey(dir)).toBe(before);
    g(dir, 'add', 'docs/reviews/r.md');
    expect(cacheKey(dir)).toBe(before);
  });

  it('changes when HEAD moves even if the staged diff is the same', () => {
    const dir = repo();
    g(dir, 'commit', '-qm', 'one');
    const before = cacheKey(dir);
    g(dir, 'commit', '-q', '--allow-empty', '-m', 'two');
    expect(cacheKey(dir)).not.toBe(before);
  });

  it('returns null outside a git repository', () => {
    expect(cacheKey(mkdtempSync(join(tmpdir(), 'envdrift-nogit-')))).toBeNull();
  });
});

describe('readCache / writeCache', () => {
  it('returns what was written for the same key', () => {
    const dir = repo();
    writeCache(dir, 'tests', { ok: true, text: 'tests: 3 passed in 0.1s' });
    expect(readCache(dir, 'tests')).toEqual({ ok: true, text: 'tests: 3 passed in 0.1s' });
  });

  it('keeps other kinds when one kind is added', () => {
    const dir = repo();
    writeCache(dir, 'tests', { ok: true });
    writeCache(dir, 'review', { verdict: 'APPROVE' });
    expect(readCache(dir, 'tests')).toEqual({ ok: true });
    expect(readCache(dir, 'review')).toEqual({ verdict: 'APPROVE' });
  });

  it('misses after the staged content changes, so a stale result is never reused', () => {
    const dir = repo();
    writeCache(dir, 'tests', { ok: true });
    writeFileSync(join(dir, 'a.txt'), 'changed\n');
    g(dir, 'add', 'a.txt');
    expect(readCache(dir, 'tests')).toBeNull();
  });

  it('misses for a kind that was never written', () => {
    const dir = repo();
    writeCache(dir, 'tests', { ok: true });
    expect(readCache(dir, 'audit')).toBeNull();
  });

  it('treats a corrupt cache file as a miss', () => {
    const dir = repo();
    const key = cacheKey(dir);
    mkdirSync(join(dir, '.cache/commit-checks'), { recursive: true });
    writeFileSync(join(dir, '.cache/commit-checks', `${key}.json`), '{not json');
    expect(readCache(dir, 'tests')).toBeNull();
    writeCache(dir, 'tests', { ok: false });
    expect(readCache(dir, 'tests')).toEqual({ ok: false });
  });

  it('does not write when there is no key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'envdrift-nogit-'));
    expect(writeCache(dir, 'tests', { ok: true })).toBe(false);
    expect(readCache(dir, 'tests')).toBeNull();
  });
});
