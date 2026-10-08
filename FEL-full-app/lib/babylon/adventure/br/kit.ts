/**
 * A fighter's kit for ONE match (ADVENTURE PLAN: "Nothing found in a match carries out of it"). The kit is plain data
 * on the match state, made fresh for every fighter at the drop and thrown away with the match; nothing in this file
 * reads or writes a save (kit.test.ts holds the match to that, end to end).
 *
 * What the kit turns into, each through its owner's door:
 *   spells     the fighter's SpellLoadout (A2's magic system reads it through `loadoutOf`): slot 1 is the bonded
 *              partner's spell from the start; scrolls fill slots 2–4 (slow-time is the focus trigger, so its scroll
 *              only teaches it)
 *   weapon     attribute bonuses (A3's stats re-derive; A2's damage reads force)
 *   armour, charm, boots
 *              one GearBonus (A3's stats system; capped by GEAR_CAPS)
 *   abilities  flags the BR's own systems read (bond, downs, zone)
 *   shards     partner stages for the match (br/bond.ts)
 * Picking up an item of a kind you hold SWAPS it: the old one drops where you stand.
 */

import { PRQ_ATTRS, type PrqAttr } from '@/lib/prq';
import { SPELL_SLOTS } from '../contracts';
import type { GearBonus } from '../stats/derive';
import { FISTS, RARITY_RANK, lootById, type AbilityId, type LootDef } from './loot';

/** The bonded partner's spell: every fighter starts with it in slot 1 (the owner's "partner magic"). */
export const PARTNER_SPELL = 'partner.surge';
/** Slow-time is the focus trigger (A2): its scroll teaches it and takes no slot. */
const UNSLOTTED = new Set(['mind.slowTime']);

export interface Kit {
  weapon: string;
  armour: string | null;
  charm: string | null;
  boots: string | null;
  /** A2's SpellLoadout shape, mutated in place (the magic system holds a reference through loadoutOf). */
  spells: { known: string[]; equipped: (string | null)[] };
  abilities: AbilityId[];
  /** Evolution shards taken (each one a partner stage for the match). */
  shards: number;
}

export function newKit(): Kit {
  const equipped: (string | null)[] = Array.from({ length: SPELL_SLOTS }, () => null);
  equipped[0] = PARTNER_SPELL;
  return { weapon: FISTS.id, armour: null, charm: null, boots: null, spells: { known: [PARTNER_SPELL], equipped }, abilities: [], shards: 0 };
}

export const hasAbility = (k: Kit, id: AbilityId): boolean => k.abilities.includes(id);

/** The armour, charm and boots, as one GearBonus (A3 caps it). */
export function kitGear(k: Kit): GearBonus {
  const g: Required<GearBonus> = { hp: 0, poise: 0, energyRegen: 0, speed: 0 };
  for (const id of [k.armour, k.charm, k.boots]) {
    const d = id ? lootById(id) : null;
    if (!d?.gear) continue;
    g.hp += d.gear.hp ?? 0; g.poise += d.gear.poise ?? 0; g.energyRegen += d.gear.energyRegen ?? 0; g.speed += d.gear.speed ?? 0;
  }
  return g;
}

/** The normalised attributes plus the weapon's bonus, clamped 0..100. */
export function kitAttrs(k: Kit, base: Readonly<Record<PrqAttr, number>>): Record<PrqAttr, number> {
  const w = lootById(k.weapon) ?? FISTS;
  const out = {} as Record<PrqAttr, number>;
  for (const a of PRQ_ATTRS) out[a] = Math.max(0, Math.min(100, (base[a] ?? 0) + (w.attrs?.[a] ?? 0)));
  return out;
}

const rank = (id: string | null): number => (id ? RARITY_RANK[lootById(id)?.rarity ?? 'common'] : 0);

/**
 * How much `d` would improve this kit (0 = not at all). Bots read it to decide what is worth a detour; a human walks
 * over what they want.
 */
