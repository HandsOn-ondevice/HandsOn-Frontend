# S01 연구생 홈 디자인 기준

이슈 #5와 사용자가 2026-11-05에 첨부한 Figma SVG의 S01 프레임을 기준으로 구현했습니다.

- Figma: [S01 신규 연구생 홈 · 2084:285](https://www.figma.com/design/PDVmFhYGwSHs6ZrQmsowek?node-id=2084-285)
- 첨부 원본: `붙여넣은 텍스트.txt`, SVG 2091×13971
- 원본 SHA256: `b5d16c5d63608b852f0463ef4dc03314cffd390876de0d90ff201161955162b9`
- S01 추출 영역: `viewBox="594 612 412 920"`
- [첨부 SVG의 S01 기준 이미지](s01-reference.png)

브랜드 앱 바, 인사와 장치 상태, 진행 중 실험 카드와 이어하기, 승인 절차, 최근 기록, 고정 하단 내비게이션의 순서를 유지합니다. 기존 `AppBar`, `HeroPanel`, `Button`, `SurfaceCard`, `SectionHeader`, `StatusBadge`, `BottomNavigation`, `BottomSheet`와 의미 토큰을 재사용했습니다. 이슈에서 요구한 작업 환경·실행 장치 요약을 최근 기록 아래에 추가했습니다.

고정된 시각·배터리·제스처 막대는 그리지 않고 Android 시스템 상태 표시줄과 실제 safe area를 사용합니다. 본문은 스크롤하고 하단 내비게이션은 화면 아래에 유지합니다. 진행 중 작업이 없으면 새 실험 안내와 승인 절차 선택을 표시하며, 미조회·실패·빈 목록은 각각 다른 문구로 표시합니다.

연구생 이름·장치 연결 상태·실험·절차·결과는 합성 응답의 표시값입니다. 실제 API 또는 기기 통신으로 확인한 값이 아닙니다. 구현 화면과 확인 범위는 [S01 검증 기록](../validation/s01-student-home.md)에 남깁니다.
