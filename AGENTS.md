# Repository Guidelines

HandsOn은 연구실 실험 절차를 지원하는 Android 앱이다. 현재 범위는 Expo 기반 디자인 시스템과 개발 갤러리다. 센서·음성·차트 예시는 합성 데이터다.

## Project Structure & Module Organization

- `src/app/`: Expo Router 화면 진입점과 Provider, 폰트 초기화.
- `src/design-system/`: 토큰, 기본 요소, 컴포넌트와 공개 export인 `index.ts`. 아이콘·폰트·이미지는 `assets/` 하위에 둔다.
- `src/dev/`: 컴포넌트 갤러리와 `ExecutionExample.tsx` 조합 예제.
- `__tests__/`: 컴포넌트 동작 테스트. 공통 mock은 `jest.setup.js`, SVG 대체 모듈은 `test/svg.js`에 둔다.
- `docs/design/`: 디자인 기준과 에셋 출처. `docs/validation/`: 실제 검증 기록과 Android 캡처.

## Build, Test, and Development Commands

Node 버전은 `.nvmrc`의 24.3.0을 사용한다. Android 실행에는 Android SDK와 JDK 21이 필요하며 `ANDROID_HOME`, `JAVA_HOME`을 설정한다.

- `nvm use` 후 `npm ci`: 고정된 lockfile 기준으로 의존성을 설치한다.
- `npm run android`: 네이티브 프로젝트 생성, development build 설치와 실행.
- `npm start`: 설치된 development build용 Metro 서버 실행.
- `npm run typecheck`, `npm run lint`, `npm run format:check`: 타입, ESLint, Prettier 검사.
- `npm run test:ci`: CI와 동일하게 Jest를 직렬 실행.
- `npm run doctor`: Expo 의존성·설정 검사.
- `npm run export:android`: Android 배포용 JavaScript 번들 생성.

## Coding Style & Naming Conventions

TypeScript strict 모드를 유지한다. 들여쓰기는 공백 2칸, 문자열은 작은따옴표, 줄 너비는 100자로 맞추며 Prettier의 trailing comma 설정을 따른다.

컴포넌트와 타입은 PascalCase, 함수·변수는 camelCase, Hook은 `use` 접두사를 사용한다. `@/`는 `src/`를 가리킨다. 스타일은 `StyleSheet`와 `tokens.ts`의 의미 토큰을 사용한다. 입력값과 업무 상태는 호출자가 소유하고, 공통 컴포넌트는 표시와 콜백을 담당한다.

## Testing Guidelines

Jest의 `jest-expo` preset과 React Native Testing Library를 사용한다. 테스트는 `__tests__/*.test.tsx`에 추가하고, 이름에 검증할 동작을 명시한다. 예: 비활성 버튼의 콜백 차단, 선택값 전달, 결측값 표시.

대상 검사에는 `npm test -- controls.test.tsx`를 사용한다. 수치화된 coverage 기준은 설정되어 있지 않다. UI 변경은 Android에서 제스처·키보드·레이아웃을 확인하고, 실행 환경과 남은 미확인을 검증 기록에 남긴다.

## Commit & Pull Request Guidelines

커밋은 기존 이력처럼 `type: 짧은 한국어 설명`으로 작성한다. 사용된 타입은 `feat`, `chore`, `docs`, `design`이다.

최신 `main`에서 짧은 작업 브랜치를 만들고 `main` 대상으로 PR을 연다. `.github/pull_request_template.md`에 변경 내용, 실행한 검사와 결과, 리뷰 포인트, 화면, 남은 사항을 작성한다. 관련 이슈가 있으면 연결하고 미실시 검사는 명시한다. 리뷰와 CI 통과 후 squash merge한다.

## Native Configuration & Assets

`android/`, `ios/`는 CNG 생성물이므로 직접 수정하지 않는다. 설정은 `app.json`과 config plugin에 반영한다. SDK 호환 패키지는 `npx expo install`로 추가하고 `package-lock.json`을 함께 커밋한다. 원본 에셋의 출처·해시와 폰트 라이선스를 보존한다.
