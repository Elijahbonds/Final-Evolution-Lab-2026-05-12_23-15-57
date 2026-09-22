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
import { COMBAT_ARENAS, type CombatArena, type CombatModeId } from '../lib/babylon/combat/arenas';
import { FOLLOW_PRESETS } from '../lib/babylon/core/CameraDirector';

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

/** Phase 5 (mixed combat D2): did the brain STEP off the line during the wind-up? */
function stepsOneWindUp(difficulty: number): boolean {
  const brain = new RivalFightBrain(difficulty);
  const self = new Vector3(0, 0, 0);
  const foe = new Vector3(0, 0, 1.5);
  const state = new FighterState();
  for (let f = 0; f < STARTUP_FRAMES; f++) {
    const a = brain.decide(DT, self, foe, state, true);
    if (!a.block && Math.abs(a.moveX) > 0.8 && Math.abs(a.moveY) < 0.2) return true;   // a full-speed lateral burst — circling moves at 0.6
  }
  return false;
}
/** A read of the wind-up is either answer — judged on ONE brain's one roll. */
function readsOneWindUp(difficulty: number): boolean {
  const brain = new RivalFightBrain(difficulty);
  const self = new Vector3(0, 0, 0);
  const foe = new Vector3(0, 0, 1.5);
  const state = new FighterState();
  for (let f = 0; f < STARTUP_FRAMES; f++) {
    const a = brain.decide(DT, self, foe, state, true);
    if (a.block || (Math.abs(a.moveX) > 0.8 && Math.abs(a.moveY) < 0.2)) return true;
  }
  return false;
}

// ── A. the guard is a read, not a wall ─────────────────────────────────────
const N = 4000;
let guarded = 0;
for (let i = 0; i < N; i++) if (blocksOneWindUp(0.6)) guarded++;
const rate = guarded / N;

let stepped = 0;
for (let i = 0; i < N; i++) if (stepsOneWindUp(0.6)) stepped++;
const stepRate = stepped / N;
ok(stepRate > 0.1 && stepRate < 0.35,
  `A2 at difficulty 0.6 the rival deliberately STEPS ${(stepRate * 100).toFixed(0)}% of wind-ups — ` +
  'mixed combat D2: verticals are read with feet as well as with the guard');

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
ok(readsOneWindUp(2.0), 'C1 a maxed-difficulty rival always reads the wind-up (guard or step)');
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
// THE ARENA IS DATA NOW (2026-09-18). This check used to GREP each mode file for `const ARENA_HALF = …` and compare it
// against a room half-extent written down here, with a `?? '99'` fallback so a rename failed loudly instead of
// silently. The rename came: COMBAT ARENAS replaced four hardcoded room constants (karate's 7.5 disc, Karate VS's 4.5
// box, Mixed's 6.2 octagon, Duel's 6.5 disc) with a table of seven arenas, each carrying its own shape and the
// half-extent of the floor its venue paints. So the grep found nothing, took the 99, and reported the dojo as
// catastrophically oversized — a true failure of a check that no longer knew where to look.
//
// Asked properly, it is a better question than it was: every arena, against every mode that serves it, with both
// numbers read from the modules that own them. The worst case for a fighter is the point of the arena FURTHEST from
// the origin — for a box that is the corner, not the wall, which is exactly the case the old square-vs-radial note
// worried about.
const MODE_CAM: Record<CombatModeId, string> = {
  karate: 'overShoulder',       // KarateEndlessMode camPreset
  karate_vs: 'fight',           // KarateVSMode camPreset
  mixedcombat: 'fight',         // MixedCombatMode camPreset
  duel: 'duel',                 // DuelMode camPreset
  showdown: 'fight',             // ShowdownMode camPreset (phase 7: showdown fights in the arenas)
};
/** How far from the origin a fighter can get: a disc's rim, or a box's CORNER. */
const worstReach = (a: CombatArena): number =>
  (a.shape.kind === 'disc' ? a.shape.radius : Math.hypot(a.shape.halfX, a.shape.halfZ));

for (const arena of COMBAT_ARENAS) {
  for (const mode of arena.modes) {
    const preset = FOLLOW_PRESETS[MODE_CAM[mode]];
    ok(!!preset, `D-${arena.id}/${mode}: camera preset "${MODE_CAM[mode]}" exists in FOLLOW_PRESETS`);
    if (!preset) continue;
    // The camera stands `distance` behind its subject and swings `shoulderOffset` off the axis; the worst case is
    // both at once, which is the diagonal.
    const pullback = Math.hypot(preset.distance, preset.shoulderOffset ?? 0);
    ok(worstReach(arena) + pullback <= arena.look.floorHalf + 0.5,
      `D-${arena.id}/${mode}: a fighter at the arena's furthest point (${worstReach(arena).toFixed(1)}m) leaves room ` +
      `for the ${MODE_CAM[mode]} camera's ${pullback.toFixed(1)}m pullback inside a floor of half-extent ` +
      `${arena.look.floorHalf} — it did not, and the hero falls out of frame at the boundary`);
  }
}

if (fail.length) {
  console.error(`fight-balance-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`fight-balance-tests: ${checks} checks green — the rival is beatable`);
