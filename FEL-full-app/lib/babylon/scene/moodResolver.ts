// MOOD FOLLOWS THE PLACE (visual-foundation A9.4, 2026-10-06).
//
// The light rig ignored the place the player picked. The combat arenas each carry their own `look.mood` (the Neon Cage is
// a night, the Pit a dusk) and the combat modes all hard-coded 'dojoWarm' or 'goldenHour'; the net sports ran the beach's
// golden hour in the Gym and on Night Beach; football's nightGame lit Beach Bowl; golf ran the ALPINE mood (exposure 0.92,
// a cold sun) on the Coastal Links. Only the board, sprint, free-run and racing modes read their place, through a mood
// getter in the mode file.
//
// Rather than a getter in a dozen mode files (a dozen merges with the lanes that own them), the harness asks this one
// resolver at mount, after the splash has written the pick and before load() runs — the same moment a getter is read.
// It only speaks for the modes in its tables; every other mode (and every getter mode) keeps exactly the mood it declared.
//
// Pure apart from the default picks reader, so the tables are tested without a page.

import type { VenueMood } from './moods';
import { readCombatArena, type CombatModeId } from '../combat/arenas';
import { readPlaceLook } from '../nexus/placeLooks';
import { isLegacyLook } from './graphicsSetting';

/** def.modeId → the combat mode its arena is picked under. (Karate VS registers as 'karate_vs' but calls itself 'karate-vs'.) */
export const COMBAT_MODE_OF: Readonly<Record<string, CombatModeId>> = {
  karate: 'karate', 'karate-vs': 'karate_vs', karate_vs: 'karate_vs', mixedcombat: 'mixedcombat', duel: 'duel', showdown: 'showdown',
};

/**
 * Arena refinements over `arenas.ts` look.mood, where the arena's own sky is a time no mood existed for until now. The
 * arena's mood stays the default; these two had a dusk/ember sky lit as goldenHour.
 */
export const ARENA_MOOD: Readonly<Record<string, VenueMood>> = {
  pit: 'dusk',       // duskSky: violet over orange — "A RAISED OCTAGON"
  foundry: 'dusk',   // emberSky: the furnace glow, not a beach sunset
};

/** def.modeId → the key its PLACE LOOK is picked under (placeLooks.ts, the splash's mode id). Showdown is not here: its
 *  arena wins in mountVenue (`options.arena` is applied before `options.look`), so its arena decides. */
export const PLACE_KEY_OF: Readonly<Record<string, string>> = {
  football: 'football', carnival: 'carnival', tennis: 'tennis', tiebreak: 'tiebreak', volleyball: 'volleyball',
  baseball: 'derby', derby: 'derby', golf: 'golf', soccer: 'penalty', penalty: 'penalty', dance: 'dance', brainbrawl: 'brainbrawl',
};

/** The light each non-home place look asks for, read off its sky (placeLooks.ts NIGHT / NEON / DAWN / EMBER / DESERT /
 *  OVERCAST / BEACH and the two indoor skies). A test holds this table to PLACE_LOOKS so a new look cannot fall through. */
export const PLACE_MOOD: Readonly<Record<string, Readonly<Record<string, VenueMood>>>> = {
  football:   { 'beach-bowl': 'goldenHour', 'dome-night': 'nightGame' },
  carnival:   { boardwalk: 'goldenHour', 'neon-block': 'nightGame' },
  tennis:     { clay: 'daylight', grass: 'overcast' },
  tiebreak:   { clay: 'daylight', grass: 'overcast' },
  volleyball: { 'night-beach': 'nightGame', gym: 'indoorArena' },
  derby:      { sandlot: 'daylight', 'night-dome': 'nightGame' },
  golf:       { desert: 'daylight', 'alpine-dawn': 'goldenHour' },
  penalty:    { 'street-cage': 'nightGame', 'beach-pitch': 'goldenHour' },
  dance:      { 'neon-club': 'nightGame', 'rooftop-dusk': 'dusk' },
  brainbrawl: { 'studio-day': 'indoorArena', 'arcade-night': 'nightGame' },
};

/** A home place whose declared mood was wrong for it. Golf: the Coastal Links ran 'alpine' (audit A3). */
export const HOME_MOOD: Readonly<Record<string, VenueMood>> = { golf: 'daylight' };

export interface MoodPicks {
  arena(mode: CombatModeId): { id: string; look: { mood: VenueMood } } | null;
  place(key: string): { id: string } | undefined;
}

export const BROWSER_PICKS: MoodPicks = {
  arena: (mode) => { try { return readCombatArena(mode) ?? null; } catch { return null; } },
  place: (key) => { try { return readPlaceLook(key); } catch { return undefined; } },
};

export interface MoodDecision { mood: VenueMood; why: string }

export function resolveModeMood(modeId: string, declared: VenueMood, picks: MoodPicks = BROWSER_PICKS, legacy = isLegacyLook()): MoodDecision {
  if (legacy) return { mood: declared, why: 'legacy: declared' };
  const combat = COMBAT_MODE_OF[modeId];
  if (combat) {
    const arena = picks.arena(combat);
    if (arena) return { mood: ARENA_MOOD[arena.id] ?? arena.look.mood, why: `arena ${arena.id}` };
  }
  const key = PLACE_KEY_OF[modeId];
  if (key) {
    const look = picks.place(key);
    const byLook = look && look.id !== 'home' ? PLACE_MOOD[key]?.[look.id] : undefined;
    if (byLook) return { mood: byLook, why: `place ${key}/${look!.id}` };
    if (HOME_MOOD[key]) return { mood: HOME_MOOD[key], why: `home place of ${key}` };
  }
  return { mood: declared, why: 'declared' };
}
