import { expect, test, type Page, type Response, type TestInfo } from '@playwright/test';
import type { DeviceDiagnosticsReport } from '../../src/features/researcher-workflow/domain/device-check';
import type { ExecutionState } from '../../src/features/researcher-workflow/domain/execution';
import type { ExperimentSession } from '../../src/features/researcher-workflow/domain/models';
import { button, sessionsPath, type TestEdge } from './edge-session';
import { closeWorkflowInformation } from './workflow-information';

const utterance = '현재 단계 완료했어';
const healthPath = '/api/v1/system/health';
const expertHomePath = '/api/v1/home/expert';
const cleanupChecks = {
  powerOff: 'USB 전원 장치 OFF 확인',
  cables: '센서 케이블 분리와 정리',
  storage: 'LED 모듈·지그 원위치',
};

type DemoSession = Omit<ExperimentSession, 'events' | 'resumeChecks' | 'procedure'> & {
  execution: ExecutionState;
  procedure: Omit<ExperimentSession['procedure'], 'execution'> & {
    execution: NonNullable<ExperimentSession['procedure']['execution']> & { lightMinRaw: number };
  };
  workProfile: { deviceName: string };
  actuator: { state: string; success: boolean; dataOrigin: string };
  events: {
    type: string;
    eventSequence: number;
    occurredAt: string;
    requestId: string;
    attemptId?: string;
    resultId?: string;
    checkId?: string;
    holdId?: string;
    issue?: { code: string; message: string };
  }[];
  resumeChecks?: {
    checkId: string;
    holdId: string;
    cursorId: string;
    status: 'failed' | 'passed';
    checkedAt: string;
    report: DeviceDiagnosticsReport;
    issue: { code: string; message: string } | null;
  }[];
};

type Result = {
  id: string;
  resultId: string;
  session: DemoSession;
  completedCycles: number;
  totalCycles: number;
  publicationStatus: string;
  submittedAt: string;
};

type ExpertHome = {
  results: {
    id: string;
    procedureId: string;
    procedureTitle: string;
    studentName: string;
    deviceName: string;
    summary: string;
    submittedLabel: string;
  }[];
};

function nextResponse(page: Page, edge: TestEdge, path: string, method: 'GET' | 'POST') {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.origin === edge.origin && url.pathname === path && response.request().method() === method
    );
  });
}

async function read<T>(response: Response): Promise<T> {
  expect(response.status(), new URL(response.url()).pathname).toBe(200);
  return (await response.json()) as T;
}

function accepted(session: DemoSession) {
  return session.execution.attempts.filter(({ status }) => status === 'valid');
}

async function capture(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await info.attach(name, { path, contentType: 'image/png' });
}

export async function requestDemoCompletion(student: Page, edge: TestEdge, sessionId: string) {
  const sessionPath = `${sessionsPath}/${sessionId}`;
  const getSession = () => edge.read<DemoSession>(sessionPath, 'operator');
  const running = await getSession();
  expect(running.phase).toBe('running');
  const cursor = running.execution.cursor;
  if (!cursor) throw new Error('실행 중인 Edge 세션에 현재 회차가 없습니다.');

  const sampling = nextResponse(student, edge, `${sessionPath}/commands`, 'POST');
  await button(student, '현재 회차 측정값 확인').click();
  const sampled = await sampling;
  const started = await read<DemoSession>(sampled);
  const sampleAttemptId = started.pendingJob?.attemptId;
  expect(sampleAttemptId).toEqual(expect.any(String));
  expect(sampled.request().postDataJSON()).toMatchObject({
    command: { type: 'requestExecutionSample', cursorId: cursor.cursorId },
  });

  await expect(button(student, '완료 요청')).toBeEnabled({ timeout: 45_000 });
  const before = await getSession();
  const attempt = before.execution.attempts.at(-1);
  if (!attempt) throw new Error('현재 회차 측정값을 Edge에서 조회하지 못했습니다.');
  expect(attempt).toMatchObject({ attemptId: sampleAttemptId, status: 'ready', cursor });

  const command = {
    type: 'completeExecutionStep',
    cursorId: cursor.cursorId,
    sampleAttemptId: attempt.attemptId,
  } as const;
  await student.getByLabel('명령 텍스트', { exact: true }).fill(utterance);
  const interpreting = nextResponse(student, edge, `${sessionPath}/voice/interpret`, 'POST');
  await button(student, '명령 해석 요청').click();
  const interpretation = await interpreting;
  expect(interpretation.request().postDataJSON()).toEqual({ text: utterance });
  expect(await read<unknown>(interpretation)).toMatchObject({
    sessionId,
    text: utterance,
    cursorId: cursor.cursorId,
    expectedRevision: before.revision,
    executed: false,
    requiresConfirmation: true,
    intent: command.type,
    command,
  });

  await expect(student.getByText('Edge 명령 해석 결과', { exact: true })).toBeVisible();
  await expect(button(student, '이 명령으로 완료 요청')).toBeEnabled();
  await expect(student.getByText(`회차 ID ${cursor.cursorId}`, { exact: true })).toBeVisible();
  const proposed = await getSession();
  expect(proposed).toMatchObject({
    phase: 'running',
    revision: before.revision,
    execution: { cursor },
  });
  expect(accepted(proposed)).toEqual(accepted(before));
  return { command, revision: before.revision, completedCount: accepted(before).length };
}

