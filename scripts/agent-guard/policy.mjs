// Tool policy for read-only subagents. Used by the PreToolUse hook in each agent's frontmatter
// (see cli.mjs). Tool lists in frontmatter cannot limit Bash to given commands or Write to a
// directory, so the hook does: it allows a short list of exact command shapes and writes under
// one directory, and denies everything else. Fails closed.
import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

// Anything that lets one allowed command smuggle in another, or redirect output into a file.
const SHELL_META = /[;&|<>`$(){}\n\r\\]/;
const GIT_REF = '[A-Za-z0-9._/~^@-]+';
const WORD = '[A-Za-z0-9._-]+';

const COMMON_BASH = [
  new RegExp('^node scripts/quiet/(test|typecheck)\\.mjs( --no-cache)?$'),
  new RegExp(`^node scripts/doc-lookup\\.mjs (prd|rule|pattern) ${WORD}$`),
  /^git (diff|log|show|status)( [^\n]*)?$/,
];

/** Profiles: the exact Bash shapes and the one writable directory per agent. */
export const PROFILES = {
  reviewer: {
    bash: [
      ...COMMON_BASH,
      new RegExp(
        `^node \\.claude/skills/envdrift-code-review/scripts/preflight\\.mjs( --staged| --skip-tests| --base ${GIT_REF})*$`,
      ),
      new RegExp(
        `^node scripts/commit-checks/review-bundle\\.mjs (bundle( --base ${GIT_REF})?|cached|record docs/reviews/${WORD}\\.md)$`,
      ),
    ],
    writeDir: 'docs/reviews',
  },
};

const GIT_DENIED_FLAGS = /(^|\s)(--output(=|\s|$)|-o\s|--no-index|--ext-diff|--textconv|-c\s)/;

/**
 * @param {string} profileName
 * @param {{ tool_name?: string, tool_input?: Record<string, unknown>, cwd?: string }} payload
 * @param {{ projectDir?: string }} [env]
 * @returns {{ allow: boolean, reason: string }}
 */
export function decide(profileName, payload, env = {}) {
  const profile = PROFILES[profileName];
  if (!profile) return deny(`unknown agent profile "${profileName}"`);
  const tool = payload?.tool_name;
  const input = payload?.tool_input ?? {};
  if (tool === 'Bash') {
    const cmd = typeof input.command === 'string' ? input.command.trim() : '';
    if (!cmd) return deny('empty command');
    if (SHELL_META.test(cmd)) return deny(`shell operators are not allowed: ${show(cmd)}`);
    if (/^git /.test(cmd) && GIT_DENIED_FLAGS.test(cmd))
      return deny(`git flag that writes or runs external programs: ${show(cmd)}`);
    if (profile.bash.some((re) => re.test(cmd))) return { allow: true, reason: 'allowed command' };
    return deny(`command not on the allowlist: ${show(cmd)}`);
  }
  if (tool === 'Write') {
    const file = typeof input.file_path === 'string' ? input.file_path : '';
    if (!profile.writeDir) return deny('this agent may not write files');
    return checkWrite(file, profile.writeDir, [env.projectDir, payload.cwd]);
  }
  return deny(`tool not allowed for this agent: ${tool}`);
}

function checkWrite(file, writeDir, roots) {
  if (!file) return deny('no file path');
  if (!/\.md$/.test(file)) return deny(`only .md reports may be written: ${show(file)}`);
  for (const root of roots.filter(Boolean)) {
    const target = resolve(root, file);
    const dir = resolve(root, writeDir);
    if (inside(dir, resolveReal(target)))
      return { allow: true, reason: `report under ${writeDir}/` };
  }
  return deny(`writes are limited to ${writeDir}/: ${show(file)}`);
}

/** Resolve symlinks in the nearest existing parent so a link cannot point the write elsewhere. */
function resolveReal(target) {
  let dir = dirname(target);
  const tail = [target.slice(dir.length + 1)];
  for (;;) {
    try {
      return resolve(realpathSync(dir), ...tail);
    } catch {
      const up = dirname(dir);
      if (up === dir) return target;
      tail.unshift(dir.slice(up.length + 1));
      dir = up;
    }
  }
}

function inside(dir, target) {
  let realDir = dir;
  try {
    realDir = realpathSync(dir);
  } catch {
    // directory may not exist yet; compare lexically
  }
  const rel = relative(realDir, target);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

const deny = (reason) => ({ allow: false, reason });
const show = (s) => JSON.stringify(s.length > 80 ? `${s.slice(0, 77)}...` : s);
