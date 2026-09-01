#!/usr/bin/env -S npx tsx
// Karate VS — the rival must be beatable.
//
// RivalFightBrain's reactive guard rolled `difficulty * 0.5` on EVERY FRAME the
// player was mid-swing. A jab's startup is 120ms and a kick's 180ms, so at 60fps
// that is 7-11 rolls per attack: at difficulty 0.6 the rival guarded about 98%
// of everything thrown at it. Measured live, a run of kicks came back
// blocked / blocked / blocked / parried / whiff — not one HIT, and the player's
// damage output over a whole match was ZERO while their own HP fell to 13.
//
// That is not a hard opponent, it is an unbeatable one, and nothing reported it
// because every individual system was behaving exactly as written.

import { Vector3 } from '@babylonjs/core';
import { RivalFightBrain, FighterState, KARATE_ATTACKS } from '../lib/babylon/core/FightCore';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const DT = 1 / 60;
/** Frames a kick's 180ms startup occupies — the window the rival gets to react. */
const STARTUP_FRAMES = Math.round(0.180 / DT);

/** Drive one wind-up past the brain and report whether it decided to block. */
function blocksOneWindUp(difficulty: number): boolean {
  const brain = new RivalFightBrain(difficulty);
  const self = new Vector3(0, 0, 0);
  const foe = new Vector3(0, 0, 1.5);            // well inside reactive range
  const state = new FighterState();
  let blocked = false;
  for (let f = 0; f < STARTUP_FRAMES; f++) {
    if (brain.decide(DT, self, foe, state, true).block) blocked = true;
  }
  return blocked;
}

// ── A. the guard is a read, not a wall ─────────────────────────────────────
const N = 4000;
let guarded = 0;
for (let i = 0; i < N; i++) if (blocksOneWindUp(0.6)) guarded++;
const rate = guarded / N;

ok(rate > 0.15 && rate < 0.5,
  `A1 at difficulty 0.6 the rival guards ${(rate * 100).toFixed(0)}% of wind-ups — a real ` +
  'defence. Rolling per-frame instead of per-wind-up made this ~98%, and the player ' +
  'could not land a single hit in a whole match.');

// ── B. one roll per wind-up, no matter how long the startup ────────────────
// The tell for the old bug: a SLOWER attack was easier to guard, because it gave
// the rival more frames to roll. Startup length must not change the odds.
function guardRateOverFrames(frames: number): number {
  let hits = 0;
  for (let i = 0; i < N; i++) {
    const brain = new RivalFightBrain(0.6);
    const self = new Vector3(0, 0, 0), foe = new Vector3(0, 0, 1.5);
    const st = new FighterState();
    let b = false;
    for (let f = 0; f < frames; f++) if (brain.decide(DT, self, foe, st, true).block) b = true;
    if (b) hits++;
  }
  return hits / N;
}
const short = guardRateOverFrames(4);     // a fast jab
const long = guardRateOverFrames(24);     // a slow heavy
ok(Math.abs(short - long) < 0.08,
  `B1 a slow attack is not easier to guard than a fast one (${(short * 100).toFixed(0)}% vs ` +
  `${(long * 100).toFixed(0)}%) — startup length must not multiply the rival's odds`);

// ── C. the rival still guards, and still fights ────────────────────────────
ok(blocksOneWindUp(2.0), 'C1 a maxed-difficulty rival always reads the wind-up');
let neverGuards = 0;
for (let i = 0; i < 200; i++) if (blocksOneWindUp(0)) neverGuards++;
ok(neverGuards === 0, 'C2 a zero-difficulty rival never guards');

// ── D. the fight area is inset from the room ───────────────────────────────
// Every [FEL-FRAME] line this mode produced was a fighter at exactly the arena
// boundary with the camera crushed 0.3m behind them against the dojo wall.
import { readFileSync } from 'node:fs';
// Both karate modes hit this, and so did both half-court basketball venues: a
// play area exactly as big as its room leaves the camera nowhere to stand, and
// the hero drops out of frame at the boundary. One check, both modes.
const arenas: { file: string; roomHalf: number; pullback: number; label: string }[] = [
  // KarateVS fights in VenueKit.buildDojo's 18x18 floor with the 'fight' preset.
  { file: 'lib/babylon/modes/KarateVSMode.ts', roomHalf: 9, pullback: 4.2, label: 'Karate VS / dojo' },
  // KarateEndless fights on the karate_endless mat with the 'overShoulder' preset.
  { file: 'lib/babylon/modes/KarateEndlessMode.ts', roomHalf: 12, pullback: 3.1, label: 'Karate Endless / mat' },
];
for (const a of arenas) {
  const src = readFileSync(a.file, 'utf8');
  // Accept either spelling. Karate Endless's square clamp became a RADIAL one
  // (ARENA_HALF -> ARENA_RADIUS) because a square has corners, and a corner is
  // the one place a facing-derived camera cannot swing behind its subject. The
  // clearance arithmetic is the same either way -- it is the worst-case
  // distance from the origin to where a fighter can stand -- but the fallback
  // of '99' meant a rename silently turned this check into a guaranteed
  // failure rather than a skipped one, which is at least loud. Reading both
  // names keeps it honest through the next rename too.
  const decl = /const ARENA_(?:HALF|RADIUS) = ([0-9.]+)/.exec(src);
  ok(decl !== null, `D-${a.label}: found an arena extent to check in ${a.file}`);
  const half = Number(decl?.[1] ?? '99');
  ok(half + a.pullback <= a.roomHalf + 0.5,
    `D-${a.label}: a fighter at the arena edge (${half}) leaves room for the camera's ` +
    `${a.pullback}m pullback inside a room of half-extent ${a.roomHalf} — it did not, ` +
    'and the hero fell out of frame at the boundary');
}

if (fail.length) {
  console.error(`fight-balance-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`fight-balance-tests: ${checks} checks green — the rival is beatable`);
