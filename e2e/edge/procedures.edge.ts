import { expect, test, type Locator, type Page } from '@playwright/test';

const environment = {
  id: 'kit-lab',
  name: '지급 키트 실습실',
  workType: '거리 확인',
  deviceName: 'Orange Pi (모델 미확인)',
  dataOrigin: 'simulation',
};
const profileId = 'kit-distance-v1';
const workProfile = {
  ...environment,
  id: profileId,
  environmentId: environment.id,
  profileVersion: '1.0.0',
};
const operatorId = 'operator-01';
const preparation = [
  {
    id: 'materials',
    title: '지급 부품 확인',
    description: 'LED·저항·초음파센서·연결선을 확인하세요.',
    guidance: '지급 부품을 한 가지씩 확인하세요.',
    owner: 'operator',
    verifiedAt: 'S04',
    requiredForDeviceCheck: true,
  },
];
const procedure = {
  procedureId: 'kit-distance-mobile',
  version: '1.3.2',
  approval: 'approved',
  environmentId: environment.id,
  workProfileId: profileId,
  title: '지급 키트 초음파 거리 확인과 반복 측정 기록 절차',
  description: '측정 대상을 센서 정면에 배치하고 반복 측정 기록을 남깁니다.',
  code: 'kit-distance-mobile',
  category: 'sensor',
  approvedBy: 'QA 검토자',
  estimatedMinutes: 17,
  stepCount: 6,
  deviceId: 'kit-circuit-01',
  gatewayId: 'orange-pi-01',
  preparation,
  deviceCheck: { deviceId: 'orange-pi-01', title: '실험 키트 확인', sensors: [] },
  execution: {
    provenance: 'approved',
    profileVersion: '1.0.0',
    settlingSeconds: 0.2,
    conditions: [{ id: 'placement-20cm', label: '거리 배치 확인', repetitions: 3 }],
  },
  dataOrigin: 'simulation',
  equipment: ['오렌지파이', '초음파센서', 'LED', '저항', '연결선'],
  criteria: [{ title: '거리 측정 기준', description: '측정 대상을 15~25cm에 배치합니다.' }],
  steps: ['준비물 확인', '배선 확인', '거리 배치', '측정', '완료 확인', '기록'],
  precautions: ['센서 입력 전압과 전원 차단 여부를 확인하고 배선을 점검하세요.'],
  conditions: [{ label: '거리 배치 확인', repetitions: 3 }],
};
const timestamp = '2026-11-23T00:00:00Z';
const session = {
  sessionId: 'session-api03',
  operatorId,
  source: 'api',
  dataOrigin: 'simulation',
  executionMode: 'simulation',
  schemaVersion: '1.0',
  procedure,
  phase: 'preparing',
  revision: 0,
  createdAt: timestamp,
  updatedAt: timestamp,
  checks: [{ id: 'materials', checked: false, confirmedAt: null, evidenceId: null }],
  evidence: [],
  events: [],
  deviceChecks: [],
  pendingJob: null,
  holdReason: null,
};

const startLabel = '이 버전으로 준비 시작';
const confirmLabel = '선택한 절차 확인';
const sessionPath = `/api/v1/sessions/${session.sessionId}`;
const preparationRoute = `/researcher-workflow/${session.sessionId}/preparation`;

