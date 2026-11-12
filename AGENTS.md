# Repository Guidelines

HandsOn은 신규 연구생의 실험 준비와 숙련자의 절차 관리를 지원하는 Expo 기반 Android 앱이다. 역할·작업 환경 선택, 연구생 홈과 승인 절차 조회·준비 정보 전달, 숙련자 홈과 절차 설명 녹음·초안 생성 흐름을 제공한다. Android에서는 녹음 원본을 기기에 저장한다. 작업 환경·홈·절차 데이터와 STT·AI 초안 생성 응답은 개발 및 Maestro 검증용 fixture를 사용한다. 디자인 시스템은 개발 갤러리(`/dev`)에서 확인할 수 있다.

## Project Structure & Module Organization

- `src/app/`은 Expo Router의 화면 진입점과 공통 Provider·폰트 초기화를 담당한다.
- `src/features/`는 `entry`, `student-home`, `expert-home`, `procedures`, `recording`, `transcription`, `procedure-draft`의 화면과 기능별 상태·데이터 접근 코드를 담는다.
- `src/design-system/`은 토큰, 기본 요소, 공통 컴포넌트를 제공한다. 공개 진입점은 `index.ts`, 아이콘·폰트·이미지의 위치는 `assets/`다.
- `src/dev/`에는 컴포넌트 갤러리와 조합 예제를 둔다.
- `docs/design/`에는 디자인 기준과 에셋 출처를, `docs/validation/`에는 실행 환경·관찰 결과·캡처를 기록한다.

## Build, Test, and Development Commands

`.nvmrc`의 Node 24.3.0을 사용한다. Android 실행에는 Android SDK와 JDK 21이 필요하며 `ANDROID_HOME`, `JAVA_HOME`을 설정한다. 자세한 설정은 [README의 실행 환경](README.md#실행-환경)을 참고한다.

- `nvm use` 후 `npm ci`로 lockfile 기준의 의존성을 설치한다.
- `npm run android`로 Android development build를 생성·설치하고 실행한다. 이미 설치된 빌드에는 `npm start`로 Metro를 실행한다. 네이티브 의존성이나 앱 설정을 바꾸면 `npm run android`로 다시 빌드한다.
- `npm run web`으로 Expo 개발 웹을 실행한다.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:ci`, `npm run doctor`, `npm run export:android`는 `.github/workflows/checks.yml`이 실행하는 검사다.

## Coding Style & Naming Conventions

TypeScript strict 모드를 유지한다. 들여쓰기는 공백 2칸, 문자열은 작은따옴표, 줄 너비는 100자로 맞추며 Prettier의 trailing comma 설정을 따른다.

컴포넌트와 타입은 PascalCase, 함수·변수는 camelCase, Hook은 `use` 접두사를 사용한다. `@/`는 `src/`를 가리킨다. 스타일은 `StyleSheet`와 `tokens.ts`의 의미 토큰을 사용한다. 입력값과 업무 상태는 호출자가 소유하고, 공통 컴포넌트는 표시와 콜백을 담당한다.

## Testing Guidelines

### Jest

`__tests__/`의 `.test.ts`·`.test.tsx`에서 `jest-expo`와 React Native Testing Library로 컴포넌트 동작과 기능 로직을 확인한다. 공통 mock은 `jest.setup.js`, SVG 대체 모듈은 `test/svg.js`에 둔다. 테스트 이름에 검증할 동작을 적고, 대상 파일은 `npm test -- controls.test.tsx`처럼 지정한다. 전체 직렬 실행은 `npm run test:ci`를 사용한다.

### Playwright 웹 E2E

`e2e/`는 `playwright.config.ts`에 따라 Chromium에서 Expo 개발 웹을 검사한다. 개발 갤러리 진입, 역할·환경 선택, 연구생·숙련자 홈의 이동, E03에서 모의 변환 텍스트의 편집 복원과 저장 실패 후 재시도를 다룬다. 화면 동작은 기존 테스트처럼 접근성 역할과 이름을 기준으로 확인한다.

- `npm ci` 후 `npx playwright install chromium`으로 브라우저를 설치한다. 웹 검사에는 Android SDK와 JDK가 필요 없다.
- 전체 실행은 `npm run test:e2e`, 대상 실행은 `npm run test:e2e -- e2e/transcription.spec.ts`, UI 모드는 `npm run test:e2e:ui`를 사용한다.
- Playwright는 기본 `http://localhost:8081`에 Expo 웹 서버를 시작하거나 해당 주소에서 실행 중인 서버를 재사용한다. 다른 worktree의 Metro가 포트를 사용 중이면 `EXPO_E2E_PORT=8082 npm run test:e2e`처럼 포트를 바꾼다.
- HTML 리포트는 `artifacts/playwright/report/`, 스크린샷 등 테스트 결과물은 `artifacts/playwright/test-results/`에 저장된다. 두 경로는 Git 추적에서 제외된다. 리포트는 `npx playwright show-report artifacts/playwright/report`로 연다.
- Playwright는 현재 로컬 검증에 사용한다.

### Android Maestro

`.maestro/`의 시나리오는 `.github/workflows/maestro.yml`에서 Android 에뮬레이터로 실행한다. CI는 `EXPO_PUBLIC_HANDSON_MAESTRO=1`로 fixture를 활성화한 APK를 설치한다. 마이크 권한·녹음과 제스처·키보드·레이아웃 등 관련 네이티브 동작은 Android에서 확인한다. 실행 환경, 관찰 결과와 남은 미확인을 `docs/validation/`에 기록한다.

## Commit & Pull Request Guidelines

커밋은 기존 이력처럼 `type: 짧은 한국어 설명`으로 작성한다.

최신 `main`에서 짧은 작업 브랜치를 만들고 `main` 대상으로 PR을 연다. `.github/pull_request_template.md`에 변경 내용, 실행한 검사와 결과, 리뷰 포인트, 화면, 남은 사항을 작성한다. 관련 이슈가 있으면 연결하고 미실시 검사는 명시한다. 리뷰와 CI 통과 후 squash merge한다.

## Native Configuration & Assets

`android/`, `ios/`는 CNG 생성물이므로 직접 수정하지 않는다. 설정은 `app.json`과 config plugin에 반영한다. SDK 호환 패키지는 `npx expo install`로 추가하고 `package-lock.json`을 함께 커밋한다. 원본 에셋의 출처·해시와 폰트 라이선스를 보존한다.
