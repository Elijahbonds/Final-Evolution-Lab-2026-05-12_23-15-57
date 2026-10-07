/**
 * The Battle Royale's numbers (ADVENTURE PLAN Phase C, "The Battle Royale"). One table, so the owner can find every
 * feel number of the BR in one place. Every value is a STARTING value: [TUNE] unless it says it is the plan's.
 *
 * Pure data: no imports from Babylon, no clock, no randomness.
 */

import type { Element } from '../contracts';

/** The match's shape (the plan: 12–16 fighters, up to 6 humans later over netd; Phase C is offline: you + 11 bots). */
export const BR_FIGHTERS = 12;
/** The plan's summon rule: at most this many summoned partners in the whole match at once (the body budget). */
export const BR_MAX_SUMMONED = 4;
/** Skinned bodies the BR may draw at once on a phone (the plan: 12 fighters + ≤ 4 summoned partners). */
export const BR_SKINNED_CAP = { mobile: 16, desktop: 24 } as const;

/**
 * THE NORMALISED FIGHTER (owner, 2026-10-06: "the BR uses a normalised level so it stays fair"). Everyone in a match
 * fights at this level, with these attributes and this bond, whatever their story save holds; only the look, the style
 * (school: a trade, not a buff) and the partner's element come from the player. [TUNE]
 */
export const BR_LEVEL = 10;
export const BR_ATTR = 55;
/** Bond 25 = fusion tier 1 for everyone (contracts.fusionTierFor). [TUNE] */
export const BR_BOND = 25;
/** A creature partner starts the match at its riding stage (a ground mount); a shard makes it a flyer. [TUNE] */
export const BR_PARTNER_STAGE = 1;

/** The drop (the plan: "drop-in (spawn/glide in)"). Fighters glide down from this high, steering. [TUNE] */
export const DROP = {
  /** Height the glide starts at, metres above the ground. */
  heightM: 70,
  /** Seconds before the first zone phase starts counting, so everyone is down. */
  graceSec: 14,
} as const;

/**
 * THE ZONE (the plan: "a shrinking circle in five phases (wait, shrink, wait…), damage per second rising each phase,
 * plus a CEILING that comes down with it so flight cannot hide above the storm"). Phase i waits `waitSec`, then shrinks
 * over `shrinkSec` to `radiusM` with its ceiling easing down to `ceilingY`; outside the circle (or above the ceiling)
 * a body takes `dps`. After the fifth phase the circle COLLAPSES to nothing over `collapseSec`, so every match ends.
 * [TUNE] all of it.
 */
export interface ZonePhaseDef { waitSec: number; shrinkSec: number; radiusM: number; dps: number; ceilingY: number }
export const ZONE_START = { radiusM: 240, ceilingY: 120, dps: 1 } as const;
export const ZONE_PHASES: readonly ZonePhaseDef[] = [
  { waitSec: 35, shrinkSec: 30, radiusM: 150, dps: 2, ceilingY: 90 },
  { waitSec: 25, shrinkSec: 25, radiusM: 95, dps: 4, ceilingY: 65 },
  { waitSec: 20, shrinkSec: 20, radiusM: 55, dps: 7, ceilingY: 48 },
  { waitSec: 15, shrinkSec: 18, radiusM: 28, dps: 11, ceilingY: 36 },
  { waitSec: 12, shrinkSec: 15, radiusM: 12, dps: 16, ceilingY: 28 },
];
export const ZONE_COLLAPSE = { waitSec: 10, collapseSec: 25, dps: 25, ceilingY: 22 } as const;
/** Zone damage lands in ticks this long (so a hit reads as a pulse, not a 60 Hz drip). */
export const ZONE_TICK_SEC = 0.5;

/** Loot. [TUNE] */
export const LOOT = {
  /** Walk within this of an item to take it (no button: a phone thumb is busy). */
  pickupM: 1.3,
  /** Stand at a chest this long to open it. */
  chestOpenSec: 0.6,
  chestM: 1.8,
  /** Items a chest spills. */
  chestDrops: 3,
  /** Floor items rolled per loot spot at the match start (the rest of the spot stays empty). */
  floorChance: 0.7,
  /** An eliminated fighter's kit spills where they fell, this far apart. */
  spillM: 1.2,
} as const;

