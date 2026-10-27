'use client';

// TODAY-DRILL (2026-10-27): today's drill while it runs, and after. Drawn into the drills page's camera screen
// (DrillLive's renderRunning / renderResult slots): the space check, the grown-up step, the camera-off pause and every
// camera rule stay DrillLive's and lib/drills/liveDrill.ts's. This file only says what is happening, plainly:
//   running   which step of how many, a big step name, the rep (or the time) the chart is on, ONE cue, the rest and
//             what's next — and Pause, Stop and "This hurts: stop" always on screen.
//   result    what we saw / what it means / what's next, the claim (credits and streak, as the claim route pays them).
//   hurt      the existing pain check-in (components/coach/pain-checkin.tsx → POST /api/health/pain → painRule), opened.
import Link from 'next/link';
import { CheckCircle2, Pause, Square, AlertTriangle } from 'lucide-react';
import { SelfView } from '@/components/games/body-play';
import { BreathPacer } from '@/components/breath/Pacer';
import { PainCheckInChip } from '@/components/coach/pain-checkin';
import { RESULT_ESTIMATE_LINE, STEP_BACK_LINE, STEP_IN_LINE, type DrillResultSlot, type DrillRunningSlot } from '@/app/play/drills/_components/drill-live';
import {
  HURT_LABEL, HURT_LINE, HURT_SKIP_LINE, HURT_TITLE, LAST_STEP_LINE, NEXT_PREFIX, PAUSE_LABEL, REST_TITLE, START_AGAIN_LABEL, STOP_LABEL,
  readResult, runStep,
} from '@/lib/daily-drill/guide';
import { CLAIM_FAILED_LINE, KEPT_LINE, doneLine } from '@/lib/daily-drill/copy';
import type { PhaseRef } from '@/lib/daily-drill/compose';

export type Claim = { state: 'idle' } | { state: 'sending' } | { state: 'done'; amount: number; streakDays: number | null } | { state: 'failed' };

