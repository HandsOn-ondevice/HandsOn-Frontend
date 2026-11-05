import { createContext, useContext, useState, type ReactNode } from 'react';
import type { WorkEnvironment } from '@/features/entry/entryEnvironment';

/** Local integration boundary for A's preparation screen, not an agreed server request. */
export interface PreparationRequest {
  readonly procedureId: string;
  readonly approvedVersion: string;
  readonly environment: Readonly<WorkEnvironment>;
}

interface PreparationHandoffState {
  request: PreparationRequest | null;
  setRequest: (request: PreparationRequest) => void;
}

const PreparationHandoffContext = createContext<PreparationHandoffState | null>(null);

export function PreparationHandoffProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<PreparationRequest | null>(null);
  return (
    <PreparationHandoffContext.Provider value={{ request, setRequest }}>
      {children}
    </PreparationHandoffContext.Provider>
  );
}

export function usePreparationHandoff() {
  const state = useContext(PreparationHandoffContext);
  if (!state) throw new Error('usePreparationHandoff requires PreparationHandoffProvider');
  return state;
}
