// A3's half of the plan's field-ownership rule (contracts.ts AdventureActor, "WHO WRITES WHAT"): stepping the partner
// and stats systems through a busy scene changes only A3's fields. The two declared exceptions are pinned here so they
// cannot grow quietly: the SPAWN fill (the first step after an actor is registered, every pool starts full; A4 can make
// it a no-op by building the actor with stats/derive actorStatsFrom), a `cur` LOWERED to a max A3 just lowered (the pool
// invariant), and a fused partner's pos / vel (a contract request for A4: the hidden body travels inside the player and
// reappears beside it).
import { describe, expect, it } from 'vitest';
import { emptyAdventureSave, type AdventureActor } from '../contracts';
import { createStatsSystem, statsSetupForParty } from '../stats';
import { createCreaturePartner } from './defs';
import { createPartnerSystem } from './index';
import { makeActor, makeRig } from './testRig';

/** Every leaf of an actor, as path → value. */
function leaves(a: AdventureActor): Map<string, unknown> {
  const out = new Map<string, unknown>();
  const walk = (v: unknown, path: string) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
    else out.set(path, Array.isArray(v) ? JSON.stringify(v) : v);
  };
  walk(a, '');
  return out;
}

const A3_FIELDS = [
  /^stats\.(hp|stamina|energy|poise)\.max$/, /^stats\.energy\.cur$/, /^stats\.special$/, /^stats\.level$/,
  /^stats\.prqBand$/, /^stats\.school\./, /^stats\.element$/, /^stats\.attrs\./, /^fusion\./, /^partnerId$/,
];

describe('A3 writes only its own fields', () => {
  it('through spawn, a fight\'s events, a level-up, a fusion, its timeout and a revive request', () => {
    const rig = makeRig();
    const p = rig.add(makeActor('p1', 'player', 0));
    const q = rig.add(makeActor('q1', 'partner', 0, { x: 3 }));
    rig.add(makeActor('m1', 'monster', -1, { z: 2 }));
    const def = { ...createCreaturePartner({ id: 'q1', speciesId: 'cinderpup' })!, bond: 30 };
    const save = emptyAdventureSave(0);
    save.partner = def;
    const stats = createStatsSystem({ actors: statsSetupForParty({ save, playerId: 'p1', partnerId: 'q1' }), mirror: true });
    const partner = createPartnerSystem({ playerId: 'p1', partnerId: 'q1', def, stats });
    rig.inputs.set('q1', partner.input);
    const systems = [partner, stats];
    const violations = new Set<string>();
    const exceptions = new Set<string>();
    rig.run(systems, 0);
    for (let i = 0; i < 60 * 80; i++) {
      const t = i / 60;
      // the scene (what A1 / A2 / the host would do between steps)
      if (i % 20 === 0) rig.bus.emit('damage', { tSec: t, sourceId: i % 40 ? 'p1' : 'q1', targetId: 'm1', amount: 12, source: 'strike', element: null, outcome: 'hit', staminaDamage: 0, poiseDamage: 0, staggerSec: 0, launch: false, knockback: null });
      if (i % 90 === 0) rig.bus.emit('ko', { actorId: 'm1', byId: 'p1' });
      if (i % 30 === 0) rig.bus.emit('mirror:move', { actorId: 'p1', kind: 'punch', quality01: 0.8 });
      if (i === 600) rig.inputs.get('p1')!.fuse = true;
      if (i === 601) rig.inputs.get('p1')!.fuse = false;
      if (i === 2000) p.stats.hp.cur = 0;
      if (i === 2400) p.stats.hp.cur = 80;
      p.pos.z = Math.sin(t) * 2;   // A1 moving the player about (inside the together radius)
      const before = [leaves(p), leaves(q)];
      rig.step(systems);
      const after = [leaves(p), leaves(q)];
      [p, q].forEach((a, n) => {
        for (const [path, v] of after[n]) {
          const was = before[n].get(path);
          if (Object.is(was, v) || A3_FIELDS.some((r) => r.test(path))) continue;
          // exception 0: the spawn fill, on the first step only
          if (i === 0 && /^stats\.(hp|stamina|poise)\.cur$/.test(path) && v === after[n].get(path.replace('.cur', '.max'))) { exceptions.add('spawn'); continue; }
          // exception 1: a cur lowered to its (lowered) max
          const pool = /^stats\.(hp|stamina|poise)\.cur$/.exec(path);
          if (pool && typeof v === 'number' && typeof was === 'number' && v < was && v === after[n].get(`stats.${pool[1]}.max`)) { exceptions.add(path); continue; }
          // exception 2: the partner's body while fused / at the unfuse
          if (a.kind === 'partner' && /^(pos|vel)\./.test(path)) { exceptions.add(`${a.kind}.${path}`); continue; }
          violations.add(`${a.id}.${path}: ${String(was)} → ${String(v)}`);
        }
      });
    }
    expect(p.fusion.tier).toBeGreaterThan(0);
    expect(rig.events.filter((e) => e.name === 'fusion')).toHaveLength(2);   // it did fuse, and time out
    expect([...violations]).toEqual([]);
    expect([...exceptions].every((e) => /^(spawn|stats\.(hp|stamina|poise)\.cur|partner\.(pos|vel)\.[xyz])$/.test(e))).toBe(true);
    expect(exceptions.has('partner.pos.x')).toBe(true);   // the fused partner did travel with the player
  });
});
