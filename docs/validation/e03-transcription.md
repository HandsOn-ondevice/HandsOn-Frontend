# E02/E03 녹음 업로드와 전사문 확인

Android는 종료한 녹음 원본과 메타데이터를 기기에 저장합니다. E03을 나갔다가 E02에서 **최근 녹음 다시 열기**를 누르면 같은 작업 환경의 원본과 편집본을 불러옵니다. 개발 웹의 **오디오 파일 선택**은 준비된 M4A와 절차 이름을 브라우저에 저장해 같은 E03 화면을 엽니다.

## Edge 연결

1. `.env.example`을 `.env.local`로 복사해 `EXPO_PUBLIC_HANDSON_EDGE_BASE_URL`에 기기에서 접근할 수 있는 Edge 주소를 설정합니다. `/api/v1`은 앱에서 붙입니다. LAN의 HTTP 주소는 Android development build에서 사용합니다.
2. 숙련자 역할과 환경을 선택한 뒤 E02에서 녹음을 종료합니다. 개발 웹에서는 절차 이름을 입력하고 준비한 M4A 파일을 선택합니다.
3. E03에서 개발 Edge의 숙련자 토큰을 입력합니다. 토큰은 현재 앱 실행 중 메모리에 보관합니다. 전사문을 수정하고 **AI 절차 초안 생성**을 누르면 확정본이 저장됩니다.

업로드는 로컬 녹음 ID를 `Idempotency-Key`로 사용합니다. 응답을 받으면 서버 `recordingId`를 저장한 뒤 전사를 요청합니다. Edge가 확정한 전사 실패는 새 `requestId`로 재시도하며, 네트워크가 끊겨 결과를 모르는 경우 같은 `requestId`를 재사용합니다. 전사 작업 ID를 받은 경우에는 해당 ID로 상태를 조회합니다. 현재 확인한 서버 구현은 등록된 모의 전사문을 동기로 반환합니다.

`readConfirmedDraftRequest(localRecordingId)`는 서버 녹음 ID, 제목, 확정한 전사문, 작업 환경 ID를 반환합니다. 초안 API 요청과 E04 이동은 API-07에서 연결합니다. Edge 주소 없이 개발 빌드를 실행하거나 `EXPO_PUBLIC_HANDSON_MAESTRO=1`로 빌드하면 기존 모의 전사와 초안 생성 흐름을 사용할 수 있습니다.

## 검증 재현

합성 음성 파일은 [edge-transcription.m4a](../../e2e/fixtures/edge-transcription.m4a)입니다. 개인 음성 없이 만든 1초 테스트 신호를 사용합니다. `HANDSON_E2E_EDGE_TOKEN`을 생략하면 Edge의 공개 개발 토큰을 사용합니다. 아래 예시의 Edge 포트는 로컬 시뮬레이션 서버 주소에 맞춥니다.

```sh
EXPO_E2E_PORT=8187 \
EXPO_PUBLIC_HANDSON_EDGE_BASE_URL=http://127.0.0.1:8387 \
HANDSON_E2E_LIVE_EDGE=1 \
npm run test:e2e -- e2e/edge-transcription.spec.ts --workers=1
```

Playwright는 360×800, 412×920 Chromium에서 앱의 multipart 파일과 Edge에 저장된 원본 바이트를 대조합니다. 첫 업로드 응답 유실 후 같은 키와 서버 ID가 재사용되는지, Edge의 `503 STT_NOT_CONNECTED` 이후 기존 녹음으로 다시 전사하는지 확인합니다. 전사 성공에는 `/api/v1/simulation/transcripts`에 등록한 모의 전사문을 사용합니다. 화면의 로딩·오류·성공 상태와 편집·재진입·새로고침·확정도 확인합니다.

2026-11-23에 [Edge `88b8b81` 소스](https://github.com/HandsOn-ondevice/HandsOn-Backend/tree/88b8b81bd42b7aca3f8cec59890e45adf67efff2)를 로컬 시뮬레이션 서버로 실행해 두 화면 크기의 시나리오를 통과했습니다. `POST /api/v1/recordings`는 첫 요청과 재시도에 `201` 및 아래의 같은 녹음 ID를 반환했습니다. 각 `POST /api/v1/transcriptions`는 `503` 이후 새 요청 ID로 시도했을 때 `201` 및 `completed`를 반환했습니다. 전사 ID로 `GET /api/v1/transcriptions/{identifier}`를 호출해 원문을 대조했습니다.

| 화면 크기 | 서버 녹음 ID                                 | 전사 ID                                          |
| --------- | -------------------------------------------- | ------------------------------------------------ |
| 360×800   | `recording-1e255dc1aaff408cbd0850c1647308fc` | `transcription-50177e8c362a41aaab27808485eb83a2` |
| 412×920   | `recording-62fdf21eeb114068b2792e8497945f70` | `transcription-4bcf2ff717874d098d5ae003ac851670` |

비동기 경로는 Jest의 `202 queued` 응답으로 작업 ID 저장, 완료 조회와 재진입 시 조회 재개를 확인했습니다.

Maestro Android의 `recording-android.yaml`은 시스템 권한 허용, 녹음 시간 증가, 일시정지·재개, 파일 저장과 재진입, 모의 전사를 거친 E04 이동을 확인합니다. `recording-permission-android.yaml`은 권한 거부 후 허용과 재시도를 확인합니다. 실제 Android 기기의 Edge 업로드와 실제 음성 인식은 검증 범위에 포함되지 않습니다.
