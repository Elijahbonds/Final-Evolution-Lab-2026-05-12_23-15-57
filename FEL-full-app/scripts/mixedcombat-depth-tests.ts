#!/usr/bin/env -S npx tsx
// Mixed Combat depth checks (Soul Calibur benchmark, owner re-lock).
//
// What this pass built, and what nothing covered:
//   A. THE LINE GRAMMAR — Soul Calibur's core defensive skill is stepping a
//      vertical; before this pass resolveStrike checked DISTANCE only, so
//      lateral movement could never evade anything and the "8-way" fight was
//      a range slider. Now verticals whiff past a defender more than
//      STEP_EVADE_M off the attack line; horizontals catch steppers.
//      The check is OPT-IN per call (lateralOffsetM param): the karate
//      modes never pass it, so their signed-off behavior is unchanged.
//   B. Trap "published is not rendered" (8th occurrence): the mode published
//      `hint` every phase (the loadout instructions!) and the bezel never
//      drew it.
//   C. Edge legibility: the ring-out is the signature — the bezel now warns
//      when YOUR back is at the rim and names the opening when the rival's is.
//   D. Controller Link had no mixedcombat entry — a phone silently never
//      joined. Schema added (dpad as 'move'; the loadout pick ALSO accepts a
//      stick flick so phone players aren't locked into fists).
//
// Pure where possible (FightCore is import-safe: babylon math only),
// source-level for the wiring, the same way basketball-rules-tests asserts rims.
//
// Run: npx tsx scripts/mixedcombat-depth-tests.ts

import { readFileSync } from 'node:fs';
import {
  FighterState, resolveStrike, KARATE_ATTACKS, STAFF_ATTACKS, SPECIAL_ATTACK,
  STEP_EVADE_M, STEP_CHI_GAIN, CHI_MAX,
} from '../lib/babylon/core/FightCore';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

// ── A. the line grammar (pure) ──────────────────────────────────────────────
{
  const defender = () => new FighterState(100);
  const NOW = 10_000; // long past any block press

  // verticals are steppable, horizontals are not — in BOTH sets
  for (const [setName, set] of [['karate', KARATE_ATTACKS], ['staff', STAFF_ATTACKS]] as const) {
    ok(set.jab.line === 'vertical' && set.heavy.line === 'vertical', `${setName}: jab+heavy are vertical`);
    ok(set.kick.line === 'horizontal', `${setName}: the sweep/kick is horizontal`);
    const d1 = defender();
    ok(resolveStrike(set.jab, 1.0, d1, NOW, STEP_EVADE_M + 0.3) === 'stepped', `${setName}: stepped vertical whiffs past`);
    const d2 = defender();
    ok(resolveStrike(set.jab, 1.0, d2, NOW, 0.1) === 'hit', `${setName}: on-line vertical connects`);
    const d3 = defender();
    ok(resolveStrike(set.kick, 1.0, d3, NOW, STEP_EVADE_M + 0.3) === 'hit', `${setName}: the sweep catches the stepper`);
  }
  ok(SPECIAL_ATTACK.line === 'horizontal', 'the DRAGON is not steppable — beat it with range, guard or parry');

  // precedence: a step never beats a block or a parry (defense is layered)
  const blocker = new FighterState(100);
  blocker.pressBlock(NOW - 500);
  ok(resolveStrike(KARATE_ATTACKS.jab, 1.0, blocker, NOW, STEP_EVADE_M + 0.3) === 'blocked', 'block beats the step check');
  const parrier = new FighterState(100);
  parrier.pressBlock(NOW - 50); // inside the parry window
  ok(resolveStrike(KARATE_ATTACKS.jab, 1.0, parrier, NOW, STEP_EVADE_M + 0.3) === 'parried', 'parry beats the step check');
  const stunned = new FighterState(100);
  stunned.stunSec = 1;
  stunned.tick(0.001); // still stunned
  ok(resolveStrike(KARATE_ATTACKS.jab, 1.0, stunned, NOW, STEP_EVADE_M + 0.3) === 'hit', 'a stunned fighter cannot step');

  // the karate modes' call shape (no lateral arg) is untouched by lines
  const plain = new FighterState(100);
  ok(resolveStrike(KARATE_ATTACKS.jab, 1.0, plain, NOW) === 'hit', 'no lateralOffset → no step check (karate sign-offs stand)');

  // stepping PAYS the defender
  ok(STEP_CHI_GAIN > 0 && STEP_CHI_GAIN <= CHI_MAX, `the step reward is real chi (+${STEP_CHI_GAIN})`);
}

