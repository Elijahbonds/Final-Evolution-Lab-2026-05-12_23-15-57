// studio-5 (§13.3): Volleyball and Derby as play-test targets, on Football Rush's pattern. Each row is the mode's own data; each
// mode reads a Studio venue only through its dev-only opt-in lines and is exactly as it shipped without one (and always in
// production); Tennis, which shares NetSportMode with Volleyball, never loads a venue whatever the page carries; the replay angles
// reach the mode's replay; the mode steps its own director, so the Studio adds no intro stepper; a cast plays on the standard frame.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../babylon/scene/EnvironmentIBL', () => ({ mountEnvironmentIBL: () => () => {} }));   // a float cube NullEngine cannot build

import { NullEngine, Scene } from '@babylonjs/core';
import { PLAYTEST_TARGETS, castFrameFor, targetOf } from './targets';
import { exportVenue, type StudioVenueExport } from './exportVenue';
import { encodeInline } from './storage';
import { mountStudioFor, resetStudioVenueCache, studioIntroOr, studioLookFor, studioMood, studioReplayAngles, studioVenueFor } from './runtime';
import { mountStage } from './stage';
import { newVenue } from './doc';
import { VENUE_SPECS } from '../babylon/nexus/venueSpecs';
import { FOLLOW_PRESETS } from '../babylon/core/CameraDirector';
import { crowdVenue } from '../babylon/visual/crowd/crowdVenues';
import { readyWeathers } from '../babylon/nexus/weather';
import { VOLLEYBALL } from '../babylon/core/RallyCore';
import mobileBudget from '../babylon/config/mobileBudget.json';
import { VolleyballMode } from '../babylon/modes/VolleyballMode';
import { TennisMode } from '../babylon/modes/TennisMode';
import { DerbyMode } from '../babylon/modes/precisionModes';
import { installOffscreenShim } from '@/tests/helpers/canvasShim';
import { everyKindVenue } from '@/tests/helpers/nexusStudio';

const ROOT = join(__dirname, '..', '..');
const net = readFileSync(join(ROOT, 'lib/babylon/modes/NetSportMode.ts'), 'utf8');
const prec = readFileSync(join(ROOT, 'lib/babylon/modes/precisionModes.ts'), 'utf8');
const derbySrc = prec.slice(prec.indexOf('export const DerbyMode'), prec.indexOf('export const PenaltyMode'));

type Key = 'volleyball' | 'derby';
const MODE = { volleyball: VolleyballMode, derby: DerbyMode } as const;
function courtVenue(key: Key, over: Partial<ReturnType<typeof newVenue>> = {}) {
  return { ...newVenue(`${key} night`, { spec: PLAYTEST_TARGETS[key].spec, target: key }, 'dusk'), intro: 'establish' as const, replayAngles: ['high' as const, 'low' as const], weather: 'fog' as const, ...over };
}
/** The page carries `?venue=` (inline, so no storage is needed). */
function onPage(exp: StudioVenueExport) {
  resetStudioVenueCache();
  vi.stubGlobal('window', { location: { search: `?venue=${encodeInline(exp)}` } });
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); resetStudioVenueCache(); });

