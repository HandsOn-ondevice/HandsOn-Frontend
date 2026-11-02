import { useState } from 'react';
import { AppText, SelectField } from '@/design-system';
import {
  mockExecutionScenarios,
  type MockExecutionScenario,
} from '../infrastructure/mock/execution-scenarios';
import { useMockDeviceCheckControls } from '../state/WorkflowProvider';
import { workflowErrorMessage } from '../state/useWorkflowSession';

export function MockExecutionScenarioControl({
  sessionId,
  disabled,
}: {
  sessionId: string;
  disabled: boolean;
}) {
  const controls = useMockDeviceCheckControls();
  const [value, setValue] = useState<MockExecutionScenario>(
    () => controls?.getExecutionScenario(sessionId) ?? 'normal',
  );
  const [error, setError] = useState<string | null>(null);
  if (!__DEV__ || !controls) return null;
  return (
    <>
      <SelectField
        label="Mock 실행 시나리오"
        value={value}
        options={mockExecutionScenarios}
        disabled={disabled}
        onChange={(next) => {
          const scenario = mockExecutionScenarios.find((item) => item.value === next)?.value;
          if (!scenario) return;
          try {
            controls.setExecutionScenario(sessionId, scenario);
            setValue(scenario);
            setError(null);
          } catch (reason) {
            setError(workflowErrorMessage(reason));
          }
        }}
      />
      <AppText variant="caption">
        다음 Mock 응답 요청에 적용됩니다. 실제 출력 제어·안전 타이머는 실행하지 않습니다.
      </AppText>
      {error ? <AppText accessibilityLiveRegion="polite">{error}</AppText> : null}
    </>
  );
}
