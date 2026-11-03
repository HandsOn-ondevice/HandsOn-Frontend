import { describe, expect, test } from '@jest/globals';
import { render, waitFor } from '@testing-library/react-native';
import type { ExperimentSession } from '../src/features/researcher-workflow/domain/models';
import { selectDeviceConnection } from '../src/features/researcher-workflow/domain/device-connection';
import { DeviceConnectionCard } from '../src/features/researcher-workflow/screens/DeviceConnectionCard';
import { ExecutionMetrics } from '../src/features/researcher-workflow/screens/ExecutionMetrics';
import { procedureDisplayTitle } from '../src/features/researcher-workflow/screens/procedure-display-title';
import { MockWorkflowRepository } from '../src/features/researcher-workflow/infrastructure/mock/MockWorkflowRepository';
import { mockProcedure } from '../src/features/researcher-workflow/infrastructure/mock/fixtures';
import {
  buildMockDiagnostics,
  type MockDeviceScenario,
} from '../src/features/researcher-workflow/infrastructure/mock/device-check-scenarios';

async function inspected(scenario: MockDeviceScenario = 'normal') {
  const repository = new MockWorkflowRepository({
    inspect: async (input) => buildMockDiagnostics(input),
  });
  let session = await repository.createSession({
    requestId: 'design',
    operatorId: 'researcher',
    procedure: mockProcedure,
  });
  for (const requirement of mockProcedure.preparation.filter((item) => item.owner === 'operator')) {
    session = await repository.executeCommand(
      session.sessionId,
      { type: 'setPreparationCheck', checkId: requirement.id, checked: true },
      { requestId: `design-${session.revision}`, expectedRevision: session.revision },
    );
  }
  session = await repository.executeCommand(
    session.sessionId,
    { type: 'completePreparation' },
    { requestId: 'prepare', expectedRevision: session.revision },
  );
  repository.setDeviceCheckScenario(session.sessionId, scenario);
  await repository.executeCommand(
    session.sessionId,
    { type: 'startDeviceCheck' },
    { requestId: 'inspect', expectedRevision: session.revision },
  );
  await waitFor(async () =>
    expect((await repository.getSession(session.sessionId)).deviceChecks[0].status).not.toBe(
      'checking',
    ),
  );
  return repository.getSession(session.sessionId);
}

/** API adapter가 공급해야 할 계약을 검증하는 테스트 스냅샷. 실제 API 구현이 아니다. */
function apiSnapshot(session: ExperimentSession): ExperimentSession {
  return {
    ...session,
    source: 'api',
    evidence: session.evidence.map((item) => ({ ...item, source: 'api' })),
    deviceChecks: session.deviceChecks.map((attempt) => ({
      ...attempt,
      report: attempt.report && {
        ...attempt.report,
        source: 'api',
        sensors: attempt.report.sensors.map((sensor) => ({
          ...sensor,
          readings: sensor.readings.map((reading) => ({ ...reading, source: 'api' })),
        })),
      },
    })),
  };
}

