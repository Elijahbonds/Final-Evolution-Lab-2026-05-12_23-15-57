// hoops-defense-fx: the on-ball man shades the ball side, and a cross thrown at him buys a beat (core/BallSideShade), wired into
// DefenderBrain's on-ball anchor. Positioning only: the poke's roll and its gate are the brain's, unchanged.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Vector3 } from '@babylonjs/core';
import { BallSideShade, SHADE, lateralOf, rimFrame } from './BallSideShade';
import { DefenderBrain } from './BasketballCore';

const HOOP = { x: 0, z: -0.6 };
const H = { x: 0, z: 6 };                       // the handler at the top of the key, the rim straight down -z
const p = rimFrame(H, HOOP).p;                   // the lateral axis (+ = one side, - = the other)
const ballAt = (lat: number) => ({ x: H.x + p.x * lat, z: H.z + p.z * lat - 0.2 });
const DEF_CLOSE = { x: 0, z: 4.6 };              // 1.4 m off him: inside the beat's range
const DEF_FAR = { x: 0, z: 2.5 };                // 3.5 m off: out of it
const DT = 1 / 60;

function run(s: BallSideShade, sec: number, lat: number, def = DEF_CLOSE): number[] {
  const out: number[] = [];
  for (let t = 0; t < sec - 1e-9; t += DT) out.push(s.step(DT, H, ballAt(lat), HOOP, def));
  return out;
}

describe('BallSideShade: where he stands', () => {
  it('a fresh look puts him on the ball\'s side at once, offsetM across the line (no beat on a check)', () => {
    const s = new BallSideShade();
    expect(s.step(DT, H, ballAt(0.25), HOOP, DEF_CLOSE)).toBeCloseTo(SHADE.offsetM, 6);
    const t = new BallSideShade();
    expect(t.step(DT, H, ballAt(-0.25), HOOP, DEF_CLOSE)).toBeCloseTo(-SHADE.offsetM, 6);
  });
  it('the dribble\'s own sway inside flipM never moves him', () => {
    const s = new BallSideShade();
    run(s, 0.5, 0.25);
    const lats = run(s, 1, SHADE.flipM * 0.9);
    expect(lats.every((l) => Math.abs(l - SHADE.offsetM) < 1e-9)).toBe(true);
    const back = run(s, 1, -SHADE.flipM * 0.9);
    expect(back.every((l) => Math.abs(l - SHADE.offsetM) < 1e-9)).toBe(true);
  });
  it('the lateral is measured across the handler→rim line', () => {
    expect(lateralOf(ballAt(0.3), H, HOOP)).toBeCloseTo(0.3, 6);
    expect(lateralOf({ x: H.x, z: 2 }, H, HOOP)).toBeCloseTo(0, 6);
  });
});

describe('BallSideShade: the cross buys a beat', () => {
  it('thrown at him, he holds his side for reactSec, then slides across at shiftMps', () => {
    const s = new BallSideShade();
    run(s, 0.5, 0.25);
    const lats = run(s, 1.2, -0.25);
    const held = Math.round(SHADE.reactSec / DT);
    // the beat: every frame of it he is still on the old side, all the way over
    expect(lats.slice(0, held - 1).every((l) => Math.abs(l - SHADE.offsetM) < 1e-9)).toBe(true);
    // then he goes, at shiftMps
    const firstMove = lats.findIndex((l) => l < SHADE.offsetM - 1e-9);
    expect(firstMove * DT).toBeGreaterThanOrEqual(SHADE.reactSec - 2 * DT);
    expect(firstMove * DT).toBeLessThanOrEqual(SHADE.reactSec + 2 * DT);
    const arrive = lats.findIndex((l) => Math.abs(l + SHADE.offsetM) < 1e-9);
    const expectSec = SHADE.reactSec + (2 * SHADE.offsetM) / SHADE.shiftMps;
    expect(arrive * DT).toBeGreaterThan(expectSec - 3 * DT);
    expect(arrive * DT).toBeLessThan(expectSec + 3 * DT);
    // the lane: the anchor stays on the OLD side of the line for the beat and half the slide
    const wrongSide = lats.filter((l) => l > 0).length * DT;
    expect(wrongSide).toBeGreaterThan(SHADE.reactSec + SHADE.offsetM / SHADE.shiftMps - 3 * DT);
  });
  it('a cross from out of range buys nothing: he goes at once', () => {
    const s = new BallSideShade();
    run(s, 0.5, 0.25, DEF_FAR);
    const lats = run(s, 0.1, -0.25, DEF_FAR);
    expect(lats[0]).toBeLessThan(SHADE.offsetM);
  });
  it('a ball that comes back before he went leaves him where he was (no re-shift, no beat owed)', () => {
    const s = new BallSideShade();
    run(s, 0.5, 0.25);
    run(s, SHADE.reactSec * 0.5, -0.25);
    expect(s.holding).toBe(true);                // he has read the cross and is holding
    run(s, DT, 0.25);
    expect(s.holding).toBe(false);               // the ball is back on his side: no read is owed, at once
    const back = run(s, 0.6, 0.25);
    expect(back.every((l) => Math.abs(l - SHADE.offsetM) < 1e-9)).toBe(true);
    expect(s.holding).toBe(false);
  });
  it('a handler who jumped (a check, a switch) is a fresh look: no beat', () => {
    const s = new BallSideShade();
    run(s, 0.5, 0.25);
    const moved = { x: H.x + 2, z: H.z };
    const lat = s.step(DT, moved, { x: moved.x - p.x * 0.25, z: moved.z - p.z * 0.25 }, HOOP, DEF_CLOSE);
    expect(Math.sign(lat)).toBe(Math.sign(lateralOf({ x: moved.x - p.x * 0.25, z: moved.z - p.z * 0.25 }, moved, HOOP)));
    expect(Math.abs(lat)).toBeCloseTo(SHADE.offsetM, 6);
  });
  it('anchor(): the ball\'s distance along the line is kept, the side is his read, the height is the ball\'s', () => {
    const s = new BallSideShade();
    const b = new Vector3(ballAt(0.25).x, 1.1, ballAt(0.25).z);
    const a = s.anchor(DT, H, b, HOOP, DEF_CLOSE);
    expect(a.y).toBe(1.1);
    expect(lateralOf(a, H, HOOP)).toBeCloseTo(SHADE.offsetM, 6);
    const { u } = rimFrame(H, HOOP);
    expect((a.x - H.x) * u.x + (a.z - H.z) * u.z).toBeCloseTo((b.x - H.x) * u.x + (b.z - H.z) * u.z, 6);
    expect(a).not.toBe(b);   // the ball itself is never written
  });
});

