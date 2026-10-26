import { describe, expect, test } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import {
  EvidenceRow,
  ResultChart,
  SensorCard,
  StepProgress,
  TimelineItem,
  type EvidenceKind,
  type SensorState,
  type TimelineState,
} from '../src/design-system/components/data';

describe('근거와 측정값 표시 계약', () => {
  test.each<[EvidenceKind, string]>([
    ['human', '작업자 확인'],
    ['sensor', '센서 근거'],
    ['program', '프로그램 계산'],
  ])('%s 근거의 출처를 접근성 이름으로 구별한다', async (kind, label) => {
    await render(<EvidenceRow title="거리 확인" kind={kind} state="confirmed" />);

    expect(screen.getByLabelText(`${label}, 거리 확인, 확인`)).toBeOnTheScreen();
  });

  test('연결이 끊겼을 때 이전 숫자를 현재 측정값으로 표시하지 않는다', async () => {
    await render(<SensorCard title="BH1750" state="disconnected" value="420 lx" meta="미응답" />);

    expect(screen.getByText('연결 확인 불가')).toBeOnTheScreen();
    expect(screen.queryByText('420 lx')).not.toBeOnTheScreen();
    expect(screen.getByLabelText(/BH1750, 연결 끊김/)).toBeOnTheScreen();
  });

  test.each<[SensorState, string]>([
    ['normal', '정상'],
    ['stale', '오래된 값'],
    ['disconnected', '연결 끊김'],
    ['outOfRange', '범위 초과'],
  ])('%s 센서 상태를 외부 설명과 별개로 화면에 표시한다', async (state, label) => {
    await render(
      <SensorCard
        title="BH1750"
        state={state}
        value="420 lx"
        meta="0.5초 전"
        detail="외부에서 전달한 설명"
      />,
    );

    expect(screen.getByText(`${label} · 0.5초 전`)).toBeOnTheScreen();
    expect(screen.getByText('외부에서 전달한 설명')).toBeOnTheScreen();
  });

  test.each<[TimelineState, string]>([
    ['valid', '유효'],
    ['invalid', '무효'],
    ['recovery', '복구'],
    ['pending', '대기'],
  ])('%s 이력 상태를 색상 외의 보이는 문구로 구별한다', async (state, label) => {
    await render(<TimelineItem title="측정 이력" subtitle="외부에서 전달한 설명" state={state} />);

    expect(screen.getByText(label)).toBeOnTheScreen();
  });

  test('완료 표시만으로 전달된 진행률을 100으로 바꾸지 않는다', async () => {
    await render(<StepProgress title="검토 단계" value={64} state="complete" />);

    expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({ min: 0, max: 100, now: 64 });
    expect(screen.getByText('64%')).toBeOnTheScreen();
    expect(screen.queryByText('100%')).not.toBeOnTheScreen();
  });

  test('차트의 실제 0과 측정값 누락을 구별한다', async () => {
    await render(
      <ResultChart
        title="조건별 조도"
        unit="lx"
        items={[
          { label: '0%', value: 0 },
          { label: '25%', value: null },
        ]}
      />,
    );

    expect(screen.getByLabelText('0%, 0 lx')).toBeOnTheScreen();
    expect(screen.getByLabelText('25%, 측정값 없음')).toBeOnTheScreen();
    expect(screen.queryByText('표시할 측정값이 없습니다.')).not.toBeOnTheScreen();
  });

  test('유효한 측정값이 없으면 빈 상태를 명시한다', async () => {
    await render(
      <ResultChart
        title="조건별 조도"
        items={[
          { label: '0%', value: null },
          { label: '25%', value: null },
        ]}
      />,
    );

    expect(screen.getByText('표시할 측정값이 없습니다.')).toBeOnTheScreen();
  });

  test('전달된 값만 제공하고 측정 평균값을 새로 만들지 않는다', async () => {
    await render(
      <ResultChart
        title="가상의 합성 데이터"
        unit="lx"
        state="reviewed"
        items={[
          { label: '조건 A', value: 10.5 },
          { label: '조건 B', value: 20 },
        ]}
      />,
    );

    expect(screen.getByLabelText('조건 A, 10.5 lx')).toBeOnTheScreen();
    expect(screen.getByLabelText('조건 B, 20 lx')).toBeOnTheScreen();
    expect(screen.getByText('검토 완료')).toBeOnTheScreen();
    expect(screen.queryByText('증가 추세')).not.toBeOnTheScreen();
  });
});
