// Magic, headless (plan A2's tests): the starter table's lint; each element's advantage multiplier reaching a bolt's
// damage; no half-casts (short energy, unknown, cooldown, fusion tier); cast time on the caster's clock; telekinesis
// lifting and throwing a light enemy (and refusing a heavy one); slow-time scaling the world and not the caster,
// draining energy and asking the host through time:scale; partner magic taking the partner's element and growing with
// the fusion tier; the barrier and foresight.
import { describe, expect, it } from 'vitest';
import { FOCUS } from '@/lib/babylon/core/MatrixFocus';
import { ELEMENTS, MIND_POWERS, elementMultiplier, type Element } from '../contracts';
import { createCombatSystem, type CombatSystem } from '../combat/index';
import { createArena, makeActor, type Arena } from '../combat/testArena';
import { fightStateOf } from '../combat/fightState';
import { guardAnswer, parryWindowMsFor } from '../combat/defense';
import { MONSTERS, createMonsterActor } from '../combat/monsters/defs';
import { createMagicSystem, type MagicSystem } from './index';
import { BARRIER_SEC, STARTER_SPELLS, validateSpells } from './spells';
import { PARTNER_TIER_MULT, FUSED_MULT, partnerSpellMult } from './partner';
import { inArcXZ } from './cast';
import { inArc } from '@/lib/babylon/core/OnslaughtCore';
import { Vector3 } from '@babylonjs/core';

const ALL = STARTER_SPELLS.map((s) => s.id);

function setup(equipped: (string | null)[], known: string[] = ALL) {
  const ar = createArena();
  const combat = createCombatSystem({ seed: 4 });
  const magic = createMagicSystem({ loadoutOf: (a) => (a.id === 'me' ? { known, equipped } : null) });
  const me = ar.add(makeActor('me', { x: 0, z: 0 }, { hp: 5000, energy: 100 }));
  const o = { aiInputs: [combat.aiInputs], moveLockOf: combat.moveLockOf, takeWarp: combat.takeWarp };
  const step = (n = 1) => ar.step([combat, magic], n, o);
  const until = (pred: () => boolean, sec = 3) => ar.runUntil([combat, magic], pred, sec, o);
  return { ar, combat, magic, me, step, until };
}

function lockOn(s: { ar: Arena; step: (n?: number) => void }) {
  s.ar.input('me').lock = true; s.step();
}

function cast(s: { ar: Arena; step: (n?: number) => void }, slot = 0) {
  const i = s.ar.input('me');
  i.magicSlot = slot; i.magic = true; s.step();
}

describe('adventure magic: the starter table', () => {
  it('passes its lint: one bolt per element, every mind power, partner spells without an element of their own', () => {
    expect(validateSpells(STARTER_SPELLS)).toEqual([]);
    for (const e of ELEMENTS) expect(STARTER_SPELLS.filter((s) => s.shape === 'bolt' && s.element === e)).toHaveLength(1);
    for (const m of MIND_POWERS) expect(STARTER_SPELLS.some((s) => s.mind === m)).toBe(true);
    const partner = STARTER_SPELLS.filter((s) => s.kind === 'partner');
    expect(partner.length).toBeGreaterThanOrEqual(1);
    for (const p of partner) expect(p.element).toBeNull();
    // Every element and mind spell is learned through the story.
    for (const s of STARTER_SPELLS.filter((x) => x.kind !== 'partner')) expect(s.requires?.storyFlag).toMatch(/^learned:/);
  });

  it('the cone test is OnslaughtCore.inArc on plain data', () => {
    for (let k = 0; k < 200; k++) {
      const yaw = (k * 0.37) % (Math.PI * 2), tx = Math.sin(k) * 5, tz = Math.cos(k * 1.3) * 5, arc = 30 + (k % 7) * 20;
      expect(inArcXZ({ x: 0.5, z: -0.2 }, yaw, { x: tx, z: tz }, 4, arc))
        .toBe(inArc(new Vector3(0.5, 0, -0.2), yaw, new Vector3(tx, 0, tz), 4, arc));
    }
  });
});

describe('adventure magic: elements reach the damage', () => {
  for (const atk of ELEMENTS) {
    it(`${atk} bolt: strong, weak and neutral targets take power × the advantage multiplier`, () => {
      const spell = STARTER_SPELLS.find((s) => s.id === `bolt.${atk}`)!;
      const defenders: (Element | null)[] = [
        ELEMENTS.find((d) => elementMultiplier(atk, d) > 1)!, ELEMENTS.find((d) => elementMultiplier(atk, d) < 1)!, null,
      ];
      for (const def of defenders) {
        const s = setup([spell.id]);
        s.ar.add(makeActor('t', { x: 0, z: 8 }, { kind: 'monster', team: -1, hp: 10_000, element: def }));
        lockOn(s);
        cast(s);
        s.until(() => s.ar.log.damage.length > 0);
        const ev = s.ar.log.damage[0];
        expect(ev).toMatchObject({ targetId: 't', element: atk, source: 'spell', outcome: 'hit', via: spell.id });
        expect(ev.amount).toBe(Math.round(spell.power * elementMultiplier(atk, def)));
      }
    });
  }
});

