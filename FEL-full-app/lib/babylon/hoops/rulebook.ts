// ONE RULEBOOK (hoops phase 9, lane/hoops-p09; the play audit's sinkers 2–6 and 10, HOOPS-AAA-GAP-PLAY §4 / §6 moves 2 and 3).
//
// The play audit found that a roll, not the player, decided too much of each play: a green missed one time in four, a random
// presser made as many open threes as the rival, a move beat a man one time in ten whatever he was doing, and the rival shot off a
// table of his own. This module is the rules that replace those rolls, each behind its own feel knob (group "Hoops · one rulebook")
// whose OFF value puts today's behaviour back exactly:
//
//   THE SHOT (hoops.skillShotOn): the release decides. A release inside the green goes in; outside it, it misses — and how far
//     outside says how it misses (a rim-out just past the edge, a brick far off; early is short, late is long). The contest at the
//     release and the distance only ever make the green NARROWER (the meter already did both; the release's own contest now counts
//     too, so a closeout during the gather costs you). Tired legs and a cold run shrink it a little, a hot run and called glass
//     widen it a little — the same things that moved the make chance before, now moving the window instead. A finish nobody is
//     contesting (hoops.freeFinishContest) goes in however it was timed: an open layup is not a timing test.
//   THE GREEN (hoops.jumpGreenScale): the jump shots' green is this share of today's width — SHIPPED at 1 (today's width, coordinator
//     2026-11-12: the rule removes the luck without costing a decent player points); the proposal for the owner's session is 0.62 (an open jumper's
//     green about 70 ms instead of 105–117 ms). Finishes keep their own bars.
//   THE AI SHOOTS THE SAME SHOT (hoops.aiSharedShotOn): the 1v1 rival, the 3v3 rivals and my 3v3 teammates release on the same
//     meter, graded and decided by the same rule; what differs is their HAND — a timing error drawn from a spread per level
//     (hoops.aiTiming*Ms), widened when the rival is behind and forcing it and tightened when he is protecting a lead (core/Nerve).
//   A MOVE READS THE MAN (hoops.moveReadOn): a dribble move or a fake beats the defender only when he is off balance, lunging at
//     you, or moving the wrong way; against a set man it just keeps the ball safe. No roll.
//   THE CLOSEOUT ON THE GATHER (hoops.gatherCloseoutOn): the on-ball AI steps up on a jump-shot gather after his tier's reaction
//     time, to hoops.gatherCloseoutM off the shooter (the pull-up three was the one tactic that won at every tier).
//   A PRESS NEVER PAYS WORSE THAN NO PRESS (hoops.pressFloorOn): a showtime flush or a trick dunk pressed at the wrong moment is paid
//     at least what not pressing pays.
//
// Pure: no Babylon scene, no BasketballCore at runtime (DefenderBrain reads this module). The shot window that needs the ShotMeter is
// in core/SharedShot.ts.
import { feel } from '../../feel-panel/feel';
import type { ShotQuality, ShotStyle } from '../core/BasketballCore';
import type { Tier } from '../core/Difficulty';
import { PERFECT_BAND_SHARE } from '../core/shotBands';

// ── the knobs (every one NEW; the OFF value restores the old behaviour exactly) ──────────────────────────────────────────────
/** 1 = the release decides the shot (inside the green is a make); 0 = the grade's rate and the ring's draw (today). Knob `hoops.skillShotOn`. */
export const SKILL_SHOT_ON = 1;
/** The jump shots' green as a share of today's width. Shipped at 1 (today's width); 0.62 (about 70 ms open) is the PROPOSAL for the owner's
 *  shooting session. Knob `hoops.jumpGreenScale`. */
export const JUMP_GREEN_SCALE = 1;
/** Under the skill model a FINISH's green is also narrowed by the contest, by this much at a full contest (×(1 − k × contest)): the layup
 *  bars are floored (ShotMeter.start's 0.05) so a body on you barely narrowed them, and the rate model's contest bite (CONTEST_PCT_BITE)
 *  was what made a contested layup hard. 0 = no extra narrowing. Knob `hoops.finishContestNarrow`. */
