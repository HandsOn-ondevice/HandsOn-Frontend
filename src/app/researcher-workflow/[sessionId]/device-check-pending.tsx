import { Redirect, useLocalSearchParams } from 'expo-router';

export default function DeviceCheckConnectionRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <Redirect
      href={{ pathname: '/researcher-workflow/[sessionId]/device-check', params: { sessionId } }}
    />
  );
}
