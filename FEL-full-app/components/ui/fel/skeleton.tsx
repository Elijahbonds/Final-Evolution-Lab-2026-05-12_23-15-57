// SKELETON (lane/premium-ui P1): while something loads, its shape — never a blank, never a jump when it lands (the shape
// holds the space, so the arrival shifts nothing). A screen reader hears "Loading" once, from the group.
import type { ReactNode } from 'react';
import { t } from '@/lib/i18n';

const SHAPE = {
  line: 'h-4 w-full',
  title: 'h-8 w-2/3',
  block: 'h-28 w-full rounded-[20px]',
  card: 'aspect-[16/9] w-full rounded-[20px]',
  ring: 'h-[88px] w-[88px] rounded-full',
  row: 'h-[72px] w-full rounded-[16px]',
} as const;

export function Skeleton({ shape = 'line', className = '' }: { shape?: keyof typeof SHAPE; className?: string }) {
  return <span aria-hidden data-fel-skeleton className={`fel-skeleton block ${SHAPE[shape]} ${className}`} />;
}

export function SkeletonGroup({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{t('ui.loading')}</span>
      {children}
    </div>
  );
}
