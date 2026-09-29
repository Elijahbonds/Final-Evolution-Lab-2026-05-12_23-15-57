// handlePaths — THE BALL'S PATH THROUGH A HANDLE MOVE (HOOPS MOTION phase 4a, plan §3.2). Pure: no scene, no Babylon.
//
// Phase 3's crossing is a floor POINT (ballCarry's `CrossPoint`: where the ball meets the floor, nothing else): no release, no catch, no
// heights, no timing, and the end is always the dribble's standard point — so a between-the-legs, a behind-the-back or a Shammgod cannot
// be said at all (plan U1), and a same-hand move (the in-and-out, the hesi's float, the yoyo, the jab's pound, PAUSIN's hold) has no
// path of its own (U6). Phase 4's design is that THE BALL LEADS AND THE CLIP FOLLOWS: the carry owns the ball's path through every move
// (a dribbled ball bounces and a clip cannot bounce it), it owns a hand only while that hand touches the ball, and the clip owns the
// rest. This module is the path: where the ball is at any moment of a move, which hand touches it, where each hand should be and how
// hard it reaches. Nothing plays it yet — phase 4b's carry.runMove does.
//
// FRAME AND UNITS (plan §3.2). Points are in the ROOT frame: +x is the athlete's right, +z forward, y up from the root. The keys below
// are written at the default hoops stance — HOOPS_DRIBBLE: the ball's centre at the top of the stroke P 0.98 m, radius r 0.12, side S
// 0.26, forward F 0.16 — and mapped onto a body's own stance (a fitted palm): heights between r and P, laterals by S, forwards by F.
// Times are real seconds at pace 1 and scale with the move's pace (moveRateFor). Every move is written right hand first; a left-hand
// start is its mirror (mirrorPath).
//
// SEGMENTS. push (the start hand on the ball) → flight (no hand: the fall to the floor, the bounce, the rise) → catch (the end hand on
// the ball), plus hold (a hand palms it), float (the hand carries it up into a high, slow top) and pound (a low, hard bounce). A flight
// is BALLISTIC (g) with its speeds solved from its own times, so a faster pace is still a falling ball; every other segment is a cubic
// between keys whose velocities match its neighbours', so the segments join C1 — the floor contact inside a flight is the one corner
// (the bounce). A path started mid-bounce starts from the ball's drawn position and velocity (blendFrom: its fall re-aimed, or the start
// hand meeting it); given the end hand's lock foot, the catch is then stretched or shortened (≤ LOCK_STRETCH of the path) so the bounce
// after it lands on the stride — timed from the request, after the blend.
import { HOOPS_DRIBBLE } from './Dribble';
import { MOVE_SHAPE, type MoveExposure, type MovePath } from '../core/HandleShape';   // (4b: the clip-free half — the carry, and so the dunk, imports this)
import type { HandleMove } from '../core/HandleSystem';

export type Hand = 'right' | 'left';
export interface V3 { x: number; y: number; z: number }
/** A body's dribble stance: P the ball's centre at the top of the stroke (the fitted palm), r the ball's radius, S the dribble's side
 *  offset, F its forward offset (m, root frame). */
export interface HandleStance { P: number; r: number; S: number; F: number }
export const DEFAULT_STANCE: Readonly<HandleStance> = { P: HOOPS_DRIBBLE.palmY, r: HOOPS_DRIBBLE.ballR, S: HOOPS_DRIBBLE.side, F: HOOPS_DRIBBLE.forward };
export type PathSegKind = 'push' | 'flight' | 'catch' | 'hold' | 'float' | 'pound';
/** The moves with a path, plus the two that are not HandleMoves: the triple threat's jab and PAUSIN' (its hold, and its release). */
export type PathMove = HandleMove | 'jab' | 'pausin' | 'pausin_release';

/** Gravity on a flight (m/s²). */
export const PATH_G = 9.81;
/** A hand fades onto the ball over this long before its contact, and off it over this long after (the contact schedule, plan §3.3). */
export const CONTACT_FADE_SEC = 0.06;
/** The shortest catch-and-push a path started mid-bounce meets the drawn ball with (plan §3.2's blend: "over ≤ 0.06 s"). */
export const BLEND_SEC = 0.06;
/** The catch may be stretched or shortened by at most this share of the path to land the next bounce on the lock foot. */
export const LOCK_STRETCH = 0.15;
/** …and never to less than this share of the catch as authored (its own speed bound). */
export const LOCK_MIN_CATCH = 0.75;
/** …nor so short that the catch runs faster than this (m/s — a hand's top speed, ballCarry.HELD_MPS; 0.14 m a 60 fps frame), unless its
 *  authored length is already faster (4b: see relockCatch). */
export const LOCK_CATCH_MAX_MPS = 8.4;
/** The bounce's phase when the lock foot strikes — ballCarry.STRIDE_PHI_AT_STRIKE (a test ties the two; not imported, so the carry can
 *  import this module without a cycle). */
export const PATH_PHI_AT_STRIKE = 0.92;
/** PAUSIN's longest hold (owner Q1, 2026-09-26: 0.9 s, then it releases on its own). */
export const PAUSIN_MAX_SEC = 0.9;
/** Below this the ball is on the midline: a crossing counts once the ball is past it on the new side (crossingsOf). */
export const CROSS_BAND_M = 0.02;

