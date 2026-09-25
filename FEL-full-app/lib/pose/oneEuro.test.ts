import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OneEuro, PoseFilter, IMAGE_EURO, WORLD_EURO, EURO_GAP_RESET_MS } from './oneEuro';
import { LEFT_HIP, RIGHT_HIP, LEFT_WRIST, RIGHT_WRIST, LEFT_SHOULDER, RIGHT_SHOULDER, RIGHT_ANKLE, emptyFrame, type PoseFrame } from './landmarks';
import type { PoseFixture } from './synth';

const load = (name: string) => JSON.parse(readFileSync(join(__dirname, '__fixtures__', `${name}.json`), 'utf8')) as PoseFixture;
const sd = (v: number[]) => { const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };
/** Frame-to-frame jitter: the SD of the second difference, which a slow real sway barely reaches. */
const jitter = (v: number[]) => sd(v.slice(1, -1).map((x, i) => v[i + 2] - 2 * x + v[i]));

describe('OneEuro (scalar)', () => {
  it('passes the first sample, holds a constant, and follows a step', () => {
    const e = new OneEuro(IMAGE_EURO);
    expect(e.filter(0.5, 0)).toBe(0.5);
    for (let k = 1; k < 30; k++) expect(e.filter(0.5, k * 33)).toBeCloseTo(0.5, 12);
    let y = 0.5;
    for (let k = 30; k < 90; k++) y = e.filter(0.7, k * 33);
    expect(y).toBeCloseTo(0.7, 3);
  });
  it('is timed by the capture clock: a repeated timestamp changes nothing, a long gap restarts it', () => {
    const e = new OneEuro(WORLD_EURO);
    e.filter(1, 0); e.filter(1.1, 33);
    const held = e.value!;
    expect(e.filter(5, 33)).toBe(held);                                  // the same frame again
    expect(e.filter(2, 33 + EURO_GAP_RESET_MS + 1)).toBe(2);             // the body was lost: start over
  });
  it('lags a slow ramp more than a fast one (the cutoff rises with speed)', () => {
    const lagAt = (rate: number) => {
      const e = new OneEuro(IMAGE_EURO);
      let y = 0;
      for (let k = 0; k <= 30; k++) y = e.filter(rate * k * 0.033, k * 33);
      return (rate * 30 * 0.033 - y) / rate;                             // lag in seconds
    };
    expect(lagAt(3)).toBeLessThan(lagAt(0.1));
  });
});

describe('PoseFilter tuning on the fixtures', () => {
  it('a still stand is still: frame-to-frame jitter falls under 0.4 of the raw stream on hips, wrists and ankles', () => {
    const f = new PoseFilter();
    const raw = load('stand_still').frames.filter((x) => x.present);
    const fil = raw.map((x) => f.filter(x));
    const ratio = (get: (x: PoseFrame) => number) => jitter(fil.map(get)) / jitter(raw.map(get));
    const got = {
      hipY: ratio((x) => (x.image[LEFT_HIP].y + x.image[RIGHT_HIP].y) / 2),
      wristY: ratio((x) => x.image[RIGHT_WRIST].y),
      ankleY: ratio((x) => x.image[RIGHT_ANKLE].y),
      wristWorldY: ratio((x) => x.world![LEFT_WRIST].y),
      ankleWorldY: ratio((x) => x.world![RIGHT_ANKLE].y),
    };
    for (const [k, v] of Object.entries(got)) expect(v, k).toBeLessThan(0.4);
  });
  it("a slam's wrist speed survives: every fast swing of the owner's takes keeps ≥ 0.9 of its raw peak, within a frame", () => {
    let checked = 0;
    for (const name of ['dunk_elijah_two_foot', 'dunk_elijah_one_foot', 'dunk_approach_two_foot', 'jump_two_foot_high']) {
      const fx = load(name), f = new PoseFilter();
      const raw = fx.frames, fil = raw.map((x) => f.filter(x));
      for (const w of fx.gt.wrist.filter((x) => (x.kind === 'strike' || x.kind === 'reach') && x.speed >= 4)) {
        const wi = w.hand === 'left' ? LEFT_WRIST : RIGHT_WRIST, si = w.hand === 'left' ? LEFT_SHOULDER : RIGHT_SHOULDER;
        const sign = w.kind === 'strike' ? -1 : 1;
        // the wrist's speed relative to its shoulder (world, up +), centred difference
        const v = (F: PoseFrame[], k: number) => {
          const a = F[k - 1], b = F[k + 1];
          if (!a?.present || !b?.present) return 0;
          return sign * ((b.world![si].y - b.world![wi].y) - (a.world![si].y - a.world![wi].y)) / ((b.t - a.t) / 1000);
        };
        let rawBest = 0, rawK = 0, filBest = 0, filK = 0;
        for (let k = Math.max(1, w.at.frame - 4); k <= Math.min(raw.length - 2, w.at.frame + 4); k++) {
          if (v(raw, k) > rawBest) { rawBest = v(raw, k); rawK = k; }
          if (v(fil, k) > filBest) { filBest = v(fil, k); filK = k; }
        }
        expect(filBest / rawBest, `${name} ${w.kind} ${w.hand}`).toBeGreaterThanOrEqual(0.9);
        expect(Math.abs(filK - rawK), `${name} ${w.kind} ${w.hand}`).toBeLessThanOrEqual(1);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(10);
  });
  it('leaves a frame without a body alone', () => {
    const f = new PoseFilter();
    const e = emptyFrame(100);
    expect(f.filter(e)).toBe(e);
  });
});
