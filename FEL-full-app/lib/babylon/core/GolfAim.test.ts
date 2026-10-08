import { describe, it, expect } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { WII_CLUBS, WII_PUTTER, turnAim, launchVelocity, simulateShot, meterTicks, carryAt, AIM_LIMIT_RAD, MeterTickJob, simulatePutt, puttTicks, puttLaunch, flyAhead } from './GolfAim';
import { GolfBallSim, resolvePutt, greenBreakSlope } from './GolfBall';

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

// IMPROVE (2026-10-06, Golf #3 / #5 / #14): the putt rolls its pace, the preview is that putt, the meter lines are built a
// flight at a time.
describe('GolfAim — the putt and the meter lines', () => {
  const GREEN = () => 'green' as const;
  it('a putt ROLLS the pace resolvePutt sets, dry or soaked (it was pace / 1.15: a 2 m putt rolled 0.8 m at full power)', () => {
    for (const wet01 of [0, 1]) for (const d of [1.5, 3, 6, 9]) for (const p of [0, 0.42, 1]) {
      const s = simulatePutt(p, 0, TEE, { x: 0, z: d }, { wind: { x: 0, z: 0 }, wet01, density: 1 }, GREEN, 14, false);
      const pace = resolvePutt({ power01: p, face01: 1 }, d, 0).paceM;
      expect(Math.abs(s.totalM - pace), `wet ${wet01} d ${d} p ${p}`).toBeLessThan(0.05 * pace + 0.05);
    }
  });
  it('a short putt reaches the cup and drops; a putt off the line does not', () => {
    expect(simulatePutt(1, 0, TEE, { x: 0, z: 2 }, undefined, GREEN).rest).toEqual({ x: 0, z: 2 });   // tryHole sinks it AT the cup
    const wide = simulatePutt(0.5, 0.3, TEE, { x: 0, z: 4 }, undefined, GREEN);
    expect(Math.hypot(wide.rest.x, wide.rest.z - 4)).toBeGreaterThan(0.5);
  });
  it('the preview is the putt: the same launch the mode strikes, flown on the same sim, breaks the same way', () => {
    const from = { x: 3, y: 0.05, z: 0 }, cup = { x: 0, z: 5 };
    const dist = Math.hypot(from.x - cup.x, from.z - cup.z);
    const { vel } = puttLaunch(0.42, 1, 0, dist, greenBreakSlope(from.x, cup.x));
    const struck = flyAhead(vel, new Vector3(), from, undefined, GREEN, 14, cup);
    expect(simulatePutt(0.42, 0, from, cup, undefined, GREEN)).toEqual(struck);
    expect(struck.rest.x).toBeGreaterThan(from.x);   // the ball sits right of the hole: the break pushes the line right
  });
  it('the meter lines build one flight a step and equal the eleven-in-a-frame result', () => {
    const job = new MeterTickJob((p) => simulateShot(IRON, p, 0.2, TEE).carryM);
    let steps = 0; while (!job.step(1)) steps++;
    expect(steps + 1).toBe(11); expect(job.done).toBe(true);
    expect(job.ticks).toEqual(meterTicks(IRON, 0.2, TEE));
    expect(job.step(1)).toBe(true); expect(job.ticks).toHaveLength(11);   // done is done
  });
  it('a putt\'s lines read the roll, rising with power, cup or no cup', () => {
    const t = puttTicks(0, TEE, { x: 0, z: 4 }, undefined, GREEN);
    expect(t).toHaveLength(11);
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThanOrEqual(t[i - 1]);
    expect(t[10]).toBeGreaterThan(4);   // full power runs past the cup it is not told about
  });
});

