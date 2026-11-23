import { expect, test } from '@playwright/test';
import type { ExperimentSession } from '../src/features/researcher-workflow/domain/models';
import {
  edgeMeasurementSession,
  firstCursor,
  nextCursor,
  sampleFor,
} from '../test/edge-measurement-fixture';

const origin = 'http://127.0.0.1:19996';
const initial = edgeMeasurementSession();
const sessionPath = '/api/v1/sessions/' + initial.sessionId;
const screenPath = '/researcher-workflow/' + initial.sessionId;
const issue = { code: 'SENSOR_STALE', message: '이전 측정값이 오래되었습니다.' };
const blocked = { ...sampleFor(), status: 'held', issue } as const;
const recovery = {
  recoveryId: 'server-recovery-64',
  blockedAttemptId: blocked.attemptId,
  sampleAttemptId: 'server-recovery-check-54',
  cursor: firstCursor,
  requestedAt: blocked.requestedAt,
  status: 'recovered',
} as const;
const checked = {
  ...sampleFor(firstCursor, recovery.sampleAttemptId, 21.7),
  purpose: 'recoveryCheck',
  recoveryId: recovery.recoveryId,
} as const;
const fresh = {
  ...sampleFor(firstCursor, 'server-remeasurement-83', 19.2),
  purpose: 'remeasurement',
  recoveryId: recovery.recoveryId,
} as const;
type Snapshot = ExperimentSession & {
  holdReason: typeof issue | null;
  execution: NonNullable<ExperimentSession['execution']> & { needsRemeasurement: boolean };
};
const held: Snapshot = {
  ...initial,
  phase: 'held',
  holdReason: issue,
  execution: { ...initial.execution, attempts: [blocked], needsRemeasurement: false },
};
const recovered: Snapshot = {
  ...held,
  phase: 'running',
  holdReason: null,
  revision: 9,
  execution: {
    ...held.execution,
    attempts: [blocked, checked],
    recoveries: [recovery],
    needsRemeasurement: true,
  },
};
const sampling: Snapshot = {
  ...recovered,
  revision: 10,
  pendingJob: { kind: 'sample', attemptId: fresh.attemptId },
  execution: {
    ...recovered.execution,
    attempts: [
      blocked,
      { ...checked, status: 'superseded' },
      { ...fresh, status: 'sampling', report: undefined },
    ],
    needsRemeasurement: false,
  },
};
const ready: Snapshot = {
  ...sampling,
  revision: 11,
  pendingJob: null,
  execution: {
    ...sampling.execution,
    attempts: [...sampling.execution.attempts.slice(0, 2), fresh],
  },
};
const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, idempotency-key, authorization',
  'access-control-expose-headers': 'X-Idempotent-Replay',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};
type Write = { requestId: string; expectedRevision: number; command: Record<string, string> };

