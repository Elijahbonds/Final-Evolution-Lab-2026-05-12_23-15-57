// BR loot (ADVENTURE PLAN: "No guns. Loot is power … Nothing found in a match carries out of it"). The no-guns content
// guard (like A2's), every table entry wired to something real, the kit's rules, and the match leaving the save alone.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { emptyAdventureSave, type AdventureSave } from '../contracts';
import { ARSENAL } from '@/lib/babylon/combat/arsenal';
import { STARTER_SPELLS } from '../magic/spells';
import { GEAR_CAPS } from '../stats/derive';
import { createCreaturePartner } from '../partner/defs';
import {
  ABILITIES, BOOTS_LIVE, FISTS, GUN_WORDS, LOOT, LOOT_KINDS, gunViolations, lootById, rollLoot, spawnable, tableWeights,
  type LootDef,
} from './loot';
import { PARTNER_SPELL, kitAttrs, kitGear, kitItems, newKit, takeLoot, upgradeScore } from './kit';
import { seededRng } from './rng';
import { BRMatch, BASE_ATTRS } from './match';

describe('no guns (content guard)', () => {
  it('no loot names, ids or kinds a firearm or a ranged weapon', () => {
    expect(gunViolations(LOOT)).toEqual([]);
    expect(gunViolations([FISTS])).toEqual([]);
  });

  it('the guard catches one (so a gun cannot slip in quietly)', () => {
    const bad: LootDef[] = [
      { id: 'weapon.rifle', kind: 'weapon', rarity: 'epic', name: '[PLACEHOLDER] Rifle', weapon: 'staff' },
      { id: 'x.1', kind: 'charm', rarity: 'rare', name: '[PLACEHOLDER] Ammo Pouch' },
      { id: 'x.2', kind: 'weapon', rarity: 'rare', name: '[PLACEHOLDER] Thing' },   // a weapon outside the arsenal
      { id: 'x.3', kind: 'ability', rarity: 'rare', name: '[PLACEHOLDER] Grenade Toss' },
    ];
    expect(gunViolations(bad)).toEqual(['weapon.rifle', 'x.1', 'x.2: a weapon outside the arsenal', 'x.3']);
    expect(GUN_WORDS.length).toBeGreaterThan(15);
  });

  it('the only melee weapons are the arsenal\'s, ready, and the only things that fly are spells', () => {
    const ids = new Set(ARSENAL.filter((w) => w.ready).map((w) => w.id));
    for (const l of LOOT.filter((x) => x.kind === 'weapon')) expect(ids.has(l.weapon!), l.id).toBe(true);
    expect([...ids].sort()).toEqual(['blade', 'fists', 'gauntlet', 'staff']);
    expect(LOOT_KINDS).toEqual(['ability', 'spell', 'shard', 'weapon', 'armour', 'charm', 'boots']);
  });
});

describe('the loot table', () => {
  it('every name is generic and [PLACEHOLDER] (the IP line), every id unique', () => {
    expect(new Set(LOOT.map((l) => l.id)).size).toBe(LOOT.length);
    for (const l of LOOT) expect(l.name.startsWith('[PLACEHOLDER]'), l.id).toBe(true);
  });

  it('every scroll teaches a real spell of A2\'s table (element and mind scrolls both)', () => {
    const spells = new Set(STARTER_SPELLS.map((s) => s.id));
    const scrolls = LOOT.filter((l) => l.kind === 'spell');
    for (const l of scrolls) expect(spells.has(l.spellId!), l.id).toBe(true);
    expect(scrolls.some((l) => l.spellId!.startsWith('bolt.'))).toBe(true);
    expect(scrolls.some((l) => l.spellId!.startsWith('mind.'))).toBe(true);
  });

  it('every ability is wired into a BR system (bond, downs, zone or the match), not just listed', () => {
    const src = ['bond.ts', 'downs.ts', 'match.ts', 'zone.ts'].map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');
    for (const id of Object.keys(ABILITIES)) expect(src.includes(`'${id}'`), id).toBe(true);
  });

  it('armour, charms and boots stay inside A3\'s gear caps', () => {
    for (const l of LOOT) {
      if (!l.gear) continue;
      for (const [k, v] of Object.entries(l.gear)) expect(v, `${l.id}.${k}`).toBeLessThanOrEqual(GEAR_CAPS[k as keyof typeof GEAR_CAPS]);
    }
  });

  it('boots wait for their movement hook: not spawnable while BOOTS_LIVE is off', () => {
    expect(BOOTS_LIVE).toBe(false);
    for (const t of ['field', 'landmark', 'chest'] as const) {
      const w = tableWeights(t);
      LOOT.forEach((l, i) => { if (l.kind === 'boots') expect(w[i]).toBe(0); else expect(w[i]).toBeGreaterThan(0); });
    }
  });

  it('rolls are seeded, spawnable only, and chests roll rarer than the field', () => {
    const a = seededRng(3), b = seededRng(3);
    const r1 = Array.from({ length: 50 }, () => rollLoot(a, 'field').id), r2 = Array.from({ length: 50 }, () => rollLoot(b, 'field').id);
    expect(r1).toEqual(r2);
    const rank = { common: 1, rare: 2, epic: 3 } as const;
    const mean = (t: 'field' | 'chest') => { const g = seededRng(9); let s = 0; for (let i = 0; i < 2000; i++) { const d = rollLoot(g, t); expect(spawnable(d)).toBe(true); s += rank[d.rarity]; } return s / 2000; };
    expect(mean('chest')).toBeGreaterThan(mean('field') + 0.4);
  });
});

