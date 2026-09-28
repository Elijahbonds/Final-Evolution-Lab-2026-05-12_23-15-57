import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PoseSource, holdSharedPoseSource, peekSharedPoseSource, sharedPoseSource, type BodyHook, type PoseServiceLike,
} from './poseSource';
import { PoseService, type PoseDeps, type PoseStatus } from '../pose/PoseService';
import { BodyReader } from '../pose/BodyReader';
import { ChannelReader } from '../pose/bodyChannels';
import type { PoseFrame } from '../pose/landmarks';
import type { PoseFixture } from '../pose/synth';
import { InputBus, liveInputBuses, type BodyPacket } from '../babylon/core/InputBus';
import { stripComments } from '../testing/sourceScan';

// MOVEMENT PLAY P3 (2026-09-24): body control is the body channel now. The source reads every camera frame PoseService
// hands it (BodyReader, then ChannelReader) and publishes the packet to the running modes; it presses nothing itself.
// Driven through the service's own dev feed (no camera), or a stand-in service where a test needs the camera's own
// failures. What is pinned: the frames drive it (no render loop), one packet per frame carrying exactly what the readers
// say, 'calibrating' until the reader has its stand, and a FINAL packet whenever the body stops being this one —
// re-centred, switched off, the camera refused or gone, the feed ended — so a running mode always lets go.
// MOVEMENT PLAY P4 (2026-09-25): the reader takes its stand from the space check now (setCalibration), never by
// itself; the P3 tests above run the old self-calibrating reader (AUTO), which only the dev probe keeps.

const g = globalThis as unknown as Record<string, unknown>;

/** A service with no camera behind it: the feed is its only source, and a camera start is refused or never answers. */
function service(o: { refuse?: boolean } = {}) {
  const asked: MediaStreamConstraints[] = [];
  const deps: PoseDeps = {
    getUserMedia: (c) => {
      asked.push(c);
      return o.refuse ? Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })) : new Promise(() => {});
    },
    makeVideo: () => ({}) as HTMLVideoElement,
    playVideo: () => Promise.reject(new Error('no video in a test')),
    releaseVideo: () => {},
    loadDetector: () => Promise.reject(new Error('no model in a test')),
    onVideoFrames: () => () => {},
    now: () => 0,
    env: () => ({ userAgent: 'test', portrait: false, search: '' }),
    storage: { get: () => null, set: () => {} },
    setTimer: () => 0,
    clearTimer: () => {},
    warn: () => {},
  };
  return { svc: new PoseService(deps), asked };
}

/** A live camera with nothing behind it: the test moves its status and hands it frames. */
function camera() {
  const IDLE: PoseStatus = { state: 'idle', why: null, source: null, model: null, modelWhy: null, camera: null };
  const statusCbs = new Set<(s: PoseStatus) => void>();
  const frameCbs = new Set<(f: PoseFrame) => void>();
  const svc = {
    status: IDLE,
    set(s: Partial<PoseStatus>) { svc.status = { ...svc.status, ...s }; for (const cb of [...statusCbs]) cb(svc.status); },
    frame(f: PoseFrame) { for (const cb of [...frameCbs]) cb(f); },
    start: async () => { svc.set({ state: 'live', source: 'camera', model: 'full' }); return true; },
    stop: () => { svc.set(IDLE); },
    onStatus: (cb: (s: PoseStatus) => void) => { statusCbs.add(cb); return () => { statusCbs.delete(cb); }; },
    onFrame: (cb: (f: PoseFrame) => void) => { frameCbs.add(cb); return () => { frameCbs.delete(cb); }; },
  };
  return svc satisfies PoseServiceLike;
}

const fx = JSON.parse(readFileSync(join(__dirname, '..', 'pose', '__fixtures__', 'stand_still.json'), 'utf8')) as PoseFixture;
/** The owner standing still: the reader takes its stand from these (calibrated at frame 19). */
const stand = fx.frames;
/** The same stand again, later on the same clocks (a reader never reads a frame older than its last). */
const later = (frames: readonly PoseFrame[], ms: number): PoseFrame[] =>
  frames.map((f) => ({ ...f, t: f.t + ms, arrive: (f.arrive ?? f.t) + ms }));

