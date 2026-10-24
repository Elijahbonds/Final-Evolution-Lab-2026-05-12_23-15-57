/**
 * lib/babylon/core/HoopsBlocks.ts — HOOPS-BLOCK-SET BLK-1: the block selector core (1v1 and 3v3), rebuilt from PR #274 on current
 * release (lane/hoops-def-tell, owner decision 2026-10-23: every number a feel knob, group "Hoops · blocks").
 *
 * PURE: no mode wiring yet, no RNG inside the selector (the foul roll takes an injected rng). Spec: HOOPS-BLOCK-SET.md §2 (order),
 * §3 (windows), §4 (fouls), with the PM decisions of 2026-10-13 (rare set = chase-down, pin, catch) and 2026-10-14 (the late press).
 * NOT IN PLAY: BLK-2 wires it into the modes, and that wiring waits on T-B (the contest window: the press-timing anchor `tPressMs` is
 * read against). Until then the knobs below move nothing in a game; the selector's own tests and the lane's seeded-contest sim read them.
 *
 * Every window is TUNED (new — #274's estimates, to verify live). The anchor is the shooter's release for a rising ball, or the arc's
 * apex when the ball is falling; `tPressMs` is the jump press relative to it. A window edge counts as inside (≤).
 */
import { BODY_STANDOFF } from './BasketballCore';
import { BODY_HARD_GAP } from './BodySeparation';   // #273 T-C's floor: a block through it is the likeliest foul
import { feel } from '../../feel-panel/feel';   // feel-panel knobs, group "Hoops · blocks" (lib/feel-panel/knobs.ts)

export type BlockType = 'swat' | 'spike' | 'chase' | 'pin' | 'catch' | 'contest' | 'goaltend';
export type RareBlock = 'chase' | 'pin' | 'catch';
export type ArcPhase = 'rising' | 'apex' | 'falling';
export type BlockShot = 'jumper' | 'layup' | 'dunk' | 'bank' | 'floater' | 'hook' | 'fadeaway';

/** A timing window: centre T (ms vs the anchor) ± half. */
export interface BlockWindow { t: number; half: number }

// ── §3 windows: TUNED (new, #274). Each centre and half-width is a knob `hoops.blk<Type>TMs` / `hoops.blk<Type>HalfMs`. ──
export const BLK_CONTEST_T_MS = -150;   // any press −450 … +150
export const BLK_CONTEST_HALF_MS = 300;
export const BLK_SWAT_T_MS = -120;
export const BLK_SWAT_HALF_MS = 120;
export const BLK_SPIKE_T_MS = -60;
export const BLK_SPIKE_HALF_MS = 80;
export const BLK_CHASE_T_MS = 40;
export const BLK_CHASE_HALF_MS = 70;
export const BLK_PIN_T_MS = 120;
export const BLK_PIN_HALF_MS = 60;
export const BLK_CATCH_T_MS = -40;
export const BLK_CATCH_HALF_MS = 42;

/** The shipped windows, together. */
export const BLOCK_WINDOWS: Readonly<Record<'contest' | 'swat' | 'spike' | 'chase' | 'pin' | 'catch', BlockWindow>> = {
  contest: { t: BLK_CONTEST_T_MS, half: BLK_CONTEST_HALF_MS },
  swat: { t: BLK_SWAT_T_MS, half: BLK_SWAT_HALF_MS },
  spike: { t: BLK_SPIKE_T_MS, half: BLK_SPIKE_HALF_MS },
  chase: { t: BLK_CHASE_T_MS, half: BLK_CHASE_HALF_MS },
  pin: { t: BLK_PIN_T_MS, half: BLK_PIN_HALF_MS },
  catch: { t: BLK_CATCH_T_MS, half: BLK_CATCH_HALF_MS },
};
export type BlockWindows = { readonly [K in keyof typeof BLOCK_WINDOWS]: BlockWindow };

/** TUNED (new): a held press at least this long at the contact frame can catch (ms). Knob `hoops.blkHoldMs`. */
export const HOLD_MS = 220;
/** TUNED (new): the catch meter fills over this much hold; the sweet spot is HOLD_MS … CATCH_METER_FULL_MS (ms). Knob `hoops.blkCatchMeterFullMs`. */
export const CATCH_METER_FULL_MS = 320;
/** The swat's ranges (m) — today's BLOCK_RANGE 1.5 on a layup, 1.2 on a jumper. Knobs `hoops.blkSwatRangeLayupM` / `hoops.blkSwatRangeJumperM`. */
export const SWAT_RANGE_LAYUP = 1.5;
export const SWAT_RANGE_JUMPER = 1.2;
/** TUNED (new): the catch — square (deg) and close (m). Knobs `hoops.blkCatchMaxAngleDeg` / `hoops.blkCatchMaxDistM`. */
export const CATCH_MAX_ANGLE = 35;
export const CATCH_MAX_DIST = 1.1;
/** TUNED (new): the spike — square (deg), rising. Knob `hoops.blkSpikeMaxAngleDeg`. */
export const SPIKE_MAX_ANGLE = 30;
/** TUNED (new): the pin — the ball near the glass (m). Knob `hoops.blkPinGlassMaxM`. */
export const PIN_GLASS_MAX = 0.9;
/** Frames at 60 fps. */
export const FRAME_MS = 1000 / 60;

