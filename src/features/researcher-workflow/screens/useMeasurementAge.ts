import { useEffect, useState } from 'react';

/** 표시 전용 경과 시간. 최신성·안전 판정 또는 측정값 보정에 사용하지 않는다. */
export function formatMeasurementAge(observedAt: string | undefined, now: number): string {
  if (!observedAt) return '측정 시각 없음';
  const observed = Date.parse(observedAt);
  if (!Number.isFinite(observed) || !Number.isFinite(now) || observed > now)
    return '측정 시각 확인 불가';
  const seconds = (now - observed) / 1000;
  if (seconds < 60) return `${(Math.floor(seconds * 10) / 10).toFixed(1)}초 전`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
  return `${Math.floor(seconds / 86400)}일 전`;
}

export function useMeasurementAge(observedAt: string | undefined) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!observedAt || !Number.isFinite(Date.parse(observedAt))) return;
    const update = () => setNow(Date.now());
    const firstTick = setTimeout(update, 0);
    const timer = setInterval(update, 1000);
    return () => {
      clearTimeout(firstTick);
      clearInterval(timer);
    };
  }, [observedAt]);
  return formatMeasurementAge(observedAt, now);
}
