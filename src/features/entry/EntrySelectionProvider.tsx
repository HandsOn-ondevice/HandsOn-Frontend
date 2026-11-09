import { createContext, useContext, useState, type ReactNode } from 'react';
import type { EntrySelection } from './entryEnvironment';

type EntrySelectionState = {
  selection: EntrySelection | null;
  setSelection: (selection: EntrySelection) => void;
};

const EntrySelectionContext = createContext<EntrySelectionState | null>(null);

export function EntrySelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<EntrySelection | null>(null);

  return (
    <EntrySelectionContext.Provider value={{ selection, setSelection }}>
      {children}
    </EntrySelectionContext.Provider>
  );
}

export function useEntrySelection() {
  const state = useContext(EntrySelectionContext);
  if (!state) throw new Error('useEntrySelection requires EntrySelectionProvider');
  return state;
}
