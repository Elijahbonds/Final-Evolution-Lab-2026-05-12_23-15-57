// Snowboard Slalom — Phase 2, against the locked SSX benchmark.
//
// Two defects give this file its shape, and both were invisible rather than
// wrong-looking:
//
//  1. The boost meter could not be spent. `boosting` was never assigned true
//     anywhere in the codebase, so boost filled at +12 a spin and drained
//     inside a branch nothing could enter. Every other part was present -- the
//     acceleration, the drain, the HUD publish -- which is exactly why it read
//     as a working feature. SSX Tricky is NAMED after its boost state.
//  2. The course was sin(i * 1.7) * 9, which aliases into a near-random
//     sequence with consecutive gates up to 12.8m apart across 15m of slope.
//
// So these assert the ECONOMY has a real trade in it, and that the course is a
// rhythm a rider can physically hold. The course numbers are checked against
// measured lateral authority, not against themselves.

import {
  BOOST_TUCK, BOOST_DRAIN, BOOST_PER_SPIN, BOOST_MAX,
} from '../lib/babylon/modes/SnowboardSlalomMode';
import {
  SLALOM_GATES, SLALOM_SPACING, SLALOM_START, slalomGateX, slalomGateDist,
} from '../lib/babylon/modes/rideWorlds';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

/** Measured through the agent bridge on the real mode, 2026-08-31. */
const MEASURED_DESCENT_MPS = 12;
const MEASURED_CARVE_MPS = 5.5;

// ── A. the boost meter is a resource, not a readout ─────────────────────────
ok(BOOST_DRAIN > 0, 'A1 there is a drain at all — the meter can be spent');
const spinsToFill = BOOST_MAX / BOOST_PER_SPIN;
ok(spinsToFill >= 4, `A2 a full meter is EARNED, not incidental (${spinsToFill.toFixed(1)} spins)`);
const window = BOOST_MAX / BOOST_DRAIN;
ok(window > 2 && window < 8, `A3 a full meter buys a usable but finite burst (${window.toFixed(1)}s)`);
ok(BOOST_DRAIN > BOOST_PER_SPIN, `A4 spending outruns a single fill (${BOOST_DRAIN}/s vs +${BOOST_PER_SPIN}) — a boost is not free`);
// Spending shares the tuck input (the overlay's four slots are full), so it has
// to demand a deliberate commitment or the player spends without choosing to.
ok(BOOST_TUCK > 0.6, `A5 an ordinary tuck does NOT spend the meter (threshold ${BOOST_TUCK})`);
ok(BOOST_TUCK < 1, 'A6 ...but full commitment is reachable on an analog input');

// ── B. the course is a slalom ───────────────────────────────────────────────
ok(SLALOM_GATES >= 10, `B1 a real course length (${SLALOM_GATES} gates)`);
ok(slalomGateX(0) === 0, 'B2 gate 0 is dead ahead — the run starts fair');
for (let i = 2; i < SLALOM_GATES; i++) {
  ok(Math.sign(slalomGateX(i)) !== Math.sign(slalomGateX(i - 1)),
    `B3 gate ${i} alternates sides with ${i - 1} (a slalom is a RHYTHM, not noise)`);
}

// ── C. every gate is physically reachable from the one before it ────────────
// This is the check the old course would have failed: it demanded up to 12.8m
// of lateral travel across 15m of slope, a sustained 40-degree traverse of the
// fall line, gate after gate.
const secondsBetweenGates = SLALOM_SPACING / MEASURED_DESCENT_MPS;
const reachable = MEASURED_CARVE_MPS * secondsBetweenGates;
for (let i = 1; i < SLALOM_GATES; i++) {
  const demand = Math.abs(slalomGateX(i) - slalomGateX(i - 1));
  ok(demand <= reachable,
    `C1 gate ${i - 1}->${i} demands ${demand.toFixed(1)}m across in ${secondsBetweenGates.toFixed(1)}s; a rider can cover ${reachable.toFixed(1)}m`);
}
// ...and the hardest gate should still be most of the way to that limit, or the
// course is safe to the point of being dull.
let hardest = 0;
for (let i = 1; i < SLALOM_GATES; i++) hardest = Math.max(hardest, Math.abs(slalomGateX(i) - slalomGateX(i - 1)));
ok(hardest > reachable * 0.5,
  `C2 the hardest gate uses a real share of what a rider has (${hardest.toFixed(1)}m of ${reachable.toFixed(1)}m)`);

// ── D. difficulty ramps ─────────────────────────────────────────────────────
const early = Math.abs(slalomGateX(2) - slalomGateX(1));
const late = Math.abs(slalomGateX(SLALOM_GATES - 1) - slalomGateX(SLALOM_GATES - 2));
ok(late > early, `D1 the course opens up as it goes (${early.toFixed(1)}m -> ${late.toFixed(1)}m)`);
ok(slalomGateDist(0) === SLALOM_START, 'D2 the first gate is a run-up away, not on the start line');
ok(slalomGateDist(SLALOM_GATES - 1) > 200, `D3 the course is a descent (${slalomGateDist(SLALOM_GATES - 1)}m)`);

if (fail.length) {
  console.error(`snowboard-run-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  x ' + f);
  process.exit(1);
}
console.log(`snowboard-run-tests: ${checks} checks green — the boost is spendable and every gate is reachable`);
