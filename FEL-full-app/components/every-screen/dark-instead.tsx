// DarkInstead — EVERY-SCREEN P1 (2026-11-10). The plan's phase-1 gate: "every switched-off feature says why and what to
// do instead" (docs/PLAN-EVERY-SCREEN-10PHASE.md). Several training and coaching screens said why and stopped there: the
// only way on was the tab bar. This is the "instead": one or two links, under the screen's own notice, to things that
// work today. It adds no claim and no date; the notice above it keeps its own words.
import Link from 'next/link';
import { TYPE } from '@/lib/design/type';

export interface InsteadLink { href: string; label: string }

export function DarkInstead({ links }: { links: readonly InsteadLink[] }) {
  if (!links.length) return null;
  return (
    <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1" data-dark-instead>
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={`${TYPE.small} inline-flex min-h-11 items-center font-semibold text-fel-cyan underline-offset-2 hover:underline`}>{l.label} →</Link>
      ))}
    </p>
  );
}