test.use({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
test.skip(
  process.env.EXPO_PUBLIC_HANDSON_EDGE_BASE_URL !== origin,
  'Uses intercepted loopback Edge responses.',
);

test('S09 uses the recovered cursor and completes only the fresh attempt through S06', async ({
  page,
}) => {
  let snapshot = held;
  let showReady = false;
  let readsAfterReplay = 0;
  const writes: Write[] = [];
  await page.route(origin + '/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    if (request.method() === 'GET') {
      expect(path).toBe(sessionPath);
      if (writes.length === 4 && !showReady) {
        readsAfterReplay += 1;
        if (readsAfterReplay === 2) {
          await route.fulfill({ headers, json: recovered });
          return;
        }
        if (readsAfterReplay > 2) {
          await route.fulfill({ status: 503, headers });
          return;
        }
      }
      if (writes.length === 4 && showReady) snapshot = ready;
      await route.fulfill({ headers, json: snapshot });
      return;
    }
    expect(request.method()).toBe('POST');
    expect(path).toBe(sessionPath + '/commands');
    const body = request.postDataJSON() as Write;
    expect(request.headers()['idempotency-key']).toBe(body.requestId);
    writes.push(body);
    if (writes.length === 1) {
      snapshot = recovered;
      await route.fulfill({ headers, json: snapshot });
    } else if (writes.length < 4) {
      snapshot = sampling;
      await route.abort('connectionfailed');
    } else if (writes.length === 4) {
      await route.fulfill({
        headers: { ...headers, 'X-Idempotent-Replay': 'true' },
        json: sampling,
      });
    } else {
      snapshot = {
        ...ready,
        revision: 12,
        execution: {
          ...ready.execution,
          cursor: nextCursor,
          attempts: [
            blocked,
            ...ready.execution.attempts.slice(1, 2),
            { ...fresh, status: 'valid' },
          ],
        },
      };
      await route.fulfill({ headers, json: snapshot });
    }
  });

  await page.goto(screenPath + '/execution');
  await page.getByRole('button', { name: '센서 오류와 작업 보류 확인' }).click();
  await page.getByRole('button', { name: '센서 다시 확인' }).click();
  await page.getByRole('button', { name: '같은 회차 재측정으로 이동' }).click();
  await expect(page).toHaveURL(screenPath + '/remeasurement');
  const screen = page.getByTestId('edge-remeasurement-screen');
  await expect(screen.getByText('회차 ID ' + firstCursor.cursorId)).toBeVisible();
  await expect(screen.getByText('실패한 측정 시도 ID ' + blocked.attemptId)).toBeVisible();
  await expect(screen.getByText('복구 ID ' + recovery.recoveryId)).toBeVisible();
  const next = screen.getByRole('button', { name: '완료 확인 화면으로 이동' });
  const sample = screen.getByRole('button', { name: '같은 회차 다시 측정' });
  await expect(next).toBeDisabled();
  await expect(sample).toBeEnabled();
  await sample.evaluate((element: HTMLElement) => {
    element.click();
    element.click();
  });
  await screen.getByRole('button', { name: '같은 요청 다시 시도' }).click();
  await expect(screen.getByText('재측정 응답을 기다리고 있습니다.')).toBeVisible();
  await expect(next).toBeDisabled();
  const reload = screen.getByRole('button', { name: '재측정 결과 다시 조회' });
  await expect(reload).toBeVisible();
  expect(readsAfterReplay).toBeGreaterThan(2);
  showReady = true;
  await reload.click();
  await expect(screen.getByText('재측정 시도 ID ' + fresh.attemptId)).toBeVisible();
  await expect(screen.getByLabel('거리, 19.2, cm', { exact: true })).toBeVisible();
  await expect(screen.getByText('실패한 측정 시도 ID ' + blocked.attemptId)).toBeVisible();
  await expect(screen.getByText('재확인 시도 ID ' + checked.attemptId)).toBeVisible();
  expect(writes).toHaveLength(4);
  await next.click();
  await expect(page).toHaveURL(screenPath + '/execution');
  const execution = page.getByTestId('execution-screen');
  await expect(execution.getByRole('button', { name: '현재 회차 측정값 확인' })).toBeDisabled();
  await execution.getByRole('button', { name: '완료 요청' }).click();
  await expect(execution.getByText('회차 ID ' + nextCursor.cursorId)).toBeVisible();
  expect(writes.map((item) => item.expectedRevision)).toEqual([7, 9, 9, 9, 11]);
  expect(writes.slice(1, 4)).toEqual([writes[1], writes[1], writes[1]]);
  expect(new Set(writes.map((item) => item.requestId)).size).toBe(3);
  expect(writes.map((item) => item.command)).toEqual([
    {
      type: 'requestRecovery',
      cursorId: firstCursor.cursorId,
      blockedAttemptId: blocked.attemptId,
    },
    ...Array.from({ length: 3 }, () => ({
      type: 'requestRecoveryRemeasurement',
      cursorId: firstCursor.cursorId,
      recoveryId: recovery.recoveryId,
    })),
    {
      type: 'completeExecutionStep',
      cursorId: firstCursor.cursorId,
      sampleAttemptId: fresh.attemptId,
    },
  ]);
});

test('S09 serializes reads and retains its 45-second deadline on re-entry', async ({ page }) => {
  let reads = 0;
  let release = () => {};
  const blockedRead = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.clock.install();
  await page.route(origin + '/**', async (route) => {
    expect(route.request().method()).toBe('GET');
    expect(new URL(route.request().url()).pathname).toBe(sessionPath);
    reads += 1;
    if (reads === 2) await blockedRead;
    await route.fulfill({ headers, json: sampling });
  });
  await page.goto(screenPath + '/remeasurement');
  const screen = page.getByTestId('edge-remeasurement-screen');
  const waiting = screen.getByText('재측정 응답을 기다리고 있습니다.');
  await expect(waiting).toBeVisible();
  await expect.poll(() => reads).toBe(2);
  await page.clock.fastForward(2400);
  expect(reads).toBe(2);
  release();
  await page.clock.fastForward(25_000);
  await screen.getByRole('button', { name: '뒤로가기' }).click();
  await expect(page).toHaveURL(screenPath + '/recovery');
  const resume = page.getByRole('button', { name: '재측정 상태 보기' });
  await expect(resume).toBeVisible();
  await page.waitForTimeout(200);
  const readsAway = reads;
  await page.clock.fastForward(2400);
  expect(reads).toBe(readsAway);
  await resume.click();
  await expect(waiting).toBeVisible();
  await page.clock.fastForward(20_000);
  await expect(screen.getByText('재측정 결과 대기 시간이 지났습니다.')).toBeVisible();
  const readsAtTimeout = reads;
  await page.clock.fastForward(2400);
  expect(reads).toBe(readsAtTimeout);
  await screen.getByRole('button', { name: '재측정 결과 다시 조회' }).click();
  await expect(waiting).toBeVisible();
  expect(reads).toBe(readsAtTimeout + 1);
});
