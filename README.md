# HandsOn Frontend

신규 연구생의 실험 절차 실행과 숙련자의 절차 관리를 지원하는 HandsOn Android 앱입니다. 개발 빌드에서 역할·작업 환경을 선택하면 연구생은 진행 중인 실험·최근 기록과 승인 절차의 목록·상세를 확인하고, 숙련자는 Android 마이크로 절차 설명을 녹음해 원본을 저장할 수 있습니다. **Aurora Lab 디자인 시스템과 26개 공통 컴포넌트**는 개발용 갤러리에서 확인할 수 있습니다. 홈의 작업·결과, 승인 절차 목록·상세, 작업 환경·장치 정보, 갤러리의 센서·음성·차트는 가상의 합성 데이터입니다.

## 실행 환경

- Node **24.3.0** (`.nvmrc`) · npm · Expo SDK **58** · React Native **0.88**
- Android Studio와 Android SDK, JDK **21**
- Android 에뮬레이터 또는 USB 디버깅을 켠 Android 기기
- 첫 네이티브 빌드에는 SDK Platform **37**, Build Tools **37.0.0**, NDK **27.1.12297006**와 Gradle 다운로드가 필요합니다. Android SDK 라이선스가 수락돼 있으면 Gradle이 필요한 패키지를 설치합니다.

```sh
nvm install
nvm use
npm ci
npm run android
```

`ANDROID_HOME`은 Android SDK 경로, `JAVA_HOME`은 JDK 21 경로를 가리켜야 합니다. macOS Android Studio의 JDK는 다음과 같이 지정할 수 있습니다.

```sh
export ANDROID_HOME="$HOME/Library/Android/sdk"
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
npm run android
```

첫 명령은 CNG로 네이티브 프로젝트를 생성하고 development build를 설치한 뒤 Metro를 시작합니다. 이미 설치한 development build를 다시 사용할 때는 `npm start`를 실행합니다. 네이티브 의존성·app config가 바뀌면 `npm run android`로 다시 빌드합니다. Expo 계정과 EAS 클라우드 빌드는 필수 조건이 아닙니다.

앱은 역할과 작업 환경 선택 화면으로 시작합니다. 개발 빌드에서는 `handson://dev` 또는 개발 웹 서버의 `/dev`에서 갤러리를 열 수 있습니다. 카테고리와 컴포넌트를 선택해 전체 변형과 입력·선택·시트를 확인할 수 있으며 **S06 조합 예제**도 제공합니다. iOS 실행 검증은 현재 범위 밖입니다.

### 앱 진입과 화면 이동

`/`(S00)에서 선택을 마치면 연구생은 `/student`(S01), 숙련자는 `/expert`(E01)로 이동합니다. 선택은 앱 실행 중 메모리에 보관합니다. 연구생 홈은 선택한 환경을 기준으로 진행 중인 작업·승인 절차·최근 기록을 조회하며, 화면 복귀와 앱 활성화 시 다시 불러옵니다. 프로필에서 역할·작업 환경 선택으로 돌아갈 수 있습니다.

개발용 합성 데이터에서 지능형 임베디드·IoT 센서 연구실은 일시정지한 실험과 승인 절차·최근 결과를, 전자회로 실험실은 진행 중 작업과 목록이 없는 상태를 제공합니다. `loadStudentHome`은 개발 빌드 또는 Maestro용 빌드에서만 이 데이터를 반환합니다. 실제 홈 API는 아직 연결하지 않았으며, 일반 배포 빌드에서는 조회 실패와 재시도를 표시합니다.

연구생 홈의 승인된 절차 또는 **실험** 탭에서 `/procedures?environmentId=...`(S02)로 이동합니다. 목록에서 절차를 선택해 확인하면 `/procedures/[procedureId]`(S03)에서 선택한 승인 버전의 상세를 볼 수 있습니다.

S03의 **이 버전으로 준비 시작**은 선택한 절차·승인 버전의 실행 가능 여부를 다시 확인합니다. 개발·Maestro 빌드에서는 `/procedures/preparation`에서 전달한 절차 식별자·승인 버전·작업 환경을 확인할 수 있습니다. 실제 절차 API, 세션 생성 시점과 A의 `/researcher-workflow/[sessionId]/preparation` 연결은 계약 확정 후 연동합니다. [S02–S03 검증 기록](docs/validation/s02-s03-procedures.md)에 현재 전달 범위와 재현 방법을 정리했습니다.

최근 결과는 `/results/[resultId]?sessionId=...`, 이력과 장치는 `/history`, `/devices`로 연결합니다. 이 경로들은 준비 중 안내와 홈 복귀를 제공하는 인계 지점이며, 결과·이력 경로와 홈 응답 계약은 A·서버 담당과 확정해야 합니다. 이어하기는 기존 세션 ID를 `/researcher-workflow/[sessionId]/preparation`에 전달합니다.

숙련자 홈은 합성 데이터로 초안·승인 절차, 검토 대기·완료 결과와 최근 작업을 표시합니다. 하단 절차·현황에서 상태별 목록을 확인하고, 작업에서 돌아오거나 새로고침하면 현황을 다시 조회합니다. 기존 절차는 `/expert/procedures/[procedureId]`, 결과는 `/expert/results/[resultId]?procedureId=...`로 연결합니다. 두 화면은 선택한 작업의 요약을 제공하며, 편집·승인·결과 검토 처리는 후속 범위입니다. [E01 검증 기록](docs/validation/e01-expert-home.md)에 구현 범위와 확인 방법을 정리했습니다.

