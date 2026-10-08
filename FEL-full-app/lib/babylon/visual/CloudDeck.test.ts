// CLOUD DECK pins (10-phase pass, phase 6, 2026-10-03): the layout is the whole contract — deterministic,
// inside its band, and spread wide enough that riding the camera never shows the deck's edge.

import { describe, expect, it } from 'vitest';
import { cloudDeckFor } from './CloudDeck';

describe('cloudDeckFor', () => {
  it('is deterministic for a seed', () => {
    expect(cloudDeckFor(7, 30, 1600, 120, 220)).toEqual(cloudDeckFor(7, 30, 1600, 120, 220));
    expect(cloudDeckFor(8, 30, 1600, 120, 220)).not.toEqual(cloudDeckFor(7, 30, 1600, 120, 220));
  });

  it('lays out the asked count, every puff inside the span and the height band', () => {
    const deck = cloudDeckFor(5, 30, 2600, 140, 260);
    expect(deck).toHaveLength(30);
    for (const c of deck) {
      expect(Math.abs(c.x)).toBeLessThanOrEqual(1300);
      expect(Math.abs(c.z)).toBeLessThanOrEqual(1300);
      expect(c.y).toBeGreaterThanOrEqual(140);
      expect(c.y).toBeLessThanOrEqual(260);
      expect(c.scale).toBeGreaterThanOrEqual(16);
      expect(c.scale).toBeLessThanOrEqual(40);
    }
  });

  it('spreads across the whole span — a deck clumped in one corner reads as a single smudge from the air', () => {
    const deck = cloudDeckFor(11, 26, 1600, 120, 220);
    const xs = deck.map((c) => c.x), zs = deck.map((c) => c.z);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(800);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(800);
  });

  it('alternates the two puff masters so the sky is not one shape stamped thirty times', () => {
    const deck = cloudDeckFor(5, 10, 1600, 120, 220);
    expect(deck.filter((c) => c.lobe === 0)).toHaveLength(5);
    expect(deck.filter((c) => c.lobe === 1)).toHaveLength(5);
  });
});
