/**
 * BR loot (ADVENTURE PLAN, "The Battle Royale": "No guns. Loot is power"). What a fighter can find, the tables it is
 * rolled from, and the rule that NOTHING FOUND IN A MATCH CARRIES OUT OF IT (br/kit.ts holds a fighter's finds on the
 * match only; nothing here touches the save).
 *
 *   ability   a match-long verb tweak (fused flight that lasts, a quicker fusion meter, a longer summon, faster revives,
 *             a skin against the storm)
 *   spell     an element scroll or a mind-power scroll, into one of the four slots (A2's spell table: every id here is a
 *             real SpellDef the magic system casts)
 *   shard     a partner-evolution shard: the bonded creature grows a stage FOR THE MATCH (a ground mount becomes a
 *             flyer); a built character partner deepens its bond instead (a fusion tier)
 *   weapon    the arsenal's melee weapons (combat/arsenal.ts: fists, blade, staff, gauntlet) — they change the
 *             fighter's force (A2's damage reads it through FighterStyle.ratingsFrom) and the bots' spacing (reach)
 *   armour    HP and poise (A3's GearBonus)
 *   charm     energy regen (A3's GearBonus)
 *   boots     speed (A3's GearBonus.speed → DerivedStats.speedMult) — see BOOTS_LIVE
 *
 * THE NO-GUNS RULE is a content guard (loot.test.ts, like A2's): no loot id, name or kind may name a firearm or a
 * projectile weapon; the only things that fly are spells.
 *
 * Names are generic and [PLACEHOLDER] until the owner names them (the IP line). Every number is [TUNE].
 */

import type { PrqAttr } from '@/lib/prq';
import type { WeaponId } from '@/lib/babylon/combat/arsenal';
import type { GearBonus } from '../stats/derive';
import { pickWeighted } from './rng';

export const LOOT_KINDS = ['ability', 'spell', 'shard', 'weapon', 'armour', 'charm', 'boots'] as const;
export type LootKind = (typeof LOOT_KINDS)[number];
export const RARITIES = ['common', 'rare', 'epic'] as const;
export type Rarity = (typeof RARITIES)[number];
export const RARITY_RANK: Readonly<Record<Rarity, number>> = { common: 1, rare: 2, epic: 3 };

export type AbilityId = 'longWings' | 'quickBond' | 'longSummon' | 'swiftHands' | 'stormSkin';

export interface LootDef {
  id: string;
  kind: LootKind;
  rarity: Rarity;
  /** Display name: generic and [PLACEHOLDER]. */
  name: string;
  /** spell: the A2 SpellDef id it teaches for the match. */
  spellId?: string;
  /** weapon: the arsenal id, and what it does to the fighter's attributes (force for A2's damage). */
  weapon?: WeaponId;
  attrs?: Partial<Record<PrqAttr, number>>;
  /** armour / charm / boots: A3's GearBonus (capped there by GEAR_CAPS). */
  gear?: GearBonus;
  ability?: AbilityId;
}

const PH = (s: string): string => `[PLACEHOLDER] ${s}`;

/**
 * Boots' speed reaches A3's derived `speedMult`, but A1's movement does not read that number yet (its run speed comes
 * from the PRQ band only), so boots would be dead loot today. They stay in the table and out of the spawn rolls until
 * the movement hook lands (a route request in the Phase C report). Flip this with that change; loot.test pins it.
 */
export const BOOTS_LIVE = false;

/** The abilities: each one's effect is wired in a BR system (bond, downs, zone) — loot.test checks every one is. */
export const ABILITIES: Readonly<Record<AbilityId, { name: string; blurb: string }>> = {
  longWings: { name: PH('Long Wings'), blurb: 'fused flight lasts longer; cruising pays energy back' },
  quickBond: { name: PH('Quick Bond'), blurb: 'the fusion meter fills faster' },
  longSummon: { name: PH('Long Call'), blurb: 'your partner\'s assist lasts longer and returns sooner' },
  swiftHands: { name: PH('Swift Hands'), blurb: 'revive a teammate twice as fast' },
  stormSkin: { name: PH('Storm Skin'), blurb: 'the storm bites less' },
};

const ability = (id: AbilityId, rarity: Rarity): LootDef => ({ id: `ability.${id}`, kind: 'ability', rarity, name: ABILITIES[id].name, ability: id });

/** Scrolls: every element bolt and the mind powers (A2's STARTER_SPELLS ids). */
const ELEMENT_SCROLLS = ['fire', 'water', 'earth', 'wind', 'lightning', 'ice', 'light', 'shadow'] as const;
const scroll = (spellId: string, label: string, rarity: Rarity): LootDef =>
  ({ id: `scroll.${spellId}`, kind: 'spell', rarity, name: PH(`${label} Scroll`), spellId });

const weapon = (w: WeaponId, rarity: Rarity, attrs: Partial<Record<PrqAttr, number>>, label: string): LootDef =>
  ({ id: `weapon.${w}`, kind: 'weapon', rarity, name: PH(label), weapon: w, attrs });

