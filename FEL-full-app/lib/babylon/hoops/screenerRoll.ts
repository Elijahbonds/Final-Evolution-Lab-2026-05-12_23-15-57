// THE ROLL MAN (lane/hoops-gap, 2026-11-23; the coordinator's brief after the pick-and-roll coverage: "a real roll man … when the
// screener's defender steps up to the ball (or the team switches), the screener rolls or slips past him to the rim, instead of waiting
// for a clear 1.6 m lane. The handler's AI should look for that roll pass").
//
// What the offence did: the screener rolled only when NO defender was within 1.6 m of his whole line to the rim (core/HoopsOffball
// rollLaneOpen) — and the low man at the rim nearly always is, so he popped (pnr-sim: one roll in 631 screens). The roll is a read of HIS
// OWN man, not of the rim: if his man has stepped up to the ball (a show, a hedge, a switch), the man in front of him is gone and he
// dives — the help at the rim is the defence's problem, which is the whole point of the play. With `hoops.screenerRollOn` (OFF; 0 = the
// release exactly):
//   · THE ROLL — at the screen's end he rolls when his man is off his line (level with him or behind, or nearer the ball than to him), or
//     when nobody stands on the first ROLL_NEAR_M of his line; the old whole-line read still rolls him too.
//   · THE SLIP — planted at least SLIP_MIN_SEC, with his man already stepped up to the ball, he goes at once (he does not wait out the hold).
//   · THE PASS (hoops/teamOffense3v3) — the handler who has used the screen hits the rolling man when he is open (KICK_OPEN_M) with a clear
//     lane, through the use AND the attack, without needing his own man to have stayed in his lane (PRO and up: the tier's readsScreen).
// Pure geometry (screenerRoll.test.ts). Every number is NEW (the owner has felt none).
import { feel } from '../../feel-panel/feel';   // feel-panel knob hoops.screenerRollOn (lib/feel-panel/knobs.ts)

export interface XZ { x: number; z: number }
const d2 = (a: XZ, b: XZ): number => Math.hypot(a.x - b.x, a.z - b.z);

export const SCREENER_ROLL_ON = 0;
export const screenerRollOn = (): boolean => feel('hoops.screenerRollOn', SCREENER_ROLL_ON) >= 0.5;
/** Only the first this much of his line to the rim (m) has to be clear for the roll (the help at the rim is the defence's problem). */
export const ROLL_NEAR_M = 2.5;
/** A defender this close to that stretch of his line (m, sideways) is in the way. */
export const ROLL_NEAR_LANE_M = 1.1;
/** His man is "off his line" when he is less than this (m) in front of him toward the rim. */
export const ROLL_MAN_AHEAD_M = 0.3;
/** The slip: planted at least this long (s) before he may go early. */
export const SLIP_MIN_SEC = 0.25;

/** His own man: the defender nearest him that is not the one he is screening (−1 = none). */
export function screenersMan(self: XZ, screened: XZ | null, defenders: readonly XZ[]): number {
  let best = -1, bd = Infinity;
  defenders.forEach((d, i) => { if (screened && d2(d, screened) < 1e-3) return; const dd = d2(d, self); if (dd < bd) { bd = dd; best = i; } });
  return best;
}
/** Has his man stepped up to the ball (a show, a hedge, a switch onto the handler)? Off his line to the rim, or nearer the ball than him. */
export function manSteppedUp(self: XZ, man: XZ, handler: XZ, rim: XZ): boolean {
  const rx = rim.x - self.x, rz = rim.z - self.z, rl = Math.hypot(rx, rz) || 1;
  const ahead = ((man.x - self.x) * rx + (man.z - self.z) * rz) / rl;
  return ahead < ROLL_MAN_AHEAD_M || d2(man, handler) < d2(man, self);
}
/** Nobody on the first ROLL_NEAR_M of his line to the rim. */
export function nearLaneClear(self: XZ, rim: XZ, defenders: readonly XZ[]): boolean {
  const rx = rim.x - self.x, rz = rim.z - self.z, rl = Math.hypot(rx, rz);
  if (rl < 1e-3) return true;
  const ux = rx / rl, uz = rz / rl, reach = Math.min(ROLL_NEAR_M, rl);
  for (const d of defenders) {
    const px = d.x - self.x, pz = d.z - self.z; const along = px * ux + pz * uz;
    if (along > 0.1 && along < reach && Math.abs(px * uz - pz * ux) < ROLL_NEAR_LANE_M) return false;
  }
  return true;
}
/** The read at the screen: roll (at its end), and slip (go now, before the hold is up). */
export function rollRead(self: XZ, handler: XZ, rim: XZ, defenders: readonly XZ[], screened: XZ | null): { roll: boolean; slip: boolean } {
  const m = screenersMan(self, screened, defenders);
  const stepped = m >= 0 && manSteppedUp(self, defenders[m], handler, rim);
  return { roll: stepped || nearLaneClear(self, rim, defenders), slip: stepped };
}

