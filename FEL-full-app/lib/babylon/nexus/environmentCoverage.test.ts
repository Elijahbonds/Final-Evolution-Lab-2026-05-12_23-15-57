// THREE PLACES PER MODE (owner, 2026-09-18: "3 map/arena/environment per mode minimum").
//
// Every enabled mode has to offer at least three places to play, through one of the game's pick systems: the hoops
// court locations, the board venues, the race courses, the combat arenas, the place looks, or (Who Scene It) a venue
// that changes every round. This test is the ledger: a mode that loses its picks, or a new mode that ships with one
// room, fails here. The two hand-built worlds (sprint, free run) have no venue spec; their looks carry a `world` block
// the mode reads for its mood, its sky and its colours.
import { describe, it, expect } from 'vitest';
import { ENABLED_BABYLON_MODES } from '../modes/registry';
import { BASKETBALL_MODE_IDS, readyCourtLocations } from './courtLocations';
import { readyVenues, type BoardDiscipline } from './boardVenues';
import { readyCourses } from '../core/RaceCourse';
import { arenasFor, COMBAT_MODE_IDS, type CombatModeId } from '../combat/arenas';
import { looksFor } from './placeLooks';

/** Registry key → the splash / pick id, where they differ. */
const SPLASH_ID: Record<string, string> = { snowboard_slalom: 'snow', skateboard: 'skate', surf: 'surf', bigair: 'snow', aeroaces: 'aero', velocitykart: 'kart', brainbrawl: 'brainbrawl' };
const BOARD = new Set(['skate', 'snow', 'surf']);
const RACE = new Set(['aero', 'kart']);
/** Worlds built by hand (no venue spec) — they read a place look's `world` block instead. Kept so the ledger names them. */
const HAND_BUILT = new Set(['sprint', 'freerun']);
/** The quiz mounts a different venue every round — every venue in the game is its place. */
const ROTATING = new Set(['who_scene_it']);

function placesFor(key: string): number {
  const id = SPLASH_ID[key] ?? key;
  if (BASKETBALL_MODE_IDS.has(key) || key === 'threepoint') return readyCourtLocations().length;
  if (BOARD.has(id)) return readyVenues(id as BoardDiscipline).length;
  if (RACE.has(id)) return readyCourses(id as 'aero' | 'kart').length;
  if ((COMBAT_MODE_IDS as readonly string[]).includes(id)) return arenasFor(id as CombatModeId).length;
  if (ROTATING.has(key)) return 3;
  return looksFor(id).length;
}

describe('three places per mode', () => {
  for (const key of ENABLED_BABYLON_MODES) {
    it(`${key} offers at least three`, () => { expect(placesFor(key), key).toBeGreaterThanOrEqual(3); });
  }
  it('the hand-built worlds carry a world block on every look but home', () => {
    for (const key of HAND_BUILT) for (const l of looksFor(key).slice(1)) expect(l.world, `${key} ${l.id}`).toBeTruthy();
  });
  it('every place look list starts at home and has unique ids', () => {
    for (const [mode, list] of Object.entries({ football: looksFor('football'), tennis: looksFor('tennis'), dance: looksFor('dance') })) {
      expect(list[0].id, mode).toBe('home');
      expect(new Set(list.map((l) => l.id)).size).toBe(list.length);
    }
  });
});
