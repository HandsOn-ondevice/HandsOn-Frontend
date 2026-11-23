# 조도 저하에 따른 자동 보류와 재개 검증

[이슈 #55](https://github.com/HandsOn-ondevice/HandsOn-Frontend/issues/55)의 시연 장면 10~12를 검증했습니다. macOS의 Expo 개발 웹과 Playwright Chromium 모바일 뷰포트(360×800, 터치 활성화)에서 [Edge 통합 브랜치 `f5edd0b`](https://github.com/HandsOn-ondevice/HandsOn-Backend/tree/f5edd0b7fc8345f1e6694c2c10fa6d3402e84b53)를 루프백의 격리 SQLite로 실행했습니다. 기본 시뮬레이터의 조도는 2400 ADC로 고정돼 있으므로 테스트 실행기에서 센서 리포트의 `lightRaw` 값만 주입했습니다. 서버의 주기적 판정, 세션·이력 저장, 명령 처리와 시뮬레이터 LED 출력은 실제 Edge가 처리했습니다.

## 관찰 결과

| 입력과 동작                                                            | Edge 관찰                                                                                                                                                                           |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 연결 정상, 거리 16.7 cm, 조도 2135 ADC                                 | 첫 회차 `running`, 시뮬레이터 LED `on`. 승인 절차의 조도 하한은 1500 ADC입니다.                                                                                                     |
| 조도만 900 ADC로 낮춤                                                  | 브라우저에서 세션 명령을 보내지 않은 상태에서 서버 모니터가 같은 세션·회차를 `held`로 바꾸고 LED를 `off`로 전환했습니다. `sessionHeld`에 `LIGHT_TOO_DARK`와 보류 사유가 남았습니다. |
| 900 ADC에서 최신 측정을 조회한 뒤 재개 요청                            | 새 관측 시각과 시퀀스를 확인했습니다. `resume`이 센서를 다시 읽고 `423 LIGHT_TOO_DARK`를 반환했습니다. 같은 세션·회차가 보류 상태였고 LED는 꺼져 있었습니다.                        |
| 조도를 2100 ADC로 높여 최신 측정 조회                                  | 새 값·시각을 확인했습니다. 재개 명령 전까지 같은 세션·회차가 보류 상태였고 LED는 꺼져 있었습니다.                                                                                   |
| 2100 ADC에서 명시적으로 재개 요청                                      | `resume` 안의 검사가 통과했고 같은 회차에서 `running` 및 LED `on`으로 돌아왔습니다.                                                                                                 |
| 별도 세션에서 2100 ADC를 확인한 직후 조도를 900 ADC로 낮추고 재개 요청 | 새 검사 기록의 조도는 900 ADC였고 `423 LIGHT_TOO_DARK`가 반환되었습니다. 같은 회차의 `held`와 LED `off`가 유지되었습니다.                                                           |

LED는 세션의 `actuator.state`와 `GET /system/health`의 `components.led`를 대조했습니다. Playwright 첨부 JSON에 세션·회차 ID, 조도 측정값과 시각, 보류 이벤트, 재개 요청에서 저장한 검사 결과를 남깁니다.

## 화면과 시연에서 남은 확인

- 열린 실행 화면은 서버 보류 직후 자동으로 갱신되지 않았습니다. 연구생 홈으로 돌아오면 **보류 · 0 / 3회차**가 표시됩니다. **이어서 진행**으로 연 복구 화면은 실패한 측정 시도가 없어 **복구할 측정 오류가 없습니다**를 표시합니다. 여기서 실행 화면으로 돌아가면 **주변 밝기가 기준보다 낮습니다.**가 표시됩니다.
- 현재 앱 경로에서는 이 보류 상태에서 재확인과 재개를 누를 수 없어 Playwright가 최신 측정을 조회하고 Edge API 2.0 재개 요청을 보냈습니다. 앱에서 다시 로그인하고 같은 회차가 열리는 것을 확인했습니다. 앱 재개 경로는 [#60](https://github.com/HandsOn-ondevice/HandsOn-Frontend/issues/60)의 범위입니다.
- `GET /sensors/latest`는 측정값과 시각을 반환합니다. 승인 기준에 따른 통과·실패 판정은 재개 요청 안에서 실행되고 `resumeChecks`에 저장됩니다. 자동 보류 이벤트에는 사유와 보류 ID가 남으며, 900 ADC와 승인 하한 1500 ADC는 각각 센서 조회와 승인 절차 응답으로 대조했습니다.
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
