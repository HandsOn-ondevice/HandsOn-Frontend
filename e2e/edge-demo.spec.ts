import { randomUUID } from 'node:crypto';
import { expect, type Page, type Response, type TestInfo } from '@playwright/test';
import type { DeviceDiagnosticsReport } from '../src/features/researcher-workflow/domain/device-check';
import type { ExperimentSession } from '../src/features/researcher-workflow/domain/models';
import { approveDemoProcedure } from './helpers/edge-demo-approval';
import { finishDemo, requestDemoCompletion } from './helpers/edge-demo-completion';
import { captureDemo, demoViewport, healthPath, test } from './helpers/edge-demo-fixture';
import {
  button,
  currentKitProcedure,
  enterStudentHome,
  sessionsPath,
  type TestEdge,
} from './helpers/edge-session';

const homePath = '/api/v1/home/expert?environmentId=kit-lab';
const sensorsPath = '/api/v1/sensors/latest';
const dark = { code: 'LIGHT_TOO_DARK', message: '주변 밝기가 기준보다 낮습니다.' };
const criteria = { distanceMinCm: 15, distanceMaxCm: 25, lightMinRaw: 1500 };
type Procedure = Pick<ExperimentSession['procedure'], 'procedureId' | 'version' | 'title'>;
type DemoEdge = TestEdge & { setLight: (adc: number) => Promise<void> };
type EventRow = {
  type: string;
  sessionId: string;
  eventSequence: number;
  occurredAt: string;
  requestId: string;
  checkId?: string;
};
type ResumeCheck = {
  checkId: string;
  holdId: string;
  cursorId: string;
  status: string;
  report: DeviceDiagnosticsReport;
};
type EdgeSession = Omit<ExperimentSession, 'events' | 'resumeChecks'> & {
  events: EventRow[];
  resumeChecks?: ResumeCheck[];
};

function edgeResponse(page: Page, edge: TestEdge, method: string, path: string) {
  return page.waitForResponse(
    (response) => response.url() === edge.origin + path && response.request().method() === method,
  );
}

async function sessionFrom(response: Response, status = 200): Promise<EdgeSession> {
  expect(response.status(), new URL(response.url()).pathname).toBe(status);
  return response.json();
}

async function enterExpert(page: Page, edge: TestEdge, token: string) {
  await page.goto('/');
  await page.getByRole('radio', { name: '숙련 연구생, 절차 생성·승인' }).click();
  await page.getByLabel('Edge 접속 토큰', { exact: true }).fill(token);
  await button(page, '작업 환경 불러오기').click();
  await page.getByRole('button', { name: /^연구실: / }).click();
  await page.getByRole('radio', { name: '지급 키트 실습실', exact: true }).click();
  const loaded = edgeResponse(page, edge, 'GET', homePath);
  await button(page, '설정하고 계속').click();
  expect((await loaded).status()).toBe(200);
  await expect(page.getByRole('heading', { name: '숙련자 홈', exact: true })).toBeVisible();
}

function sessionURL(sessionId: string) {
  return '/researcher-workflow/' + sessionId;
}

function currentSession(edge: TestEdge, sessionId: string) {
  return edge.read<EdgeSession>(sessionsPath + '/' + sessionId, 'operator');
}

async function expectLed(edge: TestEdge, state: 'on' | 'off') {
  expect(await edge.read(healthPath)).toMatchObject({ components: { led: state } });
}

function reading(report: DeviceDiagnosticsReport | undefined, metric: string, value: number) {
  const entry = report?.sensors
    .flatMap(({ readings }) => readings)
    .find(({ metricId }) => metricId === metric);
  expect(entry).toMatchObject({ value, unit: metric === 'distance' ? 'cm' : 'adc' });
  if (!entry) throw new Error('Edge did not return ' + metric);
  expect(Date.parse(entry.observedAt)).not.toBeNaN();
  return entry;
}

