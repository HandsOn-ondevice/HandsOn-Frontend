import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppBar, Button, FeedbackPanel, Screen, StatusBar, spacing } from '@/design-system';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';

interface HomeDestinationScreenProps {
  title: string;
  message: string;
}

/** A navigable boundary until the destination feature is implemented. */
export function HomeDestinationScreen({ title, message }: HomeDestinationScreenProps) {
  const router = useRouter();
  const { selection } = useEntrySelection();

  if (selection?.role !== 'student') return <Redirect href="/" />;

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/student');
  }

  return (
    <Screen>
      <StatusBar />
      <AppBar mode="back" title={title} onBack={goBack} />
      <View style={styles.content}>
        <FeedbackPanel title={title} subtitle={message} />
        <Button
          label="연구생 홈으로"
          variant="secondary"
          onPress={() => router.dismissTo('/student')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing[24], gap: spacing[16] },
});
