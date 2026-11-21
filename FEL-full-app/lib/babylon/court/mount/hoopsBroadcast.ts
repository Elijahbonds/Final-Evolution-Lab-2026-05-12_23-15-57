// HOOPS BROADCAST (vis-hoops-court, 2026-10-14) — the intro and the replays for onevone and threevthree, in one place.
//
// Two jobs the broadcast kit leaves to a mode, and the two modes' closures are 3 600 and 3 900 lines that another lane is editing,
// so the mode files keep to one-line hooks and the work is here:
//
//   HOLD THE INTRO.  `intro: 'walkIn'` puts a crane over the venue and a low shot on the player in front of the first possession,
//   and the mode is playing underneath — a defender who checks the ball while the player is watching a crane is a steal they
//   could not see coming. `holdIntro` is the mode's first act each frame: while the intro runs, the camera director is stepped
//   (it drives the intro) and the mode's own update returns, so nothing moves until the first press hands the frame over.
//   hoops-play (2026-11-21, knob `hoops.introPressPlaysOn`): that press used to wait out the camera's whole hand-over too (INTRO.skipSec,
//   0.35 s) before the body could move — the first stick press of every game moved the player after 383 ms against 33 ms for every later
//   one (rig, three seeds). Now the press that skips the intro starts play on the next frame: the hand-over still eases in exactly as it
//   did (the mode's own camera update runs it from there; the camera director and its numbers are untouched). How the press is seen: the
//   intro's letterbox stays fully closed until the walk-in's last INTRO.outSec, and a skip starts opening it at once, so the letterbox
//   opening before that tail IS the skip. With no press the intro plays out and is held to its end as before. 0 = held to the end of the
//   hand-over, as before.
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
import type { ModeContext } from '../../core/ModeHarness';
import { motionPolicy } from '../../../a11y/reducedMotion';
import { HoopsReplayPlanner, momentOfReport, capReplay, REPLAY_CAP_SEC, type HoopsMomentKind } from '../hoopsMoments';
import { feel } from '../../../feel-panel/feel';   // hoops-p06: the replay's cap (knob `hoops.replayCapSec`)
import { INTRO, introSec, type IntroKind } from '../../scene/broadcastShots';

/** hoops-play: 1 = the press that skips the intro starts play on the next frame; 0 = play waits for the camera's hand-over (as before).
 *  Knob `hoops.introPressPlaysOn`. */
export const INTRO_PRESS_PLAYS_ON = 1;
export const introPressPlaysOn = (): boolean => feel('hoops.introPressPlaysOn', INTRO_PRESS_PLAYS_ON) >= 0.5;
/** Pure (hoops-play): is the intro being skipped? `t` = seconds of intro stepped so far; `letterbox01` = the director's cinematic01 after
 *  the step. The walk-in's own letterbox is 1 until its last INTRO.outSec, so an opening letterbox before that tail is a skip. */
export function introSkipSeen(kind: IntroKind, t: number, letterbox01: number): boolean {
  return letterbox01 < 0.999 && t < introSec(kind) - INTRO.outSec - 1e-3;
}

export interface HoopsBroadcastOpts {
  /** What the replay's cameras look toward (the rim). */
  rim: Vector3;
  /** hoops-play: the mode's intro (ModeDefinition.intro); 'walkIn' for both hoops modes. */
  introKind?: IntroKind;
  /** Is the possession that just ended the match's last? Read at the dead ball (the mode's `ended`, its buzzer). */
  final: () => boolean;
}

export interface HoopsBroadcast {
  /** The mode's first act each frame: true = the intro is on screen and the mode returns from update(). */
  holdIntro(subject: Vector3, objective: Vector3 | null): boolean;
  /** At a dead ball, before the mode resets: true = a replay took the call and `next` runs when it ends (the caller returns);
   *  false = nothing to show, the caller carries on and `next` is NOT called. */
  deadBall(next: () => void): boolean;
  /** Note a moment by hand (probes and tests; the modes' own reach the planner through the momentum bus). */
  note(kind: HoopsMomentKind): void;
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
  let replaying = false, gone = false, bypass = false;   // bypass: `next` is the mode's own reset coming back through its dead-ball hook
  let introT = 0, introPlays = false;   // hoops-play: seconds of intro stepped, and whether a press has handed play over
  return {
    holdIntro(subject, objective) {
      if (!ctx.camDirector.inIntro) { introT = 0; introPlays = false; return false; }
      if (introPlays) return false;   // hoops-play: skipped — the mode plays, and its own camera update runs the rest of the hand-over
      ctx.camDirector.update(subject, ZERO, objective);
      introT += Math.min(0.1, ctx.scene.getEngine().getDeltaTime() / 1000);   // (the director's own step)
      // hoops-play: this frame's camera step is done (the mode must not step it twice); play starts on the next frame
      if (introPressPlaysOn() && introSkipSeen(opts.introKind ?? 'walkIn', introT, ctx.camDirector.cinematic01)) introPlays = true;
      return true;
    },
    deadBall(next) {
      if (replaying) return false;
      if (bypass) { bypass = false; return false; }
      const planned = planner.atDeadBall(clock(), { final: opts.final(), reduced: !motionPolicy().travel });
      // hoops-p06 (phase 6): a big play holds the game at most `hoops.replayCapSec` on screen (the window around the moment); 0 = the plan's
      const plan = planned ? capReplay(planned, planner.lastAt, feel('hoops.replayCapSec', REPLAY_CAP_SEC)) : null;
      if (!plan || !ctx.highlight) return false;
      replaying = true;
      console.info(`[HOOPS-REPLAY] ${plan.kind}: the last ${plan.lastSeconds.toFixed(1)} s`);
      void ctx.highlight({ lastSeconds: plan.lastSeconds, endAt: plan.endAt, objective: opts.rim })
        .catch((e) => { console.warn('[HOOPS-REPLAY] not shown:', String(e).slice(0, 160)); })   // a replay that failed is a replay not shown (hoops-flow: and says so)
        .then(() => { replaying = false; if (gone) return; bypass = true; try { next(); } finally { bypass = false; } });   // a mode torn down during its replay is not reset
      return true;
    },
    note(kind) { planner.log.note(kind, clock()); },
    reset() { planner.reset(); replaying = false; },
    get replays() { return planner.count; },
    dispose() { gone = true; stop(); },
  };
}
