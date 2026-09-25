import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PoseService, makeFeedHandle, type PoseDeps, type PoseDetector } from './PoseService';
import { BUDGET_SAMPLES, BUDGET_WARMUP, MODEL_MEMORY_KEY, parseRemembered, rememberFallback } from './modelChoice';
import type { PoseModel } from './assets';
import type { PoseFrame } from './landmarks';
import type { PoseFixture } from './synth';
import type { PoseFrame as AdapterFrame, VideoFrameTick } from '../babylon/nexus/neuro-mirror/pose/mediapipe-adapter';

// The service with the browser taken out: a camera that answers when the test says, a landmarker with a set cost per
// frame, a hand-cranked clock and timers. Everything the service decides is then visible frame by frame.

const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const CAMERA_PERIOD = 1000 / 30;

const load = (name: string) => JSON.parse(readFileSync(join(__dirname, '__fixtures__', `${name}.json`), 'utf8')) as PoseFixture;
const flush = () => new Promise((r) => setTimeout(r, 0));

interface Deferred<T> { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void }
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}

/** What a track reports from getSettings(). A key left undefined is one the browser does not report. */
type TrackSettings = { width?: number; height?: number; frameRate?: number; facingMode?: string };
const HD30: TrackSettings = { width: 1280, height: 720, frameRate: 30, facingMode: 'user' };

class FakeTrack {
  stopped = false;
  private readonly on: Record<string, (() => void)[]> = {};
  constructor(private readonly settings: TrackSettings = HD30) {}
  stop() { this.stopped = true; }
  addEventListener(ev: string, fn: () => void) { (this.on[ev] ??= []).push(fn); }
  fire(ev: string) { (this.on[ev] ?? []).forEach((f) => f()); }
  getSettings() { return { ...this.settings }; }
}
class FakeStream {
  readonly track: FakeTrack;
  constructor(settings?: TrackSettings) { this.track = new FakeTrack(settings); }
  getTracks() { return [this.track]; }
  getVideoTracks() { return [this.track]; }
}

interface World { clock: number; cost: Record<PoseModel, number>; body: boolean }

const PT = { x: 0.5, y: 0.5, z: 0, visibility: 0.9 };
class FakeDetector implements PoseDetector {
  disposed = false;
  calls = 0;
  /** The picture has decoded (the adapter's video.readyState ≥ 2); before it, the adapter hands back its placeholder. */
  pictureReady = true;
  private last: AdapterFrame = { landmarks: [], timestampMs: 0, present: false };
  private lastId = -1;
  constructor(readonly model: PoseModel, private readonly w: World) {}
  detect(_v: HTMLVideoElement, t: number, info?: { frameId?: number }): AdapterFrame {
    if (!this.pictureReady) return this.last;
    if (info?.frameId === this.lastId) return this.last;   // the adapter's own dedupe on the frame id
    this.lastId = info?.frameId ?? -1;
    this.calls++;
    this.w.clock += this.w.cost[this.model];               // the detect's main-thread cost
    this.last = this.w.body
      ? { landmarks: Array.from({ length: 33 }, () => ({ ...PT })), timestampMs: t, present: true, world: Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 })) }
      : { landmarks: [], timestampMs: t, present: false, world: [] };
    return this.last;
  }
  dispose() { this.disposed = true; }
}

