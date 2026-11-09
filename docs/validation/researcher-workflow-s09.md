# S09 복구 후 재측정 검증 — 2026-11-08

## 범위와 기준

- 기준 HEAD는 S08 `101ea9d2614910296b45a80c4b2c2dba9a3e4076`, 브랜치는 `feat/researcher-workflow`다. main 통합은 취소된 상태에서 구현했다.
- S06 오류 → S08 재확인 → S09 → 동일 커서 새 측정 → S06 명시적 완료를 구현한다. S10 이후, 실제 센서·장비 제어·AI·STT/TTS는 포함하지 않는다.
- Figma 최종 영역 `2126:4153`의 [S09 / 복구 후 재측정 · 2085:814](https://www.figma.com/design/PDVmFhYGwSHs6ZrQmsowek?node-id=2085-814)를 Chrome에서 선택해 412×920, surface/canvas `#F1F5FD`, 안내·센서·이력·음성 영역·단일 하단 버튼을 확인했다. 파일 내용은 수정하지 않았다.
- 프로토타입의 S08 센서 다시 확인(`2085:809`)은 S09, S09 다시 측정(`2085:905`)은 S06 Recovered measurement(`2092:2260`), S09 back(`2093:2930`)은 S08로 연결된다. `2092:2260` 자체는 최종 S09가 아니다. S10(`2086:739`)은 별도 일시정지 화면이며 자동 연결하지 않는다.

## 상태와 근거

- `purpose=measurement/recoveryCheck/remeasurement`와 재측정의 `recoveryId`를 추가했다. 기존 purpose 없는 일반 기록과 recoveries의 sampleAttemptId도 구분한다.
- 복구 확인 응답은 canComplete=false다. S06 일반 요청 및 S07 의미 확인 우회도 막는다. 전용 명령은 현재 성공한 복구 기록·커서·응답의 관계를 검증하고 새 attemptId를 만든다.
- 새 요청과 ready 응답만으로 완료 수는 늘지 않는다. completeExecutionStep만 현재 재측정 응답을 valid로 수락한다. 정상 S06의 기존 완료 흐름은 유지한다.
- 과거 valid/held/error 시도, 원본 report, 고정 절차, 근거, 이벤트, S07 선택을 보존한다. 새 요청 시 기존 ready 응답을 superseded로 바꾸는 기존 정책은 유지한다.
- 재측정 응답은 원래 복구 확인값과 다른 요청 ID·커서·단위·출처·요청~수신 시각을 검사한다. 과거 값과 미래 값은 거절한다. TTL과 안전 임계값은 추가하지 않았다.
- S08 명시적 재확인 요청이 성공하면 S09로 이동한다. 실패는 S08에 남는다. 이전 성공 상태로 재진입할 때는 버튼으로 S09를 열어 뒤로 가기 순환을 방지한다.
- S09 조회·뒤로 가기·재진입은 새 명령을 만들지 않는다. 중복 클릭의 측정 요청뿐 아니라 화면 이동도 한 번만 처리한다. 진행 중 이탈 후에도 Repository가 작업과 결과를 유지한다.

## Figma 재사용과 차이

- AppBar, FeedbackPanel, SensorCard, TimelineItem, VoicePanel, ActionShelf, BottomSheet, Button과 기존 의미 토큰을 재사용했다. 공통 컴포넌트를 복사하거나 변경하지 않았다.
- 예시 50%·2회차·423 lx·시각을 고정하지 않는다. 정상 세션은 기존 0/6 준비부터 생성하며, 50%·2회차 검증은 실제 앞선 7회차를 완료해 만든다.
- 이력의 사람 기록은 '센서 재확인 요청'이다. Figma의 물리적 I2C 재연결·전원 복구 확인을 사실로 표시하지 않는다.
- stable 응답을 '안정화 응답 확인'으로 표시한다. 근거 없는 5/5초 경과 타이머와 실제 장비 안전 확인을 표시하지 않는다.
- 공통 SensorCard의 '정상' 접두사와 TimelineItem의 오른쪽 무효/복구/유효 라벨은 유지한다. 이력의 유효 표시는 복구 응답 검증을 뜻하며 회차 완료를 뜻하지 않는다. 부제에 미완료임을 명시한다.
- 시각은 실제 기록의 기기 로캘 표현, 상대 경과 시간은 기존 useMeasurementAge를 사용한다. 실패·재시도 수에 따라 이력이 길어지면 스크롤하며 잘라내지 않는다.
- 음성 영역은 준비 상태와 버튼 안내다. 실제 녹음은 하지 않으며, 누르면 미연결 안내를 제공한다. 개발용 응답 제어·합성 데이터 안내는 기존 정보 시트 경계에 둔다.

## 검증

다음은 S09 최초 구현의 검증 기록이다. 후속 S08 상태 표시 보완의 최신 결과는 문서 하단에 별도로 기록한다.

| 검사            | 결과                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------- |
| TypeScript      | 통과. 최초 신규 라우트 생성 타입 누락은 Expo 웹 서버의 자동 생성 후 재검사로 통과        |
| 전체 Jest       | 15 suites / 185개 통과: 기존 167개 + S09 18개                                            |
| ESLint          | 오류 0개 / 기존 `.expo/types/router.d.ts` 경고 1개                                       |
| Playwright 직렬 | 전체 13개 통과 + 마지막 설명 문장 전체의 하단 비겹침을 강화한 S09 레이아웃 1건 추가 통과 |

- Jest는 복구 확인값 직접 완료·일반 측정·음성 우회 차단, 정상 S06 완료, 새 시도와 복구 연결, 중복·오래된 revision·다른 커서/복구/세션, 응답 ID·시각·단위·출처 오류, 재실패·안정화 대기, 이탈·재진입·이력 보존을 검사한다.
- 기존 execution/recovery 테스트의 '복구 확인만으로 완료 가능' 단언은 '확인 뒤에도 차단 → 새 재측정 뒤에만 가능'으로 강화했다. 기존 실패 응답·이력·완료 횟수 단언은 유지했다.
- 기존 S06/S08 E2E의 직접 S06 복귀를 S09와 별도 재측정으로 변경했다. 새 S09 E2E는 412×920·360×800, 하단 겹침·가로 넘침, 뒤로 가기·직접 S06 우회 차단·재실패·없는 세션을 검증한다.
- 초기 Jest 1건은 중복 클릭의 이중 화면 이동을 찾아 수정했다. 초기 전체 Jest 4건은 이전 복구 완료 계약을 기대해 실패했으며 단언을 강화했다. 초기 직렬 E2E 4건은 숨겨진 S08과 활성 S09의 동명 문구 선택자 중복이었다. S09 화면 범위를 명시해 수정했으며 `.first()`나 시간 제한 완화로 우회하지 않았다.
- 진단 경로: `artifacts/playwright/diagnostics/s09-20261108-b2edce7b/`. 초기 및 수정 후 결과를 서로 다른 파일·폴더에 보존한다.
- 두 번째 직렬 검사는 12개 통과·1개 실패였다. 새 S09 준비 도우미가 화면 전환 중 이전 화면의 더 보기 버튼을 선택했다. 목적지 URL 확인 및 화면 testID 범위 지정으로 해결했으며 제한 시간·애니메이션 설정을 바꾸지 않았다. 최종 전체 직렬 검사는 13개 통과했다.
- 최종 로그: `jest-verified.log`(185개), `typecheck-verified.log`, `lint-verified.log`, `format-check.log`, `playwright-serial-final.log`(13개), `playwright-layout.log`(1개). 마지막 설명 전체의 boundingBox가 하단 버튼 위에 있는지 검사하며 가로 넘침도 검사했다. 마지막 레이아웃 보완은 E2E 단언만 강화했으며 제품 코드는 전체 13개 통과 시점과 같다.
- 최종 캡처는 `serial-final-results/`의 412×920(실제 0%·1회차 및 50%·2회차)와 `layout-results/`의 360×800 하단 상태를 직접 열어 확인했다. 50%·2회차는 재확인 실패 이력도 포함하므로 기본 3개 이력 예시보다 길어 스크롤이 필요하다.

## 변경 파일과 보존

수정 17개·신규 7개, 총 24개다. 스테이징·커밋·push는 수행하지 않았다.

| 구분 | 경로                                                                                | 이유                                    |
| ---- | ----------------------------------------------------------------------------------- | --------------------------------------- |
| 신규 | `src/app/researcher-workflow/[sessionId]/remeasurement.tsx`                         | S09 라우트와 S08/S06 복귀               |
| 신규 | `src/features/researcher-workflow/screens/RemeasurementScreen.tsx`                  | 공통 컴포넌트 기반 S09 화면             |
| 신규 | `src/features/researcher-workflow/domain/remeasurement.ts`                          | 진입·재측정 조건과 실제 기록 조회       |
| 신규 | `src/features/researcher-workflow/infrastructure/mock/remeasurement-transitions.ts` | 복구 ID를 검증한 새 측정 접수           |
| 신규 | `__tests__/researcher-workflow-remeasurement.test.tsx`                              | S09 도메인·Repository·화면 18개 검사    |
| 신규 | `e2e/researcher-workflow-s09.spec.ts`                                               | 정상·재실패·없는 세션 및 레이아웃       |
| 신규 | `docs/validation/researcher-workflow-s09.md`                                        | 검증·디자인 차이·보존 기록              |
| 수정 | `src/app/researcher-workflow/[sessionId]/recovery.tsx`                              | S08 성공의 S09 이동 콜백                |
| 수정 | `src/app/researcher-workflow/[sessionId]/execution.tsx`                             | S06에서 재측정 필요 시 S09 연결         |
| 수정 | `src/features/researcher-workflow/screens/RecoveryScreen.tsx`                       | 명시적 요청 성공 이동·재진입 순환 방지  |
| 수정 | `src/features/researcher-workflow/screens/ExecutionScreen.tsx`                      | 완료 차단 안내·S09 연결 및 화면 testID  |
| 수정 | `src/features/researcher-workflow/domain/models.ts`                                 | 전용 명령 타입                          |
| 수정 | `src/features/researcher-workflow/domain/execution.ts`                              | 시도 목적·복구 연결·우회 차단           |
| 수정 | `src/features/researcher-workflow/domain/recovery.ts`                               | 복구 성공과 회차 완료 가능 여부 분리    |
| 수정 | `src/features/researcher-workflow/domain/voice-clarification.ts`                    | 재측정 필요 중 음성 우회 차단           |
| 수정 | `src/features/researcher-workflow/infrastructure/mock/MockWorkflowRepository.ts`    | 전용 명령과 비동기 응답 연결            |
| 수정 | `src/features/researcher-workflow/infrastructure/mock/execution-transitions.ts`     | 목적·연결 ID 기록과 응답 검증           |
| 수정 | `src/features/researcher-workflow/infrastructure/mock/recovery-transitions.ts`      | 복구 확인 시도 명시                     |
| 수정 | `__tests__/researcher-workflow-execution.test.tsx`                                  | 복구 확인만으로 완료하는 이전 계약 변경 |
| 수정 | `__tests__/researcher-workflow-execution-screen.test.tsx`                           | S08→S09→S06 화면 흐름 강화              |
| 수정 | `__tests__/researcher-workflow-recovery.test.tsx`                                   | 완료 차단·별도 재측정·기존 이력 검증    |
| 수정 | `e2e/researcher-workflow-s06.spec.ts`                                               | 보류 복구 후 S09 경유 검증              |
| 수정 | `e2e/researcher-workflow-s08.spec.ts`                                               | S09 경유와 실제 50%·2회차 캡처          |
| 수정 | `src/features/researcher-workflow/INTEGRATION.md`                                   | 승인된 최신 계약·API adapter 요구사항   |

- 기존 워크플로 47개 중 승인된 연결·도메인·문서 12개를 수정했고 다른 35개는 원본 해시를 유지했다. 과거 상태의 바이트 보존을 주장하는 대신 정상 기능·기록 보존을 회귀 테스트로 확인했다.
- 작업 시작 전 `.idea/` 및 진단 파일 409개의 해시를 보존했다. 기존 node_modules 백업의 원래 42개 하위 항목과 루트 inode도 유지했다.
- 공통 디자인 시스템·RootLayout·Gallery·ExecutionExample·패키지·Playwright 설정·CI diff는 0개다. 로컬 및 원격 추적 브랜치 참조도 동일하다. 진단 생성물은 스테이징 대상이 아니다.

## 남은 검증과 한계

- 기존 병렬 Playwright 폰트/응답 손상의 근본 원인은 미확정이다. 이번에는 병렬 검증이나 별도 폰트 진단을 실행하지 않는다.
- Android 실기기·iOS·Orange Pi 및 실제 서비스 연동은 미검증이다. 웹 서버의 simctl 미설치 경고는 웹 검사와 별개다.
- Mock 세션은 메모리 기반이며 새로고침 후 영속 복원을 제공하지 않는다. 실제 API의 장비 시계·복구 승인·timeout·재접속·멱등 키 보존·권한 계약은 별도 합의가 필요하다.
- S01과의 세션 계약 및 main 통합은 이번 작업 범위가 아니다.

## S08 센서 상태 표시 보완 — 2026-11-08

- RecoveryScreen의 표시 매핑만 보완했다. 재확인 중이거나 응답 검증이 실패했다는 이유로 연결 끊김을 추정하지 않는다.
- SensorCard는 진단에 명시된 disconnected, stale 및 검증된 복구 성공 normal에 사용한다. 재확인 중·통신 오류·응답 없음·검증 실패·상태 미확인은 기존 SurfaceCard, StatusBadge, AppText 조합으로 표시한다. 안정화 대기와 작업 보류도 해당 사유를 구분한다.
- 공통 컴포넌트·스타일·토큰을 복사하거나 수정하지 않았다. Repository·도메인·복구 전이·측정 이력·S09 재측정 계약도 이번 보완에서 변경하지 않았다.
- S04~S09를 재검토했으며 별도 Pressable/Touchable 버튼·카드·배지나 고정 색상·글자 크기로 공통 UI를 대체한 사례를 발견하지 못했다. S07 질문 카드는 기존 SurfaceCard와 Icon의 조합이다. S06 간격 차이와 S07 radius의 spacing 토큰 사용은 P2로 남기고 수정하지 않았다.
- Figma와 남은 공통 기본 표현 차이인 SensorCard의 상태 접두사와 TimelineItem의 대기/무효/복구/유효 라벨을 유지한다. 이번에는 Figma 원본을 다시 확인하지 않았으며 픽셀 일치를 주장하지 않는다.

| 검사            | 결과                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| S08 관련 Jest   | 24개 통과. 기존 응답 ID·시각·단위·출처 오류 검사에 렌더링 단언을 추가하고, 상태별 검사 7개를 추가      |
| 전체 Jest       | 15 suites / 192개 통과. 기존 185개와 신규 7개                                                          |
| TypeScript      | 최종 검사 통과                                                                                         |
| ESLint          | 오류 0개, 기존 .expo/types/router.d.ts 경고 1개                                                        |
| 포맷            | 마지막 코드 수정 후 전체 검사 통과                                                                     |
| Playwright 직렬 | 13/13 통과. S08 오류 표시 및 S08→S09→S06 회귀 단언 유지·강화                                           |
| 웹 레이아웃     | 412×920·360×800의 오류 카드 캡처 직접 확인. 360px 오류 설명이 하단 버튼 위로 스크롤되고 가로 넘침 없음 |

- 관련 Jest 최초 실행에는 useMeasurementAge 타이머의 act 경고가 있었지만 테스트는 통과했다. 이후 전체 192개 실행에서는 해당 경고 없이 통과했다. 이를 숨기기 위한 로그 억제나 공통 Hook 변경은 하지 않았다.
- 최초 샌드박스 서버 실행은 로컬 포트 접근 제한으로 서버를 열지 못했다. 승인 후 별도 실행한 서버가 localhost:8081에서 동작하며 기존 서버나 Chrome 탭을 조작하지 않았다.
- 로그·trace·캡처는 `artifacts/playwright/diagnostics/s08-status-20261108-232700-2c8cbd/`에 새로 저장했다. 이전 진단 기록을 덮어쓰지 않았다. 이번 직렬 실행에서는 폰트 손상 실패가 관찰되지 않았으며 병렬 문제는 계속 미해결로 유지한다. 병렬 검사나 추가 폰트 진단은 실행하지 않았다.
- 이번 보완 파일은 RecoveryScreen.tsx, researcher-workflow-recovery.test.tsx, researcher-workflow-s08.spec.ts, 본 문서 4개다. 신규 소스 파일이나 공통 컴포넌트는 없다.
- 접속: 갤러리 `http://localhost:8081/`, 워크플로 시작 `http://localhost:8081/researcher-workflow`. 새 실험 준비 시작→작업자 5개 확인→확인 완료→장치·센서 점검 시작→실험 측정 시작 순서로 진입한다. 세션 ID는 이 과정에서 생성한다.
- S07은 S06의 음성 명령 확인, S08은 측정 응답 조건을 오래된 값·보류로 선택하고 측정 후 센서 오류와 작업 보류 확인, S09는 S08에서 정상 응답을 선택하고 센서 다시 확인으로 진입한다. 조건 선택은 더 보기→미리보기 설정에 있다. 주소 직접 입력이나 새로고침은 메모리 세션을 초기화하므로 같은 탭의 앱 버튼으로 이동한다.
- Android 실기기·iOS·Orange Pi 및 실제 센서·음성·AI 연동은 미검증이다. commit·push·PR 생성은 수행하지 않았다.

## S09 표현 최소 보정 — 2026-11-09

- 사용자가 첨부한 이미지 3장 중 1·2장은 구현의 상단/하단, 3장은 Figma 2085:814다. 2장에서 재측정 준비 완료 영역이 정상 표시됨을 확인했다. 실패·재시도 수에 따른 길이는 데이터 차이이며 UI 누락으로 처리하지 않는다.
- 검토한 Headless Chromium 스크립트를 사용자 승인 후 before 명령으로 정확히 1회 실행했다. 스크립트 SHA-256은 `dd7093a5c94e1a15cdc13d6fa3dae564963aedf98ab61da6e92341d19debbe22`이며 수정하지 않았다. 기존 Chrome 프로필·탭과 연결하지 않고 localhost:8081 앱에서 새 Mock 세션을 정상 생성한 뒤 복구 실패 2회와 성공을 재현했다. 종료 시 자체 Chromium만 정리했다.
- 수정 전 측정: 준비 안내는 두 해상도 모두 1개 렌더링됐다. 412×920의 안내 제목 y=988, 설명 y=1012로 버튼 y=848보다 아래에 있었고, 360×800에서도 설명 y=1025로 버튼 y=728보다 아래에 있었다. 스크롤 후에는 설명 전체가 버튼 위에 표시됐다. 누락된 UI가 아니므로 영역 추가·이력 축소·전체 이력 보기·스크롤 구조 변경을 하지 않았다.
- 수정은 RemeasurementScreen의 표시 문구만 최소 보정했다. 성공 제목은 실제 센서 측정 정의의 label을 사용해 조도는 ‘새 조도값’, 전압은 ‘새 전압값’으로 표시하며 정보가 없으면 일반 센서 표현을 사용한다. 값·단위·회차·관측 시각은 기존 세션 데이터를 사용한다.
- 이력 시각은 기기의 같은 로컬 시각을 HH:mm:ss로 표시한다. 원본 occurredAt, eventId, attemptId, recoveryId와 시간순 배열은 변경하지 않는다. 이력의 선택·순서·개수·문구는 시각 형식을 제외하고 그대로 유지한다.
- 재측정 준비 완료/confirmed 표현은 기존 selector의 canRemeasure가 참일 때만 사용한다. 이미 재측정을 요청한 상태는 ‘재측정 요청 완료’/processing으로 표시하고 현재 회차 확인을 안내한다. 버튼 활성화와 명령·이동 조건은 변경하지 않는다.
- FeedbackPanel·SensorCard·TimelineItem·VoicePanel·ActionShelf 등 기존 공통 컴포넌트만 사용한다. 폰트 크기·내부 패딩·카드 크기·행 간격·본문 스크롤·하단 버튼은 기존 토큰과 기본 표현을 유지한다. Figma의 두 줄 제목을 강제 개행이나 고정 너비로 흉내 내지 않는다. 실제 수치 차이가 확인되지 않은 여백을 임의 조정하지 않았다.

| 비교 항목 | Figma 첨부 3        | 수정 후 구현                                                     |
| --------- | ------------------- | ---------------------------------------------------------------- |
| 성공 제목 | 새 조도값, 두 줄    | 실제 측정 정의에 맞는 제목, 공통 컴포넌트 자동 줄바꿈            |
| 센서 카드 | 예시 423 lx·0.7초   | 실제 세션의 값과 상대 경과 시간, 기본 상태 접두사 유지           |
| 복구 이력 | 예시 3단계·HH:mm:ss | 실제 전체 이력·HH:mm:ss. 재시도한 경우 길어지는 것은 데이터 차이 |
| 준비 안내 | 초록색 음성 영역    | 동일한 공통 VoicePanel. 재측정 가능 여부에 맞는 상태 표현        |
| 하단 버튼 | 단일 버튼           | 기존 ActionShelf 유지, 마지막 안내 전체가 버튼 위로 스크롤됨     |

| 검사            | 결과                                                                      |
| --------------- | ------------------------------------------------------------------------- |
| S09 관련 Jest   | 20개 통과                                                                 |
| 전체 Jest       | 15 suites / 194개 통과                                                    |
| TypeScript      | 최종 검사 통과                                                            |
| ESLint          | 오류 0개 / 기존 .expo/types/router.d.ts 경고 1개                          |
| Playwright 직렬 | 14/14 통과. 긴 이력 7개 보존 및 두 해상도 스크롤 검사 추가                |
| 레이아웃        | 기본 3개 및 긴 이력 7개의 캡처를 직접 열어 비교. 가로 넘침·하단 겹침 없음 |

- 새 긴 이력 Jest의 최초 1건 실패는 테스트 도우미가 재시도 대상에 최신 실패 응답 ID를 넣은 준비 오류였다. 기존 selectRecovery가 지정하는 blockedAttemptId를 사용하도록 테스트만 고쳤다. 도메인 계약이나 실패 단언을 완화하지 않았다. 관련 단독 실행의 기존 경과 시간 Hook act 경고는 보존했으며, 최종 전체 Jest는 해당 경고 없이 통과했다.
- 진단 루트는 `artifacts/playwright/diagnostics/s09-layout-20261108-234807-0f9354/`다. 폴더는 전날 생성됐으며 실제 후속 보정·검증일은 11월 9일이다. 수정 전 캡처와 좌표는 before/, browser-before.log에 보존한다. 별도 스크립트의 after 실행은 하지 않았다.
- 수정 후 캡처는 serial-results/의 S09 기본 흐름과 긴 이력 테스트 폴더에 있다. 기본 캡처는 s09-412x920.png, s09-360x800-bottom.png이며, 긴 이력은 s09-long-412x920-top/bottom.png 및 s09-long-360x800-top/bottom.png다. 50%·2회차 캡처도 S08 테스트 폴더에 별도로 보존한다.
- 확인 편의를 위해 위 기본/긴 이력 캡처 6개의 동일한 사본을 새 review/ 폴더에 저장했다. 원본 캡처는 그대로 유지한다.
- 이번 변경 파일은 RemeasurementScreen.tsx, researcher-workflow-remeasurement.test.tsx, S06/S08/S09 E2E 3개, 본 문서 등 총 6개다. S06/S08 E2E는 S09 성공 제목 선택자만 맞췄다. S08 화면·P1 수정·Repository·domain·공통 컴포넌트는 변경하지 않았다.
- 기존 병렬 폰트/응답 손상 문제는 미해결이며 이번에는 직렬 회귀만 실행했다. 실제 Android·iOS·Orange Pi·센서·STT/TTS·AI는 미검증이다. commit·push·PR 생성은 수행하지 않았다.
- 보호 파일 559개 중 558개는 원본 해시와 동일하다. 실행 중인 기존 Expo 서버의 expo-web-approved.log만 정상적인 번들 로그가 추가됐다. 원래 4,527바이트 접두사의 SHA-256이 시작 시점 원본과 일치함을 검증해 삭제·덮어쓰기가 없음을 확인했다. 상세 결과는 preservation-append-check.json에 기록했다. 외부 의존성 백업과 Git 브랜치 참조는 유지한다.

## S09 조도 제목의 일반 문구 대체 경로 보완 — 2026-11-09

- 렌더링 경로는 useWorkflowSession → selectRemeasurement → 문제 센서의 복구 확인 reading/requirement → RemeasurementScreen → 공통 FeedbackPanel이다. 기존 코드는 측정 정의 label만 조회해 `새 ${metricLabel || '센서'}값이 수신되었습니다`를 표시했다. label이 비었거나 ‘센서’이면 BH1750/lx 응답이어도 일반 문구가 선택되는 경로가 있었다.
- 현재 브랜치의 기본 새 Mock 세션은 수정 전 단독 브라우저 검사에서도 이미 ‘새 조도값이 수신되었습니다’로 표시됐다. 사용자가 본 일반 문구의 직접 원인이 과거 번들인지 다른 메타데이터인지 확인할 근거는 없으므로 단정하지 않는다. 이 사실과 별개로 코드의 label 단일 의존 경로를 보완했다.
- 측정 식별자가 illuminance이거나 단위가 lx이거나 BH1750으로 확인되는 경우 조도를 사용한다. 전압 식별자/단위 V는 전압을 사용하며 그 외에는 기존 정의 label을 사용한다. 단위 정규화는 제목 판별용 지역 변수이며 원본 reading·단위·시각은 변경하지 않는다.
- 새 UI 렌더링 회귀 검사 3개는 빈 조도 label, 일반 ‘센서’ label, 빈 전압 label에서 각각 조도·전압 제목과 원본 수치를 확인한다. BH1750 화면에서 일반 제목이 없는지, Repository 세션 전체가 동일한지도 검사한다. 운영 fixtures와 Mock 응답 수치 자체는 수정하지 않았다.
- 실제 브라우저의 S09 영역에서 BH1750·18.4 lx·0% 조건·1회차와 정확한 제목 1개, 일반 제목 0개를 함께 검증했다. 412×920와 360×800 캡처를 직접 열어 ‘새 조도값이 수신되었습니다’를 확인했다. 공통 FeedbackPanel, 제목 스타일, 자동 줄바꿈을 유지하며 강제 개행은 넣지 않았다.

| 검사                       | 결과                                                                           |
| -------------------------- | ------------------------------------------------------------------------------ |
| 수정 전 브라우저 단독 확인 | 1개 통과. 기본 새 세션은 이미 조도 제목                                        |
| S09 관련 Jest              | 23개 통과                                                                      |
| 전체 Jest                  | 15 suites / 197개 통과                                                         |
| TypeScript                 | 통과                                                                           |
| ESLint                     | 오류 0개 / 기존 .expo/types/router.d.ts 경고 1개                               |
| Playwright 직렬            | 14/14 통과. 정확한 제목·일반 제목 부재·수치·조건·회차·작은 화면 너비 단언 강화 |

- 진단 루트: `artifacts/playwright/diagnostics/s09-illuminance-20261109-3e4b3697/`. 수정 전 기록은 before-results/와 browser-before.log, 수정 후는 serial-results/와 playwright-serial.log에 저장한다. 확인용 review/에는 412px 기본 캡처와 360px 상단 캡처의 동일 사본을 보관한다.
- 이번 변경은 RemeasurementScreen.tsx, researcher-workflow-remeasurement.test.tsx, researcher-workflow-s09.spec.ts 및 본 문서 4개다. S08 화면·복구 흐름·S09 전체 이력·스크롤·재측정 명령·공통 디자인 시스템은 변경하지 않았다. 기존 서버를 유지하며 별도 시각 검증 스크립트는 실행하지 않았다.
- 관련 단독 Jest의 경과 시간 Hook act 경고는 기록에 남아 있으며 최종 전체 Jest에서는 발생하지 않았다. 기존 병렬 폰트 문제는 미해결이며 추가 폰트 진단이나 병렬 실행은 하지 않았다. commit·push·PR 생성도 수행하지 않았다.
