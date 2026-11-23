import { randomUUID } from 'node:crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Locator,
  type Page,
  type Response,
} from '@playwright/test';

const viewport = { width: 360, height: 800 };
const sessionPath = '/api/v1/sessions';
const resultPath = (resultId: string) => `/api/v1/results/${resultId}`;
const environmentId = 'kit-lab';
const comments = {
  approved: '회차별 거리 측정값과 반복 평균을 확인했습니다.',
  remeasureRequested: '다른 거리 배치에서도 한 번 더 확인해 주세요.',
};

type Decision = keyof typeof comments;
type ReviewInput = { requestId: string; decision: Decision; comment: string };
type Review = { id: string; sessionId: string; decision: Decision; comment: string };

type Session = {
  sessionId: string;
  revision: number;
  phase: string;
  pendingJob: unknown;
  procedure: {
    procedureId: string;
    title: string;
    preparation: { id: string; owner: 'operator' | 'system' }[];
    execution: { conditions: { id: string; label: string; repetitions: number }[] };
  };
  execution: {
    cursor: { cursorId: string };
    attempts: {
      attemptId: string;
      cursor: { conditionId: string };
      status: string;
      report: { diagnostics: { sensors: { readings: Reading[] }[] } };
    }[];
  };
  reviews: Review[];
};

type Reading = { metricId: string; value: number; unit: string };
type Result = {
  id: string;
  session: Session;
  completedCycles: number;
  totalCycles: number;
  dataOrigin: string;
};
type StudentHome = { recentResults: { id: string; sessionId: string; title: string }[] };
type ExpertHome = {
  results: {
    id: string;
    procedureId: string;
    studentName: string;
    deviceName: string;
    status: 'pending' | 'reviewed';
    summary: string;
  }[];
};

test.use({
  viewport,
  isMobile: true,
  hasTouch: true,
  trace: 'off',
  screenshot: 'off',
  video: 'off',
});

function isolatedEdge(request: APIRequestContext) {
  const origin = new URL(process.env.EXPO_PUBLIC_HANDSON_EDGE_BASE_URL ?? '');
  const operatorToken = process.env.HANDSON_E2E_OPERATOR_TOKEN;
  const expertToken = process.env.HANDSON_E2E_EXPERT_TOKEN;
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) ||
    !operatorToken ||
    !expertToken
  ) {
    throw new Error('Set a dedicated loopback Edge and both test tokens for result E2E.');
  }
  const operatorHeaders = { Authorization: `Bearer ${operatorToken}` };
  const expertHeaders = { Authorization: `Bearer ${expertToken}` };

  return {
    origin: origin.origin,
    token: { student: operatorToken, expert: expertToken },
    async seedCompletedResult() {
      const health = await readJson<{ executionMode: string }>(
        await request.get(`${origin.origin}/api/v1/system/health`),
      );
      expect(health.executionMode, 'Run only against Edge in simulation mode').toBe('simulation');
      const created = await request.post(`${origin.origin}${sessionPath}`, {
        headers: operatorHeaders,
        data: { requestId: randomUUID() },
      });
      let session = await readJson<Session>(created, 201);
      const sessionUrl = `${origin.origin}${sessionPath}/${session.sessionId}`;

      async function send(command: { type: string; [field: string]: string | boolean }) {
        const response = await request.post(`${sessionUrl}/commands`, {
          headers: operatorHeaders,
          data: { requestId: randomUUID(), expectedRevision: session.revision, command },
        });
        session = await readJson<Session>(response);
      }

      async function waitForJob() {
        await expect
          .poll(async () => {
            session = await readJson<Session>(
              await request.get(sessionUrl, { headers: operatorHeaders }),
            );
            return session.pendingJob;
          })
          .toBeNull();
      }

      for (const { id } of session.procedure.preparation.filter(
        ({ owner }) => owner === 'operator',
      )) {
        await send({ type: 'setPreparationCheck', checkId: id, checked: true });
      }
      await send({ type: 'completePreparation' });
      await send({ type: 'startDeviceCheck' });
      await waitForJob();
      expect(session.phase).toBe('readyToExecute');
      await send({ type: 'startExecution' });
      const total = session.procedure.execution.conditions.reduce(
        (sum, item) => sum + item.repetitions,
        0,
      );
      for (let index = 0; index < total; index += 1) {
        const { cursorId } = session.execution.cursor;
        await send({ type: 'requestExecutionSample', cursorId });
        await waitForJob();
        const attempt = session.execution.attempts.at(-1);
        expect(attempt?.status).toBe('ready');
        if (!attempt) throw new Error('Edge did not report the seeded measurement.');
        await send({ type: 'completeExecutionStep', cursorId, sampleAttemptId: attempt.attemptId });
      }
      expect(session.phase).toBe('completed');
      return session.sessionId;
    },
    async result(id: string) {
      return readJson<Result>(
        await request.get(`${origin.origin}${resultPath(id)}`, { headers: expertHeaders }),
      );
    },
    async expertHome() {
      return readJson<ExpertHome>(
        await request.get(`${origin.origin}/api/v1/home/expert?environmentId=${environmentId}`, {
          headers: expertHeaders,
        }),
      );
    },
  };
}

