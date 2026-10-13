// vis-hoops-dunk — the duel's accents: the rim light's tint for whoever has the floor, and the phones in the stands.
import { describe, expect, it } from 'vitest';
import { Color3 } from '@babylonjs/core';
import { BAND_TOTAL } from '../core/JudgePanel';
import { KICKER } from '../scene/KickerLight';
import { KICKER_PULL, kickerFor, phonesFor, tintKicker } from './duelAccents';

describe('the rim light\'s tint', () => {
  it('pulls the mood\'s own colour part of the way to the duellist\'s, never all of it', () => {
    const base = KICKER.goldenHour.color;
    const tinted = kickerFor('goldenHour', '#ff2d78');
    expect(tinted).not.toBe(base); expect(tinted).not.toBe('#ff2d78');
    const c = Color3.FromHexString(tinted), b = Color3.FromHexString(base), p = Color3.FromHexString('#ff2d78');
    for (const ch of ['r', 'g', 'b'] as const) { const lo = Math.min(b[ch], p[ch]), hi = Math.max(b[ch], p[ch]); expect(c[ch]).toBeGreaterThanOrEqual(lo - 1e-6); expect(c[ch]).toBeLessThanOrEqual(hi + 1e-6); }
    expect(KICKER_PULL).toBeGreaterThan(0); expect(KICKER_PULL).toBeLessThan(0.6);
  });
  it('each duellist\'s colour gives its own rim, and a hand-off back restores the first', () => {
    expect(kickerFor('goldenHour', '#22d3ee')).not.toBe(kickerFor('goldenHour', '#ff2d78'));
    expect(kickerFor('goldenHour', '#22d3ee')).toBe(kickerFor('goldenHour', '#22d3ee'));
  });
  it('writes the light\'s diffuse; a rig with no kicker (?look=legacy) is left alone', () => {
    const light = { diffuse: new Color3(1, 1, 1) };
    tintKicker({ mood: 'goldenHour', kicker: { light } }, '#ff2d78');
    expect(light.diffuse.r).toBeGreaterThan(0.9); expect(light.diffuse.b).toBeLessThan(0.9);
    expect(() => tintKicker({ mood: 'goldenHour', kicker: null }, '#ff2d78')).not.toThrow();
  });
});

describe('the phones', () => {
  it('more for a bigger make, more again for a wider gap, never a strobe', () => {
    const hush = phonesFor(30, BAND_TOTAL, 0), good = phonesFor(BAND_TOTAL.approval, BAND_TOTAL, 0), big = phonesFor(BAND_TOTAL.eruption, BAND_TOTAL, 0);
    expect(hush).toBeLessThan(good); expect(good).toBeLessThan(big);
    expect(phonesFor(BAND_TOTAL.approval, BAND_TOTAL, 20)).toBeGreaterThan(good);
    expect(phonesFor(50, BAND_TOTAL, 900)).toBeLessThanOrEqual(26);
  });
  it('a nonsense gap is none', () => {
    expect(phonesFor(40, BAND_TOTAL, NaN)).toBe(phonesFor(40, BAND_TOTAL, 0));
    expect(phonesFor(40, BAND_TOTAL, -5)).toBe(phonesFor(40, BAND_TOTAL, 0));
  });
});
