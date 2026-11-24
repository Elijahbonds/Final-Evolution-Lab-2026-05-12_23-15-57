// PICK-AND-ROLL COVERAGE (lane/hoops-gap, 2026-11-23; owner "close the gap and pass them", the coordinator's brief: "go over the screen
// when the shooter is in range, and under when he's far out; switch when beaten; help the roller in 3v3").
//
// What the AI defence had: the man on the ball never played the screen at all — DefenderBrain's navigate read skips any attacker within
// 1.2 m of the ball, and an on-ball screen is set on his shoulder, a step from the handler — so he ran into the screener's body, and the 3v3
// team defence SWITCHED whenever the geometry allowed (the screener's man nearer the handler, inside 2.6 m), beaten or not. Away from the
// ball, over or under was a coin (60 / 40). Nobody showed on the ball, and nobody tagged a roll man.
//
// With `hoops.pnrCoverageOn` (OFF by default; 0 = all of the above, exactly):
//   · THE READ — the handler inside PNR_OVER_MAX_M of the rim (a pull-up is a shot) is fought OVER the top; past it, the screen is gone
//     UNDER (the drive is the danger, the jumper is not). The same read replaces the coin away from the ball. No roll.
//   · THE MAN ON THE BALL plays the screen: he steps round the screener on the read's side instead of into him; under, he sags a step.
//   · THE SCREENER'S MAN: over, he SHOWS — a step out into the handler's path while the screen is set and PNR_SHOW_SEC after (it slows
//     the turn of the corner), then back to his man; under, he DROPS, between his man and the rim.
//   · THE TAG: a roll man diving at the rim (inside PNR_TAG_RIM_M, moving at it faster than PNR_ROLL_MPS) that no team-mate of mine is
//     within PNR_TAG_FREE_M of is picked up by the low man (the off-ball defender nearest the rim) — he steps into the roll line.
//   · SWITCH ONLY WHEN BEATEN (hoops/teamDefense): the swap happens when the screened man is beaten — the handler nearer the rim than he
//     is, or more than PNR_BEATEN_M off him — instead of whenever the geometry allows.
// Pure: positions in, a read out (pnrCoverage.test.ts). Every number is NEW (the owner has felt none); the knob is the one switch.
import { feel } from '../../feel-panel/feel';   // feel-panel knob hoops.pnrCoverageOn (lib/feel-panel/knobs.ts)

export interface XZ { x: number; z: number }
const d2 = (a: XZ, b: XZ): number => Math.hypot(a.x - b.x, a.z - b.z);

/** The coverage switch: 1 = the reads above, 0 = the release's (no on-ball screen play, the coin off the ball, switch on geometry). */
export const PNR_COVERAGE_ON = 0;
export const pnrCoverageOn = (): boolean => feel('hoops.pnrCoverageOn', PNR_COVERAGE_ON) >= 0.5;
/** A handler this close to the rim (m) is a shooter: over the top. Past it, under. (The arc is 6.75 m; a step past it is still range.) */
export const PNR_OVER_MAX_M = 7.5;
/** An attacker this close to the on-ball defender (m), planted, near the ball, is a screen on him. */
export const PNR_SCREEN_M = 1.4;
/** …and within this of the ball (m). */
export const PNR_SCREEN_BALL_M = 2.8;
/** A body slower than this (m/s) is planted. */
export const PNR_PLANTED_MPS = 0.6;
/** The show: how long the screener's man stays out after his man leaves the screen (s). */
export const PNR_SHOW_SEC = 0.6;
/** The show's spot: this far from the handler (m), on his way round the screen. */
export const PNR_SHOW_M = 1.1;
/** The tag: a roll man inside this of the rim (m) … */
export const PNR_TAG_RIM_M = 5.0;
/** … moving at the rim faster than this (m/s) … */
export const PNR_ROLL_MPS = 1.5;
/** … with no defender (but the tagger) within this of him (m). */
export const PNR_TAG_FREE_M = 1.6;
/** Under the screen, the man on the ball sags at least this share of the way from the handler to the rim. */
export const PNR_UNDER_LEVER = 0.45;
/** The drop: the screener's man sits this share of the way from his man to the rim. */
export const PNR_DROP_LEVER = 0.45;
/** The tag: the low man steps to this share of the way from the roll man to the rim. */
export const PNR_TAG_LEVER = 0.35;
/** The show's and the tag's spot is reached inside this (m): the off-ball dead zone (1.4 m) would leave him standing where he was. */
export const PNR_SPOT_DEAD_M = 0.4;
/** Switch when beaten: the screened man more than this off the handler (m) is beaten. */
export const PNR_BEATEN_M = 1.9;

