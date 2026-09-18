#!/usr/bin/env -S npx tsx
/**
 * scripts/pitch-read-tests.ts — Mode 6 Phase 3 proof (headless).
 *   A. The read is honest: blind early, converges on the truth late,
 *      NEVER confidently wrong at any point in the flight.
 *   B. Skill matters: a practiced reader locks on sooner than a novice
 *      (measurably better with practice — the exit criterion).
 *   C. Pitch types differ in WHEN they betray themselves (curve early,
 *      fastball late) but all are readable before contact.
 *   D. The strike zone is consistent (same spot = same call, always).
 *
 * Run: npx tsx scripts/pitch-read-tests.ts
 */
import assert from 'node:assert';
import { readPitch, canReadAt, isStrike } from '../lib/babylon/core/PitchRead';
import { PITCHES, ZONE } from '../lib/babylon/core/Pitching';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

console.log('\nA. honesty');
ok('never confidently wrong; blind early, true late', () => {
  for (const p of Object.values(PITCHES)) {
    let everConfidentlyWrong = false;
    for (let t = 0; t <= 0.7; t += 0.02) {
      const r = readPitch(p, t, 0.8);
      if (r.confidence01 > 0.55 && r.guess.id !== p.id) everConfidentlyWrong = true;
    }
    assert.ok(!everConfidentlyWrong, `${p.id} never confidently misread`);
    assert.ok(readPitch(p, 0.01).confidence01 < 0.3, 'blind at release');
    assert.equal(readPitch(p, 0.7, 0.8).guess.id, p.id, 'true read by contact');
  }
});

console.log('\nB. skill');
ok('practiced readers lock on sooner', () => {
  const firstConfident = (skill: number) => {
    let t = 0;
    while (t < 0.7 && !canReadAt(PITCHES.slider, t, skill)) t += 0.01;
    return t;
  };
  const novice = firstConfident(0.05);
  const pro = firstConfident(0.98);
  assert.ok(pro < novice, `pro reads sooner (${pro.toFixed(2)}s vs ${novice.toFixed(2)}s)`);
});

console.log('\nC. per-pitch tells');
ok('curve betrays early, fastball late, all readable before contact', () => {
  const lock = (id: string) => {
    let t = 0;
    while (t < 0.7 && !canReadAt(PITCHES[id], t, 0.9)) t += 0.01;
    return t;
  };
  const curve = lock('curveball'), fb = lock('fastball');
  assert.ok(curve <= fb + 0.01, `curve (${curve.toFixed(2)}s) reads no later than fastball (${fb.toFixed(2)}s)`);
  for (const id of Object.keys(PITCHES)) assert.ok(lock(id) < 0.6, `${id} readable in time`);
});

console.log('\nD. the zone is consistent');
ok('same spot, same call — always', () => {
  for (let i = 0; i < 50; i++) {
    assert.equal(isStrike(0.2, 0.8), true);
    assert.equal(isStrike(ZONE.halfW + 0.01, 0.8), false);
    assert.equal(isStrike(0, ZONE.bottom - 0.01), false);
  }
});

console.log(`\n${pass} checks green`);
