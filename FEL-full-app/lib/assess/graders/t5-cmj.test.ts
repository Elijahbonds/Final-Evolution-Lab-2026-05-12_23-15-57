// T5 against synthetic hands-on-hips CMJs (flight time known exactly) and the owner's recorded jump streams (ground
// truth from the joints: lib/pose/__fixtures__).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { restPose, moveJoints, type PoseFixture } from '@/lib/pose/synth';
import { calibrateFront } from '../calibration';
import { cmj, film, syntheticCalibration, type CmjJump } from '../replay';
import { detectFlights, gradeT5, heightCmOf } from './t5-cmj';

const cal = syntheticCalibration();
const grade = (jumps: CmjJump[], o: { fps?: number; noise?: boolean; seed?: number } = {}) => {
  const c = cmj(jumps, o);
  return { c, r: gradeT5(c.frames, { calibration: cal, aspect: 4 / 3 }) };
};
const three = (h: number, o: Partial<CmjJump> = {}): CmjJump[] => [0, 1, 2].map(() => ({ heightM: h, ...o }));

describe('T5 height is flight time: h = g·t²/8', () => {
  it('the physics', () => {
    expect(heightCmOf(520)).toBeCloseTo(33.2, 1);            // 0.52 s of flight
  });

  for (const fps of [30, 60]) {
    it(`clean jumps at ${fps} fps: every flight within 10 ms`, () => {
      const { c, r } = grade([{ heightM: 0.4 }, { heightM: 0.45 }, { heightM: 0.42 }], { fps });
      expect(r.t5.jumps).toHaveLength(3);
      r.t5.jumps.forEach((j, k) => expect(Math.abs(j.flightMs - c.truth[k].flightMs), `jump ${k + 1}`).toBeLessThanOrEqual(10));
      expect(r.t5.bestJump).toBe(2);
      expect(r.t5.bestHeightCm!).toBeCloseTo(45, 0);
    });
  }

  it('under the synth\'s jitter: mean error ≤ 5 cm at 30 fps and ≤ 3 cm at 60 fps (spec §12 Phase 1 targets)', () => {
    for (const [fps, limit] of [[30, 5], [60, 3]] as const) {
      const err: number[] = [];
      for (let seed = 1; seed <= 6; seed++) {
        const { c, r } = grade([{ heightM: 0.3 }, { heightM: 0.45 }, { heightM: 0.6 }], { fps, noise: true, seed });
        expect(r.t5.jumps.filter((j) => j.valid), `fps ${fps} seed ${seed}`).toHaveLength(3);
        r.t5.jumps.forEach((j, k) => err.push(Math.abs(j.heightCm - c.truth[k].heightCm)));
      }
      expect(err.reduce((a, b) => a + b, 0) / err.length, `fps ${fps}`).toBeLessThanOrEqual(limit);
    }
  });

  it('records the delivered rate, flags it under 50 Hz, and says what one frame is worth', () => {
    const at30 = grade(three(0.4)).r.t5, at60 = grade(three(0.4), { fps: 60 }).r.t5;
    expect(at30).toMatchObject({ poseFps: 30, fpsLow: true });
    expect(at60).toMatchObject({ poseFps: 60, fpsLow: false });
    expect(at30.heightPlusMinusCm!).toBeGreaterThan(at60.heightPlusMinusCm!);
    expect(at30.heightPlusMinusCm!).toBeCloseTo(4.6, 0);    // g·t/(4·fps) on a 0.57 s flight ≈ 1.8 in
  });

  it('REFUSES A HEIGHT OVER 130 CM (the camera lost the feet), as DunkTracker does', () => {
    const { r } = grade([{ heightM: 1.4 }]);
    expect(r.t5.jumps[0]).toMatchObject({ valid: false });
    expect(r.t5.jumps[0].invalidWhy).toMatch(/130 cm/);
    expect(r.t5.bestHeightCm).toBeNull();
  });

  it('a jump whose hands left the hips is not the standard, and is not counted', () => {
    const { r } = grade([{ heightM: 0.4, armSwing: true }, { heightM: 0.4 }, { heightM: 0.4 }]);
    expect(r.t5.jumps[0]).toMatchObject({ valid: false, invalidWhy: 'your hands left your hips' });
    expect(r.sides.both!.repsValid).toBe(2);
    expect(r.score03).toBe(1);
  });

  it('a step to a new spot is not a flight', () => {
    const frames = [
      ...Array.from({ length: 90 }, () => restPose()),
      ...Array.from({ length: 12 }, (_, i) => moveJoints(restPose(), [0, 0, (-0.3 * (i + 1)) / 12])),
      ...Array.from({ length: 90 }, () => moveJoints(restPose(), [0, 0, -0.3])),
    ];
    expect(detectFlights(film({ fps: 60, frames }).frames, cal.front!)).toEqual([]);
  });
});

