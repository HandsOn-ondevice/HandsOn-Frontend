import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import type { ExecutionDefinition } from '../../src/features/researcher-workflow/domain/execution';
import type { ExperimentSession } from '../../src/features/researcher-workflow/domain/models';

export type ExecutionStartProcedure = ExperimentSession['procedure'] & {
  execution: ExecutionDefinition & {
    distanceMinCm: number;
    distanceMaxCm: number;
    lightMinRaw: number;
  };
};

export type ExecutionStartSession = ExperimentSession & {
  procedure: ExecutionStartProcedure;
  actuator?: { state: 'off' | 'on' | 'unknown'; success: boolean; dataOrigin: string };
};

type SimulationConfig = { scenario: string; distanceCm: number; ledFailure: boolean };
type Simulation = SimulationConfig & { enabled: boolean; led: 'off' | 'on' | 'unknown' };
type StartInterpretation = {
  sessionId: string;
  text: string;
  intent: string;
  executed: boolean;
  requiresConfirmation: boolean;
  expectedRevision: number;
  command: { type: string } | null;
};

const api = '/api/v1';
const sessions = `${api}/sessions`;
const simulation = `${api}/simulation`;

async function read<T>(response: APIResponse, label: string): Promise<T> {
  expect(response.status(), label).toBe(200);
  return (await response.json()) as T;
}

export async function createExecutionStartEdge(request: APIRequestContext) {
  const address = process.env.EXPO_PUBLIC_HANDSON_EDGE_BASE_URL;
  const url = address && URL.canParse(address) ? new URL(address) : undefined;
  const operatorToken = process.env.HANDSON_E2E_OPERATOR_TOKEN;
  const expertToken = process.env.HANDSON_E2E_EXPERT_TOKEN;
  if (
    !url ||
    !['http:', 'https:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    !operatorToken ||
    !expertToken
  ) {
    throw new Error('별도 데이터 디렉터리를 사용하는 로컬 Edge 주소와 테스트 토큰이 필요합니다.');
  }

  const origin = url.origin;
  const operator = { Authorization: `Bearer ${operatorToken}` };
  const expert = { Authorization: `Bearer ${expertToken}` };
  const health = await read<{ executionMode: string; dataOrigin: string }>(
    await request.get(`${origin}${api}/system/health`, { maxRedirects: 0 }),
    'GET /system/health',
  );
  expect(health).toMatchObject({ executionMode: 'simulation', dataOrigin: 'simulation' });

  async function getSimulation(): Promise<Simulation> {
    return read(
      await request.get(`${origin}${simulation}`, { headers: expert, maxRedirects: 0 }),
      'GET /simulation',
    );
  }

  async function writeSimulation(config: SimulationConfig) {
    const response = await request.post(`${origin}${simulation}`, {
      headers: expert,
      data: { requestId: randomUUID(), config },
      maxRedirects: 0,
    });
    expect(response.status(), 'POST /simulation').toBe(200);
  }

  async function getSession(sessionId: string): Promise<ExecutionStartSession> {
    return read(
      await request.get(`${origin}${sessions}/${encodeURIComponent(sessionId)}`, {
        headers: operator,
        maxRedirects: 0,
      }),
      'GET /sessions/{sessionId}',
    );
  }

  function command(sessionId: string, expectedRevision: number, type: 'startExecution' | 'cancel') {
    const requestId = randomUUID();
    return request.post(`${origin}${sessions}/${encodeURIComponent(sessionId)}/commands`, {
      headers: { ...operator, 'Idempotency-Key': requestId },
      data: { requestId, expectedRevision, command: { type } },
      maxRedirects: 0,
    });
  }

  const original = await getSimulation();
  expect(original).toMatchObject({ enabled: true, led: 'off' });
  const existing = await read<ExecutionStartSession[]>(
    await request.get(`${origin}${sessions}`, { headers: operator, maxRedirects: 0 }),
    'GET /sessions',
  );
  expect(
    existing.every(({ phase }) => phase === 'completed' || phase === 'cancelled'),
    '다른 실행의 입력이 바뀌지 않도록 진행 중인 세션이 없는 Edge가 필요합니다.',
  ).toBe(true);

  return {
    origin,
    operatorToken,
    getSimulation,
    getSession,
    async getProcedure(): Promise<ExecutionStartProcedure> {
      const procedures = await read<ExecutionStartProcedure[]>(
        await request.get(`${origin}${api}/procedures?environmentId=kit-lab`, {
          headers: operator,
          maxRedirects: 0,
        }),
        'GET /procedures?environmentId=kit-lab',
      );
      const procedure = procedures.find(({ procedureId }) => procedureId === 'kit-distance');
      if (!procedure) throw new Error('Edge에 지급 키트의 승인 절차가 없습니다.');
      return procedure;
    },
    configure(config: SimulationConfig & { scenario: 'normal' | 'disconnected' }) {
      return writeSimulation(config);
    },
    restoreSimulation() {
      const { scenario, distanceCm, ledFailure } = original;
      return writeSimulation({ scenario, distanceCm, ledFailure });
    },
    requestStart(sessionId: string, revision: number) {
      return command(sessionId, revision, 'startExecution');
    },
    async interpretStart(sessionId: string): Promise<StartInterpretation> {
      return read(
        await request.post(
          `${origin}${sessions}/${encodeURIComponent(sessionId)}/voice/interpret`,
          {
            headers: operator,
            data: { text: '작업 시작해' },
            maxRedirects: 0,
          },
        ),
        'POST /sessions/{sessionId}/voice/interpret',
      );
    },
    async cancelSession(sessionId: string) {
      const { phase, revision } = await getSession(sessionId);
      if (phase === 'cancelled' || phase === 'completed') return;
      const response = await command(sessionId, revision, 'cancel');
      expect(response.status(), 'POST /sessions/{sessionId}/commands (cancel)').toBe(200);
    },
  };
}
