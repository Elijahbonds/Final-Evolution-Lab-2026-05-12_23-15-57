'use client';
// Today's Prep: the generated warm-up (MIRROR-COACH P6, 2026-09-29).
//
// WHAT WAS WRONG. A session whose coach wrote no Prep items started cold at the first working set: Today (P2) rendered
// only the sections the coach filled, and the owner's Pre-Game Wake-Up existed as a camera drill nothing mounted (lib/
// drills/drills.ts:88 WAKE_UP; no page imports DrillRunner — grep, 2026-09-29). This card is that Prep: the Wake-Up in
// its own order, a rock-and-hold stretch aimed at the athlete's weakest Movement Screen area, and a primer for today's
// main pattern, gated for youth and for a pain step-down (lib/coach/warmup.ts generateWarmup, where every rule lives —
// this file decides nothing, it renders the plan and runs its clock).
//
// A COACH'S OWN PREP ALWAYS WINS: if the session has any Prep item, this renders nothing and Today shows the coach's.
//
// THE RUN. "Start" walks the plan step by step with a clock: the Wake-Up's own timed lines, its breathing pacer, the
// stretch's rock/hold rounds, the primer's sets. Camera-free, because no page mounts the drill runner yet; when one does,
// WAKE_UP_CAMERA_HREF lights the "With the camera" link (the plan's Wake-Up goes to it as a Drill: wakeUpDrillFor).
//
// DATA. The server context (GET /api/coach/me/warmup: youth rules, the screen area, today's pain decision, the hard
// stop) is read once; today's readiness answer comes in as a prop and never goes into a URL. Nothing here is saved,
// scored, paid or streaked (owner decision #12).
//
// MIRROR-COACH P6 FIX (2026-09-29, code review): a run FREEZES its plan. The readiness card sits above this one and
// stays live during a run, and the plan was derived from its answer every render — answering 'low' 90 s into a 14-minute
// run swapped in the 18-minute plan (a third stretch, the launch cut to one round) and runnerAt mapped the 90 s already
// run onto a different step. Now Start takes the length and the readiness answer as they are, and a change to either
// applies to the next run (runInputs below).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, Pause, Play, SkipForward, Square } from 'lucide-react';
import {
  FALLBACK_WARMUP_CONTEXT, WAKE_UP_CAMERA_HREF, WAKE_UP_SOURCE_LINE, WARMUP_MEANING, WARMUP_MINUTES, WARMUP_TITLE,
  generateWarmup, guidedElapsed, heldBackLines, nextGuided, pauseGuided, patternWords, readWarmupContext, resumeGuided,
  runnerAt, sessionWarmupInputs, startGuided, suggestedMinutes,
  type GuidedRun, type SessionItemLike, type WarmupContext, type WarmupMinutes, type WarmupPlan, type WarmupReadiness, type WarmupStep,
} from '@/lib/coach/warmup';
import { SESSION_SECTIONS } from '@/lib/coach/taxonomy';
import { formatClock } from '@/lib/coach/setTimer';

const PREP = SESSION_SECTIONS.find((s) => s.id === 'prep')!;
const KIND_LABEL: Record<WarmupStep['kind'], string> = { wake_up: 'Wake-Up', rock_hold: 'Stretch', primer: 'Prime' };
const BREATH_WORD = { in: 'Breathe in', hold: 'Hold', out: 'Breathe out' } as const;

export interface WarmupPrepProps {
  /** Today's session (TodayExercise[] fits). */
  exercises: readonly SessionItemLike[];
  /** GET /api/coach/me/warmup, or null for none (the careful fallback: youth rules, no area, no pain reading). */
  contextUrl: string | null;
  /** Today's readiness answer (the readiness check-in). null / absent = skipped or not asked. */
  readiness?: WarmupReadiness | null;
  /** A context already in hand (tests, a harness): skips the fetch. */
  initialContext?: WarmupContext | null;
}

/** The plan for a context and a length — the card's one derivation, exported so a test reads what the card shows. */
export function planFor(exercises: readonly SessionItemLike[], ctx: WarmupContext, minutes: WarmupMinutes, readiness: WarmupReadiness | null): WarmupPlan {
  const s = sessionWarmupInputs(exercises);
  return generateWarmup({
    pattern: s.pattern, patternFrom: s.patternFrom, weakestZone: ctx.zone?.id ?? null, minutes, isYouth: ctx.isYouth,
    painDecision: ctx.painDecision, readiness, coachAssignedImpact: s.coachAssignedImpact, coachPrime: s.coachPrime, screen: ctx.screen,
    contextUnavailable: !!ctx.unavailable,
  });
}