describe('the kit', () => {
  it('starts with fists and the partner\'s spell in slot 1, nothing else', () => {
    const k = newKit();
    expect(k.weapon).toBe(FISTS.id);
    expect(k.spells.equipped).toEqual([PARTNER_SPELL, null, null, null]);
    expect(kitItems(k)).toEqual([]);
  });

  it('scrolls fill the free slots, then replace the selected one (the old scroll drops)', () => {
    const k = newKit();
    for (const e of ['fire', 'ice', 'wind']) expect(takeLoot(k, lootById(`scroll.bolt.${e}`)!).took).toBe(true);
    expect(k.spells.equipped).toEqual([PARTNER_SPELL, 'bolt.fire', 'bolt.ice', 'bolt.wind']);
    const r = takeLoot(k, lootById('scroll.bolt.earth')!, 2);
    expect(r.dropped?.id).toBe('scroll.bolt.ice');
    expect(k.spells.equipped).toEqual([PARTNER_SPELL, 'bolt.fire', 'bolt.earth', 'bolt.wind']);
    expect(k.spells.known).not.toContain('bolt.ice');
    expect(takeLoot(k, lootById('scroll.bolt.fire')!).took, 'a spell already known is left lying').toBe(false);
    // slow-time is the focus trigger: its scroll teaches it and takes no slot
    expect(takeLoot(k, lootById('scroll.mind.slowTime')!).took).toBe(true);
    expect(k.spells.known).toContain('mind.slowTime');
    expect(k.spells.equipped).not.toContain('mind.slowTime');
  });

  it('a weapon changes force through the attributes; armour and charms sum into one GearBonus; a swap drops the old', () => {
    const k = newKit();
    takeLoot(k, lootById('weapon.gauntlet')!);
    const at = kitAttrs(k, BASE_ATTRS);
    expect(at.power).toBe(BASE_ATTRS.power + 18);
    expect(at.agility).toBe(BASE_ATTRS.agility);
    takeLoot(k, lootById('armour.mid')!); takeLoot(k, lootById('charm.flow')!);
    expect(kitGear(k)).toEqual({ hp: 40, poise: 18, energyRegen: 1, speed: 0 });
    const r = takeLoot(k, lootById('armour.heavy')!);
    expect(r.dropped?.id).toBe('armour.mid');
    expect(r.restat).toBe(true);
    expect(upgradeScore(k, lootById('armour.light')!), 'a worse armour is no upgrade').toBe(0);
    expect(upgradeScore(k, lootById('weapon.blade')!), 'a lesser weapon is no upgrade').toBe(0);
  });

  it('everything a fighter carries spills when they go out (the partner\'s own spell excepted)', () => {
    const k = newKit();
    for (const id of ['weapon.staff', 'armour.light', 'charm.spark', 'scroll.bolt.fire', 'ability.stormSkin', 'shard.evolve']) takeLoot(k, lootById(id)!);
    expect(kitItems(k).map((d) => d.id).sort()).toEqual(['ability.stormSkin', 'armour.light', 'charm.spark', 'scroll.bolt.fire', 'shard.evolve', 'weapon.staff']);
  });
});

describe('nothing carries out of a match', () => {
  function deepFreeze<T>(o: T): T {
    if (o && typeof o === 'object') { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
    return o;
  }

  it('the player\'s save and partner are read, copied and never written, whatever the match does with them', () => {
    const save: AdventureSave = emptyAdventureSave(0);
    save.partner = createCreaturePartner({ id: 'mine', speciesId: 'cinderpup' })!;
    save.partner.bond = 3;
    const before = JSON.stringify(save);
    deepFreeze(save);   // a write to the save (or the partner inside it) would throw
    const m = new BRMatch({ seed: 4, humans: 1, player: { school: save.player.school, partner: save.partner } });
    const me = m.fighter('player')!;
    // the match's partner is its own normalised copy
    expect(me.partner).not.toBe(save.partner);
    expect(me.partner.bond).not.toBe(save.partner.bond);
    // a shard grows the MATCH's partner
    takeLoot(me.kit, lootById('shard.evolve')!);
    takeLoot(me.kit, lootById('weapon.gauntlet')!);
    for (let i = 0; i < 60 * 30; i++) m.step();
    expect(me.partner.creature!.stage).toBeGreaterThan(save.partner.creature!.stage);
    m.dispose();
    expect(JSON.stringify(save)).toBe(before);
  });

  it('no BR sim file reads or writes the save or device storage', () => {
    const dir = __dirname;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.ts') && !x.endsWith('.test.ts') && x !== 'view.ts')) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(/from '\.\.\/save|localStorage|sessionStorage|storeAdventureSave|withProgress/.test(src), f).toBe(false);
    }
  });
});
