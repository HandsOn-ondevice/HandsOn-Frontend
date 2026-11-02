# S04~S06 통합 메모

이 문서는 researcher-workflow 기능 내부 구현 계약이다. 팀 전체의 확정 API 명세가 아니다.

## 현재 연결과 호환성

- 기존 Expo Router·루트 Provider·디자인 시스템·갤러리를 유지한다. 상태는 기존 WorkflowProvider·useWorkflowSession과 동일한 Repository 인스턴스에서 조회·구독한다.
- sessionId와 고정 ProcedureSnapshot을 URL·화면 간 연결의 기준으로 사용한다. URL에 센서값이나 절차 JSON을 넣지 않는다.
- 준비 확인 5개 → completePreparation → awaitingDeviceCheck → startDeviceCheck → readyToExecute → startExecution → running 순서다. S06은 현재 조건·회차의 Mock 응답과 작업자 완료 요청을 처리한다.
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

E01~E07 라우트를 비상 화면으로 가정하거나 새로 구현하지 않았다. 중단·일시정지·재개 이벤트는 후속 화면에서 팀 규칙에 맞춰 추가할 예정이다.

## 먼저 확인받을 질문과 충돌 가능성

- 실제 장치 최신성은 관측 시각과 수신 시각 중 무엇을 기준으로 어떤 규칙 버전에서 판정하는가? 시각 오차는 누가 보정하는가?
- 점검 성공 후 얼마 동안 시작을 허용하며, 장치 상태 변화·재접속·화면 복귀 시 재점검을 강제하는가?
- 앱을 완전히 종료한 뒤 세션을 어디서 복원하는가? 현재 Mock은 메모리 전용이다.
- startExecution의 재전송·취소·오류는 서버에서 어떤 결과로 반환하는가? 실험 단계 커서는 누가 발급하는가?
- 게이트웨이의 실제 ID와 실험 대상 장치 ID를 어떤 응답에서 받는가?
- 향후 models.ts의 phase/command/event union, WorkflowProvider 의존성 주입, 라우팅 연결 파일은 통합 시 충돌 가능성이 있다. 한 담당자가 공유 변경을 조율해야 한다.
- 공통 설정·design-system·팀원 화면은 이번 작업에서 변경하지 않았다. 실제 API 통합을 위해 공통 조립 지점을 바꿀 경우 별도 합의가 필요하다.

## S06에서 확인한 화면 책임과 연결

- Figma 브라우저에서 S06 `2085:528`의 핵심 실행 화면과 S07 `2085:652`의 모호한 음성 확인을 확인했다. S06은 현재 출력 조건·회차, 작업 안내, 센서 카드, 음성 패널, 명시적 완료 요청을 다룬다. S07은 모호한 발화의 의미 선택을 담당한다.
- 관련 복구 후 재측정 화면 `2092:2260`은 확인했지만 복구 절차 자체는 구현하지 않았다. 일시정지·재개와 종료·장치 정리·제출도 이번 범위에 포함하지 않았다.
- S05의 startExecution이 처음 수락될 때만 실행 커서를 초기화한다. S06 진입·재진입은 조회·구독만 하며, 미점검 세션은 Repository에서도 응답 요청·완료·음성 확인을 거절한다.
- 실제 S06 URL은 `/researcher-workflow/[sessionId]/execution`이다. 기존 `execution-pending`은 같은 sessionId로 Redirect한다. S06→S05, 임시 음성 안내→S06 복귀는 dismissTo로 기존 화면을 사용하며, 해당 화면이 히스토리에 없으면 replace한다.
- S07 임시 연결 경로는 `/researcher-workflow/[sessionId]/voice-confirmation-pending`이다. 의미 선택·재측정 명령을 실행하지 않고 취소 복귀만 제공한다. 브라우저 뒤로가기로 이탈해도 pendingVoice를 자동 해제하지 않으며, S06에서 다시 연결 안내를 열어 명시적으로 취소한다.

## S06 내부 데이터 계약: 구현됨

| 데이터                      | 책임                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| ProcedureSnapshot.execution | Mock 초안 출처, profileVersion, 조건별 반복 수, 안정화 초안 표시값. 세션의 고정 스냅샷에 포함       |
| ExecutionCursor             | cursorId, stepId, conditionId, trialIndex. 새 회차마다 cursorId를 새로 발급                         |
| MeasurementAttempt          | 요청·수신·확인 시각, 원본 센서 응답, 이슈, 회차, sampling/waiting/ready/held/error/superseded/valid |
| PendingVoiceCommand         | commandId, 발화, 커서, 시각, source. 의미 선택 결과는 아직 정의하지 않음                            |
| ExperimentSession.execution | 현재 커서, 모든 응답 시도, 음성 확인 대기 상태                                                      |

