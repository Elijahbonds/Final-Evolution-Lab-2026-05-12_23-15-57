// A NIGHT PLACE DOES NOT SIT UNDER A SUNSET PHOTOGRAPH (w3-atmos).
//
// The 'neon' baked dome (public/backdrops/baked/neon.jpg) is mis-named: it is the Venice skatepark at golden hour (the bake's
// own manifest says source: skateboarding.jpg; DanceMode's comment says [ART]). A spec venue loads it OVER its painted sky,
// so `?place=neon-block` (nightGame light, a rooftop "at night") and the Neon Cage stood under a sunset with palms. A look
// that is a night opts out of the photograph with `paintedSky`: the painted horizon (a night sky, stars, the neon pylons)
// is the sky. This pins the propagation and holds every night look that names the 'neon' backdrop to it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applyArena, applyLook } from '../core/NexusVenue';
import { COMBAT_ARENAS, arenasFor } from '../combat/arenas';
import { PLACE_LOOKS } from './placeLooks';
import { ARENA_MOOD, PLACE_MOOD } from '../scene/moodResolver';
import { VENUE_SPECS } from './venueSpecs';

const spec = () => structuredClone(VENUE_SPECS.court_carnival);

describe('paintedSky travels from the look to the venue environment', () => {
  it('a place look with paintedSky sets it on the spec; one without leaves the spec as authored', () => {
    const night = PLACE_LOOKS.carnival.find((l) => l.id === 'neon-block')!;
    const day = PLACE_LOOKS.carnival.find((l) => l.id === 'boardwalk')!;
    expect(applyLook(spec(), night).environment.paintedSky).toBe(true);
    expect(applyLook(spec(), day).environment.paintedSky).toBeUndefined();
    expect(applyLook(spec(), PLACE_LOOKS.carnival[0]).environment.paintedSky).toBeUndefined();
  });
  it('an arena look with paintedSky sets it; the others do not', () => {
    const cage = arenasFor('karate_vs').find((a) => a.id === 'cage')!;
    const dojo = arenasFor('karate_vs').find((a) => a.id === 'dojo')!;
    expect(applyArena(spec(), cage).environment.paintedSky).toBe(true);
    expect(applyArena(spec(), dojo).environment.paintedSky).toBeFalsy();
  });
});

describe('every night look that names the neon bake opts out of it', () => {
  it('place looks: a nightGame look on backdrop neon has paintedSky', () => {
    const found: string[] = [];
    for (const [key, list] of Object.entries(PLACE_LOOKS)) for (const l of list) {
      if (PLACE_MOOD[key]?.[l.id] === 'nightGame' && l.backdrop === 'neon') { found.push(`${key}/${l.id}`); expect(l.paintedSky, `${key}/${l.id}`).toBe(true); }
    }
    expect(found.sort()).toEqual(['brainbrawl/arcade-night', 'carnival/neon-block', 'dance/neon-club', 'football/dome-night']);   // the ledger: a new night look on neon joins it
  });
  it('arenas: a nightGame arena on backdrop neon has paintedSky', () => {
    const found: string[] = [];
    for (const a of COMBAT_ARENAS) if ((ARENA_MOOD[a.id] ?? a.look.mood) === 'nightGame' && a.look.backdrop === 'neon') { found.push(a.id); expect(a.look.paintedSky, a.id).toBe(true); }
    expect(found).toEqual(['cage']);
  });
  it('the venue honours it: the baked dome is not loaded over a painted sky', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'NexusWebScene.ts'), 'utf8');
    expect(src).toMatch(/else if \(useBackdrop && !env\.paintedSky\) \{\s*const baked = new Texture\(/);
  });
  it('a look the owner has seen under the photograph keeps it: home, boardwalk and the other daytime looks are untouched', () => {
    for (const [key, list] of Object.entries(PLACE_LOOKS)) for (const l of list) {
      if (PLACE_MOOD[key]?.[l.id] !== 'nightGame') expect(l.paintedSky, `${key}/${l.id}`).toBeUndefined();
    }
  });
});
