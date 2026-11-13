import { Redirect, useLocalSearchParams } from 'expo-router';

export default function VoiceClarificationRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <Redirect
      href={{
        pathname: '/researcher-workflow/[sessionId]/voice-clarification',
        params: { sessionId },
      }}
    />
  );
}
