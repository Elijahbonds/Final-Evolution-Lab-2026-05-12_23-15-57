// The damage pipeline's numbers: element advantage reaches the HP removed, the combo scaling is FightCore's, and the
// BOUNDS hold however the multipliers stack (the BR economy's guard: no one-shot, no collapse of the time to kill).
import { describe, expect, it } from 'vitest';
import { applyHit as fightCoreApplyHit, FighterState, KARATE_ATTACKS } from '@/lib/babylon/core/FightCore';
import { ROUTES } from '@/lib/babylon/core/FighterStyle';
import { SCHOOLS } from '@/lib/babylon/combat/schools';
import { PRQ_ATTRS } from '@/lib/prq';
import { createAdventureBus, ELEMENTS, ELEMENT_STRONG, ELEMENT_WEAK, elementMultiplier } from '../contracts';
import { applyHit, comboScale, damageAmount, makeHitSpec } from './damage';
import { fightStateOf } from './fightState';
import { ADVENTURE_MOVES } from './strings';
import { makeActor } from './testArena';
import { AIR, DAMAGE, GUARD } from './tuning';
import { MONSTERS } from './monsters/defs';
import { PLACEHOLDER_BOSS } from './bosses/defs';

const spec = (base: number, element: (typeof ELEMENTS)[number] | null = null) => {
  const s = makeHitSpec();
  s.base = base; s.source = 'spell'; s.element = element; s.fromX = 0; s.fromZ = -1;
  return s;
};

describe('adventure damage: elements', () => {
  it('every attack element against every defending element removes base × elementMultiplier', () => {
    for (const atk of ELEMENTS) {
      for (const def of [...ELEMENTS, null]) {
        const target = makeActor('t', { x: 0, z: 0 }, { hp: 10_000, element: def });
        const got = damageAmount(null, target, spec(40, atk));
        expect(got).toBe(Math.round(40 * elementMultiplier(atk, def)));
      }
    }
    // The ring and the pair, spelled out once.
    const ice = makeActor('i', { x: 0, z: 0 }, { hp: 10_000, element: 'ice' });
    const fire = makeActor('f', { x: 0, z: 0 }, { hp: 10_000, element: 'fire' });
    expect(damageAmount(null, ice, spec(40, 'fire'))).toBe(Math.round(40 * ELEMENT_STRONG));
    expect(damageAmount(null, fire, spec(40, 'ice'))).toBe(Math.round(40 * ELEMENT_WEAK));
  });

  it('the element reaches the emitted DamageEvent too', () => {
    const bus = createAdventureBus();
    const seen: number[] = [];
    bus.on('damage', (e) => seen.push(e.amount));
    const water = makeActor('w', { x: 0, z: 0 }, { hp: 10_000, element: 'water' });
    applyHit(bus, 0, null, water, spec(40, 'lightning'));
    applyHit(bus, 0, null, water, spec(40, 'fire'));
    expect(seen).toEqual([Math.round(40 * ELEMENT_STRONG), Math.round(40 * ELEMENT_WEAK)]);
  });
});

describe('adventure damage: a downed body', () => {
  it('takes no more hits and emits nothing, so ko fires once per life', () => {
    const bus = createAdventureBus();
    const seen: string[] = [];
    bus.on('damage', (e) => seen.push(e.outcome));
    bus.on('ko', () => seen.push('ko'));
    const t = makeActor('t', { x: 0, z: 0 }, { hp: 10 });
    let n = 0;
    while (t.stats.hp.cur > 0 && n < 10) { expect(applyHit(bus, 0, null, t, spec(50))).not.toBeNull(); n++; }
    expect(t.stats.hp.cur).toBe(0);
    expect(applyHit(bus, 0, null, t, spec(50))).toBeNull();
    expect(applyHit(bus, 0, null, t, spec(50))).toBeNull();
    expect(seen).toEqual([...Array(n).fill('hit'), 'ko']);
  });
});

