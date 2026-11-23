# API-02 환경 선택과 역할별 홈 검증

2026-11-23에 격리된 HandsOn Edge v0.1.0 서버에서 확인했습니다. 서버는 `HandsOn-Backend` 커밋 `2c13ce8`의 시뮬레이션 모드로 실행했고, 검증 전용 데이터에 준비 중 세션과 완료 세션, 숙련자 초안을 마련했습니다.

## 검증 환경

- Expo 웹과 Chromium 모바일 화면 360 × 800에서 `e2e/edge-home.spec.ts`를 실행합니다.
- Expo에 `EXPO_PUBLIC_HANDSON_EDGE_BASE_URL`로 기기나 브라우저에서 접근할 수 있는 서버 주소를 설정합니다. 서버 CORS에서 Expo 웹의 출처를 허용합니다.
- 테스트 프로세스에 `HANDSON_E2E_OPERATOR_TOKEN`과 `HANDSON_E2E_EXPERT_TOKEN`을 설정합니다. 테스트는 역할을 선택한 뒤 화면 입력란에 각 토큰을 입력합니다.
- 실제 Edge 대상 테스트는 기존 fixture 테스트와 별도로 실행합니다. 이전에 켜 둔 Expo 웹 서버를 재사용하면 서버 주소가 다를 수 있으므로 검증용 포트를 따로 지정합니다.

```sh
HANDSON_E2E_EDGE_HOME=1 EXPO_E2E_PORT=8094 \
  EXPO_PUBLIC_HANDSON_EDGE_BASE_URL=http://127.0.0.1:18080 \
  npm run test:e2e -- e2e/edge-home.spec.ts
```

## Playwright 결과

모바일 Chromium에서 2개 시나리오가 통과했습니다.

- 연구생 홈 요청을 한 번 실패시켜 로딩과 오류 안내를 확인했습니다. 화면에서 다시 시도해 성공 응답의 홈 카드와 승인 절차 목록을 확인했습니다. 이어하기를 두 번 열어 같은 세션 ID와 revision 0을 확인했습니다.
- 숙련자 홈에서 Edge 응답의 초안, 승인 절차, 검토 대기 결과를 대조했습니다. 초안과 결과의 카드가 각 서버 ID가 포함된 화면으로 열렸습니다.
- 주요 버튼과 로딩·오류 문구는 세로 스크롤로 접근할 수 있었고 가로 스크롤은 발생하지 않았습니다. 두 시나리오에서 앱의 Edge 요청은 조회만 발생했습니다.

## 대표 요청과 응답

| 동작                        | Edge 요청                                                       | 확인한 응답                                                                                                                            |
| --------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 역할 선택 후 작업 환경 조회 | `GET /api/v1/work-profiles`, `GET /api/v1/environments`         | `kit-distance-v1` v1.0.0, `kit-lab` 지급 키트 실습실                                                                                   |
| 연구생 홈 진입              | `GET /api/v1/home/student?environmentId=kit-lab`                | 기존 준비 세션, 키트 거리 확인 절차, 완료된 실험                                                                                       |
| 승인 절차 전체 보기         | `GET /api/v1/procedures?environmentId=kit-lab`                  | `kit-distance` v1.0.0                                                                                                                  |
| 기존 세션 이어하기          | `GET /api/v1/sessions/session-990d63bb811b4562b304fc26cd4be661` | 같은 `sessionId`, `phase=preparing`, 준비 항목 6개 중 완료 0개                                                                         |
| 숙련자 홈 진입              | `GET /api/v1/home/expert?environmentId=kit-lab`                 | 승인 절차 `kit-distance`, 초안 `procedure-aaf99bb263d94b4f9205a5d726d03e92`, 검토 대기 결과 `session-ff47e14bb6044651ac27df93ad2212cd` |

Edge 홈은 준비 중인 작업을 `status=running`으로 반환합니다. 이어하기는 상세 응답의 `phase`와 `holdReason.code`로 이어갈 화면을 결정합니다. v0.1.0에서 새 세션에 넘길 작업 프로필은 `kit-distance-v1`, 작업자는 `operator-01`입니다.

실물 Android의 보호된 Edge 접근은 미실시입니다. Android Maestro는 fixture를 사용하는 별도 검사입니다.
