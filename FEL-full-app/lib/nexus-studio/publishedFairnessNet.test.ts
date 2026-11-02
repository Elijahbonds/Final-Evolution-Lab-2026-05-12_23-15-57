// The LIVE tiebreak (TENNIS-TIEBREAK-FOLD: /play/tennis?variant=tiebreak mounts TennisMode.ts TennisTiebreakMode, a NetSportMode
// config with modeId 'tiebreak' — so it is the mode a published Tiebreak venue reaches in production, at full depth). One scripted
// match on a NullEngine in a PRODUCTION build, with the AI's rolls on a seeded stream and the player's swings and aim on a fixed
// frame script, played with the shipped place and with the owner's published venue: every HUD line the mode posts, every frame's ball
// and hero position, and the end are bit-identical. Bodies, sound, the venue mesh and the mode's own weather are stood in, as the
// mode's other headless tests do (readyClock.tennis.test.ts); the Studio layers run for real.
//
// WHY THE MODE GETS ITS OWN STREAM (measured, round 8): NetSportMode rolls its AI (aiServe, aiReturn) on the GLOBAL Math.random, and
// Babylon draws from the same Math.random for every object's GUID (Misc/guid.ts). So ANY difference in the scene — a published
// venue's floods and stands, or simply picking Red Clay instead of the home court — re-orders that one stream: on a single seeded
// stream the shipped place and the published venue ended 11 and 13 (AI rolls 12 vs 14 serves). In production the stream is
// unseeded, so which draw the AI gets was never fixed by anything and the odds are unchanged; what a venue must not do is change
// the RULES — and with the mode's rolls on their own stream, nothing else differs at all.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FreeCamera, NullEngine, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import type { ModeContext } from '../babylon/core/ModeHarness';

const fx = vi.hoisted(() => ({ files: [] as unknown[] }));
vi.mock('./published/index', () => ({ get PUBLISHED_VENUE_FILES() { return fx.files; } }));
vi.mock('../babylon/visual/VenueKit', () => ({ VenueKit: { paint: (scene: Scene, name: string) => new StandardMaterial(name, scene) } }));
vi.mock('../babylon/core/CharacterLibrary', () => ({
  CharacterLibrary: {
    spawn: async (scene: Scene, _url: string, o: { position: Vector3; yawRad?: number }) => {
      const root = new TransformNode('body', scene);
      root.position.copyFrom(o.position); root.rotation.set(0, o.yawRad ?? 0, 0);
      return { root, animator: {}, skeleton: {}, dispose: () => root.dispose() };
    },
  },
}));
vi.mock('../babylon/anim/importSanitizer', async (orig) => ({ ...(await orig<typeof import('../babylon/anim/importSanitizer')>()), neverBindPose: () => undefined }));
vi.mock('../babylon/anim/clipRegistry', async (orig) => ({ ...(await orig<typeof import('../babylon/anim/clipRegistry')>()), installSafePlay: () => undefined }));
vi.mock('../babylon/anim/netTree', async (orig) => ({
  ...(await orig<typeof import('../babylon/anim/netTree')>()),
  NetAnimTree: class { onSettle: unknown = null; update(): void {} clearBeat(): void {} },
}));
vi.mock('../babylon/visual/meshyProps', () => ({ ballKindFor: () => null, dressBall: async () => undefined, spawnMeshyProp: async () => null }));
vi.mock('../babylon/core/NexusVenue', () => ({ mountVenue: () => null }));
vi.mock('../babylon/visual/EffectsKit', () => ({ EffectsKit: { ballTrail: () => ({ start: () => undefined, stop: () => undefined, isStarted: () => false, dispose: () => undefined }), burst: () => undefined } }));
vi.mock('../babylon/visual/Onlookers', () => ({ Onlookers: class { update(): void {} cheer(): void {} dispose(): void {} } }));
vi.mock('../babylon/visual/AimArrow', () => ({ mountRing: () => ({ show: () => undefined, set: () => undefined, dispose: () => undefined }) }));
vi.mock('../babylon/premium/WeatherFx', () => ({ mountWeatherFx: () => ({ update: () => undefined, dispose: () => undefined }) }));
vi.mock('../babylon/nexus/weather', () => ({ readWeather: () => null }));
vi.mock('../babylon/core/WeatherKit', async (orig) => ({
  ...(await orig<typeof import('../babylon/core/WeatherKit')>()),
  WeatherKit: class {
    static fromPick() { return new this(); }
    update(): void {} describe() { return 'CLEAR'; } flightWind() { return { x: 0, z: 0 }; } drift() { return { x: 0, z: 0 }; }
  },
}));
vi.mock('../babylon/core/FrameGuard', () => ({ assertSpawned: () => undefined }));
vi.mock('../babylon/anim/PostureLayer', () => ({ mountPostureLayer: () => ({ dispose: () => undefined }) }));
vi.mock('../babylon/audio/SoundKit', () => ({ SoundKit: { play: () => undefined, unlock: () => undefined, startAmbient: () => undefined, stopAmbient: () => undefined } }));
vi.mock('../babylon/scene/EnvironmentIBL', () => ({ mountEnvironmentIBL: () => () => {} }));

import { TennisTiebreakMode } from '../babylon/modes/TennisMode';
import { exportVenue } from './exportVenue';
import { packPublished, resetPublishedMemo, type PublishedVenue } from './published';
import { resetStudioVenueCache, studioPickFor } from './runtime';
import { everyKindVenue, placed } from '@/tests/helpers/nexusStudio';
import { installOffscreenShim } from '@/tests/helpers/canvasShim';

let pub: PublishedVenue;

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

