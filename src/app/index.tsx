import { useLocalSearchParams } from 'expo-router';
import { AppText, Screen } from '../design-system/primitives';
import { Gallery } from '../dev/Gallery';
export default function Index() {
  const { component, example } = useLocalSearchParams<{ component?: string; example?: string }>();
  if (__DEV__)
    return (
      <Gallery
        key={`${component}-${example}`}
        initialComponent={component}
        initialExample={example}
      />
    );
  return (
    <Screen>
      <AppText variant="heading">HandsOn</AppText>
      <AppText>앱을 준비하고 있습니다.</AppText>
    </Screen>
  );
}
