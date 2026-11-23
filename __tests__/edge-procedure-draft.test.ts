import { afterEach, expect, jest, test } from '@jest/globals';

import {
  approveEdgeProcedureDraft,
  createEdgeProcedureDraft,
  isDraftRevisionConflict,
  type EdgeDraftExecution,
} from '@/features/procedure-draft/procedureDraftRepository';
import { createEdgeDraftRepository } from '@/features/procedure-draft/edgeProcedureDraft';
import * as edgeApi from '@/lib/edgeApi';

const baseUrl = 'http://192.0.2.10:8080';
const environmentId = 'kit-lab';
const draftId = 'procedure-test';
const token = 'test-expert';
const execution: EdgeDraftExecution = {
  conditions: [{ id: 'baseline', label: '기준 측정', repetitions: 3 }],
  distanceMinCm: 15,
  distanceMaxCm: 25,
  lightMinRaw: 1500,
  settlingSeconds: 0.2,
  staleAfterMs: 5000,
  checkValidityMs: 30000,
};
const serverDraft = {
  id: draftId,
  procedureId: draftId,
  environmentId,
  title: '거리 확인',
  description: '편집한 전사문',
  version: 'draft',
  status: 'draft',
  revision: 0,
  steps: [
    { id: 'step-1', title: '거리 기록', description: '거리값을 기록한다.', needsReview: true },
  ],
  materials: [],
  precautions: [],
  pendingItems: ['거리를 확인하세요.'],
  execution: null,
  savedAt: '2026-11-23T00:00:00Z',
};

function json(value: object, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

afterEach(() => {
  jest.restoreAllMocks();
});

test('확정 전사문, Edge 녹음 ID, 환경 ID를 보내고 서버 초안 ID와 revision을 사용한다', async () => {
  jest.spyOn(edgeApi, 'getEdgeBaseUrl').mockReturnValue(baseUrl);
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(json(serverDraft, 201));

  const result = await createEdgeProcedureDraft(
    {
      requestId: 'create-1',
      environmentId,
      title: '거리 확인',
      transcript: '편집한 전사문',
      recordingId: 'recording-1',
    },
    token,
  );

  expect(fetch).toHaveBeenCalledWith(
    `${baseUrl}/api/v1/procedures/drafts`,
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': 'create-1',
      }),
      body: JSON.stringify({
        requestId: 'create-1',
        title: '거리 확인',
        confirmedText: '편집한 전사문',
        environmentId,
        recordingId: 'recording-1',
      }),
    }),
  );
  expect(result).toMatchObject({ id: draftId, edge: { revision: 0, execution: null } });
});

test('PATCH 응답 유실 후 인증을 갱신해도 같은 요청 ID와 초안 revision으로 저장한다', async () => {
  const steps = [{ ...serverDraft.steps[0], needsReview: false }];
  const fetch = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(json(serverDraft))
    .mockRejectedValueOnce(new TypeError('Connection interrupted'))
    .mockResolvedValueOnce(json({ error: { code: 'UNAUTHORIZED' } }, 401))
    .mockResolvedValueOnce(
      json({ ...serverDraft, revision: 1, steps, pendingItems: [], execution }),
    );
  const repository = createEdgeDraftRepository(baseUrl, token);
  const draft = await repository.load(environmentId, draftId);
  if (!draft?.edge) throw new Error('Missing Edge draft');
  const edited = { ...draft, steps, pendingItems: [], edge: { ...draft.edge, execution } };

  await expect(repository.save(environmentId, edited)).rejects.toMatchObject({ kind: 'network' });
  await expect(
    createEdgeDraftRepository(baseUrl).save(environmentId, edited),
  ).rejects.toMatchObject({
    status: 401,
  });
  await expect(repository.save(environmentId, edited)).resolves.toMatchObject({
    id: draftId,
    edge: { revision: 1, execution },
    steps,
  });

  const [path, first] = fetch.mock.calls[1];
  const [, last] = fetch.mock.calls[3];
  expect(path).toBe(`${baseUrl}/api/v1/procedures/${draftId}/draft`);
  expect(first?.method).toBe('PATCH');
  const requestId = (first?.headers as Record<string, string>)['Idempotency-Key'];
  expect(JSON.parse(String(first?.body))).toEqual({
    requestId,
    expectedRevision: 0,
    steps,
    pendingItems: [],
    execution,
  });
  expect(last?.headers).toEqual(first?.headers);
  expect(last?.body).toBe(first?.body);
});

test('승인 충돌을 구분하고 최신 revision과 사유를 보내 승인된 ID와 버전을 사용한다', async () => {
  jest.spyOn(edgeApi, 'getEdgeBaseUrl').mockReturnValue(baseUrl);
  const fetch = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(json(serverDraft))
    .mockResolvedValueOnce(json({ error: { code: 'REVISION_CONFLICT' } }, 409))
    .mockResolvedValueOnce(json({ ...serverDraft, revision: 1, pendingItems: [], execution }))
    .mockResolvedValueOnce(
      json(
        {
          approval: 'approved',
          procedureId: draftId,
          version: '2.0.0',
          approvedBy: 'expert-01',
          draftRevision: 1,
        },
        201,
      ),
    );
  const repository = createEdgeDraftRepository(baseUrl, token);
  const stale = await repository.load(environmentId, draftId);
  if (!stale) throw new Error('Missing Edge draft');
  const reason = '거리와 반복 기준을 확인했습니다.';
  const conflict = await approveEdgeProcedureDraft(stale, reason, token).catch(
    (error: unknown) => error,
  );
  expect(conflict).toBeInstanceOf(edgeApi.EdgeApiError);
  expect(isDraftRevisionConflict(conflict)).toBe(true);

  const latest = await repository.load(environmentId, draftId);
  if (!latest) throw new Error('Missing latest Edge draft');
  await expect(approveEdgeProcedureDraft(latest, reason, token)).resolves.toEqual({
    id: draftId,
    version: '2.0.0',
    approvedBy: 'expert-01',
  });
  const [path, request] = fetch.mock.calls[3];
  expect(path).toBe(`${baseUrl}/api/v1/procedures/${draftId}/approve`);
  expect(request?.method).toBe('POST');
  expect(JSON.parse(String(request?.body))).toEqual({
    requestId: (request?.headers as Record<string, string>)['Idempotency-Key'],
    expectedRevision: 1,
    reason,
  });
});