async function readJson<T>(response: APIResponse | Response, status = 200): Promise<T> {
  const body: unknown = await response.json();
  const code = (body as { error?: { code?: string } } | null)?.error?.code;
  expect(
    response.status(),
    [new URL(response.url()).pathname, code].filter(Boolean).join(' '),
  ).toBe(status);
  return body as T;
}

function button(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true });
}

async function checkLayout(page: Page, locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    viewport.width,
  );
}

function nextGet(page: Page, origin: string, path: string, query = '') {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === origin &&
      url.pathname === path &&
      url.search === query &&
      response.request().method() === 'GET'
    );
  });
}

async function enterHome(
  page: Page,
  edge: ReturnType<typeof isolatedEdge>,
  role: 'student' | 'expert',
) {
  await page.goto('/');
  await page
    .getByRole('radio', {
      name: role === 'student' ? '신규 연구생, 승인된 절차 실행' : '숙련 연구생, 절차 생성·승인',
    })
    .click();
  try {
    await page.getByLabel('Edge 접속 토큰', { exact: true }).fill(edge.token[role]);
  } catch {
    throw new Error('Could not fill the local Edge credential field.');
  }
  await button(page, '작업 환경 불러오기').click();
  await page.getByRole('button', { name: /^연구실: / }).click();
  await page.getByRole('radio', { name: '지급 키트 실습실', exact: true }).click();

  const homeResponse = nextGet(
    page,
    edge.origin,
    `/api/v1/home/${role}`,
    `?environmentId=${environmentId}`,
  );
  await button(page, '설정하고 계속').click();
  await expect(
    page.getByRole('heading', { name: role === 'student' ? '연구생 홈' : '숙련자 홈' }),
  ).toBeVisible();
  return homeResponse;
}

function conditionData(result: Result) {
  const [condition] = result.session.procedure.execution.conditions;
  const attempts = result.session.execution.attempts.filter(
    (attempt) => attempt.cursor.conditionId === condition.id && attempt.status === 'valid',
  );
  const readings = attempts.map(({ report }) => {
    const reading = report.diagnostics.sensors
      .flatMap((sensor) => sensor.readings)
      .find(({ metricId }) => metricId === 'distance');
    if (!reading) throw new Error('Seeded evidence does not contain a distance reading.');
    return reading;
  });
  expect(readings).toHaveLength(condition.repetitions);
  const mean = Number(
    (readings.reduce((sum, reading) => sum + reading.value, 0) / readings.length).toFixed(1),
  );
  const unit = readings[0].unit;
  return { condition, attempts, mean, unit, readings };
}

