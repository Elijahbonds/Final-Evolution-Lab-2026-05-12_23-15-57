import { describe, it, expect } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { WII_CLUBS, WII_PUTTER, turnAim, launchVelocity, simulateShot, meterTicks, carryAt, AIM_LIMIT_RAD } from './GolfAim';
import { GolfBallSim } from './GolfBall';

const TEE = { x: 0, y: 0.05, z: 0 };
const [DRIVER, IRON, WEDGE] = WII_CLUBS;

describe('GolfAim — the Wii Sports read', () => {
  it('the clubs are scaled to this course: a driver reaches the far pin (~39 m), a wedge does not, the order holds', () => {
    const d = simulateShot(DRIVER, 1, 0, TEE), i = simulateShot(IRON, 1, 0, TEE), w = simulateShot(WEDGE, 1, 0, TEE);
    expect(d.carryM).toBeGreaterThan(40); expect(d.carryM).toBeLessThan(70);
    expect(i.carryM).toBeGreaterThan(24); expect(i.carryM).toBeLessThan(d.carryM);
    expect(w.carryM).toBeGreaterThan(10); expect(w.carryM).toBeLessThan(i.carryM);
    expect(w.hangSec).toBeGreaterThan(i.hangSec * 0.9);   // the wedge goes UP
    expect(d.totalM).toBeGreaterThan(d.carryM);           // and a drive rolls out
  });
  it('a putt rolls; it does not fly', () => {
    const p = simulateShot(WII_PUTTER, 1, 0, TEE, undefined, () => 'green');
    expect(p.hangSec).toBeLessThan(0.3); expect(p.totalM).toBeGreaterThan(5); expect(p.totalM).toBeLessThan(20);
  });
  it('the shot follows the arrow', () => {
    const yaw = 0.5, s = simulateShot(IRON, 1, yaw, TEE);
    expect(Math.atan2(s.carry.x, s.carry.z)).toBeCloseTo(yaw, 1);
  });
  it('wind is physics, not a push: a tailwind carries further than a headwind, a crosswind bends the flight', () => {
    const tail = simulateShot(DRIVER, 1, 0, TEE, { wind: { x: 0, z: 4 }, wet01: 0, density: 1 });
    const head = simulateShot(DRIVER, 1, 0, TEE, { wind: { x: 0, z: -4 }, wet01: 0, density: 1 });
    const cross = simulateShot(DRIVER, 1, 0, TEE, { wind: { x: 4, z: 0 }, wet01: 0, density: 1 });
    expect(tail.carryM).toBeGreaterThan(head.carryM + 3);
    expect(cross.carry.x).toBeGreaterThan(1.5);
  });
  it('wet turf checks the ball up: less roll-out and a softer bounce', () => {
    const dry = simulateShot(DRIVER, 1, 0, TEE), wet = simulateShot(DRIVER, 1, 0, TEE, { wind: { x: 0, z: 0 }, wet01: 1, density: 1.06 });
    expect(wet.totalM - wet.carryM).toBeLessThan(dry.totalM - dry.carryM);
    expect(wet.carryM).toBeLessThanOrEqual(dry.carryM + 0.5);
  });
  it('a slice curves right of the line and a hook left — the same shot otherwise', () => {
    const fly = (sign: -1 | 1) => { const m = { position: new Vector3(0, 0.05, 0) }; const s = new GolfBallSim(m); const { vel, spin } = launchVelocity(IRON, 1, 0, 0.8, sign); s.launch(new Vector3(0, 0.05, 0), vel, spin); let t = 0; while (s.ball.active && t < 12) { s.step(1 / 120, () => 'fairway'); t += 1 / 120; } return s.ball.pos.x; };
    expect(fly(1)).toBeGreaterThan(0.8); expect(fly(-1)).toBeLessThan(-0.8);
  });
  it('the meter ticks rise with power and carryAt reads between them', () => {
    const ticks = meterTicks(DRIVER, 0, TEE);
    expect(ticks).toHaveLength(11);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]).toBeGreaterThanOrEqual(ticks[i - 1]);
    expect(carryAt(ticks, 0.5)).toBe(ticks[5]); expect(carryAt(ticks, 0.55)).toBeGreaterThan(ticks[5]); expect(carryAt(ticks, 1)).toBe(ticks[10]);
  });
  it('the stick turns the arrow at a rate, inside the limit either side of the pin line, across the wrap', () => {
    let yaw = 0;
    for (let i = 0; i < 30; i++) yaw = turnAim(yaw, 0, 1, 1 / 60);
    expect(yaw).toBeCloseTo(0.55, 1);
    for (let i = 0; i < 600; i++) yaw = turnAim(yaw, 0, 1, 1 / 60);
    expect(yaw).toBeCloseTo(AIM_LIMIT_RAD, 5);
    expect(turnAim(0, 0, 0.05, 1)).toBe(0);   // dead zone
    const y2 = turnAim(Math.PI - 0.1, Math.PI, 1, 1); expect(Math.abs(y2)).toBeLessThanOrEqual(Math.PI);   // wraps, never explodes
  });
  it('the ball drops when it reaches the cup slowly, and rolls past it when it is hot', () => {
    const roll = (speed: number) => { const m = { position: new Vector3(0, 0.05, 0) }; const s = new GolfBallSim(m); s.launch(new Vector3(0, 0.043, 0), new Vector3(0, 0, speed), Vector3.Zero()); s.ball.rolling = true; let holed = false, t = 0; while (s.ball.active && t < 10) { s.step(1 / 120, () => 'green'); if (s.tryHole(0, 3)) { holed = true; break; } t += 1 / 120; } return holed; };
    expect(roll(3.2)).toBe(true);
    expect(roll(9)).toBe(false);
  });
});