export const FINISH_CONTEST_NARROW = 0.5;
/** A finish with a contest under this goes in whatever its timing (the skill model only). 0 = every finish needs the green. Knob `hoops.freeFinishContest`. */
export const FREE_FINISH_CONTEST = 0.3;
/** 1 = the AI releases on the shared meter with its level's hand; 0 = its own rate tables (today). Knob `hoops.aiSharedShotOn`. */
export const AI_SHARED_SHOT_ON = 1;
/** The AI's timing spread (one standard deviation of its release error, ms) per level. Knobs `hoops.aiTiming{Rookie,Pro,Elite,Mate}Ms`.
 *  Picked against the green they meet: at the shipped width (hoops.jumpGreenScale 1) these hold the rivals' jump-shot make rates where
 *  the spreads 62 / 44 / 32 put them at the proposed 0.62 (the same numbers × 1 / 0.62): the 1v1 rival's jumpers against a set man
 *  17 / 24 / 31 %, the 3v3 rivals' points a shot 0.38 / 0.56 / 0.76 (0.41 / 0.54 / 0.67 before). Narrow the green → tighten these with it. */
export const AI_TIMING_ROOKIE_MS = 100;
export const AI_TIMING_PRO_MS = 71;
export const AI_TIMING_ELITE_MS = 52;
/** My 3v3 teammates' hand, at every difficulty (the difficulty is the other team's). */
export const AI_TIMING_MATE_MS = 71;
/** 1 = a move or a fake beats the man only on a read (off balance, lunging, moving the wrong way); 0 = the odds and the roll (today). Knob `hoops.moveReadOn`. */
export const MOVE_READ_ON = 1;
/** Moving across you faster than this (m/s) the wrong way is a man you can beat — the "set" line the modes already draw (0.6). Knob `hoops.moveLeanMps`. */
export const MOVE_LEAN_MPS = 0.6;
/** Coming at you faster than this (m/s) is a man who has committed — the modes' existing "closing" line (1.4). Knob `hoops.moveCommitMps`. */
export const MOVE_COMMIT_MPS = 1.4;
/** The pass fake: he bites when he stands in the lane to the man you showed, at least this square to it (cos). Knob `hoops.passFakeLaneCos`. */
export const PASS_FAKE_LANE_COS = 0.6;
/** 1 = the on-ball AI closes out on a jump-shot gather; 0 = he holds his arm's-length spot (today). Knob `hoops.gatherCloseoutOn`. */
export const GATHER_CLOSEOUT_ON = 1;
/** …to this far off the shooter (m), on the rim side. Knob `hoops.gatherCloseoutM`. */
export const GATHER_CLOSEOUT_M = 0.8;
/** 1 = a mistimed showtime flush or trick dunk pays at least what no press pays; 0 = today's table. Knob `hoops.pressFloorOn`. */
export const PRESS_FLOOR_ON = 1;

export const skillShotOn = (): boolean => feel('hoops.skillShotOn', SKILL_SHOT_ON) >= 0.5;
export const aiSharedShotOn = (): boolean => feel('hoops.aiSharedShotOn', AI_SHARED_SHOT_ON) >= 0.5;
export const moveReadOn = (): boolean => feel('hoops.moveReadOn', MOVE_READ_ON) >= 0.5;
export const gatherCloseoutOn = (): boolean => feel('hoops.gatherCloseoutOn', GATHER_CLOSEOUT_ON) >= 0.5;
export const gatherCloseoutM = (): number => feel('hoops.gatherCloseoutM', GATHER_CLOSEOUT_M);
export const pressFloorOn = (): boolean => feel('hoops.pressFloorOn', PRESS_FLOOR_ON) >= 0.5;
export const freeFinishContest = (): number => feel('hoops.freeFinishContest', FREE_FINISH_CONTEST);
export const moveLeanMps = (): number => feel('hoops.moveLeanMps', MOVE_LEAN_MPS);
export const moveCommitMps = (): number => feel('hoops.moveCommitMps', MOVE_COMMIT_MPS);
export const passFakeLaneCos = (): number => feel('hoops.passFakeLaneCos', PASS_FAKE_LANE_COS);

// ── the shot ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The jump shots (the distance narrowing's own set, ShotWindow): the styles the green scale touches. */
const JUMP_SHOTS: ReadonlySet<ShotStyle> = new Set<ShotStyle>(['jumper', 'fadeaway']);
export const isJumpShot = (style: ShotStyle): boolean => JUMP_SHOTS.has(style);
/** The factor (≤ 1) a jump shot's green is narrowed by (1 for every finish). */
export function jumpGreenScale(style: ShotStyle): number {
  return isJumpShot(style) ? Math.max(0.5, Math.min(1, feel('hoops.jumpGreenScale', JUMP_GREEN_SCALE))) : 1;
}
/** The factor (≤ 1) this shot's green is narrowed by on top of the meter's own contest and distance narrowing: a jump shot's green scale;
 *  a finish's contest narrowing (the skill model only). Read through ShotMeter.narrowBy (floored there at 0.5). */