// ── hoops-gap, round 2 (`hoops.rollScoreOn`, OFF): THE ROLL MAN SCORES ────────────────────────────────────────────────────────────────
// Measured with the roll on (pnr-sim, PRO): the screener rolled on 25–44 % of pick-and-rolls but was never open (his man stayed about
// 1.0 m off him) and never caught it. Three changes, one switch (it needs `hoops.screenerRollOn` too):
//   · THE EARLY SLIP — with his man already up at the ball he goes the frame he is planted (no SLIP_MIN_SEC wait).
//   · THE GHOST SCREEN — coming to set it, inside GHOST_RANGE_M of the spot, with his man already gone to the ball (the switch or the show
//     read the screen coming), he never plants: he cuts straight to the rim.
//   · THE LEADING PASS — the handler reads the roll man where he WILL be when the ball gets there (his speed × the flight time, as every
//     3v3 pass in the mode is thrown: BallHandling.leadPoint), open by ROLL_LEAD_OPEN_M there, with a clear lane to that spot.
//   · THE CATCH IS A FINISH — a catch inside ROLL_CATCH_RIM_M of the rim goes up at once (no triple-threat beat at the rim).
export const ROLL_SCORE_ON = 0;
export const rollScoreOn = (): boolean => screenerRollOn() && feel('hoops.rollScoreOn', ROLL_SCORE_ON) >= 0.5;
/** The ghost screen: inside this of the screen spot (m) he may cut without planting. */
export const GHOST_RANGE_M = 1.5;
/** The leading pass: the roll man this open (m) at the spot the ball meets him. */
export const ROLL_LEAD_OPEN_M = 1.6;
/** The chest pass's flight speed (m/s) the lead is solved against (core/BallHandling PASS_SPEED.chest). */
export const ROLL_PASS_MPS = 14;
/** A catch this close to the rim (m) is a finish at once. */
export const ROLL_CATCH_RIM_M = 3.0;

/** The ghost: coming to set the screen, near the spot, his own man already stepped up to the ball. */
export function ghostRead(self: XZ, spot: XZ, handler: XZ, rim: XZ, defenders: readonly XZ[], screened: XZ | null): boolean {
  if (d2(self, spot) > GHOST_RANGE_M) return false;
  const m = screenersMan(self, screened, defenders);
  return m >= 0 && manSteppedUp(self, defenders[m], handler, rim);
}
/** Where the ball meets the roll man: his position led by his velocity over the flight (iterated, as BallHandling.leadPoint). */
export function rollLeadPoint(passer: XZ, roller: XZ, vel: XZ): XZ {
  let lead = { x: roller.x, z: roller.z };
  for (let k = 0; k < 4; k++) { const t = d2(passer, lead) / ROLL_PASS_MPS; lead = { x: roller.x + vel.x * t, z: roller.z + vel.z * t }; }
  return lead;
}

/** hoops-gap round 3 (with `hoops.rollScoreOn`): THE ROLL TO THE FREE BLOCK. He rolled at the rim on his own line, straight into the man
 *  guarding him (who sits a third of the way from him to the rim). Now he dives to whichever block — ROLL_BLOCK_SIDE_M either side of the
 *  rim, ROLL_BLOCK_OUT_M out on the floor — has the most room from the defence. */
export const ROLL_BLOCK_SIDE_M = 2.0, ROLL_BLOCK_OUT_M = 1.2;
export function freeBlock(rim: XZ, toward: XZ, defenders: readonly XZ[]): XZ {
  const ox = toward.x - rim.x, oz = toward.z - rim.z, ol = Math.hypot(ox, oz) || 1;
  const ux = ox / ol, uz = oz / ol, px = -uz, pz = ux;
  let best: XZ = { x: rim.x + ux * ROLL_BLOCK_OUT_M, z: rim.z + uz * ROLL_BLOCK_OUT_M }, room = -Infinity;
  for (const side of [1, -1]) {
    const spot = { x: rim.x + ux * ROLL_BLOCK_OUT_M + px * side * ROLL_BLOCK_SIDE_M, z: rim.z + uz * ROLL_BLOCK_OUT_M + pz * side * ROLL_BLOCK_SIDE_M };
    let r = Infinity; for (const d of defenders) r = Math.min(r, d2(d, spot));
    if (r > room) { room = r; best = spot; }
  }
  return best;
}
