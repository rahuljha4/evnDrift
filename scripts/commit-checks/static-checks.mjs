// Deterministic text checks used by the code-review pre-flight. Free-text review under-tiered
// these in 2 of 5 evaluation runs, so they are pre-flight FAILs the skill maps to HIGH.

const WEAK =
  /\.(toBeTruthy|toBeFalsy|toBeDefined)\(\)|\.not\.toBe(Null|Undefined)\(\)|\.toBeGreaterThan\(0\)/;

/**
 * Lines whose assertion passes for almost any non-empty result.
 * @param {string} text test file contents @returns {{ line: number, text: string }[]}
 */
export function findWeakAssertions(text) {
  const out = [];
  text.split('\n').forEach((raw, i) => {
    if (WEAK.test(raw) && !/^\s*\/\//.test(raw)) out.push({ line: i + 1, text: raw.trim() });
  });
  return out;
}

const AGGREGATOR =
  /export\s+(?:async\s+)?(?:function|const)\s+(runRules|runAll|collectFindings|finalize)\b/;

/**
 * An exported function that hands findings on (`runRules`, `finalize`, ...) in a file that
 * never sorts breaks hard rule 5 (deterministic output).
 * @param {string} text source file contents @returns {{ line: number, name: string } | null}
 */
export function findUnsortedAggregator(text) {
  if (/\bsort\w*\s*\(/.test(text)) return null;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = AGGREGATOR.exec(lines[i]);
    if (m) return { line: i + 1, name: m[1] };
  }
  return null;
}
