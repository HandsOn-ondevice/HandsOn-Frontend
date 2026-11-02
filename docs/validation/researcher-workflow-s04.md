# 연구생 워크플로 기반·S04 검증 기록

작업일: 2026-11-02. 범위는 워크플로 기반과 S04이며 S05~S15 업무 기능은 구현하지 않았다.

## 구현과 진입

- 기존 앱 기본 진입·Provider·디자인 시스템·Gallery·ExecutionExample은 유지한다.
- 개발 빌드에서 `handson://researcher-workflow` 또는 웹 `/researcher-workflow`로 진입한다.
- 새 Mock 실험은 0/6으로 시작한다. 별도 버튼은 Figma 검증용 2/6 세션을 생성한다.
- 세션 경로는 `/researcher-workflow/[sessionId]/preparation`이다.
- 작업자 확인 5개 뒤 `확인 완료`를 누르면 `device-check-pending`으로 이동한다. 이는 S05 기능이 아닌 미구현 안내이며 통신·측정을 수행하지 않는다.
- 세션은 앱 실행 중 메모리에만 유지한다. 화면 이동 후 재조회는 가능하지만 앱 재시작·웹 새로고침 시 초기화된다.

## 디자인 기준과 차이

- Figma `PDVmFhYGwSHs6ZrQmsowek`, 최종 영역 `2126:4153`, S04 `2085:357`을 다시 조회하고 스크린샷·문구·간격·타이포그래피를 확인했다.
- AppBar, CheckboxRow, StepProgress, FeedbackPanel, ActionShelf, BottomSheet와 기존 AppText·Icon·StatusBar를 재사용했다. 색·간격은 기존 토큰을 사용한다.
- 기본 본문 간격 10, 여백 24, 체크 행·하단 버튼의 크기·상태는 기존 공통 컴포넌트를 따른다.
- Mock 안내, 진행 조건 설명, 로딩·오류·재조회와 정보 시트는 동작과 데이터 출처를 명확히 하기 위한 추가 요소다.
- Figma의 2/6 문구에 비해 긴 진행 막대는 복제하지 않았다. 실제 완료 수로 계산한 33%를 표시한다.
- 통신 항목은 S05의 시스템 확인 책임이므로 S04에서는 비활성이다. 작업자 확인 5개면 5/6·83% 상태에서 S05 연결 지점으로 이동 가능하다.
- OS 상태 표시줄·실제 inset, 글꼴 등 기존 문서의 플랫폼 차이를 유지한다.

## 구조와 실제 연동 경계

- `domain`: 고정 절차 스냅샷, 세션, 준비 항목, 근거, 이벤트와 준비 상태 selector.
- `application`: Repository 인터페이스, 생성 입력, 요청 ID.
- `infrastructure/mock`: 합성 절차·디자인 fixture, 순수 상태 전환, 메모리 저장·구독.
- `state`: feature 전용 Provider와 조회·명령·구독·오류·재조회 Hook.
- 근거는 `human/program/sensor`와 `mock/api`를 구분한다. 이번 구현은 human 확인과 program 준비 완료 근거만 생성하며 sensor 근거는 만들지 않는다.
- 확인 해제도 별도 이력으로 보존한다. 현재 확인 시각·근거 연결은 해제 시 비운다.
- 동일 requestId의 동일 명령은 재적용하지 않고 현재 스냅샷을 반환한다. 다른 명령에 같은 ID를 쓰면 거절한다. 오래된 revision은 거절한다.
- 실제 센서 안전 임계값·장비 제어·TTS·AI·서버 제출은 구현하지 않았다.

## 팀 합의가 필요한 계약

1. S03에서 세션 생성 후 sessionId를 전달할지, S04 진입 전에 공통 서비스가 생성할지.
2. 승인 절차 스냅샷과 작업자·장치 ID의 실제 공급 주체 및 API 인증.
3. 앱 재시작 이후 영속 복원 범위. 현재 Mock은 메모리 전용이다.
4. 실제 API의 requestId 멱등성, expectedRevision 충돌 응답, 구독 갱신 방식.
5. S05에서 통신 확인을 기록하고 6/6으로 갱신할 명령·근거·다음 상태.
6. S04 제출 뒤 준비 항목 수정이 필요할 때의 명시적인 재개방 절차. 현재는 제출 후 잠근다.

## 환경과 검사

- 기존 lockfile로 `npm ci` 실행. package.json·lockfile·CI 설정은 변경하지 않았다.
- 실행 Node는 설치된 24.11.1이며 package engines 범위에 해당한다. `.nvmrc`의 정확한 24.3.0과는 다르다.
- Jest: 준비 체크·해제·진행률·진행 차단·근거·중복 요청·동시 revision·고정 버전·구독·복원·오류 재조회·fixture 분리·S05 안내·기존 갤러리와 S06 왕복을 검증한다.
- 웹 Chrome 412×920에서 Figma 2/6 상태, 필수 5개 완료 후 버튼 활성화, S05 미구현 연결 안내 이동·복귀를 확인했다. 360×800에서도 본문 스크롤 영역과 하단 버튼 배치를 시각 확인했다. 네이티브 Android 결과로 간주하지 않는다.
- Android 실행 미검증: 연결된 기기 없음. 설치된 SDK Platform은 34·35이며 README가 요구하는 37은 없다. 네이티브 생성 폴더를 만들거나 수정하지 않았다.
- `npm run typecheck`: 통과.
- `npm run lint`: 오류 없이 통과. Expo가 생성한 `.expo/types/router.d.ts`의 사용되지 않은 eslint-disable 경고 1개가 있다. 생성 파일이나 CI 설정을 수정해 숨기지 않았다.
- `npm run format:check`: 통과.
- `npm run test:ci -- --watchman=false`: 5개 suite, 49개 테스트 통과. 기존 28개와 신규 21개이며 watchman 사용만 끄고 동일 Jest 검사를 실행했다.
- `npm run export:android`: Android Hermes 번들 생성 통과. APK 빌드·설치·네이티브 레이아웃 검증을 대체하지 않는다.
- `npm run doctor`: 이번 작업에서는 미실시. 최신 main의 Expo 정합성 수정은 병합하지 않았으며 현재 브랜치 lockfile을 유지했다.
- Android·TalkBack·네이티브 글꼴 확대·네이티브 바텀시트 제스처는 미검증이다.

## Git 기준

- 시작 브랜치 `feat/researcher-workflow`, 작업 트리 깨끗함, HEAD `f3ab414`.
- fetch 후 origin/main은 `0cac8fa`로 2개 커밋 앞섰다: `23af889` 기여 가이드·Expo 정합성 수정, `0cac8fa` Playwright 환경 추가.
- main의 AGENTS.md도 읽었으나 현재 브랜치에는 해당 파일이 없다. main 변경은 가져오지 않았으며 브랜치 전환·merge·commit·push·PR은 수행하지 않았다.
- 이번 테스트는 현재 브랜치의 Jest·설정 기준이다. main의 Playwright 환경은 병합하지 않아 사용하지 않았다.
