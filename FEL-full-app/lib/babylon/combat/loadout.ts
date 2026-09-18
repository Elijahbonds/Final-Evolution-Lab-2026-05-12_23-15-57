// THE LOADOUT — what the player picked, turned into the numbers a fight runs on (2026-09-13).
//
// One function, called once per fighter at mount. The modes do not each re-derive this, because five modes
// each doing their own multiplication is five places for the arithmetic to drift apart — which is exactly how
// Duel ended up with a WEAPON_RANGE table that understated every reach.
//
// ORDER MATTERS, and it is: weapon first, then style. The weapon decides WHAT you are swinging (its moveset,
// its ranges, its frame data); the style decides HOW you swing it. A staff in a SHARP fighter's hands is
// still a staff — long, slow, punishable — just a slightly quicker one. If style came first, a school could
// silently reshape a weapon's identity, and the weapon picker would stop meaning anything.

import type { CombatMove } from '../core/StrikeSystem';
import type { AttackDef } from '../core/FightCore';
import { weaponById, readWeapon, type ArsenalEntry } from './arsenal';
import {
  readBlend, blendTraits, blendName, startupMult, damageMult, rangeMult, guardTakenMult, chiMult, cancelMult,
  type StyleBlend, type StyleTraits,
} from './schools';

export interface Loadout {
  weapon: ArsenalEntry;
  blend: StyleBlend;
  traits: StyleTraits;
  /** The weapon's moveset with the style applied — what the StrikeController is handed. */
  moveset: Record<string, CombatMove>;
  /** Reach after the style's range multiplier — the number the AI must space off. */
  reach: number;
  /** Multiplier on guard damage TAKEN while blocking. */
  guardTaken: number;
  /** What the HUD shows: "STAFF · SHARP / ANCHORED 70-30". */
  label: string;
}

/**
 * Apply a style to a weapon's moveset.
 *
 * Every move is rebuilt rather than mutated: the StrikeController holds onto whatever it is given, and two
 * fighters sharing one move object is the bug that reads as "the rival's combo cancelled mine".
 *
 * MIN_STARTUP_SEC is StrikeSystem's readability floor and it is respected here rather than left to chance —
 * the fastest possible build (SHARP with the fists) lands at 0.09 s on the jab, which is under the floor. A
 * move nobody can react to is not a fast fighter, it is a broken one.
 */
export function styleMoveset(
  moveset: Record<string, CombatMove>, traits: StyleTraits, minStartupSec: number,
): Record<string, CombatMove> {
  const su = startupMult(traits), dmg = damageMult(traits);
  const rng = rangeMult(traits), chi = chiMult(traits), cancel = cancelMult(traits);
  const out: Record<string, CombatMove> = {};
  for (const [id, m] of Object.entries(moveset)) {
    out[id] = {
      ...m,
      startupSec: Math.max(minStartupSec, m.startupSec * su),
      cancelWindowSec: m.cancelWindowSec * cancel,
      atk: {
        ...m.atk,
        dmg: m.atk.dmg * dmg,
        range: m.atk.range * rng,
        startupMs: Math.max(minStartupSec * 1000, m.atk.startupMs * su),
        chiGain: m.atk.chiGain * chi,
      },
    };
  }
  return out;
}

/**
 * Apply a style to a plain AttackDef table.
 *
 * The karate modes never went through a moveset — they read KARATE_ATTACKS directly and build an AttackDef
 * per strike. Rather than restructure two working fight loops to introduce a moveset they do not otherwise
 * need, the same multipliers are applied to the table they DO read, so a school means the same thing in every
 * combat mode. Same rebuild-never-mutate rule: the shared KARATE_ATTACKS constant is not touched.
 */
export function styleAttacks<K extends string>(
  attacks: Record<K, AttackDef>, traits: StyleTraits, minStartupMs: number,
): Record<K, AttackDef> {
  const su = startupMult(traits), dmg = damageMult(traits), rng = rangeMult(traits), chi = chiMult(traits);
  const out = {} as Record<K, AttackDef>;
  for (const key of Object.keys(attacks) as K[]) {
    const a = attacks[key];
    out[key] = {
      ...a,
      dmg: a.dmg * dmg,
      range: a.range * rng,
      startupMs: Math.max(minStartupMs, a.startupMs * su),
      chiGain: a.chiGain * chi,
    };
  }
  return out;
}

/**
 * Build the loadout from the remembered picks.
 *
 * `overrides` exists for the modes that already let you choose mid-session — Duel's in-round A/B/Y weapon
 * phase is a real feature and the start-up screen does not replace it; the screen sets what you START with.
 */
export function readLoadout(minStartupSec: number, overrides?: { weaponId?: string }): Loadout {
  const weapon = overrides?.weaponId ? weaponById(overrides.weaponId) : readWeapon();
  const blend = readBlend();
  const traits = blendTraits(blend);
  const moveset = styleMoveset(weapon.moveset(), traits, minStartupSec);
  return {
    weapon,
    blend,
    traits,
    moveset,
    reach: Math.max(...Object.values(moveset).map((m) => m.atk.range)),
    guardTaken: guardTakenMult(traits),
    label: `${weapon.name} · ${blendName(blend)}`,
  };
}

// ── THE HORDE ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A style, translated for a mode where ONE CONTACT IS ONE BODY DOWN.
 *
 * Karate Endless does not run damage. Its own comment says so — "one contact = one body down", "no damage
 * math, no second hit to finish" — which is the Revolutions/Musou weight the owner locked in. Multiplying its
 * `dmg` by a school's POWER would therefore have changed nothing at all, and the CRASHING school would have
 * been a chip on a screen that did not move a single number in the fight. That is the hollow-picker failure
 * in its purest form, and it is only visible if you read what the mode actually resolves rather than
 * pattern-matching on a field called `dmg`.
 *
 * So power maps to ARC. In a horde game the weight of a swing is not how hard one body is hit — every body
 * goes down on contact — it is HOW MANY bodies the swing clears. A heavy style sweeping wider is the same
 * statement the school's line already makes, said in the grammar this mode speaks.
 *
 * The rest map to seams the mode already has, which is why they can be honest: reach and chi multiply the
 * mode's own perk values, speed scales the swing's startup, flow scales the window a combo route has to
 * chain in, and guard scales what a block costs you.
 */
export interface HordeStyle {
  /** × on the strike's range, alongside the shop's reach perk. */
  reachMult: number;
  /** × on the swing's startup delay. */
  startupMult: number;
  /** DEGREES added to the swing's arc — power, in a game where power means bodies-per-swing. */
  arcBonusDeg: number;
  /** × on the chip a block costs. */
  blockChipMult: number;
  /** × on chi gained, alongside the shop's chi perk. */
  chiMult: number;
  /** × on the route-chain window. */
  chainMult: number;
}

/** How much arc a full point of POWER is worth. 1.20 power => +20 degrees, which is one more body in a crowd. */
export const HORDE_ARC_PER_POWER = 100;

export function hordeStyle(traits: StyleTraits): HordeStyle {
  return {
    reachMult: rangeMult(traits),
    startupMult: startupMult(traits),
    arcBonusDeg: (traits.power - 1) * HORDE_ARC_PER_POWER,
    blockChipMult: guardTakenMult(traits),
    chiMult: chiMult(traits),
    chainMult: cancelMult(traits),
  };
}
