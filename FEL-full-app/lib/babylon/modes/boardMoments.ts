// BOARD MOMENTS (vis-board, visual wave 2, 2026-10-13) — which moments of a board run earn a broadcast replay, and which
// landings and carves leave a mark on the floor. Pure: no scene, no clock of its own, and — by design — nothing from the
// scoring or judging modules. A replay is PRESENTATION: the modes decide a moment's `weight` from numbers they already
// computed (a chain's points, a wave's height, a jump's air) and hand it here; this answers "show it?" and "how much of it?".
//
// THE RULES (owner, wave-2 brief: "keep them skippable, and never replay the final moment before the end card"):
//   · a replay is the run's BEST so far — a moment must beat every moment already replayed, and clear the mode's own floor
//     (a plain ollie is never a highlight);
//   · at most MAX_PER_RUN, and never inside MIN_GAP_SEC of the last one (the clock is the mode's, held while a replay plays);
//   · never when the run is nearly over: the replay plays at half speed, so it needs twice its window in real seconds, and the
//     last TAIL_GUARD_SEC of a timed run are the end card's. A mode that ends on an event (a finish line) simply does not call
//     this for that event.
// The replay itself (scene/ReplayDirector) is skippable by any press and never moves the game: it puts every body and the
// camera back exactly as they were.

/** Half speed (ReplayDirector.REPLAY_SPEED): a window of N seconds plays for 2N. Kept as a literal so this stays import-free. */
const PLAYBACK_SLOW = 2;

export const MAX_PER_RUN = 3;
/** Live seconds that must pass between one replay and the next. */
export const MIN_GAP_SEC = 18;
/** A timed run's last stretch belongs to the end card: no replay starts inside (its own playback time + this). */
export const TAIL_GUARD_SEC = 14;
/** The window of a replay, seconds of action shown (the recorder keeps 5). */
export const WINDOW_MIN_SEC = 2.4;
export const WINDOW_MAX_SEC = 4.6;

export interface BoardMoment {
  /** What it was (for the log and the tests): 'chain', 'grind', 'air', 'wave', 'barrel', 'combo'. */
  kind: string;
  /** How big, in the mode's own unit (chain points, metres of air, a wave's score). Compared only with this run's other moments. */
  weight: number;
  /** The least weight that is a highlight at all in this mode. */
  floor: number;
  /** How long the action ran, seconds (the window is this plus a lead-in, clamped). */
  sec: number;
}

export interface ReplayPlan { lastSeconds: number }

/** Pure: the replay's window for an action `sec` long: a beat of lead-in, held inside the recorder's range. */
export function replayWindow(sec: number): number {
  const w = (Number.isFinite(sec) ? sec : 0) + 0.8;
  return Math.max(WINDOW_MIN_SEC, Math.min(WINDOW_MAX_SEC, w));
}

/** Pure: the real seconds a replay of `windowSec` takes on screen (half speed). */
export function playbackSec(windowSec: number): number { return windowSec * PLAYBACK_SLOW; }

export class ReplayGate {
  private best = 0;
  private lastAt = -Infinity;
  private shown = 0;

  /** A new run: nothing has been shown, nothing is the best. */
  reset(): void { this.best = 0; this.lastAt = -Infinity; this.shown = 0; }

  /** How many replays this run has shown. */
  get count(): number { return this.shown; }

  /**
   * Should this moment be replayed? `now` is the mode's own run clock (seconds, held while a replay plays); `left` the seconds
   * a TIMED run has left (Infinity for one that ends on an event). Records the moment when it says yes; a no changes nothing
   * except that a bigger moment still raises the bar for the next one only when it was shown.
   */
  consider(now: number, m: BoardMoment, left = Infinity): ReplayPlan | null {
    if (!(m.weight >= m.floor) || !(m.weight > this.best)) return null;
    if (this.shown >= MAX_PER_RUN) return null;
    if (now - this.lastAt < MIN_GAP_SEC) return null;
    const win = replayWindow(m.sec);
    if (left < playbackSec(win) + TAIL_GUARD_SEC) return null;
    this.best = m.weight; this.lastAt = now; this.shown++;
    return { lastSeconds: win };
  }
}
