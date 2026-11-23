import { expect, test, type Locator } from '@playwright/test';
import type { ExperimentSession } from '../src/features/researcher-workflow/domain/models';
import {
  edgeMeasurementSession,
  firstCursor,
  nextCursor,
  sampleFor,
} from '../test/edge-measurement-fixture';

const fixtureOrigin = 'http://127.0.0.1:19996';
const initial = edgeMeasurementSession();
const sessionPath = '/api/v1/sessions/' + initial.sessionId;
const executionPath = '/researcher-workflow/' + initial.sessionId + '/execution';

test.use({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
test.skip(
  process.env.EXPO_PUBLIC_HANDSON_EDGE_BASE_URL !== fixtureOrigin,
  'Uses intercepted loopback Edge responses.',
);

async function pressTwice(button: Locator) {
  await expect(button).toBeEnabled();
  await button.evaluate((element: HTMLElement) => {
    element.click();
    element.click();
  });
}

test('displays Edge measurements, replays the same request, and completes each server cursor once', async ({
  page,
}) => {
  const first = sampleFor();
  const second = sampleFor(nextCursor, 'server-sample-86', 19.2);
  const validFirst = { ...first, status: 'valid' } as const;
  const readyFirst: ExperimentSession = {
    ...initial,
    revision: 9,
    execution: { ...initial.execution, attempts: [first] },
  };
  const accepted: ExperimentSession = {
    ...readyFirst,
    revision: 8,
    pendingJob: { kind: 'sample', attemptId: first.attemptId },
    execution: {
      ...initial.execution,
      attempts: [{ ...first, status: 'sampling', report: undefined }],
    },
  };
  let snapshot: ExperimentSession = initial;
  let showReady = false;
  let readsAfterReplay = 0;
  const writes: { requestId: string; expectedRevision: number; command: Record<string, string> }[] =
    [];
  const headers = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, idempotency-key, authorization',
    'access-control-expose-headers': 'X-Idempotent-Replay',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  };

  await page.route(fixtureOrigin + '/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    if (request.method() === 'GET' && path === sessionPath) {
      if (writes.length === 3 && !showReady) {
        readsAfterReplay += 1;
        if (readsAfterReplay === 2) {
          await route.fulfill({ headers, json: initial });
          return;
        }
        if (readsAfterReplay > 2) {
          await route.fulfill({ status: 503, headers, json: { error: { code: 'UNAVAILABLE' } } });
          return;
        }
      }
      if (showReady && writes.length === 3) snapshot = readyFirst;
      await route.fulfill({ headers, json: snapshot });
      return;
    }
    expect(request.method()).toBe('POST');
    expect(path).toBe(sessionPath + '/commands');
    const body = request.postDataJSON() as (typeof writes)[number];
    expect(request.headers()['idempotency-key']).toBe(body.requestId);
    writes.push(body);
    if (writes.length <= 2) {
      snapshot = accepted;
      await route.abort('connectionfailed');
      return;
    }
    if (writes.length === 3) {
      await route.fulfill({
        headers: { ...headers, 'X-Idempotent-Replay': 'true' },
        json: accepted,
      });
      return;
    }
    if (writes.length === 4) {
      snapshot = {
        ...readyFirst,
        revision: 10,
        execution: { ...initial.execution, cursor: nextCursor, attempts: [validFirst] },
      };
    } else if (writes.length === 5) {
      snapshot = {
        ...snapshot,
        revision: 12,
        execution: { ...initial.execution, cursor: nextCursor, attempts: [validFirst, second] },
      };
    } else {
      snapshot = {
        ...snapshot,
        phase: 'completed',
        revision: 13,
        execution: {
          ...initial.execution,
          cursor: null,
          attempts: [validFirst, { ...second, status: 'valid' }],
        },
      };
    }
    await route.fulfill({ headers, json: snapshot });
  });

  await page.goto(executionPath);
  const sample = page.getByRole('button', { name: '현재 회차 측정값 확인' });
  const complete = page.getByRole('button', { name: '완료 요청' });
  await expect(page.getByText('회차 ID ' + firstCursor.cursorId)).toBeVisible();
  await expect(complete).toBeDisabled();
  await pressTwice(sample);
  await expect(sample).toBeDisabled();
  await page.getByRole('button', { name: '같은 요청 다시 시도' }).click();
  await expect(page.getByText('측정 응답을 기다리고 있습니다.')).toBeVisible();
  await expect(complete).toBeDisabled();
  const retryRead = page.getByRole('button', { name: '측정 결과 다시 조회' });
  await expect(retryRead).toBeVisible();
  const readsAtError = readsAfterReplay;
  await page.waitForTimeout(750);
  expect(readsAfterReplay).toBe(readsAtError);
  showReady = true;
  await retryRead.click();
  await expect(page.getByText('측정 시도 ID ' + first.attemptId)).toBeVisible();
  await expect(page.getByLabel('거리, 23.7, cm', { exact: true })).toBeVisible();
  await expect(page.getByLabel('lightRaw, 1532, adc', { exact: true })).toBeVisible();
  await pressTwice(complete);
  await expect(page.getByText('회차 ID ' + nextCursor.cursorId)).toBeVisible();
  await expect(page.getByText('조건 먼 거리 · 1회차')).toBeVisible();
  await expect(complete).toBeDisabled();
  await pressTwice(sample);
  await expect(page.getByText('측정 시도 ID ' + second.attemptId)).toBeVisible();
  await pressTwice(complete);
  await expect(page.getByText('반복 측정 완료')).toBeVisible();
  await expect(page.getByText('측정 시도 ID ' + second.attemptId)).toBeVisible();
  await expect(page.getByLabel('거리, 19.2, cm', { exact: true })).toBeVisible();
  await expect(page.getByLabel('거리, 23.7, cm', { exact: true })).toHaveCount(0);
  await expect(complete).toHaveCount(0);

  expect(writes).toHaveLength(6);
  expect(writes.slice(0, 3)).toEqual([writes[0], writes[0], writes[0]]);
  expect(writes[0]).toMatchObject({
    expectedRevision: 7,
    command: { type: 'requestExecutionSample', cursorId: firstCursor.cursorId },
  });
  expect(writes[3]).toMatchObject({
    expectedRevision: 9,
    command: {
      type: 'completeExecutionStep',
      cursorId: firstCursor.cursorId,
      sampleAttemptId: first.attemptId,
    },
  });
  expect(writes[4]).toMatchObject({
    expectedRevision: 10,
    command: { type: 'requestExecutionSample', cursorId: nextCursor.cursorId },
  });
  expect(writes[5]).toMatchObject({
    expectedRevision: 12,
    command: {
      type: 'completeExecutionStep',
      cursorId: nextCursor.cursorId,
      sampleAttemptId: second.attemptId,
    },
  });
  expect(new Set(writes.map((write) => write.requestId)).size).toBe(4);
});