export function greenScaleFor(style: ShotStyle, contest: number): number {
  if (isJumpShot(style)) return jumpGreenScale(style);
  if (!skillShotOn()) return 1;
  return Math.max(0.5, 1 - feel('hoops.finishContestNarrow', FINISH_CONTEST_NARROW) * Math.max(0, Math.min(1, contest)));
}

/**
 * Where a release sat against its green, in seconds (− early, + late), made consistent with its grade. Nearly every release comes off
 * the meter, so the offset IS the meter's; a release graded off the meter (the hop's own release, 'held' at the green's centre; a brick)
 * gets the offset its grade names, so a grade and an offset can never disagree.
 */
export function offsetForGrade(quality: ShotQuality, offsetSec: number, halfSec: number): number {
  const h = Math.max(1e-4, halfSec), off = Number.isFinite(offsetSec) ? offsetSec : 0, a = Math.abs(off);
  switch (quality) {
    case 'perfect': return a <= h * PERFECT_BAND_SHARE ? off : 0;
    case 'good': return a <= h && a >= h * PERFECT_BAND_SHARE * 0.999 ? off : (off < 0 ? -1 : 1) * h * 0.68;
    case 'early': return off < -h ? off : -h * 1.3;
    case 'late': case 'held': return off > h ? off : h * 1.3;
    case 'brick': default: return Math.max(off, h * 3);
  }
}

export interface ReleaseWindowMods {
  /** The turbo tank run empty (0 fresh … 1 gassed) — HoopsDefense.fatiguePct's own input. */
  fatigue01?: number;
  /** MomentumBus.multiplier() (0.94 cold … 1.10 on fire). */
  momentum?: number;
  /** A called-glass bank from inside the band. */
  banked?: boolean;
}
/** What the window's modifiers do: fatigue's FATIGUE_PCT_BITE, the momentum multiplier and the bank's edge, on the WIDTH. */
export function windowModFactor(m: ReleaseWindowMods, fatigueBite: number, bankBonus: number): number {
  const f = 1 - fatigueBite * Math.max(0, Math.min(1, m.fatigue01 ?? 0));
  const mo = Number.isFinite(m.momentum) ? Math.max(0.8, Math.min(1.2, m.momentum as number)) : 1;
  return f * mo * (m.banked ? 1 + bankBonus : 1);
}

export interface SkillVerdictIn {
  quality: ShotQuality;
  /** The release against the green's centre (s; − early). */
  offsetSec: number;
  /** The green's half-width at the release (s), modifiers applied. */
  halfSec: number;
  /** A finish (layup, floater, hook …) rather than a jump shot. */
  finish: boolean;
  /** The contest at the release. */
  contest: number;
  /** The half-width the GRADE was made against (the meter the player saw), when the window has moved since (a closeout, the modifiers).
   *  Defaults to `halfSec`. */
  gradeHalfSec?: number;
}
export interface SkillVerdict {
  made: boolean;
  /** |offset| / half-width: < 1 inside the green (0 dead centre); > 1 outside it. A free finish reads at most 0.95. */
  closeness: number;
  /** Which rule decided it, for the log and the tests. */
  why: 'green' | 'outside' | 'freeFinish' | 'brick';
}
/** THE RULE, in one sentence: a release inside the green goes in and one outside it misses; the contest and the distance shrink the
 *  green, and an uncontested finish goes in however it was timed. No draw. */
export function skillVerdict(s: SkillVerdictIn): SkillVerdict {
  const h = Math.max(1e-4, s.halfSec);
  const off = offsetForGrade(s.quality, s.offsetSec, s.gradeHalfSec && s.gradeHalfSec > 0 ? s.gradeHalfSec : h);
  const closeness = Math.abs(off) / h;
  if (s.finish && s.contest < freeFinishContest()) return { made: true, closeness: Math.min(0.95, closeness), why: 'freeFinish' };
  if (s.quality === 'brick') return { made: false, closeness: Math.max(closeness, 3), why: 'brick' };
  return closeness <= 1 ? { made: true, closeness, why: 'green' } : { made: false, closeness, why: 'outside' };
}

// ── the AI's hand ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type AiShooter = Tier | 'mate';
/** One standard deviation of this shooter's release error (s). `mistake` is core/Nerve's (1 neutral; behind and forcing > 1, protecting
 *  a lead < 1): it scales the spread, clamped to [0.5, 2] — the same clamp the old divisor used at its low end. */
