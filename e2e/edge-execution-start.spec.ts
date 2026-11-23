import { expect, test as base, type Page } from '@playwright/test';
import {
  createExecutionStartEdge,
  type ExecutionStartProcedure,
  type ExecutionStartSession,
} from './helpers/edge-execution-start';
import { approveLightVersions } from './helpers/edge-approved-light-versions';
import { closeWorkflowInformation } from './helpers/workflow-information';

const sessionsPath = '/api/v1/sessions';
const viewport = { width: 412, height: 920 };
const normal = { scenario: 'normal', distanceCm: 16.7, ledFailure: false } as const;
const approvedLimits = { distanceMinCm: 15, distanceMaxCm: 25, lightMinRaw: 1500 };
type Edge = Awaited<ReturnType<typeof createExecutionStartEdge>>;
type Prepared = { id: string; route: string; version: string };

function button(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true });
}

async function startFirstTrial(
  page: Page,
  workflow: Edge,
  { id, route }: Prepared,
  ready: ExecutionStartSession,
) {
  const start = button(page, '실험 측정 시작');
  const [response] = await Promise.all([
    page.waitForResponse(
      (result) =>
        result.url() === `${workflow.origin}${sessionsPath}/${id}/commands` &&
        result.request().method() === 'POST',
    ),
    start.click(),
  ]);
  expect(response.request().postDataJSON()).toMatchObject({
    expectedRevision: ready.revision,
    command: { type: 'startExecution' },
  });
  expect(response.status()).toBe(200);
  const running = await workflow.getSession(id);
  expect(running).toMatchObject({
    sessionId: id,
    phase: 'running',
    procedure: { version: ready.procedure.version, execution: ready.procedure.execution },
    execution: {
      cursor: { conditionId: ready.procedure.execution.conditions[0].id, trialIndex: 1 },
    },
  });
  const cursor = running.execution?.cursor;
  if (!cursor) throw new Error('Edge did not return the first execution cursor.');
  await expect(page).toHaveURL(`${route}/execution`);
  await expect(page.getByText('첫 측정 회차', { exact: true })).toBeVisible();
  await expect(page.getByText(`회차 ID ${cursor.cursorId}`, { exact: true })).toBeVisible();
  expect((await workflow.getSimulation()).led).toBe('on');
}

async function expectBlocked(
  page: Page,
  workflow: Edge,
  { id, route }: Pick<Prepared, 'id' | 'route'>,
  code: string,
  message: string,
) {
  await expect(page.getByText('장치·센서 점검에 실패했습니다', { exact: true })).toBeVisible();
  await expect(page.getByText(message, { exact: true })).toBeVisible();
  await expect(button(page, '실험 측정 시작')).toBeDisabled();

  const blocked = await workflow.getSession(id);
  expect(blocked).toMatchObject({ sessionId: id, phase: 'awaitingDeviceCheck' });
  expect(blocked.execution?.cursor).toBeUndefined();
  expect(blocked.deviceChecks.at(-1)).toMatchObject({ status: 'failed', issue: { code } });
  expect((await workflow.getSimulation()).led).toBe('off');

  // The disabled control sends nothing. Exercise the service guard with the same revision.
  const rejected = await workflow.requestStart(id, blocked.revision);
  expect(rejected.status()).toBe(409);
  expect(await rejected.json()).toMatchObject({ error: { code: 'INVALID_STATE' } });
  const after = await workflow.getSession(id);
  expect(after).toMatchObject({ sessionId: id, phase: 'awaitingDeviceCheck' });
  expect(after.execution?.cursor).toBeUndefined();
  expect((await workflow.getSimulation()).led).toBe('off');
  await expect(page).toHaveURL(`${route}/device-check`);
  return blocked;
}

