// QA P1-16 (2026-09-27): Duel's header subtitle read "Shimogamo Dojo" while the fight was on a rooftop. The Duel never
// fights in a dojo: its arenas are the cage, the pit, the rooftop and the cliff. The header names the one that loads.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { arenasFor, duelVenueName } from './arenas';

describe('the Duel names its arena', () => {
  it('the default is the Duel\'s first arena; a pick is named as picked', () => {
    const duel = arenasFor('duel');
    expect(duelVenueName(null)).toBe(duel[0].name);
    const roof = duel.find((a) => a.id === 'rooftop')!;
    expect(duelVenueName(roof)).toBe('Rooftop');
    expect(duelVenueName()).toBe(duel[0].name);   // no window here: readCombatArena's default
  });

  it('no Duel arena is a dojo, and the loader no longer says one', () => {
    for (const a of arenasFor('duel')) expect(a.name).not.toMatch(/Shimogamo|Dojo/);
    const loader = readFileSync(path.resolve(__dirname, '../../../app/play/duel/_components/loader.tsx'), 'utf8');
    expect(loader).not.toContain('venue="Shimogamo Dojo"');
    expect(loader).toContain('venue={venue}');
  });
});
