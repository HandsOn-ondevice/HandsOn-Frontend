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
  onPrepare: (request: PreparationRequest) => void;
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
    try {
      // Recheck the chosen version; the real session API must validate atomically at creation.
      const detail = await repository.getDetail(selection);
      if (currentGeneration !== generation.current) return;
      if (!matchesSelection(detail, selection)) {
        setStart({
          key: requestKey,
          blocked: '선택한 절차·버전을 더 이상 준비할 수 없어요. 목록에서 다시 선택해 주세요.',
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
    } catch {
      if (currentGeneration === generation.current) {
        setStart({
          key: requestKey,
          error: '시작 가능 여부를 확인하지 못했어요. 다시 시도해 주세요.',
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