export function upgradeScore(k: Kit, d: LootDef): number {
  switch (d.kind) {
    case 'ability': return d.ability && !hasAbility(k, d.ability) ? 2 + RARITY_RANK[d.rarity] : 0;
    case 'shard': return 3;
    case 'spell': {
      if (!d.spellId || k.spells.known.includes(d.spellId)) return 0;
      if (UNSLOTTED.has(d.spellId)) return 2;
      const free = k.spells.equipped.some((s, i) => i > 0 && s === null);
      return free ? 2 + RARITY_RANK[d.rarity] : Math.max(0, RARITY_RANK[d.rarity] - worstScrollRank(k));
    }
    case 'weapon': return Math.max(0, RARITY_RANK[d.rarity] + 1 - (k.weapon === FISTS.id ? 0 : rank(k.weapon) + 1)) * 1.5;
    case 'armour': return Math.max(0, RARITY_RANK[d.rarity] - rank(k.armour)) * 1.5;
    case 'charm': return Math.max(0, RARITY_RANK[d.rarity] - rank(k.charm));
    case 'boots': return Math.max(0, RARITY_RANK[d.rarity] - rank(k.boots));
  }
}

function worstScrollRank(k: Kit): number {
  let worst = Infinity;
  for (let i = 1; i < k.spells.equipped.length; i++) {
    const s = k.spells.equipped[i];
    worst = Math.min(worst, s ? rank(`scroll.${s}`) : 0);
  }
  return Number.isFinite(worst) ? worst : 0;
}

/** The slot a new scroll goes in: the first empty one past the partner's, else `prefer` (when 1..3), else the weakest. */
function slotFor(k: Kit, prefer: number | null): number {
  const eq = k.spells.equipped;
  for (let i = 1; i < eq.length; i++) if (eq[i] === null) return i;
  if (prefer !== null && prefer >= 1 && prefer < eq.length) return prefer;
  let best = 1, bestRank = Infinity;
  for (let i = 1; i < eq.length; i++) {
    const r = rank(eq[i] ? `scroll.${eq[i]}` : null);
    if (r < bestRank) { bestRank = r; best = i; }
  }
  return best;
}

export interface TakeResult {
  /** The kit changed (the item is gone from the floor). */
  took: boolean;
  /** What the swap put back on the floor (null when nothing). */
  dropped: LootDef | null;
  /** The stats need re-deriving (weapon, armour, charm, boots). */
  restat: boolean;
}

const NOPE: TakeResult = Object.freeze({ took: false, dropped: null, restat: false }) as TakeResult;

/**
 * Put `d` in the kit. `slot` is the spell slot a human has selected (a scroll replaces it when every slot is full).
 * Returns what changed. An item the kit cannot use (a spell already known, an ability already held) is left lying.
 */
export function takeLoot(k: Kit, d: LootDef, slot: number | null = null): TakeResult {
  switch (d.kind) {
    case 'ability':
      if (!d.ability || hasAbility(k, d.ability)) return NOPE;
      k.abilities.push(d.ability);
      return { took: true, dropped: null, restat: false };
    case 'shard':
      k.shards++;
      return { took: true, dropped: null, restat: false };
    case 'spell': {
      const id = d.spellId;
      if (!id || k.spells.known.includes(id)) return NOPE;
      if (UNSLOTTED.has(id)) { k.spells.known.push(id); return { took: true, dropped: null, restat: false }; }
      const i = slotFor(k, slot);
      const old = k.spells.equipped[i];
      k.spells.equipped[i] = id;
      k.spells.known.push(id);
      let dropped: LootDef | null = null;
      if (old) {
        const at = k.spells.known.indexOf(old);
        if (at >= 0) k.spells.known.splice(at, 1);
        dropped = lootById(`scroll.${old}`);
      }
      return { took: true, dropped, restat: false };
    }
    case 'weapon': {
      if (!d.weapon || d.id === k.weapon) return NOPE;
      const old = k.weapon;
      k.weapon = d.id;
      return { took: true, dropped: old === FISTS.id ? null : lootById(old), restat: true };
    }
    case 'armour': case 'charm': case 'boots': {
      const key = d.kind;
      if (k[key] === d.id) return NOPE;
      const old = k[key];
      k[key] = d.id;
      return { took: true, dropped: old ? lootById(old) : null, restat: true };
    }
  }
}

/** Everything a fighter carries that can lie on the floor (what spills when they are eliminated). */
export function kitItems(k: Kit): LootDef[] {
  const out: LootDef[] = [];
  const add = (id: string | null) => { const d = id ? lootById(id) : null; if (d) out.push(d); };
  if (k.weapon !== FISTS.id) add(k.weapon);
  add(k.armour); add(k.charm); add(k.boots);
  for (const s of k.spells.known) if (s !== PARTNER_SPELL) add(`scroll.${s}`);
  for (const a of k.abilities) add(`ability.${a}`);
  for (let i = 0; i < k.shards; i++) add('shard.evolve');
  return out;
}
