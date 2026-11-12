// JUMP-PRO 2 items 2 and 4, and the standing reach's device seam: the drop jump / RSI on the ground-truth bench
// (lib/jump/dropBench.ts; the full matrix: `npx tsx scripts/jump-accuracy.ts --drop`), Sayers power (adults only, an
// estimate, nothing stored), and lib/jump/reachStore.ts (one key, validated, wipeable, never sent).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { dropConditions, dropTakes, runDrop } from '@/lib/jump/dropBench';
import { readDrop } from '@/lib/jump/drop';
import { rsiWithRange } from '@/lib/jump/rebound';
import { sayersPower, lbToKg } from '@/lib/jump/power';
import { forgetReach, loadReach, REACH_KEY, saveReach, type ReachStorage } from '@/lib/jump/reachStore';
import { gradeT5 } from '@/lib/assess/graders/t5-cmj';
import { calibrateFront } from '@/lib/assess/calibration';
import { JumpMore } from '@/components/jump/jump-more';
import { PowerEstimate } from '@/components/jump/power-estimate';

const cond = (fps: number, name: string, seeds = 1) => dropConditions(seeds).find((c) => c.fps === fps && c.name.startsWith(name))!;

describe('the drop jump (lib/jump/drop.ts)', () => {
  it('before: the jump check reads no jump and no RSI from a drop jump (the step off a box is not a jump)', () => {
    let rsi = 0, jumps = 0;
    for (const { frames } of dropTakes(cond(60, '30–45'))) {
      const c = calibrateFront(frames.filter((f) => f.t < 1150), 4 / 3, 1000, 0.3);
      if (!c.ok) continue;
      const t5 = gradeT5(frames, { calibration: { aspect: 4 / 3, front: c.value, side: null }, aspect: 4 / 3 }).t5;
      jumps += t5.jumps.filter((j) => j.valid).length;
      if (t5.rebounds?.bestRsi) rsi++;
    }
    expect(rsi).toBe(0);
    expect(jumps).toBe(0);
  });
  it('30–45 cm boxes, 200 ms contact at 60 fps: every drop read; rebound |bias| ≤ 1.5 cm; contact |bias| ≤ 12 ms, SD ≤ 20 ms', () => {
    const r = runDrop(cond(60, '30–45', 2));
    expect(r.missed).toBe(0);
    expect(Math.abs(r.biasCm)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(r.contactBiasMs)).toBeLessThanOrEqual(12);
    expect(r.contactSdMs).toBeLessThanOrEqual(20);
  });
  it('a 150 ms contact at 240 fps (slow-mo): contact SD ≤ 8 ms, RSI |bias| ≤ 5 %', () => {
    const r = runDrop(cond(240, 'fast contact', 2));
    expect(r.missed).toBe(0);
    expect(r.contactSdMs).toBeLessThanOrEqual(8);
    expect(Math.abs(r.rsiBiasPct)).toBeLessThanOrEqual(5);
  });
  it('the box is read back within 3 cm, and a standing jump with no box is not a drop jump', () => {
    const r = runDrop(cond(60, '30–45'));
    expect(Math.abs(r.boxBiasCm)).toBeLessThanOrEqual(3);
    const { frames } = dropTakes(cond(60, '30–45'))[0];
    const flat = frames.filter((f) => f.t > 1900);   // from the contact on: never stood on a box
    expect(readDrop(flat, { aspect: 4 / 3, poseHz: 60 }).drops.filter((d) => d.valid)).toHaveLength(0);
  });
  it('RSI with its range: h ÷ contact, the ± from both relative errors', () => {
    expect(rsiWithRange(30, 1, 200, 10)).toEqual({ rsi: 1.5, plusMinus: Math.round(1.96 * 1.5 * Math.hypot(1 / 30, 10 / 200) * 100) / 100 });
  });
});

describe('power (lib/jump/power.ts): adults only, optional weight, an estimate', () => {
  it('Sayers 1999: 60.7·cm + 45.3·kg − 2055, with its 355 W standard error in the ±', () => {
    const p = sayersPower({ adult: true, heightCm: 50, massKg: 80, plusMinusCm: 0 });
    expect(p).toMatchObject({ ok: true, watts: Math.round(60.7 * 50 + 45.3 * 80 - 2055), plusMinusW: 700 });
    expect(lbToKg(180)).toBeCloseTo(81.65, 2);
  });
  it('never for anyone not an adult (refused before the weight is read), never without a weight, never out of range', () => {
    expect(sayersPower({ adult: false, heightCm: 50, massKg: 80 })).toEqual({ ok: false, why: 'notAdult' });
    expect(sayersPower({ adult: true, heightCm: 50, massKg: null })).toEqual({ ok: false, why: 'noMass' });
    expect(sayersPower({ adult: true, heightCm: 50, massKg: 20 })).toEqual({ ok: false, why: 'massOutOfRange' });
  });
  it('the panel renders nothing for a kid or a teen; the power entry asks, it never assumes a weight', () => {
    expect(renderToStaticMarkup(createElement(JumpMore, { adult: false, bestHeightCm: 40 }))).toBe('');
    expect(renderToStaticMarkup(createElement(PowerEstimate, { adult: false, heightCm: 40 }))).toBe('');
    const html = renderToStaticMarkup(createElement(JumpMore, { adult: true, bestHeightCm: 40 }));
    expect(html).toContain('data-power-open');
    expect(html).not.toMatch(/\d W\b/);
  });
  it('the weight is never stored or sent: no storage and no network in the power files', () => {
    for (const f of ['lib/jump/power.ts', 'components/jump/power-estimate.tsx']) {
      const src = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
      expect(src).not.toMatch(/localStorage|sessionStorage|fetch\(|indexedDB|navigator\.sendBeacon/);
    }
  });
});

describe('the standing reach on this phone (lib/jump/reachStore.ts)', () => {
  const store = () => { const m = new Map<string, string>(); return { m, s: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } } as ReachStorage }; };
  it('saves one key with the share, its ± and the date — and reads it back', () => {
    const { m, s } = store();
    expect(saveReach({ reachOverLeg: 2.4, reachOverLegSd: 0.004, at: '2026-10-25T10:00:00.000Z' }, s)).toBe(true);
    expect([...m.keys()]).toEqual([REACH_KEY]);
    expect(loadReach(s)).toEqual({ reachOverLeg: 2.4, reachOverLegSd: 0.004, at: '2026-10-25T10:00:00.000Z' });
    forgetReach(s);
    expect(loadReach(s)).toBeNull();
  });
  it('never trusts what it finds: corrupt, out of range or a throwing store reads as none', () => {
    const { m, s } = store();
    m.set(REACH_KEY, '{nope'); expect(loadReach(s)).toBeNull();
    m.set(REACH_KEY, JSON.stringify({ reachOverLeg: 9, reachOverLegSd: 0, at: '2026-10-25' })); expect(loadReach(s)).toBeNull();
    expect(saveReach({ reachOverLeg: 1.2, reachOverLegSd: 0, at: '2026-10-25' }, s)).toBe(false);
    const boom: ReachStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
    expect(loadReach(boom)).toBeNull();
    expect(saveReach({ reachOverLeg: 2.4, reachOverLegSd: 0, at: '2026-10-25' }, boom)).toBe(false);
    expect(() => forgetReach(boom)).not.toThrow();
  });
  it('never sent: no network call in the store or the reach check', () => {
    for (const f of ['lib/jump/reachStore.ts', 'lib/jump/reach.ts', 'components/jump/reach-check.tsx']) {
      expect(readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '')).not.toMatch(/fetch\(|sendBeacon|XMLHttpRequest/);
    }
  });
});
