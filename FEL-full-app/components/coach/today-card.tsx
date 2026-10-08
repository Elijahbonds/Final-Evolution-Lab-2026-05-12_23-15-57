// The Today card at the top of /play and /train (MIRROR-PROGRESS, plan Phase 4, 2026-10-07): a coached athlete's one-tap
// door to today's session. lib/coach/todayCard.ts todayCardFor decides whether there is one and what it says — the page
// awaits it with its other reads (a synchronous card keeps the page's tree renderable as it was) — and a null view (no
// active program, or a failed read) renders nothing.
import Link from 'next/link';
import { CalendarCheck } from 'lucide-react';
import { TODAY_HREF, todayCardLines, type TodayCardView } from '@/lib/coach/todayCard';

export function TodayCard({ view }: { view: TodayCardView | null }) {
  if (!view) return null;
  const l = todayCardLines(view);
  return (
    <Link
      href={TODAY_HREF}
      data-testid="today-card"
      data-today-card={view.kind}
      className="mb-6 flex items-center gap-4 rounded-2xl border border-[#00E5FF]/35 bg-[#00E5FF]/[0.07] p-4 transition-colors hover:bg-[#00E5FF]/[0.12] sm:p-5"
    >
      <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#00E5FF]/15">
        <CalendarCheck className="h-5 w-5 text-[#00E5FF]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">{l.eyebrow}</span>
        <span className="fel-heading mt-1 block text-[16px] font-bold leading-tight text-white">{l.title}</span>
        <span className="mt-1 block text-[13px] text-white/55">{l.line}</span>
      </span>
      <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#00E5FF]">{l.cta} →</span>
    </Link>
  );
}