async function prepareAndStart(
  student: Page,
  edge: TestEdge,
  procedure: Procedure,
  info: TestInfo,
) {
  const created = await test.step('연구생이 승인 버전을 열어 같은 세션에서 준비', async () => {
    await enterStudentHome(student, edge.operatorToken);
    await button(student, procedure.title + ', ' + procedure.version + ', 승인 절차 선택').click();
    const creation = edgeResponse(student, edge, 'POST', sessionsPath);
    await button(student, '이 버전으로 준비 시작').click();
    const response = await creation;
    const requestBody = response.request().postDataJSON();
    expect(requestBody).toMatchObject({
      procedureId: procedure.procedureId,
      procedureVersion: procedure.version,
      workflowVersion: '2.0',
      resumePolicyVersion: '2.0',
    });
    expect(await response.request().headerValue('idempotency-key')).toBe(requestBody.requestId);
    const session = await sessionFrom(response, 201);
    expect(session).toMatchObject({
      phase: 'preparing',
      procedure: { ...procedure, execution: criteria },
    });
    await expect(student).toHaveURL(sessionURL(session.sessionId) + '/preparation');
    await expect(student.getByText('세션 ' + session.sessionId, { exact: true })).toBeVisible();

    for (const { title, owner } of session.procedure.preparation) {
      if (owner !== 'operator') continue;
      const check = student.getByRole('checkbox', { name: title, exact: true });
      await check.click();
      await expect(check).toBeChecked();
    }
    await button(student, '확인 완료').click();
    await expect(student).toHaveURL(sessionURL(session.sessionId) + '/device-check');
    return session;
  });

  return test.step('거리 16.7 cm와 조도 2135 ADC 확인 후 LED ON', async () => {
    const { sessionId } = created;
    const start = button(student, '실험 측정 시작');
    await expect(start).toBeDisabled();
    await button(student, '장치·센서 점검 시작').click();
    await expect(start).toBeEnabled();
    const ready = await currentSession(edge, sessionId);
    expect(ready.phase).toBe('readyToExecute');
    const diagnostics = ready.deviceChecks.at(-1);
    expect(diagnostics).toMatchObject({ status: 'passed', report: { connection: 'connected' } });
    const distance = reading(diagnostics?.report, 'distance', 16.7);
    const light = reading(diagnostics?.report, 'lightRaw', 2135);
    await expect(student.getByText('16.7 cm', { exact: true })).toBeVisible();
    await expectLed(edge, 'off');
    await captureDemo(student, info, '02-device-check');

    const next = edgeResponse(student, edge, 'POST', sessionsPath + '/' + sessionId + '/commands');
    await start.click();
    const response = await next;
    expect(response.request().postDataJSON()).toMatchObject({
      command: { type: 'startExecution' },
      expectedRevision: ready.revision,
    });
    const running = await sessionFrom(response);
    expect(running).toMatchObject({ sessionId, phase: 'running', actuator: { state: 'on' } });
    const cursor = running.execution?.cursor;
    if (!cursor) throw new Error('Edge did not return a first cursor.');
    await expect(student).toHaveURL(sessionURL(sessionId) + '/execution');
    await expect(student.getByText('회차 ID ' + cursor.cursorId, { exact: true })).toBeVisible();
    await expectLed(edge, 'on');
    return {
      sessionId,
      cursor,
      diagnostics,
      distance,
      light,
      requestId: response.request().postDataJSON().requestId,
    };
  });
}

async function openHold(student: Page, edge: TestEdge, sessionId: string) {
  await enterStudentHome(student, edge.operatorToken);
  await expect(student.getByText(/보류 · 0 \/ \d+회차/)).toBeVisible();
  await button(student, '이어서 진행').click();
  await expect(student).toHaveURL(sessionURL(sessionId) + '/recovery');
  await expect(student.getByText(dark.message, { exact: true })).toBeVisible();
  await expect(button(student, '이 명령으로 완료 요청')).toHaveCount(0);
}

async function autoHoldAndResume(student: Page, edge: DemoEdge, sessionId: string, info: TestInfo) {
  const commandPath = sessionsPath + '/' + sessionId + '/commands';
  const readState = () => currentSession(edge, sessionId);
  const latestLight = async (adc: number) =>
    reading(await edge.read<DeviceDiagnosticsReport>(sensorsPath, 'operator'), 'lightRaw', adc);

  const hold = await test.step('900 ADC에서 자동 보류하고 재개 요청을 차단', async () => {
    const running = await readState();
    await edge.setLight(900);
    const darkReading = await latestLight(900);
    await expect.poll(async () => (await readState()).phase).toBe('held');
    const held = await readState();
    expect(held).toMatchObject({
      sessionId,
      execution: { cursor: running.execution?.cursor, attempts: [] },
      holdReason: dark,
      actuator: { state: 'off' },
    });
    const holdId = held.hold?.holdId;
    if (!holdId) throw new Error('Edge did not identify the hold.');
    const monitor = held.events.find(({ type }) => type === 'sessionHeld');
    expect(monitor).toMatchObject({ requestId: 'monitor', holdId, issue: dark });
    await expectLed(edge, 'off');
    await openHold(student, edge, sessionId);
    await captureDemo(student, info, '03-auto-hold');

    const response = await resume(student, edge, commandPath, held.revision, holdId);
    expect(response.status()).toBe(423);
    expect(await response.json()).toMatchObject({ error: dark });
    await expect(
      student.getByText('센서 재확인 상태를 확인해 주세요', { exact: true }),
    ).toBeVisible();
    const blocked = await readState();
    expect(blocked).toMatchObject({ phase: 'held', hold: { holdId }, execution: { attempts: [] } });
    const check = blocked.resumeChecks?.at(-1);
    expect(check).toMatchObject({
      holdId,
      cursorId: running.execution?.cursor?.cursorId,
      status: 'failed',
      issue: dark,
    });
    reading(check?.report, 'lightRaw', 900);
    return {
      held: blocked,
      holdId,
      darkReading,
      check,
      rejectedResumeId: response.request().postDataJSON().requestId,
    };
  });

  return test.step('2100 ADC 정상 복구 후 작업자가 명시적으로 같은 회차 재개', async () => {
    await edge.setLight(2100);
    const brightReading = await latestLight(2100);
    const before = await readState();
    expect(before).toMatchObject({ phase: 'held', hold: { holdId: hold.holdId } });
    await expectLed(edge, 'off');
    const response = await resume(student, edge, commandPath, before.revision, hold.holdId);
    const running = await sessionFrom(response);
    expect(running).toMatchObject({
      sessionId,
      phase: 'running',
      execution: { cursor: hold.held.execution?.cursor, attempts: [] },
      actuator: { state: 'on' },
    });
    const check = running.resumeChecks?.at(-1);
    expect(check).toMatchObject({ holdId: hold.holdId, status: 'passed', issue: null });
    const measured = reading(check?.report, 'lightRaw', 2100);
    expect(Date.parse(measured.observedAt)).toBeGreaterThanOrEqual(
      Date.parse(brightReading.observedAt),
    );
    await expect(student).toHaveURL(sessionURL(sessionId) + '/execution');
    await expect(
      student.getByText('회차 ID ' + running.execution?.cursor?.cursorId, { exact: true }),
    ).toBeVisible();
    await expectLed(edge, 'on');
    return {
      ...hold,
      brightReading,
      passedCheck: check,
      acceptedResumeId: response.request().postDataJSON().requestId,
    };
  });
}

