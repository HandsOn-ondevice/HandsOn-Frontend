/** 일반 배포에서 합성 실험을 실행하지 않는다. 기존 Maestro fixture 빌드만 예외다. */
export function isMockWorkflowEnabled() {
  return __DEV__ || process.env.EXPO_PUBLIC_HANDSON_MAESTRO === '1';
}