export type PnrCoverage = 'over' | 'under';
/** The read: over a shooter in range, under one far out. */
export function coverageFor(handlerRimDist: number): PnrCoverage { return handlerRimDist <= PNR_OVER_MAX_M ? 'over' : 'under'; }

/** The man screening the on-ball defender `self`: an attacker (not the handler) planted within PNR_SCREEN_M of him and within
 *  PNR_SCREEN_BALL_M of the ball; −1 = none. */
export function onBallScreener(self: XZ, ball: XZ, handler: number | null, foes: readonly XZ[], foeSpeeds: readonly number[]): number {
  let best = -1, bd = PNR_SCREEN_M;
  for (let i = 0; i < foes.length; i++) {
    if (i === handler || !(foeSpeeds[i] < PNR_PLANTED_MPS)) continue;
    const d = d2(foes[i], self);
    if (d < bd && d2(foes[i], ball) < PNR_SCREEN_BALL_M) { bd = d; best = i; }
  }
  return best;
}

/** Is `mark` (the man I guard) screening my team-mate on the ball? The on-ball defender is the ally nearest the ball (not me). */
export function markIsScreening(self: XZ, mark: XZ, markSpeed: number, ball: XZ, allies: readonly XZ[]): boolean {
  if (!(markSpeed < PNR_PLANTED_MPS) || d2(mark, ball) >= PNR_SCREEN_BALL_M) return false;
  let onBall: XZ | null = null, bd = Infinity;
  for (const a of allies) { if (d2(a, self) < 1e-3) continue; const d = d2(a, ball); if (d < bd) { bd = d; onBall = a; } }
  return !!onBall && d2(onBall, mark) < PNR_SCREEN_M + 0.2;
}

/** The show spot: PNR_SHOW_M off the handler toward the screener's side and the rim (the corner he has to turn). */
export function showSpot(handler: XZ, screener: XZ, rim: XZ): XZ {
  const sx = screener.x - handler.x, sz = screener.z - handler.z, sl = Math.hypot(sx, sz) || 1;
  const rx = rim.x - handler.x, rz = rim.z - handler.z, rl = Math.hypot(rx, rz) || 1;
  const ux = sx / sl + rx / rl, uz = sz / sl + rz / rl, ul = Math.hypot(ux, uz) || 1;
  return { x: handler.x + ux / ul * PNR_SHOW_M, z: handler.z + uz / ul * PNR_SHOW_M };
}

/** The roll man I tag, or −1. `foeVel` planar velocities; `allies` my team (me included, found by distance). Only the LOW MAN tags (of
 *  the defenders not on the ball — the ally nearest the ball is — the one nearest the rim), never his own man, and only a roll nobody
 *  else is near. */
export function rollerToTag(self: XZ, markIdx: number | null, ball: XZ, rim: XZ, allies: readonly XZ[], foes: readonly XZ[], foeVel: readonly XZ[]): number {
  let onBall = -1, bd = Infinity;
  allies.forEach((a, i) => { const d = d2(a, ball); if (d < bd) { bd = d; onBall = i; } });
  if (onBall >= 0 && d2(allies[onBall], self) < 1e-3) return -1;   // I am on the ball
  for (let i = 0; i < foes.length; i++) {
    if (i === markIdx) continue;
    const f = foes[i]; const r = d2(f, rim);
    if (r > PNR_TAG_RIM_M || d2(f, ball) < 1.0) continue;   // (the handler is the ball, not a roll)
    const v = foeVel[i] ?? { x: 0, z: 0 };
    const toward = r > 1e-3 ? (v.x * (rim.x - f.x) + v.z * (rim.z - f.z)) / r : 0;
    if (toward < PNR_ROLL_MPS) continue;
    // free: no team-mate of mine on him; and I am THE LOW MAN — of the off-ball defenders, the one nearest the rim
    let nearestOther = Infinity, lowRim = Infinity, lowIsMe = false;
    for (let k = 0; k < allies.length; k++) {
      const me = d2(allies[k], self) < 1e-3;
      if (!me) nearestOther = Math.min(nearestOther, d2(allies[k], f));
      if (k !== onBall) { const rr = d2(allies[k], rim); if (rr < lowRim) { lowRim = rr; lowIsMe = me; } }
    }
    if (nearestOther >= PNR_TAG_FREE_M && lowIsMe) return i;
  }
  return -1;
}

/** Switch when beaten: the screened defender has lost the handler — the handler is nearer the rim than he is, or he is PNR_BEATEN_M off. */
export function beatenOnScreen(defender: XZ, handler: XZ, rim: XZ): boolean {
  return d2(handler, rim) < d2(defender, rim) - 0.3 || d2(defender, handler) > PNR_BEATEN_M;
}
