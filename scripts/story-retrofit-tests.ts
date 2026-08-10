#!/usr/bin/env -S yarn tsx
/**
 * scripts/story-retrofit-tests.ts
 * ===============================
 * M10 Row 6 retrofit invariant — the live Story hub + boss/rail scenes and the
 * donor StoryMode board engine (StoryCore).
 *
 * HONEST scope (see M10 manifest):
 *   The live Story surface KEEPS its richer assets per M10 rule #1: the
 *   server-authoritative campaign hub (components/story-map.tsx + lib/story-data
 *   + progression) with 13 zones and dedicated 3D boss/rail SCENES
 *   (glitch-boss-game "THE VERTIGO", rail-grind-game "NEXUS RAIL"). The donor
 *   board engine (StoryCore) is the proven turn-based board-runner archetype
 *   (d6 -> hops -> space effects -> zone bosses). This harness pins the CONTRACT
 *   that the app's story taxonomy maps onto the donor board engine AND that the
 *   app is AHEAD of the reference in the one specced place: the boss/rail scenes
 *   are folded in as the board's rail/flight score-bonus SUB-SECTIONS (the
 *   engineering v1 skipped these; FEL awards them).
 *
 * Pinned invariants:
 *   1. The app's campaign node taxonomy is exactly {rail, boss} and every zone
 *      has exactly one boss node (the win condition the board engine encodes).
 *   2. The donor board carries the same two roles: 'boss' fight spaces AND
 *      rail/flight spaces — the sub-sections the app's boss/rail scenes become.
 *   3. AHEAD-OF-REFERENCE FOLD: every rail/flight space awards a positive shard
 *      bonus, and a full playthrough actually accrues shards from rail/flight
 *      landings (the fold is live, not skipped).
 *   4. The board engine's win condition matches the campaign's: defeating every
 *      zone boss drives the FSM to `complete` (all bosses defeated).
 *
 * Deterministic: seeded PRNG, fixed 60fps clock. No RNG leaks, no rendering.
 */

import assert from 'node:assert';
import { StoryCore } from '../lib/feel/cores/story-core';
import { makeStorySkin } from '../lib/feel/cores/story-skin';
import { BOARD_SPACES, ZONE_BOSSES, TOTAL_BOSSES } from '../lib/feel/cores/story-board-data';
import { CAMPAIGN } from '../lib/story-data';

const DT_SEC = 1 / 60;
function phaseOf(c: StoryCore): string { return c.phase as string; }
function settle(c: StoryCore, max = 20000): void {
  let n = 0;
  while (phaseOf(c) === 'moving') { c.tick(DT_SEC); if (++n > max) throw new Error('never settled'); }
}
let passed = 0;
function check(name: string, fn: () => void): void { fn(); passed++; console.log('  ✓ ' + name); }

// ---- 1. App campaign taxonomy: {rail, boss}, one boss per zone ------------
check('every campaign zone has rail nodes and exactly one boss node', () => {
  const kinds = new Set<string>();
  for (const z of CAMPAIGN.zones) {
    assert.strictEqual(z.rail.length, 3, `${z.id}: three rail nodes`);
    assert.ok(z.boss && z.boss.kind === 'boss', `${z.id}: one boss node`);
    z.rail.forEach((r) => kinds.add(r.kind));
    kinds.add(z.boss.kind);
  }
  assert.deepStrictEqual([...kinds].sort(), ['boss', 'rail'], 'taxonomy is {rail, boss}');
});

// ---- 2. Donor board carries the same two roles ---------------------------
check('the donor board has boss fights AND rail/flight sub-section spaces', () => {
  const types = new Set(BOARD_SPACES.map((s) => s.type));
  assert.ok(types.has('boss'), 'board has boss fights');
  assert.ok(types.has('rail'), 'board has rail sub-sections');
  assert.ok(types.has('flight'), 'board has flight sub-sections');
  // Every zone boss in the roster is placed on the board.
  const bossZones = new Set(BOARD_SPACES.filter((s) => s.type === 'boss').map((s) => s.zone));
  for (const zone of Object.keys(ZONE_BOSSES)) {
    assert.ok(bossZones.has(zone as any), `zone ${zone} has a boss tile`);
  }
});

// ---- 3. Ahead-of-reference: rail/flight fold into positive shard bonuses --
check('rail/flight spaces award positive shard bonuses (the v1 fold)', () => {
  const folded = BOARD_SPACES.filter((s) => s.type === 'rail' || s.type === 'flight');
  assert.ok(folded.length > 0, 'there are folded sub-section spaces');
  assert.ok(folded.every((s) => s.bonus > 0), 'every rail/flight space pays shards');
});

check('a full playthrough actually accrues shards from rail/flight landings', () => {
  let foldedShards = 0;
  const skin = makeStorySkin({
    onSpace: (space) => {
      if (space.type === 'rail' || space.type === 'flight') foldedShards += space.bonus;
    },
  });
  const c = new StoryCore(skin, { rng: () => 0 });
  let guard = 0;
  while (phaseOf(c) !== 'complete' && guard++ < 6000) {
    const p = phaseOf(c);
    if (p === 'traversal') { c.roll(); settle(c); }
    else if (p === 'boss') { c.strike(); c.tick(DT_SEC); }
    else c.tick(DT_SEC);
  }
  assert.strictEqual(phaseOf(c), 'complete', 'story completed');
  assert.ok(foldedShards > 0, 'rail/flight sub-sections contributed shards');
  assert.ok(c.state.shards >= foldedShards, 'folded shards are part of the score');
});

// ---- 4. Board win condition = clear every zone boss ----------------------
check('defeating every zone boss drives the board engine to complete', () => {
  const c = new StoryCore(makeStorySkin(), { rng: () => 0 });
  let guard = 0;
  while (phaseOf(c) !== 'complete' && guard++ < 6000) {
    const p = phaseOf(c);
    if (p === 'traversal') { c.roll(); settle(c); }
    else if (p === 'boss') { c.strike(); c.tick(DT_SEC); }
    else c.tick(DT_SEC);
  }
  assert.strictEqual(phaseOf(c), 'complete');
  assert.strictEqual(c.state.bossesDefeated, TOTAL_BOSSES, 'all zone bosses cleared');
  assert.strictEqual(c.state.finished, true, 'finished flag set');
});

console.log(`\nstory-retrofit-tests: ${passed} checks passed`);
