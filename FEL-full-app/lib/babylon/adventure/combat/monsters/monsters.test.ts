// The monster archetypes in a headless arena: each def passes its lint, each tell is readable IN THE SIM (the swing
// lands no sooner than its wind-up after the telegraph appears), speeds come from MobSteering's presets, the caster's
// bolt can be sidestepped, the swarm respects attack tokens, the flyer hovers and dives, and a seed replays exactly.
import { describe, expect, it } from 'vitest';
import { STEERING_PRESETS } from '@/lib/babylon/core/MobSteering';
import { createCombatSystem, type CombatSystem } from '../index';
import { createArena, makeActor, type Arena } from '../testArena';
import { ATTACK_TOKENS } from './brain';
import { MIN_TELL_SEC, MONSTERS, createMonsterActor, stickFor, validateMonsterDef, type MonsterArchetype } from './defs';

const run = (c: CombatSystem) => ({ aiInputs: [c.aiInputs], moveLockOf: c.moveLockOf, takeWarp: c.takeWarp });

function oneOnOne(kind: MonsterArchetype, z: number, seed = 3) {
  const ar = createArena();
  const c = createCombatSystem({ seed });
  const me = ar.add(makeActor('me', { x: 0, z: 0 }, { hp: 5000 }));
  const m = ar.add(createMonsterActor(MONSTERS[kind], kind, { x: 0, y: 0, z }));
  c.registerMonster(m, MONSTERS[kind]);
  return { ar, c, me, m };
}

describe('adventure monsters: the defs', () => {
  it('five archetypes, every one valid, generic and [PLACEHOLDER]', () => {
    expect(Object.keys(MONSTERS).sort()).toEqual(['brute', 'caster', 'flyer', 'skitter', 'swarm']);
    for (const def of Object.values(MONSTERS)) {
      expect(validateMonsterDef(def)).toEqual([]);
      expect(def.steering in STEERING_PRESETS).toBe(true);
    }
  });

  it('the lint catches an unreadable tell and a name that lost its placeholder mark', () => {
    const bad = { ...MONSTERS.swarm, name: 'Swarmling', attacks: [{ ...MONSTERS.swarm.attacks[0], tellSec: 0.2 }] };
    const errs = validateMonsterDef(bad);
    expect(errs.some((e) => e.includes('unreadable'))).toBe(true);
    expect(errs.some((e) => e.includes('[PLACEHOLDER]'))).toBe(true);
  });

  it('speeds come from the MobSteering presets: the skitter outruns the brute', () => {
    expect(stickFor(MONSTERS.skitter)).toBeGreaterThan(stickFor(MONSTERS.brute));
    const s = oneOnOne('skitter', 14), b = oneOnOne('brute', 14);
    s.ar.step([s.c], 60, run(s.c)); b.ar.step([b.c], 60, run(b.c));
    const closedS = 14 - s.m.pos.z, closedB = 14 - b.m.pos.z;
    expect(closedS).toBeGreaterThan(closedB * 1.3);
    expect(closedB).toBeLessThan(STEERING_PRESETS.striker.maxSpeed * 1.01);
  });
});

describe('adventure monsters: every tell is readable in the sim', () => {
  for (const kind of Object.keys(MONSTERS) as MonsterArchetype[]) {
    it(`${kind}: the swing lands at least its tell (≥ ${MIN_TELL_SEC}s) after the telegraph shows`, () => {
      const start = kind === 'caster' ? 9 : 2;
      const { ar, c, m } = oneOnOne(kind, start);
      let tellAt = -1, tellSec = 0, landAt = -1;
      ar.runUntil([c], () => {
        const t = c.telegraphOf(m.id);
        if (t && t.phase === 'windup' && tellAt < 0) { tellAt = ar.tSec; tellSec = t.tellSec; }
        if (tellAt >= 0 && landAt < 0 && ar.log.damage.some((e) => e.sourceId === m.id)) landAt = ar.tSec;
        return landAt >= 0;
      }, 8, run(c));
      expect(tellAt).toBeGreaterThanOrEqual(0);
      expect(landAt).toBeGreaterThan(0);
      expect(tellSec).toBeGreaterThanOrEqual(MIN_TELL_SEC);
      expect(landAt - tellAt).toBeGreaterThanOrEqual(tellSec - 1e-6);
    });
  }
});

