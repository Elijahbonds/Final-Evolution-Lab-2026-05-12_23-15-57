import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PoseSource, holdSharedPoseSource, mapperStretch, sharedPoseSource, type PoseServiceLike } from './poseSource';
import { PoseController, calibrateFrom, T, type PoseInput } from './poseControl';
import { PoseService, type PoseDeps, type PoseStatus } from '../pose/PoseService';
import { RIGHT_SHOULDER, RIGHT_WRIST, LEFT_SHOULDER, type PoseFrame } from '../pose/landmarks';
import type { PoseFixture } from '../pose/synth';
import type { FelInput } from '../babylon/core/InputBus';

// Body control on PoseService, driven through the service's own dev feed (no camera): the mapper must be fed exactly
// as before (phase 3 replaces it; until then nothing may change), and the camera's lifetime is now the service's.

const g = globalThis as unknown as Record<string, unknown>;
let queue = new Map<number, FrameRequestCallback>();
let nextId = 0;
/** n rAF ticks. */
const step = (n = 1) => {
  for (let i = 0; i < n; i++) {
    const cbs = [...queue.values()];
    queue = new Map();
    cbs.forEach((cb) => cb(0));
  }
};
beforeEach(() => {
  queue = new Map();
  g.requestAnimationFrame = (cb: FrameRequestCallback) => { queue.set(++nextId, cb); return nextId; };
  g.cancelAnimationFrame = (id: number) => { queue.delete(id); };
});
afterEach(() => { delete g.requestAnimationFrame; delete g.cancelAnimationFrame; });

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

const fx = JSON.parse(readFileSync(join(__dirname, '..', 'pose', '__fixtures__', 'stand_still.json'), 'utf8')) as PoseFixture;
/** The owner standing still: the baseline's own calibration stand (BASELINE.md, frame 70). */
const stand = fx.frames[70];
/** The same body with the right hand well above the shoulder: poseControl's B. */
const raised: PoseFrame = (() => {
  const image = stand.image.map((l) => ({ ...l }));
  const sw = Math.abs(image[LEFT_SHOULDER].x - image[RIGHT_SHOULDER].x);
  image[RIGHT_WRIST].y = image[RIGHT_SHOULDER].y - 0.5 * sw;
  return { ...stand, image };
})();
const asInput = (f: PoseFrame): PoseInput => ({ present: f.present, landmarks: f.image.map((l) => ({ x: l.x, y: l.y, visibility: l.v })) });

