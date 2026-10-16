#!/usr/bin/env node
// PreToolUse hook entry: node scripts/agent-guard/cli.mjs <profile>
// Reads the hook JSON on stdin. Exit 0 = allow, exit 2 = deny (stderr is shown to the agent).
// Any problem reading the input denies: a guard that fails open guards nothing.
import { readFileSync } from 'node:fs';
import { decide } from './policy.mjs';

let payload;
try {
  payload = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  console.error('agent-guard: could not read the hook input; denying');
  process.exit(2);
}
const result = decide(process.argv[2] ?? '', payload, {
  projectDir: process.env.CLAUDE_PROJECT_DIR,
});
if (!result.allow) {
  console.error(`agent-guard: ${result.reason}`);
  process.exit(2);
}
process.exit(0);
