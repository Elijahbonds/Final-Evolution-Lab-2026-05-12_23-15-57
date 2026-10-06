// Carnival events, finish-release pass (2026-09-24): three gaps read off the code (MAP.md "map:threept-carnival-hooks").
//
//   1. TRICK GAUNTLET threw away the TrickMachine's call (the trick and its points, SKETCHY, BANKED, REPEAT, BAILED), so the
//      event was the only one of six with no banner at all.
//   2. The TrickMachine wrote its raw trick total into the HUD as `score` — the carnival's own P1 night total, which the host
//      renders — so a banked combo replaced the night's points with a trick count until the next card.
//   3. No event reported to the momentum bus, so the carnival's crowd bed never swelled.
//
// The events are driven for real (the real TrickMachine, real Babylon meshes on a NullEngine); only the bodies, venues and
// sounds are stubbed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NullEngine, Scene, Vector3 } from '@babylonjs/core';
import type { ModeContext } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';

const rider = { grounded: true, vel: new Vector3(0, 0, 0), update: () => undefined, jump: () => undefined };
const coinGain = { next: 0 };
/** IMPROVE (2026-10-06): where the mocked flight puts the ball on its next step, and whether it is still flying (Hot Shot) */
const shot = { to: new Vector3(3, 1, 11), flying: true };
/** every CoinField built, and every coin line laid on it (Coin Storm) */
const coinFields: Array<{ lines: Array<[Vector3, Vector3, number]>; clears: number; disposed: boolean }> = [];
/** where each spawned body stood at spawn (Coin Storm's whistle spot) */
const spawns: Vector3[] = [];
/** Every BeatOwner the events build, and what each was asked to play (Slam Rush's gather, HOTFIX 2026-09-24). */
type BeatCall = { fn: 'loop' | 'beat' | 'settle'; clip: string; holdEnd?: boolean };
type MockOwner = { busy: boolean; current: string | null; calls: BeatCall[]; autoEnd: boolean; end(): void };
const owners: MockOwner[] = [];
/** What the Slam Rush ball was dressed as, and which hand it rides. */
const ballRig = { dressed: [] as Array<{ name: string; kind: unknown }>, hands: [] as string[] };

