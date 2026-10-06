// Bosses: phases at their HP thresholds, once each, in order, invulnerable through the change, a 'boss' camera beat,
// each phase opened by a telegraphed signature attack; weak points as lock targets that take more. Then the plan's
// "done when" for A2: a headless fight, scripted inputs only, from the first phase to the boss's last.
import { describe, expect, it } from 'vitest';
import { createCombatSystem, type CombatSystem } from '../index';
import { createArena, makeActor } from '../testArena';
import { fightStateOf } from '../fightState';
import { createMonsterActor } from '../monsters/defs';
import { BOSS_MIN_OPENER_TELL, PLACEHOLDER_BOSS, validateBossDef } from './defs';
import { DODGE, STAMINA } from '../tuning';

const run = (c: CombatSystem) => ({ aiInputs: [c.aiInputs], moveLockOf: c.moveLockOf, takeWarp: c.takeWarp });

function arenaWithBoss(meHp = 3000, bossZ = 6) {
  const ar = createArena();
  const c = createCombatSystem({ seed: 21 });
  const me = ar.add(makeActor('me', { x: 0, z: 0 }, { hp: meHp }));
  const boss = ar.add(createMonsterActor(PLACEHOLDER_BOSS, 'boss', { x: 0, y: 0, z: bossZ }, { kind: 'boss' }));
  boss.facingYaw = Math.PI;
  c.registerBoss(boss, PLACEHOLDER_BOSS);
  return { ar, c, me, boss };
}

describe('adventure bosses: the def', () => {
  it('the placeholder boss passes its lint: three phases, readable tells, a telegraphed opener per phase', () => {
    expect(validateBossDef(PLACEHOLDER_BOSS)).toEqual([]);
    expect(PLACEHOLDER_BOSS.phases.map((p) => p.fromHp01)).toEqual([1, 0.66, 0.33]);
    for (const p of PLACEHOLDER_BOSS.phases) expect(p.opener.tellSec).toBeGreaterThanOrEqual(BOSS_MIN_OPENER_TELL);
  });

  it('the lint catches a threshold out of order and a fast opener', () => {
    const bad = {
      ...PLACEHOLDER_BOSS,
      phases: [PLACEHOLDER_BOSS.phases[0], { ...PLACEHOLDER_BOSS.phases[2], fromHp01: 0.8 }, { ...PLACEHOLDER_BOSS.phases[1], fromHp01: 0.9, opener: { ...PLACEHOLDER_BOSS.phases[1].opener, tellSec: 0.3 } }],
    };
    const errs = validateBossDef(bad);
    expect(errs.some((e) => e.includes('threshold'))).toBe(true);
    expect(errs.some((e) => e.includes('opener tell'))).toBe(true);
  });
});

describe('adventure bosses: phases', () => {
  it('changes phase at each threshold once, invulnerable and on a camera beat, then opens with its telegraphed signature', () => {
    const { ar, c, boss } = arenaWithBoss(3000, 12);
    const max = boss.stats.hp.max;
    ar.step([c], 5, run(c));
    expect(c.bossPhaseOf('boss')).toBe(1);
    boss.stats.hp.cur = Math.floor(max * 0.66);
    ar.step([c], 1, run(c));
    expect(ar.log['boss:phase']).toEqual([{ bossId: 'boss', phase: 2 }]);
    expect(boss.iframeSec).toBeGreaterThan(0);
    expect(fightStateOf(boss).iframeCause).toBe('phase');
    expect(ar.hints.some((h) => h.preset === 'boss' && h.priority >= 90)).toBe(true);
    // A hit during the change reads 'iframe', not 'dodged', and takes nothing.
    ar.actors.get('me')!.pos.z = 9.5;
    ar.input('me').attackLight = true;
    ar.runUntil([c], () => ar.log.damage.some((e) => e.targetId === 'boss'), 1, run(c));
    expect(ar.log.damage.find((e) => e.targetId === 'boss')).toMatchObject({ outcome: 'iframe', amount: 0 });
    // Staying under the threshold does not re-trigger it.
    ar.step([c], 120, run(c));
    expect(ar.log['boss:phase']).toHaveLength(1);
    // After the change, the first swing is the phase's opener, telegraphed.
    const t = c.telegraphOf('boss');
    const opener = PLACEHOLDER_BOSS.phases[1].opener;
    expect(ar.log.damage.some((e) => e.via === opener.id) || t?.attackId === opener.id).toBe(true);
    boss.stats.hp.cur = Math.floor(max * 0.3);
    ar.runUntil([c], () => ar.log['boss:phase'].length === 2, 3, run(c));
    expect(ar.log['boss:phase'].map((e) => e.phase)).toEqual([2, 3]);
    boss.stats.hp.cur = 1;
    ar.step([c], 200, run(c));
    expect(ar.log['boss:phase']).toHaveLength(2);
    expect(c.bossPhaseOf('boss')).toBe(3);
  });

  it('a drop through two thresholds enters both phases in order, each once, each with its own change', () => {
    const { ar, c, boss } = arenaWithBoss(3000, 12);
    boss.stats.hp.cur = Math.floor(boss.stats.hp.max * 0.2);
    ar.step([c], 1, run(c));
    expect(ar.log['boss:phase'].map((e) => e.phase)).toEqual([2]);
    const t2 = ar.tSec;
    ar.runUntil([c], () => ar.log['boss:phase'].length === 2, 3, run(c));
    // The second change waits for the first one's invulnerable beat to end.
    expect(ar.tSec - t2).toBeGreaterThanOrEqual(PLACEHOLDER_BOSS.phaseChangeSec - 1 / 60);
    expect(ar.log['boss:phase'].map((e) => e.phase)).toEqual([2, 3]);
    expect(boss.iframeSec).toBeGreaterThan(0);
  });

  it('the opener is telegraphed for at least its tell before it lands', () => {
    const { ar, c, boss } = arenaWithBoss(3000, 4);
    let tellAt = -1, landAt = -1;
    const opener = PLACEHOLDER_BOSS.phases[0].opener;
    ar.runUntil([c], () => {
      const t = c.telegraphOf('boss');
      if (t && t.attackId === opener.id && tellAt < 0) tellAt = ar.tSec;
      if (landAt < 0 && ar.log.damage.some((e) => e.via === opener.id)) landAt = ar.tSec;
      return landAt >= 0;
    }, 5, run(c));
    expect(tellAt).toBeGreaterThanOrEqual(0);
    expect(landAt - tellAt).toBeGreaterThanOrEqual(opener.tellSec - 1e-6);
    void boss;
  });

  it('a weak point locked and struck takes more than the body', () => {
    const body = arenaWithBoss(3000, 2.6);
    body.boss.iframeSec = 0;
    body.ar.input('me').lock = true; body.ar.step([body.c], 1, run(body.c));
    expect(body.me.lock).toMatchObject({ actorId: 'boss' });
    expect(body.me.lock!.part).toBeUndefined();
    body.ar.input('me').attackLight = true;
    body.ar.runUntil([body.c], () => body.ar.log.damage.some((e) => e.sourceId === 'me'), 1, run(body.c));
    const plain = body.ar.log.damage.find((e) => e.sourceId === 'me')!;

    const part = arenaWithBoss(3000, 2.6);
    part.ar.input('me').lock = true; part.ar.step([part.c], 1, run(part.c));
    // Flick until the lock sits on the core.
    for (let k = 0; k < 4 && part.me.lock?.part !== 'core'; k++) {
      part.ar.input('me').look.x = 0.9; part.ar.step([part.c], 1, run(part.c));
      part.ar.input('me').look.x = 0; part.ar.step([part.c], 1, run(part.c));
    }
    expect(part.me.lock).toMatchObject({ actorId: 'boss', part: 'core' });
    part.ar.input('me').attackLight = true;
    part.ar.runUntil([part.c], () => part.ar.log.damage.some((e) => e.sourceId === 'me'), 1, run(part.c));
    const weak = part.ar.log.damage.find((e) => e.sourceId === 'me')!;
    expect(plain.outcome).toBe('hit');
    expect(weak).toMatchObject({ outcome: 'hit', part: 'core' });
    expect(weak.amount).toBeGreaterThan(plain.amount);
    expect(weak.poiseDamage).toBeGreaterThan(plain.poiseDamage);
  });
});