describe('adventure damage: the combo scaling is FightCore\'s', () => {
  it('matches FightCore.applyHit link for link', () => {
    const a = new FighterState(), d = new FighterState(1e6);
    for (let n = 1; n <= 9; n++) {
      const before = d.hp;
      fightCoreApplyHit(a, d, KARATE_ATTACKS.heavy);
      expect(before - d.hp).toBe(Math.round(KARATE_ATTACKS.heavy.dmg * comboScale(n)));
    }
  });
});

describe('adventure damage: the bounds (BR economy)', () => {
  it('no stack of multipliers takes more than a third of max HP, or more than the absolute cap, in one hit', () => {
    const maxBase = Math.max(
      ...Object.values(ADVENTURE_MOVES).map((m) => m.dmg),
      ...Object.values(MONSTERS).flatMap((m) => m.attacks.map((a) => a.damage)),
      ...PLACEHOLDER_BOSS.phases.flatMap((p) => [...p.attacks, p.opener].map((a) => a.damage)),
    );
    const bestRoute = Math.max(...ROUTES.map((r) => r.payoff));
    const extras = [1, bestRoute, bestRoute * GUARD.riposteMult, bestRoute * GUARD.riposteMult * 1.75 /* fused partner */];
    let worst = 0;
    for (const level of [1, 10, 25, 50]) {
      for (const force of [0, 50, 100]) {
        for (const school of SCHOOLS) {
          const attrs = Object.fromEntries(PRQ_ATTRS.map((k) => [k, force]));
          const attacker = makeActor('a', { x: 0, z: 0 }, { level });
          attacker.stats.attrs = attrs;
          attacker.stats.school = { primary: school.id, secondary: school.id, mix: 0 };
          for (const maxHp of [60, 100, 250, 500, 900]) {
            for (const mult of extras) {
              for (const juggled of [false, true]) {
                const target = makeActor('t', { x: 0, z: 1 }, { hp: maxHp, element: 'ice' });
                if (juggled) fightStateOf(target).airSec = AIR.launchSec;
                fightStateOf(target).subVulnerableSec = 1;
                const s = spec(maxBase, 'fire');
                s.mult = mult; s.partMult = 1.5; s.source = 'strike';
                const dmg = damageAmount(attacker, target, s, 1);
                expect(Number.isInteger(dmg)).toBe(true);
                expect(dmg).toBeGreaterThanOrEqual(0);
                expect(dmg).toBeLessThanOrEqual(Math.min(DAMAGE.maxAbsolute, DAMAGE.maxFractionOfMaxHp * maxHp) + 0.5);
                worst = Math.max(worst, dmg / maxHp);
              }
            }
          }
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(DAMAGE.maxFractionOfMaxHp + 0.005);
  });

  it('a full-HP fighter survives any two hits: the fewest hits to a KO is three', () => {
    const bus = createAdventureBus();
    const attacker = makeActor('a', { x: 0, z: 0 }, { level: 50 });
    attacker.stats.attrs = Object.fromEntries(PRQ_ATTRS.map((k) => [k, 100]));
    const target = makeActor('t', { x: 0, z: 1 }, { hp: 100, poise: 0 });
    const s = spec(999, null);
    s.mult = 10;
    let hits = 0;
    while (target.stats.hp.cur > 0 && hits < 10) { applyHit(bus, 0, attacker, target, s); hits++; target.stunSec = 0; }
    expect(hits).toBeGreaterThanOrEqual(3);
  });

  it('garbage in stays bounded: NaN or negative bases and levels never make NaN or negative damage', () => {
    const t = makeActor('t', { x: 0, z: 0 }, { hp: 100 });
    const a = makeActor('a', { x: 0, z: 0 }, { level: Number.NaN });
    for (const base of [Number.NaN, -5, 0, Infinity]) {
      const d = damageAmount(a, t, spec(base));
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeGreaterThanOrEqual(0);
    }
  });

  it('a heavy combo decays: the tenth link of a string is worth at most 40 % of the first', () => {
    expect(comboScale(1)).toBe(1);
    expect(comboScale(10)).toBeCloseTo(0.4, 6);
    expect(comboScale(50)).toBeCloseTo(0.4, 6);
  });
});
