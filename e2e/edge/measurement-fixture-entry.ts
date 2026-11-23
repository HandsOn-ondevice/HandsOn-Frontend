import { expect, type Page } from '@playwright/test';
import { measurementSessionId } from '../../test/edge-measurement-fixture';

const environment = {
  id: 'kit-lab',
  name: '측정 검증 실습실',
  workType: '거리 측정',
  deviceName: '검증용 키트',
};
const token = 'edge-measurement-fixture';
const entryResponses = {
  '/api/v1/system/health': { api: 'alive' },
  '/api/v1/work-profiles': [
    {
      ...environment,
      id: 'kit-distance-v1',
      environmentId: environment.id,
      profileVersion: '1.0.0',
    },
  ],
  '/api/v1/environments': [environment],
  '/api/v1/home/student': {
    researcherName: '연구생',
    deviceStatus: 'connected',
    ongoingSession: null,
    approvedProcedures: [],
    recentResults: [],
  },
};

export async function enterEdgeMeasurementFixture(page: Page, origin: string) {
  await page.route(`${origin}/api/v1/sessions/${measurementSessionId}/heartbeat`, async (route) => {
    const request = route.request();
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization',
      'access-control-allow-methods': 'POST, OPTIONS',
    };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    expect(request.method()).toBe('POST');
    expect(await request.headerValue('authorization')).toBe(`Bearer ${token}`);
    expect(request.postData()).toBeNull();
    await route.fulfill({
      headers,
      json: { sessionId: measurementSessionId, receivedAt: new Date().toISOString() },
    });
  });
  await page.route(
    (url) => url.origin === origin && Object.hasOwn(entryResponses, url.pathname),
    async (route) => {
      const request = route.request();
      const { pathname } = new URL(request.url());
      const headers = {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization',
        'access-control-allow-methods': 'GET, OPTIONS',
      };
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers });
        return;
      }
      expect(request.method()).toBe('GET');
      expect(await request.headerValue('authorization')).toBe(`Bearer ${token}`);
      await route.fulfill({
        headers,
        json: entryResponses[pathname as keyof typeof entryResponses],
      });
    },
  );

  await page.goto('/');
  await page.getByRole('radio', { name: '신규 연구생, 승인된 절차 실행' }).click();
  await page.getByLabel('Edge 접속 토큰', { exact: true }).fill(token);
  await page.getByRole('button', { name: '작업 환경 불러오기', exact: true }).click();
  await page.getByRole('button', { name: /^연구실: / }).click();
  await page.getByRole('radio', { name: environment.name, exact: true }).click();
  await page.getByRole('button', { name: '설정하고 계속', exact: true }).click();
  await expect(page.getByTestId('student-home')).toBeVisible();
}

export async function openEdgeMeasurementFixtureScreen(page: Page, path: string) {
  // A document reload clears the authenticated selection held in the app provider.
  await page.evaluate((screen) => {
    history.pushState({}, '', screen);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
