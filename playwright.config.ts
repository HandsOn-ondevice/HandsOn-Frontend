import { defineConfig } from '@playwright/test';

const port = process.env.EXPO_E2E_PORT ?? '8081';
const host = process.env.EXPO_E2E_HOST ?? 'localhost';
const baseURL = `http://${host}:${port}`;
const verifyEdge = process.env.EXPO_E2E_EDGE === '1';
const verifyResults = process.env.HANDSON_E2E_EDGE_RESULTS === '1';
const edgeSpec = verifyResults
  ? 'edge-results.spec.ts'
  : verifyEdge
    ? 'edge-connection.spec.ts'
    : undefined;
const useEdgeServer =
  verifyResults ||
  verifyEdge ||
  process.env.HANDSON_E2E_EDGE_HOME === '1' ||
  process.env.HANDSON_E2E_EDGE_SESSION === '1' ||
  process.env.HANDSON_E2E_LIVE_EDGE === '1';
const artifactsDir = verifyResults
  ? 'artifacts/playwright/edge-results'
  : verifyEdge
    ? 'artifacts/playwright/edge'
    : 'artifacts/playwright';

export default defineConfig({
  testDir: './e2e',
  testMatch: edgeSpec,
  testIgnore: edgeSpec ? undefined : ['edge-connection.spec.ts', 'edge-results.spec.ts'],
  outputDir: `${artifactsDir}/test-results`,
  reporter: [['list'], ['html', { outputFolder: `${artifactsDir}/report`, open: 'never' }]],
  use: {
    baseURL,
    browserName: 'chromium',
  },
  webServer: {
    command: `npm run web -- --${host === 'localhost' ? 'localhost' : 'lan'} --port ${port}`,
    url: baseURL,
    reuseExistingServer: !useEdgeServer,
    timeout: 120_000,
    env: {
      CI: '1',
      HANDSON_E2E_EDGE_TOKEN: '',
      HANDSON_E2E_OPERATOR_TOKEN: '',
      HANDSON_E2E_EXPERT_TOKEN: '',
      ...(!useEdgeServer && { EXPO_PUBLIC_HANDSON_EDGE_BASE_URL: '' }),
    },
  },
});