const clock = (sec: number) => { const s = Math.max(0, Math.ceil(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function DrillRunning({ slot, drillId, onHurt }: { slot: DrillRunningSlot; drillId: string; onHurt: () => void }) {
  const { view, drill } = slot;
  const run = view.run;
  const step = run ? runStep(drillId, drill.phases, run.phaseIndex, run.phaseSec, run.line) : null;
  const phase = run?.phase ?? null;
  const total = drill.phases.reduce((s, p) => s + p.durationSec, 0);
  const left = phase && run ? phase.durationSec - run.phaseSec : null;
  const wait = run?.status === 'positioning' ? STEP_IN_LINE : run?.status === 'paused' ? STEP_BACK_LINE : null;
  const cue = view.caption ?? step?.cue ?? null;
  return (
    <section className="space-y-3 pb-24" data-drill-running={run?.status ?? 'starting'} data-daily-run={step ? `${step.index}/${step.count}` : 'starting'}>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3 font-mono text-[12px] uppercase tracking-[0.12em] text-white/55">
          <span data-daily-step-of>{step ? `Step ${step.index} of ${step.count}` : 'Starting'}</span>
          {left !== null && <span className="tabular-nums">{clock(left)} left</span>}
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10" aria-hidden>
          <div className="h-full rounded-full bg-[#00FF9D]" style={{ width: `${Math.min(100, ((run?.drillSec ?? 0) / Math.max(1, total)) * 100)}%` }} />
        </div>
      </div>

      {step?.rest ? (
        <div className="rounded-2xl border border-[#00E5FF]/30 bg-[#00E5FF]/[0.06] p-5 text-center" data-daily-rest>
          <p className="text-4xl font-black text-white">{REST_TITLE}</p>
          <p className="mt-1 font-mono text-5xl font-black tabular-nums text-[#00E5FF]" aria-live="polite">{left !== null ? clock(left) : ''}</p>
          <p className="mt-2 text-[16px] text-white/75">{step.cue}</p>
        </div>
      ) : (
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-[32px] font-black leading-[1.05] text-white" data-daily-step-name>{step?.name ?? drill.name}</h2>
          {step?.rep && (
            <p className="shrink-0 text-right" data-daily-rep={`${step.rep.at}/${step.rep.of}`}>
              <span className="block font-mono text-[40px] font-black leading-none tabular-nums text-[#00FF9D]">{step.rep.at}</span>
              <span className="text-[12px] text-white/55">of {step.rep.of}</span>
            </p>
          )}
        </div>
      )}

      <div className="relative">
        <SelfView className="w-full" />
        {view.flash && (
          <div className="pointer-events-none absolute right-3 top-3 rounded-lg bg-black/70 px-3 py-1 text-lg font-black"
            style={{ color: view.flash.label === 'MISS' ? '#FF6B6B' : view.flash.label === 'GOOD' ? '#FFD700' : '#00FF9D' }} data-drill-flash={view.flash.label}>
            {view.flash.label === 'MISS' ? 'Missed' : 'Nice'}
          </div>
        )}
        {wait && <div className="absolute inset-x-3 bottom-3 rounded-xl bg-black/80 px-3 py-2 text-center text-lg font-black text-white" aria-live="polite">{wait}</div>}
      </div>

      {!step?.rest && cue && <p className="text-[22px] font-black leading-snug text-white" aria-live="polite" data-daily-cue>{cue}</p>}
      {phase?.pacer && run && <BreathPacer spec={{ ...phase.pacer, restSec: 0 }} elapsedSec={run.phaseSec} size="md" id="daily-drill" />}
      <p className="text-[15px] text-white/60" data-daily-next>{step?.next ? `${NEXT_PREFIX} ${step.next}` : LAST_STEP_LINE}</p>

      {/* always on screen: pause, stop, and the pain stop (the existing pain check-in) */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#050505]/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3" data-daily-controls>
        <div className="mx-auto flex max-w-3xl gap-2">
          <button type="button" onClick={slot.pause} data-daily-pause className="flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/25 text-[15px] font-bold text-white">
            <Pause aria-hidden className="h-4 w-4" /> {PAUSE_LABEL}
          </button>
          <button type="button" onClick={slot.end} data-daily-stop className="flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/25 text-[15px] font-bold text-white">
            <Square aria-hidden className="h-4 w-4" /> {STOP_LABEL}
          </button>
          <button type="button" onClick={onHurt} data-daily-hurt className="flex min-h-[48px] flex-[1.4] items-center justify-center gap-1.5 rounded-xl bg-[#FFB020] px-2 text-[15px] font-black text-black">
            <AlertTriangle aria-hidden className="h-4 w-4" /> {HURT_LABEL}
          </button>
        </div>
      </div>
    </section>
  );
}

export function ClaimLine({ claim }: { claim: Claim }) {
  if (claim.state === 'done') {
    return (
      <p className="flex items-start gap-2 rounded-xl border border-[#00FF9D]/35 bg-[#00FF9D]/[0.07] px-3 py-2.5 text-[15px] text-white" data-daily-claim="done">
        <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[#00FF9D]" />
        <span>{doneLine(claim.amount, claim.streakDays)}</span>
      </p>
    );
  }
  if (claim.state === 'failed') return <p className="rounded-xl border border-amber-300/30 px-3 py-2 text-[14px] text-amber-100/90" data-daily-claim="failed">{CLAIM_FAILED_LINE}</p>;
  if (claim.state === 'sending') return <p className="text-[14px] text-white/60" data-daily-claim="sending">Saving that you finished…</p>;
  return null;
}

export function DrillResultView({ slot, drillId, refs, tomorrow, claim }: { slot: DrillResultSlot; drillId: string; refs: readonly PhaseRef[]; tomorrow: string; claim: Claim }) {
  const read = readResult(drillId, slot.result, refs, tomorrow);
  const done = slot.result.status === 'complete';
  const row = (label: string, text: string, key: string) => (
    <div className="rounded-xl bg-white/[0.04] px-4 py-3" data-daily-read={key}>
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#00E5FF]">{label}</p>
      <p className="mt-1 text-[16px] leading-snug text-white">{text}</p>
    </div>
  );
  return (
    <section className="space-y-3" data-daily-result={slot.result.status} data-drill-result={slot.result.status}>
      <h2 className="text-[28px] font-black text-white">{read.title}</h2>
      {done && <ClaimLine claim={claim} />}
      {row('What we saw', read.saw, 'saw')}
      {row('What it means', read.means, 'means')}
      {row('What’s next', read.next, 'next')}
      <p className="text-[12px] text-white/50">{RESULT_ESTIMATE_LINE}</p>
      <p className="text-[12px] text-white/50" data-drill-kept>{KEPT_LINE}</p>
      <div className="flex flex-col gap-2 pt-1">
        <Link href="/train" className="flex min-h-[48px] items-center justify-center rounded-2xl bg-[#00FF9D] text-[16px] font-black text-black" data-daily-back>Back to Train</Link>
        <button type="button" onClick={slot.again} className="min-h-[44px] rounded-2xl border border-white/20 text-[15px] font-bold text-white/80">{START_AGAIN_LABEL}</button>
      </div>
    </section>
  );
}

export function HurtPanel({ drillName }: { drillName: string }) {
  return (
    <section className="space-y-3 rounded-2xl border border-[#FFB020]/40 bg-[#FFB020]/[0.06] p-5" data-daily-hurt-panel>
      <h2 className="text-[26px] font-black text-white">{HURT_TITLE}</h2>
      <p className="text-[16px] leading-snug text-white/85">{HURT_LINE}</p>
      <PainCheckInChip exerciseName={drillName} kind="during" initiallyOpen />
      <p className="text-[13px] text-white/55">{HURT_SKIP_LINE}</p>
      <Link href="/train" className="inline-flex min-h-[44px] items-center text-[15px] font-bold text-[#00E5FF]">Back to Train</Link>
    </section>
  );
}