function rig(o: {
  ua?: string; search?: string; stored?: string; portrait?: boolean; manualLoad?: boolean; failFull?: boolean; manualPlay?: boolean;
} = {}) {
  const w: World = { clock: 1000, cost: { lite: 8, full: 12 }, body: true };
  const gum: Deferred<MediaStream>[] = [];
  const asked: MediaStreamConstraints[] = [];
  const loads: { model: PoseModel; d: Deferred<PoseDetector> }[] = [];
  const detectors: FakeDetector[] = [];
  const streams: FakeStream[] = [];
  const released: unknown[] = [];
  const videos: unknown[] = [];
  /** A play() held open, as a browser's is until the picture starts; releasing the video rejects it, as pause() does. */
  const plays: { video: unknown; d: Deferred<void> }[] = [];
  const store = new Map<string, string>(o.stored ? [[MODEL_MEMORY_KEY, o.stored]] : []);
  const timers: { fn: () => void; at: number; id: number }[] = [];
  let seq = 0;
  let onTick: ((t: VideoFrameTick) => void) | null = null;

  const deps: PoseDeps = {
    getUserMedia: (c) => { asked.push(c); const d = deferred<MediaStream>(); gum.push(d); return d.promise; },
    makeVideo: (stream) => {
      // The picture is the size the camera answered with.
      const s: TrackSettings = stream.getVideoTracks()[0]?.getSettings() ?? {};
      const v = { videoWidth: s.width ?? 1280, videoHeight: s.height ?? 720, addEventListener() {} };
      videos.push(v);
      return v as unknown as HTMLVideoElement;
    },
    playVideo: (v) => {
      if (!o.manualPlay) return Promise.resolve();
      const d = deferred<void>();
      plays.push({ video: v, d });
      return d.promise;
    },
    releaseVideo: (v) => {
      released.push(v);
      plays.filter((p) => p.video === v).forEach((p) => p.d.reject(new DOMException('The play() request was interrupted', 'AbortError')));
    },
    loadDetector: (model) => {
      if (o.failFull && model === 'full') return Promise.reject(new Error('no memory for full'));
      if (o.manualLoad) { const d = deferred<PoseDetector>(); loads.push({ model, d }); return d.promise; }
      const det = new FakeDetector(model, w);
      detectors.push(det);
      return Promise.resolve(det);
    },
    onVideoFrames: (_v, cb) => { onTick = cb; return () => { onTick = null; }; },
    now: () => w.clock,
    env: () => ({ userAgent: o.ua ?? MAC, maxTouchPoints: 0, portrait: o.portrait ?? false, search: o.search ?? '' }),
    storage: { get: (k) => store.get(k) ?? null, set: (k, v) => { store.set(k, v); } },
    setTimer: (fn, ms) => { const id = ++seq; timers.push({ fn, at: w.clock + ms, id }); return id; },
    clearTimer: (h) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); },
    warn: () => {},
  };
  const svc = new PoseService(deps);

  /** Allow the camera: the oldest pending getUserMedia gets a stream (reporting `settings`), then the rest of start() runs. */
  const grant = async (settings?: TrackSettings) => {
    const s = new FakeStream(settings);
    streams.push(s);
    gum.shift()!.resolve(s as unknown as MediaStream);
    await flush();
    return s;
  };
  const live = async () => { const p = svc.start(); await grant(); expect(await p).toBe(true); };

  /** One camera frame, captured at t (the clock is moved there first, as the camera would). */
  let frameId = 0;
  const tick = (t: number, id = ++frameId) => { w.clock = Math.max(w.clock, t); onTick?.({ timestampMs: t, clock: 'capture', frameId: id }); };
  /** n camera frames 33.3 ms apart, starting after the last. */
  let lastT = 2000;
  const frames = (n: number) => { for (let i = 0; i < n; i++) tick((lastT += CAMERA_PERIOD)); };

  /** Run the timers due by `target`, in order, moving the clock to each. */
  const advanceTo = (target: number) => {
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > target) break;
      timers.shift();
      w.clock = Math.max(w.clock, next.at);
      next.fn();
    }
    w.clock = Math.max(w.clock, target);
  };

  return {
    svc, w, grant, live, tick, frames, advanceTo, detectors, streams, released, videos, plays, store, gum, asked, loads,
    get ticking() { return onTick != null; },
  };
}

