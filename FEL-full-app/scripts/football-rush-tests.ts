#!/usr/bin/env -S npx tsx
// Football (Rush) convergence pass — the pre-snap, the phone join, the bezel.
//
// The gameplay mechanics are mode-inline state (snap gating is a timer and a
// pursuit hold — covered live by football-drive.mts, which measures the hold
// and the auto-snap). What a headless suite CAN pin down against regression:
//   A. the pre-snap exists and gates both sides (source-level, the same way
//      basketball-rules-tests asserts rims);
//   B. a phone can JOIN (Controller Link entry with stick movement — a d-pad
//      named anything but 'move' gives every verb except steering);
//   C. the host renders what the mode publishes (trap "HUD state is not a
//      bezel" — SIXTH occurrence: it drew hud.evaded, which has never
//      existed; the mode publishes `evades`);
//   D. the snap is the PLAYER'S call (stick-forward or any face button), with
//      an auto-snap so an idle phone never stalls.
//
// Run: npx tsx scripts/football-rush-tests.ts

import { readFileSync } from 'node:fs';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const mode = readFileSync(new URL('../lib/babylon/modes/FootballRushMode.ts', import.meta.url), 'utf8');
const host = readFileSync(new URL('../components/games/football-babylon.tsx', import.meta.url), 'utf8');
const link = readFileSync(new URL('../lib/controller-link/schemas/registry.ts', import.meta.url), 'utf8');

// ── A. the pre-snap is real ────────────────────────────────────────────────
{
  ok(mode.includes('preSnap') && mode.includes('function snap('), 'a pre-snap state and a snap() exist');
  ok(mode.includes('if (preSnap) {') && /preSnapT \+= dt/.test(mode), 'the update loop is gated on the snap');
  ok(mode.includes('PRESNAP_AUTOSNAP_SEC'), 'the auto-snap exists (an idle phone never stalls)');
  // pursuit starts inside snap() — since the pre-snap disguise (2026-09-03) the
  // snap loop is a block (a shown blitz may drop and start late), so look for
  // startPursuit inside snap()'s body and NOT in the alignment loop.
  const snapBody = mode.slice(mode.indexOf('function snap('), mode.indexOf('function ', mode.indexOf('function snap(') + 10));
  const spawnBody = mode.slice(mode.indexOf('function spawnDefense('), mode.indexOf('function newDrive('));
  ok(/m\.startPursuit\(\)/.test(snapBody) && !/startPursuit\(\)/.test(spawnBody.replace(/\/\/.*$/gm, '')),
    'pursuit starts AT the snap, not at the spawn');
  ok(!/const mob = new Mob[^;]*;\s*\n\s*mob\.startPursuit\(\)/.test(mode), 'no spawn-time pursuit left');
  ok(mode.includes('READ THE FRONT'), 'the read is presented to the player');
  ok(/e\.y < -0\.4/.test(mode), 'the snap call is a forward push');
}

// ── B. a phone can join, and can steer ─────────────────────────────────────
{
  ok(/football:\s*{[\s\S]*?modeId: 'football'/.test(link), 'football has a Controller Link entry');
  const entry = link.slice(link.indexOf("football: {"), link.indexOf("football: {") + 800);
  ok(entry.includes("action: 'move'"), "the d-pad is 'move' — it forwards as a LEFT STICK, so a phone can steer");
  for (const verb of ['HURDLE', 'JUKE L', 'JUKE R', 'TRUCK']) {
    ok(entry.includes(verb), `phone offers ${verb}`);
  }
  ok(/TRUCK'\s*,?\s*hold: true/.test(entry), 'TRUCK is a HOLD (the trigger idiom), not a tap');
}

// ── C. the bezel renders the drive ─────────────────────────────────────────
{
  for (const field of ['down', 'toGo', 'yards', 'evades', 'score', 'banner', 'hint', 'breakaway', 'truckReady']) {
    ok(new RegExp(`hud\\.${field}\\b`).test(host), `host renders hud.${field}`);
    ok(mode.includes(field), `mode publishes ${field}`);
  }
  ok(!host.includes('hud.evaded'), 'hud.evaded (never published) is gone from the host');
}

if (fail.length) {
  console.error(`football-rush-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`football-rush-tests: ${checks} checks green`);
