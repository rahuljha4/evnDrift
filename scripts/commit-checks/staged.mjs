// Checks on the staged files (docs/conventions/commits.md §1.3). The pure functions take data;
// the *FromGit helpers gather it.
import { fail } from './report.mjs';
import { git, show, stagedFiles, stagedSize } from './git.mjs';

const ENV_OK = new Set(['.env.example', '.env.sample', '.env.template']);
const BUILD_SEGMENTS = [
  'dist',
  'build',
  'coverage',
  'node_modules',
  '.stryker-tmp',
  '.vitest',
  'reports',
];
export const MAX_BYTES = 1024 * 1024;

/** @param {{status:string,path:string}[]} files @param {(path:string)=>number} sizeOf */
export function checkStagedFiles(files, sizeOf) {
  const failures = [];
  for (const { status, path } of files) {
    if (status === 'D') continue;
    const parts = path.split('/');
    const base = parts[parts.length - 1];
    if (/^\.env(\..+)?$/.test(base) && !ENV_OK.has(base) && !parts.includes('fixtures')) {
      failures.push(
        fail(
          'ENV-1',
          'a real-looking .env file is staged',
          path,
          'Unstage it (git restore --staged <file>); only .env.example/.sample/.template or files under fixtures/ may be committed.',
        ),
      );
    }
    const seg = parts.slice(0, -1).find((s) => BUILD_SEGMENTS.includes(s));
    if (seg || path.endsWith('.tgz')) {
      failures.push(
        fail(
          'BUILD-1',
          `build output, coverage or dependencies are staged (${seg ?? '.tgz'})`,
          path,
          'Unstage it and make sure it is in .gitignore.',
        ),
      );
    }
    const size = sizeOf(path);
    if (size > MAX_BYTES)
      failures.push(
        fail(
          'SIZE-1',
          `staged file is ${(size / 1024 / 1024).toFixed(1)} MB; the limit is 1 MB`,
          path,
          'Unstage it or reduce its size.',
        ),
      );
  }
  return failures;
}

const DEP_SECTIONS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];

/** Dependencies present in `after` but not in `before` (package.json texts). */
export function addedDependencies(file, before, after) {
  const names = (text) => {
    const out = new Set();
    try {
      const j = JSON.parse(text ?? '{}');
      for (const s of DEP_SECTIONS) for (const k of Object.keys(j[s] ?? {})) out.add(k);
    } catch {
      /* invalid JSON is not a dependency change */
    }
    return out;
  };
  const was = names(before);
  return [...names(after)].filter((n) => !was.has(n)).map((name) => ({ name, file }));
}

/** New row numbers added to docs/ai-log.md. */
export function newAiLogRows(added) {
  return added
    .filter((a) => a.path === 'docs/ai-log.md')
    .flatMap((a) => {
      const m = /^\|\s*(\d+)\s*\|/.exec(a.text);
      return m ? [Number(m[1])] : [];
    });
}

export function addedDepsFromGit(cwd) {
  return stagedFiles(cwd)
    .filter((f) => f.status !== 'D' && /(^|\/)package\.json$/.test(f.path))
    .flatMap((f) => addedDependencies(f.path, show('HEAD', f.path, cwd), show('', f.path, cwd)));
}

export const sizeOfStaged = (cwd) => (path) => stagedSize(path, cwd);
export { git };