const test = base.extend<{
  workflow: Edge & {
    prepare: (selection?: ExecutionStartProcedure) => Promise<Prepared>;
    finish: (id: string) => Promise<void>;
  };
}>({
  workflow: async ({ page, request }, run) => {
    const edge = await createExecutionStartEdge(request);
    let sessionId: string | undefined;

    async function prepare(selection?: ExecutionStartProcedure) {
      const procedure = selection ?? (await edge.getProcedure());
      const limits = {
        ...approvedLimits,
        lightMinRaw: selection?.execution.lightMinRaw ?? approvedLimits.lightMinRaw,
      };
      expect(procedure.execution).toMatchObject(limits);
      const version = procedure.version.startsWith('v')
        ? procedure.version
        : `v${procedure.version}`;

      await page.goto('/');
      await page.getByRole('radio', { name: '신규 연구생, 승인된 절차 실행' }).click();
      await page.getByLabel('Edge 접속 토큰', { exact: true }).fill(edge.operatorToken);
      await button(page, '작업 환경 불러오기').click();
      await page.getByRole('button', { name: /^연구실: / }).click();
      await page.getByRole('radio', { name: '지급 키트 실습실', exact: true }).click();
      await button(page, '설정하고 계속').click();
      await button(page, `${procedure.title}, ${procedure.version}, 승인 절차 선택`).click();

      const [response] = await Promise.all([
        page.waitForResponse(
          (result) =>
            result.url() === `${edge.origin}${sessionsPath}` &&
            result.request().method() === 'POST',
        ),
        button(page, '이 버전으로 준비 시작').click(),
      ]);
      expect(response.status(), 'Edge 세션 생성은 API-10의 workflowVersion 2.0을 사용합니다.').toBe(
        201,
      );
      const created = (await response.json()) as ExecutionStartSession;
      const id = created.sessionId;
      sessionId = id;
      const route = `/researcher-workflow/${id}`;
      expect(response.request().postDataJSON()).toMatchObject({
        procedureId: procedure.procedureId,
        procedureVersion: procedure.version,
        workflowVersion: '2.0',
      });
      expect(created).toMatchObject({
        phase: 'preparing',
        dataOrigin: 'simulation',
        workflowVersion: '2.0',
        procedure: {
          procedureId: procedure.procedureId,
          version: procedure.version,
          execution: limits,
        },
      });
      await expect(page).toHaveURL(`${route}/preparation`);
      await expect(page.getByText(`세션 ${id}`, { exact: true })).toBeVisible();
      await expect(
        page.getByText(`${procedure.title} · ${version}`, { exact: true }),
      ).toBeVisible();

      for (const check of procedure.preparation.filter(({ owner }) => owner === 'operator')) {
        const checkbox = page.getByRole('checkbox', { name: check.title, exact: true });
        await checkbox.click();
        await expect(checkbox).toBeChecked();
      }
      await button(page, '확인 완료').click();
      await expect(page).toHaveURL(`${route}/device-check`);
      return { id, route, version };
    }

    async function finish(id: string) {
      await edge.cancelSession(id);
      sessionId = undefined;
    }

    try {
      await run({ ...edge, prepare, finish });
    } finally {
      try {
        if (sessionId) await edge.cancelSession(sessionId);
      } finally {
        await edge.restoreSimulation();
      }
    }
  },
});

test.use({
  viewport,
  isMobile: true,
  hasTouch: true,
  trace: 'off',
  screenshot: 'off',
  video: 'off',
});

for (const { title, slug, distanceCm } of [
  { title: '정상 거리 16.7 cm', slug: 'normal', distanceCm: 16.7 },
  { title: '거리 하한 15 cm', slug: 'distance-min', distanceCm: 15 },
  { title: '거리 상한 25 cm', slug: 'distance-max', distanceCm: 25 },
]) {
  test(`${title}에서 같은 세션의 첫 회차를 시작하고 LED가 켜진다`, async ({
    page,
    workflow,
  }, testInfo) => {
    await workflow.configure({ ...normal, distanceCm });
    const { id, route, version } = await workflow.prepare();
    const start = button(page, '실험 측정 시작');
    await expect(start).toBeDisabled();
    expect((await workflow.getSimulation()).led).toBe('off');

    await button(page, '장치·센서 점검 시작').click();
    await expect(start).toBeEnabled();
    const ready = await workflow.getSession(id);
    expect(ready).toMatchObject({ sessionId: id, phase: 'readyToExecute' });
    expect(ready.execution?.cursor).toBeUndefined();
    expect(ready.deviceChecks.at(-1)).toMatchObject({
      status: 'passed',
      report: {
        deviceId: 'orange-pi-01',
        connection: 'connected',
        sensors: expect.arrayContaining([
          expect.objectContaining({
            sensorId: 'distance-01',
            status: 'passed',
            readings: [expect.objectContaining({ value: distanceCm, unit: 'cm' })],
          }),
          expect.objectContaining({
            sensorId: 'light-01',
            status: 'passed',
            readings: [expect.objectContaining({ value: 2400, unit: 'adc' })],
          }),
        ]),
      },
    });
    await expect(page.getByText(`${distanceCm} cm`, { exact: true })).toBeVisible();
    await expect(page.getByText('초음파 거리 센서', { exact: true })).toBeVisible();
    await expect(page.getByLabel(/^초음파 거리 센서, 정상,/)).toBeVisible();
    await button(page, '더 보기').click();
    await expect(page.getByText(`세션 ${id} · 절차 ${version}`, { exact: true })).toBeVisible();
    if (slug === 'normal') {
      await page.screenshot({
        path: testInfo.outputPath('approved-session.png'),
        animations: 'disabled',
      });
    }
    await closeWorkflowInformation(page);
    expect((await workflow.getSimulation()).led).toBe('off');
    await page.screenshot({
      path: testInfo.outputPath(`${slug}-ready.png`),
      animations: 'disabled',
    });

    await startFirstTrial(page, workflow, { id, route, version }, ready);
    if (slug === 'normal') {
      await page.screenshot({
        path: testInfo.outputPath('first-running-trial.png'),
        animations: 'disabled',
      });
    }
  });
}