async function resume(
  student: Page,
  edge: TestEdge,
  path: string,
  revision: number,
  holdId: string,
) {
  const buttonResume = button(student, '장치 점검하고 재개');
  await expect(buttonResume).toBeDisabled();
  for (const name of ['실험 조건을 확인했어요', '장치 설치 상태를 확인했어요']) {
    const check = student.getByRole('checkbox', { name, exact: true });
    await expect(check).not.toBeChecked();
    await check.click();
  }
  const next = edgeResponse(student, edge, 'POST', path);
  await buttonResume.click();
  const response = await next;
  expect(response.request().postDataJSON()).toMatchObject({
    expectedRevision: revision,
    command: {
      type: 'resume',
      confirmation: { holdId, conditionsConfirmed: true, installationConfirmed: true },
    },
  });
  return response;
}

for (const full of [false, true]) {
  test(
    full
      ? '전체 시연 · 숙련자 승인부터 같은 세션 결과 재조회까지 (장면 1–15)'
      : '완료·이력 · 단계 확인과 숙련자 결과 재조회 (장면 13–15)',
    async ({ page: student, browser, request, demo }, info) => {
      test.setTimeout(120_000);
      const context = await browser.newContext({
        baseURL: info.project.use.baseURL,
        viewport: demoViewport,
        isMobile: true,
        hasTouch: true,
      });
      try {
        const expert = await context.newPage();
        await test.step('독립 숙련자 브라우저에서 결과 목록을 먼저 조회', () =>
          enterExpert(expert, demo, demo.expertToken));
        const procedure = full
          ? await test.step('고정 전사문으로 초안 생성, 기준 편집 및 승인', () =>
              approveDemoProcedure(expert, demo.origin, request, demo.expertToken, info))
          : await currentKitProcedure(demo);
        const approved = {
          procedureId: procedure.procedureId,
          version: procedure.version,
          title: procedure.title,
        };
        const started = await prepareAndStart(student, demo, approved, info);
        const { sessionId } = started;
        const resumed = await autoHoldAndResume(student, demo, sessionId, info);
        const { resultId, session } = await finishDemo(student, expert, demo, sessionId, info);
        await test.step('숙련자가 연 결과 응답에서 같은 세션의 사건 순서와 센서 근거 대조', async () => {
          expect(session).toMatchObject({
            sessionId,
            procedure: { ...approved, execution: criteria },
          });
          expect(session.deviceChecks.at(-1)).toEqual(started.diagnostics);
          expect(session.resumeChecks).toEqual([resumed.check, resumed.passedCheck]);
          const history = await demo.read<{ events: EventRow[] }>(
            sessionsPath + '/' + sessionId + '/history',
            'expert',
          );
          expect(history.events).toEqual(session.events);

          const events = history.events.filter(({ type }) =>
            [
              'deviceCheckPassed',
              'executionStarted',
              'sessionHeld',
              'resumeDeviceChecked',
              'sessionResumed',
              'measurementCompleted',
              'resultSubmitted',
            ].includes(type),
          );
          expect(events).toEqual([
            expect.objectContaining({
              type: 'deviceCheckPassed',
              attemptId: started.diagnostics?.attemptId,
            }),
            expect.objectContaining({ type: 'executionStarted', requestId: started.requestId }),
            expect.objectContaining({
              type: 'sessionHeld',
              holdId: resumed.holdId,
              issue: dark,
              requestId: 'monitor',
            }),
            expect.objectContaining({
              type: 'resumeDeviceChecked',
              checkId: resumed.check?.checkId,
              holdId: resumed.holdId,
              requestId: resumed.rejectedResumeId,
            }),
            expect.objectContaining({
              type: 'resumeDeviceChecked',
              checkId: resumed.passedCheck?.checkId,
              holdId: resumed.holdId,
              requestId: resumed.acceptedResumeId,
            }),
            expect.objectContaining({
              type: 'sessionResumed',
              requestId: resumed.acceptedResumeId,
            }),
            expect.objectContaining({ type: 'measurementCompleted' }),
            expect.objectContaining({ type: 'resultSubmitted', resultId }),
          ]);
          for (const [index, event] of events.entries()) {
            expect(event.sessionId).toBe(sessionId);
            if (index) {
              expect(event.eventSequence).toBeGreaterThan(events[index - 1].eventSequence);
              expect(Date.parse(event.occurredAt)).toBeGreaterThanOrEqual(
                Date.parse(events[index - 1].occurredAt),
              );
            }
          }
          await info.attach('edge-demo-history', {
            contentType: 'application/json',
            body: JSON.stringify(
              {
                sessionId,
                resultId,
                approved,
                criteria,
                initialReading: { distance: started.distance, light: started.light },
                duringHold: resumed.darkReading,
                beforeResume: resumed.brightReading,
                resumeChecks: session.resumeChecks,
                events,
              },
              null,
              2,
            ),
          });
        });
      } finally {
        await context.close();
      }
    },
  );
}

