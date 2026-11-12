import { describe, it, expect, beforeEach } from 'vitest';
import {
  summarizeFrames, osClass, fpsDetail, ttfpDetail, mountPerfStats, _resetPerfStatsPage, PAGE_CAP, type DeviceClass,
} from './perfStats';

const DEV: DeviceClass = { os: 'ios', gl: 2, tier: 'mobile', dpr: 3, px: '780x1688', gpu: 'integrated' };

/** A fake engine: the two frame observables and a frame driver on a fake clock. */
function rig() {
  let t = 0, hidden = false;
  const obs = () => { const fns = new Set<() => void>(); return { add: (f: () => void) => { fns.add(f); return f; }, remove: (f: () => void) => fns.delete(f), fire: () => fns.forEach((f) => f()), size: () => fns.size }; };
  const begin = obs(), end = obs();
  const engine = { onBeginFrameObservable: begin, onEndFrameObservable: end, getRenderWidth: () => 780, getRenderHeight: () => 1688 };
  const sent: Array<[string, string]> = [];
  const stats = mountPerfStats({
    engine: engine as never, tier: 'mobile', device: () => DEV,
    host: { now: () => t, hidden: () => hidden },
    send: (k, d) => { sent.push([k, d]); return true; },
    guard: () => ({ cap: 60, level: 0, hardwareScalingLevel: 1 }),
  });
  const frame = (intervalMs: number, workMs = 5) => { t += intervalMs - workMs; begin.fire(); t += workMs; end.fire(); };
  return { stats, frame, sent, wait: (ms: number) => { t += ms; }, setHidden: (h: boolean) => { hidden = h; }, begin, end };
}

describe('perfStats (anonymous fps + time to first playable)', () => {
  beforeEach(() => _resetPerfStatsPage());

  it('summarizes a window: median and p5 fps, long frames per minute, worst, work', () => {
    const iv = [...Array(95).fill(16.67), ...Array(5).fill(100)];
    const s = summarizeFrames(iv, Array(100).fill(4));
    expect(s.n).toBe(100);
    expect(s.fpsP50).toBeCloseTo(60, 0);
    expect(s.fpsP5).toBeCloseTo(60, 0);   // the 95th-percentile frame is still a 60 Hz one: 5 % are long
    expect(s.worstMs).toBeCloseTo(100, 3);
    expect(s.longPerMin).toBeCloseTo(5 / ((95 * 16.67 + 500) / 60000), 1);
    expect(s.workP50).toBe(4);
  });

  it('classes the device without keeping the user agent', () => {
    expect(osClass('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe('ios');
    expect(osClass('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios');   // iPadOS
    expect(osClass('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe('other');
    expect(osClass('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 5)).toBe('android');
  });

  it('keeps every detail line inside diag.ts\'s 240 characters', () => {
    const s = summarizeFrames([16.7, 33.4, 250.25], [9.99, 12.2, 48.1]);
    expect(fpsDetail(2, s, { cap: 30, level: 4, hw: 2.75 }, { ...DEV, px: '1170x2532', gpu: 'unknown' }).length).toBeLessThanOrEqual(240);
    expect(ttfpDetail({ readyMs: 123456, startMs: 3456, firstMs: 789, pageMs: 9876543, leftMs: 123456 }, DEV).length).toBeLessThanOrEqual(240);
  });

  it('a session: one ttfp at the first frame of play, an fps report for 0-30 s and for 90-120 s, then nothing', () => {
    const r = rig();
    r.stats.setPhase('loading');
    r.wait(4000);
    r.stats.setPhase('ready');
    r.wait(2000);
    r.stats.setPhase('countdown');
    for (let i = 0; i < 10; i++) r.frame(16.67);   // countdown frames are not play
    r.stats.setPhase('playing');
    r.frame(100, 40);   // the first frame of play: 40 ms of work (its interval has no frame before it, so it is not counted)
    expect(r.sent).toHaveLength(1);
    expect(r.sent[0][0]).toBe('ttfp');
    expect(r.sent[0][1]).toMatch(/^ready=4000 start=\d+ first=40 page=\d+ os=ios gl=2 tier=mobile dpr=3 px=780x1688 gpu=integrated$/);
    for (let i = 0; i < 60 * 31; i++) r.frame(1000 / 60);
    expect(r.sent.map((s) => s[0])).toEqual(['ttfp', 'fps']);
    // the 40 ms first frame is a real hitch: the next frame begins 52 ms after it, one long frame in 30 s = 2 / min
    expect(r.sent[1][1]).toMatch(/^w=1 n=\d+ fps50=60 fps5=60 long=2\/min worst=52 work50=5 work95=5 cap=60 lvl=0 hw=1.00 os=ios/);
    for (let i = 0; i < 60 * 200; i++) r.frame(1000 / 60);
    expect(r.sent.map((s) => s[0])).toEqual(['ttfp', 'fps', 'fps']);
    expect(r.sent[2][1]).toMatch(/^w=2 /);
    r.stats.dispose();
    expect(r.sent).toHaveLength(3);
    expect(r.begin.size() + r.end.size()).toBe(0);
  });

  it('a pause, a hidden page and an over-long gap are not frames of play', () => {
    const r = rig();
    r.stats.setPhase('playing');
    r.frame(16.67);   // ttfp
    for (let i = 0; i < 60 * 10; i++) r.frame(1000 / 60);
    r.stats.setPhase('paused');
    for (let i = 0; i < 60 * 60; i++) r.frame(500);   // a paused scene refreshes at 2 fps: not play
    r.stats.setPhase('playing');
    r.setHidden(true);
    for (let i = 0; i < 100; i++) r.frame(16.67);
    r.setHidden(false);
    r.wait(5000);
    for (let i = 0; i < 60 * 21; i++) r.frame(1000 / 60);
    const fps = r.sent.filter((s) => s[0] === 'fps');
    expect(fps).toHaveLength(1);
    expect(fps[0][1]).toMatch(/fps5=60 long=0\/min worst=17 /);   // no 500 ms paused frame, no 5 s gap
  });

  it('a mount left before its first frame of play still reports its wait', () => {
    const r = rig();
    r.stats.setPhase('loading');
    r.wait(9000);
    r.stats.dispose();
    expect(r.sent).toEqual([['ttfp', expect.stringMatching(/^ready=- start=- first=- page=9000 left=9000 os=ios/)]]);
  });

  it('at most PAGE_CAP reports of each kind per page, across mounts', () => {
    const sent: string[] = [];
    for (let m = 0; m < PAGE_CAP + 3; m++) {
      const r = rig();
      r.stats.setPhase('playing');
      for (let i = 0; i < 60 * 31; i++) r.frame(1000 / 60);
      sent.push(...r.sent.map((s) => s[0]));
      r.stats.dispose();
    }
    expect(sent.filter((k) => k === 'ttfp')).toHaveLength(PAGE_CAP);
    expect(sent.filter((k) => k === 'fps')).toHaveLength(PAGE_CAP);
  });
});
