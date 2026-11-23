# S10~S11 일시정지·재개 통합 검증 — 2026-11-13

> 2026-11-16 S11 카드별 검증과 16단계 표시를 보완했다. 아래 11월 13일 기록은 당시 구현이며, 현재 S11 동작과 최종 검사는 문서 마지막의 보완 기록을 따른다.

## 기준과 보존

- README.md와 AGENTS.md를 확인한 뒤 진행했다.
- GitHub 공개 API에서 PR #26의 squash 병합 및 최신 main `acbe8bd4d7013989b87e2923146a26524664a027`을 확인했다. 이 커밋의 트리는 기존 `72dbaac`와 같았다.
- 기존 `refs/codex` 오류 참조를 건드리거나 fetch하지 않았다. 공개 Git commit 응답의 서명·원본 바이트를 복원하고 Git 객체 해시가 원격 SHA와 정확히 일치하는 것을 확인해 해당 객체만 등록했다. 이후 이 커밋에서 `feat/experiment-pause`를 생성했다.
- 기존 main·preparation·execution·workflow 브랜치 참조와 workflow의 `eea9156`을 유지했다. 기존 브랜치를 통째로 병합하지 않았다.
- 기존 미추적 보호 파일 15개의 경로와 SHA-256을 작업 전후 비교해 변경이 없음을 확인했다. 스테이징·커밋·push·PR 생성은 하지 않았다.

## 선별 이식과 실제 흐름

- `eea9156`의 S10 화면, 라우트, 일시정지 전환 및 관련 Jest를 선별 이식했다. 과거 검증 기록과 S06~S09 파일 전체를 덮어쓰지 않았다. main의 ‘말씀하세요’와 실제 조건·회차 예시는 유지했다.
- 기존 WorkflowRepository의 executeCommand·requestId·expectedRevision·구독·Hook 안에 pauseExecution, checkResume, confirmResumeSetup, resumeExecution을 연결했다. 별도 Repository나 영구 저장은 추가하지 않았다.
- S06 본문의 측정값 확인 다음 secondary 일시정지 버튼을 추가했다. Repository가 paused를 반환한 뒤에만 같은 sessionId의 `/paused`로 이동한다. 실패 시 S06에 오류가 남는다.
- S10은 조회 화면이다. 현재 회차의 executionPaused 기록과 paused 상태가 있어야 저장 성공을 표시한다. 홈으로는 기존 `/student`, 바로 재개는 같은 sessionId의 `/resume`로 이동한다. 뒤로 가거나 홈으로 이동해도 일시정지는 해제되지 않는다.
- S01의 기존 이어하기 링크는 유지했다. 해당 링크가 가리키는 `demo-session-led-m03`가 paused이면 준비 라우트에서 같은 세션의 S10으로 보낸다. S01의 정적 홈 카드가 임의의 새 세션을 선택하는 기능은 추가하지 않았다.
- S11 진입 자체는 조회만 한다. ‘장치·센서 다시 확인’으로 새 Mock 진단을 요청하며, 성공 뒤 거리·지그 항목을 눌러 작업자 확인을 해야 재개 버튼이 활성화된다. 확인 취소와 재확인 재요청은 재개를 다시 차단한다.
- 장치·필수 센서·값·단위·출처·요청 이후 응답 시각을 검사한다. 실패 응답, 예외, 다른 일시정지/회차/시도의 응답, 과거·미래 응답은 재개 근거가 되지 않는다. 기존 절차에 없는 전압 안전 범위나 TTL을 만들어 판정하지 않았다.
- 재개는 같은 세션·승인 절차·현재 커서·완료 근거를 보존한다. 일시정지 전의 미완료 일반 측정은 완료에 재사용하지 않으며, 재개 후 새 측정과 명시적 완료가 필요하다. 일시정지 전 요청의 늦은 응답도 재개 후 상태를 바꾸지 못한다.
- S07의 미확정 음성 요청과 S08의 오류 보류는 자동 해제하지 않는다. S08 복구 성공 응답은 S09의 연결 근거로 유지하되 여전히 새 재측정이 필요하다. 진행 중이던 복구나 재측정이 중단되면 다시 복구할 수 있도록 보류·실패 상태와 중단 이유를 남긴다.
- Mock은 기존 개발·Maestro fixture 허용과 일반 배포 차단 조건을 유지한다. 초기 `demo-session-led-m03` 및 기존 생성·조회·준비·점검 코드는 보존했다.

