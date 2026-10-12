import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extract, shouldParse } from '../../src/extract/js.ts';
import type { DynamicAccess, Reference } from '../../src/types.ts';

const JS = 'src/a.js';
const TS = 'src/a.ts';
const TSX = 'src/a.tsx';

const run = (code: string, file = JS) => extract(code, file, { accessors: [] });

const ref = (
  file: string,
  name: string,
  line: number,
  column: number,
  over: Partial<Reference> = {},
): Reference => ({
  name,
  file,
  line,
  column,
  via: 'process.env',
  hasFallback: false,
  ...over,
});

const dyn = (
  file: string,
  kind: DynamicAccess['kind'],
  line: number,
  column: number,
): DynamicAccess => ({ file, line, column, kind });

const lines = (...l: string[]) => l.join('\n');

describe('P: references', () => {
  it('P01: process.env.X', () => {
    const r = run('process.env.API_URL;');
    expect(r.references).toEqual([ref(JS, 'API_URL', 1, 1)]);
    expect(r.dynamic).toEqual([]);
    expect(r.parsed).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('P01: column is 1-based and points at `process`', () => {
    expect(run('const a = process.env.X;').references).toEqual([ref(JS, 'X', 1, 11)]);
  });

  it('P02: process.env["X"] string-literal computed member', () => {
    const r = run(lines(`process.env['API_URL'];`, `process.env["DB_URL"];`));
    expect(r.references).toEqual([ref(JS, 'API_URL', 1, 1), ref(JS, 'DB_URL', 2, 1)]);
  });

  it('P03: process.env[`X`] no-expression template member', () => {
    expect(run('process.env[`API_URL`];').references).toEqual([ref(JS, 'API_URL', 1, 1)]);
  });

  it('P04: object destructuring', () => {
    const r = run('const { API_URL, DB_URL } = process.env;');
    expect(r.references).toEqual([ref(JS, 'API_URL', 1, 9), ref(JS, 'DB_URL', 1, 18)]);
    expect(r.dynamic).toEqual([]);
  });

  it('P05: renamed destructuring reports the env name', () => {
    expect(run('const { API_URL: url } = process.env;').references).toEqual([
      ref(JS, 'API_URL', 1, 9),
    ]);
  });

  it('P06: import.meta.env.X', () => {
    expect(run('import.meta.env.VITE_API_URL;').references).toEqual([
      ref(JS, 'VITE_API_URL', 1, 1, { via: 'import.meta.env' }),
    ]);
  });

  it('P07: import.meta.env["X"]', () => {
    expect(run(`import.meta.env['VITE_API_URL'];`).references).toEqual([
      ref(JS, 'VITE_API_URL', 1, 1, { via: 'import.meta.env' }),
    ]);
  });

  it('P08: destructuring from import.meta.env', () => {
    expect(run('const { VITE_A } = import.meta.env;').references).toEqual([
      ref(JS, 'VITE_A', 1, 9, { via: 'import.meta.env' }),
    ]);
  });

  it('P09: optional chaining', () => {
    const r = run(
      lines('process.env?.API_URL;', 'process?.env?.DB_URL;', 'globalThis.process?.env.REDIS_URL;'),
    );
    expect(r.references).toEqual([
      ref(JS, 'API_URL', 1, 1),
      ref(JS, 'DB_URL', 2, 1),
      ref(JS, 'REDIS_URL', 3, 1),
    ]);
  });

  it('P10: TS and paren wrappers around the env object or the read', () => {
    const r = run(
      lines(
        'process.env!.A;',
        '(process.env as Env).B;',
        '(process.env).C;',
        'process.env.D!;',
        'process.env.E as string;',
        'process.env.F satisfies string;',
      ),
      TS,
    );
    expect(r.references).toEqual([
      ref(TS, 'A', 1, 1),
      ref(TS, 'B', 2, 2),
      ref(TS, 'C', 3, 2),
      ref(TS, 'D', 4, 1),
      ref(TS, 'E', 5, 1),
      ref(TS, 'F', 6, 1),
    ]);
  });

  it('P11: globalThis.process.env and global.process.env', () => {
    const r = run(lines('globalThis.process.env.A;', 'global.process.env.B;'));
    expect(r.references).toEqual([ref(JS, 'A', 1, 1), ref(JS, 'B', 2, 1)]);
  });

  it('P12: write, delete and compound-assignment targets are references without fallback', () => {
    const r = run(
      lines(
        `process.env.A = 'v';`,
        'delete process.env.B;',
        `process.env.C += 'a';`,
        `process.env.D ??= 'd';`,
        `process.env.E ||= 'd';`,
      ),
    );
    expect(r.references).toEqual([
      ref(JS, 'A', 1, 1),
      ref(JS, 'B', 2, 8),
      ref(JS, 'C', 3, 1),
      ref(JS, 'D', 4, 1),
      ref(JS, 'E', 5, 1),
    ]);
  });

  it('P01 near-miss: other objects and member names are not env reads', () => {
    expect(run('foo.env.X; process.envX; process.foo.X; env.X;').references).toEqual([]);
  });
});

describe('F: fallbacks', () => {
  it('F01: nullish coalescing', () => {
    expect(run(`process.env.PORT ?? '3000';`).references).toEqual([
      ref(JS, 'PORT', 1, 1, { hasFallback: true }),
    ]);
  });

  it('F02: logical OR', () => {
    expect(run('process.env.PORT || 3000;').references).toEqual([
      ref(JS, 'PORT', 1, 1, { hasFallback: true }),
    ]);
  });

  it('F03: destructuring default, plain and renamed', () => {
    const r = run(
      lines(`const { PORT = '3000' } = process.env;`, `const { HOST: h = 'x' } = process.env;`),
    );
    expect(r.references).toEqual([
      ref(JS, 'PORT', 1, 9, { hasFallback: true }),
      ref(JS, 'HOST', 2, 9, { hasFallback: true }),
    ]);
  });

  it('F05: fallback through wrappers', () => {
    const r = run(
      lines(
        `(process.env.PORT as string) ?? '3000';`,
        '(process.env.HOST!) || x;',
        'process.env?.NAME ?? x;',
      ),
      TS,
    );
    expect(r.references).toEqual([
      ref(TS, 'PORT', 1, 2, { hasFallback: true }),
      ref(TS, 'HOST', 2, 2, { hasFallback: true }),
      ref(TS, 'NAME', 3, 1, { hasFallback: true }),
    ]);
  });

  it('F01 near-miss: ternary, &&, if-throw and right operand are not fallbacks', () => {
    const r = run(
      lines(
        'process.env.A ? 1 : 2;',
        'process.env.B && 1;',
        `if (!process.env.C) throw new Error('x');`,
        'x ?? process.env.D;',
      ),
    );
    expect(r.references.map((x) => [x.name, x.hasFallback])).toEqual([
      ['A', false],
      ['B', false],
      ['C', false],
      ['D', false],
    ]);
  });

  it('F02 near-miss: the left side must be the read, not contain it', () => {
    expect(run('foo(process.env.X) ?? y;').references).toEqual([ref(JS, 'X', 1, 5)]);
  });
});

describe('D: dynamic access', () => {
  it('D01: computed non-literal key', () => {
    const r = run(lines('process.env[name];', 'import.meta.env[key];', 'process.env[KEYS.API];'));
    expect(r.references).toEqual([]);
    expect(r.dynamic).toEqual([
      dyn(JS, 'computed-key', 1, 1),
      dyn(JS, 'computed-key', 2, 1),
      dyn(JS, 'computed-key', 3, 1),
    ]);
  });

  it('D01: computed keys in destructuring and nested reads inside a computed key', () => {
    const r = run(
      lines(
        'const { [k]: a, [`B`]: b, "C": c } = process.env;',
        'process.env[process.env.K];',
        'process.env[name] = 1;',
      ),
    );
    expect(r.references).toEqual([ref(JS, 'B', 1, 18), ref(JS, 'C', 1, 27), ref(JS, 'K', 2, 13)]);
    expect(r.dynamic).toEqual([
      dyn(JS, 'computed-key', 1, 10),
      dyn(JS, 'computed-key', 2, 1),
      dyn(JS, 'computed-key', 3, 1),
    ]);
  });

  it('D02: template literal with expressions', () => {
    expect(run('process.env[`${prefix}_URL`];').dynamic).toEqual([dyn(JS, 'computed-key', 1, 1)]);
  });

  it('D03: rest destructuring reports the named keys and a dynamic access', () => {
    const r = run('const { A, ...rest } = process.env;');
    expect(r.references).toEqual([ref(JS, 'A', 1, 9)]);
    expect(r.dynamic).toEqual([dyn(JS, 'rest-destructuring', 1, 12)]);
  });

  it('D04: aliases are reported, not followed', () => {
    const r = run(
      lines(
        'const env = process.env;',
        'let e;',
        'e = process.env;',
        'const { env: pe } = process;',
        'const ienv = import.meta.env;',
        'env.NOT_FOLLOWED;',
      ),
    );
    expect(r.references).toEqual([]);
    expect(r.dynamic).toEqual([
      dyn(JS, 'alias', 1, 13),
      dyn(JS, 'alias', 3, 5),
      dyn(JS, 'alias', 4, 9),
      dyn(JS, 'alias', 5, 14),
    ]);
  });

  it('D04: assigning the env object to a member is an alias', () => {
    expect(run('x.y = process.env;').dynamic).toEqual([dyn(JS, 'alias', 1, 7)]);
  });

  it('D04: an alias through a TS wrapper is still an alias', () => {
    expect(run('const env = process.env as Env;', TS).dynamic).toEqual([dyn(TS, 'alias', 1, 13)]);
  });
});

describe('N: negatives', () => {
  it('N01: comments, strings and template text produce nothing', () => {
    const r = run(
      lines(
        '// process.env.OLD',
        '/* process.env.OLD2 */',
        `const a = 'process.env.X';`,
        'const b = `see process.env.X`;',
      ),
    );
    expect(r.references).toEqual([]);
    expect(r.dynamic).toEqual([]);
  });

  it('N01: type-position uses produce nothing', () => {
    expect(run('type T = typeof process.env.X;', TS).references).toEqual([]);
  });

  it('N03: function parameter shadows process', () => {
    expect(run('function f(process) { return process.env.X; }').references).toEqual([]);
  });

  it('N03: const process shadows process', () => {
    expect(run('const process = mock; process.env.X;').references).toEqual([]);
  });

  it('N03: block-scoped shadow ends with the block', () => {
    const r = run(lines('{', '  const process = m;', '  process.env.A;', '}', 'process.env.B;'));
    expect(r.references).toEqual([ref(JS, 'B', 5, 1)]);
  });

  it('N03: var is hoisted to the function', () => {
    const r = run('function f() { process.env.A; var process = m; }');
    expect(r.references).toEqual([]);
  });

  it('N03: a shadow in a sibling function does not leak', () => {
    const r = run(lines('function f() { const process = 1; }', 'process.env.Z;'));
    expect(r.references).toEqual([ref(JS, 'Z', 2, 1)]);
  });

  it('N03: an inner function inherits the outer shadow', () => {
    const r = run('function o(process) { function i() { return process.env.X; } }');
    expect(r.references).toEqual([]);
  });

  it('N03: catch parameter shadows process', () => {
    expect(run('try {} catch (process) { process.env.X; }').references).toEqual([]);
  });

  it('N03: importing the real process module does not shadow', () => {
    const r = run(lines(`import process from 'node:process';`, 'process.env.X;'));
    expect(r.references).toEqual([ref(JS, 'X', 2, 1)]);
  });

  it('N03: importing something else named process shadows', () => {
    expect(run(`import process from './mock.js';\nprocess.env.X;`).references).toEqual([]);
  });

  it('N03: ambient declare const process does not shadow', () => {
    expect(run('declare const process: any;\nprocess.env.X;', TS).references).toEqual([
      ref(TS, 'X', 2, 1),
    ]);
  });

  it('N03: let/const in a switch case shadows process', () => {
    const code = 'switch (x) { case 1: const process = m; process.env.A; }';
    expect(run(code).references).toEqual([]);
  });

  it('N03: var in a class static block shadows only inside that block', () => {
    const code = lines('class C { static { var process = 1; process.env.A; } }', 'process.env.B;');
    expect(run(code).references).toEqual([ref(JS, 'B', 2, 1)]);
  });

  it('N03: foo.meta.env.X and myObj.env.X are not env reads', () => {
    expect(run('foo.meta.env.X; myObj.env.X;').references).toEqual([]);
  });

  it('N04: existence checks produce nothing', () => {
    const r = run(
      lines(
        `if ('X' in process.env) {}`,
        `Object.hasOwn(process.env, 'A');`,
        `process.env.hasOwnProperty('B');`,
        `Object.prototype.hasOwnProperty.call(process.env, 'C');`,
      ),
    );
    expect(r.references).toEqual([]);
    expect(r.dynamic).toEqual([]);
  });

  it('N05: whole-object escapes produce nothing', () => {
    const r = run(
      lines(
        'fn(process.env);',
        'const o = { ...process.env };',
        'Object.keys(process.env);',
        'Object.entries(import.meta.env);',
        'Object.assign(process.env, { A: 1 });',
        'for (const k in process.env) {}',
        'const c = cond ? process.env : {};',
      ),
    );
    expect(r.references).toEqual([]);
    expect(r.dynamic).toEqual([]);
  });
});

describe('extract: file types and failures', () => {
  it('FR-SRC-01: .ts allows <T>x casts', () => {
    expect(run('const a = <string>process.env.X;', TS).references).toEqual([ref(TS, 'X', 1, 19)]);
  });

  it('FR-SRC-01: .tsx and .jsx parse JSX', () => {
    const code = 'const a = <div title={process.env.T} />;';
    expect(run(code, TSX).references).toEqual([ref(TSX, 'T', 1, 23)]);
    expect(run(code, 'src/a.jsx').references).toEqual([ref('src/a.jsx', 'T', 1, 23)]);
  });

  it('FR-SRC-01: .mts, .cts, .mjs and .cjs are accepted', () => {
    for (const f of ['a.mts', 'a.cts']) {
      expect(run('const a: string = process.env.X!;', f).references).toEqual([ref(f, 'X', 1, 19)]);
    }
    for (const f of ['a.mjs', 'a.cjs']) {
      expect(run('process.env.X;', f).references).toEqual([ref(f, 'X', 1, 1)]);
    }
  });

  it('FR-SRC-04: a fatal syntax error is a warning with line and column only', () => {
    const r = run('const secretname123 = ;');
    expect(r.parsed).toBe(false);
    expect(r.references).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/^src\/a\.js: parse error at \d+:\d+ — skipped$/);
    expect(JSON.stringify(r)).not.toContain('secretname123');
  });

  it('FR-SRC-04: a recoverable syntax error still extracts and warns', () => {
    const r = run('let a; let a; process.env.X;');
    expect(r.parsed).toBe(true);
    expect(r.references).toEqual([ref(JS, 'X', 1, 15)]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/^src\/a\.js: parse error at 1:\d+ — recovered$/);
  });

  it('FR-SRC-04: pathological nesting is skipped, not thrown', () => {
    const r = run(`process.env.X${' + 1'.repeat(200000)};`);
    expect(r.parsed).toBe(false);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/skipped$/);
  });

  it('FR-SRC-02: shouldParse pre-filters on env and accessor names', () => {
    expect(shouldParse('const a = process.env.X', [])).toBe(true);
    expect(shouldParse('const a = 1', [])).toBe(false);
    expect(shouldParse('const a = getConf("X")', [])).toBe(false);
    expect(shouldParse('const a = getConf("X")', ['getConf'])).toBe(true);
  });
});

