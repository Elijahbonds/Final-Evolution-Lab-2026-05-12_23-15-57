#!/usr/bin/env -S npx tsx
// Dunk Duel depth checks — the owner re-lock: "head to head irl dunk is a
// REAL dunk contest platform" (the NBA Live 08 contest bar, head-to-head;
// a DIFFERENT mode from Dunk Contest).
//
// What this pass built, and what nothing covered:
//   A. VARIETY MEMORY per player — repeating your own style+prop combo costs
//      20% of difficulty and gets named ("THE JUDGES HAVE SEEN THAT ONE…").
//   B. THE RUN-UP IS PART OF THE DUNK — peak approach speed feeds the apex
//      (0.85× walk-up … 1.15× full runway) AND the judges' difficulty read.
//   C. THE CHAIR IS PHYSICAL — arm with d-pad (couch) or X (phone: its d-pad
//      is the movement stick); crossing it low KILLS the dunk mid-flight and
//      topples the chair. Clearing pays +2 difficulty.
//   D. Trap "published is not rendered", ninth occurrence: the bezel dropped
//      dunkNum, style, prop, charge, slamPulse and the JUDGE REVEAL — the
//      contest's moment of truth was invisible. Plus the host's recap read
//      'WIN' while the mode ends P1_WINS/P2_WINS/DUEL_TIED (every recap was
//      a 0–0 "DEAD HEAT!"), and the host had no canvasOwner guard.
//
// Source-level, the same way basketball-rules-tests asserts rims.
//
// Run: npx tsx scripts/dunkduel-depth-tests.ts

import { readFileSync } from 'node:fs';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const mode = readFileSync(new URL('../lib/babylon/modes/DunkDuelMode.ts', import.meta.url), 'utf8');
const host = readFileSync(new URL('../components/games/dunkduel-babylon.tsx', import.meta.url), 'utf8');

// ── A. variety memory ───────────────────────────────────────────────────────
{
  ok(mode.includes('usedCombos'), 'the judges keep a per-player memory');
  ok(/usedCombos:\s*\[Set<string>, Set<string>\]/.test(mode), 'the memory is PER PLAYER (answering a dunk is not repeating yourself)');
  ok(mode.includes('usedCombos[activeIdx].has(combo)'), 'repeat detection on the active player');
  ok(mode.includes('`${style}_${prop}`'), 'the combo key is style+prop');
  ok(mode.includes('varietyMod = isRepeat ? 0.8 : 1'), 'a repeat costs 20% of difficulty');
  ok(mode.includes('JUDGES HAVE SEEN THAT ONE'), 'the penalty is named out loud (in the result banner — a standalone banner is clobbered same-tick by the score banner)');
}

// ── B. the run-up is part of the dunk ───────────────────────────────────────
{
  ok(mode.includes('runUpPeak = Math.max(runUpPeak'), 'peak approach speed is measured');
  ok(mode.includes('launchSpeed01'), 'the speed becomes a 0..1 budget');
  ok(/\(1\.05 \+ charge \* 0\.55\) \* \(0\.85 \+ launchSpeed01 \* 0\.3\)/.test(mode), 'run-up speed scales the apex — a walk-up caps the jump');
  ok(mode.includes('launchSpeed01 * 1.0'), 'the judges see the runway attack');
  ok(mode.includes('come in FASTER'), 'the hint teaches the run-up');
}

// ── C. the chair is physical ────────────────────────────────────────────────
{
  // DUNK-CONTROL-JUICE (2026-09-08): the chair box is gone — the duel dunks over the contest's car / barrier / crate (real meshes, sampled hitboxes)
  ok(mode.includes("spawnDunkObstacle(ctx.scene, p, rim, 'duel_obstacle')") && /OBSTACLE_SPECS\[/.test(mode), 'same obstacles as Dunk Contest (the shared OBSTACLE_SPECS table, spawned as real meshes)');   // 2026-09-16: the specs are read per kind (OBSTACLE_KINDS), not as `.car`
  ok(mode.includes('setProp'), 'the chair is armable per attempt');
  ok(mode.includes("e.dir === 'down'"), 'd-pad arms it (couch)');
  ok(mode.includes("e.btn === 'X'"), 'X arms it (phone — its d-pad is the stick)');
  ok(mode.includes('clipBlown'), 'clipping it blows the dunk');
  ok(mode.includes('obstacleClipped = true'), 'the clip latches');
  ok(mode.includes('clipsObstacle(obstacle.profile, fy, px, pz, obstacle.spec.clearance)'), 'the lowest foot under the mesh top (plus its clearance) = blown');
  ok(mode.includes('toppling'), 'the chair topples with you');
  ok(mode.includes('CAUGHT THE ${obstacle?.spec.label'), 'the failure is named (CAR / BARRIER / CRATE)');
  ok(mode.includes('PROP_BONUS[prop]'), 'clearing it pays the judges');
}

// ── D. the bezel renders the contest (trap #4, ninth occurrence) ────────────
for (const field of ['p1Score', 'p2Score', 'activePlayer', 'dunkNum', 'style', 'prop', 'charge', 'slamPulse', 'judgeReveal', 'banner', 'hint']) {
  ok(new RegExp(`hud\\.${field}\\b`).test(host), `bezel renders hud.${field}`);
  ok(mode.includes(field), `mode publishes ${field}`);
}
{
  // the recap tells the truth about the mode's real outcomes
  ok(host.includes("'P1_WINS'") && host.includes("'P2_WINS'") && host.includes("'DUEL_TIED'"), 'recap matches the mode outcomes');
  ok(host.includes('r.stats?.p1') && host.includes('r.stats?.p2'), 'recap reads the real stats keys');
  ok(!host.includes("r.outcome === 'WIN'"), "the dead 'WIN' check is gone");
  // one engine per canvas
  ok(host.includes('canvasOwner = new WeakMap'), 'canvasOwner guard (StrictMode black-frame disease)');
  ok(host.includes('onEndRef'), 'effect does not depend on onEnd identity');
  // phones
  const verbs = readFileSync(new URL('../lib/babylon/ui/modeVerbs.ts', import.meta.url), 'utf8');
  const vblock = verbs.slice(verbs.indexOf('dunkduel:'), verbs.indexOf('})', verbs.indexOf('dunkduel:')));
  for (const label of ['SLAM', 'STYLE', 'PROP', 'RUN']) ok(vblock.includes(label), `touch verb ${label}`);   // DUNK-CONTROL-JUICE: X cycles the PROP (car / barrier / crate), the chair is gone
  const cl = readFileSync(new URL('../lib/controller-link/schemas/registry.ts', import.meta.url), 'utf8');
  ok(/modeId: 'dunkduel'/.test(cl), 'Controller Link has a dunkduel schema');
  // the camera follows whose turn it is
  ok(mode.includes('ctx.heroRef.current = active().root'), 'FrameGuard tracks the active player (P2 is not framed off P1)');
}

if (fail.length) {
  console.error(`dunkduel-depth-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`dunkduel-depth-tests: ${checks} checks green`);
