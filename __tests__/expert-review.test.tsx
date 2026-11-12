import { expect, jest, test } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';

import { ExpertReviewScreen } from '../src/features/expert-review/ExpertReviewScreen';
import type {
  ExpertReviewRepository,
  ReviewOutcome,
  ReviewResult,
} from '../src/features/expert-review/reviewData';

const environmentId = 'lab-a';
const result: ReviewResult = {
  id: 'result-93',
  procedureId: 'procedure-17',
  procedureTitle: 'LED 출력 특성 측정',
  sessionId: 'session-43',
  approvedVersion: 'v1.2',
  studentName: '노준혁',
  deviceName: 'LED-M03',
  submittedLabel: '10분 전 제출',
  status: 'pending',
  comment: '',
  validCount: 1,
  totalCount: 3,
  unresolvedCount: 0,
  remeasurementCount: 0,
  unit: 'lx',
  conditions: [
    { id: '50', label: '50%', value: 419, validCount: 1, totalCount: 3, invalidCount: 0 },
  ],
};

function renderReview(repository: Partial<ExpertReviewRepository>) {
  return render(
    <ExpertReviewScreen
      environmentId={environmentId}
      resultId={result.id}
      procedureId={result.procedureId}
      onBack={jest.fn()}
      onOpenEvidence={jest.fn()}
      repository={{
        loadResult: jest.fn<ExpertReviewRepository['loadResult']>().mockResolvedValue(result),
        loadEvidence: jest.fn<ExpertReviewRepository['loadEvidence']>(),
        submitReview: jest.fn<ExpertReviewRepository['submitReview']>(),
        ...repository,
      }}
    />,
  );
}

test('결과 조회가 실패하면 재시도하고 같은 제출 건을 표시한다', async () => {
  const loadResult = jest
    .fn<ExpertReviewRepository['loadResult']>()
    .mockRejectedValueOnce(new Error('조회 실패'))
    .mockResolvedValueOnce(result);
  const screen = await renderReview({ loadResult });

  expect(screen.getByText('결과를 불러오지 못했어요.')).toBeVisible();
  expect(screen.queryByLabelText('검토 의견')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));

  expect(loadResult.mock.calls).toEqual([
    [environmentId, result.id, result.procedureId],
    [environmentId, result.id, result.procedureId],
  ]);
  expect(screen.getByText('노준혁 · LED-M03 · v1.2')).toBeVisible();
  expect(screen.getByLabelText('검토 의견')).toBeEnabled();
});

test('저장 실패 후 기존 의견과 선택으로 다시 요청하고 응답을 받은 뒤에만 성공을 표시한다', async () => {
  const first = Promise.withResolvers<ReviewOutcome>();
  const retry = Promise.withResolvers<ReviewOutcome>();
  const outcome: ReviewOutcome = {
    status: 'remeasurementRequested',
    comment: '센서 케이블을 확인하고 다시 측정해 주세요.',
  };
  const submitReview = jest
    .fn<ExpertReviewRepository['submitReview']>()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(retry.promise);
  const screen = await renderReview({ submitReview });
  const saved = '재측정 요청을 기록했습니다';
  const remeasure = () => screen.getByRole('button', { name: '재측정 요청' });
  const complete = () => screen.getByRole('button', { name: '검토 완료' });

  await fireEvent.changeText(screen.getByLabelText('검토 의견'), outcome.comment);
  await fireEvent.press(remeasure());
  expect(remeasure()).toBeDisabled();
  expect(complete()).toBeDisabled();
  await fireEvent.press(complete());
  expect(submitReview).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(saved)).toBeNull();

  await act(async () => first.reject(new Error('저장 실패')));
  expect(screen.getByText('검토 결과를 저장하지 못했어요.')).toBeVisible();
  expect(screen.getByDisplayValue(outcome.comment)).toBeEnabled();
  await fireEvent.press(screen.getByRole('button', { name: '저장 다시 시도' }));
  expect(submitReview.mock.calls).toEqual([
    [environmentId, result.id, outcome],
    [environmentId, result.id, outcome],
  ]);
  expect(screen.queryByText(saved)).toBeNull();

  await act(async () => retry.resolve(outcome));
  expect(screen.getByText(saved)).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: '검토 화면으로 돌아가기' }));
  expect(screen.getByText(outcome.comment)).toBeVisible();
  expect(screen.queryByRole('button', { name: '검토 완료' })).toBeNull();
});
