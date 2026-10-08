import { describe, expect, it } from 'vitest';
import { is3D, isBabylon } from './flags';

/**
 * WHICH RENDERER A MODE GETS. Twenty files import these two predicates, and getting one wrong does not throw — it
 * quietly serves the 2D deck to a player who should have had the Babylon build, which has happened in this repo
 * before (see the note beside brainbrawl in lib/babylon/modes/registry.ts).
 */
describe('renderer flags', () => {
  it('a known Babylon mode is Babylon, and an unknown string is not', () => {
    // NOTE the key vocabulary: these flags speak 'dunkContest', while the Babylon registry speaks 'dunk'. Two names
    // for one mode in two tables is the route-key-versus-mode-id trap this repo has been caught by before, and a
    // test that used the registry's spelling here would have quietly asserted 2D for the flagship mode.
    expect(isBabylon('dunkContest')).toBe(true);
    expect(isBabylon('velocityKart')).toBe(true);
    expect(isBabylon('aeroAces')).toBe(true);
    expect(isBabylon('not_a_mode')).toBe(false);
    expect(isBabylon('')).toBe(false);
    expect(isBabylon('dunk')).toBe(false);          // the registry's key is NOT this table's key
  });

  it('every shipped Babylon session key maps to a true renderer flag', () => {
    // A missing key here silently hands the route to its legacy/fallback renderer, or makes GameShell think Babylon
    // does not own input. Session keys are what <GameShell mode="..."> saves; flag keys are what loaders pass to
    // isBabylon(). They intentionally differ for the shared board host.
    const shippedBabylonRouteFlags: Record<string, string> = {
      aeroAces: 'aeroAces',
      baseball: 'baseball',
      bigAir: 'bigAir',
      brainBrawl: 'brainBrawl',
      carnival: 'carnival',
      dance: 'dance',
      duel: 'duel',
      dunkContest: 'dunkContest',
      dunkduel: 'dunkduel',
      football: 'football',
      freerun: 'freerun',
      golf: 'golf',
      hoops1v1: 'hoops1v1',
      hoops3v3: 'hoops3v3',
      karateEndless: 'karateEndless',
      karateVersus: 'karateVersus',
      mixedcombat: 'mixedcombat',
      showdown: 'showdown',
      skateboarding: 'skateboard',
      snowboarding: 'snowboard_slalom',
      soccer: 'soccer',
      sprint: 'sprint',
      surfing: 'surf',
      tennis: 'tennis',
      threePoint: 'threePoint',
      velocityKart: 'velocityKart',
      volleyball: 'volleyball',
      whoSceneIt: 'whoSceneIt',
    };

    for (const [sessionKey, flagKey] of Object.entries(shippedBabylonRouteFlags)) {
      expect(isBabylon(flagKey), `${sessionKey} -> ${flagKey}`).toBe(true);
    }
  });

  it('never answers yes on a prototype-chain key — the classic lookup-table hole', () => {
    for (const k of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      expect(isBabylon(k), k).toBe(false);
      expect(is3D(k), k).toBe(false);
    }
  });

  it('the kill switch turns EVERYTHING off, which is the point of a kill switch', () => {
    const prev = process.env.NEXT_PUBLIC_DISABLE_3D;
    process.env.NEXT_PUBLIC_DISABLE_3D = '1';
    try {
      expect(isBabylon('dunkContest')).toBe(false);
      expect(is3D('dunkContest')).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_DISABLE_3D;
      else process.env.NEXT_PUBLIC_DISABLE_3D = prev;
    }
  });

  it('only the exact value "1" disarms 3D — a stray truthy string must not blank the game', () => {
    const prev = process.env.NEXT_PUBLIC_DISABLE_3D;
    for (const v of ['0', 'false', 'true', 'yes', '']) {
      process.env.NEXT_PUBLIC_DISABLE_3D = v;
      expect(isBabylon('dunkContest'), `NEXT_PUBLIC_DISABLE_3D=${v}`).toBe(true);
    }
    if (prev === undefined) delete process.env.NEXT_PUBLIC_DISABLE_3D;
    else process.env.NEXT_PUBLIC_DISABLE_3D = prev;
  });
});
