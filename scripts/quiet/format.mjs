// Pure formatters for the quiet wrappers. They turn tool output into the few lines a skill,
// agent or hook needs, and never print anything that was not measured.
import { relative, isAbsolute } from 'node:path';

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;
export const stripAnsi = (s) => String(s ?? '').replace(ANSI, '');

/** Keep at most `max` lines; the last one says how many were dropped. */
export function capLines(lines, max) {
  if (lines.length <= max) return lines;
  return [...lines.slice(0, max - 1), `... ${lines.length - (max - 1)} more lines`];
}

const toPosix = (p) => p.split('\\').join('/');
const rel = (p, root) => (root && isAbsolute(p) ? toPosix(relative(root, p)) : toPosix(p));

/** First stack frame that is not inside node_modules: `file:line`, or null. */
export function firstFrame(text, root) {
  for (const m of stripAnsi(text).matchAll(
    /((?:[A-Za-z]:)?[^\s()'"]+\.(?:mjs|cjs|js|tsx?)):(\d+):\d+/g,
  )) {
    if (m[1].includes('node_modules')) continue;
    return `${rel(m[1], root)}:${m[2]}`;
  }
  return null;
}

/**
 * @param {any} json vitest `--reporter=json` output
 * @param {{ root?: string, ms: number }} opts
 * @returns {{ ok: boolean, text: string }}
 */
export function formatTestResult(json, { root, ms }) {
  const secs = (ms / 1000).toFixed(1);
  const passed = json.numPassedTests ?? 0;
  const failed = json.numFailedTests ?? 0;
  const brokenSuites = (json.testResults ?? []).filter(
    (f) => f.status === 'failed' && !(f.assertionResults ?? []).some((a) => a.status === 'failed'),
  );
  if (!failed && !brokenSuites.length) {
    const skipped = (json.numPendingTests ?? 0) + (json.numTodoTests ?? 0);
    return {
      ok: true,
      text: `tests: ${passed} passed${skipped ? `, ${skipped} skipped` : ''} in ${secs}s`,
    };
  }
  const lines = [
    `tests: FAILED ${failed + brokenSuites.length} (${passed} passed, ${json.numTotalTests ?? 0} total) in ${secs}s`,
  ];
  for (const file of json.testResults ?? []) {
    for (const a of file.assertionResults ?? []) {
      if (a.status !== 'failed') continue;
      const msg = stripAnsi((a.failureMessages ?? [])[0] ?? '');
      const where = firstFrame(msg, root) ?? rel(file.name, root);
      lines.push(`FAIL ${a.fullName ?? a.title} (${where})`);
      const first = msg.split('\n').find((l) => l.trim() && !/^\s*at /.test(l));
      if (first) lines.push(`  ${first.trim().slice(0, 200)}`);
    }
  }
  for (const f of brokenSuites) {
    lines.push(`FAIL suite ${rel(f.name, root)} did not run`);
    const first = stripAnsi(f.message ?? '')
      .split('\n')
      .find((l) => l.trim());
    if (first) lines.push(`  ${first.trim().slice(0, 200)}`);
  }
  return { ok: false, text: capLines(lines, 40).join('\n') };
}

/**
 * @param {string} output tsc output (use `--pretty false`)
 * @param {{ ok: boolean, ms: number }} opts
 */
export function formatTypecheck(output, { ok, ms }) {
  const secs = (ms / 1000).toFixed(1);
  if (ok) return { ok: true, text: `typecheck: ok in ${secs}s` };
  const errors = stripAnsi(output)
    .split('\n')
    .filter((l) => /\berror TS\d+:/.test(l))
    .map((l) => l.trim().slice(0, 220));
  if (!errors.length) {
    // tsc failed without a normal diagnostic (bad config, crash): show what it said.
    const raw = stripAnsi(output)
      .split('\n')
      .filter((l) => l.trim());
    return { ok: false, text: capLines([`typecheck: FAILED in ${secs}s`, ...raw], 30).join('\n') };
  }
  const head = `typecheck: FAILED ${errors.length} error${errors.length === 1 ? '' : 's'} in ${secs}s`;
  return { ok: false, text: capLines([head, ...errors], 30).join('\n') };
}

/**
 * @param {any} report Stryker mutation-testing-elements JSON
 * @param {{ root?: string }} [opts]
 */
export function formatMutation(report, { root } = {}) {
  const counts = { Killed: 0, Timeout: 0, Survived: 0, NoCoverage: 0 };
  const survivors = [];
  for (const [file, data] of Object.entries(report?.files ?? {})) {
    for (const m of data.mutants ?? []) {
      if (m.status in counts) counts[m.status]++;
      if (m.status === 'Survived' || m.status === 'NoCoverage')
        survivors.push({
          file: rel(file, root),
          line: m.location?.start?.line ?? 0,
          mutator: m.mutatorName,
          replacement: String(m.replacement ?? '')
            .replace(/\s+/g, ' ')
            .slice(0, 40),
          covered: m.status === 'Survived',
        });
    }
  }
  const detected = counts.Killed + counts.Timeout;
  const total = detected + counts.Survived + counts.NoCoverage;
  if (!total) return { ok: true, text: 'mutation: no mutants generated for these files' };
  survivors.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.mutator.localeCompare(b.mutator),
  );
  const score = ((detected / total) * 100).toFixed(1);
  const lines = [
    `mutation: ${score}% (${detected} killed, ${counts.Survived} survived, ${counts.NoCoverage} no coverage) of ${total}`,
    ...survivors.map(
      (s) =>
        `${s.file}:${s.line} — ${s.mutator}${s.replacement ? ` → ${s.replacement}` : ''} — ` +
        (s.covered
          ? 'test needed: assert the result that this change would alter'
          : 'test needed: no test reaches this line'),
    ),
  ];
  return { ok: true, score: Number(score), text: capLines(lines, 20).join('\n') };
}

/** `tests: 142 passed in 3.1s` -> `tests: 142 passed in 3.1s (cached)`; detail lines unchanged. */
export function markCached(text) {
  const [first, ...rest] = text.split('\n');
  return [`${first} (cached)`, ...rest].join('\n');
}
