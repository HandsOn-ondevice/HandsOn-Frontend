import { expect, test, type Page, type Request, type Response } from '@playwright/test';

const healthPath = '/api/v1/system/health';
const profilesPath = '/api/v1/work-profiles';

test.use({
  viewport: { width: 412, height: 920 },
  isMobile: true,
  hasTouch: true,
  trace: 'off',
  screenshot: 'off',
  video: 'off',
});

function requestEvidence(request: Request) {
  const { pathname, search } = new URL(request.url());
  return {
    method: request.method(),
    path: pathname,
    query: search,
    body: request.postData(),
  };
}

async function readAttempt(page: Page, responses: Response[], responseOffset: number) {
  const findResponse = (path: string) => {
    const matches = (response: Response) => new URL(response.url()).pathname === path;
    return responses.slice(responseOffset).find(matches) ?? page.waitForResponse(matches);
  };
  const health = await findResponse(healthPath);
  const profiles = health.ok() ? await findResponse(profilesPath) : undefined;
  return { health, profiles };
}

test('모바일에서 연결 실패 후 실제 Edge 상태와 작업 환경을 조회한다', async ({
  page,
}, testInfo) => {
  const requests: Request[] = [];
  const responses: Response[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/v1/')) requests.push(request);
  });
  page.on('response', (response) => responses.push(response));

  const releaseFailure = Promise.withResolvers<void>();
  await page.route(
    (url) => url.pathname === healthPath,
    async (route) => {
      await releaseFailure.promise;
      await route.abort('internetdisconnected');
    },
    { times: 1 },
  );

  const continueButton = page.getByRole('button', { name: '설정하고 계속' });
  const retryButton = page.getByRole('button', { name: '다시 시도' });
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('button', { name: '연구실: 작업 환경을 불러오는 중' }),
    ).toBeDisabled();
    await expect(continueButton).toBeDisabled();
  } finally {
    releaseFailure.resolve();
  }

  await expect(page.getByText('Edge 서버에 연결할 수 없어요.')).toBeVisible();
  await expect(retryButton).toBeEnabled();
  await expect(continueButton).toBeDisabled();

  const retryOffset = responses.length;
  await retryButton.click();
  let attempt = await readAttempt(page, responses, retryOffset);
  const unauthenticatedResponse = attempt.profiles ?? attempt.health;
  let authFailure;
  if ([401, 403].includes(unauthenticatedResponse.status())) {
    const status = unauthenticatedResponse.status();
    const { error } = (await unauthenticatedResponse.json()) as { error: { code: string } };
    authFailure = {
      request: requestEvidence(unauthenticatedResponse.request()),
      status,
      code: error.code,
    };
    await expect(page.getByText('Edge 서버 인증을 확인해 주세요.')).toBeVisible();
    await expect(page.getByText(`HTTP ${status} · ${error.code}`, { exact: true })).toBeVisible();
    await expect(retryButton).toBeDisabled();
    const token = process.env.HANDSON_E2E_EDGE_TOKEN;
    if (!token) throw new Error('실제 Edge 인증 검증에는 HANDSON_E2E_EDGE_TOKEN이 필요합니다.');
    try {
      await page.getByLabel('Edge 접속 토큰', { exact: true }).fill(token);
    } catch {
      throw new Error('Edge 접속 토큰 입력란에 인증 값을 입력할 수 없습니다.');
    }
    const authRetryOffset = responses.length;
    await retryButton.click();
    attempt = await readAttempt(page, responses, authRetryOffset);
    const authorization = await attempt.health.request().headerValue('authorization');
    expect(authorization?.startsWith('Bearer ')).toBe(true);
    expect(authorization === (await attempt.profiles?.request().headerValue('authorization'))).toBe(
      true,
    );
  }

  const { health, profiles } = attempt;
  expect(health.ok()).toBe(true);
  expect((await health.json()).api).toBe('alive');
  if (!profiles) throw new Error('Edge 작업 환경 조회 응답이 없습니다.');
  expect(profiles.ok()).toBe(true);
  expect(requestEvidence(health.request())).toEqual({
    method: 'GET',
    path: healthPath,
    query: '',
    body: null,
  });
  expect(requestEvidence(profiles.request())).toEqual({
    method: 'GET',
    path: profilesPath,
    query: '',
    body: null,
  });
  const edgeOrigin = new URL(health.url()).origin;
  const webOrigin = new URL(page.url()).origin;
  expect(new URL(profiles.url()).origin).toBe(edgeOrigin);
  expect(webOrigin).not.toBe(edgeOrigin);
  for (const response of [health, profiles]) {
    expect([webOrigin, '*']).toContain(await response.headerValue('access-control-allow-origin'));
  }

  const workProfiles = (await profiles.json()) as {
    id: string;
    name: string;
    workType: string;
    deviceName: string;
  }[];
  expect(workProfiles.length).toBeGreaterThan(0);

  const environmentField = page.getByRole('button', { name: /^연구실: / });
  await expect(environmentField).toBeEnabled();
  await expect(retryButton).toBeHidden();
  await environmentField.click();
  for (const profile of workProfiles) {
    await expect(
      page.getByRole('radio', { name: profile.name, exact: true }).first(),
    ).toBeVisible();
  }
  const selected = workProfiles[0];
  await page.getByRole('radio', { name: selected.name, exact: true }).first().click();
  await expect(environmentField).toHaveAccessibleName(`연구실: ${selected.name}`);
  await expect(page.getByText(`프로필 ID · ${selected.id}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`작업 유형 · ${selected.workType}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`실행 장치 · ${selected.deviceName}`, { exact: true })).toBeVisible();

  await page.getByRole('radio', { name: '신규 연구생, 승인된 절차 실행' }).click();
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  await expect(page.getByRole('heading', { name: '연구생 홈' })).toBeVisible();
  await expect(
    page.getByTestId('student-home').getByText(selected.name, { exact: true }),
  ).toBeVisible();
  expect(requests.map((request) => request.method()).filter((method) => method !== 'GET')).toEqual(
    [],
  );

  await testInfo.attach('edge-requests', {
    contentType: 'application/json',
    body: JSON.stringify({
      viewport: page.viewportSize(),
      authFailure,
      health: { request: requestEvidence(health.request()), status: health.status() },
      workProfiles: {
        request: requestEvidence(profiles.request()),
        status: profiles.status(),
        profiles: workProfiles.map(({ id, name }) => ({ id, name })),
      },
    }),
  });
});
