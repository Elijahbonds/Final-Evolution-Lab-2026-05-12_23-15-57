import { describe, expect, it } from 'vitest';
import { createLiveReader, kneeSide } from './reader';
import { squatSet, hingeSet } from '@/tests/helpers/liveSets';
import type { PoseFrame } from '@/lib/pose/landmarks';

const read = (m: Parameters<typeof createLiveReader>[0], frames: PoseFrame[]) => {
  const r = createLiveReader(m);
  const closed = frames.map((f) => r.step(f)).filter(Boolean);
  return { reps: r.reps(), closed };
};

describe('the live reader (interim, the Mirror audits by #438\'s rules)', () => {
  it('counts a squat set rep by rep, and flags the caving rep with its side', () => {
    const { reps, closed } = read('squat', squatSet(['clean', 'clean', 'kneeInLeft', 'clean']));
    expect(reps).toHaveLength(4);
    expect(closed).toHaveLength(4);                       // each rep reported once, as it closed
    expect(reps.map((r) => r.n)).toEqual([1, 2, 3, 4]);
    expect(reps[2].faults).toContain('kneeValgus');
    expect(reps[2].sides.kneeValgus).toBe('left');
    expect(reps[0].faults).not.toContain('kneeValgus');
  });

  it('the same set filmed on a phone held upright counts the same', () => {
    const { reps } = read('squat', squatSet(['clean', 'kneeInLeft', 'clean'], 0, { width: 480, height: 640 }));
    expect(reps.map((r) => r.faults.includes('kneeValgus'))).toEqual([false, true, false]);
  });

  it('a frame at or before the last one is ignored (no double count on a resent frame)', () => {
    const frames = squatSet(['clean']);
    const r = createLiveReader('squat');
    for (const f of frames) { r.step(f); r.step(f); }
    expect(r.reps()).toHaveLength(1);
  });

  it('counts a hinge set side-on', () => {
    const { reps } = read('hinge', hingeSet({ reps: 5, seed: 3, setup: 60 }));
    expect(reps).toHaveLength(5);
  });

  it('kneeSide: a side counts only at half the stronger side\'s frames', () => {
    expect(kneeSide(10, 1)).toBe('left');
    expect(kneeSide(1, 10)).toBe('right');
    expect(kneeSide(10, 6)).toBe('both');
  });
});