describe('the camera lifetime', () => {
  it('a stop() during the permission prompt stops the stream that arrives late, and start() says false', async () => {
    const r = rig();
    const p = r.svc.start();
    expect(r.svc.state).toBe('requesting');
    r.svc.stop();
    expect(r.svc.state).toBe('idle');
    const late = await r.grant();
    expect(await p).toBe(false);
    expect(late.track.stopped).toBe(true);   // the camera light goes off
    expect(r.svc.state).toBe('idle');
    expect(r.detectors).toHaveLength(0);     // and no model was loaded for nobody
  });

  it('stop() frees the landmarker, the camera and the video, and ends the frame loop', async () => {
    const r = rig();
    await r.live();
    expect(r.svc.video).not.toBeNull();
    expect(r.ticking).toBe(true);
    r.svc.stop();
    expect(r.detectors[0].disposed).toBe(true);
    expect(r.streams[0].track.stopped).toBe(true);
    expect(r.released).toHaveLength(1);
    expect(r.svc.video).toBeNull();
    expect(r.ticking).toBe(false);
    expect(r.svc.status).toMatchObject({ state: 'idle', model: null, source: null });
  });

  it('a stop() while the model loads frees the model when it lands', async () => {
    const r = rig({ manualLoad: true });
    const p = r.svc.start();
    const s = await r.grant();
    expect(r.svc.state).toBe('loading');
    r.svc.stop();
    expect(s.track.stopped).toBe(true);
    const det = new FakeDetector('full', r.w);
    r.loads[0].d.resolve(det);
    expect(await p).toBe(false);
    expect(det.disposed).toBe(true);
    expect(r.svc.state).toBe('idle');
  });

  it('a stop() while the picture is starting releases the <video> it made, and start() says false', async () => {
    const r = rig({ manualPlay: true });
    const p = r.svc.start();
    const s = await r.grant();
    expect(r.plays).toHaveLength(1);           // play() is pending: the element exists and is in the page
    r.svc.stop();
    expect(s.track.stopped).toBe(true);
    expect(r.released).toEqual(r.videos);      // released by stop() itself, not left for a play() that may never settle
    expect(await p).toBe(false);
    expect(r.svc.state).toBe('idle');
    expect(r.detectors).toHaveLength(0);
  });

  it('a picture that will not play is an error, and the camera and <video> are freed', async () => {
    const r = rig({ manualPlay: true });
    const p = r.svc.start();
    const s = await r.grant();
    r.plays[0].d.reject(new DOMException('play() failed', 'NotAllowedError'));
    expect(await p).toBe(false);
    expect(r.svc.state).toBe('error');
    expect(r.svc.why).toMatch(/picture did not start/);
    expect(s.track.stopped).toBe(true);
    expect(r.released).toEqual(r.videos);
  });

  it('many starts, one camera: a second start() while one is pending is the same promise', async () => {
    const r = rig();
    const a = r.svc.start(), b = r.svc.start();
    expect(b).toBe(a);
    expect(r.asked).toHaveLength(1);
    await r.grant();
    expect(await a).toBe(true);
    expect(await r.svc.start()).toBe(true);   // already live
    expect(r.asked).toHaveLength(1);
  });

  it('a refused camera is an error with a reason, and the next start() asks again', async () => {
    const r = rig();
    const p = r.svc.start();
    r.gum.shift()!.reject(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }));
    expect(await p).toBe(false);
    expect(r.svc.state).toBe('error');
    expect(r.svc.why).toMatch(/refused/);
    const again = r.svc.start();
    expect(r.svc.state).toBe('requesting');
    await r.grant();
    expect(await again).toBe(true);
  });

  it('an unplugged camera is an error, and everything is freed', async () => {
    const r = rig();
    await r.live();
    r.streams[0].track.fire('ended');
    expect(r.svc.state).toBe('error');
    expect(r.svc.why).toMatch(/camera stopped/);
    expect(r.detectors[0].disposed).toBe(true);
    expect(r.released).toHaveLength(1);
  });

  it('reads back the camera it really got', async () => {
    const r = rig();
    await r.live();
    expect(r.svc.status.camera).toEqual({ width: 1280, height: 720, frameRate: 30, facingMode: 'user', portrait: false });
  });
});

