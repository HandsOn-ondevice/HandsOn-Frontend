# S04~S07 통합 메모

이 문서는 researcher-workflow 기능 내부 구현 계약이다. 팀 전체의 확정 API 명세가 아니다.

## 현재 연결과 호환성

- 기존 Expo Router·루트 Provider·디자인 시스템·갤러리를 유지한다. 상태는 기존 WorkflowProvider·useWorkflowSession과 동일한 Repository 인스턴스에서 조회·구독한다.
- sessionId와 고정 ProcedureSnapshot을 URL·화면 간 연결의 기준으로 사용한다. URL에 센서값이나 절차 JSON을 넣지 않는다.
- 준비 확인 5개 → completePreparation → awaitingDeviceCheck → startDeviceCheck → readyToExecute → startExecution → running 순서다. S06은 현재 조건·회차의 Mock 응답과 작업자 완료 요청을 처리한다.
- 기존 `/researcher-workflow/[sessionId]/device-check-pending`은 세션을 보존하는 Redirect로 새 `device-check` 경로에 연결한다. S04 복귀는 back/replace, S06에서 S05 복귀는 dismissTo를 사용한다.
- S04 확인 완료 후에는 작업자 항목을 잠그는 기존 규칙을 유지한다. S05 성공은 communication 항목만 갱신한다. S04로 돌아가면 6/6과 `통신 확인 기록`를 표시한다.
- `ProcedureSnapshot.deviceCheck`는 장치·필수 센서·측정 종류·단위를 담는 기능 내부 확장이다. 기존 절차에 정의가 없으면 S04는 사용할 수 있지만 S05 점검을 시작하지 못한다. 팀원 데이터에 암묵적으로 LED 센서를 붙이지 않는다.

## Repository 교체 지점

1. 실제 API용 WorkflowRepository 구현체를 만든다. createSession/getSession/executeCommand/subscribe의 서명은 유지한다.
2. feature WorkflowProvider의 repository 주입을 합의한 앱 조립 지점에 연결한다. 현재 기본값은 개발 환경(**DEV**)의 메모리 MockWorkflowRepository다. 배포 환경에서는 기본 공급/Mock 직접 주입을 차단한다. API 구현체를 명시적으로 주입해야 하며 전역 Provider를 새로 만들지 않는다.
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
- 실제 S06 URL은 `/researcher-workflow/[sessionId]/execution`이다. 기존 `execution-pending`은 같은 sessionId로 Redirect한다. S06→S05, S07→S06 복귀는 dismissTo로 기존 화면을 사용하며, 해당 화면이 히스토리에 없으면 replace한다.
- 실제 S07 경로는 `/researcher-workflow/[sessionId]/voice-clarification`이다. 기존 `voice-confirmation-pending`은 같은 sessionId로 Redirect한다. 브라우저 자체 뒤로가기로 이탈해도 pendingVoice를 자동 확정·해제하지 않으며, S06에서 다시 요청을 열어 처리할 수 있다.

## S06 내부 데이터 계약: 구현됨

| 데이터                      | 책임                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| ProcedureSnapshot.execution | Mock 초안 출처, profileVersion, 조건별 반복 수, 안정화 초안 표시값. 세션의 고정 스냅샷에 포함       |
| ExecutionCursor             | cursorId, stepId, conditionId, trialIndex. 새 회차마다 cursorId를 새로 발급                         |
| MeasurementAttempt          | 요청·수신·확인 시각, 원본 센서 응답, 이슈, 회차, sampling/waiting/ready/held/error/superseded/valid |
| PendingVoiceCommand         | commandId, 발화, 커서, 시각, source, 확인 요청 당시 sampleAttemptId                                 |
| ExperimentSession.execution | 현재 커서, 모든 응답 시도, 음성 확인 대기 상태                                                      |

