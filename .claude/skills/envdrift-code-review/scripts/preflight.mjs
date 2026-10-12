#!/usr/bin/env node
// envdrift-code-review pre-flight. READ-ONLY: runs tests/typecheck and static greps, never
// modifies anything, and always exits 0 even when it finds problems.
//
// Output, one record per line (split on the first 3 spaces, then the rest is the message):
//   CHECK <ID> <PASS|FAIL|WARN|INFO|SKIP> <file:line | -> <message>
//   SUMMARY <n> FAIL <n> WARN <n> PASS ...
// Usage: node preflight.mjs [--base <git-ref>] [--skip-tests]

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, sep } from 'node:path';

const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const BASE = baseIdx !== -1 && args[baseIdx + 1] ? args[baseIdx + 1] : 'HEAD';
const SKIP_TESTS = args.includes('--skip-tests');

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
  const names = git(['diff', '--name-only', BASE]);
  const untracked = git(['ls-files', '--others', '--exclude-standard']);
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
    emit('SCOPE', 'INFO', '-', `base=${BASE} changed_files=${changed} untracked_files=${added}`);
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
run('TEST', 'npm', ['test']);
run('TYPECHECK', 'npm', ['run', 'typecheck']);

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
    const baseText = git(['show', `${BASE}:${f}`]);
    const nowPath = join(ROOT, f);
    if (!existsSync(nowPath)) continue;
    if (baseText === null && git(['rev-parse', '--verify', BASE]) === null) {
      comparable = false;
      break;
    }
    const before = depsOf(baseText ?? '{}');
    const now = depsOf(read(nowPath));
    for (const [key, range] of now) {
      const [section, name] = key.split(':');
      const old = before.get(key);
      if (old === range) continue;
      reported = true;
      const text = read(nowPath);
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

const count = (s) => results.filter((r) => r.status === s).length;
console.log(
  `SUMMARY FAIL=${count('FAIL')} WARN=${count('WARN')} PASS=${count('PASS')} INFO=${count('INFO')} SKIP=${count('SKIP')}`,
);
process.exit(0);
