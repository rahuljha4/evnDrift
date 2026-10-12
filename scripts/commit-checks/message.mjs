// Commit message checks (docs/conventions/commits.md §1.1, §1.2). Pure: no git, no I/O.
import { fail } from './report.mjs';

export const TYPES = ['feat', 'fix', 'test', 'refactor', 'docs', 'chore', 'ci', 'build'];
const REPO_SCOPE_TYPES = ['docs', 'chore', 'ci', 'build'];

const VAGUE_HEADS = new Set([
  'fix',
  'fixes',
  'update',
  'updates',
  'change',
  'changes',
  'misc',
  'wip',
  'tweak',
  'tweaks',
  'cleanup',
  'stuff',
  'minor',
  'small',
]);
const GENERIC_OBJECTS = new Set([
  'bug',
  'bugs',
  'code',
  'stuff',
  'thing',
  'things',
  'issue',
  'issues',
  'error',
  'errors',
  'file',
  'files',
  'test',
  'tests',
  'doc',
  'docs',
  'it',
  'this',
  'that',
  'some',
  'a',
  'the',
  'minor',
  'small',
  'misc',
  'changes',
  'change',
  'updates',
  'update',
  'tweaks',
  'tweak',
  'cleanup',
  'up',
  'clean',
]);
// Real imperative verbs that end in "ed" or "ing".
const TENSE_ALLOW = new Set([
  'embed',
  'seed',
  'feed',
  'bring',
  'string',
  'proceed',
  'succeed',
  'exceed',
  'speed',
  'need',
  'breed',
  'bleed',
  'shred',
  'sing',
  'ring',
  'spring',
  'swing',
  'sting',
  'cling',
  'wring',
  'thing',
  'bed',
  'red',
  'wed',
  'shed',
  'sled',
  'weed',
  'heed',
  'reed',
  'deed',
  'king',
  'wing',
  'fling',
  'sling',
  'redeed',
]);

export const EXAMPLE_SUBJECT = 'feat(M1.5): flag missing variables with fallbacks as ED009';

/** Split a raw message into subject, body paragraphs and trailers. */
export function parseMessage(raw) {
  const lines = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => !l.startsWith('#'));
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  const subject = lines[0] ?? '';
  const rest = lines.slice(1);
  const secondBlank = rest.length > 0 && rest[0].trim() === '';
  const bodyLines = secondBlank ? rest.slice(1) : rest;

  // Trailers: the final paragraph if every line looks like `Key: value`.
  const paragraphs = [];
  let cur = [];
  for (const l of bodyLines) {
    if (l.trim() === '') {
      if (cur.length) paragraphs.push(cur);
      cur = [];
    } else cur.push(l);
  }
  if (cur.length) paragraphs.push(cur);
  const isTrailerLine = (l) => /^[A-Za-z][A-Za-z-]*: \S/.test(l);
  let trailers = [];
  if (
    paragraphs.length &&
    paragraphs[paragraphs.length - 1].every(isTrailerLine) &&
    !/^Tests: /i.test(paragraphs[paragraphs.length - 1][0])
  ) {
    trailers = paragraphs.pop().map((l) => {
      const i = l.indexOf(': ');
      return { key: l.slice(0, i), value: l.slice(i + 2).trim(), line: l };
    });
  }
  return { subject, secondBlank, paragraphs, trailers, bodyLines };
}

const parseSubject = (subject) => /^([a-z]+)\(([^)]*)\): (.*)$/.exec(subject);

/**
 * @param {string} raw
 * @param {{ taskIds: string[], stagedFiles: {status:string,path:string}[], addedDeps?: {name:string,file:string}[], newAiLogRows?: number[], review?: object }} ctx
 */
