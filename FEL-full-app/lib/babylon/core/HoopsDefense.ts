// HoopsDefense — the pure half of the DEFENSE contest package (HOOPS-MOVE-KIT-A amendment, 2026-09-08, D1–D3).
//
// The owner's eye: "defense must block dunks, shots and layups; strip the ball easier during body collisions; contest
// without jumping." Measured on b24337a + the M1–M3 tree: the only block in the game was the PLAYER's timed jump at the
// rival's release (checkBlock) — the AI defender never blocked anything, never put a hand up, and a rival drive could never
// end in a dunk (nothing to block); a strip was a dice roll on the ball's exposure with no relation to a body contact and
// warped the ball straight into the stripper's hand; the only contest was DISTANCE (contestLevel) plus a jump (handUpContest).
//
//   D1 BLOCK — aiBlockChance(): the AI blocks a jumper / layup / dunk at the release when he has a hand up (or a jump) inside
//      range, more when set and square; jumpSwats(): the player's timed jump inside range while a dunker is in the air
//      (between the takeoff and the resolve) swats it — the rival now DUNKS an open lane (AttackerBrain 'dunk').
//   D2 STRIP — bumpExposure(): a hard body contact opens a window in which the ball is loose in the hands (the exposure floor
//      lets a poke connect); aiBumpStrips(): a set AI defender bumped by the handler strips this often. The strip knocks the
//      ball LOOSE from the hand (the modes' stripBall) — never a warp into a palm.
//   D3 CONTEST NO-JUMP — groundContest(): a grounded hand-up inside range, facing the shooter, adds contest (verticality);
//      contestedPct(): the contest bites the make chance itself (it used to narrow only the meter); the shot is ALTERED (a
//      higher, later arc) when the contest is strong.
import { BLOCK_WINDOW_SEC } from './BasketballCore';

/** A grounded hand-up inside this of the shooter contests. */
export const HAND_UP_RANGE = 2.2;   // a closeout with a hand up, not only an arm's length (measured: the AI's press settles 1.4–2.0 m out, so 1.6 never fired)
/** … facing him this much (cos of the angle between the defender's forward and the bearing to the shooter). */
export const HAND_UP_FACING_COS = 0.2;
/** The contest a grounded hand-up adds (a contest jump adds HAND_UP_CONTEST 0.3 — see handUpContest). */
export const HAND_UP_CONTEST = 0.25;
/** After a hard body contact the ball is loose in the hands for this long … */
export const BUMP_STRIP_WINDOW_SEC = 0.4;
/** … and a poke inside the window reads at least this exposure (STEAL_EXPOSURE_MIN is 0.5: it connects). */
export const BUMP_STRIP_EXPOSURE = 0.75;
/** A set AI defender bumped by the handler strips this often. */
export const AI_BUMP_STRIP_CHANCE = 0.18;   // per collision, and only off a real sprint into a SET body (a 3 s drive used to lose the ball ~44 % of the time)
/** The AI raises a hand on a load inside range this often … */
export const AI_HAND_UP_CHANCE = 0.75;
/** … and jumps to block a metered shot this often (timed to the green). */
export const AI_BLOCK_JUMP_CHANCE = 0.3;
/** A block needs the hand inside this of the shooter. */
export const AI_BLOCK_RANGE = 1.9;   // a JUMPING defender's reach (measured: the armed blocker released from 1.6–1.8 m and the chance came out 0)
/** The AI's block chance at the release with a hand up inside range, set and square: a layup / dunk at the rim is far more
 *  blockable than a jumper from range. */
