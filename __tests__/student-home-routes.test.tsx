import { expect, test } from '@jest/globals';

import { getStudentHomeDestination } from '../src/features/student-home/studentHomeRoutes';

test('이어하기는 기존 세션 식별자만 전달하고 세션 설정을 새로 만들지 않는다', () => {
  const sessionId = 'session/기존 작업?version=1#저장';

  expect(getStudentHomeDestination({ type: 'resume', sessionId })).toEqual({
    pathname: '/researcher-workflow/[sessionId]/preparation',
    params: { sessionId },
  });
});

test('새 작업 선택과 최근 결과는 선택한 환경 또는 원본 식별자를 전달한다', () => {
  expect(
    getStudentHomeDestination({ type: 'procedures', environmentId: 'selected-environment' }),
  ).toEqual({
    pathname: '/procedures',
    params: { environmentId: 'selected-environment' },
  });
  expect(
    getStudentHomeDestination({ type: 'result', resultId: 'result-2', sessionId: 'session-1' }),
  ).toEqual({
    pathname: '/results/[resultId]',
    params: { resultId: 'result-2', sessionId: 'session-1' },
  });
});

test('하단 탐색에서 이력과 장치 경로로 이동한다', () => {
  expect(getStudentHomeDestination({ type: 'history' })).toEqual({ pathname: '/history' });
  expect(getStudentHomeDestination({ type: 'devices' })).toEqual({ pathname: '/devices' });
});
