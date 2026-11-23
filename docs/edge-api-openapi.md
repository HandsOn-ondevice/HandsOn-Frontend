# HandsOn Edge OpenAPI 명세 조회

API 연동을 시작하기 전에 [OpenAPI JSON](http://192.168.1.2:8080/openapi.json)을 조회한다.

```sh
curl --fail --silent --show-error --connect-timeout 5 --max-time 15 'http://192.168.1.2:8080/openapi.json'
```

1. `paths`에서 대상 API의 경로와 HTTP 메서드를 찾는다.
2. `parameters`, `requestBody`, `responses`에서 요청 입력값과 응답 상태 코드별 스키마를 확인한다.
3. `$ref`가 있으면 참조된 정의를 열어 필드의 타입과 필수 여부를 확인한다.

이 주소는 사설 IP이므로 에이전트가 실행되는 환경에서 해당 네트워크에 접근할 수 있어야 한다. 조회에 실패하면 접속 가능한 환경에서 다시 시도하거나 최신 OpenAPI JSON 사본으로 명세를 확인한다.
