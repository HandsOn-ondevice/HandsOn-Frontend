import { useState } from 'react';
import { AppText, SelectField } from '@/design-system';
import {
  mockDeviceScenarios,
  type MockDeviceScenario,
} from '../infrastructure/mock/device-check-scenarios';
import { useMockDeviceCheckControls } from '../state/WorkflowProvider';
import { workflowErrorMessage } from '../state/useWorkflowSession';

export function MockDeviceScenarioControl({
  sessionId,
  disabled,
}: {
  sessionId: string;
  disabled: boolean;
}) {
  const controls = useMockDeviceCheckControls();
  const [value, setValue] = useState<MockDeviceScenario>(
    () => controls?.getDeviceCheckScenario(sessionId) ?? 'normal',
  );
  const [error, setError] = useState<string | null>(null);
  if (!__DEV__ || !controls) return null;
  return (
    <>
      <SelectField
        label="Mock 점검 시나리오"
        value={value}
        options={mockDeviceScenarios}
        disabled={disabled}
        onChange={(next) => {
          const scenario = mockDeviceScenarios.find((item) => item.value === next)?.value;
          if (!scenario) return;
          try {
            controls.setDeviceCheckScenario(sessionId, scenario);
            setValue(scenario);
            setError(null);
          } catch (reason) {
            setError(workflowErrorMessage(reason));
          }
        }}
      />
      <AppText variant="caption">
        선택한 시나리오는 다음 점검에 적용됩니다. 실제 장비에는 연결하지 않습니다.
      </AppText>
      {error ? <AppText accessibilityLiveRegion="polite">{error}</AppText> : null}
    </>
  );
}
