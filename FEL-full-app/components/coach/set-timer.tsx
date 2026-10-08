'use client';
// The Today card's timer strip (MIRROR-COACH P2, 2026-09-25): Work / Hold / Rest buttons for whatever the prescription
// times, a clock with a progress bar, pause and stop. A finished — or stopped — WORK run hands its seconds to the card,
// which writes them into the next set row, so a timed set is logged by timing it. The arithmetic (what a run reads at
// an instant, when the 3-2-1 ticks fall, what a stopped run logs) is lib/coach/setTimer.ts and tested there; this file
// owns only requestAnimationFrame and two FEL sine blips (Web Audio, generated here, no sample file).
//
// MIRROR-COACH P7 (2026-09-29): THE SETTLE CHIP. A rest was a clock and nothing else; the between-set breath preset
// (lib/breath/presets.ts BETWEEN_SET_SETTLE — in for 3, out for 6, a short pause, up to four breaths) now rides on it.
// Every rest long enough to hold two breaths and the set-up time shows "Settle · 40 s": a tap starts the rest (if it is
// not running) and the settle inside it, drawn by the one pacer (components/breath/Pacer.tsx) ON THE REST'S CLOCK — so
// pausing the rest pauses the breath, and stopping the rest ends it. Started partway through a rest it keeps only the
// whole breaths that fit before the last 15 s (settleFor); too little left and the chip is disabled. It lives on the REST
// timer only: it never runs during a set — while a Work or Hold timer is running the chip is disabled (settleChipFor;
// before the P7 review a tap there swapped the set's timer for the rest and its worked seconds were never logged).
// Youth-safe (an easy breath, no hold). Not scored, paid, streaked or saved.
//
// MIRROR-COACH P7 FIX (2026-09-29, review), four things the strip now does:
//   · IT SAYS WHEN A RUN STARTS AND ENDS (`onRunChange`). The key set's Dial-Up Breath (components/coach/ramp-breath.tsx)
//     hid itself only when a set row had something TYPED in it, and the server's set_started gate sees only SAVED sets —
//     so after an untyped set 1 with the rest timer running, and during a running Work or Hold timer on a timed key set,
//     the "dial up before this set" offer was still live (a Work run writes its seconds only when it stops; a Hold or
//     Rest run writes nothing). Today's card now treats any timer started on the key set's card as the set being under
//     way (app/coach/_components/today-view.tsx ExerciseCard).
//   · ONE BREATH AT A TIME (`settleBlocked`): while the Dial-Up Breath runs on the same card, the Settle chip stays in
//     place, disabled, and says why (lib/breath/presets.ts settleChip `otherBreath`) — the two rings used to be able to
//     run side by side with opposite instructions.
//   · A TIMED BREATH ITEM GETS THE RING (`breath`): the off day's 4-6 Recovery Breath is a Work run of 180 s; its ring
//     now runs on that run's clock (WorkBreath below; lib/breath/presets.ts workBreathFor has what was measured).
//   · THE SETTLE ENDS WHEN IT ENDS (settleShowing): the chip used to read "Stop settle", pressed, for the rest of the
//     rest after the last breath out (on a 90 s rest, from 40 s to 90 s). It now shows a short "Breathe normally" tail
//     and then goes back to its live or too-short state.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, Square, Timer, Volume2, VolumeX, Wind } from 'lucide-react';
import {
  CUE_TONES, cueBetween, formatClock, pauseRun, resumeRun, runElapsedMs, runView, secondsWorked, startRun, type TimerKind, type TimerRun, type TimerSpec,
} from '@/lib/coach/setTimer';
import { BETWEEN_SET_SETTLE, POST_SESSION_BREATH, SETTLE_WHY_LINE, settleChip, type SettleChip } from '@/lib/breath/presets';
import { pacerEndSec, type PacerSpec } from '@/lib/breath/pacer';
import { BreathPacer } from '@/components/breath/Pacer';

const SOUND_KEY = 'fel.timerSound';
const readSound = (): boolean => { try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; } };
const writeSound = (on: boolean) => { try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* storage blocked: the switch still works this visit */ } };

/**
 * The Settle chip for this strip at `now` (MIRROR-COACH P7): the rest this item prescribes, how far into a LIVE rest run
 * the clock is (null when none is), and whether a SET's timer (work or hold) is running — paused counts, done does not.
 * Pure, so set-timer-settle.test.tsx holds the "never during a set" rule without a frame loop.
 */
export function settleChipFor(timers: readonly TimerSpec[], run: TimerRun | null, now: number, otherBreath = false): SettleChip & { restLive: number | null } {
  const rest = timers.find((t) => t.kind === 'rest') ?? null;
  const view = run ? runView(run, run.pausedAt ?? now) : null;
  const restLive = run?.kind === 'rest' && view && !view.done ? view.elapsed : null;
  const setLive = !!run && run.kind !== 'rest' && !!view && !view.done;
  return { ...settleChip(rest?.seconds ?? null, restLive, setLive, otherBreath), restLive };
}

