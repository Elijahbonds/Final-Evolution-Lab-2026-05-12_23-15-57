import { describe, expect, it } from 'vitest';
import { is3D, isBabylon } from './flags';
import { ENABLED_BABYLON_MODES } from '@/lib/babylon/modes/registry';

const ROUTE_FLAG_KEY_BY_REGISTRY_KEY: Readonly<Record<string, string>> = {
  dunk: 'dunkContest',
  karate: 'karateEndless',
  football: 'football',
  skateboard: 'skateboard',
  snowboard_slalom: 'snowboard_slalom',
  surf: 'surf',
  tennis: 'tennis',
  tiebreak: 'tiebreak',
  derby: 'baseball',
  penalty: 'soccer',
  golf: 'golf',
  onevone: 'hoops1v1',
  threevthree: 'hoops3v3',
  carnival: 'carnival',
  karate_vs: 'karateVersus',
  mixedcombat: 'mixedcombat',
  dunkduel: 'dunkduel',
  sprint: 'sprint',
  showdown: 'showdown',
  duel: 'duel',
  volleyball: 'volleyball',
  dance: 'dance',
  who_scene_it: 'whoSceneIt',
  freerun: 'freerun',
  threepoint: 'threePoint',
  bigair: 'bigAir',
  aeroaces: 'aeroAces',
  velocitykart: 'velocityKart',
  brainbrawl: 'brainBrawl',
};

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

  it('every enabled Babylon registry mode has a live route flag key', () => {
    const enabled = [...ENABLED_BABYLON_MODES];
    const unmapped = enabled.filter((registryKey) => !(registryKey in ROUTE_FLAG_KEY_BY_REGISTRY_KEY));
    expect(unmapped, `enabled mode has no route flag key: ${JSON.stringify(unmapped)}`).toEqual([]);

    const disabledRouteFlags = enabled
      .map((registryKey) => [registryKey, ROUTE_FLAG_KEY_BY_REGISTRY_KEY[registryKey]] as const)
      .filter(([, routeFlagKey]) => !isBabylon(routeFlagKey))
      .map(([registryKey, routeFlagKey]) => `${registryKey} -> ${routeFlagKey}`);
    expect(disabledRouteFlags, `enabled mode is not answered by isBabylon(): ${JSON.stringify(disabledRouteFlags)}`).toEqual([]);

    const staleMappings = Object.keys(ROUTE_FLAG_KEY_BY_REGISTRY_KEY).filter((registryKey) => !ENABLED_BABYLON_MODES.has(registryKey));
    expect(staleMappings, `route flag map names a disabled/missing mode: ${JSON.stringify(staleMappings)}`).toEqual([]);
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
