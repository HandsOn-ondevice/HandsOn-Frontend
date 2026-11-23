# S06 실험 진행 구현·검증

검증일: 2026-11-02. 브랜치 `feat/researcher-workflow`, 작업 시작 HEAD `61053c0`.
이 작업에서는 스테이징·커밋·push·병합을 수행하지 않는다.

## 구현 범위

- S04→S05→S06에서 같은 sessionId·고정 절차 v1.2·기존 근거/이벤트를 유지한다.
- S05 시작 수락 시에만 실행 상태를 초기화한다. S06 진입은 조회·구독이며 미점검·실행 정의 누락은 진행하지 못한다.
- 현재 출력 조건·회차, 작업 안내와 진행률, 현재 회차의 센서 응답, 명시적 완료 요청을 제공한다.
- 정상·안정화 대기·오래된 값·응답 없음·통신 오류·작업 보류를 선택하고 Mock 응답 확인을 요청할 수 있다. 오류나 보류는 정상 응답 재요청 전까지 유지한다.
- ready 응답과 작업자 완료 요청이 함께 있어야 유효 측정이 추가되고 다음 회차로 진행한다. 중복 요청·이전 커서·이전 응답 토큰은 중복 완료를 만들지 않는다.
- 실패·대체된 응답·유효 측정 이력은 모두 보존한다. human 확인과 sensor/program 근거를 구분하고 모두 Mock 출처를 표시한다.
- 음성 패널의 ‘다시 해줘’는 고정 예시다. S07 임시 연결은 대기 요청을 표시하고 명령 실행 없이 취소 복귀만 제공한다.
- 일시정지·재개, 오류 복구 절차, 종료 검토·장치 정리·결과 제출, 실제 S07 의미 선택은 구현하지 않았다.
- 실제 PWM·센서·안전 타이머·AI·STT/TTS를 구현하지 않았다. 반복 측정을 다 마쳐도 실험 종료·제출 완료로 변경하지 않는다.

## Figma 확인과 차이

Figma 브라우저에서 다음 프레임의 시각 구성을 직접 확인했다. MCP 기반 수치 추출은 사용할 수 없어 픽셀 단위 속성을 모두 검증하지는 못했다.

