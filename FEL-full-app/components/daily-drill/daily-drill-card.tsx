// DAILY-DRILL (value round item 3, 2026-10-24): today's drill on Train — one card, for every account. The view is
// lib/daily-drill/load.ts loadDailyDrill (the page awaits it with its other reads; a failed read renders nothing). It
// shows the drill, why it was picked (the number, said as the player knows it), what finishing pays, and, with no number
// yet, the one step that would give the pick one. Server-rendered: no script of its own.
import Link from 'next/link';
import { Target, CheckCircle2 } from 'lucide-react';
import type { DailyDrillView } from '@/lib/daily-drill/load';
import {
  DAILY_DRILL_PATH, DAILY_EYEBROW, DONE_TITLE, START_CTA, STOPPED_LINE, doneLine, rewardLine,
} from '@/lib/daily-drill/copy';

export function DailyDrillCard({ view }: { view: DailyDrillView | null }) {
  if (!view) return null;
  const { plan, done } = view;
  if (!plan) {
    return (
      <section data-testid="daily-drill-card" data-daily-drill="stopped" className="mb-6 rounded-2xl border border-amber-300/25 bg-amber-300/[0.04] p-4 sm:p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">{DAILY_EYEBROW}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-amber-100/90">{STOPPED_LINE}</p>
      </section>
    );
  }
  return (
    <section
      data-testid="daily-drill-card"
      data-daily-drill={done ? 'done' : 'open'}
      data-daily-focus={view.focus}
      className="mb-6 rounded-2xl border border-[#00FF9D]/30 bg-[#00FF9D]/[0.06] p-4 sm:p-5"
    >
      <div className="flex items-start gap-4">
        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#00FF9D]/15">
          {done ? <CheckCircle2 className="h-5 w-5 text-[#00FF9D]" /> : <Target className="h-5 w-5 text-[#00FF9D]" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">{DAILY_EYEBROW} · {plan.minutes} min</p>
          <p className="fel-heading mt-1 text-[16px] font-bold leading-tight text-white">{done ? `${DONE_TITLE}: ${plan.name}` : plan.name}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-white/60" data-daily-why>{view.why}</p>
          <p className="mt-1.5 text-[12.5px] text-white/50" data-daily-reward>
            {done ? doneLine(done.amount, done.streakDays) : rewardLine(view.credit, view.streak.opensToday, view.streak.nextDays)}
          </p>
          {view.nudge && (
            <p className="mt-2 text-[12.5px] text-white/55" data-daily-nudge>
              {view.nudge.text}{' '}
              <Link href={view.nudge.href} className="font-bold text-[#00E5FF] underline-offset-2 hover:underline">{view.nudge.cta}</Link>
            </p>
          )}
        </div>
      </div>
      {!done && (
        <Link
          href={DAILY_DRILL_PATH}
          data-daily-start
          className="mt-3 flex min-h-[44px] items-center justify-center rounded-xl bg-[#00FF9D] px-4 text-sm font-black text-black transition-opacity hover:opacity-90"
        >
          {START_CTA} →
        </Link>
      )}
    </section>
  );
}
