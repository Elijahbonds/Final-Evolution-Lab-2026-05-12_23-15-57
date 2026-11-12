// COACH-READINESS: the baseline math. The two promises the brief names, measured:
//   · NORMAL NOISE NEVER READS AS A DROP — any day inside the measurement's own smallest real change is never Low, under
//     every rule a coach can set (the lowest %, twice-in-a-row with a dip before it, a feel of 1);
//   · A REAL 8–10 % DROP FLAGS — under the default rule, against a baseline with a measured day-to-day spread.
// Plus a seeded simulation of camera-only noise (the bench's per-jump ± at 60 fps) for the false-flag RATE, recorded in
// docs/COACH-READINESS.md, and a run through real filmed takes (lib/jump/ballistic.ts → the live capture → the read).
import { describe, expect, it } from 'vitest';
import { applyRule, baselineOf, DEFAULT_RULE, measure } from '@/lib/coach/readiness/rules';
import { buildTake, filmTake } from '@/lib/jump/ballistic';
import { ReadinessCapture } from '@/lib/coach/readiness/capture';
import { BASELINE_MAX_CHECKS, BASELINE_MIN_CHECKS, DROP_PCT } from '@/lib/coach/readiness/thresholds';
import type { PriorCheck, ReadinessRule } from '@/lib/coach/readiness/types';

const day = (n: number) => new Date(Date.UTC(2026, 9, 1) + n * 86_400_000).toISOString().slice(0, 10);
const prior = (n: number, best: number, o: Partial<PriorCheck> = {}): PriorCheck => ({ day: day(n), bestCm: best, meanCm: best - 1.2, teCm: 1.4, jumps: 3, poseHz: 60, belowReal: false, band: 'normal', ...o });
/** A week of normal days around 40 cm: ±0.6 cm, the bench's best-of-3 spread at 60 fps. */
const WEEK = [40.2, 39.6, 40.5, 39.9, 40.4, 39.7, 40.1].map((b, i) => prior(i, b));
const TODAY = day(7);

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());

describe('the baseline', () => {
  it('builds: no baseline until BASELINE_MIN_CHECKS prior checks, and the day reads "building" (never Low)', () => {
    expect(baselineOf(WEEK.slice(0, BASELINE_MIN_CHECKS - 1), TODAY)).toBeNull();
    const f = measure({ day: TODAY, bestCm: 20, meanCm: 19, teCm: 1.4, jumps: 3, poseHz: 60 }, baselineOf(WEEK.slice(0, 2), TODAY), 1);
    expect(applyRule(f, DEFAULT_RULE, null, TODAY)).toMatchObject({ band: 'building', reason: 'building', ease: false });
    expect(baselineOf(WEEK.slice(0, BASELINE_MIN_CHECKS), TODAY)?.n).toBe(BASELINE_MIN_CHECKS);
  });

  it('reads only prior days inside the window, newest BASELINE_MAX_CHECKS, Low days left out', () => {
    const many = Array.from({ length: 20 }, (_, i) => prior(i - 20 + 6, 40)); // days -14 … 5
    const b = baselineOf([...many, prior(6, 30, { band: 'low' }), prior(7, 10)], TODAY)!;
    expect(b.n).toBe(BASELINE_MAX_CHECKS);
    expect(b.days).not.toContain(day(6));   // the Low day
    expect(b.days).not.toContain(TODAY);    // today itself
    expect(b.bestCm).toBe(40);
    expect(baselineOf([prior(-40, 40), prior(-35, 40), prior(-30, 40)], TODAY)).toBeNull(); // all older than the window
  });

  it('its day spread never goes under the camera\'s part or the body\'s own CV', () => {
    const flat = [0, 1, 2, 3].map((i) => prior(i, 40, { meanCm: 40, teCm: 3 }));
    const b = baselineOf(flat, TODAY)!;
    expect(b.dayTeCm).toBeGreaterThanOrEqual(Math.round((3 / Math.sqrt(3)) * 10) / 10);
    expect(b.dayTeCm).toBeGreaterThanOrEqual(1.2); // 3 % of 40 cm
  });
});

