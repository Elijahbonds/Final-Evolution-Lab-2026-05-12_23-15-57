#!/usr/bin/env -S npx tsx
/**
 * scripts/baseball-anim-tests.ts — Mode 6 Phase 8 proof (headless).
 *   A. Every baseball state resolves against the live clip registry.
 *   B. Priorities: slide/swing/throw beat movement; celebrate tops.
 */
import assert from 'node:assert';
import { chooseBaseballClip, type BaseballAnimInput } from '../lib/babylon/anim/baseballTree';
import { isResolvable } from '../lib/babylon/anim/clipRegistry';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const BASE: BaseballAnimInput = { pitching: false, windingUp: false, releasing: false, batting: false, swinging: null, fielding: 'none', throwing: false, running: false, sliding: false };

ok('every state resolves, no hard cuts', () => {
  const probes: BaseballAnimInput[] = [
    { ...BASE }, { ...BASE, windingUp: true }, { ...BASE, releasing: true },
    { ...BASE, batting: true }, { ...BASE, batting: true, swinging: 'contact' },
    { ...BASE, batting: true, swinging: 'power' }, { ...BASE, fielding: 'routine' },
    { ...BASE, fielding: 'dive' }, { ...BASE, throwing: true },
    { ...BASE, running: true }, { ...BASE, sliding: true }, { ...BASE, celebrating: true },
  ];
  const seen = new Set<string>();
  for (const i of probes) {
    const c = chooseBaseballClip(i);
    assert.ok(isResolvable(c.clip), `${c.state} -> "${c.clip}" NOT resolvable`);
    assert.ok(c.fadeSec > 0);
    seen.add(c.state);
  }
  assert.ok(seen.size >= 11, `${seen.size} states`);
});

ok('priorities: swing > dive > throw > release > run > stance', () => {
  assert.equal(chooseBaseballClip({ ...BASE, batting: true, swinging: 'power', running: true }).state, 'swing_power');
  assert.equal(chooseBaseballClip({ ...BASE, fielding: 'dive', throwing: true }).state, 'field_dive');
  assert.equal(chooseBaseballClip({ ...BASE, releasing: true, running: true }).state, 'pitch_release');
});

console.log(`\n${pass} checks green`);
