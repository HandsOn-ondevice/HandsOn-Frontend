import { defineConfig } from '@playwright/test';

const port = process.env.EXPO_E2E_PORT ?? '8081';
const host = process.env.EXPO_E2E_HOST ?? 'localhost';
const baseURL = `http://${host}:${port}`;
const verifyEdge = process.env.EXPO_E2E_EDGE === '1';
const verifyResults = process.env.HANDSON_E2E_EDGE_RESULTS === '1';
const verifyDrafts = process.env.HANDSON_E2E_EDGE_DRAFTS === '1';
const verifySubmission = process.env.HANDSON_E2E_EDGE_SUBMISSION === '1';
const verifyApproval = process.env.HANDSON_E2E_EDGE_APPROVAL === '1';
const verifyStart = process.env.HANDSON_E2E_EDGE_START === '1';
const startSpec = 'edge-execution-start.spec.ts';
const edgeSuites = [
  { enabled: verifySubmission, spec: 'edge-submission.spec.ts', folder: '/edge-submission' },
  { enabled: verifyApproval, spec: 'edge-approval.spec.ts', folder: '/edge-approval' },
  { enabled: verifyResults, spec: 'edge-results.spec.ts', folder: '/edge-results' },
  { enabled: verifyEdge, spec: 'edge-connection.spec.ts', folder: '/edge' },
  { enabled: verifyDrafts, spec: 'edge-drafts.spec.ts', folder: '/edge-drafts' },
  { enabled: verifyStart, spec: startSpec, folder: '/edge-execution-start' },
];
const edgeSuite = edgeSuites.find(({ enabled }) => enabled);
const useEdgeServer =
  Boolean(edgeSuite) ||
  process.env.HANDSON_E2E_EDGE_HOME === '1' ||
  process.env.HANDSON_E2E_EDGE_SESSION === '1' ||
  process.env.HANDSON_E2E_EDGE_EXECUTION === '1' ||
  process.env.HANDSON_E2E_LIGHT_HOLD === '1' ||
  process.env.HANDSON_E2E_LIVE_EDGE === '1';
const artifactsDir = `artifacts/playwright${edgeSuite?.folder ?? ''}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: edgeSuite?.spec,
  testIgnore: edgeSuite ? undefined : edgeSuites.map(({ spec }) => spec),
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
