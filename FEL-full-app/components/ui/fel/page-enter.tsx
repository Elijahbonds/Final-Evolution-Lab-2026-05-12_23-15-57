// PAGE ENTER (lane/premium-ui P1): a page arrives with a short fade (opacity only: a transform would make this the
// containing block for anything position:fixed inside, like a docked CTA). Zero under reduced motion (theme.css).
import type { ReactNode } from 'react';

export function PageEnter({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div data-fel-page-enter className={`fel-fade ${className}`}>{children}</div>;
}

/** The stagger for a list arriving: the nth item's --fel-enter-delay, capped so a long list never waits. */
export function enterDelay(i: number, step = 45, cap = 360): Record<string, string> {
  return { ['--fel-enter-delay']: `${Math.min(i * step, cap)}ms` };
}
