#!/usr/bin/env -S npx tsx
/** scripts/tennis-anim-tests.ts — Phase 8 proof: all tennis states resolve; priorities hold. */
import assert from 'node:assert';
import { chooseTennisClip, type TennisAnimInput } from '../lib/babylon/anim/tennisTree';
import { isResolvable } from '../lib/babylon/anim/clipRegistry';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const BASE: TennisAnimInput = { speed01: 0, splitStepping: false, recovering: false, stroke: null, serve: null, tossing: false, volleying: false, overhead: false };

ok('every tennis state resolves with no hard cuts', () => {
  const probes: TennisAnimInput[] = [
    { ...BASE }, { ...BASE, splitStepping: true }, { ...BASE, speed01: 0.6 }, { ...BASE, recovering: true },
    { ...BASE, stroke: 'topspin' }, { ...BASE, stroke: 'slice' }, { ...BASE, stroke: 'flat' },
    { ...BASE, tossing: true }, { ...BASE, serve: 'flat' }, { ...BASE, serve: 'kick' }, { ...BASE, serve: 'slice' },
    { ...BASE, volleying: true }, { ...BASE, overhead: true }, { ...BASE, celebrating: true },
  ];
  const seen = new Set<string>();
  for (const i of probes) {
    const c = chooseTennisClip(i);
    assert.ok(isResolvable(c.clip), `${c.state} -> "${c.clip}" NOT resolvable`);
    assert.ok(c.fadeSec > 0);
    seen.add(c.state);
  }
  assert.ok(seen.size >= 13, `${seen.size} states`);
});

ok('priorities: overhead > serve > volley > stroke > recover', () => {
  assert.equal(chooseTennisClip({ ...BASE, overhead: true, serve: 'flat' }).state, 'overhead');
  assert.equal(chooseTennisClip({ ...BASE, serve: 'kick', volleying: true }).state, 'serve_kick');
  assert.equal(chooseTennisClip({ ...BASE, volleying: true, stroke: 'topspin' }).state, 'volley');
  assert.equal(chooseTennisClip({ ...BASE, stroke: 'topspin', recovering: true }).state, 'stroke_topspin');
});

console.log(`\n${pass} checks green`);