interface Trace { hud: string[]; frames: number[][]; end: unknown[] | null; studio: string[] }

async function match(search: string): Promise<Trace> {
  vi.stubGlobal('window', { location: { search }, addEventListener: () => undefined, removeEventListener: () => undefined, localStorage: { getItem: () => null, setItem: () => undefined }, matchMedia: () => ({ matches: false }) });
  resetStudioVenueCache();
  // the MODE's rolls on their own seeded stream, everything else (Babylon's object GUIDs) on another — see the header
  const modeRnd = seeded(20261025), otherRnd = seeded(7);
  vi.spyOn(Math, 'random').mockImplementation(() => ((new Error().stack ?? '').includes('/lib/babylon/modes/') ? modeRnd() : otherRnd()));
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.metadata = { felModeId: 'tiebreak', felTier: 'low' };
  const camera = new FreeCamera('play_cam', new Vector3(0, 4, 16), scene);
  const hud: string[] = [];
  const studio: string[] = [];
  let modeHud: Record<string, unknown> = {};
  let end: unknown[] | null = null;
  const ctx = {
    scene, camera,
    setHud: (h: Record<string, unknown>) => {
      const mine = Object.keys(h).filter((k) => k.startsWith('studio'));
      if (mine.length) studio.push(JSON.stringify(mine));
      const rest = Object.fromEntries(Object.entries(h).filter(([k]) => !k.startsWith('studio')));
      if (Object.keys(rest).length) { hud.push(JSON.stringify(rest)); modeHud = { ...modeHud, ...rest }; }
    },
    end: (...a: unknown[]) => { end = a; },
    heroRef: { current: null }, objectiveRef: { current: null },
    lights: { tier: 'low' },
    feel: { impact: () => undefined },
    momentum: { report: () => undefined },
    juice: { hitStop: () => undefined, shake: () => undefined, flash: () => undefined, scorePop: () => undefined, callout: () => undefined, impact: () => undefined },
    camDirector: { snapTo: () => undefined, update: () => undefined, rightFlat: () => new Vector3(1, 0, 0), inIntro: false },
  } as unknown as ModeContext;
  const M = TennisTiebreakMode;
  await M.load(ctx);
  const frames: number[][] = [];
  const ball = () => scene.getMeshByName('ball');
  for (let f = 0; f < 60 * 240 && !end; f++) {
    // the player: aim swings across the court and a swing every 37 frames (a fixed script, read from nothing)
    if (f % 90 === 0) M.onInput?.(ctx, { t: 'stick', side: 'L', x: Math.sin(f / 300), y: 0 } as never);
    if (f % 37 === 0) M.onInput?.(ctx, { t: 'trigger', side: 'R', value: 1 } as never);
    if (f % 37 === 3) M.onInput?.(ctx, { t: 'trigger', side: 'R', value: 0 } as never);
    M.update(ctx, 1 / 60);
    scene.render();
    const b = ball(), h = ctx.heroRef.current as TransformNode | null;
    frames.push([b?.position.x ?? NaN, b?.position.y ?? NaN, b?.position.z ?? NaN, h?.position.x ?? NaN, h?.position.z ?? NaN, Number(modeHud.score ?? -1), Number(modeHud.foeScore ?? -1)]);
  }
  M.dispose?.();
  scene.dispose(); engine.dispose();
  return { hud, frames, end, studio };
}

beforeEach(() => {
  installOffscreenShim();
  vi.useFakeTimers();
  const v = everyKindVenue();
  v.objects = v.objects.filter((o) => o.type !== 'decal');
  v.objects.push(placed('decal:scuff', [-12, 0, 12]), placed('fixture:flood', [11, 0, -17], -0.6));
  v.weather = 'natural';
  pub = packPublished(exportVenue(v), 'tiebreak', { drawCalls: 65, activeMeshes: 58, textureMb: 53, skinnedBodies: 4 });
  fx.files = [pub];
  resetPublishedMemo();
  vi.stubEnv('NODE_ENV', 'production');
  vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 25, 12));
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); resetStudioVenueCache(); resetPublishedMemo(); fx.files = []; });

describe('the live tiebreak (NetSportMode): a published venue never changes the match', () => {
  it('the shipped place, the published venue and the published venue in an arena run play one bit-identical scripted tiebreak', async () => {
    const place = `studio:${pub.venue.venueId}`;
    vi.stubGlobal('window', { location: { search: `?place=${place}` }, localStorage: { getItem: () => null, setItem: () => undefined } });
    resetStudioVenueCache();
    expect(studioPickFor('tiebreak')).toMatchObject({ source: 'published', competitive: false });

    const shipped = await match('?place=home');
    const published = await match(`?place=${place}`);
    const arena = await match(`?place=${place}&arena=m1`);   // the look only

    // a real match: points on both sides
    const finalScores = shipped.frames[shipped.frames.length - 1];
    expect(shipped.hud.length).toBeGreaterThan(20);
    expect(finalScores[5] + finalScores[6]).toBeGreaterThan(2);

    expect(arena.end).toEqual(shipped.end);
    expect(arena.hud).toEqual(shipped.hud);
    expect(arena.frames).toEqual(shipped.frames);
    expect(published.end).toEqual(shipped.end);
    expect(published.hud).toEqual(shipped.hud);
    expect(published.frames.length).toBe(shipped.frames.length);
    for (let f = 0; f < shipped.frames.length; f++) {
      for (let k = 0; k < shipped.frames[f].length; k++) if (!Object.is(shipped.frames[f][k], published.frames[f][k])) expect.fail(`frame ${f} value ${k}: ${shipped.frames[f][k]} vs ${published.frames[f][k]}`);
    }
  }, 240_000);
});