/** Seconds of "Breathe normally" the settle panel keeps after its last breath out, before the chip lets go. */
export const SETTLE_TAIL_SEC = 2;

/**
 * Whether the settle that was started is still ON at `restLive` seconds into its rest (MIRROR-COACH P7 FIX): from its
 * start to its last breath out plus a short SETTLE_TAIL_SEC tail. After that the chip is no longer "Stop settle" and
 * the panel goes; a rest that has ended (restLive null) takes it with it.
 */
export function settleShowing(settle: PacerSpec | null, restLive: number | null): boolean {
  return !!settle && restLive !== null && restLive < pacerEndSec(settle) + SETTLE_TAIL_SEC;
}

/** The kind of run that is live at `now` (not done; paused counts), or null. What `onRunChange` reports. */
export function liveRunKind(run: TimerRun | null, now: number): TimerKind | null {
  if (!run) return null;
  return runView(run, run.pausedAt ?? now).done ? null : run.kind;
}

/**
 * The breath ring a WORK run draws (MIRROR-COACH P7 FIX): the item's own breath spec (TodayExercise.breath) on that
 * run's clock while it is live — paused, the clock and the ring hold together. null for any other run, or none.
 */
export function workBreathAt(breath: PacerSpec | null | undefined, run: TimerRun | null, now: number): { spec: PacerSpec; sec: number } | null {
  if (!breath || !run || run.kind !== 'work') return null;
  const v = runView(run, run.pausedAt ?? now);
  return v.done ? null : { spec: breath, sec: v.elapsed };
}

/** The ring on a timed breath item's Work run, with the preset's name and how-to. Presentational. */
export function WorkBreath({ spec, sec }: { spec: PacerSpec; sec: number }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-[#00E5FF]/20 bg-[#00E5FF]/5 p-2" data-work-breath>
      <BreathPacer id="work-breath" spec={spec} elapsedSec={sec} size="sm" liveCaption />
      <div className="min-w-0 space-y-0.5">
        <div className="text-xs font-medium text-white">{POST_SESSION_BREATH.name}</div>
        <div className="text-[11px] text-white/60">{POST_SESSION_BREATH.cue}</div>
      </div>
    </div>
  );
}

type AudioCtor = typeof AudioContext;
function blip(ctx: AudioContext | null, tone: { hz: number; ms: number; gain: number }) {
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = tone.hz;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(tone.gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + tone.ms / 1000);
    osc.connect(g).connect(ctx.destination);
    osc.start(t); osc.stop(t + tone.ms / 1000 + 0.02);
  } catch { /* an audio device that refuses a node: the clock still runs */ }
}

export interface SetTimerProps {
  timers: readonly TimerSpec[];
  onWorkLogged?: (seconds: number) => void;
  testId?: string;
  /** A run started (its kind) or ended — stopped, or ran out (null). MIRROR-COACH P7 FIX: Today's key-set card closes
   *  the Dial-Up offer the moment any of its timers starts. */
  onRunChange?: (kind: TimerKind | null) => void;
  /** Another breath (the Dial-Up Breath) is running on this card: the Settle chip stays in place, disabled. */
  settleBlocked?: boolean;
  /** This item IS a breath (TodayExercise.breath): its ring runs on the Work run's clock. */
  breath?: PacerSpec | null;
}

