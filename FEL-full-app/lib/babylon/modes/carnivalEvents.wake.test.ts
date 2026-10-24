// S1 HITCH-KILLER (ALL-MODES-TO-75 §2, CC75-2, 2026-10-22): every real carnival event can be put on from a build made behind the
// GAME NIGHT board. CourtCarnivalMode builds the night there, parks each event, and at its card calls `wake` — which must spawn
// nothing and put back what the build's whistle set (the camera on the event, the hero, the hint). The events are the real six;
// bodies, venues and sounds are stubbed as in carnivalEvents.test.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import type { ModeContext } from '../core/ModeHarness';

const spawns: string[] = [];
const goalParents: unknown[] = [];
vi.mock('../core/CharacterLibrary', () => ({
  CharacterLibrary: {
    spawn: async (_scene: unknown, _url: string, o: { position?: Vector3 } = {}) => {
      spawns.push('spawn');
      return { root: { position: (o.position ?? new Vector3()).clone(), rotation: { x: 0, y: 0, z: 0 } }, animator: {}, skeleton: {}, dispose: () => undefined };
    },
  },
}));
vi.mock('../anim/importSanitizer', () => ({ neverBindPose: () => undefined }));
vi.mock('../anim/mirrored-clips', () => ({ registerMirroredClips: () => undefined }));
vi.mock('../anim/clipRegistry', () => ({ installSafePlay: () => undefined, SPORT_CLIP: new Proxy({}, { get: (_t, k) => String(k) }) }));
vi.mock('../anim/beatOwner', () => ({ BeatOwner: class { busy = false; loop(): void {} beat(): void {} settle(): void {} } }));
vi.mock('../anim/dunkHand', () => ({ rightHandDunks: () => undefined }));
vi.mock('../anim/hoopsHand', () => ({ rightHandHoops: () => undefined, rightHandBall: () => undefined, hoopsHand: () => 'RightHand' }));
vi.mock('../visual/meshyProps', () => ({ dressBall: async () => true }));
vi.mock('../anim/ballRig', () => ({ attachBallToHand: () => true, trackDrawnBall: () => undefined }));
vi.mock('../anim/boardTree', () => ({ BoardAnimTree: class { update(): void {} clearBeat(): void {} } }));
vi.mock('../visual/VenueKit', () => ({ VenueKit: { buildCourt: () => undefined, buildDojo: () => undefined, buildField: () => undefined } }));
vi.mock('../visual/EffectsKit', () => ({ EffectsKit: { burst: () => undefined } }));
vi.mock('../audio/SoundKit', () => ({ SoundKit: { play: () => undefined } }));
vi.mock('./modeConfigs', () => ({ DUNK_CONFIG: { heroUrl: 'hero.glb' } }));
vi.mock('./rideWorlds', () => ({ buildSkatepark: () => ({ ground: null, dispose: () => undefined }) }));
vi.mock('./boardCore', async (orig) => ({
  ...(await orig<typeof import('./boardCore')>()),
  buildRig: async () => {
    spawns.push('rig');
    return {
      rider: { grounded: true, vel: new Vector3(), update: () => undefined, jump: () => undefined },
      char: { root: { position: new Vector3(0, 0, -6), rotation: { x: 0, y: 0, z: 0 } }, animator: { play: () => undefined } }, dispose: () => undefined,
    };
  },
}));
vi.mock('./aimSwingCore', () => ({
  buildGoal: (_s: unknown, _alive?: () => boolean, parent?: unknown) => { goalParents.push(parent); return []; },
  Reticle: class { pos = new Vector3(0, 1.2, 11); update(): void {} dispose(): void {} },
  PowerMeter: class { start(): void {} stop(): number { return 0.5; } update(): void {} },
  Flight: class { active = false; launch(): void {} step(): boolean { return false; } },
}));
vi.mock('../core/Pickups', () => ({
  CoinField: class { collected = 0; line(): void {} update(): number { return 0; } clear(): void {} dispose(): void {} },
}));

import { allCarnivalEvents } from './carnivalEvents';

let engine: NullEngine | null = null;
afterEach(() => { engine?.dispose(); engine = null; spawns.length = 0; goalParents.length = 0; });

function fakeCtx() {
  engine = new NullEngine();
  const scene = new Scene(engine);
  const cam: string[] = [];
  const hints: string[] = [];
  const ctx = {
    scene, momentum: { report: () => undefined },
    setHud: (h: { hint?: string }) => { if (h.hint) hints.push(h.hint); },
    heroRef: { current: null as unknown }, objectiveRef: { current: null },
    camDirector: {
      setPreset: (p: string) => { cam.push(`preset:${p}`); }, snapTo: () => { cam.push('snap'); }, update: () => undefined,
      setFixedBehind: () => { cam.push('fixedBehind'); }, stickWorldLatched: () => new Vector3(),
    },
  } as unknown as ModeContext;
  return { ctx, cam, hints };
}

describe('S1 HITCH: every carnival event wakes from a build made behind the board', () => {
  it('all six have a wake (the mode builds and parks only those)', () => {
    const evs = allCarnivalEvents();
    expect(evs.map((e) => e.id).sort()).toEqual(['coin_storm', 'counter_strike', 'hot_shot', 'slam_rush', 'strike_storm', 'trick_gauntlet']);
    expect(evs.filter((e) => typeof e.wake !== 'function').map((e) => e.id)).toEqual([]);
  });

  for (const id of ['slam_rush', 'strike_storm', 'trick_gauntlet', 'hot_shot', 'coin_storm', 'counter_strike']) {
    it(`${id}: wake spawns nothing and aims the camera at the event, its hero and its hint back on`, async () => {
      const ev = allCarnivalEvents().find((e) => e.id === id)!;
      const f = fakeCtx();
      await ev.build(f.ctx);
      const built = spawns.length;
      expect(built).toBeGreaterThan(0);
      const hero = f.ctx.heroRef.current;
      const hint = f.hints.at(-1);
      // the hub takes the frame between the build (behind the board) and the card
      f.ctx.heroRef.current = null; f.cam.length = 0; f.hints.length = 0;
      ev.wake!(f.ctx);
      expect(spawns.length).toBe(built);                          // nothing spawned at the card
      expect(f.cam.some((c) => c.startsWith('preset:') || c === 'fixedBehind')).toBe(true);
      if (hero) expect(f.ctx.heroRef.current).toBe(hero);
      if (hint) expect(f.hints.at(-1)).toBe(hint);
      ev.teardown();
    });
  }

  it('hot_shot: the late Meshy goal lands under a node of the event (parked with it), not at the scene root', async () => {
    const ev = allCarnivalEvents().find((e) => e.id === 'hot_shot')!;
    const f = fakeCtx();
    await ev.build(f.ctx);
    expect(goalParents.length).toBe(1);
    const parent = goalParents[0] as TransformNode;
    expect(parent).toBeInstanceOf(TransformNode);
    expect(parent.parent).toBeNull();                             // a root the build added: the mode's park gathers it
    expect(parent.position.equals(Vector3.Zero())).toBe(true);    // at the origin: the goal's fit is in world metres
    ev.teardown();
    expect(parent.isDisposed()).toBe(true);
  });
});