describe('adventure bosses: a headless fight to the last phase', () => {
  it('scripted inputs only: lock the core, strings, rolls on the tells, until the boss reaches phase 3', () => {
    const { ar, c, me, boss } = arenaWithBoss(4000, 7);
    const i = ar.input('me');
    i.lock = true; ar.step([c], 1, run(c));
    let nextSwing = 0, beat = 0, rolls = 0;
    const script = ['attackLight', 'attackLight', 'attackHeavy'] as const;
    const took = ar.runUntil([c], () => {
      const fs = fightStateOf(me);
      // Keep the lock on the core once it is there.
      if (me.lock && me.lock.actorId === 'boss' && !me.lock.part && ar.tSec > 0.2 && ar.tSec < 0.3) { i.look.x = 0.9; }
      else i.look.x = 0;
      // Close in when out of reach.
      const dx = boss.pos.x - me.pos.x, dz = boss.pos.z - me.pos.z, d = Math.hypot(dx, dz);
      i.move.x = d > 2.9 ? dx / d : 0; i.move.y = d > 2.9 ? dz / d : 0;
      // Roll when a swing is about to land and the bar can pay for it.
      if (fs.incomingSec < 0.15 && me.stats.stamina.cur >= STAMINA.dodge && fs.rollCooldownSec === 0 && me.iframeSec === 0) {
        i.dash = true; i.move.x = -dx / d; i.move.y = -dz / d; rolls++;
      } else if (ar.tSec >= nextSwing && d <= 3.1 && me.stats.stamina.cur > 30) {
        i[script[beat++ % script.length]] = true;
        nextSwing = ar.tSec + 0.32;
      }
      return c.bossPhaseOf('boss') === 3;
    }, 240, run(c));
    expect(took).toBeLessThan(240);
    expect(ar.log['boss:phase'].map((e) => e.phase)).toEqual([2, 3]);
    const mine = ar.log.damage.filter((e) => e.sourceId === 'me');
    expect(mine.filter((e) => e.outcome === 'hit').length).toBeGreaterThan(10);
    expect(mine.some((e) => e.part === 'core')).toBe(true);
    expect(mine.some((e) => e.outcome === 'iframe')).toBe(true);   // swings into a phase change
    expect(rolls).toBeGreaterThan(0);
    expect(ar.log.damage.some((e) => e.targetId === 'me' && e.outcome === 'dodged')).toBe(true);
    expect(me.stats.hp.cur).toBeGreaterThan(0);
    for (const a of ar.actors.values()) {
      expect(Number.isFinite(a.pos.x) && Number.isFinite(a.pos.y) && Number.isFinite(a.pos.z)).toBe(true);
      expect(Number.isFinite(a.stats.hp.cur)).toBe(true);
    }
    void DODGE;
  });
});
