import type { Href } from 'expo-router';

export type StudentHomeDestination =
  | { type: 'procedures'; environmentId: string }
  | { type: 'resume'; sessionId: string }
  | { type: 'result'; resultId: string; sessionId: string }
  | { type: 'history' }
  | { type: 'devices' };

/** Local handoff paths; destination screens and server contracts are separate work. */
export function getStudentHomeDestination(destination: StudentHomeDestination): Href {
  switch (destination.type) {
    case 'procedures':
      return { pathname: '/procedures', params: { environmentId: destination.environmentId } };
    case 'resume':
      // Resume receives only the existing identity. It must not recreate session settings.
      return {
        pathname: '/researcher-workflow/[sessionId]/preparation',
        params: { sessionId: destination.sessionId },
      };
    case 'result':
      return {
        pathname: '/results/[resultId]',
        params: { resultId: destination.resultId, sessionId: destination.sessionId },
      };
    case 'history':
      return { pathname: '/history' };
    case 'devices':
      return { pathname: '/devices' };
  }
}