| 프레임                                                                                        | 확인한 내용                                                                                                                                         |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [S06 2085:528](https://www.figma.com/design/PDVmFhYGwSHs6ZrQmsowek/?node-id=2085-528)         | 핵심 실행 화면, 실험명·절차 버전, 단계 진행률, 출력별 회차, 현재 작업 안내, BH1750/INA219 전압·전류/BME280 카드 4개, 음성 패널, 안내 반복·완료 요청 |
| [S07 2085:652](https://www.figma.com/design/PDVmFhYGwSHs6ZrQmsowek/?node-id=2085-652)         | 모호한 ‘다시 해줘’의 의미 선택. 모호한 명령은 실행하지 않고 현재 상태를 유지                                                                        |
| [관련 상태 2092:2260](https://www.figma.com/design/PDVmFhYGwSHs6ZrQmsowek/?node-id=2092-2260) | 복구 후 다시 측정 안내. 자동 완료가 아니라 새 측정·완료 요청 필요                                                                                   |

`src/dev/ExecutionExample.tsx`와 갤러리는 변경하지 않았다. AppBar, StepProgress,
ConditionProgress, FeedbackPanel, MetricTile, VoicePanel, ActionShelf, BottomSheet 등 기존 컴포넌트와 토큰을 재사용했다.

의도된 차이:

- Figma의 50% 2회차·11/16 진행률은 예시다. 승인된 전체 16단계 정의가 없어 현재 구현은 Mock 초안의 유효 측정 0/15·0% 1회차부터 시작한다. 기존 이력을 가짜로 채우지 않는다.
- 출력 단계·3회 반복·5초는 Mock 초안 설정이며 공식 안전 규칙이 아니다. 화면에서 초안과 실제 제어 부재를 표시한다.
- Figma 정적 센서값 대신 현재 회차 응답이 없으면 ‘—’로 표시하고 완료 요청을 비활성화한다. 작업자가 별도 Mock 응답 요청 후 완료해야 한다.
- 현재 절차 스냅샷의 실험명을 사용한다. 추가된 Mock/시각/진행 불가 사유·개발 시나리오 선택 때문에 Figma보다 콘텐츠가 길어 스크롤이 필요하다.
- S07은 실제 디자인의 의미 선택 버튼을 구현하지 않고 미구현 안내와 취소 복귀만 제공한다.

추후 디자인 보정: 전체 워크플로 진행률 정의 합의, 정식 절차 문구·확인 근거 행 배치,
카드 높이·타이포그래피·간격의 픽셀 비교. 공통 디자인 시스템은 수정하지 않는다.

## 상태와 Repository

도메인 `execution.ts`가 진행률·완료 가능 여부와 미완료 이유를 계산한다.
Mock의 `execution-transitions.ts`가 응답 접수·결과 저장·명시적 완료·음성 대기/취소를 처리한다.
UI는 기존 useWorkflowSession과 WorkflowProvider를 사용하며 전역 Provider나 의존성을 추가하지 않았다.

기존 WorkflowRepository 메서드를 유지하면서 command/event union과 선택적 execution 상태를 확장했다.
실제 API 구현은 같은 메서드의 접수 응답과 구독 결과를 내부 상태로 변환한다.
자세한 내부 계약과 미확정 사항은 [통합 메모](../../src/features/researcher-workflow/INTEGRATION.md)를 참고한다.

Mock 세션은 메모리 전용이다. 화면 왕복·unmount 동안 결과를 보존하지만 새로고침·앱 종료 후 영속 복원을 보장하지 않는다.
stale 상태·현재 요청 전 관측값은 거절하며 실제 TTL·시계 오차·안전 범위는 아직 확정하지 않았다.

## 검증 시나리오와 결과

Node 24.3.0 사용. 공통 설정과 기존 테스트 기준을 우회하지 않았다.

| 검사                                       | 결과                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| TypeScript `npm run typecheck`             | 통과                                                                                  |
| ESLint `npm run lint`                      | 오류 0, 기존 생성 파일 `.expo/types/router.d.ts` unused eslint-disable 경고 1         |
| `npm run format:check`                     | 통과                                                                                  |
| Jest `npm run test:ci -- --watchman=false` | 9 suite / 94 tests 통과. 기존 73개 + S06 21개                                         |
| Playwright `npm run test:e2e`              | 5개 통과. 기존 갤러리·S04/S05 3개와 S06 2개                                           |
| `npm run export:android`                   | 통과. 1,950 modules, Android Hermes 번들 4.4MB, `dist/` 생성                          |
| Expo doctor                                | 이번 작업에서 재실행하지 않음. 이전 정합성 19/20 기록 유지, 패키지/lockfile 수정 없음 |
| 실제 Android 빌드·설치·실기기 실행         | 미검증                                                                                |

Jest: S05 우회 차단, 첫 커서·절차 버전 유지, 응답만으로 사람 근거 미생성,
명시적 완료와 진행률, 동일 요청/토큰 중복 차단, 오류·보류·대기·무응답·stale와 재요청,
대체된 응답 재사용 차단, 지연 결과·재진입, 출처·커서·누락·과거 관측값 검증,
S07 대기/취소 시 커서·근거 보존, 전체 반복 후 실험 종료 미처리.

웹 UI: 412×920 정상 응답·완료·S05 복귀·S07 왕복, 360×800 긴 보류 문구·최하단 스크롤·하단 버튼 미겹침·가로 overflow 없음·정상 재요청을 검증했다.
처음 발견된 S07 복귀 시 S06 스택 중복은 dismissTo로 수정하고 전체 웹 테스트로 재확인했다.
샌드박스의 localhost 제한 때문에 Playwright는 승인된 샌드박스 외 실행으로 검증했다.
테스트 캡처는 Git 제외 경로 `artifacts/playwright/test-results`에 저장된다.
Chrome에서도 412×920의 실제 뷰포트를 확인하고 초기 상태와 정상 Mock 응답·완료 버튼 활성화를 직접 확인했다.
정상 상태 캡처: `artifacts/s06/s06-ready-412x920.jpg`.

## 직접 실행

1. Node 24.3.0에서 `npm run web -- --localhost --port 8081`.
2. `http://localhost:8081/researcher-workflow`에서 새 Mock 실험 시작.
3. S04 작업자 확인 5개→확인 완료→S05 점검 시작→Mock 성공→실험 측정 시작.
4. S06에서 현재 회차 Mock 응답 확인→완료 요청. 다음 회차 0% 2회차·유효 측정 1/15를 확인.
5. 개발용 시나리오 선택에서 실패/보류/오래된 값을 골라 완료 차단을 확인하고 정상 응답으로 다시 요청.
6. 음성 패널→S07 미구현 안내→실행 없이 복귀. 회차·진행률·근거가 유지되는지 확인.

## 변경 파일과 보호 범위

신규:

- `src/features/researcher-workflow/domain/execution.ts`: 초안 정의·커서·응답·시도·음성 요청 모델, 선택자/검증.
- `src/features/researcher-workflow/infrastructure/mock/execution-transitions.ts`: Mock 실행 전환과 근거 기록.
- `src/features/researcher-workflow/infrastructure/mock/execution-scenarios.ts`: 합성 응답·오류·대기 시나리오.
- `src/features/researcher-workflow/screens/ExecutionScreen.tsx`: S06 조합 화면.
- `src/features/researcher-workflow/screens/ExecutionMetrics.tsx`: 현재 회차 센서 카드.
- `src/features/researcher-workflow/screens/MockExecutionScenarioControl.tsx`: 개발 전용 Mock 선택.
- `src/features/researcher-workflow/screens/VoiceClarificationConnectionScreen.tsx`: S07 최소 안내.
- `src/app/researcher-workflow/[sessionId]/execution.tsx`: 실제 S06 라우트.
- `src/app/researcher-workflow/[sessionId]/voice-confirmation-pending.tsx`: S07 연결 라우트.
- `__tests__/researcher-workflow-execution.test.tsx`: 도메인/Repository 테스트.
- `__tests__/researcher-workflow-execution-screen.test.tsx`: 화면 조작·재진입 테스트.
- `e2e/researcher-workflow-s06.spec.ts`: 모바일 웹 흐름·레이아웃 테스트.
- `docs/validation/researcher-workflow-s06.md`: 이번 검증 기록.

수정:

- `src/features/researcher-workflow/domain/models.ts`: 선택적 실행 필드와 명령·이벤트·근거 확장.
- `src/features/researcher-workflow/infrastructure/mock/MockWorkflowRepository.ts`: 실행 명령/시나리오/비동기 응답 처리.
- `src/features/researcher-workflow/infrastructure/mock/device-check-transitions.ts`: 기존 시작 수락에 실행 커서 초기화 추가.
- `src/features/researcher-workflow/infrastructure/mock/fixtures.ts`: 출처가 명시된 초안 실행 설정.
- `src/features/researcher-workflow/screens/DevelopmentEntryScreen.tsx`: 제공 화면 범위 설명.
- `src/features/researcher-workflow/screens/DeviceCheckConnectionScreen.tsx`: 이미 실행 중인 세션의 복귀 버튼 명칭.
- `src/features/researcher-workflow/screens/ExecutionConnectionScreen.tsx`: 기존 import를 실제 S06으로 연결하는 호환 export.
- `src/app/researcher-workflow/[sessionId]/device-check.tsx`: 시작 후 실제 S06으로 이동.
- `src/app/researcher-workflow/[sessionId]/execution-pending.tsx`: 기존 URL의 Redirect.
- `__tests__/researcher-workflow-device-screen.test.tsx`: 기존 S06 직접 진입 차단 기대값을 실제 화면으로 갱신.
- `e2e/researcher-workflow-s05.spec.ts`: 기존 S05→S06 연결과 복귀 기대값만 갱신.
- `src/features/researcher-workflow/INTEGRATION.md`: S06 내부 계약·협의 사항 추가.

총 신규 13개·수정 12개. S04/S05 완료 조건, 공통 디자인 시스템, 갤러리/S06 정적 예제,
루트 진입점/Provider, 팀원 화면, package.json/lockfile, Expo/CI 설정, 네이티브 생성 폴더는 변경하지 않았다.
