// threevthreeRules — the 3v3's difficulty knobs, the rival's team offence (the kick-out read and the catch-and-shoot), what a
// rival release is worth and how often it goes in, the contextual hint and the full control list, the pass preview's words, the
// box score and the body-layer level of detail, as pure logic (IMPROVE 2026-10-06, owner-picked items #1 #2 #3 #5 #7 #9 #14 from
// the threevthree section of docs/IMPROVEMENTS-2026-10-05.md). Nothing here touches the scene: ThreeVThreeMode reads these and
// decides what to do; the host (components/games/three-v-three-babylon.tsx) draws the hint, the preview and the pause list;
// lib/proofLine prints the box score on the end card.

import type { Tier } from '../core/Difficulty';
import type { PassType } from '../core/BallHandling';
import { rivalShotPct } from '../core/BasketballCore';
import { contestedPct } from '../core/HoopsDefense';
import { HEAD_TO_HEAD_PARAMS, HINT_PAINT } from './onevoneRules';

// ── #3 DIFFICULTY ────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * What the shared OPPONENT pick (core/Difficulty: ROOKIE / PRO / ELITE) does to the other team. Every knob changes what they
 * DO or how often it goes in, never how fast they move:
 *  · `defenderAggression` — the DefenderBrain's on-ball poke roll (0.55 since the mode was written);
 *  · `layupPct` / `jumperPct` — the driver's make base at the end of his drive (0.62 / 0.5 since the mode was written);
 *  · `pullUpDelta` — added to the catch-and-shoot's make chance (rivalShotPct, the mates' own distance curve);
 *  · `kickChance` — a cut-off driver with an open man swings it (#1) instead of forcing his drive;
 *  · `catchShoot` — the open receiver of a swing lets it go instead of driving again;
 *  · `maxPasses` — swings a possession (a rookie team makes one read, an elite one can make two).
 * PRO keeps every number the mode shipped with; the team offence (#1) is new at every tier.
 */
export interface ThreeVThreeKnobs {
  defenderAggression: number; layupPct: number; jumperPct: number; pullUpDelta: number;
  kickChance: number; catchShoot: number; maxPasses: number;
}
export const THREEV_TIER: Readonly<Record<Tier, ThreeVThreeKnobs>> = {
  rookie: { defenderAggression: 0.45, layupPct: 0.56, jumperPct: 0.44, pullUpDelta: -0.05, kickChance: 0.3, catchShoot: 0.45, maxPasses: 1 },
  pro: { defenderAggression: 0.55, layupPct: 0.62, jumperPct: 0.5, pullUpDelta: 0, kickChance: 0.55, catchShoot: 0.6, maxPasses: 1 },
  elite: { defenderAggression: 0.65, layupPct: 0.68, jumperPct: 0.56, pullUpDelta: 0.05, kickChance: 0.75, catchShoot: 0.7, maxPasses: 2 },
};
/** The tier this run plays: the pick, except on a staked or head-to-head run (?arena= / ?mp= / ?c=), where both sides must face
 *  the same team and the stake is settled on the score — those always play PRO, the game as it shipped. */
export function tierForRun(search: string, picked: Tier): Tier {
  const q = new URLSearchParams(search);
  return HEAD_TO_HEAD_PARAMS.some((k) => q.get(k)) ? 'pro' : picked;
}

// ── #1 THE RIVAL'S TEAM OFFENCE ──────────────────────────────────────────────────────────────────────────────────────
export interface XZ { x: number; z: number }
/** A defender this far ahead of the driver on his line (and this close to it) has cut the drive off. */
export const CUT_OFF_AHEAD_M = 2.4, CUT_OFF_LATERAL_M = 1.1;
/** The part of the drive in which the driver reads the floor (k, before the tell's gather). */
export const KICK_READ_FROM_K = 0.2, KICK_READ_TO_K = 0.6;
/** A mate is OPEN past this from my nearest body; the swing is thrown only this far or further (a hand-off is not a read). */
export const KICK_OPEN_M = 2.2, KICK_MIN_M = 2.5;
/** A defender this close to the swing's line (planar) is in the lane — the pass is not thrown. */
export const KICK_LANE_M = 0.75;
/** A body of my team this close to the ball in flight (planar) picks the swing off. */
export const SWING_PICK_M = 0.7;
/** The receiver shoots off the catch only when this open and at least this far out (a catch at the rim is a drive). */
export const SHOOT_OPEN_M = 2.4, SHOOT_MIN_RIM_M = 4.5;

const flatDist = (a: XZ, b: XZ): number => Math.hypot(a.x - b.x, a.z - b.z);
/** Is anybody of `defenders` between the driver and the rim, on his line (`dir` the drive's unit direction)? */
export function cutOff(driver: XZ, dir: XZ, defenders: readonly XZ[]): boolean {
  for (const d of defenders) {
    const rx = d.x - driver.x, rz = d.z - driver.z;
    const along = rx * dir.x + rz * dir.z;
    if (along < 0.3 || along > CUT_OFF_AHEAD_M) continue;
    if (Math.abs(rx * dir.z - rz * dir.x) <= CUT_OFF_LATERAL_M) return true;
  }
  return false;
}
/** No defender inside KICK_LANE_M of the segment from → to (its ends excluded: the passer's own man and the receiver's are not the lane). */
export function laneClear(from: XZ, to: XZ, defenders: readonly XZ[], half = KICK_LANE_M): boolean {
  const lx = to.x - from.x, lz = to.z - from.z, len = Math.hypot(lx, lz);
  if (len < 1e-3) return true;
  const ux = lx / len, uz = lz / len;
  for (const d of defenders) {
    const rx = d.x - from.x, rz = d.z - from.z;
    const along = rx * ux + rz * uz;
    if (along < 0.5 || along > len - 0.5) continue;
    if (Math.abs(rx * uz - rz * ux) < half) return false;
  }
  return true;
}
/** How open a body is: its distance to the nearest defender (Infinity with nobody on the floor). */
export function openness(p: XZ, defenders: readonly XZ[]): number {
  let best = Infinity;
  for (const d of defenders) best = Math.min(best, flatDist(p, d));
  return best;
}
/** The swing's target: the most open of `mates` (the driver's two team-mates) that is open, far enough to be a pass and has a
 *  clear lane — or −1. */
export function kickTarget(passer: XZ, mates: readonly XZ[], defenders: readonly XZ[]): number {
  let best = -1, bestOpen = -Infinity;
  mates.forEach((m, i) => {
    const open = openness(m, defenders);
    if (open < KICK_OPEN_M || flatDist(passer, m) < KICK_MIN_M || !laneClear(passer, m, defenders)) return;
    if (open > bestOpen) { bestOpen = open; best = i; }
  });
  return best;
}
/** The open receiver lets it go off the catch (not inside SHOOT_MIN_RIM_M: there he attacks). */
export function catchAndShoot(open: number, distToRim: number, knobs: ThreeVThreeKnobs, roll: number): boolean {
  return open >= SHOOT_OPEN_M && distToRim >= SHOOT_MIN_RIM_M && roll < knobs.catchShoot;
}

// ── #2 WHAT A RIVAL RELEASE IS WORTH, AND HOW OFTEN IT GOES IN ───────────────────────────────────────────────────────
/** A dunk and a layup are twos; a jumper is worth what the arc says (BasketballCore.isThree at the release spot). */
export function rivalPoints(kind: 'dunk' | 'layup' | 'jumper', beyondArc: boolean): 2 | 3 {
  return kind === 'jumper' && beyondArc ? 3 : 2;
}
/** A goaltend on their shot: the basket counts ONCE — a shot already banked at its release scores nothing more. */
export function goaltendAward(alreadyScored: boolean, shotPoints: number): number { return alreadyScored ? 0 : shotPoints; }
export interface RivalRelease {
  style: 'layup' | 'jumper';
  /** A catch-and-shoot off a swing (#1): the mates' distance curve, not the end-of-drive base. */
  pullUp: boolean;
  distToRim: number;
  /** My team's contest on him (proximity + my hand). */
  defenseFactor: number;
  /** My grounded hand-up alone. */
  ground: number;
  /** Nerve's mistake half (≥ 0.5 divides the chance). */
  mistake: number;
}
/** The make chance of a rival release. The end of a drive is exactly the shipped formula with the tier's base in it; a
 *  catch-and-shoot reads the distance (rivalShotPct, the curve a team-mate's shot uses) with the tier's delta. */
export function rivalReleasePct(r: RivalRelease, knobs: ThreeVThreeKnobs): number {
  const base = r.pullUp
    ? Math.max(0.05, rivalShotPct(r.distToRim, r.defenseFactor, 'jumper') + knobs.pullUpDelta)
    : (r.style === 'layup' ? knobs.layupPct : knobs.jumperPct) - Math.min(0.5, r.defenseFactor * 0.3);
  return contestedPct(base, r.ground) / Math.max(0.5, r.mistake);
}

// ── #5 THE PASS PREVIEW ──────────────────────────────────────────────────────────────────────────────────────────────
/** What the PASS button would throw right now (null target: the lane is covered — the press is refused with NO LANE). */
export function passPreviewLabel(type: PassType | null): string {
  return type === null ? 'NO LANE' : type === 'lob' ? 'LOB — ALLEY-OOP' : type === 'bounce' ? 'BOUNCE PASS' : 'CHEST PASS';
}
/** The marker's colour under the mate (and under their ball-handler on defence, #6). */
export const MARK_COLOR: Readonly<Record<PassType | 'driver', string>> = { chest: '#22d3ee', bounce: '#fbbf24', lob: '#39ff88', driver: '#ff2d78' };

// ── #7 THE CONTEXTUAL HINT, AND THE FULL LIST FOR THE PAUSE SCREEN ───────────────────────────────────────────────────
/** Every control on offence (what the old always-on hint said, ~380 characters). The pause shows it. */
export const CONTROLS_OFFENCE = 'HOLD R2 (SHIFT) + a direction to SPRINT · R2 + SQUARE (SHIFT + L) at the rim = DUNK, SQUARE (L) alone = LAY IT IN · SQUARE (L): hold, release in the green · BOTTOM BUTTON (J): PASS — lean the stick at a mate (hold to FAKE); off the ball it CALLS FOR IT · CIRCLE (K): call a SCREEN · L2 (F): POST UP (shoot = HOOK · stick off the rim = FADE, with R2 = SHIMMY FADE · stick at the rim = DROP STEP · stick across = SPIN · let go early = PUMP, then shoot = UP AND UNDER) · RIGHT STICK: the dribble moves · snap the stick to break ankles';
/** Every control on defence. */
export const CONTROLS_DEFENCE = 'STAY IN FRONT of the ball (the pink ring) · HOLD L2 (F): SIT DOWN and slide · SQUARE (L): POKE (hold it for a HAND UP) · TRIANGLE (I): jump on the gather to BLOCK · HOLD CIRCLE (K): plant and TAKE THE CHARGE · L1 (Q): BOX OUT on a shot';

export interface HintState {
  defence: boolean;
  /** A live board (the ball off the iron, nobody's). */
  board: boolean;
  /** A shot is up (mine, a mate's or theirs). */
  shotUp: boolean;
  /** Their swing pass is in the air (#1). */
  theirPass: boolean;
  /** Their driver is in his gather (the block's window). */
  gathering: boolean;
  /** The ref's three-second warning is up. */
  paintWarn: boolean;
  dunking: boolean;
  /** The flight is a SHOWTIME dunk (the flush is timed). */
  showtime: boolean;
  shooting: boolean;
  carrying: boolean;
  /** A mate has it. */
  mateHasBall: boolean;
  posting: boolean;
  /** Inside the drive dunk's range of the rim. */
  nearRim: boolean;
  /** Standing still with the ball (triple threat). */
  set: boolean;
}
/** One line for the state the player is in ('' = nothing to say: the dunk is in the air). The urgent ones start the way the 1v1's
 *  do, so onevoneRules.hintSwap lets them in at once. */
export function hintFor(s: HintState): string {
  if (s.defence) {
    if (s.board) return 'LOOSE BALL — GO GET IT · L1 (Q) BOXES OUT';
    if (s.shotUp) return 'SHOT UP — HOLD L1 (Q) TO BOX OUT YOUR MAN';
    if (s.theirPass) return 'THEY SWUNG IT — CLOSE OUT ON THE CATCH';
    if (s.gathering) return 'HE IS GATHERING — TRIANGLE (I) TO BLOCK';
    return 'STAY IN FRONT OF THE RING · SQUARE (L) POKE · HOLD CIRCLE (K) TAKE THE CHARGE';
  }
  if (s.paintWarn) return HINT_PAINT;
  if (s.dunking) return s.showtime ? 'SQUARE AT THE RIM — TIME THE FLUSH' : '';
  if (s.shooting) return 'LET GO OF SQUARE (L) IN THE GREEN · EARLY = PUMP FAKE';
  if (s.board) return 'GO GET THE BOARD · L1 (Q) BOXES OUT';
  if (s.shotUp) return 'CRASH THE GLASS · HOLD L1 (Q) TO BOX OUT';
  if (s.mateHasBall) return 'GET OPEN · BOTTOM BUTTON (J) CALLS FOR THE BALL';
  if (!s.carrying) return '';
  if (s.posting) return 'POST: SQUARE HOOK · STICK OFF THE RIM + SQUARE FADE · SWING THE STICK = SPIN';
  if (s.nearRim) return 'R2 + SQUARE (SHIFT + L) = DUNK · SQUARE (L) ALONE = LAY IT IN';
  if (s.set) return 'TAP THE STICK TO JAB · BOTTOM BUTTON (J) PASS · CIRCLE (K) SCREEN';
  return 'LEAN THE STICK AT A MATE + J TO PASS · CIRCLE (K) SCREEN · SQUARE (L) SHOOT';
}

// ── #9 THE BOX SCORE: its own import-free module (lib/proofLine prints it on the end card, and the shell must not pull the
// basketball core in for one line) ─────────────────────────────────────────────────────────────────────────────────
export { type BoxScore, emptyBox, boxLine } from './threevthreeBox';

// ── #14 THE BODY LAYERS' LEVEL OF DETAIL ─────────────────────────────────────────────────────────────────────────────
/** 0 full · 1 far (no drag / lean, the posture's feed every other frame) · 2 off-screen (no drag / lean / posture). */
export type Lod = 0 | 1 | 2;
/** Far from the camera past LOD_FAR_IN_M; back to full inside LOD_FAR_OUT_M (the gap keeps a body on the line from flicking). */
export const LOD_FAR_IN_M = 13, LOD_FAR_OUT_M = 11.5;
export function lodFor(prev: Lod, o: { offBall: boolean; onScreen: boolean; distM: number }): Lod {
  if (!o.offBall) return 0;
  if (!o.onScreen) return 2;
  return o.distM > (prev >= 1 ? LOD_FAR_OUT_M : LOD_FAR_IN_M) ? 1 : 0;
}