export interface PathSeg {
  kind: PathSegKind; t0: number; t1: number;
  /** The hand on the ball through this segment (null: in the air). */
  hand: Hand | null;
  /** cubic: a Hermite between (p0, v0) and (p1, v1); fall / rise: a ballistic half of a bounce (x, z at constant speed, y under g). */
  mode: 'cubic' | 'fall' | 'rise';
  p0: V3; p1: V3; v0: V3; v1: V3;
}
export interface HandlePath {
  move: PathMove; family: MovePath; startHand: Hand; endHand: Hand; pace: number; duration: number; segs: PathSeg[];
  exposed: MoveExposure | null; readAtK: number | null;
  /** With a lock: the bounce phase error left at the lock foot's strike (0 when the stretch reached it; ±0.5 at most). */
  lockMiss?: number;
}
export interface PathSample {
  t: number; k: number; ball: V3; vel: V3; seg: PathSegKind;
  /** The hand touching the ball now (null in the air). */
  contact: Hand | null;
  /** Where each hand should be (the palm on top of the ball — or, fading on, on the ball where it will meet it; fading off, where it
   *  let go), or null when the clip owns it. */
  handTarget: Record<Hand, V3 | null>;
  /** How hard each hand reaches for its target (the contact schedule): 1 on the ball, fading over CONTACT_FADE_SEC either side. */
  reach: Record<Hand, number>;
  /** The hands inside CONTACT_FADE_SEC of a contact (plan §3.3: the motion layers' drag skips them). */
  contactHands: Hand[];
  /** How exposed the ball is now (the shape's level inside its k range, else 0). */
  exposed: number;
}

// ── the authored keys (right hand first, the default stance) ───────────────────────────────────────────────────────────────────────
type P3 = readonly [number, number, number];
/** A key: a time, a point, and 'rest' when the ball is at rest there (a top in the palm). */
interface Knot { t: number; p: P3; rest?: boolean }
/** A span between two knots: its kind, whose hand (the move's START hand or its END hand; null in the air), and for a flight which half. */
interface Span { kind: PathSegKind; hand: 'start' | 'end' | null; flight?: 'fall' | 'rise' }
interface Authored { knots: Knot[]; spans: Span[]; crossings: 0 | 1 | 2 }
const { palmY: P0, ballR: R0, side: S0, forward: F0 } = HOOPS_DRIBBLE;
const TOP_R: P3 = [S0, P0, F0], TOP_L: P3 = [-S0, P0, F0];
const push: Span = { kind: 'push', hand: 'start' }, fall: Span = { kind: 'flight', hand: null, flight: 'fall' }, rise: Span = { kind: 'flight', hand: null, flight: 'rise' };
const catchEnd: Span = { kind: 'catch', hand: 'end' }, catchStart: Span = { kind: 'catch', hand: 'start' };
/** push → fall → rise → catch: one bounce from the start hand to the end hand (or back to the start hand: `same`). */
const bounce = (t: [number, number, number, number, number], rel: P3, floor: P3, meet: P3, end: P3, same = false): Authored => ({
  knots: [{ t: t[0], p: TOP_R, rest: true }, { t: t[1], p: rel }, { t: t[2], p: floor }, { t: t[3], p: meet }, { t: t[4], p: end, rest: true }],
  spans: [push, fall, rise, same ? catchStart : catchEnd], crossings: same ? 0 : 1,
});
/**
 * The plan's §4 keys, with these departures (each measured by handlePaths.test's per-frame bound, ≤ 0.15 m a 60 fps frame hips-relative
 * at pace 1 and at the turbo's 1.25):
 *  - the momentum cross: its release point is not in the plan — (0.14, 0.64, 0.34), the crossover's pushed wider and further ahead — and
 *    it is 0.45 s at pace 1, so R2's turbo pace (1.25) plays the plan's 0.36 s;
 *  - the Shammgod: the plan's pull ends at (−S − 0.06, P, F); the path settles from there onto the left hand's top (−S, P, F) by 0.58 s,
 *    so the carry takes it over where its dribble is (a 0.06 m jump otherwise);
 *  - the in-and-out's rising catch point (0.14, 0.58, 0.26) is not in the plan;
 *  - the hesi, the yoyo, the jab and PAUSIN's release are authored here (the plan gives their shapes, not their keys); their releases sit
 *    lower than a dribble's top so each drop stays under 9 m/s;
 *  - the double cross is one path with two crossings, the second lower (the plan's two queued front paths, joined at the left hand's
 *    low catch instead of its top);
 *  - the spin's hold ends at 0.28 s (plan 0.34): released at 0.34 its drop to the floor by 0.44 s reads 0.154 m a frame;
 *  - the behind-the-back's wrap is lower (0.74–0.76 m; plan 0.80) and its catch starts at 0.56 m, the double cross is 0.60 s (plan 0.56),
 *    the hesi's path 0.66 s (its clip, plan §4.8: 0.62) and the yoyo's 0.67 s (0.66) — each to stay inside 0.15 m a frame at the turbo's
 *    pace (1.25) as well as at real speed.
 */
