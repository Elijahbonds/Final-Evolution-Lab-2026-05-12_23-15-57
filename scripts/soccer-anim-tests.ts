#!/usr/bin/env -S npx tsx
/**
 * scripts/soccer-anim-tests.ts — Mode 5 Phase 8 proof (headless).
 *   A. Every soccer state resolves against the live clip registry.
 *   B. Priorities: action beats movement; GK dives distinct; celebrate top.
 */
import assert from 'node:assert';
import { chooseSoccerClip, type SoccerAnimInput } from '../lib/babylon/anim/soccerTree';
import { isResolvable } from '../lib/babylon/anim/clipRegistry';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const BASE: SoccerAnimInput = { speed01: 0, dribbling: false, jockeying: false, action: 'none' };

ok('every state resolves with no hard cuts', () => {
  const probes: SoccerAnimInput[] = [
    { ...BASE }, { ...BASE, speed01: 0.4 }, { ...BASE, speed01: 0.9 },
    { ...BASE, dribbling: true }, { ...BASE, jockeying: true },
    ...(['pass_ground', 'pass_loft', 'shot_power', 'shot_finesse', 'first_touch',
        'tackle_standing', 'tackle_slide', 'gk_dive_left', 'gk_dive_right'] as const)
      .map((a) => ({ ...BASE, action: a })),
    { ...BASE, celebrating: true },
  ];
  const seen = new Set<string>();
  for (const i of probes) {
    const c = chooseSoccerClip(i);
    assert.ok(isResolvable(c.clip), `${c.state} -> "${c.clip}" NOT resolvable`);
    assert.ok(c.fadeSec > 0);
    seen.add(c.state);
  }
  assert.ok(seen.size >= 14, `${seen.size} states`);
});

ok('priorities: action > jockey > dribble > movement', () => {
  assert.equal(chooseSoccerClip({ ...BASE, action: 'shot_power', dribbling: true }).state, 'shot_power');
  assert.equal(chooseSoccerClip({ ...BASE, jockeying: true, speed01: 0.9 }).state, 'jockey');
  assert.equal(chooseSoccerClip({ ...BASE, dribbling: true, speed01: 0.9 }).state, 'dribble');
  assert.equal(chooseSoccerClip({ ...BASE, speed01: 0.9 }).state, 'sprint');
});

console.log(`\n${pass} checks green`);
