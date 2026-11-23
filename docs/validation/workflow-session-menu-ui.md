# S06 세션 메뉴·장치 조회 / S11 재개 UI 검증

## 기준과 변경 범위

- 작업일: 2026-11-19, Node 24.3.0.
- 브랜치: `feat/workflow-session-menu-ui`.
- 원격 main 및 시작 HEAD: `6702139e0db1d0cc7baf5818d06ceb6fd5fe4232`.
- 첨부된 S11 / S12–S13 / S14 / S06 메뉴 / 장치 상태 이미지를 참고했다. Figma 원본의 상세 속성과 Prototype 연결은 확인하지 않았다.
- S01–S03, S12–S15 제품 코드, 공유 디자인 시스템, CI, 의존성, 기존 Repository의 전환 로직은 변경하지 않았다.
- 커밋·push·PR 생성은 하지 않았다.

## 구현

- S06 더 보기에서 전체 화면 세션 메뉴로 이동한다. `처리 결과` 헤더, 안내 카드, 일시정지·장치 상태 버튼, 하단 복귀 버튼을 배치했다. 기존 정보 BottomSheet와 개발용 시나리오 도구는 메뉴의 더 보기로 분리했다.
- 메뉴 진입·닫기·장치 조회는 세션 명령을 실행하지 않는다. 일시정지 버튼만 기존 `pauseExecution`을 실행하고 성공 시 S10으로 이동한다.
- 최종 UX 정리에서 S06 본문의 중복 `실험 일시정지` 버튼과 그 화면의 중복 명령 핸들러를 제거했다. 일시정지 명령은 전체 화면 메뉴에서만 요청한다. 이미 paused인 S06의 `일시정지 기록 확인`은 상태 변경 없는 S10 복귀 동작으로 유지한다.
- 장치 화면은 마지막 실행 시도의 응답만 읽는다. S05 점검이나 더 오래된 정상 응답으로 대체하지 않는다. 응답의 세션 source·장치·cursor·attempt 근거를 확인하고 오류/형식 불일치 측정값은 숨긴다.
- Orange Pi 5+, BH1750, INA219, BME280의 상태·측정값·단위·기록 시각을 표시한다. 시뮬레이션 및 마지막 저장 응답임을 명시한다. Wi-Fi 지연, 최신성 기준, 실제 하드웨어 연결·안전 보장은 추가하지 않았다.
- S11은 실제 조건·회차, 승인 버전, 일시정지 경과 시간, 조건별 유효 측정 수를 사용한다. 기존 Mock 단계 지표는 `단계 위치/16`으로 표시하고 유효 측정 진행률과 구분한다. 예를 들어 50% 조건 2회차는 11/16단계(69%)이며 유효 측정 7/15회(47%)다.
- 연결·전압 재확인과 작업자 확인 후에만 기존 `resumeExecution`을 호출한다. 확인된 경우 체크 아이콘과 `재개 준비 완료`, 하단 `확인하고 재개`를 표시한다.
- S11 직접 URL 진입은 유효한 paused 이벤트·cursor를 검사한다. 실행 중 세션은 S06으로, 다른 단계는 해당 화면으로 안내하며 없는 세션을 생성하지 않는다. 정상 재개 후에는 기존 복귀 콜백이 이동을 담당해 S06 중복 진입을 방지한다.

## 변경 파일

제품 코드 추가:

- `src/app/researcher-workflow/[sessionId]/session-menu.tsx`
- `src/app/researcher-workflow/[sessionId]/device-status.tsx`
- `src/features/researcher-workflow/domain/session-device-status.ts`
- `src/features/researcher-workflow/screens/SessionMenuScreen.tsx`
- `src/features/researcher-workflow/screens/SessionDeviceStatusScreen.tsx`
- `src/features/researcher-workflow/screens/ExecutionInfoSheet.tsx`

제품 코드 수정:

- `src/app/researcher-workflow/[sessionId]/execution.tsx`
- `src/app/researcher-workflow/[sessionId]/resume.tsx`
- `src/features/researcher-workflow/screens/ExecutionScreen.tsx`
- `src/features/researcher-workflow/screens/ResumeScreen.tsx`

테스트 추가:

- `__tests__/researcher-workflow-session-menu.test.tsx`
- `e2e/helpers/workflow-information.ts`
- `e2e/researcher-workflow-session-menu.spec.ts`

