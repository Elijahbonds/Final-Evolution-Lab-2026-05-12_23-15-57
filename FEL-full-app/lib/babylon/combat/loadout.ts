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
