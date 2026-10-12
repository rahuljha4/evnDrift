// Milestone task IDs from docs/prd.md §19 (rows like `| M2.3 | ... |`).

/** @param {string} prdText @returns {string[]} */
export function parseTaskIds(prdText) {
  const ids = new Set();
  for (const m of prdText.matchAll(/^\|\s*(M\d+\.\d+)\s*\|/gm)) ids.add(m[1]);
  return [...ids];
}
