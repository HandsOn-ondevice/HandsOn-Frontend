/* global jest */
require('react-native-gesture-handler/jestSetup');
// Unit tests use only this enum; gesture/animation behavior is checked in Android.
jest.mock('react-native-reanimated', () => ({
  ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
}));
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Modal = React.forwardRef(({ children, onDismiss }, ref) => {
    const [visible, setVisible] = React.useState(false);
    React.useImperativeHandle(ref, () => ({
      present: () => setVisible(true),
      dismiss: () => {
        if (visible) {
          setVisible(false);
          onDismiss?.();
        }
      },
    }));
    return visible ? React.createElement(View, null, children) : null;
  });
  Modal.displayName = 'BottomSheetModalMock';
  return {
    __esModule: true,
    default: Modal,
    BottomSheetModal: Modal,
    BottomSheetView: View,
    BottomSheetScrollView: View,
    BottomSheetTextInput: require('react-native').TextInput,
    BottomSheetModalProvider: ({ children }) => children,
    BottomSheetBackdrop: View,
    useBottomSheetSpringConfigs: (config) => config,
  };
});
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
