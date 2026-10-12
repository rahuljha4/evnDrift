import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'scripts/**/*.test.mjs'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**/*.ts'],
      exclude: ['packages/core/src/types.ts', 'packages/core/src/index.ts'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        lines: 90,
      },
    },
  },
});