/** P3's self-calibrating reader: the dev probe's (__FEL_BODY__) and these tests'. The player's source waits for the
 *  space check's rulers instead (movement play P4; the tests of that are below). */
const AUTO = { autoCalibrate: true } as const;

/** A source publishing into a list. */
function rig(svc: PoseServiceLike) {
  const packets: BodyPacket[] = [];
  const src = new PoseSource({}, svc, (p) => packets.push(p));
  return { src, packets };
}

describe('body control publishes the body (no mapper, no render loop)', () => {
  beforeEach(() => {
    // no render loop: a requestAnimationFrame call is a failure
    g.requestAnimationFrame = () => { throw new Error('poseSource must not run on requestAnimationFrame'); };
    g.cancelAnimationFrame = () => {};
  });
  afterEach(() => { delete g.requestAnimationFrame; delete g.cancelAnimationFrame; });

  it('each frame is one packet: the reader\'s read and events, the channels, and the frame\'s arrival', async () => {
    const { svc } = service();
    svc.beginFeed();
    const { src, packets } = rig(svc);
    expect(await src.start(AUTO)).toBe(true);
    expect(packets).toEqual([]);                        // nothing until a frame comes

    const reader = new BodyReader(), channels = new ChannelReader();
    const expected = stand.slice(0, 40).map((f) => {
      const { read, events } = reader.read(f);
      return { read, events, channels: channels.step(read, events), arrivedAt: f.arrive };
    });
    for (const f of stand.slice(0, 40)) svc.pushFeed(f);
    expect(packets).toEqual(expected);
    expect(packets.every((p) => !p.final)).toBe(true);
    src.stop();
  });

  it('shows calibrating until the reader has its stand, then live; the body dot is read.tracking', async () => {
    const { svc } = service();
    svc.beginFeed();
    const { src, packets } = rig(svc);
    await src.start(AUTO);
    expect(src.snapshot).toEqual({ state: 'calibrating', detail: '', body: false });
    const seen: string[] = [];
    src.listen((s) => seen.push(`${s.state}:${s.body}`));
    for (const f of stand) {
      svc.pushFeed(f);
      const p = packets[packets.length - 1];
      expect(src.state).toBe(p.read.calibrated ? 'live' : 'calibrating');
      expect(src.snapshot.body).toBe(p.read.tracking);
    }
    expect(packets.findIndex((p) => p.read.calibrated)).toBe(19);
    expect(src.snapshot).toEqual({ state: 'live', detail: '', body: true });
    expect(seen[seen.length - 1]).toBe('live:true');
    src.stop();
  });

  it('a publisher that throws on a frame still leaves the Body button showing that frame (the step-3 review)', async () => {
    const { svc } = service();
    svc.beginFeed();
    const src = new PoseSource({}, svc, () => { throw new Error('a running mode blew up on this packet'); });
    await src.start(AUTO);
    for (const f of stand) svc.pushFeed(f);            // PoseService reports each throw (deps.warn) and carries on
    expect(src.snapshot).toEqual({ state: 'live', detail: '', body: true });
    // and switching off still switches off: the final packet's throw is reported, the camera stopped, the button off
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => src.stop()).not.toThrow();
    expect(err).toHaveBeenCalledTimes(1);
    expect(svc.state).toBe('idle');
    expect(src.snapshot).toEqual({ state: 'idle', detail: '', body: false });
    err.mockRestore();
  });

  it('re-centring sends a final packet first (the mode lets go), then takes a new stand', async () => {
    const { svc } = service();
    svc.beginFeed();
    const { src, packets } = rig(svc);
    await src.start(AUTO);
    for (const f of stand) svc.pushFeed(f);
    expect(src.state).toBe('live');
    const before = packets.length;
    src.recalibrate();
    expect(packets.length).toBe(before + 1);
    const fin = packets[before];
    expect(fin.final).toBe(true);
    expect(fin.read.present).toBe(false);
    expect(fin.read.tracking).toBe(false);
    expect(fin.events).toEqual([]);
    expect(fin.channels).toEqual({ inJump: false, stride: null, handsUpMs: 0, handsDownMs: 0 });
    expect(src.state).toBe('calibrating');
    const again = later(stand, 4000);
    svc.pushFeed(again[0]);
    expect(packets[packets.length - 1].read.calibrated).toBe(false);   // the old stand is gone
    for (const f of again.slice(1)) svc.pushFeed(f);
    expect(src.state).toBe('live');
    src.recalibrate();
    src.recalibrate();                                  // nothing went out since: no second final
    expect(packets.filter((p) => p.final)).toHaveLength(2);
    src.stop();
  });

  it('switching off sends one final packet, stops the camera, and reads nothing more', async () => {
    const { svc } = service();
    svc.beginFeed();
    const { src, packets } = rig(svc);
    await src.start(AUTO);
    for (const f of stand.slice(0, 30)) svc.pushFeed(f);
    src.stop();
    expect(packets[packets.length - 1].final).toBe(true);
    expect(svc.state).toBe('idle');
    expect(src.snapshot).toEqual({ state: 'idle', detail: '', body: false });
    const n = packets.length;
    src.stop();
    svc.pushFeed(stand[40]);                            // the feed again, with the source off
    expect(packets).toHaveLength(n);
    // on again: a new reader from scratch (calibrating on the next stand)
    await src.start(AUTO);
    for (const f of later(stand, 5000)) svc.pushFeed(f);
    expect(packets.slice(n).findIndex((p) => p.read.calibrated)).toBeGreaterThan(0);
    src.stop();
  });

  it('when the service stops under it (the feed ended), it sends the final packet and goes idle', async () => {
    const { svc } = service();
    svc.beginFeed();
    const { src, packets } = rig(svc);
    await src.start(AUTO);
    for (const f of stand.slice(0, 30)) svc.pushFeed(f);
    svc.endFeed();
    expect(src.state).toBe('idle');
    expect(packets[packets.length - 1].final).toBe(true);
    expect(packets.filter((p) => p.final)).toHaveLength(1);
  });

  it('a camera that fails after frames sends the final packet and shows why; the reader starts over', async () => {
    const svc = camera();
    const { src, packets } = rig(svc);
    await src.start(AUTO);
    expect(src.state).toBe('calibrating');
    for (const f of stand) svc.frame(f);
    expect(src.state).toBe('live');
    svc.set({ state: 'error', why: 'The camera stopped: unplugged, or taken by another app.' });
    expect(packets[packets.length - 1].final).toBe(true);
    expect(src.snapshot).toEqual({ state: 'error', detail: 'The camera stopped: unplugged, or taken by another app.', body: false });
    const n = packets.length;
    svc.frame(later(stand, 4000)[0]);                   // stragglers after the failure are not read
    expect(packets).toHaveLength(n);
    await src.start(AUTO);                                  // the next click: a fresh reader, calibrating again
    const again = later(stand, 8000);
    svc.frame(again[0]);
    expect(packets[packets.length - 1].read.calibrated).toBe(false);
    src.stop();
  });

  it('the feed taking the camera\'s place is a new body: a final packet, and a new stand', async () => {
    const svc = camera();
    const { src, packets } = rig(svc);
    await src.start(AUTO);
    for (const f of stand) svc.frame(f);
    expect(src.state).toBe('live');
    svc.set({ source: 'feed', model: null });
    expect(packets[packets.length - 1].final).toBe(true);
    expect(src.state).toBe('calibrating');
    src.stop();
  });

  it('a refused camera shows why and stays off, publishing nothing; the next click asks again', async () => {
    const { svc, asked } = service({ refuse: true });
    const { src, packets } = rig(svc);
    expect(await src.start()).toBe(false);
    expect(src.snapshot.state).toBe('error');
    expect(src.snapshot.detail).toMatch(/refused/);
    expect(await src.start()).toBe(false);
    expect(asked).toHaveLength(2);
    expect(packets).toEqual([]);                        // no body ever went out, so there is nothing to let go of
  });

  it('an unmount that never switched body on leaves the service alone and publishes nothing', () => {
    const { svc } = service();
    svc.beginFeed();
    const { src, packets } = rig(svc);
    src.stop();
    expect(svc.status.source).toBe('feed');
    expect(packets).toEqual([]);
  });

  it('the two Body buttons share one source and one camera, with no bus of their own; the last to unmount stops it', async () => {
    const { svc } = service();
    svc.beginFeed();
    expect(peekSharedPoseSource()).toBeNull();          // nothing is built until a Body button asks
    const header = sharedPoseSource(svc), compact = sharedPoseSource(svc);
    expect(compact).toBe(header);
    expect(peekSharedPoseSource()).toBe(header);
    const releaseHeader = holdSharedPoseSource(), releaseCompact = holdSharedPoseSource();
    await compact.start();
    expect(header.state).toBe('calibrating');   // switched on in one, on in both
    releaseCompact();
    releaseCompact();                           // a second release of the same hold does nothing
    expect(header.state).toBe('calibrating');
    releaseHeader();
    expect(header.state).toBe('idle');
    expect(svc.state).toBe('idle');
  });
});

