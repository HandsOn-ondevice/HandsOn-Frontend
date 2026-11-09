import type { CreateSessionInput, WorkflowRepository } from '../../application/WorkflowRepository';
import { createRequestId } from '../../application/request-id';
import {
  WorkflowError,
  type CommandContext,
  type ExperimentSession,
  type WorkflowCommand,
} from '../../domain/models';
import { transitionPreparation } from './transition-engine';
import {
  beginDeviceCheck,
  finishDeviceCheck,
  startMockExecution,
} from './device-check-transitions';
import {
  runMockDiagnostics,
  mockDeviceScenarios,
  type MockDeviceScenario,
  type MockDiagnosticsRunner,
} from './device-check-scenarios';
import { beginRecovery } from './recovery-transitions';
import { beginRecoveryRemeasurement } from './remeasurement-transitions';
import { selectExecution } from '../../domain/execution';
import { resolveVoiceClarification } from './voice-clarification-transitions';
import {
  beginExecutionSample,
  finishExecutionSample,
  completeExecutionStep,
  requestVoiceClarification,
  dismissVoiceClarification,
} from './execution-transitions';
import {
  runMockExecutionSample,
  mockExecutionScenarios,
  type MockExecutionScenario,
  type MockExecutionRunner,
} from './execution-scenarios';

