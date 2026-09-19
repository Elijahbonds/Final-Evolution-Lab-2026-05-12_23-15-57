// Does the glass keep a wide ball live, does the mirror keep the path continuous, when is R1 a smash, how does the multiplier pay?
import { describe, it, expect } from 'vitest';
import { TENNIS } from './RallyCore';
import { CAGE, glassX, backZ, cageCross, mirrorShot, liveOffGlass, WALLRUN, wallRunRead, SMASH, aerialRead, MULT, multStep, paceFor, stylePts } from './ParkourTennis';

describe('the cage', () => {
  it('wide and long are live; the net is not', () => { expect(liveOffGlass('wide')).toBe(true); expect(liveOffGlass('long')).toBe(true); expect(liveOffGlass('net')).toBe(false); expect(liveOffGlass(null)).toBe(false); });
  it('a pane is crossed once a flight', () => {
    expect(glassX(TENNIS)).toBeCloseTo(TENNIS.halfWidth + CAGE.sideM, 6);
    expect(cageCross({ x: glassX(TENNIS) + 0.01, z: 3 }, TENNIS, false, false)).toBe('side');
    expect(cageCross({ x: glassX(TENNIS) + 0.01, z: 3 }, TENNIS, true, false)).toBeNull();
    expect(cageCross({ x: 0, z: backZ(TENNIS) + 0.1 }, TENNIS, false, false)).toBe('back');
    expect(cageCross({ x: 0, z: 3 }, TENNIS, false, false)).toBeNull();
  });
  it('the mirror keeps the point on the pane and brings the landing back inside', () => {
    const shot = { from: { x: 0, z: 10 }, to: { x: 8, z: -10 } };
    const line = glassX(TENNIS);   // the ball is at x = line at u = line / 8
    const u = line / 8; const before = shot.from.x + (shot.to.x - shot.from.x) * u;
    mirrorShot(shot, 'x', line);
    const after = shot.from.x + (shot.to.x - shot.from.x) * u;
    expect(after).toBeCloseTo(before, 6); expect(shot.to.x).toBeCloseTo(2 * line - 8, 6); expect(Math.abs(shot.to.x)).toBeLessThan(TENNIS.halfWidth);
  });
});

describe('the returns', () => {
  it('a wall run is a body at the glass', () => { expect(wallRunRead(TENNIS.halfWidth - 0.3, TENNIS.halfWidth)).toBe(true); expect(wallRunRead(2, TENNIS.halfWidth)).toBe(false); expect(WALLRUN.paceMult).toBeGreaterThan(1); });
  it('R1 is the back-wall smash on a deep lob, the meteor on a short ball with the energy, nothing else', () => {
    expect(aerialRead(-11, TENNIS, 'lob', 0, true)).toBe('backwall');
    expect(aerialRead(-11, TENNIS, 'drive', 100, true)).toBeNull();
    expect(aerialRead(-3, TENNIS, 'drop', SMASH.meteorEnergy, true)).toBe('meteor');
    expect(aerialRead(-3, TENNIS, 'drop', 10, true)).toBeNull();
    expect(aerialRead(-3, TENNIS, 'drop', 0, false)).toBe('meteor');
    expect(aerialRead(-8, TENNIS, 'drive', 100, true)).toBeNull();
  });
});

describe('the multiplier', () => {
  it('climbs to a cap, speeds the ball, and pays the point', () => {
    expect(multStep(1, 1)).toBe(2); expect(multStep(4, 2)).toBe(MULT.max);
    expect(paceFor(1)).toBe(1); expect(paceFor(3)).toBeLessThan(1); expect(paceFor(3)).toBeCloseTo(1 / 1.16, 6);
    expect(stylePts(1)).toBe(MULT.ptsPer); expect(stylePts(4)).toBe(MULT.ptsPer * 4);
  });
});
