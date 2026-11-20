# 워크플로 결과 재조회·S01 인계 계약

## 범위

2026-11-19, `feat/workflow-session-menu-ui`, 기준 main `6702139e0db1d0cc7baf5818d06ceb6fd5fe4232`에서 S14 제출 후 조회와 외부 화면용 읽기 전용 API를 추가했다. 기존 S06 메뉴·장치 조회, S11 재확인·복귀 가드와 테스트를 유지했다.

S01–S03 코드·fixture·버튼 경로, Repository의 초기 세션·전환 로직, CI, 의존성은 수정하지 않았다. LED-M02 완료 세션을 만들거나 M03을 paused로 바꾸지 않았다. 현재 홈 표시와 실제 세션의 연결은 S01 담당자의 후속 작업이다.

## 조회 API

```ts
import { workflowQueries } from '@/features/researcher-workflow/state/workflow-repository';

const summary = await workflowQueries.getSessionSummary(sessionId);
const result = await workflowQueries.getResult(sessionId, resultId);
```

- `workflowQueries`와 기본 `WorkflowProvider`는 같은 모듈의 단일 `developmentRepository`를 사용한다. 외부 화면은 새 `MockWorkflowRepository`를 만들지 않는다.
- 이 facade는 세션 생성·명령·초기화 함수를 노출하지 않는다. 조회와 결과 화면 이동으로 세션 상태·revision·측정/정리/제출 기록을 변경하지 않는다.
- `getSessionSummary`는 실제 `sessionId`, `phase`, `source`, `revision`, `title`, `deviceId`, `procedureVersion`, `updatedAt`, `cursor`, `condition`, `progress`, `resultId`, `canOpenResume`를 반환한다.
- `cursor`는 `cursorId`, `stepId`, `conditionId`, `trialIndex`이며 없으면 null이다. `condition`은 현재 조건의 id/label 또는 null이다.
- `progress`는 도메인에서 근거가 확인된 `validMeasurements / totalMeasurements`와 반올림한 `percentage`다. S11의 Mock 단계 위치(예: 11/16)와 다른 지표다.
- `resultId`는 기존 완료 selector를 통과한 결과만 반환하며 나머지는 null이다.
- `canOpenResume`는 실제 paused 이벤트와 현재 cursor가 일치하는지를 뜻한다. 재개 허가가 아니며 S11에서 연결·전압·작업자 확인을 다시 거쳐야 한다.
- `getResult(sessionId, resultId)`는 해당 세션의 완료·정리 근거와 정확한 결과 ID를 확인한 뒤 분리된 세션 스냅샷을 반환한다. 없는 세션, 잘못된 결과 ID, 미완료 세션은 `WorkflowError`의 `NOT_FOUND`로 처리한다. 다른 세션이나 LED-M03 결과로 대체하지 않는다.
- 커스텀 Repository를 주입하는 화면/테스트는 `createWorkflowQueries(repository)`를 사용한다. 기본 공유 facade가 임의의 주입 Repository를 따라 바뀌지는 않는다.
- 현재 구현은 개발·Maestro용 메모리 Mock이다. 실제 백엔드 조회·영구 저장·장치 연결을 제공하지 않는다. 일반 실행 중 생성한 세션은 앱 재시작·웹 새로고침 시 사라진다.

## 정확한 라우트

```text
S14 접수/결과:
/researcher-workflow/{sessionId}/results?resultId={resultId}

S14 제출 결과를 바로 조회:
/researcher-workflow/{sessionId}/results?resultId={resultId}&view=summary

S15 조건별 상세:
/researcher-workflow/{sessionId}/measurement-details?conditionId={conditionId}&resultId={resultId}

실제 paused 세션의 재확인:
/researcher-workflow/{sessionId}/resume
```

- 제출 직후 기존 `결과를 제출했습니다` 접수 안내와 `홈으로`만 유지하며 추가 조회 버튼은 표시하지 않는다. 결과 재조회는 외부 화면에서 실제 resultId와 `view=summary`를 전달해 진입한다.
- 제출 결과 요약에는 읽기 전용·Mock 접수 안내와 기존 실제 조건별 측정 수·보류·재측정 이력을 표시한다. 제출 버튼은 없고, 기존 S15 상세 조회를 제공한다.
- S14에서 S15로 갈 때 실제 완료 resultId를 전달하고, S15의 뒤로가기/전체 결과 복귀는 같은 sessionId·resultId와 `view=summary`를 유지한다. `submitMockResult`를 다시 실행하지 않는다.
- 명시한 결과 ID가 잘못됐거나 다중 값이면 조회 로딩 동안에도 자식 결과 화면을 열지 않고 안전한 오류를 표시한다. `세션 결과 확인`은 결과 ID를 생략한 해당 세션의 기존 S14로 이동할 뿐 명령을 실행하지 않는다.
- 기존 URL 호환을 위해 resultId 생략 시 해당 세션의 현재 완료 결과를 사용한다. 새 연결에서는 ID 쌍을 함께 전달한다.

## S01 담당자 인계