export interface MockDependencies {
  readonly now?: () => string;
  readonly id?: () => string;
  readonly inspect?: MockDiagnosticsRunner;
  readonly sample?: MockExecutionRunner;
}

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class MockWorkflowRepository implements WorkflowRepository {
  private readonly sessions = new Map<string, ExperimentSession>();
  private readonly creationRequests = new Map<string, { signature: string; sessionId: string }>();
  private readonly commandRequests = new Map<string, Map<string, string>>();
  private readonly listeners = new Map<string, Set<(session: ExperimentSession) => void>>();
  private readonly now: () => string;
  private readonly id: () => string;
  private readonly inspect: MockDiagnosticsRunner;
  private readonly scenarios = new Map<string, MockDeviceScenario>();
  private readonly sample: MockExecutionRunner;
  private readonly executionScenarios = new Map<string, MockExecutionScenario>();
  private readonly initialStaleReadings = new Map<string, string>();

  constructor(dependencies: MockDependencies = {}) {
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.id = dependencies.id ?? createRequestId;
    this.inspect = dependencies.inspect ?? runMockDiagnostics;
    this.sample = dependencies.sample ?? runMockExecutionSample;
  }

  async createSession(input: CreateSessionInput): Promise<ExperimentSession> {
    this.assertDevelopmentEnvironment();
    const signature = JSON.stringify([input.operatorId, input.procedure]);
    const previous = this.creationRequests.get(input.requestId);
    if (previous) {
      if (previous.signature !== signature)
        throw new WorkflowError('REQUEST_CONFLICT', '이미 사용한 요청 ID입니다.');
      return this.getSession(previous.sessionId);
    }
    const requirements = input.procedure.preparation;
    if (
      input.procedure.approval !== 'approved' ||
      !input.procedure.version ||
      requirements.length !== 6 ||
      new Set(requirements.map((item) => item.id)).size !== 6 ||
      requirements.filter((item) => item.requiredForDeviceCheck).length !== 5 ||
      requirements.some(
        (item) =>
          item.requiredForDeviceCheck && (item.owner !== 'operator' || item.verifiedAt !== 'S04'),
      ) ||
      !requirements.some(
        (item) =>
          item.id === 'communication' &&
          item.owner === 'system' &&
          item.verifiedAt === 'S05' &&
          !item.requiredForDeviceCheck,
      )
    ) {
      throw new WorkflowError(
        'INVALID_PROCEDURE',
        '작업자 준비 확인 5개와 통신 점검을 가진 승인 절차가 필요합니다.',
      );
    }
    const now = this.now();
    const session: ExperimentSession = {
      sessionId: `mock-session-${this.id()}`,
      operatorId: input.operatorId,
      source: 'mock',
      procedure: copy(input.procedure),
      phase: 'preparing',
      revision: 0,
      createdAt: now,
      updatedAt: now,
      checks: requirements.map((item) => ({
        id: item.id,
        checked: false,
        confirmedAt: null,
        evidenceId: null,
      })),
      evidence: [],
      deviceChecks: [],
      events: [
        { eventId: this.id(), requestId: input.requestId, type: 'sessionCreated', occurredAt: now },
      ],
    };
    this.sessions.set(session.sessionId, session);
    const createdAt = Date.parse(now);
    if (Number.isFinite(createdAt)) {
      // 새 세션의 합성 이전 샘플. 1ms는 시각 순서 구분용이며 최신성 임계값이 아니다.
      this.initialStaleReadings.set(session.sessionId, new Date(createdAt - 1).toISOString());
    }
    this.creationRequests.set(input.requestId, { signature, sessionId: session.sessionId });
    return copy(session);
  }

  async getSession(sessionId: string): Promise<ExperimentSession> {
    this.assertDevelopmentEnvironment();
    const session = this.sessions.get(sessionId);
    if (!session)
      throw new WorkflowError(
        'NOT_FOUND',
        '실험 기록을 찾을 수 없습니다. 새 실험을 시작해 주세요.',
      );
    return copy(session);
  }

  async executeCommand(sessionId: string, command: WorkflowCommand, context: CommandContext) {
    this.assertDevelopmentEnvironment();
    // 한 JS 작업 안에서 조회·전환·저장한다. 같은 revision의 동시 명령은 하나만 적용된다.
    const session = this.sessions.get(sessionId);
    if (!session) throw new WorkflowError('NOT_FOUND', '세션을 찾을 수 없습니다.');
    const requests = this.commandRequests.get(sessionId) ?? new Map<string, string>();
    const signature = JSON.stringify(command);
    const previous = requests.get(context.requestId);
    if (previous !== undefined) {
      if (previous !== signature)
        throw new WorkflowError('REQUEST_CONFLICT', '요청 ID를 다른 동작에 재사용할 수 없습니다.');
      return copy(session);
    }
    if (context.expectedRevision !== session.revision) {
      throw new WorkflowError(
        'REVISION_CONFLICT',
        '세션이 변경되었습니다. 새로 확인한 뒤 다시 시도해 주세요.',
      );
    }
    const metadata = {
      requestId: context.requestId,
      now: this.now(),
      eventId: this.id(),
      evidenceId: this.id(),
    };
    const attemptId = command.type === 'startDeviceCheck' ? this.id() : undefined;
    const sampleId =
      command.type === 'requestExecutionSample' ||
      command.type === 'requestRecovery' ||
      command.type === 'requestRecoveryRemeasurement' ||
      (command.type === 'resolveVoiceClarification' && command.choice === 'remeasure')
        ? this.id()
        : undefined;
    const next =
      command.type === 'startDeviceCheck'
        ? beginDeviceCheck(session, attemptId!, metadata)
        : command.type === 'startExecution'
          ? startMockExecution(session, metadata)
          : command.type === 'requestRecovery'
            ? beginRecovery(session, command, sampleId!, metadata)
            : command.type === 'requestRecoveryRemeasurement'
              ? beginRecoveryRemeasurement(session, command, sampleId!, metadata)
              : command.type === 'requestExecutionSample'
                ? beginExecutionSample(session, command.cursorId, sampleId!, metadata)
                : command.type === 'completeExecutionStep'
                  ? completeExecutionStep(
                      session,
                      command.cursorId,
                      command.sampleAttemptId,
                      this.id(),
                      metadata,
                    )
                  : command.type === 'requestVoiceClarification'
                    ? requestVoiceClarification(
                        session,
                        command.cursorId,
                        command.utterance,
                        this.id(),
                        metadata,
                      )
                    : command.type === 'dismissVoiceClarification'
                      ? dismissVoiceClarification(session, command.commandId, metadata)
                      : command.type === 'resolveVoiceClarification'
                        ? resolveVoiceClarification(
                            session,
                            command.commandId,
                            command.choice,
                            sampleId,
                            metadata,
                          )
                        : transitionPreparation(session, command, metadata);
    // 의미 확인과 재측정 요청을 원자적으로 저장한다. 중복 확인은 새 요청을 만들지 않는다.
    const resolved =
      sampleId && command.type === 'resolveVoiceClarification' && next !== session
        ? beginExecutionSample(next, next.execution!.cursor!.cursorId, sampleId, {
            ...metadata,
            eventId: this.id(),
            evidenceId: this.id(),
          })
        : next;
    requests.set(context.requestId, signature);
    this.commandRequests.set(sessionId, requests);
    this.sessions.set(sessionId, resolved);
    if (resolved !== session) this.publish(resolved);
    if (attemptId) this.scheduleInspection(resolved, attemptId, context.requestId);
    if (sampleId && resolved !== session)
      this.scheduleExecutionSample(resolved, sampleId, context.requestId);
    return copy(resolved);
  }

  /** Mock 제어는 정식 Repository 명령·API 입력과 분리한다. 실행 중인 시나리오는 바꿀 수 없다. */
  getDeviceCheckScenario(sessionId: string): MockDeviceScenario {
    return this.scenarios.get(sessionId) ?? 'normal';
  }

  getExecutionScenario(sessionId: string): MockExecutionScenario {
    return this.executionScenarios.get(sessionId) ?? 'normal';
  }

  setExecutionScenario(sessionId: string, scenario: MockExecutionScenario) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new WorkflowError('NOT_FOUND', '세션을 찾을 수 없습니다.');
    const state = selectExecution(session);
    if (
      !state.authorized ||
      state.sampling ||
      state.pendingVoice ||
      state.completed ||
      !mockExecutionScenarios.some((item) => item.value === scenario)
    ) {
      throw new WorkflowError(
        'INVALID_STATE',
        '현재 상태에서 측정 응답 조건를 변경할 수 없습니다.',
      );
    }
    this.executionScenarios.set(sessionId, scenario);
  }

  private scheduleExecutionSample(
    session: ExperimentSession,
    attemptId: string,
    requestId: string,
  ) {
    const definition = copy(session.procedure.deviceCheck!);
    const executionDefinition = copy(session.procedure.execution!);
    const cursor = copy(session.execution!.cursor!);
    const scenario = this.getExecutionScenario(session.sessionId);
    void Promise.resolve()
      .then(() =>
        this.sample({
          definition,
          executionDefinition,
          cursor,
          scenario,
          sampleAttemptId: attemptId,
          initialStaleObservedAt: this.initialStaleReadings.get(session.sessionId),
          now: this.now,
        }),
      )
      .catch(() => ({
        attemptId,
        cursorId: cursor.cursorId,
        source: 'mock' as const,
        stability: 'stable' as const,
        diagnostics: {
          source: 'mock' as const,
          deviceId: definition.deviceId,
          connection: 'error' as const,
          checkedAt: this.now(),
          sensors: [],
          issue: {
            code: 'MOCK_SAMPLE_ERROR',
            message: '측정 응답을 처리하지 못했습니다. 현재 회차를 유지합니다.',
          },
        },
      }))
      .then((report) => {
        const current = this.sessions.get(session.sessionId);
        if (!current) return;
        const next = finishExecutionSample(current, attemptId, copy(report), {
          requestId,
          now: this.now(),
          eventId: this.id(),
          evidenceId: this.id(),
        });
        if (next !== current) {
          this.sessions.set(next.sessionId, next);
          this.publish(next);
        }
      });
  }

  setDeviceCheckScenario(sessionId: string, scenario: MockDeviceScenario) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new WorkflowError('NOT_FOUND', '세션을 찾을 수 없습니다.');
    if (session.deviceChecks.at(-1)?.status === 'checking' || session.phase === 'running') {
      throw new WorkflowError(
        'INVALID_STATE',
        '점검 진행 중이거나 실험 시작 뒤에는 응답 조건을 변경할 수 없습니다.',
      );
    }
    if (!mockDeviceScenarios.some((item) => item.value === scenario))
      throw new WorkflowError('INVALID_STATE', '지원하지 않는 응답 조건입니다.');
    this.scenarios.set(sessionId, scenario);
  }

  private publish(session: ExperimentSession) {
    this.listeners.get(session.sessionId)?.forEach((listener) => {
      // 관찰자 오류로 저장된 명령이 실패하거나 다른 구독 갱신이 중단되지 않게 한다.
      try {
        listener(copy(session));
      } catch {
        /* 구독자는 자체 오류 경계를 사용한다. */
      }
    });
  }

  private scheduleInspection(session: ExperimentSession, attemptId: string, requestId: string) {
    const definition = copy(session.procedure.deviceCheck!);
    const scenario = this.getDeviceCheckScenario(session.sessionId);
    // 화면을 벗어나도 Repository가 작업을 소유한다. 완료 응답은 현재 revision 위에 원자적으로 저장한다.
    void Promise.resolve()
      .then(() => this.inspect({ definition, scenario, attemptId, now: this.now }))
      .catch(() => ({
        attemptId,
        source: 'mock' as const,
        deviceId: definition.deviceId,
        connection: 'error' as const,
        checkedAt: this.now(),
        sensors: [],
        issue: {
          code: 'MOCK_DIAGNOSTICS_ERROR',
          message: '점검 응답을 처리하지 못했습니다. 다시 점검해 주세요.',
        },
      }))
      .then((report) => {
        const current = this.sessions.get(session.sessionId);
        if (!current) return;
        const next = finishDeviceCheck(current, attemptId, copy(report), {
          requestId,
          now: this.now(),
          eventId: this.id(),
          evidenceId: this.id(),
        });
        if (next !== current) {
          this.sessions.set(next.sessionId, next);
          this.publish(next);
        }
      });
  }

  subscribe(sessionId: string, listener: (session: ExperimentSession) => void) {
    this.assertDevelopmentEnvironment();
    const listeners = this.listeners.get(sessionId) ?? new Set();
    listeners.add(listener);
    this.listeners.set(sessionId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(sessionId);
    };
  }

  private assertDevelopmentEnvironment() {
    if (!__DEV__)
      throw new WorkflowError(
        'INVALID_STATE',
        '장치 서비스가 준비되지 않아 실험을 진행할 수 없습니다.',
      );
  }
}