vi.mock('../core/CharacterLibrary', () => ({
  CharacterLibrary: {
    spawn: async (_scene: unknown, _url: string, o: { position?: Vector3 } = {}) => {
      spawns.push((o.position ?? new Vector3()).clone());
      return {
        root: { position: (o.position ?? new Vector3()).clone(), rotation: { x: 0, y: 0, z: 0 } },
        animator: {}, skeleton: {}, dispose: () => undefined,
      };
    },
  },
}));
vi.mock('../anim/importSanitizer', () => ({ neverBindPose: () => undefined }));
vi.mock('../anim/mirrored-clips', () => ({ registerMirroredClips: () => undefined }));   // Hot Shot's keeper dives both ways
vi.mock('../anim/clipRegistry', () => ({ installSafePlay: () => undefined, SPORT_CLIP: new Proxy({}, { get: (_t, k) => String(k) }) }));
vi.mock('../anim/beatOwner', () => ({
  // The real BeatOwner's contract: a beat is `busy` until its clip runs out; a holdEnd beat stays busy (held) after it runs
  // out; settle() cuts it. `autoEnd` (the default) runs every beat out at once, as the events' other tests expect; a test
  // that needs a beat to take its time turns it off and calls end() when the clip would run out.
  BeatOwner: class {
    busy = false; current: string | null = null; calls: BeatCall[] = []; autoEnd = true;
    private shot: { holdEnd?: boolean; onSettle?: () => void } | null = null;
    constructor() { owners.push(this); }
    loop(clip: string): void { this.calls.push({ fn: 'loop', clip }); }
    beat(clip: string, o: { onSettle?: () => void; holdEnd?: boolean } = {}): void {
      this.calls.push({ fn: 'beat', clip, holdEnd: o.holdEnd }); this.current = clip; this.busy = true; this.shot = o;
      if (this.autoEnd) this.end();
    }
    end(): void {
      const o = this.shot; if (!o) return;
      this.shot = null;
      if (!o.holdEnd) { this.busy = false; this.current = null; }
      o.onSettle?.();
    }
    settle(): void { this.calls.push({ fn: 'settle', clip: this.current ?? '' }); this.current = null; this.busy = false; this.shot = null; }
  },
}));
vi.mock('../visual/meshyProps', () => ({
  dressBall: async (b: { name: string }, kind: unknown) => { ballRig.dressed.push({ name: b.name, kind }); return true; },
}));
vi.mock('../anim/ballRig', () => ({
  attachBallToHand: (_b: unknown, _sk: unknown, hand: string) => { ballRig.hands.push(hand); return true; },
  trackDrawnBall: () => undefined,   // HOOPS MOTION phase 3: rightHandBall keeps the ball's drawn position (the gather's first step)
}));
vi.mock('../anim/boardTree', () => ({ BoardAnimTree: class { update(): void {} clearBeat(): void {} } }));
vi.mock('../visual/VenueKit', () => ({ VenueKit: { buildCourt: () => undefined, buildDojo: () => undefined, buildField: () => undefined } }));
vi.mock('../visual/EffectsKit', () => ({ EffectsKit: { burst: () => undefined } }));
vi.mock('../audio/SoundKit', () => ({ SoundKit: { play: () => undefined } }));
vi.mock('./modeConfigs', () => ({ DUNK_CONFIG: { heroUrl: 'hero.glb' } }));
vi.mock('./rideWorlds', () => ({ buildSkatepark: () => ({ ground: null, dispose: () => undefined }) }));
vi.mock('./boardCore', async (orig) => ({
  ...(await orig<typeof import('./boardCore')>()),
  buildRig: async () => ({
    rider, char: { root: { position: new Vector3(), rotation: { x: 0, y: 0, z: 0 } }, animator: { play: () => undefined } },
    dispose: () => undefined,
  }),
}));
/** the `alive` each buildGoal was handed (Hot Shot's late Meshy goal, IMPROVE 2026-10-06) */
const goalAlive: Array<() => boolean> = [];
vi.mock('./aimSwingCore', () => ({
  buildGoal: (_scene: unknown, alive?: () => boolean) => { if (alive) goalAlive.push(alive); return []; },
  Reticle: class { pos = new Vector3(0, 1.2, 11); update(): void {} dispose(): void {} },
  PowerMeter: class { start(): void {} stop(): number { return 0.5; } update(): void {} },
  // the shot reaches `shot.to` on the next step (by default a corner of the goal, in the frame)
  Flight: class {
    active = false;
    constructor(public ball: { position: Vector3 }) {}
    launch(): void { this.active = true; }
    step(): boolean { this.ball.position.copyFrom(shot.to); this.active = shot.flying; return shot.flying; }
  },
}));
vi.mock('../core/Pickups', () => ({
  CoinField: class {
    collected = 0;
    rec = { lines: [] as Array<[Vector3, Vector3, number]>, clears: 0, disposed: false };
    constructor() { coinFields.push(this.rec); }
    line(a: Vector3, b: Vector3, n: number): void { this.rec.lines.push([a.clone(), b.clone(), n]); }
    update(): number { const g = coinGain.next; coinGain.next = 0; this.collected += g; return g; }
    clear(): void { this.rec.clears++; this.rec.lines = []; this.collected = 0; }
    dispose(): void { this.rec.disposed = true; }
  },
}));

import {
  slamRush, strikeStorm, trickGauntlet, hotShot, coinStorm, counterStrike, type CarnivalEvent,
  slamMade, SLAM_SWEET, SLAM_TOL, strikeTrio, hotShotKeeper, bannerChannel,
} from './carnivalEvents';
import { TRICKS } from './boardCore';

type Hud = Record<string, unknown>;
function fakeCtx() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const hud: Hud[] = [];
  const report = vi.fn();
  const ctx = {
    scene,
    setHud: (h: Hud) => { hud.push(h); },
    momentum: { report },
    heroRef: { current: null }, objectiveRef: { current: null },
    camDirector: {
      setPreset: () => undefined, snapTo: () => undefined, update: () => undefined, setFixedBehind: () => undefined,
      stickWorldLatched: () => new Vector3(0, 0, 0),
    },
  } as unknown as ModeContext;
  const banners = (): unknown[] => hud.filter((h) => 'banner' in h).map((h) => h.banner);
  const run = (ev: CarnivalEvent, sec: number): void => { for (let i = 0; i < Math.round(sec * 60); i++) ev.tick(ctx, 1 / 60); };
  return { ctx, hud, report, banners, run, dispose: () => { scene.dispose(); engine.dispose(); } };
}
const press = (btn: string): FelInput => ({ t: 'button', btn, pressed: true } as unknown as FelInput);

