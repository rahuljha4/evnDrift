// Smoke test for the M0.3 spike (scripts/spike-scan.ts). Throwaway: deleted with the script in M2.5.
// Runs the script on a temp git repo whose names are known to land on each side of the diff.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'spike-scan.ts');
const made = [];
const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' });
function put(dir, rel, body) {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
}
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'envdrift-spike-test-'));
  made.push(dir);
  g(dir, 'init', '-q');
  put(
    dir,
    'src/a.ts',
    [
      'const url = process.env.SHARED;',
      "const b = process.env['BRACKET'];",
      'const { DESTRUCT } = process.env;',
      "const k = 'x'; const d = process.env[k];",
      'const v = import.meta.env.VITE_X;',
      '',
    ].join('\n'),
  );
  put(
    dir,
    'src/b.ts',
    [
      '// process.env.IN_COMMENT',
      "export const s = 'process.env.IN_STRING';",
      'export const shared = process.env.SHARED;',
      '',
    ].join('\n'),
  );
  put(dir, 'src/broken.ts', 'const = process.env.BROKEN;\n');
  put(dir, 'src/x.test.ts', 'process.env.EXCLUDED;\n');
  put(dir, 'README.md', 'process.env.NOT_JS\n');
  put(dir, 'src/gone.ts', 'process.env.GONE;\n');
  g(dir, 'add', '.');
  rmSync(join(dir, 'src/gone.ts'));
  put(dir, 'src/u.ts', 'process.env.UNTRACKED;\n');
  return dir;
}
const run = (dir) =>
  JSON.parse(execFileSync('node', [SCRIPT, dir, '--json', '--runs', '2'], { encoding: 'utf8' }));

// `node x.ts` needs built-in type stripping; CI also runs Node 20, which has none.
describe.skipIf(!process.features.typescript)('spike-scan', () => {
  afterAll(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

  it('M0.3: splits names into agreed, AST-only and grep-only over tracked, included files', () => {
    const r = run(repo());
    expect(r.files).toBe(4);
    expect(r.parseFailures).toEqual(['src/broken.ts']);
    expect(r.readFailures).toEqual(['src/gone.ts']);
    expect(r.astNames).toBe(4);
    expect(r.grepNames).toBe(5);
    expect(r.agreed).toEqual(['SHARED', 'VITE_X']);
    expect(r.astOnly).toEqual([
      { name: 'BRACKET', at: 'src/a.ts:2' },
      { name: 'DESTRUCT', at: 'src/a.ts:3' },
    ]);
    expect(r.grepOnly).toEqual([
      { name: 'BROKEN', at: 'src/broken.ts:1' },
      { name: 'IN_COMMENT', at: 'src/b.ts:1' },
      { name: 'IN_STRING', at: 'src/b.ts:2' },
    ]);
    expect(r.dynamic).toBe(1);
    expect(r.timing.runs).toBe(2);
    expect(typeof r.timing.medianMs).toBe('number');
  });

  it('M0.3: output is deterministic apart from timing', () => {
    const dir = repo();
    const strip = ({ timing: _t, ...rest }) => rest;
    expect(strip(run(dir))).toEqual(strip(run(dir)));
  });

  it('M0.3: rejects a --runs value that is not a positive integer with exit 2', () => {
    let status;
    try {
      execFileSync('node', [SCRIPT, repo(), '--runs', 'x'], { stdio: 'pipe' });
    } catch (e) {
      status = e.status;
    }
    expect(status).toBe(2);
  });
});
