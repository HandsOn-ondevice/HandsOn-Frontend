# 조도 저하에 따른 자동 보류와 재개 검증

[이슈 #55](https://github.com/HandsOn-ondevice/HandsOn-Frontend/issues/55)의 시연 장면 10~12를 대상으로 합니다. macOS의 Expo 개발 웹과 Playwright Chromium 모바일 뷰포트(360×800, 터치 활성화)에서 [Edge 통합 브랜치 `f5edd0b`](https://github.com/HandsOn-ondevice/HandsOn-Backend/tree/f5edd0b7fc8345f1e6694c2c10fa6d3402e84b53)를 루프백과 격리 SQLite로 실행합니다. 기본 시뮬레이터의 조도는 2400 ADC로 고정돼 있으므로 테스트 실행기에서 센서 리포트의 `lightRaw` 값만 주입합니다. 서버의 주기적 판정, 세션·이력 저장, 명령 처리와 시뮬레이터 LED 출력은 실제 Edge가 처리합니다.

## 검증 시나리오

2026-11-24에 앱의 **장치 점검하고 재개**를 사용해 Playwright UI 모드와 터미널에서 두 시나리오를 실행했고, 두 실행 모두 통과했습니다.

| 입력과 동작                                                            | 확인 항목                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 연결 정상, 거리 16.7 cm, 조도 2135 ADC                                 | 첫 회차 `running`, 시뮬레이터 LED `on`, 승인 절차의 조도 하한 1500 ADC를 확인합니다.                                                                                                                                                                        |
| 조도만 900 ADC로 낮춤                                                  | 브라우저에서 세션 명령을 보내지 않아도 서버 모니터가 같은 세션·회차를 `held`로 바꾸고 LED를 `off`로 전환하는지 확인합니다. `sessionHeld` 이벤트와 연구생 홈에서 다시 연 복구 화면의 보류 사유를 대조합니다.                                                 |
| 900 ADC에서 최신 측정을 조회한 뒤 앱에서 재개 요청                     | `GET /sensors/latest`에서 900 ADC와 새 관측 시각·시퀀스를 확인합니다. 복구 화면의 두 작업자 확인 항목을 선택하고 **장치 점검하고 재개**를 눌렀을 때 `423 LIGHT_TOO_DARK`와 화면의 차단 사유가 표시되고, 같은 세션·회차와 LED `off`가 유지되는지 확인합니다. |
| 조도를 2100 ADC로 높여 최신 측정 조회                                  | `GET /sensors/latest`에서 새 값·시각을 확인하고, 앱에서 재개를 요청하기 전까지 같은 세션·회차의 `held`와 LED `off`가 유지되는지 확인합니다.                                                                                                                 |
| 2100 ADC에서 앱으로 명시적 재개 요청                                   | **장치 점검하고 재개**의 서버 검사가 통과하고 앱이 같은 회차의 실행 화면으로 돌아오는지 확인합니다. 세션 상태 `running`과 LED `on`을 대조합니다.                                                                                                            |
| 별도 세션에서 2100 ADC를 조회한 직후 900 ADC로 낮추고 앱에서 재개 요청 | `423 LIGHT_TOO_DARK`와 화면의 차단 사유를 확인합니다. 새 검사 기록의 조도는 900 ADC이며 같은 회차의 `held`와 LED `off`가 유지되어야 합니다.                                                                                                                 |

LED는 세션의 `actuator.state`와 `GET /system/health`의 `components.led`를 대조합니다. 브라우저의 재개 명령은 **실험 조건을 확인했어요**와 **장치 설치 상태를 확인했어요**를 선택한 뒤 보냅니다. Edge는 명령을 처리할 때 센서를 새로 읽고, 조도와 관측 시각을 포함한 통과·실패 결과를 `resumeChecks`에 저장합니다. Playwright 첨부 JSON에 세션·회차 ID, 센서 측정값과 시각, 보류 이벤트와 재개 검사 결과를 남깁니다.

## 화면과 시연에서 남은 확인

- 열린 실행 화면은 서버 보류를 실시간으로 표시하지 않습니다. 연구생 홈에 돌아온 뒤 **이어서 진행**으로 복구 화면을 열면 현재 회차와 **주변 밝기가 기준보다 낮습니다.** 안내를 확인할 수 있습니다.
- 복구 화면에서 센서 점검과 재개는 한 동작으로 실행됩니다. 재개 전에 조도 값·측정 시각·정상 판정만 보는 별도 화면 동작은 구현되어 있지 않습니다.
- 자동 보류 이벤트에는 사유와 보류 ID가 남습니다. 900 ADC와 승인 하한 1500 ADC는 각각 센서 조회와 승인 절차 응답에서 대조합니다.
- 갤럭시 탭·Orange Pi의 물리 센서와 LED, 음성 안내는 실기기 리허설에서 확인해야 합니다.

## 재실행

Edge 통합 브랜치의 위 커밋을 별도 디렉터리에 준비하고 그 디렉터리에서 `uv sync --locked --no-dev`를 실행합니다. 프런트 저장소 루트에서 아래 예시의 `edge_repo`를 해당 절대 경로로 바꿉니다. Edge와 Playwright는 같은 조도 입력 파일을 사용합니다. 실행마다 별도의 Edge 프로세스, SQLite 디렉터리와 파일을 쓰고 Playwright 워커는 하나로 지정합니다.

```sh
edge_repo=/absolute/path/to/HandsOn-Backend
run_dir=$(mktemp -d)
export HANDSON_E2E_LIGHT_SENSOR_FILE="$run_dir/light.adc"
printf '2135\n' > "$HANDSON_E2E_LIGHT_SENSOR_FILE"
export HANDSON_E2E_OPERATOR_TOKEN=local-test-operator
export HANDSON_E2E_EXPERT_TOKEN=local-test-expert

HANDSON_MODE=simulation HANDSON_DATA_DIR="$run_dir/db" HANDSON_HEARTBEAT_TIMEOUT=0 \
  HANDSON_CORS_ORIGINS=http://localhost:19055 \
  HANDSON_OPERATOR_TOKEN="$HANDSON_E2E_OPERATOR_TOKEN" \
  HANDSON_EXPERT_TOKEN="$HANDSON_E2E_EXPERT_TOKEN" PYTHONPATH="$edge_repo" \
  "$edge_repo/.venv/bin/python" e2e/fixtures/light-hold-edge.py --port 18055 &
edge_pid=$!
trap 'kill "$edge_pid"' EXIT

HANDSON_E2E_LIGHT_HOLD=1 EXPO_E2E_PORT=19055 \
  EXPO_PUBLIC_HANDSON_EDGE_BASE_URL=http://127.0.0.1:18055 \
  npm run test:e2e:ui -- e2e/edge-light-hold.spec.ts --workers=1
```

Playwright UI에서 두 시나리오를 실행합니다. 터미널에서 한 번 실행하려면 같은 명령의 `test:e2e:ui`를 `test:e2e`로 바꿉니다. 캡처와 결과는 `artifacts/playwright/test-results/` 및 Playwright 첨부 탭에서 확인할 수 있습니다.
