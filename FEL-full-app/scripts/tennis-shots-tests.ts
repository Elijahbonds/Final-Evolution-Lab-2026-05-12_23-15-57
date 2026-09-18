#!/usr/bin/env -S npx tsx
/**
 * scripts/tennis-shots-tests.ts — Mode 7 Phases 4-6 proof (headless).
 *   A. Shot types fly + bounce DIFFERENTLY through one physics system:
 *      topspin dips and kicks, slice floats and skids low, flat is fast,
 *      drop dies, lob is high.
 *   B. Serves: flat > kick pace; first serve carries real fault risk;
 *      a bad toss costs pace.
 *   C. Net play: touch volley dies; smash only off a high falling ball;
 *      low lobs over a net player are punishable.
 *
 * Run: npx tsx scripts/tennis-shots-tests.ts
 */
import assert from 'node:assert';
import { Vector3 } from '@babylonjs/core';
import { shotLaunch, serveLaunch, volleyLaunch, canSmash, lobIsPunishable, TENNIS_BALL } from '../lib/babylon/core/TennisShots';
import { SoccerBall } from '../lib/babylon/core/SoccerBall';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const FROM = new Vector3(0, 1, -10), TO = new Vector3(0, 0.1, 10);

function fly(type: 'topspin' | 'slice' | 'flat' | 'drop' | 'lob') {
  const b = new SoccerBall({ position: Vector3.Zero() }, TENNIS_BALL);
  const l = shotLaunch(type, FROM, TO, 0.9);
  b.launch(FROM, l.vel, l.spin);
  let peak = 0, bounced = false, afterBounceVy = 0, carry = 0;
  for (let i = 0; i < 480 && b.active; i++) {
    b.step(1 / 240);
    peak = Math.max(peak, b.pos.y);
    if (!bounced && b.pos.y <= TENNIS_BALL.radius + 0.01) { bounced = true; afterBounceVy = b.vel.y; carry = b.pos.z - FROM.z; }
  }
  return { peak, afterBounceVy, carry, dist: b.pos.z - FROM.z };
}

console.log('\nA. one physics, five distinct balls');
ok('topspin dips / slice floats low / flat fastest / drop dies / lob highest', () => {
  const ts = fly('topspin'), sl = fly('slice'), fl = fly('flat'), dr = fly('drop'), lob = fly('lob');
  assert.ok(lob.peak > ts.peak && ts.peak > fl.peak, `height: lob ${lob.peak.toFixed(1)} > ts ${ts.peak.toFixed(1)} > flat ${fl.peak.toFixed(1)}`);
  assert.ok(fl.carry > sl.carry, `flat carries further than slice in the air (${fl.carry.toFixed(1)} vs ${sl.carry.toFixed(1)})`);
  assert.ok(dr.carry < ts.carry, `drop dies in the air (${dr.carry.toFixed(1)} vs topspin ${ts.carry.toFixed(1)})`);
  assert.ok(ts.afterBounceVy > sl.afterBounceVy, `topspin kicks up off the bounce (${ts.afterBounceVy.toFixed(1)} vs ${sl.afterBounceVy.toFixed(1)})`);
});

console.log('\nB. serves');
ok('flat > kick pace; first serve risks more; bad toss costs pace', () => {
  const flat = serveLaunch('flat', FROM, TO, true, 1);
  const kick = serveLaunch('kick', FROM, TO, true, 1);
  assert.ok(flat.vel.length() > kick.vel.length(), 'flat is the heater');
  assert.ok(flat.faultRisk01 > kick.faultRisk01, 'flat risks the fault');
  const second = serveLaunch('flat', FROM, TO, false, 1);
  assert.ok(second.faultRisk01 < flat.faultRisk01, 'second serve is safer');
  const badToss = serveLaunch('flat', FROM, TO, true, 0.3);
  assert.ok(badToss.vel.length() < flat.vel.length(), 'bad toss bleeds pace');
});

console.log('\nC. net play');
ok('touch volley dies; smash needs a high falling ball; low lobs are punishable', () => {
  const v = volleyLaunch(new Vector3(0, 1, 1), TO, true);
  assert.ok(v.vel.length() < 6, 'touch volley is soft');
  assert.ok(canSmash(new Vector3(0, 3, 1), new Vector3(0, -3, 0), new Vector3(0, 0, 1)), 'smash on a falling lob');
  assert.ok(!canSmash(new Vector3(0, 1, 1), new Vector3(0, 2, 0), new Vector3(0, 0, 1)), 'no smash on a riser');
  assert.ok(lobIsPunishable(new Vector3(0.5, 2.8, 1), new Vector3(0, 0, 1.5), 0), 'low lob at net = punished');
  assert.ok(!lobIsPunishable(new Vector3(0.5, 5.5, 1), new Vector3(0, 0, 1.5), 0), 'a deep high lob is safe');
});

console.log(`\n${pass} checks green`);
