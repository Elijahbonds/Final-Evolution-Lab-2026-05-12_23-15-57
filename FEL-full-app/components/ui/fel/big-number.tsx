// BIG-NUMBER TILE (lane/premium-ui P1): one measured number, large, with its unit, its label and its change — the
// Whoop strain / Oura readiness tile. The change carries an arrow AND a word for a screen reader, never colour alone.
import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { NUM, TYPE } from '@/lib/design/type';
import { t } from '@/lib/i18n';

export type Trend = 'up' | 'down' | 'flat';

export function BigNumber({
  label, value, unit, delta, trend, good = 'up', accent, children, testId,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  /** the change, already formatted ("+2.1 cm") */
  delta?: string;
  trend?: Trend;
  /** which direction is good (a faster time is 'down') */
  good?: 'up' | 'down';
  accent?: string;
  children?: ReactNode;
  testId?: string;
}) {
  const tone = !trend || trend === 'flat' ? 'text-fel-dim' : trend === good ? 'text-fel-emerald' : 'text-fel-crimson';
  const Arrow = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus;
  return (
    <div data-testid={testId} className="fel-surface flex min-w-0 flex-col gap-2 p-4">
      <p className={`${TYPE.label} text-fel-dim`}>{label}</p>
      <p className="flex items-baseline gap-1.5 text-white">
        <span className={`${NUM} text-[44px] leading-none`} style={accent ? { color: accent } : undefined}>{value ?? '—'}</span>
        {unit && value !== null && <span className={`${TYPE.small} text-fel-dim`}>{unit}</span>}
      </p>
      {trend && (
        <p className={`${TYPE.small} inline-flex items-center gap-1 ${tone}`}>
          <Arrow aria-hidden className="h-4 w-4" />
          <span className="sr-only">{trend === 'flat' ? t('ui.delta.flat') : t(trend === 'up' ? 'ui.delta.up' : 'ui.delta.down', { value: delta ?? '' })}</span>
          <span aria-hidden>{trend === 'flat' ? '—' : delta}</span>
        </p>
      )}
      {children}
    </div>
  );
}