// ── B/C. the bezel renders what the mode publishes (trap #4 watch) ─────────
{
  const mode = readFileSync(new URL('../lib/babylon/modes/MixedCombatMode.ts', import.meta.url), 'utf8');
  const host = readFileSync(new URL('../components/games/mixedcombat-babylon.tsx', import.meta.url), 'utf8');
  for (const field of ['hp', 'foeHp', 'guard', 'foeGuard', 'chi', 'foeChi', 'round', 'wins', 'foeWins', 'loadout', 'banner', 'hint', 'edge']) {
    ok(mode.includes(field), `mode publishes ${field}`);
    ok(new RegExp(`hud\\.${field}\\b`).test(host), `bezel renders hud.${field}`);
  }
  // the edge readout has both directions and both are computed from the ring
  ok(mode.includes("'EDGE BEHIND YOU'") && mode.includes("'RIVAL ON THE EDGE'"), 'edge warning names both dangers');
  ok(mode.includes('RING_RADIUS - 1.6'), 'the danger zone is measured off the real ring radius');
  // the fight hint teaches the grammar
  ok(mode.includes('side-step verticals'), 'the fight hint teaches step-vs-sweep');
}

// ── D. phones can play ──────────────────────────────────────────────────────
{
  const registry = readFileSync(new URL('../lib/controller-link/schemas/registry.ts', import.meta.url), 'utf8');
  ok(/modeId: 'mixedcombat'/.test(registry), 'Controller Link has a mixedcombat schema');
  const block = registry.slice(registry.indexOf("modeId: 'mixedcombat'"));
  ok(block.includes("action: 'move'"), 'the schema gives phones movement (dpad as move)');
  for (const [action, label] of [['A', 'STRIKE'], ['B', 'KICK'], ['X', 'GUARD'], ['Y', 'HEAVY']] as const) {
    ok(block.includes(`action: '${action}'`) && block.includes(`label: '${label}'`), `schema has ${label} on ${action}`);
  }
  // and the loadout pick works from a stick (what phones actually send)
  const mode = readFileSync(new URL('../lib/babylon/modes/MixedCombatMode.ts', import.meta.url), 'utf8');
  ok(mode.includes("e.t === 'stick' && e.side === 'L' && Math.abs(e.y) > 0.6"), 'loadout pick accepts a stick flick (phones)');
}

// ── the mode actually enforces the line at impact (wiring) ──────────────────
{
  const mode = readFileSync(new URL('../lib/babylon/modes/MixedCombatMode.ts', import.meta.url), 'utf8');
  ok(mode.includes('resolveStrike(atk, dist, defState, now(), lateral)'), 'the mode passes the lateral offset into resolution');
  ok(mode.includes("'stepped'"), 'the mode answers the stepped outcome');
  ok(mode.includes('STEPPED IT!'), 'the player is told when THEIR step worked');
  ok(mode.includes('STEP_CHI_GAIN'), 'the step pays chi');
  // commitment: the striker is NOT re-faced mid-swing (measured: per-frame
  // auto-facing erased every step before this)
  // BIOMECH-WAVE2 (2026-09-09): the same guard, now in front of a SLEWED lock-on (lockOnYaw) instead of a raw atan2
  // write — the commitment is what this check is about, not the shape of the turn.
  ok(/if \(!striking\b.*\bplayer\.root\.rotation\.y =/.test(mode) && /if \(!foeStriking\b.*\brival\.root\.rotation\.y =/.test(mode), 'strikers are committed to their line');
  ok(mode.includes('lockOnYaw(') && !/rotation\.y = Math\.atan2\(to\.x/.test(mode), 'the lock-on TURNS onto the opponent (it never snaps the root)');
  ok(mode.includes('committedYaw'), 'impact is measured against the committed facing');
}

// ── E. the pit is watched (L4) ──────────────────────────────────────────────
{
  const mode = readFileSync(new URL('../lib/babylon/modes/MixedCombatMode.ts', import.meta.url), 'utf8');
  ok(mode.includes('new Onlookers'), 'the octagon has a crowd ring');
  ok(mode.includes('gallery?.update(dt)'), 'the crowd animates');
  ok(mode.includes('gallery?.dispose()'), 'the crowd is torn down');
  ok(mode.includes('gallery?.cheer(1)'), 'a ring-out gets the biggest cheer');
  ok(mode.includes('gallery?.cheer(0.6)'), 'a guard break gets an answer');
}

if (fail.length) {
  console.error(`mixedcombat-depth-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`mixedcombat-depth-tests: ${checks} checks green`);
