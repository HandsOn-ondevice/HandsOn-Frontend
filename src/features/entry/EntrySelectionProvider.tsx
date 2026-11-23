import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { createEdgeApi, getEdgeBaseUrl, type EdgeApi } from '@/lib/edgeApi';
import type { EntrySelection } from './entryEnvironment';

type EntrySelectionState = {
  selection: EntrySelection | null;
  edge: EdgeApi | null;
  setSelection: (selection: EntrySelection) => void;
};

const EntrySelectionContext = createContext<EntrySelectionState | null>(null);

export function EntrySelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<EntrySelection | null>(null);
  const edge = useMemo(() => {
    const baseUrl = getEdgeBaseUrl();
    return baseUrl && selection ? createEdgeApi({ baseUrl, token: selection.edgeToken }) : null;
  }, [selection]);

  return (
    <EntrySelectionContext.Provider value={{ selection, edge, setSelection }}>
      {children}
    </EntrySelectionContext.Provider>
  );
}

export function useEntrySelection() {
  const state = useContext(EntrySelectionContext);
  if (!state) throw new Error('useEntrySelection requires EntrySelectionProvider');
  return state;
}
