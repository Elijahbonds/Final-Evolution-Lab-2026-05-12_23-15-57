// DRAGON CUTTER (lane/w3-present, wave 3) — the state of the super move's own camera, advanced by the mode's dt. Pure.
//
// A cut is three beats (combat/fightShots.dragonCutAt): the WINDUP (a low angle on the attacker as the fist comes back), the
// IMPACT (a profile of both fighters as the blow lands) and the OUT (the frame eases into the play camera). The windup is only
// as long as the swing's startup — and the blow lands on the MODE's clock, which a hit-stop, a pause or Matrix Focus can
// stretch — so the cut is told when the blow lands (`blow()`) instead of guessing: the windup holds its last frame until
// then, and the impact beat starts from the real hit. A blow that never comes (the round ended, the swing was cancelled)
// is `abort()`ed, or times out after `MAX_WAIT_SEC` past the windup, and the cut eases out.
//
// Presentation only: this decides where a camera stands for ~1.5 s. It reads no score and changes no number.

import { dragonCutAt, dragonCutSec, DRAGON_CUT, type DragonCut, type Ground, type LivePose } from './fightShots';
import type { CinFrame } from './cinemaRig';

/** A windup that has run its length waits this long for the blow before the cut gives up and eases out. */
export const MAX_WAIT_SEC = 1.0;

export class DragonCutter {
  private c: DragonCut | null = null;
  private t = 0;
  private blown = false;
  private waited = 0;
  private aborting = false;

  get active(): boolean { return this.c !== null; }
  get landed(): boolean { return this.blown; }
  get elapsed(): number { return this.t; }

  /** A DRAGON swing begins. `side` = +1 / −1, which side of the line the profile is shot from. */
  start(windupSec: number, side: number, impactOnly = false): void {
    this.c = { atk: { x: 0, z: 0 }, def: { x: 0, z: 0 }, side: side >= 0 ? 1 : -1, windupSec, impactOnly };
    this.t = 0; this.blown = !!impactOnly; this.waited = 0; this.aborting = false;
  }

  /** The blow lands (the mode's hit beat, whatever its outcome): the cut moves to its impact beat. */
  blow(): void {
    if (!this.c || this.blown) return;
    this.blown = true;
    this.t = Math.max(this.t, Math.max(DRAGON_CUT.minWindupSec, this.c.windupSec));
  }

  /** The swing will not land (round over, a cancel): the cut ends at the next step, `'aborted'` — the caller eases the rig out of
   *  whatever pose it is on (CinemaRig.stop) rather than the cut jumping to another beat. */
  abort(): void { if (this.c) this.aborting = true; }

  /** Advance by the mode's dt: 'run' while it plays, 'done' on the frame it has run its length, 'aborted' when it was cut short. */
  step(dt: number): 'run' | 'done' | 'aborted' | 'idle' {
    const c = this.c;
    if (!c) return 'idle';
    if (this.aborting) { this.cancel(); return 'aborted'; }
    const d = Math.max(0, Math.min(0.1, dt));
    const wind = c.impactOnly ? 0 : Math.max(DRAGON_CUT.minWindupSec, c.windupSec);
    if (!this.blown && this.t >= wind - 1e-3) {
      // the windup has run its length and no blow yet: hold the frame, and give up after MAX_WAIT_SEC
      this.waited += d;
      if (this.waited > MAX_WAIT_SEC) { this.cancel(); return 'aborted'; }
    } else this.t += d;
    if (this.t >= dragonCutSec(c)) { this.cancel(); return 'done'; }
    return 'run';
  }

  /** The camera frame for the fighters where they stand now. 'play' when no cut runs. */
  frame(atk: Ground, def: Ground, live: LivePose): CinFrame {
    const c = this.c;
    if (!c) return { shot: 'play', letterbox: 0 };
    c.atk = atk; c.def = def;
    const wind = c.impactOnly ? 0 : Math.max(DRAGON_CUT.minWindupSec, c.windupSec);
    // before the blow the windup is capped just short of its end (the impact beat belongs to the blow)
    const t = this.blown ? this.t : Math.min(this.t, wind - 1e-3);
    return dragonCutAt(t, c, live);
  }

  cancel(): void { this.c = null; this.t = 0; this.blown = false; this.waited = 0; this.aborting = false; }
}
