import { useEffect, useMemo, useRef, useState } from 'react';
import { isEdgeDataEnabled } from '@/lib/edgeApi';
import { createEdgeProcedureRepository } from './edgeProcedureRepository';
import type { WorkEnvironment } from '@/features/entry/entryEnvironment';
import { WorkflowError } from '@/features/researcher-workflow/domain/models';
import type { PreparationRequest } from './PreparationHandoffProvider';
import { ProcedureDetailView } from './ProcedureDetailView';
import type { ProcedureDetail, ProcedureLookup } from './procedureModels';
import {
  procedureRepository,
  type ProcedureRepository,
  type ProcedureSelection,
} from './procedureRepository';

interface ProcedureDetailScreenProps {
  environment: WorkEnvironment;
  procedureId: string;
  approvedVersion: string;
  onBack: () => void;
  onPrepare: (request: PreparationRequest, sessionId?: string) => void;
  startSession?: (request: PreparationRequest) => Promise<string>;
  repository?: ProcedureRepository;
  edgeToken?: string;
}

const invalidSelectionMessage =
  '선택한 절차·버전을 더 이상 준비할 수 없어요. 목록에서 다시 선택해 주세요.';

function startFailure(error: unknown) {
  if (error instanceof WorkflowError) {
    if (error.code === 'NOT_FOUND' || error.code === 'INVALID_PROCEDURE') {
      return { blocked: invalidSelectionMessage };
    }
    if (error.code !== 'OUTCOME_UNKNOWN') return { error: error.message };
  }
  return { error: '서버가 세션을 시작했는지 확인하지 못했어요. 다시 시도해 주세요.' };
}

function matchesSelection(detail: ProcedureDetail | null, selection: ProcedureSelection) {
  return (
    detail?.id === selection.procedureId && detail.approvedVersion === selection.approvedVersion
  );
}

export function ProcedureDetailScreen({
  environment,
  procedureId,
  approvedVersion,
  onBack,
  onPrepare,
  startSession,
  repository,
  edgeToken,
}: ProcedureDetailScreenProps) {
  const source = useMemo(
    () =>
      repository ??
      (isEdgeDataEnabled() ? createEdgeProcedureRepository(edgeToken) : procedureRepository),
    [edgeToken, repository],
  );
  const [attempt, setAttempt] = useState(0);
  const requestKey = JSON.stringify([procedureId, approvedVersion, environment.id, attempt]);
  const generation = useRef(0);
  const busy = useRef(false);
  const [result, setResult] = useState<{
    key: string;
    source: ProcedureRepository;
    lookup: ProcedureLookup<ProcedureDetail | null>;
  }>();
  const [start, setStart] = useState<{
    key: string;
    source: ProcedureRepository;
    pending?: boolean;
    error?: string;
    blocked?: string;
    sessionId?: string;
  }>();
  const lookup: ProcedureLookup<ProcedureDetail | null> =
    result?.key === requestKey && result.source === source ? result.lookup : { status: 'loading' };
  const currentStart = start?.key === requestKey && start.source === source ? start : undefined;

  useEffect(() => {
    const currentGeneration = ++generation.current;
    busy.current = false;
    const selection = { procedureId, approvedVersion, environmentId: environment.id };
    void source.getDetail(selection).then(
      (detail) => {
        if (currentGeneration !== generation.current) return;
        setResult({
          key: requestKey,
          source,
          lookup: { status: 'ready', data: matchesSelection(detail, selection) ? detail : null },
        });
      },
      () => {
        if (currentGeneration === generation.current) {
          setResult({ key: requestKey, source, lookup: { status: 'error' } });
        }
      },
    );
    return () => {
      generation.current = currentGeneration + 1;
    };
  }, [approvedVersion, environment.id, procedureId, source, requestKey]);

  async function prepare() {
    if (busy.current || lookup.status !== 'ready' || !lookup.data || currentStart?.blocked) return;
    const selection = { procedureId, approvedVersion, environmentId: environment.id };
    const request = Object.freeze({
      procedureId,
      approvedVersion,
      environment: Object.freeze({ ...environment }),
    });
    if (startSession && currentStart?.sessionId) {
      onPrepare(request, currentStart.sessionId);
      return;
    }
    busy.current = true;
    const currentGeneration = generation.current;
    const startState = { key: requestKey, source };
    setStart({ ...startState, pending: true });
    try {
      if (startSession) {
        // 세션 생성 API가 선택한 버전의 승인 상태를 검증하고 세션을 생성한다.
        const sessionId = await startSession(request);
        if (currentGeneration !== generation.current) return;
        setStart({ ...startState, sessionId });
        onPrepare(request, sessionId);
        return;
      }

      const detail = await source.getDetail(selection);
      if (currentGeneration !== generation.current) return;
      if (!matchesSelection(detail, selection)) {
        setStart({
          ...startState,
          blocked: invalidSelectionMessage,
        });
        return;
      }
      onPrepare(request);
      setStart(startState);
    } catch (error) {
      if (currentGeneration === generation.current) {
        setStart({
          ...startState,
          ...(startSession
            ? startFailure(error)
            : { error: '시작 가능 여부를 확인하지 못했어요. 다시 시도해 주세요.' }),
        });
      }
    } finally {
      if (currentGeneration === generation.current) busy.current = false;
    }
  }

  return (
    <ProcedureDetailView
      lookup={lookup}
      onBack={onBack}
      onRetry={() => setAttempt((previous) => previous + 1)}
      onStart={() => void prepare()}
      starting={currentStart?.pending}
      startError={currentStart?.error}
      blockedReason={currentStart?.blocked}
    />
  );
}
