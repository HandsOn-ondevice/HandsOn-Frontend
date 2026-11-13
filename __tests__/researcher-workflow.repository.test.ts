import { describe, expect, test } from '@jest/globals';
import type {
  ExperimentSession,
  WorkflowCommand,
} from '../src/features/researcher-workflow/domain/models';
import { selectPreparation } from '../src/features/researcher-workflow/domain/preparation';
import { MockWorkflowRepository } from '../src/features/researcher-workflow/infrastructure/mock/MockWorkflowRepository';
import { mockProcedure } from '../src/features/researcher-workflow/infrastructure/mock/fixtures';
import { loadWorkEnvironments } from '../src/features/entry/entryEnvironment';
import { loadStudentHome } from '../src/features/student-home/studentHomeData';

function repository() {
  let id = 0;
  return new MockWorkflowRepository({
    now: () => '2026-11-02T00:42:00.000Z',
    id: () => String(++id),
  });
}
const input = { requestId: 'create', operatorId: 'researcher', procedure: mockProcedure };
const send = (
  repo: MockWorkflowRepository,
  session: ExperimentSession,
  command: WorkflowCommand,
  requestId = `r-${session.revision}`,
) =>
  repo.executeCommand(session.sessionId, command, {
    requestId,
    expectedRevision: session.revision,
  });

async function confirmOperatorChecks(repo: MockWorkflowRepository) {
  let session = await repo.createSession(input);
  for (const item of session.procedure.preparation.filter((item) => item.owner === 'operator')) {
    session = await send(repo, session, {
      type: 'setPreparationCheck',
      checkId: item.id,
      checked: true,
    });
  }
  return session;
}