const AUTHORED: Partial<Record<PathMove, Authored>> = {
  crossover: bounce([0, 0.08, 0.19, 0.30, 0.42], [0.14, 0.62, 0.28], [-0.02, R0, 0.36], [-0.32, 0.60, 0.26], TOP_L),
  momentum_cross: bounce([0, 0.09, 0.20, 0.32, 0.45], [0.14, 0.64, 0.34], [-0.04, R0, 0.50], [-0.40, 0.62, 0.36], TOP_L),   // 0.36 s at the turbo's 1.25
  between_legs: bounce([0, 0.10, 0.19, 0.30, 0.48], [0.16, 0.50, 0.10], [0.00, R0, 0.06], [-0.20, 0.48, 0.02], TOP_L),
  behind_back: {
    knots: [{ t: 0, p: TOP_R, rest: true }, { t: 0.08, p: [0.21, 0.76, -0.12] }, { t: 0.14, p: [0.06, 0.74, -0.20] }, { t: 0.25, p: [-0.16, R0, -0.18] }, { t: 0.34, p: [-0.30, 0.56, 0.02] }, { t: 0.46, p: TOP_L, rest: true }],
    spans: [push, push, fall, rise, catchEnd], crossings: 1,
  },
  shammgod: {
    knots: [{ t: 0, p: TOP_R, rest: true }, { t: 0.14, p: [0.18, 0.55, 0.60] }, { t: 0.24, p: [0.08, R0, 0.70] }, { t: 0.34, p: [-0.02, 0.55, 0.52] }, { t: 0.52, p: [-(S0 + 0.06), P0, F0] }, { t: 0.58, p: TOP_L, rest: true }],
    spans: [push, fall, rise, catchEnd, catchEnd], crossings: 1,
  },
  in_and_out: bounce([0, 0.08, 0.16, 0.24, 0.34], [0.12, 0.60, 0.26], [0.04, R0, 0.30], [0.14, 0.56, 0.26], TOP_R, true),
  hesi: {   // the load and a high, slow float (top P + 0.06), then the pound forward (floor at z 0.40)
    knots: [{ t: 0, p: TOP_R, rest: true }, { t: 0.06, p: [S0, 0.70, F0 + 0.02] }, { t: 0.15, p: [S0 + 0.01, R0, F0 + 0.04] }, { t: 0.24, p: [S0, 0.66, 0.20] },
      { t: 0.32, p: [S0, P0 + 0.06, 0.20], rest: true }, { t: 0.42, p: [S0, 0.56, 0.30] }, { t: 0.49, p: [S0, R0, 0.40] }, { t: 0.56, p: [S0, 0.52, 0.28] }, { t: 0.66, p: TOP_R, rest: true }],
    spans: [{ kind: 'float', hand: 'start' }, fall, rise, { kind: 'float', hand: 'start' }, { kind: 'pound', hand: 'start' }, fall, rise, catchStart], crossings: 0,
  },
  yoyo: {   // a low pound (its top at heightScale 0.55 of the stroke), then a high float (top P + 0.08)
    knots: [{ t: 0, p: TOP_R, rest: true }, { t: 0.06, p: [S0, 0.70, F0] }, { t: 0.15, p: [S0, R0, F0 + 0.02] }, { t: 0.21, p: [S0, 0.46, F0] }, { t: 0.25, p: [S0, R0 + (P0 - R0) * 0.55, F0], rest: true },
      { t: 0.30, p: [S0, 0.50, F0] }, { t: 0.38, p: [S0, R0, F0 + 0.02] }, { t: 0.48, p: [S0, 0.70, F0] }, { t: 0.59, p: [S0, P0 + 0.08, F0], rest: true }, { t: 0.67, p: TOP_R, rest: true }],
    spans: [{ kind: 'pound', hand: 'start' }, fall, rise, { kind: 'pound', hand: 'start' }, { kind: 'float', hand: 'start' }, fall, rise, { kind: 'float', hand: 'start' }, catchStart], crossings: 0,
  },
  jab: {   // a pound (a low top at 0.7 of the stroke) for the jab's 0.35 s
    knots: [{ t: 0, p: TOP_R, rest: true }, { t: 0.06, p: [S0, 0.76, F0] }, { t: 0.16, p: [S0, R0, F0 + 0.03] }, { t: 0.24, p: [S0, 0.56, F0] }, { t: 0.29, p: [S0, R0 + (P0 - R0) * 0.7, F0], rest: true }, { t: 0.35, p: TOP_R, rest: true }],
    spans: [{ kind: 'pound', hand: 'start' }, fall, rise, { kind: 'pound', hand: 'start' }, catchStart], crossings: 0,
  },
  spin: {   // the pull: the start hand palms it by the hips, lets it go on the exit side, the other hand catches it
    knots: [{ t: 0, p: TOP_R, rest: true }, { t: 0.12, p: [0.18, 0.95, 0.06], rest: true }, { t: 0.28, p: [0.18, 0.95, 0.06] }, { t: 0.42, p: [-0.10, R0, 0.30] }, { t: 0.49, p: [-0.20, 0.50, 0.24] }, { t: 0.60, p: TOP_L, rest: true }],
    spans: [{ kind: 'hold', hand: 'start' }, { kind: 'hold', hand: 'start' }, fall, rise, catchEnd], crossings: 1,
  },
  snatch_back: bounce([0, 0.09, 0.17, 0.25, 0.40], [0.12, 0.62, 0.34], [0.00, R0, 0.42], [-0.24, 0.58, 0.30], TOP_L),
  double_cross: {   // two front crossings, the second lower: R → L, the left hand's low catch pushes it straight back, L → R
    knots: [{ t: 0, p: TOP_R, rest: true }, { t: 0.08, p: [0.14, 0.62, 0.26] }, { t: 0.17, p: [-0.02, R0, 0.34] }, { t: 0.25, p: [-0.28, 0.50, 0.24] }, { t: 0.29, p: [-0.30, 0.54, 0.22] },
      { t: 0.35, p: [-0.14, 0.50, 0.28] }, { t: 0.43, p: [0.02, R0, 0.34] }, { t: 0.51, p: [0.26, 0.52, 0.24] }, { t: 0.60, p: TOP_R, rest: true }],
    spans: [push, fall, rise, catchEnd, { kind: 'push', hand: 'end' }, fall, rise, catchStart], crossings: 2,
  },
  pausin: {   // the ball held out to the side at hip height, the palm on top (plan §4.18), for up to PAUSIN_MAX_SEC
    knots: [{ t: 0, p: TOP_R, rest: true }, { t: 0.12, p: [S0 + 0.08, P0 - 0.05, F0 + 0.12], rest: true }, { t: 0.12 + PAUSIN_MAX_SEC, p: [S0 + 0.08, P0 - 0.05, F0 + 0.12], rest: true }],
    spans: [{ kind: 'hold', hand: 'start' }, { kind: 'hold', hand: 'start' }], crossings: 0,
  },
  pausin_release: {   // out of the hold: a pound forward (floor at z 0.45) and back into the dribble
    knots: [{ t: 0, p: [S0 + 0.08, P0 - 0.05, F0 + 0.12], rest: true }, { t: 0.06, p: [S0 + 0.04, 0.66, 0.38] }, { t: 0.15, p: [S0, R0, 0.45] }, { t: 0.24, p: [S0, 0.62, 0.30] }, { t: 0.36, p: TOP_R, rest: true }],
    spans: [{ kind: 'pound', hand: 'start' }, fall, rise, catchStart], crossings: 0,
  },
};
AUTHORED.momentum_btb = AUTHORED.behind_back;   // the same path at pace (DribbleController.momentumBtb)
AUTHORED.slip_slide = AUTHORED.in_and_out;      // the slip IS an in-and-out taken past his hip: same hands, the mode moves the feet
/** The family (MOVE_SHAPE.path) of the moves that are not HandleMoves. */
const EXTRA_FAMILY: Record<'jab' | 'pausin' | 'pausin_release', MovePath> = { jab: 'pound', pausin: 'hold', pausin_release: 'pound' };

