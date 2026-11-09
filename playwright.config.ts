import { defineConfig } from '@playwright/test';

const port = process.env.EXPO_E2E_PORT ?? '8081';
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e',
  outputDir: './artifacts/playwright/test-results',
  reporter: [['list'], ['html', { outputFolder: 'artifacts/playwright/report', open: 'never' }]],
  use: {
    baseURL,
    browserName: 'chromium',
  },
  webServer: {
    command: `npm run web -- --localhost --port ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { CI: '1' },
  },
});
