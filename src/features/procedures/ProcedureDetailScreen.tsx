import { useEffect, useRef, useState } from 'react';
import type { WorkEnvironment } from '@/features/entry/entryEnvironment';
import { EdgeApiError } from '@/lib/edgeApi';
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
  onPrepare: (request: PreparationRequest) => void;
  edgePreparation?: {
    start: (selection: ProcedureSelection) => Promise<string>;
    onReady: (sessionId: string, startedSelection?: ProcedureSelection) => void;
  };
  repository?: ProcedureRepository;
}

const invalidSelectionMessage =
  '선택한 절차·버전을 더 이상 준비할 수 없어요. 목록에서 다시 선택해 주세요.';

function startFailure(error: unknown) {
  if (!(error instanceof EdgeApiError) || error.kind !== 'server') {
    return { error: '서버가 세션을 시작했는지 확인하지 못했어요. 다시 시도해 주세요.' };
  }
  if (error.status === 404 || error.code === 'INVALID_PROCEDURE') {
    return { blocked: invalidSelectionMessage };
  }
  if (error.code === 'DEVICE_BUSY') {
    return { error: '장치에 진행 중인 세션이 있어요. 기존 실험을 종료한 뒤 다시 시도해 주세요.' };
  }
  if (error.status === 401 || error.status === 403) {
    return { blocked: '세션을 시작할 권한이 없어요. 작업 환경을 다시 설정해 주세요.' };
  }
  if (error.status === 400 || error.status === 422) {
    return { blocked: '서버가 준비 시작 요청을 거절했어요. 목록에서 절차를 다시 선택해 주세요.' };
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
  edgePreparation,
  repository = procedureRepository,
}: ProcedureDetailScreenProps) {
  const [attempt, setAttempt] = useState(0);
  const requestKey = JSON.stringify([procedureId, approvedVersion, environment.id, attempt]);
  const generation = useRef(0);
  const busy = useRef(false);
  const [result, setResult] = useState<{
    key: string;
    repository: ProcedureRepository;
    lookup: ProcedureLookup<ProcedureDetail | null>;
  }>();
  const [start, setStart] = useState<{
    key: string;
    pending?: boolean;
    error?: string;
    blocked?: string;
    sessionId?: string;
  }>();
  const lookup: ProcedureLookup<ProcedureDetail | null> =
    result?.key === requestKey && result.repository === repository
      ? result.lookup
      : { status: 'loading' };
  const currentStart = start?.key === requestKey ? start : undefined;

  useEffect(() => {
    const currentGeneration = ++generation.current;
    busy.current = false;
    const selection = { procedureId, approvedVersion, environmentId: environment.id };
    void repository.getDetail(selection).then(
      (detail) => {
        if (currentGeneration !== generation.current) return;
        setResult({
          key: requestKey,
          repository,
          lookup: { status: 'ready', data: matchesSelection(detail, selection) ? detail : null },
        });
      },
      () => {
        if (currentGeneration === generation.current) {
          setResult({ key: requestKey, repository, lookup: { status: 'error' } });
        }
      },
    );
    return () => {
      generation.current = currentGeneration + 1;
    };
  }, [approvedVersion, environment.id, procedureId, repository, requestKey]);

  async function prepare() {
    if (busy.current || lookup.status !== 'ready' || !lookup.data || currentStart?.blocked) return;
    if (edgePreparation && currentStart?.sessionId) {
      edgePreparation.onReady(currentStart.sessionId);
      return;
    }
    busy.current = true;
    const currentGeneration = generation.current;
    setStart({ key: requestKey, pending: true });
    const selection = { procedureId, approvedVersion, environmentId: environment.id };
    try {
      if (edgePreparation) {
        const sessionId = await edgePreparation.start(selection);
        if (currentGeneration !== generation.current) return;
        edgePreparation.onReady(sessionId, selection);
        setStart({ key: requestKey, sessionId });
        return;
      }

      // The fixture preview rechecks the chosen version before passing its inputs.
      const detail = await repository.getDetail(selection);
      if (currentGeneration !== generation.current) return;
      if (!matchesSelection(detail, selection)) {
        setStart({
          key: requestKey,
          blocked: invalidSelectionMessage,
        });
        return;
      }
      onPrepare(
        Object.freeze({
          procedureId,
          approvedVersion,
          environment: Object.freeze({ ...environment }),
        }),
      );
      setStart({ key: requestKey });
    } catch (error) {
      if (currentGeneration === generation.current) {
        setStart({
          key: requestKey,
          ...(edgePreparation
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