beforeEach(() => {
  rider.grounded = true; rider.vel.set(0, 0, 0); coinGain.next = 0; owners.length = 0; ballRig.dressed.length = 0; ballRig.hands.length = 0;
  shot.to.set(3, 1, 11); shot.flying = true; coinFields.length = 0; spawns.length = 0; goalAlive.length = 0;
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('TRICK GAUNTLET: the call is the banner (1), the machine keeps off the night total (2), a landing is heard (3)', () => {
  /** pop, throw the trick on B, hold the air for `airSec`, and touch down */
  async function gauntlet() {
    const f = fakeCtx();
    const ev = trickGauntlet();
    await ev.build(f.ctx);
    const trick = (airSec: number): void => {
      rider.grounded = false; ev.onInput(f.ctx, press('B'));   // B with the stick centred = KICKFLIP
      f.run(ev, airSec); rider.grounded = true; ev.tick(f.ctx, 1 / 60);
    };
    return { ...f, ev, trick };
  }

  it('a landed trick is called on the banner, cleared on the event clock, and the bank is called in turn', async () => {
    const { ev, trick, run, banners, dispose } = await gauntlet();
    trick(0.6);
    expect(banners()).toEqual([`${TRICKS.flipA.name} +${TRICKS.flipA.pts}`]);
    run(ev, 1.0);                                                   // the call holds, then clears inside the link window
    expect(banners()).toEqual(['KICKFLIP +120', '']);
    run(ev, 1.0);                                                   // the window runs out: the combo banks and says so
    expect(banners()).toContain('BANKED +120 · KICKFLIP');
    dispose();
  });

  it('a bail is called too', async () => {
    const { trick, banners, dispose } = await gauntlet();
    trick(0.1);                                                     // a tenth of the flip: the bail
    expect(banners()).toEqual(['BAILED']);
    dispose();
  });

  it('the call clears on the event clock, not a timer (a call in the last second must not wipe the result card)', async () => {
    const { ctx, ev, trick, banners, dispose } = await gauntlet();
    trick(0.6);
    ev.tick(ctx, 0);                                                // endAttempt's final read, then the result card
    ctx.setHud({ banner: 'TRICK GAUNTLET: YOU 48 · RIVAL 200' });
    vi.runAllTimers();
    expect(banners().at(-1)).toBe('TRICK GAUNTLET: YOU 48 · RIVAL 200');
    dispose();
  });

  it('a combo still open on the ground at the whistle counts (the zero-step final read never ran its window down)', async () => {
    const { ctx, ev, trick, dispose } = await gauntlet();
    trick(0.6);                                                     // landed, the link window open
    expect(ev.tick(ctx, 0)).toBe(120);                              // endAttempt's read: the open combo is in it
    rider.grounded = false; ev.onInput(ctx, press('Y'));            // up again: this trick is unresolved at the horn
    expect(ev.tick(ctx, 0)).toBe(0);                                // nothing banked yet, and an airborne combo is not counted
    dispose();
  });

  it("the machine's raw trick total never lands on the carnival's `score` key", async () => {
    const { ev, trick, run, hud, dispose } = await gauntlet();
    trick(0.6); run(ev, 2);                                         // land, then bank
    expect(hud.some((h) => 'score' in h)).toBe(false);
    expect(hud.some((h) => 'combo' in h)).toBe(false);
    expect(hud).toContainEqual({ trickScore: 120, trickCombo: '' });
    dispose();
  });

  it('a landed trick reports to the momentum bus; a bail does not', async () => {
    const { trick, report, dispose } = await gauntlet();
    trick(0.6);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0]).toMatchObject({ kind: 'clean_hit' });
    trick(0.1);
    expect(report).toHaveBeenCalledTimes(1);
    dispose();
  });
});