describe('the space check gates the source (movement play P4)', () => {
  beforeEach(() => {
    g.requestAnimationFrame = () => { throw new Error('poseSource must not run on requestAnimationFrame'); };
    g.cancelAnimationFrame = () => {};
  });
  afterEach(() => { delete g.requestAnimationFrame; delete g.cancelAnimationFrame; });

  /** The rulers the space check hands over: here, the reader's own on the same stand (calibrate.ts either way). */
  function checkRulers() {
    const r = new BodyReader();
    for (const f of stand) r.read(f);
    return r.calibration!;
  }

  it('by default the reader never calibrates itself: a still stand stays uncalibrated, and the button says so', async () => {
    const { svc } = service();
    svc.beginFeed();
    const { src, packets } = rig(svc);
    await src.start();
    for (const f of stand) svc.pushFeed(f);
    expect(packets).toHaveLength(stand.length);
    expect(packets.filter((p) => p.read.calibrated)).toEqual([]);
    expect(packets.every((p) => p.channels.handsUpMs === 0)).toBe(true);   // the START hold counts only a calibrated body
    expect(src.calibration).toBeNull();
    expect(src.state).toBe('calibrating');
    src.stop();
  });

  it('the check\'s rulers: the next packet is calibrated with them, and the button goes live', async () => {
    const { svc } = service();
    svc.beginFeed();
    const { src, packets } = rig(svc);
    await src.start();
    for (const f of stand.slice(0, 30)) svc.pushFeed(f);
    const cal = checkRulers();
    const seen: string[] = [];
    src.listen((x) => seen.push(x.state));
    src.setCalibration(cal);
    expect(src.calibration).toBe(cal);
    expect(src.state).toBe('live');
    expect(seen).toEqual(['live']);
    svc.pushFeed(later(stand, 3000)[0]);
    const p = packets[packets.length - 1];
    expect(p.read.calibrated).toBe(true);
    expect(p.read.rulers!.floorY).toEqual(cal.floorY);
    src.stop();
  });

  it('re-centred after it: a final packet, calibrating again, and the stand does not calibrate it — the check must', async () => {
    const { svc } = service();
    svc.beginFeed();
    const { src, packets } = rig(svc);
    await src.start();
    for (const f of stand.slice(0, 10)) svc.pushFeed(f);
    src.setCalibration(checkRulers());
    svc.pushFeed(stand[10]);
    const before = packets.length;
    src.recalibrate();
    expect(packets[before].final).toBe(true);
    expect(src.state).toBe('calibrating');
    for (const f of later(stand, 4000)) svc.pushFeed(f);
    expect(packets.slice(before + 1).filter((p) => p.read.calibrated)).toEqual([]);
    expect(src.calibration).toBeNull();
    src.stop();
  });

  it('a new start is a fresh reader: the last session\'s rulers do not carry over', async () => {
    const { svc } = service();
    svc.beginFeed();
    const { src, packets } = rig(svc);
    await src.start();
    svc.pushFeed(stand[0]);
    src.setCalibration(checkRulers());
    src.stop();
    svc.beginFeed();
    await src.start();
    expect(src.calibration).toBeNull();
    svc.pushFeed(later(stand, 5000)[0]);
    expect(packets[packets.length - 1].read.calibrated).toBe(false);
    src.stop();
    // …and the dev probe's start still calibrates itself, as P3's did
    svc.beginFeed();
    await src.start(AUTO);
    for (const f of later(stand, 9000)) svc.pushFeed(f);
    expect(packets[packets.length - 1].read.calibrated).toBe(true);
    src.stop();
  });

  it('no player path starts a self-calibrating reader: `autoCalibrate: true` lives in tests and the dev probe alone', () => {
    const ROOT = join(__dirname, '..', '..');
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const rel = join(dir, e.name);
        if (e.isDirectory()) walk(rel);
        else if (/\.(ts|tsx|mts)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
          const src = stripComments(readFileSync(join(ROOT, rel), 'utf8'));
          if (/autoCalibrate\s*:\s*true/.test(src)) hits.push(rel);
        }
      }
    };
    for (const d of ['lib', 'components', 'app', 'hooks', 'scripts']) if (existsSync(join(ROOT, d))) walk(d);
    expect(hits.filter((f) => !f.startsWith(join('scripts', 'probes')))).toEqual([]);
    // the source's own default is the gated reader
    const own = stripComments(readFileSync(join(__dirname, 'poseSource.ts'), 'utf8'));
    expect(own).toContain('new BodyReader({ autoCalibrate: opts.autoCalibrate ?? false })');
  });
});

