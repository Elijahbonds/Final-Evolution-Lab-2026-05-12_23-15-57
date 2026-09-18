#!/usr/bin/env -S npx tsx
/**
 * scripts/grind-manual-tests.ts — Mode 3 Phase 9 proof (headless).
 *   A. Grind balance: holding the counter-stick sustains the grind and
 *      accrues points; ignoring the drift slips off.
 *   B. Manual: same channel on the ground at a lower tick rate.
 *   C. Revert: stick snap on a transition yields a manual; flat ground or
 *      no snap yields nothing.
 *   D. Speed makes the drift harder (skill scales with pace).
 *
 * Run: npx tsx scripts/grind-manual-tests.ts
 */
import assert from 'node:assert';
import { BalanceChannel, tryRevert, GRIND_PTS_PER_SEC, MANUAL_PTS_PER_SEC } from '../lib/babylon/core/GrindManual';
import { BalanceModel } from '../lib/babylon/core/BoardPhysics';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const DT = 1 / 60;

console.log('\nA. grind balance');
ok('countering the drift sustains the grind and ticks points', () => {
  const b = new BalanceModel();
  const g = new BalanceChannel('grind', b);
  g.start(0.2);                                  // slow, controlled grind
  let pts = 0;
  for (let i = 0; i < 120 && g.active; i++) {
    const r = g.update(DT, -g.needle * 0.9, 0.2);  // proportional counter
    pts += r.pts;
  }
  assert.ok(g.active, 'still grinding after 2s at low speed');
  assert.ok(Math.abs(pts - GRIND_PTS_PER_SEC * 2) < GRIND_PTS_PER_SEC * 0.4, `~2s of points (${pts.toFixed(0)})`);
});
ok('ignoring the drift slips off fast', () => {
  const b = new BalanceModel();
  const g = new BalanceChannel('grind', b);
  g.start(0.6);
  let frames = 0;
  let slipped = false;
  while (g.active && frames < 600) {
    if (g.update(DT, 0, 0.6).slipped) { slipped = true; break; }
    frames++;
  }
  assert.ok(slipped, 'no counter = slip');
  assert.ok(frames < 600, `inside 10s (fell at ${(frames * DT).toFixed(1)}s)`);
});

console.log('\nB. manual');
ok('manuals tick at their own rate and end on stop()', () => {
  const b = new BalanceModel();
  const m = new BalanceChannel('manual', b);
  m.start(0.3);
  let pts = 0;
  for (let i = 0; i < 60 && m.active; i++) pts += m.update(DT, -m.needle * 0.9, 0.3).pts;
  assert.ok(Math.abs(pts - MANUAL_PTS_PER_SEC) < MANUAL_PTS_PER_SEC * 0.4);
  m.stop();
  assert.ok(!m.active);
});

console.log('\nC. revert');
ok('snap + transition = manual; otherwise nothing', () => {
  assert.equal(tryRevert(true, true, -1), 'manual');
  assert.equal(tryRevert(true, true, 1), 'nosemanual');
  assert.equal(tryRevert(true, false, -1), null);
  assert.equal(tryRevert(false, true, -1), null);
});

console.log('\nD. speed scales the skill check');
ok('faster grinds drift harder', () => {
  const b1 = new BalanceModel(); const slow = new BalanceChannel('grind', b1); slow.start(0.1);
  const b2 = new BalanceModel(); const fast = new BalanceChannel('grind', b2); fast.start(0.95);
  // same skill, both speeds: faster must slip sooner
  const run = (g: InstanceType<typeof BalanceChannel>, spd: number) => {
    let frames = 0;
    while (g.active && frames < 1200) { g.update(DT, -g.needle * 0.9, spd); frames++; }
    return frames;
  };
  const slowFrames = run(slow, 0.2);
  const fastFrames = run(fast, 0.95);
  assert.ok(fastFrames < slowFrames, `fast slips sooner (${(fastFrames * DT).toFixed(1)}s vs ${(slowFrames * DT).toFixed(1)}s)`);
});

console.log(`\n${pass} checks green`);