/** The length and readiness a plan is built from: a live run's own (frozen at Start), else what the card shows now. */
export function planInputs(
  live: { minutes: WarmupMinutes; readiness: WarmupReadiness | null }, runInputs: { minutes: WarmupMinutes; readiness: WarmupReadiness | null } | null,
): { minutes: WarmupMinutes; readiness: WarmupReadiness | null } {
  return runInputs ?? live;
}

export function WarmupPrep({ exercises, contextUrl, readiness = null, initialContext = null }: WarmupPrepProps) {
  const inputs = useMemo(() => sessionWarmupInputs(exercises), [exercises]);
  const [ctx, setCtx] = useState<WarmupContext | null>(initialContext ?? (contextUrl ? null : FALLBACK_WARMUP_CONTEXT));
  const [picked, setPicked] = useState<WarmupMinutes | null>(null);
  const [run, setRun] = useState<GuidedRun | null>(null);
  // what the running plan was built from, frozen at Start (see the header's P6 fix); null when no run is live
  const [runInputs, setRunInputs] = useState<{ minutes: WarmupMinutes; readiness: WarmupReadiness | null } | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!contextUrl || initialContext || inputs.coachPrep) return;
    let live = true;
    fetch(contextUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (live) setCtx(readWarmupContext(j)); })
      .catch(() => { if (live) setCtx(FALLBACK_WARMUP_CONTEXT); });
    return () => { live = false; };
  }, [contextUrl, initialContext, inputs.coachPrep]);

  const use = planInputs({ minutes: picked ?? suggestedMinutes(readiness), readiness }, run ? runInputs : null);
  const minutes = use.minutes;
  const planReadiness = use.readiness;
  const plan = useMemo(() => (ctx ? planFor(exercises, ctx, minutes, planReadiness) : null), [exercises, ctx, minutes, planReadiness]);
  const at = plan && run ? runnerAt(plan, guidedElapsed(run, run.pausedAt ?? now)) : null;

  // the clock: one frame loop while a run is live, stopping itself at the end (no side effect inside a state updater)
  useEffect(() => {
    if (!run || run.pausedAt !== null || !plan) return;
    let raf = 0;
    const frame = () => {
      const t = performance.now();
      setNow(t);
      if (runnerAt(plan, guidedElapsed(run, t)).done) return;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [run, plan]);

  const start = useCallback(() => {
    const t = performance.now();
    setNow(t);
    setRunInputs({ minutes, readiness: planReadiness });
    setRun(startGuided(t));
  }, [minutes, planReadiness]);
  const togglePause = () => { if (!run) return; const t = performance.now(); setNow(t); setRun(run.pausedAt === null ? pauseGuided(run, t) : resumeGuided(run, t)); };
  const next = () => { if (!run || !plan) return; const t = performance.now(); setNow(t); setRun(nextGuided(plan, run, t)); };

  if (inputs.coachPrep) return null;                 // the coach's own Prep always wins
  if (ctx?.hardStopped) return null;                 // Today shows its hard-stop card instead

  const pattern = plan ? patternWords(plan.pattern) : null;
  return (
    <section className="space-y-2" data-section="prep" data-warmup aria-label={PREP.label}>
      <div className="px-1">
        <div className="text-[11px] uppercase tracking-wider text-white/50">{PREP.label}</div>
        <div className="text-[11px] text-white/35">{PREP.meaning}</div>
      </div>
      <div className="fel-card rounded-xl p-4 space-y-3" data-testid="warmup">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-white font-medium" data-warmup-title>
              {WARMUP_TITLE}{plan ? ` · ${Math.round(plan.totalSec / 60)} min` : ''}{pattern ? ` · for today's ${pattern}` : ''}
            </div>
            <div className="text-[11px] text-white/45">{WARMUP_MEANING}</div>
          </div>
          <div className="flex gap-1" role="group" aria-label="Warm-up length">
            {WARMUP_MINUTES.map((m) => (
              <button key={m} type="button" disabled={!!run && !at?.done} onClick={() => setPicked(m)} aria-pressed={m === minutes} data-minutes={m}
                className={`rounded-md border px-2 py-1 text-xs disabled:opacity-40 ${m === minutes ? 'border-[#00E5FF]/50 bg-[#00E5FF]/10 text-[#00E5FF]' : 'border-white/10 text-white/70'}`}>
                {m} min
              </button>
            ))}
          </div>
        </div>

        {!plan ? <div className="text-xs text-white/40" data-warmup-loading>Building today&apos;s warm-up…</div> : (
          <>
            {plan.notes.length > 0 && (
              <ul className="space-y-1" data-warmup-notes>
                {plan.notes.map((n) => <li key={n.id} data-note={n.id} className="text-xs text-white/65">{n.text}</li>)}
              </ul>
            )}

            {at && !at.done && at.step ? (
              <RunPanel plan={plan} at={at} paused={!!run && run.pausedAt !== null} onPause={togglePause} onNext={next} onStop={() => setRun(null)} />
            ) : at?.done ? (
              <div className="rounded-lg border border-[#00E5FF]/30 bg-[#00E5FF]/5 p-3 text-sm text-white/85" data-warmup-done>
                Warm-up done. On to the session.
                <button type="button" onClick={() => setRun(null)} className="ml-2 text-xs text-[#00E5FF]">Close</button>
              </div>
            ) : null}

            <ol className="space-y-2" data-warmup-steps>
              {plan.steps.map((s, i) => (
                <li key={`${s.kind}-${s.id}`} data-step={s.id} data-kind={s.kind} data-impact={s.impact ? 'true' : undefined}
                  className={`rounded-lg border px-3 py-2 ${at && !at.done && at.index === i ? 'border-[#00E5FF]/50 bg-[#00E5FF]/5' : 'border-white/8 bg-white/[0.02]'}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <span className="mr-1.5 rounded bg-white/10 px-1 text-[10px] font-semibold uppercase tracking-wide text-white/60">{KIND_LABEL[s.kind]}</span>
                      <span className="text-sm text-white">{s.name}</span>
                    </div>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-white/50">{formatClock(s.seconds)}</span>
                  </div>
                  {s.dose && <div className="text-[11px] text-white/45">{s.dose}</div>}
                  <div className="text-xs text-white/75">{s.cue}</div>
                </li>
              ))}
            </ol>

            {heldBackLines(plan).map((l) => <div key={l} className="text-[11px] text-white/40" data-held>{l}</div>)}
            <div className="text-[11px] text-white/30">{WAKE_UP_SOURCE_LINE}</div>

            {!run && plan.steps.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={start} data-warmup-start
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#00E5FF]/15 border border-[#00E5FF]/40 px-3 py-2 text-sm font-medium text-[#00E5FF]">
                  <Play className="h-4 w-4" aria-hidden="true" /> Start the warm-up
                </button>
                {WAKE_UP_CAMERA_HREF && (
                  <a href={WAKE_UP_CAMERA_HREF} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/80" data-warmup-camera>
                    <Camera className="h-4 w-4" aria-hidden="true" /> The Wake-Up with the camera
                  </a>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/** The step being run: its name, the clock, the line to read now, the breath, and the controls. */
function RunPanel({ plan, at, paused, onPause, onNext, onStop }: {
  plan: WarmupPlan; at: ReturnType<typeof runnerAt>; paused: boolean; onPause: () => void; onNext: () => void; onStop: () => void;
}) {
  const s = at.step!;
  const fraction = s.seconds ? Math.min(1, at.stepSec / s.seconds) : 1;
  return (
    <div className="rounded-lg border border-[#00E5FF]/30 bg-black/30 p-3 space-y-2" data-warmup-run data-run-step={s.id}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-white/40">{KIND_LABEL[s.kind]} · step {at.index + 1} of {plan.steps.length}{paused ? ' · paused' : ''}</div>
          <div className="text-white font-medium truncate">{s.name}</div>
        </div>
        <div className="font-mono text-2xl tabular-nums text-white" aria-live="off">{formatClock(at.remainingSec)}</div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[#00E5FF]" style={{ width: `${Math.round(fraction * 100)}%` }} /></div>
      <div className="text-sm text-white/85" aria-live="polite" data-run-line>{at.line}</div>
      {at.breath && <div className="text-sm font-medium text-[#00E5FF]" data-run-breath>{BREATH_WORD[at.breath.phase]} · {at.breath.left}</div>}
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={onPause} aria-label={paused ? 'Resume' : 'Pause'} className="rounded-md border border-white/10 p-1.5 text-white/70">{paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}</button>
        <button type="button" onClick={onNext} aria-label="Next step" className="rounded-md border border-white/10 p-1.5 text-white/70"><SkipForward className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={onStop} aria-label="Stop the warm-up" className="rounded-md border border-white/10 p-1.5 text-white/70"><Square className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}