describe('the packets reach the running mode', () => {
  // node, not jsdom: somewhere for a bus's listeners and poll loop to attach (as poseControl.bus.test.ts)
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  beforeEach(() => {
    g.window = { addEventListener() {}, removeEventListener() {} };
    Object.defineProperty(g, 'navigator', { value: { getGamepads: () => [] }, configurable: true, writable: true });
    g.requestAnimationFrame = () => 0;
    g.cancelAnimationFrame = () => {};
    liveInputBuses().forEach((b) => b.stop());
  });
  afterEach(() => {
    liveInputBuses().forEach((b) => b.stop());
    delete g.window; delete g.requestAnimationFrame; delete g.cancelAnimationFrame;
    if (nav) Object.defineProperty(globalThis, 'navigator', nav);
  });

  it('by default every running bus gets each packet, and a stopped one none; switching off clears the body', async () => {
    const { svc } = service();
    svc.beginFeed();
    const running = new InputBus(), gone = new InputBus();
    const got: BodyPacket[] = [], never: BodyPacket[] = [];
    running.onBody((p) => got.push(p));
    gone.onBody((p) => never.push(p));
    running.start();
    gone.start(); gone.stop();
    const src = new PoseSource({}, svc);                // the real publisher: publishBodyToLive
    await src.start(AUTO);
    for (const f of stand.slice(0, 25)) svc.pushFeed(f);
    expect(got).toHaveLength(25);
    expect(never).toEqual([]);
    expect(running.body()).toBe(got[24]);
    expect(running.body()!.read.calibrated).toBe(true);
    src.stop();
    expect(got[25].final).toBe(true);
    expect(running.body()).toBeNull();                  // the mode's ctx.body() says: no source
  });

  it('a running mode that throws on a packet costs another bus, and the Body button, nothing (the step-3 review)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { svc } = service();
    svc.beginFeed();
    const broken = new InputBus(), fine = new InputBus();
    const got: BodyPacket[] = [];
    broken.onBody(() => { throw new Error('a harness blew up on this frame'); });
    fine.onBody((p) => got.push(p));
    broken.start(); fine.start();
    const src = new PoseSource({}, svc);                // the real publisher: publishBodyToLive
    await src.start(AUTO);
    for (const f of stand) svc.pushFeed(f);
    expect(got).toHaveLength(stand.length);
    expect(src.snapshot).toEqual({ state: 'live', detail: '', body: true });
    expect(err).toHaveBeenCalledTimes(stand.length);    // each one reported by the bus
    src.stop();
    err.mockRestore();
  });
});

