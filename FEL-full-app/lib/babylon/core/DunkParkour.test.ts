// Does the glass send the run back, do the two launches differ, is the double-launch a window, does a perfect break the board?
import { describe, it, expect } from 'vitest';
import { GLASS, glassRebound, launchProfile, doubleLaunchAllowed, DOUBLE_LAUNCH, overdriveDunk, cornerPanes, paneRebound, billboardFor } from './DunkParkour';

describe('the glass rebound', () => {
  it('reflects a fast oblique run into the wall and keeps the speed', () => {
    const r = glassRebound(5.4, 2.5, -4)!;
    expect(r).not.toBeNull(); expect(r.x).toBeCloseTo(-2.5, 6); expect(r.z).toBeCloseTo(-4, 6);
    expect(glassRebound(-5.4, -2.5, -4)!.x).toBeCloseTo(2.5, 6);
  });
  it('refuses a run away from the wall, a slow one, one along the wall, or one nowhere near it', () => {
    expect(glassRebound(5.4, -2, -4)).toBeNull();
    expect(glassRebound(5.4, 1, -1.5)).toBeNull();
    expect(glassRebound(5.4, 0.4, -5)).toBeNull();
    expect(glassRebound(2, 3, -4)).toBeNull();
  });
});

describe('the launches', () => {
  it('one foot keeps the carry, two feet buy height; the glass multiplies the apex and adds difficulty, capped at ×2', () => {
    const one = launchProfile('one', false), two = launchProfile('two', false);
    expect(one.carryMult).toBeGreaterThan(two.carryMult); expect(two.apexMult).toBeGreaterThan(one.apexMult);
    const v = launchProfile('two', true);
    expect(v.apexMult).toBeCloseTo(Math.min(2, two.apexMult * GLASS.apexMult), 6);
    expect(v.difficulty).toBeCloseTo(two.difficulty + GLASS.difficulty, 6);
    expect(v.label).toMatch(/REBOUND/);
  });
  it('the double-launch is a window on the flight clock, once', () => {
    expect(doubleLaunchAllowed(DOUBLE_LAUNCH.fromT + 0.05, false)).toBe(true);
    expect(doubleLaunchAllowed(DOUBLE_LAUNCH.fromT + 0.05, true)).toBe(false);
    expect(doubleLaunchAllowed(0.02, false)).toBe(false);
    expect(doubleLaunchAllowed(DOUBLE_LAUNCH.toT + 0.1, false)).toBe(false);
  });
  it('a perfect on a hard dunk is an overdrive; a perfect on a nothing dunk is not', () => {
    expect(overdriveDunk(0.97, 8)).toBe(true);
    expect(overdriveDunk(0.97, 4)).toBe(false);
    expect(overdriveDunk(0.8, 9)).toBe(false);
  });
});

describe('the corner glass', () => {
  const panes = cornerPanes(5.6, -7.5);
  it('two panes at the front corners, facing the runway centre, nothing on the sidelines', () => {
    expect(panes).toHaveLength(2);
    for (const p of panes) { expect(Math.hypot(p.nx, p.nz)).toBeCloseTo(1, 6); expect(p.nz).toBeGreaterThan(0); expect(Math.sign(p.nx)).toBe(-p.side); expect(Math.abs(p.cx)).toBeLessThan(5.6); }
  });
  it('a run down the side is kicked toward the middle; a shallow one is a wall run; away from it nothing', () => {
    const right = panes[0];
    const hit = paneRebound(right.cx + right.nx * 0.2, right.cz + right.nz * 0.2, 0, -5, panes)!;
    expect(hit).not.toBeNull(); expect(hit.v.x).toBeLessThan(-3); expect(Math.abs(hit.v.z)).toBeLessThan(1);   // (0,−5) → (−5, 0)
    expect(hit.wallRun).toBe(false);
    const shallow = paneRebound(right.cx + right.nx * 0.2, right.cz + right.nz * 0.2, -2.2, -5, panes);   // ~21° off the face: along it
    expect(shallow?.wallRun).toBe(true);
    expect(paneRebound(right.cx + right.nx * 0.2, right.cz + right.nz * 0.2, -3, 3, panes)).toBeNull();
    expect(paneRebound(0, -2, 0, -5, panes)).toBeNull();
  });
});

describe('the billboards', () => {
  it('every court location has its own sign, and an unknown one gets Venice', () => {
    const ids = ['venice', 'blossom', 'orbit', 'canopy', 'rooftop'];
    expect(new Set(ids.map((id) => billboardFor(id).text)).size).toBe(5);
    expect(billboardFor(undefined).text).toBe('VENICE BEACH');
  });
  it('a wall run along the billboard launches higher than a rebound off it', () => {
    expect(launchProfile('one', true, true).apexMult).toBeGreaterThan(launchProfile('one', true).apexMult);
    expect(launchProfile('one', true, true).label).toMatch(/WALL RUN/);
  });
});
