// PerfGovernor — the pacing, the ladder, the hysteresis and the thermal lock, without a GPU (perf-guard, 2026-10-06).
import { describe, it, expect } from 'vitest';
import {
  FramePacer, GovernorCore, ThermalWatch, vsyncDivisor, judgeWindow, scaledHardwareLevel, renderScaleFloor,
  LEVELS, MAX_LEVEL, DEFAULT_GOVERNOR, IDLE_FRAME_MS, quantile, thermalBench,
} from './PerfGovernor';

/** Drive a pacer with a fixed-rate panel for `ms`; returns the times it rendered. */
function drive(p: FramePacer, hz: number, ms: number, t0 = 0): number[] {
  const out: number[] = [];
  const step = 1000 / hz;
  for (let t = t0; t < t0 + ms; t += step) if (p.tick(t)) out.push(t);
  return out;
}
const gaps = (ts: number[]) => ts.slice(1).map((t, i) => t - ts[i]);

describe('vsyncDivisor', () => {
  it('picks the cap or just under it, never over', () => {
    expect(vsyncDivisor(60, 1000 / 60)).toBe(1);
    expect(vsyncDivisor(30, 1000 / 60)).toBe(2);
    expect(vsyncDivisor(60, 1000 / 120)).toBe(2);
    expect(vsyncDivisor(60, 1000 / 90)).toBe(2);    // 45 fps, even
    expect(vsyncDivisor(30, 1000 / 90)).toBe(3);
    expect(vsyncDivisor(60, 1000 / 144)).toBe(3);   // 48 fps, even
    expect(vsyncDivisor(60, 1000 / 59.94)).toBe(1); // a 59.94 Hz panel still renders every vsync
  });
});

describe('FramePacer', () => {
  it('renders every vsync at a 60 cap on a 60 Hz panel', () => {
    const p = new FramePacer();
    const r = drive(p, 60, 2000);
    expect(r.length).toBeGreaterThanOrEqual(119);
  });

  it('holds a 120 Hz phone to an even 60', () => {
    const p = new FramePacer();
    const r = drive(p, 120, 2000).slice(20);
    const g = gaps(r);
    expect(Math.min(...g)).toBeGreaterThan(16);
    expect(Math.max(...g)).toBeLessThan(17.5);
  });

  it('a 30 cap on 60 Hz alternates evenly, even with sub-ms jitter on the ticks', () => {
    const p = new FramePacer();
    p.setCap(30);
    const out: number[] = [];
    let t = 0;
    for (let i = 0; i < 240; i++) { t += 1000 / 60 + (i % 2 ? 0.4 : -0.4); if (p.tick(t)) out.push(t); }
    const g = gaps(out.slice(10));
    // every gap is two vsyncs: never one (a double frame) and never three (the slip Babylon's maxFPS makes)
    for (const x of g) { expect(x).toBeGreaterThan(30); expect(x).toBeLessThan(36); }
  });

  it('a busy frame that ran long does not trigger a catch-up burst', () => {
    const p = new FramePacer();
    p.setCap(30);
    drive(p, 60, 1000);
    // a 50 ms stall, then the panel resumes
    let t = 1050;
    const out: number[] = [];
    for (let i = 0; i < 30; i++) { if (p.tick(t)) out.push(t); t += 1000 / 60; }
    for (const x of gaps(out)) expect(x).toBeGreaterThan(30);
  });

  it('estimates the panel from the cheap skipped ticks, not the long rendered ones', () => {
    const p = new FramePacer();
    p.setCap(30);
    // rendered frames take 25 ms of main thread, so their ticks are late; skipped ticks land on the 60 Hz vsync
    let t = 0;
    for (let i = 0; i < 200; i++) { const r = p.tick(t); t += r ? 25 : 1000 / 60; }
    expect(p.vsyncMs).toBeGreaterThan(15);
    expect(p.vsyncMs).toBeLessThan(18);
    expect(p.divisor).toBe(2);
  });

  it('a device too busy to ever hit vsync is still judged against 60 Hz, not against its own slowness', () => {
    const p = new FramePacer();
    let t = 0;
    for (let i = 0; i < 200; i++) { p.tick(t); t += 30; }   // every tick 30 ms late: there are no cheap ticks to measure
    expect(p.vsyncMs).toBeCloseTo(1000 / 60);
    expect(p.targetMs).toBeCloseTo(1000 / 60);
  });

  it('low mode refreshes at the idle rate; stop renders nothing', () => {
    const p = new FramePacer();
    drive(p, 60, 500);
    p.setMode('low');
    const low = drive(p, 60, 3000, 500);
    expect(low.length).toBeGreaterThanOrEqual(Math.floor(3000 / IDLE_FRAME_MS) - 1);
    expect(low.length).toBeLessThanOrEqual(Math.ceil(3000 / IDLE_FRAME_MS) + 1);
    p.setMode('stop');
    expect(drive(p, 60, 3000, 3500)).toHaveLength(0);
  });

  it('flags the first frame after an idle so the frame clock can be reset — once', () => {
    const p = new FramePacer();
    drive(p, 60, 500);
    expect(p.takeResumed()).toBe(false);
    p.setMode('stop');
    drive(p, 60, 1000, 500);
    p.setMode('run');
    let t = 1500;
    while (!p.tick(t)) t += 1000 / 60;
    expect(p.takeResumed()).toBe(true);
    expect(p.takeResumed()).toBe(false);
    p.tick(t + 1000 / 60);
    expect(p.takeResumed()).toBe(false);
  });
});

