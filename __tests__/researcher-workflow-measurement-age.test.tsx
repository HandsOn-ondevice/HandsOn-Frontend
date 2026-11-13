import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import {
  formatMeasurementAge,
  useMeasurementAge,
} from '../src/features/researcher-workflow/screens/useMeasurementAge';

const now = Date.parse('2026-11-04T04:00:00.000Z');

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('S08 실제 관측 시각의 표시 전용 상대 시간', () => {
  test.each([
    [0, '0.0초 전'],
    [6400, '6.4초 전'],
    [60000, '1분 전'],
    [3600000, '1시간 전'],
    [86400000, '1일 전'],
  ])('%i ms 전 관측값을 해당 단위로 표시한다', (elapsed, label) => {
    expect(formatMeasurementAge(new Date(now - elapsed).toISOString(), now)).toBe(label);
  });

  test.each([
    [undefined, '측정 시각 없음'],
    ['', '측정 시각 없음'],
    ['invalid', '측정 시각 확인 불가'],
    ['2026-11-05T04:00:00Z', '측정 시각 확인 불가'],
  ])('누락·오류·미래 시각 %s를 정상 경과 시간으로 생성하지 않는다', (observed, label) => {
    expect(formatMeasurementAge(observed, now)).toBe(label);
  });

  test('화면이 열려 있는 동안 시간이 갱신되고 관측값 변경·이탈 시 타이머가 정리된다', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
    const intervals = jest.spyOn(globalThis, 'setInterval');
    const clear = jest.spyOn(globalThis, 'clearInterval');
    const view = await renderHook(
      ({ time }: { time: string | undefined }) => useMeasurementAge(time),
      {
        initialProps: { time: new Date(now - 6400).toISOString() },
      },
    );
    expect(view.result.current).toBe('6.4초 전');
    const firstTimer = intervals.mock.results.at(-1)!.value;
    await act(async () => jest.advanceTimersByTime(1000));
    expect(view.result.current).toBe('7.4초 전');
    await view.rerender({ time: new Date(now + 1000).toISOString() });
    expect(view.result.current).toBe('0.0초 전');
    expect(clear.mock.calls).toContainEqual([firstTimer]);
    const secondTimer = intervals.mock.results.at(-1)!.value;
    await view.rerender({ time: undefined });
    expect(view.result.current).toBe('측정 시각 없음');
    expect(clear.mock.calls).toContainEqual([secondTimer]);
    await view.rerender({ time: new Date(now).toISOString() });
    const lastTimer = intervals.mock.results.at(-1)!.value;
    await view.unmount();
    expect(clear.mock.calls).toContainEqual([lastTimer]);
  });
});
