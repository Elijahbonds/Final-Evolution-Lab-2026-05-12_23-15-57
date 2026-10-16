// Football Rush as the Studio's second play-test target (docs/NEXUS-STUDIO.md §11): its row matches the mode's own data, the
// mode reads a Studio venue only through its dev-only opt-in lines (and is exactly as it shipped without one), the venue's
// replay angles reach the touchdown replay, its intro is the mode's to step, its weather stays the mode's, and a cast plays
// on the standard frame.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NullEngine, Scene } from '@babylonjs/core';
import { PLAYTEST_TARGETS, castFrameFor, targetOf } from './targets';
import { exportVenue } from './exportVenue';
import { encodeInline } from './storage';
import { mountStudioExtras, mountStudioFor, resetStudioVenueCache, studioIntroOr, studioMood, studioReplayAngles, studioVenueFor } from './runtime';
import { newVenue } from './doc';
import { VENUE_SPECS } from '../babylon/nexus/venueSpecs';
import { FOLLOW_PRESETS } from '../babylon/core/CameraDirector';
import { crowdVenue } from '../babylon/visual/crowd/crowdVenues';
import mobileBudget from '../babylon/config/mobileBudget.json';
import { FootballRushMode } from '../babylon/modes/FootballRushMode';
import { everyKindVenue } from '@/tests/helpers/nexusStudio';

const ROOT = join(__dirname, '..', '..');
const football = readFileSync(join(ROOT, 'lib/babylon/modes/FootballRushMode.ts'), 'utf8');

function footballVenue(over: Partial<ReturnType<typeof newVenue>> = {}) {
  return { ...newVenue('Rush night', { spec: 'football_rush', target: 'football' }, 'dusk'), intro: 'establish' as const, replayAngles: ['high' as const, 'low' as const], weather: 'rain' as const, ...over };
}
/** The page carries `?venue=` (inline, so no storage is needed). */
function onPage(exp: ReturnType<typeof exportVenue>) {
  resetStudioVenueCache();
  vi.stubGlobal('window', { location: { search: `?venue=${encodeInline(exp)}` } });
}
afterEach(() => { vi.unstubAllGlobals(); resetStudioVenueCache(); });

describe('the target row is the mode’s own data', () => {
  const t = PLAYTEST_TARGETS.football;
  it('spec, preset, crowd look line, budget row and a dev-only route', () => {
    expect(targetOf('football')).toBe(t);
    expect(VENUE_SPECS[t.spec]).toBeTruthy();
    expect(FOLLOW_PRESETS[t.camPreset]).toBeTruthy();
    expect(t.camPreset).toBe(FootballRushMode.camPreset);
    const cv = crowdVenue('football')!;
    expect(t.crowdView).toEqual({ focus: cv.focus, eye: cv.eye, camera: cv.camera });
    expect(Object.keys((mobileBudget as { modes: Record<string, unknown> }).modes)).toContain(t.budgetKey);
    expect(t.route('v1')).toBe('/dev/mode/football?venue=v1');
    expect(football).toMatch(/FIELD_LENGTH \+ 4/);                // the objective the row names (0, 0, 44)
    expect(football).toMatch(/const FIELD_LENGTH = 40;/);
  });
  it('a cast plays on the standard frame (no fairness review yet, §10.5 "any other mode"); Tiebreak keeps its own', () => {
    expect(castFrameFor('football')).toBe('standard');
    expect(t.castFrame.frame).toBe('standard');
    expect(castFrameFor('tiebreak')).toBe('own');
  });
  it('the weather is the mode’s (gameplay): a venue’s pick is not exported for it, and is for Tiebreak', () => {
    expect(exportVenue(footballVenue()).weather).toBe('natural');
    expect(exportVenue(everyKindVenue()).weather).toBe('rain');
  });
  it('the glossy floor is not asked for over the mode’s own turf; Tiebreak keeps the ask', () => {
    expect(exportVenue(footballVenue({ glossyFloor: true })).glossyFloor).toBe(false);
    expect(exportVenue({ ...everyKindVenue(), glossyFloor: true }).glossyFloor).toBe(true);
  });
});