describe('adventure magic: no half-casts', () => {
  it('short energy refuses the cast and spends nothing', () => {
    const s = setup(['bolt.fire']);
    s.ar.add(makeActor('t', { x: 0, z: 8 }, { kind: 'monster', team: -1 }));
    s.me.stats.energy.cur = 5;
    cast(s);
    s.step(60);
    expect(s.magic.lastRefusal('me')).toBe('energy');
    expect(s.me.stats.energy.cur).toBe(5);
    expect(s.ar.log['spell:cast']).toHaveLength(0);
    expect(s.magic.bolts.activeCount).toBe(0);
  });

  it('an unknown spell, an empty slot, a cooldown and a missing fusion tier each refuse without spending', () => {
    const s = setup(['bolt.fire', null, 'partner.burst', 'bolt.ice'], ['bolt.fire', 'partner.burst']);
    s.ar.add(makeActor('t', { x: 0, z: 8 }, { kind: 'monster', team: -1, hp: 10_000 }));
    s.me.stats.element = 'water';
    cast(s, 3);
    expect(s.magic.lastRefusal('me')).toBe('unknown');
    cast(s, 1);
    expect(s.magic.lastRefusal('me')).toBe('not-equipped');
    s.me.fusion.tier = 1;
    cast(s, 2);
    expect(s.magic.lastRefusal('me')).toBe('fusion');
    expect(s.me.stats.energy.cur).toBe(100);
    cast(s, 0);
    s.step(30);
    const after = s.me.stats.energy.cur;
    cast(s, 0);
    expect(s.magic.lastRefusal('me')).toBe('cooldown');
    expect(s.me.stats.energy.cur).toBe(after);
  });

  it('a cast takes its cast time on the caster\'s clock, and a stagger interrupts it (the energy is gone)', () => {
    const s = setup(['bolt.earth']);
    cast(s);
    const t0 = s.ar.tSec;
    s.until(() => s.ar.log['spell:cast'].length > 0);
    expect(s.ar.tSec - t0).toBeGreaterThanOrEqual(STARTER_SPELLS.find((x) => x.id === 'bolt.earth')!.castSec - 1 / 60);

    const t = setup(['bolt.earth']);
    cast(t);
    t.step(5);
    t.me.stunSec = 0.5;
    t.step(60);
    expect(t.ar.log['spell:cast']).toHaveLength(0);
    expect(t.me.stats.energy.cur).toBeLessThan(100);
  });
});

describe('adventure magic: telekinesis', () => {
  function tk() {
    const s = setup(['mind.telekinesis']);
    const light = s.ar.add(createMonsterActor(MONSTERS.skitter, 'light', { x: 0, y: 0, z: 4 }));
    s.combat.registerMonster(light, MONSTERS.skitter);
    light.stats.hp.cur = light.stats.hp.max = 400;
    const other = s.ar.add(createMonsterActor(MONSTERS.swarm, 'other', { x: 0, y: 0, z: 9 }));
    other.stats.hp.cur = other.stats.hp.max = 400;
    return { ...s, light, other };
  }

  it('lifts a light enemy, holds it while held (energy per second), throws it into another, and it lands hurt', () => {
    const s = tk();
    lockOn(s);
    expect(s.me.lock?.actorId).toBe('light');
    const i = s.ar.input('me');
    i.magicSlot = 0; i.magic = true; i.magicHeld = true;
    s.step();
    s.until(() => s.magic.holdingOf('me') === 'light', 1);
    const e0 = s.me.stats.energy.cur;
    s.step(45);
    expect(s.light.pos.y).toBeGreaterThan(1);
    expect(s.light.stunSec).toBeGreaterThan(0);
    expect(fightStateOf(s.light).heldBy).toBe('me');
    expect(e0 - s.me.stats.energy.cur).toBeCloseTo(12 * 0.75, 0);
    // Held, it is in front of the caster.
    expect(Math.hypot(s.light.pos.x, s.light.pos.z - 2.2)).toBeLessThan(0.8);
    // Release: thrown down the lock line (still the light enemy's bearing: +z), into 'other'.
    s.me.lock = { actorId: 'other', sinceSec: 0, hard: true };
    i.magicHeld = false;
    s.step();
    expect(s.magic.holdingOf('me')).toBeNull();
    s.until(() => fightStateOf(s.light).thrownSec === 0, 2);
    const vias = s.ar.log.damage.map((e) => `${e.targetId}:${e.via}`);
    expect(vias).toContain('other:telekinesis.throw');
    expect(vias).toContain('light:telekinesis.impact');
    expect(s.light.pos.z).toBeGreaterThan(5);
    expect(s.ar.log['spell:cast'].map((e) => e.spellId)).toEqual(['mind.telekinesis']);
  });

  it('a heavy enemy refuses the grab and nothing is spent', () => {
    const s = setup(['mind.telekinesis']);
    const brute = s.ar.add(createMonsterActor(MONSTERS.brute, 'brute', { x: 0, y: 0, z: 4 }));
    s.combat.registerMonster(brute, MONSTERS.brute);
    lockOn(s);
    const i = s.ar.input('me');
    i.magicSlot = 0; i.magic = true; i.magicHeld = true;
    s.step();
    expect(s.magic.lastRefusal('me')).toBe('too-heavy');
    expect(s.me.stats.energy.cur).toBe(100);
    expect(s.magic.holdingOf('me')).toBeNull();
  });

  it('the hold drops the body when the energy runs dry', () => {
    const s = tk();
    lockOn(s);
    const i = s.ar.input('me');
    i.magicSlot = 0; i.magic = true; i.magicHeld = true;
    s.step();
    s.until(() => s.magic.holdingOf('me') === 'light', 1);
    s.me.stats.energy.cur = 1;
    s.step(10);
    expect(s.magic.holdingOf('me')).toBeNull();
    expect(fightStateOf(s.light).thrownSec).toBe(0);
  });
});

