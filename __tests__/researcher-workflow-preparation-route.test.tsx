import { expect, jest, test } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import PreparationRoute from '../src/app/researcher-workflow/[sessionId]/preparation';
import { MockWorkflowRepository } from '../src/features/researcher-workflow/infrastructure/mock/MockWorkflowRepository';
import { WorkflowProvider } from '../src/features/researcher-workflow/state/WorkflowProvider';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ sessionId: 'demo-session-led-m03' }),
  router: {
    canGoBack: jest.fn(() => false),
    back: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
    dismissTo: jest.fn(),
  },
}));

test('S01의 ID를 그대로 조회하고 세션이 없으면 명시적으로 연구생 홈으로 돌아간다', async () => {
  const repository = new MockWorkflowRepository();
  const getSession = jest.spyOn(repository, 'getSession');
  const createSession = jest.spyOn(repository, 'createSession');
  const screen = await render(
    <WorkflowProvider repository={repository}>
      <PreparationRoute />
    </WorkflowProvider>,
  );

  await screen.findByText('실험 세션을 찾을 수 없습니다');
  expect(getSession).toHaveBeenCalledWith('demo-session-led-m03');
  await fireEvent.press(screen.getByRole('button', { name: '연구생 홈으로' }));
  expect(router.dismissTo).toHaveBeenCalledTimes(1);
  expect(router.dismissTo).toHaveBeenCalledWith('/student');
  expect(router.push).not.toHaveBeenCalled();
  expect(createSession).not.toHaveBeenCalled();
});
