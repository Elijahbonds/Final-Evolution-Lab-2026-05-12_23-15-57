// THREE HITS AT WAVE 1, AND ONE SWING STILL CLEARS A CROWD (2026-09-14).
//
// The owner's number is three, and the obvious way to get there — give every body three health and scale
// it hard with the wave — breaks the thing the mode is actually for. Karate endless's fantasy is that a
// strike reaches every body in the arc; that survives tripling each body's pool, and it does not survive
// tripling it again by wave 6, because the arc stops keeping up and a wave becomes attrition. The cap is
// the guard, and the last test here is the one that would catch somebody tuning it away.

import { describe, it, expect } from 'vitest';
import {
  mookMaxHp, hitsToDrop, damageMook, mookHp01, mookBarHex,
  HITS_AT_WAVE_1, HIT_DAMAGE, MOOK_HP_CAP, LAUNCH_BONUS_MULT,
} from './MookHealth';

describe('MookHealth — the pool', () => {
  it('takes exactly the owner number of light hits on wave 1', () => {
    expect(hitsToDrop(1)).toBe(HITS_AT_WAVE_1);
  });

  it('never drops below one hit, at any wave or any nonsense input', () => {
    for (const w of [1, 0, -5, NaN, 99]) expect(hitsToDrop(w)).toBeGreaterThanOrEqual(1);
  });

  it('gets tougher with the wave, and stops', () => {
    expect(mookMaxHp(5)).toBeGreaterThan(mookMaxHp(1));
    expect(mookMaxHp(40)).toBe(MOOK_HP_CAP);
    expect(mookMaxHp(400)).toBe(MOOK_HP_CAP);
  });

  it('is monotonic — a later wave is never softer', () => {
    let prev = 0;
    for (let w = 1; w <= 60; w++) { const v = mookMaxHp(w); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
  });

  // THE POINT OF THE FILE.
  it('keeps a crowd clearable: the cap is at most double the wave-1 pool', () => {
    expect(MOOK_HP_CAP).toBeLessThanOrEqual(HITS_AT_WAVE_1 * 2);
  });
});

describe('MookHealth — damage', () => {
  it('rewards the heavier strike, in order', () => {
    expect(HIT_DAMAGE.light).toBeLessThan(HIT_DAMAGE.medium);
    expect(HIT_DAMAGE.medium).toBeLessThan(HIT_DAMAGE.heavy);
    expect(HIT_DAMAGE.heavy).toBeLessThan(HIT_DAMAGE.finisher);
  });

  it('lets a finisher drop a wave-1 body outright — that is what a finisher is for', () => {
    expect(damageMook(mookMaxHp(1), 'finisher')).toBe(0);
  });

  it('makes launching worth a follow-up rather than decoration', () => {
    const hp = mookMaxHp(3);
    expect(damageMook(hp, 'light', true)).toBeLessThan(damageMook(hp, 'light', false));
    expect(LAUNCH_BONUS_MULT).toBeGreaterThan(1);
  });

  it('floors at zero rather than going negative', () => {
    expect(damageMook(0.2, 'heavy')).toBe(0);
    expect(damageMook(0, 'light')).toBe(0);
  });

  it('treats an unknown weight as a light hit rather than as zero damage', () => {
    expect(damageMook(3, 'nonsense' as 'light')).toBe(3 - HIT_DAMAGE.light);
  });

  it('actually takes three lights to drop a wave-1 body', () => {
    let hp = mookMaxHp(1);
    for (let i = 0; i < HITS_AT_WAVE_1 - 1; i++) { hp = damageMook(hp, 'light'); expect(hp).toBeGreaterThan(0); }
    expect(damageMook(hp, 'light')).toBe(0);
  });
});

describe('MookHealth — the bar', () => {
  it('reads 0..1 and never outside it', () => {
    expect(mookHp01(3, 3)).toBe(1);
    expect(mookHp01(0, 3)).toBe(0);
    expect(mookHp01(-2, 3)).toBe(0);
    expect(mookHp01(9, 3)).toBe(1);
  });

  it('survives a zero pool rather than dividing by it', () => {
    expect(mookHp01(1, 0)).toBe(0);
  });

  it('goes green to amber to red, and never the same colour twice in a row', () => {
    const cols = [mookBarHex(1), mookBarHex(0.5), mookBarHex(0.1)];
    expect(new Set(cols).size).toBe(3);
  });
});