describe('S04 Mock Repository 계약', () => {
  test('S01의 기존 ID는 생성 요청 없이 조회되며 절차 버전·장치·저장 시각이 홈 예시와 일치한다', async () => {
    const [environment] = await loadWorkEnvironments();
    const home = await loadStudentHome(environment);
    const ongoing = home.ongoingSession!;
    const repo = repository();
    const session = await repo.getSession(ongoing.id);

    expect(session.sessionId).toBe('demo-session-led-m03');
    expect(session.source).toBe('mock');
    expect(session.procedure.title).toBe(ongoing.title.replace('\n', ' '));
    expect(`v${session.procedure.version}`).toBe(ongoing.procedureVersion);
    expect(session.procedure.deviceId).toBe('LED-M03');
    expect(session.procedure.deviceCheck?.deviceId).toBe(ongoing.deviceId);
    expect(
      new Date(session.updatedAt).toLocaleTimeString('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    ).toBe(ongoing.savedAtLabel);
    // 홈의 측정 50%·2/3회차는 S04의 준비 체크 진행률이 아니다.
    expect(session.phase).toBe('preparing');
    expect(selectPreparation(session)).toMatchObject({
      completed: 0,
      total: 6,
      canContinue: false,
    });
    expect(session.evidence).toEqual([]);
    expect(session.deviceChecks).toEqual([]);
    expect(session.events.map((event) => event.type)).toEqual(['sessionCreated']);
    await expect(repo.getSession('missing-session')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  test('초기 세션의 체크·revision·근거를 재조회와 새 세션 생성 후에도 유지하고 S05로 제출한다', async () => {
    const repo = new MockWorkflowRepository({ now: () => '2026-11-12T00:42:00.000Z' });
    let session = await repo.getSession('demo-session-led-m03');
    for (const item of session.procedure.preparation.filter((item) => item.owner === 'operator')) {
      session = await send(repo, session, {
        type: 'setPreparationCheck',
        checkId: item.id,
        checked: true,
      });
    }
    await repo.createSession(input);
    expect(await repo.getSession(session.sessionId)).toEqual(session);
    expect(session.revision).toBe(5);
    expect(session.evidence).toHaveLength(5);
    const submitted = await send(repo, session, { type: 'completePreparation' });
    expect(submitted.sessionId).toBe('demo-session-led-m03');
    expect(submitted.phase).toBe('awaitingDeviceCheck');
    expect(submitted.procedure).toEqual(session.procedure);
    expect(submitted.checks.find((item) => item.id === 'communication')?.checked).toBe(false);
  });

  test('초기 세션의 반환 스냅샷과 Repository 인스턴스는 서로 격리된다', async () => {
    const first = repository();
    const session = await first.getSession('demo-session-led-m03');
    const mutable = session as unknown as { procedure: { version: string } };
    mutable.procedure.version = '9.9';
    expect((await first.getSession(session.sessionId)).procedure.version).toBe('1.2');
    await send(first, session, {
      type: 'setPreparationCheck',
      checkId: 'materials',
      checked: true,
    });
    expect(selectPreparation(await first.getSession(session.sessionId)).completed).toBe(1);
    expect(selectPreparation(await repository().getSession(session.sessionId)).completed).toBe(0);
    expect(mockProcedure.procedureId).toBe('mock-led-output');
    expect(mockProcedure.deviceCheck?.deviceId).toBe('mock-orange-pi-5-plus');
  });

  test('승인되지 않은 절차는 세션으로 시작하지 않는다', async () => {
    const repo = repository();
    const procedure = JSON.parse(JSON.stringify(mockProcedure));
    procedure.approval = 'draft';
    await expect(repo.createSession({ ...input, procedure })).rejects.toMatchObject({
      code: 'INVALID_PROCEDURE',
    });
  });

  test('같은 revision의 서로 다른 동시 요청은 하나만 적용된다', async () => {
    const repo = repository();
    const session = await repo.createSession(input);
    const results = await Promise.allSettled([
      send(
        repo,
        session,
        { type: 'setPreparationCheck', checkId: 'materials', checked: true },
        'first',
      ),
      send(
        repo,
        session,
        { type: 'setPreparationCheck', checkId: 'device', checked: true },
        'second',
      ),
    ]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    expect(selectPreparation(await repo.getSession(session.sessionId)).completed).toBe(1);
  });

  test('완료 뒤에는 체크 변경을 거절하고 통신 점검을 기다린다', async () => {
    const repo = repository();
    const checked = await confirmOperatorChecks(repo);
    const completed = await send(repo, checked, { type: 'completePreparation' }, 'finish');
    await expect(
      send(
        repo,
        completed,
        { type: 'setPreparationCheck', checkId: 'materials', checked: false },
        'edit',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  test('새 세션은 고유 ID와 0/6 상태를 가지며 생성 재시도는 동일 세션을 반환한다', async () => {
    const repo = repository();
    const first = await repo.createSession(input);
    const retry = await repo.createSession(input);
    const second = await repo.createSession({ ...input, requestId: 'create-second' });
    expect(first.sessionId).toBe('mock-session-1');
    expect(first.sessionId).toBe(retry.sessionId);
    expect(first.sessionId).not.toBe(second.sessionId);
    expect(selectPreparation(first)).toMatchObject({
      completed: 0,
      total: 6,
      percentage: 0,
      canContinue: false,
    });
    expect(first.events).toHaveLength(1);
    expect(first.evidence).toHaveLength(0);
  });

  test('체크와 해제는 진행률·현재 근거·감사 이력을 일관되게 변경한다', async () => {
    const repo = repository();
    const initial = await repo.createSession(input);
    const checked = await send(repo, initial, {
      type: 'setPreparationCheck',
      checkId: 'materials',
      checked: true,
    });
    expect(selectPreparation(checked).percentage).toBe(17);
    expect(checked.checks[0]).toMatchObject({
      checked: true,
      confirmedAt: '2026-11-02T00:42:00.000Z',
      evidenceId: checked.evidence[0].evidenceId,
    });
    expect(checked.evidence[0]).toMatchObject({
      kind: 'human',
      actorId: 'researcher',
      source: 'mock',
      action: 'confirmed',
    });
    const unchecked = await send(repo, checked, {
      type: 'setPreparationCheck',
      checkId: 'materials',
      checked: false,
    });
    expect(selectPreparation(unchecked).percentage).toBe(0);
    expect(unchecked.checks[0]).toMatchObject({
      checked: false,
      confirmedAt: null,
      evidenceId: null,
    });
    expect(unchecked.evidence.map((item) => item.action)).toEqual(['confirmed', 'revoked']);
  });

  test('필수 확인이 부족하면 진행을 거절하며 이벤트를 추가하지 않는다', async () => {
    const repo = repository();
    const session = await repo.createSession(input);
    await expect(send(repo, session, { type: 'completePreparation' })).rejects.toMatchObject({
      code: 'PREPARATION_INCOMPLETE',
    });
    expect(await repo.getSession(session.sessionId)).toEqual(session);
  });

  test('작업자 확인 5개면 83%에서 S05 진입 가능하며 통신 근거를 조작하지 않는다', async () => {
    const repo = repository();
    const session = await confirmOperatorChecks(repo);
    expect(selectPreparation(session)).toMatchObject({
      completed: 5,
      percentage: 83,
      canContinue: true,
    });
    const completed = await send(repo, session, { type: 'completePreparation' }, 'complete');
    expect(completed.phase).toBe('awaitingDeviceCheck');
    expect(completed.checks.find((item) => item.id === 'communication')?.checked).toBe(false);
    expect(completed.evidence.filter((item) => item.kind === 'human')).toHaveLength(5);
    expect(completed.evidence.at(-1)).toMatchObject({
      kind: 'program',
      action: 'preparationCompleted',
      source: 'mock',
    });
    expect(completed.evidence.some((item) => item.kind === 'sensor')).toBe(false);
  });

  test('동일 완료 요청의 동시 재전송과 새 완료 요청 모두 중복 이벤트를 만들지 않는다', async () => {
    const repo = repository();
    const session = await confirmOperatorChecks(repo);
    const [first, second] = await Promise.all([
      send(repo, session, { type: 'completePreparation' }, 'complete'),
      send(repo, session, { type: 'completePreparation' }, 'complete'),
    ]);
    expect(first).toEqual(second);
    const repeated = await send(repo, first, { type: 'completePreparation' }, 'another-complete');
    expect(repeated.events.filter((item) => item.type === 'preparationCompleted')).toHaveLength(1);
    expect(repeated.revision).toBe(first.revision);
  });

  test('같은 체크 요청 재전송과 이미 같은 값인 체크는 근거를 중복 생성하지 않는다', async () => {
    const repo = repository();
    const initial = await repo.createSession(input);
    const command = { type: 'setPreparationCheck', checkId: 'materials', checked: true } as const;
    const checked = await send(repo, initial, command, 'check');
    expect(await send(repo, initial, command, 'check')).toEqual(checked);
    expect(await send(repo, checked, command, 'check-again')).toEqual(checked);
  });

  test('같은 요청 ID의 다른 명령과 오래된 revision을 거절한다', async () => {
    const repo = repository();
    const initial = await repo.createSession(input);
    await send(
      repo,
      initial,
      { type: 'setPreparationCheck', checkId: 'materials', checked: true },
      'check',
    );
    await expect(
      send(
        repo,
        initial,
        { type: 'setPreparationCheck', checkId: 'device', checked: true },
        'check',
      ),
    ).rejects.toMatchObject({ code: 'REQUEST_CONFLICT' });
    await expect(
      send(repo, initial, { type: 'setPreparationCheck', checkId: 'device', checked: true }, 'old'),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  });

  test('S04에서 통신 점검을 직접 확인할 수 없다', async () => {
    const repo = repository();
    const session = await repo.createSession(input);
    await expect(
      send(repo, session, { type: 'setPreparationCheck', checkId: 'communication', checked: true }),
    ).rejects.toMatchObject({ code: 'CHECK_NOT_EDITABLE' });
  });

  test('절차 입력과 반환 스냅샷을 외부에서 바꿔도 세션 고정 버전은 유지된다', async () => {
    const repo = repository();
    const procedure = JSON.parse(JSON.stringify(mockProcedure));
    const created = await repo.createSession({ ...input, procedure });
    procedure.version = '9.9';
    const mutable = created as unknown as { procedure: { version: string } };
    mutable.procedure.version = '8.8';
    const stored = await repo.getSession(created.sessionId);
    expect(stored.procedure.version).toBe('1.2');
    const updated = await send(repo, stored, {
      type: 'setPreparationCheck',
      checkId: 'device',
      checked: true,
    });
    expect(updated.procedure.version).toBe('1.2');
  });

  test('구독은 갱신 스냅샷을 전달하고 해제 후 호출하지 않는다', async () => {
    const repo = repository();
    const session = await repo.createSession(input);
    const revisions: number[] = [];
    const unsubscribe = repo.subscribe(session.sessionId, (next) => revisions.push(next.revision));
    const checked = await send(repo, session, {
      type: 'setPreparationCheck',
      checkId: 'materials',
      checked: true,
    });
    unsubscribe();
    await send(repo, checked, {
      type: 'setPreparationCheck',
      checkId: 'materials',
      checked: false,
    });
    expect(revisions).toEqual([1]);
  });
});
