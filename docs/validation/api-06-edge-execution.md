# API-06 Edge 측정과 오류 복구 검증

macOS에서 HandsOn Edge v0.1.0(`ee52599`)을 별도 SQLite를 쓰는 시뮬레이션 모드로 실행했습니다. 앱은 Expo 웹과 Playwright Chromium 모바일 뷰포트에서 실행했습니다.

## 진입과 인증 · 412×920

- `GET /api/v1/system/health` 첫 요청을 Playwright에서 한 번 중단했습니다. 연결 실패 안내와 다시 시도가 표시되었고, 해당 요청은 서버에 도달하기 전에 종료됐습니다.
- 유효하지 않은 토큰으로 다시 시도하자 상태 조회는 `200`, 작업 프로필 조회(`GET /api/v1/work-profiles`)는 `401 UNAUTHORIZED`를 반환했습니다. 인증 안내와 빈 토큰 입력란이 표시됐습니다.
- 정상 작업자 토큰으로 재시도한 뒤 상태, 작업 프로필, `GET /api/v1/environments`가 모두 `200`을 반환했습니다. 지급 키트 실습실을 선택해 거리 확인, Orange Pi (simulation), `kit-distance-v1 · 1.1.0` 표시를 확인했습니다. 계속 버튼으로 `GET /api/v1/home/student?environmentId=kit-lab`을 호출했고 홈에도 같은 작업 환경이 표시됐습니다.

## 실행과 결과 인계 · 360×800

`e2e/edge-execution-live.spec.ts`는 세션 생성과 준비·장치 점검을 실 Edge API로 수행해 실행 중 세션을 준비합니다. 이후 앱에서 연구생 홈의 **이어서 진행**을 눌러 같은 세션을 엽니다.

- `GET /api/v1/sessions/{sessionId}`의 커서로 같은 경로의 `/commands`에 `requestExecutionSample`을 보냈습니다. 거리 값·단위와 `completeExecutionStep`의 측정 시도 ID를 대조하고 다음 회차 표시를 확인했습니다.
- 첫 회차에서 `POST /api/v1/sessions/{sessionId}/voice/interpret`에 명령 텍스트를 보냈습니다. Edge의 해석 응답을 확인한 시점의 세션 리비전은 그대로였습니다. 모호한 명령을 취소하면 기존 측정이 유지됐고, 같은 명령에서 재측정을 확정하면 같은 커서에 새 측정 시도가 생성됐습니다. 완료 해석은 작업자가 확정한 뒤 `completeExecutionStep`으로 전송했습니다.
- 두 번째 회차의 측정값이 준비된 뒤 격리 서버의 `POST /api/v1/simulation`으로 타임아웃을 설정했습니다. 서버가 같은 회차를 `SENSOR_TIMEOUT`으로 보류했습니다. 홈에서 이어서 진행을 누르자 오류 안내와 실패 시도 ID가 표시됐습니다.
- 센서를 정상 시나리오로 되돌린 뒤 `requestRecovery`에 실패 시도 ID를, `requestRecoveryRemeasurement`에 서버가 발급한 복구 ID를 보냈습니다. 복구와 재측정은 같은 커서를 유지했고, 새로운 측정 시도의 거리 값·단위를 화면에서 대조했습니다. 테스트 종료 시 원래 시뮬레이션 설정을 복원합니다.
- 마지막 회차 명령은 `completed`와 빈 커서를 반환했습니다. 완료 안내에서 연구생 홈으로 돌아가 홈이 반환한 결과 ID로 `GET /api/v1/results/{identifier}`를 호출했고, 응답의 원래 세션 ID와 완료 상태를 대조했습니다. 정리 확인·제출은 API-10의 별도 계약입니다.

이 흐름의 조회·인증·명령 응답은 Edge가 생성했습니다. 센서 데이터와 텍스트 명령 해석은 서버 시뮬레이션입니다. 별도 Playwright 회귀는 앱 fixture와 가로챈 Edge 응답을 사용합니다. Android Maestro는 fixture APK로 실행하며, Android·iOS 실기기, 물리 센서, 마이크 입력·음성 안내 재생은 확인하지 않았습니다.

## 재실행

격리된 루프백 Edge를 시뮬레이션 모드로 준비하고 테스트 작업자·숙련자 토큰을 실행 셸에 설정합니다. Edge CORS에 사용할 Expo 웹 Origin을 허용합니다. 아래 예시는 두 시나리오를 각각 실행합니다.

```sh
EXPO_E2E_EDGE=1 EXPO_E2E_PORT=19006 \
  EXPO_PUBLIC_HANDSON_EDGE_BASE_URL=http://127.0.0.1:18058 \
  npm run test:e2e

HANDSON_E2E_EDGE_EXECUTION=1 EXPO_E2E_PORT=19036 \
  EXPO_PUBLIC_HANDSON_EDGE_BASE_URL=http://127.0.0.1:18058 \
  npm run test:e2e -- e2e/edge-execution-live.spec.ts --workers=1
```
