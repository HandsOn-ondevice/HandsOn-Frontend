# S05 점검 UX 개선과 S01 연결 설계 — 2026-11-16

## 기준과 보호

- README.md·AGENTS.md를 읽고 추적 파일과 스테이징이 깨끗한 것을 확인했다.
- PR #27 squash 병합 커밋과 원격 main은 `bfb794b10aa66c3cc28b2e297e8539e56738256a`다. 기존 S10~S11 커밋 `9b51f95`와 트리 `4786828646008d6cb01e902e8dce59cb46040c95`가 같다.
- 일반 `git fetch --no-tags origin refs/heads/main`은 기존 잘못된 refs/codex 참조 때문에 실패했다. 참조는 수정하지 않았다. 받아진 병합 객체의 SHA·부모·트리를 검증하고 해당 객체에서 `fix/researcher-device-check-ux`만 생성했다. 기존 로컬 브랜치는 이동하지 않았다.
- 작업 전 파일 해시와 브랜치 목록은 `/private/tmp/handson-s05-ux-20261116-82bd1lch/baseline.json`, `branches-before.txt`에 보존한다. 보호 사본 15개와 별도 `src/app/procedures.tsx`를 삭제·수정하지 않는다.
- worktree·reset·rebase·강제 push·커밋·push·PR 생성·CI 변경·Chrome 원격 조작은 하지 않는다. 기존 서버는 유지하고 검증용 8104 포트를 사용한다.

## S05 구현

- 본문의 Mock 시나리오 선택을 상단 더 보기의 기존 ‘장치 점검 정보’ BottomSheet로 옮겼다. 시트의 포털에도 화면에서 얻은 동일 Mock Repository를 명시적으로 전달한다. 새 Repository나 새 세션은 만들지 않는다.
- 선택값은 Repository의 시나리오 맵에 보관되어 닫기·재열기 이후에도 유지된다. 선택만으로 현재 점검 결과·측정값·이력·시작 가능 여부가 바뀌지 않는다. 다음 `startDeviceCheck` 요청부터 선택한 시나리오를 사용한다. 진행 중과 실행 시작 후 선택 제한도 유지한다.
- 선택 컨트롤은 기존 `isMockWorkflowEnabled()` 조건(개발 또는 Maestro fixture)과 Mock Repository 인스턴스에서만 제공한다. API Repository를 주입하면 시트에서도 숨긴다. 일반 배포의 Mock 실행 차단은 그대로다.
- 성공 제목은 ‘점검 응답을 확인했어요’, 설명은 필수 센서 수에 따른 점검 응답 확인으로 바꿨다. ‘Orange Pi 연결됨 · Mock 점검 성공’이나 Wi-Fi·지연 수치를 물리적 연결 사실로 표시하지 않는다.
- 센서 카드의 값·단위·시각·오류는 보존하고, 정상 카드의 반복적인 Mock/안전 안내 대신 해당 센서의 측정 항목명을 표시한다. 출처·안전 범위 미판정·세션 ID·버전·시도 횟수·완료 시각은 기존 정보 시트에 모았다. 본문에 별도의 개발 안내를 추가하지 않았다.
- Repository·fixture·도메인 판정·S04 준비 근거·재점검·S06 시작 조건은 바꾸지 않았다. S06~S11 화면/라우트·S01~S03 소스도 변경하지 않았다.

## Figma 확인과 비교