test('serializes polling and preserves the same deadline across navigation', async ({ page }) => {
  const attempt = sampleFor();
  const sampling: ExperimentSession = {
    ...initial,
    revision: 8,
    pendingJob: { kind: 'sample', attemptId: attempt.attemptId },
    execution: {
      ...initial.execution,
      attempts: [{ ...attempt, status: 'sampling', report: undefined }],
    },
  };
  const ready: ExperimentSession = {
    ...sampling,
    revision: 9,
    pendingJob: null,
    execution: { ...initial.execution, attempts: [attempt] },
  };
  let reads = 0;
  let showReady = false;
  let releaseRead = () => {};
  const blockedRead = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });

  await page.clock.install();
  await page.route(fixtureOrigin + '/**', async (route) => {
    expect(route.request().method()).toBe('GET');
    expect(new URL(route.request().url()).pathname).toBe(sessionPath);
    reads += 1;
    if (reads === 2) await blockedRead;
    await route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: showReady ? ready : sampling,
    });
  });

  await page.goto(executionPath);
  const waiting = page.getByText('측정 응답을 기다리고 있습니다.');
  await expect(waiting).toBeVisible();
  await expect.poll(() => reads).toBe(2);
  await page.clock.fastForward(2_400);
  expect(reads).toBe(2);
  releaseRead();
  await page.clock.fastForward(25_000);

  await page.getByRole('button', { name: '뒤로가기' }).click();
  await expect(page).toHaveURL(/\/device-check$/);
  await expect(waiting).toHaveCount(0);
  await page.waitForTimeout(200);
  const readsAway = reads;
  await page.clock.fastForward(2_400);
  expect(reads).toBe(readsAway);

  await page.evaluate((path) => {
    history.pushState({}, '', path);
    dispatchEvent(new PopStateEvent('popstate'));
  }, executionPath);
  await expect(waiting).toBeVisible();
  await page.clock.fastForward(20_000);
  await expect(page.getByText('측정 결과 대기 시간이 지났습니다')).toBeVisible();
  const readsAtTimeout = reads;
  await page.clock.fastForward(2_400);
  expect(reads).toBe(readsAtTimeout);

  await page.getByRole('button', { name: '측정 결과 다시 조회' }).click();
  await expect(waiting).toBeVisible();
  expect(reads).toBe(readsAtTimeout + 1);
  showReady = true;
  await page.clock.fastForward(700);
  await expect(page.getByRole('button', { name: '완료 요청' })).toBeEnabled();
  await expect(page.getByLabel('거리, 23.7, cm', { exact: true })).toBeVisible();
  const readsAfterReady = reads;
  await page.clock.fastForward(2_400);
  expect(readsAfterReady).toBe(readsAtTimeout + 2);
  expect(reads).toBe(readsAfterReady);
});