describe('the mode without a Studio venue is exactly as it shipped', () => {
  it('night game, the walk-in intro, the director’s own replay cut', () => {
    resetStudioVenueCache();
    expect(FootballRushMode.mood).toBe('nightGame');
    expect(FootballRushMode.intro).toBe('walkIn');
    expect(studioReplayAngles('football')).toBeUndefined();
    expect(studioIntroOr('football', 'walkIn')).toBe('walkIn');
  });
  it('a production build never reads ?venue=', () => {
    const exp = exportVenue(footballVenue());
    expect(studioVenueFor('football', `?venue=${encodeInline(exp)}`, null, 'production')).toBeNull();
  });
  it('a Tiebreak venue on the page does not reach Football Rush', () => {
    onPage(exportVenue(everyKindVenue()));
    expect(FootballRushMode.mood).toBe('nightGame');
    expect(FootballRushMode.intro).toBe('walkIn');
  });
});

describe('with a Football Rush venue on the page', () => {
  it('the mode lights with the venue’s mood, opens on its intro and replays through its angles, in order', () => {
    onPage(exportVenue(footballVenue()));
    expect(FootballRushMode.mood).toBe('dusk');
    expect(FootballRushMode.intro).toBe('establish');
    expect(studioReplayAngles('football')).toEqual(['high', 'low']);
    expect(studioMood('football', 'nightGame')).toBe('dusk');
  });
  it('a venue that picks no intro gets none (not the mode’s walk-in); no angles gets the director’s own cut', () => {
    onPage(exportVenue(footballVenue({ intro: 'none', replayAngles: [] })));
    expect(FootballRushMode.intro).toBeUndefined();
    expect(studioReplayAngles('football')).toBeUndefined();
  });
  it('the Studio adds no intro stepper (the mode steps its own director); Tiebreak, whose camera is fixed, gets one', () => {
    const count = (target: 'football' | 'tiebreak') => {
      const scene = new Scene(new NullEngine());
      const before = scene.onBeforeRenderObservable.observers.length;
      const v = target === 'football' ? footballVenue() : { ...everyKindVenue(), objects: [] };
      onPage(exportVenue({ ...v, intro: 'walkIn' }));
      const ctx = { scene, camDirector: { inIntro: false, update() {} }, heroRef: { current: null } };
      const x = mountStudioFor(target, ctx)!;
      const n = scene.onBeforeRenderObservable.observers.length - before;
      x.dispose(); scene.dispose();
      return n;
    };
    const tiebreak = count('tiebreak'), rush = count('football');
    expect(tiebreak - rush).toBe(1);
  });
});

describe('FootballRushMode’s opt-in is minimal (shared file)', () => {
  it('reads the venue in exactly the dev-only lines, and changes nothing else it calls', () => {
    expect(football).toMatch(/get mood\(\) \{ return studioMood\('football', 'nightGame'\); \}/);
    expect(football).toMatch(/get intro\(\) \{ return studioIntroOr\('football', 'walkIn'\); \}/);
    expect(football).toMatch(/const look = studioLookFor\('football'\) \?\? readPlaceLook\('football'\);/);
    expect(football).toMatch(/mountVenue\(ctx, 'football_rush', \{ keepGameplayCamera: true, look \}\)/);
    expect(football).toMatch(/studio = mountStudioFor\('football', ctx\)/);
    expect(football).toMatch(/studio\?\.dispose\(\); studio = null;/);
    expect(football).toMatch(/ctx\.highlight\?\.\(\{ lastSeconds: 2\.6, objective: new Vector3\(0, 0, FIELD_LENGTH \+ 4\), angles: studioReplayAngles\('football'\) \}\)/);
    // the mode's own weather (its gameplay) is still the start screen's pick, and nothing else reaches into the Studio
    expect(football).toMatch(/weather = WeatherKit\.fromPick\(readWeather\('football'\)/);
    const studioRefs = football.match(/studio[A-Z]\w*\(|mountStudioFor\(/g) ?? [];
    expect(new Set(studioRefs)).toEqual(new Set(['studioMood(', 'studioIntroOr(', 'studioLookFor(', 'mountStudioFor(', 'studioReplayAngles(']));
  });
  it('the extras a Football Rush venue mounts never include the weather (the mode mounts its own)', () => {
    const scene = new Scene(new NullEngine());
    const x = mountStudioExtras({ scene, lights: { tier: 'mobile' } as never }, exportVenue(footballVenue()));
    expect(x.layers.weather).toBeTruthy();
    expect(scene.meshes.some((m) => /rain|weather/i.test(m.name))).toBe(false);
    x.dispose(); scene.dispose();
  });
});
