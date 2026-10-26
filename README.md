# HandsOn Frontend

신규 연구생의 실험 절차 실행과 숙련자의 절차 관리를 지원하는 HandsOn Android 앱입니다. 현재 범위는 **Aurora Lab 디자인 시스템, 26개 공통 컴포넌트와 개발용 갤러리**입니다. 센서·음성·차트 예시는 가상의 합성 데이터이며 API·센서·녹음·AI를 실제로 실행하지 않습니다.

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

개발 빌드는 갤러리로 시작합니다. 카테고리와 컴포넌트를 선택해 전체 변형과 입력·선택·시트를 확인할 수 있으며 **S06 조합 예제**도 제공합니다. 배포 빌드는 준비 화면을 표시합니다. iOS 실행 검증은 현재 범위 밖입니다.

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

## GitHub Flow

1. 최신 main에서 작업별 단기 브랜치를 만듭니다.
2. 관련 변경만 커밋하고 push합니다. 예: `feat/procedure-list`, `fix/sensor-card`.
3. main 대상 PR에 변경 내용, 실제 검증과 화면을 기록합니다.
4. 리뷰와 CI를 통과하면 squash merge하고 작업 브랜치를 삭제합니다.

최초 main은 README 단독 커밋으로 생성했습니다. 초기 세팅은 `chore/initial-setup`에서 PR로 검토합니다.

네이티브 `android/`, `ios/`는 CNG 생성물입니다. 설정은 app config·config plugin에 기록하고 생성 폴더를 직접 수정하지 않습니다. SDK 호환 패키지는 `npx expo install`로 추가하며 lockfile을 함께 커밋합니다.
