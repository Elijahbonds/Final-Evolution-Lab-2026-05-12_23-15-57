#!/usr/bin/env -S npx tsx
// Dunk Contest depth pass — the approach is part of the dunk, and the prop
// is physical.
//
//   AIR IS A BUDGET — the run-up's peak speed buys airtime; a trick needs
//     30% of the air left, a combo 42%. A walk-up and a runway attack used
//     to have the same trick menu (airTotal was computed and never read).
//   THE CHAIR IS REAL — crossing the obstacle with your feet below 1.30m is
//     a blown dunk on contact, whatever the slam timing was going to be. The
//     old check sampled y at the FLUSH (past the prop, near apex) with a 1.0m
//     fudge — it could never clip. The jump peaks at 1.05 + 0.55·charge, so
//     the chair demands a real charge: that is "difficulty earned".
//
// Run: npx tsx scripts/dunk-depth-tests.ts

import { readFileSync } from 'node:fs';
import { DunkFlight } from '../lib/babylon/core/DunkSystem';
import { DUNK_CONFIG } from '../lib/babylon/modes/modeConfigs';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const DT = 1 / 60;
const dpad = (dir: 'up' | 'down' | 'left' | 'right', pressed: boolean) => ({ t: 'dpad' as const, dir, pressed });
const btn = (btn: 'A' | 'B' | 'Y') => ({ t: 'button' as const, btn, pressed: true });

// ── A. air is a budget the run-up pays into ────────────────────────────────
{
  const slow = new DunkFlight();
  slow.launch(0.2, 3);                        // walk-up
  const fast = new DunkFlight();
  fast.launch(1.0, 3);                        // full runway attack
  ok(fast.airRemaining01 > 0 && slow.airRemaining01 > 0, 'both launch airborne');
  // decay both to ~35% air remaining, then throw the same trick
  const decayTo = (f: DunkFlight, frac: number) => { while (f.airRemaining01 > frac && f.phase === 'airborne') f.update(DT); };
  decayTo(slow, 0.35);
  decayTo(fast, 0.35);
  ok(slow.phase === 'slamWindow' || slow.airRemaining01 <= 0.35, 'slow flight decays to the window');
  ok(fast.airRemaining01 > 0.30, 'fast flight still has usable air');

  // a trick needs 30% left: fine early, refused late — and it SAYS so
  const rich = new DunkFlight();
  rich.launch(1.0, 3);
  rich.feedInput(dpad('up', true));
  ok(rich.feedInput(btn('A'))?.id === 'windmill', 'trick fires with air in the tank');
  ok(rich.rejectedForAir === false, 'no rejection flag on a paid trick');

  const poor = new DunkFlight();
  poor.launch(0.1, 3);                        // ~0.9s of air
  decayTo(poor, 0.2);                         // nearly out
  poor.feedInput(dpad('up', true));
  const refused = poor.feedInput(btn('A'));
  ok(refused === null && poor.rejectedForAir === true, 'a trick without air is refused AND flagged');

  // the combo asks more than the single
  const mid = new DunkFlight();
  mid.launch(0.6, 3);
  mid.feedInput(dpad('up', true));
  mid.feedInput(btn('A'));                    // windmill, paid
  decayTo(mid, 0.35);                         // below the 42% combo bar
  mid.feedInput(dpad('right', true));
  const comboRefused = mid.feedInput(btn('B'));
  ok(comboRefused === null && mid.rejectedForAir === true, 'the combo needs more air than the single');
  ok(mid.attempt.tricks.length === 1, 'a refused trick is not banked');
}

// ── B. the chair demands a real jump ───────────────────────────────────────
// The mode's flight: y peaks at 1.05 + 0.55·charge near the prop crossing.
// Feet must see 1.30m over a 1.35m prop (tucked). Do the arithmetic on the
// mode's own constants, then assert the source wires the check mid-flight.
{
  const src = readFileSync(new URL('../lib/babylon/modes/DunkMode.ts', import.meta.url), 'utf8');
  ok(src.includes('1.05 + charge * 0.55'), 'jump apex formula present (1.05 + 0.55·charge)');
  const apex = (charge: number) => 1.05 + 0.55 * charge;
  const CLEAR = 1.35 - 0.05;
  ok(apex(0.2) < CLEAR, `a lazy charge clips the chair (apex ${apex(0.2).toFixed(2)}m < ${CLEAR}m)`);
  ok(apex(0.8) > CLEAR, `a loaded charge clears it (apex ${apex(0.8).toFixed(2)}m > ${CLEAR}m)`);
  ok(src.includes('CAUGHT THE ${obstacle?.spec.label') && src.includes('clipsObstacle(obstacle.profile, fy, px, pz, obstacle.spec.clearance)'), 'the clip is a blown dunk, live, mid-flight — the feet against the sampled mesh (DUNK-CONTROL-JUICE)');
  ok(!src.includes('CLIPPED THE PROP — flushed anyway'), 'the unreachable "clipped but flushed" branch is gone');
  // the prop sits between the gather line and the rim — the path crosses it
  ok(DUNK_CONFIG.gatherZ > DUNK_CONFIG.rimZ, 'gather is in front of the rim');
}

// ── C. the run-up is judged and fed to the budget ─────────────────────────
{
  const src = readFileSync(new URL('../lib/babylon/modes/DunkMode.ts', import.meta.url), 'utf8');
  ok(src.includes('runUpPeak'), 'peak approach speed is measured');
  ok(src.includes('launchSpeed01'), 'run-up speed reaches the launch');
  ok(/launchSpeed01 \* 1\.0/.test(src), 'the judges see the run-up (difficulty term)');
  ok(!src.includes('Math.hypot(stickX, stickY) * 0.5'), 'the neutral-stick-at-release misread is gone');
  // and the player is TOLD — a refused trick with no feedback is a dropped input
  ok(src.includes('NOT ENOUGH AIR'), 'air refusal is surfaced, not silent');
}

// ── report ─────────────────────────────────────────────────────────────────
if (fail.length) {
  console.error(`dunk-depth-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`dunk-depth-tests: ${checks} checks green`);
