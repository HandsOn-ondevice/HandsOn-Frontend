import { defineConfig } from '@playwright/test';

const baseURL = 'http://localhost:8081';

export default defineConfig({
  testDir: './e2e',
  outputDir: './artifacts/playwright/test-results',
  reporter: [['list'], ['html', { outputFolder: 'artifacts/playwright/report', open: 'never' }]],
  use: {
    baseURL,
    browserName: 'chromium',
  },
  webServer: {
    command: 'npm run web -- --localhost --port 8081',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { CI: '1' },
  },
});
