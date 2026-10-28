'use client';
// PRIMARY CTA (lane/premium-ui P1): the screen's ONE obvious action (owner's standing rule), as a big pill in the one
// accent. `docked`: on a phone it sits fixed above the tab bar where a thumb is, on glass, so it is on screen however far
// the page scrolls; from md up it sits inline where it is placed (the hero). A press gives under the finger (.fel-press)
// and ticks the haptic where the device has one (lib/design/feedback.ts). Only one per screen: the docked one is marked
// data-fel-dock, and app/globals.css keeps focus clear of it.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { pressFeedback } from '@/lib/design/feedback';

const PILL = 'fel-press inline-flex min-h-14 items-center justify-center gap-2.5 rounded-full px-8 font-display text-[20px] font-extrabold uppercase leading-none tracking-[0.04em] text-[color:var(--fel-accent-ink)] shadow-[0_10px_32px_-8px_rgba(0,229,255,0.55),inset_0_1px_0_rgba(255,255,255,0.45)]';

export function PrimaryCta({
  href, onClick, children, icon, docked = false, above = 'tabbar', testId: testIdProp, 'data-testid': dataTestId, prefetch,
}: {
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  icon?: ReactNode;
  docked?: boolean;
  /** what the docked pill sits above on a phone: the tab bar (signed in) or the screen's edge */
  above?: 'tabbar' | 'edge';
  testId?: string;
  /** the same as testId, written the way a page (and a source-reading test) spells it */
  'data-testid'?: string;
  prefetch?: boolean;
}) {
  const testId = dataTestId ?? testIdProp;
  const press = () => { pressFeedback('tap'); onClick?.(); };
  const cls = `${PILL} ${docked ? 'w-full max-w-md md:w-auto' : ''}`;
  const style = { background: 'linear-gradient(180deg, #4df0ff 0%, var(--fel-accent) 55%, #00c8e0 100%)' };
  const inner = <>{icon}{children}</>;
  const el = href
    ? <Link href={href} prefetch={prefetch} onClick={press} data-testid={testId} data-fel-primary className={cls} style={style}>{inner}</Link>
    : <button type="button" onClick={press} data-testid={testId} data-fel-primary className={cls} style={style}>{inner}</button>;
  if (!docked) return el;
  const bottom = above === 'tabbar' ? 'bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))]' : 'bottom-[calc(1rem+env(safe-area-inset-bottom,0px))]';
  return (
    <div data-fel-dock className={`fixed inset-x-0 ${bottom} z-40 flex justify-center px-4 md:static md:inset-auto md:z-auto md:block md:px-0`}>
      {el}
    </div>
  );
}
