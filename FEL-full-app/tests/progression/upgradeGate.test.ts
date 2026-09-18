// FEL PRO gate (2026-09-12). The rules a paying product must not get wrong.
import { describe, it, expect } from 'vitest';
import {
  gateAttributes, hasPausedUpgrades, upgradeStatusLine, hasActivePro,
  FEL_PRO_WEEKLY_USD,
} from '../../lib/progression/upgradeGate';

const base = { speed: 50, strength: 50, agility: 50 };
const earned = { speed: 62, strength: 55, agility: 50 };

describe('a subscriber gets everything they earned', () => {
  it('applies the full earned profile', () => {
    const r = gateAttributes({ base, earned, hasPro: true });
    expect(r.effective).toEqual(earned);
    expect(r.upgradesActive).toBe(true);
    expect(r.pausedPoints).toBe(0);
  });
});

describe('a free player keeps their scan, and plays', () => {
  it('falls back to the scanned base, not to zero', () => {
    const r = gateAttributes({ base, earned, hasPro: false });
    expect(r.effective).toEqual({ speed: 50, strength: 50, agility: 50 });
  });

  it('reports exactly what is paused, per attribute', () => {
    const r = gateAttributes({ base, earned, hasPro: false });
    expect(r.detail.speed.paused).toBe(12);
    expect(r.detail.strength.paused).toBe(5);
    expect(r.detail.agility.paused).toBe(0);
    expect(r.pausedPoints).toBe(17);
  });

  it('NEVER destroys what was earned — the stored profile is untouched', () => {
    const stored = { ...earned };
    gateAttributes({ base, earned: stored, hasPro: false });
    expect(stored).toEqual(earned);          // the gate did not mutate it
  });

  it('resubscribing restores the exact profile, because nothing was burned', () => {
    const off = gateAttributes({ base, earned, hasPro: false });
    const on = gateAttributes({ base, earned, hasPro: true });
    expect(off.effective.speed).toBe(50);
    expect(on.effective.speed).toBe(62);     // back, in full
  });
});

describe('the gate can never be farmed', () => {
  it('never GRANTS points — a decayed player is not topped up to base', () => {
    const decayed = { speed: 41, strength: 50, agility: 50 };
    const r = gateAttributes({ base, earned: decayed, hasPro: false });
    expect(r.effective.speed).toBe(41);      // the lower real number, not 50
    expect(r.detail.speed.paused).toBe(0);
  });

  it('being unsubscribed is never an advantage', () => {
    const decayed = { speed: 41, strength: 50, agility: 50 };
    const free = gateAttributes({ base, earned: decayed, hasPro: false });
    const paid = gateAttributes({ base, earned: decayed, hasPro: true });
    for (const k of Object.keys(free.effective)) {
      expect(free.effective[k]).toBeLessThanOrEqual(paid.effective[k]);
    }
  });

  it('handles a missing or malformed attribute without inventing one', () => {
    const r = gateAttributes({ base: { speed: 50 }, earned: { speed: NaN as unknown as number, power: 70 }, hasPro: false });
    expect(Number.isFinite(r.effective.speed)).toBe(true);
    expect(r.effective.power).toBe(0);       // no base to stand on, and the gate does not invent one
  });
});

describe('what the player is told', () => {
  it('does not cry missed-opportunity at someone with nothing paused', () => {
    const r = gateAttributes({ base, earned: base, hasPro: false });
    expect(hasPausedUpgrades(r)).toBe(false);
    expect(upgradeStatusLine(r)).not.toMatch(/paused/);
  });

  it('says plainly that paused upgrades are still saved', () => {
    const r = gateAttributes({ base, earned, hasPro: false });
    expect(hasPausedUpgrades(r)).toBe(true);
    const line = upgradeStatusLine(r);
    expect(line).toMatch(/still saved/);
    expect(line).toContain(String(FEL_PRO_WEEKLY_USD));
  });

  it('confirms the price is the single source of truth', () => {
    expect(FEL_PRO_WEEKLY_USD).toBe(6);
  });
});

describe('reading the subscription', () => {
  it('only an ACTIVE FEL_PRO counts', () => {
    expect(hasActivePro([{ product: 'FEL_PRO', status: 'ACTIVE' }])).toBe(true);
    expect(hasActivePro([{ product: 'FEL_PRO', status: 'CANCELED' }])).toBe(false);
    expect(hasActivePro([{ product: 'STUDIO_CREATOR', status: 'ACTIVE' }])).toBe(false);
    expect(hasActivePro([])).toBe(false);
    expect(hasActivePro(null)).toBe(false);
  });
});
