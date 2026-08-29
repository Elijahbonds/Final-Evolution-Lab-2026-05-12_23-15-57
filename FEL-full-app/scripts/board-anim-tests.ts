#!/usr/bin/env -S npx tsx
/**
 * scripts/board-anim-tests.ts — Mode 3 Phase 8 proof (headless).
 *   A. Every board-sport state resolves against the live clip registry.
 *   B. Priorities: bail > landing > grind > air (grab over flip over spin)
 *      > carve > cruise.
 *   C. Air pose selection reflects the trick in progress.
 *   D. Tree dedupes (no per-frame restarts).
 *
 * Run: npx tsx scripts/board-anim-tests.ts
 */
import assert from 'node:assert';
import { chooseBoardClip, BoardAnimTree, type BoardAnimInput } from '../lib/babylon/anim/boardTree';
import { isResolvable } from '../lib/babylon/anim/clipRegistry';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const BASE: BoardAnimInput = {
  speed01: 0, pushing: false, lean: 0, airborne: false, grabHeld: false,
  flipping: false, spinning: false, grinding: false, manual: false,
  landing: 'none', bailing: false,
};

console.log('\nA. all states resolve');
ok('every reachable state -> resolvable clip', () => {
  const probes: BoardAnimInput[] = [
    { ...BASE }, { ...BASE, speed01: 0.6 }, { ...BASE, pushing: true },
    { ...BASE, speed01: 0.6, lean: -0.8 }, { ...BASE, speed01: 0.6, lean: 0.8 },
    { ...BASE, airborne: true }, { ...BASE, airborne: true, grabHeld: true },
    { ...BASE, airborne: true, flipping: true }, { ...BASE, airborne: true, spinning: true },
    { ...BASE, grinding: true }, { ...BASE, manual: true },
    { ...BASE, landing: 'clean' }, { ...BASE, landing: 'sketchy' },
    { ...BASE, bailing: true }, { ...BASE, celebrating: true },
  ];
  const seen = new Set<string>();
  for (const i of probes) {
    const c = chooseBoardClip(i);
    assert.ok(isResolvable(c.clip), `${c.state} -> "${c.clip}" NOT resolvable`);
    assert.ok(c.fadeSec > 0, `${c.state} hard-cut`);
    seen.add(c.state);
  }
  assert.equal(seen.size, 15, `all 15 states, got ${seen.size}`);
});

console.log('\nB. priorities');
ok('bail > sketchy > grind > air > carve', () => {
  assert.equal(chooseBoardClip({ ...BASE, bailing: true, grinding: true }).state, 'bail');
  assert.equal(chooseBoardClip({ ...BASE, landing: 'sketchy', grinding: true }).state, 'land_sketchy');
  assert.equal(chooseBoardClip({ ...BASE, grinding: true, airborne: true }).state, 'grind');
  assert.equal(chooseBoardClip({ ...BASE, airborne: true, lean: 0.9, speed01: 0.8 }).state, 'air_tuck');
  assert.equal(chooseBoardClip({ ...BASE, lean: 0.9, speed01: 0.8 }).state, 'carve_right');
});

console.log('\nC. air pose follows the trick');
ok('grab > flip > spin > tuck', () => {
  assert.equal(chooseBoardClip({ ...BASE, airborne: true, grabHeld: true, flipping: true }).state, 'air_grab');
  assert.equal(chooseBoardClip({ ...BASE, airborne: true, flipping: true, spinning: true }).state, 'air_flip');
  assert.equal(chooseBoardClip({ ...BASE, airborne: true, spinning: true }).state, 'air_spin');
});

console.log('\nD. dedupe');
ok('same state plays once', () => {
  let plays = 0;
  const tree = new BoardAnimTree({ play: () => { plays++; } } as never);
  tree.update(BASE); tree.update(BASE);
  assert.equal(plays, 1);
  tree.update({ ...BASE, speed01: 0.6 });
  assert.equal(plays, 2);
});

console.log(`\n${pass} checks green`);