describe('연결 출처와 확인 상태 표시', () => {
  test('명시적으로 활성화된 Mock의 검증된 연결만 모의 연결 성공으로 표시한다', async () => {
    const session = await inspected();
    const state = selectDeviceConnection(session, true);
    expect(state.status).toBe('mockConnected');
    const screen = await render(<DeviceConnectionCard state={state} deviceName="Orange Pi 5+" />);
    expect(screen.getByText('Mock 기기 연결됨')).toBeTruthy();
    expect(screen.getByText('모의 장치 응답 확인')).toBeTruthy();
    expect(screen.queryByText('Orange Pi 5+ 연결됨')).toBeNull();
    expect(selectDeviceConnection(session, false).status).toBe('failed');
  });

  test.each<[MockDeviceScenario, string, string]>([
    ['disconnected', 'disconnected', '기기 미연결'],
    ['sensorError', 'failed', '장치 연결 실패'],
    ['timeout', 'failed', '장치 연결 실패'],
    ['stale', 'failed', '장치 연결 실패'],
  ])('%s 응답에서 실제/Mock 연결 성공을 만들지 않는다', async (scenario, status, title) => {
    const state = selectDeviceConnection(await inspected(scenario), true);
    expect(state.status).toBe(status);
    const screen = await render(<DeviceConnectionCard state={state} deviceName="Orange Pi 5+" />);
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.queryByText(/연결됨/)).toBeNull();
  });

  test('API 출처와 현재 시도의 유효 연결이 함께 확인된 스냅샷만 실제 연결로 표시한다', async () => {
    const session = apiSnapshot(await inspected());
    const state = selectDeviceConnection(session, false);
    expect(state.status).toBe('apiConnected');
    const screen = await render(
      <DeviceConnectionCard state={state} deviceName={session.procedure.deviceCheck?.title} />,
    );
    expect(screen.getByText('Orange Pi 5+ 연결됨')).toBeTruthy();
    expect(screen.queryByText('Mock 기기 연결됨')).toBeNull();
    expect(screen.queryByText(/Wi-Fi|지연.*ms/)).toBeNull();
  });

  test('API 연결 실패는 측정값이 남아 있어도 Mock 성공으로 대체하지 않는다', async () => {
    const session = apiSnapshot(await inspected());
    const failed: ExperimentSession = {
      ...session,
      deviceChecks: session.deviceChecks.map((attempt) => ({
        ...attempt,
        status: 'failed',
        report: attempt.report && { ...attempt.report, connection: 'error' },
      })),
    };
    expect(failed.deviceChecks[0].report?.sensors[0].readings.length).toBeGreaterThan(0);
    expect(selectDeviceConnection(failed, true).status).toBe('failed');
    const screen = await render(
      <DeviceConnectionCard
        state={selectDeviceConnection(failed, true)}
        deviceName="Orange Pi 5+"
      />,
    );
    expect(screen.queryByText(/연결됨/)).toBeNull();
  });

  test('점검하지 않았거나 진행 중이면 측정값 유무와 관계없이 확인 상태만 표시한다', async () => {
    const session = await inspected();
    expect(selectDeviceConnection({ ...session, deviceChecks: [] }, true).status).toBe(
      'disconnected',
    );
    const state = selectDeviceConnection(
      {
        ...session,
        deviceChecks: session.deviceChecks.map((attempt) => ({ ...attempt, status: 'checking' })),
      },
      true,
    );
    expect(state.status).toBe('checking');
    const screen = await render(<DeviceConnectionCard state={state} />);
    expect(screen.getByText('장치 연결 확인 중')).toBeTruthy();
    expect(screen.queryByText(/연결됨/)).toBeNull();
  });

  test('과거 ID 또는 잘못된 단위의 passed 보고서를 연결 성공 카드로 승격하지 않는다', async () => {
    const session = await inspected();
    for (const invalid of ['attemptId', 'unit']) {
      const changed = JSON.parse(JSON.stringify(session));
      if (invalid === 'attemptId') changed.deviceChecks[0].report.attemptId = 'previous-attempt';
      else changed.deviceChecks[0].report.sensors[0].readings[0].unit = 'wrong-unit';
      expect(selectDeviceConnection(changed, true).status).toBe('failed');
    }
  });
});

describe('완료 상태와 제목 표시', () => {
  test('저장된 유효 측정값이 없으면 완료 상태에서 숫자를 만들어 표시하지 않는다', async () => {
    const screen = await render(<ExecutionMetrics completed />);
    expect(screen.getByText('반복 측정 완료 · 표시할 유효 측정값이 없습니다.')).toBeTruthy();
    expect(screen.getAllByText('—')).toHaveLength(4);
    expect(screen.queryByText('현재 회차 응답 없음')).toBeNull();
  });

  test('LED 화면명을 맞추되 다른 절차의 이름이나 승인 스냅샷은 변경하지 않는다', () => {
    const before = JSON.stringify(mockProcedure);
    expect(procedureDisplayTitle(mockProcedure)).toBe('LED 출력 특성 측정');
    expect(
      procedureDisplayTitle({
        ...mockProcedure,
        procedureId: 'different',
        title: '별도 승인 실험',
      }),
    ).toBe('별도 승인 실험');
    expect(JSON.stringify(mockProcedure)).toBe(before);
  });
});