describe('judgeWindow', () => {
  const w = (missRate: number, workP90: number) => ({ frames: 60, missRate, workP50: workP90 / 2, workP90, targetMs: 1000 / 60 });
  it('slow on missed frames or JS eating the frame; fast only with both clear', () => {
    expect(judgeWindow(w(0.2, 5))).toBe('slow');
    expect(judgeWindow(w(0, 16))).toBe('slow');
    expect(judgeWindow(w(0, 5))).toBe('fast');
    expect(judgeWindow(w(0.05, 5))).toBe('ok');
    expect(judgeWindow({ ...w(0.5, 30), frames: 2 })).toBe('ok');   // an idle window says nothing
  });
});

/** Feed the governor a steady stream: `interval` between frames, `work` JS each, for `ms`. */
function feed(g: GovernorCore, ms: number, interval: number, work: number, t0: number): { t: number; changes: string[] } {
  const changes: string[] = [];
  let t = t0;
  const target = g.state.cap === 60 ? 1000 / 60 : 1000 / 30;
  for (; t < t0 + ms; t += interval) {
    const s = g.frame(interval, work, t, g.state.cap === 60 ? 1000 / 60 : 1000 / 30);
    if (s) changes.push(`${s.cap}/${s.level}`);
  }
  void target;
  return { t, changes };
}

