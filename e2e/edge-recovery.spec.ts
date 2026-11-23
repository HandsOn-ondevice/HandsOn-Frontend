import { expect, test } from '@playwright/test';
import type { ExperimentSession } from '../src/features/researcher-workflow/domain/models';
import { edgeMeasurementSession, firstCursor, sampleFor } from '../test/edge-measurement-fixture';
import {
  enterEdgeMeasurementFixture,
  openEdgeMeasurementFixtureScreen,
} from './edge/measurement-fixture-entry';

const origin = 'http://127.0.0.1:19996';
const initial = edgeMeasurementSession();
const sessionPath = '/api/v1/sessions/' + initial.sessionId;
const executionPath = '/researcher-workflow/' + initial.sessionId + '/execution';
const recoveryPath = '/researcher-workflow/' + initial.sessionId + '/recovery';
const issue = { code: 'SENSOR_STALE', message: '센서 측정값이 오래되었습니다.' };
const blocked = { ...sampleFor(), status: 'held', issue } as const;
type RecoverySnapshot = ExperimentSession & {
  holdReason: typeof issue | null;
  execution: NonNullable<ExperimentSession['execution']> & { needsRemeasurement?: boolean };
};
const held = {
  ...initial,
  phase: 'held',
  holdReason: issue,
  execution: { ...initial.execution, attempts: [blocked] },
} satisfies RecoverySnapshot;
const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, idempotency-key, authorization',
  'access-control-expose-headers': 'X-Idempotent-Replay',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};
type CommandBody = {
  requestId: string;
  expectedRevision: number;
  command: { type: string; cursorId: string; blockedAttemptId: string };
};

function recoveryState(
  revision: number,
  index: number,
  status: 'checking' | 'failed' | 'recovered',
): RecoverySnapshot {
  const recoveryId = 'server-recovery-' + index;
  const sample = sampleFor(firstCursor, 'server-recheck-' + index);
  const checking = status === 'checking';
  return {
    ...held,
    phase: status === 'recovered' ? 'running' : 'held',
    holdReason: status === 'recovered' ? null : issue,
    revision,
    pendingJob: checking ? { kind: 'sample', attemptId: sample.attemptId } : null,
    execution: {
      ...held.execution,
      needsRemeasurement: status === 'recovered',
      attempts: [
        blocked,
        {
          ...sample,
          status: checking ? 'sampling' : status === 'failed' ? 'held' : 'ready',
          purpose: 'recoveryCheck',
          recoveryId,
          report: checking ? undefined : sample.report,
        },
      ],
      recoveries: [
        {
          recoveryId,
          cursor: firstCursor,
          requestedAt: sample.requestedAt,
          blockedAttemptId: blocked.attemptId,
          sampleAttemptId: sample.attemptId,
          status,
          issue:
            status === 'failed'
              ? { code: 'SENSOR_ERROR', message: '재확인 센서 응답 오류' }
              : undefined,
        },
      ],
    },
  };
}

