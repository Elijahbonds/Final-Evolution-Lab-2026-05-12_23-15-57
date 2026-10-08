// A3 fusion (docs/ADVENTURE-PLAN.md pillar 5): the meter fills from fighting together; fusing needs the bond tier, a
// full meter and the energy; it spends the energy, merges the stats, grants flight, hides the partner; it times out
// (30 s + 10 s per tier) or ends on the button or a KO; unfusing restores both.
import { describe, expect, it } from 'vitest';
import { emptyAdventureSave, flightSourceOf, type DamageEvent, type PartnerDef } from '../contracts';
import { createStatsSystem, statsSetupForParty } from '../stats';
import { createCreaturePartner } from './defs';
import {
  BOND_PER_FUSION, FUSION_ENERGY_COST, FUSION_METER_PER_DAMAGE, FUSION_TOGETHER_RADIUS_M, createPartnerSystem,
  fusionDurationSec,
} from './index';
import { makeActor, makeRig } from './testRig';
import { partnerBodyVisible } from './view';

const hit = (src: string, tgt: string, amount: number): DamageEvent => ({
  tSec: 0, sourceId: src, targetId: tgt, amount, source: 'strike', element: null, outcome: 'hit', staminaDamage: 0,
  poiseDamage: 0, staggerSec: 0, launch: false, knockback: null,
});

function setup(bond: number) {
  const rig = makeRig();
  const p = rig.add(makeActor('p1', 'player', 0));
  const q = rig.add(makeActor('q1', 'partner', 0, { x: 2 }));
  rig.add(makeActor('m1', 'monster', -1, { z: 4 }, 1e6));
  const def: PartnerDef = { ...createCreaturePartner({ id: 'q1', speciesId: 'cinderpup' })!, bond };
  const save = emptyAdventureSave(0);
  save.partner = def;
  const stats = createStatsSystem({ actors: statsSetupForParty({ save, playerId: 'p1', partnerId: 'q1' }) });
  const partner = createPartnerSystem({ playerId: 'p1', partnerId: 'q1', def, stats });
  rig.inputs.set('q1', partner.input);
  const systems = [partner, stats];
  rig.step(systems);
  const press = () => { rig.inputs.get('p1')!.fuse = true; rig.step(systems); return rig.inputs.get('p1')!.fuse; };
  const fill = () => { for (let i = 0; i < 30; i++) rig.bus.emit('damage', hit('p1', 'm1', 10)); };
  return { rig, p, q, def, stats, partner, systems, press, fill };
}

