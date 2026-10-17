// models pass phase 7 (2026-09-22): a mode with a CAST draws its rivals and crowd from the cast; a mode without one draws
// from the whole roster; the seed still spreads the picks so a field never repeats a look.
import { describe, expect, it } from 'vitest';
import { ATHLETE_ROSTER, DEFAULT_HERO_URL, MODE_CAST, RETIRED_ATHLETES, rosterUrlFor, rosterBodyUrl, takeRivalRotation } from './athleteRoster';

describe('MODE_CAST (the Meshy 22)', () => {
  it('every cast key is a roster body and every cast body exists on disk by name', () => {
    const keys = new Set(ATHLETE_ROSTER.map((a) => a.key));
    for (const [mode, cast] of Object.entries(MODE_CAST)) {
      expect(cast.length, mode).toBeGreaterThan(0);
      for (const k of cast) expect(keys.has(k), `${mode}: ${k}`).toBe(true);
    }
  });
  it('a cast mode picks only from its cast, spread over the seeds', () => {
    const cast = new Set(MODE_CAST.skateboard.map((k) => ATHLETE_ROSTER.find((a) => a.key === k)!.url));
    const picks = new Set<string>();
    for (let i = 0; i < 40; i++) { const u = rosterUrlFor(DEFAULT_HERO_URL, `opponent-${i}`, 'skateboard'); expect(u && cast.has(u), `seed ${i} -> ${u}`).toBe(true); picks.add(u!); }
    expect(picks.size).toBeGreaterThan(1);
  });
  it('a mode without a cast, or no mode, draws from the whole roster as before', () => {
    const all = new Set(ATHLETE_ROSTER.map((a) => a.url));
    for (let i = 0; i < 12; i++) {
      expect(all.has(rosterUrlFor(DEFAULT_HERO_URL, `opponent-${i}`, 'story')!)).toBe(true);
      expect(rosterUrlFor(DEFAULT_HERO_URL, `opponent-${i}`)).toBe(rosterUrlFor(DEFAULT_HERO_URL, `opponent-${i}`, null));
    }
  });
  it('a specific body request is never re-cast', () => {
    expect(rosterUrlFor('/models/athletes/flint.glb', 'opponent-1', 'skateboard')).toBeNull();
  });
});

// THE RIVAL ALTERNATES (owner, 2026-10-05: "make sure the rival that you play against alternates and it's not the same
// person each time"). The pick used to be a pure hash of the seed, so `opponent-0`, the first rival of every match,
// was the same body in every match, in every mode, forever. One rotation per match now shifts the pick.
describe('the rival alternates from one match to the next', () => {
  it('in every mode with a cast, consecutive matches never open on the same rival', () => {
    for (const [mode, cast] of Object.entries(MODE_CAST)) {
      if (cast.length < 2) continue;
      for (let r = 0; r < 30; r++) {
        const a = rosterUrlFor(DEFAULT_HERO_URL, 'opponent-0', mode, r);
        const b = rosterUrlFor(DEFAULT_HERO_URL, 'opponent-0', mode, r + 1);
        expect(a, `${mode} rotation ${r}`).not.toBe(b);
      }
    }
  });
  it('without a cast, consecutive matches never open on the same rival either', () => {
    for (let r = 0; r < 60; r++) expect(rosterUrlFor(DEFAULT_HERO_URL, 'opponent-0', null, r)).not.toBe(rosterUrlFor(DEFAULT_HERO_URL, 'opponent-0', null, r + 1));
  });
  it('a full lap of rotations meets every body in the cast, not two of them on repeat', () => {
    for (const [mode, cast] of Object.entries(MODE_CAST)) {
      const met = new Set<string>();
      for (let r = 0; r < cast.length; r++) met.add(rosterUrlFor(DEFAULT_HERO_URL, 'opponent-0', mode, r)!);
      expect(met.size, mode).toBe(new Set(cast).size);
    }
  });
  it('within one match the pick is stable, and bodies that were distinct stay distinct', () => {
    for (const r of [0, 1, 7, 123]) {
      expect(rosterUrlFor(DEFAULT_HERO_URL, 'opponent-1', 'threevthree', r)).toBe(rosterUrlFor(DEFAULT_HERO_URL, 'opponent-1', 'threevthree', r));
      const plain = new Set([0, 1, 2].map((i) => rosterUrlFor(DEFAULT_HERO_URL, `opponent-${i}`, 'threevthree', 0)));
      const shifted = new Set([0, 1, 2].map((i) => rosterUrlFor(DEFAULT_HERO_URL, `opponent-${i}`, 'threevthree', r)));
      expect(shifted.size).toBe(plain.size);
    }
  });
  it('takeRivalRotation advances every match, and never throws without storage', () => {
    const a = takeRivalRotation(), b = takeRivalRotation(), c = takeRivalRotation();
    expect(b).toBe(a + 1); expect(c).toBe(b + 1);
  });
  it('a bad rotation value never breaks a spawn', () => {
    for (const bad of [NaN, -5, Infinity]) expect(rosterUrlFor(DEFAULT_HERO_URL, 'opponent-0', 'dunk', bad)).toBeTruthy();
  });
});