test.use({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
test.skip(
  process.env.EXPO_PUBLIC_HANDSON_EDGE_BASE_URL !== origin,
  'Uses intercepted loopback Edge responses.',
);

test('S08 retries the same command and recovers the original held attempt without completing it', async ({
  page,
}) => {
  let snapshot: RecoverySnapshot = held;
  let readsAfterReplay = 0;
  let showFailure = false;
  let showSuccess = false;
  const writes: CommandBody[] = [];
  const accepted = recoveryState(9, 1, 'checking');

  await page.route(origin + '/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    if (request.method() === 'GET') {
      expect(path).toBe(sessionPath);
      if (writes.length === 4 && !showFailure) {
        readsAfterReplay += 1;
        if (readsAfterReplay === 2) {
          await route.fulfill({ headers, json: held });
          return;
        }
        if (readsAfterReplay > 2) {
          await route.fulfill({ status: 503, headers });
          return;
        }
      }
      if (writes.length === 4 && showFailure) snapshot = recoveryState(10, 1, 'failed');
      if (writes.length === 5 && showSuccess) snapshot = recoveryState(12, 2, 'recovered');
      await route.fulfill({ headers, json: snapshot });
      return;
    }
    expect(request.method()).toBe('POST');
    expect(path).toBe(sessionPath + '/commands');
    const body = request.postDataJSON() as CommandBody;
    expect(request.headers()['idempotency-key']).toBe(body.requestId);
    writes.push(body);
    if (writes.length === 1) {
      snapshot = { ...held, revision: 8 };
      await route.fulfill({
        status: 409,
        headers,
        json: { error: { code: 'REVISION_CONFLICT', message: '최신 상태를 확인하세요.' } },
      });
      return;
    }
    if (writes.length === 2 || writes.length === 3) {
      snapshot = accepted;
      await route.abort('connectionfailed');
      return;
    }
    if (writes.length === 4) {
      await route.fulfill({
        headers: { ...headers, 'X-Idempotent-Replay': 'true' },
        json: accepted,
      });
      return;
    }
    snapshot = recoveryState(11, 2, 'checking');
    await route.fulfill({ headers, json: snapshot });
  });

  await enterEdgeMeasurementFixture(page, origin);
  await openEdgeMeasurementFixtureScreen(page, executionPath);
  await page.getByRole('button', { name: '센서 오류와 작업 보류 확인' }).click();
  await expect(page).toHaveURL(recoveryPath);
  const recoveryScreen = page.getByTestId('edge-recovery-screen');
  await expect(recoveryScreen.getByText(issue.message)).toBeVisible();
  await expect(page.getByText('차단된 측정 시도 ID ' + blocked.attemptId)).toBeVisible();
  const recover = recoveryScreen.getByRole('button', { name: '센서 다시 확인' });
  await recover.click();
  await expect(page.getByText('최신 상태를 확인하세요.')).toBeVisible();
  await expect(recover).toBeEnabled();
  await recover.evaluate((element: HTMLElement) => {
    element.click();
    element.click();
  });
  await expect(recover).toBeDisabled();
  await page.getByRole('button', { name: '같은 요청 다시 시도' }).click();
  await expect(page.getByText('복구 ID server-recovery-1')).toBeVisible();
  const reload = page.getByRole('button', { name: '복구 결과 다시 조회' });
  await expect(reload).toBeVisible();
  expect(readsAfterReplay).toBeGreaterThan(2);
  showFailure = true;
  await reload.click();
  await expect(page.getByText('재확인 센서 응답 오류')).toBeVisible();
  expect(writes).toHaveLength(4);
  await recover.click();
  await expect(page.getByText('재확인 시도 ID server-recheck-2')).toBeVisible();
  showSuccess = true;
  await expect(page.getByText('센서 재확인 완료')).toBeVisible();
  await expect(recoveryScreen.getByText('회차 ID ' + firstCursor.cursorId)).toBeVisible();
  await page.getByRole('button', { name: '뒤로가기' }).click();
  await expect(page.getByRole('button', { name: '현재 회차 측정값 확인' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '완료 요청' })).toBeDisabled();
  expect(writes.map((write) => write.expectedRevision)).toEqual([7, 8, 8, 8, 10]);
  expect(writes.slice(1, 4)).toEqual([writes[1], writes[1], writes[1]]);
  expect(new Set(writes.map((write) => write.requestId)).size).toBe(3);
  for (const write of writes) {
    expect(write.command).toEqual({
      type: 'requestRecovery',
      cursorId: firstCursor.cursorId,
      blockedAttemptId: blocked.attemptId,
    });
  }
  showSuccess = false;
  snapshot = {
    ...held,
    revision: 13,
    holdReason: { code: 'USER_PAUSED', message: '작업자가 일시정지했습니다.' },
  };
  await openEdgeMeasurementFixtureScreen(page, recoveryPath);
  await expect(page.getByText('복구할 측정 오류가 없습니다')).toBeVisible();
  await expect(recover).toHaveCount(0);
});

test('S08 keeps the same 45-second deadline across navigation and serializes GETs', async ({
  page,
}) => {
  let reads = 0;
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.clock.install();
  await page.route(origin + '/**', async (route) => {
    expect(route.request().method()).toBe('GET');
    expect(new URL(route.request().url()).pathname).toBe(sessionPath);
    reads += 1;
    if (reads === 2) await pending;
    await route.fulfill({ headers, json: recoveryState(8, 1, 'checking') });
  });
  await enterEdgeMeasurementFixture(page, origin);
  await openEdgeMeasurementFixtureScreen(page, recoveryPath);
  const waiting = page.getByText('센서 재확인 결과를 기다리고 있습니다.');
  await expect(waiting).toBeVisible();
  await expect.poll(() => reads).toBe(2);
  await page.clock.fastForward(2400);
  expect(reads).toBe(2);
  release();
  await page.clock.fastForward(25_000);
  await page.getByRole('button', { name: '뒤로가기' }).click();
  await expect(page).toHaveURL(executionPath);
  const enter = page.getByRole('button', { name: '센서 오류와 작업 보류 확인' });
  await expect(enter).toBeVisible();
  await page.waitForTimeout(200);
  const readsAway = reads;
  await page.clock.fastForward(2400);
  expect(reads).toBe(readsAway);
  await enter.click();
  await expect(waiting).toBeVisible();
  await page.clock.fastForward(20_000);
  await expect(page.getByText('센서 재확인 결과 대기 시간이 지났습니다.')).toBeVisible();
  const readsAtTimeout = reads;
  await page.clock.fastForward(2400);
  expect(reads).toBe(readsAtTimeout);
  await page.getByRole('button', { name: '복구 결과 다시 조회' }).click();
  await expect(waiting).toBeVisible();
  expect(reads).toBe(readsAtTimeout + 1);
});
