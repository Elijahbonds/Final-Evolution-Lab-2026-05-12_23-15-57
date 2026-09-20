// Does the glass send the run back, do the two launches differ, is the double-launch a window, does a perfect break the board?
import { describe, it, expect } from 'vitest';
import { BUS_RUN, busRunPose, alongPane, busRunDone, cornerRideFor, GLASS, glassRebound, launchProfile, doubleLaunchAllowed, DOUBLE_LAUNCH, overdriveDunk, cornerPanes, paneRebound, billboardFor, wallRunMiss } from './DunkParkour';
import type { GlassPane } from './DunkParkour';

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
  it('the two feet are far enough apart to SEE — the carry spread is worth centimetres of travel, not millimetres', () => {
    const one = launchProfile('one', false), two = launchProfile('two', false);
    // the mode multiplies PLANT_DRIFT_M (0.14 m) by the carry: this is the travel each foot keeps through the plant
    const PLANT_DRIFT_M = 0.14;
    const glide = PLANT_DRIFT_M * one.carryMult, lift = PLANT_DRIFT_M * two.carryMult;
    expect(glide - lift).toBeGreaterThan(0.12);        // ≥ 12 cm apart: the old 1.15/0.9 pair was under 4 cm
    expect(one.carryMult / two.carryMult).toBeGreaterThan(2.5);
    expect(two.apexMult / one.apexMult).toBeGreaterThan(1.2);   // and the lift buys real height for it
  });

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
  it('the bus wall run goes up the side and along it toward the rim, and leaves at the front end', () => {
    const bus = panes[0];
    const s0 = alongPane(bus, bus.cx + bus.nx * 0.3, bus.cz + bus.nz * 0.3);
    expect(s0).toBeCloseTo(0, 6);
    const a = busRunPose(bus, 0, 0), b = busRunPose(bus, 2, BUS_RUN.riseSec + 1);
    expect(a.y).toBe(0); expect(b.y).toBeCloseTo(BUS_RUN.height, 6);
    expect(b.z).toBeLessThan(a.z); expect(Math.abs(b.x)).toBeLessThan(Math.abs(a.x));   // toward the rim and the centre line
    expect(Math.hypot(b.fx, b.fz)).toBeCloseTo(1, 6); expect(b.fz).toBeLessThan(0);
    expect(busRunDone(BUS_RUN.exitS - 0.1, 0.5)).toBe(false); expect(busRunDone(BUS_RUN.exitS, 0.5)).toBe(true); expect(busRunDone(0, BUS_RUN.maxSec)).toBe(true);
    expect(launchProfile('one', true, true).label).toMatch(/^WALL RUN/); expect(launchProfile('one', true, false).label).toMatch(/^CORNER REBOUND/);
    expect(cornerRideFor('orbit').kind).toBe('shuttle'); expect(cornerRideFor('venice').kind).toBe('hoopbus'); expect(cornerRideFor(undefined).short).toBe('BUS');
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

  it('THE RIDE IS CATCHABLE: a flatter line runs its side, and the tent still needs a real angle', () => {
    const [bus, tent] = cornerPanes(GLASS.halfX, -7.5);   // side +1 is the ride parked across the right corner
    const at = (q: GlassPane, out = 0.2): [number, number] => [q.cx + q.nx * out, q.cz + q.nz * out];
    // 10.5° off the face — under the old 14° floor, so this line used to run straight past the bus
    expect(paneRebound(...at(bus), -3.5, -5.1, [bus])?.wallRun).toBe(true);
    // 35.5° — over the old 34° edge, so it bounced off instead of running the side. It runs it now.
    expect(paneRebound(...at(bus), -1, -6, [bus])?.wallRun).toBe(true);
    // 43.4° is still too square to run: that is a rebound, the honest answer to hitting it head-on
    expect(paneRebound(...at(bus), -0.2, -7, [bus])?.wallRun).toBe(false);
    // 3.0° is flatter than even the ride's floor: a brush past the side, not a run up it
    expect(paneRebound(...at(bus), -4.6, -5.1, [bus])).toBeNull();
    // and the TENT is untouched — a rebound still needs GLASS.minDeg, so the same 10.5° line is nothing there
    expect(paneRebound(...at(tent), 3.5, -5.1, [tent])).toBeNull();
  });

  it('a near miss has a NAME — slow, flat or too square — and running nowhere near it is not a miss', () => {
    const [bus] = cornerPanes(GLASS.halfX, -7.5);
    const at = (q: GlassPane, out = 0.2): [number, number] => [q.cx + q.nx * out, q.cz + q.nz * out];
    expect(wallRunMiss(...at(bus), -0.5, -1.5, [bus])).toBe('slow');    // 1.6 m/s, under GLASS.minSpeed
    expect(wallRunMiss(...at(bus), -0.2, -7, [bus])).toBe('steep');     // 43° — straight into the face
    expect(wallRunMiss(...at(bus), -1, -6, [bus])).toBeNull();          // 35° — inside the band now, so caught
    expect(wallRunMiss(-9, 9, -5, -5, [bus])).toBeNull();               // nowhere near it
  });
});
