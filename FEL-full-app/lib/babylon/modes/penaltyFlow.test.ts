// THE PENALTY BEATS BETWEEN THE KICKS (HOTFIX 2026-09-24).
//
// Three things read off PenaltyMode's code in the hotfix review, driven here for real: the real PenaltyMode, the real
// shared Reticle, the real SoccerBall, breakaway and keeper reads, on a NullEngine. Only bodies, venue, sound and
// weather are stubbed.
//
//   1. THE RING. The shared Reticle is stood up now, so it draws as a ring. The BREAKAWAY shot aims off the stick and
//      never reads it, so a ring in the goal mouth said 'aim here' and did not follow the shot. It also sat behind you
//      all through their kick. It is shown only while it aims a kick, and no kick uses it today.
//   2. THE RESULT BEAT AFTER YOUR KICK. resolveKick leaves phase 'aim' for 1.2 s, and the old PLACE kick read that as a
//      new kick. A, A ran the meter and fired a second kick for the same round from where the ball lay, which after a
//      goal is the net: a second pip and a second goal.
//   3. THE RESULT BEAT AFTER THEIR KICK. `dive: ''` sat inside a comment, so the DIVE prompt stayed up under the result
//      banner, and a dive pressed then still played.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NullEngine, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import type { ModeContext } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';

/** Every clip a body was asked to play, by body. */
const plays: Record<string, string[]> = {};

vi.mock('../visual/VenueKit', () => ({
  VenueKit: {
    paint: (scene: Scene, name: string) => new StandardMaterial(name, scene),
    buildField: () => undefined, buildCourt: () => undefined,
  },
}));
vi.mock('../core/CharacterLibrary', () => ({ CharacterLibrary: {} }));
vi.mock('../core/characterPipeline', () => ({ CharacterPipeline: {} }));
vi.mock('../anim/importSanitizer', () => ({ neverBindPose: () => undefined }));
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
  // a still night: no wind to bend the kicks this test reads
  WeatherKit: class { static fromPick() { return new this(); } flightWind() { return { x: 0, z: 0 }; } describe() { return 'CLEAR'; } },
}));
vi.mock('../core/FrameGuard', () => ({ assertSpawned: () => undefined }));
vi.mock('../anim/PostureLayer', () => ({ mountPostureLayer: () => ({ dispose: () => undefined }) }));
vi.mock('../anim/mirrored-clips', () => ({ registerMirroredClips: () => undefined }));
vi.mock('../anim/clipRegistry', () => ({ installSafePlay: () => undefined, SPORT_CLIP: new Proxy({}, { get: (_t, k) => String(k) }) }));
vi.mock('../anim/beatOwner', () => ({
  BeatOwner: class {
    constructor(private animator: { who: string }) {}
    loop(clip: string): void { (plays[this.animator.who] ??= []).push(`loop:${clip}`); }
    beat(clip: string): void { (plays[this.animator.who] ??= []).push(clip); }
  },
}));
vi.mock('../audio/SoundKit', () => ({
  SoundKit: { play: () => undefined, unlock: () => undefined, startAmbient: () => undefined, stopAmbient: () => undefined },
}));
vi.mock('./aimSwingCore', async (orig) => {
  const real = await orig<typeof import('./aimSwingCore')>();
  const body = async (ctx: ModeContext, _url: string, pos: Vector3, yaw: number) => {
    const root = new TransformNode(`body_${pos.z}`, ctx.scene);
    root.position.copyFrom(pos); root.rotation.set(0, yaw, 0);
    const who = pos.z > 5 ? 'keeper' : 'me';
    return { root, animator: { who }, skeleton: {}, dispose: () => root.dispose() };
  };
  return { ...real, buildGoal: () => [], spawnAthlete: body, spawnFoe: body };
});

import { PenaltyMode } from './precisionModes';

type Hud = Record<string, unknown>;
const press = (btn: 'A'): FelInput => ({ t: 'button', btn, pressed: true });
const dpad = (dir: 'left' | 'right'): FelInput => ({ t: 'dpad', dir, pressed: true });

let engine: NullEngine;
let scene: Scene;
const hud: Hud[] = [];
const callouts: string[] = [];
let ended: unknown[] | null = null;

function fakeCtx(): ModeContext {
  return {
    scene,
    setHud: (h: Hud) => { hud.push(h); },
    end: (...a: unknown[]) => { ended = a; },
    heroRef: { current: null }, objectiveRef: { current: null },
    lights: { tier: 'low' },
    juice: {
      hitStop: () => undefined, shake: () => undefined, flash: () => undefined, scorePop: () => undefined,
      callout: (text: string) => { callouts.push(text); },
    },
    camDirector: { setPreset: () => undefined, snapTo: () => undefined, update: () => undefined, setFixedBehind: () => undefined },
  } as unknown as ModeContext;
}

