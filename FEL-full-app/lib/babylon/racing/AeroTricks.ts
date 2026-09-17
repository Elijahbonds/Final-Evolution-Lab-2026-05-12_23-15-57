// AERO TRICKS — the named stunts, the chain that links them, and the two ways flying well pays.
//
// AeroAcesMode had three stunts (roll left, roll right, loop) and one reward: every one earned `trickSmall`,
// flat. So a loop was worth the same as a roll, a roll was worth the same as the twentieth roll, and the safest
// thing a player could do was hold one button in open sky. This adds what the mode was missing:
//
//   1. A CATALOGUE. Each stunt names what it costs and what it is worth, so a loop is not a roll.
//   2. A CHAIN with decay. Linking different stunts multiplies; repeating the same one pays less each time. This
//      is the MECHANICS pass's anti-mash rule (THPS repeat decay) applied to the air, and it is the whole reason
//      a player looks for the second trick instead of mashing the first.
//   3. DYNAMICS — the two things that make flying well, rather than flying tricks, pay: HUGGING the terrain, and
//      SHAVING something on the way past. Both are proximity, both are risk, and both are what the mode's own
//      audit was missing when it scored "nothing to dodge, no reason to take one line over another".
//
// It grades against core/BoostKit's earn table, never a second currency — the owner's call on this lane is that
// kart and aero both feed the shared boost.
//
// Pure: numbers and names. No scene, no state machine — ArcadeFlight still owns the flying.

export type AeroStuntId =
  | 'roll_left' | 'roll_right' | 'loop'
  | 'immelmann' | 'split_s' | 'knife_edge';

export interface AeroStunt {
  id: AeroStuntId;
  label: string;
  /** How long it takes. */
  sec: number;
  /** Base score. */
  pts: number;
  /** True when it leaves the plane facing the other way — a tactical cost, not just a flourish. */
  reverses: boolean;
  /** Metres of clear air it needs below to be safe. Attempting one lower is what makes it a gamble. */
  clearance: number;
  /** Does it dodge an incoming missile while it runs? */
  dodges: boolean;
}

export const AERO_STUNTS: readonly AeroStunt[] = [
  { id: 'roll_left', label: 'ROLL LEFT', sec: 0.55, pts: 60, reverses: false, clearance: 12, dodges: true },
  { id: 'roll_right', label: 'ROLL RIGHT', sec: 0.55, pts: 60, reverses: false, clearance: 12, dodges: true },
  { id: 'knife_edge', label: 'KNIFE EDGE', sec: 0.7, pts: 110, reverses: false, clearance: 8, dodges: false },
  { id: 'loop', label: 'LOOP', sec: 1.15, pts: 150, reverses: true, clearance: 55, dodges: false },
  { id: 'immelmann', label: 'IMMELMANN', sec: 1.3, pts: 210, reverses: true, clearance: 70, dodges: false },
  { id: 'split_s', label: 'SPLIT-S', sec: 1.1, pts: 190, reverses: true, clearance: 95, dodges: false },
];

export const stuntById = (id: AeroStuntId): AeroStunt | null =>
  AERO_STUNTS.find((s) => s.id === id) ?? null;

/** Seconds of no stunt after which a chain is over. */
export const CHAIN_WINDOW_SEC = 2.2;
/** Each extra different stunt in a chain adds this much multiplier. */
export const CHAIN_STEP = 0.35;
export const CHAIN_MAX = 3.0;
/** What the SAME stunt is worth the 2nd, 3rd, 4th… time in one chain. */
export const REPEAT_DECAY = 0.45;
export const REPEAT_FLOOR = 0.08;

export interface AeroChain {
  /** Stunts landed in this chain, oldest first. */
  ids: AeroStuntId[];
  /** Seconds since the last one. */
  since: number;
  /** Running score for the chain. */
  pts: number;
  /** Current multiplier, for the HUD. */
  mult: number;
}

export const emptyChain = (): AeroChain => ({ ids: [], since: 0, pts: 0, mult: 1 });

