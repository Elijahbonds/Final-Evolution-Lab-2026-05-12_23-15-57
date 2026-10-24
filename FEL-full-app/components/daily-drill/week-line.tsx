// DAILY-DRILL × the progress card (value round items 3 and 1): one line under the week's card — how many of the last
// seven days had the daily drill done, and the door to today's. Server-rendered, no script; it is not on the share image
// (that is the card's own renderer, lib/progress-card/image.tsx), so nothing about it leaves the page.
import Link from 'next/link';
import { Target } from 'lucide-react';
import { DAILY_DRILL_PATH } from '@/lib/daily-drill/copy';

export function drillWeekText(days: number): string {
  return days <= 0 ? 'No daily drill in the last 7 days yet.' : `Daily drill done on ${days} of the last 7 days.`;
}

export function DrillWeekLine({ days }: { days: number | null }) {
  if (days === null) return null;
  return (
    <Link href={DAILY_DRILL_PATH} data-testid="drill-week-line" data-drill-days={days}
      className="mt-3 flex min-h-[44px] items-center gap-3 rounded-2xl border border-[#00FF9D]/20 bg-[#00FF9D]/[0.04] px-4 py-2.5 text-[13px] text-white/70 hover:bg-[#00FF9D]/[0.08]">
      <Target aria-hidden className="h-4 w-4 shrink-0 text-[#00FF9D]" />
      <span className="min-w-0 flex-1">{drillWeekText(days)}</span>
      <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#00FF9D]">Today&apos;s drill →</span>
    </Link>
  );
}
