import { expect, test, type Locator, type Page, type Response } from '@playwright/test';

const runAgainstEdge = process.env.HANDSON_E2E_EDGE_HOME === '1';
const baseUrl = process.env.EXPO_PUBLIC_HANDSON_EDGE_BASE_URL;
const viewport = { width: 360, height: 800 };
const environmentId = 'kit-lab';
const profileId = 'kit-distance-v1';
const roleLabels = {
  student: '신규 연구생, 승인된 절차 실행',
  expert: '숙련 연구생, 절차 생성·승인',
} as const;

type Role = keyof typeof roleLabels;
type ProcedureSummary = { id: string; title: string; version: string };
type StudentHome = {
  ongoingSession: { id: string; title: string; procedureVersion: string } | null;
  approvedProcedures: ProcedureSummary[];
  recentResults: { id: string; sessionId: string; title: string }[];
};
type ExpertHome = {
  procedures: (ProcedureSummary & { status: 'approved' | 'draft' })[];
  results: {
    id: string;
    procedureId: string;
    studentName: string;
    deviceName: string;
    summary: string;
    status: string;
  }[];
};
type Session = {
  sessionId: string;
  phase: string;
  revision: number;
  procedure: { title: string; version: string; preparation: { id: string }[] };
  checks: { id: string; checked: boolean }[];
};

test.use({ viewport, isMobile: true, hasTouch: true });
test.skip(!runAgainstEdge, 'Set HANDSON_E2E_EDGE_HOME=1 to run against an isolated Edge.');

function isEdgeRequest(url: URL) {
  return (
    Boolean(baseUrl && url.origin === new URL(baseUrl).origin) &&
    url.pathname.startsWith('/api/v1/')
  );
}

function waitForEdge(page: Page, path: string) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return isEdgeRequest(url) && url.pathname === `/api/v1${path}`;
  });
}

async function readEdge<T>(response: Response, expectedEnvironmentId?: string): Promise<T> {
  expect(response.request().method()).toBe('GET');
  if (expectedEnvironmentId) {
    expect(new URL(response.url()).searchParams.get('environmentId')).toBe(expectedEnvironmentId);
  }
  expect(response.status()).toBe(200);
  return response.json() as Promise<T>;
}

function describeRequest(response: Response) {
  const url = new URL(response.url());
  return `${response.request().method()} ${url.pathname}${url.search}`;
}

async function checkMobileLayout(page: Page, item: Locator) {
  await item.scrollIntoViewIfNeeded();
  await expect(item).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    viewport.width,
  );
}

async function selectEnvironment(page: Page, role: Role) {
  const token =
    role === 'student'
      ? process.env.HANDSON_E2E_OPERATOR_TOKEN
      : process.env.HANDSON_E2E_EXPERT_TOKEN;
  if (!baseUrl || !token) {
    throw new Error(
      'Configure the Edge base URL and test role token before running Edge home E2E.',
    );
  }

  await page.goto('/');
  await page.getByRole('radio', { name: roleLabels[role] }).click();
  await page.getByLabel('Edge 접속 토큰', { exact: true }).fill(token);

  const profilesResponse = waitForEdge(page, '/work-profiles');
  const environmentsResponse = waitForEdge(page, '/environments');
  await page.getByRole('button', { name: '작업 환경 불러오기', exact: true }).click();
  const profiles = await readEdge<{ id: string; environmentId: string }[]>(await profilesResponse);
  const environments = await readEdge<{ id: string; name: string }[]>(await environmentsResponse);
  expect(profiles).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: profileId, environmentId })]),
  );
  const environment = environments.find(({ id }) => id === environmentId);
  if (!environment) throw new Error(`Edge catalog is missing ${environmentId}.`);

  await page.getByRole('button', { name: /^연구실: / }).click();
  const option = page.getByRole('radio', { name: environment.name, exact: true });
  await checkMobileLayout(page, option);
  await option.click();
  await expect(option).toBeHidden();
  return {
    ...environment,
    requests: [await profilesResponse, await environmentsResponse].map(describeRequest),
  };
}

function collectWrites(page: Page) {
  const writes: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (isEdgeRequest(url) && !['GET', 'OPTIONS'].includes(request.method())) {
      writes.push(`${request.method()} ${url.pathname}`);
    }
  });
  return writes;
}

