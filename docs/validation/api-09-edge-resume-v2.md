# API-09 2.0 Edge 재개 검증

백엔드 PR #21을 병합한 `c35d970`의 Edge를 로컬에서 격리 실행했습니다. 별도 SQLite를 사용하고 `dataOrigin=simulation`을 확인했습니다. UI는 macOS에서 Expo 개발 웹과 Playwright Chromium 모바일 뷰포트로 실행했습니다. 아래 명령은 시뮬레이션 전용 Edge에 대해 실행하며 테스트 작업자·숙련자 토큰은 실행 셸로 전달합니다.

```sh
HANDSON_E2E_EDGE_SESSION=1 EXPO_E2E_PORT=19061 \
  EXPO_PUBLIC_HANDSON_EDGE_BASE_URL=http://127.0.0.1:18061 \
  npm run test:e2e -- e2e/edge-resume-v2.spec.ts e2e/edge-session.spec.ts --workers=1
```

## 접속과 인증 재시도

```sh
EXPO_E2E_EDGE=1 EXPO_E2E_PORT=19060 \
  EXPO_PUBLIC_HANDSON_EDGE_BASE_URL=http://127.0.0.1:18061 \
  npm run test:e2e -- e2e/edge-connection.spec.ts
```

412×920에서 브라우저의 첫 `GET /api/v1/system/health`를 한 번 중단해 연결 실패를 재현했습니다. 다시 시도하면 Edge의 상태 응답은 `200`이고, 유효하지 않은 Bearer 토큰을 보낸 `GET /api/v1/work-profiles`는 `401 UNAUTHORIZED`입니다. 앱에서 연결 실패와 인증 실패 안내를 각각 확인했습니다.

정상 토큰으로 다시 시도하면 `GET /api/v1/system/health`, `GET /api/v1/work-profiles`, `GET /api/v1/environments`가 모두 `200`입니다. 서버가 반환한 `지급 키트 실습실`을 선택하면 `거리 확인`, `Orange Pi (simulation)`, `kit-distance-v1 · 1.1.0`이 표시됩니다. 계속 진행 후 `GET /api/v1/home/student?environmentId=kit-lab`이 `200`이고 홈에 같은 환경명이 표시됩니다.

## 세션 재개와 같은 회차 측정

세션 흐름은 360×800에서 확인합니다.

브라우저에서 `POST /api/v1/sessions`에 `resumePolicyVersion: "2.0"`을 보냈고 `201` 응답에서 같은 버전을 확인했습니다. 세션과 홈은 `GET /api/v1/sessions/{sessionId}`, `GET /api/v1/home/student?environmentId=kit-lab`을 사용합니다. 세션 명령은 `POST /api/v1/sessions/{sessionId}/commands`로 전송합니다. 절차 선택에서는 `GET /api/v1/procedures?environmentId=kit-lab`, `GET /api/v1/procedures/kit-distance?version=1.1.0`을 호출했습니다. 테스트 준비에는 `GET /api/v1/sessions`와 시나리오를 조회·변경하는 `GET`·`POST /api/v1/simulation`을 사용했습니다.

| 경로                       | 요청과 확인 항목                                                                                                                                                                                                                                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 연구생 홈 → S10/S11 → S06  | 완료한 측정 1회를 만든 뒤 `pause`를 보냅니다. 홈에서 같은 세션을 다시 열고 두 항목을 확인하면 `resume`에 `holdId`, `cursorId`, 두 확인 값, `confirmedAt`이 전달됩니다. 재개 후 같은 회차에서 `requestExecutionSample`로 새 값을 받은 다음 새 `sampleAttemptId`로 `completeExecutionStep`을 보냅니다.                                                       |
| S11의 만료와 센서 실패     | 브라우저 시각을 31초 늦춰 `423 RESUME_CONFIRMATION_EXPIRED`를 확인합니다. 센서 시뮬레이션을 `disconnected`로 바꾸면 `423 SENSOR_DISCONNECTED`와 함께 보류 상태가 유지됩니다. 시뮬레이션을 정상으로 돌리고 두 항목을 다시 확인해 새 요청을 보냅니다.                                                                                                        |
| S11의 응답 유실            | 재개가 서버에서 성공한 직후 첫 `200` 응답만 브라우저에 전달하지 않습니다. 두 번째 요청의 `Idempotency-Key`, `requestId`, `expectedRevision`, `confirmation.confirmedAt`을 포함한 전체 본문이 첫 요청과 같고, 실제 재전송 응답이 `X-Idempotent-Replay: true`인지 확인합니다. 센서 점검 기록과 재개 이벤트가 추가로 생기지 않고 기존 유효 측정이 유지됩니다. |
| S08의 실패 시도 복구 → S09 | 실패한 현재 회차의 `cursorId`, `blockedAttemptId`와 작업자 확인을 `requestRecovery`로 보냅니다. `pendingJob.kind: sample`의 비동기 결과를 조회해 복구 완료를 확인합니다. 같은 회차에서 `requestRecoveryRemeasurement`를 보내고 새 측정이 `ready`가 된 뒤 완료합니다.                                                                                       |
| S08의 자동 보류            | 실패한 측정 시도가 없는 세션을 보류시키면 서버가 `resume`을 허용합니다. 두 항목을 확인해 재개한 뒤 같은 회차에서 `requestExecutionSample`을 보냅니다.                                                                                                                                                                                                      |
| 기존 1.0 세션              | 버전을 생략해 만든 세션은 기존 S11 확인을 거쳐 `confirmation` 없는 `resume`으로 같은 회차에 복귀합니다.                                                                                                                                                                                                                                                    |

Playwright에서 세션 시나리오 5개가 통과했습니다. `api09-resume-evidence`, `api09-recovery-evidence` 첨부에는 실제 요청과 응답이 남습니다. 아래는 대표 응답에서 식별자를 생략한 결과입니다.

- `resume`은 기존 유효 측정을 보존하고 `200`, `phase: running`, 같은 `execution.cursor.cursorId`, `resumeChecks`의 `failed`와 `passed`를 반환했습니다. 동일 요청을 재전송한 결과의 본문도 처음 성공 응답과 같았습니다.
- `requestRecovery`는 `200`, `phase: held`, `pendingJob.kind: sample`, `execution.recoveries`의 `status: checking`을 반환했습니다. 이후 세션 조회에서 `status: recovered`, `confirmationEvidenceId`, 동일 커서가 반환됐습니다. S09에서 새 거리 값 `20 cm`를 표시했고, S06에서 새 측정의 시도 ID로 완료를 요청하자 그 측정이 `valid`가 됐습니다.

센서와 작업 환경 데이터는 Edge의 시뮬레이션에서 생성합니다. 브라우저는 연결 단절·응답 유실·시각 차이를 재현하고, 서버 응답 본문은 Edge가 생성합니다. API-06의 기존 측정·텍스트 음성 해석·복구·결과 조회는 같은 Edge에서 실행했습니다. 별도 Playwright 회귀에서는 API-06 6개와 기존 모의 S10/S11 3개를 fixture로 확인했습니다.

별도 HTTP 검사에서도 2.0 보류 불일치 `409`, 센서 재확인 실패 뒤 새 `holdId`, 기존 1.0 이어하기를 확인했습니다. 하드웨어 Edge, 배포 서버, 실제 Android·iOS 기기에서의 API-09 연동은 미실시입니다.
