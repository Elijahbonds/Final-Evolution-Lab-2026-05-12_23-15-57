// T1 against the Mirror's own recorded fixtures (the front reps) and the synthetic side-on overhead squat.
import { describe, expect, it } from 'vitest';
import { readFixture } from '@/lib/mirror/fixtures/load';
import { toPoseFrames } from '@/lib/mirror/fixtures';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { concat, ohsFront, ohsSide, syntheticCalibration, type Capture, type OhsOpts } from '../replay';
import { gradeT1 } from './t1-overhead-squat';

const cal = syntheticCalibration();
const fx = (name: string): Capture => ({ frames: toPoseFrames(readFixture(name)), aspect: 4 / 3, fps: 30 });
/** A recorded fixture is one rep: the front view is three of it, back to back. */
const front3 = (name: string) => concat([fx(name), fx(name), fx(name)]).frames;
const grade = (front: PoseFrame[], side: OhsOpts = {}, perRep?: (i: number) => OhsOpts, reps = 3) =>
  gradeT1({ front, side: ohsSide(side, { perRep, reps }).frames }, { calibration: cal, aspect: 4 / 3 });
const faults = (r: ReturnType<typeof grade>) => r.sides.both!.metrics.filter((m) => m.fault).map((m) => `${m.id}${m.side ? `:${m.side}` : ''}`);

describe('T1 overhead squat', () => {
  it('squat_clean.json (and a clean side view) flags nothing: 3/3', () => {
    const r = grade(front3('squat_clean'));
    expect(r.status).toBe('scored');
    expect(faults(r)).toEqual([]);
    expect(r.score03).toBe(3);
    expect(r.score100).toBeGreaterThanOrEqual(80);
    expect(r.frozen).toEqual([]);
    expect(r.provisional).toBe(true);
  });

  it('squat_knee_in_left.json flags T1 valgus on the LEFT only', () => {
    const r = grade(front3('squat_knee_in_left'));
    expect(faults(r)).toEqual(['valgusLeft:left']);
    expect(r.score03).toBe(2);
    const left = r.sides.both!.metrics.find((m) => m.id === 'valgusLeft')!;
    expect(left.value!).toBeGreaterThan(0.35);
    expect(left.rep).toBeGreaterThanOrEqual(1);
    expect(r.frozen.map((f) => `${f.metric}:${f.side}`)).toEqual(['valgusLeft:left']);
    expect(r.frozen[0].image).toHaveLength(33);
  });

  it('…and the right fixture on the right only; knees pushed OUT are not valgus', () => {
    expect(faults(grade(front3('squat_knee_in_right')))).toEqual(['valgusRight:right']);
    expect(faults(grade(front3('squat_knees_out_both')))).toEqual([]);
    expect(faults(grade(front3('squat_knees_in_both')))).toEqual(['valgusLeft:left', 'valgusRight:right']);
  });

  it('a heel that rises on ANY rep is a fault, named on its rep', () => {
    const r = grade(front3('squat_clean'), {}, (i) => (i === 1 ? { heelRiseM: 0.05 } : {}));
    const heel = r.sides.both!.metrics.find((m) => m.id === 'heelRise')!;
    expect(heel).toMatchObject({ fault: true, value: 1, rep: 2 });
    expect(r.score03).toBeLessThanOrEqual(2);
  });

  it('arms falling forward, a shallow squat, and a trunk folding past the shin each fault their own metric', () => {
    expect(faults(grade(front3('squat_clean'), { shoulderFlex: 140 }))).toEqual(['shoulderFlex']);
    expect(faults(grade(front3('squat_clean'), { kneeFlex: 72, tibia: 22, trunk: 22 }))).toEqual(expect.arrayContaining(['depthKneeFlex', 'hipCrease']));
    expect(faults(grade(front3('squat_clean'), { trunk: 70, tibia: 30 }))).toEqual(['trunkTibia']);
  });

  it('fewer than three reps in a view caps it at 1/3, and says how many counted', () => {
    const r = grade(front3('squat_clean'), {}, undefined, 2);
    expect(r.sides.both!.complete).toBe(false);
    expect(r.sides.both!.views).toEqual({ front: { valid: 3, total: 3 }, side: { valid: 2, total: 2 } });
    expect(r.score03).toBe(1);
  });

  it('CONFIDENCE UNDER 0.6 IS "NOT SCORED", NEVER A NUMBER', () => {
    const dim = (fs: PoseFrame[]) => fs.map((f, i) => (i % 5 === 0 ? f : { ...f, image: f.image.map((l) => ({ ...l, v: 0.3 })) }));
    const r = gradeT1({ front: dim(front3('squat_clean')), side: dim(ohsSide().frames) }, { calibration: cal, aspect: 4 / 3 });
    expect(r.status).toBe('notScored');
    expect(r.confidence).toBeLessThan(0.6);
    expect(r.score100).toBeNull();
    expect(r.score03).toBeNull();
    expect(r.sides).toEqual({});
  });

  it('holds under the synth\'s landmark jitter: a clean squat stays clean, a caving left knee stays left', () => {
    const noisy = (o: { kneeInL?: number }) => gradeT1(
      { front: ohsFront(o, { noise: true, seed: 3 }).frames, side: ohsSide({}, { noise: true, seed: 4 }).frames },
      { calibration: syntheticCalibration({ noise: true, seed: 5 }), aspect: 4 / 3 },
    );
    expect(faults(noisy({}))).toEqual([]);
    expect(faults(noisy({ kneeInL: 0.06 }))).toEqual(['valgusLeft:left']);
  });

  it('the same capture always grades the same', () => {
    const f = front3('squat_knee_in_left');
    expect(grade(f)).toEqual(grade(f));
  });
});
