import { describe, expect, it } from 'vitest';
import { restPose, moveJoints, type Joints } from '@/lib/pose/synth';
import { calibrateFront, calibrateSide, window } from './calibration';
import { film, standFront, standSide } from './replay';

const hold = (j: (i: number) => Joints, seconds: number) => film({ fps: 60, frames: Array.from({ length: seconds * 60 + 1 }, (_, i) => j(i)) });

describe('front calibration (spec §3.3 step 1)', () => {
  it('reads the floor, the body height and a neutral stance from a still stand', () => {
    const c = standFront(3);
    const r = calibrateFront(c.frames, c.aspect);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value;
    expect(v.bodyHeight).toBeGreaterThan(0.4);
    expect(v.bodyHeight).toBeLessThan(0.9);
    expect(v.floorY).toBeGreaterThan(v.hipY);
    expect(Math.abs(v.fppa.left)).toBeLessThan(1);
    expect(Math.abs(v.fppa.right)).toBeLessThan(1);
    expect(Math.abs(v.pelvicTilt.left)).toBeLessThan(0.5);
    expect(Math.abs(v.shift)).toBeLessThan(0.02);
    expect(v.legY.left).toBeGreaterThan(0.2);
  });

  it('holds under the synth\'s landmark jitter', () => {
    const c = standFront(3, { noise: true, seed: 11 });
    const r = calibrateFront(c.frames, c.aspect);
    expect(r.ok).toBe(true);
  });

  it('A KNOCK-KNEED STANCE IS THAT ATHLETE\'S ZERO: the baseline carries the standing knee angle', () => {
    const knock = () => { const j = restPose(); j.LeftLeg = [0.07, 0.52, 0.01]; j.RightLeg = [-0.07, 0.52, 0.01]; return j; };
    const c = hold(knock, 3);
    const r = calibrateFront(c.frames, c.aspect);
    expect(r.ok && r.value.fppa.left).toBeGreaterThan(3);
    expect(r.ok && r.value.fppa.right).toBeGreaterThan(3);
  });

  it('refuses a hold that sways, and says what to do', () => {
    const c = hold((i) => moveJoints(restPose(), [0.1 * Math.sin(i / 10), 0, 0]), 3);
    const r = calibrateFront(c.frames, c.aspect);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toMatch(/still/i);
  });

  it('refuses a hold that is too short, or side-on', () => {
    const short = standFront(1);
    expect(calibrateFront(short.frames, short.aspect).ok).toBe(false);
    const side = standSide('left', 3);
    expect(calibrateFront(side.frames, side.aspect).ok).toBe(false);
  });

  it('window() takes the first stretch of a longer capture', () => {
    const c = standFront(5);
    const w = window(c.frames, 3000);
    expect(w[w.length - 1].t - w[0].t).toBeLessThanOrEqual(3000);
    expect(calibrateFront(w, c.aspect).ok).toBe(true);
  });
});

describe('side calibration (spec §3.3 step 3)', () => {
  it('reads which way the athlete faces and which side is near the lens', () => {
    for (const near of ['left', 'right'] as const) {
      const c = standSide(near, 2);
      const r = calibrateSide(c.frames, c.aspect);
      expect(r.ok, near).toBe(true);
      if (!r.ok) continue;
      expect(r.value.near).toBe(near);
      expect(r.value.facing).toBe(near === 'left' ? -1 : 1);
      expect(r.value.bodyHeight).toBeGreaterThan(0.4);
    }
  });

  it('refuses a front-on stand', () => {
    const c = standFront(3);
    expect(calibrateSide(c.frames, c.aspect).ok).toBe(false);
  });

  it('the front and side floor lines agree for the same spot on the floor', () => {
    const f = standFront(3), s = standSide('left', 2);
    const rf = calibrateFront(f.frames, f.aspect), rs = calibrateSide(s.frames, s.aspect);
    expect(rf.ok && rs.ok).toBe(true);
    if (rf.ok && rs.ok) expect(Math.abs(rf.value.floorY - rs.value.floorY)).toBeLessThan(0.02);
  });
});