for (const { title, slug, config, code, message } of [
  {
    title: '거리 하한 미달 14.9 cm',
    slug: 'distance-below',
    config: { ...normal, distanceCm: 14.9 },
    code: 'DISTANCE_OUT_OF_RANGE',
    message: '시연용 거리 조건을 벗어났습니다.',
  },
  {
    title: '거리 상한 초과 25.1 cm',
    slug: 'distance-above',
    config: { ...normal, distanceCm: 25.1 },
    code: 'DISTANCE_OUT_OF_RANGE',
    message: '시연용 거리 조건을 벗어났습니다.',
  },
  {
    title: '게이트웨이·초음파 센서 동시 미연결',
    slug: 'gateway-and-distance-disconnected',
    config: { ...normal, scenario: 'disconnected' } as const,
    code: 'SENSOR_DISCONNECTED',
    message: '센서가 연결되지 않았습니다.',
  },
]) {
  test(`${title}이면 시작이 차단되고 LED가 꺼져 있다`, async ({ page, workflow }, testInfo) => {
    await workflow.configure(config);
    const { id, route } = await workflow.prepare();
    await button(page, '장치·센서 점검 시작').click();
    const blocked = await expectBlocked(page, workflow, { id, route }, code, message);
    const report = blocked.deviceChecks.at(-1)?.report;
    const distance = report?.sensors.find(({ sensorId }) => sensorId === 'distance-01');
    if (config.scenario === 'disconnected') {
      expect(report?.connection).toBe('disconnected');
      expect(distance?.status).toBe('disconnected');
      await expect(page.getByLabel(/^초음파 거리 센서, 연결 끊김,/)).toBeVisible();
    } else {
      expect(report?.connection).toBe('connected');
      expect(distance?.readings).toEqual([
        expect.objectContaining({ metricId: 'distance', value: config.distanceCm, unit: 'cm' }),
      ]);
      await expect(page.getByText(`${config.distanceCm} cm`, { exact: true })).toBeVisible();
    }
    expectLightReading(blocked);
    await page.screenshot({ path: testInfo.outputPath(`${slug}.png`), animations: 'disabled' });
  });
}

test('같은 2400 ADC에서 승인 버전의 하한 2400은 허용하고 2401은 차단한다', async ({
  page,
  request,
  workflow,
}, testInfo) => {
  test.setTimeout(60_000);
  await workflow.configure(normal);
  const { lower, higher } = await approveLightVersions(request, workflow.origin);
  const check = button(page, '장치·센서 점검 시작');

  const allowed = await workflow.prepare(lower);
  await check.click();
  await expect(button(page, '실험 측정 시작')).toBeEnabled();
  const ready = await workflow.getSession(allowed.id);
  expectLightReading(ready);
  expect((await workflow.getSimulation()).led).toBe('off');
  await page.screenshot({
    path: testInfo.outputPath('light-2400-allowed.png'),
    animations: 'disabled',
  });
  await startFirstTrial(page, workflow, allowed, ready);
  await workflow.finish(allowed.id);

  const denied = await workflow.prepare(higher);
  expect(denied.id).not.toBe(allowed.id);
  await check.click();
  const blocked = await expectBlocked(
    page,
    workflow,
    denied,
    'LIGHT_TOO_DARK',
    '주변 밝기가 기준보다 낮습니다.',
  );
  expectLightReading(blocked);
  await page.screenshot({
    path: testInfo.outputPath('light-2401-blocked.png'),
    animations: 'disabled',
  });
});

function expectLightReading(session: ExecutionStartSession) {
  const light = session.deviceChecks
    .at(-1)
    ?.report?.sensors.find(({ sensorId }) => sensorId === 'light-01');
  expect(light).toMatchObject({
    status: 'passed',
    readings: [expect.objectContaining({ metricId: 'lightRaw', value: 2400, unit: 'adc' })],
  });
}

test('‘작업 시작해’의 해석 결과를 같은 세션의 실행 요청으로 확인한다', async ({
  page,
  workflow,
}, testInfo) => {
  await workflow.configure(normal);
  const prepared = await workflow.prepare();
  await button(page, '장치·센서 점검 시작').click();
  await expect(button(page, '실험 측정 시작')).toBeEnabled();
  const ready = await workflow.getSession(prepared.id);
  const interpreted = await workflow.interpretStart(prepared.id);
  expect(interpreted).toMatchObject({
    text: '작업 시작해',
    sessionId: prepared.id,
    expectedRevision: ready.revision,
    executed: false,
  });
  expect(await workflow.getSession(prepared.id)).toMatchObject({
    phase: 'readyToExecute',
    revision: ready.revision,
  });
  expect((await workflow.getSimulation()).led).toBe('off');
  await testInfo.attach('start-interpretation', {
    body: JSON.stringify(interpreted),
    contentType: 'application/json',
  });
  test.skip(
    interpreted.intent === 'clarification' && interpreted.command === null,
    '현재 Edge 시뮬레이터는 작업 시작해를 실행 명령으로 해석하지 않습니다.',
  );
  expect(interpreted.command).toEqual({ type: 'startExecution' });
  await startFirstTrial(page, workflow, prepared, ready);
});
