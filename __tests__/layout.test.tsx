import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { useState } from 'react';
import { BackHandler } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

import { ActionShelf, BottomNavigation, BottomSheet } from '../src/design-system/components/layout';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('레이아웃 컴포넌트의 제어 계약', () => {
  test('BottomNavigation은 선택값을 유지하고 변경을 부모에게 알린다', async () => {
    const onChange = jest.fn();
    const screen = await render(<BottomNavigation active="home" onChange={onChange} />);
    expect(screen.getByRole('tab', { name: '홈' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    await fireEvent.press(screen.getByRole('tab', { name: '실험' }));
    expect(onChange).toHaveBeenCalledWith('work');
    expect(screen.getByRole('tab', { name: '홈' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    await screen.rerender(<BottomNavigation active="work" onChange={onChange} />);
    expect(screen.getByRole('tab', { name: '실험' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
  });

  test('숙련자 탐색은 역할에 맞는 라벨과 공통 선택값을 제공한다', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <BottomNavigation role="expert" active="work" onChange={onChange} />,
    );
    expect(screen.getByRole('tab', { name: '절차' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    await fireEvent.press(screen.getByRole('tab', { name: '내 정보' }));
    expect(onChange).toHaveBeenCalledWith('history');
  });

  test('ActionShelf는 비활성 주요 동작을 차단하고 보조 동작은 허용한다', async () => {
    const onPrimary = jest.fn();
    const onSecondary = jest.fn();
    const screen = await render(
      <ActionShelf
        primary="승인·배포"
        secondary="미리보기"
        layout="dualDisabled"
        onPrimary={onPrimary}
        onSecondary={onSecondary}
      />,
    );
    const primary = screen.getByRole('button', { name: '승인·배포' });
    expect(primary).toBeDisabled();
    await fireEvent.press(primary);
    await fireEvent.press(screen.getByRole('button', { name: '미리보기' }));
    expect(onPrimary).not.toHaveBeenCalled();
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  test('BottomSheet는 초기 닫힘에서 열고 닫은 뒤 다시 열 수 있다', async () => {
    const onClose = jest.fn();
    const screen = await render(<BottomSheet open={false} onClose={onClose} title="명령 확인" />);
    expect(screen.queryByText('명령 확인')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await screen.rerender(<BottomSheet open onClose={onClose} title="명령 확인" />);
    expect(screen.getByText('명령 확인')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '하단 시트 닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('명령 확인')).toBeNull();
    await screen.rerender(<BottomSheet open={false} onClose={onClose} title="명령 확인" />);
    expect(onClose).toHaveBeenCalledTimes(1);
    await screen.rerender(<BottomSheet open onClose={onClose} title="명령 확인" />);
    expect(screen.getByText('명령 확인')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '하단 시트 닫기' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('명령 확인')).toBeNull();
  });

  test('열린 BottomSheet는 Android 뒤로가기를 소비하고 종료 후 구독을 정리한다', async () => {
    let handleBack: Parameters<typeof BackHandler.addEventListener>[1] | undefined;
    const remove = jest.fn();
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_name, handler) => {
      handleBack = handler;
      return { remove };
    });
    const onClose = jest.fn();
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <BottomSheet
          open={open}
          title="센서 상태"
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        />
      );
    }
    const screen = await render(<Harness />);
    expect(handleBack).toBeDefined();
    let handled: boolean | undefined;
    await act(() => {
      handled = handleBack?.({ type: 'hardwareBackPress', timeStamp: 0 });
    });
    expect(handled).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('센서 상태')).toBeNull();
    expect(remove).toHaveBeenCalled();
  });
});
