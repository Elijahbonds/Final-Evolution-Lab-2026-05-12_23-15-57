import { describe, expect, it, vi } from 'vitest';
import { MediaPipePoseAdapter, onVideoFrames, type VideoFrameTick } from './mediapipe-adapter';
import { AssetResolver, CDN_WASM_BASE, cdnModelUrl } from '../../../../pose/assets';

// tasks-vision without its wasm: records what it was asked to build, and can hold a build open (a slow download).
const tv = vi.hoisted(() => ({
  built: [] as { wasm: string; model: string; closed: boolean }[],
  hold: null as Promise<void> | null,
}));
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: async (wasm: string) => ({ wasm }) },
  PoseLandmarker: {
    createFromOptions: async (fs: { wasm: string }, o: { baseOptions: { modelAssetPath: string } }) => {
      if (tv.hold) await tv.hold;
      const lm = { wasm: fs.wasm, model: o.baseOptions.modelAssetPath, closed: false, close() { lm.closed = true; } };
      tv.built.push(lm);
      return lm;
    },
  },
}));

// A stand-in landmarker (no WASM in node): it records the timestamps it is given and returns one body.
function withFakeModel(adapter: MediaPipePoseAdapter) {
  const seen: number[] = [];
  const pt = { x: 0.5, y: 0.5, z: 0, visibility: 0.9 };
  (adapter as any).landmarker = {
    detectForVideo: (_v: unknown, ts: number) => {
      seen.push(ts);
      return { landmarks: [[pt, pt]], worldLandmarks: [[{ x: 0.1, y: -0.2, z: 0.3, visibility: 0.9 }, { x: 0, y: 0, z: 0 }]] };
    },
  };
  return seen;
}
const video = (currentTime: number) => ({ readyState: 4, currentTime }) as unknown as HTMLVideoElement;

describe('MediaPipePoseAdapter', () => {
  it('existing callers: no world on the frame, deduped on video.currentTime', () => {
    const a = new MediaPipePoseAdapter();
    const seen = withFakeModel(a);
    const f1 = a.detect(video(1), 100);
    expect(f1.present).toBe(true);
    expect(f1.world).toBeUndefined();
    expect(a.detect(video(1), 116)).toBe(f1);   // same video time: not re-run
    expect(seen).toEqual([100]);
  });

  it('world: true keeps the world landmarks as x, y, z', () => {
    const a = new MediaPipePoseAdapter({ world: true });
    withFakeModel(a);
    expect(a.detect(video(1), 100).world).toEqual([{ x: 0.1, y: -0.2, z: 0.3 }, { x: 0, y: 0, z: 0 }]);
  });

  it('a frame id dedupes instead of currentTime, and a repeated capture stamp is nudged for the model only', () => {
    const a = new MediaPipePoseAdapter();
    const seen = withFakeModel(a);
    const f1 = a.detect(video(1), 500, { frameId: 7 });
    const f2 = a.detect(video(1), 500, { frameId: 8 });   // new frame, same currentTime and same stamp
    expect(f2).not.toBe(f1);
    expect(a.detect(video(2), 520, { frameId: 8 })).toBe(f2);
    expect(seen).toEqual([500, 501]);
    expect(f2.timestampMs).toBe(500);
  });
});

describe('loading the landmarker (movement play, phase 2)', () => {
  it('loads the wasm and the chosen model from our own copy', async () => {
    const a = new MediaPipePoseAdapter({ model: 'full', assets: new AssetResolver(async () => true) });
    await a.init();
    expect(a.ready).toBe(true);
    expect(a.modelName).toBe('pose_landmarker_full/float16/1');
    expect(tv.built.at(-1)).toMatchObject({ wasm: '/pose/wasm', model: '/pose/models/pose_landmarker_full.task' });
  });

  it('falls back to the MediaPipe CDN when our copy is missing, and lite is still the default', async () => {
    const a = new MediaPipePoseAdapter({ assets: new AssetResolver(async () => false) });
    await a.init();
    expect(tv.built.at(-1)).toMatchObject({ wasm: CDN_WASM_BASE, model: cdnModelUrl('lite') });
  });

  it('two concurrent init() calls build one landmarker', async () => {
    const n = tv.built.length;
    const a = new MediaPipePoseAdapter({ assets: new AssetResolver(async () => true) });
    await Promise.all([a.init(), a.init()]);
    expect(tv.built.length).toBe(n + 1);
  });

  it('dispose() while the model is still loading frees it when it lands, and init() refuses after', async () => {
    let open!: () => void;
    tv.hold = new Promise<void>((r) => { open = r; });
    const a = new MediaPipePoseAdapter({ assets: new AssetResolver(async () => true) });
    const loading = a.init();
    a.dispose();
    open();
    tv.hold = null;
    await expect(loading).rejects.toThrow(/disposed/);
    expect(tv.built.at(-1)!.closed).toBe(true);
    expect(a.ready).toBe(false);
    await expect(a.init()).rejects.toThrow(/disposed/);
  });
});

describe('onVideoFrames: the clock a camera frame is stamped on', () => {
  /** A <video> with requestVideoFrameCallback, cranked by hand: fire(now, meta) runs the pending callback once. */
  function rvfcVideo() {
    let pending: ((now: number, meta: VideoFrameCallbackMetadata) => void) | null = null;
    let cancelled = 0;
    const video = {
      requestVideoFrameCallback: (cb: typeof pending) => { pending = cb; return 1; },
      cancelVideoFrameCallback: () => { cancelled++; pending = null; },
    } as unknown as HTMLVideoElement;
    const fire = (now: number, meta: Partial<VideoFrameCallbackMetadata>) => {
      const cb = pending;
      pending = null;
      cb?.(now, { presentationTime: now - 4, expectedDisplayTime: now + 16.7, width: 1280, height: 720, mediaTime: 0, presentedFrames: 0, ...meta });
    };
    return { video, fire, get cancelled() { return cancelled; } };
  }

  it('the capture stamp when there is one; else the hand-over to the compositor, never the display time ahead', () => {
    const v = rvfcVideo();
    const ticks: VideoFrameTick[] = [];
    const stop = onVideoFrames(v.video, (t) => ticks.push(t));
    v.fire(1000, { captureTime: 940, presentedFrames: 1 });
    v.fire(1033, { presentedFrames: 2 });                        // no capture stamp
    v.fire(1066, { captureTime: -50_000, presentedFrames: 3 });  // a stamp on some other clock
    expect(ticks).toEqual([
      { timestampMs: 940, clock: 'capture', frameId: 1 },
      { timestampMs: 1029, clock: 'display', frameId: 2 },
      { timestampMs: 1062, clock: 'display', frameId: 3 },
    ]);
    // A frame is never stamped after the callback that reports it, so its result can never arrive before it was taken.
    ticks.forEach((t, i) => expect(t.timestampMs).toBeLessThanOrEqual([1000, 1033, 1066][i]));
    stop();
    expect(v.cancelled).toBe(1);
    v.fire(1100, { captureTime: 1060, presentedFrames: 4 });
    expect(ticks).toHaveLength(3);
  });
});
