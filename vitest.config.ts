import { defineConfig } from 'vitest/config';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

if (existsSync('.env')) loadEnvFile('.env');

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    reporters: ['default', 'json', 'junit'],
    outputFile: { json: 'reports/tests.json', junit: 'reports/junit.xml' },
    fileParallelism: false,
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts'],
      reporter: ['text', 'json-summary', 'lcov', 'html'],
      reportsDirectory: 'reports/coverage',
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
    },
  },
});
