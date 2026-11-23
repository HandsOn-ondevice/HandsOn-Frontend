import { useEffect, useState } from 'react';
import { AppText, CheckboxRow, FeedbackPanel } from '@/design-system';
import { currentEdgeHold, type ResumeConfirmation } from '../domain/edge-hold';
import type { ExperimentSession } from '../domain/models';

type Check = 'conditions' | 'installation';
type Confirmation = {
  key: string;
  conditions: boolean;
  installation: boolean;
  confirmedAt?: number;
};

export function useEdgeHoldConfirmation(session: ExperimentSession | null) {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [expiredKey, setExpiredKey] = useState<string | null>(null);
  const hold = currentEdgeHold(session);
  const validityMs = hold?.confirmationValidityMs ?? 0;
  const cursorId = session?.execution?.cursor?.cursorId ?? null;
  const key = JSON.stringify([hold?.holdId, cursorId, hold?.allowedCommands, session?.revision]);
  const current = confirmation?.key === key ? confirmation : null;
  const confirmedAt = current?.confirmedAt;

  useEffect(() => {
    if (confirmedAt === undefined) return;
    const timer = setTimeout(
      () => {
        setConfirmation((previous) => (previous?.key === key ? null : previous));
        setExpiredKey(key);
      },
      Math.max(0, confirmedAt + validityMs - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [confirmedAt, key, validityMs]);

  return {
    required: hold?.requiresConfirmation === true,
    ready: !hold?.requiresConfirmation || confirmedAt !== undefined,
    conditions: current?.conditions ?? false,
    installation: current?.installation ?? false,
    expired: expiredKey === key,
    validityMs,
    check(field: Check, checked: boolean) {
      const checkedAt = Date.now();
      setExpiredKey(null);
      setConfirmation((previous) => {
        const active = previous?.key === key ? previous : null;
        const conditions = field === 'conditions' ? checked : (active?.conditions ?? false);
        const installation = field === 'installation' ? checked : (active?.installation ?? false);
        return {
          key,
          conditions,
          installation,
          confirmedAt: conditions && installation ? checkedAt : undefined,
        };
      });
    },
    take(): ResumeConfirmation | undefined {
      if (!hold?.requiresConfirmation || confirmedAt === undefined) return;
      setConfirmation(null);
      if (Date.now() >= confirmedAt + validityMs) {
        setExpiredKey(key);
        return;
      }
      setExpiredKey(null);
      return {
        holdId: hold.holdId,
        cursorId,
        conditionsConfirmed: true,
        installationConfirmed: true,
        confirmedAt: new Date(confirmedAt).toISOString(),
      };
    },
  };
}

export function EdgeHoldConfirmation({
  value,
  disabled,
}: {
  value: ReturnType<typeof useEdgeHoldConfirmation>;
  disabled: boolean;
}) {
  if (!value.required) return null;
  return (
    <>
      {value.expired ? (
        <FeedbackPanel
          title="작업자 확인 시간이 지났어요"
          subtitle="실험 조건과 장치 설치 상태를 다시 확인해 주세요."
          tone="warning"
        />
      ) : null}
      <CheckboxRow
        title="실험 조건을 확인했어요"
        checked={value.conditions}
        disabled={disabled}
        onChange={(checked) => value.check('conditions', checked)}
      />
      <CheckboxRow
        title="장치 설치 상태를 확인했어요"
        checked={value.installation}
        disabled={disabled}
        onChange={(checked) => value.check('installation', checked)}
      />
      <AppText variant="caption">
        두 항목을 확인한 뒤 {value.validityMs / 1000}초 안에 요청해 주세요.
      </AppText>
    </>
  );
}