// ── building ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z });
const ZERO: V3 = v3(0, 0, 0);
const other = (h: Hand): Hand => (h === 'right' ? 'left' : 'right');
/** An authored point (the default stance) on a body's stance. */
function mapPoint(p: P3, s: HandleStance): V3 {
  return v3(p[0] * (s.S / S0), s.r + (p[1] - R0) * ((s.P - s.r) / (P0 - R0)), p[2] + (s.F - F0));
}
/** A ballistic half: the velocity at its start and at its end. fall: from a release to the floor; rise: from the floor to a hand. */
function flightVel(p0: V3, p1: V3, tau: number): { v0: V3; v1: V3 } {
  const vx = (p1.x - p0.x) / tau, vz = (p1.z - p0.z) / tau;
  const vy0 = (p1.y - p0.y + 0.5 * PATH_G * tau * tau) / tau;
  return { v0: v3(vx, vy0, vz), v1: v3(vx, vy0 - PATH_G * tau, vz) };
}

/** How much longer a body's stroke is than the default stance's (≥ 1): its path plays that much slower (see build). */
export function strokeStretch(stance: HandleStance): number { return Math.max(1, (stance.P - stance.r) / (P0 - R0)); }
function build(move: PathMove, a: Authored, startHand: Hand, pace: number, stance: HandleStance): HandlePath {
  const k = Math.max(1e-3, pace);
  // HOOPS MOTION phase 4b: A LONGER STROKE PLAYS SLOWER. The heights map onto a body's own stroke (its fitted palm), so a stroke longer
  // than the default's would cover more ground in the same times — measured on the probe's first 4b run: the forge hero's fitted palm
  // (1.13–1.16 m) stretches the stroke ×1.17–1.21, and the drawn in-and-out stepped 0.18 m a frame at the turbo's pace, the hesi 0.17
  // (handlePaths.test bounds the DEFAULT stance at 0.143). The times scale with the stretch, so the speeds — what the per-frame bound is
  // about — are the default stance's on every body; a shorter stroke keeps its authored times (never faster).
  const tk = k / strokeStretch(stance);
  const T = a.knots.map((n) => n.t / tk), P = a.knots.map((n) => mapPoint(n.p, stance));
  // the flights first: their speeds come from their own times (a faster pace is still a falling ball)
  const fl: ({ v0: V3; v1: V3 } | null)[] = a.spans.map((sp, i) => (sp.flight ? flightVel(P[i], P[i + 1], T[i + 1] - T[i]) : null));
  // each knot's velocity: at rest; a flight's own at a flight's end; else Catmull-Rom between its neighbours (a C1 join)
  const vAt = (i: number, side: 'in' | 'out'): V3 => {
    const n = a.knots[i];
    const before = i > 0 ? fl[i - 1] : null, after = i < a.spans.length ? fl[i] : null;
    if (n.rest && !before && !after) return ZERO;   // (a knot beside a flight is never at rest: the flight's own speed wins)
    if (side === 'in' && before) return before.v1;
    if (side === 'out' && after) return after.v0;
    if (before && !after) return before.v1;
    if (after && !before) return after.v0;
    const lo = Math.max(0, i - 1), hi = Math.min(a.knots.length - 1, i + 1), dt = T[hi] - T[lo] || 1;
    return v3((P[hi].x - P[lo].x) / dt, (P[hi].y - P[lo].y) / dt, (P[hi].z - P[lo].z) / dt);
  };
  const endHand = a.crossings % 2 === 1 ? other(startHand) : startHand;
  const segs: PathSeg[] = a.spans.map((sp, i) => ({
    kind: sp.kind, t0: T[i], t1: T[i + 1], hand: sp.hand === 'start' ? startHand : sp.hand === 'end' ? other(startHand) : null,
    mode: sp.flight ?? 'cubic', p0: P[i], p1: P[i + 1], v0: fl[i]?.v0 ?? vAt(i, 'out'), v1: fl[i]?.v1 ?? vAt(i + 1, 'in'),
  }));
  // a double cross's second push is by the END hand of its first crossing, i.e. the other hand — already `other(startHand)` above
  const family: MovePath = move in EXTRA_FAMILY ? EXTRA_FAMILY[move as keyof typeof EXTRA_FAMILY] : MOVE_SHAPE[move as HandleMove].path;
  const shape = move in EXTRA_FAMILY ? null : MOVE_SHAPE[move as HandleMove];
  return { move, family, startHand, endHand, pace: k, duration: T[T.length - 1], segs, exposed: shape?.exposed ?? null, readAtK: shape?.readAtK ?? null };
}

