# S04~S05 통합 메모

이 문서는 researcher-workflow 기능 내부 구현 계약이다. 팀 전체의 확정 API 명세가 아니다.

## 현재 연결과 호환성

- 기존 Expo Router·루트 Provider·디자인 시스템·갤러리를 유지한다. 상태는 기존 WorkflowProvider·useWorkflowSession과 동일한 Repository 인스턴스에서 조회·구독한다.
- sessionId와 고정 ProcedureSnapshot을 URL·화면 간 연결의 기준으로 사용한다. URL에 센서값이나 절차 JSON을 넣지 않는다.
- 준비 확인 5개 → completePreparation → awaitingDeviceCheck → startDeviceCheck → readyToExecute → startExecution → running 순서다. S06 실행 UI는 아직 미구현이다.
- 기존 `/researcher-workflow/[sessionId]/device-check-pending`은 세션을 보존하는 Redirect로 새 `device-check` 경로에 연결한다. S04와 S06 복귀는 기존 히스토리가 있으면 back, 없으면 해당 세션 경로로 replace한다.
- S04 확인 완료 후에는 작업자 항목을 잠그는 기존 규칙을 유지한다. S05 성공은 communication 항목만 갱신한다. S04로 돌아가면 6/6과 `Mock 시스템 근거`를 표시한다.
- `ProcedureSnapshot.deviceCheck`는 장치·필수 센서·측정 종류·단위를 담는 기능 내부 확장이다. 기존 절차에 정의가 없으면 S04는 사용할 수 있지만 S05 점검을 시작하지 못한다. 팀원 데이터에 암묵적으로 LED 센서를 붙이지 않는다.

## Repository 교체 지점

1. 실제 API용 WorkflowRepository 구현체를 만든다. createSession/getSession/executeCommand/subscribe의 서명은 유지한다.
2. feature WorkflowProvider의 repository 주입을 합의한 앱 조립 지점에 연결한다. 현재 기본값은 메모리 MockWorkflowRepository이며 전역 Provider를 새로 만들지 않는다.
3. API DTO를 내부 ExperimentSession·DeviceDiagnosticsReport로 변환한다. `deviceChecks`는 빈 목록부터 시작하고 세션의 revision·고정 절차·근거·이벤트도 일관되게 반환해야 한다.
4. startDeviceCheck는 checking 상태를 접수 응답으로 반환한다. 최종 결과는 subscribe(서버 이벤트 또는 polling)와 getSession으로 전달한다. 실제 장비 작업의 수명은 서버/Repository가 소유하며 화면 unmount가 성공·취소를 뜻하지 않는다.
5. 실제 판정·안전 범위·장치 명령은 권위 있는 서버/장치 서비스가 수행한다. Mock 전환 로직을 실제 승인 엔진으로 사용하지 않는다.
6. Mock 전용 시나리오 변경은 Repository 공통 명령과 분리되어 있다. 실제 구현체를 주입하면 Mock 시나리오 컨트롤이 사라진다.

## 데이터와 판정 경계

- DeviceCheckDefinition의 deviceId는 게이트웨이 식별자다. 기존 ProcedureSnapshot.deviceId(`LED-M03` 예시)는 실험 대상 장치 식별자이므로 서로 같은 개념으로 취급하지 않는다.
- 센서 결과는 sensorId, status, checkedAt, readings(metricId/value/unit/observedAt/source), 선택적 issue를 갖는다. 원본 결과·실패 사유는 attempt별로 보관한다.
- `source: mock | api`와 `kind: human | sensor | program`은 별개다. sensor 근거여도 source=mock이면 합성 응답이다.
- 미연결·timeout·stale·오류 및 누락된 필수 결과는 시작을 허용하지 않는다. 숫자·단위·시각의 형식도 확인한다. passed 자체는 진단 서비스의 결과이며 숫자의 안전성을 UI에서 추론하지 않는다.
- 최신성 허용 시간·전압/전류 범위·안정화 시간은 확정하지 않았다. 현재 성공 기록에는 만료 TTL을 임의로 적용하지 않으며 점검 시점의 스냅샷임을 표시한다. 실연동 전에 신선도·만료·무효화 정책을 반드시 합의해야 한다.
- Mock의 700ms/3초 대기는 데모용 응답 지연이며 장비 timeout 기준이 아니다. 시간 초과·오래된 값도 명시적 fixture 결과로 재현한다.
- 재점검 시작 시 이전 communication 확인을 즉시 지우고 5/6으로 되돌린다. 이전 시도와 근거는 삭제하지 않는다. 최종 응답은 현재 checking attemptId와 맞을 때만 저장한다.
- requestId는 동일 명령의 재전송을 식별한다. 같은 ID·다른 명령은 거절하며, 같은 ID·같은 명령은 재적용 없이 현재 세션을 반환한다. 새 명령의 expectedRevision이 오래되면 거절한다. 실패 후 재시도는 새 requestId와 최신 revision으로 요청한다.

## 팀원과 합의할 연결 지점

| 경계              | 필요한 합의                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| S03 → S04         | 세션 생성 책임, 승인 스냅샷 공급, operatorId/실험 장치 ID/게이트웨이 ID, sessionId 전달          |
| S04 → S05         | 작업자 확인 5개와 프로그램 제출 근거 유지, S05 진입 경로                                         |
| S05 → S06         | readyToExecute에서 startExecution을 수락할 주체, 시작 시 stepId·conditionId·trialIndex 공급 방식 |
| S04~S15 ↔ E01~E07 | 숙련자 검토와 오류 보고에 전달할 세션·버전·attempt·근거 ID, 재측정 요청·검토 결과 계약           |
| 실제 장비         | 센서 ID·주소·측정 단위·시각 기준, 연결 상태, 장치-실험 대상 매핑, 진단 결과의 권위               |
| API               | 인증·엔드포인트·DTO·오류 코드·requestId 유효기간·revision 충돌·구독/재접속·작업 취소             |

E01~E07 라우트를 비상 화면으로 가정하거나 새로 구현하지 않았다. 중단·일시정지·재개 이벤트는 S06 이후 작업에서 팀 규칙에 맞춰 추가할 예정이다. 이번에는 점검 시작/성공/실패와 실험 시작 이벤트만 확장했다.

## 먼저 확인받을 질문과 충돌 가능성

- 실제 장치 최신성은 관측 시각과 수신 시각 중 무엇을 기준으로 어떤 규칙 버전에서 판정하는가? 시각 오차는 누가 보정하는가?
- 점검 성공 후 얼마 동안 시작을 허용하며, 장치 상태 변화·재접속·화면 복귀 시 재점검을 강제하는가?
- 앱을 완전히 종료한 뒤 세션을 어디서 복원하는가? 현재 Mock은 메모리 전용이다.
- startExecution의 재전송·취소·오류는 서버에서 어떤 결과로 반환하는가? 실험 단계 커서는 누가 발급하는가?
- 게이트웨이의 실제 ID와 실험 대상 장치 ID를 어떤 응답에서 받는가?
- 향후 models.ts의 phase/command/event union, WorkflowProvider 의존성 주입, 라우팅 연결 파일은 통합 시 충돌 가능성이 있다. 한 담당자가 공유 변경을 조율해야 한다.
- 공통 설정·design-system·팀원 화면은 이번 작업에서 변경하지 않았다. 실제 API 통합을 위해 공통 조립 지점을 바꿀 경우 별도 합의가 필요하다.
