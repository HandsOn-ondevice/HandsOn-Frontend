import { afterEach, expect, jest, test } from '@jest/globals';

import { loadEdgeWorkEnvironments } from '@/features/entry/entryEnvironment';
import { createEdgeApi } from '@/lib/edgeApi';

const baseUrl = 'http://192.0.2.10:8080';

afterEach(() => {
  jest.restoreAllMocks();
});

test('같은 Edge에서 조회한 작업 프로필과 연결된 환경의 ID를 구분한다', async () => {
  const environment = {
    id: 'kit-lab',
    name: '실습실',
    workType: '거리 확인',
    deviceName: '키트',
  };
  const profile = {
    ...environment,
    id: 'kit-distance-v1',
    environmentId: environment.id,
    profileVersion: '1.0.0',
    policy: {},
  };
  const request = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ api: 'alive' })))
    .mockResolvedValueOnce(new Response(JSON.stringify([profile])))
    .mockResolvedValueOnce(new Response(JSON.stringify([environment])));

  await expect(
    loadEdgeWorkEnvironments({ baseUrl: `${baseUrl}/`, token: 'test-token' }),
  ).resolves.toEqual([
    { ...environment, workProfile: { id: profile.id, version: profile.profileVersion } },
  ]);
  expect(request).toHaveBeenCalledTimes(3);
  const options = expect.objectContaining({
    method: 'GET',
    credentials: 'omit',
    redirect: 'error',
    headers: { Accept: 'application/json', Authorization: 'Bearer test-token' },
  });
  expect(request).toHaveBeenNthCalledWith(1, `${baseUrl}/api/v1/system/health`, options);
  expect(request).toHaveBeenNthCalledWith(2, `${baseUrl}/api/v1/work-profiles`, options);
  expect(request).toHaveBeenNthCalledWith(3, `${baseUrl}/api/v1/environments`, options);
});

test('HTTP 응답의 상태와 Edge 오류 코드를 연결 실패와 구분한다', async () => {
  const request = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ api: 'alive' })))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), { status: 401 }),
    )
    .mockRejectedValueOnce(new TypeError('Network request failed'));

  await expect(loadEdgeWorkEnvironments({ baseUrl })).rejects.toMatchObject({
    kind: 'server',
    status: 401,
    code: 'UNAUTHORIZED',
  });
  await expect(loadEdgeWorkEnvironments({ baseUrl })).rejects.toMatchObject({ kind: 'network' });
  expect(request).toHaveBeenCalledTimes(3);
});

test('오류 본문이 JSON이 아니어도 HTTP 상태를 보존한다', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Bad Gateway', { status: 502 }));

  await expect(loadEdgeWorkEnvironments({ baseUrl })).rejects.toMatchObject({
    kind: 'server',
    status: 502,
  });
});

test('잘못된 성공 응답을 빈 목록이나 fixture로 대체하지 않는다', async () => {
  jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ api: 'alive' })))
    .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'kit-profile' }])));

  await expect(loadEdgeWorkEnvironments({ baseUrl })).rejects.toMatchObject({
    kind: 'invalid-response',
  });
});

test('요청을 취소하면 공통 연결도 취소된다', async () => {
  const request = jest.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    });
  });
  const controller = new AbortController();
  const result = createEdgeApi({ baseUrl }).get('/system/health', controller.signal);

  controller.abort();

  await expect(result).rejects.toMatchObject({ kind: 'network' });
  expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true);
});

test('잘못된 Base URL에 요청을 보내지 않는다', async () => {
  const request = jest.spyOn(globalThis, 'fetch');

  await expect(loadEdgeWorkEnvironments({ baseUrl: `${baseUrl}/api/v1` })).rejects.toMatchObject({
    kind: 'configuration',
  });
  expect(request).not.toHaveBeenCalled();
});
