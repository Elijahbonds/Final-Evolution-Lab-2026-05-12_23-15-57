// StickHandle — the RIGHT STICK as the dribble stick (owner, 2026-09-17: "a flip of the right stick should trigger something
// with the character … reference the old 2K17 dribble system with the ability to momentum and momentum spam, momentum
// behind the back, pausin', steezo roll").
//
// A pure gesture reader: the raw R-stick samples in, gestures out. Four gestures carry the whole vocabulary:
//   FLICK   — a snap from the centre past the flick ring inside a short window (the 2K flick): left / right / up / down
//   HOLD    — the stick parked past the hold ring for a beat: PAUSIN' (the dribble freezes with the ball out)
//   RELEASE — the stick let go after a hold: the explode out of the pause
//   SWEEP   — a half circle around the ring at speed: the STEEZO ROLL (behind the back rolled into the spin)
// The mode reads the gestures while the ball is on the floor; in the air the same stick is the trick stick (untouched).
export type StickDir = 'left' | 'right' | 'up' | 'down';
/** THE 2K PRO STICK (owner, 2026-09-18: "optimize dribble moves with the right stick … look at 2k controls and dribble
 *  tutorials"): the flick's EIGHT ways — the diagonals are their own moves (up-diagonals = size-ups, down-diagonals =
 *  behind the back), not a rounding of the nearest axis. */
export type StickDir8 = StickDir | 'upleft' | 'upright' | 'downleft' | 'downright';
export type StickGesture =
  | { kind: 'flick'; dir: StickDir; dir8: StickDir8; x: number; y: number }
  | { kind: 'hold'; x: number; y: number }
  | { kind: 'release'; heldSec: number }
  | { kind: 'sweep'; sign: 1 | -1 };

export const STICK = {
  centre: 0.32,      // under this the stick is home
  flick: 0.72,       // past this, from home inside flickSec, is a flick
  flickSec: 0.16,
  hold: 0.6,         // past this for holdSec is a hold (pausin')
  holdSec: 0.26,
  sweepRad: 2.4,     // a sweep must turn this far (≈ 140°) …
  sweepSec: 0.38,    // … inside this long, past the hold ring
} as const;

export class StickHandleReader {
  private mag = 0; private ang = 0;
  private homeAt = 0;            // when the stick was last home
  private wasHome = true;
  private outAt = -1;            // when the stick left home (for the flick window / the hold clock)
  private flicked = false;       // this excursion already flicked
  private held = false;          // a hold has been emitted for this excursion
  private sweepStartAng = 0; private sweepTurn = 0; private sweepAt = -1; private swept = false;

  /** Feed one raw sample; returns the gestures it completes (usually none). `now` in seconds. */
  feed(x: number, y: number, now: number): StickGesture[] {
    const out: StickGesture[] = [];
    const mag = Math.hypot(x, y), ang = Math.atan2(y, x);
    const home = mag < STICK.centre;
    if (home) {
      if (!this.wasHome) {
        if (this.held) out.push({ kind: 'release', heldSec: now - this.outAt });
        this.held = false; this.flicked = false; this.swept = false; this.sweepAt = -1;
      }
      this.homeAt = now; this.wasHome = true; this.outAt = -1;
    } else {
      if (this.wasHome) { this.outAt = now; this.sweepStartAng = ang; this.sweepTurn = 0; this.sweepAt = now; this.wasHome = false; }
      else {
        // the sweep: accumulate the signed turn around the ring while past the hold ring
        if (mag >= STICK.hold && this.mag >= STICK.hold) {
          let d = ang - this.ang; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
          if (this.sweepAt < 0) { this.sweepAt = now; this.sweepTurn = 0; }
          this.sweepTurn += d;
          if (now - this.sweepAt > STICK.sweepSec) { this.sweepAt = now; this.sweepTurn = d; }   // too slow: restart the clock
          if (!this.swept && Math.abs(this.sweepTurn) >= STICK.sweepRad) { this.swept = true; this.flicked = true; this.held = true; out.push({ kind: 'sweep', sign: this.sweepTurn > 0 ? 1 : -1 }); }
        }
      }
      // the flick: past the ring quickly from home
      if (!this.flicked && !this.swept && mag >= STICK.flick && now - this.outAt <= STICK.flickSec) {
        this.flicked = true;
        const dir: StickDir = Math.abs(x) >= Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
        out.push({ kind: 'flick', dir, dir8: dir8Of(x, y), x, y });
      }
      // the hold: parked past the hold ring for a beat (a flick that stays out becomes a hold too — the pause after the cross)
      if (!this.held && !this.swept && mag >= STICK.hold && now - this.outAt >= STICK.holdSec) { this.held = true; out.push({ kind: 'hold', x, y }); }
    }
    this.mag = mag; this.ang = ang;
    return out;
  }
  reset(): void { this.mag = 0; this.wasHome = true; this.outAt = -1; this.flicked = false; this.held = false; this.swept = false; this.sweepAt = -1; }
}

