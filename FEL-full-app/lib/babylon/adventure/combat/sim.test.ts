// A minute of everything at once, headless: a player and a partner (scripted from a seeded generator: strings,
// dodges, parries, locks, flicks, spells, slow-time) against all five archetypes and the boss. Nothing NaN, every pool
// inside its bounds, every damage number inside the caps, no handler throwing, and the same seed replays the same log.
import { describe, expect, it } from 'vitest';
import { createCombatSystem, seededRng } from './index';
import { createArena, makeActor } from './testArena';
import { hitCap } from './damage';
import { MONSTERS, createMonsterActor, type MonsterArchetype } from './monsters/defs';
import { PLACEHOLDER_BOSS } from './bosses/defs';
import { createMagicSystem } from '../magic/index';
import { STARTER_SPELLS } from '../magic/spells';

function minute(seed: number) {
  const ar = createArena();
  const combat = createCombatSystem({ seed });
  const known = STARTER_SPELLS.map((s) => s.id);
  const magic = createMagicSystem({
    loadoutOf: (a) => (a.team === 0 ? { known, equipped: ['bolt.fire', 'mind.telekinesis', 'partner.surge', 'mind.barrier'] } : null),
  });
  const me = ar.add(makeActor('me', { x: 0, z: 0 }, { hp: 3000, level: 12 }));
  const pal = ar.add(makeActor('pal', { x: -2, z: -1 }, { kind: 'partner', hp: 3000, element: 'lightning', level: 12 }));
  me.partnerId = pal.id; pal.partnerId = me.id;
  me.fusion = { active: false, tier: 2, meter: 0.4, remainingSec: 0, partnerId: 'pal', element: 'lightning', grantsFlight: false };
  me.stats.element = 'lightning';
  const kinds: MonsterArchetype[] = ['brute', 'skitter', 'caster', 'flyer', 'swarm', 'swarm'];
  kinds.forEach((k, n) => {
    const a = (n / kinds.length) * Math.PI * 2;
    const m = ar.add(createMonsterActor(MONSTERS[k], `${k}${n}`, { x: Math.sin(a) * 9, y: 0, z: Math.cos(a) * 9 }));
    combat.registerMonster(m, MONSTERS[k]);
  });
  const boss = ar.add(createMonsterActor(PLACEHOLDER_BOSS, 'boss', { x: 0, y: 0, z: 22 }, { kind: 'boss' }));
  combat.registerBoss(boss, PLACEHOLDER_BOSS);

  const rng = seededRng(seed * 7 + 1);
  const o = { aiInputs: [combat.aiInputs], moveLockOf: combat.moveLockOf, takeWarp: combat.takeWarp };
  const bad: string[] = [];
  for (let k = 0; k < 60 * 60; k++) {
    for (const id of ['me', 'pal']) {
      const i = ar.input(id);
      const r = rng();
      i.move.x = Math.sin(k * 0.013 + r) * (rng() < 0.6 ? 1 : 0); i.move.y = Math.cos(k * 0.011) * (rng() < 0.6 ? 1 : 0);
      i.attackLight = r < 0.05; i.attackHeavy = r > 0.05 && r < 0.07;
      i.dash = r > 0.07 && r < 0.085; i.dashHeld = rng() < 0.05;
      i.guardHeld = rng() < 0.2; i.lock = r > 0.085 && r < 0.09; i.look.x = rng() < 0.02 ? 0.9 : 0;
      i.magic = r > 0.09 && r < 0.1; i.magicSlot = rng() < 0.02 ? Math.floor(rng() * 4) : null; i.magicHeld = rng() < 0.5;
      i.focusHeld = id === 'me' && (k % 900) < 90;
    }
    // A3's energy regen, stood in for, so magic keeps happening.
    for (const a of [me, pal]) a.stats.energy.cur = Math.min(a.stats.energy.max, a.stats.energy.cur + 6 / 60);
    ar.step([combat, magic], 1, o);
    if (k % 30 === 0) {
      for (const a of ar.actors.values()) {
        const st = a.stats;
        for (const v of [a.pos.x, a.pos.y, a.pos.z, a.vel.x, a.vel.y, a.vel.z, a.stunSec, a.iframeSec]) if (!Number.isFinite(v)) bad.push(`${a.id} non-finite`);
        for (const [n, p] of Object.entries({ hp: st.hp, stamina: st.stamina, energy: st.energy, poise: st.poise })) {
          if (!(p.cur >= 0 && p.cur <= p.max + 1e-6)) bad.push(`${a.id}.${n} = ${p.cur} / ${p.max}`);
        }
      }
    }
  }
  for (const e of ar.log.damage) {
    const t = ar.actors.get(e.targetId)!;
    if (!(Number.isInteger(e.amount) && e.amount >= 0 && e.amount <= hitCap(t) + 0.5)) bad.push(`damage ${e.via} ${e.amount}`);
  }
  return { ar, bad, log: ar.log.damage.map((e) => `${e.tSec.toFixed(3)}|${e.sourceId}>${e.targetId}|${e.via}|${e.outcome}|${e.amount}`).join('\n') };
}

describe('adventure A2: a minute of everything', () => {
  it('stays finite and bounded, and replays from its seed', () => {
    const a = minute(9);
    expect(a.bad).toEqual([]);
    const outcomes = new Set(a.ar.log.damage.map((e) => e.outcome));
    expect(outcomes.has('hit')).toBe(true);
    // The defence verbs happen in random play too (which ones depends on the seed's timing).
    expect(['blocked', 'parried', 'dodged', 'guardBreak'].filter((o) => outcomes.has(o as never)).length, [...outcomes].join()).toBeGreaterThanOrEqual(2);
    expect(a.ar.log['spell:cast'].length).toBeGreaterThan(5);
    expect(a.ar.log.damage.length).toBeGreaterThan(50);
    expect(a.ar.log.ko.length).toBeGreaterThan(0);   // the party cleared some of the field: the fight moved
    const b = minute(9);
    expect(b.log).toBe(a.log);
  });
});
