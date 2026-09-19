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
    // SIGN: the stick counters when it MATCHES the needle's sign (the needle moves by -stickX * authority, see
    // GrindManual.update). This read -needle for a long time — which is the WRONG-WAY branch at 6.6 authority, so
    // the "proportional counter" was a shove and the grind slipped at 0.8 s. The physics were never the problem.
    const r = g.update(DT, g.needle * 0.9, 0.2);  // proportional counter
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
  for (let i = 0; i < 60 && m.active; i++) pts += m.update(DT, m.needle * 0.9, 0.3).pts;
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
// HOW THIS IS MEASURED. The claim is about DRIFT — `drift = (BALANCE_DRIFT_RATE + speed01 * 0.45) * …` — so the probe
// is hands-off, where drift is the only term that moves the needle. With a stick on it the check could not see its own
// subject: a 0.9-proportional counter holds BOTH speeds past the 20 s cap, so slow and fast tied at 20.0 s and the
// assertion failed on a model that was behaving exactly as designed.
//
// And it is SEEDED. `BalanceChannel`'s `rnd` is injectable for this reason (see its constructor): the drift's seed and
// its initial direction were Math.random, so a single run's slip time is not a number anything can assert on. One
// seeded generator, many runs, compare the means.
ok('faster grinds drift harder', () => {
  const lcg = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000);
  const meanSlipSec = (speed01: number) => {
    let total = 0;
    const RUNS = 60;
    for (let r = 0; r < RUNS; r++) {
      const g = new BalanceChannel('grind', new BalanceModel(), lcg(r + 1));
      g.start(speed01);
      let frames = 0;
      while (g.active && frames < 1200) { g.update(DT, 0, speed01); frames++; }   // hands off: drift alone
      total += frames * DT;
    }
    return total / RUNS;
  };
  const slow = meanSlipSec(0.1);
  const fast = meanSlipSec(0.95);
  assert.ok(fast < slow, `fast must slip sooner (fast ${fast.toFixed(2)}s vs slow ${slow.toFixed(2)}s over 60 seeded runs)`);
});

console.log(`\n${pass} checks green`);
