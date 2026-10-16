import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lookup, lookupPattern, lookupPrd, lookupRule } from './doc-lookup.mjs';

const PRD = [
  '# PRD',
  '## 6. Locked decisions',
  '| # | Decision |',
  '| D5 | fallback gives ED009 |',
  '| D50 | not D5 |',
  '## 10. Extraction',
  '### 10.1 JS/TS',
  'patterns here',
  '```',
  '## not a heading',
  '```',
  '### 10.2 Dotenv',
  'dotenv here',
  '## 11. Rules',
  'rules text',
  '### Suppression',
  'suppress text',
  '## 12. Config',
  '| M2.3 | scan command | acceptance |',
].join('\n');

describe('lookupPrd', () => {
  it('prints a whole section including its subsections, stopping at the next section', () => {
    expect(lookupPrd(PRD, '11')).toBe('## 11. Rules\nrules text\n### Suppression\nsuppress text');
  });
  it('prints a subsection only, ignoring "## " inside a code fence', () => {
    expect(lookupPrd(PRD, '10.1')).toBe(
      '### 10.1 JS/TS\npatterns here\n```\n## not a heading\n```',
    );
  });
  it('does not match section 1 for 11 or 10', () => {
    expect(lookupPrd(PRD, '1')).toBeNull();
  });
  it('finds a decision row by exact ID', () => {
    expect(lookupPrd(PRD, 'D5')).toBe('| D5 | fallback gives ED009 |');
  });
  it('finds a task row', () => {
    expect(lookupPrd(PRD, 'M2.3')).toBe('| M2.3 | scan command | acceptance |');
  });
  it('returns null for a missing entry or an unknown form', () => {
    expect(lookupPrd(PRD, 'D9')).toBeNull();
    expect(lookupPrd(PRD, 'banana')).toBeNull();
  });
});

describe('lookupRule / lookupPattern', () => {
  const rules =
    '# Rules\n## ED002 — missing\ntext 2\n## ED009 — masks\ntext 9\nmore 9\n## ED010 — x\n';
  it('prints only the requested rule', () => {
    expect(lookupRule(rules, 'ED009')).toBe('## ED009 — masks\ntext 9\nmore 9');
  });
  it('returns null for an unknown rule', () => {
    expect(lookupRule(rules, 'ED001')).toBeNull();
  });
  const cat = '| ID | Pattern |\n| P07 | computed member |\n| P070 | other |\n';
  it('prints the catalogue row for an exact ID only', () => {
    expect(lookupPattern(cat, 'P07')).toBe('| P07 | computed member |');
    expect(lookupPattern(cat, 'P08')).toBeNull();
  });
});

describe('lookup (CLI core)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'envdrift-docs-'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'prd.md'), PRD);
  writeFileSync(join(dir, 'rules.md'), '## ED009 — masks\ntext 9\n');
  writeFileSync(join(dir, 'patterns-catalogue.md'), '| P01 | x |\n');

  it('exits 0 with the text on a hit', () => {
    expect(lookup('rule', 'ED009', dir)).toEqual({ code: 0, out: '## ED009 — masks\ntext 9' });
    expect(lookup('pattern', 'P01', dir)).toEqual({ code: 0, out: '| P01 | x |' });
  });
  it('exits 1 with a one-line message on a miss', () => {
    expect(lookup('prd', '99', dir)).toEqual({ code: 1, out: 'doc-lookup: no prd entry for 99' });
  });
  it('exits 2 on bad usage', () => {
    expect(lookup('rule', 'nope', dir).code).toBe(2);
    expect(lookup('wat', 'x', dir).code).toBe(2);
    expect(lookup(undefined, undefined, dir).code).toBe(2);
  });
});
