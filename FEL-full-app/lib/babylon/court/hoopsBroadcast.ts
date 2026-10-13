// HOOPS BROADCAST (vis-hoops-court, 2026-10-14) — the intro and the replays for onevone and threevthree, in one place.
//
// Two jobs the broadcast kit leaves to a mode, and the two modes' closures are 3 600 and 3 900 lines that another lane is editing,
// so the mode files keep to one-line hooks and the work is here:
//
//   HOLD THE INTRO.  `intro: 'walkIn'` puts a crane over the venue and a low shot on the player in front of the first possession,
//   and the mode is playing underneath — a defender who checks the ball while the player is watching a crane is a steal they
//   could not see coming. `holdIntro` is the mode's first act each frame: while the intro runs, the camera director is stepped
//   (it drives the intro) and the mode's own update returns, so nothing moves until the first press hands the frame over.
//
//   REPLAY AT THE DEAD BALL.  The momentum bus hears every ankle-breaker, block and poster as it is reported (`onReport`); they are
//   NOTED, not played. At the next dead ball (the mode's possession reset: the one place it moves its bodies anyway) the best
//   moment of the possession plays once, as one cut from the seconds before it to now, and the reset runs AFTER it (a replay puts
//   the bodies back where the frame left them, so a reset made during it would be undone). Never for the final moment, never in
//   reduced motion, paced and capped (hoopsMoments).
//
// It reads what happened and plays what was recorded. It imports nothing from scoring, rules or judging and writes none of their
// state: whether a basket counts, who wins and what a block is worth are the modes' own.

import { Vector3 } from '@babylonjs/core';
import type { ModeContext } from '../core/ModeHarness';
import { motionPolicy } from '../../a11y/reducedMotion';
import { HoopsReplayPlanner, momentOfReport } from './hoopsMoments';

export interface HoopsBroadcastOpts {
  /** What the replay's cameras look toward (the rim). */
  rim: Vector3;
  /** Is the possession that just ended the match's last? Read at the dead ball (the mode's `ended`, its buzzer). */
  final: () => boolean;
}

export interface HoopsBroadcast {
  /** The mode's first act each frame: true = the intro is on screen and the mode returns from update(). */
  holdIntro(subject: Vector3, objective: Vector3 | null): boolean;
  /** At a dead ball, before the mode resets: true = a replay took the call and `next` runs when it ends (the caller returns);
   *  false = nothing to show, the caller carries on and `next` is NOT called. */
  deadBall(next: () => void): boolean;
  /** A new run on the same closure. */
  reset(): void;
  readonly replays: number;
  dispose(): void;
}

const ZERO = Vector3.Zero();

export function mountHoopsBroadcast(ctx: ModeContext, opts: HoopsBroadcastOpts): HoopsBroadcast {
  const planner = new HoopsReplayPlanner();
  const clock = (): number => performance.now() / 1000;   // the recorder's clock (ReplayDirector records on it)
  const stop = ctx.momentum.onReport((e) => { const k = momentOfReport(e); if (k) planner.log.note(k, clock()); });
  let replaying = false, gone = false;
  return {
    holdIntro(subject, objective) {
      if (!ctx.camDirector.inIntro) return false;
      ctx.camDirector.update(subject, ZERO, objective);
      return true;
    },
    deadBall(next) {
      if (replaying) return false;
      const plan = planner.atDeadBall(clock(), { final: opts.final(), reduced: !motionPolicy().travel });
      if (!plan || !ctx.highlight) return false;
      replaying = true;
      console.info(`[HOOPS-REPLAY] ${plan.kind}: the last ${plan.lastSeconds.toFixed(1)} s`);
      void ctx.highlight({ lastSeconds: plan.lastSeconds, endAt: plan.endAt, objective: opts.rim })
        .catch(() => { /* a replay that failed is a replay not shown */ })
        .then(() => { replaying = false; if (!gone) next(); });   // a mode torn down during its replay is not reset
      return true;
    },
    reset() { planner.reset(); replaying = false; },
    get replays() { return planner.count; },
    dispose() { gone = true; stop(); },
  };
}