숙련자 홈의 **새 절차 음성으로 만들기**에서 `/expert/procedures/new`(E02)로 이동합니다. 녹음을 종료하면 유효한 원본을 저장하고 `/transcription?recordingId=...`(E03)에서 다시 읽습니다. E03은 변환 텍스트와 편집본을 녹음 ID로 보관하고, 마지막으로 확인한 텍스트로 요청한 초안을 저장한 뒤 E04로 이동합니다. 변환과 생성에는 개발용 모의 응답을 사용합니다. 자세한 범위는 [E02 녹음](docs/validation/e02-recording.md)과 [E03 변환·생성](docs/validation/e03-transcription.md)에 정리했습니다.

## 구조

| 위치                | 책임                                                       |
| ------------------- | ---------------------------------------------------------- |
| `src/app`           | Expo Router 진입점, Provider, 폰트 준비                    |
| `src/design-system` | 88개 토큰, 폰트·원본 에셋, 기본 요소, 26개 컴포넌트와 타입 |
| `src/dev`           | 개발용 카탈로그와 S06 조합 예제                            |
| `docs/design`       | Figma 원본 변수, 별칭, 에셋 출처·해시                      |
| `docs/validation`   | 실제 검증 기록과 Android 캡처                              |

```tsx
import { Button, SensorCard } from '@/design-system';

<Button label="완료 요청" onPress={requestCompletion} loading={pending} />;
<SensorCard title="BH1750" value="420 lx" state="stale" meta="8초 전" />;
```

입력값과 업무 상태는 호출자가 소유합니다. 컴포넌트는 표시와 콜백만 제공하며 승인 여부·센서 판정·세션 전환을 결정하지 않습니다. `previewState`는 갤러리에서 입력 상태를 재현하기 위한 속성입니다.

## 디자인

- [최종 화면](https://www.figma.com/design/PDVmFhYGwSHs6ZrQmsowek?node-id=2126-4153)
- [Foundations](https://www.figma.com/design/PDVmFhYGwSHs6ZrQmsowek?node-id=2078-418)
- [Components & States](https://www.figma.com/design/PDVmFhYGwSHs6ZrQmsowek?node-id=2081-1269)
- [디자인 시스템 사용·차이](docs/design/README.md)

스타일은 React Native StyleSheet와 의미 토큰으로 작성합니다. Noto Sans KR 400·500·600·700, SVG 아이콘 24개, 로고·일러스트를 로컬 번들해 런타임 다운로드 없이 표시합니다. 폰트의 OFL 라이선스를 함께 보관합니다.

## 검사

```sh
npm run typecheck
npm run lint
npm run format:check
npm run test:ci
npm run doctor
npm run export:android
```

PR과 main push에서 같은 검사를 GitHub Actions로 실행합니다. 번들·단위 테스트는 실제 기기의 제스처·키보드·레이아웃 확인을 대체하지 않습니다. 검증 결과와 남은 제한은 [검증 기록](docs/validation/README.md)에 적습니다.

## 웹 E2E 환경 확인

Playwright로 Expo 개발 웹 화면을 실행하고 `/dev`에 `컴포넌트 갤러리`가 표시되는지 확인합니다. 환경 확인용 스모크 테스트는 Chromium에서 실행합니다. Android/iOS 네이티브 앱 검증은 별도입니다.

Node 환경과 의존성을 준비한 뒤 Playwright 버전에 맞는 브라우저를 설치합니다. 웹 검사에는 Android SDK와 JDK가 필요하지 않습니다.

```sh
nvm install
nvm use
npm ci
npx playwright install chromium
npm run test:e2e
```

테스트가 `http://localhost:8081`의 Expo 웹 서버를 자동으로 시작하고 종료합니다. 같은 저장소의 개발 서버가 이미 해당 주소에서 실행 중이면 재사용합니다. 앱을 먼저 열어 확인하려면 별도 터미널에서 아래 명령을 실행하고 브라우저로 해당 주소에 접속합니다.

```sh
npm run web -- --localhost --port 8081
```

UI 모드에서는 아래 명령을 실행한 뒤 테스트를 선택해 실행할 수 있습니다.

```sh
npm run test:e2e:ui
```

실행 결과는 터미널과 `artifacts/playwright/report/`의 HTML 리포트에서 확인합니다. 테스트 생성물은 `artifacts/playwright/test-results/`에 저장되며, 두 경로 모두 기존 `artifacts/` 제외 규칙으로 Git 추적·린트·포맷 검사에서 제외됩니다.

```sh
npx playwright show-report artifacts/playwright/report
```

설정은 `playwright.config.ts`, 테스트는 `e2e/`에서 관리합니다. Jest는 기존 `__tests__/`만 실행합니다. 자세한 사용법은 [Playwright 실행 가이드](https://playwright.dev/docs/running-tests)를 참고합니다.

## GitHub Flow

1. 최신 main에서 작업별 단기 브랜치를 만듭니다.
2. 관련 변경만 커밋하고 push합니다. 예: `feat/procedure-list`, `fix/sensor-card`.
3. main 대상 PR에 변경 내용, 실제 검증과 화면을 기록합니다.
4. 리뷰와 CI를 통과하면 squash merge하고 작업 브랜치를 삭제합니다.

최초 main은 README 단독 커밋으로 생성했습니다. 초기 세팅은 `chore/initial-setup`에서 PR로 검토합니다.

네이티브 `android/`, `ios/`는 CNG 생성물입니다. 설정은 app config·config plugin에 기록하고 생성 폴더를 직접 수정하지 않습니다. SDK 호환 패키지는 `npx expo install`로 추가하며 lockfile을 함께 커밋합니다.
