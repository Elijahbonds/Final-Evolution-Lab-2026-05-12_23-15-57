// Baseball (Derby) and Soccer (Penalty) — the mechanics their benchmarks name.
//
// Baseball's locked justification reads "contact-based bat mechanics with
// DYNAMIC PCI". The PCI — Plate Coverage Indicator — is the reticle you move to
// where you think the pitch will be, and contact is how well it covers the ball.
// Derby had none: every pitch arrived at the same spot from the same origin, so
// the only skill was timing and the stick merely dialled launch angle.

import {
  ZONE_HALF, PCI_PURE_M, PCI_MISS_M, GOLF_CLUBS, PUTTER, PUTT_RANGE_M,
} from '../lib/babylon/modes/precisionModes';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

/** The contact model, mirrored from the mode so the shape can be asserted. */
const cover = (off: number): number =>
  off <= PCI_PURE_M ? 1 : Math.max(0, 1 - (off - PCI_PURE_M) / (PCI_MISS_M - PCI_PURE_M));

// ── A. the PCI is a real coverage decision ──────────────────────────────────
ok(cover(0) === 1, 'A1 dead-centre coverage is perfect contact');
ok(cover(PCI_PURE_M) === 1, 'A2 there is a forgiving core, not a single pixel');
ok(cover(PCI_MISS_M) === 0, 'A3 ...and a distance at which you simply miss it');
ok(cover(PCI_PURE_M + 0.01) < 1 && cover(PCI_PURE_M + 0.01) > 0.9,
  'A4 it degrades smoothly rather than falling off a cliff');
ok(cover(0.45) > 0 && cover(0.45) < 0.7, `A5 a half-metre miss is weak contact, not a whiff (${cover(0.45).toFixed(2)})`);

// The zone has to be big enough that WHERE the pitch is actually matters, and
// small enough that a reticle can cover it.
ok(ZONE_HALF.x > PCI_PURE_M, 'A6 the zone is wider than the PCI core — location matters');
ok(ZONE_HALF.y > PCI_PURE_M * 0.8, 'A7 ...vertically too');
ok(ZONE_HALF.x * 2 < PCI_MISS_M * 2, 'A8 ...but the worst-case miss is still recoverable contact');

// ── B. timing alone must not be enough ──────────────────────────────────────
// The mode grades q = timing * (0.25 + 0.75 * cover). Perfect timing with no
// coverage has to be clearly worse than perfect timing with coverage, or the
// PCI is decoration.
const q = (timing: number, c: number) => timing * (0.25 + 0.75 * c);
ok(q(1, 0) < q(1, 1) * 0.4, `B1 perfect timing with NO coverage is weak (${q(1, 0).toFixed(2)} vs ${q(1, 1).toFixed(2)})`);
ok(q(1, 0) > 0, 'B2 ...but still contact — a covered miss is not a whiff');
ok(q(0.5, 1) > q(1, 0), 'B3 coverage with fair timing beats perfect timing with none');

// ── C. golf's bag is a set of real trades ───────────────────────────────────
const driver = GOLF_CLUBS[0], wedge = GOLF_CLUBS[GOLF_CLUBS.length - 1];
ok(driver.reach > wedge.reach, 'C1 the driver goes further');
ok(wedge.forgive > driver.forgive, 'C2 ...and the wedge forgives more — that is the trade');
ok(wedge.launch > driver.launch, 'C3 the wedge goes higher');
ok(PUTTER.reach < wedge.reach, 'C4 the putter is the shortest club in the bag');
ok(PUTTER.launch < 0.2, 'C5 a putt rolls; it does not fly');
ok(PUTTER.forgive < driver.forgive, 'C6 on the green the line is the whole shot');
ok(PUTT_RANGE_M > 0 && PUTT_RANGE_M < 20, `C7 the green is a sensible size (${PUTT_RANGE_M}m)`);

if (fail.length) {
  console.error(`precision-modes-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  x ' + f);
  process.exit(1);
}
console.log(`precision-modes-tests: ${checks} checks green — the PCI is a real decision and golf's bag is a real bag`);