/** The eight ways: a diagonal is anything more than DIAG_MIN off both axes (a flick at 45° ± 22.5°). */
export const DIAG_MIN = 0.42;
export function dir8Of(x: number, y: number): StickDir8 {
  const ax = Math.abs(x), ay = Math.abs(y), m = Math.hypot(x, y) || 1;
  if (ax / m >= DIAG_MIN && ay / m >= DIAG_MIN) return y < 0 ? (x > 0 ? 'upright' : 'upleft') : (x > 0 ? 'downright' : 'downleft');
  return ax >= ay ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
}

/** WHICH MOVE a gesture is, read off the situation — THE 2K PRO STICK (2K25's own map, measured against the dribble
 *  tutorials; the 2K17 momentum moves kept where they were):
 *    left / right           crossover; at pace (or with the sprint held: the ESCAPE) the momentum cross
 *    down                   the hesitation — the freeze
 *    down-left / down-right behind the back, standing; at pace, or thrown right after another move (the "aggressive" BTB
 *                           the tutorials chain off a hesi / an escape / a cross), the momentum behind the back
 *    up-left / up-right     a SIZE-UP: a rhythm dribble in place, one animation per flick, no travel
 *    up                     the in-and-out (standing under pressure: between the legs)
 *    L2 + any flick         the SPIN, to the flick's side
 *    L2 + down              the STEP-BACK dribble (a squeeze inside its window is the step-back jumper)
 *    sweep                  the steezo roll · hold: PAUSIN' (the mode) · release: the explode */
export type StickMove = 'momentum_cross' | 'momentum_btb' | 'crossover' | 'hesi' | 'in_and_out' | 'between_legs' | 'behind_back' | 'steezo_roll'
  | 'size_up' | 'stepback' | 'snatchback' | 'spin';
export interface StickRead {
  speed01: number; pressured: boolean; sprint: boolean;
  /** Which hand the ball is in. 2K's map is RELATIVE TO IT: "toward" and "away" mean the ball hand's side. Default Right. */
  hand?: 'Left' | 'Right';
  /** R2 / RT held: the ESCAPE — the same gesture, travelling (2K: "hold RT with the same flick for the escape version"). */
  escape?: boolean;
  /** L2 / LT held. Since the 2K remap it changes no stick move; it is read by the post game. */
  brace?: boolean;
  /** Seconds since the last stick move landed (Infinity when none). */
  sinceMoveSec?: number;
}
export const MOMENTUM_MIN_SPEED01 = 0.4;
/** A behind-the-back thrown inside this much of another move is the AGGRESSIVE one (the momentum wrap). */
export const AGGRESSIVE_BTB_SEC = 0.7;

