import { Redirect, useLocalSearchParams } from 'expo-router';

export default function ExecutionConnectionRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <Redirect
      href={{ pathname: '/researcher-workflow/[sessionId]/execution', params: { sessionId } }}
    />
  );
}
