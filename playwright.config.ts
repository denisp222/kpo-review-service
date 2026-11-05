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
    offline: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