- `requestExecutionSample(cursorId)`은 현재 커서에서만 접수하며 sampling을 반환한다. 비동기 결과는 Repository가 저장·publish한다. UI unmount로 작업을 취소하거나 성공 처리하지 않는다.
- `completeExecutionStep(cursorId, sampleAttemptId)`은 현재 회차의 최신 ready 응답과 작업자 명시적 요청이 모두 필요하다. 오래된 커서·다른 응답 토큰·보류·응답 대기·pendingVoice는 진행을 허용하지 않는다.
- 응답만으로 사람 근거가 생기지 않는다. 완료 수락 시 `measurementConfirmed` human 근거와 `measurementAccepted` sensor/program 근거를 구분하여 추가하며 모두 source=mock이다. S04·S05의 기존 근거·이벤트·세션·절차 버전은 보존한다.
- 동일 requestId 재전송은 기존 방식으로 한 번만 적용한다. 새 requestId여도 이미 valid인 같은 커서·응답 토큰의 완료는 이벤트·근거를 추가하지 않는다. 최신 revision 검증도 유지한다.
- 실패·보류 시도는 삭제하지 않는다. 같은 회차에서 새 응답을 요청하면 이전 ready만 superseded로 남긴다. 오래된 async 결과는 현재 sampling attemptId와 일치할 때만 수락한다.
- 이벤트 추가: executionSampleRequested/Received/Rejected, measurementAccepted, voiceClarificationRequested/Dismissed. 각 이벤트는 requestId·시각·cursor와 필요한 attemptId를 가진다.
- 모호한 음성 시뮬레이션은 `requestVoiceClarification(cursorId, utterance)`으로 현재 커서를 동결한 요청을 남긴다. `dismissVoiceClarification(commandId)`은 실행 없이 대기만 해제한다. S07에는 sessionId를 전달하고 Repository에서 전체 상태를 읽는다.

## S06 Mock과 실연동 경계: 협의 필요

- 승인된 전체 실행 정의가 없으므로 출력 0/25/50/75/100%, 조건별 3회, 안정화 5초를 `provenance: mock-draft`로 명시했다. 기존 절차에 execution 정의가 없으면 임의 기본값을 붙이지 않고 S06을 차단한다. 공식 승인 절차·안전 임계값이 아니다.
- 새 실험은 0% 1회차·유효 측정 0/15부터 시작한다. Figma의 50% 2회차·11/16은 예시 상태이며 전체 16단계 정의가 없어 가짜 완료 이력을 만들지 않았다. 현재 진행률은 유효 측정 수/초안 반복 수이며 전체 워크플로 진행률과 다르다.
- 정상·안정화 대기·오래된 값·응답 없음·통신 오류·작업 보류를 Mock 전용 컨트롤로 재현한다. 500ms는 UI 지연이며 실제 안정화 안전 타이머가 아니다. 값이 있다고 안전 범위에 있다고 판정하지 않는다.
- 응답은 커서·출처·필수 센서/측정 종류·값/단위/시각·passed 상태를 검증한다. 명시적 stale 또는 현재 요청보다 과거의 관측값은 거절한다. 수신 이후 만료 TTL·장치 시계 오차·최신성 허용 시간은 아직 확정하지 않았다. 실제 API는 서비스가 판정한 신선도와 규칙 버전을 공급해야 한다.
- 기존 S05 점검값을 S06 측정값으로 재사용하지 않는다. S05 성공 기록은 점검 시점의 스냅샷이며 S06에서는 현재 회차 응답을 별도로 요청한다.
- 실제 Repository는 같은 createSession/getSession/executeCommand/subscribe를 구현하고, 장치 작업 접수와 최종 결과를 분리해서 전달해야 한다. 새 report/command/event 이름은 프론트엔드 내부안이며 서버 DTO·엔드포인트·승인 규칙으로 확정된 것이 아니다.
- 실연동 전 합의: 승인 실행 프로파일 공급, 커서 발급 주체, 측정·출력 명령 분리, 샘플 채취 시점/안정화 결과 권위, 장치 시계·freshness, S07 의미 확정/취소와 원래 요청의 상관 ID, 후속 오류 복구·일시정지·종료 전환, 중복 키 유효기간·재접속·영속 복원.
- Mock은 메모리 저장이다. 화면 왕복은 유지되지만 앱 재시작·웹 새로고침은 복원이 안 된다. 실제 세션 영속화는 서버 Repository 책임으로 합의한다.
- 통합 충돌 예상 파일: domain/models.ts의 union, 고정 ProcedureSnapshot 공급부, MockWorkflowRepository, 같은 sessionId 라우트 연결. 공통 Provider·설정·디자인 시스템·팀원 화면은 변경하지 않았다.