export function checkMessage(raw, ctx) {
  const failures = [];
  const { subject, paragraphs, trailers, secondBlank, bodyLines } = parseMessage(raw);
  const m = parseSubject(subject);

  if (!m || !TYPES.includes(m[1])) {
    failures.push(
      fail(
        'FMT-1',
        'subject must be `<type>(<scope>): <summary>` with a known type',
        subject,
        EXAMPLE_SUBJECT,
      ),
    );
    return failures; // nothing else can be judged reliably
  }
  const [, type, scope, summary] = m;

  if (!(ctx.taskIds.includes(scope) || (scope === 'repo' && REPO_SCOPE_TYPES.includes(type)))) {
    failures.push(
      fail(
        'FMT-2',
        scope === 'repo'
          ? `scope "repo" is only allowed for ${REPO_SCOPE_TYPES.join(', ')} commits`
          : `scope "${scope}" is not a task ID in docs/prd.md §19`,
        subject,
        scope === 'repo' ? `chore(repo): ${summary}` : EXAMPLE_SUBJECT,
      ),
    );
  }
  if (subject.length > 72)
    failures.push(
      fail(
        'FMT-3',
        `subject is ${subject.length} characters; the limit is 72`,
        subject,
        EXAMPLE_SUBJECT,
      ),
    );
  if (/[A-Z]/.test(summary.charAt(0)))
    failures.push(
      fail(
        'FMT-4',
        'summary must start with a lower-case word',
        summary,
        summary.charAt(0).toLowerCase() + summary.slice(1),
      ),
    );
  if (summary.endsWith('.'))
    failures.push(
      fail('FMT-5', 'summary must not end with a period', summary, summary.replace(/\.+$/, '')),
    );
  if (/\p{Extended_Pictographic}/u.test(subject))
    failures.push(fail('Q-5', 'no emojis in the subject', subject, EXAMPLE_SUBJECT));
  if (/\bwip\b/i.test(subject))
    failures.push(fail('Q-4', '"WIP" is not allowed in a subject', subject, EXAMPLE_SUBJECT));

  const words = summary.trim().split(/\s+/).filter(Boolean);
  const lower = words.map((w) => w.toLowerCase().replace(/[^a-z]/g, ''));
  if (words.length < 3)
    failures.push(
      fail(
        'Q-2',
        `summary has ${words.length} word(s); at least 3 are required`,
        summary,
        'flag missing variables with fallbacks as ED009',
      ),
    );
  if (
    lower.length &&
    VAGUE_HEADS.has(lower[0]) &&
    lower.every((w) => VAGUE_HEADS.has(w) || GENERIC_OBJECTS.has(w))
  ) {
    failures.push(
      fail(
        'Q-1',
        'summary is a vague word or phrase; name the rule, command, parser or behaviour',
        summary,
        'reject unterminated quotes in dotenv values',
      ),
    );
  }
  const first = lower[0] ?? '';
  if (first && /(ed|ing)$/.test(first) && !TENSE_ALLOW.has(first)) {
    failures.push(
      fail(
        'Q-3',
        'summary must start with an imperative verb (not past tense or -ing)',
        words[0],
        `${first.replace(/(ing|ed)$/, '')}… (e.g. "add", "handle", "reject")`,
      ),
    );
  }

  // Body ------------------------------------------------------------------
  const srcFiles = ctx.stagedFiles.filter((f) => /^packages\/[^/]+\/src\//.test(f.path));
  const bodyRequired = type === 'feat' || type === 'fix' || srcFiles.length > 1;
  const bodyText = paragraphs.map((p) => p.join('\n')).join('\n\n');
  const hasBody = bodyText.trim() !== '';
  const testsLine = /^Tests: \S/m.test(bodyText);
  const whyWhat = paragraphs.filter((p) => !/^Tests: /.test(p[0]));
  if (bodyLines.length && !secondBlank)
    failures.push(
      fail(
        'FMT-6',
        'a blank line must separate the subject from the body',
        bodyLines[0],
        '(add an empty line after the subject)',
      ),
    );

  if (bodyRequired && !hasBody) {
    failures.push(
      fail(
        'BODY-1',
        `a body is required (${type === 'feat' || type === 'fix' ? `every ${type} commit` : 'more than one file under packages/*/src is staged'})`,
        subject,
        'Paragraph 1: why (cite the PRD section). Paragraph 2: what. Then "Tests: …".',
      ),
    );
  }
  if (hasBody && onlyFileNames(paragraphs.flat())) {
    failures.push(
      fail(
        'BODY-2',
        'the body is only a list of file names; explain why and what instead',
        paragraphs.flat()[0],
        'PRD §11 splits missing variables into two cases … (why), then what the change does.',
      ),
    );
  }
  if (hasBody) {
    const long = bodyLines.find(
      (l) => l.length > 72 && /\s/.test(l.trim()) && !/^[A-Za-z][A-Za-z-]*: /.test(l),
    );
    if (long)
      failures.push(
        fail(
          'FMT-7',
          `body line is ${long.length} characters; wrap at 72`,
          long.slice(0, 80) + '…',
          '(wrap the paragraph at 72 characters)',
        ),
      );
  }
  if (type === 'feat' || type === 'fix') {
    if (hasBody && whyWhat.length < 2)
      failures.push(
        fail(
          'BODY-3',
          'the body needs a "why" paragraph and a "what" paragraph',
          undefined,
          'Paragraph 1: the problem or PRD requirement. Paragraph 2: the approach and what was left out.',
        ),
      );
    if (hasBody && !testsLine)
      failures.push(
        fail(
          'BODY-4',
          'the body needs a "Tests:" line saying what the tests cover',
          undefined,
          'Tests: positive, negative, and suppression cases; mixed references where one lacks a fallback.',
        ),
      );
  }

  // Trailers ----------------------------------------------------------------
  const trailer = (key) => trailers.filter((t) => t.key.toLowerCase() === key.toLowerCase());
  if (
    (type === 'feat' || type === 'fix') &&
    !trailer('Refs').some((t) => /^docs\/prd\.md §\S/.test(t.value))
  ) {
    failures.push(
      fail(
        'TRL-1',
        '`Refs: docs/prd.md §<section>` trailer is required for feat and fix',
        undefined,
        'Refs: docs/prd.md §11',
      ),
    );
  }
  for (const dep of ctx.addedDeps ?? []) {
    const ok = trailer('Dependency').some(
      (t) => t.value.startsWith(`${dep.name} `) && /^.+? (—|–|--|-) \S/.test(t.value),
    );
    if (!ok)
      failures.push(
        fail(
          'TRL-2',
          `dependency "${dep.name}" added to ${dep.file} without a Dependency trailer`,
          dep.file,
          `Dependency: ${dep.name} — <what it does and why the standard library is not enough>`,
        ),
      );
  }
  const testChanged = (pkg) =>
    ctx.stagedFiles.some((f) => f.path.startsWith(`packages/${pkg}/test/`));
  const pkgsMissingTests = [...new Set(srcFiles.map((f) => f.path.split('/')[1]))].filter(
    (p) => !testChanged(p),
  );
  if (pkgsMissingTests.length && !trailer('No-test-reason').some((t) => t.value.length > 0)) {
    failures.push(
      fail(
        'TST-1',
        `source changed in packages/${pkgsMissingTests.join(', packages/')} without a test change`,
        srcFiles.find((f) => f.path.startsWith(`packages/${pkgsMissingTests[0]}/`)).path,
        'Stage the tests, or add `No-test-reason: <why no test is needed>`.',
      ),
    );
  }
  const staged = (p) => ctx.stagedFiles.some((f) => f.path === p);
  if (
    ctx.stagedFiles.some((f) => f.path.startsWith('packages/core/src/rules/')) &&
    !staged('docs/rules.md') &&
    !/docs\/rules\.md/.test(bodyText)
  ) {
    failures.push(
      fail(
        'DOC-1',
        'a rule file changed but docs/rules.md did not and the body does not say why',
        'packages/core/src/rules/',
        'Update docs/rules.md, or write in the body why it is unchanged (mention docs/rules.md).',
      ),
    );
  }
  if (
    ctx.stagedFiles.some((f) => f.path.startsWith('packages/core/src/extract/')) &&
    !staged('docs/patterns-catalogue.md') &&
    !/docs\/patterns-catalogue\.md/.test(bodyText)
  ) {
    failures.push(
      fail(
        'DOC-2',
        'the extractor changed but docs/patterns-catalogue.md did not and the body does not say why',
        'packages/core/src/extract/',
        'Update the catalogue row, or write in the body why it is unchanged (mention docs/patterns-catalogue.md).',
      ),
    );
  }
  const rows = ctx.newAiLogRows ?? [];
  if (rows.length) {
    const have = new Set(
      trailer('AI-log').flatMap((t) => [...t.value.matchAll(/#(\d+)/g)].map((x) => Number(x[1]))),
    );
    const missing = rows.filter((n) => !have.has(n));
    if (missing.length)
      failures.push(
        fail(
          'TRL-3',
          `docs/ai-log.md gained row(s) ${missing.map((n) => `#${n}`).join(', ')} without an AI-log trailer`,
          'docs/ai-log.md',
          `AI-log: ${rows.map((n) => `#${n}`).join(', ')}`,
        ),
      );
  }
  return failures;
}

/** True when every non-empty body line is just file path(s). */
export function onlyFileNames(lines) {
  const items = lines.map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean);
  if (!items.length) return false;
  const looksLikeFile = (t) =>
    /^[\w@./-]+\.[A-Za-z0-9]{1,6}$/.test(t) || /^[\w@.-]+\/[\w@./-]*$/.test(t);
  return items.every((l) =>
    l
      .split(/[,\s]+/)
      .filter(Boolean)
      .every(looksLikeFile),
  );
}
