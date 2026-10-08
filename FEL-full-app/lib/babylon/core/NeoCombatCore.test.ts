// The horde's PRESSURE curve — the thing that makes Karate Endless hard (owner, 2026-09-19: "the karate endless
// difficulty needs to be raised"). The bodies deliberately do NOT get spongier: MookHealth caps a body at six light
// hits so a crowd stays clearable, and this file guards the levers that were raised instead — how many can swing at
// once, how fast the telegraph tightens, and how big the wave is.
import { describe, it, expect } from 'vitest';
import { ENEMY_ATTACK, maxAttackers, windupSecFor, enemyHitDamage, VITALS, PerkShop, NEO_PERKS, NEO_PERKS_TIER2, BASE_PERKS, applyPerk } from './NeoCombatCore';
import { waveSpec } from './OnslaughtCore';

describe('NeoCombatCore — the pressure curve', () => {
  it('lets more bodies swing at once as the waves climb, and still caps the mob', () => {
    expect(maxAttackers(1)).toBe(2);
    expect(maxAttackers(4)).toBeGreaterThan(maxAttackers(1));
    expect(maxAttackers(9)).toBe(7);
    expect(maxAttackers(99)).toBe(7);   // capped: swarmed with no answer is not difficulty
    let prev = 0;
    for (let w = 1; w <= 40; w++) { const v = maxAttackers(w); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
  });

  it('tightens the telegraph with the wave but never below a readable floor', () => {
    expect(windupSecFor(1)).toBeCloseTo(ENEMY_ATTACK.windupSec, 5);
    expect(windupSecFor(9)).toBeLessThan(windupSecFor(1));
    expect(windupSecFor(99)).toBe(ENEMY_ATTACK.windupMinSec);
    expect(ENEMY_ATTACK.windupMinSec).toBeGreaterThanOrEqual(0.2);   // under ~0.2 s a human cannot read the wind-up
  });

  it('grows the wave and its speed, both capped', () => {
    const w1 = waveSpec(1), w8 = waveSpec(8), w40 = waveSpec(40);
    expect(w8.count).toBeGreaterThan(w1.count);
    expect(w8.speedMult).toBeGreaterThan(w1.speedMult);
    expect(w40.count).toBeLessThanOrEqual(20);
    expect(w40.speedMult).toBeLessThanOrEqual(1.75);
    expect(waveSpec(40, 12).count).toBeLessThanOrEqual(12);   // the mobile tier's smaller ceiling holds
  });

  it('creeps enemy damage with the wave and caps it well short of a one-shot', () => {
    expect(enemyHitDamage(1)).toBe(VITALS.hitDmgBase);
    expect(enemyHitDamage(99)).toBe(VITALS.hitDmgCap);
    expect(enemyHitDamage(3, 'kick')).toBeGreaterThan(enemyHitDamage(3));
    expect(VITALS.hitDmgCap * 3).toBeLessThan(VITALS.maxHp);   // three hits can never end a run
    expect(ENEMY_ATTACK.kick.fromWave).toBeLessThanOrEqual(3);
  });
});

// IMPROVE (2026-10-06, owner pick #20): the shop deepens — a second tier in each slot, so it stops skipping itself.

describe('NeoCombatCore — the perk tiers', () => {
  const both = () => new PerkShop([...NEO_PERKS, ...NEO_PERKS_TIER2]);

  it('every tier-II perk moves a number and builds on its tier I', () => {
    for (const p of NEO_PERKS_TIER2) {
      expect(NEO_PERKS.some((q) => q.id === p.requires), p.id).toBe(true);
      expect(applyPerk(BASE_PERKS, p.id), p.id).not.toEqual(BASE_PERKS);
      expect(p.cost).toBeGreaterThan(NEO_PERKS.find((q) => q.id === p.requires)!.cost);
    }
  });

  it('the shop shows four slots; owning tier I puts tier II in the same slot', () => {
    const s = both();
    expect(s.offers.map((p) => p.id)).toEqual(['iron', 'hands', 'flow', 'quick']);
    expect(s.buy(6).ok).toBe(true);                                    // iron
    expect(s.offers.map((p) => p.id)).toEqual(['iron2', 'hands', 'flow', 'quick']);
    expect(s.selected.id).toBe('iron2');                               // the cursor stays in its slot
    expect(s.hudLine().split(' · ')).toHaveLength(4);
    expect(s.hudLine().startsWith('▶ IRON BODY II 10◆')).toBe(true);
  });

  it('it no longer counts as sold out after the four — only after all eight', () => {
    const s = both();
    for (const p of NEO_PERKS) s.owned.add(p.id);
    expect(s.allOwned).toBe(false);
    for (const p of NEO_PERKS_TIER2) s.owned.add(p.id);
    expect(s.allOwned).toBe(true);
    expect(s.offers.map((p) => p.id)).toEqual(['iron2', 'hands2', 'flow2', 'quick2']);   // the last tier, owned
    expect(s.buy(999).reason).toBe('OWNED');
  });

  it('a tier is never sold before its parent, and the state stacks both', () => {
    const s = both();
    s.sel = 0;
    expect(s.buy(5).reason).toMatch(/NEED/);                            // tier I first, whatever is in the wallet
    s.owned.add('iron'); s.owned.add('iron2');
    expect(s.state().maxHp).toBe(BASE_PERKS.maxHp + 40 + 30);
    const lone = new PerkShop([...NEO_PERKS, ...NEO_PERKS_TIER2]);
    lone.sel = 0; (lone as unknown as { owned: Set<string> }).owned.clear();
    expect(lone.offers.some((p) => p.requires)).toBe(false);
  });

  it('the default shop is unchanged: four perks, no tiers', () => {
    const s = new PerkShop();
    expect(s.offers).toEqual(NEO_PERKS);
    for (const p of NEO_PERKS) s.owned.add(p.id);
    expect(s.allOwned).toBe(true);
  });
});
