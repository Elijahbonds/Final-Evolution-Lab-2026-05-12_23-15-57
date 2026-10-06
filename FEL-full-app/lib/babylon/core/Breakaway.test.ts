// Does the flow set the power, does the glass take a run, does the mirror aim bank, is the keeper an answer?
import { describe, it, expect } from 'vitest';
import { BREAK, FLOW, flowAdd, shotProfile, glassRead, bankTarget, rainbowRead, slideCancelRead, rainbowArc, KEEPER, keeperTargetZ, keeperSlideRead, reachFor, crossesKeeper, AIM, stickAimSide, strikeStretch01, strikeAim, keeperDiveX } from './Breakaway';

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

// IMPROVE (2026-10-06, Penalty #8): the parry is placement, not a roll
import { parryRead } from './Breakaway';
describe('the parry-kick', () => {
  it('a shot at his body comes back; one at his stretch is held; none late on the clock or off an overdrive', () => {
    expect(parryRead(0.3, 0, 5, 'strike')).toBe(true);
    expect(parryRead(-KEEPER.parryBodyM, 0, 5, 'curler')).toBe(true);
    expect(parryRead(KEEPER.parryBodyM + 0.05, 0, 5, 'strike')).toBe(false);
    expect(parryRead(0.1, 0, KEEPER.parryMinClock, 'strike')).toBe(false);
    expect(parryRead(0.1, 0, 5, 'overdrive')).toBe(false);
    expect(parryRead(2.1, 2.0, 5, 'bank')).toBe(true);   // measured from where HE is, not the middle
  });
});

// ── owner decision 2026-10-06, "Stick aims" ──────────────────────────────────────────────────────────────────────────
describe('the stick aims the breakaway shot', () => {
  it('the stick held at the strike picks left, the middle or right; up lifts it', () => {
    expect(stickAimSide(-0.9)).toBe(-1);
    expect(stickAimSide(0.9)).toBe(1);
    expect(stickAimSide(0)).toBe(0);
    expect(stickAimSide(AIM.sideDeadZone - 0.01)).toBe(0);
    expect(stickAimSide(-AIM.sideDeadZone)).toBe(-1);
    expect(strikeAim({ x: -1, y: 0 }, BREAK.dribbleAhead).target).toEqual({ x: -AIM.cornerX, y: AIM.lowY });
    expect(strikeAim({ x: 1, y: 0 }, BREAK.dribbleAhead).target).toEqual({ x: AIM.cornerX, y: AIM.lowY });
    expect(strikeAim({ x: 0, y: 0 }, BREAK.dribbleAhead).target).toEqual({ x: 0, y: AIM.lowY });
    const upLeft = strikeAim({ x: -0.7, y: -0.7 }, BREAK.dribbleAhead);
    expect(upLeft.high).toBe(true);
    expect(upLeft.target).toEqual({ x: -AIM.cornerX, y: AIM.highY });
    expect(strikeAim({ x: 0, y: 0.9 }, BREAK.dribbleAhead).high).toBe(false);   // stick back is not high
  });
  it('off the dribble every corner is reachable — the ball\'s distance no longer picks it', () => {
    // the bug: the ball always rides dribbleAhead ahead, so the distance read put every plain strike at x ≈ −0.1
    const xs = [-1, 0, 1].map((sx) => strikeAim({ x: sx, y: 0 }, BREAK.dribbleAhead).target.x);
    expect(xs).toEqual([-AIM.cornerX, 0, AIM.cornerX]);
    for (const d of [0.2, BREAK.dribbleAhead, BREAK.strikeReach]) expect(strikeAim({ x: 1, y: 0 }, d).side).toBe(1);
  });
  it('the distance is the accuracy: clean on the dribble\'s sweet spot, wobbling off it', () => {
    expect(strikeStretch01(BREAK.dribbleAhead)).toBe(0);
    expect(strikeAim({ x: 1, y: 0 }, BREAK.dribbleAhead).wobble).toBe(0);
    expect(strikeStretch01(BREAK.strikeReach)).toBe(1);
    expect(strikeAim({ x: 1, y: 0 }, BREAK.strikeReach).wobble).toBeCloseTo(AIM.stretchWobble, 9);
    expect(strikeStretch01(BREAK.dribbleAhead - 0.4)).toBeCloseTo(0.5, 9);   // jammed tight wobbles too
  });
  it('the keeper: read right he goes to the line, read wrong he goes away — a misread middle shot is still a dive', () => {
    expect(keeperDiveX(true, 1, 3.0, 0, 0.5)).toBe(2.9);
    expect(keeperDiveX(true, 0, 0, 0.3, 0.5)).toBe(0);
    expect(keeperDiveX(false, 1, 3.0, 0, 0.5)).toBe(-2);
    expect(keeperDiveX(false, -1, -3.0, 0, 0.5)).toBe(2);
    expect(Math.abs(keeperDiveX(false, 0, 0, 0, 0.1))).toBe(2);   // before: −0 × 2 left him standing in the ball's path
    expect(keeperDiveX(false, 0, 0, 0, 0.1)).toBe(-keeperDiveX(false, 0, 0, 0, 0.9));
  });
});