/** The last value the HUD was given for `key`. */
const last = (key: string): unknown => { for (let i = hud.length - 1; i >= 0; i--) if (key in hud[i]) return hud[i][key]; return undefined; };
const ring = () => scene.getMeshByName('reticle')!;
/** Frames at 60 Hz, with the mode's own timers (the result beats) running on the same clock. */
function frames(ctx: ModeContext, sec: number, each?: () => void): void {
  for (let i = 0; i < Math.round(sec * 60); i++) {
    PenaltyMode.update!(ctx, 1 / 60);
    vi.advanceTimersByTime(1000 / 60);
    each?.();
  }
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.99);   // he reads it wrong, and never parries
  engine = new NullEngine();
  scene = new Scene(engine);
  hud.length = 0; callouts.length = 0; ended = null;
  for (const k of Object.keys(plays)) delete plays[k];
});
afterEach(() => {
  PenaltyMode.dispose?.();
  scene.dispose(); engine.dispose();
  vi.useRealTimers(); vi.restoreAllMocks();
});

/** Load, strike on the first frame of the breakaway, and let the ball arrive. Math.random 0.99 sends the keeper the
 *  wrong way, so this is a goal. */
async function scoreKickOne(ctx: ModeContext): Promise<void> {
  await PenaltyMode.load(ctx);
  expect(last('round')).toBe('KICK 1/5');
  PenaltyMode.onInput!(ctx, press('A'));
  for (let i = 0; i < 300 && last('clock') !== 0; i++) frames(ctx, 1 / 60);
  expect(last('clock')).toBe(0);                     // resolveKick's HUD write: the kick is decided
}

describe('penalty: the aim ring', () => {
  it('stays hidden through the breakaway, the result beat and their kick', async () => {
    const ctx = fakeCtx();
    await PenaltyMode.load(ctx);
    expect(ring().isEnabled(false)).toBe(false);
    const shown: number[] = [];
    let f = 0;
    PenaltyMode.onInput!(ctx, press('A'));
    frames(ctx, 6, () => { f++; if (ring().isEnabled(false)) shown.push(f); });
    expect(hud.some((h) => String(h.dive ?? '').startsWith('THEIR KICK'))).toBe(true);   // their kick was in the six seconds
    expect(String(last('dive'))).toBe('');           // …and has come and gone
    expect(shown).toEqual([]);
  });
});

describe('penalty: the result beat after your kick', () => {
  it('takes no kick: A, A cannot fire a second kick for the same round', async () => {
    const ctx = fakeCtx();
    await scoreKickOne(ctx);
    expect(last('goals')).toBe(1);
    expect(last('kicksYou')).toBe('● · · · ·');
    const hudAt = hud.length;
    PenaltyMode.onInput!(ctx, press('A'));            // the meter would start here
    frames(ctx, 0.1);
    PenaltyMode.onInput!(ctx, press('A'));            // and the second kick leave here, from the ball in the net
    frames(ctx, 1.2);                                 // past the 1.2 s beat: their kick has started
    expect(String(last('dive'))).toMatch(/^THEIR KICK/);
    expect(last('goals')).toBe(1);
    expect(last('kicksYou')).toBe('● · · · ·');
    expect(callouts).not.toContain('POWER — KICK AT THE TOP');
    expect(hud.slice(hudAt).some((h) => 'power' in h)).toBe(false);
  });
});

describe('penalty: the result beat after their kick', () => {
  it('clears the dive prompt with the result, and a dive pressed then is not played', async () => {
    const ctx = fakeCtx();
    await scoreKickOne(ctx);
    frames(ctx, 1.25);                                // the keeper round starts at 1.2 s
    expect(String(last('dive'))).toMatch(/^THEIR KICK/);
    const kicksThem = String(last('kicksThem'));
    for (let i = 0; i < 300 && String(last('kicksThem')) === kicksThem; i++) frames(ctx, 1 / 60);
    expect(String(last('kicksThem'))).not.toBe(kicksThem);   // their kick is decided
    expect(last('dive')).toBe('');                   // and the prompt went with it
    const before = (plays.me ?? []).length;
    PenaltyMode.onInput!(ctx, dpad('left'));
    PenaltyMode.onInput!(ctx, { t: 'stick', side: 'L', x: 0.9, y: 0 });
    expect((plays.me ?? []).slice(before).filter((c) => c.startsWith('keeperDive'))).toEqual([]);
    frames(ctx, 1.4);                                 // the beat ends and kick two begins
    expect(last('round')).toBe('KICK 2/5');
  });
});
