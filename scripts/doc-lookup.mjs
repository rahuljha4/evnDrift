#!/usr/bin/env node
// Print one part of a doc instead of the whole file.
//   node scripts/doc-lookup.mjs prd 11        PRD section 11 (also `prd 10.1`)
//   node scripts/doc-lookup.mjs prd D5        decision row D5
//   node scripts/doc-lookup.mjs prd M2.3      milestone task row M2.3
//   node scripts/doc-lookup.mjs rule ED009    that rule's entry in docs/rules.md
//   node scripts/doc-lookup.mjs pattern P07   that row of docs/patterns-catalogue.md
// Exit 0 and the text on a hit; exit 1 and a one-line message on a miss; exit 2 on bad usage.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Heading lines outside code fences: [{ index, level, text }]. */
function headings(lines) {
  const found = [];
  let fence = false;
  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const m = !fence && /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) found.push({ index, level: m[1].length, text: m[2] });
  });
  return found;
}

/** Text from the first heading accepted by `match` up to the next heading of the same or a higher level. */
export function sectionByHeading(markdown, match) {
  const lines = markdown.split('\n');
  const hs = headings(lines);
  const at = hs.findIndex((h) => match(h.text));
  if (at < 0) return null;
  const next = hs.slice(at + 1).find((h) => h.level <= hs[at].level);
  return lines
    .slice(hs[at].index, next ? next.index : lines.length)
    .join('\n')
    .trimEnd();
}

/** The table row whose first cell is exactly `id`, or null. */
export function tableRow(markdown, id) {
  const re = new RegExp(`^\\|\\s*(\\*\\*)?${escapeRe(id)}(\\*\\*)?(\\s|\\|)`);
  let fence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (!fence && re.test(line)) return line;
  }
  return null;
}

/** PRD lookups: a section number, a decision ID (D5) or a task ID (M2.3). */
export function lookupPrd(markdown, query) {
  if (/^D\d+$/.test(query) || /^M\d+\.\d+$/.test(query)) return tableRow(markdown, query);
  if (/^\d+(\.\d+)*$/.test(query))
    return sectionByHeading(markdown, (t) => new RegExp(`^${escapeRe(query)}(\\.|\\s|$)`).test(t));
  return null;
}

export function lookupRule(markdown, id) {
  return sectionByHeading(markdown, (t) => t.startsWith(`${id} `) || t === id);
}

export const lookupPattern = tableRow;

const USAGE = 'usage: doc-lookup.mjs prd <section|Dn|Mn.n> | rule <EDnnn> | pattern <Pnn>';

/** @returns {{ code: number, out: string }} */
export function lookup(kind, query, docsDir) {
  const read = (f) => readFileSync(join(docsDir, f), 'utf8');
  if (!kind || !query) return { code: 2, out: USAGE };
  let found;
  if (kind === 'prd') found = lookupPrd(read('prd.md'), query);
  else if (kind === 'rule' && /^ED\d{3}$/.test(query)) found = lookupRule(read('rules.md'), query);
  else if (kind === 'pattern' && /^[A-Z]\d{2}$/.test(query))
    found = lookupPattern(read('patterns-catalogue.md'), query);
  else return { code: 2, out: USAGE };
  return found
    ? { code: 0, out: found }
    : { code: 1, out: `doc-lookup: no ${kind} entry for ${query}` };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const docsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
  const [kind, query] = process.argv.slice(2);
  const { code, out } = lookup(kind, query, docsDir);
  (code === 0 ? console.log : console.error)(out);
  process.exit(code);
}