/** Append `b` after `a` (b starts where a ends: a top at rest, in a's end hand). */
function concatPaths(a: HandlePath, b: HandlePath, move: PathMove): HandlePath {
  const segs = [...a.segs, ...b.segs.map((s) => ({ ...s, t0: s.t0 + a.duration, t1: s.t1 + a.duration }))];
  const shape = MOVE_SHAPE[move as HandleMove];
  return { move, family: shape?.path ?? a.family, startHand: a.startHand, endHand: b.endHand, pace: a.pace, duration: a.duration + b.duration, segs, exposed: shape?.exposed ?? null, readAtK: shape?.readAtK ?? null };
}

/** The end hand's lock foot, for the catch's timing: `strikePhase` = where that foot is in its stride at the path's start (0 = striking
 *  now, → 1 at its next strike), `period` = the stride (s). `phiAtStrike` defaults to PATH_PHI_AT_STRIKE. */
export interface PathLock { strikePhase: number; period: number; phiAtStrike?: number }
/** The drawn ball at a mid-bounce start (root frame): the path starts from it (blendFrom). */
export interface PathFrom { p: V3; v: V3 }

/**
 * The path of a move. `startHand` is the hand the ball is in (the athlete's); `pace` the move's playback rate (moveRateFor: 1 = real
 * speed); `stance` a body's own dribble stance (default the hoops dribble's); `lock` the END hand's lock foot — the catch is re-timed
 * (≤ ±LOCK_STRETCH of the path) so the bounce phase is PATH_PHI_AT_STRIKE when that foot strikes after it; `from` the drawn ball when the
 * move starts mid-bounce (blendFrom: a falling ball re-aimed at the path's floor contact, else the start hand meeting it). With both, the
 * catch is re-timed AFTER the blend, from the request (4a review F4: re-timed first, the blend's pre-roll or cut moved the catch off the
 * time it was solved for while lockMiss still read 0). Null for a move with no
 * path of its own (the step-back: the carry bounces through its hop; off the head: the
 * mode throws the ball).
 */
export function pathFor(move: PathMove, startHand: Hand, pace = 1, stance: Partial<HandleStance> = {}, lock?: PathLock, from?: PathFrom): HandlePath | null {
  const st: HandleStance = { ...DEFAULT_STANCE, ...stance };
  let path: HandlePath | null = null;
  if (move === 'steezo_roll') {   // the behind-the-back's path, then the spin's pull back: two crossings, the start hand at the end
    const a = build('steezo_roll', AUTHORED.behind_back!, 'right', pace, st), b = mirrorPath(build('steezo_roll', AUTHORED.spin!, 'right', pace, st));
    path = concatPaths(a, b, 'steezo_roll');
  } else {
    const a = AUTHORED[move]; if (!a) return null;
    path = build(move, a, 'right', pace, st);
  }
  if (startHand === 'left') path = mirrorPath(path);
  if (from) path = blendFrom(path, from);
  if (lock) path = relockCatch(path, lock);
  return path;
}

/** The mirror of a path: x → −x, the hands swapped. */
export function mirrorPath(p: HandlePath): HandlePath {
  const m = (v: V3): V3 => v3(-v.x, v.y, v.z);
  return {
    ...p, startHand: other(p.startHand), endHand: other(p.endHand),
    segs: p.segs.map((s) => ({ ...s, hand: s.hand ? other(s.hand) : null, p0: m(s.p0), p1: m(s.p1), v0: m(s.v0), v1: m(s.v1) })),
  };
}

/** The catch re-timed onto the lock foot: the path's end (the ball at the top, bounce phase 0, then one bounce a stride) moved to the
 *  nearest time whose bounce phase is `phiAtStrike` at the foot's strike, within ±LOCK_STRETCH of the path; the rest is lockMiss. */
