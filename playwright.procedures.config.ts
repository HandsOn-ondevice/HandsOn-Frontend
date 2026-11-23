import { defineConfig } from '@playwright/test';

const port = process.env.EXPO_E2E_PORT ?? '8082';
const baseURL = `http://localhost:${port}`;
const artifactsDir = 'artifacts/playwright/edge-procedures';

export default defineConfig({
  testDir: './e2e/edge',
  testMatch: 'procedures.edge.ts',
  outputDir: `${artifactsDir}/test-results`,
  reporter: [['list'], ['html', { outputFolder: `${artifactsDir}/report`, open: 'never' }]],
  use: { baseURL, browserName: 'chromium' },
  webServer: {
    command: `npm run web -- --localhost --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { CI: '1', EXPO_PUBLIC_HANDSON_EDGE_BASE_URL: baseURL },
  },
});
