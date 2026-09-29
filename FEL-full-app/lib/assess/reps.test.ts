import { describe, expect, it } from 'vitest';
import { RepCounter, RockCounter, bestReps, median, medianRep, segment, segmentRocks, type Sample } from './reps';
import { hipDrop } from './geometry';
import { calibrateFront } from './calibration';
import { concat, ohsFront, standFront } from './replay';
import { th } from './thresholds';

/** A signal of `n` bumps of the given peaks, each 40 samples, resting at 0 between. */
function bumps(peaks: number[], jitter = 0): Sample[] {
  const out: Sample[] = [];
  let i = 0;
  for (const p of peaks) {
    for (let k = 0; k < 20; k++, i++) out.push({ i, t: i * 33, v: (jitter ? Math.sin(i * 7.3) * jitter : 0) });
    for (let k = 0; k <= 40; k++, i++) out.push({ i, t: i * 33, v: p * Math.sin((Math.PI * k) / 40) + (jitter ? Math.sin(i * 7.3) * jitter : 0) });
  }
  return out;
}
const T = { enter: 0.15, exit: 0.08, minPeak: 0.25 };

describe('a rep leaves rest and comes back', () => {
  it('counts each bump once and finds its bottom', () => {
    const s = bumps([0.4, 0.5, 0.45]);
    const r = segment(s, T);
    expect(r.map((x) => x.index)).toEqual([1, 2, 3]);
    for (const rep of r) expect(s[rep.bottom].v).toBeCloseTo(rep.peak, 10);
    expect(r[1].peak).toBeCloseTo(0.5, 2);
  });

  it('jitter at the line is not two reps (hysteresis)', () => {
    expect(segment(bumps([0.4, 0.4, 0.4], 0.03), T)).toHaveLength(3);
  });

  it('a wobble that never reaches the minimum depth is not a rep', () => {
    expect(segment(bumps([0.2, 0.4]), T)).toHaveLength(1);
  });

  it('the live counter and the final grade are the same code', () => {
    const s = bumps([0.3, 0.6, 0.4, 0.5]);
    const live = new RepCounter(T);
    const events = s.map((x) => live.push(x)).filter(Boolean);
    expect(events).toEqual(segment(s, T));
  });

  it('three overhead squats from the front are three reps of the hip-drop signal', () => {
    const cal = calibrateFront(standFront(3).frames, 4 / 3);
    expect(cal.ok).toBe(true);
    if (!cal.ok) return;
    const cap = concat([ohsFront()]);
    const s = cap.frames.map((f, i) => ({ i, t: f.t, v: hipDrop(f.image, cal.value.hipY, cal.value.floorY) }));
    const reps = segment(s, { enter: th('t1.repEnter'), exit: th('t1.repExit'), minPeak: th('t1.repMinPeak') });
    expect(reps).toHaveLength(3);
  });
});

describe('a rock swings with no fixed rest', () => {
  it('counts swings between two levels', () => {
    const s: Sample[] = [];
    for (let i = 0; i < 300; i++) s.push({ i, t: i * 33, v: 25 + 12 * Math.sin(i / 16) });
    const r = segmentRocks(s, { rise: 6 });
    expect(r.length).toBeGreaterThanOrEqual(2);
    for (const rep of r) expect(rep.peak).toBeGreaterThan(35);
    const live = new RockCounter({ rise: 6 });
    expect(s.map((x) => live.push(x)).filter(Boolean)).toEqual(r);
  });
});

describe('the median of the best three', () => {
  it('best three by score, in the order performed, ties to the earlier rep', () => {
    expect(bestReps([50, 90, 70, 90, 10])).toEqual([1, 2, 3]);
    expect(bestReps([80, 80, 80, 80])).toEqual([0, 1, 2]);
    expect(bestReps([40])).toEqual([0]);
  });

  it('names the rep the median came from', () => {
    expect(medianRep([10, 30, 20, 99], [0, 1, 2])).toEqual({ value: 20, at: 2 });
    expect(medianRep([10, 30], [0, 1])).toEqual({ value: 20, at: 0 });
    expect(medianRep([NaN], [0])).toBeNull();
  });

  it('ONE BAD REP DOES NOT SINK A TEST, AND ONE LUCKY REP CANNOT CARRY IT', () => {
    // scores per rep; the value each rep produced
    const scores = [95, 20, 90, 88, 40], values = [120, 60, 118, 115, 80];
    const m = medianRep(values, bestReps(scores));
    expect(m!.value).toBe(118);                          // not 60 (the bad rep), not 120 (the best one alone)
    expect(median([1, 5, 3])).toBe(3);
  });
});
