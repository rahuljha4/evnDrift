// dotenv text -> Declarations. PRD §10.2, docs/functional/sources.md FR-SRC-05.
// Hard rule (D6, ADR 0006): a value exists only as a local variable in this file.
// Only `hasValue` leaves it. Warnings carry names and line numbers, never content.

import { sanitizeDirective } from '../directive.ts';
import type { CommentLine, Declaration } from '../types.ts';

export interface ParsedEnvFile {
  declarations: Declaration[];
  /** Only `envdrift-ignore` comments, sanitised. Other comments may hold values (ADR 0006). */
  comments: CommentLine[];
  warnings: string[];
}

/** Longest multi-line double-quoted value we will look across. Bounds work on hostile input. */
const MAX_QUOTE_LINES = 100;

const isSpace = (c: string): boolean => c === ' ' || c === '\t';

function isValidName(name: string): boolean {
  if (name === '') return false;
  for (let i = 0; i < name.length; i++) {
    const c = name.charAt(i);
    const alpha = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_';
    const rest = (c >= '0' && c <= '9') || c === '.' || c === '-';
    if (!(alpha || (i > 0 && rest))) return false;
  }
  return true;
}

/** Index of the first unescaped `"` in `text`, or -1. */
function closingDouble(text: string): number {
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    if (c === '\\') i++;
    else if (c === '"') return i;
  }
  return -1;
}

/** Index of the first `#` that starts an inline comment (at 0 or after whitespace), or -1. */
function inlineComment(text: string): number {
  for (let i = 0; i < text.length; i++) {
    if (text.charAt(i) === '#' && (i === 0 || isSpace(text.charAt(i - 1)))) return i;
  }
  return -1;
}

export function parseDotenv(text: string, file: string): ParsedEnvFile {
  const declarations: Declaration[] = [];
  const comments: CommentLine[] = [];
  const warnings = new Set<string>();

  try {
    const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const lines = src.split(/\r?\n/);
    const seen = new Map<string, number>();

    let i = 0;
    while (i < lines.length) {
      const lineNo = i + 1;
      let s = (lines[i] ?? '').trim();
      i++;
      if (s === '') continue;

      if (s.charAt(0) === '#') {
        const directive = sanitizeDirective(s.slice(1), false);
        if (directive !== null) comments.push({ line: lineNo, text: directive });
        continue;
      }

      if (s.startsWith('export') && s.length > 6 && isSpace(s.charAt(6))) {
        s = s.slice(7).trimStart();
      }

      const eq = s.indexOf('=');
      const name = (eq === -1 ? s : s.slice(0, eq)).trim();
      if (!isValidName(name)) {
        warnings.add(`${file}:${lineNo}: invalid line`);
        continue;
      }

      // The value is read only to decide `hasValue`, then dropped.
      let hasValue = false;
      if (eq !== -1) {
        const rest = s.slice(eq + 1).trimStart();
        const quote = rest.charAt(0);

        if (quote === '"') {
          let seg = rest.slice(1);
          let extra = 0;
          let end = closingDouble(seg);
          while (end === -1 && extra < MAX_QUOTE_LINES && i + extra < lines.length) {
            seg = lines[i + extra] ?? '';
            extra++;
            end = closingDouble(seg);
          }
          if (end === -1) {
            warnings.add(`${file}:${lineNo}: unterminated quote`);
            hasValue = rest.length > 1;
          } else {
            hasValue = extra > 0 || end > 0;
            i += extra;
          }
        } else if (quote === "'" || quote === '`') {
          const end = rest.indexOf(quote, 1);
          if (end === -1) {
            warnings.add(`${file}:${lineNo}: unterminated quote`);
            hasValue = rest.length > 1;
          } else {
            hasValue = end > 1;
          }
        } else {
          const cut = inlineComment(rest);
          hasValue = (cut === -1 ? rest : rest.slice(0, cut)).trim() !== '';
        }
      }

      // M1.1: looksSecret = looksLikeSecret(value), computed here, inside the parser.
      const first = seen.get(name);
      if (first !== undefined) {
        warnings.add(`${file}: duplicate key ${name} (lines ${first}, ${lineNo})`);
        continue;
      }
      seen.set(name, lineNo);
      declarations.push({ name, file, line: lineNo, hasValue, looksSecret: false });
    }
  } catch {
    warnings.add(`${file}: could not parse`);
  }

  return { declarations, comments, warnings: [...warnings].sort() };
}
