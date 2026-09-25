import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FeedSchedule, feedHookAllowed } from './feed';
import type { PoseFrame } from './landmarks';
import type { PoseFixture } from './synth';

const load = (name: string) => JSON.parse(readFileSync(join(__dirname, '__fixtures__', `${name}.json`), 'utf8')) as PoseFixture;

describe('the feed hook gate', () => {
  it('is on in development, and on a production build only on this machine under ?agent=1', () => {
    expect(feedHookAllowed('development', false, 'final-evolution-lab.web.app')).toBe(true);
    expect(feedHookAllowed('development', false, '192.168.1.20')).toBe(true);   // a phone on the LAN hitting next dev
    for (const local of ['localhost', '127.0.0.1', '[::1]', 'lane.localhost']) {
      expect(feedHookAllowed('production', true, local), local).toBe(true);   // next start, where the QA eye grades
      expect(feedHookAllowed('production', false, local), local).toBe(false);
    }
    expect(feedHookAllowed('test', false, 'localhost')).toBe(false);
    expect(feedHookAllowed(undefined, false, 'localhost')).toBe(false);
  });

  it('never on the deployed site: ?agent=1 is a query string anyone can type', () => {
    for (const host of ['final-evolution-lab.web.app', 'finalevolution.abacusai.app', 'localhost.evil.example', '127.0.0.1.nip.io']) {
      expect(feedHookAllowed('production', true, host), host).toBe(false);
    }
  });
});

describe('a fixture played on its own timing', () => {
  const fx = load('jump_two_foot_low');
  const frames = fx.frames;
  const START = 50_000;   // the page clock when play() was called

  it('each frame is due when it arrived in the take, counted from the first capture', () => {
    const s = new FeedSchedule(frames, START);
    expect(s.nextAt()).toBeCloseTo(START + (frames[0].arrive! - frames[0].t), 6);   // the first frame's own latency
    // step the clock one ms at a time: every frame comes out once, in order, at its own moment
    const out: { at: number; f: PoseFrame }[] = [];
    const end = START + (frames[frames.length - 1].arrive! - frames[0].t) + 1;
    for (let now = START; now <= end; now++) for (const f of s.due(now)) out.push({ at: now, f });
    expect(out).toHaveLength(frames.length);
    expect(s.done).toBe(true);
    expect(s.nextAt()).toBeNull();
    out.forEach(({ at, f }, i) => {
      const due = START + (frames[i].arrive! - frames[0].t);
      expect(at - due).toBeGreaterThanOrEqual(0);
      expect(at - due).toBeLessThan(1);
      // t moved onto the page clock, spacing kept to the ms: detectors see the take's real timing
      expect(f.t).toBeCloseTo(START + (frames[i].t - frames[0].t), 9);
      expect(f.image).toBe(frames[i].image);
    });
  });

  it('keeps the take\'s camera latency: every frame arrives after its capture', () => {
    const s = new FeedSchedule(frames, START);
    const all = s.due(Infinity);
    const lags = all.map((f) => f.arrive! - f.t);
    expect(Math.min(...lags)).toBeGreaterThan(0);
    expect(lags.reduce((a, b) => a + b, 0) / lags.length).toBeCloseTo(fx.settings.synth.latencyMs, -1);
  });

  it('retime: false hands every frame over exactly as given, on the same schedule', () => {
    const s = new FeedSchedule(frames, START, { retime: false });
    const first = s.due(START + 1000);
    expect(first[0]).toBe(frames[0]);
    expect(first.length).toBeGreaterThan(20);
    expect(first.length).toBeLessThan(40);   // about a second of a 30 fps take
  });

  it('rate 0.5 takes twice as long', () => {
    const s = new FeedSchedule(frames, START, { rate: 0.5 });
    const all = s.due(Infinity);
    const span = all[all.length - 1].t - all[0].t;
    expect(span).toBeCloseTo(2 * (frames[frames.length - 1].t - frames[0].t), 6);
  });

  it('delivery never goes backwards, even when a frame arrived before the one ahead of it', () => {
    const mk = (t: number, arrive: number): PoseFrame => ({ t, arrive, present: false, image: [] });
    const s = new FeedSchedule([mk(0, 100), mk(33, 90), mk(66, 130)], 0);
    expect(s.due(95)).toHaveLength(0);
    expect(s.due(100).map((f) => f.t)).toEqual([0, 33]);
    expect(s.nextAt()).toBe(130);
  });

  it('a frame with no arrive is due at its capture time; an empty list is done at once', () => {
    const s = new FeedSchedule([{ t: 10, present: false, image: [] }, { t: 43, present: false, image: [] }], 1000);
    expect(s.nextAt()).toBe(1000);
    expect(s.due(1032)).toHaveLength(1);
    expect(s.due(1033)).toHaveLength(1);
    expect(new FeedSchedule([], 0).nextAt()).toBeNull();
  });
});