/** Tick the chain. It closes itself once nothing has been landed for CHAIN_WINDOW_SEC. */
export function stepChain(chain: AeroChain, dt: number): { chain: AeroChain; closed: AeroChain | null } {
  if (!chain.ids.length) return { chain, closed: null };
  const since = chain.since + dt;
  if (since < CHAIN_WINDOW_SEC) return { chain: { ...chain, since }, closed: null };
  return { chain: emptyChain(), closed: { ...chain, since } };
}

/**
 * Score a landed stunt into the chain.
 *
 * DIFFERENT stunts build the multiplier; the SAME one decays hard. Twenty rolls in a row is worth less than a
 * roll and a loop, which is the point: the second trick has to be worth reaching for, or the first one is the
 * whole game.
 */
export function addToChain(chain: AeroChain, id: AeroStuntId): { chain: AeroChain; gained: number; repeat: number } {
  const stunt = stuntById(id);
  if (!stunt) return { chain, gained: 0, repeat: 0 };

  const priorSame = chain.ids.filter((x) => x === id).length;
  const repeatFactor = priorSame === 0 ? 1 : Math.max(REPEAT_FLOOR, REPEAT_DECAY ** priorSame);
  const distinct = new Set([...chain.ids, id]).size;
  const mult = Math.min(CHAIN_MAX, 1 + (distinct - 1) * CHAIN_STEP);
  const gained = Math.round(stunt.pts * repeatFactor * mult);

  return {
    chain: { ids: [...chain.ids, id], since: 0, pts: chain.pts + gained, mult },
    gained,
    repeat: priorSame,
  };
}

/** What a landed stunt pays the shared boost. A big reversal is worth more than a roll. */
export function boostEarnForStunt(id: AeroStuntId, repeat: number): { what: 'trickBig' | 'trickSmall'; scale: number } | null {
  const stunt = stuntById(id);
  if (!stunt) return null;
  const scale = repeat === 0 ? 1 : Math.max(REPEAT_FLOOR, REPEAT_DECAY ** repeat);
  if (scale <= REPEAT_FLOOR) return null;             // mashing stops paying entirely
  return { what: stunt.pts >= 150 ? 'trickBig' : 'trickSmall', scale };
}

// ── dynamics: the two ways flying well pays ───────────────────────────────────────────────────────────────

/** Below this much clear air you are hugging the terrain. */
export const HUG_CEILING_M = 18;
/** Full credit at this height or lower. */
export const HUG_FLOOR_M = 4;
/** Seconds of continuous hugging before it starts paying, so a dip through does not count. */
export const HUG_ARM_SEC = 0.5;

export interface HugState {
  /** Seconds spent continuously low. */
  t: number;
  /** Closest clearance reached this run, metres. */
  best: number;
}

export const noHug = (): HugState => ({ t: 0, best: Infinity });

/**
 * Reward for flying low.
 *
 * The audit's complaint about this mode was that there was "no reason to take one line over another but the next
 * ring". Hugging is that reason: the floor pays, and it pays more the closer you are, so the fast line through a
 * canyon is the frightening one. It has to ARM over half a second, or a single dip through a dive counts as
 * skill it was not.
 */
export function stepHug(
  hug: HugState, dt: number, clearance: number,
): { hug: HugState; earnPerSec: number; closeness01: number } {
  if (clearance > HUG_CEILING_M || clearance < 0) {
    return { hug: noHug(), earnPerSec: 0, closeness01: 0 };
  }
  const t = hug.t + dt;
  const best = Math.min(hug.best, clearance);
  const closeness01 = Math.max(0, Math.min(1,
    (HUG_CEILING_M - clearance) / (HUG_CEILING_M - HUG_FLOOR_M)));
  const earnPerSec = t >= HUG_ARM_SEC ? closeness01 : 0;
  return { hug: { t, best }, earnPerSec, closeness01 };
}

/** How close a pass has to be to count as shaved. */
export const SHAVE_M = 9;

/**
 * A near miss, scored by how close it was.
 *
 * Returns 0 for anything further than SHAVE_M, so the caller can feed every nearby obstacle in and only the ones
 * that were genuinely close pay.
 */
export function shaveCredit(distance: number): number {
  if (distance < 0 || distance > SHAVE_M) return 0;
  return Math.max(0, Math.min(1, 1 - distance / SHAVE_M));
}