describe('DefenderBrain: the on-ball anchor is the shade (and nothing else moved)', () => {
  const hoop = new Vector3(0, 3.05, -0.6);
  // wish direction's lateral component (the Intent's moveX / moveY are world x / -z)
  const wishLat = (i: { moveX: number; moveY: number }) => i.moveX * p.x + -i.moveY * p.z;
  function settle(brain: DefenderBrain, self: Vector3, handler: Vector3, ballLat: number, sec: number) {
    let last = { moveX: 0, moveY: 0, steal: false };
    for (let t = 0; t < sec; t += DT) {
      const b = new Vector3(handler.x + p.x * ballLat, 1, handler.z + p.z * ballLat - 0.2);
      last = brain.decide(DT, self, b, hoop, [], [handler]) as typeof last;
    }
    return last;
  }
  it('a defender square in front of a jogging handler steers to the ball side; after a cross he holds, then goes', () => {
    const brain = new DefenderBrain(0.6, null, () => 0.99);
    const self = new Vector3(0, 0, 3.4);
    const handler = new Vector3(0, 0, 6);
    // a moving handler (the press never arms): walk him toward the rim slowly
    let hz = 6.6;
    const walk = (lat: number, sec: number) => { let last; for (let t = 0; t < sec; t += DT) { hz -= 0.6 * DT; handler.z = hz; last = settle(brain, self, handler, lat, DT); } return last!; };
    const before = walk(0.25, 0.4);
    expect(Math.sign(wishLat(before))).toBe(1);                  // toward the ball's side (+)
    const during = walk(-0.25, SHADE.reactSec * 0.6);            // the ball crossed: inside the beat he still wants the old side
    expect(Math.sign(wishLat(during))).toBe(1);
    const after = walk(-0.25, 0.8);                              // after the beat and the slide: the new side
    expect(Math.sign(wishLat(after))).toBe(-1);
  });
  it('the poke is still the brain\'s own roll, unchanged: never with the dice at 0.99, inside its gate with the dice at 0', () => {
    const never = new DefenderBrain(0.6, null, () => 0.99);
    const handler = new Vector3(0, 0, 6);
    let pokes = 0;
    for (let t = 0; t < 2; t += DT) if (never.decide(DT, new Vector3(0.3, 0, 5.2), new Vector3(0.25, 1, 5.8), hoop, [], [handler]).steal) pokes++;
    expect(pokes).toBe(0);
    const always = new DefenderBrain(0.6, null, () => 0);
    let p2 = 0;
    for (let t = 0; t < 2; t += DT) if (always.decide(DT, new Vector3(0.3, 0, 5.2), new Vector3(0.25, 1, 5.8), hoop, [], [handler]).steal) p2++;
    expect(p2).toBeGreaterThan(0);
  });
  it('off the ball nothing changed: a marking defender still anchors on his man', () => {
    const brain = new DefenderBrain(0.6, 0, () => 0.99);
    const man = new Vector3(4, 0, 4);
    const ballFar = new Vector3(-4, 1, 6);
    const i = brain.decide(DT, new Vector3(4, 0, 0), ballFar, hoop, [], [man]);
    expect(brain.job).toBe('deny');
    expect(Math.hypot(i.moveX, i.moveY)).toBeGreaterThan(0);
  });
});

describe('the wiring: one anchor line in DefenderBrain, and a module that reaches nothing', () => {
  const core = fs.readFileSync(path.join(__dirname, 'BasketballCore.ts'), 'utf8');
  const shade = fs.readFileSync(path.join(__dirname, 'BallSideShade.ts'), 'utf8');
  it('DefenderBrain: the shade is its on-ball anchor and nothing else (the import, the field, the anchor line)', () => {
    expect(core.split('\n').filter((l) => /BallSideShade|this\.shade/.test(l))).toHaveLength(4);   // the import, the field's doc line, the field, the anchor
    expect(core).toMatch(/const anchor = onBall \? \(handlerPos \? this\.shade\.anchor\(dt, handlerPos, ball, hoop, self\) : ball\) : mark!;/);
  });
  it('BallSideShade imports nothing at all (pure), and its code names no odds, speed or window', () => {
    expect([...shade.matchAll(/^import[^;]*from '([^']+)'/gm)]).toHaveLength(0);
    const code = shade.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');   // the code, not its comments
    expect(code).not.toMatch(/steal|strip|odds|aggression|speed|window|difficulty/i);
  });
});