async function interceptEdge(page: Page, mode: 'retry' | 'reject') {
  const listResponse = Promise.withResolvers<void>();
  const detailResponse = Promise.withResolvers<void>();
  const createResponse = Promise.withResolvers<void>();
  const sessionResponse = Promise.withResolvers<void>();
  const lists: (string | null)[] = [];
  const details: (string | null)[] = [];
  const creates: { key: string | undefined; body: Record<string, unknown> }[] = [];
  const reads: string[] = [];
  const sessionsByKey = new Map<string, typeof session>();

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = `${request.method()} ${url.pathname}`;
    switch (endpoint) {
      case 'GET /api/v1/system/health':
        return route.fulfill({ json: { api: 'alive' } });
      case 'GET /api/v1/environments':
        return route.fulfill({ json: [environment] });
      case 'GET /api/v1/work-profiles':
        return route.fulfill({ json: [workProfile] });
      case 'GET /api/v1/home/student':
        return route.fulfill({
          json: {
            environmentId: environment.id,
            approvedProcedures: [],
            activeSession: null,
            recentResults: [],
          },
        });
      case 'GET /api/v1/procedures':
        lists.push(url.searchParams.get('environmentId'));
        if (mode === 'retry' && lists.length === 1) {
          await listResponse.promise;
          return route.fulfill({
            status: 503,
            json: {
              error: {
                code: 'SERVICE_UNAVAILABLE',
                message: '조회가 지연됩니다.',
                retryable: true,
              },
            },
          });
        }
        return route.fulfill({ json: [procedure] });
      case `GET /api/v1/procedures/${procedure.procedureId}`:
        details.push(url.searchParams.get('version'));
        if (mode === 'retry') await detailResponse.promise;
        return route.fulfill({ json: procedure });
      case 'POST /api/v1/sessions': {
        const body: Record<string, unknown> = request.postDataJSON();
        const key = request.headers()['idempotency-key'];
        creates.push({ key, body });
        if (mode === 'reject') {
          return route.fulfill({
            status: 404,
            json: {
              error: {
                code: 'NOT_FOUND',
                message: '선택한 절차 버전이 없습니다.',
                requestId: body.requestId,
                retryable: false,
                details: {},
              },
            },
          });
        }

        const idempotencyKey = key ?? `missing-key-${creates.length}`;
        const existing = sessionsByKey.get(idempotencyKey);
        if (!existing) sessionsByKey.set(idempotencyKey, session);
        if (creates.length === 1) {
          await createResponse.promise;
        }
        // Lose both the committed response and the immediate replay.
        if (creates.length <= 2) return route.abort('connectionreset');
        return route.fulfill({
          status: 201,
          json: existing ?? session,
          headers: existing ? { 'X-Idempotent-Replay': 'true' } : undefined,
        });
      }
      case `GET ${sessionPath}`:
        reads.push(url.pathname);
        await sessionResponse.promise;
        return route.fulfill({ json: session });
      default:
        return route.fulfill({
          status: 404,
          json: { error: { code: 'NOT_FOUND', message: endpoint } },
        });
    }
  });

  return {
    listResponse,
    detailResponse,
    createResponse,
    sessionResponse,
    lists,
    details,
    creates,
    reads,
    sessionsByKey,
  };
}

async function openList(page: Page) {
  await page.goto('/');
  await page.getByRole('radio', { name: '신규 연구생, 승인된 절차 실행' }).click();
  await page.getByRole('button', { name: /^연구실: / }).click();
  await page.getByRole('radio', { name: environment.name, exact: true }).click();
  await expect(page.getByText(`프로필 ID · ${profileId}`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '설정하고 계속' }).click();
  await page.getByRole('tab', { name: '실험', exact: true }).click();
  await expect(page).toHaveURL(`/procedures?environmentId=${environment.id}`);
}

async function assertWithinViewport(page: Page, locator: Locator) {
  await expect(locator).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
}

async function assertAboveAction(page: Page, text: Locator, action: Locator) {
  await text.scrollIntoViewIfNeeded();
  await assertWithinViewport(page, text);
  await assertWithinViewport(page, action);
  const [content, footer] = await Promise.all([text.boundingBox(), action.boundingBox()]);
  expect(content!.y + content!.height).toBeLessThanOrEqual(footer!.y);
}

