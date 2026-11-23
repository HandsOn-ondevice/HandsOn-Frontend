import { useMemo } from 'react';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { createEdgeApi, getEdgeBaseUrl } from '@/lib/edgeApi';
import { createEdgeProcedureRepository } from './edgeProcedureRepository';

export function useSelectedProcedureRepository() {
  const { selection } = useEntrySelection();
  const hasSelection = selection !== null;
  const token = selection?.edgeToken;
  const baseUrl = getEdgeBaseUrl();

  return useMemo(
    () =>
      baseUrl && hasSelection
        ? createEdgeProcedureRepository(createEdgeApi({ baseUrl, token }))
        : undefined,
    [baseUrl, hasSelection, token],
  );
}
