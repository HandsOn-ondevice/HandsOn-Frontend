import { useEffect, useRef, useState } from 'react';
import {
  procedureDraftRepository,
  type ProcedureDraft,
  type ProcedureDraftRepository,
} from './procedureDraftRepository';

type DraftState =
  | { status: 'loading' | 'missing' | 'error' }
  | {
      status: 'ready';
      draft: ProcedureDraft;
      persisted: ProcedureDraft;
      saveStatus: 'idle' | 'saving' | 'saved' | 'error';
    };

export function useProcedureDraft(
  environmentId: string,
  draftId: string,
  repository: ProcedureDraftRepository = procedureDraftRepository,
) {
  const [state, setState] = useState<DraftState>({ status: 'loading' });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const saving = useRef(false);

  useEffect(() => {
    let active = true;
    void repository.load(environmentId, draftId).then(
      (draft) => {
        if (!active) return;
        setState(
          draft
            ? { status: 'ready', draft, persisted: draft, saveStatus: 'idle' }
            : { status: 'missing' },
        );
      },
      () => {
        if (active) setState({ status: 'error' });
      },
    );
    return () => {
      active = false;
    };
  }, [environmentId, draftId, loadAttempt, repository]);

  function retryLoad() {
    setState({ status: 'loading' });
    setLoadAttempt((attempt) => attempt + 1);
  }

  function updateDraft(update: (draft: ProcedureDraft) => ProcedureDraft) {
    if (saving.current) return;
    setState((current) =>
      current.status === 'ready'
        ? { ...current, draft: update(current.draft), saveStatus: 'idle' }
        : current,
    );
  }

  async function saveDraft() {
    if (state.status !== 'ready' || saving.current) return false;
    saving.current = true;
    setState({ ...state, saveStatus: 'saving' });
    try {
      const draft = await repository.save(environmentId, state.draft);
      setState({ status: 'ready', draft, persisted: draft, saveStatus: 'saved' });
      return true;
    } catch {
      setState({ ...state, saveStatus: 'error' });
      return false;
    } finally {
      saving.current = false;
    }
  }

  return { state, retryLoad, updateDraft, saveDraft };
}
