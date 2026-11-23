import { expect, test, type Page, type Request, type Response } from '@playwright/test';

const healthPath = '/api/v1/system/health';
const profilesPath = '/api/v1/work-profiles';
const environmentsPath = '/api/v1/environments';
const homePath = '/api/v1/home/student';

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
  const environments = profiles?.ok() ? await findResponse(environmentsPath) : undefined;
  return { health, profiles, environments };
}

test('모바일에서 연결 실패 후 실제 Edge 상태와 작업 환경을 조회한다', async ({
  page,
}, testInfo) => {
  const token = (
    process.env.HANDSON_E2E_OPERATOR_TOKEN ?? process.env.HANDSON_E2E_EDGE_TOKEN
  )?.trim();
  if (!token) throw new Error('실제 Edge 인증 검증에는 작업자 토큰이 필요합니다.');

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
  const tokenField = page.getByLabel('Edge 접속 토큰', { exact: true });
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('radio', { name: '신규 연구생, 승인된 절차 실행' }).click();
    await tokenField.fill(`invalid-${crypto.randomUUID()}`);
    await page.getByRole('button', { name: '작업 환경 불러오기', exact: true }).click();
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
  await expect(tokenField).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('01-connection-error.png') });

  const retryOffset = responses.length;
  await retryButton.click();
  const rejected = await readAttempt(page, responses, retryOffset);
  const rejectedResponse = rejected.profiles ?? rejected.health;
  const status = rejectedResponse.status();
  expect([401, 403]).toContain(status);
  const { error } = (await rejectedResponse.json()) as { error: { code: string } };
  const authFailure = {
    request: requestEvidence(rejectedResponse.request()),
    status,
    code: error.code,
  };
  await expect(page.getByText('Edge 서버 인증을 확인해 주세요.')).toBeVisible();
  await expect(page.getByText(`HTTP ${status} · ${error.code}`, { exact: true })).toBeVisible();
  await expect(retryButton).toBeDisabled();
  await expect(tokenField).toHaveValue('');
  await page.screenshot({ path: testInfo.outputPath('02-authentication-error.png') });
  try {
    await tokenField.fill(token);
  } catch {
    throw new Error('Edge 접속 토큰 입력란에 인증 값을 입력할 수 없습니다.');
  }
  const authRetryOffset = responses.length;
  await retryButton.click();

  const { health, profiles, environments } = await readAttempt(page, responses, authRetryOffset);
  expect(health.ok()).toBe(true);
  expect((await health.json()).api).toBe('alive');
  if (!profiles || !environments) throw new Error('Edge 작업 프로필 또는 환경 응답이 없습니다.');
  expect(profiles.ok()).toBe(true);
  expect(environments.ok()).toBe(true);
  const edgeOrigin = new URL(health.url()).origin;
  const webOrigin = new URL(page.url()).origin;
  expect(webOrigin).not.toBe(edgeOrigin);
  for (const [response, path] of [
    [health, healthPath],
    [profiles, profilesPath],
    [environments, environmentsPath],
  ] as const) {
    expect(requestEvidence(response.request())).toEqual({
      method: 'GET',
      path,
      query: '',
      body: null,
    });
    expect((await response.request().headerValue('authorization')) === `Bearer ${token}`).toBe(
      true,
    );
    expect(new URL(response.url()).origin).toBe(edgeOrigin);
    expect([webOrigin, '*']).toContain(await response.headerValue('access-control-allow-origin'));
  }

  const workProfiles = (await profiles.json()) as {
    id: string;
    environmentId: string;
    profileVersion: string;
  }[];
  const workEnvironments = (await environments.json()) as {
    id: string;
    name: string;
    workType: string;
    deviceName: string;
  }[];
  const selected = workEnvironments.find(({ id }) => id === 'kit-lab');
  const profile = workProfiles.find(
    ({ id, environmentId }) => id === 'kit-distance-v1' && environmentId === selected?.id,
  );
  if (!selected || !profile) throw new Error('지급 키트 실습실과 작업 프로필이 없습니다.');

  const environmentField = page.getByRole('button', { name: /^연구실: / });
  await expect(environmentField).toBeEnabled();
  await expect(retryButton).toBeHidden();
  await environmentField.click();
  const environmentOption = page.getByRole('radio', { name: selected.name, exact: true });
  await environmentOption.click();
  await expect(environmentOption).toBeHidden();
  await expect(environmentField).toHaveAccessibleName(`연구실: ${selected.name}`);
  await expect(
    page.getByText(`작업 프로필 · ${profile.id} · ${profile.profileVersion}`, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(`작업 유형 · ${selected.workType}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`실행 장치 · ${selected.deviceName}`, { exact: true })).toBeVisible();

  await expect(continueButton).toBeEnabled();
  await expect(tokenField).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('03-work-profile.png') });
  const home = page.waitForResponse(
    (response) => new URL(response.url()).pathname === homePath && response.ok(),
  );
  await continueButton.click();
  expect(requestEvidence((await home).request())).toEqual({
    method: 'GET',
    path: homePath,
    query: `?environmentId=${selected.id}`,
    body: null,
  });
  await expect(page.getByRole('heading', { name: '연구생 홈' })).toBeVisible();
  await expect(
    page.getByTestId('student-home').getByText(selected.name, { exact: true }),
  ).toBeVisible();
  expect(
    requests
      .map((request) => request.method())
      .filter((method) => !['GET', 'OPTIONS'].includes(method)),
  ).toEqual([]);

  await testInfo.attach('edge-requests', {
    contentType: 'application/json',
    body: JSON.stringify({
      viewport: page.viewportSize(),
      authFailure,
      health: { request: requestEvidence(health.request()), status: health.status() },
      workProfiles: {
        request: requestEvidence(profiles.request()),
        status: profiles.status(),
        profile,
      },
      environments: {
        request: requestEvidence(environments.request()),
        status: environments.status(),
        selected,
      },
    }),
  });
});
