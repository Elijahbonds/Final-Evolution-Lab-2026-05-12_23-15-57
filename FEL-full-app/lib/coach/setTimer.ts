// The Today card's timers — work, hold and rest (MIRROR-COACH P2, 2026-09-25).
//
// WHAT WAS MISSING. A timed dose had nowhere to run. Before P2 a 30-second carry was the text "30 seconds each side"
// in `reps`; P2's schema gave it workSeconds / holdSeconds, and the builder writes them — but neither client view had
// a timer of any kind (crossref: "a grep for timer|setInterval in both views returns nothing"), so the client counted
// in their head and logged whatever they remembered. The rest between sets was the same: 90 s printed, never timed.
//
// WHAT THIS IS. The clock arithmetic, pure, so it runs as a test: which timers an exercise gets, how a run reads at
// a given instant (paused or not), when the 3-2-1 ticks and the end tone fall between two animation frames, and how
// many seconds a stopped work run LOGS. The card (components/coach/set-timer.tsx) only owns requestAnimationFrame
// and the oscillator. The tones are FEL-generated sine blips (no sample, no third-party audio).

export type TimerKind = 'work' | 'hold' | 'rest';
export interface TimerSpec { kind: TimerKind; seconds: number; label: string }

/** "0:05", "1:30", "30:00". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const LABEL: Record<TimerKind, string> = { work: 'Work', hold: 'Hold', rest: 'Rest' };

/**
 * The timers an exercise's card shows: WORK when the dose is timed (workSeconds), HOLD when each rep or set ends in a
 * hold (holdSeconds), REST whenever the prescription has a rest. Work first: it is the one that logs.
 */
export function timersFor(e: { workSeconds?: number | null; holdSeconds?: number | null; restSeconds?: number | null }): TimerSpec[] {
  const out: TimerSpec[] = [];
  const add = (kind: TimerKind, sec: number | null | undefined) => {
    if (typeof sec === 'number' && Number.isFinite(sec) && sec > 0) out.push({ kind, seconds: Math.round(sec), label: `${LABEL[kind]} ${formatClock(sec)}` });
  };
  add('work', e.workSeconds); add('hold', e.holdSeconds); add('rest', e.restSeconds);
  return out;
}

/** One run of a timer. Times are milliseconds on the caller's clock (performance.now() in the card). */
export interface TimerRun { kind: TimerKind; seconds: number; startedAt: number; pausedAt: number | null; pausedMs: number }

export const startRun = (spec: Pick<TimerSpec, 'kind' | 'seconds'>, now: number): TimerRun => ({ kind: spec.kind, seconds: spec.seconds, startedAt: now, pausedAt: null, pausedMs: 0 });
export const pauseRun = (r: TimerRun, now: number): TimerRun => (r.pausedAt === null ? { ...r, pausedAt: now } : r);
export const resumeRun = (r: TimerRun, now: number): TimerRun => (r.pausedAt === null ? r : { ...r, pausedAt: null, pausedMs: r.pausedMs + (now - r.pausedAt) });

/** Milliseconds actually run: wall time since the start, less the time spent paused. */
export function runElapsedMs(r: TimerRun, now: number): number {
  const until = r.pausedAt ?? now;
  return Math.max(0, until - r.startedAt - r.pausedMs);
}

export interface RunView { remaining: number; elapsed: number; done: boolean; fraction: number; paused: boolean }

/** How a run reads at `now`: seconds left (for the clock), seconds run, whether it has finished, and 0→1 progress. */
export function runView(r: TimerRun, now: number): RunView {
  const elapsed = Math.min(r.seconds, runElapsedMs(r, now) / 1000);
  return { remaining: Math.max(0, r.seconds - elapsed), elapsed, done: elapsed >= r.seconds, fraction: r.seconds > 0 ? elapsed / r.seconds : 1, paused: r.pausedAt !== null };
}

/**
 * The cue that falls between two frames: 'end' when the run crosses zero; 'tick' when it crosses 3, 2 or 1 second
 * left on a run of 5 s or more (a 3-second hold that ticked every second would be nothing but ticks). A frame that
 * skips several boundaries (a backgrounded tab) plays one cue, not a burst.
 */
export function cueBetween(r: TimerRun, prevNow: number, now: number): 'tick' | 'end' | null {
  const before = r.seconds - runElapsedMs(r, prevNow) / 1000;
  const after = r.seconds - runElapsedMs(r, now) / 1000;
  if (before > 0 && after <= 0) return 'end';
  if (r.seconds >= 5) for (const k of [3, 2, 1]) if (before > k && after <= k) return 'tick';
  return null;
}

/** The two FEL tones: a short high blip for the last three seconds, a longer one at the end. */
export const CUE_TONES = {
  tick: { hz: 660, ms: 80, gain: 0.12 },
  end: { hz: 880, ms: 420, gain: 0.22 },
} as const;

/**
 * Seconds a WORK run logs: whole seconds actually worked, never more than the prescription and never 0 (a run
 * stopped in its first half-second logs nothing — null — rather than a 0-second set, which the validator refuses).
 */
export function secondsWorked(r: TimerRun, now: number): number | null {
  const s = Math.round(Math.min(r.seconds, runElapsedMs(r, now) / 1000));
  return s >= 1 ? s : null;
}

/** The set a finished work run fills: the first row with no seconds yet (the client works the sets in order). */
export function nextTimedRow(rows: readonly { workSeconds: string }[]): number {
  const i = rows.findIndex((r) => !r.workSeconds.trim());
  return i;
}
