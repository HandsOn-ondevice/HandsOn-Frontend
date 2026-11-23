import { Pressable } from 'react-native';
import { AppText, SectionHeader, SurfaceCard } from '@/design-system';
import type { ReviewResult } from './reviewData';

export function ResultConditions({
  result,
  onOpenCondition,
}: {
  result: ReviewResult;
  onOpenCondition: (conditionId: string) => void;
}) {
  return (
    <>
      <SectionHeader title={result.metricLabel ?? '조건별 측정 평균'} />
      {result.conditions.map((condition) => {
        const title = `${condition.label} 조건`;
        const value =
          condition.value === null
            ? '측정값 없음'
            : `${Number(condition.value.toFixed(1))} ${result.unit}`;
        return (
          <Pressable
            key={condition.id}
            accessibilityRole="button"
            accessibilityLabel={`${title}, ${value}`}
            accessibilityHint="측정 근거를 엽니다"
            onPress={() => onOpenCondition(condition.id)}
          >
            <SurfaceCard title={title} subtitle={value} tone="subtle">
              <AppText variant="caption">{`유효 ${condition.validCount} / ${condition.totalCount}`}</AppText>
            </SurfaceCard>
          </Pressable>
        );
      })}
    </>
  );
}