describe('the rows are the modes’ own data', () => {
  it('four targets, in the order the inspector lists them', () => {
    expect(Object.keys(PLAYTEST_TARGETS)).toEqual(['tiebreak', 'football', 'volleyball', 'derby']);
  });
  for (const key of ['volleyball', 'derby'] as const) {
    it(`${key}: spec, preset, crowd look line, weather family, budget row, a dev-only route, the definition's modeId`, () => {
      const t = PLAYTEST_TARGETS[key];
      expect(targetOf(key)).toBe(t);
      expect(VENUE_SPECS[t.spec]).toBeTruthy();
      expect(FOLLOW_PRESETS[t.camPreset]).toBeTruthy();
      expect(t.camPreset).toBe(MODE[key].camPreset);
      expect(t.modeId ?? t.key).toBe(MODE[key].modeId);
      const cv = crowdVenue(key)!;
      expect(t.crowdView).toEqual({ focus: cv.focus, eye: cv.eye, camera: cv.camera });
      expect(readyWeathers(t.weatherFamily).length).toBeGreaterThan(0);
      expect(Object.keys((mobileBudget as { modes: Record<string, unknown> }).modes)).toContain(t.budgetKey);
      expect(t.route('v1')).toBe(`/dev/mode/${key}?venue=v1`);
      expect(t.stepsOwnDirector).toBe(true);
      expect(t.replays).toBe(true);
      expect(t.modeWeather).toBeUndefined();   // neither mode's weather is gameplay (below)
    });
  }
  it('where the hero stands is where the mode spawns it; the score keys are the ones the mode posts', () => {
    const near = (a: readonly number[], b: readonly number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 9));
    near(PLAYTEST_TARGETS.volleyball.subject, [0, 0, VOLLEYBALL.halfLength * 0.85]);
    near(PLAYTEST_TARGETS.volleyball.objective, [0, 0, -VOLLEYBALL.halfLength * 0.85]);
    expect(net).toMatch(/position: new Vector3\(0, 0, o\.cfg\.halfLength \* 0\.85\), yawRad: Math\.PI,/);
    expect(net).toMatch(/score: tennisScore \? tennisScore\.games\[0\] : volleyScore!\.points\[0\],\n\s+foeScore:/);
    expect(derbySrc).toMatch(/me = await spawnAthlete\(ctx, CFG\.heroUrl, new Vector3\(-0\.7, 0, 0\), Math\.PI \/ 2,/);
    expect(derbySrc).toMatch(/pitcher = await spawnFoe\(ctx, CFG\.heroUrl, new Vector3\(0, 0\.35, 18\),/);
    expect(derbySrc).toMatch(/ctx\.setHud\(\{ score: pts, homers: tally\.homers, outs: tally\.outs, longest: tally\.longestFt, rivalHomers: rivalSoFar\(\),/);
    expect(PLAYTEST_TARGETS.volleyball.scoreKeys).toEqual({ me: 'score', them: 'foeScore' });
    expect(PLAYTEST_TARGETS.derby.scoreKeys).toEqual({ me: 'score', them: 'rivalHomers' });
  });
  it('a cast plays on the standard frame in both (no fairness review yet, §10.5); Tiebreak keeps its own', () => {
    expect(castFrameFor('volleyball')).toBe('standard');
    expect(castFrameFor('derby')).toBe('standard');
    expect(castFrameFor('tiebreak')).toBe('own');
  });
  it('the weather: neither mode plays one (Volleyball rolls it for a one-touch sport only; Derby has none), so a venue’s pick is its look', () => {
    expect(net).toMatch(/weather = WeatherKit\.fromPick\(o\.cfg\.touchesPerSide === 1 \? readWeather\(o\.modeId\) : 'natural', 'court',/);
    expect(VOLLEYBALL.touchesPerSide).toBeGreaterThan(1);
    expect(derbySrc).not.toMatch(/weather|Weather/);
    expect(exportVenue(courtVenue('volleyball')).weather).toBe('fog');
    expect(exportVenue(courtVenue('derby')).weather).toBe('fog');
  });
});

describe('without a Studio venue, every value is the shipped one', () => {
  const shipped = (): void => {
    for (const m of [VolleyballMode, TennisMode, DerbyMode]) { expect(m.mood).toBe('goldenHour'); expect(m.intro).toBe('walkIn'); }
    expect(studioReplayAngles('volleyball')).toBeUndefined();
    expect(studioReplayAngles('derby')).toBeUndefined();
    expect(studioLookFor('volleyball')).toBeUndefined();
    expect(studioLookFor('derby')).toBeUndefined();
  };
  it('no ?venue=: golden hour, the walk-in, the director’s own replay cut, the place pick', () => {
    resetStudioVenueCache();
    vi.stubGlobal('window', { location: { search: '' } });
    shipped();
  });
  it('a production build: the page may carry a venue for each, and nothing reads it', () => {
    vi.stubEnv('NODE_ENV', 'production');
    for (const key of ['volleyball', 'derby'] as const) {
      const exp = exportVenue(courtVenue(key));
      expect(studioVenueFor(key, `?venue=${encodeInline(exp)}`, null)).toBeNull();
      onPage(exp);
      shipped();
      expect(mountStudioFor(key, { scene: {} as Scene })).toBeNull();
    }
  });
  it('another mode’s venue on the page does not reach them', () => {
    onPage(exportVenue(everyKindVenue()));   // a Tiebreak venue
    shipped();
  });
});

describe('Tennis shares NetSportMode, and never loads a venue', () => {
  it('a Volleyball venue on the page leaves Tennis as it shipped', () => {
    onPage(exportVenue(courtVenue('volleyball')));
    expect(TennisMode.mood).toBe('goldenHour');
    expect(TennisMode.intro).toBe('walkIn');
    expect(studioReplayAngles('tennis')).toBeUndefined();
  });
  it('even an export forged for "tennis" is refused: no row, no venue (the row registry is the gate)', () => {
    const forged = { ...exportVenue(courtVenue('volleyball')), target: 'tennis' };
    onPage(forged);
    expect(studioVenueFor('tennis')).toBeNull();
    expect(TennisMode.mood).toBe('goldenHour');
    expect(TennisMode.intro).toBe('walkIn');
    expect(mountStudioFor('tennis', { scene: new Scene(new NullEngine()) })).toBeNull();
  });
});

describe('with a Studio venue on the page', () => {
  for (const key of ['volleyball', 'derby'] as const) {
    it(`${key}: the venue's mood, its intro, its replay angles in order, its look`, () => {
      onPage(exportVenue(courtVenue(key)));
      expect(MODE[key].mood).toBe('dusk');
      expect(MODE[key].intro).toBe('establish');
      expect(studioReplayAngles(key)).toEqual(['high', 'low']);
      expect(studioMood(key, 'goldenHour')).toBe('dusk');
      expect(studioLookFor(key)?.id).toBe('studio');
    });
    it(`${key}: no intro picked is none (not the walk-in); no angles is the director's own cut`, () => {
      onPage(exportVenue(courtVenue(key, { intro: 'none', replayAngles: [] })));
      expect(MODE[key].intro).toBeUndefined();
      expect(studioIntroOr(key, 'walkIn')).toBeUndefined();
      expect(studioReplayAngles(key)).toBeUndefined();
    });
  }
  it('the Studio adds no intro stepper to either (each steps its own director); Tiebreak, whose camera is fixed, gets one', () => {
    const count = (key: 'volleyball' | 'derby' | 'tiebreak') => {
      const scene = new Scene(new NullEngine());
      const before = scene.onBeforeRenderObservable.observers.length;
      const v = key === 'tiebreak' ? { ...everyKindVenue(), objects: [] } : courtVenue(key);
      onPage(exportVenue({ ...v, intro: 'walkIn' }));
      const x = mountStudioFor(key, { scene, camDirector: { inIntro: false, update() {} }, heroRef: { current: null } })!;
      const n = scene.onBeforeRenderObservable.observers.length - before;
      x.dispose(); scene.dispose();
      return n;
    };
    const tiebreak = count('tiebreak');
    expect(tiebreak - count('volleyball')).toBe(1);
    expect(tiebreak - count('derby')).toBe(1);
  });
});

describe('the editor stands each venue on its own mode’s scene marks', () => {
  for (const key of ['volleyball', 'derby'] as const) {
    it(`${key}: the scene is marked with the definition's modeId and its venue spec mounts`, async () => {
      installOffscreenShim();
      const engine = new NullEngine();
      const s = await mountStage({ canvas: null, engine, exp: exportVenue({ ...courtVenue(key), mood: 'indoorArena' }), tier: 'mobile' });
      try {
        expect(s.scene.metadata.felModeId).toBe(MODE[key].modeId);   // Derby: 'baseball', as the mode's own scene
        expect(s.venue).not.toBeNull();
        expect(s.subject().asArray()).toEqual(PLAYTEST_TARGETS[key].subject);
      } finally { s.dispose(); }
    });
  }
});

describe('the opt-ins are minimal (shared files)', () => {
  it('NetSportMode reads the venue in exactly the dev-only lines, by its own modeId, and keeps its own weather', () => {
    expect(net).toMatch(/get mood\(\) \{ return studioMood\(o\.modeId, 'goldenHour'\); \}/);
    expect(net).toMatch(/get intro\(\) \{ return studioIntroOr\(o\.modeId, 'walkIn'\); \}/);
    expect(net).toMatch(/const look = studioLookFor\(o\.modeId\) \?\? readPlaceLook\(o\.venueId\);/);
    expect(net).toMatch(/venue = mountVenue\(ctx, o\.venueId, \{ keepGameplayCamera: true, look \}\);/);
    expect(net).toMatch(/const placeId = look\?\.id;/);
    expect(net).toMatch(/keepSky: !!look\?\.sky/);
    expect(net).toMatch(/studio\?\.dispose\(\); studio = mountStudioFor\(o\.modeId, ctx\);/);
    expect(net).toMatch(/studio\?\.dispose\(\); studio = null;/);
    expect(net).toMatch(/void ctx\.highlight\?\.\(\{ lastSeconds: 3\.4, angles: studioReplayAngles\(o\.modeId\) \}\)/);
    const refs = net.match(/studio[A-Z]\w*\(|mountStudioFor\(/g) ?? [];
    expect(new Set(refs)).toEqual(new Set(['studioMood(', 'studioIntroOr(', 'studioLookFor(', 'mountStudioFor(', 'studioReplayAngles(']));
    expect(net.match(/readPlaceLook\(/g)).toHaveLength(1);   // the place pick is read once, as the fallback of the one look
  });
  it('DerbyMode reads the venue in exactly the dev-only lines, keyed "derby"', () => {
    expect(derbySrc).toMatch(/modeId: 'derby', get mood\(\) \{ return studioMood\('derby', 'goldenHour'\); \}, camPreset: 'court',/);
    expect(derbySrc).toMatch(/get intro\(\) \{ return studioIntroOr\('derby', 'walkIn'\); \}/);
    expect(derbySrc).toMatch(/derbyVenue = mountVenue\(ctx, 'derby', \{ keepGameplayCamera: true, look: studioLookFor\('derby'\) \?\? readPlaceLook\('derby'\) \}\);/);
    expect(derbySrc).toMatch(/studio\?\.dispose\(\); studio = mountStudioFor\('derby', ctx\);/);
    expect(derbySrc).toMatch(/derbyVenue\?\.dispose\?\.\(\); derbyVenue = null; studio\?\.dispose\(\); studio = null;/);
    expect(derbySrc).toMatch(/void ctx\.highlight\?\.\(\{ lastSeconds: 3\.8, objective: ball\.position\.clone\(\), angles: studioReplayAngles\('derby'\) \}\)/);
    const refs = derbySrc.match(/studio[A-Z]\w*\(|mountStudioFor\(/g) ?? [];
    expect(new Set(refs)).toEqual(new Set(['studioMood(', 'studioIntroOr(', 'studioLookFor(', 'mountStudioFor(', 'studioReplayAngles(']));
    // no other precision mode reaches into the Studio
    expect((prec.replace(derbySrc, '').match(/studio[A-Z]\w*\(|mountStudioFor\(/g) ?? [])).toEqual([]);
  });
  it('the cast is seated before the batter / the player spawns (mountStudioFor primes the identity)', () => {
    expect(derbySrc.indexOf("studio = mountStudioFor('derby', ctx)")).toBeLessThan(derbySrc.indexOf('me = await spawnAthlete('));
    expect(net.indexOf('studio = mountStudioFor(o.modeId, ctx)')).toBeLessThan(net.indexOf('me = await CharacterLibrary.spawn('));
  });
});
