#!/usr/bin/env node
// envdrift-code-review pre-flight. READ-ONLY: runs tests/typecheck and static greps, never
// modifies anything, and always exits 0 even when it finds problems.
//
// Output, one record per line (split on the first 3 spaces, then the rest is the message):
//   CHECK <ID> <PASS|FAIL|WARN|INFO|SKIP> <file:line | -> <message>
//   SUMMARY <n> FAIL <n> WARN <n> PASS ...
// Usage: node preflight.mjs [--base <git-ref>] [--skip-tests]

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const BASE = baseIdx !== -1 && args[baseIdx + 1] ? args[baseIdx + 1] : 'HEAD';
const SKIP_TESTS = args.includes('--skip-tests');
// --staged: review `git diff --cached` (the commit flow); the base is HEAD and file contents come from the index.
const STAGED = args.includes('--staged');

const ROOT = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    return process.cwd();
  }
})();

const results = [];
const emit = (id, status, where, message) => {
  const msg = String(message).replace(/\s+/g, ' ').trim();
  results.push({ id, status });
  console.log(`CHECK ${id} ${status} ${where || '-'} ${msg}`);
};

const posix = (p) => p.split(sep).join('/');
const read = (p) => readFileSync(p, 'utf8');

function walk(dir, filter, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, filter, out);
    else if (filter(full)) out.push(full);
  }
  return out;
}

const isTs = (f) => /\.(ts|tsx|mts|cts)$/.test(f) && !f.endsWith('.d.ts');
const rel = (f) => posix(relative(ROOT, f));
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

function git(argv) {
  try {
    return execFileSync('git', argv, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

// ---- git scope ------------------------------------------------------------------------
{
  const names = git(STAGED ? ['diff', '--cached', '--name-only'] : ['diff', '--name-only', BASE]);
  const untracked = STAGED ? '' : git(['ls-files', '--others', '--exclude-standard']);
  if (names === null) {
    emit(
      'SCOPE',
      'WARN',
      '-',
      `could not diff against base "${BASE}"; dependency check will be skipped`,
    );
  } else {
    const changed = names.split('\n').filter(Boolean).length;
    const added = (untracked ?? '').split('\n').filter(Boolean).length;
    emit(
      'SCOPE',
      'INFO',
      '-',
      `${STAGED ? 'staged' : `base=${BASE}`} changed_files=${changed} untracked_files=${added}`,
    );
  }
}

// ---- tests + typecheck ----------------------------------------------------------------
function run(id, cmd, cmdArgs) {
  if (SKIP_TESTS) return emit(id, 'SKIP', '-', '--skip-tests given; NOT run');
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, encoding: 'utf8', shell: false });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status === 0) {
    const summary = /Tests\s+[^\n]*/.exec(out);
    emit(
      id,
      'PASS',
      '-',
      `${cmd} ${cmdArgs.join(' ')} exit 0${summary ? ` (${summary[0].trim()})` : ''}`,
    );
  } else {
    const tail = out.trim().split('\n').slice(-6).join(' | ');
    emit(id, 'FAIL', '-', `${cmd} ${cmdArgs.join(' ')} exit ${r.status ?? 'signal'}: ${tail}`);
  }
}
// Tests and typecheck go through the quiet wrappers (one line on pass, failures only, cached per
// tree), never the raw commands.
async function runQuiet(id, file, fn) {
  if (SKIP_TESTS) return emit(id, 'SKIP', '-', '--skip-tests given; NOT run');
  const mod = await import(pathToFileURL(join(ROOT, 'scripts', 'quiet', file)).href);
  const r = mod[fn]({ root: ROOT });
  emit(id, r.ok ? 'PASS' : 'FAIL', '-', r.text.split('\n').slice(0, 12).join(' | '));
}
await runQuiet('TEST', 'test.mjs', 'runTests');
await runQuiet('TYPECHECK', 'typecheck.mjs', 'runTypecheck');
run('LINT', 'npm', ['run', 'lint']);

