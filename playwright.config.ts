import { defineConfig } from '@playwright/test';

const port = process.env.EXPO_E2E_PORT ?? '8081';
const host = process.env.EXPO_E2E_HOST ?? 'localhost';
const baseURL = `http://${host}:${port}`;
const verifyEdge = process.env.EXPO_E2E_EDGE === '1';
const verifyResults = process.env.HANDSON_E2E_EDGE_RESULTS === '1';
const verifyDrafts = process.env.HANDSON_E2E_EDGE_DRAFTS === '1';
const verifySubmission = process.env.HANDSON_E2E_EDGE_SUBMISSION === '1';
const verifyStart = process.env.HANDSON_E2E_EDGE_START === '1';
const startSpec = 'edge-execution-start.spec.ts';
const edgeSuite = verifySubmission
  ? { spec: 'edge-submission.spec.ts', folder: '/edge-submission' }
  : verifyResults
    ? { spec: 'edge-results.spec.ts', folder: '/edge-results' }
    : verifyEdge
      ? { spec: 'edge-connection.spec.ts', folder: '/edge' }
      : verifyDrafts
        ? { spec: 'edge-drafts.spec.ts', folder: '/edge-drafts' }
        : verifyStart
          ? { spec: startSpec, folder: '/edge-execution-start' }
          : undefined;
const useEdgeServer =
  Boolean(edgeSuite) ||
  process.env.HANDSON_E2E_EDGE_HOME === '1' ||
  process.env.HANDSON_E2E_EDGE_SESSION === '1' ||
  process.env.HANDSON_E2E_EDGE_EXECUTION === '1' ||
  process.env.HANDSON_E2E_LIVE_EDGE === '1';
const artifactsDir = `artifacts/playwright${edgeSuite?.folder ?? ''}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: edgeSuite?.spec,
  testIgnore: edgeSuite
    ? undefined
    : [
        'edge-connection.spec.ts',
        'edge-drafts.spec.ts',
        'edge-results.spec.ts',
        'edge-submission.spec.ts',
        startSpec,
      ],
  workers: edgeSuite?.spec === startSpec ? 1 : undefined,
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