describe('body control on PoseService', () => {
  it('feeds poseControl exactly as before: 12 good ticks to calibrate, then read() every tick', async () => {
    expect(stand.present).toBe(true);
    const { svc } = service();
    svc.beginFeed();
    const events: FelInput[] = [];
    const src = new PoseSource({ emit: (e) => events.push(e) }, {}, svc);
    expect(await src.start()).toBe(true);
    expect(src.state).toBe('calibrating');

    svc.pushFeed(stand);
    step(11);
    expect(src.state).toBe('calibrating');
    step(1);
    expect(src.snapshot).toEqual({ state: 'live', detail: '', body: true });
    expect(events).toEqual([]);

    // A controller calibrated on the same stand and read the same frame gives the same events.
    const ref = new PoseController(calibrateFrom(asInput(stand))!);
    const expected = ref.read(asInput(raised));
    svc.pushFeed(raised);
    step(1);
    expect(events).toEqual(expected);
    expect(events).toContainEqual({ t: 'button', btn: 'B', pressed: true });
    step(5);                                   // the same frame on later ticks: nothing new
    expect(events).toEqual(expected);

    src.stop();
    expect(events.slice(expected.length)).toEqual(ref.release());
    expect(events).toContainEqual({ t: 'button', btn: 'B', pressed: false });
    expect(svc.state).toBe('idle');
  });

  it('a refused camera shows why and stays off; the next click asks again', async () => {
    const { svc, asked } = service({ refuse: true });
    const src = new PoseSource({ emit: () => {} }, {}, svc);
    expect(await src.start()).toBe(false);
    expect(src.snapshot.state).toBe('error');
    expect(src.snapshot.detail).toMatch(/refused/);
    expect(await src.start()).toBe(false);
    expect(asked).toHaveLength(2);
  });

  it('when the service stops under it (the feed ended), what it held is let go', async () => {
    const { svc } = service();
    svc.beginFeed();
    const events: FelInput[] = [];
    const src = new PoseSource({ emit: (e) => events.push(e) }, {}, svc);
    await src.start();
    svc.pushFeed(stand);
    step(12);
    svc.pushFeed(raised);
    step(1);
    const before = events.length;
    svc.endFeed();
    expect(src.state).toBe('idle');
    expect(events.slice(before)).toContainEqual({ t: 'button', btn: 'B', pressed: false });
  });

  it('re-centring lets go first, then takes a new neutral', async () => {
    const { svc } = service();
    svc.beginFeed();
    const events: FelInput[] = [];
    const src = new PoseSource({ emit: (e) => events.push(e) }, {}, svc);
    await src.start();
    svc.pushFeed(stand);
    step(12);
    svc.pushFeed(raised);
    step(1);
    const before = events.length;
    src.recalibrate();
    expect(src.state).toBe('calibrating');
    expect(events.slice(before)).toContainEqual({ t: 'button', btn: 'B', pressed: false });
    step(12);
    expect(src.state).toBe('live');
  });

  it('an unmount that never switched body on leaves the service alone', () => {
    const { svc } = service();
    svc.beginFeed();
    new PoseSource({ emit: () => {} }, {}, svc).stop();
    expect(svc.status.source).toBe('feed');
  });

  it('the two Body buttons share one source and one camera; the last to unmount stops it', async () => {
    const { svc } = service();
    svc.beginFeed();
    const bus = { emit: () => {} };
    const header = sharedPoseSource(bus, svc), compact = sharedPoseSource(bus, svc);
    expect(compact).toBe(header);
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

describe('the picture the mapper sees', () => {
  /** A live camera with nothing behind it: status says what picture it gives, latest is whatever the test sets. */
  function camera(width: number, height: number) {
    const status: PoseStatus = {
      state: 'live', why: null, source: 'camera', model: 'full', modelWhy: null,
      camera: { width, height, frameRate: 30, facingMode: 'user', portrait: height > width },
    };
    const svc = { status, latest: null as PoseFrame | null, start: async () => true, stop: () => {}, onStatus: () => () => {} };
    return svc satisfies PoseServiceLike;
  }
  /** The same room through a 16:9 webcam with the same vertical view: the 4:3 picture is its middle, so x squeezes. */
  const WIDE = (4 / 3) / (16 / 9);
  const widen = (f: PoseFrame): PoseFrame => ({ ...f, image: f.image.map((l) => ({ ...l, x: 0.5 + (l.x - 0.5) * WIDE })) });
  /** A hand held just under the raise threshold, in the 4:3 picture the mapper was tuned on. */
  const cal = calibrateFrom(asInput(stand))!;
  const almost: PoseFrame = (() => {
    const image = stand.image.map((l) => ({ ...l }));
    image[RIGHT_WRIST].y = cal.shoulderY - 0.8 * T.raiseOn * cal.shoulderW;
    return { ...stand, image };
  })();

  it('stretches only a picture wider than 4:3', () => {
    expect(mapperStretch({ width: 1280, height: 720, frameRate: 30, facingMode: 'user', portrait: false })).toBeCloseTo(4 / 3, 9);
    expect(mapperStretch({ width: 640, height: 480, frameRate: 30, facingMode: 'user', portrait: false })).toBe(1);
    expect(mapperStretch({ width: 480, height: 640, frameRate: 30, facingMode: 'user', portrait: true })).toBe(1);
    expect(mapperStretch({ width: 0, height: 0, frameRate: null, facingMode: null, portrait: false })).toBe(1);
    expect(mapperStretch(null)).toBe(1);   // the feed
  });

  it('a desktop 16:9 webcam reads the same body as the 4:3 picture the mapper was tuned on', async () => {
    // The defect this guards: read raw, the 16:9 picture's narrower shoulders make a hand held under the threshold
    // read as raised, and the mapper presses B.
    const raw = new PoseController(calibrateFrom(asInput(widen(stand)))!);
    expect(raw.read(asInput(widen(almost)))).toContainEqual({ t: 'button', btn: 'B', pressed: true });

    const ref = new PoseController(cal);
    const expected = [...ref.read(asInput(almost)), ...ref.read(asInput(raised))];
    expect(expected).not.toContainEqual({ t: 'button', btn: 'B', pressed: false });

    const svc = camera(1280, 720);
    const events: FelInput[] = [];
    const src = new PoseSource({ emit: (e) => events.push(e) }, {}, svc);
    await src.start();
    svc.latest = widen(stand);
    step(12);
    expect(src.state).toBe('live');
    svc.latest = widen(almost);
    step(1);
    svc.latest = widen(raised);
    step(1);
    expect(events).toEqual(expected);          // no B for the almost-raise, B for the real one
    src.stop();
  });
});
