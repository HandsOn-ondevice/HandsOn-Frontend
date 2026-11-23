import { randomUUID } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { expect, test, type APIResponse, type Page, type TestInfo } from '@playwright/test';

const api = '/api/v1';
const viewport = { width: 360, height: 800 };
const darkIssue = { code: 'LIGHT_TOO_DARK', message: '주변 밝기가 기준보다 낮습니다.' };
const simulation = { scenario: 'normal', distanceCm: 16.7, ledFailure: false };

type Reading = {
  metricId: string;
  value: number;
  unit: string;
  observedAt: string;
  sampleSequence: number;
};
type Report = { connection: string; sensors: { readings: Reading[] }[] };
type SessionEvent = { type: string; requestId: string; checkId?: string };
type Session = {
  sessionId: string;
  revision: number;
  phase: string;
  hold: { holdId: string; cursorId: string; allowedCommands: string[] } | null;
  procedure: {
    preparation: { id: string; owner: string }[];
    execution: { lightMinRaw: number };
  };
  execution: {
    cursor: { cursorId: string; conditionId: string; trialIndex: number };
    attempts: unknown[];
  } | null;
  resumeChecks?: {
    checkId: string;
    holdId: string;
    cursorId: string;
    status: string;
    report: Report;
  }[];
};

async function read<T>(response: APIResponse, status = 200): Promise<T> {
  const body = await response.json();
  expect(response.status(), [new URL(response.url()).pathname, body?.error?.code].join(' ')).toBe(
    status,
  );
  return body as T;
}

function reading(report: Report, metricId: string): Reading {
  const metric = report.sensors
    .flatMap(({ readings }) => readings)
    .find((item) => item.metricId === metricId);
  if (!metric) throw new Error('Missing Edge metric: ' + metricId);
  return metric;
}

async function setLight(path: string, value: string) {
  const temporary = path + '.' + randomUUID();
  await writeFile(temporary, value, { flag: 'wx' });
  try {
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

test.skip(
  process.env.HANDSON_E2E_LIGHT_HOLD !== '1',
  'Requires a dedicated Edge with the light input fixture.',
);
test.describe.configure({ mode: 'default' });
test.use({
  viewport,
  isMobile: true,
  hasTouch: true,
  trace: 'off',
  screenshot: 'off',
  video: 'off',
});

function button(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true });
}

async function enterStudentHome(page: Page, operator: string) {
  await page.goto('/');
  await page.getByRole('radio', { name: '신규 연구생, 승인된 절차 실행' }).click();
  await page.getByLabel('Edge 접속 토큰', { exact: true }).fill(operator);
  await button(page, '작업 환경 불러오기').click();
  await page.getByRole('button', { name: /^연구실: / }).click();
  await page.getByRole('radio', { name: '지급 키트 실습실', exact: true }).click();
  await button(page, '설정하고 계속').click();
  await expect(page).toHaveURL('/student');
}

async function capture(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(name + '.png');
  await page.screenshot({ path, animations: 'disabled' });
  await info.attach(name, { path, contentType: 'image/png' });
}