## Figma와 화면 확인

- Figma [S10 2086:739](https://www.figma.com/design/PDVmFhYGwSHs6ZrQmsowek?node-id=2086-739)와 [S11 2086:827](https://www.figma.com/design/PDVmFhYGwSHs6ZrQmsowek?node-id=2086-827)의 실제 디자인과 스크린샷을 확인했다.
- AppBar, FeedbackPanel, SurfaceCard, EvidenceRow, HeroPanel, StepProgress, ConditionProgress, VoicePanel, ActionShelf, BottomSheet 등 기존 공통 컴포넌트와 토큰·아이콘을 재사용했다. 디자인 시스템·RootLayout·팀원 화면은 수정하지 않았다.
- S10의 저장 안내·마지막 유효 측정·다음 작업·근거·버전·LED 확인·주의 배너 순서와 홈/재개 버튼 배치를 유지했다.
- S11의 경과 시간·버전·재개할 회차·복원 위치·조건별 진행·센서/전압/작업자 확인·음성 안내·하단 버튼을 연결했다. 새 응답을 명시적으로 요청하는 보조 버튼과 Mock 범위 안내를 추가했다.
- Figma의 50% 2회차, 64%, 30분, 5.00V 등을 복제하지 않는다. 실제 세션의 0% 2회차·유효 측정 1/15회·7%·응답 전압 5.01V 등으로 표시한다. 진단 전에는 센서·전압을 확인 완료로 표시하지 않는다.
- 360×800과 412×920의 S10·S11 초기/확인 완료 캡처를 열어 비교했다. 본문은 자연스럽게 줄바꿈하며, 마지막 안내 전체를 하단 버튼 위로 스크롤할 수 있고 가로 넘침이 없다. OS 상태바·제스처 영역을 웹에 가짜로 그리지 않았다.

## 검증 환경과 결과

- Node 24.3.0, 변경하지 않은 package-lock.json 기준 `npm ci --offline --no-audit --no-fund` 설치가 성공했다.
- 원본의 보호 사본이 라우터·검사에 섞이지 않도록 추적 파일과 이번 신규 파일만 `/private/tmp/handson-pause-20261113-5c_lvayu/project`로 복사했다. 실제 작업 파일과 검증 복사본의 해시 일치를 확인했다.
- 기존 8081·8099 서버를 유지하고 별도 8101/8102 포트에서 검사했다. 사용자 Chrome은 조작하지 않았으며, CLI Playwright의 별도 headless 검사만 사용했다.

| 검사                 | 결과                                                     |
| -------------------- | -------------------------------------------------------- |
| TypeScript           | 통과                                                     |
| ESLint               | 오류 0개, 생성 `.expo/types/router.d.ts`의 기존 경고 1개 |
| 포맷·diff            | 통과                                                     |
| 전체 Jest            | 28 suites, 287/287 통과: 기존 259개 + S10~S11 28개       |
| 전체 Playwright 직렬 | 27/27 통과: 기존 24개 + S10~S11 3개                      |
| Expo Doctor          | 네트워크 허용 환경에서 20/20 통과                        |
| Android 번들         | Hermes 번들 생성 통과                                    |

- Jest는 완료·절차·커서·이력 보존, 중복 요청, revision/요청 충돌, 잘못된 세션·일시정지·커서·시도, 재확인 실패·재시도, 작업자 확인·취소, 오래된 응답, 재개 후 새 측정, S07·S08·S09 연결 및 조회 전용 진입을 검사한다.
- 웹은 기존 S01~S09 회귀에 더해 두 해상도의 홈 이어하기·S10 보관·뒤로 가기·홈 복귀·S11 확인·확인 취소·같은 회차 재개, 실패 후 정상 재시도·재진입·재확인 시 확인 해제를 검사한다.
- 처음 추가한 복구 중단 Jest 1건은 테스트가 재시도에도 이전 요청 ID의 응답을 반환해 실패했다. 요청별 응답으로 바로잡은 뒤 전체 287개가 통과했다. 기존 테스트를 삭제하거나 검증 조건을 완화하지 않았다.
- 첫 웹 검사에서 화면 전환 후 메뉴 대상이 보이지 않아 S11 진입·화면 범위를 명시했다. 이후 실패 경로에서 S11 미리보기의 Context 오류를 발견했다. 공통 BottomSheet가 상위 포털에 표시될 때 자식 Mock 설정이 화면의 WorkflowProvider를 찾지 못한 것이었다. S11 시트 안에 같은 Repository를 전달하도록 수정했으며 공통 시트·Provider·기존 화면 코드는 변경하지 않았다.
- 실행 제한 안의 Doctor는 외부 API 조회 실패, 웹 서버는 포트 접근 실패가 있었다. 해당 실행 로그를 보존하고 네트워크·포트 접근이 허용된 환경에서 다시 검사했다. Android 네이티브 UI 실패로 해석하지 않는다.

최종 로그는 `typecheck-portal-fixed.log`, `lint-portal-fixed.log`, `format-portal-fixed.log`, `jest-portal-fixed.log`, `doctor-network.log`, `android-portal-fixed.log`, `web-final.log`다. 최종 캡처와 trace는 `web-final-results/`에 있다.

진단 경로는 `/private/tmp/handson-pause-20261113-5c_lvayu/`다. 최초 실패와 수정 후 로그·스크린샷·trace를 다른 파일·폴더에 보존했다.

## 변경 파일

수정 6개·신규 10개, 총 16개다.

- 수정: `src/features/researcher-workflow/domain/models.ts`, `infrastructure/mock/MockWorkflowRepository.ts`, `screens/ExecutionScreen.tsx`
- 수정: `src/app/researcher-workflow/[sessionId]/execution.tsx`, `preparation.tsx`
- 수정: `e2e/researcher-workflow-integration.spec.ts` — 일시정지 버튼이 없다는 과거 단언을 활성 버튼 확인으로 갱신했다.
- 신규: `src/features/researcher-workflow/domain/resume.ts`, `infrastructure/mock/resume-transitions.ts`
- 신규: `src/features/researcher-workflow/screens/PauseScreen.tsx`, `ResumeScreen.tsx`
- 신규: `src/app/researcher-workflow/[sessionId]/paused.tsx`, `resume.tsx`
- 신규: `__tests__/researcher-workflow-pause.test.tsx`, `researcher-workflow-resume.test.tsx`
- 신규: `e2e/researcher-workflow-s10-s11.spec.ts` 및 이 문서

## 남은 범위

- Android Maestro·실기기·실제 센서·Orange Pi·LED 제어·STT/TTS는 이번 작업에서 검증하지 않았다. Android 번들은 네이티브 UI 검증을 대신하지 않는다.
- Mock은 메모리 기반이다. 새로고침·앱 재시작 후 복원되지 않는다. 저장 성공은 현재 Repository 인스턴스의 상태 변경 성공을 뜻한다.
- S11 음성 패널은 실제 음성을 인식하거나 작업자 확인을 자동 기록하지 않는다. 명시적인 터치 확인을 사용한다.
- S12~S15, 실제 백엔드, 영구 저장, 안전 전압 범위와 시간 기준 확정은 포함하지 않는다. 패키지·CI 워크플로는 변경하지 않았다.

## 2026-11-16 S11 카드별 확인·Mock 단계 표시 보완

### 디자인 기준

- Figma MCP로 실제 S11 `2086:827`과 EvidenceRow variant set `2081:942`의 레이어·속성·스크린샷을 다시 읽었다. 디자인 파일은 수정하지 않았다.
- 본문 좌우 패딩 24, 항목 간격 12, EvidenceRow 패딩 12·간격 10·최소 높이 66·모서리 16, 아이콘 타일 32·아이콘 20을 기존 공통 컴포넌트와 토큰으로 유지한다. 긴 실제 문구는 고정 높이로 자르지 않고 늘어난다.
- 센서 카드의 대기는 흰 카드, 성공은 흰 카드와 초록 타일·아이콘(`#e1f3eb`, `#137657`) 및 `확인`, 실패는 기존 Issue variant의 노랑 배경과 `실패`를 사용한다. 진행은 같은 카드에 `확인 중`을 표시한다.
- 기존 별도 `장치·센서 다시 확인` 버튼, 카드 밖의 진단 실패 패널·Mock 안내·음성 클릭 안내를 제거했다. 실패는 해당 카드, Mock 범위와 미확정 기준은 기존 더 보기 시트, 음성 클릭 안내는 기존 VoicePanel에 표시한다.
- S11에 보이는 back·more·device·person·alert 아이콘은 Figma와 같은 node ID의 로컬 원본을 재사용한다. 다섯 파일이 비어 있지 않고 assets-manifest의 SHA-256과 일치함을 확인했다. 실제 Icon 기본 크기는 20이다.
- Figma 예시의 `5.00 V`, `30분`, `64%`, `50% 2회차`를 복제하지 않는다. 현재 값과 세션 커서를 표시한다. Figma의 `승인 범위 4.8–5.2 V`와 `최신값 1초 이내`는 승인 절차에 기준이 없으므로 판정이나 확정 문구로 채택하지 않는다.

### 카드별 계약과 보존

- S11 내부 `checkResume` 명령과 진단 시도에 `connection | voltage` 대상을 추가했다. 공식 ProcedureSnapshot, v1.2 fixture, procedure-draft, 기존 device-check 검증 계약은 바꾸지 않았다.
- 각 카드의 대기(이번 일시정지에 해당 시도 없음)·진행·성공·실패를 별도로 선택한다. 연결은 필수 센서 연결 진단을, 전압은 전압 센서·metric만 요청·검증한다. 한 카드 성공으로 다른 카드가 완료되지 않는다.
- 서로 다른 두 카드 요청은 동시에 진행할 수 있고 응답 도착 순서가 달라도 각각 반영된다. 같은 카드의 진행 중 중복 요청은 거절한다. 성공 카드도 다시 눌러 재검증할 수 있다.
- 출처·장치·필수 센서·진단 상태·응답 시각을 검사하며 전압은 유한한 값과 승인 정의의 V 단위를 추가 검사한다. 응답은 해당 요청 시작 이후부터 수신 시점까지여야 한다. 실패·타임아웃·stale·예외·과거/미래 응답은 성공 근거가 아니다. 실제 장비의 timeout/TTL이나 안전 전압 임계값은 만들지 않았다.
- 두 결과는 동일 pauseEventId와 cursorId에 속한 카드별 최신 attemptId여야 한다. 다른 일시정지·이전 시도·완료된 시도의 늦은 응답은 무시한다.
- 두 카드가 통과한 뒤 거리 20cm·지그 고정을 작업자가 직접 확인해야 재개할 수 있다. 어느 카드든 재검증하면 새 시도가 작업자 확인을 무효화한다. 다른 카드의 결과와 모든 이전 이력은 보존한다.
- S06~S10 코드와 이전 완료 기록·회차·승인 버전 보존 동작은 유지한다. 재개 후 현재 회차는 새로 측정해야 한다.

### 16단계 계산

- `screens/mock-resume-progress.ts`의 표시 함수에만 v0.1의 준비 8 + 측정 조건 5 + 종료 3을 적용한다. procedure-draft를 import하거나 수정하지 않는다.
- `source=mock`, `profileVersion=led-draft-1`, 유효한 조건과 회차에만 적용한다. API 세션이나 알 수 없는 커서에는 16단계 표시를 생성하지 않는다.
- 0%→9단계, 25%→10단계, 50%→11단계, 75%→12단계, 100%→13단계다. 같은 조건의 1~3회차는 같은 단계에 속하며, 회차는 HeroPanel과 ConditionProgress에 따로 표시한다.
- 백분율은 `round(N / 16 * 100)`이다. 0% 2회차는 `복원 위치 · 9/16단계`, 56%; 50% 2회차는 `11/16단계`, 69%다. 완료한 측정 횟수 비율과 혼용하지 않는다. 준비·종료 단계의 완료 판정이나 S12~S15 기능은 추가하지 않았다.
- 이 함수는 세션을 변경하지 않는다. 일시정지·재개를 반복해도 동일 커서의 복원 위치는 같다.

### 검증 환경

- Node 24.3.0, 변경하지 않은 lockfile로 별도 `/private/tmp/handson-s11-20261116-9z5ve19d/project`에 `npm ci --offline --no-audit --no-fund`를 실행했다.
- 추적 파일과 기존 S10~S11 작업 파일 및 이번 신규 표시 함수만 복사했다. 보호 사본 15개와 별도 `src/app/procedures.tsx`는 검사 복사본에 섞지 않았다. 원본에서는 모두 보존한다.
- 기존 8081·8099 서버를 조작하지 않고 검증용 8103 포트와 별도 headless Chromium을 사용한다. 사용자 Chrome 원격 조작은 하지 않는다.
- 최초 제한 환경에서 Expo가 8103 포트를 사용할 수 없다고 종료했다. 사용자 허용 후 실행 제한 밖에서 동일 검사를 다시 실행했다. 최초 로그도 보존한다.

### 검사 결과

| 검사                 | 최종 결과                                                           |
| -------------------- | ------------------------------------------------------------------- |
| TypeScript           | 통과                                                                |
| ESLint               | 오류 0, 생성 `.expo/types/router.d.ts`의 기존 unused-disable 경고 1 |
| Prettier / diff      | 통과                                                                |
| 전체 Jest            | 28 suites, 295/295 통과 (기존 287 + 신규 8)                         |
| 전체 Playwright 직렬 | 27/27 통과, 약 3분                                                  |

- 최종 코드는 `jest-final.log`, `typecheck-final.log`, `lint-final.log`, `format-final.log`, 웹은 `playwright-final.log`로 확인한다. 로그와 초기 실패 결과는 `/private/tmp/handson-s11-20261116-9z5ve19d/`에 보존한다.
- 첫 웹 전체 검사의 기존 회귀 24개는 통과했다. 신규 두 해상도 검사는 공통 StepProgress의 native accessibilityValue가 웹 DOM의 aria-valuenow로 나오지 않아 실패했다. 실제 role/이름과 화면의 `56%`를 검증하도록 바로잡았다. 카드별 오류·타임아웃·stale을 추가한 실패 시나리오는 32초 이상 걸려 기본 30초를 넘었으므로 해당 검사만 60초로 설정했다. 앱의 상태 판정이나 기존 회귀 단언을 완화하지 않았다.
- Jest 신규 8개는 카드별 재검증·다른 카드 결과 유지·작업자 확인 해제(2), 동시 요청과 양쪽 응답 순서·중복/이전 응답 무시(2), 각 카드의 실패·타임아웃·stale·과거/미래 응답 차단(2), 새 일시정지 시 확인 재사용 금지와 위치 유지(1), 15개 조건/회차의 9~13단계 매핑 및 API 세션 제외(1)를 다룬다.
- Playwright는 두 크기에서 초기 대기·연결만 확인·두 카드와 작업자 확인 완료·확인 취소·동일 회차 복귀를 검사한다. 두 카드 각각 미연결·타임아웃·stale·정상 재시도와 재진입, 연결 재검증 시 전압 성공 유지 및 작업자 확인 해제를 검사했다.
- 360×800과 412×920의 초기/연결만 확인/전체 확인 top·bottom PNG 12개와 카드별 실패 PNG 2개를 `captures/`에 보존했다. 실제 이미지를 열어 원본과 비교했다. 24px 패딩·12px 간격·카드 순서·초록 센서 아이콘·확인 문구·전압값·회색 진행 바·하단 버튼을 확인했다. 360px의 긴 문구는 자연스럽게 줄바꿈하고 마지막 VoicePanel 문구가 하단 고정 버튼 위로 스크롤된다. 두 크기에서 가로 넘침이 없다.
- 최종 비교에서 공통 EvidenceRow의 작업자 Issue 아이콘이 warning 색상인 차이를 발견했다. 공유 컴포넌트는 유지하고 S11의 작업자 카드만 기존 Icon·AppText와 동일 토큰으로 구성해 파란 person 아이콘·노랑 배경·필수 문구를 원본과 맞췄다. 확인 완료 설명도 한 줄로 표시한다. 센서 성공 아이콘은 원본의 초록색과 일치한다. OS 상태바·Android 제스처 영역을 웹에 가짜로 그리지 않았다.
- 최종 비교에서 원본의 64% 대신 56%, 응답 전압 5.01 V, 실제 조건·회차·시각을 표시하는 것을 확인했다. Android Maestro·실기기 검증은 이번에도 실행하지 않았다.

### 최종 변경과 보호

- 이번 보완은 기존 16개 중 8개 수정 및 신규 `screens/mock-resume-progress.ts` 1개다. 도메인 `models.ts`, `resume.ts`, Mock Repository·resume-transitions, ResumeScreen, S11 Jest·Playwright, 이 검증 문서가 대상이다.
- 시작 시 기존 16개를 `backup/`에 복사하고 파일 해시를 `baseline.json`에 기록했다. 이전 보호 파일 15개의 SHA-256과 별도 `src/app/procedures.tsx`는 보완 전후 일치한다. 기존 브랜치·HEAD `acbe8bd`·빈 스테이징 상태를 유지한다.
- S06~S10 화면/라우트, 팀원 procedure-draft, 공식 v1.2 절차 fixture, 공유 디자인 시스템, 의존성·lockfile·CI는 수정하지 않았다. reset·rebase·커밋·push·PR 생성과 사용자 Chrome 조작은 하지 않았다.
