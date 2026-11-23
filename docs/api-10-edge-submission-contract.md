# API-10 실험 정리와 결과 제출

API-10은 마지막 유효 측정 이후 장치 응답과 작업자의 정리 확인을 기록하고, 연구생이 제출하면 같은 결과를 숙련자에게 공개한다. 서버 계약은 백엔드 OpenAPI 0.2.0과 인계 문서를 기준으로 한다. [백엔드 PR #17](https://github.com/HandsOn-ondevice/HandsOn-Backend/pull/17) · [API-10 인계 문서](https://github.com/HandsOn-ondevice/HandsOn-Backend/blob/67716a54ed80ea4f125d8241cf2c672fd73ba741/docs/cleanup-submission.md)

## 앱에서 사용하는 계약

| 화면              | 앱 요청과 서버 상태                                                                                                                                                                                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 새 실험           | `POST /api/v1/sessions`에 선택한 절차·버전과 `workflowVersion: "2.0"`을 보낸다. 기존 1.0 세션과 기존 결과는 서버의 기존 규칙을 따른다.                                                                                                                                             |
| 마지막 회차와 S12 | `requestExecutionSample`로 현재 커서의 측정을 요청한다. `completeExecutionStep`에 같은 커서와 준비된 시도 ID를 보낸다. 마지막 회차는 `awaitingCleanup`, 빈 실행 커서, 유효 측정과 근거를 반환한다. 연구생은 `GET /api/v1/results/{sessionId}`로 제출 전 요약과 조건별 근거를 연다. |
| S13 장치 정리     | 마지막 회차의 LED 출력 정지 응답을 표시한다. 응답이 실패하거나 만료되면 `requestCleanup`을 사용할 수 있다. `setCleanupCheck`로 전원 차단, 케이블 정리, 보관 확인을 순서대로 기록한다. 서버는 전원 차단 확인에서 장치 사용권을 해제하고 보관 확인에서 `readyToSubmit`으로 전환한다. |
| S14 제출          | `submitResult`로 제출하면 `completed`와 제출 접수증을 반환한다. 응답 유실 시 같은 `requestId`, `Idempotency-Key`, `expectedRevision`과 명령으로 재전송한다. 상태 충돌이나 이미 제출된 경우 세션을 새로 읽어 제출 접수증을 확인할 수 있다.                                          |
| 결과와 근거       | S14 접수증의 `resultId`로 결과를 연다. 숙련자 홈의 결과 ID와 `/api/v1/results/{resultId}`도 같은 ID를 사용한다. 서버는 제출 이후에 숙련자의 홈·상세·검토에 결과를 공개한다.                                                                                                        |

측정·정리·제출 명령은 같은 `POST /api/v1/sessions/{sessionId}/commands` 경로를 사용한다. 진행 중 화면은 `GET /api/v1/sessions/{sessionId}`를 통해 최신 revision과 기록을 읽는다. 연구생 홈은 `ongoingSession.phase`로 현재 상태를 표시하고 `pendingSessions`에서 다른 실험에 가려진 정리·제출 대기 세션도 열 수 있다.

마지막 회차에서 `423 CLEANUP_OUTPUT_FAILED`를 받더라도 확정된 측정은 서버에 남는다. 오류 응답의 세션을 사용해 S13으로 이동하며 출력 종료만 다시 요청한다. 서버가 반환한 LED 어댑터 응답과 작업자의 회로 전원 차단 확인은 별도 근거로 표시한다.

## 배포 조건

새 세션을 시작하려면 Edge에 백엔드 PR #17의 API-10 계약이 적용되어 있어야 한다. 보드에 배포할 때에는 서버팀의 인계 문서에 따라 진행 중 실험을 확인하고 앱·서버 조합을 맞춘다. [배포 절차](https://github.com/HandsOn-ondevice/HandsOn-Backend/blob/67716a54ed80ea4f125d8241cf2c672fd73ba741/docs/cleanup-submission.md#검증과-보드-반영)

## 모바일 웹 검증 재실행

백엔드 PR #17의 커밋으로 별도 데이터 디렉터리를 사용하는 시뮬레이션 서버를 시작한다. Edge의 CORS 목록에 사용하는 Expo Origin을 추가하고, 실행 셸에 검증용 `HANDSON_E2E_OPERATOR_TOKEN`과 `HANDSON_E2E_EXPERT_TOKEN`을 설정한다. 아래 예시는 Edge가 18242번, Expo가 19442번 포트를 사용할 때의 명령이다.

```sh
HANDSON_E2E_EDGE_SUBMISSION=1 EXPO_E2E_PORT=19442 \
  EXPO_PUBLIC_HANDSON_EDGE_BASE_URL=http://127.0.0.1:18242 npm run test:e2e
```

시나리오는 Playwright의 412×920 터치 뷰포트에서 세션을 만들고 마지막 회차·정리·제출을 조작한다. 준비·점검과 앞선 회차는 테스트가 직접 Edge API로 초기화한다. 최초 제출을 서버가 수락한 뒤 브라우저로 가는 응답을 중단하고, 화면 재시도가 동일 요청을 보내는지 확인한다. 결과·회차 ID와 실제 요청 증거는 `artifacts/playwright/edge-submission/`의 로컬 리포트에 남는다.
