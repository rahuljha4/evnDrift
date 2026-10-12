// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'coverage/**',
      'reports/**',
      '.stryker-tmp/**',
      'fixtures/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // Node scripts for commits (scripts/commit-checks) run under Node, not in the browser.
  {
    files: ['scripts/**/*.mjs', '.claude/skills/*/scripts/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
  // Hard rule (PRD §8, §15): packages/core is pure — no fs, no network, no process.env.
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'fs', message: 'core is pure: do file I/O in packages/cli adapters.' },
            { name: 'fs/promises', message: 'core is pure: do file I/O in packages/cli adapters.' },
            { name: 'node:fs', message: 'core is pure: do file I/O in packages/cli adapters.' },
            {
              name: 'node:fs/promises',
              message: 'core is pure: do file I/O in packages/cli adapters.',
            },
            { name: 'child_process', message: 'core is pure: no subprocesses.' },
            { name: 'node:child_process', message: 'core is pure: no subprocesses.' },
            { name: 'http', message: 'core is pure: no network.' },
            { name: 'node:http', message: 'core is pure: no network.' },
            { name: 'https', message: 'core is pure: no network.' },
            { name: 'node:https', message: 'core is pure: no network.' },
            { name: 'net', message: 'core is pure: no network.' },
            { name: 'node:net', message: 'core is pure: no network.' },
          ],
          patterns: [
            {
              group: ['@aws-sdk/*'],
              message: 'core is pure: AWS lives in packages/cli/src/sources.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'process', property: 'env', message: 'core must not read process.env.' },
      ],
    },
  },
  prettier,
);