function relockCatch(p: HandlePath, lock: PathLock): HandlePath {
  const last = p.segs[p.segs.length - 1];
  if (!last || last.mode !== 'cubic' || !(lock.period > 0.05)) return p;
  const phi = lock.phiAtStrike ?? PATH_PHI_AT_STRIKE;
  const toStrike = ((1 - lock.strikePhase) % 1 + 1) % 1 * lock.period;   // the foot's next strike from the path's start
  // the end times that put phase φ on a strike: toStrike − φ·period + m·period; the nearest to the authored end
  const base = toStrike - phi * lock.period;
  const m = Math.round((p.duration - base) / lock.period);
  const want = base + m * lock.period;
  // never shorter than LOCK_MIN_CATCH of the catch as authored: a 15 % cut taken out of a 0.12 s catch alone halves it (0.158 m a frame)
  const lo = Math.max(p.duration * (1 - LOCK_STRETCH), last.t0 + LOCK_MIN_CATCH * (last.t1 - last.t0)), hi = p.duration * (1 + LOCK_STRETCH);
  let end = Math.min(hi, Math.max(lo, want));
  // (4b) …and a SHORTENED catch never runs faster than LOCK_CATCH_MAX_MPS (or its own authored top speed, if that is higher): a cut to
  // LOCK_MIN_CATCH at the turbo's pace ran the catch 1.33× over its bound — measured, the probe's hesi at 6.1 m/s stepped 0.173 m a frame
  // in its catch, and a scan of every move × lock phase × pace 1 / 1.25 × the default and a fitted stroke read the double cross 0.189
  if (end < last.t1) {
    const vMax = (t1: number): number => { let v = 0; for (let i = 0; i <= 24; i++) { const e = evalSeg({ ...last, t1 }, last.t0 + (i / 24) * (t1 - last.t0)); v = Math.max(v, Math.hypot(e.v.x, e.v.y, e.v.z)); } return v; };
    const cap = Math.max(LOCK_CATCH_MAX_MPS, vMax(last.t1));
    if (vMax(end) > cap) { let a = end, b = last.t1; for (let i = 0; i < 24; i++) { const mid = (a + b) / 2; if (vMax(mid) > cap) a = mid; else b = mid; } end = b; }
  }
  let miss = (end - want) / lock.period; miss -= Math.round(miss);
  const segs = p.segs.slice(); segs[segs.length - 1] = { ...last, t1: end };
  return { ...p, segs, duration: end, lockMiss: miss };
}

/**
 * A move asked for MID-BOUNCE (plan §3.2 / U2: "runMove starts at once"). The path is re-built from the drawn ball (its position and
 * velocity in the root frame), so the returned path's t = 0 IS the request:
 *  - a FALLING ball is RE-AIMED: its current fall goes to the path's first floor contact (the drawn height and vertical speed under g, the
 *    across and forward carried to the path's floor point over that fall — what ballCarry.beginCross does today), and the path goes on
 *    from its rise. Not when that fall is too short to get there (REAIM_MAX_MPS: a ball about to hit the floor on its own side);
 *  - otherwise the START HAND MEETS it where the path's first segment ends (a crossover's release point, a behind-the-back's wrap, the
 *    spin's palm at the hips) with that segment's velocity — a catch-and-push (cubic) no faster than MEET_MAX_MPS — after, if it has to,
 *    the ball's own bounce (a falling ball: its fall and its rebound, RESTITUTION) and its free rise to MEET_Y (a hand does not reach a ball
 *    at the knees). A hold-first path (the spin's pull, PAUSIN') meets the ball at once when the catch stays above MEET_Y: a hand gathers a
 *    falling ball.
 * 4a entered a falling ball only at a matching phase of the path (15 of 630 falling requests, all at phases 0.01–0.05) and otherwise let
 * the ball finish its bounce and met it at its top at rest — up to 0.55 s before the move started (4a review F1, measured). The bound now
 * (handlePaths.test): request → the ball's first midline crossing ≤ the move's crossing from rest plus one fall of the dribble, at every
 * 5 % of the bounce, 1.7 and 2 Hz, pace 1 and 1.25.
 */
export const RESTITUTION = 0.8, REAIM_MAX_MPS = 8.5, MEET_MAX_MPS = 6.5, MEET_MAX_SEC = 0.5;
/** The lowest a hand takes a rising ball (the ball's centre, m, at the default stance; mapped by the body's stroke). */
export const MEET_Y = 0.5;
/** A ballistic half from (p, v) for `tau` s (x, z at constant speed). */
function flightSeg(p: V3, v: V3, t0: number, tau: number, mode: 'fall' | 'rise'): PathSeg {
  const p1 = v3(p.x + v.x * tau, p.y + v.y * tau - 0.5 * PATH_G * tau * tau, p.z + v.z * tau);
  return { kind: 'flight', t0, t1: t0 + tau, hand: null, mode, p0: p, v0: v, p1, v1: v3(v.x, v.y - PATH_G * tau, v.z) };
}
/** Time for a ball at height y with vertical speed vy to fall to `floorY` (s). */
function fallTime(y: number, vy: number, floorY: number): number {
  const drop = Math.max(0, y - floorY);
  return Math.max(1e-3, (vy + Math.sqrt(vy * vy + 2 * PATH_G * drop)) / PATH_G);
}
/** The shortest catch-and-push (a Hermite from (p0, v0) to (p1, v1)) whose speed stays ≤ MEET_MAX_MPS and whose ball stays above
 *  `lowY`; null when none within MEET_MAX_SEC does. */