// HOOPS-MOVE-KIT-B M5: the jump hook is the LOWEST in the table on purpose — the shielding shoulder and the sweep out to
// the side are the whole reason the shot has survived seventy years of taller people.
// M11: a REVERSE finish puts the rim between him and the ball — harder to block than a straight layup, easier than a hook.
// The MIKAN is the most blockable shot on the list — you are under the ring with no separation at all, which is the
// trade for how quickly it goes up. The UP AND UNDER is the least: the block chance is read at the release, and by
// then the man who would have blocked it is on his way down, which is the entire point of the move.
export const AI_BLOCK_BASE: Record<'jumper' | 'layup' | 'floater' | 'fadeaway' | 'hook' | 'reverse' | 'mikan' | 'upAndUnder' | 'dunk', number> = { jumper: 0.12, layup: 0.3, floater: 0.22, fadeaway: 0.08, hook: 0.05, reverse: 0.11, mikan: 0.34, upAndUnder: 0.04, dunk: 0.35 };
/** A dunker in the air can be swatted between the takeoff and the resolve (flight clock 0..1). */
export const SWAT_K_FROM = 0.12, SWAT_K_TO = 0.75;   // to just before feet-down: the bump's slow-mo stretches the flight past 600 ms
/** A full contest takes this much off the shooter's make chance. */
export const CONTEST_PCT_BITE = 0.35;
/** A contest this strong ALTERS the release (a higher, later arc). */
export const ALTER_CONTEST_MIN = 0.5;
/** The altered shot's extra arc apex (metres). */
export const ALTER_APEX_ADD = 0.35;

/** The contest a grounded hand-up adds: inside range, facing the shooter; 0 otherwise. */
export function groundContest(dist: number, facingCos: number, handUp: boolean): number {
  if (!handUp || dist > HAND_UP_RANGE || facingCos < HAND_UP_FACING_COS) return 0;
  return HAND_UP_CONTEST * (1 - 0.6 * Math.max(0, dist - 0.8) / (HAND_UP_RANGE - 0.8));
}

/** The AI's chance to block at the release. `handUp` = a hand up or a contest jump in the air; a moving body halves it; the
 *  chance fades with distance inside the range; `strength01` scales it (the dunk's contest strength). */
export function aiBlockChance(kind: keyof typeof AI_BLOCK_BASE, dist: number, handUp: boolean, set: boolean, strength01 = 1): number {
  if (!handUp || dist > AI_BLOCK_RANGE) return 0;
  const reach = 1 - 0.5 * Math.max(0, dist) / AI_BLOCK_RANGE;
  return Math.max(0, Math.min(0.9, AI_BLOCK_BASE[kind] * (set ? 1 : 0.5) * reach * Math.max(0, Math.min(1, strength01))));
}

/** The ball's exposure to a poke, floored inside the bump window. `bumpAgeSec` = seconds since the last hard contact with
 *  the handler (Infinity = none). */
export function bumpExposure(exposure: number, bumpAgeSec: number): number {
  return bumpAgeSec <= BUMP_STRIP_WINDOW_SEC ? Math.max(exposure, BUMP_STRIP_EXPOSURE) : exposure;
}

/** A set defender bumped by the handler (a hard contact with the handler as the attacker) rolls a strip. */
export function aiBumpStrips(set: boolean, facingCos: number, rng: () => number): boolean {
  return set && facingCos >= HAND_UP_FACING_COS && rng() < AI_BUMP_STRIP_CHANCE;
}

/** The player's jump swats a dunker in the air: the jump is fresh (inside the block window), the dunker is inside range and
 *  between the takeoff and the resolve on his flight clock. */
export function jumpSwats(k: number, jumpAgeSec: number, dist: number): boolean {
  return k >= SWAT_K_FROM && k <= SWAT_K_TO && jumpAgeSec <= BLOCK_WINDOW_SEC + 0.15 && dist <= AI_BLOCK_RANGE;
}

/** The make chance under a contest: a hand in the shot costs up to CONTEST_PCT_BITE of it. */
export function contestedPct(pct: number, contest01: number): number {
  return Math.max(0, pct * (1 - CONTEST_PCT_BITE * Math.max(0, Math.min(1, contest01))));
}

/** The extra arc apex of an altered release (0 under a weak contest). */
export function alteredApex(contest01: number): number {
  return contest01 >= ALTER_CONTEST_MIN ? ALTER_APEX_ADD : 0;
}

/** The AI's read on the shooter's load: put a hand up when inside range and facing him. */
export function aiHandsUp(dist: number, facingCos: number, rng: () => number): boolean {
  return dist <= HAND_UP_RANGE && facingCos >= HAND_UP_FACING_COS && rng() < AI_HAND_UP_CHANCE;
}

/** The cos of the angle between a body's forward (its yaw) and the bearing to a point. */
export function facingCos(yaw: number, from: { x: number; z: number }, to: { x: number; z: number }): number {
  const dx = to.x - from.x, dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) return 1;
  return (Math.sin(yaw) * dx + Math.cos(yaw) * dz) / d;
}
