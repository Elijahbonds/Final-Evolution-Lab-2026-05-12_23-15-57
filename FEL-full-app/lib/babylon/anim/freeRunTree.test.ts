// The gait decision, and the hold band that stopped it flickering (2026-09-15).
//
// The scorecard measured free run changing clip 3 times a second — the Body rubric charges a point for churn, and a
// runner who re-decides every frame reads as broken from outside. The cause was a hard edge at speed01 0.5: a runner
// riding it (cornering, brushing a wall, easing off the stick) alternated run/walk frame by frame.
import { describe, expect, it } from 'vitest';
import { chooseFreeRunClip, type FreeRunAnimInput } from './freeRunTree';

const ground = (speed01: number): FreeRunAnimInput => ({
  speed01, airborne: false, jumpBeat: false, tricking: false, wallrun: false, sliding: false, landing: 'none', down: false,
});

describe('freeRunTree gaits', () => {
  it('picks the gait from the speed when nothing is playing yet', () => {
    expect(chooseFreeRunClip(ground(0.8)).state).toBe('run');
    expect(chooseFreeRunClip(ground(0.3)).state).toBe('walk');
    expect(chooseFreeRunClip(ground(0)).state).toBe('idle');
  });

  it('a run already playing holds through a dip under its entry speed', () => {
    expect(chooseFreeRunClip(ground(0.45)).state).toBe('walk');            // from a standstill, 0.45 is a walk
    expect(chooseFreeRunClip(ground(0.45), 'run').state).toBe('run');      // but a runner at 0.45 is still running
    expect(chooseFreeRunClip(ground(0.35), 'run').state).toBe('walk');     // he does drop out eventually
  });

  it('a walk holds down to a near stop, so easing off does not flicker to idle', () => {
    expect(chooseFreeRunClip(ground(0.05)).state).toBe('idle');
    expect(chooseFreeRunClip(ground(0.05), 'walk').state).toBe('walk');
    expect(chooseFreeRunClip(ground(0.02), 'walk').state).toBe('idle');
  });

  it('a speed riding the run edge never alternates', () => {
    const wobble = [0.52, 0.49, 0.51, 0.47, 0.5, 0.46, 0.52];
    let gait = chooseFreeRunClip(ground(wobble[0])).state;
    const seen = new Set([gait]);
    for (const s of wobble.slice(1)) { gait = chooseFreeRunClip(ground(s), gait).state; seen.add(gait); }
    expect([...seen]).toEqual(['run']);
  });

  it('the hold band never outranks the air, a landing or a bail', () => {
    expect(chooseFreeRunClip({ ...ground(0.45), airborne: true }, 'run').state).toBe('air');
    expect(chooseFreeRunClip({ ...ground(0.45), landing: 'clean' }, 'run').state).toBe('land_clean');
    expect(chooseFreeRunClip({ ...ground(0.45), down: true }, 'run').state).toBe('bail');
  });
});
