# API-01 Edge 연결 검증

## 실제 Edge · 모바일 Playwright

2026-11-23에 HandsOn Edge v0.1.0과 Chromium 모바일 뷰포트 **412×920**에서 실행했습니다. 웹의 Origin은 `http://localhost:19006`이며, 앱과 브라우저는 팀 개발용 Edge 주소를 사용했습니다. 조회 데이터의 `dataOrigin`은 `simulation`입니다.

| 요청                        | 응답과 화면 확인                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/system/health` | `200`, `api: alive`. 로딩 중에는 환경 선택과 계속 버튼을 누를 수 없었습니다.                             |
| `GET /api/v1/work-profiles` | 인증 헤더 없이 `401`, `UNAUTHORIZED`. 화면에서 HTTP 상태와 오류 코드, 토큰 입력과 재시도를 확인했습니다. |
| 인증 후 두 GET 재시도       | 같은 Edge 주소와 Bearer 인증으로 둘 다 `200`. 두 요청의 쿼리와 본문은 비어 있었습니다.                   |

정상 응답의 `kit-distance-v1`을 선택해 **지급 키트 실습실**, **거리 확인**, **Orange Pi (모델 미확인)**를 응답과 대조했습니다. 연구생 홈에도 선택한 환경 이름이 표시됐습니다. 브라우저의 CORS 허용 Origin을 확인했고, 시나리오 중 `/api/v1`로 전송한 앱 요청은 모두 `GET`이었습니다.

연결 실패는 첫 상태 조회를 Playwright에서 중단해 재현했습니다. 연결 실패 안내와 재시도 버튼이 표시됐고, 이후 조회는 실제 Edge에 전송했습니다. Playwright는 실제 Edge 시나리오 1개와 별도 fixture 회귀 시나리오 7개(환경 선택, 연구생 홈, 숙련자 홈)를 통과했습니다.

## 재실행

Edge 서버 운영자에게 접속 주소, 허용된 브라우저 Origin, 필요한 경우 작업 환경 조회 권한이 있는 토큰을 확인합니다. 인증이 필요하면 실행 셸에서 `HANDSON_E2E_EDGE_TOKEN`을 설정합니다. 다음 주소와 포트는 위 실행 환경의 값입니다.

```sh
EXPO_E2E_EDGE=1 EXPO_E2E_PORT=19006 \
  EXPO_PUBLIC_HANDSON_EDGE_BASE_URL=http://192.168.1.2:8080 \
  npm run test:e2e
```

Edge 검증은 지정한 포트에서 새 Metro 서버를 띄웁니다. LAN 주소를 대상으로 실행할 때는 `EXPO_E2E_HOST`에 웹 호스트를 설정하고 서버의 `HANDSON_CORS_ORIGINS`에 브라우저 Origin을 등록합니다. `artifacts/playwright/edge/report/`의 리포트에 요청 메서드·경로, HTTP 상태와 대표 프로필 ID를 첨부합니다.

## Android와 물리 모바일 브라우저

- Android 실기기의 Edge 네트워크 연결은 미실시입니다. ADB에 연결된 기기가 없었습니다. 대상 기기에서는 [Edge 연결 절차](../../README.md#handson-edge-연결)로 개발 빌드를 실행한 뒤, 인증 전후 안내와 조회된 프로필 ID를 대조합니다.
- Android CI는 에뮬레이터에서 fixture로 기존 역할·환경 선택과 선택한 프로필 ID 표시를 확인합니다.
- 물리 모바일 브라우저는 미실시입니다. 서버는 `localhost:8081`과 `localhost:19006`에 대해 `Authorization` 사전 요청을 허용했습니다. 물리 기기에서 쓰는 프런트엔드 LAN Origin은 Edge 서버에 등록해야 합니다.
