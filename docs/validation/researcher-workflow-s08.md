# S08 센서 오류와 작업 보류 검증 (2026-11-04)

## 작업 기준과 보존

- 브랜치 `feat/researcher-workflow`, 기준 HEAD `b0d10a6e75d72cb32dac0d91ae8c90350935c305`에서 진행한다. 커밋·push·스테이징·병합·브랜치 변경은 수행하지 않는다.
- 시작 시 추적 파일 변경은 없고 `.idea/` 미추적 7개가 있었다. 사용자 승인에 따라 작업 대상에서 제외한다. IDE 파일·`.gitignore`를 수정하거나 삭제하지 않는다.
- RootLayout·폰트·Gallery·ExecutionExample·설정·패키지·네이티브 생성 폴더·팀원 화면은 수정하지 않는다. 후속 디자인 보정에서 추가했던 공통 컴포넌트 선택 속성은 사용자 요청으로 제거했으며, data.tsx와 기존 공통 테스트는 b0d10a6와 동일하게 원복했다. 공통 스타일·기본 동작은 변경하지 않는다. 기존 진단 기록은 보존하고 새 출력 경로를 사용한다.

## 직접 확인한 Figma와 재사용

- [최종 섹션 2126:4153](https://www.figma.com/design/PDVmFhYGwSHs6ZrQmsowek?node-id=2126-4153)에서 [S08 2085:722](https://www.figma.com/design/PDVmFhYGwSHs6ZrQmsowek?node-id=2085-722)를 선택·확대해 확인했다. 시작 링크 `2078:317` 자체가 S08이라는 근거로 사용하지 않았다.
- 412×920, 캔버스 `#F1F5FD`, 상단 뒤로/제목/더 보기, 조건·회차와 PAUSED, 분홍 오류 안내, BH1750 마지막 값 카드, 복구 순서 3개, 기록 보존 안내, 하단 조치 듣기/센서 다시 확인 구성을 반영했다.
- 복구 순서 문구: LED 출력을 0%로 유지/안전한 상태에서 케이블 확인, I2C 케이블 연결 확인/전원을 끈 뒤 작업, 새 값 수신 후 5초 안정화/현재 회차 다시 측정. 표시 안내이며 실제 장비 조작이나 안전 확인 근거를 생성하지 않는다.
- 기존 AppBar·FeedbackPanel·SensorCard·TimelineItem·StatusBadge·ActionShelf·BottomSheet·Button·AppText·Icon·StatusBar와 의미 색상/간격 토큰을 재사용한다. 같은 역할의 공통 컴포넌트를 새로 만들지 않았다.
- 전체 픽셀 일치를 주장하지 않는다. 공통 파일 원복 후 S08 SensorCard는 기존 상태 라벨과 실제 관측 시각의 상대 경과 시간을 함께 표시하며, TimelineItem 오른쪽의 대기 라벨도 기존대로 표시한다. 이 라벨들은 Figma와 남는 차이다. 상태 색상·접근성 이름과 다른 화면의 기본 동작은 유지한다. 원본의 6.4초·420lx·50% 2회차는 고정 기본값이 아니다. 값·조건·회차는 실제 세션 상태에서 표시한다.
- Figma의 허용 <= 2초는 승인된 센서 판정 규칙이 없어 구현하지 않았다. 기존 mock-draft 안정화 5초는 표시용이며 실제 안전 타이머가 아니다. 별도 로딩/복구 실패 S08 프레임은 확인하지 못했으며 동일 구성과 기존 FeedbackPanel의 상태 변형으로 표현한다.
- 옆 S09는 별도 화면이므로 구현하지 않았다. 사용자가 요청한 S06→S08→S06 연결을 위해 성공 시 현재 작업으로 돌아가기 동작을 제공한다. 성공만으로 회차를 완료하지 않는다.

## 기능과 데이터

- S06 held/error에서 S08로 이동한다. 일반 측정·음성 재측정 우회를 차단하며, 뒤로 가기로 잠금이 풀리지 않는다.
- `requestRecovery(cursorId, blockedAttemptId)` → checking → failed/recovered. 재시도마다 새 응답 ID를 발급하고, 동일 요청 ID·revision 충돌·현재 커서와 보류 응답 검증을 유지한다.
- 원본 report와 검증 issue, 실패 시도, 복구 이력, 기존 유효 측정과 근거를 보존한다. 복구 요청 human 근거와 결과 program 근거를 구분한다. 전원·배선 확인 성공을 가장하지 않는다.
- 현재 재확인 ID, 출처·커서·장치·형식·단위·진단·안정화·요청/관측/수신 시각 관계를 검증한다. 과거 응답을 재사용하거나 임의 TTL을 추가하지 않는다.
- 음성 안내 서비스는 미연동이며 조치 듣기는 화면 안내로 대체한다. 개발 환경 전용 미리보기 설정은 기존 정보 시트 내부에 유지한다. Mock 데이터의 source·개발 환경 실행 제한을 보존한다.
- S04·S05·S07 정상 흐름을 보존하고, 기존 S06 오류 재요청 테스트는 S08 경유로 갱신한다. 유효 측정 수·자동 완료 금지·기록 보존 등의 기존 단언을 유지한다.

## 검사 결과

| 검사                 | 최종 결과                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| npm run typecheck    | 통과. 새 라우트 선언은 Expo가 생성했으며 생성 타입을 수동 편집하지 않음                                |
| npm run lint         | 오류 0개, 기존 `.expo/types/router.d.ts` unused eslint-disable 경고 1개                                |
| npm run format:check | 통과                                                                                                   |
| npm run test:ci      | 신규 Mock 세션 초기값 보완 후 14개 suite / 167개 통과 (기존 140개 + 복구/초기값 17개 + 상대 시간 10개) |
| Playwright 전체      | 최신 코드: 직렬 10개 통과(1.3분), 병렬 5개 통과·5개 실패. 폰트 손상 4개·S07 JSON 오류 1개 기록 유지    |
| git diff --check     | 통과                                                                                                   |
| 기존 파일 보존       | IDE 파일 8개(미추적 7개와 기존 ignored 파일 포함), 기존 진단 파일 161개 해시 동일, 누락 0개            |

- 초기 S08 최종 Playwright: `artifacts/playwright/diagnostics/s08-final-20261104-2222/results`에 trace 10개와 화면 캡처, `artifacts/playwright/diagnostics/s08-final-20261104-2222.log`에 로그를 보존한다. 412×920 오류 상태와 360×800 최하단/복구 성공 상태를 확인했다. 하단 콘텐츠와 고정 버튼 겹침, 가로 넘침을 검사했다.
- 첫 샌드박스 실행은 localhost 서버를 감지하지 못하고 서버 시작의 포트 사용 오류로 테스트 실행 전에 종료됐다. 승인된 환경의 전체 실행은 10개 통과했고, 최종 Figma 제목 조정 후 새 서버/별도 결과 경로에서 전체 10개를 다시 확인했다. 시간 제한·설정·폰트·기존 테스트 기록을 변경하거나 실패를 무시하지 않았다.
- 최초 S08 최종 trace의 폰트 응답 40개는 모두 HTTP 200이며, 응답 본문 SHA-256이 저장소의 해당 폰트 4종과 일치했다. 후속 디자인 검증에서는 폰트 응답 손상이 재현됐으며 아래에 별도로 기록한다. 이전 문제의 근본 원인은 여전히 미확정이다.

## 변경 파일 (공통 파일 원복 후 수정 12개·신규 9개)

수정:

- `src/app/researcher-workflow/[sessionId]/execution.tsx`
- `src/features/researcher-workflow/domain/execution.ts`
- `src/features/researcher-workflow/domain/models.ts`
- `src/features/researcher-workflow/domain/voice-clarification.ts`
- `src/features/researcher-workflow/infrastructure/mock/MockWorkflowRepository.ts`
- `src/features/researcher-workflow/infrastructure/mock/execution-scenarios.ts`
- `src/features/researcher-workflow/infrastructure/mock/execution-transitions.ts`
- `src/features/researcher-workflow/screens/ExecutionScreen.tsx`
- `src/features/researcher-workflow/INTEGRATION.md`
- `__tests__/researcher-workflow-execution.test.tsx`
- `__tests__/researcher-workflow-execution-screen.test.tsx`
- `e2e/researcher-workflow-s06.spec.ts`

신규:

- `src/features/researcher-workflow/screens/useMeasurementAge.ts`
- `__tests__/researcher-workflow-measurement-age.test.tsx`
- `src/app/researcher-workflow/[sessionId]/recovery.tsx`
- `src/features/researcher-workflow/domain/recovery.ts`
- `src/features/researcher-workflow/infrastructure/mock/recovery-transitions.ts`
- `src/features/researcher-workflow/screens/RecoveryScreen.tsx`
- `__tests__/researcher-workflow-recovery.test.tsx`
- `e2e/researcher-workflow-s08.spec.ts`
- `docs/validation/researcher-workflow-s08.md`

## 남은 검증·합의

- Android 실기기·iOS Expo Go·Orange Pi·실제 센서·STT/TTS·AI·실서버 검증은 미실시다. 웹 Headless Chromium 검증은 실기기 검증을 대신하지 않는다.
- Mock은 메모리 전용이며 앱 종료/새로고침 후 복원 기능이 없다. noResponse는 실패 응답을 반환하는 시나리오이며 무기한 응답 대기 작업의 실제 timeout/취소 정책은 미구현이다.
- 실제 배포 전 API adapter, 센서 최신성/시계 오차/복구 승인/안정화/장비 안전 조치 담당 주체, 서버 requestId·revision·구독 재접속 계약을 합의해야 한다.
- 이전 간헐적 폰트 HTTP 응답 손상 문제의 근본 원인은 여전히 미확정이다. 이번 검증에서 재현됐는지와 별개로 RootLayout·폰트·테스트 시간 제한을 수정하지 않는다.

## S08 디자인 후속 보정

- 상대 시간: 센서 원본 `observedAt`과 현재 시각으로 초(소수 1자리)/분/시간/일을 계산하며 화면이 열려 있으면 1초마다 갱신한다. 누락은 측정 시각 없음, 잘못된 값·미래 시각은 측정 시각 확인 불가로 표시한다. 허용 시간이나 센서 상태 판정에 사용하지 않는다. Hook 이탈/관측값 변경 시 타이머를 정리한다.
- 과거 실행 응답의 stale 시각은 Mock 생성기의 고정값 2026-01-01이었으므로 11월 4일 캡처에 307일 전이 표시됐다. 이는 당시 응답 데이터와 올바른 상대 시간 계산의 결과다. 현재 신규 Mock 세션은 아래의 세션별 초기 시각을 사용하며, 기존 저장 응답은 변경하지 않는다. Figma의 6.4초를 문자열이나 초기 데이터로 고정하지 않았다.
- 센서 카드 하단의 이전 측정값 안내를 오래된 값 상태에서 마지막 값 · 회차 무효로 변경했다. 2초 기준은 추가하지 않았으며 원본 응답·검증 issue·복구 규칙은 유지했다.
- 이 보정 단계에서는 한때 TimelineItem과 SensorCard에 showStateLabel을 추가했으나, 이후 사용자 요청으로 해당 변경과 옵션 전용 테스트 2개를 제거했다. 현재 공통 파일과 공통 테스트는 기준 커밋과 완전히 동일하다. S08도 해당 속성을 사용하지 않는다. 새로운 카드/타임라인 컴포넌트를 만들지 않았다.
- 앞서 직접 확인한 412×920 Figma와 기존·변경 후 웹 캡처를 비교했다. 헤더의 좌우 20px, 본문·하단 버튼의 좌우 24px, 안내 카드 안쪽 16px, 센서 카드 안쪽 14px, 본문 항목 간 12px은 기존 토큰을 유지했다. 명확한 수치 차이를 확인하지 못한 패딩·간격까지 임의 조정하지 않았다. 시스템 상태바/홈 영역은 기기 Safe Area로 처리하며 픽셀 단위 정합성은 여전히 미검증이다.
- 상대 시간 보정 시점에는 23개 파일이었으며 공통 data.tsx와 공통 테스트를 원복한 현재 Git 변경 대상은 21개다. 상대 시간 Hook과 해당 테스트는 researcher-workflow 범위로 유지한다.
- 초기 검사에서 신규 타이머 테스트의 전체 환경 타이머 카운트 단언과 테스트 전역 객체 타입, Hook의 effect 내부 동기 setState가 지적되어 보완했다. 테스트는 대상 타이머의 실제 정리를 확인하고, Hook은 시계 콜백에서 상태를 갱신한다. 기존 규칙·검사 설정·시간 제한을 변경하지 않았다.

- 후속 보정의 첫 병렬 실행은 10개 통과(35.3초). Hook 린트 보완 후 최종 병렬 실행은 6개 통과·4개 실패였다. 실패 4개 모두 새 실험 준비 시작 버튼 대기 중 종료됐고, trace에서 NotoSansKR 폰트 응답의 원본 해시 불일치와 NetworkError를 확인했다. Bold 응답 일부에는 HTTP/1.1 헤더가 본문 중간(367754 또는 65222 바이트)에 들어 있었다. HTTP 200만으로 정상 응답이라고 결론 내리지 않았다.
- 실패 기록은 `artifacts/playwright/diagnostics/s08-design-final-20261104-2232/results` 및 같은 접두사의 `.log`에 보존한다. 코드·RootLayout·폰트·검사 시간 제한은 바꾸지 않고 workers=1로 기능 검증을 분리했다. 이 현상을 S08 회귀로 확정할 근거는 없으나 병렬 실행 안정성 문제는 남아 있다.

- 최종 직렬 실행(workers=1)은 전체 10개 통과(1.3분). `artifacts/playwright/diagnostics/s08-design-serial-20261104-2236/results`에 trace 10개와 412px/360px 캡처, 같은 접두사의 `.log`에 실행 결과를 보존한다. 직렬 실행의 폰트 응답 40개는 원본 해시와 모두 일치했다. 병렬 실패를 삭제하거나 통과 결과로 대체하지 않았다.

## 공통 컴포넌트 원복 (2026-11-04)

- data.tsx diff가 showStateLabel 관련 변경뿐임을 확인한 뒤 해당 속성·기본값·조건부 표시만 제거했다. 원복 후 파일 바이트와 SHA-256이 b0d10a6와 일치한다. data.test.tsx도 새 옵션에만 의존하는 테스트 2개를 제거한 뒤 기준 커밋과 동일함을 확인했다. 기존 테스트는 삭제하지 않았다.
- RecoveryScreen에서 showStateLabel 사용 2곳을 제거했다. 기존 SensorCard와 TimelineItem을 그대로 재사용하며 공통 스타일을 재정의하거나 복사하지 않았다. 따라서 SensorCard의 상태 라벨과 TimelineItem의 대기 라벨은 표시된다. S08 전용 표시 요구를 완전히 충족하려면 향후 공통 컴포넌트가 공식 지원하는 옵션 합의가 필요하다. 현재는 차이를 문서화하고 기존 컴포넌트를 유지한다.
- S08 Playwright는 공통 기본 라벨 3개와 상태 라벨에 이어 표시되는 상대 시간을 검증하도록 조정했다. 보류·실패·복구·진행률·이력·360px 하단 겹침 검증은 유지한다.
- 복구 도메인·Repository·전환 로직·기존 측정 기록 처리 코드는 이번 원복에서 변경하지 않았다. .idea 및 기존 진단 기록은 보존한다.
- 원복 후 타입 검사·Jest 전체 165개·ESLint(오류 0개, 기존 생성 타입 경고 1개)·포맷 검사를 통과했다. Playwright 전체도 기존 기본 병렬 5 workers에서 10개 통과(35.9초)했다. 이전 167개 Jest 결과는 원복 전 기록이며 새 옵션 테스트 2개만 제거했다.

- 원복 검증 출력: `artifacts/playwright/diagnostics/s08-common-restore-20261104-232014-880865/parallel.log`, 같은 폴더 `parallel/results`의 trace 10개·캡처. 폰트 응답 40개는 HTTP 200 및 원본 SHA-256과 일치했다. 이번 성공으로 기존 간헐적 폰트 응답 손상의 근본 원인이 해결됐다고 결론 내리지 않는다.

## 신규 Mock 세션의 stale 초기 데이터 보완 (2026-11-04)

- 원인: buildMockDiagnostics가 stale 응답에 2026-01-01T00:00:00.000Z를 고정했다. 세션 createdAt은 별도로 현재 시각이었고, useMeasurementAge는 해당 observedAt과 현재 시각의 차이를 올바르게 계산했다. 이 시각이 응답으로 저장된 뒤에는 측정·오류 이력의 일부이므로 소급 수정하면 안 된다.
- 최소 수정: createSession에서 신규 세션에 한해 세션 생성 직전의 합성 observedAt을 Mock Repository 내부에 고정한다. 생성 시각에서 ISO timestamp의 최소 단위인 1ms만 앞서게 하여 새 요청 이전 값이라는 선후 관계를 만든다. 이 차이는 fixture 초기값이며 stale 임계값·안전 규칙·Figma 예시 숫자가 아니다. 명시적 stale 상태는 그대로 유지한다.
- 세션 생성 중복 요청은 기존 세션을 반환하므로 seed를 다시 만들지 않는다. 후속 stale 응답도 같은 세션 초기값을 사용한다. 응답을 만들 때만 적용하고, 이미 저장된 report/evidence/event의 시각을 바꾸지 않는다. 기존 세션의 과거 값은 화면에도 그대로 남으며, 새 실험을 시작해야 새 초기 데이터가 적용된다.
- seed가 없는 기존 호출은 기존 생성기 기본값을 유지한다. S05의 공용 Mock 진단 생성기와 실제 API/센서 timestamp 처리, 절차 버전, 복구 판정 함수, 상대 시간 계산 Hook은 변경하지 않았다.
- 정상 재확인은 기존처럼 새 요청 이후 observedAt과 해당 attemptId를 사용한다. 새로운 TTL·2초 기준·자동 완료·이력 정규화는 추가하지 않았다. 상태가 stale인 과거 값을 정상으로 바꾸지 않는다.
- 새 테스트 2개: 생성 재시도/새 세션 생성 후 기존 이력 불변, 시간 경과 후에도 동일한 과거 값 유지와 정상 복구 시 새 응답 구분, 주입 시계에 따른 서로 다른 세션의 초기 데이터 생성. 기존 복구·오래된 응답 거절·단위/출처/ID 검증도 보존한다. S08 E2E는 새 세션의 실제 상대 시간이 초 단위로 표시되는지 확인하고 특정 숫자는 고정하지 않는다.
- 이번 수정 파일은 MockWorkflowRepository.ts, execution-scenarios.ts, researcher-workflow-recovery.test.tsx, researcher-workflow-s08.spec.ts, 이 문서의 5개다. 기존 변경 파일 안에서 보완하여 전체 커밋 후보 수는 21개를 유지한다.
- 남은 한계: 실제 장비·서버·음성은 미연동, 메모리 세션은 앱 종료 후 복원하지 않음, 공통 컴포넌트의 상태/대기 라벨은 Figma와 차이 유지. 기존 세션·S05/seed 없는 Mock 호출의 과거 고정값은 소급 수정하지 않음. 새 세션도 장시간 유지하면 실제 경과에 따라 분/시간/일 단위로 표시됨. 간헐적 병렬 폰트 응답 손상의 근본 원인은 여전히 미확정이다.
- TypeScript 및 전체 Jest 167개(관련 27개 포함), ESLint 오류 0개/기존 경고 1개, 포맷 검사를 통과했다. 복구 요청 전 값 거절과 정상 새 응답 수락, 기존 이력 불변을 새 테스트에서 검증했다.
- 현재 코드의 병렬 Playwright는 5개 통과·5개 실패였다. 실패 위치는 S05/S06/S07/S08 초기 진입과 루트 갤러리다. S05/S06/S08/갤러리 trace에서 폰트 본문 해시 불일치와 NetworkError를 확인했고, 갤러리의 일부 응답에는 HTTP/1.1 헤더가 본문 65222바이트 위치에 혼입됐다. S07은 Unexpected end of JSON input 오류와 중단된 폰트 요청만 관찰돼 직접 원인을 확정하지 않았다. 이를 모두 폰트 문제로 단정하지 않는다.
- 실패는 새 세션 생성 버튼을 누르기 전 단계에서 발생했으므로 새 seed 생성 동작의 회귀라는 근거는 없다. 다만 이번 변경의 전체 병렬 검증을 통과했다고 기록하지 않는다. 별도 폰트 진단 스크립트나 HTTP 요청 진단은 반복하지 않았다.
- 병렬 결과/trace는 `artifacts/playwright/diagnostics/s08-session-seed-20261104-234832-463624/parallel.log`와 같은 폴더 `parallel/results`에 보존한다. 같은 코드의 기능 검증을 분리한 직렬 실행 결과도 별도 기록한다.

- 동일 최종 코드의 직렬 Playwright는 10개 모두 통과(1.3분)했다. 결과는 `artifacts/playwright/diagnostics/s08-session-seed-20261104-234832-463624/serial.log`와 같은 폴더 `serial/results`에 보존한다. S08 캡처의 상대 시간은 실제 세션 경과인 11.4초 전으로 표시됐고 고정 문자열이 아니다. S06→S08→S06, 재확인 실패·성공, 명시적 완료, 작은 화면 스크롤을 통과했다. 병렬 실패를 성공 결과로 대체하지 않는다.
- 최종 범위: b0d10a6 대비 공통 디자인 시스템·RootLayout·Gallery·설정·패키지·공통 Playwright 설정 diff 0개. 담당 외 화면/라우트 변경 없음. 기존 artifacts 306개와 IDE 파일 8개(미추적 7개 포함)는 해시 유지·누락 없음. 이번 단계는 위 5개 파일만 수정했고 전체 S08 커밋 후보는 수정 12개·신규 9개, 총 21개다. 진단 산출물·.idea는 커밋 대상에서 제외한다. 스테이징·커밋·push는 수행하지 않았다.
- 커밋 판단: 기능 코드와 변경 범위는 검토 가능한 상태이나, 최신 병렬 실행이 통과하지 않았으므로 전체 검증 완료로 확정할 수 없다. 병렬 실패 및 원인 미확정을 그대로 남기고 최종 커밋 여부는 사용자 지시를 기다린다.