function meetSeg(p0: V3, v0: V3, p1: V3, v1: V3, lowY: number, hand: Hand, kind: PathSegKind): PathSeg | null {
  // (never under the speeds it starts and ends at: at the turbo's pace a release leaves the hand at up to 6.6 m/s)
  const cap = Math.max(MEET_MAX_MPS, 1.02 * Math.hypot(v0.x, v0.y, v0.z), 1.02 * Math.hypot(v1.x, v1.y, v1.z));
  for (let T = BLEND_SEC; T <= MEET_MAX_SEC + 1e-9; T += 0.005) {
    let ok = true;
    for (let i = 0; i <= 24 && ok; i++) { const e = hermite(p0, v0, p1, v1, T, i / 24); if (Math.hypot(e.v.x, e.v.y, e.v.z) > cap || e.p.y < lowY - 1e-9) ok = false; }
    if (ok) return { kind, t0: 0, t1: T, hand, mode: 'cubic', p0, v0, p1, v1 };
  }
  return null;
}
/** `pre` (from t = 0) then the path's segments from index `from`, shifted to follow. */
function spliced(p: HandlePath, pre: PathSeg[], from: number): HandlePath {
  const t0 = pre.length ? pre[pre.length - 1].t1 : 0, off = t0 - (p.segs[from]?.t0 ?? p.duration);
  const segs = [...pre, ...p.segs.slice(from).map((s) => ({ ...s, t0: s.t0 + off, t1: s.t1 + off }))];
  return { ...p, segs, duration: segs[segs.length - 1].t1 };
}
function blendFrom(p: HandlePath, from: PathFrom): HandlePath {
  const fi = p.segs.findIndex((s) => s.mode === 'fall');
  const holdFirst = fi < 0 || p.segs.slice(0, fi).some((s) => s.kind === 'hold');
  // (4b) a BEHIND-THE-BACK's floor contact is behind the hips: re-aimed straight at it, a falling ball went through the body (the node
  // rig: its sign change 0.05 m IN FRONT of the hip line). Its ball is the hand's to wrap — the hand takes it (high enough: at once; else
  // after its bounce), like a hold-first path
  const handFirst = holdFirst || p.family === 'behind';
  const s0 = p.segs[0];
  const r = fi >= 0 ? p.segs[fi].p1.y : DEFAULT_STANCE.r;   // the floor contact's height (the stance's ball radius)
  const meetY = r + (MEET_Y - R0) * ((s0.p0.y - r) / (P0 - R0));   // (s0.p0 is the start hand's top: the stance's P)
  // a FALLING ball, re-aimed at the path's floor contact
  if (!handFirst && from.v.y <= 0) {
    const F = p.segs[fi].p1, tf = fallTime(from.p.y, from.v.y, F.y);
    const v0 = v3((F.x - from.p.x) / tf, from.v.y, (F.z - from.p.z) / tf);
    const vEnd = Math.hypot(v0.x, from.v.y - PATH_G * tf, v0.z);
    if (vEnd <= REAIM_MAX_MPS) { const f = flightSeg(from.p, v0, 0, tf, 'fall'); f.p1 = { ...F }; return spliced(p, [f], fi + 1); }
  }
  // a hold-first path gathers the ball at once where it can — a CATCH into the palm (the hold proper starts at the palm: the carry turns a
  // held ball with the body, and a ball still being caught with the ball's own pace — 4b's probe: the steezo roll's pull swung 0.21 m)
  const meetKind: PathSegKind = s0.kind === 'hold' ? 'catch' : s0.kind;
  if (handFirst) { const m = meetSeg(from.p, from.v, s0.p1, s0.v1, meetY, p.startHand, meetKind); if (m) return spliced(p, [m], 1); }
  // the start hand meets it: after its own bounce (a falling ball) and its free rise to where a hand takes it
  const pre: PathSeg[] = []; let pos = from.p, vel = from.v, t = 0;
  if (vel.y <= 0) {
    const f = flightSeg(pos, vel, 0, fallTime(pos.y, vel.y, r), 'fall'); f.p1 = { ...f.p1, y: r }; pre.push(f);
    pos = f.p1; vel = v3(f.v1.x, -RESTITUTION * f.v1.y, f.v1.z); t = f.t1;
  }
  if (pos.y < meetY - 1e-9) {
    const apexT = vel.y / PATH_G, apexY = pos.y + vel.y * apexT - 0.5 * PATH_G * apexT * apexT;
    const tc = apexY <= meetY ? apexT : (vel.y - Math.sqrt(Math.max(0, vel.y * vel.y - 2 * PATH_G * (meetY - pos.y)))) / PATH_G;
    const rs = flightSeg(pos, vel, t, Math.max(1e-3, tc), 'rise'); pre.push(rs);
    pos = rs.p1; vel = rs.v1; t = rs.t1;
  }
  const m = meetSeg(pos, vel, s0.p1, s0.v1, Math.min(meetY, pos.y), p.startHand, meetKind)
    ?? { kind: meetKind, t0: 0, t1: MEET_MAX_SEC, hand: p.startHand, mode: 'cubic' as const, p0: pos, v0: vel, p1: s0.p1, v1: s0.v1 };
  m.t0 += t; m.t1 += t;
  return spliced(p, [...pre, m], 1);
}

