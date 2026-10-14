/**
 * lib/babylon/core/HoopsBlocks.ts — HOOPS-BLOCK-SET BLK-1: the block selector core (1v1 and 3v3). PURE: no mode wiring, no
 * RNG inside the selector (the foul roll takes an injected rng). Spec: HOOPS-BLOCK-SET.md §2 (order), §3 (windows), §4 (fouls),
 * with the PM decisions of 2026-10-13 (rare set = chase-down, pin, catch).
 *
 * Every window is [TUNE] (an estimate to verify live). The anchor is the shooter's release for a rising ball, or the arc's
 * apex when the ball is falling; `tPressMs` is the jump press relative to it. A window edge counts as inside (≤).
 */
import { BODY_HARD_GAP, BODY_STANDOFF } from './BasketballCore';

export type BlockType = 'swat' | 'spike' | 'chase' | 'pin' | 'catch' | 'contest' | 'goaltend';
export type RareBlock = 'chase' | 'pin' | 'catch';
export type ArcPhase = 'rising' | 'apex' | 'falling';
export type BlockShot = 'jumper' | 'layup' | 'dunk' | 'bank' | 'floater' | 'hook' | 'fadeaway';

/** A timing window: centre T (ms vs the anchor) ± half. */
export interface BlockWindow { t: number; half: number }
/** §3 windows [TUNE]. */
export const BLOCK_WINDOWS: Readonly<Record<'contest' | 'swat' | 'spike' | 'chase' | 'pin' | 'catch', BlockWindow>> = {
  contest: { t: -150, half: 300 },   // any press −450 … +150
  swat: { t: -120, half: 120 },
  spike: { t: -60, half: 80 },
  chase: { t: 40, half: 70 },
  pin: { t: 120, half: 60 },
  catch: { t: -40, half: 42 },
};
/** A held press at least this long at the contact frame can catch [TUNE]. */
export const HOLD_MS = 220;
/** The catch meter fills over this much hold; the sweet spot is HOLD_MS … CATCH_METER_FULL_MS. */
export const CATCH_METER_FULL_MS = 320;
/** The swat's ranges (today's: BLOCK_RANGE 1.5 on a layup, 1.2 on a jumper). */
export const SWAT_RANGE_LAYUP = 1.5;
export const SWAT_RANGE_JUMPER = 1.2;
/** The catch: square, close. */
export const CATCH_MAX_ANGLE = 35, CATCH_MAX_DIST = 1.1;
/** The spike: square, rising. */
export const SPIKE_MAX_ANGLE = 30;
/** The pin: the ball near the glass. */
export const PIN_GLASS_MAX = 0.9;
/** Frames at 60 fps. */
export const FRAME_MS = 1000 / 60;

export interface BlockInput {
  tPressMs: number;
  holdMs: number;
  angleDeg: number;
  dist: number;
  /** Behind the shooter's chest plane and within 1.2 m. */
  behind: boolean;
  phase: ArcPhase;
  glassDist: number;
  ballY: number;
  rimY: number;
  inCylinder: boolean;
  shot: BlockShot;
  /** The hand can touch the ball at all (jump apex + reach). */
  reachable: boolean;
  /** The hand is above the ball (the spike). */
  handAbove: boolean;
}
/** Which rare types this defender may play (locked ones fall through, never to nothing). */
export type BlockGates = Readonly<Record<RareBlock, boolean>>;
export const STARTER_GATES: BlockGates = { chase: false, pin: false, catch: false };

export const inWindow = (tPressMs: number, w: BlockWindow): boolean => Math.abs(tPressMs - w.t) <= w.half;
export const windowWidth = (w: BlockWindow): number => w.half * 2;
export const windowFrames = (w: BlockWindow): number => Math.round(windowWidth(w) / FRAME_MS);
/** The catch meter, 0 → 1 over 0 … CATCH_METER_FULL_MS of hold (full past it). */
export const catchMeter = (holdMs: number): number => Math.max(0, Math.min(1, holdMs / CATCH_METER_FULL_MS));

