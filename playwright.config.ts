import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  timeout: 30000,
  globalTimeout: 180000,
  outputDir: 'reports/e2e-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/playwright', open: 'never' }],
    ['json', { outputFile: 'reports/e2e.json' }],
    ['junit', { outputFile: 'reports/e2e-junit.xml' }],
  ],
  use: {
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1366, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: 'http://127.0.0.1:3188/health',
    reuseExistingServer: false,
    timeout: 30000,
  },
  projects: [
    { name: 'prototype', testMatch: 'prototype.spec.ts', use: { offline: true } },
    {
      name: 'release',
      testMatch: 'release.spec.ts',
      use: { baseURL: 'http://127.0.0.1:3188', offline: false },
    },
  ],
});
