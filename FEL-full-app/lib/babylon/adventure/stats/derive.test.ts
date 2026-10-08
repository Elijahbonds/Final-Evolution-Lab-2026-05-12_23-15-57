// A3 derived stats (docs/ADVENTURE-PLAN.md A3): the plan's formulas, the guest rule (READY, never a penalty), the
// school as a redistribution, fusion's merge, and every output inside STAT_BOUNDS across the whole input space.
import { describe, expect, it } from 'vitest';
import { PRQ_ATTRS, type PrqAttr } from '@/lib/prq';
import { SCHOOLS } from '@/lib/babylon/combat/schools';
import { prqMaxHp } from '@/lib/babylon/core/PrqVitals';
import { PRQ_BANDS, pool, type ActorStats } from '../contracts';
import {
  GEAR_CAPS, STAT_BOUNDS, TRAINING_BONUS_MAX, actorStatsFrom, applyDerived, deriveActorStats, mergeFusionAttrs,
  sanitizeSchool, trainingBonus,
} from './derive';
import { ADVENTURE_LEVEL_CAP } from './level';

const all = (v: number) => Object.fromEntries(PRQ_ATTRS.map((k) => [k, v])) as Record<PrqAttr, number>;

describe('deriveActorStats: the plan formulas', () => {
  it('HP is prqMaxHp(100 + 8 (level − 1), band); energy 100 + 4 (level − 1); stamina 100 + endurance / 5', () => {
    for (const band of PRQ_BANDS) {
      for (const level of [1, 2, 10, 25, 50]) {
        const d = deriveActorStats({ level, band, attrs: all(60) });
        expect(d.hpMax).toBe(prqMaxHp(100 + 8 * (level - 1), band));
        expect(d.energyMax).toBe(100 + 4 * (level - 1));
        expect(d.staminaMax).toBe(112);
        expect(d.prqBand).toBe(band);
        expect(d.level).toBe(level);
      }
    }
  });

  it('scales up with band and with level', () => {
    const at = (band: (typeof PRQ_BANDS)[number], level: number) => deriveActorStats({ level, band }).hpMax;
    expect(at('RECOVERING', 10)).toBeLessThan(at('READY', 10));
    expect(at('READY', 10)).toBeLessThan(at('PRIMED', 10));
    expect(at('PRIMED', 10)).toBeLessThan(at('ELITE', 10));
    for (let l = 1; l < ADVENTURE_LEVEL_CAP; l++) expect(at('READY', l + 1)).toBeGreaterThan(at('READY', l));
    expect(deriveActorStats({ level: 1, band: 'ELITE' }).speedMult).toBeGreaterThan(deriveActorStats({ level: 1, band: 'RECOVERING' }).speedMult);
  });

  it('a guest is READY with a baseline body, never below READY', () => {
    const guest = deriveActorStats({ level: 5 });
    const ready = deriveActorStats({ level: 5, band: 'READY', attrs: all(50) });
    expect(guest.prqBand).toBe('READY');
    expect(guest).toEqual(ready);
    // junk is a guest too
    expect(deriveActorStats({ level: 5, band: 'NONSENSE' as never }).prqBand).toBe('READY');
    expect(deriveActorStats({ level: Number.NaN }).level).toBe(1);
  });

  it('the school moves poise against energy regen and never makes a fighter simply stronger', () => {
    const anchored = deriveActorStats({ level: 10, school: { primary: 'anchored', secondary: 'anchored', mix: 0 } });
    const sweeping = deriveActorStats({ level: 10, school: { primary: 'sweeping', secondary: 'sweeping', mix: 0 } });
    expect(anchored.poiseMax).toBeGreaterThan(sweeping.poiseMax);
    expect(anchored.energyRegenPerSec).toBeLessThan(sweeping.energyRegenPerSec);
    // HP and energy max do not depend on the school
    expect(anchored.hpMax).toBe(sweeping.hpMax);
    expect(anchored.energyMax).toBe(sweeping.energyMax);
    // an unknown school id reads as the first school, a mix outside 0..1 clamps
    expect(sanitizeSchool({ primary: 'nope', secondary: 'sharp', mix: 7 })).toEqual({ primary: 'straight', secondary: 'sharp', mix: 1 });
  });

  it('training adds at most TRAINING_BONUS_MAX attribute points and never past 100', () => {
    expect(trainingBonus(0)).toBe(0);
    expect(trainingBonus(250)).toBe(2.5);
    expect(trainingBonus(1e9)).toBe(TRAINING_BONUS_MAX);
    const d = deriveActorStats({ level: 1, attrs: all(95), training: { endurance: 1e9 } });
    expect(d.attrs.endurance).toBe(100);
    expect(deriveActorStats({ level: 1, training: { endurance: 1000 } }).staminaMax)
      .toBeGreaterThan(deriveActorStats({ level: 1 }).staminaMax);
  });

  it('fusion merges attributes (0.7 high + 0.3 low), adds HP and energy by tier, and takes the partner element', () => {
    const m = mergeFusionAttrs({ ...all(40), strength: 90 }, { ...all(80), strength: 20 });
    expect(m.strength).toBeCloseTo(90 * 0.7 + 20 * 0.3);
    expect(m.speed).toBeCloseTo(80 * 0.7 + 40 * 0.3);
    const solo = deriveActorStats({ level: 10, attrs: all(40), element: null });
    const fused = deriveActorStats({ level: 10, attrs: all(40), fusion: { partnerAttrs: all(80), tier: 2, element: 'fire' } });
    expect(fused.hpMax).toBeGreaterThan(solo.hpMax);
    expect(fused.energyMax).toBe(solo.energyMax + 20);
    expect(fused.staminaMax).toBeGreaterThan(solo.staminaMax);
    expect(fused.element).toBe('fire');
  });

  it('every output stays inside STAT_BOUNDS across bands, levels, schools, attribute extremes, gear and fusion', () => {
    const levels = [-5, 0, 1, 2, 10, 30, 50, 51, 1e6];
    const bodies = [all(0), all(100), all(50), {}, null, { strength: -50, endurance: 1e4 } as never];
    const gears = [null, {}, GEAR_CAPS, { hp: 1e6, poise: 1e6, energyRegen: 1e6, speed: 1e6 }, { hp: -100 }];
    const fusions = [null, { partnerAttrs: all(100), tier: 3 as const }, { partnerAttrs: all(0), tier: 1 as const }];
    let n = 0;
    const bad: string[] = [];
    for (const band of [...PRQ_BANDS, null])
      for (const level of levels)
        for (const school of SCHOOLS)
          for (const attrs of bodies)
            for (const gear of gears)
              for (const fusion of fusions) {
                const d = deriveActorStats({ level, band, attrs, gear, fusion, training: { recovery: 1e9 }, school: { primary: school.id, secondary: 'sharp', mix: 0.5 } });
                const within = (name: string, v: number, b: readonly [number, number]) => {
                  if (!(Number.isFinite(v) && v >= b[0] && v <= b[1])) bad.push(`${name}=${v}`);
                };
                within('hp', d.hpMax, STAT_BOUNDS.hp);
                within('stamina', d.staminaMax, STAT_BOUNDS.stamina);
                within('energy', d.energyMax, STAT_BOUNDS.energy);
                within('poise', d.poiseMax, STAT_BOUNDS.poise);
                within('regen', d.energyRegenPerSec, STAT_BOUNDS.energyRegen);
                within('speed', d.speedMult, STAT_BOUNDS.speedMult);
                for (const k of PRQ_ATTRS) within(k, d.attrs[k], [0, 100]);
                n++;
              }
    expect(bad).toEqual([]);
    expect(n).toBeGreaterThan(5000);
  });

  it('the natural maxima sit inside the bounds (the clamp is a guard, not the formula)', () => {
    const top = deriveActorStats({ level: 50, band: 'ELITE', attrs: all(100), gear: GEAR_CAPS, fusion: { partnerAttrs: all(100), tier: 3 }, school: { primary: 'anchored', secondary: 'anchored', mix: 0 } });
    expect(top.hpMax).toBeLessThan(STAT_BOUNDS.hp[1]);
    expect(top.energyMax).toBeLessThan(STAT_BOUNDS.energy[1]);
    expect(top.poiseMax).toBeLessThan(STAT_BOUNDS.poise[1]);
  });
});

describe('applyDerived: A3 writes maxes, never raises another lane\'s cur', () => {
  it('a spawn fills every pool; a later re-derive leaves cur alone unless it sits above a lowered max', () => {
    const d = deriveActorStats({ level: 10 });
    const s: ActorStats = actorStatsFrom(d);
    expect(s.hp.cur).toBe(d.hpMax);
    s.hp.cur = 50;
    const up = deriveActorStats({ level: 20 });
    applyDerived(s, up);
    expect(s.hp.max).toBe(up.hpMax);
    expect(s.hp.cur).toBe(50);   // not raised
    s.hp.cur = s.hp.max;
    applyDerived(s, deriveActorStats({ level: 1 }));
    expect(s.hp.cur).toBe(s.hp.max);   // lowered with the max (the pool invariant)
    const fresh: ActorStats = { ...actorStatsFrom(d), hp: pool(1) };
    applyDerived(fresh, d, true);
    expect(fresh.hp.cur).toBe(d.hpMax);
  });
});
