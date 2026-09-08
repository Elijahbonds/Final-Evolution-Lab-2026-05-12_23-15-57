import { describe, expect, it } from 'vitest';
import { wrapYaw, yawTo, yawOfVel, slewYaw, easeYaw, playFacing, driveDunkY, driveDunkWindow, DRIVE_DUNK } from './Biomech';

const near = (a: number, b: number, eps = 1e-6) => Math.abs(wrapYaw(a - b)) < eps;

describe('Biomech facing helpers', () => {
  it('yawTo faces +z at yaw 0 and −z at π (the rig convention)', () => {
    expect(near(yawTo({ x: 0, z: 0 }, { x: 0, z: 5 }), 0)).toBe(true);
    expect(near(yawTo({ x: 0, z: 5 }, { x: 0, z: -1 }), Math.PI)).toBe(true);
    expect(near(yawTo({ x: 0, z: 0 }, { x: 3, z: 0 }), Math.PI / 2)).toBe(true);
  });
  it('a still body has no travel yaw', () => {
    expect(yawOfVel({ x: 0.05, z: 0.05 })).toBeNull();
    expect(yawOfVel({ x: 0, z: -3 })).toBeCloseTo(Math.PI, 6);
  });
  it('slewYaw turns the short way round at the rate, never past the target', () => {
    // from 170° to −170°: the short way is +20°, through π
    const from = 170 * Math.PI / 180, to = -170 * Math.PI / 180;
    const step = slewYaw(from, to, 1, 0.1);   // 0.1 rad max
    expect(wrapYaw(step - from)).toBeGreaterThan(0);
    expect(Math.abs(wrapYaw(step - from))).toBeCloseTo(0.1, 6);
    expect(near(slewYaw(from, to, 10, 1), to)).toBe(true);   // a big step lands exactly
    expect(near(slewYaw(to, to, 10, 0.016), to)).toBe(true);
  });
  it('easeYaw is a fraction of the short arc and wraps', () => {
    expect(near(easeYaw(0, Math.PI / 2, 0.5), Math.PI / 4)).toBe(true);
    expect(near(easeYaw(0, Math.PI / 2, 2), Math.PI / 2)).toBe(true);
    expect(Math.abs(easeYaw(3.1, -3.1, 0.5))).toBeLessThanOrEqual(Math.PI);
  });
  it('playFacing: the objective inside range wins, the travel otherwise, the heading when still', () => {
    const me = { x: 0, z: 5 }, rim = { x: 0, z: -0.6 };
    // a defender 2 m from the handler sliding sideways keeps his chest on the handler
    expect(near(playFacing(me, { x: 3, z: 0 }, { x: 0, z: 3 }, 4.5, 0), Math.PI)).toBe(true);
    // a cutter running to a spot 8 m away faces where he runs
    expect(near(playFacing(me, { x: 3, z: 0 }, { x: 0, z: -3 }, 4.5, 0), Math.PI / 2)).toBe(true);
    // still and far from anything: keeps the heading
    expect(near(playFacing(me, { x: 0, z: 0 }, rim, 3, 1.2), 1.2)).toBe(true);
    // still but inside range: on the objective
    expect(near(playFacing(me, { x: 0, z: 0 }, rim, 9, 1.2), Math.PI)).toBe(true);
  });
});

describe('the drive dunk flight clock', () => {
  it('rises to the apex at k 0.5 and is on the floor at both ends', () => {
    expect(driveDunkY(0)).toBeCloseTo(0, 6);
    expect(driveDunkY(0.5)).toBeCloseTo(DRIVE_DUNK.apex, 6);
    expect(driveDunkY(1)).toBeCloseTo(0, 6);
  });
  it('the slam resolves just past the apex, not on the feet-down frame', () => {
    expect(DRIVE_DUNK.resolveK).toBeGreaterThan(0.5);
    expect(DRIVE_DUNK.resolveK).toBeLessThan(0.7);
    expect(driveDunkY(DRIVE_DUNK.resolveK)).toBeGreaterThan(1.0);
  });
  it('windows: rise → hang → extend → jam / brace, extend until the verdict', () => {
    expect(driveDunkWindow(0.05, null)).toBe('rise');
    expect(driveDunkWindow(0.3, null)).toBe('hang');
    expect(driveDunkWindow(0.5, null)).toBe('extend');
    expect(driveDunkWindow(0.7, null)).toBe('extend');
    expect(driveDunkWindow(0.7, true)).toBe('jam');
    expect(driveDunkWindow(0.7, false)).toBe('brace');
    expect(driveDunkWindow(1, true)).toBe('jam');
  });
});
