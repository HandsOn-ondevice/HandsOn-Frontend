import { useFonts } from 'expo-font';

export const fonts = {
  'NotoSansKR-Regular': require('./assets/fonts/NotoSansKR-Regular.ttf'),
  'NotoSansKR-Medium': require('./assets/fonts/NotoSansKR-Medium.ttf'),
  'NotoSansKR-SemiBold': require('./assets/fonts/NotoSansKR-SemiBold.ttf'),
  'NotoSansKR-Bold': require('./assets/fonts/NotoSansKR-Bold.ttf'),
};

export function useHandsOnFonts() {
  return useFonts(fonts);
}
