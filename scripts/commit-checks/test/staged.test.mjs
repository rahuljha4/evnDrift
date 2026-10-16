import { describe, expect, it } from 'vitest';
import { checkSecrets, entropy } from '../secrets.mjs';
import { parseAddedLines } from '../git.mjs';
import { addedDependencies, checkStagedFiles, newAiLogRows } from '../staged.mjs';
import { parseTaskIds } from '../tasks.mjs';

const f = (path, status = 'A') => ({ status, path });
const rules = (files, size = () => 10) => checkStagedFiles(files, size).map((x) => x.rule);

describe('checkStagedFiles', () => {
  it('ENV-1 blocks .env files except example, sample, template and fixtures', () => {
    expect(rules([f('.env'), f('apps/web/.env.production')])).toEqual(['ENV-1', 'ENV-1']);
    expect(
      rules([f('.env.example'), f('.env.sample'), f('.env.template'), f('fixtures/demo/.env')]),
    ).toEqual([]);
  });
  it('SIZE-1 blocks files over 1 MB', () => {
    expect(rules([f('big.bin')], () => 1024 * 1024 + 1)).toEqual(['SIZE-1']);
    expect(rules([f('ok.bin')], () => 1024 * 1024)).toEqual([]);
  });
  it('BUILD-1 blocks build output, coverage and node_modules', () => {
    expect(
      rules([
        f('packages/cli/dist/bin.js'),
        f('coverage/x.html'),
        f('node_modules/a/b.js'),
        f('a.tgz'),
      ]),
    ).toEqual(['BUILD-1', 'BUILD-1', 'BUILD-1', 'BUILD-1']);
    expect(rules([f('packages/cli/src/dist-utils.ts')])).toEqual([]);
  });
  it('ignores deleted files', () => {
    expect(rules([f('.env', 'D')])).toEqual([]);
  });
});

describe('checkSecrets', () => {
  const line = (text, path = 'src/a.ts') => [{ path, line: 3, text }];
  it('does not flag lower-case kebab-case slugs such as heading anchors and report file names', () => {
    const slug = '[PRD](../prd.md#17-ai-assisted-development-plan-35-of-the-score)';
    expect(checkSecrets(line(slug, 'docs/a.md'))).toEqual([]);
    expect(
      checkSecrets(line('see docs/reviews/2026-10-13-review-eval-run6.md', 'docs/a.md')),
    ).toEqual([]);
  });
  it('still flags a mixed-case token that merely contains hyphens', () => {
    expect(
      checkSecrets(line('token: q8Zr2LmV-9xTb4NwK7pYc3HsD', 'docs/a.md')).map((x) => x.rule),
    ).toEqual(['SECRET-2']);
  });
  it('does not scan the setup prompts, which restate the prefix list, but scans other docs', () => {
    expect(checkSecrets(line('prefixes: sk_live_, ghp_', 'docs/setup/prompt.md'))).toEqual([]);
    expect(
      checkSecrets(line('prefixes: sk_live_, ghp_', 'docs/other.md')).map((x) => x.rule),
    ).toEqual(['SECRET-1']);
  });
  it('SECRET-1 flags known key prefixes', () => {
    for (const v of [
      'sk_live_abc',
      'sk_test_abc',
      'ghp_abc',
      'github_pat_abc',
      'AKIAABC',
      'ASIAABC',
      'xoxb-1',
      'xoxp-1',
      'AIzaX',
      '-----BEGIN PRIVATE KEY-----',
    ]) {
      expect(checkSecrets(line(`const k = '${v}';`)).map((x) => x.rule)).toEqual(['SECRET-1']);
    }
  });
  it('SECRET-2 flags 20+ char high-entropy tokens that mix letters and digits', () => {
    expect(checkSecrets(line('const t = "q8Zr2LmV9xTb4NwK7pYc3HsD";')).map((x) => x.rule)).toEqual([
      'SECRET-2',
    ]);
    expect(entropy('aaaaaaaaaaaaaaaaaaaaaaaa')).toBe(0);
  });
  it('does not flag ordinary code, identifiers, paths, git SHAs or sha256 digests', () => {
    expect(checkSecrets(line('export function shouldParseAccessorNames(text) {}'))).toEqual([]);
    expect(checkSecrets(line("import x from '../../src/parse/dotenv.ts';"))).toEqual([]);
    expect(checkSecrets(line('commit ec0ff50388c264ed8ce46f00967e92f7e71476ae'))).toEqual([]);
    expect(checkSecrets(line('a'.repeat(30)))).toEqual([]);
  });
  it('skips package-lock.json and fixtures', () => {
    expect(
      checkSecrets(line('"integrity": "sha512-q8Zr2LmV9xTb4NwK7pYc3HsD"', 'package-lock.json')),
    ).toEqual([]);
    expect(checkSecrets(line('KEY=sk_live_FAKE', 'fixtures/planted/.env'))).toEqual([]);
  });
  it("skips the scanner's own files and the conventions document", () => {
    expect(
      checkSecrets(line("const p = 'sk_live_';", 'scripts/commit-checks/secrets.mjs')),
    ).toEqual([]);
    expect(checkSecrets(line('`sk_live_`', 'docs/conventions/commits.md'))).toEqual([]);
    expect(
      checkSecrets(line("const p = 'sk_live_';", 'scripts/other.mjs')).map((x) => x.rule),
    ).toEqual(['SECRET-1']);
  });
  it('reports file and line', () => {
    expect(checkSecrets(line('x = "sk_test_a"'))[0].offender).toBe('src/a.ts:3');
  });
});

describe('parsers', () => {
  it('parseAddedLines returns added lines with their new line numbers', () => {
    const diff = [
      'diff --git a/x.ts b/x.ts',
      '--- a/x.ts',
      '+++ b/x.ts',
      '@@ -1,0 +5,2 @@',
      '+one',
      '+two',
      '@@ -9 +11 @@',
      '-old',
      '+new',
    ].join('\n');
    expect(parseAddedLines(diff)).toEqual([
      { path: 'x.ts', line: 5, text: 'one' },
      { path: 'x.ts', line: 6, text: 'two' },
      { path: 'x.ts', line: 11, text: 'new' },
    ]);
  });
  it('addedDependencies lists names new in any dependency section', () => {
    const before = JSON.stringify({ dependencies: { a: '1.0.0' } });
    const after = JSON.stringify({
      dependencies: { a: '1.0.1', b: '2.0.0' },
      devDependencies: { c: '3.0.0' },
    });
    expect(addedDependencies('package.json', before, after).map((d) => d.name)).toEqual(['b', 'c']);
    expect(addedDependencies('package.json', before, before)).toEqual([]);
  });
  it('newAiLogRows reads row numbers added to docs/ai-log.md only', () => {
    expect(
      newAiLogRows([
        { path: 'docs/ai-log.md', line: 9, text: '| 3 | 2026-10-12 | x |' },
        { path: 'docs/other.md', line: 1, text: '| 4 | y |' },
        { path: 'docs/ai-log.md', line: 2, text: 'text' },
      ]),
    ).toEqual([3]);
  });
  it('parseTaskIds reads milestone IDs from PRD table rows', () => {
    expect(
      parseTaskIds('| M0.1 | task | x |\n| **Gate** | y |\n| M2.3 | z |\n| M2.3 | dup |'),
    ).toEqual(['M0.1', 'M2.3']);
  });
});
