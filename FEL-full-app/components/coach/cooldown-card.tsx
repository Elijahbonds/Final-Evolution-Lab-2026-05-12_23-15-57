'use client';
// Today's automatic cool-down (MIRROR-COACH P6, 2026-09-29).
//
// WHAT WAS WRONG. A coached session ended at its last working set: Today (P2) rendered only the sections a coach filled,
// and almost nobody fills Cool-down, so the owner's recovery breath (Neuro-Mechanic Playbook ch9) never reached a
// session (crossref: "nowhere does a session end by offering the 4-6 recovery breath"). This card is that cool-down,
// after the last item: the breath first, then a rock-and-hold stretch for each pattern the session trained, 3–5
// minutes (lib/coach/cooldown.ts generateCooldown, where every rule lives — this file renders the plan and runs its
// clock), and a "done" tap that records it on the coached session (POST /api/coach/me/cooldown).
//
// A COACH'S OWN COOL-DOWN ALWAYS WINS: a session with any Cool-down item renders nothing here, and so does an off day
// (its own Cool-down section is the breath and the stretches) — cooldown.ts needsAutoCooldown.
//
// THE RUN. "Start" walks the plan with a clock: the breath's in / out / pause with seconds left, then each stretch's
// rock and hold rounds. The clock arithmetic is the warm-up's (lib/coach/warmup.ts GuidedRun) and cooldown.ts's
// cooldownAt; this file owns only requestAnimationFrame.
//
// DATA. Nothing is sent until the done tap, and that sends two ids (program, session). Nothing here is scored, paid
// or streaked now; P9 counts done cool-downs toward PRQ recovery (owner decision #12), which is why the card does not
// promise "not scored".
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Pause, Play, SkipForward, Square } from 'lucide-react';
import {
  BREATH_SOURCE_LINE, COOLDOWN_DONE_LINE, COOLDOWN_TITLE, cooldownAt, cooldownErrorText, cooldownMeaning, generateCooldown, needsAutoCooldown,
  nextCooldownStep, type BreathPhase, type CooldownItemLike, type CooldownPlan, type CooldownStep,
} from '@/lib/coach/cooldown';
import { guidedElapsed, pauseGuided, resumeGuided, startGuided, type GuidedRun } from '@/lib/coach/warmup';
import { SESSION_SECTIONS } from '@/lib/coach/taxonomy';
import { formatClock } from '@/lib/coach/setTimer';

const COOLDOWN = SESSION_SECTIONS.find((s) => s.id === 'cooldown')!;
const KIND_LABEL: Record<CooldownStep['kind'], string> = { breath: 'Breath', rock_hold: 'Stretch' };
export const BREATH_WORD: Record<BreathPhase, string> = { in: 'Breathe in', hold: 'Hold', out: 'Breathe out', rest: 'Pause' };
export const DONE_BUTTON = 'I did the cool-down';

export interface CooldownCardProps {
  /** Today's session (TodayExercise[] fits). */
  exercises: readonly CooldownItemLike[];
  /** The session's kind: an off day ('recovery') gets no automatic cool-down. */
  kind?: string | null;
  programId: string;
  sessionId: string;
  /** POST /api/coach/me/cooldown, or null (a harness): then the done tap is only remembered on screen. */
  endpoint: string | null;
  /** Already tapped done (Today's payload says so for the open session). */
  done?: boolean;
  /** Called once the done tap is recorded. */
  onDone?: () => void;
  /** A line above the card (Today's "Session done — cool down now" after the Done button). */
  lead?: string | null;
}

/** The plan the card shows — exported so a test reads exactly what is drawn. */
export const cooldownPlanFor = (exercises: readonly CooldownItemLike[]): CooldownPlan => generateCooldown(exercises);

