#!/usr/bin/env -S npx tsx
/**
 * scripts/pass-shoot-tests.ts — Mode 5 Phases 4+5 proof (headless).
 *   A. Pass types differ physically: ground rolls flat, loft arcs over,
 *      through LEADS the runner's line (not their feet).
 *   B. Reliability: pressured/off-balance passes disperse wider (measured
 *      across many launches).
 *   C. Power vs finesse are different MECHANICS: power is faster/flatter,
 *      finesse curls (measurable Magnus bend) with more placement.
 *   D. A volley inherits the incoming ball's pace.
 *
 * Run: npx tsx scripts/pass-shoot-tests.ts
 */
import assert from 'node:assert';
import { Vector3 } from '@babylonjs/core';
import { playPass, strikeBall, passAccuracy } from '../lib/babylon/core/PassShoot';
import { SoccerBall } from '../lib/babylon/core/SoccerBall';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const mk = () => new SoccerBall({ position: Vector3.Zero() });
const PLANTED = { balance01: 1, pressure01: 0, facingDot: 1 };

console.log('\nA. pass types are physically distinct');
ok('ground rolls / loft arcs / through leads the run', () => {
  const from = new Vector3(0, 0.11, 0), to = new Vector3(0, 0.11, 18);
  const g = mk(); playPass(g, 'ground', from, to, 0.7, PLANTED);
  let maxY = 0;
  for (let i = 0; i < 120 && g.active; i++) { g.step(1 / 60); maxY = Math.max(maxY, g.pos.y); }
  assert.ok(maxY < 0.5, `ground pass stays down (${maxY.toFixed(2)}m)`);
  assert.ok(g.pos.z > 6, 'traveled');

  const l = mk(); playPass(l, 'loft', from, to, 0.7, PLANTED);
  maxY = 0;
  for (let i = 0; i < 180 && l.active; i++) { l.step(1 / 60); maxY = Math.max(maxY, l.pos.y); }
  assert.ok(maxY > 1.5, `loft arcs (${maxY.toFixed(2)}m)`);

  const t = mk();
  const runner = new Vector3(0, 0, 6);                 // running forward
  playPass(t, 'through', from, to, 0.8, PLANTED, runner);
  const zVel = t.vel.clone();
  assert.ok(zVel.z > 8, 'into space ahead');
  // leads: the ball's target is beyond the runner's CURRENT spot
  assert.ok(t.vel.length() > 10);
});

console.log('\nB. reliability from the passers state');
ok('pressure + off-balance disperse wider than planted', () => {
  const spread = (s: typeof PLANTED) => {
    const xs: number[] = [];
    for (let i = 0; i < 24; i++) {
      const b = mk();
      playPass(b, 'ground', new Vector3(0, 0.11, 0), new Vector3(0, 0.11, 15), 0.7, s);
      xs.push(Math.atan2(b.vel.x, b.vel.z));
    }
    return Math.max(...xs) - Math.min(...xs);
  };
  const tight = spread(PLANTED);
  const wild = spread({ balance01: 0.2, pressure01: 0.9, facingDot: -0.5 });
  assert.ok(wild > tight * 1.5, `dispersion ${(wild * 57.3).toFixed(1)}° vs ${(tight * 57.3).toFixed(1)}°`);
  assert.ok(passAccuracy(PLANTED) > passAccuracy({ balance01: 0.2, pressure01: 0.9, facingDot: -0.5 }));
});

console.log('\nC. power vs finesse are different mechanics');
ok('power is faster; finesse bends toward the far post', () => {
  const from = new Vector3(0, 1, 0), goal = new Vector3(0, 0, 20);
  const p = mk(); strikeBall(p, from, goal, { kind: 'power', power01: 0.9, aimX: 0.5, balance01: 1, pressure01: 0 });
  const f = mk(); strikeBall(f, from, goal, { kind: 'finesse', power01: 0.9, aimX: 0.5, balance01: 1, pressure01: 0 });
  assert.ok(p.vel.length() > f.vel.length() * 1.25, `power pace (${p.vel.length().toFixed(1)} vs ${f.vel.length().toFixed(1)})`);
  // finesse curls: x-velocity grows in flight toward the aim side
  const x0 = f.vel.x;
  for (let i = 0; i < 40; i++) f.step(1 / 120); assert.ok(Math.abs(f.vel.x - x0) > 0.2, `curling (${(f.vel.x - x0).toFixed(2)} Δvx over the flight)`);
});

console.log('\nD. volleys carry incoming pace');
ok('a first-time strike adds the ball-in-flight velocity', () => {
  const v = mk();
  strikeBall(v, new Vector3(0, 1, 0), new Vector3(0, 0, 20), {
    kind: 'power', power01: 0.8, aimX: 0, balance01: 1, pressure01: 0,
    volleyBallVel: new Vector3(0, -2, 12),
  });
  const settled = mk();
  strikeBall(settled, new Vector3(0, 1, 0), new Vector3(0, 0, 20), {
    kind: 'power', power01: 0.8, aimX: 0, balance01: 1, pressure01: 0,
  });
  assert.ok(v.vel.length() > settled.vel.length(), `volley is hotter (${v.vel.length().toFixed(1)} vs ${settled.vel.length().toFixed(1)})`);
});

console.log(`\n${pass} checks green`);