describe('a slow desktop camera (1280×720 answered at 10-15 fps)', () => {
  // A webcam without MJPEG offering 1280×720@10 and 640×480@30 is given 720p@10 for the 1280×720 ideal. The service
  // asks it again for VGA at 30, the request before phase 2, and keeps what that gives.
  const HD10: TrackSettings = { width: 1280, height: 720, frameRate: 10, facingMode: 'user' };
  const VGA30: TrackSettings = { width: 640, height: 480, frameRate: 30, facingMode: 'user' };
  const VGA_ASK = { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } };

  it('is asked again for 640×480 at 30, the first stream stopped, and the second is the camera', async () => {
    const r = rig();
    const p = r.svc.start();
    const first = await r.grant(HD10);
    expect(first.track.stopped).toBe(true);           // stopped before the second ask, so the device can change mode
    expect(r.asked).toHaveLength(2);
    expect(r.asked[0].video).toMatchObject({ width: { ideal: 1280 }, height: { ideal: 720 } });
    expect(r.asked[1]).toEqual({ video: VGA_ASK, audio: false });
    expect(r.svc.state).toBe('requesting');
    expect(r.videos).toHaveLength(0);                 // nothing built on the first answer
    const second = await r.grant(VGA30);
    expect(await p).toBe(true);
    expect(r.svc.status.camera).toEqual({ width: 640, height: 480, frameRate: 30, facingMode: 'user', portrait: false });
    expect(r.svc.model).toBe('full');                 // the model rules are the device's, not the picture's

    first.track.fire('ended');                        // the stopped first stream's end is not a camera failure
    expect(r.svc.state).toBe('live');
    r.svc.stop();
    expect(second.track.stopped).toBe(true);          // and stop() frees the camera that was kept
  });

  it('the second answer is kept even when it is slow too: one retry, never a loop', async () => {
    const r = rig();
    const p = r.svc.start();
    await r.grant(HD10);
    await r.grant({ ...VGA30, frameRate: 15 });
    expect(await p).toBe(true);
    expect(r.asked).toHaveLength(2);
    expect(r.svc.status.camera?.frameRate).toBe(15);
  });

  it('30 fps, 24 fps, or no frame rate reported: one request, no second', async () => {
    for (const settings of [HD30, { ...HD30, frameRate: 24 }, { width: 1280, height: 720 }] as TrackSettings[]) {
      const r = rig();
      const p = r.svc.start();
      await r.grant(settings);
      expect(await p).toBe(true);
      expect(r.asked).toHaveLength(1);
      expect(r.streams[0].track.stopped).toBe(false);
    }
  });

  it('a phone is never asked again: its VGA request is already the small one', async () => {
    const r = rig({ ua: IPHONE, portrait: true });
    const p = r.svc.start();
    await r.grant({ width: 480, height: 640, frameRate: 15, facingMode: 'user' });
    expect(await p).toBe(true);
    expect(r.asked).toHaveLength(1);
  });

  it('a stop() during the second ask stops the stream that arrives late, and start() says false', async () => {
    const r = rig();
    const p = r.svc.start();
    await r.grant(HD10);
    r.svc.stop();
    const late = await r.grant(VGA30);
    expect(await p).toBe(false);
    expect(late.track.stopped).toBe(true);
    expect(r.svc.state).toBe('idle');
    expect(r.videos).toHaveLength(0);
    expect(r.detectors).toHaveLength(0);
  });

  it('a second ask that fails is an error with a reason, with the first stream already stopped', async () => {
    const r = rig();
    const p = r.svc.start();
    const first = await r.grant(HD10);
    r.gum.shift()!.reject(Object.assign(new Error('Could not start video source'), { name: 'NotReadableError' }));
    expect(await p).toBe(false);
    expect(r.svc.state).toBe('error');
    expect(r.svc.why).toMatch(/in use by another app/);
    expect(first.track.stopped).toBe(true);
  });
});