테스트 수정:

- `__tests__/researcher-workflow-resume.test.tsx`
- `__tests__/researcher-workflow-pause.test.tsx`
- `e2e/researcher-workflow-integration.spec.ts`
- `e2e/researcher-workflow-s06.spec.ts`
- `e2e/researcher-workflow-s08.spec.ts`
- `e2e/researcher-workflow-s09.spec.ts`
- `e2e/researcher-workflow-s10-s11.spec.ts`
- `e2e/researcher-workflow-completion.spec.ts`

이 문서의 UI·최종 UX 정리 대상은 22개 파일이다. 별도 S14 조회 후속 작업과 합친 브랜치 전체 대상은 중복 파일을 제외해 32개다. 기존 미추적 보호 파일 16개는 포함하지 않는다.

## 검증 방법과 결과

기존 보호 파일에는 중복 화면·테스트 사본이 있어 전체 검사에 섞일 수 있다. 원본에서 삭제하거나 제외 설정을 바꾸지 않고, 추적 소스와 이번 추가 파일만 일반 임시 폴더 `/private/tmp/handson-workflow-ui-20261119-pXVPgg/source`로 복사해 검사했다. Git clone·worktree를 만들지 않았다. 원본 package.json·lockfile과 동일한 의존성을 `npm ci`로 설치했다. 기존 서버와 분리된 8112 포트에서 Chromium을 실행했다.

| 검사                            | 결과                                                         |
| ------------------------------- | ------------------------------------------------------------ |
| npm ci                          | 성공                                                         |
| npm run typecheck               | 통과                                                         |
| npm run lint                    | 통과, Expo 생성 router.d.ts의 미사용 eslint-disable 경고 1건 |
| npm run format:check            | 통과                                                         |
| npm run test:ci                 | 30 suites, 331/331 통과                                      |
| npm run test:e2e -- --workers=1 | 37/37 통과                                                   |
| npm run doctor                  | 19/20, 기존 main의 Expo 패치 5개 불일치                      |

전체 웹 회귀 검사에는 S12–S15의 누락 검토·재측정·정리·Mock 제출도 포함한다. 메뉴·조회에서 명령/revision 불변, 동일 sessionId·cursor·conditionId·trialIndex, 측정·무효·복구 이력 보존, 센서 오류 차단, 재확인 전 재개 불가, S11 직접 진입을 검증했다. 360×800 및 412×920에서 하단 버튼과 가로 넘침을 확인했다.

초기 웹 검사에서 숨겨진 이전 화면과의 중복 텍스트 선택, 재측정 후 이동 대기, 재개 가드의 S06 중복 진입을 발견했다. 화면 범위 선택·URL 대기와 정상 재개 복귀 가드를 보완한 후 전체 검사가 통과했다.

검사 로그는 임시 폴더의 `logs/`, 웹 결과는 `reports/full-final-results/`, 비교용 화면은 `review/`에 보존했다. 전체 웹 검사 후 S11 진입 기억값을 React state로 정리한 최종본에서 TypeScript·ESLint·포맷·전체 Jest를 다시 통과했고, 관련 S10–S11 및 메뉴 웹 검사도 7/7 통과했다(`reports/final-guard-results/`).

최종 보존 확인에서 보호 파일 16개의 해시, 기존 모든 loose refs(Expo 브랜치와 refs/codex 포함), 의존성 파일이 시작 시점과 일치했다. 새 UI 브랜치 참조만 추가됐으며 HEAD는 기준 main이고 staging은 비어 있다.

## 남은 확인

- Doctor의 기존 불일치: expo 58.0.25, expo-dev-client 58.0.20, expo-file-system 58.0.13, expo-router 58.0.31, jest-expo 58.0.14. UI 작업에서는 수정하지 않았다. 별도 Expo 패치 브랜치를 유지한다.
- 실제 Figma 원본, Prototype, Android 에뮬레이터·실기기·Maestro, 실제 Orange Pi 및 백엔드 연동은 미검증이다. S14는 기존 Mock 제출이다.
- Android Hermes export는 이번 요청의 필수 검사에 포함되지 않아 실행하지 않았다.
- 로컬 UI 변경의 PR 준비는 가능하지만 main의 알려진 Doctor 오류는 별도 Expo 패치로 해결해야 한다. GitHub Checks·Maestro는 PR 생성 후 별도 확인이 필요하다.

