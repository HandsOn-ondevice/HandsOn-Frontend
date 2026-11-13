import { useEffect, useState } from 'react';
import type { WorkEnvironment } from '@/features/entry/entryEnvironment';
import { ProcedureListView } from './ProcedureListView';
import type { ProcedureLookup, ProcedureSummary } from './procedureModels';
import { procedureRepository, type ProcedureRepository } from './procedureRepository';

interface ProcedureListScreenProps {
  environment: WorkEnvironment;
  onBack: () => void;
  onConfirm: (procedure: ProcedureSummary) => void;
  repository?: ProcedureRepository;
}

export function ProcedureListScreen({
  environment,
  onBack,
  onConfirm,
  repository = procedureRepository,
}: ProcedureListScreenProps) {
  const [attempt, setAttempt] = useState(0);
  const requestKey = JSON.stringify([environment.id, attempt]);
  const [result, setResult] = useState<{
    key: string;
    lookup: ProcedureLookup<readonly ProcedureSummary[]>;
  }>();

  useEffect(() => {
    let active = true;
    void repository.list(environment.id).then(
      (data) => {
        if (active) setResult({ key: requestKey, lookup: { status: 'ready', data } });
      },
      () => {
        if (active) setResult({ key: requestKey, lookup: { status: 'error' } });
      },
    );
    return () => {
      active = false;
    };
  }, [environment.id, repository, requestKey]);

  return (
    <ProcedureListView
      key={environment.id}
      environment={environment}
      lookup={result?.key === requestKey ? result.lookup : { status: 'loading' }}
      onBack={onBack}
      onRetry={() => setAttempt((previous) => previous + 1)}
      onConfirm={onConfirm}
    />
  );
}
