import { describe, expect, it } from 'vitest';
import { parseDotenv } from '../../src/parse/dotenv.ts';

const F = '.env.example';
const names = (text: string) => parseDotenv(text, F).declarations.map((d) => d.name);
const decl = (text: string, name: string) =>
  parseDotenv(text, F).declarations.find((d) => d.name === name);

describe('FR-SRC-05: dotenv parser', () => {
  it('FR-SRC-05: reads plain KEY=value with file, 1-based line and flags', () => {
    const r = parseDotenv('A=1\n\nB=two\n', F);
    expect(r.declarations).toEqual([
      { name: 'A', file: F, line: 1, hasValue: true, looksSecret: false },
      { name: 'B', file: F, line: 3, hasValue: true, looksSecret: false },
    ]);
    expect(r.warnings).toEqual([]);
    expect(r.comments).toEqual([]);
  });

  it('FR-SRC-05: accepts export prefix', () => {
    expect(names('export A=1\nexport   B=2')).toEqual(['A', 'B']);
  });

  it('FR-SRC-05: a key literally named export is not a prefix', () => {
    expect(names('export=1')).toEqual(['export']);
  });

  it('FR-SRC-05: handles single, double and backtick quotes', () => {
    const r = parseDotenv(`A='x'\nB="y"\nC=\`z\``, F);
    expect(r.declarations.map((d) => [d.name, d.hasValue])).toEqual([
      ['A', true],
      ['B', true],
      ['C', true],
    ]);
  });

  it('FR-SRC-05: reads multi-line double-quoted values and keeps later line numbers right', () => {
    const r = parseDotenv('A="line1\nline2\nline3"\nB=1', F);
    expect(r.declarations.map((d) => [d.name, d.line])).toEqual([
      ['A', 1],
      ['B', 4],
    ]);
  });

  it('FR-SRC-05: escaped quote does not close a double-quoted value', () => {
    const r = parseDotenv('A="a\\"b"\nB=1', F);
    expect(r.declarations.map((d) => d.name)).toEqual(['A', 'B']);
    expect(r.warnings).toEqual([]);
  });

  it('FR-SRC-05: KEY= has no value', () => {
    expect(decl('A=', 'A')?.hasValue).toBe(false);
  });

  it('FR-SRC-05: empty quoted value has no value', () => {
    expect(decl('A=""\nB=\'\'', 'A')?.hasValue).toBe(false);
    expect(decl('A=""\nB=\'\'', 'B')?.hasValue).toBe(false);
  });

  it('FR-SRC-05: bare KEY (no =) is a declaration without value', () => {
    const r = parseDotenv('A\n', F);
    expect(r.declarations).toEqual([
      { name: 'A', file: F, line: 1, hasValue: false, looksSecret: false },
    ]);
  });

  it('FR-SRC-05: # inside quotes is part of the value, not a comment', () => {
    const r = parseDotenv('A="a # b"\nB=2', F);
    expect(r.declarations.map((d) => d.name)).toEqual(['A', 'B']);
    expect(decl('A="a # b"', 'A')?.hasValue).toBe(true);
  });

  it('FR-SRC-05: inline comment after unquoted value is stripped', () => {
    expect(decl('A=a # comment', 'A')?.hasValue).toBe(true);
    expect(decl('A= # only comment', 'A')?.hasValue).toBe(false);
  });

  it('FR-SRC-05: strips UTF-8 BOM', () => {
    expect(names('﻿A=1')).toEqual(['A']);
  });

  it('FR-SRC-05: supports CRLF line endings', () => {
    const r = parseDotenv('A=1\r\nB=\r\nC="x\r\ny"\r\nD=4\r\n', F);
    expect(r.declarations.map((d) => [d.name, d.line, d.hasValue])).toEqual([
      ['A', 1, true],
      ['B', 2, false],
      ['C', 3, true],
      ['D', 5, true],
    ]);
  });

  it('FR-SRC-05: duplicate key keeps first occurrence and warns with names and lines', () => {
    const r = parseDotenv('A=1\nB=2\nA=3', F);
    expect(r.declarations.map((d) => [d.name, d.line])).toEqual([
      ['A', 1],
      ['B', 2],
    ]);
    expect(r.warnings).toEqual([`${F}: duplicate key A (lines 1, 3)`]);
  });

  it('FR-SRC-05: invalid line warns with line number only and is skipped', () => {
    const r = parseDotenv('A=1\nthis is not valid\nB=2', F);
    expect(r.declarations.map((d) => d.name)).toEqual(['A', 'B']);
    expect(r.warnings).toEqual([`${F}:2: invalid line`]);
  });

  it('FR-SRC-05: unterminated double quote does not swallow later keys', () => {
    const r = parseDotenv('A="never closed\nB=2\nC=3', F);
    expect(r.declarations.map((d) => d.name)).toEqual(['A', 'B', 'C']);
    expect(r.warnings).toEqual([`${F}:1: unterminated quote`]);
  });

  it('FR-SRC-05: names that collide with Object.prototype members are safe', () => {
    const r = parseDotenv('__proto__=1\nconstructor=2\nhasOwnProperty=3', F);
    expect(r.declarations.map((d) => d.name)).toEqual([
      '__proto__',
      'constructor',
      'hasOwnProperty',
    ]);
    expect(r.warnings).toEqual([]);
  });

  it('FR-SRC-05: empty and comment-only input give nothing', () => {
    expect(parseDotenv('', F)).toEqual({ declarations: [], comments: [], warnings: [] });
    expect(parseDotenv('# just a comment\n\n', F).declarations).toEqual([]);
  });

  it('FR-SRC-05: spaces around = and key are tolerated', () => {
    expect(names('  A = 1  ')).toEqual(['A']);
  });

  it('FR-SRC-05: only envdrift-ignore comments are returned, sanitised to rule IDs', () => {
    const text = [
      '# plain comment',
      '# envdrift-ignore ED003 ED004',
      'A=1',
      '#envdrift-ignore',
      'B=2',
      '# envdrift-ignore ED008 trailing words and tokens',
      'C=3',
    ].join('\n');
    expect(parseDotenv(text, F).comments).toEqual([
      { line: 2, text: 'envdrift-ignore ED003 ED004' },
      { line: 4, text: 'envdrift-ignore' },
      { line: 6, text: 'envdrift-ignore ED008' },
    ]);
  });

  it('FR-SRC-05: unterminated single and backtick quotes warn and keep later keys', () => {
    const r = parseDotenv("A='open\nB=`open\nC=3", F);
    expect(r.declarations.map((d) => [d.name, d.line, d.hasValue])).toEqual([
      ['A', 1, true],
      ['B', 2, true],
      ['C', 3, true],
    ]);
    expect(r.warnings).toEqual([`${F}:1: unterminated quote`, `${F}:2: unterminated quote`]);
  });

  it('FR-SRC-05: lone quote with nothing after it has no value', () => {
    expect(decl('A="', 'A')?.hasValue).toBe(false);
  });

  it('FR-SRC-05: envdrift-ignore near-misses are not returned', () => {
    const text = [
      '# envdrift-ignore-file ED005',
      '#envdrift-ignorex ED003',
      '# not-envdrift-ignore ED003',
      '# envdrift ignore ED003',
      'A=1',
    ].join('\n');
    expect(parseDotenv(text, F).comments).toEqual([]);
  });

  it('FR-SRC-05: tab-separated directive is returned', () => {
    expect(parseDotenv('#\tenvdrift-ignore\tED003', F).comments).toEqual([
      { line: 1, text: 'envdrift-ignore ED003' },
    ]);
  });

  it('FR-SRC-05: double-quoted value longer than 100 lines is unterminated', () => {
    const filler = Array.from({ length: 150 }, () => '# c').join('\n');
    const r = parseDotenv(`A="\n${filler}\n"\nB=2`, F);
    // Warnings sort lexicographically (data-model §4), so ':152' precedes ':1:'.
    expect(r.warnings).toEqual([`${F}:152: invalid line`, `${F}:1: unterminated quote`]);
    expect(r.declarations.map((d) => d.name)).toEqual(['A', 'B']);
  });

  it('FR-SRC-05: multi-line value just inside the cap is accepted', () => {
    const body = Array.from({ length: 50 }, () => 'x').join('\n');
    const r = parseDotenv(`A="${body}\n"\nB=2`, F);
    expect(r.warnings).toEqual([]);
    expect(r.declarations.map((d) => [d.name, d.line])).toEqual([
      ['A', 1],
      ['B', 52],
    ]);
  });

  it('FR-SRC-05: hostile repeated quote lines stay bounded and report one declaration', () => {
    const text = 'A="\n'.repeat(20000);
    // No wall-clock assertion: a quadratic scan would blow the default Vitest timeout.
    const r = parseDotenv(text, F);
    expect(r.declarations).toHaveLength(1);
  });
});

