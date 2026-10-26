import { describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import {
  Button,
  CheckboxRow,
  SegmentedControl,
  SelectField,
  TextField,
} from '../src/design-system/components/controls';

describe('입력 컴포넌트의 제어 계약', () => {
  test('활성 버튼은 콜백을 한 번 실행한다', async () => {
    const onPress = jest.fn();
    const screen = await render(<Button label="완료 요청" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: '완료 요청' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  test.each([{ disabled: true }, { loading: true }])(
    '실행할 수 없는 버튼은 콜백을 차단한다: %p',
    async (props) => {
      const onPress = jest.fn();
      const screen = await render(<Button label="완료 요청" onPress={onPress} {...props} />);
      const button = screen.getByRole('button', { name: '완료 요청' });
      expect(button).toBeDisabled();
      await fireEvent.press(button);
      expect(onPress).not.toHaveBeenCalled();
    },
  );
  test('TextField는 편집값을 부모에게 전달하고 disabled에서는 차단한다', async () => {
    const onChange = jest.fn();
    const screen = await render(<TextField label="절차 이름" value="LED" onChange={onChange} />);
    await fireEvent.changeText(screen.getByLabelText('절차 이름'), '센서 점검');
    expect(onChange).toHaveBeenCalledWith('센서 점검');
    await screen.rerender(<TextField label="절차 이름" value="LED" onChange={onChange} disabled />);
    onChange.mockClear();
    await fireEvent.changeText(screen.getByLabelText('절차 이름'), '실행 안 됨');
    expect(onChange).not.toHaveBeenCalled();
  });
  test('CheckboxRow는 현재 checked 값의 반대값을 전달한다', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <CheckboxRow title="전원 차단 확인" checked={false} onChange={onChange} />,
    );
    await fireEvent.press(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
  test('SegmentedControl은 항목의 표시명이 아닌 value를 전달한다', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <SegmentedControl
        options={[
          { label: '전체', value: 'all' },
          { label: 'LED', value: 'led' },
        ]}
        value="all"
        onChange={onChange}
      />,
    );
    await fireEvent.press(screen.getByText('LED'));
    expect(onChange).toHaveBeenCalledWith('led');
  });
  test('SelectField에서 선택하면 value 콜백을 전달하고 선택창을 닫는다', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <SelectField
        label="연구실"
        value="all"
        onChange={onChange}
        options={[
          { label: '전체', value: 'all' },
          { label: 'LED', value: 'led' },
        ]}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: '연구실: 전체' }));
    await fireEvent.press(screen.getByText('LED'));
    expect(onChange).toHaveBeenCalledWith('led');
    expect(screen.queryByText('LED')).toBeNull();
  });
});
