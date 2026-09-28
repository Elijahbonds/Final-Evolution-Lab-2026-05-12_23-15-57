// QA P0-04 (2026-09-27): "clocks run during load" — Moonshot Derby arrived at pitch 5 with 5 outs, Twelve Yards at kick 3/5,
// Match Point at 0–15.
//
// The harness calls update() only while 'playing' (ModeHarness), so a mode stands still in 'loading', 'ready' and 'paused'
// only if nothing ELSE moves it. The derby and the shootout moved their rounds on setTimeout — the next pitch (0.8 s) and
// the end (1 s), the keeper round (1.2 s) and the result of their kick (1.3 s) — and a wall timer does not know the phase:
// it fires while paused, and it outlives the mount that set it, into the next mount of the same singleton mode. The beats
// run on the mode's update clock now (core/ModeBeats). Driven here for real on a NullEngine: the real DerbyMode and
// PenaltyMode, the real Flight / Reticle / SoccerBall; bodies, venue, sound and weather stubbed (the penaltyFlow set).
// Wall time passing with no update() is what 'ready' and 'paused' look like to a mode.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NullEngine, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';

vi.mock('../visual/VenueKit', () => ({
  VenueKit: {
    paint: (scene: Scene, name: string) => new StandardMaterial(name, scene),
    buildField: () => undefined, buildCourt: () => undefined,
  },
}));
vi.mock('../core/CharacterLibrary', () => ({ CharacterLibrary: {} }));
vi.mock('../core/characterPipeline', () => ({ CharacterPipeline: {} }));
vi.mock('../anim/importSanitizer', () => ({ neverBindPose: () => undefined }));
vi.mock('../anim/boneLookup', () => ({ boneNode: () => null }));
vi.mock('../visual/meshyProps', () => ({ spawnMeshyProp: async () => null, dressBall: async () => undefined }));
vi.mock('../core/NexusVenue', () => ({ mountVenue: () => null }));
vi.mock('../nexus/placeLooks', () => ({ readPlaceLook: () => null }));
vi.mock('../visual/EffectsKit', () => ({ EffectsKit: { ambient: () => undefined, burst: () => undefined } }));
vi.mock('../visual/Onlookers', () => ({ Onlookers: class { update(): void {} cheer(): void {} dispose(): void {} } }));
vi.mock('../visual/AimArrow', () => ({ mountAimArrow: () => ({ dispose: () => undefined }) }));
vi.mock('../premium/WeatherFx', () => ({ mountWeatherFx: () => ({ dispose: () => undefined }) }));
vi.mock('../nexus/weather', () => ({ readWeather: () => null }));
vi.mock('../core/WeatherKit', async (orig) => ({
  ...(await orig<typeof import('../core/WeatherKit')>()),
  WeatherKit: class { static fromPick() { return new this(); } flightWind() { return { x: 0, z: 0 }; } describe() { return 'CLEAR'; } },
}));
vi.mock('../core/FrameGuard', () => ({ assertSpawned: () => undefined }));
vi.mock('../anim/PostureLayer', () => ({ mountPostureLayer: () => ({ dispose: () => undefined }) }));
vi.mock('../anim/mirrored-clips', () => ({ registerMirroredClips: () => undefined }));
vi.mock('../anim/clipRegistry', () => ({ installSafePlay: () => undefined, SPORT_CLIP: new Proxy({}, { get: (_t, k) => String(k) }) }));
vi.mock('../anim/beatOwner', () => ({ BeatOwner: class { loop(): void {} beat(): void {} } }));
vi.mock('../audio/SoundKit', () => ({
  SoundKit: { play: () => undefined, unlock: () => undefined, startAmbient: () => undefined, stopAmbient: () => undefined },
}));
vi.mock('./aimSwingCore', async (orig) => {
  const real = await orig<typeof import('./aimSwingCore')>();
  const body = async (ctx: ModeContext, _url: string, pos: Vector3, yaw: number) => {
    const root = new TransformNode(`body_${pos.x}_${pos.z}`, ctx.scene);
    root.position.copyFrom(pos); root.rotation.set(0, yaw, 0);
    return { root, animator: {}, skeleton: {}, dispose: () => root.dispose() };
  };
  return { ...real, buildGoal: () => [], buildBallparkOutfield: () => [], spawnAthlete: body, spawnFoe: body };   // the outfield's distance signs are DynamicTextures (no canvas in node)
});

import { DerbyMode, PenaltyMode } from './precisionModes';

type Hud = Record<string, unknown>;
const press = (btn: 'A'): FelInput => ({ t: 'button', btn, pressed: true });

let engine: NullEngine;
let scene: Scene;

interface Rig { ctx: ModeContext; hud: Hud[]; ended: unknown[] | null; last(key: string): unknown }
function rig(): Rig {
  const r: Rig = {
    hud: [], ended: null, ctx: null as unknown as ModeContext,
    last(key) { for (let i = r.hud.length - 1; i >= 0; i--) if (key in r.hud[i]) return r.hud[i][key]; return undefined; },
  };
  r.ctx = {
    scene,
    setHud: (h: Hud) => { r.hud.push(h); },
    end: (...a: unknown[]) => { r.ended = a; },
    heroRef: { current: null }, objectiveRef: { current: null },
    lights: { tier: 'low' },
    camera: { setTarget: () => undefined },
    feel: { impact: () => undefined },
    juice: { hitStop: () => undefined, shake: () => undefined, flash: () => undefined, scorePop: () => undefined, callout: () => undefined },
    camDirector: {
      setPreset: () => undefined, snapTo: () => undefined, update: () => undefined, setFixedBehind: () => undefined,
      setFixed: () => undefined, mode: 'fixed',
    },
  } as unknown as ModeContext;
  return r;
}

