import { useState, type ReactNode } from 'react';
import { Button } from '@/design-system';

/** 개발 환경의 명시적 미리보기 조작. 일반 작업 흐름과 분리한다. */
export function PreviewTools({ children, available }: { children: ReactNode; available: boolean }) {
  const [open, setOpen] = useState(false);
  if (!__DEV__ || !available) return null;
  return (
    <>
      <Button
        label={open ? '미리보기 설정 닫기' : '미리보기 설정'}
        variant="secondary"
        onPress={() => setOpen(!open)}
      />
      {open ? children : null}
    </>
  );
}
