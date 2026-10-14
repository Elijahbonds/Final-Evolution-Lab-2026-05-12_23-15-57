// vis-hoops-dunk — the pure half of the rim's light and the fire: tiers, fire levels, eases, the colour mix.
import { describe, expect, it } from 'vitest';
import { FIRE_STREAK } from '../core/shootoutHud';
import { MAKE_LOOK, easeToward, fireLevel, flameRate, mixHex, tierFromAccuracy, tierFromShot, type MakeTier } from './hoopsLook';

describe('a dunk\'s tier from the slam\'s accuracy', () => {
  it('soft below half, sweet from half, big from 0.85, a hang earns big from 0.6', () => {
    expect(tierFromAccuracy(0)).toBe('soft');
    expect(tierFromAccuracy(0.49)).toBe('soft');
    expect(tierFromAccuracy(0.5)).toBe('sweet');
    expect(tierFromAccuracy(0.84)).toBe('sweet');
    expect(tierFromAccuracy(0.85)).toBe('big');
    expect(tierFromAccuracy(1)).toBe('big');
    expect(tierFromAccuracy(0.6, true)).toBe('big');
    expect(tierFromAccuracy(0.55, true)).toBe('sweet');
  });
  it('a nonsense accuracy is a soft make, never a throw', () => {
    expect(tierFromAccuracy(NaN)).toBe('soft');
    expect(tierFromAccuracy(-3)).toBe('soft');
    expect(tierFromAccuracy(9)).toBe('big');
  });
});

describe('a jump shot\'s tier', () => {
  it('the money ball is its own, a perfect release is big, the rest soft', () => {
    expect(tierFromShot({ perfect: false, money: true })).toBe('money');
    expect(tierFromShot({ perfect: true, money: true })).toBe('money');
    expect(tierFromShot({ perfect: true, money: false })).toBe('big');
    expect(tierFromShot({ perfect: false, money: false })).toBe('soft');
  });
});

describe('the make looks', () => {
  const tiers: MakeTier[] = ['soft', 'sweet', 'big', 'money'];
  it('every tier is bigger than the one before it (the ring, the sparks, the net)', () => {
    for (let i = 1; i < tiers.length; i++) {
      const a = MAKE_LOOK[tiers[i - 1]], b = MAKE_LOOK[tiers[i]];
      expect(b.ringReach, tiers[i]).toBeGreaterThan(a.ringReach);
      expect(b.sparks, tiers[i]).toBeGreaterThanOrEqual(a.sparks);
      expect(b.netGlow, tiers[i]).toBeGreaterThan(a.netGlow);
    }
  });
  it('colours are hex, a ring never reaches into the stands, the net always dies', () => {
    for (const t of tiers) {
      const l = MAKE_LOOK[t];
      expect(l.ringHex).toMatch(/^#[0-9a-f]{6}$/i);
      if (l.sparkHex) expect(l.sparkHex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(l.ringReach).toBeLessThan(3);
      expect(l.netSec).toBeGreaterThan(0);
      expect(l.netSec).toBeLessThan(2);
    }
  });
});

describe('the fire', () => {
  it('embers one make short of the streak, flames at it and past it, nothing before', () => {
    expect(fireLevel(0, FIRE_STREAK)).toBe(0);
    expect(fireLevel(FIRE_STREAK - 2, FIRE_STREAK)).toBe(0);
    expect(fireLevel(FIRE_STREAK - 1, FIRE_STREAK)).toBe(1);
    expect(fireLevel(FIRE_STREAK, FIRE_STREAK)).toBe(2);
    expect(fireLevel(FIRE_STREAK + 7, FIRE_STREAK)).toBe(2);
  });
  it('a streak that cannot light it (no threshold, a nonsense streak) is no fire', () => {
    expect(fireLevel(5, 0)).toBe(0);
    expect(fireLevel(NaN, 3)).toBe(0);
    expect(fireLevel(-1, 3)).toBe(0);
  });
  it('flames: none at level 0, more on fire than in embers, half as many on a phone', () => {
    expect(flameRate(0, 'desktop')).toBe(0);
    expect(flameRate(2, 'desktop')).toBeGreaterThan(flameRate(1, 'desktop'));
    expect(flameRate(2, 'mobile')).toBe(flameRate(2, 'desktop') / 2);
    expect(flameRate(1, undefined)).toBe(flameRate(1, 'desktop'));
  });
});

describe('easeToward and mixHex', () => {
  it('eases toward the target without passing it, and lands on it', () => {
    let v = 0;
    for (let i = 0; i < 400; i++) { const n = easeToward(v, 1, 14, 1 / 60); expect(n).toBeGreaterThanOrEqual(v); expect(n).toBeLessThanOrEqual(1); v = n; }
    expect(v).toBe(1);
    expect(easeToward(1, 0, 14, 0)).toBe(1);   // no time, no move
  });
  it('mixes two colours, clamps k, and takes a bad colour as white', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#ff0000', '#0000ff', 0)).toBe('#ff0000');
    expect(mixHex('#ff0000', '#0000ff', 9)).toBe('#0000ff');
    expect(mixHex('nope', '#000000', 1)).toBe('#000000');
  });
});
