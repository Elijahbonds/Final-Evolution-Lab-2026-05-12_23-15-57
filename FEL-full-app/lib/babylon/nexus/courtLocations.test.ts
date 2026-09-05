import { describe, expect, it } from 'vitest';
import { applyLocation, BASKETBALL_SPEC_IDS, COURT_LOCATIONS, COURT_LOCATION_IDS, isCourtLocationId, readyCourtLocations } from './courtLocations';
import { specFor } from './venueSpecs';

describe('court locations — the environment half swaps, the court half never moves', () => {
  it('Venice and unknown ids are the identity — the same spec object comes back', () => {
    for (const id of BASKETBALL_SPEC_IDS) {
      const spec = specFor(id)!;
      expect(applyLocation(spec, 'venice')).toBe(spec);
      expect(applyLocation(spec, undefined)).toBe(spec);
      expect(applyLocation(spec, 'nowhere')).toBe(spec);
    }
  });

  it('a non-basketball spec is never changed', () => {
    const dojo = specFor('karate_endless')!;
    expect(applyLocation(dojo, 'blossom')).toBe(dojo);
  });

  it('Blossom Park keeps the court, hoop, banner, crowd, actors and camera and replaces the environment and dressing', () => {
    const spec = specFor('basketball_dunk')!;
    const out = applyLocation(spec, 'blossom');
    expect(out).not.toBe(spec);
    expect(out.ground).toEqual(spec.ground);
    expect(out.actors).toEqual(spec.actors);
    expect(out.camera).toEqual(spec.camera);
    const courtKinds = ['hoop', 'backboardPole', 'net', 'banner', 'crowdTier'];
    const court = spec.props.filter((p) => courtKinds.includes(p.kind));
    expect(court.length).toBeGreaterThan(0);
    for (const p of court) expect(out.props).toContainEqual(p);
    expect(out.props.some((p) => p.kind === 'palm')).toBe(false);      // the beach dressing is gone
    expect(out.environment).toEqual(COURT_LOCATIONS.blossom.environment);
    expect(out.environment.backdrop).toBe('city');
    expect(out.mapKey).toBeUndefined();                              // the scanned Venice map (its palms, its walls) is not mounted under a location
    // the authored spec is untouched (no mutation)
    expect(spec.props.some((p) => p.kind === 'palm')).toBe(true);
  });

  it('ones and threes drop the scanned court map under a location and keep their own court', () => {
    for (const id of ['basketball_h2h', 'basketball_3v3']) {
      const spec = specFor(id)!;
      const out = applyLocation(spec, 'blossom');
      expect(out.mapKey).toBeUndefined();
      expect(out.ground).toEqual(spec.ground);
      expect(out.props.filter((p) => p.kind === 'hoop')).toEqual(spec.props.filter((p) => p.kind === 'hoop'));
    }
  });

  it('every location id is typed, and only ready ones reach the picker', () => {
    for (const id of COURT_LOCATION_IDS) expect(isCourtLocationId(id)).toBe(true);
    expect(isCourtLocationId('mars')).toBe(false);
    const ready = readyCourtLocations().map((l) => l.id);
    expect(ready).toContain('venice');
    expect(ready).toContain('blossom');
    for (const id of ready) expect(COURT_LOCATIONS[id].ready).toBe(true);
  });
});
