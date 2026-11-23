import { defineConfig } from '@playwright/test';

const port = process.env.EXPO_E2E_PORT ?? '8081';
const host = process.env.EXPO_E2E_HOST ?? 'localhost';
const baseURL = `http://${host}:${port}`;
const verifyEdge = process.env.EXPO_E2E_EDGE === '1';
const artifactsDir = verifyEdge ? 'artifacts/playwright/edge' : 'artifacts/playwright';

export default defineConfig({
  testDir: './e2e',
  testMatch: verifyEdge ? 'edge-connection.spec.ts' : undefined,
  testIgnore: verifyEdge ? undefined : 'edge-connection.spec.ts',
  outputDir: `${artifactsDir}/test-results`,
  reporter: [['list'], ['html', { outputFolder: `${artifactsDir}/report`, open: 'never' }]],
  use: {
    baseURL,
    browserName: 'chromium',
  },
  webServer: {
    command: `npm run web -- --${host === 'localhost' ? 'localhost' : 'lan'} --port ${port}`,
    url: baseURL,
    reuseExistingServer: !verifyEdge,
    timeout: 120_000,
    env: {
      CI: '1',
      HANDSON_E2E_EDGE_TOKEN: '',
      ...(!verifyEdge && { EXPO_PUBLIC_HANDSON_EDGE_BASE_URL: '' }),
    },
  },
});
