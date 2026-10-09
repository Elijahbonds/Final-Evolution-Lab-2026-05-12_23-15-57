// A3 scripted headless simulations (docs/ADVENTURE-PLAN.md A3, "prove it"): the party stepped at 60 Hz in the plan's
// order (partner brain → movement → combat → stats) for tens of seconds, with fakes standing in for A1 and A2
// (testRig.ts). Each script reads like a play session: run with a partner at heel; fight a pack with the partner
// assisting the lock; go down and get revived; fill the meter, fuse, fly, time out, unfuse; train a creature from
// hatchling to flyer and save it.
import { describe, expect, it } from 'vitest';
import { emptyAdventureSave, flightSourceOf, partnerCanCarry, type AdventureActor, type AdventureSystem, type PartnerDef } from '../contracts';
import { readAdventureSave, withProgress } from '../save/save';
import { createStatsSystem, statsSetupForParty } from '../stats';
import { createCharacterPartner, createCreaturePartner } from './defs';
import { createPartnerSystem, type ReviveRequest } from './index';
import { fakeCombat, fakeMovement, makeActor, makeRig } from './testRig';

function party(def: PartnerDef, o: { monsterHit?: number; monsterTargets?: string[] } = {}) {
  const rig = makeRig();
  const p = rig.add(makeActor('p1', 'player', 0));
  const q = rig.add(makeActor('q1', 'partner', 0, { x: -8, z: -8 }));
  const save = emptyAdventureSave(0);
  save.partner = def;
  const stats = createStatsSystem({ actors: statsSetupForParty({ save, playerId: 'p1', partnerId: 'q1', band: 'READY' }) });
  const revives: ReviveRequest[] = [];
  const partner = createPartnerSystem({
    playerId: 'p1', partnerId: 'q1', def, stats, seed: 11,
    // A2's stand-in for the revive: hp back to the ratio (the HP is A2's field)
    onRevive: (r) => { revives.push(r); const a = rig.world.actors.get(r.actorId)!; a.stats.hp.cur = Math.round(a.stats.hp.max * r.hpRatio); },
  });
  rig.inputs.set('q1', partner.input);
  const systems: AdventureSystem[] = [partner, fakeMovement(), fakeCombat({ monsterHit: o.monsterHit, monsterTargets: o.monsterTargets }), stats];
  const finite = (a: AdventureActor) => [a.pos.x, a.pos.y, a.pos.z, a.vel.x, a.vel.z, a.stats.hp.cur, a.stats.energy.cur, a.stats.special, a.fusion.meter].every(Number.isFinite);
  return { rig, p, q, save, stats, partner, systems, revives, finite, input: rig.inputs.get('p1')! };
}

const dist = (a: AdventureActor, b: AdventureActor) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);

