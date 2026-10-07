// MIRROR PHASE 3: the jump test's opt-in higher pose rate. The service with the browser taken out (as PoseService.test.ts
// does): a camera whose frame rate the test sets, a landmarker with a set cost per detect, a hand-cranked clock.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PoseService, type PoseDeps, type PoseDetector } from './PoseService';
import {
  HIGH_RATE_BUDGET_MS, HIGH_RATE_GAP_MS, HIGH_RATE_MIN_HZ, HIGH_RATE_SAMPLES, HIGH_RATE_WARMUP, HighRateTrial, MIN_DETECT_GAP_MS,
  cameraBelowHighRate, highRateVerdict,
} from './modelChoice';
import { THRESHOLDS } from '@/lib/screen/PROPOSED-thresholds';
import type { PoseFrame as AdapterFrame, VideoFrameTick } from '../babylon/nexus/neuro-mirror/pose/mediapipe-adapter';

const flush = () => new Promise((r) => setTimeout(r, 0));
const PT = { x: 0.5, y: 0.5, z: 0, visibility: 0.9 };

class FakeTrack {
  stopped = false;
  asked: MediaTrackConstraints[] = [];
  /** What the camera answers when asked for a frame rate: the asked rate up to `maxFps`. Null: it does not report one. */
  constructor(private fps: number | null, private readonly maxFps: number | null) {}
  stop() { this.stopped = true; }
  addEventListener() {}
  getSettings() { return { width: 480, height: 640, ...(this.fps === null ? {} : { frameRate: this.fps }) }; }
  applyConstraints(c: MediaTrackConstraints) {
    this.asked.push(c);
    const want = (c.frameRate as { ideal?: number } | undefined)?.ideal;
    if (typeof want === 'number' && this.fps !== null) this.fps = this.maxFps === null ? want : Math.min(want, this.maxFps);
    return Promise.resolve();
  }
}

