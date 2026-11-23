# S12 검토와 S06 복귀 검증

- Mock Chromium 360×800·412×920에서 S12 상단 뒤로 가기 후 같은 세션의 S06이 열리고, 15회 측정 기록을 유지한 채 S12로 돌아오는 것을 확인했습니다. 기존 누락·무효 회차의 재측정과 S12 복귀도 확인했습니다.
- 격리된 Edge 시뮬레이션(`f5edd0b`)에서 S12와 같은 세션의 S06을 왕복한 뒤 장치 정리와 제출을 완료했습니다. Jest에서는 미리보기가 1/1이어도 해당 회차의 `measurementAccepted` 근거가 들어오기 전까지 정리 버튼이 표시되지 않는지 확인했습니다.
- Android용 `researcher-workflow-review-android.yaml`은 fixture APK에서 Mock 측정 15회를 완료한 뒤 S12와 S06을 왕복합니다. Android 실행 결과는 해당 PR의 검증 섹션에서 확인할 수 있습니다.

Edge는 마지막 회차를 확정하면 `awaitingCleanup`에 들어가 실행 커서를 비웁니다. 이 상태에서 특정 회차를 다시 열려면 서버 명령이 필요합니다. [Edge 명령 스키마](https://github.com/HandsOn-ondevice/HandsOn-Backend/blob/36cf417e849d0673b03cd6b7edb4cd81a971dd5b/app/models.py#L58-L123) · [Edge 상태 전이](https://github.com/HandsOn-ondevice/HandsOn-Backend/blob/36cf417e849d0673b03cd6b7edb4cd81a971dd5b/app/engine.py#L378-L506)
