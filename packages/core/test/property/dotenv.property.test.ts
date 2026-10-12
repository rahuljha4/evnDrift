import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseDotenv } from '../../src/parse/dotenv.ts';

const F = 'x.env';

describe('property: dotenv parser', () => {
  it('never throws on arbitrary text', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (text) => {
        parseDotenv(text, F);
      }),
    );
  });

  it('never throws on arbitrary line arrays', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ unit: 'grapheme' })), (lines) => {
        parseDotenv(lines.join('\n'), F);
      }),
    );
  });

  it('is deterministic', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        expect(parseDotenv(text, F)).toEqual(parseDotenv(text, F));
      }),
    );
  });

  it('never outputs a value', () => {
    // Keys are upper-case, values use a disjoint lower-case/digit alphabet with a marker,
    // so a value substring can never come from a key, the file name or a warning template.
    const key = fc.stringMatching(/^[A-Z][A-Z_]{2,8}$/);
    const value = fc.stringMatching(/^[a-z0-9]{12,24}$/).map((v) => `zq9${v}`);
    const style = fc.constantFrom('plain', 'single', 'double', 'tick', 'inline');
    const entry = fc.record({ key, value, style });

    fc.assert(
      fc.property(fc.array(entry, { minLength: 1, maxLength: 12 }), (entries) => {
        const text = entries
          .map(({ key: k, value: v, style: s }) => {
            switch (s) {
              case 'single':
                return `${k}='${v}'`;
              case 'double':
                return `${k}="${v}"`;
              case 'tick':
                return `${k}=\`${v}\``;
              case 'inline':
                return `${k}=${v} # ${v}`;
              default:
                return `${k}=${v}`;
            }
          })
          .join('\n');
        const out = JSON.stringify(parseDotenv(text, F));
        for (const { value: v } of entries) expect(out).not.toContain(v);
      }),
    );
  });
});