test('S00 → S01 → S04에서 Edge 환경과 기존 준비 세션을 조회한다', async ({ page }, testInfo) => {
  const writes = collectWrites(page);
  const environment = await selectEnvironment(page, 'student');
  let releaseFailure: () => void = () => {};
  const failure = new Promise<void>((resolve) => {
    releaseFailure = resolve;
  });
  await page.route(
    (url) => isEdgeRequest(url) && url.pathname === '/api/v1/home/student',
    async (route) => {
      await failure;
      await route.abort('failed');
    },
    { times: 1 },
  );
  const enter = page.getByRole('button', { name: '설정하고 계속', exact: true });
  await checkMobileLayout(page, enter);
  await enter.click();
  await expect(page).toHaveURL('/student');
  try {
    await checkMobileLayout(page, page.getByText('홈을 불러오는 중', { exact: true }));
    await page.screenshot({ path: testInfo.outputPath('student-loading.png') });
  } finally {
    releaseFailure();
  }

  await checkMobileLayout(page, page.getByText('홈을 불러오지 못했어요.', { exact: true }));
  await expect(page.getByText('아직 완료한 실험이 없어요.', { exact: true })).toHaveCount(0);
  const retry = page.getByRole('button', { name: '다시 시도', exact: true });
  await checkMobileLayout(page, retry);
  await page.screenshot({ path: testInfo.outputPath('student-error.png') });
  const homeResponse = waitForEdge(page, '/home/student');
  await retry.click();
  const home = await readEdge<StudentHome>(await homeResponse, environment.id);
  await expect(page.getByRole('heading', { name: '연구생 홈' })).toBeVisible();
  if (home.recentResults.length === 0) {
    await expect(page.getByText('아직 완료한 실험이 없어요.', { exact: true })).toBeVisible();
  }
  for (const result of home.recentResults) {
    await expect(
      page.getByRole('button', { name: `${result.title}, 결과 보기`, exact: true }),
    ).toBeVisible();
  }
  const procedure = home.approvedProcedures[0];
  const active = home.ongoingSession;
  if (!procedure || !active) {
    throw new Error(
      'Seed the isolated Edge with an approved procedure and an existing preparing session.',
    );
  }
  const continueButton = page.getByRole('button', { name: '이어서 진행', exact: true });
  await checkMobileLayout(page, continueButton);
  await expect(page.getByText(active.title, { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('student-home.png') });

  const proceduresResponse = waitForEdge(page, '/procedures');
  await page.getByRole('button', { name: '전체 보기', exact: true }).click();
  await expect(page).toHaveURL(`/procedures?environmentId=${environment.id}`);
  const procedures = await readEdge<{ procedureId: string; title: string; version: string }[]>(
    await proceduresResponse,
    environment.id,
  );
  expect(procedures).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        procedureId: procedure.id,
        title: procedure.title,
        version: procedure.version,
      }),
    ]),
  );
  await expect(page.getByRole('button', { name: `${procedure.title}, 승인,` })).toBeVisible();
  await page.getByRole('button', { name: '뒤로가기', exact: true }).click();

  const sessionPath = `/sessions/${encodeURIComponent(active.id)}`;
  const sessionResponse = waitForEdge(page, sessionPath);
  await continueButton.click();
  const session = await readEdge<Session>(await sessionResponse);
  expect(session.sessionId).toBe(active.id);
  expect(session.phase).toBe('preparing');
  expect(session.procedure.version).toBe(active.procedureVersion);
  await expect(page).toHaveURL(`/researcher-workflow/${encodeURIComponent(active.id)}/preparation`);
  await expect(page.getByText(`세션 ${active.id}`, { exact: true })).toBeVisible();
  await expect(
    page.getByText(`${session.procedure.title} · v${session.procedure.version}`, { exact: true }),
  ).toBeVisible();
  const completed = session.procedure.preparation.filter(({ id }) =>
    session.checks.some((check) => check.id === id && check.checked),
  ).length;
  await checkMobileLayout(
    page,
    page.getByText(
      `준비 진행도 · ${completed} / ${session.procedure.preparation.length} 항목 완료`,
      { exact: true },
    ),
  );
  await page.screenshot({ path: testInfo.outputPath('preparation.png') });
  await page.getByRole('button', { name: '뒤로가기', exact: true }).click();

  const repeatResponse = waitForEdge(page, sessionPath);
  await continueButton.click();
  const repeated = await readEdge<Session>(await repeatResponse);
  expect(repeated).toMatchObject({ sessionId: session.sessionId, revision: session.revision });
  const result = home.recentResults[0];
  if (result) {
    await page.getByRole('button', { name: '뒤로가기', exact: true }).click();
    await page
      .getByRole('button', { name: `${result.title}, 결과 보기`, exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(
      `/results/${encodeURIComponent(result.id)}?sessionId=${encodeURIComponent(result.sessionId)}`,
    );
  }
  expect(writes).toEqual([]);
  await testInfo.attach('student-edge-requests', {
    body: JSON.stringify(
      {
        viewport,
        profileId,
        environmentId: environment.id,
        paths: [
          ...environment.requests,
          ...[await homeResponse, await proceduresResponse, await sessionResponse].map(
            describeRequest,
          ),
        ],
        sessionId: session.sessionId,
        revision: session.revision,
        procedureVersion: session.procedure.version,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
});

test('S00 → E01에서 Edge 응답의 초안·승인 절차·제출 결과를 표시한다', async ({
  page,
}, testInfo) => {
  const writes = collectWrites(page);
  const environment = await selectEnvironment(page, 'expert');
  const homeResponse = waitForEdge(page, '/home/expert');
  await page.getByRole('button', { name: '설정하고 계속', exact: true }).click();
  const home = await readEdge<ExpertHome>(await homeResponse, environment.id);
  await expect(page).toHaveURL('/expert');
  await checkMobileLayout(page, page.getByRole('heading', { name: '숙련자 홈', exact: true }));
  await expect(
    page.getByText(environment.name, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  const drafts = home.procedures.filter(({ status }) => status === 'draft');
  const approved = home.procedures.filter(({ status }) => status === 'approved');
  const pending = home.results.filter(({ status }) => status === 'pending');
  await expect(
    page.getByRole('button', { name: `초안, ${drafts.length}, 개`, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: `결과 검토, ${pending.length}, 건`, exact: true }),
  ).toBeVisible();
  const approvedButton = page.getByRole('button', {
    name: `승인 절차, ${approved.length}, 개`,
    exact: true,
  });
  await checkMobileLayout(page, approvedButton);
  if (drafts.length === 0 && pending.length === 0) {
    await expect(page.getByText('확인할 항목이 없어요.', { exact: true })).toBeVisible();
  }
  for (const draft of drafts) {
    await expect(page.getByRole('button', { name: draft.title }).first()).toBeVisible();
  }
  await page.screenshot({ path: testInfo.outputPath('expert-home.png') });
  for (const result of pending) {
    const button = page.getByRole('button', {
      name: `${result.studentName} · ${result.deviceName}, 검토 대기, ${result.summary}`,
      exact: true,
    });
    await checkMobileLayout(page, button);
  }

  const draft = drafts[0];
  if (draft) {
    await page.getByRole('button', { name: draft.title }).first().click();
    await expect(page).toHaveURL(`/expert/drafts/${encodeURIComponent(draft.id)}`);
    await page.getByRole('button', { name: '숙련자 홈으로', exact: true }).click();
  }
  const result = pending[0];
  if (result) {
    await page
      .getByRole('button', {
        name: `${result.studentName} · ${result.deviceName}, 검토 대기, ${result.summary}`,
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(
      `/expert/results/${encodeURIComponent(result.id)}?procedureId=${encodeURIComponent(result.procedureId)}`,
    );
    await page.getByRole('button', { name: '숙련자 홈으로', exact: true }).click();
  }
  await approvedButton.click();
  for (const procedure of approved) {
    await expect(page.getByRole('button', { name: procedure.title }).first()).toBeVisible();
  }
  expect(writes).toEqual([]);
  await testInfo.attach('expert-edge-request', {
    body: JSON.stringify(
      {
        viewport,
        profileId,
        environmentId: environment.id,
        paths: [...environment.requests, describeRequest(await homeResponse)],
        draftIds: drafts.map(({ id }) => id),
        approvedProcedures: approved.map(({ id, version }) => ({ id, version })),
        resultIds: pending.map(({ id }) => id),
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
});
