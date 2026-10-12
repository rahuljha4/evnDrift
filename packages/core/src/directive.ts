// Shared sanitiser for `envdrift-ignore` comments (docs/functional/suppression.md).
// Comment text can hold values (e.g. a commented-out `API_KEY=...`), so only the
// directive keyword and rule IDs are ever returned (ADR 0006).

const TAG = 'envdrift-ignore';
const FILE_TAG = `${TAG}-file`;

function isRuleId(token: string): boolean {
  if (token.length !== 5 || !token.startsWith('ED')) return false;
  for (let i = 2; i < 5; i++) {
    const c = token.charAt(i);
    if (c < '0' || c > '9') return false;
  }
  return true;
}

/**
 * `body` is the comment text after its marker (`#`, `//`, or inside `/* *\/`).
 * Returns `envdrift-ignore [EDnnn …]` (or the `-file` form when `allowFile`), else null.
 */
export function sanitizeDirective(body: string, allowFile: boolean): string | null {
  const text = body.trimStart();
  let tag: string;
  if (allowFile && text.startsWith(FILE_TAG)) tag = FILE_TAG;
  else if (text.startsWith(TAG)) tag = TAG;
  else return null;

  const after = text.slice(tag.length);
  if (after !== '' && !/^\s/.test(after)) return null;
  const ids = after.split(/\s+/).filter(isRuleId);
  return [tag, ...ids].join(' ');
}
