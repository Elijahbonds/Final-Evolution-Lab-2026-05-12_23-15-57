// A deck is a cosmetic, so the bar is: it always exists, it never throws, and it never crosses disciplines.

import { describe, it, expect } from 'vitest';
import { BOARD_SKINS, skinsFor, boardSkinById, hexToRgb01, readBoardSkin } from './boardSkins';

describe('decks', () => {
  it('every discipline has decks to choose from', () => {
    for (const d of ['skate', 'snow', 'surf'] as const) expect(skinsFor(d).length).toBeGreaterThan(1);
  });

  it('a deck belongs to ONE discipline — a skate graphic on a surfboard is not a feature', () => {
    for (const d of ['skate', 'snow', 'surf'] as const) {
      for (const s of skinsFor(d)) expect(s.discipline).toBe(d);
    }
  });

  it('ids are unique and findable', () => {
    const ids = BOARD_SKINS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(boardSkinById(ids[0])?.id).toBe(ids[0]);
    expect(boardSkinById('nope')).toBeNull();
  });

  it('every deck has a label, a parseable tint and a line of its own', () => {
    for (const s of BOARD_SKINS) {
      expect(s.label).toMatch(/^[A-Z]+$/);
      expect(hexToRgb01(s.tint)).not.toEqual({ r: 1, g: 1, b: 1 });
      expect(s.sub.length).toBeGreaterThan(10);
      if (s.tint2) expect(hexToRgb01(s.tint2)).not.toEqual({ r: 1, g: 1, b: 1 });
    }
  });

  it('there is ALWAYS a deck — reading one never returns nothing', () => {
    for (const d of ['skate', 'snow', 'surf'] as const) expect(readBoardSkin(d)).toBeTruthy();
  });

  it('garbage colour returns white rather than throwing', () => {
    for (const bad of ['', 'red', '#ggg', '#12345']) {
      expect(() => hexToRgb01(bad)).not.toThrow();
      expect(hexToRgb01(bad)).toEqual({ r: 1, g: 1, b: 1 });
    }
  });
});

// The VENUES themselves are asserted in boardVenues.test.ts — size, light, palette and people. This file is
// about the DECKS.