// ── §4 fouls: TUNED (new, #274). Three independent causes, the highest used. ──
/** A block from more than this off square, in front, risks the foul (deg). Knob `hoops.blkFoulAngleDeg`. */
export const FOUL_BAD_ANGLE_DEG = 60;
/** …at this chance. Knob `hoops.blkFoulAnglePct`. */
export const FOUL_BAD_ANGLE_PCT = 0.25;
/** A block with the bodies inside BODY_HARD_GAP (0.90 m) is a foul this often. Knob `hoops.blkFoulHardGapPct`. */
export const FOUL_HARD_GAP_PCT = 0.5;
/** …inside BODY_STANDOFF (1.10 m), this often. Knob `hoops.blkFoulStandoffPct`. */
export const FOUL_STANDOFF_PCT = 0.15;
/** LATE PRESS (PM reading, 2026-10-14): a press after the swat window closes but still during the shooter's release — inside this
 *  margin past the swat window's end — that makes contact is a foul (ms). Knob `hoops.blkFoulLateMarginMs`. */
export const FOUL_LATE_MARGIN_MS = 100;
/** …at this chance. Knob `hoops.blkFoulLatePct`. */
export const FOUL_LATE_PCT = 0.35;

/** The live numbers (the constants unless a playtest override is live). */
export interface BlockTune {
  windows: BlockWindows; holdMs: number; catchMeterFullMs: number; swatRangeLayup: number; swatRangeJumper: number;
  catchMaxAngle: number; catchMaxDist: number; spikeMaxAngle: number; pinGlassMax: number;
  foulAngleDeg: number; foulAnglePct: number; foulHardGapPct: number; foulStandoffPct: number; foulLateMarginMs: number; foulLatePct: number;
}
export function liveBlockTune(): BlockTune {
  return {
    windows: {
      contest: { t: feel('hoops.blkContestTMs', BLK_CONTEST_T_MS), half: feel('hoops.blkContestHalfMs', BLK_CONTEST_HALF_MS) },
      swat: { t: feel('hoops.blkSwatTMs', BLK_SWAT_T_MS), half: feel('hoops.blkSwatHalfMs', BLK_SWAT_HALF_MS) },
      spike: { t: feel('hoops.blkSpikeTMs', BLK_SPIKE_T_MS), half: feel('hoops.blkSpikeHalfMs', BLK_SPIKE_HALF_MS) },
      chase: { t: feel('hoops.blkChaseTMs', BLK_CHASE_T_MS), half: feel('hoops.blkChaseHalfMs', BLK_CHASE_HALF_MS) },
      pin: { t: feel('hoops.blkPinTMs', BLK_PIN_T_MS), half: feel('hoops.blkPinHalfMs', BLK_PIN_HALF_MS) },
      catch: { t: feel('hoops.blkCatchTMs', BLK_CATCH_T_MS), half: feel('hoops.blkCatchHalfMs', BLK_CATCH_HALF_MS) },
    },
    holdMs: feel('hoops.blkHoldMs', HOLD_MS),
    catchMeterFullMs: feel('hoops.blkCatchMeterFullMs', CATCH_METER_FULL_MS),
    swatRangeLayup: feel('hoops.blkSwatRangeLayupM', SWAT_RANGE_LAYUP),
    swatRangeJumper: feel('hoops.blkSwatRangeJumperM', SWAT_RANGE_JUMPER),
    catchMaxAngle: feel('hoops.blkCatchMaxAngleDeg', CATCH_MAX_ANGLE),
    catchMaxDist: feel('hoops.blkCatchMaxDistM', CATCH_MAX_DIST),
    spikeMaxAngle: feel('hoops.blkSpikeMaxAngleDeg', SPIKE_MAX_ANGLE),
    pinGlassMax: feel('hoops.blkPinGlassMaxM', PIN_GLASS_MAX),
    foulAngleDeg: feel('hoops.blkFoulAngleDeg', FOUL_BAD_ANGLE_DEG),
    foulAnglePct: feel('hoops.blkFoulAnglePct', FOUL_BAD_ANGLE_PCT),
    foulHardGapPct: feel('hoops.blkFoulHardGapPct', FOUL_HARD_GAP_PCT),
    foulStandoffPct: feel('hoops.blkFoulStandoffPct', FOUL_STANDOFF_PCT),
    foulLateMarginMs: feel('hoops.blkFoulLateMarginMs', FOUL_LATE_MARGIN_MS),
    foulLatePct: feel('hoops.blkFoulLatePct', FOUL_LATE_PCT),
  };
}

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
export const catchMeter = (holdMs: number, tune: BlockTune = liveBlockTune()): number => Math.max(0, Math.min(1, holdMs / tune.catchMeterFullMs));