describe('adventure monsters: behaviour', () => {
  it('the caster backs off to its range before throwing, and its bolt flies: standing still it hits', () => {
    const still = oneOnOne('caster', 2);
    still.ar.runUntil([still.c], () => still.ar.log.damage.length > 0, 8, run(still.c));
    expect(still.ar.log.damage[0]).toMatchObject({ sourceId: 'caster', outcome: 'hit', element: 'lightning', via: 'caster.bolt' });
    // Too close to throw (inside 3 m), it backed off first.
    expect(Math.hypot(still.m.pos.x, still.m.pos.z)).toBeGreaterThan(3);
  });

  it('the caster\'s bolt is a projectile: a sidestep as it leaves the hand avoids it', () => {
    const side = oneOnOne('caster', 8);
    side.ar.runUntil([side.c], () => side.c.projectiles.activeCount > 0, 8, run(side.c));
    expect(side.c.projectiles.activeCount).toBe(1);
    side.ar.input('me').move.x = 1;   // run sideways as the bolt leaves
    side.ar.runUntil([side.c], () => side.c.projectiles.activeCount === 0, 3, run(side.c));
    expect(side.ar.log.damage.filter((e) => e.via === 'caster.bolt')).toHaveLength(0);
  });

  it('the swarm surrounds but never more than the attack tokens wind up on one target at once', () => {
    const ar = createArena();
    const c = createCombatSystem({ seed: 11 });
    ar.add(makeActor('me', { x: 0, z: 0 }, { hp: 50_000 }));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const m = ar.add(createMonsterActor(MONSTERS.swarm, `s${k}`, { x: Math.sin(a) * 1.6, y: 0, z: Math.cos(a) * 1.6 }));
      c.registerMonster(m, MONSTERS.swarm);
    }
    let maxAt = 0, total = 0;
    for (let k = 0; k < 600; k++) {
      ar.step([c], 1, run(c));
      let n = 0;
      for (let j = 0; j < 6; j++) if (c.telegraphOf(`s${j}`)) n++;
      maxAt = Math.max(maxAt, n);
      total += n;
    }
    expect(maxAt).toBeLessThanOrEqual(ATTACK_TOKENS);
    expect(maxAt).toBeGreaterThanOrEqual(2);
    expect(total).toBeGreaterThan(0);
    expect(ar.log.damage.filter((e) => e.targetId === 'me').length).toBeGreaterThan(5);
  });

  it('the flyer hovers above reach and dives to strike', () => {
    const { ar, c, m } = oneOnOne('flyer', 8);
    ar.step([c], 60, run(c));
    expect(m.pos.y).toBeGreaterThan(1.5);
    ar.runUntil([c], () => ar.log.damage.some((e) => e.sourceId === 'flyer'), 8, run(c));
    expect(ar.log.damage.find((e) => e.sourceId === 'flyer')!.via).toBe('flyer.dive');
  });

  it('the brute is armoured: light hits do not interrupt its swing; the skitter is not', () => {
    const b = oneOnOne('brute', 2);
    b.ar.runUntil([b.c], () => b.c.telegraphOf('brute')?.phase === 'windup', 3, run(b.c));
    b.ar.input('me').attackLight = true;
    b.ar.runUntil([b.c], () => b.ar.log.damage.some((e) => e.sourceId === 'me'), 1, run(b.c));
    b.ar.step([b.c], 1, run(b.c));
    expect(b.ar.log.damage.find((e) => e.sourceId === 'me')!.outcome).toBe('hit');
    expect(b.c.telegraphOf('brute')).not.toBeNull();

    const s = oneOnOne('skitter', 2);
    s.ar.runUntil([s.c], () => s.c.telegraphOf('skitter')?.phase === 'windup', 3, run(s.c));
    s.ar.input('me').lock = true;
    s.ar.input('me').attackLight = true;
    s.ar.runUntil([s.c], () => s.ar.log.damage.some((e) => e.sourceId === 'me'), 1, run(s.c));
    expect(s.ar.log.damage.find((e) => e.sourceId === 'me')!.outcome).toBe('hit');
    s.ar.step([s.c], 1, run(s.c));   // the brain reads the stagger on its next step
    expect(s.c.telegraphOf('skitter')).toBeNull();
  });

  it('deterministic: the same seed replays the same fight', () => {
    const fight = (seed: number) => {
      const ar = createArena();
      const c = createCombatSystem({ seed });
      ar.add(makeActor('me', { x: 0, z: 0 }, { hp: 5000 }));
      const m = ar.add(createMonsterActor(MONSTERS.brute, 'b', { x: 0, y: 0, z: 2 }));
      c.registerMonster(m, MONSTERS.brute);
      ar.step([c], 600, run(c));
      return ar.log.damage.map((e) => `${e.tSec.toFixed(3)}:${e.via}:${e.amount}`).join('|');
    };
    expect(fight(5)).toBe(fight(5));
    expect(fight(5).length).toBeGreaterThan(0);
  });
});

function _unused(_a: Arena) { /* keeps the type import honest */ }
void _unused;
