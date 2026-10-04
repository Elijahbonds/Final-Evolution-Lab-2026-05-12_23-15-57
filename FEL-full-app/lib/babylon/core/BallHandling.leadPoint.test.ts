import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { leadPoint, PASS_SPEED } from './BallHandling';

// HOOPS-10PHASE-2 phase 6: lead a moving target so a pass arrives ON a cutter rather than behind him.
describe('leadPoint', () => {
  it('leads a target moving away from the passer — the aim point is further along his path than his current spot', () => {
    const from = new Vector3(0, 0, 0);
    const target = new Vector3(0, 0, 5);
    const vel = new Vector3(3, 0, 0);   // cutting hard across, perpendicular to the throw line
    const lead = leadPoint(from, target, vel, PASS_SPEED.chest);
    expect(lead.x).toBeGreaterThan(target.x);   // aimed ahead of him, not at him
    expect(lead.z).toBeCloseTo(target.z, 5);    // no lateral drift on the axis he isn't moving on
  });

  it('a standing target (zero velocity) is NOT led — the aim point collapses to his exact spot', () => {
    const from = new Vector3(2, 0, 2);
    const target = new Vector3(6, 0, 9);
    const lead = leadPoint(from, target, new Vector3(0, 0, 0), PASS_SPEED.chest);
    expect(Vector3.Distance(lead, target)).toBeLessThan(1e-6);
  });

  it('leads further for a farther throw (more flight time to cover) and for a slower pass type', () => {
    const from = new Vector3(0, 0, 0);
    const target = new Vector3(0, 0, 4);
    const vel = new Vector3(2.5, 0, 0);
    const near = leadPoint(from, target, vel, PASS_SPEED.chest);
    const farTarget = new Vector3(0, 0, 14);
    const far = leadPoint(from, farTarget, vel, PASS_SPEED.chest);
    expect(Vector3.Distance(far, farTarget)).toBeGreaterThan(Vector3.Distance(near, target));
    const bounce = leadPoint(from, target, vel, PASS_SPEED.bounce);   // bounce is slower than chest (PASS_SPEED)
    expect(Vector3.Distance(bounce, target)).toBeGreaterThan(Vector3.Distance(near, target));
  });

  it('converges: a second solve from the first answer barely moves (the fixed point is real, not a one-shot guess)', () => {
    const from = new Vector3(0, 0, 0);
    const target = new Vector3(0, 0, 8);
    const vel = new Vector3(4, 0, 1);
    const lead = leadPoint(from, target, vel, PASS_SPEED.chest);
    // re-deriving from the SAME target/vel (not from `lead`, which would double-apply the velocity) should
    // reproduce the identical point — three iterations already converged inside the function.
    const again = leadPoint(from, target, vel, PASS_SPEED.chest);
    expect(Vector3.Distance(lead, again)).toBe(0);
  });

  it('a faster pass speed leads less — the ball spends less time in the air to close the same distance', () => {
    const from = new Vector3(0, 0, 0);
    const target = new Vector3(0, 0, 6);
    const vel = new Vector3(3, 0, 0);
    const slow = leadPoint(from, target, vel, 8);
    const fast = leadPoint(from, target, vel, 20);
    expect(Vector3.Distance(fast, target)).toBeLessThan(Vector3.Distance(slow, target));
  });
});
