import { defineConfig } from '@playwright/test';

const port = process.env.EXPO_E2E_PORT ?? '8081';
const host = process.env.EXPO_E2E_HOST ?? 'localhost';
const baseURL = `http://${host}:${port}`;
const verifyEdge = process.env.EXPO_E2E_EDGE === '1';
const verifyResults = process.env.HANDSON_E2E_EDGE_RESULTS === '1';
const edgeSpec = verifyResults ? 'edge-results.spec.ts' : 'edge-connection.spec.ts';
const useEdge = verifyEdge || verifyResults;
const artifactsDir = verifyResults
  ? 'artifacts/playwright/edge-results'
  : verifyEdge
    ? 'artifacts/playwright/edge'
    : 'artifacts/playwright';

export default defineConfig({
  testDir: './e2e',
  testMatch: useEdge ? edgeSpec : undefined,
  testIgnore: useEdge ? undefined : ['edge-connection.spec.ts', 'edge-results.spec.ts'],
  outputDir: `${artifactsDir}/test-results`,
  reporter: [['list'], ['html', { outputFolder: `${artifactsDir}/report`, open: 'never' }]],
  use: {
    baseURL,
    browserName: 'chromium',
  },
  webServer: {
    command: `npm run web -- --${host === 'localhost' ? 'localhost' : 'lan'} --port ${port}`,
    url: baseURL,
    reuseExistingServer: !useEdge,
    timeout: 120_000,
    env: {
      CI: '1',
      HANDSON_E2E_EDGE_TOKEN: '',
      HANDSON_E2E_OPERATOR_TOKEN: '',
      HANDSON_E2E_EXPERT_TOKEN: '',
      ...(!useEdge && { EXPO_PUBLIC_HANDSON_EDGE_BASE_URL: '' }),
    },
  },
});
