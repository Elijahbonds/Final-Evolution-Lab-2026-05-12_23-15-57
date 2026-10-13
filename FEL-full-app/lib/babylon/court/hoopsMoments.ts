// HOOPS HIGHLIGHT PACING (vis-hoops-court, 2026-10-14) — which basketball moments are worth a broadcast replay, and when.
//
// The broadcast kit (ModeDefinition.replay + ctx.highlight) replays whatever a mode asks it to, from the last few seconds the
// recorder holds. A one-on-one has a dead ball every ten seconds and three or four plays a game that deserve a second look: the
// ankle-breaker, the block, the poster. A replay on every bucket would be a TV stuck on instant replay, and a replay in the middle
// of a live possession would stop the game under a player's thumbs. So:
//
//   · the moments are NOTED as they happen (the momentum bus already hears every one of them: a posterize, an ankle-break, a block)
//     and nothing is played yet;
//   · at the NEXT DEAD BALL (the possession reset, which is where the mode moves its bodies anyway) the best moment of the possession
//     is replayed once, from the seconds before it up to now — an ankle-breaker, the drive, the finish, as one cut;
//   · never in reduced motion, never for the moment that ends the match (the end card is what the player is waiting for), at most
//     `HOOPS_REPLAY_CAP` a run, and at least `every` possessions apart.
//
// Pure: no scene, no clock of its own (the caller passes the recorder's clock, performance.now() / 1000). It imports nothing from
// scoring or judging — it is told a moment happened, it never decides whether a basket counts.

import { HighlightPacer } from './highlights';

export type HoopsMomentKind = 'poster' | 'ankles' | 'block' | 'dunk' | 'steal';

/** How much each moment is worth replaying (the best of a possession wins; a steal alone never does). */
export const MOMENT_WEIGHT: Readonly<Record<HoopsMomentKind, number>> = { poster: 5, ankles: 4, block: 4, dunk: 3, steal: 1 };
/** A moment must weigh at least this to be replayed on its own. */
export const REPLAY_FLOOR = 3;
/** Seconds of play shown BEFORE the moment (the crossover that set it up, the take-off). */
export const MOMENT_LEAD_S = 1.2;
/** A moment older than this at the dead ball has fallen out of the recorder's window once its lead is added. */
/** The recorder keeps 5 s (ReplayDirector.REPLAY_WINDOW_S; a test holds the two equal, so this file stays free of the scene's imports). */
export const RECORDER_WINDOW_S = 5;
export const MOMENT_MAX_AGE_S = RECORDER_WINDOW_S - MOMENT_LEAD_S - 0.2;
/** Shortest and longest replay, in recorded seconds (it plays at half speed: 3 s is six on screen). */
export const REPLAY_MIN_S = 2.4;
export const REPLAY_MAX_S = RECORDER_WINDOW_S;
/** At most this many replays in one run, and this many possessions between two. */
export const HOOPS_REPLAY_CAP = 4;
export const HOOPS_REPLAY_EVERY = 2;

export interface HoopsMoment { kind: HoopsMomentKind; /** the recorder's clock, seconds */ at: number }

/** Pure: a momentum-bus report as a hoops moment, or null when it is not one. `weight` is the report's explicit weight if it sent one.
 *  3v3 reports a drift that broke an ankle as a `clean_hit` of weight 14 (its swing() reports ankle_break for the stick moves). */
export function momentOfReport(e: { kind: string; weight?: number }): HoopsMomentKind | null {
  switch (e.kind) {
    case 'posterize': return 'poster';
    case 'ankle_break': return 'ankles';
    case 'block': return 'block';
    case 'highlight_dunk': return 'dunk';
    case 'steal': return 'steal';
    case 'clean_hit': return (e.weight ?? 0) >= 14 ? 'ankles' : null;
    default: return null;
  }
}

/** The moments of the possession in progress. */
export class HoopsMomentLog {
  private list: HoopsMoment[] = [];
  note(kind: HoopsMomentKind, at: number): void { this.list.push({ kind, at }); if (this.list.length > 12) this.list.shift(); }
  clear(): void { this.list.length = 0; }
  get size(): number { return this.list.length; }
  /** The best moment still inside the recorder's window at `now`: heaviest first, the latest of equals. Null when none is worth it. */
  best(now: number): HoopsMoment | null {
    let pick: HoopsMoment | null = null;
    for (const m of this.list) {
      if (now - m.at > MOMENT_MAX_AGE_S || now - m.at < -0.05) continue;
      if (!pick || MOMENT_WEIGHT[m.kind] > MOMENT_WEIGHT[pick.kind] || (MOMENT_WEIGHT[m.kind] === MOMENT_WEIGHT[pick.kind] && m.at > pick.at)) pick = m;
    }
    return pick && MOMENT_WEIGHT[pick.kind] >= REPLAY_FLOOR ? pick : null;
  }
}

export interface HoopsReplayPlan { kind: HoopsMomentKind; /** seconds of the recording to show, ending at `endAt` */ lastSeconds: number; endAt: number }

/** Pure: how long the replay of a moment at `at` runs when it is played at `now`: from MOMENT_LEAD_S before it, to now. */
export function replayLength(at: number, now: number): number {
  return Math.max(REPLAY_MIN_S, Math.min(REPLAY_MAX_S, now - at + MOMENT_LEAD_S));
}

/** The decision, once per dead ball. Owns the pacing (every two possessions, four a run); never says yes to a final moment. */
export class HoopsReplayPlanner {
  readonly log = new HoopsMomentLog();
  private pacer = new HighlightPacer(HOOPS_REPLAY_EVERY);
  private played = 0;
  /** Replays played this run. */
  get count(): number { return this.played; }

  /** A dead ball at `now`. Returns the replay to play, or null (and the possession's moments are spent either way). */
  atDeadBall(now: number, opts: { final?: boolean; reduced?: boolean } = {}): HoopsReplayPlan | null {
    const m = this.log.best(now);
    this.log.clear();
    const worthy = !!m && this.played < HOOPS_REPLAY_CAP;
    if (!this.pacer.offer(worthy, opts)) { this.pacer.tick(); return null; }
    this.played++;
    return { kind: m!.kind, lastSeconds: replayLength(m!.at, now), endAt: now };
  }

  /** A new run on the same closure. */
  reset(): void { this.log.clear(); this.played = 0; this.pacer = new HighlightPacer(HOOPS_REPLAY_EVERY); }
}