describe('adventure magic: slow-time', () => {
  function slow() {
    const s = setup([]);
    const brute = s.ar.add(createMonsterActor({ ...MONSTERS.brute }, 'brute', { x: 0, y: 0, z: 2 }));
    s.combat.registerMonster(brute, { ...MONSTERS.brute, attacks: [MONSTERS.brute.attacks[0]] });
    return { ...s, brute };
  }

  it('scales the monsters to 0.32 and the caster to 0.92: a tell crawls while your swing does not', () => {
    const s = slow();
    s.ar.add(makeActor('post', { x: 2, z: 0.5 }, { kind: 'monster', team: -1, hp: 10_000 }));   // something to swing at
    s.until(() => s.combat.telegraphOf('brute')?.phase === 'windup');
    s.ar.input('me').focusHeld = true;
    s.step();
    expect(s.magic.slowTimeActive('me')).toBe(true);
    expect(s.ar.log['time:scale'][0]).toMatchObject({ byId: 'me', world: FOCUS.worldScale, self: FOCUS.heroScale });
    const tell = MONSTERS.brute.attacks[0].tellSec;
    const w0 = s.combat.telegraphOf('brute')!.t01 * tell;
    s.ar.input('me').attackLight = true;
    s.step(12);   // 0.2 s of real time
    const w1 = s.combat.telegraphOf('brute')!.t01 * tell;
    expect((w1 - w0) / 0.2).toBeCloseTo(FOCUS.worldScale, 2);
    const swing = fightStateOf(s.me);
    expect(swing.move).not.toBeNull();
    expect(swing.moveT / (12 / 60)).toBeCloseTo(FOCUS.heroScale, 2);   // the swing started and advanced on the press step
    // The caster's own timers run at 0.92, the brute's at 0.32.
    expect(fightStateOf(s.me).localSec - fightStateOf(s.brute).localSec).toBeGreaterThan(0);
  });

  it('drains energy at MatrixFocus\' rate, ends on release (asking the host to put the clock back), refuses below its minimum', () => {
    const s = slow();
    s.ar.input('me').focusHeld = true;
    s.step();
    const e0 = s.me.stats.energy.cur;
    expect(e0).toBe(100 - FOCUS.minToStart);
    s.step(30);
    expect(e0 - s.me.stats.energy.cur).toBeCloseTo(FOCUS.drainPerSec * 0.5, 0);
    s.ar.input('me').focusHeld = false;
    s.step();
    expect(s.magic.slowTimeActive('me')).toBe(false);
    expect(s.ar.log['time:scale'].at(-1)).toMatchObject({ byId: 'me', world: 1, self: 1, sec: 0 });
    expect(s.ar.timeScaleOf('brute')).toBe(1);

    const t = slow();
    t.me.stats.energy.cur = FOCUS.minToStart - 1;
    t.ar.input('me').focusHeld = true;
    t.step(5);
    expect(t.magic.slowTimeActive('me')).toBe(false);
    expect(t.ar.log['time:scale']).toHaveLength(0);
    expect(t.me.stats.energy.cur).toBe(FOCUS.minToStart - 1);
  });

  it('runs dry: at zero energy the world comes back by itself', () => {
    const s = slow();
    s.me.stats.energy.cur = 30;
    s.ar.input('me').focusHeld = true;
    s.until(() => !s.magic.slowTimeActive('me') && s.ar.tSec > 0.1, 3);
    expect(s.me.stats.energy.cur).toBe(0);
    expect(s.ar.timeScaleOf('brute')).toBe(1);
  });

  it('is learned: a caster who does not know it gets nothing from the trigger', () => {
    const s = setup([], ['bolt.fire']);
    s.ar.input('me').focusHeld = true;
    s.step(10);
    expect(s.magic.slowTimeActive('me')).toBe(false);
    expect(s.me.stats.energy.cur).toBe(100);
  });
});

