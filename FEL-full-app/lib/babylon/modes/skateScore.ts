// SKATE-SCORE (2026-09-29) — the eye's skate scoring findings on 9096d7cf, as the numbers and the bookkeeping SkateRunMode
// wires in. Pure: no Babylon, no DOM, so every rule here is tested on its own (skateScore.test.ts).
//
//   SK-1  a grab scored nothing: AirControl keeps only flips and spins in the air's chain, so a grab was paid on the spot as
//         a nameless 'GRAB' worth only its hold (40 a second: an INDY held half a second paid 20), the landing called it
//         "clean (0 tricks)" and the card never counted it. A grab is a LINK of the air now (GrabBook): thrown into the chain
//         with its named points, the hold added when it is let go, graded with the rest of the air at the landing.
//   SK-2  every spin that finished bailed: AirControl grades the body's spin against a WHOLE turn, so a 180 landed exactly
//         (the board under the rider, rolling fakie — which the mode then counts as switch) read as the worst landing there is.
//         Skate grades the spin to the nearest HALF turn (skateLandingError01); the flip and the pitch keep the whole turn.
//   SK-3  the card counted bails: `landedTotal` took every touchdown's chain before the grade was read. LandedTricks counts a
//         clean landing's chain, a sketchy one's once the save holds, and never a bail's.
//   SK-5  a standstill pop flew 2.2 m for 1.3 s: the pop's launch now scales with the roll (popVy), and "big air" is air
//         bigger than the pop that made it (isBigAir), so a flat ollie, however charged, is never the spectacle.
//
// Snow, surf and the kart never import this: AirControl, LandingSystem and BoardTricks behave exactly as they did.
import { GRAB_LANDING_TAX, type AirState, type AirTrick } from '../core/AirControl';
import type { LandingGrade } from '../core/LandingSystem';
import type { BoardTrick } from '../core/BoardTricks';
import { airLeftSec, fitsAirLeft } from './gateCrasher';   // GATE-CRASHER-POLISH-2 (GC-2): the air left, and whether a trick's motion fits it

/** GroundRide's gravity (m/s²); the skate rig does not override it. */
export const SKATE_GRAVITY = 14;

const TWO_PI = Math.PI * 2;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
/** 0..1 off the nearest WHOLE turn — AirControl's own measure (0 level, 1 upside down). */
const offTurn = (a: number): number => Math.abs(((a % TWO_PI) + TWO_PI * 1.5) % TWO_PI - Math.PI) / Math.PI;
/** 0..1 off the nearest HALF turn, on the same scale per degree: within 90° of level the two agree exactly. */
const offHalfTurn = (a: number): number => {
  const r = ((a % Math.PI) + Math.PI) % Math.PI;
  return Math.min(r, Math.PI - r) / Math.PI;
};

// ── SK-2: the landing ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * How far from clean a skate landing is, 0..1 — AirControl.landingError01's formula term for term (rotation 0.65, residual
 * spin 0.25, the late-grab tax), except that the BODY's spin is measured to the nearest half turn. A board that came round
 * 180° is under the rider, rolling fakie; a board flipped 180° is upside down, so the flip (z) and the pitch (x) keep the
 * whole turn. A board 90° across still reads 0.5, as it always did.
 */
export function skateLandingError01(s: AirState): number {
  const rotErr = Math.max(offHalfTurn(s.rotation.y), offTurn(s.rotation.z), offTurn(s.rotation.x) * 0.7);
  const spinErr = Math.min(1, s.angularVel.length() / 9);
  const grabTax = s.grabHeld && s.grabTime > 1.2 ? GRAB_LANDING_TAX : 0;
  return Math.min(1, rotErr * 0.65 + spinErr * 0.25 + grabTax);
}

/**
 * The air a rider has LEFT, seconds: the fall from `height` metres above the ground he took off from, rising at `vy`
 * (Gate Crasher's airLeftSec, over flat ground).
 */
export function skateAirLeft(height: number, vy: number): number {
  return airLeftSec(height, vy, 0, SKATE_GRAVITY);
}

/**
 * The WHOLE of this air, seconds — what has flown plus what is left — which is the scale BoardTricks' `airSec` is written in
 * ("against skate's 0.93 s (no charge) / 1.12 s (half) / 1.31 s (full)": a BS 180 off any rolling pop, the JAPAN AIR and the
 * FS 360 off a half-charged one, the 540 only fully charged). It was a fixed 0.95 s minus the airtime: every charged pop
 * judged as an uncharged one (so Y threw nothing) and a trick thrown a third of the way up judged against two thirds of it.
 * The floor (0.25 s) is the old budget's: under every trick in the table.
 */
export function skateAirBudget(elapsed: number, left: number): number {
  return Math.max(0.25, elapsed + left);
}

/**
 * The trick a press throws with this air: the table's pick for the whole air (`pick(budget)`), stepped down the table while
 * its motion cannot finish before the ground (gateCrasher.fitsAirLeft: the motion plus a frame of headroom inside `left`),
 * else null — answered NOT ENOUGH AIR by the mode. SSX's rule, as Gate Crasher's GC-2 has it for snow.
 */