async function verifyStudent(page: Page, edge: ReturnType<typeof isolatedEdge>, resultId: string) {
  const applicationWrites: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === edge.origin && request.method() === 'POST')
      applicationWrites.push(url.pathname);
  });

  const home = await readJson<StudentHome>(await enterHome(page, edge, 'student'));
  const result = home.recentResults.find(({ id }) => id === resultId);
  if (!result) throw new Error('Student home did not list the seeded result.');
  const resultIndex = home.recentResults
    .filter(({ title }) => title === result.title)
    .indexOf(result);
  const open = button(page, `${result.title}, 결과 보기`).nth(resultIndex);
  const phoneResultPath = `/results/${resultId}`;

  const response = nextGet(page, edge.origin, resultPath(resultId));
  await checkLayout(page, open);
  await open.click();
  await expect(page).toHaveURL(`${phoneResultPath}?sessionId=${result.sessionId}`);
  const body = await readJson<Result>(await response);
  expect(body.id).toBe(resultId);
  expect(body.session.sessionId).toBe(result.sessionId);
  expect(body.dataOrigin).toBe('simulation');
  const { condition, attempts, mean, unit, readings } = conditionData(body);
  await expect(page.getByText('제출한 결과', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: body.session.procedure.title, exact: true }),
  ).toBeVisible();

  const conditionButton = button(page, `${condition.label} 조건, ${mean} ${unit}`);
  await checkLayout(page, conditionButton);
  const evidenceResponse = nextGet(page, edge.origin, resultPath(resultId));
  await conditionButton.click();
  await expect(page).toHaveURL(
    `${phoneResultPath}/evidence/${condition.id}?sessionId=${result.sessionId}`,
  );
  expect((await readJson<Result>(await evidenceResponse)).id).toBe(resultId);
  await expect(page.getByText('측정 상세와 근거 이력', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: `${condition.label} 조건 상세` })).toBeVisible();
  await expect(page.getByText(`${mean.toFixed(1)} ${unit}`, { exact: true })).toBeVisible();
  await expect(
    page.getByText(`유효 ${attempts.length}건 · 무효 0건`, { exact: true }),
  ).toBeVisible();
  for (const [index, reading] of readings.entries()) {
    await expect(
      page.getByText(`${index + 1}회차 · 유효 · ${reading.value} ${reading.unit}`, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(`${index + 1}회차 측정 확인`, { exact: true })).toBeVisible();
  }
  const back = button(page, '전체 결과로 돌아가기');
  await checkLayout(page, back);
  await back.click();
  await expect(page).toHaveURL(`${phoneResultPath}?sessionId=${result.sessionId}`);
  await expect(conditionButton).toBeVisible();
  expect(applicationWrites).toEqual([]);

  return {
    resultId,
    sessionId: result.sessionId,
    procedureId: body.session.procedure.procedureId,
    conditionId: condition.id,
    attemptIds: attempts.map(({ attemptId }) => attemptId),
    readings,
    mean,
    unit,
  };
}

async function openExpertResult(
  page: Page,
  edge: ReturnType<typeof isolatedEdge>,
  resultId: string,
  label: string,
  cardIndex = 0,
) {
  const home = await edge.expertHome();
  const item = home.results.find(({ id }) => id === resultId);
  if (!item) throw new Error('Expert home did not list the seeded result.');
  const card = button(
    page,
    `${item.studentName} · ${item.deviceName}, ${label}, ${item.summary}`,
  ).nth(cardIndex);
  await checkLayout(page, card);
  const response = nextGet(page, edge.origin, resultPath(resultId));
  await card.click();
  await expect(page).toHaveURL(`/expert/results/${resultId}?procedureId=${item.procedureId}`);
  const result = await readJson<Result>(await response);
  expect(result.id).toBe(resultId);
  expect(result.session.procedure.procedureId).toBe(item.procedureId);
  await expect(page.getByText('연구생 결과 검토', { exact: true })).toBeVisible();
  return result;
}

function pendingIndex(home: ExpertHome, resultId: string) {
  const selected = home.results.find(({ id }) => id === resultId);
  if (!selected) throw new Error('Expert home response did not list a result to review.');
  return home.results
    .filter(
      (item) =>
        item.status === 'pending' &&
        item.studentName === selected.studentName &&
        item.deviceName === selected.deviceName &&
        item.summary === selected.summary,
    )
    .indexOf(selected);
}

