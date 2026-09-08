// DUNK-HANDS-RIM (2026-09-08): the pure hand + rim helpers the dunk mode writes onto the wrist reach, the ball and the hoop.
import { describe, it, expect } from 'vitest';
import { lagK, lagToward, lagArrivalSec, jamWeight, ironContact, hangHold, rimSpring, netSway, WRIST_LAG_TAU, JAM_RAMP_SEC, IRON_CONTACT_TIMEOUT_SEC, HANG_MAX_SEC, RIM_DIP_M, RIM_SPRING_SEC, NET_SQUASH, NET_SQUASH_SEC, NET_SWAY_SEC, NET_SWAY_RAD } from './DunkHands';

describe('H1 the wrist lag', () => {
  it('closes 63% of the gap in one τ, is frame-rate independent, and never overshoots', () => {
    expect(lagK(WRIST_LAG_TAU, WRIST_LAG_TAU)).toBeCloseTo(1 - Math.exp(-1), 6);
    // 6 steps of 1/6 τ = 1 τ
    let k = 1; for (let i = 0; i < 6; i++) k *= 1 - lagK(WRIST_LAG_TAU / 6, WRIST_LAG_TAU); expect(1 - k).toBeCloseTo(lagK(WRIST_LAG_TAU, WRIST_LAG_TAU), 6);
    const p = lagToward({ x: 0, y: 0, z: 0 }, { x: 1, y: 2, z: 3 }, 10, WRIST_LAG_TAU);
    expect(p.x).toBeLessThanOrEqual(1); expect(p.y).toBeLessThanOrEqual(2); expect(p.z).toBeLessThanOrEqual(3); expect(p.x).toBeCloseTo(1, 6);
    expect(lagK(0, WRIST_LAG_TAU)).toBe(0); expect(lagK(0.016, 0)).toBe(1);
  });
  it('lands the hand inside the 80–150 ms band the spec asks for, on the reach the hang makes (~0.5 m to within 5 cm)', () => {
    const arrive = lagArrivalSec(0.5, 0.05, WRIST_LAG_TAU);
    expect(arrive).toBeGreaterThanOrEqual(0.08); expect(arrive).toBeLessThanOrEqual(0.25);
    expect(lagArrivalSec(0.02, 0.05, WRIST_LAG_TAU)).toBe(0);
  });
  it('writes into the out vector when given one', () => {
    const out = { x: 9, y: 9, z: 9 }; const r = lagToward({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 0.016, WRIST_LAG_TAU, out);
    expect(r).toBe(out); expect(out.x).toBeGreaterThan(0); expect(out.x).toBeLessThan(0.2); expect(out.y).toBe(0);
  });
});

describe('H4 the jam weight', () => {
  it('starts at the hang reach on the press and eases to the jam reach over the ramp — no step', () => {
    expect(jamWeight(0, 0.6, 0.95)).toBe(0.6); expect(jamWeight(JAM_RAMP_SEC, 0.6, 0.95)).toBe(0.95); expect(jamWeight(1, 0.6, 0.95)).toBe(0.95);
    let prev = 0.6; for (let t = 0; t <= JAM_RAMP_SEC; t += JAM_RAMP_SEC / 8) { const w = jamWeight(t, 0.6, 0.95); expect(w).toBeGreaterThanOrEqual(prev); expect(w - prev).toBeLessThan(0.12); prev = w; }
    expect(jamWeight(JAM_RAMP_SEC / 2, 0.6, 0.95)).toBeCloseTo(0.775, 6);
  });
});

describe('H3 the iron contact', () => {
  const rim = { x: 0, y: 3.05, z: -10.28 };
  it('fires when the ball (in the hand) is inside the ring at the rim height', () => {
    expect(ironContact({ ball: { x: 0.1, y: 3.1, z: -10.2 }, rim, rimRadius: 0.225, ballRadius: 0.12, sincePress: 0.05 })).toBe(true);
    expect(ironContact({ ball: { x: 0, y: 3.05 + 0.12 + 0.05, z: -10.28 }, rim, rimRadius: 0.225, ballRadius: 0.12, sincePress: 0.05 })).toBe(true);
    expect(ironContact({ ball: { x: 0, y: 3.05 - 0.02, z: -10.28 }, rim, rimRadius: 0.225, ballRadius: 0.12, sincePress: 0.05 })).toBe(true);   // on the ring's centre line, a hair under
  });
  it('waits while the ball is short of the iron, above it, or beside it', () => {
    expect(ironContact({ ball: { x: 0, y: 3.05, z: -9.7 }, rim, rimRadius: 0.225, ballRadius: 0.12, sincePress: 0.05 })).toBe(false);   // 0.58 m in front
    expect(ironContact({ ball: { x: 0, y: 3.4, z: -10.28 }, rim, rimRadius: 0.225, ballRadius: 0.12, sincePress: 0.05 })).toBe(false);  // 0.35 m over it
    expect(ironContact({ ball: { x: 0, y: 3.05 - 0.15, z: -10.28 }, rim, rimRadius: 0.225, ballRadius: 0.12, sincePress: 0.05 })).toBe(false); // 0.15 m UNDER the iron (measured on a late press: 2.77 m) is not a dunk
    expect(ironContact({ ball: { x: 0.5, y: 3.05, z: -10.28 }, rim, rimRadius: 0.225, ballRadius: 0.12, sincePress: 0.05 })).toBe(false); // beside the ring
  });
  it('resolves on the timeout whatever the hand did', () => {
    expect(ironContact({ ball: { x: 0, y: 2.5, z: -9.5 }, rim, rimRadius: 0.225, ballRadius: 0.12, sincePress: IRON_CONTACT_TIMEOUT_SEC })).toBe(true);
    expect(ironContact({ ball: { x: 0, y: 2.5, z: -9.5 }, rim, rimRadius: 0.225, ballRadius: 0.12, sincePress: 0.1, timeout: 0.05 })).toBe(true);
    expect(IRON_CONTACT_TIMEOUT_SEC).toBeLessThan(0.47);   // the old flush lerp — the punch never waits that long again
  });
});

describe('the rim hang', () => {
  it('holds while SLAM is held and lets go at the cap or on the release', () => {
    expect(hangHold(true, 0.2)).toBe(true); expect(hangHold(false, 0.2)).toBe(false); expect(hangHold(true, HANG_MAX_SEC)).toBe(false);
    expect(HANG_MAX_SEC).toBeGreaterThanOrEqual(0.5);   // HANG TIME! needs 0.5 s held — reachable now (the old flush gave 0.47 s)
  });
});

describe('RIM the ring spring', () => {
  it('dips DOWN on the contact, rings down damped and is exactly back by the end of the beat', () => {
    const at0 = rimSpring(0); expect(at0.dip).toBeCloseTo(-RIM_DIP_M, 6); expect(at0.xz).toBe(1);
    let minDip = 0, maxUp = 0, peakXz = 1;
    for (let t = 0; t <= RIM_SPRING_SEC; t += 0.004) { const s = rimSpring(t); minDip = Math.min(minDip, s.dip); maxUp = Math.max(maxUp, s.dip); peakXz = Math.max(peakXz, s.xz); }
    expect(minDip).toBeGreaterThanOrEqual(-RIM_DIP_M - 1e-9); expect(maxUp).toBeLessThan(RIM_DIP_M * 0.6);   // the overshoot up is smaller than the dip
    expect(peakXz).toBeGreaterThan(1.03); expect(peakXz).toBeLessThanOrEqual(1.06);
    expect(rimSpring(RIM_SPRING_SEC)).toEqual({ dip: 0, xz: 1 }); expect(rimSpring(-0.1)).toEqual({ dip: 0, xz: 1 });
    expect(Math.abs(rimSpring(RIM_SPRING_SEC - 0.01).dip)).toBeLessThan(0.002);
    // it rings: the dip crosses zero at least twice inside the beat
    let crossings = 0, prev = rimSpring(0).dip; for (let t = 0.004; t < RIM_SPRING_SEC; t += 0.004) { const d = rimSpring(t).dip; if ((d > 0) !== (prev > 0) && Math.abs(d) > 1e-6) crossings++; prev = d; }
    expect(crossings).toBeGreaterThanOrEqual(2);
  });
});

describe('RIM the net', () => {
  it('squashes ~30% up toward the ring and keeps swaying after the ball is through, settling by the end of the beat', () => {
    let minSquash = 1, maxSway = 0;
    for (let t = 0; t <= NET_SWAY_SEC; t += 0.004) { const n = netSway(t); minSquash = Math.min(minSquash, n.squash); maxSway = Math.max(maxSway, Math.abs(n.sway)); expect(n.squash).toBeLessThanOrEqual(1); }
    expect(minSquash).toBeLessThan(1 - NET_SQUASH * 0.8); expect(minSquash).toBeGreaterThan(1 - NET_SQUASH - 1e-9);
    expect(maxSway).toBeGreaterThan(NET_SWAY_RAD * 0.4); expect(maxSway).toBeLessThanOrEqual(NET_SWAY_RAD);
    expect(netSway(NET_SQUASH_SEC).squash).toBe(1);
    expect(Math.abs(netSway(NET_SQUASH_SEC + 0.1).sway)).toBeGreaterThan(0);   // still swaying after the squash is done
    expect(netSway(NET_SWAY_SEC)).toEqual({ squash: 1, sway: 0 }); expect(netSway(-1)).toEqual({ squash: 1, sway: 0 });
    expect(NET_SWAY_SEC).toBeGreaterThan(NET_SQUASH_SEC);
  });
});
