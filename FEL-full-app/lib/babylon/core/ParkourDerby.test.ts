// Does the wall get crossed where the maths says, is a zone a zone, can a fielder make it, does the glass pay?
import { describe, it, expect } from 'vitest';
import { PARK, TARGETS, predictWallCross, targetHit, robRead, verdictFor, flowTrick, kineticSwing, FLOW, multiplierScramble, TOKEN } from './ParkourDerby';

describe('the wall crossing', () => {
  it('a drive crosses the wall at the height gravity leaves it; a dribbler never gets there', () => {
    const c = predictWallCross({ x: 0, y: 9.67, z: 28.6 }, { x: 0, y: 1, z: 0 })!;
    expect(c).not.toBeNull(); expect(c.t).toBeCloseTo(38 / 28.6, 3); expect(c.h).toBeGreaterThan(PARK.wallTop); expect(c.bearingDeg).toBeCloseTo(0, 6);
    expect(predictWallCross({ x: 0, y: 2, z: 10 }, { x: 0, y: 1, z: 0 })).toBeNull();
    expect(predictWallCross({ x: 5, y: 8, z: 20 }, { x: 0, y: 1, z: 0 })!.bearingDeg).toBeCloseTo(14.04, 1);
  });
  it('a zone is an arc-and-height circle; a taken zone is not there', () => {
    expect(targetHit({ bearingDeg: 0.5, h: 4.9 })?.id).toBe('C');
    expect(targetHit({ bearingDeg: 0.5, h: 4.9 }, TARGETS, new Set(['C']))).toBeNull();
    expect(targetHit({ bearingDeg: 8, h: 4.9 })).toBeNull();
    expect(targetHit({ bearingDeg: 16, h: 2 })).toBeNull();
  });
});

describe('the robbery', () => {
  it('a fielder who makes it runs the wall for a low ball, hangs for a high one with time to spare, and cannot reach a moonshot', () => {
    expect(robRead(25, { t: 2.0, bearingDeg: 20, h: 4 })).toBe('wallrun');
    expect(robRead(25, { t: 2.0, bearingDeg: 20, h: 6.5 })).toBe('hang');
    expect(robRead(25, { t: 2.0, bearingDeg: 20, h: 9 })).toBeNull();
    expect(robRead(25, { t: 0.4, bearingDeg: -20, h: 4 })).toBeNull();
  });
  it('a pillar between him and the ball speeds the run', () => {
    const arc = (PARK.wallR * 30 * Math.PI) / 180, t = arc / PARK.fielderSpeed;
    expect(robRead(25, { t: t * 0.9, bearingDeg: -5, h: 4 })).toBe('wallrun');   // across the pillar at 12°: ×1.2
    expect(robRead(-25, { t: t * 0.9, bearingDeg: -55, h: 4 })).toBeNull();     // no pillar past −25
  });
  it('the verdict: the zone first, then the glove, then the wall\'s top', () => {
    expect(verdictFor(null, null, null)).toBe('short');
    expect(verdictFor({ h: 8 }, TARGETS[2], 'wallrun')).toBe('target');
    expect(verdictFor({ h: 5 }, null, 'wallrun')).toBe('robbed');
    expect(verdictFor({ h: 8 }, null, null)).toBe('homer');
    expect(verdictFor({ h: 5 }, null, null)).toBe('wall');
  });
});

describe('the kinetic swing and the multiplier', () => {
  it('the bat flip fills the flow; the swing grows with it; the label turns kinetic at 70', () => {
    expect(flowTrick(0, 'batflip')).toBe(FLOW.batFlip); expect(flowTrick(90, 'batflip')).toBe(FLOW.full);
    expect(kineticSwing(1).exitMult).toBeCloseTo(1 + FLOW.exitGain, 6); expect(kineticSwing(0.35).label).toBe('FLOW SWING'); expect(kineticSwing(0.7).label).toBe('KINETIC SWING'); expect(kineticSwing(0).label).toBe('');
  });
  it('the token near a fielder is theirs; far from both it is yours', () => {
    expect(multiplierScramble(20, PARK.fielderBearings)).toBe('theirs');
    expect(multiplierScramble(0, PARK.fielderBearings, TOKEN.graceSec)).toBe('yours');
  });
});
