/** 기존 숫자 버전과 승인 카탈로그의 v 접두사 버전을 같은 형식으로 표시한다. 저장값은 바꾸지 않는다. */
export function procedureVersionLabel(version: string) {
  return version.startsWith('v') ? version : `v${version}`;
}