/** 'playing': frames at 60 Hz, update() and the wall clock together (the harness's render loop). */
function play(mode: ModeDefinition, ctx: ModeContext, sec: number, until?: () => boolean): void {
  for (let i = 0; i < Math.round(sec * 60); i++) {
    mode.update(ctx, 1 / 60);
    vi.advanceTimersByTime(1000 / 60);
    if (until?.()) return;
  }
}
/** 'ready' / 'paused': the wall clock runs, update() is never called. */
const standStill = (sec: number) => vi.advanceTimersByTime(sec * 1000);

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterEach(() => {
  DerbyMode.dispose?.();
  PenaltyMode.dispose?.();
  scene.dispose(); engine.dispose();
  vi.useRealTimers(); vi.restoreAllMocks();
});

describe('Moonshot Derby: pitch 1, 0 outs until the player plays', () => {
  it('10 s in READY after load: still pitch 1, 0 outs, no end', async () => {
    const r = rig();
    await DerbyMode.load(r.ctx);
    expect(r.last('round')).toBe('PITCH 1');
    expect(r.last('outs')).toBe(0);
    standStill(10);
    expect(r.last('round')).toBe('PITCH 1');
    expect(r.last('outs')).toBe(0);
    expect(r.ended).toBeNull();
  });

  it('after wake it advances normally: an unswung pitch is a whiff (1 out), then pitch 2', async () => {
    const r = rig();
    await DerbyMode.load(r.ctx);
    play(DerbyMode, r.ctx, 8, () => r.last('round') === 'PITCH 2');
    expect(r.last('outs')).toBe(1);
    expect(r.last('round')).toBe('PITCH 2');
  });

  it('paused between pitches: the next pitch waits for play (it was a 0.8 s wall timer)', async () => {
    const r = rig();
    await DerbyMode.load(r.ctx);
    play(DerbyMode, r.ctx, 8, () => r.last('outs') === 1);   // the whiff: the gap before pitch 2 begins
    play(DerbyMode, r.ctx, 2 / 60);                            // the frame that schedules pitch 2
    expect(r.last('round')).toBe('PITCH 1');
    standStill(10);
    expect(r.last('round')).toBe('PITCH 1');
    play(DerbyMode, r.ctx, 1);
    expect(r.last('round')).toBe('PITCH 2');
  });

  it('a mount torn down mid-gap leaves nothing behind: the next mount starts at pitch 1 and its first whiff leads to pitch 2', async () => {
    const a = rig();
    await DerbyMode.load(a.ctx);
    play(DerbyMode, a.ctx, 8, () => a.last('outs') === 1);
    play(DerbyMode, a.ctx, 2 / 60);                            // pitch 2 pending on the first mount
    DerbyMode.dispose?.();
    const b = rig();
    await DerbyMode.load(b.ctx);
    standStill(10);                                            // the old mount's gap would have fired in here
    expect(b.last('round')).toBe('PITCH 1');
    play(DerbyMode, b.ctx, 8, () => b.last('round') !== 'PITCH 1');
    expect(b.last('round')).toBe('PITCH 2');                  // not PITCH 3: no pitch was counted behind its back
    expect(a.last('round')).toBe('PITCH 1');                  // and nothing wrote to the torn-down mount
  });
});

describe('Twelve Yards: kick 1/5 until the player plays', () => {
  it('10 s in READY after load: still kick 1/5, the breakaway clock full, no end', async () => {
    const r = rig();
    await PenaltyMode.load(r.ctx);
    expect(r.last('round')).toBe('KICK 1/5');
    const clock = r.last('clock');
    standStill(10);
    expect(r.last('round')).toBe('KICK 1/5');
    expect(r.last('clock')).toBe(clock);
    expect(r.ended).toBeNull();
  });

  it('after wake the breakaway clock runs', async () => {
    const r = rig();
    await PenaltyMode.load(r.ctx);
    const clock = Number(r.last('clock'));
    play(PenaltyMode, r.ctx, 2);
    expect(Number(r.last('clock'))).toBeLessThan(clock);
  });

  it('paused in the result beat after your kick: their kick waits for play (it was a 1.2 s wall timer)', async () => {
    const r = rig();
    await PenaltyMode.load(r.ctx);
    PenaltyMode.onInput!(r.ctx, press('A'));
    play(PenaltyMode, r.ctx, 5, () => r.last('clock') === 0);  // resolveKick: the kick is decided, the beat begins
    expect(r.last('clock')).toBe(0);
    const theirs = () => String(r.last('dive') ?? '').startsWith('THEIR KICK');
    expect(theirs()).toBe(false);
    standStill(10);
    expect(theirs()).toBe(false);
    play(PenaltyMode, r.ctx, 1.5);
    expect(theirs()).toBe(true);
  });
});