async function chooseProcedure(page: Page) {
  const card = page.getByRole('button', { name: new RegExp(procedure.title) });
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAccessibleName(
    new RegExp(`${procedure.version}.*${procedure.approvedBy}`),
  );
  await card.click();
  await page.getByRole('button', { name: confirmLabel, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/procedures/${procedure.procedureId}\\?`));
}

for (const viewport of [
  { width: 360, height: 800 },
  { width: 412, height: 920 },
]) {
  test(`${viewport.width}×${viewport.height} 승인 절차 조회, 생성 응답 유실 후 재시도와 S04 진입`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const api = await interceptEdge(page, 'retry');
    await openList(page);

    const confirm = page.getByRole('button', { name: confirmLabel, exact: true });
    await assertAboveAction(page, page.getByText('승인 절차를 불러오는 중'), confirm);
    await expect(confirm).toBeDisabled();
    api.listResponse.resolve();
    await assertAboveAction(page, page.getByText('승인 절차를 불러오지 못했어요.'), confirm);
    const retry = page.getByRole('button', { name: '다시 시도', exact: true });
    await assertAboveAction(page, retry, confirm);
    await retry.click();

    await assertWithinViewport(page, page.getByText('승인된 절차 1개'));
    expect(api.lists).toEqual([environment.id, environment.id]);
    await chooseProcedure(page);

    const start = page.getByRole('button', { name: startLabel, exact: true });
    await assertAboveAction(page, page.getByText('절차를 불러오는 중'), start);
    await expect(start).toBeDisabled();
    api.detailResponse.resolve();

    await assertWithinViewport(page, page.getByRole('heading', { name: procedure.title }));
    await assertWithinViewport(
      page,
      page.getByText(`${procedure.code} · 승인 버전 ${procedure.version}`),
    );
    await assertAboveAction(page, page.getByText(procedure.approvedBy, { exact: true }), start);
    await assertAboveAction(
      page,
      page.getByText(`약 ${procedure.estimatedMinutes}분`, { exact: true }),
      start,
    );
    expect(api.details).toEqual([procedure.version]);
    const precaution = page.getByText(procedure.precautions[0], { exact: true });
    await expect(precaution).not.toBeInViewport();
    await assertAboveAction(page, precaution, start);
    await page.screenshot({ path: testInfo.outputPath('s03-scroll.png') });

    await start.dblclick();
    await expect(start).toBeDisabled();
    await assertWithinViewport(page, start);
    await expect.poll(() => api.creates.length).toBe(1);
    api.createResponse.resolve();

    const error = page.getByText('서버가 세션을 시작했는지 확인하지 못했어요. 다시 시도해 주세요.');
    await assertAboveAction(page, error, start);
    await expect(start).toBeEnabled();
    expect(api.creates).toHaveLength(2);
    await page.screenshot({ path: testInfo.outputPath('s03-create-retry.png') });
    await start.click();

    await expect(page).toHaveURL(preparationRoute);
    await assertWithinViewport(page, page.getByText('준비 상태를 불러오고 있습니다.'));
    await expect.poll(() => api.reads).toEqual([sessionPath]);
    api.sessionResponse.resolve();
    await assertWithinViewport(
      page,
      page.getByRole('checkbox', { name: preparation[0].title, exact: true }),
    );
    await page.getByRole('button', { name: '더 보기', exact: true }).click();
    await assertWithinViewport(
      page,
      page.getByText(`${procedure.title} · v${procedure.version}`, { exact: true }),
    );

    expect(api.creates).toHaveLength(3);
    expect(api.creates[0].key).toBeTruthy();
    expect(api.creates[0].body).toEqual({
      requestId: api.creates[0].key,
      procedureId: procedure.procedureId,
      procedureVersion: procedure.version,
      workProfileId: profileId,
      operatorId,
    });
    expect(api.creates.slice(1)).toEqual([api.creates[0], api.creates[0]]);
    expect(api.sessionsByKey.size).toBe(1);
    await page.screenshot({ path: testInfo.outputPath('s04-session.png') });

    await page.getByRole('button', { name: '하단 시트 닫기' }).click();
    await page.getByRole('button', { name: '뒤로가기' }).click();
    await expect(page).toHaveURL(new RegExp(`/procedures/${procedure.procedureId}\\?`));
    await start.click();
    await expect(page).toHaveURL(preparationRoute);
    await expect(
      page.getByRole('checkbox', { name: preparation[0].title, exact: true }),
    ).toBeVisible();
    await expect.poll(() => api.reads.length).toBeGreaterThan(1);
    expect([...new Set(api.reads)]).toEqual([sessionPath]);
    expect(api.creates).toHaveLength(3);
  });
}

test('삭제된 승인 버전에는 S03에서 재선택 방법을 안내하고 세션을 열지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const api = await interceptEdge(page, 'reject');
  await openList(page);
  await chooseProcedure(page);

  const start = page.getByRole('button', { name: startLabel, exact: true });
  await start.click();
  await assertAboveAction(
    page,
    page.getByText('선택한 절차·버전을 더 이상 준비할 수 없어요. 목록에서 다시 선택해 주세요.'),
    start,
  );
  await expect(start).toBeDisabled();
  expect(api.creates).toHaveLength(1);
  expect(api.reads).toEqual([]);

  await page.getByRole('button', { name: '뒤로가기' }).click();
  await expect(page).toHaveURL(`/procedures?environmentId=${environment.id}`);
  await assertWithinViewport(page, page.getByText('승인된 절차 1개'));
});
