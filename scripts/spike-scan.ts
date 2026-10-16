// M0.3 spike: compare the AST extractor with grep on a real repo. PRD §5, §19 M0.3.
// Throwaway: delete in M2.5 once the CLI replaces it. Prints names and locations, never values.
//   node scripts/spike-scan.ts <repo-dir> [--json] [--runs N]
// Needs built-in type stripping (Node >= 22.18 or 23.6); the smoke test skips on older Node.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extract, shouldParse } from '../packages/core/src/index.ts';

// PRD §12 default include and D2 default excludes.
const INCLUDE = /\.(js|jsx|mjs|cjs|ts|tsx|mts|cts)$/;
const EXCLUDE = [/\.(test|spec)\.[^/]+$/, /(^|\/)__tests__\//, /(^|\/)(test|tests|e2e|cypress)\//];
// docs/system/testing-qa.md, real-world step 3.
const GREP = /process\.env\.([A-Z_][A-Z0-9_]*)|import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g;

interface Hit {
  name: string;
  at: string;
}

function listFiles(dir: string): string[] {
  return execFileSync('git', ['-C', dir, 'ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter((f) => INCLUDE.test(f) && !EXCLUDE.some((re) => re.test(f)))
    .sort();
}

// First location per name: files are sorted and scanned in order, lines ascend within a file.
function firstSeen(map: Map<string, string>, name: string, at: string) {
  if (!map.has(name)) map.set(name, at);
}

function scan(dir: string, files: string[]) {
  const ast = new Map<string, string>();
  const grep = new Map<string, string>();
  const parseFailures: string[] = [];
  const readFailures: string[] = [];
  let dynamic = 0;
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(join(dir, file), 'utf8');
    } catch {
      readFailures.push(file);
      continue;
    }
    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(GREP)) firstSeen(grep, m[1] ?? m[2] ?? '', `${file}:${i + 1}`);
    });
    if (!shouldParse(text, [])) continue;
    const r = extract(text, file, { accessors: [] });
    if (!r.parsed) parseFailures.push(file);
    const refs = [...r.references].sort((a, b) => a.line - b.line || a.column - b.column);
    for (const ref of refs) firstSeen(ast, ref.name, `${file}:${ref.line}`);
    dynamic += r.dynamic.length;
  }
  return { ast, grep, parseFailures, readFailures, dynamic };
}

function only(a: Map<string, string>, b: Map<string, string>): Hit[] {
  return [...a.keys()]
    .filter((n) => !b.has(n))
    .sort()
    .map((name) => ({ name, at: a.get(name) ?? '' }));
}

function main(argv: string[]) {
  const dir = argv[0];
  const runsAt = argv.indexOf('--runs');
  const runs = runsAt === -1 ? 5 : Number(argv[runsAt + 1]);
  if (!dir || dir.startsWith('--') || !Number.isInteger(runs) || runs < 1) {
    console.error('usage: node scripts/spike-scan.ts <repo-dir> [--json] [--runs N], N >= 1');
    process.exit(2);
  }
  const files = listFiles(dir);

  const t0 = performance.now();
  const res = scan(dir, files);
  const coldMs = performance.now() - t0;
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    scan(dir, files);
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)] ?? coldMs;

  const out = {
    files: files.length,
    parseFailures: res.parseFailures,
    readFailures: res.readFailures,
    astNames: res.ast.size,
    grepNames: res.grep.size,
    agreed: [...res.ast.keys()].filter((n) => res.grep.has(n)).sort(),
    astOnly: only(res.ast, res.grep),
    grepOnly: only(res.grep, res.ast),
    dynamic: res.dynamic,
    timing: { coldMs: Math.round(coldMs), medianMs: Math.round(median), runs },
  };

  if (argv.includes('--json')) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  const list = (hits: Hit[]) => hits.map((h) => `  ${h.name}  ${h.at}`).join('\n') || '  (none)';
  console.log(
    [
      `files ${out.files}, parse failures ${out.parseFailures.length}, read failures ${out.readFailures.length}, dynamic ${out.dynamic}`,
      `AST ${out.astNames}, grep ${out.grepNames}, agreed ${out.agreed.length}`,
      `cold ${out.timing.coldMs} ms, median of ${runs} ${out.timing.medianMs} ms`,
      `AST-only:\n${list(out.astOnly)}`,
      `grep-only:\n${list(out.grepOnly)}`,
      ...out.parseFailures.map((f) => `parse failure: ${f}`),
      ...out.readFailures.map((f) => `read failure: ${f}`),
    ].join('\n'),
  );
}

main(process.argv.slice(2));
