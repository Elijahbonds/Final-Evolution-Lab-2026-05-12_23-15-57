// lib/session-player/machine.ts — PLAT-P01 (2026-10-27): the session player's step machine.
//
//   ready ─(counts down)→ work(step 1, set 1) ─(Set done, or a timed set ends by itself)→ rest ─(counts down)→ work(set 2)
//   → … → rest ("Next: <exercise>") → work(next exercise, set 1) → … → finish
//
// The person taps once per counted set (Set done). Nothing else needs a tap: the ready count, a timed set, every rest and
// the move to the next exercise run by themselves. Pause and resume work in every phase; Back goes to the previous set
// (a Set done tapped by mistake is one tap to undo).
//
// Pure: the clock is handed in (`tick(state, dtMs)`), so every transition is unit-tested (tests/session-player/machine.test.ts)
// and the screen (components/session-player/use-session-player.ts) only drives it. What a transition should SOUND like is
// returned as effects, which ./voice.ts turns into words.
//
// Client-safe.
import { isTimed, type Session } from './model';

/** The count before the first set: time to step back from the phone and see the first demo. (new) */
export const READY_SECONDS = 5;
/** The least time between two exercises, when the source gives the set no rest: enough to walk to the next one. (new) */
export const CHANGE_SECONDS = 5;
/** Rest ticks in its last seconds (owner brief: "the last 3 s get a tick"). */
export const TICK_SECONDS = 3;

export type Phase = 'ready' | 'work' | 'rest' | 'finish';

export interface PlayerState {
  phase: Phase;
  /** The step on screen. In rest, the step that comes NEXT (its demo plays while you rest). */
  step: number;
  /** 1-based set on screen. In rest, the set that comes next. */
  set: number;
  /** The countdown left (ready, rest, a timed set), or null (a counted set, the finish). */
  leftMs: number | null;
  /** The countdown's full length, for the ring. */
  fullMs: number | null;
  paused: boolean;
  /** Time spent playing, pauses left out. */
  elapsedMs: number;
  setsDone: number;
}

export type Effect =
  /** A phase began. `fresh`: the step on screen is a different exercise from the one before. */
  | { kind: 'enter'; phase: Phase; step: number; set: number; fresh: boolean }
  /** A rest's last seconds: 3, 2, 1. */
  | { kind: 'tick'; left: number };

export interface Out { state: PlayerState; effects: Effect[] }

const keep = (state: PlayerState): Out => ({ state, effects: [] });

/** The player as it opens: the ready count over the first exercise. */
export function startState(session: Session): Out {
  const empty = session.steps.length === 0;
  const state: PlayerState = {
    phase: empty ? 'finish' : 'ready', step: 0, set: 1, leftMs: empty ? null : READY_SECONDS * 1000, fullMs: empty ? null : READY_SECONDS * 1000,
    paused: false, elapsedMs: 0, setsDone: 0,
  };
  return { state, effects: [{ kind: 'enter', phase: state.phase, step: 0, set: 1, fresh: true }] };
}

function enterWork(session: Session, s: PlayerState, step: number, set: number, fresh: boolean): Out {
  const st = session.steps[step];
  const ms = isTimed(st) ? st.workSeconds! * 1000 : null;
  const state: PlayerState = { ...s, phase: 'work', step, set, leftMs: ms, fullMs: ms, paused: false };
  return { state, effects: [{ kind: 'enter', phase: 'work', step, set, fresh }] };
}

/** The set after (step, set), or null at the end of the session. */
function after(session: Session, step: number, set: number): { step: number; set: number } | null {
  if (set < Math.max(1, session.steps[step].sets)) return { step, set: set + 1 };
  return step + 1 < session.steps.length ? { step: step + 1, set: 1 } : null;
}