export function aiTimingSigmaSec(who: AiShooter, mistake = 1): number {
  const ms = who === 'rookie' ? feel('hoops.aiTimingRookieMs', AI_TIMING_ROOKIE_MS)
    : who === 'elite' ? feel('hoops.aiTimingEliteMs', AI_TIMING_ELITE_MS)
    : who === 'mate' ? feel('hoops.aiTimingMateMs', AI_TIMING_MATE_MS)
    : feel('hoops.aiTimingProMs', AI_TIMING_PRO_MS);
  const m = Number.isFinite(mistake) ? Math.max(0.5, Math.min(2, mistake)) : 1;
  return (ms / 1000) * m;
}
/** A standard normal from a uniform source (Box–Muller; two draws). The AI's thumb: the only draw in the AI's shot. */
export function gaussFrom(rand: () => number): number {
  let u = rand(), v = rand();
  if (!(u > 1e-12)) u = 1e-12;
  if (!Number.isFinite(v)) v = 0;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
/** The error function (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7): the chance a gaussian hand lands inside a window. */
export function erf(x: number): number {
  const s = x < 0 ? -1 : 1, a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152073) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}
/** P(|N(0, sigma)| ≤ half): an AI's (or any gaussian hand's) chance of releasing inside a green of this half-width. */
export function insideChance(halfSec: number, sigmaSec: number): number {
  if (!(sigmaSec > 0)) return halfSec > 0 ? 1 : 0;
  return erf(Math.max(0, halfSec) / (sigmaSec * Math.SQRT2));
}

// ── a move reads the man ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** What the defender is doing at the press, in the HANDLER's frame. */
export interface ManRead {
  /** His planar speed AT the handler (m/s, + = coming at him). */
  closingMps: number;
  /** His planar speed across the handler (m/s, + = to the handler's right). */
  lateralMps: number;
  /** He cannot react: in the air, stunned, recovering from a reach or a bite. */
  offBalance: boolean;
  /** The side the move takes the ball and the body (null: a move with no side, e.g. a jab straight at him). */
  moveSide: 'left' | 'right' | null;
  /** hoops-builder (owner 2026-11-12): the handler's handle rating as a share of the "moving the wrong way" line (ratings.ts
   *  moveLeanScale; < 1 = he is beaten on a smaller lean). Absent = 1: today's line, exactly. */
  leanScale?: number;
}
export type ReadVerdict = { beat: boolean; why: 'offBalance' | 'committed' | 'wrongWay' | 'set' };
/** A move beats the man when he is off balance, coming at you (committed), or moving across you the wrong way; otherwise he holds and
 *  the move just keeps the ball safe. (How HARD he goes down stays the handle's call: HandleSystem.isHardBreak, as before.) */
export function readTheMan(r: ManRead): ReadVerdict {
  const wrongWay = r.moveSide !== null && (r.moveSide === 'right' ? -r.lateralMps : r.lateralMps) >= moveLeanMps() * (r.leanScale ?? 1);
  if (r.offBalance) return { beat: true, why: 'offBalance' };
  if (wrongWay) return { beat: true, why: 'wrongWay' };
  if (r.closingMps >= moveCommitMps()) return { beat: true, why: 'committed' };
  return { beat: false, why: 'set' };
}
/** The defender's velocity read in the handler's frame (yaw: the handler's facing, Babylon's +z forward / +x right at yaw 0). */
export function manReadFrom(handler: { x: number; z: number }, handlerYaw: number, def: { x: number; z: number }, defVel: { x: number; z: number },
  offBalance: boolean, moveSide: 'left' | 'right' | null): ManRead {
  const dx = handler.x - def.x, dz = handler.z - def.z, L = Math.hypot(dx, dz);
  const closingMps = L < 1e-4 ? 0 : (defVel.x * dx + defVel.z * dz) / L;
  const rx = Math.cos(handlerYaw), rz = -Math.sin(handlerYaw);   // anim/athleteSide.athleteRight
  return { closingMps, lateralMps: defVel.x * rx + defVel.z * rz, offBalance, moveSide };
}

// ── a press never pays worse than no press ───────────────────────────────────────────────────────────────────────────────────
/** The rate a timed press is paid: with the floor on, never below what not pressing pays. */
export function pressFloored(pressPct: number, noPressPct: number): number {
  return pressFloorOn() ? Math.max(pressPct, noPressPct) : pressPct;
}
