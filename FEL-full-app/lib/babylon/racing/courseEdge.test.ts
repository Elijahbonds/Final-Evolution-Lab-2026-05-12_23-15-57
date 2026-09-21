import { describe, expect, it } from 'vitest';
import { RETURN_RATE, VERGE_M, edgeLimit, edgeReturn, settleOver } from './courseEdge';

const HALF = 9;                       // TRACK_HALF_WIDTH
const LIMIT = edgeLimit(HALF);        // 17 m
const OFF_ROAD_SPEED = 11.7;          // measured: the kart's off-road cap

describe('courseEdge', () => {
  it('leaves the road and the verge alone', () => {
    for (const lat of [0, 5, -8.9, 12, -16.9]) expect(edgeReturn(lat, LIMIT, 1 / 60)).toBe(0);
    expect(edgeLimit(HALF)).toBe(HALF + VERGE_M);
  });

  it('pulls back toward the line, never past it', () => {
    const pull = edgeReturn(30, LIMIT, 1 / 60);
    expect(pull).toBeGreaterThan(0);                 // the caller subtracts, so a positive lateral gets smaller
    expect(pull).toBeLessThan(30 - LIMIT);           // never further than the excess: it cannot overshoot inward
    expect(edgeReturn(-30, LIMIT, 1 / 60)).toBeCloseTo(-pull, 9);
  });

  it('pulls harder the further out you are', () => {
    expect(Math.abs(edgeReturn(60, LIMIT, 1 / 60))).toBeGreaterThan(Math.abs(edgeReturn(20, LIMIT, 1 / 60)));
  });

  it('is frame-rate independent: the same second of pull, however it is sliced', () => {
    const run = (dt: number) => { let lat = 76; for (let t = 0; t < 1 - 1e-9; t += dt) lat -= edgeReturn(lat, LIMIT, dt); return lat; };
    expect(run(1 / 144)).toBeCloseTo(run(1 / 30), 2);
    expect(run(1 / 60)).toBeCloseTo(run(1 / 30), 2);
  });

  it('brings the measured 76 m drive back to the course', () => {
    // The probe's actual number. One second of pull should leave it near the verge, not out in the void.
    let lat = 75.83;
    for (let k = 0; k < 60; k++) lat -= edgeReturn(lat, LIMIT, 1 / 60);
    expect(lat).toBeLessThan(LIMIT + 2);
    expect(lat).toBeGreaterThan(HALF);   // it does not yank you back onto the racing line
  });

  it('settles a few metres over rather than pinning you against a wall', () => {
    // Driving straight out at the off-road cap, the pull and the outward speed balance here.
    const over = settleOver(OFF_ROAD_SPEED);
    expect(over).toBeGreaterThan(1);     // you can still put a wheel out and feel it
    expect(over).toBeLessThan(6);        // but not drive to the horizon
    // and the simulation agrees with the formula
    let lat = LIMIT;
    for (let k = 0; k < 600; k++) { lat += OFF_ROAD_SPEED / 60; lat -= edgeReturn(lat, LIMIT, 1 / 60); }
    expect(lat - LIMIT).toBeCloseTo(over, 0);
  });

  it('is inert on a stopped clock or a rate of zero', () => {
    expect(edgeReturn(76, LIMIT, 0)).toBe(0);
    expect(settleOver(OFF_ROAD_SPEED, 0)).toBe(Infinity);
    expect(RETURN_RATE).toBeGreaterThan(0);
  });
});
