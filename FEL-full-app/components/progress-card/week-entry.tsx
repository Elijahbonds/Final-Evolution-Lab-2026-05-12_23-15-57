// The weekly door to the progress card (value round item 1): the week's dates and one line, on Train beside the Today
// card. It reads nothing (the card page does its own read), so it costs the page no query and no script.
import Link from 'next/link';
import { TrendingUp } from 'lucide-react';
import { weekLabel, windowAt } from '@/lib/progress-card/summary';

export const WEEK_CARD_HREF = '/profile/week';

export function WeekCardEntry({ now = new Date() }: { now?: Date }) {
  return (
    <Link
      href={WEEK_CARD_HREF}
      data-testid="week-card-entry"
      className="mb-6 flex items-center gap-4 rounded-2xl border border-fel-cyan/25 bg-fel-cyan/[0.05] p-4 transition-colors hover:bg-fel-cyan/[0.1] sm:p-5"
    >
      <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-fel-cyan/15">
        <TrendingUp className="h-5 w-5 text-fel-cyan" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[11px] uppercase tracking-[0.14em] text-fel-dim">Your week · {weekLabel({ window: windowAt(now) })}</span>
        <span className="fel-heading mt-1 block text-[16px] font-bold leading-tight text-white">What moved this week</span>
        <span className="mt-1 block text-[13px] text-white/55">Your numbers against last week, and a card to share.</span>
      </span>
      <span className="shrink-0 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-fel-cyan">See it →</span>
    </Link>
  );
}