describe('frames', () => {
  it('one PoseFrame per camera frame: capture time, the time the result came, image and world landmarks', async () => {
    const r = rig();
    await r.live();
    const got: PoseFrame[] = [];
    const off = r.svc.onFrame((f) => got.push(f));
    r.tick(2000);
    expect(got).toHaveLength(1);
    expect(got[0].t).toBe(2000);
    expect(got[0].arrive).toBe(2012);   // + full's 12 ms detect
    expect(got[0].image).toHaveLength(33);
    expect(got[0].image[0]).toEqual({ x: 0.5, y: 0.5, z: 0, v: 0.9 });
    expect(got[0].world).toHaveLength(33);

    r.tick(2033, 1);                      // the same frame id again: no second detect, no second frame
    expect(got).toHaveLength(1);
    r.w.body = false;
    r.tick(2033.3);
    expect(got[1]).toEqual({ t: 2033.3, present: false, image: [], arrive: 2045.3 });   // no body is a frame too
    off();
    r.tick(2066.6);
    expect(got).toHaveLength(2);
    expect(r.svc.latest?.t).toBe(2066.6);  // polling readers still see it
    expect(r.svc.stats).toMatchObject({ fps: 3, detectMs: 12, latencyMs: 12, clock: 'capture', frames: 3 });
  });

  it('a tick before the picture has decoded is no frame at all, not a frame without a body', async () => {
    const r = rig();
    await r.live();
    const got: PoseFrame[] = [];
    r.svc.onFrame((f) => got.push(f));
    r.detectors[0].pictureReady = false;
    r.tick(2000);
    r.tick(2033.3);
    expect(got).toHaveLength(0);
    expect(r.svc.latest).toBeNull();
    expect(r.svc.stats.frames).toBe(0);
    r.detectors[0].pictureReady = true;
    r.tick(2066.6);
    expect(got.map((f) => [f.t, f.present])).toEqual([[2066.6, true]]);
  });

  it('a 60 fps camera is thinned to 30 detects a second', async () => {
    const r = rig();
    await r.live();
    for (let i = 0; i < 60; i++) r.tick(2000 + i * (1000 / 60));
    expect(r.detectors[0].calls).toBe(30);
  });

  it('a listener that throws does not stop the others or the camera', async () => {
    const r = rig();
    await r.live();
    let n = 0;
    r.svc.onFrame(() => { throw new Error('bad reader'); });
    r.svc.onFrame(() => { n++; });
    r.frames(3);
    expect(n).toBe(3);
  });
});

describe('the model by device', () => {
  it('desktop: full, kept when it fits the budget', async () => {
    const r = rig();
    await r.live();
    expect(r.svc.model).toBe('full');
    r.frames(BUDGET_WARMUP + BUDGET_SAMPLES + 20);
    await flush();
    expect(r.svc.model).toBe('full');
    expect(r.detectors).toHaveLength(1);
    expect(r.svc.status.modelWhy).toMatch(/full, 12\.0 ms a frame/);
    expect(r.store.has(MODEL_MEMORY_KEY)).toBe(false);
  });

  it('desktop too slow for full: lite takes over after the first seconds of BODY frames, and it is remembered', async () => {
    const r = rig();
    r.w.cost.full = 24;
    await r.live();
    r.w.body = false;
    r.frames(100);                          // an empty room says nothing about full's cost
    await flush();
    expect(r.svc.model).toBe('full');
    r.w.body = true;
    r.frames(BUDGET_WARMUP + BUDGET_SAMPLES - 1);
    await flush();
    expect(r.svc.model).toBe('full');
    r.frames(1);                            // the last sample decides
    await flush();
    expect(r.svc.model).toBe('lite');
    expect(r.detectors.map((d) => d.model)).toEqual(['full', 'lite']);
    expect(r.detectors[0].disposed).toBe(true);
    expect(r.svc.status.modelWhy).toMatch(/full ran 24\.0 ms a frame/);
    expect(parseRemembered(r.store.get(MODEL_MEMORY_KEY), Date.now())?.detectMs).toBe(24);
    r.frames(3);
    expect(r.detectors[1].calls).toBe(3);   // frames keep coming, from lite
    expect(r.svc.stats.detectMs).toBe(8);
  });

  it('a stop while lite is loading for the fallback frees lite', async () => {
    const r = rig();
    r.w.cost.full = 30;
    await r.live();
    r.frames(BUDGET_WARMUP + BUDGET_SAMPLES);
    r.svc.stop();
    await flush();
    expect(r.detectors[1].model).toBe('lite');
    expect(r.detectors[1].disposed).toBe(true);
  });

  it('phone: lite from the start, never measured, asked for a tall 4:3 picture', async () => {
    const r = rig({ ua: IPHONE, portrait: true });
    r.w.cost.lite = 40;
    await r.live();
    expect(r.svc.model).toBe('lite');
    expect(r.asked[0].video).toMatchObject({ width: { ideal: 480 }, height: { ideal: 640 }, facingMode: 'user' });
    r.frames(200);
    await flush();
    expect(r.detectors).toHaveLength(1);
  });

  it('desktop with a remembered fallback: lite from the start', async () => {
    const r = rig({ stored: rememberFallback(21, Date.now() - 3600_000) });
    await r.live();
    expect(r.svc.model).toBe('lite');
    expect(r.asked[0].video).toMatchObject({ width: { ideal: 1280 }, height: { ideal: 720 } });
  });

  it('?pose=full runs full anywhere, unmeasured', async () => {
    const r = rig({ ua: IPHONE, search: '?pose=full' });
    r.w.cost.full = 50;
    await r.live();
    expect(r.svc.model).toBe('full');
    r.frames(200);
    await flush();
    expect(r.detectors).toHaveLength(1);
  });

  it('full that will not load falls back to lite rather than to no camera', async () => {
    const r = rig({ failFull: true });
    await r.live();
    expect(r.svc.model).toBe('lite');
    expect(r.svc.status.modelWhy).toMatch(/full did not load/);
  });
});