describe('scripted party simulations', () => {
  it('runs 10 s with the partner at heel: it catches up, keeps its slot, never NaN', () => {
    const s = party(createCreaturePartner({ id: 'q1', speciesId: 'cinderpup' })!);
    let worst = 0;
    s.rig.run(s.systems, 10, (t) => {
      // run forward 6 s, then turn right and run 2 s, then stand
      s.input.move.x = t < 6 ? 0 : t < 8 ? 1 : 0;
      s.input.move.y = t < 6 ? 1 : 0;
      expect(s.finite(s.p) && s.finite(s.q)).toBe(true);
      if (t > 4) worst = Math.max(worst, dist(s.p, s.q));
    });
    expect(s.p.pos.z).toBeGreaterThan(30);
    expect(worst).toBeLessThan(8);                    // a sprinting partner keeps up with a jogging player
    expect(dist(s.p, s.q)).toBeLessThan(3.2);         // and settles in its slot when they stop
    expect(s.partner.brainMode()).toBe('follow');
  });

  it('fights a pack: the partner assists the lock with light / heavy presses, KOs land, the meter and the bond grow', () => {
    const s = party(createCreaturePartner({ id: 'q1', speciesId: 'cinderpup' })!);
    const pack = [0, 1, 2].map((i) => s.rig.add(makeActor(`m${i}`, 'monster', -1, { x: -2 + 2 * i, z: 6 }, 60)));
    const presses = { light: 0, heavy: 0 };
    s.rig.run(s.systems, 30, (t) => {
      // the player locks the first standing monster, walks up and jabs every 0.8 s
      const target = pack.find((m) => m.stats.hp.cur > 0);
      s.p.lock = target ? { actorId: target.id, sinceSec: t, hard: true } : null;
      const d = target ? { x: target.pos.x - s.p.pos.x, z: target.pos.z - s.p.pos.z } : { x: 0, z: 0 };
      const len = Math.hypot(d.x, d.z);
      s.input.move.x = len > 1.5 ? d.x / len : 0;
      s.input.move.y = len > 1.5 ? d.z / len : 0;
      s.input.attackLight = len <= 2 && Math.round(t * 60) % 48 === 0;
      if (s.partner.input.attackLight) presses.light++;
      if (s.partner.input.attackHeavy) presses.heavy++;
      expect(s.finite(s.p) && s.finite(s.q)).toBe(true);
    });
    expect(pack.every((m) => m.stats.hp.cur <= 0)).toBe(true);
    const partnerHits = s.rig.events.filter((e) => e.name === 'damage' && (e.payload as { sourceId: string }).sourceId === 'q1');
    expect(partnerHits.length).toBeGreaterThan(3);
    expect(presses.light).toBeGreaterThan(presses.heavy);
    expect(presses.heavy).toBeGreaterThan(0);
    expect(s.p.fusion.meter).toBeGreaterThan(0.5);   // 180 HP of monsters landed together
    expect(s.partner.def().bond).toBe(3);             // three shared KOs
    expect(s.stats.progress('p1')!.xp).toBeGreaterThanOrEqual(36);
    expect(s.p.stats.special).toBeGreaterThan(0);
  });

  it('goes down to a brute and is revived by the partner within the revive channel', () => {
    const s = party(createCharacterPartner({ id: 'q1', creatorSlotId: 's2', element: 'light' }), { monsterHit: 30, monsterTargets: ['p1'] });
    const brute = s.rig.add(makeActor('brute', 'monster', -1, { z: 1.5 }, 1e6));
    let downAt = -1, upAt = -1;
    s.rig.run(s.systems, 20, (t) => {
      if (downAt < 0 && s.p.stats.hp.cur <= 0) { downAt = t; brute.pos.z = 40; }   // the brute wanders off once you are down
      if (downAt >= 0 && upAt < 0 && s.p.stats.hp.cur > 0) upAt = t;
      expect(s.finite(s.p) && s.finite(s.q)).toBe(true);
    });
    expect(downAt).toBeGreaterThan(0);
    expect(upAt).toBeGreaterThan(downAt + 3);         // the channel is 3 s once the partner arrives
    expect(upAt).toBeLessThan(downAt + 8);
    expect(s.revives).toEqual([{ actorId: 'p1', byId: 'q1', hpRatio: 0.4 }]);
    expect(s.p.state).toBe('ground');
    expect(s.p.stats.hp.cur).toBe(Math.round(s.p.stats.hp.max * 0.4));
  });

  it('a partner out of range does not revive: the channel runs only while it stands beside the downed player', () => {
    const s = party(createCreaturePartner({ id: 'q1', speciesId: 'gardenite' })!);
    s.rig.step(s.systems);
    s.q.pos.x = 25; s.q.pos.z = 0;
    s.q.stunSec = 1e9;                  // held in place (a stunned partner's brain is neutral)
    s.p.stats.hp.cur = 0;
    s.rig.run(s.systems, 10);
    expect(s.revives).toEqual([]);
    expect(s.partner.revive()).toMatchObject({ playerDowned: true, channel01: 0 });
    s.q.stunSec = 0;                     // free: it runs 25 m (about 3 s sprinting) and channels 3 s
    let upAt = -1;
    s.rig.run(s.systems, 12, (t) => { if (upAt < 0 && s.p.stats.hp.cur > 0) upAt = t; });
    expect(upAt - 10).toBeGreaterThan(5);
    expect(upAt - 10).toBeLessThan(8);
    expect(s.revives).toHaveLength(1);
  });

  it('fills the meter fighting together, fuses, may fly, times out, and unfuses back to both bodies', () => {
    const def = { ...createCharacterPartner({ id: 'q1', creatorSlotId: 's2', element: 'lightning' }), bond: 12 };
    const s = party(def);
    s.rig.run(s.systems, 1);
    const solo = { hp: s.p.stats.hp.max, energy: s.p.stats.energy.max };
    const dummies = [0, 1, 2, 3, 4].map((i) => s.rig.add(makeActor(`d${i}`, 'monster', -1, { x: i * 0.5, z: 1.6 }, 80)));
    // fight until the meter is full
    s.rig.run(s.systems, 40, (t) => {
      const target = dummies.find((m) => m.stats.hp.cur > 0);
      s.p.lock = target ? { actorId: target.id, sinceSec: t, hard: true } : null;
      s.input.attackLight = Math.round(t * 60) % 30 === 0;
    });
    s.input.attackLight = false;
    expect(s.p.fusion.meter).toBeCloseTo(1, 6);
    s.input.fuse = true;
    s.rig.step(s.systems);
    s.input.fuse = false;
    expect(s.p.fusion).toMatchObject({ active: true, tier: 1, grantsFlight: true, element: 'lightning' });
    expect(flightSourceOf(s.p, false)).toBe('fusion');
    s.rig.step(s.systems);
    expect(s.p.stats.hp.max).toBeGreaterThan(solo.hp);
    expect(s.p.stats.energy.max).toBe(solo.energy + 10);
    // fly about (the movement stand-in only walks; the flag is what A1 reads)
    s.rig.run(s.systems, 39.5, (t) => { s.input.move.x = Math.sin(t); s.input.move.y = Math.cos(t); });
    expect(s.p.fusion.active).toBe(true);
    expect(dist(s.p, s.q)).toBeLessThan(0.2);          // the partner is inside the player (snapped each step, a step behind)
    s.rig.run(s.systems, 1);
    expect(s.p.fusion.active).toBe(false);
    expect(flightSourceOf(s.p, false)).toBeNull();
    expect(s.p.stats.hp.max).toBe(solo.hp);
    expect(s.p.stats.energy.max).toBe(solo.energy);
    expect(s.q.fusion.active).toBe(false);
    expect(s.partner.def().bond).toBeGreaterThanOrEqual(12 + 3 + 5);   // the fusion and five shared KOs
    s.rig.run(s.systems, 3);
    expect(s.partner.brainMode()).toBe('follow');      // back at heel
  });

  it('trains a hatchling into a mount and then a flyer over many fights, and the evolved partner saves', () => {
    const def = createCreaturePartner({ id: 'q1', speciesId: 'cinderpup' })!;
    const s = party(def);
    s.rig.run(s.systems, 1);
    const hpStage0 = s.q.stats.hp.max;
    const carry: string[] = [JSON.stringify(partnerCanCarry(def))];
    let wave = 0;
    while (def.creature!.stage < 2 && wave < 60) {
      const pack = [0, 1, 2].map((i) => s.rig.add(makeActor(`w${wave}m${i}`, 'monster', -1, { x: s.q.pos.x - 1 + i, z: s.q.pos.z + 1.6 }, 120)));
      s.rig.run(s.systems, 20, (t) => {
        const target = pack.find((m) => m.stats.hp.cur > 0);
        s.p.lock = target ? { actorId: target.id, sinceSec: t, hard: true } : null;
      });
      for (const m of pack) s.rig.world.actors.delete(m.id);
      const k = JSON.stringify(partnerCanCarry(def));
      if (k !== carry.at(-1)) carry.push(k);
      wave++;
    }
    expect(carry).toEqual(['{"ride":false,"fly":false}', '{"ride":true,"fly":false}', '{"ride":true,"fly":true}']);
    expect(s.partner.mountCanFly('q1')).toBe(true);
    s.rig.step(s.systems);
    expect(s.q.stats.hp.max).toBeGreaterThan(hpStage0);   // its stage shows in its maxes
    expect(s.rig.world.actors.size).toBe(2);
    // save it: the evolved creature and the player's progress round-trip
    const saved = withProgress(s.save, { player: s.stats.progress('p1'), partner: s.partner.def() });
    const back = readAdventureSave(JSON.stringify(saved), 0);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.save.partner?.creature?.stage).toBe(2);
    expect(back.save.partner?.attrs).toEqual(def.attrs);
    expect(partnerCanCarry(back.save.partner!)).toEqual({ ride: true, fly: true });
    expect(back.save.player.xp).toBe(s.stats.progress('p1')!.xp);
  });
});
