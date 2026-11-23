import { randomUUID } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  button,
  currentKitProcedure,
  enterStudentHome,
  isolatedEdge,
  seedRunningSession,
  sessionsPath,
  simulationPath,
  viewport,
  type Session,
  type SimulationConfig,
} from './helpers/edge-session';

const api = '/api/v1';
const healthPath = api + '/system/health';
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
type ResumeCheck = {
  checkId: string;
  holdId: string;
  cursorId: string;
  status: string;
  report: Report;
};
type LightSession = Omit<Session, 'resumeChecks'> & { resumeChecks?: ResumeCheck[] };

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

function reading(report: Report, metricId: string): Reading {
  const metric = report.sensors
    .flatMap(({ readings }) => readings)
    .find((item) => item.metricId === metricId);
  if (!metric) throw new Error('Missing Edge metric: ' + metricId);
  return metric;
}

function expectNewerReading(current: Reading, previous: Reading) {
  expect(current.sampleSequence).toBeGreaterThan(previous.sampleSequence);
  expect(Date.parse(current.observedAt)).toBeGreaterThanOrEqual(Date.parse(previous.observedAt));
}

async function setLight(path: string, value: string) {
  const temporary = path + '.' + randomUUID();
  await writeFile(temporary, value, { flag: 'wx' });
  try {
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary);
    throw error;
  }
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
      const edge = isolatedEdge(request);
      const lightFile = process.env.HANDSON_E2E_LIGHT_SENSOR_FILE;
      if (!lightFile || !isAbsolute(lightFile)) {
        throw new Error('Set HANDSON_E2E_LIGHT_SENSOR_FILE to an absolute path.');
      }

      const health = () =>
        edge.read<{ executionMode: string; components: { led: string } }>(healthPath);
      expect((await health()).executionMode).toBe('simulation');
      const { enabled, scenario, distanceCm, ledFailure } = await edge.read<
        SimulationConfig & { enabled: boolean }
      >(simulationPath, 'expert');
      expect(enabled).toBe(true);
      const existing = await edge.read<Session[]>(sessionsPath, 'operator');
      expect(existing.every(({ phase }) => ['cancelled', 'completed'].includes(phase))).toBe(true);
      const originalLight = await readFile(lightFile, 'utf8');

      async function latest(adc: number) {
        const report = await edge.read<Report>(api + '/sensors/latest', 'operator');
        expect(report.connection).toBe('connected');
        expect(reading(report, 'distance')).toMatchObject({ value: 16.7, unit: 'cm' });
        const light = reading(report, 'lightRaw');
        expect(light).toMatchObject({ value: adc, unit: 'adc' });
        expect(Date.parse(light.observedAt)).not.toBeNaN();
        return light;
      }

      let sessionId: string | undefined;
      try {
        await setLight(lightFile, '2135\n');
        await edge.configure(simulation);
        const procedure = await currentKitProcedure(edge);
        expect(procedure.execution).toMatchObject({ lightMinRaw: 1500 });
        const created = await edge.create(procedure, '2.0');
        sessionId = created.sessionId;
        const running = await seedRunningSession(edge, created);
        const cursor = running.execution?.cursor;
        if (!cursor) throw new Error('Edge did not start an execution cursor.');
        const { cursorId } = cursor;
        const apiSession = sessionsPath + '/' + sessionId;
        const getSession = () => edge.read<LightSession>(apiSession, 'operator');
        const history = async () =>
          (await edge.read<{ events: SessionEvent[] }>(apiSession + '/history', 'operator')).events;
        async function expectState(phase: 'running' | 'held', led: 'on' | 'off') {
          const stored = await getSession();
          expect(stored).toMatchObject({
            sessionId,
            phase,
            execution: { cursor, attempts: [] },
            actuator: { state: led, success: true, dataOrigin: 'simulation' },
          });
          expect((await health()).components.led).toBe(led);
          return stored;
        }

        const screen = '/researcher-workflow/' + sessionId;
        const commandUrl = edge.origin + apiSession + '/commands';
        const sessionWrites: string[] = [];
        page.on('request', (entry) => {
          if (entry.method() === 'POST' && entry.url() === commandUrl) {
            sessionWrites.push(entry.postDataJSON().command.type);
          }
        });

        await expectState('running', 'on');
        await enterStudentHome(page, edge.operatorToken);
        await button(page, '이어서 진행').click();
        await expect(page).toHaveURL(screen + '/execution');
        const cursorText = page.getByText('회차 ID ' + cursorId, { exact: true });
        await expect(cursorText).toBeVisible();
        if (!darkAgain) await capture(page, info, '01-running-before-light-drop');

        const initialLight = await latest(2135);
        await setLight(lightFile, '900\n');
        await expect.poll(async () => (await getSession()).phase).toBe('held');
        const held = await expectState('held', 'off');
        expect(held).toMatchObject({
          holdReason: darkIssue,
          hold: { cursorId, allowedCommands: ['resume', 'cancel'] },
        });
        const holdId = held.hold?.holdId;
        const holdEvents = await history();
        const holdEvent = holdEvents.find(({ type }) => type === 'sessionHeld');
        expect(holdEvent).toMatchObject({
          requestId: 'monitor',
          issue: darkIssue,
          holdId,
        });
        expect(sessionWrites).toEqual([]);
        const holdVisibleBeforeNavigation = await page
          .getByText(darkIssue.message, { exact: true })
          .isVisible();

        await page.goBack();
        await expect(page).toHaveURL('/student');
        await expect(page.getByText(/보류 · 0 \/ \d+회차/)).toBeVisible();
        if (!darkAgain) await capture(page, info, '02-auto-hold-home-reentry');
        await button(page, '이어서 진행').click();
        await expect(page).toHaveURL(screen + '/recovery');
        const recovery = page.getByTestId('edge-recovery-screen');
        await expect(recovery.getByText(darkIssue.message, { exact: true })).toBeVisible();
        await expect(recovery.getByText(/조건 · 1회차/)).toBeVisible();
        const resumeButton = button(page, '장치 점검하고 재개');
        const conditions = recovery.getByRole('checkbox', { name: '실험 조건을 확인했어요' });
        const installation = recovery.getByRole('checkbox', {
          name: '장치 설치 상태를 확인했어요',
        });
        await expect(resumeButton).toBeDisabled();
        if (!darkAgain) await capture(page, info, '03-auto-hold-reason');

        async function confirmSetup() {
          await expect(conditions).not.toBeChecked();
          await expect(installation).not.toBeChecked();
          await conditions.click();
          await expect(resumeButton).toBeDisabled();
          await installation.click();
          await expect(resumeButton).toBeEnabled();
        }

        async function resume(status: 200 | 423, current: LightSession) {
          const response = page.waitForResponse(
            (item) => item.url() === commandUrl && item.request().method() === 'POST',
          );
          await resumeButton.click();
          const reply = await response;
          const request = reply.request();
          const payload = request.postDataJSON();
          expect(await request.headerValue('idempotency-key')).toBe(payload.requestId);
          expect(payload).toMatchObject({
            expectedRevision: current.revision,
            command: {
              type: 'resume',
              confirmation: {
                holdId,
                cursorId,
                conditionsConfirmed: true,
                installationConfirmed: true,
                confirmedAt: expect.any(String),
              },
            },
          });
          expect(reply.status()).toBe(status);
          if (status === 423) {
            expect(await reply.json()).toMatchObject({ error: darkIssue });
            await expect(page).toHaveURL(screen + '/recovery');
            await expect(
              recovery.getByText('센서 재확인 상태를 확인해 주세요', { exact: true }),
            ).toBeVisible();
          }
        }

        function expectCheck(
          stored: LightSession,
          adc: number,
          result: 'passed' | 'failed',
          previous: Reading,
        ) {
          const check = stored.resumeChecks?.at(-1);
          if (!check) throw new Error('Edge did not persist the resume sensor check.');
          expect(check).toMatchObject({ status: result, holdId, cursorId });
          const light = reading(check.report, 'lightRaw');
          expect(light).toMatchObject({ value: adc, unit: 'adc' });
          expectNewerReading(light, previous);
          return { checkId: check.checkId, status: check.status, light };
        }

        const dark = await latest(900);
        const darkRecheck = await latest(900);
        expectNewerReading(darkRecheck, dark);
        const checks = [];
        if (!darkAgain) {
          await confirmSetup();
          await resume(423, held);
          checks.push(expectCheck(await expectState('held', 'off'), 900, 'failed', darkRecheck));
          await capture(page, info, '04-resume-blocked-dark');
        }

        await setLight(lightFile, '2100\n');
        const bright = await latest(2100);
        expectNewerReading(bright, darkRecheck);
        const beforeResume = await expectState('held', 'off');
        expect(beforeResume.hold?.holdId).toBe(holdId);
        expect(beforeResume.resumeChecks ?? []).toHaveLength(checks.length);
        await confirmSetup();

        let latestDark: Reading | undefined;
        if (darkAgain) {
          await setLight(lightFile, '900\n');
          latestDark = await latest(900);
          expectNewerReading(latestDark, bright);
          await resume(423, beforeResume);
          checks.push(expectCheck(await expectState('held', 'off'), 900, 'failed', latestDark));
          await capture(page, info, '06-resume-blocked-fresh-dark');
        } else {
          await resume(200, beforeResume);
          checks.push(expectCheck(await expectState('running', 'on'), 2100, 'passed', bright));
          await expect(page).toHaveURL(screen + '/execution');
          await expect(cursorText).toBeVisible();
          await expect(button(page, '현재 회차 측정값 확인')).toBeEnabled();
          await capture(page, info, '05-running-after-ui-resume');
        }

        expect(sessionWrites).toEqual(checks.map(() => 'resume'));
        const finalHistory = await history();
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
              lightMinRaw: 1500,
              holdEvent,
              holdVisibleBeforeNavigation,
              readings: { initialLight, dark, darkRecheck, bright, latestDark },
              checks,
            },
            null,
            2,
          ),
          contentType: 'application/json',
        });
      } finally {
        try {
          if (sessionId) {
            const stored = await edge.read<Session>(sessionsPath + '/' + sessionId, 'operator');
            await edge.command(sessionId, stored.revision, { type: 'cancel' });
          }
        } finally {
          await setLight(lightFile, originalLight);
          await edge.configure({ scenario, distanceCm, ledFailure });
        }
      }
    },
  );
}