| 현재 표시                                      | 실제 워크플로 상태                           | 후속 연결                                                                    |
| ---------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------- |
| `demo-session-led-m03`, paused·50%·2회차       | 초기 Repository에는 같은 ID의 preparing 세션 | 조회 summary의 실제 phase·조건·회차·진행률로 표시하고 phase에 맞는 경로 선택 |
| `demo-result-led-m02` / `demo-session-led-m02` | 대응 완료 세션 없음                          | 별도 완료 데이터 계약 확정 전 다른 세션 결과에 연결하지 않음                 |
| 결과 ID                                        | 완료 전환에서 `mock-result-${id}` 생성       | 반환된 실제 resultId 사용. S01 별칭을 임의로 실제 ID로 간주하지 않음         |

S01 담당자는 `studentHomeData.ts` 또는 그 loader 어댑터에서 위 조회 API를 사용하고, `studentHomeRoutes.ts`와 `/results/[resultId].tsx`의 인계 동작을 연결해야 한다. `StudentHomeScreen.tsx`의 상태 표시는 실제 응답에 맞춰야 한다. 이 파일들은 이번 작업에서 수정하지 않았다. `/history`의 목록 조회와 resultId 단독 검색 API는 별도 과제다.

## 변경 파일

제품 코드 추가:

- `src/features/researcher-workflow/application/workflow-queries.ts`
- `src/features/researcher-workflow/state/workflow-repository.ts`

제품 코드 수정:

- `src/features/researcher-workflow/state/WorkflowProvider.tsx`
- `src/features/researcher-workflow/screens/CompletionRouteGate.tsx`
- `src/features/researcher-workflow/screens/ResultSummaryScreen.tsx`
- `src/features/researcher-workflow/screens/MeasurementDetailsScreen.tsx`
- `src/app/researcher-workflow/[sessionId]/results.tsx`
- `src/app/researcher-workflow/[sessionId]/measurement-details.tsx`

테스트 수정:

- `__tests__/researcher-workflow-completion.test.tsx`
- `__tests__/researcher-workflow-session-menu.test.tsx`
- `e2e/researcher-workflow-completion.spec.ts`

이 문서를 포함해 이번 후속 작업은 12개 파일이다. 이전 S06·S11 변경은 그대로 유지한다.

## 검증

보호 파일의 중복 화면·테스트를 원본에서 변경하지 않고, 기존 일반 검사 복사본 `/private/tmp/handson-workflow-ui-20261119-pXVPgg/source`에 추적 소스와 이번 추가 파일만 동기화해 검증했다. Node 24.3.0, 기존 main 의존성, 독립 npm cache를 사용했다. Git clone/worktree나 제외 설정 변경은 하지 않았다. 원본·검사 복사본 대상 286개 파일이 동일함을 확인했다.

| 실제 실행한 검사                                                         | 결과                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------ |
| npm run typecheck                                                        | 통과                                                         |
| npm run lint                                                             | 통과, Expo 생성 router.d.ts의 미사용 eslint-disable 경고 1건 |
| npm run format:check                                                     | 통과                                                         |
| npm run test:ci                                                          | 30 suites, 335/335 통과                                      |
| npm run test:e2e -- --workers=1                                          | 37/37 통과, 실패·건너뜀 0, 6.1분                             |
| npm run doctor                                                           | 19/20, 기존 main의 Expo 패치 5개 불일치                      |
| npm run export:android -- --output-dir ../reports/followup-final-android | Android Hermes 번들 통과                                     |

위 최종 소스 검사에서는 제출 완료 화면의 추가 조회 버튼을 제거한 상태로 확인했다. 기존 안내·홈으로만 표시되는지, 외부 URL로 읽기 전용 요약에 진입하는지, S14↔S15의 sessionId/resultId와 제출·측정 이력이 유지되는지 검증했다. 잘못된 결과 ID와 다중 ID를 차단하며 실제 paused 세션의 S11 재확인 후 같은 회차로 복귀하는 것도 확인했다. 360×800·412×920의 기존 S04–S15 전체 흐름을 포함한다.

로그는 임시 폴더의 `logs/followup-final-*.log`, Doctor는 `logs/followup-doctor.log`에 있다. 웹 결과·캡처는 `reports/followup-final/`, HTML은 `reports/followup-final-html/`, Android 번들은 `reports/followup-final-android/`에 보존했다. 이전 실행 로그와 결과도 유지했다.

기존 UI 제품 코드와 검증 문서, 보호 파일 16개, 의존성·CI·S01–S03·Mock 전환/초기 데이터는 보존했다. HEAD와 기존 브랜치 참조·index는 변경하지 않았고 staging은 비어 있다. 작업 중 Codex captures/checkpoints 참조의 교체가 관찰됐지만 변경 주체와 원인은 미확인이며 직접 수정·복구·삭제하지 않았다.

Android 네이티브 빌드·실기기·Maestro, 실제 Figma 원본·Prototype, 백엔드·Orange Pi 연동은 미검증이다. S01의 실제 조회·라우팅 연결, LED-M02 완료 데이터, 이력 목록·resultId 단독 조회는 구현하지 않았다. UI 범위의 PR 준비는 가능하지만 기존 Doctor 오류는 별도 Expo 패치로 해결해야 한다. staging·커밋·push·PR 생성은 하지 않았다.

2026-11-20 커밋 전 최종 검증은 [S06·S11 검증 문서](workflow-session-menu-ui.md)의 마지막 기록을 따른다. 전체 Jest 335/335와 Playwright 37/37 통과 이후에도 S11 BottomSheet의 간헐적 DOM·키보드 포커스 잔류 결함은 미해결로 유지한다. 원본 Expo Router 생성 타입 오류와 검사 복사본의 TypeScript 통과도 구분한다.
