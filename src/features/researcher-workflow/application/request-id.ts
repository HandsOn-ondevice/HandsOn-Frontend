let sequence = 0;
const prefix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** 한 앱 실행 안의 명령 ID. 실제 API는 이 값을 멱등 키로 전달한다. */
export function createRequestId() {
  return `${prefix}-${++sequence}`;
}
