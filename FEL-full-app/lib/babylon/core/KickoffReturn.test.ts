// Is the catch a window, does the blocker pick the right man, is the diver a launchpad, does the wall take a run, is a hit up there a strip?
import { describe, it, expect } from 'vitest';
import { CATCH, catchGrade, catchStack, BLOCK, blockerTarget, blockerLeadPoint, hurdleRead, gunslingRead, vaultArc, GUNSLING, parallelRead, draftingRead, slingshotStep, SLINGSHOT, stiffArmRead, railRead, rampAt, tunnelAt, LANES, pounceRead, fumbleRead, frameOf } from './KickoffReturn';

describe('the launch', () => {
  it('a press as the ball lands is perfect, a beat early is good, earlier is nothing; the free catch stacks nothing', () => {
    expect(catchGrade(0.98)).toBe('perfect'); expect(catchGrade(1 - CATCH.goodK + 0.01)).toBe('good'); expect(catchGrade(0.6)).toBe('early');
    expect(catchStack('perfect')).toBe(1); expect(catchStack('good')).toBeLessThan(1); expect(catchStack('late')).toBe(0);
  });
});

describe('the blocking wall', () => {
  const me = { x: 0, z: 0 }, vel = { x: 0, z: 6 };
  it('the blocker runs down the nearest standing gunner in the lane ahead, never a downed one or one behind', () => {
    const t = blockerTarget(me, vel, [{ x: 1, z: 8, down: false }, { x: 0, z: 4, down: true }, { x: 0, z: -3, down: false }, { x: 12, z: 6, down: false }]);
    expect(t).toEqual({ x: 1, z: 8, down: false });
    expect(blockerTarget(me, vel, [{ x: 0, z: 4, down: true }])).toBeNull();
  });
  it('with nobody to hit he leads off the runner\'s shoulder', () => {
    const p = blockerLeadPoint(me, vel, 1);
    expect(p.z).toBeCloseTo(BLOCK.leadM, 6); expect(p.x).toBeCloseTo(BLOCK.sideM, 6);
    expect(blockerLeadPoint(me, vel, -1).x).toBeCloseTo(-BLOCK.sideM, 6);
  });
  it('a downed body just ahead on the line is a hurdle; off the line or behind it is not', () => {
    expect(hurdleRead(me, vel, [{ x: 0.3, z: 1.5 }])).toBe(true);
    expect(hurdleRead(me, vel, [{ x: 3, z: 1.5 }])).toBe(false);
    expect(hurdleRead(me, vel, [{ x: 0, z: -1 }])).toBe(false);
    expect(hurdleRead(me, { x: 0, z: 1 }, [{ x: 0, z: 1.5 }])).toBe(false);
  });
});

describe('the gunslinger parry-vault', () => {
  it('a diver arriving from the front inside the window; not a slow one, not one from behind', () => {
    expect(gunslingRead(1.8, 4, 0.9)).toBe(true);
    expect(gunslingRead(1.8, 4, -0.8)).toBe(false);
    expect(gunslingRead(1.8, 1, 0.9)).toBe(false);
    expect(gunslingRead(4, 5, 0.9)).toBe(false);
  });
  it('the vault goes up and over, landing past him', () => {
    const mid = vaultArc({ x: 0, y: 0, z: 0 }, { x: 0, z: 1 }, 0.5), end = vaultArc({ x: 0, y: 0, z: 0 }, { x: 0, z: 1 }, 1);
    expect(mid.y).toBeCloseTo(GUNSLING.up, 6); expect(end.y).toBeCloseTo(0, 6); expect(end.z).toBeCloseTo(GUNSLING.forward, 6);
  });
});

describe('the slingshot', () => {
  const me = { x: 0, z: 0 }, vel = { x: 0, z: 6 };
  it('a parallel blocker is level and a lane over; drafting is behind him on the line', () => {
    expect(parallelRead(me, vel, { x: 2.5, z: 0.5 })).toBe(true);
    expect(parallelRead(me, vel, { x: 0.5, z: 0.5 })).toBe(false);
    expect(parallelRead(me, vel, { x: 2.5, z: 6 })).toBe(false);
    expect(draftingRead(me, vel, { x: 0.4, z: 2 })).toBe(true);
    expect(draftingRead(me, vel, { x: 0.4, z: -2 })).toBe(false);
  });
  it('the gauge fills while drafting and caps', () => {
    expect(slingshotStep(0, true, 1)).toBeCloseTo(SLINGSHOT.gaugePerSec, 6);
    expect(slingshotStep(90, true, 1)).toBe(SLINGSHOT.full);
    expect(slingshotStep(50, false, 1)).toBe(50);
  });
});

describe('the stiff-arm', () => {
  it('an adjacent gunner at speed, not one ahead, not walking', () => {
    const me = { x: 0, z: 0 }, vel = { x: 0, z: 6 };
    expect(stiffArmRead(me, vel, { x: 1, z: 0.5 })).toBe(true);
    expect(stiffArmRead(me, vel, { x: 0.2, z: 3 })).toBe(false);
    expect(stiffArmRead(me, { x: 0, z: 1 }, { x: 1, z: 0.5 })).toBe(false);
  });
});

describe('the lanes', () => {
  it('the rail takes a fast run INTO the wall, on that side', () => {
    expect(railRead(18.8, 2, 5)).toBe(1); expect(railRead(-18.8, -2, 5)).toBe(-1);
    expect(railRead(18.8, -2, 5)).toBe(0); expect(railRead(10, 2, 5)).toBe(0); expect(railRead(18.8, 1, 2)).toBe(0);
  });
  it('ramps and tunnels are footprints on the turf', () => {
    expect(rampAt(LANES.ramps[0].x, LANES.ramps[0].z)).toBe(0); expect(rampAt(0, 0)).toBe(-1);
    expect(tunnelAt(LANES.tunnels[1].x, LANES.tunnels[1].z0 + 1)).toBe(1); expect(tunnelAt(0, 15)).toBe(-1);
  });
});

describe('the gunners\' answer', () => {
  it('a pounce needs the wall and the range; a hit while exposed is a fumble', () => {
    expect(pounceRead({ x: 16, z: 10 }, { x: 12, z: 8 })).toBe(true);
    expect(pounceRead({ x: 5, z: 10 }, { x: 4, z: 8 })).toBe(false);
    expect(pounceRead({ x: 16, z: 10 }, { x: 15, z: 10 })).toBe(false);
    expect(fumbleRead('vault')).toBe(true); expect(fumbleRead(null)).toBe(false);
  });
  it('the frame is along / lateral down a direction', () => {
    const f = frameOf({ x: 0, z: 0 }, { x: 0, z: 2 }, { x: 1, z: 3 });
    expect(f.along).toBeCloseTo(3, 6); expect(f.lateral).toBeCloseTo(1, 6);
  });
});
