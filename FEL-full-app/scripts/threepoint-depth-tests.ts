#!/usr/bin/env -S npx tsx
// 3PT depth pass — the rival presentation, and the bezel that never drew it.
//
// The contest layer (standings board, round, money ball, THE NEED) was
// computed and published every frame — and the shipping host rendered NONE
// of it. score / rack / clock / meter / banner only. The whole contest was
// invisible outside the dev route's JSON dump: trap "HUD state is not a
// bezel", fifth occurrence.
//
//   A. every field pushHud publishes (except the phone-only tilt charge) is
//      rendered by the shipping host — source-level contract, the same way
//      basketball-rules-tests asserts rims;
//   B. the reveal is STAGED (a queue, a cadence) and the finalists post
//      BEFORE the player's final run (THE NEED exists);
//   C. the sort sinks unposted shooters to the bottom ("—" cards last).
//
// Run: npx tsx scripts/threepoint-depth-tests.ts

import { readFileSync } from 'node:fs';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const mode = readFileSync(new URL('../lib/babylon/modes/ThreePointMode.ts', import.meta.url), 'utf8');
const host = readFileSync(new URL('../components/games/three-point-babylon.tsx', import.meta.url), 'utf8');

// ── A. the host renders what the mode publishes ────────────────────────────
// `charge` is excluded on purpose: it is the phone tilt wind-up, consumed
// input-side, not a readout.
for (const field of ['score', 'rack', 'ball', 'streak', 'clock', 'meter', 'money', 'round', 'board', 'need', 'banner']) {
  ok(new RegExp(`hud\\.${field}\\b`).test(host), `host renders hud.${field}`);
  ok(mode.includes(`${field}:`), `mode publishes ${field}`);
}

// ── B. the reveal is staged, and the final is shot at a known number ───────
{
  ok(mode.includes('revealQueue'), 'a reveal queue exists');
  ok(/S\.revealT >= 0\.75/.test(mode), 'cards land one at a time (0.75s cadence)');
  ok(mode.includes("'SHOOTING…'"), "unposted rivals read as shooting, not zero");
  ok(mode.includes('finalistsPosting'), 'the finalists post before the player runs the final');
  ok(mode.includes('THE FIELD POSTS'), 'the field-posting beat is presented');
  ok(mode.includes('FINAL ROUND — YOUR RUN'), 'the player’s final run is announced');
  // THE NEED is max rival + 1 — an outright win, ties don't cut it
  ok(/need:.*\+ 1/.test(mode.replace(/\n/g, ' ')), 'THE NEED is the winning number, not the tie');
  // and it only shows during the player's final run, with the field posted
  ok(/need:[\s\S]*?finalistsPosting/.test(mode), 'need is gated on the field having posted');
}

// ── C. unposted shooters sink ──────────────────────────────────────────────
{
  ok(mode.includes("(b.shot ? b.score : -1)"), 'the board sort sinks unposted shooters');
}

if (fail.length) {
  console.error(`threepoint-depth-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`threepoint-depth-tests: ${checks} checks green`);