describe('GovernorCore', () => {
  it('a phone that holds 60 is left alone', () => {
    const g = new GovernorCore();
    const r = feed(g, 60_000, 1000 / 60, 4, 0);
    expect(r.changes).toEqual([]);
    expect(g.state).toMatchObject({ level: 0, cap: 60 });
  });

  it('a very slow device (a frame every 2 s) still steps: its windows stretch until they hold enough frames', () => {
    const g = new GovernorCore();
    const r = feed(g, 120_000, 2000, 150, 0);
    expect(r.changes.length).toBeGreaterThanOrEqual(3);
    expect(r.changes[0]).toBe('60/1');
  });

  it('the first seconds of a mount (shader compiles, uploads) are not judged', () => {
    const g = new GovernorCore();
    const bad = feed(g, 4900, 60, 30, 0);                  // awful, but inside the warm-up
    const good = feed(g, 30_000, 1000 / 60, 4, bad.t);
    expect([...bad.changes, ...good.changes]).toEqual([]);
    expect(g.state).toMatchObject({ level: 0, cap: 60 });
  });

  it('one hitch is not a trend: a single slow window does not step', () => {
    const g = new GovernorCore();
    let { t } = feed(g, 10_000, 1000 / 60, 4, 0);
    ({ t } = feed(g, 2000, 30, 4, t));       // one bad window
    const r = feed(g, 20_000, 1000 / 60, 4, t);
    expect(r.changes).toEqual([]);
    expect(g.state.level).toBe(0);
  });

  it('sustained slowness at 60 spends resolution first, then gives up 60 for 30', () => {
    const g = new GovernorCore();
    const r = feed(g, 40_000, 28, 12, 0);
    expect(r.changes.slice(0, 3)).toEqual(['60/1', '60/2', '30/2']);
  });

  it('at 30 it keeps stepping down to the floor of the ladder, and stops there', () => {
    const g = new GovernorCore({}, 30);
    const r = feed(g, 120_000, 60, 20, 0);
    expect(g.state.level).toBe(MAX_LEVEL);
    expect(r.changes.at(-1)).toBe(`30/${MAX_LEVEL}`);
  });

  it('headroom steps back up only after the cooldown, then tries 60 again', () => {
    const g = new GovernorCore();
    let t = 0;
    while (g.state.cap === 60 && t < 60_000) { g.frame(28, 12, t, 1000 / 60); t += 28; }   // → 30 fps at level 2
    expect(g.state).toMatchObject({ cap: 30, level: 2 });
    const first = feed(g, DEFAULT_GOVERNOR.cooldownMs - 12_000, 1000 / 30, 3, t);
    expect(first.changes).toEqual([]);                    // still cooling
    t = first.t;
    // a light scene: the phone now holds whatever cap it is given
    const changes: string[] = [];
    for (const end = t + 90_000; t < end; ) {
      const iv = g.state.cap === 60 ? 1000 / 60 : 1000 / 30;
      const s = g.frame(iv, 3, t, iv);
      if (s) changes.push(`${s.cap}/${s.level}`);
      t += iv;
    }
    expect(changes).toEqual(['30/1', '30/0', '60/0']);
  });

  it('oscillation doubles the cooldown (no flapping between two levels)', () => {
    const g = new GovernorCore({}, 30);
    let t = 0;
    const ups: number[] = [];
    // alternate: heavy until it steps down, light until it steps up
    for (let k = 0; k < 6; k++) {
      ({ t } = feed(g, 6000, 60, 20, t));
      const before = t;
      for (let i = 0; i < 8000; i++) {
        const s = g.frame(1000 / 30, 3, t, 1000 / 30);
        t += 1000 / 30;
        if (s && s.reason.startsWith('headroom')) { ups.push(t - before); break; }
      }
    }
    // each wait for the step up is at least as long as the last, and the later ones much longer
    expect(ups.length).toBeGreaterThanOrEqual(3);
    expect(ups.at(-1)!).toBeGreaterThan(ups[0] * 1.8);
  });

  it('promotion to 60 is retried a bounded number of times', () => {
    const g = new GovernorCore({}, 30);
    let t = 0;
    let promotions = 0;
    for (let k = 0; k < 8; k++) {
      // light at 30 → promotes; then slow at 60 → back to 30
      for (let i = 0; i < 4000 && g.state.cap === 30; i++) { const s = g.frame(1000 / 30, 3, t, 1000 / 30); t += 1000 / 30; if (s?.cap === 60) promotions++; }
      for (let i = 0; i < 4000 && g.state.cap === 60; i++) { g.frame(28, 12, t, 1000 / 60); t += 28; }
    }
    expect(promotions).toBe(DEFAULT_GOVERNOR.maxPromotions);
  });

  it('thermal lock: steps down and never climbs back above it', () => {
    const g = new GovernorCore({}, 30);
    let { t } = feed(g, 10_000, 60, 20, 0);
    const lvl = g.state.level;
    g.thermal(t);
    expect(g.state.thermal).toBe(true);
    expect(g.state.level).toBe(Math.min(MAX_LEVEL, lvl + 1));
    const locked = g.state.level;
    ({ t } = feed(g, 300_000, 1000 / 30, 2, t));          // five minutes of headroom
    expect(g.state.level).toBe(locked);
    expect(g.state.cap).toBe(30);
  });

  it('thermal at 60 gives up 60 first, and 60 is never retried', () => {
    const g = new GovernorCore();
    g.thermal(1000);
    expect(g.state).toMatchObject({ cap: 30, level: 0, thermal: true });
    feed(g, 300_000, 1000 / 30, 2, 1000);
    expect(g.state.cap).toBe(30);
  });

  it('the in-game trend: same level, work rising 35%+ for minutes with frames now late → thermal', () => {
    const g = new GovernorCore({}, 30);
    let t = 0;
    // two and a half minutes holding 30 with JS creeping from 8 to 13 ms (every frame still on time), then frames miss
    for (; t < 150_000; t += 1000 / 30) g.frame(1000 / 30, 8 + (t / 150_000) * 5, t, 1000 / 30);
    expect(g.state.thermal).toBe(false);
    let hit = false;
    for (; t < 200_000 && !hit; t += 50) { const s = g.frame(50, 13, t, 1000 / 30); if (s?.thermal) hit = true; }
    expect(hit).toBe(true);
    expect(g.state.reason).toMatch(/^thermal/);
  });

  it('a busier scene with every frame on time is not thermal', () => {
    const g = new GovernorCore({}, 30);
    let t = 0;
    for (; t < 300_000; t += 1000 / 30) g.frame(1000 / 30, 6 + (t / 300_000) * 8, t, 1000 / 30);
    expect(g.state.thermal).toBe(false);
  });

  it('interrupt (a menu, a hidden tab) drops the streaks: a pause is not slowness', () => {
    const g = new GovernorCore();
    let { t } = feed(g, 2100, 28, 12, 0);    // one slow window banked
    g.interrupt(t);
    ({ t } = feed(g, 2100, 28, 12, t + 5000)); // settling window, then one more slow
    expect(g.state.level).toBe(0);
  });
});