/**
 * The 2K Pro Stick map (Phase 3 of the hoops upgrade pass, 2026-09-22; docs/SPEC-STICK-2K-DECODE.md is the reference).
 *
 * Written for the ball in the RIGHT hand and mirrored for the left, so "toward" is +x with the ball right and -x with
 * it left. This is the whole difference from the old map, which was absolute: the ball hand exists in ballCarry and
 * nothing read it, so a flick that meant "crossover" with the ball in one hand meant it in the other too, and a hesi
 * lived on DOWN where 2K keeps the step-back.
 *
 *   toward      hesi              up-toward   size-up
 *   away        between the legs  up          in and out
 *   up-away     crossover         down-away   behind the back
 *   down        step-back         rotation    spin
 *
 * R2 held is the escape of any of them: crossover → momentum cross, behind the back → momentum wrap, step-back → the
 * SNATCHBACK (a step-back that crosses), rotation → the steezo roll. Speed alone no longer promotes a move: a flick at
 * a jog without R2 is the plain move, as it is in 2K. L2 is no longer a stick modifier at all — the spin lives on the
 * rotation and the step-back on down, which is what frees it.
 */
export function stickMoveFor(g: StickGesture, r: StickRead): { move: StickMove; side: 'left' | 'right' | null } | null {
  const hand = r.hand ?? 'Right';
  const toward: 'left' | 'right' = hand === 'Right' ? 'right' : 'left';
  const away: 'left' | 'right' = hand === 'Right' ? 'left' : 'right';
  const escape = !!r.escape;
  switch (g.kind) {
    case 'flick': {
      // mirror x into the ball-right frame, then read the eight ways there
      const tx = hand === 'Right' ? g.x : -g.x;
      const d8 = dir8Of(tx, g.y);
      if (d8 === 'right') return { move: 'hesi', side: null };
      if (d8 === 'left') return { move: 'between_legs', side: away };
      if (d8 === 'upleft') return { move: escape ? 'momentum_cross' : 'crossover', side: away };
      if (d8 === 'up') return { move: 'in_and_out', side: toward };
      if (d8 === 'downleft') return { move: escape ? 'momentum_btb' : 'behind_back', side: away };
      if (d8 === 'down') return { move: escape ? 'snatchback' : 'stepback', side: away };
      if (d8 === 'upright') return { move: 'size_up', side: toward };
      return null;   // down-toward: no 2K dribble move lives there (the eurostep is a finish, read at the rim)
    }
    case 'hold': return null;   // a parked stick is PAUSIN' (the mode freezes the dribble on it)
    case 'sweep': return { move: escape ? 'steezo_roll' : 'spin', side: g.sign > 0 ? 'right' : 'left' };
    case 'release': return null;
  }
}
/** The size-up cycle: each up-diagonal flick pulls the next animation from the package (2K: "flick repeatedly for
 *  size-ups"), no travel — the yoyo, the in-and-out, the between-the-legs, then round again. */
export const SIZE_UP_CYCLE = ['bball_yoyo', 'bball_in_and_out_{side}', 'bball_between_legs_{side}'] as const;
export function sizeUpClip(n: number, side: 'left' | 'right'): string {
  return SIZE_UP_CYCLE[((n % SIZE_UP_CYCLE.length) + SIZE_UP_CYCLE.length) % SIZE_UP_CYCLE.length].replace('{side}', side);
}
/** A step-back dribble opens this window: a squeeze inside it is the STEP-BACK jumper whatever the left stick says. */
export const STEPBACK_WINDOW_SEC = 0.6;

/** PAUSIN' (the 2K21 park spin dunk — owner: "a spin move dunk that kinda defies logic and physics"): the sweep (the spin)
 *  thrown with the turbo, inside dunk range, at pace, becomes the takeoff itself — no gather, the body spins THROUGH the
 *  rise into the flush, and a body in the lane makes it a contact dunk. Off the turbo or out of range it is the roll. */
export const PAUSIN = { range: 4.2, minSpeed: 2.2, minTurbo: 0.08 } as const;
export function pausinWanted(r: { sprint: boolean; dist: number; speed: number; turbo01: number }): boolean {
  return r.sprint && r.turbo01 >= PAUSIN.minTurbo && r.dist <= PAUSIN.range && r.speed >= PAUSIN.minSpeed;
}
