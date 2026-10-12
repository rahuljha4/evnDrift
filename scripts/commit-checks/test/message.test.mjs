import { describe, expect, it } from 'vitest';
import { checkMessage, onlyFileNames, parseMessage } from '../message.mjs';

const taskIds = ['M1.5', 'M2.1', 'M2.3'];
const f = (path, status = 'M') => ({ status, path });
const ctx = (over = {}) => ({
  taskIds,
  stagedFiles: [f('docs/x.md')],
  addedDeps: [],
  newAiLogRows: [],
  ...over,
});
const rules = (raw, c = ctx()) => checkMessage(raw, c).map((x) => x.rule);

const GOOD_BODY = `PRD §11 and decision D5 split missing variables into two cases.
A read without a fallback crashes, so it stays an ED002 error.

ED009 fires only when every reference to the variable has a fallback.

Tests: positive, negative, and suppression cases.

Refs: docs/prd.md §11`;
const GOOD = `feat(M1.5): report missing variables with fallbacks as ED009\n\n${GOOD_BODY}\n`;
const srcCtx = () =>
  ctx({
    stagedFiles: [
      f('packages/core/src/rules/ED009.ts'),
      f('packages/core/test/rules/ED009.test.ts'),
      f('docs/rules.md'),
    ],
  });

describe('the full example from docs/conventions/commits.md', () => {
  it('passes every rule', () => {
    expect(checkMessage(GOOD, srcCtx())).toEqual([]);
  });
});

describe('FMT: subject format', () => {
  it('FMT-1 rejects a subject that is not <type>(<scope>): <summary>', () => {
    expect(rules('update stuff')).toEqual(['FMT-1']);
    expect(rules('feature(M1.5): add the thing now')).toEqual(['FMT-1']);
  });
  it('FMT-1 accepts every allowed type', () => {
    for (const t of ['feat', 'fix', 'test', 'refactor', 'docs', 'chore', 'ci', 'build']) {
      expect(rules(`${t}(repo): document the commit conventions`)).not.toContain('FMT-1');
    }
  });
  it('FMT-2 rejects a scope that is not a PRD §19 task ID', () => {
    expect(rules('docs(M9.9): document the commit conventions')).toContain('FMT-2');
  });
  it('FMT-2 allows `repo` only for docs, chore, ci and build', () => {
    expect(rules('docs(repo): document the commit conventions')).not.toContain('FMT-2');
    expect(rules('feat(repo): add a brand new thing here')).toContain('FMT-2');
  });
  it('FMT-3 rejects a subject longer than 72 characters', () => {
    expect(rules(`docs(repo): ${'describe the rule precisely '.repeat(4)}`)).toContain('FMT-3');
    expect(rules('docs(repo): describe the rule precisely')).not.toContain('FMT-3');
  });
  it('FMT-4 requires a lower-case first word', () => {
    expect(rules('docs(repo): Document the commit conventions')).toContain('FMT-4');
  });
  it('FMT-5 rejects a trailing period', () => {
    expect(rules('docs(repo): document the commit conventions.')).toContain('FMT-5');
  });
  it('FMT-6 requires a blank line between subject and body', () => {
    expect(rules('docs(repo): document the commit conventions\nbody text directly')).toContain(
      'FMT-6',
    );
    expect(
      rules('docs(repo): document the commit conventions\n\nbody text after a blank'),
    ).not.toContain('FMT-6');
  });
  it('FMT-7 rejects body lines longer than 72 characters but not long URLs', () => {
    const long = `${'word '.repeat(20)}end`;
    expect(rules(`docs(repo): document the commit conventions\n\n${long}`)).toContain('FMT-7');
    expect(
      rules(`docs(repo): document the commit conventions\n\nhttps://example.com/${'a'.repeat(90)}`),
    ).not.toContain('FMT-7');
  });
});

