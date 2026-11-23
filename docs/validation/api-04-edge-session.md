# API-04 실험 준비와 장치 점검

## API-03에서 넘기는 세션

S03에서 선택한 승인 절차의 ID와 버전을 `startApprovedEdgeSession`에 전달합니다. 요청에 쓰는 작업 프로필 `kit-distance-v1`과 절차 조회에 쓰는 환경 `kit-lab`은 별도 식별자입니다.

- `POST /api/v1/sessions`에 `requestId`, `procedureId`, `procedureVersion`, `workProfileId`, `operatorId`를 보냅니다. `Idempotency-Key`에는 같은 `requestId`를 넣습니다.
- `201`로 받은 `sessionId`로 `/researcher-workflow/[sessionId]/preparation`에 진입합니다. S04는 `GET /api/v1/sessions/{sessionId}`에서 읽은 승인 버전과 준비 상태를 표시합니다.
- Edge 인증과 환경 선택은 API-01·02, 승인 절차 목록과 상세 조회는 API-03에서 연결합니다. 통합할 때 S03의 Edge 절차 저장소를 주입하고 세션 생성은 `startApprovedEdgeSession`으로 연결합니다.

## API-06에서 받는 첫 측정 회차

같은 세션에 `POST /api/v1/sessions/{sessionId}/commands`로 `requestId`, `expectedRevision`, `command`를 보냅니다.

| 명령                  | 응답에서 확인할 상태                                                                  |
| --------------------- | ------------------------------------------------------------------------------------- |
| `setPreparationCheck` | `checks`에서 지정한 작업자 항목의 확인 상태                                           |
| `completePreparation` | `phase: awaitingDeviceCheck`                                                          |
| `startDeviceCheck`    | 최신 `deviceChecks`의 `status: checking`, 같은 시도를 가리키는 `pendingJob.attemptId` |
| `startExecution`      | `phase: running`, `execution.cursor`                                                  |

장치 점검은 접수 후 같은 세션을 다시 조회해 최종 판정을 읽습니다. 실패 시 최신 시도의 `issue`를 표시하고 재점검을 제공합니다. 성공 시 `phase: readyToExecute`와 통신 확인 근거가 돌아옵니다. 첫 커서의 `cursorId`와 `trialIndex`는 실행 시작 응답에서 읽고, 조건명은 `conditionId`에 맞는 `procedure.execution.conditions`에서 찾습니다.

응답 유실 후 재전송에는 이전 요청의 본문 전체와 멱등 키를 그대로 사용합니다. Edge가 이전 응답을 재전송하면 해당 응답의 리비전이 현재 상태보다 낮을 수 있습니다. 새로운 명령이 `REVISION_CONFLICT`로 거절되면 서버를 다시 조회하고 작업자에게 최신 상태를 표시합니다.

## 모바일 검증

Chromium 360×800에서 별도 데이터 디렉터리의 Edge 시뮬레이션 서버를 사용했습니다. 배포 서버와 동일한 OpenAPI 경로·스키마를 가진 HandsOn-Backend `88b8b81`에서 실행했습니다. 공유 서버의 시뮬레이션 설정은 변경하지 않았습니다.

Playwright의 `e2e/edge-session.spec.ts`는 승인 절차에서 준비 시작, 작업자 확인, 장치 점검, 첫 측정 회차 진입을 자동으로 조작합니다. 브라우저 요청을 실제 Edge에 전달해 서버 커밋이 끝난 뒤 생성 응답과 준비 완료 명령 응답을 각각 유실시켰습니다. 동일 키 재전송 이후 세션 생성과 준비 완료가 각각 한 번만 기록되는지 확인합니다.

API-03의 Edge 인증·절차 조회를 임시 검증 checkout에 연결하고, 그 안에서 API-04의 세션 생성과 S04~S06 코드를 실행했습니다. 테스트는 1개 통과했습니다. 병렬 작업 중인 API-03의 변경은 이 브랜치의 커밋에 포함하지 않았습니다.

- `POST /api/v1/sessions`로 `kit-distance@1.0.0`을 선택해 `201`과 `session-70b30aa4eb514899882834f3dace56d1`을 받았습니다. 생성 재전송의 `X-Idempotent-Replay`는 `true`였고, 동일 세션 ID로 S04의 GET이 실행됐습니다.
- 다른 클라이언트가 준비 항목을 먼저 변경했을 때 기존 리비전으로 보낸 명령은 `409 REVISION_CONFLICT`로 거절됐습니다. 브라우저는 최신 리비전을 GET으로 읽어 체크 상태를 바꿨습니다. 준비 완료 응답 유실 뒤 같은 명령으로 재전송해도 `preparationCompleted` 이벤트는 1건이었습니다.
- 점검 접수의 `checking`을 확인한 뒤 `check-aa90a2bb11bf467984a45ac9aa93dfdf`의 연결 실패와 실행 버튼 잠금을 확인했습니다. 같은 세션 화면에 다시 진입해 실패 시도와 원인을 읽었고, 재점검 `check-c977922f5cd94a159d03438434c20ecc`가 성공한 뒤에만 실행 버튼이 활성화됐습니다.
- `startExecution` 응답의 `cursor-6247cf952f434a80a90d7b240f3c0a0b`, `placement-20cm`, `trialIndex: 1`을 다음 화면의 커서 ID·조건명·회차와 대조했습니다. 로딩과 성공·실패 단계의 주요 메시지 및 버튼이 화면 안에 표시되고, 스크롤 후 조작할 수 있음을 확인했습니다.

통합 checkout에서 Edge를 `127.0.0.1:8036`으로 실행하고 CORS에 `http://localhost:8136`을 허용합니다. 격리된 서버의 작업자·숙련자 토큰을 `HANDSON_E2E_OPERATOR_TOKEN`, `HANDSON_E2E_EXPERT_TOKEN`으로 넘긴 상태에서 실행합니다.

```sh
HANDSON_E2E_EDGE_SESSION=1 EXPO_E2E_PORT=8136 \
  EXPO_PUBLIC_HANDSON_EDGE_BASE_URL=http://127.0.0.1:8036 \
  npm run test:e2e -- e2e/edge-session.spec.ts
```

HTML 리포트에는 요청·응답 요약이 첨부됩니다. `artifacts/playwright/test-results/`에 준비 확인, 점검 접수·실패·성공, 첫 커서 화면이 저장됩니다. 테스트 종료 시 생성한 세션을 취소하고 시뮬레이션 설정을 실행 전 값으로 복원합니다. 실물 장비는 사용하지 않았습니다.