/** The set before (step, set), or null at the very first set. */
function before(session: Session, step: number, set: number): { step: number; set: number } | null {
  if (set > 1) return { step, set: set - 1 };
  return step > 0 ? { step: step - 1, set: Math.max(1, session.steps[step - 1].sets) } : null;
}

/** A set is done: rest (or straight on), the next exercise, or the finish. */
function completeSet(session: Session, s: PlayerState): Out {
  const done = { ...s, setsDone: s.setsDone + 1 };
  const next = after(session, s.step, s.set);
  if (!next) return { state: { ...done, phase: 'finish', leftMs: null, fullMs: null, paused: false }, effects: [{ kind: 'enter', phase: 'finish', step: s.step, set: s.set, fresh: false }] };
  const fresh = next.step !== s.step;
  const restSec = Math.max(session.steps[s.step].restSeconds, fresh ? CHANGE_SECONDS : 0);
  if (restSec <= 0) return enterWork(session, done, next.step, next.set, fresh);
  const ms = restSec * 1000;
  return {
    state: { ...done, phase: 'rest', step: next.step, set: next.set, leftMs: ms, fullMs: ms, paused: false },
    effects: [{ kind: 'enter', phase: 'rest', step: next.step, set: next.set, fresh }],
  };
}

/** Time passes. Countdowns run (unless paused) and end by themselves. */
export function tick(session: Session, s: PlayerState, dtMs: number): Out {
  if (s.paused || s.phase === 'finish' || !(dtMs > 0)) return keep(s);
  const elapsed = { ...s, elapsedMs: s.elapsedMs + dtMs };
  if (s.leftMs === null) return keep(elapsed);
  const left = s.leftMs - dtMs;
  const effects: Effect[] = [];
  if (s.phase === 'rest') {
    for (let k = TICK_SECONDS; k >= 1; k--) if (s.leftMs > k * 1000 && left <= k * 1000) effects.push({ kind: 'tick', left: k });
  }
  if (left > 0) return { state: { ...elapsed, leftMs: left }, effects };
  const out = s.phase === 'ready' ? enterWork(session, elapsed, s.step, s.set, false)
    : s.phase === 'rest' ? enterWork(session, elapsed, s.step, s.set, false)
      : completeSet(session, elapsed);   // a timed set ran out
  return { state: out.state, effects: [...effects, ...out.effects] };
}

/** The one bottom button: Start now (ready), Set done (work), Skip rest (rest). Unpauses. */
export function primary(session: Session, s: PlayerState): Out {
  const live = { ...s, paused: false };
  if (s.phase === 'ready' || s.phase === 'rest') return enterWork(session, live, s.step, s.set, false);
  if (s.phase === 'work') return completeSet(session, live);
  return keep(s);
}

export const setDone = (session: Session, s: PlayerState): Out => (s.phase === 'work' ? primary(session, s) : keep(s));
export const skipRest = (session: Session, s: PlayerState): Out => (s.phase === 'rest' || s.phase === 'ready' ? primary(session, s) : keep(s));

export const pause = (s: PlayerState): PlayerState => (s.phase === 'finish' ? s : { ...s, paused: true });
export const resume = (s: PlayerState): PlayerState => ({ ...s, paused: false });

/** Back to the previous set: in rest, the set just done runs again (its Set done is undone); in a set, the set before it.
 *  At the very first set, the set starts over. Not from the finish. */
export function back(session: Session, s: PlayerState): Out {
  if (s.phase === 'finish' || s.phase === 'ready') return keep(s);
  // in rest, (step, set) is the set coming next, so the set before it is the one just done; in a set, the one before it
  const target = before(session, s.step, s.set);
  if (!target) return enterWork(session, s, s.step, s.set, false);
  return enterWork(session, { ...s, setsDone: Math.max(0, s.setsDone - 1) }, target.step, target.set, target.step !== s.step);
}

/** Where the session stands, for the bar and "2 of 6": the step on screen, 1-based. */
export const stepOf = (s: PlayerState): number => s.step + 1;