describe('ADR 0006: dotenv parser redaction', () => {
  const planted = [
    'planted-plain-value-111',
    'planted-single-222',
    'planted-double-333',
    'planted-tick-444',
    'planted-multi-555',
    'planted-multi-666',
    'planted-inline-777',
    'planted-export-888',
    'planted-commented-999',
    'planted-invalid-000',
    'planted-unterminated-123',
    'planted-dupe-456',
    'planted-ignore-789',
  ];
  const text = [
    `PLAIN=${planted[0]}`,
    `SINGLE='${planted[1]}'`,
    `DOUBLE="${planted[2]}"`,
    `TICK=\`${planted[3]}\``,
    `MULTI="${planted[4]}`,
    `${planted[5]}"`,
    `INLINE=x # ${planted[6]}`,
    `export EXPORTED=${planted[7]}`,
    `# COMMENTED=${planted[8]}`,
    `not valid ${planted[9]}`,
    `UNTERM="${planted[10]}`,
    'DUPE=a',
    `DUPE=${planted[11]}`,
    `# envdrift-ignore ED003 ${planted[12]}`,
    'LAST=1',
  ].join('\n');

  it('ADR 0006: no planted value appears anywhere in the result', () => {
    const out = JSON.stringify(parseDotenv(text, F));
    for (const value of planted) expect(out).not.toContain(value);
  });
});