/** The partner, bonded (solos: "one assist of about 8 s on a cooldown"). [TUNE] */
export const SUMMON = { sec: 8, cooldownSec: 24, longSec: 12, cooldownMultAbility: 0.7 } as const;

/** Downs and revives in duos (OnslaughtCore.DownRevive's channel and range; the BR bleeds faster). [TUNE] */
export const DOWNS = {
  /** DownRevive bleeds out in 30 s; the BR runs that clock this much faster (20 s). */
  bleedRate: 1.5,
  /** Each hostile fighter standing over a downed body runs its clock this much faster again (the finish). */
  finishRate: 3,
  finishM: 2.5,
  /** A solo fighter at zero lies this long before the elimination clears the body away. */
  soloLieSec: 1.5,
  /** A cleared body's kit spills, then the body leaves the scene after this long. */
  corpseSec: 1.5,
} as const;

/** The BR's abilities, as numbers (br/loot.ts names them). [TUNE] */
export const ABILITY = {
  /** Long wings: fused flight lasts this much longer, and cruise pays back a share of its energy. */
  cruiseFusionMult: 1.5,
  cruiseRefund: 0.25,
  /** Quick bond: the fusion meter fills this much faster. */
  quickFuseMult: 1.6,
  /** Storm skin: zone damage × this. */
  stormSkinMult: 0.6,
  /** Swift hands: a revive channels this much faster. */
  swiftReviveMult: 2,
} as const;

/** The fusion meter in a BR: damage dealt fills it (the partner is bonded, always "beside" you). [TUNE] */
export const BR_FUSION_PER_DAMAGE = 1 / 220;

/**
 * THE BOTS. Three tiers (the plan: "difficulty tiers"). `skill` is RivalCombatBrain's difficulty; the senses are what
 * keeps a bot honest (no omniscience: it sees within `sightM` inside its field of view and with a clear line, hears
 * within `hearM` all round, and remembers a fighter it lost for `memorySec`); `thinkHz` is how often it re-plans
 * (time-sliced across bots), `reactSec` its delay before it acts on something new. [TUNE]
 */
export type BotTier = 'easy' | 'normal' | 'hard';
export interface BotTierDef {
  skill: number; sightM: number; fovDeg: number; hearM: number; memorySec: number; thinkHz: number; reactSec: number;
  /** Chance per decision to cast when a spell is ready and the target is in range. */
  castChance: number;
  /** Uses rails and flight to rotate. */
  traverses: boolean;
  /** HP fraction below which it disengages toward cover / the circle. */
  fleeHp01: number;
}
export const BOT_TIERS: Readonly<Record<BotTier, BotTierDef>> = Object.freeze({
  easy: { skill: 0.35, sightM: 38, fovDeg: 120, hearM: 10, memorySec: 3, thinkHz: 6, reactSec: 0.45, castChance: 0.25, traverses: false, fleeHp01: 0 },
  normal: { skill: 0.6, sightM: 48, fovDeg: 140, hearM: 14, memorySec: 5, thinkHz: 8, reactSec: 0.3, castChance: 0.45, traverses: true, fleeHp01: 0.2 },
  hard: { skill: 0.85, sightM: 58, fovDeg: 160, hearM: 18, memorySec: 7, thinkHz: 10, reactSec: 0.18, castChance: 0.65, traverses: true, fleeHp01: 0.3 },
});
/** The 11 bots of an offline match, by tier. [TUNE] */
export const BOT_MIX: readonly BotTier[] = ['easy', 'easy', 'easy', 'normal', 'normal', 'normal', 'normal', 'normal', 'hard', 'hard', 'hard'];
/** A sound (a hit, a cast) carries this far for a bot's hearing, on top of the tier's quiet hearing radius. */
export const LOUD_M = 30;

/** Elements a bot's bonded partner can carry (the starter species' and the characters'). */
export const BOT_ELEMENTS: readonly Element[] = ['fire', 'wind', 'earth', 'water', 'lightning', 'ice', 'light', 'shadow'];

/** The per-tick budget the headless match is held to (ms per 60 Hz step, mean, on the CI box). [TUNE] */
export const TICK_BUDGET_MS = 2.5;