// ── evaluation ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function hermite(p0: V3, v0: V3, p1: V3, v1: V3, h: number, s: number): { p: V3; v: V3 } {
  const s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  const d00 = 6 * s2 - 6 * s, d10 = 3 * s2 - 4 * s + 1, d01 = -6 * s2 + 6 * s, d11 = 3 * s2 - 2 * s;
  const f = (a: number, va: number, b: number, vb: number) => h00 * a + h10 * h * va + h01 * b + h11 * h * vb;
  const g = (a: number, va: number, b: number, vb: number) => (d00 * a + d10 * h * va + d01 * b + d11 * h * vb) / h;
  return { p: v3(f(p0.x, v0.x, p1.x, v1.x), f(p0.y, v0.y, p1.y, v1.y), f(p0.z, v0.z, p1.z, v1.z)), v: v3(g(p0.x, v0.x, p1.x, v1.x), g(p0.y, v0.y, p1.y, v1.y), g(p0.z, v0.z, p1.z, v1.z)) };
}
function segAt(p: HandlePath, t: number): PathSeg {
  for (const s of p.segs) if (t <= s.t1) return s;
  return p.segs[p.segs.length - 1];
}
function evalSeg(s: PathSeg, t: number): { p: V3; v: V3 } {
  const tau = Math.min(s.t1 - s.t0, Math.max(0, t - s.t0));
  if (s.mode === 'cubic') { const h = s.t1 - s.t0; return h > 1e-9 ? hermite(s.p0, s.v0, s.p1, s.v1, h, tau / h) : { p: s.p1, v: s.v1 }; }
  // a ballistic half: x, z at constant speed; y from its start speed under g
  return { p: v3(s.p0.x + s.v0.x * tau, s.p0.y + s.v0.y * tau - 0.5 * PATH_G * tau * tau, s.p0.z + s.v0.z * tau), v: v3(s.v0.x, s.v0.y - PATH_G * tau, s.v0.z) };
}
function evalPath(p: HandlePath, t: number): { p: V3; v: V3; seg: PathSeg } {
  const tt = Math.min(p.duration, Math.max(0, t));
  const seg = segAt(p, tt);
  return { ...evalSeg(seg, tt), seg };
}
/** Each hand's contact spans ([t0, t1] of the segments it touches, merged). */
function contactSpans(p: HandlePath, h: Hand): [number, number][] {
  const out: [number, number][] = [];
  for (const s of p.segs) {
    if (s.hand !== h) continue;
    const last = out[out.length - 1];
    if (last && s.t0 <= last[1] + 1e-9) last[1] = s.t1; else out.push([s.t0, s.t1]);
  }
  return out;
}

/** The path at `t` s (clamped to the path). */
export function pathAt(p: HandlePath, t: number): PathSample {
  const tt = Math.min(p.duration, Math.max(0, t));
  const e = evalPath(p, tt);
  const k = p.duration > 0 ? tt / p.duration : 1;
  const onTop = (b: V3): V3 => v3(b.x, b.y + DEFAULT_STANCE.r, b.z);
  const reach: Record<Hand, number> = { right: 0, left: 0 };
  const handTarget: Record<Hand, V3 | null> = { right: null, left: null };
  const contactHands: Hand[] = [];
  for (const h of ['right', 'left'] as const) {
    let w = 0, tgt: V3 | null = null, near = false;
    for (const [a, b] of contactSpans(p, h)) {
      if (tt >= a && tt <= b) { w = 1; tgt = onTop(e.p); near = true; break; }
      const startsAt0 = a <= 1e-9, endsAtEnd = b >= p.duration - 1e-9;
      if (tt < a && tt > a - CONTACT_FADE_SEC && !startsAt0) { const wi = 1 - (a - tt) / CONTACT_FADE_SEC; if (wi > w) { w = wi; tgt = onTop(evalPath(p, a).p); } near = true; }
      if (tt > b && tt < b + CONTACT_FADE_SEC && !endsAtEnd) { const wo = 1 - (tt - b) / CONTACT_FADE_SEC; if (wo > w) { w = wo; tgt = onTop(evalPath(p, b).p); } near = true; }
    }
    reach[h] = w; handTarget[h] = w > 0 ? tgt : null; if (near) contactHands.push(h);
  }
  const x = p.exposed; const exposed = x && k >= x.from - 1e-9 && k <= x.to + 1e-9 ? x.level : 0;
  return { t: tt, k, ball: e.p, vel: e.v, seg: e.seg.kind, contact: e.seg.hand, handTarget, reach, contactHands, exposed };
}

/** Midline crossings of the ball's lateral over the path (sampled every ms): a crossing counts once the ball is past ±CROSS_BAND_M on
 *  the other side. */
export function crossingsOf(p: HandlePath, stepSec = 0.001): number {
  let side = 0, n = 0;
  for (let t = 0; t <= p.duration + 1e-9; t += stepSec) {
    const x = pathAt(p, t).ball.x;
    const s = x > CROSS_BAND_M ? 1 : x < -CROSS_BAND_M ? -1 : 0;
    if (s !== 0) { if (side !== 0 && s !== side) n++; side = s; }
  }
  return n;
}