- `requestExecutionSample(cursorId)`은 현재 커서에서만 접수하며 sampling을 반환한다. 비동기 결과는 Repository가 저장·publish한다. UI unmount로 작업을 취소하거나 성공 처리하지 않는다.
- `completeExecutionStep(cursorId, sampleAttemptId)`은 현재 회차의 최신 ready 응답과 작업자 명시적 요청이 모두 필요하다. 오래된 커서·다른 응답 토큰·보류·응답 대기·pendingVoice는 진행을 허용하지 않는다.
- 응답만으로 사람 근거가 생기지 않는다. 완료 수락 시 `measurementConfirmed` human 근거와 `measurementAccepted` sensor/program 근거를 구분하여 추가하며 모두 source=mock이다. S04·S05의 기존 근거·이벤트·세션·절차 버전은 보존한다.
- 동일 requestId 재전송은 기존 방식으로 한 번만 적용한다. 새 requestId여도 이미 valid인 같은 커서·응답 토큰의 완료는 이벤트·근거를 추가하지 않는다. 최신 revision 검증도 유지한다.
- 실패·보류 시도는 삭제하지 않는다. 같은 회차에서 새 응답을 요청하면 이전 ready만 superseded로 남긴다. 오래된 async 결과는 현재 sampling attemptId와 일치할 때만 수락한다.
- 이벤트 추가: executionSampleRequested/Received/Rejected, measurementAccepted, voiceClarificationRequested/Dismissed. 각 이벤트는 requestId·시각·cursor와 필요한 attemptId를 가진다.
- 모호한 음성 시뮬레이션은 `requestVoiceClarification(cursorId, utterance)`으로 현재 커서와 최신 응답 토큰을 고정한 요청을 남긴다. `dismissVoiceClarification(commandId)`은 실행 없이 취소를 기록한다. S07에는 sessionId를 전달하고 Repository에서 전체 상태를 읽는다.

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

## S07 구현에서 직접 확인한 사항

- Figma `2085:652`, 412×920, 화면명 **모호한 음성 확인**. “다시 해줘”가 어떤 뜻인지 묻고 현재 안내 다시 듣기 / 같은 조건·회차 다시 측정 / 아무것도 하지 않기를 제공한다. 하단은 현재 작업으로 돌아가기다. 별도 S07 오류·로딩 전용 프레임이나 서버 승인 규칙은 확인되지 않았다.
- Figma의 재측정 강조는 정적 시각 예시로 취급한다. 새 요청에서는 기본 선택을 두지 않는다. 선택 자체는 화면 로컬 상태이며 하단 버튼으로 확정해야 Repository 효과가 발생한다. 화면에 이 동작을 설명한다.
- 앱바 뒤로가기·선택하지 않고 취소는 명시적 취소다. 선택 확정·취소 후 같은 sessionId의 S06으로 dismissTo한다. 네이티브 시스템 뒤로가기/제스처의 실제 동작은 기기 검증이 필요하며, 화면 이탈 자체로 명령을 승인하지 않는다.
- S07은 실험 단계를 완료하거나 다음 조건으로 진행하지 않는다. 사용자 의도 확인 근거와 측정 완료 근거는 별개의 action이다. S08 이후 라우트·실제 화면은 추가하지 않았다.

## S07 내부 계약: 구현됨

| 항목                                         | 내부 처리                                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| resolveVoiceClarification(commandId, choice) | choice = repeatGuidance / remeasure / doNothing. 현재 미처리 요청을 검증하고 확정                   |
| dismissVoiceClarification(commandId)         | 기존 명령 유지. 선택 없이 취소하며 voiceClarificationCancelled 근거 추가                            |
| execution.voiceResolutions                   | 요청 ID·발화·원래 커서·원래 응답 ID·선택·처리 시각·출처·근거 ID, 재측정 시 새 attemptId를 누적 보존 |
| voiceClarificationResolved                   | 사용자 의미 확정 이벤트. commandId·choice·cursor·근거 ID 포함. 장치 실행 성공 이벤트가 아님         |
| voiceClarificationConfirmed                  | kind=human, source=mock. 실제 STT/AI 결과나 측정 완료 근거가 아님                                   |

- 요청의 commandId·source·커서 네 필드·원래 sampleAttemptId·시각 형식과 S05 시작 조건을 검증한다. 현재 작업/응답이 다르거나 이미 처리된 요청은 확정하지 않는다. 오래된 컨텍스트는 안전한 취소만 허용한다. 경과 시간만으로 만료시키는 TTL은 승인된 값이 없어 추가하지 않았다.
- 같은 요청·같은 선택 재전송은 requestId가 달라도 재적용하지 않는다. 이미 처리한 요청에 다른 선택을 보내면 REQUEST_CONFLICT다. 과거 중복 요청으로 새 pendingVoice를 지우지 않는다. 기존 requestId 충돌·expectedRevision 검증도 유지한다.
- repeatGuidance: 의도 확인과 안내 반복 시뮬레이션 결과를 기록한다. 실제 TTS나 센서 요청은 하지 않는다.
- doNothing / cancel: 측정 시도·커서·진행률을 그대로 유지한다. 사용자 확인 또는 취소 이력만 추가한다.
- remeasure: 같은 커서에 새 Mock 응답 요청을 원자적으로 접수한다. 기존 ready는 superseded로 보존하며 기존 실패·유효 기록은 삭제하지 않는다. 확인과 요청 접수 때문에 revision이 두 번 증가할 수 있고 구독에는 최종 접수 상태를 한 번 publish한다. 중복 확인은 새 job을 시작하지 않는다.
- 새 응답은 sampling→ready/waiting/held/error로 기존 S06 엔진을 따른다. 센서 응답·S07 확인만으로 measurementConfirmed/measurementAccepted를 만들지 않는다. 새 ready 응답에 대한 S06 완료 요청이 별도로 필요하다.
- S07 화면의 pending/오류 표시는 기존 useWorkflowSession을 재사용한다. 전송 오류 시 선택과 미처리 요청을 유지하고 재시도할 수 있다. UI 인스턴스가 바뀌면 아직 확정하지 않은 로컬 선택은 초기화한다.

