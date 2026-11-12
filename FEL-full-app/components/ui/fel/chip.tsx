// CHIP (lane/premium-ui P1): a short label — a status, a count, a tag. Tone is meaning (success / warning / danger), or
// the accent for the one thing that is live; never decoration. With `href` it is a secondary action beside the primary.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { TYPE } from '@/lib/design/type';

export type ChipTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const TONE: Record<ChipTone, string> = {
  neutral: 'border-white/12 bg-white/[0.06] text-fel-soft',
  accent: 'border-fel-cyan/40 bg-fel-cyan/[0.12] text-fel-cyan',
  success: 'border-fel-emerald/40 bg-fel-emerald/[0.1] text-fel-emerald',
  warning: 'border-fel-gold/40 bg-fel-gold/[0.1] text-fel-gold',
  danger: 'border-fel-crimson/45 bg-fel-crimson/[0.12] text-[#ff6b8b]',
};

export function Chip({ children, tone = 'neutral', icon, href, testId }: {
  children: ReactNode; tone?: ChipTone; icon?: ReactNode; href?: string; testId?: string;
}) {
  const cls = `inline-flex items-center gap-1.5 rounded-full border px-3 ${TYPE.label} ${TONE[tone]}`;
  if (href) {
    return <Link href={href} data-testid={testId} className={`${cls} fel-press min-h-11 backdrop-blur-sm hover:bg-white/[0.1]`}>{icon}{children}</Link>;
  }
  return <span data-testid={testId} className={`${cls} min-h-7`}>{icon}{children}</span>;
}
