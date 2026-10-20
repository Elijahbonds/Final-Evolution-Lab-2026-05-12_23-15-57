// hoops-dip movement pass (owner 2026-10-20): the drawn facing never snaps — a 55° one-frame cut is spread over TURN_SMOOTH_SEC, an ordinary
// slewed turn is followed exactly (no lag), a placed body (a reset) takes its facing at once, a pause turns nothing.
import { describe, expect, it } from 'vitest';
import { stepDrawnFacing, drawnFacingIdle, drawnYaw, TURN_SMOOTH_SEC, SNAP_MIN_RAD, TELEPORT_M } from './DrawnFacing';

const DT = 1 / 60, DEG = Math.PI / 180;
const seeded = (yaw: number) => { const s = drawnFacingIdle(); stepDrawnFacing(s, yaw, 0, 0, DT); return s; };

describe('the drawn facing', () => {
  it('the momentum cross\'s −55° one-frame cut: spread over TURN_SMOOTH_SEC at a constant rate, no frame over a sixth of it, then exact', () => {
    const s = seeded(0); const target = -55 * DEG; const yaws: number[] = [];
    for (let i = 0; i < 20; i++) yaws.push(stepDrawnFacing(s, target, 0, 0, DT).yaw);
    const steps = yaws.map((y, i) => Math.abs(y - (i ? yaws[i - 1] : 0)) / DEG);
    expect(Math.max(...steps)).toBeLessThanOrEqual(55 * DT / TURN_SMOOTH_SEC + 1e-6);   // 7.6° a frame at 60 fps
    const done = yaws.findIndex((y) => Math.abs(y - target) < 1e-9);
    expect((done + 1) * DT).toBeCloseTo(TURN_SMOOTH_SEC, 1);
    expect(yaws.at(-1)).toBeCloseTo(target, 9);
  });
  it('an ordinary turn the movement slews (a few degrees a frame) is followed exactly, frame for frame', () => {
    const s = seeded(0);
    for (let i = 1; i <= 30; i++) { const t = i * 5 * DEG; expect(stepDrawnFacing(s, t, 0, 0, DT).yaw).toBeCloseTo(t, 9); }
    expect(5 * DEG).toBeLessThan(SNAP_MIN_RAD);
  });
  it('the reversal\'s −129° flip goes the short way and lands; a second jump mid-slew still ends TURN_SMOOTH_SEC after it', () => {
    const s = seeded(170 * DEG);
    stepDrawnFacing(s, -150 * DEG, 0, 0, DT);   // +40° the short way across ±180
    expect(s.yaw > 170 * DEG || s.yaw < -170 * DEG).toBe(true);
    for (let i = 0; i < 4; i++) stepDrawnFacing(s, -150 * DEG, 0, 0, DT);
    const t2 = -60 * DEG; let n = 0; while (Math.abs(s.yaw - t2) > 1e-9 && n < 60) { stepDrawnFacing(s, t2, 0, 0, DT); n++; }
    expect(n * DT).toBeLessThanOrEqual(TURN_SMOOTH_SEC + DT);
  });
  it('a placed body (moved over TELEPORT_M in a frame) takes its facing at once; a frame with no time turns nothing', () => {
    const s = seeded(0);
    expect(stepDrawnFacing(s, 2, TELEPORT_M + 0.1, 0, DT).yaw).toBe(2);
    expect(stepDrawnFacing(s, -1, TELEPORT_M + 0.1, 0, 0).yaw).toBe(2);
  });
  it('the hook goes on from the yaw the root is DRAWN at: a turn written by other code (a spin\'s exit) is not pulled back', () => {
    const root = { position: { x: 0, z: 0 }, rotation: { y: 0 } };
    root.rotation.y = drawnYaw(root, 0, DT);
    root.rotation.y = 1.2;                                   // the spin's exit writes the root
    root.rotation.y = drawnYaw(root, 1.2, DT);               // …and the movement's facing agrees: nothing moves
    expect(root.rotation.y).toBeCloseTo(1.2, 9);
    root.rotation.y = drawnYaw(root, 1.2 - 55 * DEG, DT);   // a cut from there slews from there
    expect(root.rotation.y).toBeLessThan(1.2); expect(root.rotation.y).toBeGreaterThan(1.2 - 55 * DEG);
  });
});