describe('normal noise never reads as a drop', () => {
  const base = baselineOf(WEEK, TODAY)!;
  const lowest: ReadinessRule[] = [
    { kind: 'drop_pct', dropPct: DROP_PCT.min, action: 'ease', source: 'athlete' },
    { kind: 'low_twice', dropPct: DROP_PCT.min, action: 'ease', source: 'athlete' },
    DEFAULT_RULE,
  ];
  const dipBefore = prior(6, 36, { belowReal: true });

  it('every day inside the smallest real change, under every rule, with the lowest feel: never Low', () => {
    const src = measure({ day: TODAY, bestCm: base.bestCm, meanCm: base.meanCm, teCm: 1.4, jumps: 3, poseHz: 60 }, base, null).realChangeCm!;
    expect(src).toBeGreaterThan(0);
    let tried = 0;
    for (let d = -src * 0.999; d <= src * 0.999; d += src / 25) {
      for (const meanShift of [0, d]) {
        const f = measure({ day: TODAY, bestCm: base.bestCm + d, meanCm: base.meanCm + meanShift, teCm: 1.4, jumps: 3, poseHz: 60 }, base, 1);
        expect(f.belowReal).toBe(false);
        for (const rule of lowest) { expect(applyRule(f, rule, dipBefore, TODAY).band).not.toBe('low'); tried++; }
      }
    }
    expect(tried).toBeGreaterThan(100);
  });

  it('a dip in the best alone (the mean held) is not a drop: one off jump is not a day', () => {
    const f = measure({ day: TODAY, bestCm: base.bestCm * 0.88, meanCm: base.meanCm, teCm: 1.4, jumps: 3, poseHz: 60 }, base, null);
    expect(f.belowReal).toBe(false);
    expect(applyRule(f, DEFAULT_RULE, null, TODAY).band).toBe('normal');
  });

  it('seeded camera noise (60 fps per-jump ±, no real change): the false Low rate stays under 2 %, and twice-in-a-row ~0', () => {
    // the bench's live per-jump SD at 60 fps (docs/JUMP-PRO.md: ~1.4 cm) and a 1.5 % trial-to-trial spread; 20 athletes × 90 days
    let days = 0, lows = 0, twice = 0;
    for (let a = 1; a <= 20; a++) {
      const r = rng(a * 7919);
      const hist: PriorCheck[] = [];
      for (let d = 0; d < 90; d++) {
        const hs = [0, 1, 2].map(() => 40 * (1 + 0.015 * gauss(r)) + 1.4 * gauss(r));
        const best = Math.max(...hs), mean = hs.reduce((x, y) => x + y) / 3;
        const sd = Math.sqrt(hs.reduce((x, h) => x + (h - mean) ** 2, 0) / 2);
        const t = { day: day(d), bestCm: best, meanCm: mean, teCm: Math.max(sd, 1.4, mean * 0.03), jumps: 3, poseHz: 60 };
        const b = baselineOf(hist, t.day);
        const f = measure(t, b, null);
        const prev = hist[hist.length - 1] ?? null;
        const rd = applyRule(f, DEFAULT_RULE, prev, t.day);
        if (b) { days++; if (rd.band === 'low') lows++; if (applyRule(f, { ...DEFAULT_RULE, kind: 'low_twice' }, prev, t.day).band === 'low') twice++; }
        hist.push({ ...t, belowReal: f.belowReal, band: rd.band });
      }
    }
    expect(days).toBeGreaterThan(1500);
    expect(lows / days).toBeLessThan(0.02);
    expect(twice / days).toBeLessThan(0.002);
  });
});

describe('a real 8–10 % drop flags', () => {
  const base = baselineOf(WEEK, TODAY)!;
  it.each([8, 9, 10])('%i %% down on best and mean, at a normal session spread: Low under the default rule, and the day eases', (pct) => {
    const k = 1 - pct / 100;
    const f = measure({ day: TODAY, bestCm: base.bestCm * k, meanCm: base.meanCm * k, teCm: 1.4, jumps: 3, poseHz: 60 }, base, null);
    expect(f.belowReal).toBe(true);
    expect(f.dropPct).toBeCloseTo(pct, 0);
    expect(applyRule(f, DEFAULT_RULE, null, TODAY)).toMatchObject({ band: 'low', reason: 'low_drop', ease: true });
  });

  it('through real filmed takes (60 fps, a 42 cm jumper): six normal days, then the same body 9 % down reads Low; the same body unchanged does not', () => {
    const check = (seed: number, h: number) => {
      const take = buildTake([0, 1, 2].map((i) => ({ trial: { heightM: h * (1 + 0.012 * Math.sin(seed * 3.1 + i)) } })), { leadS: 3.2 });
      const { frames } = filmTake(take, { fps: 60, seed });
      const c = new ReadinessCapture({ aspect: 4 / 3 });
      for (const fr of frames) if (c.push(fr).step === 'done') break;
      const r = c.finish();
      if (!r.ok) throw new Error(r.why);
      return r.jumps;
    };
    const hist: PriorCheck[] = [0, 1, 2, 3, 4, 5].map((d) => ({ day: day(d), ...check(100 + d, 0.42), belowReal: false, band: 'normal' as const }));
    const b = baselineOf(hist, day(6))!;
    expect(b.n).toBe(6);
    const same = measure({ day: day(6), ...check(150, 0.42) }, b, null);
    expect(applyRule(same, DEFAULT_RULE, null, day(6)).band).not.toBe('low');
    const down = measure({ day: day(6), ...check(170, 0.42 * 0.91) }, b, null);
    expect(applyRule(down, DEFAULT_RULE, null, day(6)).band).toBe('low');
  }, 60_000);
});