test('조도 미달과 HOLD에서 같은 회차의 완료 확인 차단', async ({ page, request, demo }, info) => {
  test.setTimeout(90_000);
  const procedure = await currentKitProcedure(demo);
  const approved = {
    procedureId: procedure.procedureId,
    version: procedure.version,
    title: procedure.title,
  };
  const { sessionId, cursor } = await prepareAndStart(page, demo, approved, info);
  const path = sessionsPath + '/' + sessionId + '/commands';
  const { command, revision } = await requestDemoCompletion(page, demo, sessionId);

  await test.step('확인 요청 직전에 조도를 900 ADC로 낮추면 회차를 완료할 수 없음', async () => {
    await page.route(
      demo.origin + path,
      async (route) => {
        if (route.request().postDataJSON()?.command?.type === 'completeExecutionStep') {
          await demo.setLight(900);
        }
        await route.continue();
      },
      { times: 1 },
    );
    const next = edgeResponse(page, demo, 'POST', path);
    await button(page, '이 명령으로 완료 요청').click();
    const response = await next;
    const body = await response.json();
    expect(response.request().postDataJSON()).toMatchObject({
      command,
      expectedRevision: revision,
    });
    // The command rechecks the sensor; the 250 ms monitor can hold the same session first.
    expect([
      [423, 'LIGHT_TOO_DARK'],
      [409, 'REVISION_CONFLICT'],
    ]).toContainEqual([response.status(), body.error?.code]);
    const held = await currentSession(demo, sessionId);
    expect(held).toMatchObject({ phase: 'held', execution: { cursor }, holdReason: dark });
    expect(held.execution?.attempts.filter(({ status }) => status === 'valid')).toHaveLength(0);
    await expectLed(demo, 'off');
    await openHold(page, demo, sessionId);
    await captureDemo(page, info, 'completion-blocked-hold');
    await info.attach('edge-completion-rejection', {
      contentType: 'application/json',
      body: JSON.stringify(
        { sessionId, cursor, status: response.status(), error: body.error },
        null,
        2,
      ),
    });
  });

  await test.step('이미 보류된 세션은 최신 리비전으로도 이전 완료 명령을 거부', async () => {
    const held = await currentSession(demo, sessionId);
    const requestId = randomUUID();
    const reply = await request.post(demo.origin + path, {
      headers: { Authorization: 'Bearer ' + demo.operatorToken, 'Idempotency-Key': requestId },
      data: { requestId, expectedRevision: held.revision, command },
    });
    expect(reply.status()).toBe(409);
    expect(await reply.json()).toMatchObject({ error: { code: 'INVALID_STATE' } });
    const after = await currentSession(demo, sessionId);
    expect(after).toMatchObject({ phase: 'held', holdReason: dark, execution: { cursor } });
    expect(after.execution?.attempts.filter(({ status }) => status === 'valid')).toHaveLength(0);
    await expectLed(demo, 'off');
  });
});
