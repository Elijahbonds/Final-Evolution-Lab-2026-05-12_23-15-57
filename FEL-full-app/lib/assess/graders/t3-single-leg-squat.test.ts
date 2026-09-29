import { describe, expect, it } from 'vitest';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { singleLegSquat, syntheticCalibration, type SlsOpts } from '../replay';
import { gradeT3 } from './t3-single-leg-squat';

const cal = syntheticCalibration();
const noWorld = (fs: PoseFrame[]) => fs.map(({ world: _w, ...f }) => { void _w; return f; });
const grade = (l: SlsOpts, r: SlsOpts, o: { perRepL?: (i: number) => SlsOpts; noise?: boolean; world?: boolean } = {}) => {
  const L = singleLegSquat('left', l, { perRep: o.perRepL, noise: o.noise, seed: 31 }).frames;
  const R = singleLegSquat('right', r, { noise: o.noise, seed: 32 }).frames;
  return gradeT3(o.world === false ? { left: noWorld(L), right: noWorld(R) } : { left: L, right: R }, { calibration: cal, aspect: 4 / 3 });
};
const faults = (r: ReturnType<typeof grade>, s: 'left' | 'right') => r.sides[s]!.metrics.filter((m) => m.fault).map((m) => m.id);

describe('T3 single-leg squat', () => {
  it('a clean single-leg squat each side: 3/3, no faults, no balance lost', () => {
    const r = grade({}, {});
    expect(r.status).toBe('scored');
    expect(faults(r, 'left')).toEqual([]);
    expect(faults(r, 'right')).toEqual([]);
    expect(r.score03).toBe(3);
    expect(r.sides.left!.repsValid).toBe(5);   // the synthetic take has five reps; the live flow now stops at three (A2-2)
    expect(r.t3.balance).toEqual({ left: [], right: [] });
  });

  it('a knee caving in on the LEFT flags FPPA on the left only, and the sides are asymmetric', () => {
    const r = grade({ kneeIn: 0.09 }, {});
    expect(faults(r, 'left')).toEqual(['fppa']);
    expect(faults(r, 'right')).toEqual([]);
    expect(r.sides.left!.metrics.find((m) => m.id === 'fppa')!.value!).toBeGreaterThan(20);   // SCREEN-SHIP: Red is over 20° (kneeIn 0.09 ≈ 27°; 0.06 read ≈ 18°, Yellow)
    expect(r.asymmetry).toMatchObject({ flagged: true, weaker: 'left' });
    expect(r.frozen.map((f) => `${f.metric}:${f.side}`)).toEqual(['fppa:left']);
  });

  it('…and on the RIGHT, the right only', () => {
    const r = grade({}, { kneeIn: 0.09 });
    expect(faults(r, 'right')).toEqual(['fppa']);
    expect(faults(r, 'left')).toEqual([]);
  });

  it('a dropping pelvis and a leaning trunk fault their own metrics', () => {
    expect(faults(grade({}, { pelvicDrop: 14 }), 'right')).toEqual(['pelvicDrop']);   // SCREEN-SHIP: Red over 10° (was a fault over 8°)
    expect(faults(grade({ trunkLean: 20 }, {}), 'left')).toEqual(['trunkLean']);     // SCREEN-SHIP: Red over 15° (was a fault over 12°)
    expect(faults(grade({ depth: 38 }, {}), 'left')).toEqual(['depth']);
  });

  it('a free foot touching down on one rep caps that side at 1/3, named on its rep', () => {
    const r = grade({}, {}, { perRepL: (i) => (i === 2 ? { touchDown: true } : {}) });
    expect(r.t3.balance.left).toEqual([{ rep: 3, kind: 'touchDown' }]);
    expect(r.sides.left!.score03).toBe(1);
    expect(r.sides.left!.capReason).toMatch(/balance/i);
    expect(r.sides.right!.score03).toBe(3);
  });

  it('without world landmarks the depth estimate gives the same verdicts', () => {
    const r = grade({ kneeIn: 0.09 }, {}, { world: false });
    expect(faults(r, 'left')).toEqual(['fppa']);
    expect(faults(r, 'right')).toEqual([]);
    expect(r.sides.right!.score03).toBe(3);
  });

  it('holds under the synth\'s jitter', () => {
    const r = grade({ kneeIn: 0.09 }, {}, { noise: true });
    expect(faults(r, 'left')).toEqual(['fppa']);
    expect(faults(r, 'right')).toEqual([]);
    expect(r.t3.balance).toEqual({ left: [], right: [] });
  });
});