export function fitToAir(pick: (budget: number) => BoardTrick | null, budget: number, left: number): BoardTrick | null {
  let b = budget;
  for (let i = 0; i < 12; i++) {
    const t = pick(b);
    if (!t) return null;
    if (fitsAirLeft(t, left)) return t;
    b = t.airSec - 1e-6;
  }
  return null;
}

// ── SK-5: the pop ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** The ROLLING ollie's launch (m/s), unchanged: GroundRide.jump sets vel.y = 5 + p·5.5 with p = 0.27 + charge·0.49 — the
 *  pop the owner raised on 2026-09-17 (1.50 m / 0.93 s uncharged, 2.20 m / 1.12 s half, 3.01 m / 1.31 s full). */
export function rollingPopVy(charge01: number): number {
  return 5 + (0.27 + clamp01(charge01) * 0.49) * 5.5;
}
/** SK-5: the roll (m/s) at which the pop is the full rolling ollie — about two pushes (cruise is 8.96). */
export const POP_FULL_SPEED = 4.5;
/** SK-5: a standing pop's launch as a share of the rolling one. Height goes with its square: a quarter of the height, half
 *  the hang — 0.38 m / 0.46 s uncharged, 0.75 m / 0.66 s fully crouched. */
export const STAND_POP_SHARE = 0.5;
/** The pop's launch (m/s) at this speed (m/s) and crouch (0..1): the standing hop, rising linearly to the rolling ollie at
 *  POP_FULL_SPEED and flat above it. */
export function popVy(speed: number, charge01: number): number {
  const k = clamp01(speed / POP_FULL_SPEED);
  return rollingPopVy(charge01) * (STAND_POP_SHARE + (1 - STAND_POP_SHARE) * k);
}
/** Apex height (m) of a launch over flat ground. */
export const popHeight = (vy: number, g = SKATE_GRAVITY): number => (vy * vy) / (2 * g);
/** Hang (s) of a launch over flat ground. */
export const popHang = (vy: number, g = SKATE_GRAVITY): number => (2 * vy) / g;

/** SK-5: how much further than its own pop an apex has to be off the ground under it to be BIG AIR — the ground fell away
 *  (a drop, a gap, off the top of a bank). */
export const BIG_AIR_OVER_POP_M = 0.8;
/** The old floor stays: nothing under 1.15 m is ever big air. */
export const BIG_AIR_MIN_M = 1.15;
/** SK-5: is this apex big air? `aboveGround` = metres from the apex to the ground actually under it; `popApex` = the height
 *  this air's pop reaches over flat ground (0 for an air no pop made). A flat ollie is never big air, however charged. */
export function isBigAir(aboveGround: number, popApex: number): boolean {
  return aboveGround > BIG_AIR_MIN_M && aboveGround >= popApex + BIG_AIR_OVER_POP_M;
}

// ── SK-1: the grab ────────────────────────────────────────────────────────────────────────────────────────────────────

/** The grab thrown, as the mode names it: the trick's id, label, points and difficulty. */
export type GrabThrow = Pick<AirTrick, 'id' | 'label' | 'basePts' | 'difficulty'>;

/**
 * The grab in the air's chain. `thrown` puts it in the chain the moment it is thrown (so a line reads in the order it was
 * done), paid its named points; `letGo` adds what the hold earned, whichever way it ends — its release, the rail, the wall
 * or the touchdown. The chain is the one the landing grades, so a grab is paid, counted and burned exactly as a flip is.
 */
export class GrabBook {
  private link: AirTrick | null = null;
  thrown(chain: AirTrick[], g: GrabThrow): AirTrick {
    const link: AirTrick = { id: g.id, label: g.label, family: 'grab', basePts: g.basePts, difficulty: g.difficulty };
    chain.push(link);
    this.link = link;
    return link;
  }
  /** The hold's points join the grab's link, if that link is still in this air's chain (a new air starts a new chain). */
  letGo(chain: readonly AirTrick[], holdPts: number): void {
    if (this.link && chain.includes(this.link) && holdPts > 0) this.link.basePts += holdPts;
    this.link = null;
  }
  reset(): void { this.link = null; }
}

// ── SK-3: the count on the card ───────────────────────────────────────────────────────────────────────────────────────

/**
 * The tricks a run LANDED (the card's "N TRICKS"): a clean landing's chain when it lands; a sketchy landing's once its save
 * holds (none if the save fails); never a bail's. A bail also drops a sketchy landing still waiting on its save.
 */
export class LandedTricks {
  total = 0;
  private pending = 0;
  touchdown(grade: LandingGrade, chainLen: number): void {
    if (grade === 'clean') this.total += chainLen;
    else if (grade === 'sketchy') this.pending += chainLen;
    else this.pending = 0;
  }
  saveResolved(saved: boolean): void {
    if (saved) this.total += this.pending;
    this.pending = 0;
  }
  reset(): void { this.total = 0; this.pending = 0; }
}