describe('Q: message quality', () => {
  it('Q-1 rejects vague summaries', () => {
    for (const s of [
      'fix bug',
      'update code',
      'small changes',
      'misc',
      'cleanup stuff',
      'minor tweaks',
      'updates',
      'fix it',
    ]) {
      expect(rules(`chore(repo): ${s}`)).toContain('Q-1');
    }
  });
  it('Q-1 accepts a specific summary that merely starts with a vague-looking word', () => {
    expect(rules('fix(M2.1): fix crash on unterminated quotes in dotenv values')).not.toContain(
      'Q-1',
    );
    expect(rules('chore(repo): update lockfile for vitest 5.0.3')).not.toContain('Q-1');
  });
  it('Q-2 rejects summaries shorter than 3 words', () => {
    expect(rules('docs(repo): add notes')).toContain('Q-2');
    expect(rules('docs(repo): add commit notes')).not.toContain('Q-2');
  });
  it('Q-3 rejects past tense and -ing first words', () => {
    expect(rules('feat(M1.5): added ED009 rule for fallbacks')).toContain('Q-3');
    expect(rules('feat(M1.5): adding ED009 rule for fallbacks')).toContain('Q-3');
    expect(rules('fix(M2.1): fixed vague summary detection')).toContain('Q-3');
  });
  it('Q-3 allows imperative verbs that end in ed or ing', () => {
    for (const v of ['embed', 'seed', 'feed', 'bring', 'string', 'proceed', 'speed', 'need']) {
      expect(rules(`chore(repo): ${v} the fixtures into the build`)).not.toContain('Q-3');
    }
  });
  it('Q-4 rejects WIP', () => {
    expect(rules('chore(repo): wip on the hooks setup now')).toContain('Q-4');
  });
  it('Q-5 rejects emojis', () => {
    expect(rules('chore(repo): add the hooks setup 🚀')).toContain('Q-5');
    expect(rules('chore(repo): add the hooks setup')).not.toContain('Q-5');
  });
});

describe('BODY: body requirements', () => {
  const feat = (extra = '') =>
    `feat(M1.5): report missing variables with fallbacks as ED009${extra}`;
  it('BODY-1 requires a body for feat and fix', () => {
    expect(rules(feat())).toContain('BODY-1');
    expect(rules('fix(M2.1): reject unterminated quotes in dotenv values')).toContain('BODY-1');
    expect(rules(GOOD)).not.toContain('BODY-1');
  });
  it('BODY-1 requires a body when more than one file under packages/*/src is staged', () => {
    const two = ctx({
      stagedFiles: [
        f('packages/core/src/a.ts'),
        f('packages/core/src/b.ts'),
        f('packages/core/test/a.test.ts'),
      ],
    });
    expect(rules('refactor(M1.5): split the rule runner into two modules', two)).toContain(
      'BODY-1',
    );
    const one = ctx({
      stagedFiles: [f('packages/core/src/a.ts'), f('packages/core/test/a.test.ts')],
    });
    expect(rules('refactor(M1.5): split the rule runner into two modules', one)).not.toContain(
      'BODY-1',
    );
  });
  it('BODY-2 rejects a body that only lists file names', () => {
    const msg = `${feat()}\n\n- packages/core/src/rules/ED009.ts\n- packages/core/test/rules/ED009.test.ts\n- docs/rules.md\n`;
    expect(rules(msg, srcCtx())).toContain('BODY-2');
    expect(onlyFileNames(['ED009.ts, ED001.ts'])).toBe(true);
    expect(onlyFileNames(['PRD §11 splits the cases'])).toBe(false);
  });
  it('BODY-3 requires a why paragraph and a what paragraph for feat and fix', () => {
    const msg = `${feat()}\n\nOne paragraph only explaining the reason.\n\nTests: positive and negative.\n\nRefs: docs/prd.md §11\n`;
    expect(rules(msg, srcCtx())).toContain('BODY-3');
    expect(rules(GOOD, srcCtx())).not.toContain('BODY-3');
  });
  it('BODY-4 requires a Tests: line for feat and fix', () => {
    const msg = `${feat()}\n\nWhy this change exists.\n\nWhat the change does.\n\nRefs: docs/prd.md §11\n`;
    expect(rules(msg, srcCtx())).toContain('BODY-4');
    expect(rules(GOOD, srcCtx())).not.toContain('BODY-4');
  });
});