describe('the ladder', () => {
  it('only ever gets cheaper going down', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      const a = LEVELS[i - 1], b = LEVELS[i];
      expect(b.renderScale).toBeLessThanOrEqual(a.renderScale);
      expect(b.shadowEvery).toBeGreaterThanOrEqual(a.shadowEvery);
      expect(b.particles).toBeLessThanOrEqual(a.particles);
      expect(Number(b.ambient)).toBeLessThanOrEqual(Number(a.ambient));
    }
    expect(LEVELS[0]).toEqual({ renderScale: 1, shadowEvery: 1, particles: 1, ambient: true, crowd: 'full' });
  });

  it('resolution never drops below one backing pixel per CSS pixel', () => {
    // a DPR-2 fit (hardware level 0.5): 0.6 of it is 1.2 backing px per CSS px
    expect(scaledHardwareLevel(0.5, 0.6)).toBeCloseTo(0.5 / 0.6);
    expect(1 / scaledHardwareLevel(0.5, 0.1)).toBeCloseTo(1);           // floored at 1:1
    expect(scaledHardwareLevel(1, 0.6)).toBe(1);                         // a 1x fit has no resolution to give
    expect(scaledHardwareLevel(0.5, 1)).toBe(0.5);                       // level 0 is the fit, untouched
    expect(renderScaleFloor(2)).toBe(0.5);
    expect(scaledHardwareLevel(NaN, 0.6)).toBe(1);
  });
});

describe('ThermalWatch', () => {
  it('trips once when the fixed benchmark slows 40%+ after the baseline, never during warm-up', () => {
    const w = new ThermalWatch();
    let t = 0;
    for (; t < 20_000; t += 5000) expect(w.sample(9, t)).toBe(false);   // warm-up: ignored even if slow
    for (let i = 0; i < 5; i++, t += 5000) w.sample(2, t);
    expect(w.baseline).toBe(2);
    for (let i = 0; i < 10; i++, t += 5000) expect(w.sample(2.3, t)).toBe(false);   // noise
    let trips = 0;
    for (let i = 0; i < 10; i++, t += 5000) if (w.sample(3, t)) trips++;
    expect(trips).toBe(1);
    expect(w.tripped).toBe(true);
  });

  it('one slow sample (a GC, a background task) is not throttling', () => {
    const w = new ThermalWatch({ warmupMs: 0 });
    let t = 0;
    for (let i = 0; i < 5; i++, t += 5000) w.sample(2, t);
    for (let i = 0; i < 20; i++, t += 5000) expect(w.sample(i % 5 === 0 ? 9 : 2, t)).toBe(false);
  });

  it('a timer too coarse to resolve the benchmark never trips', () => {
    const w = new ThermalWatch({ warmupMs: 0 });
    let t = 0;
    for (let i = 0; i < 5; i++, t += 5000) w.sample(0, t);
    for (let i = 0; i < 10; i++, t += 5000) expect(w.sample(1, t)).toBe(false);
  });

  it('the benchmark is deterministic work', () => {
    expect(thermalBench(1000)).toBe(thermalBench(1000));
    expect(quantile([5, 1, 3], 0.5)).toBe(3);
  });
});