describe('every carnival event reports its successes to the momentum bus (3)', () => {
  it('SLAM RUSH: a make', async () => {
    const f = fakeCtx(); const ev = slamRush(); await ev.build(f.ctx);
    // the charge at the sweet spot: it drops (IMPROVE 2026-10-06: the release decides, no dice)
    ev.onInput(f.ctx, { t: 'trigger', side: 'R', value: 0.85 } as unknown as FelInput);
    ev.onInput(f.ctx, { t: 'trigger', side: 'R', value: 0 } as unknown as FelInput);
    expect(f.report).toHaveBeenCalledWith(expect.objectContaining({ kind: 'big_make' }));
    f.dispose();
  });

  it('SLAM RUSH: a miss is not a success', async () => {
    const f = fakeCtx(); const ev = slamRush(); await ev.build(f.ctx);
    // test changed (IMPROVE 2026-10-06): the miss used to be a 0.85 release with the dice mocked high; the make is the
    // release's own now (SLAM_TOL), so the miss is a release short of the band
    ev.onInput(f.ctx, { t: 'trigger', side: 'R', value: 0.5 } as unknown as FelInput);
    ev.onInput(f.ctx, { t: 'trigger', side: 'R', value: 0 } as unknown as FelInput);
    expect(f.report).not.toHaveBeenCalled();
    f.dispose();
  });

  it('STRIKE STORM: a hit', async () => {
    const f = fakeCtx(); const ev = strikeStorm(); await ev.build(f.ctx);
    ev.onInput(f.ctx, press('A'));
    expect(f.report).toHaveBeenCalledWith(expect.objectContaining({ kind: 'clean_hit' }));
    f.dispose();
  });

  it('HOT SHOT: a goal', async () => {
    const f = fakeCtx(); const ev = hotShot(); await ev.build(f.ctx);
    // test changed (IMPROVE 2026-10-06): the mocked shot went in dead centre, which the new keeper always saves (he stays
    // up or dives through it); it is a corner now (shot.to, x 3), past any dive he can make
    ev.onInput(f.ctx, press('A')); ev.onInput(f.ctx, press('A'));   // power, then shoot
    ev.tick(f.ctx, 1 / 60);
    expect(f.report).toHaveBeenCalledWith(expect.objectContaining({ kind: 'big_make' }));
    f.dispose();
  });

  it('COIN STORM: a cleared wave, not every coin', async () => {
    const f = fakeCtx(); const ev = coinStorm(); await ev.build(f.ctx);
    coinGain.next = 3; ev.tick(f.ctx, 1 / 60);
    expect(f.report).not.toHaveBeenCalled();
    coinGain.next = 11; ev.tick(f.ctx, 1 / 60);                     // 14: the first pattern is cleared
    expect(f.report).toHaveBeenCalledTimes(1);
    expect(f.report).toHaveBeenCalledWith(expect.objectContaining({ kind: 'clean_run' }));
    f.dispose();
  });

  it('COUNTER STRIKE: a counter in the window', async () => {
    const f = fakeCtx(); const ev = counterStrike(); await ev.build(f.ctx);
    vi.spyOn(Math, 'random').mockReturnValue(0);                    // the wind-up comes at 0.4 s
    f.run(ev, 0.45);                                                // the wind-up starts
    f.run(ev, 0.45);                                                // 0.45 s into it: inside 0.35–0.65
    ev.onInput(f.ctx, press('A'));
    expect(f.report).toHaveBeenCalledWith(expect.objectContaining({ kind: 'near_miss' }));
    f.dispose();
  });
});

