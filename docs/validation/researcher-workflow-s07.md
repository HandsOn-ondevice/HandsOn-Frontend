# S07 모호한 음성 확인 구현·검증

검증일: 2026-11-02. 브랜치 `feat/researcher-workflow`, 시작 HEAD `bc75cde`.
구현 전 GitHub 같은 작업 브랜치도 `bc75cdefa9b0f3c5408ca4f68b5633e9620c45b9`임을 확인했다.
시작 작업 트리는 깨끗했으며 이번 작업은 스테이징·커밋·push·PR·병합 없이 진행했다.

## Figma에서 직접 확인한 역할

[S07 2085:652](https://www.figma.com/design/PDVmFhYGwSHs6ZrQmsowek/?node-id=2085-652)을 브라우저에서 선택·확대해 확인했다.
프레임 크기는 412×920, 배경은 surface/canvas다. 화면명은 **모호한 음성 확인**이다.

- 상단 AppBar, 실험명, 조건·회차.
- 흰 질문 카드: 마이크 아이콘, “다시 해줘”가 어떤 뜻인지 확인, 모호한 명령은 실행하지 않고 현재 상태를 유지한다는 문구.
- 현재 안내를 다시 듣기 / 같은 조건·회차 다시 측정 / 아무것도 하지 않기.
- 단계·회차 보존 설명과 하단 현재 작업으로 돌아가기 버튼.

S06 `2085:528`에서 현재 실행 컨텍스트를 받고 S06으로 복귀하는 역할로 구현했다.
주변 보드 배치는 살펴봤지만 별도 S07 로딩·오류 전용 프레임, 각 버튼의 서버 실행 계약이나
프로토타입 전환 규칙까지 확정하지는 못했다. 복구 참고 `2092:2260` 및 S08 이후 기능은 구현하지 않았다.
Figma 속성 전체를 수치 추출하거나 픽셀 단위 일치를 검증하지 않았다.

## 구현과 의도된 차이

- 기존 Aurora Lab AppBar, SurfaceCard, Icon, Button, AppText, ActionShelf, BottomSheet, StatusBar와 토큰을 재사용했다. 공통 컴포넌트 수정 없음.
- Figma의 50% 2회차는 정적 예시다. 실제 고정 세션의 조건·회차·절차 버전·실험명을 사용하며 가짜 이력을 채우지 않는다.
- Figma의 재측정 강조를 기본 선택으로 적용하지 않는다. 초기에는 미선택이며 하단 버튼은 비활성이다. 선택한 뒤 ‘현재 작업으로 돌아가기’로 확정하는 동작을 설명했다.
- Mock 표시, 세션·버전, 선택 전/후 안내, 명시적 취소, 오류·재조회 UI를 추가했다. 콘텐츠가 길면 스크롤한다.
- 마이크는 시각 아이콘이다. 실제 녹음·STT·AI 해석은 수행하지 않는다. 현재 발화는 S06의 고정 ‘다시 해줘’ 예시이며 긴 발화 표시도 Jest로 검증했다.
- 안내 반복은 시뮬레이션 결과만 표시한다. 재측정은 같은 회차의 새 Mock 응답을 요청하며 실제 PWM·센서·안전 타이머를 실행하지 않는다.

## 상태 전환과 보호 조건

1. S06 requestVoiceClarification은 sessionId에 속한 commandId, 발화, 커서, 출처, 생성 시각과 최신 sampleAttemptId를 고정한다. 미처리 동안 S06 완료를 차단한다.
2. S07 선택만으로 Repository를 갱신하지 않는다. 하단 확정 시 resolveVoiceClarification(commandId, choice)를 보낸다.
3. S05 시작 조건, 현재 커서 전체, 출처, 최신 응답 토큰, 시각 형식, 이미 처리한 ID 여부를 도메인/Repository에서 검증한다. 오래된 컨텍스트는 확정하지 않는다. 경과 시간 TTL은 미확정이므로 임의 설정하지 않았다.
4. repeatGuidance/doNothing은 측정·커서·진행률을 유지한다. cancel도 실행 없이 상태를 유지하고 취소 이력만 추가한다.
5. remeasure는 의미 확인과 새 응답 접수를 원자적으로 처리한다. 기존 ready 응답은 superseded로 보존하며 응답 수신은 기존 S06 비동기 엔진으로 처리한다. 실패·보류를 자동 완료로 바꾸지 않는다.
6. 사용자 의미 확인은 human/source=mock 근거다. 기존 S04/S05 근거 및 S06 측정 이력은 보존한다. S07은 measurementConfirmed/measurementAccepted나 실험 단계 완료를 만들지 않는다.
7. 같은 요청·선택의 재전송은 새 requestId여도 재적용하지 않는다. 다른 선택으로 재처리하면 REQUEST_CONFLICT다. 이전 중복 확인이 새 pendingVoice를 지우지 않는다.
8. 확정·명시적 취소 후 같은 세션의 S06으로 dismissTo한다. 기존 화면을 재사용하고 없으면 replace한다. 브라우저 자체 뒤로가기는 확정·취소로 처리하지 않는다. S06에서 미처리 요청을 다시 열 수 있다. 네이티브 제스처는 미검증이다.

새로고침·앱 재시작 및 일부 코드 Fast Refresh에서 메모리 Mock 세션은 초기화될 수 있다.
직접 브라우저 확인 중 코드 포맷 변경으로 세션이 초기화되어 새 세션을 생성한 뒤 검증을 재개했다.
영속 복원 기능이 완료된 것으로 표시하지 않는다.

## 테스트 결과

Node.js 24.3.0 사용. 기존 검사 설정을 수정하거나 우회하지 않았다.

| 검사                                       | 결과                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| TypeScript `npm run typecheck`             | 통과                                                                           |
| ESLint `npm run lint`                      | 오류 0, 기존 `.expo/types/router.d.ts` unused eslint-disable 경고 1            |
| `npm run format:check`                     | 통과                                                                           |
| Jest `npm run test:ci -- --watchman=false` | 10 suites / 111 tests 통과. 기존 94개와 S07 17개                               |
| Playwright `npm run test:e2e`              | 8개 통과. 기존 5개와 S07 3개                                                   |
| `npm run export:android`                   | 통과. 1,953 modules, Hermes Android 번들 4.4MB, dist 생성                      |
| Expo doctor                                | 재실행하지 않음. 이전 공통 정합성 19/20 기록과 구분, 패키지/lockfile 변경 없음 |
| Android 네이티브 빌드·설치·실기기          | 미검증                                                                         |
| 아이폰 Expo Go·실제 음성·센서·Orange Pi    | 미검증 / 실제 연동 미구현                                                      |

Jest: 세 선택지·취소, 명시적 확정 전 무변경, 세션/절차/커서/측정 보존, 중복 요청·다른 선택 거절,
오래된 커서/응답 토큰/출처/시각 거절, 다른 세션·미점검 우회 차단, 재측정 기록 보존·비동기 실패,
새 요청을 과거 확인으로 지우지 않음, 재진입 미재실행, 긴 발화·전송 오류·재시도·처리 중 중복 클릭.

Playwright: 412×920의 선택·확정·재측정·진행률 유지·이후 명시적 S06 완료,
360×800의 취소·브라우저 뒤로가기·재진입·앱바 취소·최하단 버튼 미겹침·가로 넘침 없음,
잘못된 세션의 오류/재조회와 실행 차단. 기존 S04~S06/갤러리도 회귀 통과했다.
localhost·브라우저 접근을 위해 승인된 샌드박스 외 실행을 사용했다.

자동 캡처: `artifacts/playwright/test-results` (Git 제외).
직접 확인 캡처: `artifacts/s07/s07-choice-412x920.jpg` (Git 제외).

## 웹에서 직접 확인

1. 기존 서버 `http://localhost:8081/researcher-workflow`에서 새 Mock 실험 시작.
2. S04 작업자 확인 5개→S05 점검 성공→실험 측정 시작.
3. S06에서 음성 명령 시뮬레이션 패널을 눌러 S07 진입.
4. 아무것도 선택하지 않았을 때 하단 버튼 비활성 확인.
5. 선택지를 누른 뒤 하단 버튼으로 확정하거나, 앱바 뒤로가기/선택하지 않고 취소로 복귀.
6. 재측정은 같은 회차를 유지하며 Mock 응답을 새로 받는다. 응답이 ready여도 S06 완료 요청 전까지 진행률은 증가하지 않는다.

실제 S07 경로는 `/researcher-workflow/[sessionId]/voice-clarification`이다.
기존 `voice-confirmation-pending` URL과 VoiceClarificationConnectionScreen import는 호환 연결로 유지했다.

## 통합 경계

기존 WorkflowRepository, WorkflowProvider, useWorkflowSession을 재사용했다.
서버 후보/발화 DTO, 해석 버전, commandId 수명·TTL, 실제 장치 작업 상태, 영속 복원,
S08 이후/E 화면 연결은 미확정이다. [통합 메모](../../src/features/researcher-workflow/INTEGRATION.md)에 구현된 내부 계약과 협의할 사항을 구분했다.
실제 API 구현체는 같은 메서드를 유지하되 사용자 확인과 실제 장치 작업을 별개로 처리해야 한다.

## 신규·수정 파일 전체 목록

신규 7개:

- `src/features/researcher-workflow/domain/voice-clarification.ts`: 선택/처리 이력 모델과 유효 요청 선택자.
- `src/features/researcher-workflow/infrastructure/mock/voice-clarification-transitions.ts`: 확정·취소·중복 검증과 근거 기록.
- `src/features/researcher-workflow/screens/VoiceClarificationScreen.tsx`: 실제 S07 조합 화면.
- `src/app/researcher-workflow/[sessionId]/voice-clarification.tsx`: 실제 S07 진입/복귀 라우트.
- `__tests__/researcher-workflow-voice.test.tsx`: S07 도메인·Repository·화면 테스트.
- `e2e/researcher-workflow-s07.spec.ts`: S07 웹 흐름·모바일 크기·오류 검증.
- `docs/validation/researcher-workflow-s07.md`: 이번 검증 기록.

수정 12개:

- `src/features/researcher-workflow/domain/execution.ts`: 확인 요청의 응답 토큰, 선택 이력, S06 대기 안내.
- `src/features/researcher-workflow/domain/models.ts`: 선택 확정 명령·확인/취소 근거·이벤트 상관 ID.
- `src/features/researcher-workflow/infrastructure/mock/MockWorkflowRepository.ts`: 확정·취소 명령, 재측정 원자적 접수·비동기 처리.
- `src/features/researcher-workflow/infrastructure/mock/execution-transitions.ts`: 요청 당시 sampleAttemptId 고정, 기존 취소 명령 위임.
- `src/features/researcher-workflow/screens/VoiceClarificationConnectionScreen.tsx`: 기존 import 호환 export.
- `src/features/researcher-workflow/screens/ExecutionScreen.tsx`: S07 Mock 처리 결과 안내.
- `src/features/researcher-workflow/screens/DevelopmentEntryScreen.tsx`: S07 제공 범위 문구.
- `src/app/researcher-workflow/[sessionId]/execution.tsx`: 실제 S07 경로 연결.
- `src/app/researcher-workflow/[sessionId]/voice-confirmation-pending.tsx`: 기존 경로 Redirect.
- `__tests__/researcher-workflow-execution-screen.test.tsx`: 실제 S07 취소 UI와 추가된 취소 이력을 검증하도록 기대값 갱신.
- `e2e/researcher-workflow-s06.spec.ts`: 실제 S07 경로·화면명·취소 버튼 기대값 갱신.
- `src/features/researcher-workflow/INTEGRATION.md`: S07 내부 계약과 팀원 협의 사항.

S04/S05 완료 조건, 공통 디자인 시스템, src/dev, 루트 진입/Provider, 다른 팀원 화면,
package.json/lockfile, Expo·CI·테스트 설정, 네이티브 생성 폴더는 변경하지 않았다.
S08 이후 실제 화면과 명령도 구현하지 않았다.
