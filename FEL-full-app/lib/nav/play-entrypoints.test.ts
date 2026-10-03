import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODE_INFO, VENUES } from '../game-data';
import { DOORS } from './doors';

const ROOT = join(__dirname, '..', '..');

describe('Play entrypoints', () => {
  it('links current UI fallbacks to the Play shelf instead of the legacy /modes redirect', () => {
    expect(DOORS.find((door) => door.label === 'All modes')?.href).toBe('/play');

    const fallbackFiles = [
      'components/games/in-development.tsx',
      'components/education-view.tsx',
      'app/training/page.tsx',
      'app/play/calibrate/_components/calibrate-client.tsx',
      'app/api/arena/quick-match/route.ts',
    ];

    for (const file of fallbackFiles) {
      const src = readFileSync(join(ROOT, file), 'utf8');
      expect(src, `${file} should not route active UI to the redirect-only /modes page`).not.toContain("'/modes'");
      expect(src, `${file} should not route active UI to the redirect-only /modes page`).not.toContain('"/modes"');
    }
  });

  it('gives every advertised multi-mode venue a direct launch target per mode', () => {
    const knownHrefs = new Set(Object.values(MODE_INFO).map((mode) => mode.href));

    for (const venue of VENUES) {
      expect(venue.href, venue.key).not.toBe('/modes');
      for (const link of venue.modeLinks ?? []) {
        expect(link.href, `${venue.key}:${link.label}`).not.toBe('/modes');
        expect(knownHrefs.has(link.href), `${venue.key}:${link.label} should launch a known mode`).toBe(true);
      }

      if (venue.modeLinks) {
        expect(venue.modeLinks.map((link) => link.label), `${venue.key} explicit launch links`).toEqual(venue.modes);
      }
    }

    expect(VENUES.find((venue) => venue.key === 'dojo')?.modeLinks?.map((link) => link.href)).toEqual([
      '/play/karate',
      '/play/karate-vs',
    ]);
    expect(VENUES.find((venue) => venue.key === 'venicebeach')?.modeLinks?.map((link) => link.href)).toEqual([
      '/play/dunk',
      '/play/onevone',
      '/play/threevthree',
    ]);
  });
});