for (const darkAgain of [false, true]) {
  test(
    darkAgain
      ? '정상 조회 뒤 재개 직전 다시 어두워지면 최신 조도로 차단한다'
      : '조도 저하로 같은 회차를 자동 보류하고 명시적 명령으로 재개한다',
    async ({ page, request }, info) => {
      test.setTimeout(90_000);
      const origin = new URL(process.env.EXPO_PUBLIC_HANDSON_EDGE_BASE_URL ?? '').origin;
      const operator = process.env.HANDSON_E2E_OPERATOR_TOKEN;
      const expert = process.env.HANDSON_E2E_EXPERT_TOKEN;
      const lightFile = process.env.HANDSON_E2E_LIGHT_SENSOR_FILE;
      if (!lightFile || !isAbsolute(lightFile))
        throw new Error('Set HANDSON_E2E_LIGHT_SENSOR_FILE to an absolute path.');
      if (new URL(origin).hostname !== '127.0.0.1' || !operator || !expert) {
        throw new Error('Use an isolated Edge at 127.0.0.1 and local operator/expert tokens.');
      }
      const headers = { Authorization: 'Bearer ' + operator };
      const expertHeaders = { Authorization: 'Bearer ' + expert };
      function requestResponse(
        method: 'GET' | 'POST',
        path: string,
        data?: unknown,
        authenticated = headers,
      ) {
        return request.fetch(origin + api + path, { method, headers: authenticated, data });
      }
      async function configure(config: typeof simulation) {
        await read(
          await requestResponse(
            'POST',
            '/simulation',
            { requestId: randomUUID(), config },
            expertHeaders,
          ),
        );
      }
      async function latest(adc: number) {
        const report = await read<Report>(await requestResponse('GET', '/sensors/latest'));
        expect(report.connection).toBe('connected');
        expect(reading(report, 'distance')).toMatchObject({ value: 16.7, unit: 'cm' });
        const light = reading(report, 'lightRaw');
        expect(light).toMatchObject({ value: adc, unit: 'adc' });
        expect(Date.parse(light.observedAt)).not.toBeNaN();
        return light;
      }
      const status = async () =>
        read<{ executionMode: string; components: { led: string } }>(
          await request.get(origin + api + '/system/health'),
        );

      expect((await status()).executionMode).toBe('simulation');
      const { scenario, distanceCm, ledFailure } = await read<typeof simulation>(
        await requestResponse('GET', '/simulation', undefined, expertHeaders),
      );
      const sessions = await read<Session[]>(await requestResponse('GET', '/sessions'));
      expect(sessions.filter(({ phase }) => !['cancelled', 'completed'].includes(phase))).toEqual(
        [],
      );
      const originalLight = await readFile(lightFile, 'utf8');

      let sessionPath: string | undefined;
      const getSession = async () => {
        if (!sessionPath) throw new Error('Create a session before querying it.');
        return read<Session>(await requestResponse('GET', sessionPath));
      };
      const command = (session: Session, command: object) =>
        requestResponse('POST', '/sessions/' + session.sessionId + '/commands', {
          requestId: randomUUID(),
          expectedRevision: session.revision,
          command,
        });

      try {
        await setLight(lightFile, '2135\n');
        await configure(simulation);
        let session = await read<Session>(
          await requestResponse('POST', '/sessions', {
            requestId: randomUUID(),
            resumePolicyVersion: '2.0',
          }),
          201,
        );
        sessionPath = '/sessions/' + session.sessionId;
        expect(session.procedure.execution.lightMinRaw).toBe(1500);
        for (const { id, owner } of session.procedure.preparation) {
          if (owner === 'operator')
            session = await read(
              await command(session, { type: 'setPreparationCheck', checkId: id, checked: true }),
            );
        }
        session = await read(await command(session, { type: 'completePreparation' }));
        await read(await command(session, { type: 'startDeviceCheck' }));
        await expect
          .poll(async () => (await getSession()).phase, { timeout: 15_000 })
          .toBe('readyToExecute');
        session = await read(await command(await getSession(), { type: 'startExecution' }));
        const cursor = session.execution?.cursor;
        if (!cursor) throw new Error('Edge did not start an execution cursor.');
        const { cursorId } = cursor;
        const { sessionId } = session;
        async function expectState(phase: 'running' | 'held', led: 'on' | 'off') {
          const stored = await getSession();
          expect(stored).toMatchObject({
            sessionId,
            phase,
            execution: { cursor, attempts: [] },
            actuator: { state: led, success: true, dataOrigin: 'simulation' },
          });
          expect((await status()).components.led).toBe(led);
          return stored;
        }
        await expectState('running', 'on');
        const screen = '/researcher-workflow/' + sessionId;
        const sessionWrites: string[] = [];
        const execution = page.getByTestId('execution-screen');
        const cursorText = page.getByText('회차 ID ' + cursorId, { exact: true });
        const holdMessage = execution.getByText(darkIssue.message, { exact: true });
        let holdVisibleBeforeNavigation: boolean | undefined;
        if (!darkAgain) {
          page.on('request', (entry) => {
            if (
              entry.method() === 'POST' &&
              entry.url() === origin + api + sessionPath + '/commands'
            ) {
              sessionWrites.push(entry.postDataJSON().command.type);
            }
          });
          await enterStudentHome(page, operator);
          await button(page, '이어서 진행').click();
          await expect(page).toHaveURL(screen + '/execution');
          await expect(cursorText).toBeVisible();
          await capture(page, info, '01-running-before-light-drop');
        }

        const initialLight = await latest(2135);
        await setLight(lightFile, '900\n');
        await expect.poll(async () => (await getSession()).phase).toBe('held');
        const held = await expectState('held', 'off');
        expect(held).toMatchObject({
          holdReason: darkIssue,
          hold: { cursorId, allowedCommands: ['resume', 'cancel'] },
        });
        const history = async () =>
          read<{ events: SessionEvent[] }>(
            await requestResponse('GET', '/sessions/' + sessionId + '/history'),
          );
        const holdEvents = (await history()).events;
        const holdEvent = expect.objectContaining({
          type: 'sessionHeld',
          requestId: 'monitor',
          issue: darkIssue,
          holdId: held.hold?.holdId,
        });
        expect(holdEvents).toContainEqual(holdEvent);
        const dark = await latest(900);
        const darkRecheck = await latest(900);
        expect(darkRecheck.sampleSequence).toBeGreaterThan(dark.sampleSequence);
        expect(Date.parse(darkRecheck.observedAt)).toBeGreaterThanOrEqual(
          Date.parse(dark.observedAt),
        );

        if (!darkAgain) {
          expect(sessionWrites).toEqual([]);
          holdVisibleBeforeNavigation = await holdMessage.isVisible();
          await page.goBack();
          await expect(page).toHaveURL('/student');
          await expect(page.getByText(/보류 · 0 \/ \d+회차/)).toBeVisible();
          await capture(page, info, '02-auto-hold-home-reentry');
          await button(page, '이어서 진행').click();
          await expect(page).toHaveURL(screen + '/recovery');
          await expect(page.getByTestId('edge-recovery-screen')).toBeVisible();
          const unresolved = page.getByText('복구할 측정 오류가 없습니다', { exact: true });
          await expect(unresolved.or(button(page, '장치 점검하고 재개'))).toBeVisible();
          if (await unresolved.isVisible()) {
            await capture(page, info, '03-auto-hold-recovery-limitation');
          }
          await button(page, '뒤로가기').click();
          await expect(holdMessage).toBeVisible();
          await capture(page, info, '04-auto-hold-reason');
        }

        async function resume(expectedStatus: number) {
          const current = await getSession();
          if (!current.hold) throw new Error('Edge did not return the current hold.');
          return read<Session | { error: { code: string }; session: Session }>(
            await command(current, {
              type: 'resume',
              confirmation: {
                holdId: current.hold.holdId,
                cursorId,
                conditionsConfirmed: true,
                installationConfirmed: true,
                confirmedAt: new Date().toISOString(),
              },
            }),
            expectedStatus,
          );
        }
        const expectCheck = (
          stored: Session,
          adc: number,
          result: 'passed' | 'failed',
          after: Reading,
        ) => {
          const check = stored.resumeChecks?.at(-1);
          if (!check) throw new Error('Edge did not persist the resume sensor check.');
          expect(check).toMatchObject({ status: result, holdId: held.hold?.holdId, cursorId });
          const light = reading(check.report, 'lightRaw');
          expect(light).toMatchObject({ value: adc, unit: 'adc' });
          expect(light.sampleSequence).toBeGreaterThan(after.sampleSequence);
          expect(Date.parse(light.observedAt)).toBeGreaterThanOrEqual(Date.parse(after.observedAt));
          return { checkId: check.checkId, status: check.status, light };
        };

        const checks = [];
        if (!darkAgain) {
          expect(await resume(423)).toMatchObject({ error: darkIssue });
          checks.push(expectCheck(await expectState('held', 'off'), 900, 'failed', darkRecheck));
        }

        await setLight(lightFile, '2100\n');
        const bright = await latest(2100);
        expect(bright.sampleSequence).toBeGreaterThan(darkRecheck.sampleSequence);
        const beforeResume = await expectState('held', 'off');
        expect(beforeResume.hold?.holdId).toBe(held.hold?.holdId);
        expect(beforeResume.resumeChecks ?? []).toHaveLength(checks.length);
        let latestDark: Reading | undefined;
        if (darkAgain) {
          await setLight(lightFile, '900\n');
          latestDark = await latest(900);
          expect(latestDark.sampleSequence).toBeGreaterThan(bright.sampleSequence);
          expect(await resume(423)).toMatchObject({ error: darkIssue });
          checks.push(expectCheck(await expectState('held', 'off'), 900, 'failed', latestDark));
        } else {
          expect(await resume(200)).toMatchObject({ sessionId, phase: 'running' });
          checks.push(expectCheck(await expectState('running', 'on'), 2100, 'passed', bright));
          await enterStudentHome(page, operator);
          await button(page, '이어서 진행').click();
          await expect(page).toHaveURL(screen + '/execution');
          await expect(cursorText).toBeVisible();
          await capture(page, info, '05-running-after-api-resume');
          expect(sessionWrites).toEqual([]);
        }
        const finalHistory = (await history()).events;
        expect(
          finalHistory
            .filter(({ type }) => type === 'resumeDeviceChecked')
            .map(({ checkId }) => checkId),
        ).toEqual(checks.map(({ checkId }) => checkId));
        await info.attach('edge-light-hold-evidence', {
          body: JSON.stringify(
            {
              sessionId,
              cursor,
              lightMinRaw: session.procedure.execution.lightMinRaw,
              holdEvent: holdEvents.find(({ type }) => type === 'sessionHeld'),
              readings: { initialLight, dark, darkRecheck, bright, latestDark },
              holdVisibleBeforeNavigation,
              checks,
            },
            null,
            2,
          ),
          contentType: 'application/json',
        });
      } finally {
        try {
          if (sessionPath) await read(await command(await getSession(), { type: 'cancel' }));
        } finally {
          await setLight(lightFile, originalLight);
          await configure({ scenario, distanceCm, ledFailure });
        }
      }
    },
  );
}
