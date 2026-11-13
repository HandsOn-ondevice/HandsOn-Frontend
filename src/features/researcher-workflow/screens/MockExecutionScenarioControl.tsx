import { useState } from 'react';
import { AppText, SelectField } from '@/design-system';
import {
  mockExecutionScenarios,
  type MockExecutionScenario,
} from '../infrastructure/mock/execution-scenarios';
import type { MockWorkflowRepository } from '../infrastructure/mock/MockWorkflowRepository';
import { workflowErrorMessage } from '../state/useWorkflowSession';

export function MockExecutionScenarioControl({
  sessionId,
  disabled,
  controls,
}: {
  sessionId: string;
  disabled: boolean;
  controls: MockWorkflowRepository | null;
}) {
  const [value, setValue] = useState<MockExecutionScenario>(
    () => controls?.getExecutionScenario(sessionId) ?? 'normal',
  );
  const [error, setError] = useState<string | null>(null);
  if (!__DEV__ || !controls) return null;
  return (
    <>
      <SelectField
        label="측정 응답 조건"
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
      <AppText variant="caption">선택한 조건은 다음 응답 요청에 적용됩니다.</AppText>
      {error ? <AppText accessibilityLiveRegion="polite">{error}</AppText> : null}
    </>
  );
}