// HOTFIX (2026-09-24): Slam Rush LOOPED the gather — a one-way clip (standing into the loaded crouch), so the dunker snapped
// back up and crouched again twice a second through a held charge — and its ball was a bare sphere at centre court.
describe('SLAM RUSH: the gather is held, not looped, and the ball is the hoops ball', () => {
  const trigger = (value: number): FelInput => ({ t: 'trigger', side: 'R', value } as unknown as FelInput);
  const gathers = (o: { calls: BeatCall[] }): BeatCall[] => o.calls.filter((c) => c.fn === 'beat' && c.clip === 'dunkChargeGather');

  it('a charge throws the gather ONCE as a held beat, however long it is held', async () => {
    const f = fakeCtx(); const ev = slamRush(); await ev.build(f.ctx);
    const body = owners.at(-1)!;
    ev.onInput(f.ctx, trigger(0.3)); ev.onInput(f.ctx, trigger(0.6)); ev.onInput(f.ctx, trigger(0.85));
    f.run(ev, 2);
    expect(gathers(body)).toEqual([{ fn: 'beat', clip: 'dunkChargeGather', holdEnd: true }]);
    ev.onInput(f.ctx, trigger(0));
    expect(body.calls.at(-1)).toMatchObject({ fn: 'beat', clip: 'dunkLaunchPower' });
    expect(body.calls.some((c) => c.fn === 'loop' && c.clip !== 'idle')).toBe(false);   // the base loop never leaves the idle
    f.run(ev, 1);                                                    // past the cooldown: the next charge gathers again
    ev.onInput(f.ctx, trigger(0.5));
    expect(gathers(body)).toHaveLength(2);
    f.dispose();
  });

  it('a charge squeezed during the launch lets it finish, then gathers', async () => {
    const f = fakeCtx(); const ev = slamRush(); await ev.build(f.ctx);
    const body = owners.at(-1)!;
    body.busy = true;                                                // the launch still in flight
    ev.onInput(f.ctx, trigger(0.4)); ev.tick(f.ctx, 1 / 60);
    expect(gathers(body)).toHaveLength(0);
    body.busy = false;                                               // it settled
    ev.tick(f.ctx, 1 / 60);
    expect(gathers(body)).toEqual([{ fn: 'beat', clip: 'dunkChargeGather', holdEnd: true }]);
    f.dispose();
  });

  // HOTFIX (2026-09-24): a release inside the 0.5 s cooldown was swallowed and the dunker stayed crouched in the load
  it('a release inside the cooldown drops the charge: no launch, the body stands up, the next squeeze gathers anew', async () => {
    const f = fakeCtx(); const ev = slamRush(); await ev.build(f.ctx);
    const body = owners.at(-1)!;
    const launches = () => body.calls.filter((c) => c.clip === 'dunkLaunchPower').length;
    ev.onInput(f.ctx, trigger(0.85)); ev.onInput(f.ctx, trigger(0));   // a dunk: the cooldown starts
    expect(launches()).toBe(1);
    f.run(ev, 0.1);
    ev.onInput(f.ctx, trigger(0.6));                                 // squeezed again inside the cooldown: the load is thrown
    expect(gathers(body)).toHaveLength(2);
    ev.onInput(f.ctx, trigger(0));                                   // …and let go inside it
    expect(launches()).toBe(1);
    expect(body.calls.at(-1)).toEqual({ fn: 'settle', clip: 'dunkChargeGather' });
    f.run(ev, 1);
    expect(gathers(body)).toHaveLength(2);                           // nothing is still charging
    ev.onInput(f.ctx, trigger(0.5));
    expect(gathers(body)).toHaveLength(3);                           // a fresh charge
    ev.onInput(f.ctx, trigger(0));
    expect(launches()).toBe(2);
    f.dispose();
  });

  // HOTFIX (2026-09-24), the common case: the launch clip outlasts the 0.5 s cooldown, so a squeeze inside the cooldown
  // lands on a body still busy with the launch — the gather waits for it.
  it('squeezed and let go during a launch that outlasts the cooldown: no gather, no settle, no second launch', async () => {
    const f = fakeCtx(); const ev = slamRush(); await ev.build(f.ctx);
    const body = owners.at(-1)!;
    body.autoEnd = false;                                            // every beat takes its time now
    const launches = () => body.calls.filter((c) => c.clip === 'dunkLaunchPower').length;
    ev.onInput(f.ctx, trigger(0.85));
    expect(gathers(body)).toHaveLength(1);
    body.end();                                                      // the gather runs out and HOLDS the load
    expect(body.busy).toBe(true);
    ev.onInput(f.ctx, trigger(0));                                   // the dunk: the launch is in flight, the cooldown starts
    expect(launches()).toBe(1);
    f.run(ev, 0.1);
    ev.onInput(f.ctx, trigger(0.6)); f.run(ev, 0.1);                 // squeezed inside the cooldown, during the launch
    expect(gathers(body)).toHaveLength(1);                           // the launch plays out; the gather waits
    ev.onInput(f.ctx, trigger(0));                                   // …and let go, still inside the cooldown
    expect(launches()).toBe(1);
    expect(body.calls.some((c) => c.fn === 'settle')).toBe(false);   // the launch is never cut
    body.end();                                                      // the launch runs out: the body settles to its idle
    expect(body.busy).toBe(false);
    f.run(ev, 1);
    expect(gathers(body)).toHaveLength(1);                           // the dropped charge does not come back as a crouch
    ev.onInput(f.ctx, trigger(0.5));
    expect(gathers(body)).toHaveLength(2);                           // a fresh squeeze gathers
    f.dispose();
  });

  it('a squeeze held through the launch gathers when it lands; let go inside the cooldown, the body stands back up', async () => {
    const f = fakeCtx(); const ev = slamRush(); await ev.build(f.ctx);
    const body = owners.at(-1)!;
    body.autoEnd = false;
    const launches = () => body.calls.filter((c) => c.clip === 'dunkLaunchPower').length;
    ev.onInput(f.ctx, trigger(0.85)); body.end(); ev.onInput(f.ctx, trigger(0));
    ev.onInput(f.ctx, trigger(0.6)); f.run(ev, 0.1);                 // squeezed during the launch
    body.end(); f.run(ev, 1 / 60);                                   // the launch lands, the squeeze is still held
    expect(gathers(body)).toHaveLength(2);                           // tick throws the new gather
    ev.onInput(f.ctx, trigger(0));                                   // let go, still inside the 0.5 s cooldown
    expect(launches()).toBe(1);
    expect(body.calls.at(-1)).toEqual({ fn: 'settle', clip: 'dunkChargeGather' });
    f.dispose();
  });

  it('a release inside the cooldown never cuts a launch still in flight', async () => {
    const f = fakeCtx(); const ev = slamRush(); await ev.build(f.ctx);
    const body = owners.at(-1)!;
    ev.onInput(f.ctx, trigger(0.85)); ev.onInput(f.ctx, trigger(0));
    body.busy = true;                                                // the launch still playing: the gather waits
    ev.onInput(f.ctx, trigger(0.4)); ev.onInput(f.ctx, trigger(0));
    expect(body.calls.some((c) => c.fn === 'settle')).toBe(false);
    expect(body.calls.at(-1)).toMatchObject({ fn: 'beat', clip: 'dunkLaunchPower' });
    f.dispose();
  });

  it("the ball wears the hoops modes' Meshy leather and rides the dunker's right hand", async () => {
    const f = fakeCtx(); const ev = slamRush(); await ev.build(f.ctx);
    expect(ballRig.dressed).toEqual([{ name: 'carn_ball', kind: 'basketball' }]);
    // HOOPS MOTION phase 3: the hand DRAWN on his right — rig LeftHand on the runtime rig (athleteSide's fallback for a stub rig)
    expect(ballRig.hands).toEqual(['LeftHand']);
    f.dispose();
  });
});