describe('extract: determinism and suppression comments', () => {
  it('output is sorted by line, column and name regardless of visit order', () => {
    const r = run(lines('foo(process.env.B, process.env.A) ?? process.env.C;', 'process.env.A;'));
    expect(r.references.map((x) => [x.name, x.line, x.column])).toEqual([
      ['B', 1, 5],
      ['A', 1, 20],
      ['C', 1, 38],
      ['A', 2, 1],
    ]);
    expect(run('x').references).toEqual([]);
  });

  it('same input gives equal output', () => {
    const code = 'const { A, ...r } = process.env; process.env.B ?? 1;';
    expect(run(code)).toEqual(run(code));
  });

  it('comments: only envdrift-ignore comments are returned, sanitised', () => {
    const r = run(
      lines(
        '// plain comment process.env.OLD',
        '// envdrift-ignore ED001 ED009 planted words here',
        'process.env.A;',
        '/* envdrift-ignore-file ED005 */',
        '// envdrift-ignore',
        '// envdrift-ignorex ED003',
        '// not envdrift-ignore ED003',
      ),
    );
    expect(r.comments).toEqual([
      { line: 2, text: 'envdrift-ignore ED001 ED009' },
      { line: 4, text: 'envdrift-ignore-file ED005' },
      { line: 5, text: 'envdrift-ignore' },
    ]);
  });
});

