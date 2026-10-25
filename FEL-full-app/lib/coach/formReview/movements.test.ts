// COACH-VIDEO-REVIEW (2026-10-24): which program exercises the camera reviews, and the words it uses.
import { describe, expect, it } from 'vitest';
import { cueFor, faultPhrase, isFault, MOVEMENT_SPECS, REVIEW_MOVEMENTS, reviewMovementFor } from './movements';
import { FAULT_PRIORITY } from '@/lib/babylon/nexus/neuro-mirror/rules/cue-engine';

describe('reviewMovementFor', () => {
  it('reads a tagged row by its pattern, and the name breaks the cases a pattern gets wrong', () => {
    expect(reviewMovementFor({ name: 'Goblet squat', pattern: 'squat' })).toBe('squat');
    expect(reviewMovementFor({ name: 'Romanian deadlift', pattern: 'hinge' })).toBe('hinge');
    expect(reviewMovementFor({ name: 'Reverse lunge', pattern: 'lunge' })).toBe('lunge');
    expect(reviewMovementFor({ name: 'Rear-foot split squat', pattern: 'squat' })).toBe('lunge');
    expect(reviewMovementFor({ name: 'Bulgarian split squat', pattern: 'lunge' })).toBe('lunge');
    expect(reviewMovementFor({ name: 'Push-up', pattern: 'push' })).toBe('pushup');
    expect(reviewMovementFor({ name: 'Incline press-ups', pattern: 'push' })).toBe('pushup');
  });

  it('never a movement the camera cannot read: a press, a row, a carry, a jump tag', () => {
    expect(reviewMovementFor({ name: 'Bench press', pattern: 'push' })).toBeNull();
    expect(reviewMovementFor({ name: 'Overhead press', pattern: 'push' })).toBeNull();
    expect(reviewMovementFor({ name: 'Bent-over row', pattern: 'pull' })).toBeNull();
    expect(reviewMovementFor({ name: 'Farmer carry', pattern: 'carry' })).toBeNull();
    expect(reviewMovementFor({ name: 'Box squat jump', pattern: 'locomotion' })).toBeNull();
  });

  it('an untagged row is read by its name', () => {
    expect(reviewMovementFor({ name: 'Air squats', pattern: null })).toBe('squat');
    expect(reviewMovementFor({ name: 'Single-leg RDL', pattern: null })).toBe('hinge');
    expect(reviewMovementFor({ name: 'Plank', pattern: null })).toBeNull();
  });
});

describe('the words', () => {
  it('every movement\'s faults are its live coach\'s, in that coach\'s order, each with the Mirror\'s own cue card', () => {
    expect(MOVEMENT_SPECS.squat.faults).toEqual(FAULT_PRIORITY.filter((f) => ['kneeValgus', 'heelRise', 'armFall', 'lateralShift', 'shallow'].includes(f)));
    for (const m of REVIEW_MOVEMENTS) {
      for (const f of MOVEMENT_SPECS[m].faults) {
        expect(cueFor(m, f)?.cue, `${m} ${f}`).toBeTruthy();
        expect(MOVEMENT_SPECS[m].label_of[f], `${m} ${f}`).toBeTruthy();
        expect(isFault(m, f)).toBe(true);
      }
    }
    expect(isFault('squat', 'bodyLine')).toBe(false);
  });

  it('a knee names its side; a fault with no side reads as is', () => {
    expect(faultPhrase('squat', 'kneeValgus', 'left')).toBe('Left knee caves');
    expect(faultPhrase('squat', 'kneeValgus', 'both')).toBe('Both knees cave');
    expect(faultPhrase('lunge', 'wobble', 'right')).toBe('Right knee wobbles');
    expect(faultPhrase('lunge', 'kneeIn', null)).toBe('Knee caves');
    expect(faultPhrase('hinge', 'dowelLine', 'left')).toBe('Back line breaks');
  });

  it('no line claims a measurement or a diagnosis', () => {
    for (const m of REVIEW_MOVEMENTS) {
      for (const f of MOVEMENT_SPECS[m].faults) expect(faultPhrase(m, f, 'left')).not.toMatch(/measured|injur|diagnos|weak|tight/i);
      expect(MOVEMENT_SPECS[m].setup).not.toMatch(/measured/i);
    }
  });
});