export const LOOT: readonly LootDef[] = [
  ...(['longWings', 'quickBond', 'longSummon', 'swiftHands', 'stormSkin'] as const).map((a) => ability(a, a === 'longWings' ? 'epic' : 'rare')),
  ...ELEMENT_SCROLLS.map((e) => scroll(`bolt.${e}`, `${e[0].toUpperCase()}${e.slice(1)}`, 'common')),
  scroll('mind.telekinesis', 'Lift', 'rare'),
  scroll('mind.barrier', 'Ward', 'rare'),
  scroll('mind.foresight', 'Insight', 'rare'),
  scroll('mind.slowTime', 'Stillness', 'epic'),
  scroll('partner.burst', 'Bond Burst', 'epic'),
  { id: 'shard.evolve', kind: 'shard', rarity: 'epic', name: PH('Evolution Shard') },
  // the arsenal: what each weapon does to force (power/strength) and quickness (agility/speed). [TUNE]
  weapon('blade', 'common', { agility: 12, speed: 8, power: 6 }, 'Blade'),
  weapon('staff', 'rare', { strength: 10, power: 8, flexibility: 6 }, 'Staff'),
  weapon('gauntlet', 'epic', { power: 18, strength: 14 }, 'Gauntlet'),
  { id: 'armour.light', kind: 'armour', rarity: 'common', name: PH('Light Armour'), gear: { hp: 20, poise: 8 } },
  { id: 'armour.mid', kind: 'armour', rarity: 'rare', name: PH('Plated Armour'), gear: { hp: 40, poise: 18 } },
  { id: 'armour.heavy', kind: 'armour', rarity: 'epic', name: PH('Heavy Armour'), gear: { hp: 60, poise: 30 } },
  { id: 'charm.spark', kind: 'charm', rarity: 'common', name: PH('Spark Charm'), gear: { energyRegen: 0.5 } },
  { id: 'charm.flow', kind: 'charm', rarity: 'rare', name: PH('Flow Charm'), gear: { energyRegen: 1 } },
  { id: 'charm.surge', kind: 'charm', rarity: 'epic', name: PH('Surge Charm'), gear: { energyRegen: 1.5 } },
  { id: 'boots.swift', kind: 'boots', rarity: 'common', name: PH('Swift Boots'), gear: { speed: 0.04 } },
  { id: 'boots.wind', kind: 'boots', rarity: 'rare', name: PH('Wind Boots'), gear: { speed: 0.07 } },
  { id: 'boots.storm', kind: 'boots', rarity: 'epic', name: PH('Storm Boots'), gear: { speed: 0.1 } },
];

export const LOOT_BY_ID: ReadonlyMap<string, LootDef> = new Map(LOOT.map((l) => [l.id, l]));
export function lootById(id: string): LootDef | null { return LOOT_BY_ID.get(id) ?? null; }

/** The fists: what every fighter holds before they find a weapon (not loot: nobody picks fists up). */
export const FISTS: LootDef = { id: 'weapon.fists', kind: 'weapon', rarity: 'common', name: PH('Fists'), weapon: 'fists', attrs: {} };

// ── Spawn tables ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Where a roll happens: the open field, a landmark's floor, a chest. Rarer finds sit at landmarks and in chests. */
export type LootTableId = 'field' | 'landmark' | 'chest';

const RARITY_WEIGHT: Readonly<Record<LootTableId, Readonly<Record<Rarity, number>>>> = {
  field: { common: 10, rare: 3, epic: 0.6 },
  landmark: { common: 6, rare: 5, epic: 1.6 },
  chest: { common: 3, rare: 6, epic: 3 },
};
/** Per kind, how often it is rolled (so armour and scrolls are common finds and shards rare). [TUNE] */
const KIND_WEIGHT: Readonly<Record<LootKind, number>> = { ability: 1, spell: 3, shard: 0.6, weapon: 1.6, armour: 1.6, charm: 1.2, boots: 1.2 };

/** May this item appear in a roll? (Boots wait for their movement hook.) */
export const spawnable = (l: LootDef): boolean => l.kind !== 'boots' || BOOTS_LIVE;

/** The weights a table rolls with, item by item (0 = never). */
export function tableWeights(table: LootTableId): number[] {
  return LOOT.map((l) => (spawnable(l) ? RARITY_WEIGHT[table][l.rarity] * KIND_WEIGHT[l.kind] : 0));
}
const WEIGHTS: Readonly<Record<LootTableId, readonly number[]>> = {
  field: tableWeights('field'), landmark: tableWeights('landmark'), chest: tableWeights('chest'),
};

/** One roll from a table. */
export function rollLoot(rng: () => number, table: LootTableId): LootDef {
  const i = pickWeighted(rng, WEIGHTS[table]);
  return LOOT[Math.max(0, i)];
}

/** A word a firearm or a ranged weapon would use; none may appear in loot (the no-guns content guard). */
export const GUN_WORDS: readonly RegExp[] = [
  /\bguns?\b/i, /\brifle/i, /\bpistol/i, /\bshotgun/i, /\bsniper/i, /\bammo/i, /\bbullet/i, /\bfirearm/i, /\bgrenade/i,
  /\brocket/i, /\blauncher/i, /\bsmg\b/i, /\bmagazine/i, /\bcrossbow/i, /\bbow\b/i, /\barrow/i, /\brevolver/i,
  /\bmusket/i, /\bcannon/i, /\bturret/i, /\bblaster/i, /\blaser/i, /\bminigun/i, /\bscope\b/i, /\bholster/i,
];

/** The no-guns guard over any loot table: the offending ids (empty = clean). */
export function gunViolations(table: readonly LootDef[]): string[] {
  const bad: string[] = [];
  for (const l of table) {
    const text = `${l.id} ${l.name} ${l.kind} ${l.weapon ?? ''} ${l.spellId ?? ''}`;
    if (GUN_WORDS.some((re) => re.test(text))) bad.push(l.id);
    if (l.kind === 'weapon' && !l.weapon) bad.push(`${l.id}: a weapon outside the arsenal`);
  }
  return bad;
}