// ── IMPROVE (2026-10-06): the owner-picked Carnival list ─────────────────────────────────────────────────────────────
const trig = (value: number): FelInput => ({ t: 'trigger', side: 'R', value } as unknown as FelInput);
/** a fixed sequence for a `rnd` argument */
const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };

describe('SLAM RUSH: the release decides the make (#4), and the charge is on the HUD (#3)', () => {
  it('a make is a release inside the gold band and nothing else — no dice', () => {
    expect([SLAM_SWEET, SLAM_TOL]).toEqual([0.85, 0.12]);
    for (const c of [0.73, 0.8, 0.85, 0.9, 0.97]) expect(slamMade(c), String(c)).toBe(true);
    for (const c of [0, 0.25, 0.5, 0.72, 0.98, 1]) expect(slamMade(c), String(c)).toBe(false);   // 1 = held past the top
  });

  it('the same release scores the same whatever Math.random says', async () => {
    for (const r of [0, 0.5, 0.999]) {
      const f = fakeCtx(); const ev = slamRush(); await ev.build(f.ctx);
      vi.spyOn(Math, 'random').mockReturnValue(r);
      ev.onInput(f.ctx, trig(0.85)); ev.onInput(f.ctx, trig(0)); f.run(ev, 0.6);
      ev.onInput(f.ctx, trig(1)); ev.onInput(f.ctx, trig(0));      // held past the top: too long
      expect(ev.tick(f.ctx, 0), `random ${r}`).toBe(1);
      vi.restoreAllMocks(); f.dispose();
    }
  });

  it('the meter follows the held charge, shows the band, and goes when the charge does (and with the event)', async () => {
    const f = fakeCtx(); const ev = slamRush(); await ev.build(f.ctx);
    expect(f.hud).toContainEqual(expect.objectContaining({ chargeLo: SLAM_SWEET - SLAM_TOL, chargeHi: SLAM_SWEET + SLAM_TOL }));
    const charges = () => f.hud.filter((h) => 'charge' in h).map((h) => h.charge);
    const before = charges().length;
    ev.onInput(f.ctx, trig(0.3)); ev.onInput(f.ctx, trig(0.305)); ev.onInput(f.ctx, trig(0.6));
    expect(charges().slice(before)).toEqual([0.3, 0.6]);           // 2 % steps: a streaming trigger is not a HUD push a frame
    ev.onInput(f.ctx, trig(0));
    expect(charges().at(-1)).toBeNull();
    expect(f.banners().at(-1)).toBe('MISS — TOO SHORT');
    f.run(ev, 0.6);
    ev.onInput(f.ctx, trig(0.9));
    ev.teardown();
    expect(charges().at(-1)).toBeNull();                            // a charge held at the whistle leaves no meter behind
    f.dispose();
  });
});

describe('STRIKE STORM: the mix pays (#11)', () => {
  it('three different buttons in a row close a trio (+1); a repeat starts the trio again', () => {
    expect(strikeTrio([], 'A')).toEqual({ trio: ['A'], bonus: 0 });
    expect(strikeTrio(['A'], 'B')).toEqual({ trio: ['A', 'B'], bonus: 0 });
    expect(strikeTrio(['A', 'B'], 'Y')).toEqual({ trio: [], bonus: 1 });
    expect(strikeTrio(['A', 'B'], 'A')).toEqual({ trio: ['A'], bonus: 0 });
    expect(strikeTrio(['B', 'Y'], 'B')).toEqual({ trio: ['B'], bonus: 0 });
  });

  it('a one-button masher scores what it always did; the same presses mixed score a third more', async () => {
    const masher = fakeCtx(); const a = strikeStorm(); await a.build(masher.ctx);
    for (let i = 0; i < 9; i++) a.onInput(masher.ctx, press('A'));
    expect(a.tick(masher.ctx, 0)).toBe(9);
    const mixer = fakeCtx(); const b = strikeStorm(); await b.build(mixer.ctx);
    for (let i = 0; i < 9; i++) b.onInput(mixer.ctx, press(['A', 'B', 'Y'][i % 3]));
    expect(b.tick(mixer.ctx, 0)).toBe(12);
    expect(mixer.banners().at(-1)).toBe('12 · MIX +1');
    masher.dispose(); mixer.dispose();
  });
});