/** §2: the one selector. First match wins; the order is by window width, tightest first. */
export function selectBlock(i: BlockInput, gates: BlockGates): BlockType {
  // 1. goaltend before everything (never a catch or a pin)
  if (i.reachable && i.ballY > i.rimY && (i.phase === 'falling' || i.inCylinder)) return 'goaltend';
  // 2. not reachable, or outside EVERY window → contest (the pin's window runs past the contest window's +150 end)
  if (!i.reachable || !Object.values(BLOCK_WINDOWS).some((w) => inWindow(i.tPressMs, w))) return 'contest';
  // 3. catch
  if (gates.catch && i.holdMs >= HOLD_MS && inWindow(i.tPressMs, BLOCK_WINDOWS.catch) && i.phase !== 'falling' && !i.behind
    && i.angleDeg <= CATCH_MAX_ANGLE && i.dist <= CATCH_MAX_DIST) return 'catch';
  // 4. pin
  if (gates.pin && (i.shot === 'layup' || i.shot === 'bank' || i.shot === 'floater') && i.phase === 'rising' && i.glassDist <= PIN_GLASS_MAX
    && inWindow(i.tPressMs, BLOCK_WINDOWS.pin)) return 'pin';
  // 5. chase-down (the only big block from behind)
  if (gates.chase && i.behind && (i.shot === 'layup' || i.shot === 'dunk') && inWindow(i.tPressMs, BLOCK_WINDOWS.chase)) return 'chase';
  if (i.behind) return 'contest';
  // 6. spike
  if (i.phase === 'rising' && i.angleDeg <= SPIKE_MAX_ANGLE && i.handAbove && inWindow(i.tPressMs, BLOCK_WINDOWS.spike)) return 'spike';
  // 7. swat (today's ranges)
  const swatRange = i.shot === 'jumper' || i.shot === 'fadeaway' ? SWAT_RANGE_JUMPER : SWAT_RANGE_LAYUP;
  if (inWindow(i.tPressMs, BLOCK_WINDOWS.swat) && i.dist <= swatRange) return 'swat';
  return 'contest';
}

/** §4 foul rates [TUNE]. */
export const FOUL_BAD_ANGLE_DEG = 60, FOUL_BAD_ANGLE_PCT = 0.25;
export const FOUL_HARD_GAP_PCT = 0.5, FOUL_STANDOFF_PCT = 0.15;
/** LATE PRESS (PM reading, 2026-10-14): a press after the swat window closes but still during the shooter's release — inside
 *  this margin past the swat window's end — that makes contact is a foul [TUNE]. */
export const FOUL_LATE_MARGIN_MS = 100;
export const FOUL_LATE_PCT = 0.35;
/** The late-press foul: after the swat window closes (strictly), within FOUL_LATE_MARGIN_MS of it (edge inside). */
export function latePress(tPressMs: number): boolean {
  const end = BLOCK_WINDOWS.swat.t + BLOCK_WINDOWS.swat.half;
  return tPressMs > end && tPressMs <= end + FOUL_LATE_MARGIN_MS;
}

/** The chance a CONTACT (the hand met the ball or the body; called on the contact frame only — a no-touch contest is
 *  never judged) is a shooting foul: three independent causes, the highest used. A goaltend is never a foul here. */
export function blockFoulChance(i: BlockInput, type: BlockType, gapM: number): number {
  if (type === 'goaltend') return 0;   // the basket counts (§4)
  const angle = !i.behind && i.angleDeg > FOUL_BAD_ANGLE_DEG ? FOUL_BAD_ANGLE_PCT : 0;
  const body = gapM < BODY_HARD_GAP ? FOUL_HARD_GAP_PCT : gapM < BODY_STANDOFF ? FOUL_STANDOFF_PCT : 0;
  const late = latePress(i.tPressMs) ? FOUL_LATE_PCT : 0;
  return Math.max(angle, body, late);
}

/** `blockFoul(i, gapM, rng)`, on the contact frame: the block is waved off as a shooting foul (Ref `shooting_foul`); a foul is never counted as a
 *  block. The type is read through `selectBlock` with the gates given (default: Starter). */
export function blockFoul(i: BlockInput, gapM: number, rng: () => number, gates: BlockGates = STARTER_GATES): boolean {
  const p = blockFoulChance(i, selectBlock(i, gates), gapM);
  return p > 0 && rng() < p;
}