## 2026-11-20 커밋 전 최종 검증과 미해결 사항

위 기록은 각 구현 시점의 결과다. 후속 S14 결과 조회와 S06 본문 중복 일시정지 버튼 제거까지 포함한 최종 제품·테스트 소스로 다음 결과를 확인했다. Node 24.3.0, 기존 main 의존성, 기존 일반 검사 복사본을 사용했다.

| 검사                   | 최종 확인 결과                                                 |
| ---------------------- | -------------------------------------------------------------- |
| 전체 Jest              | 30 suites, 335/335 통과                                        |
| 검사 복사본 TypeScript | 통과                                                           |
| ESLint                 | 오류 0, 생성 router.d.ts의 기존 미사용 eslint-disable 경고 1건 |
| Prettier               | 통과                                                           |
| 전체 Playwright        | 37/37 통과, 실패·건너뜀 0, 6.4분                               |
| Android Hermes export  | 통과, `reports/guard-final-android/`                           |

Jest·정적 검사 로그는 임시 검사 폴더의 `logs/guard-final-*.log`, 최종 웹 결과는 `reports/full-once-20261120-9qpwszd0/`에 보존했다. 전체 Playwright는 소스 수정 없이 `--workers=1 --trace retain-on-failure`와 검사 시간 동안의 `caffeinate -di`를 적용해 한 번만 실행했다. 원본과 검사 복사본의 대상 286개 파일이 동일함을 확인했다. 이후 이 문서와 인계 문서의 최종 결과 안내만 보완했다.

**S11 BottomSheet 닫힘 생명주기 결함은 간헐적 미해결 사항이다.** 이전 반복 검사와 별도 브라우저 진단에서 닫힌 시트가 화면 밖에 남고, Tab으로 내부 버튼에 포커스가 이동하면서 다시 화면 안에 들어오는 현상이 재현됐다. 최신 전체 검사 통과는 이 결함의 해결을 뜻하지 않는다. 정확한 내부 종료·포털 해제 콜백 실패 원인은 미확정이며, 제품 수정이나 assertion 완화로 해결한 것이 아니다. S01의 고정 표시 데이터 불일치와는 별개의 문제이고, 공용 BottomSheet 담당자와 종료·포커스 계약을 검토해야 한다. 기존 trace와 진단 근거는 `reports/two-failures-20261120-5i_lvwl9/`, `reports/sheet-contract-20261120-qo3jtn47/`에 남아 있다.

원본 저장소의 오래된 Expo Router 생성 타입 오류 44건은 검사 복사본의 TypeScript 통과와 구분한다. 원본 생성 파일을 변경하지 않았으며, 기존 Expo Doctor 19/20 의존성 문제도 이번 작업에서 해결하지 않았다. Android 네이티브 실행·Maestro와 GitHub CI는 미검증이다.

## 2026-11-24 장치 상태 조회와 작업 메뉴 복귀

[이슈 #71](https://github.com/HandsOn-ondevice/HandsOn-Frontend/issues/71)의 회귀를 Node 24.3.0과 Chromium에서 확인했다. 수정 전 `0c0981c`에 같은 Playwright 단언을 적용했을 때, Edge 응답 fixture에서는 메뉴의 `장치 상태 확인` 버튼을 찾지 못했고 Mock에서는 장치 상태의 `뒤로가기`가 기대 경로 `/session-menu` 대신 `/execution`을 열었다.

- 수정 후 `researcher-workflow-session-menu.spec.ts` 4개와 `edge-measurement.spec.ts` 2개가 통과했다. Mock은 360px·412px에서 작업 메뉴로 돌아와 기존 조건·회차와 완료 기록을 유지했다. Edge 응답 fixture는 저장된 측정값 표시, 장치 화면에서 heartbeat 갱신, 같은 조건·회차로 복귀하는 동안 추가 세션 명령이 없음을 확인했다.
- Android 사전 검증 시나리오 `session-device-status-android.yaml`은 Mock의 저장된 50% 조건 3회차를 재개하고, 장치 화면에서 2회차의 마지막 측정값을 확인한 뒤 메뉴를 거쳐 3회차로 복귀한다. Android 실행 결과는 해당 PR의 Maestro 사전 실행 링크에서 확인할 수 있다.
- 실제 Edge 장치 연결과 실측값은 확인하지 않았다.
