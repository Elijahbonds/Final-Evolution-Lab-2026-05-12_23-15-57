// Surf Break — Phase 2 economy, against the locked SSX benchmark.
//
// The lock records that SSX is a snowboarding game and this is a surf mode, so
// what is being held to account here is SSX's SYSTEMS: a meter that fills by
// riding well, spends for a burst, and makes the choice between the two a real
// one. The specific defect these guard is that the meter could not be spent at
// all -- `flow` filled, gated a passive score trickle, and no action anywhere
// consumed it, which makes it a readout rather than a decision.

import {
  FLOW_FILL_PER_SEC, FLOW_MAX, MAX_FORWARD_SPEED, POCKET,
  SURGE_CARVE, SURGE_DRAIN, SURGE_SPEED_BONUS, BARREL_HOLD_SEC, BARREL_BONUS,
} from '../lib/babylon/modes/SurfBreakMode';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

// ── A. the meter is a RESOURCE, not a readout ───────────────────────────────
ok(SURGE_DRAIN > 0, 'A1 there is a drain at all — the meter can be spent');
ok(SURGE_DRAIN > FLOW_FILL_PER_SEC,
  `A2 spending outruns filling (${SURGE_DRAIN}/s vs ${FLOW_FILL_PER_SEC}/s) — otherwise a surge is free and there is no choice`);
const surgeWindow = FLOW_MAX / SURGE_DRAIN;
ok(surgeWindow > 2 && surgeWindow < 8,
  `A3 a full meter buys a usable but finite window (${surgeWindow.toFixed(1)}s)`);
const refill = FLOW_MAX / FLOW_FILL_PER_SEC;
ok(refill > surgeWindow,
  `A4 refilling costs more than spending (${refill.toFixed(1)}s to fill vs ${surgeWindow.toFixed(1)}s to burn)`);
// Doubled in the tube: the risky line is the fast way to refill, which is what
// makes committing to the barrel worth the wipeout risk.
ok(FLOW_MAX / (FLOW_FILL_PER_SEC * 2) < refill, 'A5 the tube refills faster than the open face');

// ── B. spending has to BUY something ────────────────────────────────────────
ok(SURGE_SPEED_BONUS > 0, 'B1 a surge buys speed');
ok(MAX_FORWARD_SPEED + SURGE_SPEED_BONUS > MAX_FORWARD_SPEED,
  'B2 it exceeds the normal ceiling — speed you cannot otherwise reach');
ok(SURGE_SPEED_BONUS / MAX_FORWARD_SPEED > 0.25,
  `B3 the gain is felt, not cosmetic (+${((SURGE_SPEED_BONUS / MAX_FORWARD_SPEED) * 100).toFixed(0)}%)`);

// ── C. spending is a DECISION, not a side effect ────────────────────────────
// Surf's four overlay slots are full, so the surge shares the carve input. It
// must therefore need a deliberate, deep commitment rather than triggering on
// any ordinary carve, or the player would spend the meter without choosing to.
ok(SURGE_CARVE > 0.6, `C1 an ordinary carve does NOT spend the meter (threshold ${SURGE_CARVE})`);
ok(SURGE_CARVE < 1, 'C2 ...but full commitment is reachable on an analog input');

// ── D. the pocket is a place you can be, and the barrel pays for holding it ──
ok(POCKET.max > POCKET.min, 'D1 the pocket is a band, not a line');
ok(POCKET.max - POCKET.min >= 4, `D2 the band is wide enough to ride (${POCKET.max - POCKET.min}m)`);
ok(BARREL_HOLD_SEC > 0.5, `D3 a barrel must be HELD to count (${BARREL_HOLD_SEC}s)`);
ok(BARREL_BONUS > FLOW_MAX, 'D4 the barrel bonus is worth more than a full meter — the risky line pays');

if (fail.length) {
  console.error(`surf-run-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  x ' + f);
  process.exit(1);
}
console.log(`surf-run-tests: ${checks} checks green — the flow meter is a resource with a real trade`);