/** §2: the one selector. First match wins; the order is by window width, tightest first. `tune` pins the numbers (tests); left out,
 *  it reads them live. */
export function selectBlock(i: BlockInput, gates: BlockGates, tune: BlockTune = liveBlockTune()): BlockType {
  const W = tune.windows;
  // 1. goaltend before everything (never a catch or a pin)
  if (i.reachable && i.ballY > i.rimY && (i.phase === 'falling' || i.inCylinder)) return 'goaltend';
  // 2. not reachable, or outside EVERY window → contest (the pin's window runs past the contest window's +150 end)
  if (!i.reachable || !Object.values(W).some((w) => inWindow(i.tPressMs, w))) return 'contest';
  // 3. catch
  if (gates.catch && i.holdMs >= tune.holdMs && inWindow(i.tPressMs, W.catch) && i.phase !== 'falling' && !i.behind
    && i.angleDeg <= tune.catchMaxAngle && i.dist <= tune.catchMaxDist) return 'catch';
  // 4. pin
  if (gates.pin && (i.shot === 'layup' || i.shot === 'bank' || i.shot === 'floater') && i.phase === 'rising' && i.glassDist <= tune.pinGlassMax
    && inWindow(i.tPressMs, W.pin)) return 'pin';
  // 5. chase-down (the only big block from behind)
  if (gates.chase && i.behind && (i.shot === 'layup' || i.shot === 'dunk') && inWindow(i.tPressMs, W.chase)) return 'chase';
  if (i.behind) return 'contest';
  // 6. spike
  if (i.phase === 'rising' && i.angleDeg <= tune.spikeMaxAngle && i.handAbove && inWindow(i.tPressMs, W.spike)) return 'spike';
  // 7. swat (today's ranges)
  const swatRange = i.shot === 'jumper' || i.shot === 'fadeaway' ? tune.swatRangeJumper : tune.swatRangeLayup;
  if (inWindow(i.tPressMs, W.swat) && i.dist <= swatRange) return 'swat';
  return 'contest';
}

/** The late-press foul: after the swat window closes (strictly), within FOUL_LATE_MARGIN_MS of it (edge inside). */
export function latePress(tPressMs: number, tune: BlockTune = liveBlockTune()): boolean {
  const end = tune.windows.swat.t + tune.windows.swat.half;
  return tPressMs > end && tPressMs <= end + tune.foulLateMarginMs;
}

/** The chance a CONTACT (the hand met the ball or the body; called on the contact frame only — a no-touch contest is never judged)
 *  is a shooting foul: three independent causes, the highest used. A goaltend is never a foul here. `gapM` is the bodies' planar gap. */
export function blockFoulChance(i: BlockInput, type: BlockType, gapM: number, tune: BlockTune = liveBlockTune()): number {
  if (type === 'goaltend') return 0;   // the basket counts (§4)
  const angle = !i.behind && i.angleDeg > tune.foulAngleDeg ? tune.foulAnglePct : 0;
  const body = gapM < feel('hoops.bodyHardGapM', BODY_HARD_GAP) ? tune.foulHardGapPct : gapM < BODY_STANDOFF ? tune.foulStandoffPct : 0;
  const late = latePress(i.tPressMs, tune) ? tune.foulLatePct : 0;
  return Math.max(angle, body, late);
}

/** `blockFoul(i, gapM, rng)`, on the contact frame: the block is waved off as a shooting foul (Ref `shooting_foul`); a foul is never
 *  counted as a block. The type is read through `selectBlock` with the gates given (default: Starter). Rolls `rng` once, only when
 *  the chance is above zero. */
export function blockFoul(i: BlockInput, gapM: number, rng: () => number, gates: BlockGates = STARTER_GATES, tune: BlockTune = liveBlockTune()): boolean {
  const p = blockFoulChance(i, selectBlock(i, gates, tune), gapM, tune);
  return p > 0 && rng() < p;
}