describe('every caller has the new source (P3 step 3: the source takes no bus)', () => {
  it('nothing hands sharedPoseSource a bus any more: its one argument is a PoseService', () => {
    // the step-3 review: scripts/probes/_pose-feed.mts still passed `{ emit }`, which the new signature takes for the
    // PoseService — start() then died on `this.service.onStatus is not a function`. The probes are outside tsc's
    // include (.mts), and that call was inside a page callback (`any`), so only a scan sees it.
    const ROOT = join(__dirname, '..', '..');
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const rel = join(dir, e.name);
        if (e.isDirectory()) walk(rel);
        else if (/\.(ts|tsx|mts)$/.test(e.name) && /sharedPoseSource\(\s*\{/.test(readFileSync(join(ROOT, rel), 'utf8'))) hits.push(rel);
      }
    };
    for (const d of ['lib', 'components', 'app', 'scripts', 'hooks', 'tests']) if (existsSync(join(ROOT, d))) walk(d);
    expect(hits).toEqual([]);
  });
});

describe('the probe hook', () => {
  const env = process.env as Record<string, string | undefined>;
  const nodeEnv = env.NODE_ENV;
  afterEach(() => { env.NODE_ENV = nodeEnv; delete g.window; vi.resetModules(); });

  /** Load the module fresh on a page at `hostname` with `search`, under NODE_ENV = `mode`: what __FEL_BODY__ is. */
  async function load(mode: string, hostname: string, search = ''): Promise<BodyHook | undefined> {
    vi.resetModules();
    env.NODE_ENV = mode;
    const kept = new Map<string, string>();
    const win: Record<string, unknown> = {
      location: { hostname, search },
      sessionStorage: { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => { kept.set(k, v); }, removeItem: (k: string) => { kept.delete(k); } },
    };
    g.window = win;
    await import('./poseSource');
    return win.__FEL_BODY__ as BodyHook | undefined;
  }

  it('__FEL_BODY__ stays behind the feed\'s gate: development, or a production build on this machine with ?agent=1', async () => {
    expect(await load('production', 'finalevolution.us')).toBeUndefined();
    expect(await load('production', 'finalevolution.us', '?agent=1')).toBeUndefined();   // a query anyone can type
    expect(await load('production', 'localhost')).toBeUndefined();
    const bench = await load('production', 'localhost', '?agent=1');
    expect(Object.keys(bench ?? {}).sort()).toEqual(['snapshot', 'start', 'stop']);
    const dev = await load('development', 'fel.example');
    expect(typeof dev?.start).toBe('function');
    expect(dev?.snapshot()).toEqual({ state: 'idle', detail: '', body: false });
  });

  it('__FEL_BODY__.start hands its options to the source (the seam probe keeps P3\'s self-calibrating reader)', async () => {
    const hook = await load('development', 'fel.example');
    const mod = await import('./poseSource');
    const spy = vi.spyOn(mod.PoseSource.prototype, 'start').mockResolvedValue(true);
    await hook!.start({ autoCalibrate: true });
    await hook!.start();
    expect(spy.mock.calls).toEqual([[{ autoCalibrate: true }], [undefined]]);
    spy.mockRestore();
  });
});