function rig(o: { maxFps?: number | null; reportsFps?: boolean; liteMs?: number } = {}) {
  const w = { clock: 1000, cost: o.liteMs ?? 6, body: true };
  const track = new FakeTrack(o.reportsFps === false ? null : 30, o.maxFps === undefined ? 60 : o.maxFps);
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  let onTick: ((t: VideoFrameTick) => void) | null = null;
  const delivered: number[] = [];
  let calls = 0;
  const detector: PoseDetector = {
    detect(_v, t) {
      calls++;
      w.clock += w.cost;
      return (w.body
        ? { landmarks: Array.from({ length: 33 }, () => ({ ...PT })), timestampMs: t, present: true }
        : { landmarks: [], timestampMs: t, present: false }) as AdapterFrame;
    },
    dispose() {},
  };
  const deps: PoseDeps = {
    getUserMedia: () => Promise.resolve(stream as unknown as MediaStream),
    makeVideo: () => ({ videoWidth: 480, videoHeight: 640, addEventListener() {}, style: { cssText: '' } }) as unknown as HTMLVideoElement,
    playVideo: () => Promise.resolve(),
    releaseVideo: () => {},
    parkVideo: () => {},
    loadDetector: () => Promise.resolve(detector),
    onVideoFrames: (_v, cb) => { onTick = cb; return () => { onTick = null; }; },
    now: () => w.clock,
    env: () => ({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile/15E148 Safari/604.1', maxTouchPoints: 5, portrait: true, search: '' }),
    storage: { get: () => null, set: () => {} },
    setTimer: () => 0,
    clearTimer: () => {},
    warn: () => {},
  };
  const svc = new PoseService(deps);
  svc.onFrame((f) => delivered.push(f.t));
  let id = 0, t = 2000;
  /** n camera frames at the camera's CURRENT rate (what its settings say), each detect costing `cost` ms. */
  const frames = (n: number, fps = track.getSettings().frameRate ?? 30) => {
    for (let i = 0; i < n; i++) { t += 1000 / fps; w.clock = Math.max(w.clock, t); onTick?.({ timestampMs: t, clock: 'capture', frameId: ++id }); }
  };
  return { svc, w, track, frames, delivered, get calls() { return calls; } };
}

const hz = (ts: number[]) => ((ts.length - 1) * 1000) / (ts[ts.length - 1] - ts[0]);

describe('the jump test\'s higher pose rate (T5 opt-in)', () => {
  it('the 50 Hz bar is the Quick Screen\'s own jump gate', () => {
    expect(HIGH_RATE_MIN_HZ).toBe(THRESHOLDS['gate.jumpFps'].value);
  });

  it('standard: a 60 fps camera is thinned to 30 detects a second, exactly as before', async () => {
    const r = rig();
    expect(await r.svc.start()).toBe(true);
    r.track.applyConstraints({ frameRate: { ideal: 60 } });   // a camera at 60 the service never asked to use
    r.frames(120, 60);
    expect(r.svc.rate.mode).toBe('standard');
    expect(hz(r.delivered.slice(-40))).toBeLessThan(31);
  });

  it('asked for: the camera goes to 60, detection to 60, and a device that holds it stays there', async () => {
    const r = rig({ liteMs: 6 });
    await r.svc.start();
    const asked = await r.svc.requestHighRate();
    expect(asked.mode).toBe('trial');
    expect(asked.cameraFps).toBe(60);
    expect(r.track.asked.at(-1)).toEqual({ width: { ideal: 480 }, height: { ideal: 640 }, frameRate: { ideal: 60 } });   // the size kept
    r.frames(HIGH_RATE_WARMUP + HIGH_RATE_SAMPLES + 30);
    expect(r.svc.rate.mode).toBe('high');
    expect(r.svc.rate.why).toMatch(/60 Hz/);
    expect(hz(r.delivered.slice(-30))).toBeGreaterThan(55);
  });

  it('a phone whose detect is over budget falls back to 30 with the reason, and the camera is asked for 30 again', async () => {
    const r = rig({ liteMs: 14 });   // over HIGH_RATE_BUDGET_MS (12.5) but under the 60 fps period
    await r.svc.start();
    await r.svc.requestHighRate();
    r.frames(HIGH_RATE_WARMUP + HIGH_RATE_SAMPLES + 2);
    expect(r.svc.rate.mode).toBe('fallback');
    expect(r.svc.rate.why).toMatch(/ms a detect/);
    expect(r.track.asked.at(-1)).toMatchObject({ width: { ideal: 480 }, height: { ideal: 640 }, frameRate: { ideal: 30 } });
    const before = r.delivered.length;
    r.frames(60, 60);   // whatever the camera still sends, thinned to 30 again
    expect(r.delivered.length - before).toBeLessThanOrEqual(31);
  });

  it('a camera that answers 30 when asked for 60 falls back at once, never measured', async () => {
    const r = rig({ maxFps: 30 });
    await r.svc.start();
    const asked = await r.svc.requestHighRate();
    expect(asked.mode).toBe('fallback');
    expect(asked.why).toMatch(/camera gives 30 fps/);
    r.frames(60);
    expect(r.svc.rate.mode).toBe('fallback');
  });

  it('a camera that does not report its rate is measured, and a rate that never reaches 50 falls back', async () => {
    const r = rig({ reportsFps: false });
    await r.svc.start();
    expect((await r.svc.requestHighRate()).mode).toBe('trial');
    r.frames(HIGH_RATE_WARMUP + HIGH_RATE_SAMPLES + 2, 40);   // it really delivers 40
    expect(r.svc.rate.mode).toBe('fallback');
    expect(r.svc.rate.why).toMatch(/40 Hz at the high rate/);
  });

  it('frames without a body do not count toward the trial', async () => {
    const r = rig();
    await r.svc.start();
    await r.svc.requestHighRate();
    r.w.body = false;
    r.frames(200);
    expect(r.svc.rate.mode).toBe('trial');
  });

  it('endHighRate() puts the 30 Hz thinning back and asks the camera for 30; stop() does too', async () => {
    const r = rig();
    await r.svc.start();
    await r.svc.requestHighRate();
    r.frames(HIGH_RATE_WARMUP + HIGH_RATE_SAMPLES + 2);
    expect(r.svc.rate.mode).toBe('high');
    r.svc.endHighRate();
    expect(r.svc.rate.mode).toBe('standard');
    expect(r.track.asked.at(-1)).toMatchObject({ width: { ideal: 480 }, height: { ideal: 640 }, frameRate: { ideal: 30 } });
    const before = r.delivered.length;
    r.frames(60, 60);
    expect(r.delivered.length - before).toBeLessThanOrEqual(31);
    await r.svc.requestHighRate();
    r.svc.stop();
    expect(r.svc.rate.mode).toBe('standard');
  });

  it('the dev feed has no camera to speed up: it stays standard', async () => {
    const r = rig();
    r.svc.beginFeed();
    expect((await r.svc.requestHighRate()).mode).toBe('standard');
  });

  it('a second ask while one is measured is the same trial, not a restart', async () => {
    const r = rig();
    await r.svc.start();
    await r.svc.requestHighRate();
    r.frames(10);
    expect((await r.svc.requestHighRate()).mode).toBe('trial');
    r.frames(HIGH_RATE_WARMUP + HIGH_RATE_SAMPLES - 8);
    expect(r.svc.rate.mode).toBe('high');
  });
});

describe('the trial on its own (pure)', () => {
  it('decides once, after the warm-up, on the median cost and the achieved rate', () => {
    const tr = new HighRateTrial();
    let t = 0, v: string = 'measuring';
    for (let i = 0; i < HIGH_RATE_WARMUP + HIGH_RATE_SAMPLES - 1; i++) { v = tr.add((t += 1000 / 60), i < HIGH_RATE_WARMUP ? 50 : 5, true); }
    expect(v).toBe('measuring');
    expect(tr.add((t += 1000 / 60), 5, true)).toBe('hold');   // the slow warm-up frames never counted
    expect(tr.add((t += 1000 / 60), 99, true)).toBe('hold');  // decided: later frames change nothing
  });

  it('the verdict reads the rate first, then the cost', () => {
    expect(highRateVerdict(5, 45).verdict).toBe('fallback');
    expect(highRateVerdict(HIGH_RATE_BUDGET_MS + 0.1, 60).verdict).toBe('fallback');
    expect(highRateVerdict(HIGH_RATE_BUDGET_MS, 60).verdict).toBe('hold');
    expect(cameraBelowHighRate(30)).toBe(true);
    expect(cameraBelowHighRate(60)).toBe(false);
    expect(cameraBelowHighRate(undefined)).toBe(false);
    expect(HIGH_RATE_GAP_MS).toBeLessThan(MIN_DETECT_GAP_MS);
  });

  it('the Quick Screen asks for it on T5 only, and hands it back after (assess-app wiring)', () => {
    const app = readFileSync(join(__dirname, '../../app/play/mirror/assess/_components/assess-app.tsx'), 'utf8');
    expect(app).toMatch(/if \(!view\?\.wantsHighFps[\s\S]{0,200}requestHighRate\(\)[\s\S]{0,200}endHighRate\(\)/);
  });
});