describe('COUNTER STRIKE: one press per wind-up (#2)', () => {
  async function windUp() {
    const f = fakeCtx(); const ev = counterStrike(); await ev.build(f.ctx);
    vi.spyOn(Math, 'random').mockReturnValue(0);                    // every wind-up comes 0.4 s into the idle
    f.run(ev, 0.45);                                                // the wind-up has begun
    return { ...f, ev };
  }

  it('mashing GO through the wind-up never counters: the first (early) press is the answer', async () => {
    const { ctx, ev, run, banners, dispose } = await windUp();
    for (let i = 0; i < 12; i++) { ev.onInput(ctx, press('A')); run(ev, 0.05); }   // 0.05–0.6 s: right through the window
    expect(ev.tick(ctx, 0)).toBe(0);
    expect(banners()).toContain('TOO EARLY');
    expect(banners().filter((b) => typeof b === 'string' && b.startsWith('COUNTER'))).toEqual([]);
    dispose();
  });

  it('one press in the window still counters, and the next wind-up takes a fresh answer', async () => {
    const { ctx, ev, run, dispose } = await windUp();
    run(ev, 0.45); ev.onInput(ctx, press('A'));                      // ~0.45 s in
    expect(ev.tick(ctx, 0)).toBe(1);
    ev.onInput(ctx, press('A'));                                    // a second press on the same wind-up does nothing
    expect(ev.tick(ctx, 0)).toBe(1);
    run(ev, 0.2 + 0.6 + 0.4 + 0.47);                                // the wind-up's end, the cooldown, the idle, 0.47 s into the next
    ev.onInput(ctx, press('A'));
    expect(ev.tick(ctx, 0)).toBe(2);
    dispose();
  });
});

describe('one banner channel per event (#7)', () => {
  it('a second banner is not wiped by the first one\'s clear', () => {
    const f = fakeCtx(); const ch = bannerChannel();
    ch.flash(f.ctx, 'MAKE 1', 400);
    vi.advanceTimersByTime(300);
    ch.flash(f.ctx, 'MISS', 400);
    vi.advanceTimersByTime(150);                                    // the first clear would have fired here
    expect(f.banners()).toEqual(['MAKE 1', 'MISS']);
    vi.advanceTimersByTime(300);
    expect(f.banners()).toEqual(['MAKE 1', 'MISS', '']);
    f.dispose();
  });

  it('a clear still pending at the whistle never wipes the result card', async () => {
    const f = fakeCtx(); const ev = counterStrike(); await ev.build(f.ctx);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    f.run(ev, 0.45); f.run(ev, 0.45); ev.onInput(f.ctx, press('A'));   // COUNTER 1!, its clear armed
    ev.tick(f.ctx, 0); ev.teardown();                               // the whistle
    f.ctx.setHud({ banner: 'COUNTER STRIKE: YOU 14 · RIVAL 70' });
    vi.runAllTimers();
    expect(f.banners().at(-1)).toBe('COUNTER STRIKE: YOU 14 · RIVAL 70');
    f.dispose();
  });
});

describe('HOT SHOT: a keeper (#14), a shot that dies short (#1), a late goal model (#6)', () => {
  it('the keeper: good / late / stays by the odds, reading the aim side 60 % of the time', () => {
    expect(hotShotKeeper(2, seq(0.1, 0.1))).toEqual({ dive: 1, timing: 'good' });    // read right
    expect(hotShotKeeper(2, seq(0.1, 0.9))).toEqual({ dive: -1, timing: 'good' });   // guessed wrong
    expect(hotShotKeeper(-2, seq(0.5, 0.1))).toEqual({ dive: -1, timing: 'late' });
    expect(hotShotKeeper(-2, seq(0.95))).toEqual({ dive: 0, timing: 'none' });
  });

  async function shootAt(x: number, y = 1, rnd = 0.1) {
    const f = fakeCtx(); const ev = hotShot(); await ev.build(f.ctx);
    vi.spyOn(Math, 'random').mockReturnValue(rnd);                  // 0.1: a GOOD dive to the right side
    shot.to.set(x, y, 11);
    ev.onInput(f.ctx, press('A')); ev.onInput(f.ctx, press('A'));
    const goals = ev.tick(f.ctx, 1 / 60);
    vi.restoreAllMocks();
    return { ...f, ev, goals };
  }

  it('a shot down the middle is saved; a corner beats even a good dive the right way', async () => {
    const mid = await shootAt(0.4);
    expect(mid.goals).toBe(0);
    expect(mid.banners()).toContain('SAVED!');
    expect(mid.report).not.toHaveBeenCalled();
    mid.dispose();
    const corner = await shootAt(3);
    expect(corner.goals).toBe(1);
    corner.dispose();
    const reached = await shootAt(2);                                // inside a good dive's 2.4 m reach, the way he went
    expect(reached.goals).toBe(0);
    reached.dispose();
  });

  it('a ball that stops short of the line is a miss, and the next shot can be taken', async () => {
    const f = fakeCtx(); const ev = hotShot(); await ev.build(f.ctx);
    shot.to.set(0, 0.05, 4); shot.flying = false;                   // a dribbler: it dies on the grass 4 m out
    ev.onInput(f.ctx, press('A')); ev.onInput(f.ctx, press('A'));
    ev.tick(f.ctx, 1 / 60);
    expect(f.banners()).toContain('SHORT — MORE POWER');
    shot.to.set(3, 1, 11); shot.flying = true;                      // the shot after it is live (it used to be locked out)
    ev.onInput(f.ctx, press('A')); ev.onInput(f.ctx, press('A'));
    expect(ev.tick(f.ctx, 1 / 60)).toBe(1);
    f.dispose();
  });

  it('the goal is built with an alive check that turns false at teardown', async () => {
    const f = fakeCtx(); const ev = hotShot(); await ev.build(f.ctx);
    expect(goalAlive).toHaveLength(1);
    expect(goalAlive[0]()).toBe(true);
    ev.teardown();
    expect(goalAlive[0]()).toBe(false);
    f.dispose();
  });
});

