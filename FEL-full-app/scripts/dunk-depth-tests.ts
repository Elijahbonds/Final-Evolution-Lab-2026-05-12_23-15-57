#!/usr/bin/env -S npx tsx
// Dunk Contest depth pass — the approach is part of the dunk, and the prop
// is physical.
//
//   AIR IS A BUDGET — the run-up's peak speed buys airtime, and at the takeoff
//     that airtime decides how many tricks the flight can hold (one, or two).
//     A walk-up and a runway attack used to have the same trick menu (airTotal
//     was computed and never read); then, for a while, the budget was also
//     consulted mid-flight and refused presses inside cue windows the table had
//     already opened. The run-up owns HOW MANY; the cue table owns WHEN.
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
  const decayTo = (f: DunkFlight, frac: number) => { while (f.airRemaining01 > frac && f.phase === 'airborne') f.update(DT); };
  decayTo(slow, 0.35);
  decayTo(fast, 0.35);
  ok(slow.phase === 'slamWindow' || slow.airRemaining01 <= 0.35, 'slow flight decays to the window');
  ok(fast.airRemaining01 > 0.30, 'fast flight still has usable air');

  // THE RUN-UP BUYS THE MENU, AND IT BUYS IT AT THE TAKEOFF (DUNK-BODY-MID, 2026-09-09)
  const half = new DunkFlight(); half.launch(0.7, 3);   // a real but not full attack: 0.85 + 0.385 + 0.15 = 1.385 — two
  ok(slow.trickCapacity === 1 && half.trickCapacity === 2 && fast.trickCapacity === 3, `a walk-up holds one trick, a runway attack two, a full-speed attack three (${slow.trickCapacity}/${half.trickCapacity}/${fast.trickCapacity})`);

  const rich = new DunkFlight();
  rich.launch(1.0, 3);
  rich.feedInput(dpad('up', true));
  ok(rich.feedInput(btn('A'))?.id === 'windmill', 'trick fires with air in the tank');
  ok(rich.rejectedForAir === false, 'no rejection flag on a paid trick');

  // A FIRST TRICK IS THE CUE TABLE'S CALL, NEVER THE BUDGET'S. This used to be refused for air deep in a walk-up's
  // flight — inside a cue window the game had already declared open, which reads as a dropped input, not as a risk.
  const poor = new DunkFlight();
  poor.launch(0.1, 3);                        // ~0.9 s of air
  decayTo(poor, 0.2);                         // nearly out
  poor.feedInput(dpad('up', true));
  ok(poor.feedInput(btn('A'))?.id === 'windmill', "a walk-up's FIRST trick still fires, deep into the flight");
  ok(poor.rejectedForAir === false, 'no air refusal on a first trick');

  // ...but the SECOND one is exactly what a walk-up did not buy, and it says so
  poor.feedInput(dpad('up', false)); poor.feedInput(dpad('right', true));
  const second = poor.feedInput(btn('B'));
  ok(second === null && poor.rejectedForAir === true && poor.refusal === 'air', "a walk-up's second trick is refused AND flagged");
  ok(poor.attempt.tricks.length === 1, 'a refused trick is not banked');

  // the combo the run-up DID buy fires at the beat the old budget refused it on (measured: "refused windmill @0.49: air")
  const mid = new DunkFlight();
  mid.launch(1.0, 3);
  mid.feedInput(dpad('right', true));
  ok(mid.feedInput(btn('B'))?.id === 'spin360', 'the 360 fires at the rise');
  for (let i = 0; i < 12; i++) mid.update(DT);   // clip 0.30 → ~0.49
  mid.feedInput(dpad('right', false)); mid.feedInput(dpad('up', true));
  ok(mid.feedInput(btn('A'))?.id === 'windmill', 'the WINDMILL fires on top of the 360 — the run-up bought both');
  ok(mid.attempt.isCombo, 'and the pair is judged as a combo');

  // ONE DIRECTION, ONE TRICK: the A that follows a trick under the same hold is the SLAM, not a second trick
  const held = new DunkFlight();
  held.launch(1.0, 3);
  held.feedInput(dpad('up', true));
  held.feedInput(btn('A'));
  held.recognizer.spend();
  ok(held.recognizer.dirSpent, 'a direction that has thrown is spent until it is let go');
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
  ok(/flight\.launch\(Math\.min\(1, charge \* 0\.5 \+ launchSpeed01 \* 0\.5\)/.test(src) && /charge, launchSpeed01, styleTier/.test(src), 'the judges see the run-up (the launch budget and the judge payload)');
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
