# API-07 Edge 초안 저장과 승인 검증

2026-11-23에 Expo 웹 `http://localhost:8139`(초안), `http://localhost:8143`(연결과 인증)과 Chromium 모바일 뷰포트 412×920에서 실행했습니다. Edge v0.1.0을 `http://127.0.0.1:8039`에 띄우고 별도의 시뮬레이션 데이터 디렉터리를 사용했습니다. [검증한 Edge 소스](https://github.com/HandsOn-ondevice/HandsOn-Backend/tree/88b8b81bd42b7aca3f8cec59890e45adf67efff2)

## 연결과 인증

연구생을 선택하고 임의의 잘못된 토큰을 입력한 뒤 최초 `GET /api/v1/system/health`를 Playwright에서 중단해 연결 실패 안내와 **다시 시도**를 확인했습니다. 첫 재시도의 상태 조회는 `200`이었고, 같은 토큰으로 보낸 `GET /api/v1/work-profiles`는 실제 서버에서 `401 UNAUTHORIZED`를 반환했습니다. 정상 토큰으로 재시도하자 상태, 작업 프로필, `GET /api/v1/environments`가 모두 `200`이었습니다. 선택 화면의 지급 키트 실습실, 거리 확인, `Orange Pi (simulation)`, 작업 프로필 `kit-distance-v1` 버전 `1.0.0`을 응답과 대조했습니다. 초안과 승인 절차 API에는 이 프로필과 연결된 환경 ID `kit-lab`을 사용했습니다.

## 초안부터 승인 버전까지

| 실제 Edge 요청                                                                               | 확인한 결과                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/recordings`, `/transcriptions`                                                 | 합성 M4A를 업로드하고 `201`로 받은 서버 녹음 ID로 전사를 요청했습니다. 전사 응답의 텍스트를 수정한 뒤 확정했습니다.                                                                                                                                                                                |
| `POST /api/v1/procedures/drafts`                                                             | 편집한 확정 전사문과 서버 녹음 ID를 전송했습니다. 서버가 `201`을 반환한 뒤 브라우저에서 응답을 유실시켰습니다. 화면 재시도는 같은 요청 ID를 사용했고, 서버에서 같은 초안 ID를 받아 리비전 `0`의 E04를 열었습니다.                                                                                  |
| `PATCH`·`GET /api/v1/procedures/{id}/draft`, `GET /api/v1/home/expert?environmentId=kit-lab` | 단계, 미확정 항목과 실행 기준을 저장해 리비전 `1`을 받았습니다. 숙련자 홈에서 같은 초안을 다시 열어 저장된 단계와 리비전을 확인했습니다. 다른 클라이언트가 리비전 `2`를 저장한 뒤 기존 화면에서 저장하자 `409 REVISION_CONFLICT`가 발생했습니다. 다시 불러온 초안에 최신 단계 내용이 표시됐습니다. |
| `POST /api/v1/procedures/{id}/approve`                                                       | 다른 클라이언트가 리비전 `3`을 저장한 뒤 리비전 `2`의 승인 요청이 `409`로 거절됐습니다. 최신 초안을 다시 확인하고 같은 승인 사유를 제출했습니다. `201` 응답 유실 후 동일 요청으로 재시도해 같은 `1.0.0` 버전이 표시됐습니다.                                                                       |
| `GET /api/v1/procedures?environmentId=kit-lab`, `GET /api/v1/procedures/{id}?version=1.0.0`  | 연구생 목록과 상세에서 승인된 절차 ID, 버전, 단계 문구와 거리·반복 기준을 서버 응답과 대조했습니다. 서버 초안 목록에도 검증 제목으로 생성된 초안은 한 건이었습니다.                                                                                                                                |

대표 ID는 녹음 `recording-91e40a09594f4f8da48d32793b944c58`, 전사 `transcription-b003568525fd49ce9470f3ac6285f940`, 초안 및 절차 `procedure-e0f3f9326aa74829bf385e6f1e1c705b`입니다.

## 재실행과 검증 범위

격리된 로컬 Edge 시뮬레이션 서버에 Expo 웹 Origin을 허용합니다. `HANDSON_E2E_EXPERT_TOKEN`과 `HANDSON_E2E_OPERATOR_TOKEN`으로 로컬 서버의 역할별 토큰을 전달할 수 있습니다.

```sh
HANDSON_E2E_EDGE_DRAFTS=1 EXPO_E2E_PORT=8139 \
  EXPO_PUBLIC_HANDSON_EDGE_BASE_URL=http://127.0.0.1:8039 \
  npm run test:e2e -- --workers=1
```

전사문은 별도 `POST /api/v1/simulation/transcripts` 요청으로 등록한 fixture이며, 서버 초안 생성기는 `simulation-template-v1`입니다. 앱의 요청과 서버 저장·리비전·승인 응답은 실제 Edge에서 처리했습니다. Edge v0.1.0의 `DraftPatch`가 받는 필드는 `steps`, `pendingItems`, `execution`, `expectedRevision`과 요청 ID입니다. 준비물과 주의사항은 조회하고, 작업자가 읽을 오류 대응은 단계 설명에서 편집합니다.

연결 실패와 생성·승인 응답 유실만 Playwright에서 재현했습니다. Android Maestro 검사는 fixture로 역할과 환경 선택, 녹음·초안 이동 및 기준값 검토·승인 화면을 확인합니다. 실물 Android의 Edge 연결, 물리 모바일 브라우저, 팀 공유 Edge의 쓰기, 실물 센서와 실제 STT·생성 모델은 미검증입니다.