## S07 실연동·팀원 협의: 미확정

- 현재 3개 선택지는 Figma 기반 고정 Mock 후보이며 LLM 추론 결과가 아니다. 실제 API에서 발화/인식 결과와 후보 ID·해석 버전·원본 녹음 식별자를 어떻게 전달할지 합의해야 한다. 원본 오디오를 현재 모델에 임의로 저장하지 않았다.
- API 구현은 기존 WorkflowRepository의 executeCommand/getSession/subscribe를 유지한다. 서버 DTO는 이 내부 command/event 이름과 별도로 합의하며, 세션·절차 버전·commandId·커서·원래 attemptId·사용자 확인·실제 장치 작업 ID의 상관관계를 유지해야 한다.
- 사용자 의미 확정과 장치 명령 접수·실행·실패·결과 검증을 분리해야 한다. 실제 서비스에서 재측정 접수 실패·취소·재접속·동시 사용자 변경을 어떤 상태로 반환할지 미정이다. Mock 전환 함수를 실제 승인 엔진으로 사용하지 않는다.
- 신선도 TTL·시계 오차·요청 무효화 정책, 이미 유효 처리된 과거 회차 재측정/무효화는 아직 정의하지 않았다. 현재 S07은 진행 중인 현재 회차만 대상으로 한다.
- S08 이후에는 sessionId·고정 절차 버전·cursor·commandId·attemptId·선택 결과·오류 코드·evidenceId를 재사용할 수 있다. 특정 E 화면을 비상 화면으로 가정하지 않았다. 숙련자 검토/오류 보고 연결 대상과 권한은 E01~E07 담당자와 합의해야 한다.
- 이번 작업은 feature 내부 모델/Repository/화면·researcher-workflow 라우트와 회귀 기대값만 확장한다. 공통 디자인 시스템·루트 갤러리/Provider·설정·팀원 화면은 변경하지 않았다.

## 2026-11-03 품질 보완 계약

- S05 `DeviceDiagnosticsReport.attemptId`는 현재 checking 시도 ID를 되돌려줘야 한다. 공유 진단 타입에서는 S06 스냅샷 호환성을 위해 선택 필드지만 S05 검증은 누락/불일치를 거절한다.
- 점검 시작 <= 보고 시각 <= 수신 시각, 시작 <= 필수 측정 관측 시각 <= 센서 확인 시각 <= 보고 시각을 요구한다. 임의 TTL이나 시계 오차 허용값을 두지 않았다. 실제 API에서 시각의 권위/동기화/오차 처리를 먼저 합의해야 한다.
- 원본 report와 별도 validation을 보관한다. 센서 카드 상태와 sensor Evidence의 action/diagnosticValidation은 같은 검증 결과를 사용한다. 원본 passed가 프론트엔드 형식/상관관계 검증 성공을 뜻하지 않는다.
- API adapter도 원본 보고서와 검증 결과를 구분하고 동일한 도메인 검증을 적용해야 한다. Mock 전환 함수가 실제 안전 승인 주체가 되지는 않는다.
- 미리보기 제어기는 개발 환경의 Mock에만 노출한다. 일반 화면이 아니라 정보 시트 안에서 명시적으로 열며, 포털 내부에서는 Repository Context를 다시 조회하지 않고 화면에서 전달받는다.
- 사용자 문구와 검증/위험/전체 변경 목록은 `docs/validation/researcher-workflow-quality-20261103.md`에 기록한다. 내부 source=mock 및 실제 서비스 미연결 상태는 유지한다.