describe('T5 quality is the landing', () => {
  it('a soft, square landing scores clean', () => {
    const { r } = grade(three(0.4));
    expect(r.sides.both!.metrics.filter((m) => m.fault)).toEqual([]);
    expect(r.score03).toBe(3);
  });

  it('a stiff landing faults the absorb (hips drop under 10% of standing height)', () => {
    const { r } = grade(three(0.35, { landDepth: 0.1 }), { fps: 60 });
    const flex = r.sides.both!.metrics.find((m) => m.id === 'landingFlex')!;
    expect(flex.fault).toBe(true);
    expect(flex.value!).toBeLessThanOrEqual(0.1);
  });

  it('knees caving on the landing fault each knee\'s FPPA', () => {
    const { r } = grade(three(0.35, { landDepth: 0.6, landKneeIn: 0.12 }), { fps: 60 });   // SCREEN-SHIP: Red is over 20° (≈26° here; 0.07 read ≈15°, Yellow)
    const ids = r.sides.both!.metrics.filter((m) => m.fault).map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['landingValgusLeft', 'landingValgusRight']));
    expect(r.frozen.length).toBeGreaterThanOrEqual(2);
  });

  it('feet touching down apart are read at 60 fps, and not scored at 30', () => {
    const at60 = grade(three(0.4, { rightLateMs: 70 }), { fps: 60 }).r;
    const sym = at60.sides.both!.metrics.find((m) => m.id === 'landingSym')!;
    expect(sym.fault).toBe(true);
    expect(Math.abs(sym.value! - 70)).toBeLessThanOrEqual(17);
    const at30 = grade(three(0.4, { rightLateMs: 70 })).r.sides.both!.metrics.find((m) => m.id === 'landingSym')!;
    expect(at30).toMatchObject({ value: null, score: null, note: 'not scored at this frame rate' });
  });
});

describe('T5 on the owner\'s recorded jump streams (lib/pose/__fixtures__)', () => {
  const load = (name: string) => JSON.parse(readFileSync(join(__dirname, '../../pose/__fixtures__', `${name}.json`), 'utf8')) as PoseFixture;
  /** These takes start mid-dip: the floor lines are read from the frames before the first take-off, with a loose sway. */
  const calibrateOn = (fx: PoseFixture) => {
    const first = fx.gt.jumps[0].takeoff.t;
    const r = calibrateFront(fx.frames.filter((f) => f.t < first - 150), 4 / 3, Math.min(900, first - 250), 0.3);
    if (!r.ok) throw new Error(r.why);
    return { aspect: 4 / 3, front: r.value, side: null };
  };

  it('in-place rebounds (jump_two_foot_low): every jump found, mean height error under 6 cm at 30 fps', () => {
    const fx = load('jump_two_foot_low');
    const r = gradeT5(fx.frames, { calibration: calibrateOn(fx), aspect: 4 / 3 });
    const errs = fx.gt.jumps.map((g) => {
      const j = r.t5.jumps.find((x) => x.valid && Math.abs(x.takeoffT - g.takeoff.t) < 150);
      expect(j, `jump at ${g.takeoff.t.toFixed(0)} ms`).toBeDefined();
      return Math.abs(j!.heightCm - g.heightFlightM * 100);
    });
    // measured 2026-09-28: 5.1 cm. Rebounds with 0.13 s contacts are not the T5 protocol (stand still, then jump);
    // this pins today's behaviour so a change that makes it worse is seen.
    expect(errs.reduce((a, b) => a + b, 0) / errs.length).toBeLessThanOrEqual(6);
  });

  it('a take that travels 40 cm toward and away from the lens (jump_two_foot_high) never scores a wrong height', () => {
    const fx = load('jump_two_foot_high');
    const r = gradeT5(fx.frames, { calibration: calibrateOn(fx), aspect: 4 / 3 });
    const valid = r.t5.jumps.filter((j) => j.valid);
    expect(valid.length).toBeGreaterThanOrEqual(1);
    for (const j of valid) {
      const g = fx.gt.jumps.find((x) => Math.abs(x.takeoff.t - j.takeoffT) < 150);
      expect(g, `valid jump at ${j.takeoffT}`).toBeDefined();
      expect(Math.abs(j.heightCm - g!.heightFlightM * 100)).toBeLessThanOrEqual(3);
    }
  });
});
