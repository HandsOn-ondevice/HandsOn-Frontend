# S05~S07 디자인·정보 표시 보완 검증 (2026-11-03)

## 기준과 보존

- 브랜치 `feat/researcher-workflow`, HEAD `a617f512394bffc8a04bfa7ed628bbd6a3b3ce89` 유지.
- 시작 상태는 수정 31개·신규 3개, 총 34개로 직전 보고와 일치했다. 스테이징은 비어 있었다.
- 작업 전 34개 파일을 저장소 외부의 로컬 백업에 복사하고 SHA-256을 검증했다. `worktree.json`에 상대 경로와 해시를 보관했다. 기존 파일 삭제 0개. 이번 작업에 필요한 12개는 기존 미커밋 내용을 바탕으로 추가 수정하고 나머지 22개는 해시가 동일하다.
- 기존 진단/로그/trace 135개를 해시로 재검증해 모두 보존했다. 이번 진단은 새 경로에 저장했다.
- S04 PreparationScreen, 기존 S05 검증·모델·Mock Repository 및 전환 엔진, feature Provider의 배포 차단을 변경하지 않았다. 공통 디자인 시스템/RootLayout/폰트/에셋/설정/패키지/갤러리/팀원 화면도 변경하지 않았다.
- `researcher-workflow.screen.test.tsx` 변경은 S05 직접 진입 화면의 새 미연결 문구 기대값 한 곳이다. S04 구현과 테스트 동작은 유지했다.
- git add/commit/push/merge/reset/rebase/브랜치 전환을 실행하지 않았다.

## 직접 확인한 Figma

