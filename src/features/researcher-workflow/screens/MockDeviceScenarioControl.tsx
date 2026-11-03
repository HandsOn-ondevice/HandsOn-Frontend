import { useState } from 'react';
import { AppText, SelectField } from '@/design-system';
import {
  mockDeviceScenarios,
  type MockDeviceScenario,
} from '../infrastructure/mock/device-check-scenarios';
import type { MockWorkflowRepository } from '../infrastructure/mock/MockWorkflowRepository';
import { workflowErrorMessage } from '../state/useWorkflowSession';

export function MockDeviceScenarioControl({
  sessionId,
  disabled,
  controls,
}: {
  sessionId: string;
  disabled: boolean;
  controls: MockWorkflowRepository | null;
}) {
  const [value, setValue] = useState<MockDeviceScenario>(
    () => controls?.getDeviceCheckScenario(sessionId) ?? 'normal',
  );
  const [error, setError] = useState<string | null>(null);
  if (!__DEV__ || !controls) return null;
  return (
    <>
      <SelectField
        label="점검 응답 조건"
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
      <AppText variant="caption">선택한 조건은 다음 점검에 적용됩니다.</AppText>
      {error ? <AppText accessibilityLiveRegion="polite">{error}</AppText> : null}
    </>
  );
}