describe('ADR 0006: extractor redaction', () => {
  it('ADR 0006: no source literal or comment text appears in the result', () => {
    const r = run(
      lines(
        `const k = 'planted-literal-value-1'; // planted-comment-value-2`,
        `process.env.A = 'planted-write-value-3';`,
        '// envdrift-ignore ED001 planted-directive-value-4',
        'const { B = `planted-default-value-5` } = process.env;',
      ),
    );
    const out = JSON.stringify(r);
    for (const v of [
      'planted-literal-value-1',
      'planted-comment-value-2',
      'planted-write-value-3',
      'planted-directive-value-4',
      'planted-default-value-5',
    ]) {
      expect(out).not.toContain(v);
    }
    expect(r.references.map((x) => x.name)).toEqual(['A', 'B']);
  });
});

describe('catalogue sync (PRD §10.1, CLAUDE.md rule 4)', () => {
  const full = readFileSync(
    new URL('../../../../docs/patterns-catalogue.md', import.meta.url),
    'utf8',
  );
  // Rows after the "Retired" heading document old IDs; they need no test.
  const catalogue = full.split('## Retired and changed IDs')[0] ?? '';
  const self = readFileSync(new URL(import.meta.url), 'utf8');
  const ids = [...catalogue.matchAll(/^\| ([PFDN]\d{2}) \|/gm)].map((m) => m[1] as string);
  const tested = new Set([...self.matchAll(/\bit\('([PFDN]\d{2})\b/g)].map((m) => m[1] as string));

  it('every P/F/D/N catalogue row has a test titled with its ID', () => {
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id) => !tested.has(id))).toEqual([]);
  });

  it('every test ID prefix exists in the catalogue (no tests for retired or unknown IDs)', () => {
    expect([...tested].filter((id) => !ids.includes(id))).toEqual([]);
  });
});