describe('TRL: trailers', () => {
  it('TRL-1 requires a Refs trailer on feat and fix', () => {
    const msg = GOOD.replace('\nRefs: docs/prd.md §11\n', '');
    expect(rules(msg, srcCtx())).toContain('TRL-1');
    expect(rules(GOOD, srcCtx())).not.toContain('TRL-1');
  });
  it('TRL-2 requires a Dependency trailer for each added dependency', () => {
    const c = { ...srcCtx(), addedDeps: [{ name: 'zod', file: 'packages/core/package.json' }] };
    expect(rules(GOOD, c)).toContain('TRL-2');
    const ok = `${GOOD}Dependency: zod — config validation with readable error paths\n`;
    expect(rules(ok, c)).not.toContain('TRL-2');
  });
  it('TRL-3 requires an AI-log trailer when ai-log.md gains rows', () => {
    const c = { ...srcCtx(), newAiLogRows: [3, 4] };
    expect(rules(GOOD, c)).toContain('TRL-3');
    expect(rules(`${GOOD}AI-log: #3, #4\n`, c)).not.toContain('TRL-3');
    expect(rules(`${GOOD}AI-log: #3\n`, c)).toContain('TRL-3');
  });
});

describe('staged-change rules that need the message', () => {
  const src = ctx({ stagedFiles: [f('packages/core/src/parse/dotenv.ts')] });
  it('TST-1 requires a test change in the same package or a No-test-reason trailer', () => {
    const msg = 'refactor(M1.5): rename a private helper in the parser';
    expect(rules(msg, src)).toContain('TST-1');
    expect(
      rules(`${msg}\n\nNo-test-reason: pure rename, covered by existing tests\n`, src),
    ).not.toContain('TST-1');
    const withTest = ctx({
      stagedFiles: [
        f('packages/core/src/parse/dotenv.ts'),
        f('packages/core/test/parse/dotenv.test.ts'),
      ],
    });
    expect(rules(msg, withTest)).not.toContain('TST-1');
  });
  it('TST-1 requires the test to be in the same package', () => {
    const other = ctx({
      stagedFiles: [f('packages/core/src/a.ts'), f('packages/cli/test/b.test.ts')],
    });
    expect(rules('refactor(M1.5): rename a private helper in the parser', other)).toContain(
      'TST-1',
    );
  });
  it('DOC-1 requires docs/rules.md for rule changes, or a body that says why not', () => {
    const c = ctx({
      stagedFiles: [
        f('packages/core/src/rules/ED009.ts'),
        f('packages/core/test/rules/ED009.test.ts'),
      ],
    });
    expect(rules(GOOD, c)).toContain('DOC-1');
    expect(rules(GOOD, srcCtx())).not.toContain('DOC-1');
    const why = GOOD.replace(
      'Tests:',
      'docs/rules.md is unchanged because the explain text already matches.\n\nTests:',
    );
    expect(rules(why, c)).not.toContain('DOC-1');
  });
  it('DOC-2 requires docs/patterns-catalogue.md for extractor changes, or a body that says why not', () => {
    const c = ctx({
      stagedFiles: [
        f('packages/core/src/extract/js.ts'),
        f('packages/core/test/extract/js.test.ts'),
      ],
    });
    expect(rules(GOOD, c)).toContain('DOC-2');
    const ok = ctx({ stagedFiles: [...c.stagedFiles, f('docs/patterns-catalogue.md')] });
    expect(rules(GOOD, ok)).not.toContain('DOC-2');
  });
});

describe('parseMessage', () => {
  it('splits subject, body paragraphs and trailers and strips # comment lines', () => {
    const p = parseMessage(
      'docs(repo): a b c\n\nWhy.\n\nWhat.\n\nRefs: docs/prd.md §1\nCo-Authored-By: X <x@y>\n# comment\n',
    );
    expect(p.subject).toBe('docs(repo): a b c');
    expect(p.paragraphs).toEqual([['Why.'], ['What.']]);
    expect(p.trailers.map((t) => t.key)).toEqual(['Refs', 'Co-Authored-By']);
  });
  it('does not treat a final Tests: paragraph as trailers', () => {
    expect(parseMessage('docs(repo): a b c\n\nWhy.\n\nTests: x.\n').trailers).toEqual([]);
  });
});
