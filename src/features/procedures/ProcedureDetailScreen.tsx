import { useEffect, useRef, useState } from 'react';
import type { WorkEnvironment } from '@/features/entry/entryEnvironment';
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
  repository = procedureRepository,
}: ProcedureDetailScreenProps) {
  const [attempt, setAttempt] = useState(0);
  const requestKey = JSON.stringify([procedureId, approvedVersion, environment.id, attempt]);
  const generation = useRef(0);
  const busy = useRef(false);
  const [result, setResult] = useState<{
    key: string;
    lookup: ProcedureLookup<ProcedureDetail | null>;
  }>();
  const [start, setStart] = useState<{
    key: string;
    pending?: boolean;
    error?: string;
    blocked?: string;
  }>();
  const lookup: ProcedureLookup<ProcedureDetail | null> =
    result?.key === requestKey ? result.lookup : { status: 'loading' };
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
          lookup: { status: 'ready', data: matchesSelection(detail, selection) ? detail : null },
        });
      },
      () => {
        if (currentGeneration === generation.current) {
          setResult({ key: requestKey, lookup: { status: 'error' } });
        }
      },
    );
    return () => {
      generation.current = currentGeneration + 1;
    };
  }, [approvedVersion, environment.id, procedureId, repository, requestKey]);

  async function prepare() {
    if (busy.current || lookup.status !== 'ready' || !lookup.data || currentStart?.blocked) return;
    busy.current = true;
    const currentGeneration = generation.current;
    setStart({ key: requestKey, pending: true });
    const selection = { procedureId, approvedVersion, environmentId: environment.id };
    const request = Object.freeze({
      procedureId,
      approvedVersion,
      environment: Object.freeze({ ...environment }),
    });
    try {
      if (startSession) {
        // 세션 생성 API가 선택한 버전의 승인 상태를 검증하고 세션을 생성한다.
        const sessionId = await startSession(request);
        if (currentGeneration !== generation.current) return;
        onPrepare(request, sessionId);
        setStart({ key: requestKey });
        return;
      }

      const detail = await repository.getDetail(selection);
      if (currentGeneration !== generation.current) return;
      if (!matchesSelection(detail, selection)) {
        setStart({
          key: requestKey,
          blocked: '선택한 절차·버전을 더 이상 준비할 수 없어요. 목록에서 다시 선택해 주세요.',
        });
        return;
      }
      onPrepare(request);
      setStart({ key: requestKey });
    } catch (reason) {
      if (currentGeneration === generation.current) {
        setStart({
          key: requestKey,
          error: startSession
            ? reason instanceof Error
              ? reason.message
              : '실험 세션을 시작하지 못했어요. 다시 시도해 주세요.'
            : '시작 가능 여부를 확인하지 못했어요. 다시 시도해 주세요.',
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