test('제출 결과와 조건별 근거를 조회하고 숙련자 검토 결과를 재진입 후 확인한다', async ({
  page,
  browser,
  request,
}, testInfo) => {
  test.setTimeout(90_000);
  const edge = isolatedEdge(request);
  const approvedId = await edge.seedCompletedResult();
  const remeasureId = await edge.seedCompletedResult();
  const student = await browser.newPage({ viewport, isMobile: true, hasTouch: true });
  const studentEvidence = await verifyStudent(student, edge, approvedId);
  await student.close();

  const home = await readJson<ExpertHome>(await enterHome(page, edge, 'expert'));
  const reviewed: {
    resultId: string;
    input: ReviewInput;
    response: Review;
    replay: string;
    status: number;
  }[] = [];
  for (const [resultId, decision] of [
    [approvedId, 'approved'],
    [remeasureId, 'remeasureRequested'],
  ] as const) {
    const homeData = decision === 'approved' ? home : await edge.expertHome();
    const result = await openExpertResult(
      page,
      edge,
      resultId,
      '검토 대기',
      pendingIndex(homeData, resultId),
    );
    expect(result.session.reviews ?? []).toEqual([]);
    if (decision === 'approved') {
      const { condition, mean, unit } = conditionData(result);
      const conditionButton = button(page, `${condition.label} 조건, ${mean} ${unit}`);
      const evidenceResponse = nextGet(page, edge.origin, resultPath(resultId));
      await conditionButton.click();
      await expect(page).toHaveURL(
        `/expert/results/${resultId}/evidence/${condition.id}?procedureId=${result.session.procedure.procedureId}`,
      );
      expect((await readJson<Result>(await evidenceResponse)).id).toBe(resultId);
      await expect(
        page.getByRole('heading', { name: `${condition.label} 조건 상세` }),
      ).toBeVisible();
      await button(page, '결과 검토로 돌아가기').click();
      await expect(page).toHaveURL(
        `/expert/results/${resultId}?procedureId=${result.session.procedure.procedureId}`,
      );
    }

    const submit = button(page, decision === 'approved' ? '검토 완료' : '재측정 요청');
    await expect(submit).toBeDisabled();
    const opinion = page.getByLabel('검토 의견', { exact: true });
    await opinion.fill(comments[decision]);
    await checkLayout(page, submit);

    const writes: typeof reviewed = [];
    const matchesReview = (url: URL) =>
      url.origin === edge.origin && url.pathname === `${resultPath(resultId)}/reviews`;
    await page.route(matchesReview, async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      const input = route.request().postDataJSON() as ReviewInput;
      const response = await route.fetch();
      const persisted = await readJson<Review>(response);
      writes.push({
        resultId,
        input,
        response: persisted,
        replay: response.headers()['x-idempotent-replay'],
        status: response.status(),
      });
      if (decision === 'approved' && writes.length === 1) await route.abort('connectionreset');
      else await route.fulfill({ response });
    });

    await submit.click();
    if (decision === 'approved') {
      await expect(page.getByText('검토 결과를 저장하지 못했어요.', { exact: true })).toBeVisible();
      await expect(opinion).toHaveValue(comments[decision]);
      await expect(opinion).not.toBeEditable();
      await expect(submit).toBeDisabled();
      const retry = button(page, '저장 다시 시도');
      await checkLayout(page, retry);
      await retry.click();
      await expect(page.getByText('결과 검토를 완료했습니다', { exact: true })).toBeVisible();
      expect(writes).toHaveLength(2);
      expect(writes[1].input).toEqual(writes[0].input);
      expect(writes[1].response).toEqual(writes[0].response);
      expect(writes.map(({ replay }) => replay)).toEqual(['false', 'true']);
    } else {
      await expect(page.getByText('재측정 요청을 기록했습니다', { exact: true })).toBeVisible();
      expect(writes).toHaveLength(1);
    }
    const last = writes.at(-1);
    if (!last) throw new Error('The expected review request was not observed.');
    expect(last.input).toEqual({
      requestId: expect.any(String),
      decision,
      comment: comments[decision],
    });
    expect(last.input.requestId).toMatch(/^[A-Za-z0-9_.:-]{1,128}$/);
    expect(last.response).toMatchObject({
      sessionId: result.session.sessionId,
      decision,
      comment: comments[decision],
    });
    expect((await edge.result(resultId)).session.reviews).toEqual([last.response]);
    expect((await edge.expertHome()).results.find(({ id }) => id === resultId)?.status).toBe(
      'reviewed',
    );
    reviewed.push(...writes);
    await page.unroute(matchesReview);

    if (decision === 'approved') {
      await button(page, '숙련자 홈으로').click();
    } else {
      await button(page, '검토 화면으로 돌아가기').click();
      await button(page, '뒤로가기').click();
    }
    await expect(page).toHaveURL('/expert');
  }

  for (const [resultId, decision] of [
    [approvedId, 'approved'],
    [remeasureId, 'remeasureRequested'],
  ] as const) {
    const label = decision === 'approved' ? '검토 완료' : '재측정 요청';
    await page.getByRole('tab', { name: '현황', exact: true }).click();
    await page.getByRole('radio', { name: label, exact: true }).click();
    const reopened = await openExpertResult(page, edge, resultId, label);
    expect(reopened.session.reviews).toHaveLength(1);
    expect(reopened.session.reviews[0]).toMatchObject({ decision, comment: comments[decision] });
    await expect(page.getByText('검토 의견', { exact: true })).toBeVisible();
    await expect(page.getByText(comments[decision], { exact: true })).toBeVisible();
    await expect(
      page.getByTestId('expert-review-summary').getByText(label, { exact: true }),
    ).toBeVisible();
    await button(page, '뒤로가기').click();
    await expect(page).toHaveURL('/expert');
  }

  await testInfo.attach('edge-results-evidence', {
    contentType: 'application/json',
    body: JSON.stringify({ viewport, studentEvidence, reviewed }, null, 2),
  });
});
