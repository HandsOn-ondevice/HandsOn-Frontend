import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { EntrySelection } from './entryEnvironment';

type EntrySelectionState = {
  selection: EntrySelection | null;
  edgeToken: string;
  setEdgeToken: (token: string) => void;
  setSelection: (selection: EntrySelection) => void;
};

const EntrySelectionContext = createContext<EntrySelectionState | null>(null);

export function EntrySelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<EntrySelection | null>(null);
  const setEdgeToken = useCallback((edgeToken: string) => {
    setSelection((current) => (current ? { ...current, edgeToken } : current));
  }, []);

  return (
    <EntrySelectionContext.Provider
      value={{ selection, edgeToken: selection?.edgeToken ?? '', setEdgeToken, setSelection }}
    >
      {children}
    </EntrySelectionContext.Provider>
  );
}

export function useEntrySelection() {
  const state = useContext(EntrySelectionContext);
  if (!state) throw new Error('useEntrySelection requires EntrySelectionProvider');
  return state;
}
