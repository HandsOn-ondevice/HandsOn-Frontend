import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import type { ExecutionStartProcedure } from './edge-execution-start';

type Draft = {
  id: string;
  revision: number;
  steps: { id: string; title: string; description: string; needsReview: boolean }[];
};

async function read<T>(response: APIResponse, status: number, path: string): Promise<T> {
  expect(response.status(), path).toBe(status);
  return (await response.json()) as T;
}

export async function approveLightVersions(request: APIRequestContext, origin: string) {
  const expertToken = process.env.HANDSON_E2E_EXPERT_TOKEN;
  const edge = new URL(origin);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(edge.hostname) || !expertToken) {
    throw new Error('조도 기준 비교용 승인 절차는 격리된 로컬 Edge에서만 만듭니다.');
  }

  const options = {
    headers: { Authorization: `Bearer ${expertToken}` },
    maxRedirects: 0,
  };
  const procedures = `${edge.origin}/api/v1/procedures`;
  const draft = await read<Draft>(
    await request.post(`${procedures}/drafts`, {
      ...options,
      data: {
        requestId: randomUUID(),
        title: `실행 시작 조도 기준 검증 ${randomUUID().slice(0, 8)}`,
        confirmedText: '같은 거리와 조도에서 승인 절차의 조도 하한을 비교합니다.',
        environmentId: 'kit-lab',
      },
    }),
    201,
    'POST /procedures/drafts',
  );
  const procedure = `${procedures}/${encodeURIComponent(draft.id)}`;

  async function approve(expectedRevision: number, lightMinRaw: number) {
    const revised = await read<Draft>(
      await request.patch(`${procedure}/draft`, {
        ...options,
        data: {
          requestId: randomUUID(),
          expectedRevision,
          steps: draft.steps.map((step) => ({ ...step, needsReview: false })),
          pendingItems: [],
          execution: {
            conditions: [{ id: 'placement-20cm', label: '거리 배치 확인', repetitions: 3 }],
            distanceMinCm: 15,
            distanceMaxCm: 25,
            lightMinRaw,
          },
        },
      }),
      200,
      'PATCH /procedures/{id}/draft',
    );
    const version = await read<ExecutionStartProcedure>(
      await request.post(`${procedure}/approve`, {
        ...options,
        data: {
          requestId: randomUUID(),
          expectedRevision: revised.revision,
          reason: '실행 시작 조도 기준을 비교하는 테스트용 승인',
        },
      }),
      201,
      'POST /procedures/{id}/approve',
    );
    return { version, nextRevision: revised.revision };
  }

  const first = await approve(draft.revision, 2400);
  const second = await approve(first.nextRevision, 2401);
  expect(first.version.version).not.toBe(second.version.version);

  async function approvedVersion(version: string, lightMinRaw: number) {
    const stored = await read<ExecutionStartProcedure>(
      await request.get(`${procedure}?version=${encodeURIComponent(version)}`, options),
      200,
      'GET /procedures/{id}?version',
    );
    expect(stored).toMatchObject({
      procedureId: draft.id,
      version,
      approval: 'approved',
      execution: { distanceMinCm: 15, distanceMaxCm: 25, lightMinRaw },
    });
    return stored;
  }

  const [lower, higher] = await Promise.all([
    approvedVersion(first.version.version, 2400),
    approvedVersion(second.version.version, 2401),
  ]);
  return { lower, higher };
}