- Figma MCP에서 실제 [S05 2085:461](https://www.figma.com/design/PDVmFhYGwSHs6ZrQmsowek?node-id=2085-461)의 고해상도 레이어·코드·스크린샷을 확인했다. Figma 파일은 수정하지 않았다.
- 기존 AppBar·FeedbackPanel·SensorCard·ActionShelf·BottomSheet와 Noto Sans KR, 의미 토큰, 로컬 아이콘을 재사용한다. 본문 패딩 24·간격 12, 피드백 패딩 16·모서리 20, 센서 패딩 14·모서리 20·값 영역 48, 하단 버튼 구조를 유지한다.
- back·more·check 아이콘은 원본과 같은 node ID의 로컬 에셋이며 크기 20과 manifest 해시를 확인한다. 시스템 상태바와 제스처 영역을 웹에 가짜로 그리지 않는다.
- 원본의 ‘Orange Pi 5+ 연결됨’, Wi-Fi·18ms·최신성 기준 충족은 실제 하드웨어/승인된 기준이 없어 복제하지 않는다. 응답 확인 문구와 실제 fixture 값을 표시한다. 공통 SensorCard의 ‘정상’ 접두사·절대 점검 시각, 기존 재점검 버튼은 유지한다. 전체 픽셀 일치를 주장하지 않는다.
- 두 해상도의 정상·실패 top/bottom과 정보 시트 top/bottom을 비교한다. 긴 오류·시트 안내의 스크롤, 고정 시작 버튼과 재점검 버튼의 겹침, 가로 넘침을 검사한다.

## 검증 환경과 결과

- Node 24.3.0, 동일 lockfile로 별도 `project/`에 `npm ci --offline --no-audit --no-fund`를 실행했다. Git worktree를 만들지 않았다.
- 검사 복사본에는 추적 소스만 복사했다. 보호 사본과 같은 경로의 미추적 procedures.tsx를 섞지 않았으며 원본에서는 모두 보존한다. 최종 소스와 검사 복사본 해시를 비교한다.
- 전체 Jest 28 suites, 297/297 통과(기존 295 + 신규 2). 신규 검사는 시트 재열기·선택 유지·다음 재점검 전 현재 결과/이력 보존 및 개발 플래그가 꺼진 Maestro fixture의 선택 UI를 검증한다. 기존 API Repository 검사도 실제 시트를 열어 컨트롤이 없음을 확인하도록 보강했다.

| 검사                 | 결과                                                 |
| -------------------- | ---------------------------------------------------- |
| TypeScript           | 통과                                                 |
| ESLint               | 오류 0, 생성 `.expo/types/router.d.ts`의 기존 경고 1 |
| Prettier / diff      | 통과                                                 |
| 전체 Jest            | 28 suites, 297/297 통과                              |
| 전체 Playwright 직렬 | 28/28 통과 (기존 27 + 해상도별 S05 검사 1)           |
| 최종 S05 캡처 재검증 | 3/3 통과, 약 34초                                    |

- `jest.log`, `typecheck-final.log`, `lint-final.log`, `format-final.log`, `playwright.log`, `playwright-s05-final.log`를 위 임시 검증 경로에 보존한다. 최종 앱 소스는 전체 회귀 검사와 같으며, 마지막 S05 재검증에서는 테스트의 선택창 닫힘 대기만 보강했다.
- 두 해상도의 정상·실패·시트 PNG 12개는 `s05-final-results/`에 있다. 실제 PNG를 열어 Figma 원본과 비교했다. 360px에서 긴 센서값/오류의 줄바꿈, 시트의 마지막 문구, 하단 고정 시작 버튼 위로 재점검 버튼이 스크롤되는 것을 확인했다. 선택 컨트롤은 시트 밖에 없고 가로 넘침도 없다.
- Playwright는 360×800, 412×920에서 오류→정상→미연결→정상 재점검, 시트 열기·닫기·스크롤·선택 유지, S05→S06을 검사한다. 선택창의 닫힘 애니메이션이 끝난 뒤 시트를 촬영하도록 기다린다.
- Android Maestro·실기기 검증은 이번 로컬 작업에서 실행하지 않았다. 실제 서버·Orange Pi·안전 전압/TTL 판정·S12~S15를 구현하지 않는다.

## S01 설계안 — 분석만 수행, 구현 전 팀원 협의 필요

### 기존 경계

- S01 담당: `src/app/student.tsx`, `src/features/student-home/{StudentHomeScreen,studentHomeRoutes,studentHomeData,useStudentHome}`.
- S02~S03 담당: `src/app/procedures/{index,[procedureId],preparation}.tsx`, `src/features/procedures/{ProcedureDetailScreen,procedureRepository,procedureModels,PreparationHandoffProvider,demoProcedures}`.
- 홈은 fixture 요약을 조회하고 기존 ID만 `/researcher-workflow/[sessionId]/preparation`에 넘긴다. 실제 WorkflowRepository의 getSession·subscribe는 워크플로 feature 안의 Provider에서 제공한다. 홈에는 현재 이 Context가 없다.
- 준비 라우트 자체를 모든 상태의 진입 분기로 바꾸면 S05에서 S04의 6/6 기록을 다시 보는 기존 복귀도 리디렉션될 수 있다. 홈 전용 진입과 S04 직접 접근은 분리해야 한다.

### 안전한 상태별 이어하기

팀원 승인 후 S01은 기존 sessionId만 전용 워크플로 진입 라우트에 전달하고, feature 내부에서 기존 Repository를 조회하는 방안을 권한다. 진입은 조회·이동만 하며 시작·재개·복구·측정 명령은 실행하지 않는다.

| 실제 상태                                    | 제안 대상                                                          |
| -------------------------------------------- | ------------------------------------------------------------------ |
| preparing                                    | S04 preparation                                                    |
| awaitingDeviceCheck / readyToExecute         | S05 device-check (진행 중 결과도 그대로 조회)                      |
| paused                                       | S11 resume (재확인 전 자동 재개 금지)                              |
| running + 현재 음성 확인 요청                | 기존 selectVoiceClarification의 유효성/취소 가능 상태를 사용해 S07 |
| running + 현재 복구 대기·실패·오류 보류      | 기존 selectRecovery/selectExecution 판단으로 S08                   |
| running + 복구 후 재측정 상태                | 기존 selectRemeasurement 판단으로 S09                              |
| running + 일반 측정·응답 대기·완료 기록 조회 | S06                                                                |
| 없는 세션·조회 실패·상충된 상태              | 오류·재시도, 자동 생성·이력 복구 금지                              |

- 분기 우선순위는 phase를 먼저 확인하고 running에서만 기존 selector를 사용한다. 서로 모순되는 하위 상태를 임의로 해제하거나 최신 시각만 보고 다른 커서의 기록을 선택하지 않는다. 15/15 완료도 S06에서 유지하며 S12로 넘기지 않는다.
- `studentHomeRoutes.ts`의 resume 대상 한 곳과 해당 라우팅 테스트가 최소 팀원 변경 후보다. 홈 화면의 레이아웃을 바꾸지 않고 기존 S04 직접 복귀와 S10 보관 화면 접근을 유지할 수 있다.

### paused 표시와 preparing 실제 세션

- 홈 fixture는 `demo-session-led-m03`를 paused·50%·2/3으로 표시하지만 실제 초기 세션은 preparing·준비 0/6이다.
- 기존 fixture를 보존한 채 홈 어댑터가 같은 sessionId의 실제 세션을 읽어 표시용 상태·조건·회차를 합성하는 방향을 권한다. 준비 상태를 표현할 홈 상태 타입/라벨은 팀원과 합의해야 한다.
- 실제 세션을 paused로 바꾸거나 완료 측정을 새로 만들어 홈 예시에 맞추지 않는다. 세션이 없으면 ‘이어서 진행’의 오류·재조회 경로로 처리하고 다른 실험을 대신 만들지 않는다.
- 홈 어댑터가 Repository를 얻는 주입 경계도 합의해야 한다. 현재 WorkflowProvider를 앱 최상단으로 단순 이동하면 일반 배포의 Mock 차단이 연구생 이외 화면까지 막을 수 있으므로 그대로 올리지 않는다.

### 승인 절차→세션 생성 계약

현재 S03은 선택 버전의 실행 가능 여부를 다시 확인한 뒤 PreparationRequest를 보낸다. `/procedures/preparation`은 개발용 인계 미리보기이며 세션을 생성하지 않는다. 실제 createSession 호출은 별도 개발 진입 화면에만 있다.

| 항목                | 현재 차이 / 필요한 합의                                                                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 절차 ID             | 홈 `demo-procedure-led-output`, 카탈로그 `demo-led-characteristics`, 실행 fixture `mock-led-output`. 정식 식별자와 명시적 변환 원장을 합의해야 한다. 제목·LED-M03만 보고 동일 절차로 추정하지 않는다. |
| 버전                | 카탈로그 `v1.2`와 실행 snapshot `1.2`. 해당 절차의 승인 버전과 실행 프로파일 대응을 명시한다. 임의 문자열 제거로 모든 버전을 수용하지 않는다.                                                         |
| 실행 정의           | ProcedureDetail은 화면용 정보이며 준비 6항목·센서 진단 정의·실행 프로파일을 가진 ProcedureSnapshot과 다르다. 변환 가능한 절차만 명시적으로 등록한다.                                                  |
| 다른 절차           | I2C 승인 절차에는 LED 실행 정의를 적용할 수 없다. 매핑이 없으면 시작 불가로 안내하며 Mock LED 세션을 대신 생성하지 않는다.                                                                            |
| 작업자 ID           | createSession은 operatorId가 필수다. 현재 로그인 식별자는 없고 개발 진입만 mock-researcher를 사용한다. 이름 ‘준혁’에서 ID를 만들지 않고 Mock용 식별자 정책을 합의한다.                                |
| 작업 환경           | PreparationRequest에는 환경이 있지만 ExperimentSession/createSession 입력에는 environmentId가 없다. 환경·장치·절차·세션의 결합 검증 주체를 결정해야 한다.                                             |
| 생성 시점·중복 방지 | 사용자의 S03 준비 시작 뒤 승인/환경을 재검증하고, 같은 시도의 requestId를 재시도에도 유지한다. 단순 화면 진입·조회·홈 재방문으로 세션을 만들지 않는다.                                                |

- S03→인계 경계에서 검증된 snapshot을 해석하는 어댑터를 두고, 기존 Repository 명령으로 생성한 sessionId만 S04에 전달하는 것이 후속 구현안이다. 현재 저장소 계약을 임의 확장하지 않았다.
- 팀원 협의 후 변경 후보는 `studentHomeRoutes.ts`(이어하기), `studentHomeData.ts`·`useStudentHome.ts`·필요시 `StudentHomeScreen.tsx`와 `src/app/student.tsx`(실제 상태 표시·주입), `/procedures/preparation.tsx`(생성 연결)다. `PreparationHandoffProvider`·S03 route/screen·절차 Repository/모델/카탈로그는 식별자·snapshot 해석 책임에 따라 추가 협의 대상이며 이번 작업에서 수정하지 않았다.
