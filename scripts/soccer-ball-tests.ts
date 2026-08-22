#!/usr/bin/env -S npx tsx
/**
 * scripts/soccer-ball-tests.ts — Mode 5 Phase 2 proof (headless).
 *   A. Real flight: gravity + drag; a driven ball falls short of vacuum
 *      range; a lofted ball lands.
 *   B. MAGNUS: side-spin curves the flight measurably; backspin holds up,
 *      topspin dips.
 *   C. Roll: a rolling ball decelerates by grass friction and stops;
 *      side-spin bends the roll.
 *   D. Deflection: a swept keeper-parry redirects the ball (rebound lives).
 *
 * Run: npx tsx scripts/soccer-ball-tests.ts
 */
import assert from 'node:assert';
import { Vector3 } from '@babylonjs/core';
import { SoccerBall } from '../lib/babylon/core/SoccerBall';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const DT = 1 / 240;   // fine step for flight fidelity
const mesh = () => ({ position: Vector3.Zero() });

console.log('\nA. real flight');
ok('drag makes the ball fall short of vacuum range', () => {
  const b = new SoccerBall(mesh());
  b.launch(new Vector3(0, 1, 0), new Vector3(0, 4, 18));
  let z = 0;
  while (b.active) { b.step(DT); z = b.pos.z; }
  // vacuum range for this launch ≈ vy*t both ways + roll; drag + grass must
  // bring it in well under the naive parabola AND the roll must add up
  assert.ok(z > 12, `traveled a real distance (${z.toFixed(1)}m)`);
  // no-drag twin for comparison
  const vac = new SoccerBall(mesh());
  (vac as any).tune = { ...(vac as any).tune, dragK: 0, grassFriction: 0.4 };
  vac.launch(new Vector3(0, 1, 0), new Vector3(0, 4, 18));
  let vz = 0;
  while (vac.active) { vac.step(DT); vz = vac.pos.z; }
  assert.ok(z < vz, `drag+grass shortened the flight (${z.toFixed(1)} < ${vz.toFixed(1)})`);
});

console.log('\nB. Magnus');
ok('side-spin bends the flight; backspin holds, topspin dips', () => {
  const straight = new SoccerBall(mesh());
  straight.launch(new Vector3(0, 1, 0), new Vector3(0, 3, 20));
  while (straight.active && straight.pos.z < 18) straight.step(DT);
  const xStraight = straight.pos.x;

  const curler = new SoccerBall(mesh());
  curler.launch(new Vector3(0, 1, 0), new Vector3(0, 3, 20), new Vector3(0, 18, 0));  // y-spin = bend
  while (curler.active && curler.pos.z < 18) curler.step(DT);
  assert.ok(Math.abs(curler.pos.x - xStraight) > 0.4, `curled ${(curler.pos.x - xStraight).toFixed(2)}m off line`);

  // same ball, same launch — only the spin differs
  const mk = (spinX: number) => {
    const b = new SoccerBall(mesh());
    b.launch(new Vector3(0, 1, 0), new Vector3(0, 4, 18), new Vector3(spinX, 0, 0));
    let peakY = 0, flightTime = 0;
    while (b.active && b.pos.y > 0.11) { b.step(DT); peakY = Math.max(peakY, b.pos.y); flightTime += DT; }
    return { peakY, flightTime, z: b.pos.z };
  };
  const back = mk(-14), top = mk(14);   // -x-spin = backspin here (lifts: verified by simulation)
  // backspin holds the ball UP: higher peak, longer flight than topspin
  assert.ok(back.peakY > top.peakY, `backspin floats higher (${back.peakY.toFixed(2)} vs ${top.peakY.toFixed(2)})`);
  assert.ok(back.flightTime > top.flightTime, `backspin stays up longer (${back.flightTime.toFixed(2)}s vs ${top.flightTime.toFixed(2)}s)`);
});

console.log('\nC. the roll is honest grass');
ok('rolling ball decelerates and stops; spin bends the roll', () => {
  const b = new SoccerBall(mesh());
  b.launch(new Vector3(0, 0.11, 0), new Vector3(0, 0, 12));
  (b as any).rolling = true;
  let frames = 0;
  while (b.active && frames < 240 * 20) { b.step(DT); frames++; }
  assert.ok(!b.active, 'rolls to a stop');
  assert.ok(b.pos.z > 10 && b.pos.z < 60, `rolled ${b.pos.z.toFixed(1)}m`);

  const bend = new SoccerBall(mesh());
  bend.launch(new Vector3(0, 0.11, 0), new Vector3(0, 0, 10), new Vector3(0, 10, 0));
  (bend as any).rolling = true;
  for (let i = 0; i < 240 * 2; i++) bend.step(DT);
  assert.ok(Math.abs(bend.pos.x) > 0.3, `roll bent ${bend.pos.x.toFixed(2)}m off line`);
});

console.log('\nD. deflection');
ok('a swept parry redirects the ball (the rebound is live)', () => {
  const b = new SoccerBall(mesh());
  b.launch(new Vector3(0, 1.05, 0), new Vector3(0, 0.4, 16));   // stays at hand height
  // keeper dives across the flight at z=8
  let parried = false;
  for (let i = 0; i < 240 * 3 && b.active && !parried; i++) {
    const hit = b.sweptHit(new Vector3(0.2, 1.0, 8), 0.7);
    if (hit) {
      b.deflect(new Vector3(1, 0.6, -0.4), 0.55);
      parried = true;
    }
    b.step(DT);
  }
  assert.ok(parried, 'swept contact found');
  assert.ok(b.vel.z < 10 && b.vel.x > 1, `parried wide (${b.vel.x.toFixed(1)}, ${b.vel.z.toFixed(1)})`);
});

console.log(`\n${pass} checks green`);
