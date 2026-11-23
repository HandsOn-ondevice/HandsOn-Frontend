# API-08 결과 조회와 숙련자 검토

## 로컬 재현

HandsOn Edge v0.1.0을 simulation 모드에서 별도 SQLite 데이터 디렉터리와 루프백 주소로 실행합니다. 예를 들어 Edge를 `127.0.0.1:8042`에서 시작하고 CORS에는 `http://localhost:8140`을 허용합니다. `HANDSON_E2E_OPERATOR_TOKEN`과 `HANDSON_E2E_EXPERT_TOKEN`에는 해당 로컬 서버의 역할별 테스트 토큰을 설정합니다.

```sh
HANDSON_E2E_EDGE_RESULTS=1 EXPO_E2E_PORT=8140 \
  EXPO_PUBLIC_HANDSON_EDGE_BASE_URL=http://127.0.0.1:8042 \
  npm run test:e2e -- --workers=1
```

시나리오는 API-10과 독립적으로 Edge의 세션·명령 API를 호출해 같은 `kit-lab`에 검토 대기 결과 두 건을 준비합니다. 그런 다음 아래 흐름을 Chromium의 360×800 터치 뷰포트에서 실행합니다. 테스트 리포트 첨부에는 결과·세션·절차·조건 ID와 검토 요청·응답이 기록됩니다.

- 연구생 홈에서 선택한 결과를 열고 `GET /api/v1/results/{identifier}`의 절차·조건·유효 측정값과 화면을 대조합니다. 근거 화면과 전체 결과 복귀에서 같은 결과·세션 ID를 유지하고 앱에서 `POST`가 발생하지 않는지 확인합니다.
- 숙련자 홈에서 두 결과를 열고 `POST /api/v1/results/{identifier}/reviews`의 결과 ID, 의견과 결정(`approved` 또는 `remeasureRequested`)을 대조합니다. 승인 첫 요청은 Edge에 저장한 뒤 브라우저에 도달하는 응답만 중단합니다. 화면의 다시 시도로 보낸 키와 본문이 최초 요청과 같은지, Edge가 같은 검토 ID를 재전송하며 저장 건수는 하나인지 확인합니다.
- 숙련자 홈으로 돌아와 `검토 완료`와 `재측정 요청` 목록에서 각 결과를 다시 열고, 서버에 저장된 결정과 의견이 화면에 그대로 표시되는지 확인합니다. Edge v0.1.0 홈은 두 결정을 모두 `reviewed`로 반환하므로 앱은 해당 결과의 마지막 검토 결정으로 목록 상태를 표시합니다.

Edge 시뮬레이션이 기록한 측정값으로 검증합니다. 물리 센서, 실기기 Android/iOS와 API-10의 제출 동작은 이 시나리오의 확인 범위 밖입니다. Android Maestro CI는 fixture를 사용해 역할 진입과 기존 홈·검토 이동을 확인합니다.
