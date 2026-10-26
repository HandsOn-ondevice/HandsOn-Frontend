# 초기 세팅 검증 기록

검증일: 2026-10-26. 아래 결과는 공통 UI와 개발용 갤러리에 한정합니다. 센서·음성·차트는 가상의 합성 데이터이며 실제 통신·녹음·AI·측정 실험을 수행한 결과가 아닙니다.

## 환경과 자동 검사

- Node 24.3.0 · Expo 58.0.19 · React Native 0.88.0 · JDK 21.0.5
- Android 16(API 36), arm64-v8a Medium_Phone 에뮬레이터
- `npm run typecheck`, `npm run lint`, `npm run format:check`: 통과
- `npm run test:ci`: 3개 suite, **28개 테스트 통과**. 버튼 차단, 입력·선택 콜백, 탐색 선택, 시트 제어·재열기, 센서·이력 상태 문구, 차트 0/결측·빈 상태를 확인했습니다.
- `npm run doctor`: **20/20 통과**
- `npm run export:android`: Android Hermes 번들 생성 통과
- `npm run android -- --no-bundler --device emulator-5554`: native debug build 성공 및 설치·실행. 첫 빌드는 7분 47초, Gradle 483개 작업을 처리했습니다. 이후 JavaScript 수정은 같은 development build에서 다시 로드해 확인했습니다.

Jest의 SVG·Safe Area·Gorhom 모달·Reanimated enum은 단위 테스트 경계에서 대체합니다. 네이티브 애니메이션·제스처·키보드의 성공 근거는 아래 기기 확인입니다.

## 실제 Android 확인

- **412×920dp:** 컴포넌트 26종과 기초 3개 카탈로그를 순회해 59개 스크롤 프레임을 캡처했습니다. 대표 상태의 텍스트·색상·레이아웃, 24개 SVG, 원본 로고·일러스트, 한국어 폰트를 확인했습니다. 목록은 `native-gallery.json`에 있습니다.
- **S06 조합:** 현재 단계, 조건·회차, 안내, 측정 타일, 음성 표시, 고정 하단 동작을 확인했습니다.
- **바텀시트:** 최초 열기, 닫기·재열기, Android 뒤로가기, 아래로 드래그, 배경 탭, Info/Warning/Success, 모션 줄이기 설정에서 열기를 확인했습니다.
- **키보드:** 입력란에 포커스를 주고 문자열을 입력했습니다. IME 표시 상태를 확인했으며, 입력란이 키보드 위 화면 안에 유지되고 편집값이 반영됐습니다.
- **360×800dp·글꼴 1.3배:** 설정 변경 후 앱을 새로 시작해 S06의 문장 줄바꿈, 카드 재배치, 스크롤, 하단 버튼을 확인했습니다. 조건 퍼센트는 한 줄 안에서 크기를 맞춰 숫자와 기호가 분리되지 않도록 했습니다.

기기 확인 중 최초 닫힘 상태의 `dismiss()`가 Gorhom의 다음 열기를 막는 문제를 수정했습니다. Android의 `interactive + adjustResize`에서 키보드가 시트 내용을 덮는 동작도 확인해 Android만 `fillParent`로 확장하고 top inset을 적용했습니다. 같은 네이티브 빌드에서 수정 후 재확인했습니다.

## 캡처

- [갤러리](gallery-412x920.png)
- [S06 기준 크기](execution-412x920.png)
- [바텀시트](sheet-412x920.png) · [키보드와 입력](sheet-keyboard.png)
- [좁은 화면·확대 글꼴](execution-360x800-font130.png) · [스크롤](execution-360x800-font130-scrolled.png)
- [아이콘·원본 브랜드 에셋](icons-brand.png)

## 남은 확인과 알려진 제한

- 실물 Android 기기, TalkBack 실제 읽기 순서, iOS 실행은 미실시입니다. 모든 Figma 변형의 픽셀 차이를 수치 측정하거나 애니메이션 시간을 측정하지 않았습니다.
- Figma의 SF Pro→Noto Sans KR 600, OS StatusBar·실제 inset 적용은 승인된 차이입니다.
- `npm audit`에는 Expo CLI 하위 의존성에서 전파되는 **high 5건**이 남습니다. 직접 확인한 원인은 node-forge 1.4.0과 Zod 3.25.76입니다. 현재 node-forge 최신 배포도 1.4.0이며 Zod 수정 버전은 4.6.6 이상입니다. SDK 58 CLI가 사용하는 Zod 3을 강제로 major 교체하거나 audit가 제안하는 Expo 44로 내리지 않았습니다. 이는 도구 체인의 미해결 항목이며, 취약점이 해소됐다고 판정하지 않습니다.
  - [node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv)
  - [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
- Gradle은 upstream Expo·React Native 패키지에서 deprecation 경고를 출력합니다. 현재 빌드는 성공했으며, 생성된 네이티브 프로젝트나 node_modules를 직접 수정하지 않았습니다.