// RETIRED BODIES ARE NEVER DEALT (asset-polish, 2026-10-05). Eleven bodies tear or spike when they move (measured in
// athleteRoster.ts). Taking them off the roster is the fix; this is what stops one coming back through a cast, a named
// pick, or the uncast pool that six modes draw from.
describe('a retired body is never dealt', () => {
  const retired = Object.keys(RETIRED_ATHLETES);
  it('the retired list carries its measured reasons, and none of them is on the roster', () => {
    expect(retired.length).toBeGreaterThan(0);
    for (const k of retired) { expect(RETIRED_ATHLETES[k]).toMatch(/torn|spike/); expect(ATHLETE_ROSTER.map((a) => a.key), k).not.toContain(k); }
  });
  it('no mode cast names one', () => {
    for (const [mode, cast] of Object.entries(MODE_CAST)) for (const k of cast) expect(retired, `${mode} casts ${k}`).not.toContain(k);
  });
  it('no seed, rotation or mode ever spawns one, cast or uncast', () => {
    const bad = new Set(retired.map((k) => `/models/athletes/${k}.glb`));
    for (const mode of [null, 'aeroaces', 'derby', 'penalty', ...Object.keys(MODE_CAST)]) {
      for (let r = 0; r < 40; r++) for (let i = 0; i < 6; i++) {
        const u = rosterUrlFor(DEFAULT_HERO_URL, `opponent-${i}`, mode, r);
        expect(bad.has(u!), `${mode} r${r} opponent-${i} -> ${u}`).toBe(false);
      }
    }
  });
  it('asking for a retired body by name falls back instead of loading it', () => {
    for (const k of retired) expect(rosterBodyUrl(k)).toBeNull();
  });
});

// ASSET-POLISH (2026-10-05): rotation is only worth something if there is someone to rotate to. A one-body cast (soccer,
// who-scene-it) was the same face every match, and a two-body one (dunk, duel, showdown, football, snowboard) a flip-flop.
describe('every rival cast has people to rotate through', () => {
  it('no cast is smaller than three, and no cast lists a body twice', () => {
    for (const [mode, cast] of Object.entries(MODE_CAST)) {
      expect(cast.length, `${mode} cast`).toBeGreaterThanOrEqual(3);
      expect(new Set(cast).size, `${mode} lists a body twice`).toBe(cast.length);
    }
  });
});

// THE FORGE RIVALS REPLACE THE MESHY BODIES (owner, 2026-10-16: "replace them all but my own"). The Meshy bodies tear (their
// weights are a nearest-vertex transfer) and carry no garment slot; the forge rivals are MPFB2 bodies on our own rig.
import { REPLACED_MESHY } from './athleteRoster';
import { existsSync, readFileSync } from 'node:fs';
describe('the forge rivals (2026-10-16)', () => {
  it('every roster body is a forge rival under /models/rivals/, on disk with its manifest saying where it came from', () => {
    expect(ATHLETE_ROSTER.length).toBeGreaterThanOrEqual(20);
    for (const a of ATHLETE_ROSTER) {
      expect(a.url, a.key).toBe(`/models/rivals/${a.key}.glb`);
      expect(existsSync(`public${a.url}`), a.url).toBe(true);
      const m = JSON.parse(readFileSync(`public/models/rivals/${a.key}.json`, 'utf8')) as { source: string; builtAtSpawn: boolean; athlete: string };
      expect(m.source, a.key).toMatch(/^MPFB2/); expect(m.builtAtSpawn).toBe(true); expect(m.athlete).toBe(a.key);
    }
  });
  it('no Meshy body is dealt: not on the roster, not in a cast, not by name, not by any seed or rotation', () => {
    expect(REPLACED_MESHY.length).toBe(29);
    const keys = ATHLETE_ROSTER.map((a) => a.key);
    for (const k of REPLACED_MESHY) { expect(keys, k).not.toContain(k); expect(rosterBodyUrl(k), k).toBeNull(); }
    for (const [mode, cast] of Object.entries(MODE_CAST)) for (const k of cast) expect(REPLACED_MESHY, `${mode} casts ${k}`).not.toContain(k);
    for (const mode of [null, 'aeroaces', 'derby', 'penalty', ...Object.keys(MODE_CAST)]) for (let r = 0; r < 30; r++) for (let i = 0; i < 6; i++) {
      expect(rosterUrlFor(DEFAULT_HERO_URL, `opponent-${i}`, mode, r), `${mode} r${r}`).toMatch(/^\/models\/rivals\//);
    }
  });
  it('the owner\'s own hero is not a roster body and is unchanged', () => {
    expect(DEFAULT_HERO_URL).toBe('/models/elijah-meshy.glb');
    expect(ATHLETE_ROSTER.map((a) => a.url)).not.toContain(DEFAULT_HERO_URL);
  });
  it('a 3v3 team (one jersey tint) gets one person per spot: the spot seeds the pick, so three teammates are three bodies', () => {
    const picks = new Set(['-4.5,-0.8', '0.0,-1.9', '4.5,-3.0'].map((p) => rosterUrlFor(DEFAULT_HERO_URL, `#ff2d78@${p}`, 'threevthree', 0)));
    expect(picks.size).toBeGreaterThanOrEqual(2);
  });
});
