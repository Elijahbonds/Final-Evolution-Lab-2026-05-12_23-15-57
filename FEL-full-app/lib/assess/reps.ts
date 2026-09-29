// reps — where one rep starts and ends, and which three of them a test is scored on (spec §4 rules).
//
// THE RULE (spec §4): every rep is scored, and the test score uses the MEDIAN OF THE BEST THREE valid reps. One bad
// rep does not sink a test, and one lucky rep cannot carry it: the athlete has to produce the pattern three times.
//
// Two shapes of rep, one counter each, both fed one sample at a time so the live rep counter and the final grade run
// the SAME code over the same frames (segment() is the live counter run to the end):
//
//   RepCounter   a signal that leaves a resting level and comes back (a squat's hip drop, a single-leg squat's knee):
//                enter above `enter`, leave below `exit` (hysteresis, so jitter at the line is not two reps), and a rep
//                that never got past `minPeak` was a wobble, not a rep.
//   RockCounter  a signal that swings between two levels with no fixed rest (a knee-to-wall rock: the shin never
//                returns to vertical): a rep is a rise of `rise` over the running low and a fall of `rise` back.
//
// Pure.
import { th } from './thresholds';

export interface Sample {
  /** Index of the frame in the capture. */
  i: number;
  /** Capture time, ms. */
  t: number;
  v: number;
}

export interface Rep {
  /** 1-based, in the order performed: the number a reason names ("on rep 3"). */
  index: number;
  start: number;
  bottom: number;
  end: number;
  tStart: number;
  tBottom: number;
  tEnd: number;
  /** The signal's extreme in the rep. */
  peak: number;
}

export interface RepThresholds { enter: number; exit: number; minPeak: number }

export class RepCounter {
  private inRep = false;
  private cur: Omit<Rep, 'index' | 'end' | 'tEnd'> | null = null;
  readonly reps: Rep[] = [];

  constructor(private readonly o: RepThresholds) {}

  /** Feed a sample; returns the rep it just completed, if any. */
  push(s: Sample): Rep | null {
    if (!Number.isFinite(s.v)) return null;
    if (!this.inRep) {
      if (s.v > this.o.enter) {
        this.inRep = true;
        this.cur = { start: s.i, tStart: s.t, bottom: s.i, tBottom: s.t, peak: s.v };
      }
      return null;
    }
    const c = this.cur!;
    if (s.v > c.peak) { c.peak = s.v; c.bottom = s.i; c.tBottom = s.t; }
    if (s.v < this.o.exit) {
      this.inRep = false;
      this.cur = null;
      if (c.peak < this.o.minPeak) return null;
      const rep: Rep = { ...c, index: this.reps.length + 1, end: s.i, tEnd: s.t };
      this.reps.push(rep);
      return rep;
    }
    return null;
  }

  /** In the middle of a rep right now. */
  get active(): boolean { return this.inRep; }
}

export class RockCounter {
  private low = Infinity;
  private cur: { start: number; tStart: number; bottom: number; tBottom: number; peak: number } | null = null;
  readonly reps: Rep[] = [];

  constructor(private readonly o: { rise: number; minPeak?: number }) {}

  push(s: Sample): Rep | null {
    if (!Number.isFinite(s.v)) return null;
    if (!this.cur) {
      if (s.v < this.low) this.low = s.v;
      if (s.v >= this.low + this.o.rise) this.cur = { start: s.i, tStart: s.t, bottom: s.i, tBottom: s.t, peak: s.v };
      return null;
    }
    const c = this.cur;
    if (s.v > c.peak) { c.peak = s.v; c.bottom = s.i; c.tBottom = s.t; }
    if (s.v <= c.peak - this.o.rise) {
      this.cur = null;
      this.low = s.v;
      if (this.o.minPeak !== undefined && c.peak < this.o.minPeak) return null;
      const rep: Rep = { ...c, index: this.reps.length + 1, end: s.i, tEnd: s.t };
      this.reps.push(rep);
      return rep;
    }
    return null;
  }

  get active(): boolean { return this.cur !== null; }
}

/** Every completed rep in a signal (the live counter, run to the end). */
export function segment(samples: readonly Sample[], o: RepThresholds): Rep[] {
  const c = new RepCounter(o);
  for (const s of samples) c.push(s);
  return c.reps;
}

export function segmentRocks(samples: readonly Sample[], o: { rise: number; minPeak?: number }): Rep[] {
  const c = new RockCounter(o);
  for (const s of samples) c.push(s);
  return c.reps;
}

export function median(v: readonly number[]): number {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * The positions of the best `n` reps by score (higher = better), in the order they were performed. Ties go to the
 * earlier rep, so the choice never depends on sort stability.
 */
export function bestReps(scores: readonly number[], n: number = th('score.bestOf')): number[] {
  return scores.map((s, i) => ({ s, i }))
    .sort((a, b) => (b.s - a.s) || (a.i - b.i))
    .slice(0, n)
    .map((x) => x.i)
    .sort((a, b) => a - b);
}

/**
 * The median of `values` over the chosen reps, and WHICH rep it came from (for "measured on rep 3"). With three reps
 * (the rule) the median IS one rep's value. With an even count (only when fewer than three reps were valid, which caps
 * the test at 1/3 anyway) it is the mean of the middle two and names the lower-valued of them.
 */
export function medianRep(values: readonly number[], among: readonly number[]): { value: number; at: number } | null {
  const picks = among.map((i) => ({ v: values[i], i })).filter((x) => Number.isFinite(x.v)).sort((a, b) => (a.v - b.v) || (a.i - b.i));
  if (!picks.length) return null;
  if (picks.length % 2) { const m = picks[picks.length >> 1]; return { value: m.v, at: m.i }; }
  const lo = picks[picks.length / 2 - 1], hi = picks[picks.length / 2];
  return { value: (lo.v + hi.v) / 2, at: lo.i };
}

/**
 * A rep's extreme read robustly: the median of `f` over the frames within ±`ms` of the extreme frame (those `ok`).
 * Taking the single most extreme frame would read the noise's peak as well as the body's (measured on a jittered
 * knee-to-wall: the max read 2° high); a joint turning around at the end of its range sits within a degree of its peak
 * for longer than this window.
 */
export function aroundPeak(frames: readonly { t: number }[], center: number, f: (i: number) => number, ok: (i: number) => boolean, ms: number = th('score.peakWindowMs')): number {
  const t0 = frames[center]?.t;
  if (t0 === undefined) return NaN;
  const vals: number[] = [];
  for (let i = center; i >= 0 && frames[i].t >= t0 - ms; i--) if (ok(i)) vals.push(f(i));
  for (let i = center + 1; i < frames.length && frames[i].t <= t0 + ms; i++) if (ok(i)) vals.push(f(i));
  return median(vals.filter(Number.isFinite));
}
