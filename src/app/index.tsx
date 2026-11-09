import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { EntryScreen } from '@/features/entry/EntryScreen';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';

export default function Index() {
  const router = useRouter();
  const { setSelection } = useEntrySelection();
  const { component, example } = useLocalSearchParams<{ component?: string; example?: string }>();

  if (__DEV__ && (component || example)) {
    return <Redirect href={{ pathname: '/dev', params: { component, example } }} />;
  }

  return (
    <EntryScreen
      onContinue={(selection) => {
        setSelection(selection);
        router.navigate(selection.role === 'student' ? '/student' : '/expert');
      }}
    />
  );
}
