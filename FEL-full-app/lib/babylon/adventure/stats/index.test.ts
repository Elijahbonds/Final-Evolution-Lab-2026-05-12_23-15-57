// A3 stats system (docs/ADVENTURE-PLAN.md A3): spawn fill, energy regen and its pause, the special from play alone,
// the Mirror (faster, capped, needs the setting), XP → level → re-derived maxes, a partner's level following its
// player's, and fusion's merged maxes coming off cleanly.
import { describe, expect, it } from 'vitest';
import { emptyAdventureSave, spendPool, type DamageEvent } from '../contracts';
import { makeActor, makeRig } from '../partner/testRig';
import {
  ENERGY_REGEN_DELAY_SEC, MIRROR_SPECIAL_BURST, MIRROR_XP_SESSION_CAP, SPECIAL_PLAY_REF_PER_SEC, XP_MONSTER_KO, createStatsSystem,
  deriveActorStats, statsSetupForParty,
} from './index';

const hitEv = (src: string, tgt: string, amount: number, t = 0): DamageEvent => ({
  tSec: t, sourceId: src, targetId: tgt, amount, source: 'strike', element: null, outcome: 'hit',
  staminaDamage: 0, poiseDamage: 0, staggerSec: 0, launch: false, knockback: null,
});

function party(o: { mirror?: boolean } = {}) {
  const rig = makeRig();
  const p = rig.add(makeActor('p1', 'player', 0));
  const q = rig.add(makeActor('q1', 'partner', 0, { x: 1 }));
  const m = rig.add(makeActor('m1', 'monster', -1, { z: 3 }, 1e6));
  const save = emptyAdventureSave(0);
  save.partner = { id: 'q1', kind: 'creature', name: 'PUP', element: 'fire', attrs: { strength: 40, speed: 55, endurance: 35, agility: 30, power: 30, flexibility: 30, recovery: 30, mental: 30 }, bond: 0, moves: [], creature: { speciesId: 'cinderpup', stage: 0, rideableAtStage: 1, flyableAtStage: 2 } };
  const stats = createStatsSystem({ actors: statsSetupForParty({ save, playerId: 'p1', partnerId: 'q1', band: 'PRIMED' }), mirror: o.mirror });
  return { rig, p, q, m, stats, save };
}