// Prettier on the files in scope only (a repo-wide check would also flag unrelated local files).
{
  const changed = (
    git(STAGED ? ['diff', '--cached', '--name-only'] : ['diff', '--name-only', BASE]) ?? ''
  )
    .split('\n')
    .concat(STAGED ? [] : (git(['ls-files', '--others', '--exclude-standard']) ?? '').split('\n'))
    .filter(
      (f) =>
        f && /\.(ts|tsx|mts|cts|js|mjs|cjs|json|md|ya?ml)$/.test(f) && existsSync(join(ROOT, f)),
    );
  if (SKIP_TESTS) emit('FORMAT', 'SKIP', '-', '--skip-tests given; NOT run');
  else if (changed.length === 0)
    emit('FORMAT', 'SKIP', '-', 'no changed formattable files in scope');
  else {
    const r = spawnSync('npx', ['prettier', '--check', ...changed], {
      cwd: ROOT,
      encoding: 'utf8',
      shell: false,
    });
    if (r.status === 0)
      emit('FORMAT', 'PASS', '-', `prettier --check clean on ${changed.length} changed file(s)`);
    else {
      const bad = `${r.stdout ?? ''}${r.stderr ?? ''}`
        .split('\n')
        .filter(
          (l) =>
            l.startsWith('[warn]') && !l.includes('Code style issues') && l.trim() !== '[warn]',
        )
        .map((l) => l.replace('[warn] ', '').trim());
      for (const f of bad.length ? bad : ['(see prettier output)'])
        emit('FORMAT', 'FAIL', f, 'prettier --check reports formatting differences');
    }
  }
}

// ---- TypeScript AST (comments and strings must never trigger a finding) ----------------
let ts = null;
try {
  ts = createRequire(join(ROOT, 'package.json'))('typescript');
} catch {
  /* handled per check */
}

// ---- core purity + console ------------------------------------------------------------
const coreSrc = walk(join(ROOT, 'packages/core/src'), isTs);
const IO_MODULES = [
  'fs',
  'fs/promises',
  'child_process',
  'net',
  'http',
  'https',
  'http2',
  'dgram',
  'dns',
  'tls',
  'worker_threads',
  'cluster',
  'readline',
];
const isIoSpec = (raw) => {
  const spec = raw.replace(/^node:/, '');
  return IO_MODULES.includes(spec) || spec.startsWith('fs/') || spec.startsWith('@aws-sdk/');
};
if (!ts) {
  emit('CORE_IO', 'SKIP', '-', 'typescript package not found; check NOT run');
  emit('CONSOLE', 'SKIP', '-', 'typescript package not found; check NOT run');
} else {
  let ioFound = false;
  let consoleFound = false;
  for (const file of coreSrc) {
    const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
    const at = (node) =>
      `${rel(file)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`;
    const checkSpec = (node, spec) => {
      if (isIoSpec(spec)) {
        ioFound = true;
        emit('CORE_IO', 'FAIL', at(node), `core imports "${spec}" (hard rule 2: core has no I/O)`);
      } else if (spec === 'path' || spec === 'node:path' || spec === 'os' || spec === 'node:os') {
        emit(
          'CORE_IO',
          'INFO',
          at(node),
          `core imports "${spec}" (not I/O by itself; check it is only string manipulation)`,
        );
      }
    };
    const visit = (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        checkSpec(node, node.moduleSpecifier.text);
      } else if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const first = node.arguments[0];
        const dynamicImport = callee.kind === ts.SyntaxKind.ImportKeyword;
        const isRequire = ts.isIdentifier(callee) && callee.text === 'require';
        if ((dynamicImport || isRequire) && first && ts.isStringLiteralLike(first))
          checkSpec(node, first.text);
        if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
          const obj = callee.expression.text;
          const prop = callee.name.text;
          if (obj === 'console') {
            consoleFound = true;
            emit(
              'CONSOLE',
              'FAIL',
              at(node),
              `console.${prop} in core (core must not print; reporters return strings)`,
            );
          }
          if ((obj === 'Date' && prop === 'now') || (obj === 'Math' && prop === 'random')) {
            emit(
              'CORE_IO',
              'WARN',
              at(node),
              `core calls ${obj}.${prop}() (non-determinism risk, hard rule 5)`,
            );
          }
        }
      } else if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'Date'
      ) {
        emit(
          'CORE_IO',
          'WARN',
          at(node),
          'core calls new Date() (non-determinism risk, hard rule 5)',
        );
      } else if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'process' &&
        node.name.text === 'env'
      ) {
        ioFound = true;
        emit('CORE_IO', 'FAIL', at(node), 'core reads process.env (hard rule 2)');
      } else if (
        ts.isElementAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'process' &&
        ts.isStringLiteralLike(node.argumentExpression) &&
        node.argumentExpression.text === 'env'
      ) {
        ioFound = true;
        emit('CORE_IO', 'FAIL', at(node), 'core reads process["env"] (hard rule 2)');
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  if (!ioFound)
    emit(
      'CORE_IO',
      'PASS',
      'packages/core/src',
      `no fs/net/http/child_process imports or process.env reads in ${coreSrc.length} core source files`,
    );
  if (!consoleFound) emit('CONSOLE', 'PASS', 'packages/core/src', 'no console.* calls in core');
}

