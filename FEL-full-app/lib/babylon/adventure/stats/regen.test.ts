// A3 energy regen and special fill (docs/ADVENTURE-PLAN.md A3, stats/regen).
import { describe, expect, it } from 'vitest';
import { pool, type DamageEvent } from '../contracts';
import {
  ENERGY_REGEN_DELAY_SEC, EnergyRegen, SPECIAL_ON_PARRY, SPECIAL_PER_DAMAGE_DEALT, SPECIAL_PER_DAMAGE_TAKEN, addSpecial,
  specialForDealer, specialForTarget,
} from './regen';

const ev = (outcome: DamageEvent['outcome'], amount: number): DamageEvent => ({
  tSec: 0, sourceId: 'a', targetId: 'b', amount, source: 'strike', element: null, outcome, staminaDamage: 0,
  poiseDamage: 0, staggerSec: 0, launch: false, knockback: null,
});

describe('EnergyRegen', () => {
  it('refills at the rate, pauses after a spend, stops when blocked, never passes max', () => {
    const e = pool(100, 20);
    const r = new EnergyRegen();
    for (let i = 0; i < 60; i++) r.step(e, 5, 1 / 60, false);
    expect(e.cur).toBeCloseTo(25, 6);
    e.cur -= 10;   // someone spent
    for (let i = 0; i < Math.floor(ENERGY_REGEN_DELAY_SEC * 60) - 1; i++) r.step(e, 5, 1 / 60, false);
    expect(e.cur).toBeCloseTo(15, 6);
    for (let i = 0; i < 120; i++) r.step(e, 5, 1 / 60, true);
    expect(e.cur).toBeCloseTo(15, 6);
    for (let i = 0; i < 6000; i++) r.step(e, 5, 1 / 60, false);
    expect(e.cur).toBe(100);
  });
});

describe('special gains', () => {
  it('pays the dealer on hits, the target on hits taken and on clean defence', () => {
    expect(specialForDealer(ev('hit', 60))).toBeCloseTo(60 * SPECIAL_PER_DAMAGE_DEALT);
    expect(specialForDealer(ev('blocked', 0))).toBe(0);
    expect(specialForTarget(ev('hit', 40))).toBeCloseTo(40 * SPECIAL_PER_DAMAGE_TAKEN);
    expect(specialForTarget(ev('parried', 0))).toBe(SPECIAL_ON_PARRY);
    expect(specialForTarget(ev('iframe', 0))).toBe(0);
    const s = { special: 0.99 };
    addSpecial(s, 0.5);
    expect(s.special).toBe(1);
    addSpecial(s, -1);
    expect(s.special).toBe(1);
  });
});