export async function finishDemo(
  student: Page,
  expert: Page,
  edge: TestEdge,
  sessionId: string,
  info: TestInfo,
) {
  const route = `/researcher-workflow/${sessionId}`;
  const sessionPath = `${sessionsPath}/${sessionId}`;
  const commandsPath = `${sessionPath}/commands`;
  const nextCommand = () => nextResponse(student, edge, commandsPath, 'POST');
  const getSession = () => edge.read<DemoSession>(sessionPath, 'operator');
  const initial = await getSession();
  const { procedure, operatorId, workProfile } = initial;
  const { conditions } = procedure.execution;
  const total = conditions.reduce((sum, condition) => sum + condition.repetitions, 0);
  expect(total).toBeGreaterThan(1);
  expect(initial.workflowVersion).toBe('2.0');
  expect((await edge.read<ExpertHome>(expertHomePath, 'expert')).results).not.toContainEqual(
    expect.objectContaining({ id: sessionId }),
  );

  const measured =
    await test.step('장면 13 · 완료 제안을 확인해 각 필수 회차를 한 번씩 완료', async () => {
      let current = initial;
      for (let index = accepted(initial).length; index < total; index++) {
        current = await test.step(`필수 회차 ${index + 1} / ${total}`, async () => {
          const { command, revision, completedCount } = await requestDemoCompletion(
            student,
            edge,
            sessionId,
          );
          expect(completedCount).toBe(index);
          const confirm = button(student, '이 명령으로 완료 요청');
          if (index === 0) {
            await confirm.scrollIntoViewIfNeeded();
            await capture(student, info, '13-completion-proposal');
          }
          const confirming = nextCommand();
          await confirm.click();
          const response = await confirming;
          const input = response.request().postDataJSON();
          expect(input).toMatchObject({ expectedRevision: revision, command });
          expect(await response.request().headerValue('idempotency-key')).toBe(input.requestId);
          const confirmed = await read<DemoSession>(response);
          expect(confirmed.sessionId).toBe(sessionId);
          expect(confirmed.revision).toBe(revision + 1);
          expect(accepted(confirmed)).toHaveLength(index + 1);
          expect(
            confirmed.events.filter(
              ({ type, attemptId }) =>
                type === 'measurementAccepted' && attemptId === command.sampleAttemptId,
            ),
          ).toEqual([expect.objectContaining({ requestId: input.requestId })]);
          await expect(confirm).toHaveCount(0);
          const cursor = confirmed.execution.cursor;
          if (index + 1 < total) {
            expect(confirmed.phase).toBe('running');
            expect(cursor?.cursorId).not.toBe(command.cursorId);
            await expect(student).toHaveURL(`${route}/execution`);
            await expect(
              student.getByText(`회차 ID ${cursor?.cursorId}`, { exact: true }),
            ).toBeVisible();
          } else {
            expect(confirmed).toMatchObject({
              phase: 'awaitingCleanup',
              execution: { cursor: null },
            });
          }
          return confirmed;
        });
      }
      return current;
    });

  const published =
    await test.step('장면 14 · 같은 세션에서 LED 종료, 장치 정리와 결과 제출', async () => {
      expect(measured.cleanup?.attempts.at(-1)).toMatchObject({
        status: 'passed',
        response: { state: 'off', success: true, dataOrigin: 'simulation' },
      });
      expect(await edge.read(healthPath)).toMatchObject({ components: { led: 'off' } });
      await expect(student).toHaveURL(`${route}/review`);
      await expect(
        student.getByText(`유효 측정 ${total} / ${total}`, { exact: true }),
      ).toBeVisible();
      await capture(student, info, '14-final-measurement-review');

      await button(student, '장치 정리로 이동').click();
      await expect(student).toHaveURL(`${route}/cleanup`);
      await expect(
        student.getByText('LED 출력 종료 응답을 받았어요', { exact: true }),
      ).toBeVisible();
      await capture(student, info, '14-led-off-cleanup');
      for (const [checkId, label] of Object.entries(cleanupChecks)) {
        const checking = nextCommand();
        await student.getByRole('checkbox', { name: label, exact: true }).click();
        const checked = await checking;
        expect(checked.request().postDataJSON()).toMatchObject({
          command: { type: 'setCleanupCheck', checkId, checked: true },
        });
        expect(
          (await read<DemoSession>(checked)).cleanup?.checks.find(({ id }) => id === checkId),
        ).toMatchObject({ checked: true });
      }

      await button(student, '결과 요약 보기').click();
      await expect(student).toHaveURL(`${route}/results`);
      const submitting = nextCommand();
      await button(student, '결과 제출').click();
      const response = await submitting;
      expect(response.request().postDataJSON()).toMatchObject({
        command: { type: 'submitResult' },
      });
      const completed = await read<DemoSession>(response);
      const submission = completed.submission;
      if (submission?.status !== 'submitted') throw new Error('Edge에 결과 제출 기록이 없습니다.');
      expect(completed).toMatchObject({
        sessionId,
        phase: 'completed',
        resultId: submission.resultId,
      });
      expect(submission.sessionId).toBe(sessionId);
      await expect(student.getByText('결과를 제출했습니다', { exact: true })).toBeVisible();
      await expect(
        student.getByText(`결과 ID · ${submission.resultId}`, { exact: true }),
      ).toBeVisible();
      await capture(student, info, '14-student-submission');

      const resultPath = `/api/v1/results/${encodeURIComponent(submission.resultId)}`;
      const opening = nextResponse(student, edge, resultPath, 'GET');
      await button(student, '제출한 결과 보기').click();
      await expect(student).toHaveURL(`/results/${submission.resultId}?sessionId=${sessionId}`);
      const result = await read<Result>(await opening);
      expect(result).toMatchObject({
        id: submission.resultId,
        resultId: submission.resultId,
        publicationStatus: 'submitted',
        submittedAt: submission.submittedAt,
        completedCycles: total,
        totalCycles: total,
        session: { operatorId, sessionId, workProfile, procedure },
      });
      await expect(student.getByText('실험 결과 · 읽기 전용', { exact: true })).toBeVisible();
      return result;
    });

  return test.step('장면 15 · 먼저 열어 둔 숙련자 브라우저에서 같은 결과와 측정 근거 재조회', async () => {
    const { resultId, submittedAt } = published;
    if (new URL(expert.url()).pathname !== '/expert') {
      await button(expert, '숙련자 홈으로').click();
    }
    await expect(expert).toHaveURL('/expert');
    await expert.getByRole('tab', { name: '현황', exact: true }).click();
    const refreshing = nextResponse(expert, edge, expertHomePath, 'GET');
    await button(expert, '현황 새로고침').click();
    const home = await read<ExpertHome>(await refreshing);
    const results = home.results.filter(({ id }) => id === resultId);
    expect(results).toEqual([
      expect.objectContaining({
        procedureId: procedure.procedureId,
        procedureTitle: procedure.title,
        studentName: operatorId,
        submittedLabel: submittedAt,
      }),
    ]);
    const [item] = results;
    const resultPath = `/api/v1/results/${encodeURIComponent(resultId)}`;
    const opening = nextResponse(expert, edge, resultPath, 'GET');
    await button(
      expert,
      `${item.studentName} · ${item.deviceName}, 검토 대기, ${item.summary}`,
    ).click();
    await expect(expert).toHaveURL(
      `/expert/results/${resultId}?procedureId=${procedure.procedureId}`,
    );
    const reloaded = await read<Result>(await opening);
    expect(reloaded).toEqual(published);

    const summary = expert.getByTestId('expert-review-summary');
    await expect(summary.getByText(procedure.title, { exact: true })).toBeVisible();
    await expect(
      summary.getByText(`${operatorId} · ${workProfile.deviceName} · ${procedure.version}`, {
        exact: true,
      }),
    ).toBeVisible();
    await capture(expert, info, '15-expert-result');

    await button(expert, '더 보기').click();
    for (const label of [
      `연구생 · ${operatorId}`,
      `장치 · ${workProfile.deviceName}`,
      `절차 · ${procedure.title}`,
      `승인 버전 · ${procedure.version}`,
      `세션 · ${sessionId}`,
      submittedAt,
    ]) {
      await expect(expert.getByText(label, { exact: true })).toBeVisible();
    }
    await capture(expert, info, '15-expert-submission-details');
    await closeWorkflowInformation(expert);

    const [condition] = conditions;
    const evidence = nextResponse(expert, edge, resultPath, 'GET');
    await button(expert, `${condition.label} 조건, 16.7 cm`).click();
    expect(await read<Result>(await evidence)).toEqual(published);
    await expect(
      expert.getByRole('heading', { name: `${condition.label} 조건 상세` }),
    ).toBeVisible();
    const measurements = accepted(measured).filter(
      ({ cursor }) => cursor.conditionId === condition.id,
    );
    expect(measurements).toHaveLength(condition.repetitions);
    for (const attempt of measurements) {
      const distance = attempt.report?.diagnostics.sensors
        .flatMap(({ readings }) => readings)
        .find(({ metricId }) => metricId === 'distance');
      if (!distance) throw new Error('제출된 회차에 거리 측정값이 없습니다.');
      expect(distance).toMatchObject({ value: 16.7, unit: 'cm' });
      expect(Date.parse(distance.observedAt)).toBeGreaterThanOrEqual(
        Date.parse(attempt.requestedAt),
      );
      const label = `${attempt.cursor.trialIndex}회차 · 유효 · 16.7 cm`;
      await expect(expert.getByText(label, { exact: true })).toBeVisible();
      await expect(expert.getByText(distance.observedAt, { exact: true })).toBeVisible();
    }
    await expert.getByText('회차별 기록', { exact: true }).scrollIntoViewIfNeeded();
    await capture(expert, info, '15-expert-measurements');
    return { resultId, session: reloaded.session };
  });
}