// ---- exported types with a `value` property (TypeScript AST) --------------------------
{
  if (!ts) emit('VALUE_PROP', 'SKIP', '-', 'typescript package not found; check NOT run');
  else {
    const files = walk(join(ROOT, 'packages'), (f) => isTs(f) && f.includes(`${sep}src${sep}`));
    let found = false;
    const nameOf = (m) => {
      const n = m.name;
      if (!n) return null;
      if (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))
        return n.text;
      return null;
    };
    for (const file of files) {
      const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
      const isExported = (node) => !!(ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export);
      const reportMembers = (members, ownerName, hostExported) => {
        for (const m of members) {
          if (nameOf(m) === 'value') {
            found = true;
            const { line } = sf.getLineAndCharacterOfPosition(m.getStart(sf));
            emit(
              'VALUE_PROP',
              'FAIL',
              `${rel(file)}:${line + 1}`,
              `${hostExported ? 'exported ' : ''}type "${ownerName}" has a property named "value" (hard rule 1 / ADR 0006)`,
            );
          }
        }
      };
      const visit = (node) => {
        if (ts.isInterfaceDeclaration(node) && isExported(node))
          reportMembers(node.members, node.name.text, true);
        if (ts.isTypeAliasDeclaration(node) && isExported(node)) {
          const walkType = (t) => {
            if (ts.isTypeLiteralNode(t)) reportMembers(t.members, node.name.text, true);
            ts.forEachChild(t, walkType);
          };
          walkType(node.type);
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    if (!found)
      emit(
        'VALUE_PROP',
        'PASS',
        'packages/*/src',
        `no exported interface or type literal has a "value" property (${files.length} files)`,
      );
  }
}

// ---- warnings / errors that interpolate content (value-leak path) -----------------------
{
  const SENSITIVE = new Set([
    'line',
    'rawLine',
    'raw',
    'text',
    'content',
    'contents',
    'value',
    'val',
    'source',
    'src',
    'code',
    'input',
    'body',
    'match',
    'snippet',
    'rest',
    'segment',
    'token',
    'literal',
  ]);
  if (!ts) emit('WARN_LEAK', 'SKIP', '-', 'typescript package not found; check NOT run');
  else {
    const files = walk(join(ROOT, 'packages'), (f) => isTs(f) && f.includes(`${sep}src${sep}`));
    let found = false;
    for (const file of files) {
      const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
      const at = (node) =>
        `${rel(file)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`;
      const leaks = (expr) => {
        const hits = [];
        const scan = (n) => {
          if (ts.isTemplateExpression(n)) {
            for (const span of n.templateSpans) {
              const e = span.expression;
              const id = ts.isIdentifier(e)
                ? e.text
                : ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.name)
                  ? e.name.text
                  : null;
              if (id && SENSITIVE.has(id)) hits.push(id);
            }
          } else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
            for (const side of [n.left, n.right])
              if (ts.isIdentifier(side) && SENSITIVE.has(side.text)) hits.push(side.text);
          }
          ts.forEachChild(n, scan);
        };
        scan(expr);
        return hits;
      };
      const visit = (node) => {
        let sinkExprs = null;
        let sink = '';
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'push' &&
          /warnings?$/i.test(node.expression.expression.getText(sf))
        ) {
          sinkExprs = node.arguments;
          sink = 'warning';
        } else if (
          (ts.isNewExpression(node) || ts.isCallExpression(node)) &&
          /^(?:\w*Error)$/.test(node.expression.getText(sf))
        ) {
          sinkExprs = node.arguments ?? [];
          sink = 'error message';
        }
        if (sinkExprs) {
          for (const arg of sinkExprs) {
            const hits = leaks(arg);
            if (hits.length) {
              found = true;
              emit(
                'WARN_LEAK',
                'FAIL',
                at(node),
                `${sink} interpolates "${[...new Set(hits)].join('", "')}", which may hold file content or a value (SEC-08, hard rule 1); use file:line and names only`,
              );
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    if (!found)
      emit(
        'WARN_LEAK',
        'PASS',
        'packages/*/src',
        `no warning or error message interpolates content-like identifiers (${files.length} files)`,
      );
  }
}

// ---- new dependencies vs base ---------------------------------------------------------
{
  const pkgFiles = [
    'package.json',
    ...walk(join(ROOT, 'packages'), (f) => f.endsWith(`${sep}package.json`)).map(rel),
  ];
  const sections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
  const depsOf = (text) => {
    const out = new Map();
    try {
      const j = JSON.parse(text);
      for (const s of sections)
        for (const [k, v] of Object.entries(j[s] ?? {})) out.set(`${s}:${k}`, String(v));
    } catch {
      /* unreadable package.json is reported by the caller */
    }
    return out;
  };
  let reported = false;
  let comparable = true;
  const docs = existsSync(join(ROOT, 'docs/architecture/dependencies.md'))
    ? read(join(ROOT, 'docs/architecture/dependencies.md'))
    : '';
  for (const f of [...new Set(pkgFiles)]) {
    const baseText = git(['show', `${STAGED ? 'HEAD' : BASE}:${f}`]);
    const nowPath = join(ROOT, f);
    if (!existsSync(nowPath)) continue;
    const nowText = STAGED ? (git(['show', `:${f}`]) ?? read(nowPath)) : read(nowPath);
    if (baseText === null && git(['rev-parse', '--verify', BASE]) === null) {
      comparable = false;
      break;
    }
    const before = depsOf(baseText ?? '{}');
    const now = depsOf(nowText);
    for (const [key, range] of now) {
      const [section, name] = key.split(':');
      const old = before.get(key);
      if (old === range) continue;
      reported = true;
      const text = nowText;
      const idx = text.indexOf(`"${name}"`);
      const where = `${f}:${idx === -1 ? 1 : lineOf(text, idx)}`;
      const exact = /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(range);
      const listed = docs.includes(`\`${name}\``);
      const what = old === undefined ? 'NEW' : `CHANGED ${old} ->`;
      emit(
        'NEW_DEP',
        exact && listed ? 'WARN' : 'FAIL',
        where,
        `${what} ${section} "${name}": "${range}"${exact ? '' : ' (not an exact pin, rule 7)'}${listed ? '' : ' (no row in docs/architecture/dependencies.md)'}; needs a justification in the commit message`,
      );
    }
    for (const key of before.keys()) {
      if (!now.has(key)) {
        reported = true;
        emit('NEW_DEP', 'INFO', f, `REMOVED ${key.replace(':', ' ')}`);
      }
    }
  }
  if (!comparable)
    emit('NEW_DEP', 'SKIP', '-', `base "${BASE}" not resolvable; dependency diff NOT run`);
  else if (!reported)
    emit('NEW_DEP', 'PASS', 'package.json files', `no dependency changes vs ${BASE}`);
}

// ---- rule files vs tests --------------------------------------------------------------
{
  const rulesDir = join(ROOT, 'packages/core/src/rules');
  const ruleFiles = walk(rulesDir, (f) => /ED\d{3}\.ts$/.test(f));
  const testFiles = walk(join(ROOT, 'packages/core/test'), isTs);
  if (ruleFiles.length === 0)
    emit('RULE_TESTS', 'INFO', 'packages/core/src/rules', 'no rule files present');
  let bad = false;
  for (const f of ruleFiles) {
    const id = /(ED\d{3})\.ts$/.exec(f)[1];
    const tf = testFiles.find((t) => t.endsWith(`${sep}${id}.test.ts`));
    if (!tf) {
      bad = true;
      emit(
        'RULE_TESTS',
        'FAIL',
        rel(f),
        `${id} has no test file (expected packages/core/test/rules/${id}.test.ts; hard rule 3)`,
      );
      continue;
    }
    const text = read(tf);
    const titles = [
      ...text.matchAll(/\b(?:it|test)\s*(?:\.\w+)?\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g),
    ].map((m) => m[2]);
    for (const kind of ['positive', 'negative', 'suppression']) {
      if (!titles.some((t) => t.startsWith(id) && new RegExp(`\\b${kind}\\b`, 'i').test(t))) {
        bad = true;
        emit(
          'RULE_TESTS',
          'FAIL',
          rel(tf),
          `${id} has no test titled "${id} ${kind}" (hard rule 3: positive, negative, suppression)`,
        );
      }
    }
  }
  if (ruleFiles.length > 0 && !bad)
    emit(
      'RULE_TESTS',
      'PASS',
      'packages/core',
      `${ruleFiles.length} rule file(s), each with positive, negative and suppression tests`,
    );
}

// ---- catalogue IDs vs tests -----------------------------------------------------------
{
  const cat = join(ROOT, 'docs/patterns-catalogue.md');
  if (!existsSync(cat)) {
    emit('PATTERN_IDS', 'SKIP', '-', 'docs/patterns-catalogue.md not found');
  } else {
    const text = read(cat);
    const live = text.split(/^## Retired and changed IDs/m)[0];
    const ids = [];
    for (const m of live.matchAll(/^\| ([PFDN]\d{2}) \|.*$/gm)) {
      const planned = /planned/i.test(m[0].split('|').slice(-2, -1)[0] ?? '');
      ids.push({ id: m[1], planned, line: lineOf(live, m.index ?? 0) });
    }
    const tests = walk(join(ROOT, 'packages'), (f) => /\.test\.ts$/.test(f));
    const titled = new Map();
    for (const f of tests) {
      const t = read(f);
      for (const m of t.matchAll(/\b(?:it|test)\s*(?:\.\w+)?\s*\(\s*(['"`])([PFDN]\d{2})\b/g))
        titled.set(m[2], `${rel(f)}:${lineOf(t, m.index ?? 0)}`);
    }
    let bad = false;
    for (const { id, planned, line } of ids) {
      if (planned) continue;
      if (!titled.has(id)) {
        bad = true;
        emit(
          'PATTERN_IDS',
          'FAIL',
          `docs/patterns-catalogue.md:${line}`,
          `catalogue row ${id} has no test titled "${id}: …" (hard rule 4)`,
        );
      }
    }
    const known = new Set(ids.map((i) => i.id));
    for (const [id, where] of titled) {
      if (!known.has(id)) {
        bad = true;
        emit(
          'PATTERN_IDS',
          'FAIL',
          where,
          `test titled "${id}: …" has no row in docs/patterns-catalogue.md (hard rule 4)`,
        );
      }
    }
    if (!bad)
      emit(
        'PATTERN_IDS',
        'PASS',
        'docs/patterns-catalogue.md',
        `${ids.filter((i) => !i.planned).length} catalogue IDs and ${titled.size} pattern-ID tests agree`,
      );
  }
}

// ---- deterministic checks the free-text review under-tiered in evaluation ----------------
{
  const mod = await import(
    pathToFileURL(join(ROOT, 'scripts', 'commit-checks', 'static-checks.mjs')).href
  );
  const lineAt = (file, n) => `${posix(relative(ROOT, file))}:${n}`;
  const isTestFile = (f) => /\.test\.(ts|tsx|mts|cts)$/.test(f);
  // Only test files in the diff: older tests are not this change's to fix (and may use a guard).
  const inDiff = new Set(
    (git(STAGED ? ['diff', '--cached', '--name-only'] : ['diff', '--name-only', BASE]) ?? '')
      .split('\n')
      .concat(STAGED ? [] : (git(['ls-files', '--others', '--exclude-standard']) ?? '').split('\n'))
      .filter(Boolean),
  );
  const tests = walk(
    join(ROOT, 'packages'),
    (f) => isTestFile(f) && inDiff.has(posix(relative(ROOT, f))),
  );

  let weak = 0;
  for (const f of tests)
    for (const w of mod.findWeakAssertions(read(f))) {
      weak++;
      emit(
        'WEAK_ASSERT',
        'FAIL',
        lineAt(f, w.line),
        `assertion passes for almost any result: ${w.text}`,
      );
    }
  if (!weak)
    emit(
      'WEAK_ASSERT',
      'PASS',
      'packages/*/test',
      `no weak assertions in ${tests.length} changed test file(s)`,
    );
  let unsorted = 0;
  for (const f of coreSrc) {
    const hit = mod.findUnsortedAggregator(read(f));
    if (hit) {
      unsorted++;
      emit(
        'UNSORTED',
        'FAIL',
        lineAt(f, hit.line),
        `${hit.name} hands findings on and this file never sorts (hard rule 5)`,
      );
    }
  }
  if (!unsorted)
    emit('UNSORTED', 'PASS', 'packages/core/src', 'no findings aggregator without a sort');
}

// Staged-diff hash for the report header; must match scripts/commit-checks/diff-hash.mjs.
if (STAGED) {
  const diff = git([
    'diff',
    '--cached',
    '--no-color',
    '--no-ext-diff',
    '--',
    '.',
    ':(exclude)docs/reviews',
  ]);
  const hash =
    diff && diff.trim() !== '' ? createHash('sha256').update(diff).digest('hex') : 'none';
  emit('STAGED_HASH', 'INFO', '-', `Staged-diff-sha256: ${hash}`);
}

const count = (s) => results.filter((r) => r.status === s).length;
console.log(
  `SUMMARY FAIL=${count('FAIL')} WARN=${count('WARN')} PASS=${count('PASS')} INFO=${count('INFO')} SKIP=${count('SKIP')}`,
);
process.exit(0);
