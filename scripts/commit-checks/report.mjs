// Failure shape and printing shared by the hooks, the CLI and the skill.
// Every failure names the rule, the offending text/file/line, and a corrected example.

/** @typedef {{ rule: string, message: string, offender?: string, example?: string }} Failure */

/** @param {Failure[]} failures @param {string} title */
export function formatFailures(failures, title) {
  const lines = [`${title}: ${failures.length} problem${failures.length === 1 ? '' : 's'}`];
  for (const f of failures) {
    lines.push(`  x [${f.rule}] ${f.message}`);
    if (f.offender) lines.push(`      offending: ${f.offender}`);
    if (f.example) lines.push(`      example:   ${f.example}`);
  }
  lines.push('See docs/conventions/commits.md for the rules.');
  return lines.join('\n');
}

/** @param {string} rule @param {string} message @param {string} [offender] @param {string} [example] @returns {Failure} */
export const fail = (rule, message, offender, example) => ({ rule, message, offender, example });