- [S05 2085:461](https://www.figma.com/design/PDVmFhYGwSHs6ZrQmsowek/?node-id=2085-461): 412×920, 실험 시작 전 점검, 초록색 연결 성공 카드, BH1750/INA219/BME280 세 카드, 하단 시작 버튼.
- [S06 2085:528](https://www.figma.com/design/PDVmFhYGwSHs6ZrQmsowek/?node-id=2085-528): LED 출력 특성 측정, 절차 정보, 진행률, 출력별 회차 카드, 작업 안내, 2열 측정 카드 네 개, 음성 영역, 안내 반복/완료 요청.
- [S07 2085:652](https://www.figma.com/design/PDVmFhYGwSHs6ZrQmsowek/?node-id=2085-652): 모호한 음성 확인, 실험명/조건/회차, 흰 질문 카드와 중앙 마이크, 세 선택지, 보존 안내, 하단 복귀 버튼.
- 브라우저에서 각 프레임을 직접 선택·확대해 비교했다. Figma 파일은 편집하지 않았다. 세부 레이어의 모든 수치 속성을 추출하거나 픽셀 단위 일치를 검증한 것은 아니다.

## S05 연결 표시와 계약

`domain/device-connection.ts`의 읽기 전용 selector가 출처/활성화 여부/기존 점검 검증을 확인하고, feature의 DeviceConnectionCard가 공통 FeedbackPanel을 재사용한다.

| 상태                                               | 제목                   | 보조 문구/처리                                                     |
| -------------------------------------------------- | ---------------------- | ------------------------------------------------------------------ |
| 개발 환경의 명시적 Mock 실행 + 현재 점검 검증 성공 | Mock 기기 연결됨       | 모의 장치 응답 확인; 초록색/체크 아이콘                            |
| API 출처 + 현재 점검 검증 성공                     | 확인된 장치명 + 연결됨 | 응답의 deviceId/checkedAt만 사용. Wi-Fi·지연 시간 등을 만들지 않음 |
| 점검 진행 중                                       | 장치 연결 확인 중      | 대기 안내; 정보 색상                                               |
| 미점검 또는 미연결                                 | 기기 미연결            | 점검 시작/응답 실패 사유; 경고 색상                                |
| 실패·timeout·stale·잘못된 응답                     | 장치 연결 실패         | 검증 사유; 오류 색상                                               |

- 성공 카드는 보수적으로 현재 전체 필수 점검 검증을 통과한 경우에만 허용한다. 전송 연결 필드가 connected라도 센서 검증 실패면 연결 성공 카드로 승격하지 않는다. 실제 전송 연결과 센서 점검을 독립적으로 표시할 필요가 생기면 API의 별도 권위 있는 연결 계약부터 합의해야 한다.
- 단순히 숫자가 남아 있다는 이유로 실제 연결을 표시하지 않는다. API 실패를 Mock 성공으로 바꾸지 않는다.
- session.source와 실제 Repository의 Mock 활성화 여부를 함께 확인한다. source=mock만 있고 명시적 제어기가 없으면 성공 표시를 허용하지 않는다.
- 기존 attemptId/요청·관측·보고·수신 시각 검증, raw report/validation 분리, 센서별 카드/근거 판정, 재시도/중복 방지는 그대로 유지했다.
- 앱에는 실제 API 구현이나 가짜 실장비 연결 생성 경로를 추가하지 않았다. API 표시 계약은 테스트 스냅샷으로만 검증했다.
- 'Mock 기기' 표시는 S05 연결 카드 한 곳에만 추가했다. 다른 사용자 화면의 개발 용어는 늘리지 않았다.

## S06 수정 전후와 완료 표시

- 기존 LED 스냅샷의 화면 제목만 `LED 출력 특성 측정`으로 맞춘다. procedureDisplayTitle을 S06/S07에서 사용하며 승인 스냅샷 title/버전은 변경하지 않는다. 다른 절차의 제목은 그대로 표시한다. S04에는 적용하지 않는다.
- 일반 소개 문장을 줄이고 절차 버전→유효 측정 진행률→출력 조건/회차→현재 작업 안내→측정 카드→음성 영역 순서를 유지했다. 토큰 기반 간격을 조정하고 BH1750/INA219 값은 Figma의 녹색, BME280 값은 파란색 의미 토큰을 사용한다.
- 진행률은 실제 유효 측정 수/절차 설정 합계다. 현재 초안은 0/15→15/15이며, Figma의 전체 절차 11/16·64%·50% 2회차는 하드코딩하지 않았다. 전체 절차 진행률이라고 표시하지 않는다.
- 이전에는 완료 후 cursor=null이라 current latest를 못 찾아 네 카드가 모두 현재 회차 응답 없음이었다. 완료 상태에서는 selectLastValidMeasurement가 마지막 valid 응답 중 confirmedAt, 응답 검증, measurementAccepted 이벤트와 같은 attempt/커서 근거를 갖는 기록을 찾는다.
- 찾은 저장 응답은 `마지막 유효 측정값 · 조건/회차`로 표시한다. attemptId, 커서, 관측 시각, 요청/수락 이벤트와 근거는 변경하지 않는다. 저장값이 없으면 완료 상태의 결측 안내와 —만 표시한다.
- 완료된 세션은 cursor=null/15개 valid 그대로다. 표시 때문에 새 응답 요청, 재시작, 재완료, 실험 종료/제출/정리 기능을 실행하지 않는다.

## S07 제거·유지 문구

제거한 일반 화면의 중복 정보:

- 상단 `뜻을 선택하기 전에는 명령을 실행하지 않습니다.`
- 질문 카드의 같은 의미의 추가 설명.
- 유효 요청에서 반복되는 `선택 전에는 명령을 실행하지 않습니다. 뜻을 선택한 뒤 하단 버튼으로 확정해 주세요.`
- 선택 직후 반복되는 `선택: … 하단 … 누르면 선택을 확정합니다.`
- 별도 `선택하지 않고 취소` 버튼.
- 절차 버전은 더 보기의 정보로 옮겼다.

유지한 정보와 동작:

- 실험명/현재 조건·회차, 질문, 세 선택지, `현재 단계와 측정 회차는 바꾸지 않았습니다.`, 하단 복귀 버튼.
- 상단 뒤로가기는 dismissVoiceClarification으로 선택을 확정하지 않고 취소한다. 브라우저 자체 뒤로가기는 확정으로 취급하지 않는 기존 규칙도 유지한다.
- 선택만으로는 명령을 실행하지 않으며 하단 버튼으로 확정한다. 선택됨 접근성 라벨과 확정/취소 설명 accessibilityHint를 유지했다. 미선택에서는 하단 버튼이 비활성이다.
- 오류·유효하지 않은 요청의 안내/재조회는 숨기지 않았다. 정상 흐름의 반복 설명만 줄였다.
- 질문 카드 최소 높이/여백, 중앙 마이크와 선택지 간격을 Figma에 가깝게 조정했다. 글자 확대나 긴 발화는 높이 확장과 스크롤을 허용한다.

## 검사 결과

Node 24.3.0, 기존 검사 설정과 시간 제한 유지.

| 검사                            | 결과                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------- |
| 관련 Jest                       | 6 suite, 79개 통과                                                              |
| 전체 Jest                       | 12 suite, 140개 통과 (기존 127개 + 새 13개), 11.06초                            |
| TypeScript                      | 통과. 새 연결 상태 union의 narrowing 오류 한 곳을 분리된 union으로 수정 후 통과 |
| ESLint                          | 오류 0, 기존 .expo/types/router.d.ts unused eslint-disable 경고 1               |
| format:check / git diff --check | 통과                                                                            |
| 전체 Playwright                 | 기본 4 workers, 9개 통과, 36.3초. 기존 8개 및 완료 후 카드 검증 1개             |
| 실제 웹 크기                    | 360×800, 412×920에서 흐름·스크롤·버튼 겹침·가로 overflow 및 스크린샷 확인       |
| 실제 Android/장비/서버/음성     | 미실행·미연동                                                                   |

- Playwright 로그/trace/스크린샷: `artifacts/playwright/diagnostics/design-s05-s07-20261103-214751-444403`. 기존 HTML 보고서나 trace를 덮어쓰지 않았다.
- trace 9개에 pageError/console error 0개. 폰트 HTTP 응답 36개 모두 저장소 원본 SHA-256과 일치. 이번에는 폰트 손상이나 Playwright 실패가 없었으며 반복 실행/시간 제한 변경도 하지 않았다.
- 이전 간헐적 폰트 HTTP 응답 손상의 근본 원인은 여전히 미확정이다. 이번 통과를 근본 원인 해결로 해석하지 않는다. 공통 폰트/RootLayout을 변경하지 않았다.

## 남은 Figma 차이와 실연동 과제

- 시스템 상태바/기기 홈 표시/Safe Area/웹 스크롤바/Expo 개발 표시가 Figma 정적 기기 프레임과 다르다. 기존 Noto Sans KR 대체 정책도 유지하며 SF Pro와 글자 폭이 완전히 같지 않다.
- 공통 컴포넌트의 타이포그래피·카드 내부 크기는 유지했다. 모든 여백/높이의 픽셀 일치를 검증하지 않았다. 오류/미연결/긴 문구 상태는 정적 성공 프레임 외 확장 상태다.
- S06에는 Mock 흐름에 필요한 현재 회차 응답 확인 버튼과 실제 상태 사유가 남아 Figma보다 스크롤이 길 수 있다. 선택 결과 안내도 동작 확인을 위해 유지한다.
- 음성 영역은 실제 녹음 가능한 '말씀하세요'로 가장하지 않고 '음성 명령 확인'을 유지한다. S07 기본 재측정 강조는 자동 선택으로 적용하지 않는다. 강조는 실제 선택을 따른다.
- API는 확인된 장치 ID와 승인 스냅샷의 장치명 매핑, 데이터 출처, 연결 응답과 센서 검증의 권위/범위, attemptId 상관관계, 시각 동기화/신선도/무효화 정책을 먼저 합의해야 한다. 연결 정보가 없으면 임의 Wi-Fi/지연값을 추가하지 않는다.
- 실제 API Repository 주입·인증·DTO 변환·구독/재접속과 실제 센서/STT/TTS/AI는 별도 담당 작업이다. 현재 기본 배포 Mock 차단은 유지한다.
- 웹 확인: http://localhost:8081/researcher-workflow. 새 실험 준비 시작→작업자 5개 확인→확인 완료→점검 시작→실험 측정 시작. S07은 음성 명령 확인으로 진입한다. 재시도 조건은 더 보기→미리보기 설정에서 바꾼다. 새로고침은 메모리 세션을 초기화한다.

## 이번 작업 파일 목록

이번 작업은 기존 12개 수정 + 신규 5개, 총 17개다. 이전 변경을 합친 누적 상태는 수정 31개 + 신규 8개, 총 39개이며 모두 미스테이징이다.

- `__tests__/researcher-workflow-design.test.tsx` (신규)
- `__tests__/researcher-workflow-device-screen.test.tsx`
- `__tests__/researcher-workflow-execution-screen.test.tsx`
- `__tests__/researcher-workflow-voice.test.tsx`
- `__tests__/researcher-workflow.screen.test.tsx`
- `docs/validation/researcher-workflow-design-s05-s07-20261103.md` (신규)
- `e2e/researcher-workflow-s05.spec.ts`
- `e2e/researcher-workflow-s06.spec.ts`
- `e2e/researcher-workflow-s07.spec.ts`
- `src/features/researcher-workflow/domain/device-connection.ts` (신규)
- `src/features/researcher-workflow/domain/execution.ts`
- `src/features/researcher-workflow/screens/DeviceCheckConnectionScreen.tsx`
- `src/features/researcher-workflow/screens/DeviceConnectionCard.tsx` (신규)
- `src/features/researcher-workflow/screens/ExecutionMetrics.tsx`
- `src/features/researcher-workflow/screens/ExecutionScreen.tsx`
- `src/features/researcher-workflow/screens/VoiceClarificationScreen.tsx`
- `src/features/researcher-workflow/screens/procedure-display-title.ts` (신규)
