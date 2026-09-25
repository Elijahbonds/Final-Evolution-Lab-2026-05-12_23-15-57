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
/** Every BeatOwner the events build, and what each was asked to play (Slam Rush's gather, HOTFIX 2026-09-24). */
type BeatCall = { fn: 'loop' | 'beat' | 'settle'; clip: string; holdEnd?: boolean };
type MockOwner = { busy: boolean; current: string | null; calls: BeatCall[]; autoEnd: boolean; end(): void };
const owners: MockOwner[] = [];
/** What the Slam Rush ball was dressed as, and which hand it rides. */
const ballRig = { dressed: [] as Array<{ name: string; kind: unknown }>, hands: [] as string[] };

vi.mock('../core/CharacterLibrary', () => ({
  CharacterLibrary: {
    spawn: async (_scene: unknown, _url: string, o: { position?: Vector3 } = {}) => ({
      root: { position: (o.position ?? new Vector3()).clone(), rotation: { x: 0, y: 0, z: 0 } },
      animator: {}, skeleton: {}, dispose: () => undefined,
    }),
  },
}));
vi.mock('../anim/importSanitizer', () => ({ neverBindPose: () => undefined }));
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
vi.mock('./aimSwingCore', () => ({
  buildGoal: () => [],
  Reticle: class { pos = new Vector3(0, 1.2, 11); update(): void {} dispose(): void {} },
  PowerMeter: class { start(): void {} stop(): number { return 0.5; } update(): void {} },
  // the shot arrives at the goal line on the next step, in the frame
  Flight: class {
    active = false;
    constructor(public ball: { position: Vector3 }) {}
    launch(): void { this.active = true; }
    step(): boolean { this.ball.position.set(0, 1, 11); return true; }
  },
}));
vi.mock('../core/Pickups', () => ({
  CoinField: class {
    collected = 0;
    line(): void {}
    update(): number { const g = coinGain.next; coinGain.next = 0; this.collected += g; return g; }
    dispose(): void {}
  },
}));

import { slamRush, strikeStorm, trickGauntlet, hotShot, coinStorm, counterStrike, type CarnivalEvent } from './carnivalEvents';
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

beforeEach(() => { rider.grounded = true; rider.vel.set(0, 0, 0); coinGain.next = 0; owners.length = 0; ballRig.dressed.length = 0; ballRig.hands.length = 0; vi.useFakeTimers(); });
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
    vi.spyOn(Math, 'random').mockReturnValue(0);                    // the charge at the sweet spot, and it drops
    ev.onInput(f.ctx, { t: 'trigger', side: 'R', value: 0.85 } as unknown as FelInput);
    ev.onInput(f.ctx, { t: 'trigger', side: 'R', value: 0 } as unknown as FelInput);
    expect(f.report).toHaveBeenCalledWith(expect.objectContaining({ kind: 'big_make' }));
    f.dispose();
  });

  it('SLAM RUSH: a miss is not a success', async () => {
    const f = fakeCtx(); const ev = slamRush(); await ev.build(f.ctx);
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    ev.onInput(f.ctx, { t: 'trigger', side: 'R', value: 0.85 } as unknown as FelInput);
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
    expect(ballRig.hands).toEqual(['RightHand']);
    f.dispose();
  });
});
