import { describe, expect, it } from 'vitest';
import { kneeWall, syntheticCalibration, type KneeWallOpts } from '../replay';
import { gradeT2 } from './t2-dorsiflexion';

const cal = syntheticCalibration();
const grade = (l: KneeWallOpts, r: KneeWallOpts, o: { perRepL?: (i: number) => KneeWallOpts; noise?: boolean; repsL?: number } = {}) => gradeT2(
  { left: kneeWall('left', l, { perRep: o.perRepL, noise: o.noise, seed: 21, reps: o.repsL }).frames, right: kneeWall('right', r, { noise: o.noise, seed: 22 }).frames },
  { calibration: cal, aspect: 4 / 3 },
);

describe('T2 knee-to-wall dorsiflexion', () => {
  it('reads each shin at its furthest-forward rock, heel down, and scores 3/3 on a free ankle', () => {
    const r = grade({ tibiaMax: 44 }, { tibiaMax: 44 });
    expect(r.status).toBe('scored');
    for (const s of ['left', 'right'] as const) {
      const m = r.sides[s]!.metrics[0];
      expect(m.value!).toBeCloseTo(44, 0);
      expect(m.side).toBe(s);
      expect(r.sides[s]!.score03).toBe(3);
    }
    expect(r.asymmetry!.flagged).toBe(false);
  });

  it('a restricted ankle faults on its own side, and the gap is an asymmetry flag', () => {
    const r = grade({ tibiaMax: 44 }, { tibiaMax: 33 });
    expect(r.sides.right!.metrics[0].fault).toBe(true);
    expect(r.sides.left!.metrics[0].fault).toBe(false);
    expect(r.score03).toBe(1);                        // the worse side
    expect(r.asymmetry).toMatchObject({ flagged: true, weaker: 'right' });
    expect(r.asymmetry!.metric!.value).toBeCloseTo(11, 0);
    expect(r.t2.lrDiffDeg).toBeCloseTo(11, 0);
    expect(r.frozen.map((f) => `${f.metric}:${f.side}`)).toEqual(['tibia:right']);
  });

  it('a rock with the heel up does not count, and is named with how far the heel rose', () => {
    const r = grade({ tibiaMax: 44 }, { tibiaMax: 44 }, { perRepL: (i) => (i === 1 ? { heelLiftM: 0.05, tibiaMax: 52 } : {}) });
    expect(r.t2.rejected).toEqual([{ side: 'left', rep: 2, heelLiftPct: expect.any(Number) }]);
    expect(r.t2.rejected[0].heelLiftPct).toBeGreaterThan(1.5);
    expect(r.sides.left!.metrics[0].value!).toBeCloseTo(44, 0);   // the heel-up 52° never reached the score
    expect(r.sides.left!.repsValid).toBe(2);
    expect(r.sides.left!.score03).toBe(1);                         // fewer than three valid rocks
  });

  it('under the synth\'s jitter: every read within 2.5° of the joints, the mean within 1° (spec Phase 1 bar: ±4°)', () => {
    const errs: number[] = [];
    for (let seed = 1; seed <= 6; seed++) {
      const r = gradeT2({ left: kneeWall('left', { tibiaMax: 40 }, { noise: true, seed }).frames, right: kneeWall('right', { tibiaMax: 37 }, { noise: true, seed: seed + 50 }).frames }, { calibration: cal, aspect: 4 / 3 });
      expect(r.sides.left!.repsValid, `seed ${seed}`).toBe(3);
      expect(r.sides.right!.repsValid, `seed ${seed}`).toBe(3);
      errs.push(Math.abs(r.sides.left!.metrics[0].value! - 40), Math.abs(r.sides.right!.metrics[0].value! - 37));
    }
    expect(Math.max(...errs)).toBeLessThanOrEqual(2.5);
    expect(errs.reduce((a, b) => a + b, 0) / errs.length).toBeLessThanOrEqual(1);
  });

  it('one side missing is not scored', () => {
    const r = gradeT2({ left: kneeWall('left').frames }, { calibration: cal, aspect: 4 / 3 });
    expect(r.status).toBe('notScored');
    expect(r.score100).toBeNull();
  });
});