describe('COIN STORM: nothing handed out at the whistle (#12), one coin field all event (#19)', () => {
  /** every coin a line lays (CoinField.line's own spacing) */
  const coinsOf = (lines: Array<[Vector3, Vector3, number]>): Vector3[] =>
    lines.flatMap(([a, b, n]) => Array.from({ length: n }, (_, i) => Vector3.Lerp(a, b, n === 1 ? 0 : i / (n - 1))));

  it('the runner starts out of the magnet\'s reach (1.1 m) of every coin of the first pattern', async () => {
    const f = fakeCtx(); const ev = coinStorm(); await ev.build(f.ctx);
    const at = spawns.at(-1)!;
    const nearest = Math.min(...coinsOf(coinFields[0].lines).map((c) => Math.hypot(c.x - at.x, c.z - at.z)));
    expect(nearest).toBeGreaterThan(1.1 * 2);
    f.dispose();
  });

  it('a cleared pattern is laid on the same field, emptied — not a new one', async () => {
    const f = fakeCtx(); const ev = coinStorm(); await ev.build(f.ctx);
    coinGain.next = 14; ev.tick(f.ctx, 1 / 60);                     // the cross cleared: the ring
    coinGain.next = 10; ev.tick(f.ctx, 1 / 60);                     // the ring cleared: the cross again
    expect(coinFields).toHaveLength(1);
    expect(coinFields[0].clears).toBe(2);
    expect(coinFields[0].disposed).toBe(false);
    expect(ev.tick(f.ctx, 0)).toBe(24);
    ev.teardown();
    expect(coinFields[0].disposed).toBe(true);
    f.dispose();
  });
});

describe('2P: an event resets for P2 on its own stage (#16)', () => {
  it('every event but the trick gauntlet resets: the score is back to zero and the next attempt scores again', async () => {
    const all: Array<[CarnivalEvent, (f: ReturnType<typeof fakeCtx>, ev: CarnivalEvent) => void]> = [
      [slamRush(), (f, ev) => { ev.onInput(f.ctx, trig(0.85)); ev.onInput(f.ctx, trig(0)); f.run(ev, 0.6); }],
      [strikeStorm(), (f, ev) => { ev.onInput(f.ctx, press('A')); }],
      [hotShot(), (f, ev) => { ev.onInput(f.ctx, press('A')); ev.onInput(f.ctx, press('A')); ev.tick(f.ctx, 1 / 60); }],
      [coinStorm(), (f, ev) => { coinGain.next = 2; ev.tick(f.ctx, 1 / 60); }],
      [counterStrike(), (f, ev) => { vi.spyOn(Math, 'random').mockReturnValue(0); f.run(ev, 0.45); f.run(ev, 0.45); ev.onInput(f.ctx, press('A')); vi.restoreAllMocks(); }],
    ];
    for (const [ev, score] of all) {
      const f = fakeCtx(); await ev.build(f.ctx);
      const spawned = spawns.length;
      score(f, ev);
      expect(ev.tick(f.ctx, 0), ev.id).toBeGreaterThan(0);
      ev.reset!(f.ctx);
      expect(ev.tick(f.ctx, 0), `${ev.id} after reset`).toBe(0);
      expect(spawns.length, `${ev.id} spawns nothing for P2`).toBe(spawned);
      score(f, ev);
      expect(ev.tick(f.ctx, 0), `${ev.id} P2 scores`).toBeGreaterThan(0);
      ev.teardown(); f.dispose();
    }
    expect(trickGauntlet().reset).toBeUndefined();                 // its rider physics has no reset: it is rebuilt
  });
});