export function CooldownCard({ exercises, kind = null, programId, sessionId, endpoint, done: doneProp = false, onDone, lead = null }: CooldownCardProps) {
  const plan = useMemo(() => cooldownPlanFor(exercises), [exercises]);
  const [run, setRun] = useState<GuidedRun | null>(null);
  const [now, setNow] = useState(0);
  const [done, setDone] = useState(doneProp);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (doneProp) setDone(true); }, [doneProp]);

  const at = run ? cooldownAt(plan, guidedElapsed(run, run.pausedAt ?? now)) : null;

  // the clock: one frame loop while a run is live, stopping itself at the end (no side effect inside a state updater)
  useEffect(() => {
    if (!run || run.pausedAt !== null) return;
    let raf = 0;
    const frame = () => {
      const t = performance.now();
      setNow(t);
      if (cooldownAt(plan, guidedElapsed(run, t)).done) return;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [run, plan]);

  const start = useCallback(() => { const t = performance.now(); setNow(t); setRun(startGuided(t)); }, []);
  const togglePause = () => { if (!run) return; const t = performance.now(); setNow(t); setRun(run.pausedAt === null ? pauseGuided(run, t) : resumeGuided(run, t)); };
  const next = () => { if (!run) return; const t = performance.now(); setNow(t); setRun(nextCooldownStep(plan, run, t)); };

  const tapDone = async () => {
    if (done || busy) return;
    setError(null);
    if (!endpoint) { setDone(true); onDone?.(); return; }
    setBusy(true);
    try {
      const r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ programId, sessionId }) });
      const j = await r.json().catch(() => ({})) as { error?: string };
      if (!r.ok) { setError(cooldownErrorText(j.error)); return; }
      setDone(true); setRun(null); onDone?.();
    } catch {
      setError(cooldownErrorText(null));
    } finally { setBusy(false); }
  };

  if (!needsAutoCooldown(exercises, kind)) return null;

  return (
    <section className="space-y-2" data-section="cooldown" data-cooldown aria-label={COOLDOWN.label}>
      <div className="px-1">
        {lead && <div className="text-sm font-medium text-white" data-cooldown-lead>{lead}</div>}
        <div className="text-[11px] uppercase tracking-wider text-white/50">{COOLDOWN.label}</div>
        <div className="text-[11px] text-white/35">{COOLDOWN.meaning}</div>
      </div>
      <div className="fel-card rounded-xl p-4 space-y-3" data-testid="cooldown">
        <div className="min-w-0">
          <div className="text-white font-medium" data-cooldown-title>{COOLDOWN_TITLE} · {plan.minutes} min</div>
          <div className="text-[11px] text-white/45">{cooldownMeaning(plan.minutes)}</div>
        </div>

        <ul className="space-y-1" data-cooldown-notes>
          {plan.notes.map((n) => <li key={n.id} data-note={n.id} className="text-xs text-white/65">{n.text}</li>)}
        </ul>

        {at && !at.done && at.step ? (
          <RunPanel plan={plan} at={at} paused={!!run && run.pausedAt !== null} onPause={togglePause} onNext={next} onStop={() => setRun(null)} />
        ) : at?.done && !done ? (
          <div className="rounded-lg border border-[#00E5FF]/30 bg-[#00E5FF]/5 p-3 text-sm text-white/85" data-cooldown-finished>
            That&apos;s the cool-down. Tap below to log it.
          </div>
        ) : null}

        <ol className="space-y-2" data-cooldown-steps>
          {plan.steps.map((s, i) => (
            <li key={`${s.kind}-${s.id}`} data-step={s.id} data-kind={s.kind} data-pattern={s.pattern ?? undefined}
              className={`rounded-lg border px-3 py-2 ${at && !at.done && at.index === i ? 'border-[#00E5FF]/50 bg-[#00E5FF]/5' : 'border-white/8 bg-white/[0.02]'}`}>
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <span className="mr-1.5 rounded bg-white/10 px-1 text-[10px] font-semibold uppercase tracking-wide text-white/60">{KIND_LABEL[s.kind]}</span>
                  <span className="text-sm text-white">{s.name}</span>
                </div>
                <span className="shrink-0 font-mono text-xs tabular-nums text-white/50">{formatClock(s.seconds)}</span>
              </div>
              <div className="text-[11px] text-white/45">{s.dose}</div>
              <div className="text-xs text-white/75">{s.cue}</div>
            </li>
          ))}
        </ol>
        <div className="text-[11px] text-white/30">{BREATH_SOURCE_LINE}</div>

        {done ? (
          <div className="flex items-center gap-1.5 text-sm text-[#7BD389]" data-cooldown-done role="status">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {COOLDOWN_DONE_LINE}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {!run && (
              <button type="button" onClick={start} data-cooldown-start
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/85">
                <Play className="h-4 w-4" aria-hidden="true" /> Start the cool-down
              </button>
            )}
            <button type="button" onClick={() => void tapDone()} disabled={busy} data-cooldown-done-tap
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#00E5FF]/15 border border-[#00E5FF]/40 px-3 py-2 text-sm font-medium text-[#00E5FF] disabled:opacity-50">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {DONE_BUTTON}
            </button>
          </div>
        )}
        {error && <div className="text-xs text-[#FF3366]" role="alert" data-cooldown-error>{error}</div>}
      </div>
    </section>
  );
}

/** The step being run: its name, the clock, the line to read now, the breath, and the controls. */
function RunPanel({ plan, at, paused, onPause, onNext, onStop }: {
  plan: CooldownPlan; at: ReturnType<typeof cooldownAt>; paused: boolean; onPause: () => void; onNext: () => void; onStop: () => void;
}) {
  const s = at.step!;
  const fraction = s.seconds ? Math.min(1, at.stepSec / s.seconds) : 1;
  return (
    <div className="rounded-lg border border-[#00E5FF]/30 bg-black/30 p-3 space-y-2" data-cooldown-run data-run-step={s.id}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-white/40">{KIND_LABEL[s.kind]} · step {at.index + 1} of {plan.steps.length}{paused ? ' · paused' : ''}</div>
          <div className="text-white font-medium truncate">{s.name}</div>
        </div>
        <div className="font-mono text-2xl tabular-nums text-white" aria-live="off">{formatClock(at.remainingSec)}</div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[#00E5FF]" style={{ width: `${Math.round(fraction * 100)}%` }} /></div>
      <div className="text-sm text-white/85" aria-live="polite" data-run-line>{at.line}</div>
      {at.breath && <div className="text-sm font-medium text-[#00E5FF]" data-run-breath={at.breath.phase}>{BREATH_WORD[at.breath.phase]} · {at.breath.left} <span className="text-white/40">(breath {at.breath.round})</span></div>}
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={onPause} aria-label={paused ? 'Resume' : 'Pause'} className="rounded-md border border-white/10 p-1.5 text-white/70">{paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}</button>
        <button type="button" onClick={onNext} aria-label="Next step" className="rounded-md border border-white/10 p-1.5 text-white/70"><SkipForward className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={onStop} aria-label="Stop the cool-down" className="rounded-md border border-white/10 p-1.5 text-white/70"><Square className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}
