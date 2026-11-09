import { Stack } from 'expo-router';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { EntrySelectionProvider } from '@/features/entry/EntrySelectionProvider';
import { useHandsOnFonts } from '../design-system/fonts';
import { colors } from '../design-system/tokens';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useHandsOnFonts();
  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);
  if (error) throw error;
  if (!loaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.surface.canvas }}>
      <SafeAreaProvider>
        <BottomSheetModalProvider>
          <EntrySelectionProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.surface.canvas },
              }}
            />
          </EntrySelectionProvider>
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
