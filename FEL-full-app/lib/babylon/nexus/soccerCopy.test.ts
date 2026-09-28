// QA P1-17 (2026-09-27): Twelve Yards said "the stadium at night" over a dusk sky with glass down the touchlines (the QA's
// "sunset cage"). [DECISION-EJ] default: the copy follows what renders; the lighting is unchanged.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { looksFor } from './placeLooks';
import { MODE_MENU_META } from '../../mode-menu';

describe('the shootout\'s copy matches its scene', () => {
  it('the venue it renders is lit at dusk (the spec), with the Breakaway glass (the mode)', () => {
    const specs = readFileSync(path.resolve(__dirname, 'venueSpecs.ts'), 'utf8');
    expect(specs.slice(specs.indexOf('  penalty: {'), specs.indexOf('  football_rush: {'))).toMatch(/environment: dusk\(/);
    expect(readFileSync(path.resolve(__dirname, '../modes/precisionModes.ts'), 'utf8')).toContain('buildGlass(ctx);   // BREAKAWAY: the side glass');
  });

  it('the home place and the menu line say dusk, never night or lights', () => {
    const home = looksFor('penalty').find((l) => l.id === 'home')!;
    expect(home.sub).toMatch(/DUSK/);
    expect(home.sub).not.toMatch(/NIGHT/);
    expect(MODE_MENU_META.soccer.desc).toMatch(/dusk/);
    expect(MODE_MENU_META.soccer.desc).not.toMatch(/night|lights/i);
  });
});
