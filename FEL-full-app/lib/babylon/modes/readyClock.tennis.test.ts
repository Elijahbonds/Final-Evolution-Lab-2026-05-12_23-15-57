// QA P0-04 (2026-09-27), Match Point: "arrives at 0–15". The real TennisMode (NetSportMode + RallyCore + TennisScore) on a
// NullEngine, bodies / venue / sound / weather stubbed. Its points move only inside update() — the rest before the serve,
// the serve's toss, the flight, NO SWING — and the harness calls update() only while 'playing'. So 10 s in READY leave it
// 0–0; the 0–15 is the first point of play (the hero serves 0.8 s in, and nobody swung), which the second test plays out.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NullEngine, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import type { ModeContext } from '../core/ModeHarness';

vi.mock('../visual/VenueKit', () => ({ VenueKit: { paint: (scene: Scene, name: string) => new StandardMaterial(name, scene) } }));
vi.mock('../core/CharacterLibrary', () => ({
  CharacterLibrary: {
    spawn: async (scene: Scene, _url: string, o: { position: Vector3; yawRad?: number }) => {
      const root = new TransformNode('body', scene);
      root.position.copyFrom(o.position); root.rotation.set(0, o.yawRad ?? 0, 0);
      return { root, animator: {}, skeleton: {}, dispose: () => root.dispose() };
    },
  },
}));
vi.mock('../anim/importSanitizer', () => ({ neverBindPose: () => undefined }));
vi.mock('../anim/clipRegistry', () => ({ installSafePlay: () => undefined }));
vi.mock('../anim/netTree', async (orig) => ({
  ...(await orig<typeof import('../anim/netTree')>()),
  NetAnimTree: class { onSettle: unknown = null; update(): void {} clearBeat(): void {} },
}));
vi.mock('../visual/meshyProps', () => ({ ballKindFor: () => null, dressBall: async () => undefined }));
vi.mock('../core/NexusVenue', () => ({ mountVenue: () => null }));
vi.mock('../nexus/placeLooks', () => ({ readPlaceLook: () => null }));
vi.mock('../visual/EffectsKit', () => ({ EffectsKit: { ballTrail: () => undefined, burst: () => undefined } }));
vi.mock('../visual/Onlookers', () => ({ Onlookers: class { update(): void {} cheer(): void {} dispose(): void {} } }));
vi.mock('../visual/AimArrow', () => ({ mountRing: () => ({ show: () => undefined, set: () => undefined, dispose: () => undefined }) }));
vi.mock('../premium/WeatherFx', () => ({ mountWeatherFx: () => ({ update: () => undefined, dispose: () => undefined }) }));
vi.mock('../nexus/weather', () => ({ readWeather: () => null }));
vi.mock('../core/WeatherKit', async (orig) => ({
  ...(await orig<typeof import('../core/WeatherKit')>()),
  WeatherKit: class {
    static fromPick() { return new this(); }
    update(): void {} describe() { return 'CLEAR'; } flightWind() { return { x: 0, z: 0 }; } drift() { return { x: 0, z: 0 }; }
  },
}));
vi.mock('../core/FrameGuard', () => ({ assertSpawned: () => undefined }));
vi.mock('../anim/PostureLayer', () => ({ mountPostureLayer: () => ({ dispose: () => undefined }) }));
vi.mock('../audio/SoundKit', () => ({
  SoundKit: { play: () => undefined, unlock: () => undefined, startAmbient: () => undefined, stopAmbient: () => undefined },
}));

import { TennisMode } from './TennisMode';

type Hud = Record<string, unknown>;
let engine: NullEngine;
let scene: Scene;
let hud: Hud[];
let ended: unknown[] | null;
const last = (key: string): unknown => { for (let i = hud.length - 1; i >= 0; i--) if (key in hud[i]) return hud[i][key]; return undefined; };
const board = () => `${last('score')}–${last('foeScore')} ${last('call')}`;

function fakeCtx(): ModeContext {
  return {
    scene,
    setHud: (h: Hud) => { hud.push(h); },
    end: (...a: unknown[]) => { ended = a; },
    heroRef: { current: null }, objectiveRef: { current: null },
    lights: { tier: 'low' },
    feel: { impact: () => undefined },
    momentum: { report: () => undefined },
    juice: { hitStop: () => undefined, shake: () => undefined, flash: () => undefined, scorePop: () => undefined, callout: () => undefined, impact: () => undefined },
    camDirector: { snapTo: () => undefined, update: () => undefined, rightFlat: () => new Vector3(1, 0, 0) },
  } as unknown as ModeContext;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  engine = new NullEngine();
  scene = new Scene(engine);
  hud = []; ended = null;
});
afterEach(() => {
  TennisMode.dispose?.();
  scene.dispose(); engine.dispose();
  vi.useRealTimers(); vi.restoreAllMocks();
});

describe('Match Point: 0–0 until the player plays', () => {
  it('10 s in READY after load: still 0–0, no serve, no end', async () => {
    const ctx = fakeCtx();
    await TennisMode.load(ctx);
    const start = board();
    expect(last('score')).toBe(0);
    expect(last('foeScore')).toBe(0);
    vi.advanceTimersByTime(10_000);   // the wall clock runs; the harness calls no update() outside 'playing'
    expect(board()).toBe(start);
    expect(hud.some((h) => h.banner === 'SERVE')).toBe(false);
    expect(ended).toBeNull();
  });

  it('after wake it advances: the serve goes up at 0.8 s and the first point is played out', async () => {
    const ctx = fakeCtx();
    await TennisMode.load(ctx);
    const start = board();
    let served = -1;
    for (let i = 0; i < 20 * 60 && board() === start; i++) {
      TennisMode.update(ctx, 1 / 60);
      vi.advanceTimersByTime(1000 / 60);
      if (served < 0 && hud.some((h) => h.banner === 'SERVE')) served = i / 60;
    }
    expect(served).toBeGreaterThan(0.7);
    expect(served).toBeLessThan(1);
    expect(last('call')).toMatch(/^(15-0|0-15)$/);   // one point played (the QA's 0–15 was one of these), inside game 1
    expect(last('foeScore')).toBe(0);
  });
});