describe('the dev feed (window.__FEL_POSE_FEED__)', () => {
  const fx = load('jump_two_foot_low');

  it('stands in for the camera: frames on their own timing, and start() opens no camera', async () => {
    const r = rig();
    const feed = makeFeedHandle(() => r.svc);
    const got: PoseFrame[] = [];
    r.svc.onFrame((f) => got.push(f));
    feed.begin();
    expect(r.svc.status).toMatchObject({ state: 'live', source: 'feed', model: null });
    expect(await r.svc.start()).toBe(true);
    expect(r.asked).toHaveLength(0);

    const frames = fx.frames.slice(0, 30);
    r.w.clock = 10_000;
    const done = feed.play(frames);
    expect(feed.status().playing).toBe(true);
    r.advanceTo(10_000 + frames[29].arrive! - frames[0].t);
    expect(await done).toBe(30);
    expect(got).toHaveLength(30);
    got.forEach((f, i) => {
      expect(f.t).toBeCloseTo(10_000 + frames[i].t - frames[0].t, 9);
      expect(f.arrive).toBeCloseTo(10_000 + frames[i].arrive! - frames[0].t, 9);
    });
    const s = feed.status();
    expect(s).toMatchObject({ state: 'live', source: 'feed', delivered: 30, playing: false });
    expect(s.stats.detectMs).toBeNull();
    expect(s.stats.latencyMs).toBeGreaterThan(40);   // the take's own camera latency (66 ± 8 ms)
    expect(s.stats.clock).toBe('feed');
    feed.end();
    expect(r.svc.state).toBe('idle');
  });

  it('takes over a live camera, straight from camera to feed with no idle between', async () => {
    const r = rig();
    await r.live();
    const seen: string[] = [];
    r.svc.onStatus((s) => seen.push(`${s.state}:${s.source}`));
    makeFeedHandle(() => r.svc).begin();
    expect(seen).toEqual(['live:feed']);
    expect(r.detectors[0].disposed).toBe(true);
    expect(r.streams[0].track.stopped).toBe(true);
    expect(r.ticking).toBe(false);
  });

  it('push() delivers one frame now, as given; cancel() ends a playback with what it delivered', async () => {
    const r = rig();
    const feed = makeFeedHandle(() => r.svc);
    const got: PoseFrame[] = [];
    r.svc.onFrame((f) => got.push(f));
    r.w.clock = 500;
    feed.push({ t: 123, present: false, image: [] });
    expect(got[0]).toEqual({ t: 123, present: false, image: [], arrive: 500 });

    const done = feed.play(fx.frames);
    r.advanceTo(500 + 1000);
    feed.cancel();
    const n = await done;
    expect(n).toBeGreaterThan(20);
    expect(n).toBeLessThan(fx.frames.length);
    r.advanceTo(500 + 10_000);
    expect(got).toHaveLength(1 + n);         // nothing after the cancel
    expect(r.svc.status.source).toBe('feed');
  });

  it('stop() ends the feed and its playback', async () => {
    const r = rig();
    const feed = makeFeedHandle(() => r.svc);
    const done = feed.play(fx.frames);
    r.svc.stop();
    expect(await done).toBe(0);
    expect(r.svc.status.source).toBeNull();
  });
});
