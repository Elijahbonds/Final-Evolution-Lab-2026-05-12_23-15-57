// Does the flow set the power, does the glass take a run, does the mirror aim bank, is the keeper an answer?
import { describe, it, expect } from 'vitest';
import { BREAK, FLOW, flowAdd, shotProfile, glassRead, bankTarget, rainbowRead, slideCancelRead, rainbowArc, KEEPER, keeperTargetZ, keeperSlideRead, reachFor, crossesKeeper } from './Breakaway';

describe('kinetic shot stacking', () => {
  it('the flow sets the power, the kinetic stack and the overdrive multiply the ball, the gauge caps', () => {
    expect(shotProfile(0, false, 'strike').power01).toBeCloseTo(0.55, 6);
    expect(shotProfile(1, false, 'strike').power01).toBeCloseTo(0.9, 6);
    expect(shotProfile(0.5, true, 'strike').speedMult).toBeCloseTo(FLOW.kineticMult, 6);
    expect(shotProfile(0.5, true, 'overdrive').speedMult).toBeCloseTo(FLOW.kineticMult * FLOW.overdriveMult, 6);
    expect(shotProfile(0.5, true, 'strike').label).toBe('KINETIC STRIKE');
    expect(flowAdd(90, FLOW.wallRun)).toBe(FLOW.full);
  });
});

describe('the striker\'s tricks', () => {
  it('the glass takes a fast run INTO it; the bank aims at the mirror goal', () => {
    expect(glassRead(7, 2, 5)).toBe(1); expect(glassRead(-7, -2, 5)).toBe(-1); expect(glassRead(7, -2, 5)).toBe(0); expect(glassRead(2, 2, 5)).toBe(0); expect(glassRead(7, 1, 1)).toBe(0);
    expect(bankTarget(1, { x: 2, y: 1 })).toEqual({ x: 2 * BREAK.glassX - 2, y: 1 });
  });
  it('the rainbow needs the keeper right in front on the line; the cancel is the first beat of the slide', () => {
    expect(rainbowRead({ x: 0, z: 0 }, { x: 0, z: 5 }, { x: 0.3, z: 1.5 })).toBe(true);
    expect(rainbowRead({ x: 0, z: 0 }, { x: 0, z: 5 }, { x: 2, z: 1.5 })).toBe(false);
    expect(rainbowRead({ x: 0, z: 0 }, { x: 0, z: 5 }, { x: 0, z: 4 })).toBe(false);
    expect(rainbowRead({ x: 0, z: 0 }, { x: 0, z: 1 }, { x: 0, z: 1.5 })).toBe(false);
    expect(slideCancelRead(0.1)).toBe(true); expect(slideCancelRead(0.5)).toBe(false); expect(slideCancelRead(-1)).toBe(false);
    const top = rainbowArc({ x: 0, y: 0, z: 0 }, { x: 0, z: 1 }, 0.5); expect(top.y).toBeCloseTo(BREAK.rainbowUp, 6);
  });
});

describe('the keeper', () => {
  it('comes off his line to a lead on the striker, never past the floor', () => {
    expect(keeperTargetZ(-8)).toBe(KEEPER.closeMinZ); expect(keeperTargetZ(4)).toBeCloseTo(8.5, 6); expect(keeperTargetZ(9)).toBe(BREAK.keeperZ);
  });
  it('slides at a ball inside range when not on cooldown and the shot is not away', () => {
    expect(keeperSlideRead({ x: 0, z: 6 }, { x: 0.5, z: 4 }, 0, false)).toBe(true);
    expect(keeperSlideRead({ x: 0, z: 6 }, { x: 0.5, z: 4 }, 1, false)).toBe(false);
    expect(keeperSlideRead({ x: 0, z: 6 }, { x: 0.5, z: 4 }, 0, true)).toBe(false);
    expect(keeperSlideRead({ x: 0, z: 6 }, { x: 0, z: 0 }, 0, false)).toBe(false);
  });
  it('the vault widens the reach near a post on a high ball; the overdrive and the rainbow shrink it', () => {
    expect(reachFor(1, { high: true, kind: 'strike' }, true)).toBeCloseTo(KEEPER.vaultReachMult, 6);
    expect(reachFor(1, { high: true, kind: 'strike' }, false)).toBe(1);
    expect(reachFor(1, { high: false, kind: 'overdrive' }, false)).toBeCloseTo(KEEPER.overdriveReachMult, 6);
    expect(reachFor(1, { high: false, kind: 'rainbow' }, false)).toBeCloseTo(KEEPER.rainbowReachMult, 6);
    expect(crossesKeeper(5.9, 6.1, 6)).toBe(true); expect(crossesKeeper(6.1, 6.3, 6)).toBe(false);
  });
});
