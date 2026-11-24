import { describe, expect, it } from 'vitest';
import { courtAniso, courtDetailOn, COURT_DETAIL_V2, COURT_DETAIL_ANISO } from './CourtSurface';

// look pass B3, part 1 (look-venues, 2026-11-24): venue.courtDetailV2 — the court and ground textures' anisotropic filtering.
describe('venue.courtDetailV2', () => {
  it('ships off, and off keeps every texture at its shipped level (the court 4, Babylon\'s default; the ground 8)', () => {
    expect(COURT_DETAIL_V2).toBe(0);
    expect(courtDetailOn()).toBe(false);
    expect(courtAniso(4)).toBe(4);
    expect(courtAniso(8)).toBe(8);
  });
  it('on: 16x, never lower than a texture already had', () => {
    expect(courtAniso(4, true)).toBe(COURT_DETAIL_ANISO);
    expect(courtAniso(8, true)).toBe(16);
    expect(courtAniso(32, true)).toBe(32);
  });
  it('every court and Venice ground texture the knob names reads it', async () => {
    const { readFileSync } = await import('node:fs');
    const court = readFileSync('lib/babylon/visual/CourtSurface.ts', 'utf8'), vb = readFileSync('lib/babylon/nexus/veniceBoardwalk.ts', 'utf8');
    expect(court.match(/anisotropicFilteringLevel = courtAniso\(/g)?.length).toBe(2);
    expect(vb.match(/anisotropicFilteringLevel = courtAniso\(8\)/g)?.length).toBe(2);
  });
});
