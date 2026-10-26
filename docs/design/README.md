# Aurora Lab 디자인 시스템

2026-10-26 사용자가 확정한 Figma를 기준으로 작성했습니다.

## 기준과 원본

- [Foundations · 2078:418](https://www.figma.com/design/PDVmFhYGwSHs6ZrQmsowek?node-id=2078-418)
- [Components & States · 2081:1269](https://www.figma.com/design/PDVmFhYGwSHs6ZrQmsowek?node-id=2081-1269)
- [최종 화면 · 2126:4153](https://www.figma.com/design/PDVmFhYGwSHs6ZrQmsowek?node-id=2126-4153)
- `figma-tokens.json`: Primitives 25 · Semantic 27 · Dimensions 36. Figma ID와 별칭 관계를 보존합니다.
- `assets-manifest.json`: 원본 노드·파일·SHA256. 원본 에셋은 수정하지 않았습니다.

Light 테마만 제공합니다. 글꼴 7종, 간격·곡률·테두리·그림자·그라데이션·스프링 토큰은 `tokens.ts`에서 공유합니다. 의미색은 원시 팔레트의 별칭을 참조합니다. 흰 글자용 HeroPanel에는 contrast 그라데이션을 사용합니다.

## 컴포넌트

| 분류          | Figma 이름을 유지한 컴포넌트                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 입력          | Button, IconButton, TextField, SelectField, CheckboxRow, SegmentedControl                                                            |
| 레이아웃·탐색 | AppBar, BottomNavigation, SectionHeader, SurfaceCard, ActionShelf, BottomSheet, HeroPanel, StatusBar                                 |
| 상태 안내     | StatusBadge, FeedbackPanel                                                                                                           |
| 업무 표현     | ProcedureCard, SensorCard, MetricTile, ConditionProgress, StepProgress, EvidenceRow, VoicePanel, TimelineItem, ResultChart, RoleCard |

모든 Props, 업무 상태 union, `Tone`, `IconName`, `ThemeTokens`를 디자인 시스템 진입점에서 export합니다. 입력은 `value`/`onChange`, 동작은 `onPress`로 제어합니다. `disabled`와 `loading`은 실행을 차단합니다. 터치·키보드 포커스는 실제 native 입력에서 처리합니다.

- Default/Pressed/Focus/Disabled/Loading과 Draft/Approved/Paused/Held/Complete는 서로 다른 상태입니다.
- EvidenceRow는 human/sensor/program 출처를 구분합니다.
- SensorCard는 normal/stale/disconnected/outOfRange를 구분하며 disconnected에서는 이전 측정값을 숨깁니다.
- VoicePanel의 Listening/Processing 등은 전달받은 표시 상태입니다. 마이크를 열지 않습니다.
- ResultChart는 외부에서 전달한 수치만 표시합니다. 0과 결측(null)을 구분하고 결측값을 보간하지 않습니다. 갤러리 수치는 가상의 합성 데이터입니다.
- `BottomSheet`는 앱 루트의 GestureHandlerRootView·BottomSheetModalProvider가 필요합니다. 내부 TextField에는 `withinSheet`를 지정합니다.
- ActionShelf를 화면 하단에 고정할 때 `safeArea`를 지정합니다. 내비게이션과 업무 콜백은 호출자가 연결합니다.

## 의도적인 플랫폼 차이

1. Figma의 SF Pro 측정값은 사용자 결정에 따라 **Noto Sans KR 600, 27/34**로 대체했습니다. 한국어 본문과 같은 글꼴 계열이며 파일을 로컬 번들합니다.
2. StatusBar는 expo-status-bar를 통한 Android OS 제어입니다. 고정된 시각·배터리·제스처 막대를 앱 콘텐츠로 그리지 않습니다. 실제 시스템 inset을 사용합니다.
3. Figma의 좌표·412×920 화면은 Flex 레이아웃과 실제 inset으로 옮깁니다. 텍스트 확대 시 내용 높이와 스크롤을 허용합니다.
4. Android의 네이티브 모달·바텀시트와 접근성·모션 줄이기 설정을 사용합니다. SVG는 원본 20×20을 보존하고 wrapper에서 스케일하며 의미색은 SVGR 변환 시 주입합니다.

## 개발용 진입

기본 진입점은 갤러리입니다. 개발 빌드에서 `handson://?component=SensorCard`, `handson://?example=execution` 형태로 특정 예제를 재현할 수 있습니다. 이 진입은 업무 상태를 저장하거나 서버에 요청하지 않습니다.