describe('stats system', () => {
  it('fills every pool to its derived max on spawn, and sets the player element to the partner\'s', () => {
    const { rig, p, q, stats } = party();
    rig.step([stats]);
    const d = deriveActorStats({ level: 1, band: 'PRIMED', school: emptyAdventureSave(0).player.school, element: 'fire' });
    expect(p.stats.hp).toEqual({ cur: d.hpMax, max: d.hpMax });
    expect(p.stats.energy.max).toBe(100);
    expect(p.stats.element).toBe('fire');
    expect(q.stats.level).toBe(1);
    expect(q.stats.stamina.max).toBe(107);   // 100 + endurance 35 / 5
  });

  it('regenerates energy after the spend pause, and never while flying or knocked out', () => {
    const { rig, p, stats } = party();
    rig.step([stats]);
    expect(spendPool(p.stats.energy, 60)).toBe(true);
    rig.run([stats], ENERGY_REGEN_DELAY_SEC - 0.1);
    expect(p.stats.energy.cur).toBeCloseTo(40, 6);
    rig.run([stats], 1.1);
    const rate = stats.derived('p1')!.energyRegenPerSec;
    expect(p.stats.energy.cur).toBeGreaterThan(40 + rate * 0.5);
    p.state = 'flight';
    const before = p.stats.energy.cur;
    rig.run([stats], 2);
    expect(p.stats.energy.cur).toBe(before);
    p.state = 'ground';
    rig.run([stats], 60);
    expect(p.stats.energy.cur).toBe(p.stats.energy.max);
  });

  it('the special fills from play alone to full (no camera) at about the reference rate, and never past 1', () => {
    const { rig, p, stats } = party();
    let full = -1;
    rig.run([stats], 120, (t) => {
      if (Math.round(t * 60) % 60 === 0) rig.bus.emit('damage', hitEv('p1', 'm1', 13, t));   // 13 damage a second
      if (full < 0 && p.stats.special >= 1) full = t;
    });
    expect(full).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(0.6 / SPECIAL_PLAY_REF_PER_SEC);
    expect(full).toBeLessThan(1.6 / SPECIAL_PLAY_REF_PER_SEC);
    expect(p.stats.special).toBe(1);
  });

  it('the Mirror fills it faster, at most about twice as fast, and only with the setting on', () => {
    const timeToFull = (mirrorOn: boolean, moves: boolean) => {
      const { rig, p, stats } = party({ mirror: mirrorOn });
      let full = -1;
      rig.run([stats], 120, (t) => {
        const f = Math.round(t * 60);
        if (f % 60 === 0) rig.bus.emit('damage', hitEv('p1', 'm1', 13, t));
        if (moves && f % 30 === 0) rig.bus.emit('mirror:move', { actorId: 'p1', kind: 'punch', quality01: 1 });
        if (full < 0 && p.stats.special >= 1) full = t;
      });
      return { full, stats };
    };
    const play = timeToFull(false, false).full;
    const off = timeToFull(false, true);
    const on = timeToFull(true, true);
    expect(off.full).toBe(play);                       // camera moves with the setting off: no effect
    expect(off.stats.progress('p1')!.xp).toBe(0);
    expect(on.full).toBeLessThan(play * 0.8);           // faster
    // but the Mirror's share is bounded by the play reference rate (plus the one opening burst): about twice as fast
    expect(on.stats.mirrorSession('p1')!.special).toBeLessThanOrEqual(MIRROR_SPECIAL_BURST + SPECIAL_PLAY_REF_PER_SEC * 120 + 1e-9);   // over the 120 s run
    expect(on.full).toBeGreaterThan(play / 2.5);
    expect(on.stats.mirrorSession('p1')!.xp).toBeGreaterThan(0);
  });

  it('Mirror training XP goes to the level and the move\'s attributes, capped per session', () => {
    const { rig, stats } = party({ mirror: true });
    rig.step([stats]);
    rig.run([stats], 600, (t) => {
      if (Math.round(t * 60) % 15 === 0) rig.bus.emit('mirror:move', { actorId: 'p1', kind: 'squat', quality01: 1 });
    });
    const prog = stats.progress('p1')!;
    expect(prog.xp).toBe(MIRROR_XP_SESSION_CAP);
    expect(prog.training.strength).toBeCloseTo(MIRROR_XP_SESSION_CAP / 2);
    expect(prog.training.endurance).toBeCloseTo(MIRROR_XP_SESSION_CAP / 2);
    expect(prog.training.power).toBeUndefined();
    expect(rig.events.filter((e) => e.name === 'xp').every((e) => (e.payload as { source: string }).source === 'mirror')).toBe(true);
  });

  it('a KO pays XP; a level-up emits `level` and re-derives the maxes; the partner follows the player\'s level', () => {
    const { rig, p, q, m, stats } = party();
    rig.step([stats]);
    const hp1 = p.stats.hp.max, qhp1 = q.stats.hp.max;
    p.stats.hp.cur = 50;
    // the partner fells monsters: the XP is the player's
    for (let i = 0; i < Math.ceil(100 / XP_MONSTER_KO); i++) rig.bus.emit('ko', { actorId: m.id, byId: 'q1' });
    rig.step([stats]);
    expect(stats.progress('p1')!.level).toBe(2);
    expect(rig.events.some((e) => e.name === 'level' && (e.payload as { level: number }).level === 2)).toBe(true);
    expect(p.stats.hp.max).toBeGreaterThan(hp1);
    expect(p.stats.hp.cur).toBe(50);   // a level-up does not heal (hp cur is A2's)
    expect(q.stats.level).toBe(2);
    expect(q.stats.hp.max).toBeGreaterThan(qhp1);
    expect(stats.progress('q1')).toBeNull();
    // a KO of a non-monster pays nothing
    rig.bus.emit('ko', { actorId: 'q1', byId: 'm1' });
    expect(stats.progress('p1')!.xp).toBe(Math.ceil(100 / XP_MONSTER_KO) * XP_MONSTER_KO);
  });

  it('fusion merges the maxes while active and they come off when it ends', () => {
    const { rig, p, stats } = party();
    rig.step([stats]);
    const base = { hp: p.stats.hp.max, st: p.stats.stamina.max, en: p.stats.energy.max };
    Object.assign(p.fusion, { active: true, tier: 2, partnerId: 'q1', element: 'fire', grantsFlight: true, remainingSec: 30 });
    rig.step([stats]);
    expect(p.stats.hp.max).toBeGreaterThan(base.hp);
    expect(p.stats.energy.max).toBe(base.en + 20);
    p.stats.hp.cur = p.stats.hp.max;
    Object.assign(p.fusion, { active: false, grantsFlight: false, remainingSec: 0 });
    rig.step([stats]);
    expect(p.stats.hp.max).toBe(base.hp);
    expect(p.stats.stamina.max).toBe(base.st);
    expect(p.stats.hp.cur).toBe(base.hp);   // lowered with its max
  });

  it('a special from damage taken and from defence done right', () => {
    const { rig, p, stats } = party();
    rig.step([stats]);
    rig.bus.emit('damage', { ...hitEv('m1', 'p1', 40), outcome: 'hit' });
    const afterHit = p.stats.special;
    expect(afterHit).toBeGreaterThan(0);
    rig.bus.emit('damage', { ...hitEv('m1', 'p1', 0), outcome: 'parried' });
    expect(p.stats.special).toBeGreaterThan(afterHit);
  });
});
