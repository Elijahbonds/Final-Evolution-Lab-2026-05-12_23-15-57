#!/usr/bin/env -S npx tsx
// 3v3 depth pass — help defence and passing reads, checked headless.
//
//   HELP ROTATION — when the ball is driven at the rim, the LOW MAN (the
//     off-ball defender closest to the hoop) leaves his mark and steps into
//     the lane; the others stay home. Without the rotation, beating your man
//     was a layup line and the kick-out read did not exist.
//   PICKED OFF — an AIMED chest pass through a defender standing in the lane
//     is intercepted. Deterministic: they were there when you threw it. The
//     unaimed open-man pass keeps the auto-bounce (the assist's job).
//
// Run: npx tsx scripts/threevthree-depth-tests.ts

import { readFileSync } from 'node:fs';
import { Vector3 } from '@babylonjs/core';
import { DefenderBrain } from '../lib/babylon/core/BasketballCore';
import { PassFlight } from '../lib/babylon/core/BallHandling';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const RIM = new Vector3(0, 3.05, -0.6);
const DT = 1 / 60;

/** Two decide() calls with an advancing ball, so the brain sees drive speed. */
function drive(brain: DefenderBrain, self: Vector3, from: Vector3, to: Vector3, allies: Vector3[], foes: Vector3[]) {
  brain.decide(DT, self, from, RIM, allies, foes);
  return brain.decide(DT, self, to, RIM, allies, foes);
}

// ── A. the low man helps on a drive ────────────────────────────────────────
// Attackers: carrier driving at the rim, two shooters parked wide.
// Defender under test marks shooterA and sits lane-side — the low man.
{
  const carrierNear = new Vector3(0, 0, 2.6);       // 3.2m from the rim
  const carrierNearer = new Vector3(0, 0, 1.9);     // driving in
  const shooterA = new Vector3(-5, 0, 6);
  const shooterB = new Vector3(5, 0, 6);
  const foes = [carrierNearer, shooterA, shooterB];
  const onBallDefender = new Vector3(0, 0, 0.6);    // carrier's man, at the rim
  const farDefender = new Vector3(4.5, 0, 4.5);     // weak side, far from rim

  const lowMan = new DefenderBrain(0.55, 1);        // marks shooterA
  const self = new Vector3(-1.5, 0, 2.0);           // 3.0m from the rim

  // driving: the low man must step INTO the lane (toward the rim, -z)
  const helpIntent = drive(lowMan, self, carrierNear, carrierNearer, [onBallDefender, farDefender], foes);
  ok(helpIntent.moveY > 0.3, `low man rotates to the drive (moveY ${helpIntent.moveY.toFixed(2)} > 0)`);

  // same shape but the ball is PARKED: no drive, no help — hold the mark
  const held = new DefenderBrain(0.55, 1);
  const still = held.decide(DT, self, carrierNearer.clone(), RIM, [onBallDefender, farDefender], foes);
  const still2 = held.decide(DT, self, carrierNearer.clone(), RIM, [onBallDefender, farDefender], foes);
  void still;
  ok(still2.moveY < 0, `no drive, no rotation — the mark is held (moveY ${still2.moveY.toFixed(2)} < 0)`);

  // and the WEAK-SIDE defender does NOT come: only the low man rotates
  const weakSide = new DefenderBrain(0.55, 2);      // marks shooterB, far side
  const weakSelf = new Vector3(4.0, 0, 4.0);
  const stay = drive(weakSide, weakSelf, carrierNear, carrierNearer,
    [onBallDefender, new Vector3(-1.5, 0, 2.0)], foes);
  ok(stay.moveY < 0.3, `only the low man helps — weak side stays home (moveY ${stay.moveY.toFixed(2)})`);
}

// ── B. the pick is geometry, not dice ──────────────────────────────────────
// A chest pass's flight through a lane defender comes within pick reach
// (0.8m); past a defender OUTSIDE the lane it never does.
{
  const passer = new Vector3(0, 1.2, 6);
  const receiver = new Vector3(5, 1.2, 4);
  const inLane = new Vector3(2.5, 0, 5.0);          // dead centre of the lane
  const offLane = new Vector3(2.5, 0, 7.5);         // 2.5m off the line

  // PLANAR, matching the mode: the ball flies at chest height, the defender's
  // position is at their feet — a 3D check would never see the lane at all.
  const minDist = (defender: Vector3): number => {
    const flight = new PassFlight();
    const ball = passer.clone();
    flight.start(passer, receiver, 'chest');
    let best = Infinity;
    while (!flight.step(DT, ball)) {
      best = Math.min(best, Math.hypot(defender.x - ball.x, defender.z - ball.z));
    }
    return best;
  };

  ok(minDist(inLane) < 0.8, `lane defender can pick the chest pass (min ${minDist(inLane).toFixed(2)}m)`);
  ok(minDist(offLane) > 0.8, `defender outside the lane cannot (min ${minDist(offLane).toFixed(2)}m)`);
}

// ── C. source level: the reads are wired, the standoff is fixed ────────────
{
  const src = readFileSync(new URL('../lib/babylon/modes/ThreeVThreeMode.ts', import.meta.url), 'utf8');
  ok(src.includes('PICKED OFF!'), 'the interception is wired into the pass flight');
  ok(/intent\.steal[^;]*< 1\.6/.test(src), 'steal applies past the body standoff (1.6m, not 1.2)');
  ok(src.includes('drib.hesitation'), 'the hesi bite is wired for the on-ball defender');
  for (const word of ['GREEN!', 'EARLY', 'LATE', 'CONTESTED', 'WIDE OPEN']) {
    ok(src.includes(word), `release feedback can say "${word}"`);
  }
  ok(/RIM\.z \+ 0\.9/.test(src), 'the rival drives AT the rim, not five metres short');
}

// ── report ─────────────────────────────────────────────────────────────────
if (fail.length) {
  console.error(`threevthree-depth-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`threevthree-depth-tests: ${checks} checks green`);