describe('adventure magic: the partner\'s element', () => {
  function partnerCast(tier: 0 | 1 | 2 | 3, fused: boolean) {
    const s = setup(['partner.surge']);
    const partner = s.ar.add(makeActor('pal', { x: -3, z: -3 }, { kind: 'partner', team: 0, element: 'fire' }));
    s.me.partnerId = partner.id;
    s.me.fusion = { active: fused, tier, meter: 0, remainingSec: fused ? 20 : 0, partnerId: 'pal', element: fused ? 'fire' : null, grantsFlight: fused };
    s.ar.add(makeActor('t', { x: 0, z: 3 }, { kind: 'monster', team: -1, hp: 10_000, element: 'ice' }));
    lockOn(s);
    cast(s);
    s.until(() => s.ar.log.damage.length > 0);
    return s.ar.log.damage[0];
  }

  it('takes the partner\'s element (fire beats ice) and grows with every fusion tier, more again while fused', () => {
    const amounts: number[] = [];
    for (const tier of [0, 1, 2, 3] as const) {
      const ev = partnerCast(tier, false);
      expect(ev).toMatchObject({ element: 'fire', via: 'partner.surge', outcome: 'hit' });
      amounts.push(ev.amount);
    }
    for (let k = 1; k < amounts.length; k++) expect(amounts[k]).toBeGreaterThan(amounts[k - 1]);
    const fused = partnerCast(3, true);
    expect(fused.amount).toBeGreaterThan(amounts[3]);
    const power = STARTER_SPELLS.find((x) => x.id === 'partner.surge')!.power;
    expect(amounts[0]).toBe(Math.round(power * elementMultiplier('fire', 'ice')));
    expect(fused.amount).toBe(Math.round(power * PARTNER_TIER_MULT[3] * FUSED_MULT * elementMultiplier('fire', 'ice')));
    expect(partnerSpellMult({ tier: 3, active: true })).toBeCloseTo(PARTNER_TIER_MULT[3] * FUSED_MULT, 6);
  });

  it('with no partner and no element it is refused, and nothing is spent', () => {
    const s = setup(['partner.surge']);
    cast(s);
    expect(s.magic.lastRefusal('me')).toBe('no-element');
    expect(s.me.stats.energy.cur).toBe(100);
  });
});

describe('adventure magic: barrier and foresight', () => {
  it('a barrier absorbs the next hit, then fades', () => {
    const s = setup(['mind.barrier']);
    cast(s);
    s.until(() => s.ar.log['spell:cast'].length > 0);
    expect(fightStateOf(s.me).barrierHp).toBeGreaterThan(0);
    const brute = s.ar.add(createMonsterActor(MONSTERS.brute, 'brute', { x: 0, y: 0, z: 2 }));
    s.combat.registerMonster(brute, { ...MONSTERS.brute, attacks: [MONSTERS.brute.attacks[0]] });
    s.until(() => s.ar.log.damage.length > 0, 3);
    const ev = s.ar.log.damage[0];
    expect(ev.outcome).toBe('hit');
    expect(ev.amount).toBe(0);   // 40 absorbs the overhead (~25)
    s.step(Math.ceil(BARRIER_SEC * 60));
    expect(fightStateOf(s.me).barrierHp).toBe(0);
  });

  it('foresight widens the parry window', () => {
    const s = setup(['mind.foresight']);
    const fs = fightStateOf(s.me);
    expect(guardAnswer(true, 0, 0.19, 0, parryWindowMsFor(fs))).toBe('blocked');
    cast(s);
    s.until(() => s.ar.log['spell:cast'].length > 0);
    expect(guardAnswer(true, 0, 0.19, 0, parryWindowMsFor(fs))).toBe('parried');
  });
});

void (null as unknown as CombatSystem | MagicSystem);