export function SetTimer({ timers, onWorkLogged, testId, onRunChange, settleBlocked = false, breath = null }: SetTimerProps) {
  const [run, setRun] = useState<TimerRun | null>(null);
  const runChange = useRef(onRunChange);
  runChange.current = onRunChange;
  const [now, setNow] = useState(0);
  // the settle breath riding the current rest run (its `from` is seconds into that rest), or null
  const [settle, setSettle] = useState<PacerSpec | null>(null);
  const [sound, setSound] = useState(true);
  const ctx = useRef<AudioContext | null>(null);
  const last = useRef(0);
  const logged = useRef(false);
  useEffect(() => { setSound(readSound()); }, []);

  // the frame loop: advance the clock, play the cue that fell between this frame and the last, finish the run
  useEffect(() => {
    if (!run || run.pausedAt !== null) return;
    let raf = 0;
    const step = () => {
      const t = performance.now();
      const cue = cueBetween(run, last.current, t);
      last.current = t;
      if (cue && sound) blip(ctx.current, CUE_TONES[cue]);
      if (cue === 'end') { try { navigator.vibrate?.(200); } catch { /* not a phone */ } }
      setNow(t);
      if (runView(run, t).done) {
        if (run.kind === 'work' && !logged.current) { logged.current = true; onWorkLogged?.(run.seconds); }
        runChange.current?.(null);
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [run, sound, onWorkLogged]);

  const start = useCallback((spec: TimerSpec) => {
    // the AudioContext is made on the tap, the one moment a browser lets a page start sound
    if (!ctx.current) { try { const A = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext); ctx.current = A ? new A() : null; } catch { ctx.current = null; } }
    void ctx.current?.resume?.();
    const t = performance.now();
    last.current = t; logged.current = false;
    setNow(t); setRun(startRun(spec, t)); setSettle(null);
    runChange.current?.(spec.kind);
  }, []);
  const stop = () => {
    if (run && run.kind === 'work' && !logged.current) {
      const s = secondsWorked(run, performance.now());
      logged.current = true;
      if (s !== null) onWorkLogged?.(s);
    }
    setRun(null); setSettle(null);
    runChange.current?.(null);
  };
  const togglePause = () => {
    if (!run) return;
    const t = performance.now();
    if (run.pausedAt === null) setRun(pauseRun(run, t));
    else { last.current = t; setRun(resumeRun(run, t)); }
  };

  if (!timers.length) return null;
  const view = run ? runView(run, run.pausedAt ?? now) : null;
  const restSpec = timers.find((t) => t.kind === 'rest') ?? null;
  const chip = settleChipFor(timers, run, now, settleBlocked);
  const restLive = chip.restLive;
  // the settle shows while its rest is live, to its last breath out and a short tail; a rest that has ended takes it
  // away with it (settleShowing — MIRROR-COACH P7 FIX: it used to stay "on" for the rest of the rest)
  const settling = settleShowing(settle, restLive);
  const workBreath = workBreathAt(breath, run, now);
  // a tap on Settle: stop the settle that is on; else start the rest if none is running, and the settle inside it
  const tapSettle = () => {
    if (settling) { setSettle(null); return; }
    if (!restSpec || !chip.spec) return;
    if (restLive === null) { start(restSpec); setSettle(chip.spec); return; }
    // a live rest: the settle starts where the rest is, on the rest's own clock (read now, not at the last frame)
    const at = run ? runElapsedMs(run, performance.now()) / 1000 : 0;
    setSettle(settleChip(restSpec.seconds, at).spec);
  };
  return (
    <div className="rounded-lg border border-white/8 bg-black/20 p-2 space-y-2" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Timer className="h-3.5 w-3.5 text-white/40" aria-hidden="true" />
        {timers.map((t) => (
          <button key={t.kind} type="button" onClick={() => start(t)} data-timer={t.kind}
            className={`rounded-md border px-2 py-1 text-xs ${run?.kind === t.kind ? 'border-[#00E5FF]/50 bg-[#00E5FF]/10 text-[#00E5FF]' : 'border-white/10 text-white/70'}`}>
            {t.label}
          </button>
        ))}
        {chip.show && (
          <button type="button" onClick={tapSettle} disabled={!settling && !chip.spec} aria-pressed={settling} data-settle-chip
            title={!settling && chip.why ? SETTLE_WHY_LINE[chip.why] : BETWEEN_SET_SETTLE.lead} data-settle-why={chip.why ?? undefined}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-30 ${settling ? 'border-[#00E5FF]/50 bg-[#00E5FF]/10 text-[#00E5FF]' : 'border-white/10 text-white/70'}`}>
            <Wind className="h-3 w-3" aria-hidden="true" />{settling ? 'Stop settle' : chip.label}
          </button>
        )}
        <button type="button" onClick={() => { const on = !sound; setSound(on); writeSound(on); }} aria-label={sound ? 'Mute the timer' : 'Unmute the timer'} className="ml-auto text-white/40 hover:text-white">
          {sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
        </button>
      </div>
      {run && view && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] uppercase tracking-wider text-white/40">{run.kind}{view.done ? ' · done' : view.paused ? ' · paused' : ''}</div>
            <div className="font-mono text-2xl tabular-nums text-white" data-testid={testId ? `${testId}-clock` : undefined} aria-live="off">{formatClock(view.remaining)}</div>
            <div className="flex items-center gap-1">
              {!view.done && <button type="button" onClick={togglePause} aria-label={view.paused ? 'Resume' : 'Pause'} className="rounded-md border border-white/10 p-1.5 text-white/70">{view.paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}</button>}
              <button type="button" onClick={stop} aria-label={view.done ? 'Close the timer' : run.kind === 'work' ? 'Stop and log the time' : 'Stop'} className="rounded-md border border-white/10 p-1.5 text-white/70"><Square className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className={`h-full ${run.kind === 'rest' ? 'bg-white/40' : 'bg-[#00E5FF]'}`} style={{ width: `${Math.round(view.fraction * 100)}%` }} />
          </div>
          {run.kind === 'work' && <div className="text-[11px] text-white/40">{view.done ? 'Logged in the next set.' : 'Stop early and the seconds you worked go in the next set.'}</div>}
          {workBreath && <WorkBreath spec={workBreath.spec} sec={workBreath.sec} />}
          {settling && settle && (
            <div className="flex items-center gap-3 rounded-md border border-[#00E5FF]/20 bg-[#00E5FF]/5 p-2" data-settle>
              <BreathPacer id="settle" spec={settle} elapsedSec={view.elapsed} size="sm" liveCaption />
              <div className="min-w-0 space-y-0.5">
                <div className="text-xs font-medium text-white">{BETWEEN_SET_SETTLE.name}</div>
                <div className="text-[11px] text-white/60">{BETWEEN_SET_SETTLE.cue}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
