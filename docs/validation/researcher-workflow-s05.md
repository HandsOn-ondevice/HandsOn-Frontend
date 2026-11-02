# S05 장치·센서 점검 검증 기록

작업 범위: S05 Mock UI·진단·S04/S06 연결. S04 기준 커밋 `3a5d689`를 보존한 `feat/researcher-workflow`에서 작업했다. commit/push/staging은 수행하지 않았다.

## 구현과 직접 확인 방법

1. Node 24.3.0에서 `npm run web -- --localhost --port 8081`을 실행하고 `/researcher-workflow`에 접속한다.
2. 새 Mock 실험은 S04 0/6이다. 앞의 작업자 확인 5개를 체크하고 확인 완료를 누르면 같은 sessionId의 `/device-check`로 이동한다.
3. 센서 카드가 점검 전으로 표시된다. `장치·센서 점검 시작`을 눌러 확인한다. 시작 전/진행 중/실패 상태에서는 하단 `실험 측정 시작`을 사용할 수 없다.
4. 성공 시 세션은 readyToExecute, 통신 항목은 6/6이 된다. S04 복귀 시 작업자 근거와 Mock 시스템 근거를 구분해 표시한다.
5. 하단 시작 버튼은 별도 startExecution 명령을 보낸 뒤 S06 임시 연결 안내로 이동한다. S06 실행 UI·측정·AI·음성은 미구현이며 실제 장비 명령도 없다.
6. 개발용 Mock 시나리오에서 정상/미연결/센서 오류/응답 지연 후 성공/시간 초과/오래된 값을 선택하고 점검·재점검한다. 선택은 다음 점검에만 적용된다.

화면 이동으로 세션·버전·점검이 초기화되지 않는다. 단, 앱 재시작·웹 새로고침 후에는 메모리 Mock 세션이 초기화된다.

## Figma 확인과 차이

- 전달된 시작 노드 `2078:317`을 S05로 가정하지 않았다. 기존 분석의 프레임 `2085:461`을 브라우저로 직접 열어 `S05 / 장치 상태 확인`, 412×920, `실험 시작 전 점검`, Orange Pi 5+, 센서 3개와 `실험 측정 시작`을 다시 시각 확인했다.
- 이번 세션에는 Figma 전용 도구 연결이 없어 브라우저로 확인했다. Figma 편집은 수행하지 않았다. 원본 정적 프레임은 점검 성공 예시이며, 실패/대기/재시도는 기존 공통 컴포넌트를 조합해 확장했다.
- SensorCard, SurfaceCard, StatusBadge, FeedbackPanel, AppBar, ActionShelf, Button, SelectField, BottomSheet, StatusBar, AppText를 재사용했다. 배경·글꼴·여백·간격은 기존 Aurora Lab 토큰이다.
- 합성 표시 수치는 원본의 BH1750 18.4 lx, INA219 5.01 V/12 mA/60 mW, BME280 24.3 °C/46%를 사용한다. 안전 임계값으로 사용하지 않는다.
- Mock 안내·세션 정보·시나리오 선택·재점검·원본보다 긴 설명은 의도적 추가다. 원본의 상대 갱신 시간 대신 점검 시각을 표시하며 지속 갱신되는 실측처럼 보이지 않게 했다.
- SensorCard에 pending/통신 오류 변형이 없어 해당 상태는 SurfaceCard와 상태 배지로 표시한다. 오류를 outOfRange로 바꾸거나 미점검을 normal로 표시하지 않았다.
- 웹의 OS 표시줄·Safe Area·스크롤바·실제 글꼴 렌더링은 Figma 기기 프레임과 다르다. 픽셀 단위 일치나 Android 네이티브 정합성까지 검증했다고 주장하지 않는다.

## 테스트 결과

환경: Node 24.3.0, 기존 lockfile·Expo/Jest/Playwright 설정 유지.

| 검사                                       | 결과                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| TypeScript `npm run typecheck`             | 통과                                                                                 |
| ESLint `npm run lint`                      | 오류 없이 통과. `.expo/types/router.d.ts` 생성 파일의 unused eslint-disable 경고 1개 |
| Prettier `npm run format:check`            | 통과                                                                                 |
| Jest `npm run test:ci -- --watchman=false` | 7 suites, 73 tests 통과: 기존 49개 + 신규 24개                                       |
| Playwright `npm run test:e2e`              | 3 tests 통과: 기존 갤러리 1개 + S05 연결/복구 2개                                    |
| `npm run export:android`                   | Android Hermes 번들 생성 통과                                                        |
| `npm run doctor`                           | 19/20 통과. 기존 공통 의존성 정합성 1개 검사 실패 유지                               |

Jest는 S04 미완료·미제출 차단, 같은 세션·고정 버전, 진행 중, 성공, 미연결/오류/timeout/stale, 재시도·이력 보존, 중복 요청, 실행 중 재요청, 잘못된 센서/단위/시각/출처, 재점검 시 이전 성공 무효화, 조회 오류, 화면 재진입, 6/6 근거 표시를 확인했다. 기존 S05 임시 안내 테스트 1개만 실제 화면의 진입 차단 검증으로 바꿨으며 나머지 S04 테스트는 유지했다.

Playwright는 실제 S04→S05→S04 6/6→S05→S06 연결 안내→S05 왕복과 360×800 오류→정상 재점검을 확인했다. 긴 오류 뒤 스크롤한 재점검 버튼의 하단이 고정 시작 버튼 상단보다 위에 있는지도 검사했다.

브라우저 수동 확인: 412×920 정상·진행 중·성공, 360×800 긴 오류와 BME280·재점검·최하단 설명 접근. 하단 스크롤 끝에서 재점검 버튼 하단 y=646, 고정 시작 버튼 상단 y=728로 겹치지 않았다.

캡처는 Git 제외 경로 `artifacts/s05/`의 `success-412x920-top.jpg`, `error-360x800-top.jpg`, `error-360x800-bottom.jpg`와 Playwright 산출물에 보관했다.

## 기존 공통 경고와 미검증

Expo doctor의 설치/권장 버전: expo 58.0.21/~58.0.22, expo-dev-client 58.0.17/~58.0.18, expo-router 58.0.28/~58.0.29, react-native 0.88.0/0.88.1, react-native-screens 4.30.0/~4.30.1. S05 작업에서 패키지·lockfile·검사 설정을 바꾸지 않았다.

Android 네이티브 빌드·설치·실기기·TalkBack·네이티브 글꼴 확대·제스처는 미검증이다. 번들 생성과 웹 확인이 이를 대체하지 않는다. 실제 API·Orange Pi·센서 드라이버·AI·STT/TTS는 연결하지 않았다.

## 통합 메모

기능 내부 계약, Repository 교체, 아직 합의되지 않은 최신성·시각·시작 조건·API DTO와 팀원 질문은 `src/features/researcher-workflow/INTEGRATION.md`에 기록했다. 필드명과 상태 이름은 팀의 확정 API 계약으로 간주하지 않는다.
