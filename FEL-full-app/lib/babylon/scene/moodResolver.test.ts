import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ARENA_MOOD, COMBAT_MODE_OF, HOME_MOOD, PLACE_KEY_OF, PLACE_MOOD, resolveModeMood, type MoodPicks } from './moodResolver';
import { MOODS, type VenueMood } from './moods';
import { COMBAT_ARENAS, arenasFor } from '../combat/arenas';
import { PLACE_LOOKS } from '../nexus/placeLooks';
import { MODES } from '../modes/registry';

const picks = (arenaId: string | null, placeId?: string): MoodPicks => ({
  arena: () => { const a = COMBAT_ARENAS.find((x) => x.id === arenaId); return a ? { id: a.id, look: { mood: a.look.mood } } : null; },
  place: () => (placeId ? { id: placeId } : undefined),
});

describe('mood follows the place (A9.4)', () => {
  it('golf no longer runs the alpine mood on the Coastal Links', () => {
    expect(MODES.golf.mood).toBe('alpine');   // what the mode declares (the audit's finding) …
    expect(resolveModeMood('golf', 'alpine', picks(null, 'home'), false).mood).toBe('daylight');   // … and what it is lit with
    expect(resolveModeMood('golf', 'alpine', picks(null, 'alpine-dawn'), false).mood).toBe('goldenHour');
  });
  it('the combat modes take the arena\'s light — the Neon Cage is a night, the Pit and the Foundry a dusk', () => {
    expect(resolveModeMood('karate-vs', 'dojoWarm', picks('cage'), false).mood).toBe('nightGame');
    expect(resolveModeMood('mixedcombat', 'goldenHour', picks('pit'), false).mood).toBe('dusk');
    expect(resolveModeMood('showdown', 'dojoWarm', picks('foundry', 'night-dojo'), false).mood).toBe('dusk');   // the arena wins, as in mountVenue
    expect(resolveModeMood('duel', 'dojoWarm', picks('cliff'), false).mood).toBe('overcast');
    expect(resolveModeMood('karate', 'dojoWarm', picks('gauntlet'), false).mood).toBe('dojoWarm');
  });
  it('the net sports, football, derby, penalty, dance and the quiz follow their place look', () => {
    expect(resolveModeMood('volleyball', 'goldenHour', picks(null, 'gym'), false).mood).toBe('indoorArena');
    expect(resolveModeMood('volleyball', 'goldenHour', picks(null, 'night-beach'), false).mood).toBe('nightGame');
    expect(resolveModeMood('tennis', 'goldenHour', picks(null, 'grass'), false).mood).toBe('overcast');
    expect(resolveModeMood('football', 'nightGame', picks(null, 'beach-bowl'), false).mood).toBe('goldenHour');
    expect(resolveModeMood('baseball', 'goldenHour', picks(null, 'night-dome'), false).mood).toBe('nightGame');
    expect(resolveModeMood('soccer', 'nightGame', picks(null, 'beach-pitch'), false).mood).toBe('goldenHour');
    expect(resolveModeMood('dance', 'nightGame', picks(null, 'rooftop-dusk'), false).mood).toBe('dusk');
    expect(resolveModeMood('brainbrawl', 'nightGame', picks(null, 'studio-day'), false).mood).toBe('indoorArena');
  });
  it('a home place keeps the declared mood (the owner\'s tuned default), golf apart', () => {
    for (const [modeId, key] of Object.entries(PLACE_KEY_OF)) {
      if (HOME_MOOD[key]) continue;
      expect(resolveModeMood(modeId, 'goldenHour', picks(null, 'home'), false).mood, modeId).toBe('goldenHour');
    }
  });
  it('a mode the resolver does not know keeps its own mood; ?look=legacy keeps everyone\'s', () => {
    expect(resolveModeMood('dunk', 'goldenHour', picks('cage', 'gym'), false).mood).toBe('goldenHour');
    expect(resolveModeMood('skateboard', 'nightGame', picks(null, 'gym'), false).mood).toBe('nightGame');
    expect(resolveModeMood('golf', 'alpine', picks(null, 'home'), true).mood).toBe('alpine');
  });
});

describe('the tables cannot drift from the places', () => {
  it('every non-home place look with its own sky has a mood (a new look cannot silently fall through)', () => {
    for (const [key, looks] of Object.entries(PLACE_LOOKS)) {
      if (key === 'showdown') continue;   // the arena decides (mountVenue applies the arena first)
      for (const l of looks) {
        if (l.id === 'home' || l.world) continue;   // hand-built worlds (sprint, free run) carry their own mood
        expect(PLACE_MOOD[key]?.[l.id], `${key}/${l.id}`).toBeDefined();
      }
    }
  });
  it('every place key the resolver names exists, and every mood it can answer is a real mood', () => {
    for (const key of Object.values(PLACE_KEY_OF)) expect(PLACE_LOOKS[key], key).toBeDefined();
    const answers: VenueMood[] = [...Object.values(ARENA_MOOD), ...Object.values(HOME_MOOD), ...Object.values(PLACE_MOOD).flatMap((t) => Object.values(t))];
    for (const m of answers) expect(MOODS[m], m).toBeDefined();
    for (const a of COMBAT_ARENAS) expect(MOODS[a.look.mood], a.id).toBeDefined();
  });
  it('every combat mode the resolver names fights in arenas, and each registered combat mode is covered', () => {
    for (const mode of Object.values(COMBAT_MODE_OF)) expect(arenasFor(mode).length, mode).toBeGreaterThan(0);
    for (const reg of ['karate', 'karate_vs', 'mixedcombat', 'duel', 'showdown']) expect(COMBAT_MODE_OF[MODES[reg].modeId], reg).toBeDefined();
  });
  it('every mode id the place table names is a registered mode\'s modeId', () => {
    const ids = new Set(Object.values(MODES).map((d) => d.modeId));
    for (const id of ['football', 'carnival', 'tennis', 'tiebreak', 'volleyball', 'baseball', 'golf', 'soccer', 'dance', 'brainbrawl']) expect(ids.has(id), id).toBe(true);
  });
  it('the harness asks the resolver, and keeps the mode\'s own ambient bed', () => {
    const h = fs.readFileSync(path.resolve(__dirname, '../core/ModeHarness.ts'), 'utf8');
    expect(h).toContain('resolveModeMood(def.modeId, declaredMood)');
    expect(h).toContain("const bed = declaredMood === 'dojoWarm'");
  });
});
