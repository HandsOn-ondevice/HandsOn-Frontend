import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  ActionShelf,
  AppText,
  Button,
  FeedbackPanel,
  ProcedureCard,
  SegmentedControl,
  SurfaceCard,
  colors,
  spacing,
} from '@/design-system';
import type { WorkEnvironment } from '@/features/entry/entryEnvironment';
import { ProcedureFrame } from './ProcedureFrame';
import type { ProcedureLookup, ProcedureSummary } from './procedureModels';

interface ProcedureListViewProps {
  environment: WorkEnvironment;
  lookup: ProcedureLookup<readonly ProcedureSummary[]>;
  onBack: () => void;
  onRetry: () => void;
  onConfirm: (procedure: ProcedureSummary) => void;
}

const filters = [
  { label: '전체', value: 'all' },
  { label: 'LED', value: 'led' },
  { label: '센서 점검', value: 'sensor' },
  { label: '최근 사용', value: 'recent' },
];

function selectionKey(procedure: ProcedureSummary) {
  return JSON.stringify([procedure.id, procedure.approvedVersion]);
}

export function ProcedureListView({
  environment,
  lookup,
  onBack,
  onRetry,
  onConfirm,
}: ProcedureListViewProps) {
  const [filter, setFilter] = useState('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const procedures = lookup.status === 'ready' ? lookup.data : [];
  const visible = procedures
    .filter((procedure) => {
      if (filter === 'all') return true;
      if (filter === 'recent') return Boolean(procedure.lastUsedAt);
      return procedure.category === filter;
    })
    .sort((a, b) =>
      filter === 'recent' ? (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '') : 0,
    );
  const selected = visible.find((procedure) => selectionKey(procedure) === selectedKey);

  return (
    <ProcedureFrame
      headerTitle="승인 절차 선택"
      title={'검증된 절차로,\n정확한 실험을.'}
      subtitle={lookup.status === 'ready' ? `승인된 절차 ${procedures.length}개` : undefined}
      onBack={onBack}
      footer={
        <ActionShelf
          primary="선택한 절차 확인"
          disabled={!selected}
          onPrimary={() => {
            if (selected) onConfirm(selected);
          }}
          safeArea
        />
      }
    >
      <SurfaceCard title="대상 장치" subtitle={environment.deviceName} tone="subtle">
        <AppText variant="caption" color={colors.text.secondary}>
          {environment.name}
        </AppText>
      </SurfaceCard>
      <SegmentedControl
        options={filters}
        value={filter}
        disabled={lookup.status !== 'ready'}
        onChange={(value) => {
          setFilter(value);
          setSelectedKey(null);
        }}
      />
      {lookup.status === 'loading' ? (
        <View style={styles.loading} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.text.action} />
          <AppText color={colors.text.secondary}>승인 절차를 불러오는 중</AppText>
        </View>
      ) : lookup.status === 'error' ? (
        <>
          <FeedbackPanel
            title="승인 절차를 불러오지 못했어요."
            subtitle="연결 상태를 확인하고 다시 시도해 주세요."
            tone="warning"
            icon="alert"
          />
          <Button label="다시 시도" variant="secondary" icon="retry" onPress={onRetry} />
        </>
      ) : visible.length === 0 ? (
        <>
          <FeedbackPanel
            title={
              procedures.length === 0
                ? '이 작업 환경에 승인된 절차가 없어요.'
                : '필터에 맞는 승인 절차가 없어요.'
            }
            subtitle="작성 중이거나 승인이 취소된 절차는 실행할 수 없어요."
            icon="approval"
          />
          {filter !== 'all' ? (
            <Button
              label="전체 절차 보기"
              variant="secondary"
              onPress={() => {
                setFilter('all');
                setSelectedKey(null);
              }}
            />
          ) : (
            <Button label="새로고침" variant="secondary" icon="retry" onPress={onRetry} />
          )}
        </>
      ) : (
        visible.map((procedure) => (
          <ProcedureCard
            key={selectionKey(procedure)}
            title={procedure.title}
            subtitle={procedure.description}
            meta={`${procedure.approvedVersion} · ${procedure.stepCount}단계 · 약 ${procedure.estimatedMinutes}분`}
            detail={`승인자 · ${procedure.approvedBy}`}
            state={selectionKey(procedure) === selectedKey ? 'selected' : 'approved'}
            onPress={() => setSelectedKey(selectionKey(procedure))}
          />
        ))
      )}
    </ProcedureFrame>
  );
}

const styles = StyleSheet.create({
  loading: { padding: spacing[24], gap: spacing[12], alignItems: 'center' },
});
