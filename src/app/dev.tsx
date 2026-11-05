import { Redirect, useLocalSearchParams } from 'expo-router';
import { Gallery } from '@/dev/Gallery';

export default function DevelopmentGallery() {
  const { component, example } = useLocalSearchParams<{ component?: string; example?: string }>();

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <Gallery
      key={`${component}-${example}`}
      initialComponent={component}
      initialExample={example}
    />
  );
}
