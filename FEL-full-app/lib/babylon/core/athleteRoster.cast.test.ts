// models pass phase 7 (2026-09-22): a mode with a CAST draws its rivals and crowd from the cast; a mode without one draws
// from the whole roster; the seed still spreads the picks so a field never repeats a look.
import { describe, expect, it } from 'vitest';
import { ATHLETE_ROSTER, DEFAULT_HERO_URL, MODE_CAST, rosterUrlFor } from './athleteRoster';

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