describe('fusion', () => {
  it('needs the bond tier: at bond < 10 a full meter still refuses, and the press is left for A1 (mount)', () => {
    const f = setup(0);
    f.fill();
    expect(f.p.fusion.meter).toBeCloseTo(1, 9);
    expect(f.press()).toBe(true);   // not consumed
    expect(f.partner.lastFuseRefusal()).toBe('tier');
    expect(f.p.fusion.active).toBe(false);
  });

  it('the meter fills only from damage the party lands together, and only while unfused', () => {
    const f = setup(10);
    f.rig.bus.emit('damage', hit('q1', 'm1', 30));
    expect(f.p.fusion.meter).toBeCloseTo(30 * FUSION_METER_PER_DAMAGE);
    f.rig.bus.emit('damage', hit('m1', 'p1', 30));    // taken, not landed
    f.rig.bus.emit('damage', { ...hit('p1', 'm1', 30), outcome: 'blocked' });
    expect(f.p.fusion.meter).toBeCloseTo(30 * FUSION_METER_PER_DAMAGE);
    f.q.pos.x = FUSION_TOGETHER_RADIUS_M + 5;           // apart: no fill
    f.rig.bus.emit('damage', hit('p1', 'm1', 30));
    expect(f.p.fusion.meter).toBeCloseTo(30 * FUSION_METER_PER_DAMAGE);
    expect(f.press()).toBe(true);
    expect(f.partner.lastFuseRefusal()).toBe('meter');
  });

  it('needs the energy, and never half-spends it', () => {
    const f = setup(10);
    f.fill();
    f.p.stats.energy.cur = FUSION_ENERGY_COST - 1;
    expect(f.press()).toBe(true);
    expect(f.partner.lastFuseRefusal()).toBe('energy');
    expect(f.p.stats.energy.cur).toBeCloseTo(FUSION_ENERGY_COST - 1, 1);
  });

  it('fuses: spends the energy and the meter, grants flight, merges stats, hides the partner, grows the bond', () => {
    const f = setup(40);
    const hpSolo = f.p.stats.hp.max, enSolo = f.p.stats.energy.max;
    f.fill();
    const energy = f.p.stats.energy.cur;
    expect(f.press()).toBe(false);   // consumed: A1 must not also mount
    expect(f.partner.lastFuseRefusal()).toBeNull();
    expect(f.p.fusion).toMatchObject({ active: true, tier: 2, meter: 0, partnerId: 'q1', element: 'fire', grantsFlight: true });
    expect(f.q.fusion).toMatchObject({ active: true, tier: 2, partnerId: 'p1' });
    expect(f.p.stats.energy.cur).toBeCloseTo(energy - FUSION_ENERGY_COST, 0);
    expect(flightSourceOf(f.p, false)).toBe('fusion');
    expect(f.def.bond).toBe(40 + BOND_PER_FUSION);
    expect(f.rig.events.some((e) => e.name === 'fusion' && (e.payload as { active: boolean }).active)).toBe(true);
    f.rig.step(f.systems);
    expect(f.p.stats.hp.max).toBeGreaterThan(hpSolo);
    expect(f.p.stats.energy.max).toBe(enSolo + 20);
    expect(partnerBodyVisible(f.q)).toBe(false);
    // the hidden partner travels inside the player
    f.p.pos.x = 30; f.p.pos.y = 12;
    f.rig.step(f.systems);
    expect(f.q.pos).toMatchObject({ x: 30, y: 12 });
  });

  it('times out at 30 s + 10 s per tier, costs its energy, and unfusing restores both', () => {
    const f = setup(40);
    const hpSolo = f.p.stats.hp.max, stSolo = f.p.stats.stamina.max;
    f.fill();
    f.press();
    const sec = fusionDurationSec(2);
    expect(sec).toBe(50);
    f.rig.run(f.systems, sec - 0.5);
    expect(f.p.fusion.active).toBe(true);
    expect(f.p.fusion.remainingSec).toBeGreaterThan(0);
    f.rig.run(f.systems, 1);
    expect(f.p.fusion).toMatchObject({ active: false, grantsFlight: false, remainingSec: 0 });
    expect(f.q.fusion.active).toBe(false);
    expect(flightSourceOf(f.p, false)).toBeNull();
    expect(partnerBodyVisible(f.q)).toBe(true);
    expect(f.p.stats.hp.max).toBe(hpSolo);
    expect(f.p.stats.stamina.max).toBe(stSolo);
    expect(Math.hypot(f.q.pos.x - f.p.pos.x, f.q.pos.z - f.p.pos.z)).toBeCloseTo(1.2, 5);   // reappears beside the player
    expect(f.rig.events.filter((e) => e.name === 'fusion').map((e) => (e.payload as { active: boolean }).active)).toEqual([true, false]);
  });

  it('the fuse button unfuses; a KO unfuses; riding refuses (the press goes to A1 for the dismount)', () => {
    const f = setup(80);
    f.fill();
    f.press();
    expect(f.p.fusion.tier).toBe(3);
    expect(f.press()).toBe(false);
    expect(f.p.fusion.active).toBe(false);
    f.fill();
    f.press();
    expect(f.p.fusion.active).toBe(true);
    f.p.stats.hp.cur = 0;
    f.rig.step(f.systems);
    expect(f.p.fusion.active).toBe(false);
    f.p.stats.hp.cur = 50;
    f.fill();
    f.p.ridingId = 'q1';
    expect(f.press()).toBe(true);
    expect(f.partner.lastFuseRefusal()).toBe('riding');
  });
});
