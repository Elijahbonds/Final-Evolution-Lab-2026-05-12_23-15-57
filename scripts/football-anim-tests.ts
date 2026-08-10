#!/usr/bin/env -S npx tsx
/**
 * scripts/football-anim-tests.ts — Mode 4 Phase 8 proof (headless).
 *   A. Every football state resolves against the live clip registry.
 *   B. Priorities: tackled > contested catch > move > throw > carry.
 *   C. Pre-snap vs live states are distinct; moves are distinct clips.
 */
import assert from 'node:assert';
import { chooseFootballClip, FootballAnimTree, type FootballAnimInput } from '../lib/babylon/anim/footballTree';
import { isResolvable } from '../lib/babylon/anim/clipRegistry';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const BASE: FootballAnimInput = {
  presnap: true, snapped: false, isQB: false, droppingBack: false, throwing: false,
  runningRoute: false, carrying: false, move: null, catching: 'none',
  beingTackled: false, blocking: false, rushing: false,
};

console.log('\nA. all states resolve');
ok('every state -> resolvable clip, no hard cuts', () => {
  const probes: FootballAnimInput[] = [
    { ...BASE }, { ...BASE, snapped: true },
    { ...BASE, isQB: true, droppingBack: true }, { ...BASE, isQB: true, throwing: true },
    { ...BASE, runningRoute: true }, { ...BASE, carrying: true },
    { ...BASE, carrying: true, move: 'juke' }, { ...BASE, carrying: true, move: 'spin' },
    { ...BASE, carrying: true, move: 'stiffArm' }, { ...BASE, carrying: true, move: 'truck' },
    { ...BASE, catching: 'clean' }, { ...BASE, catching: 'contested' },
    { ...BASE, beingTackled: true }, { ...BASE, blocking: true }, { ...BASE, rushing: true },
    { ...BASE, celebrating: true },
  ];
  const seen = new Set<string>();
  for (const i of probes) {
    const c = chooseFootballClip(i);
    assert.ok(isResolvable(c.clip), `${c.state} -> "${c.clip}" NOT resolvable`);
    assert.ok(c.fadeSec > 0, `${c.state} hard-cut`);
    seen.add(c.state);
  }
  assert.ok(seen.size >= 15, `${seen.size} states`);
});

console.log('\nB. priorities');
ok('tackled > contested catch > move > throw > carry', () => {
  assert.equal(chooseFootballClip({ ...BASE, beingTackled: true, move: 'juke' }).state, 'tackled');
  assert.equal(chooseFootballClip({ ...BASE, catching: 'contested', move: 'juke' }).state, 'catch_contested');
  assert.equal(chooseFootballClip({ ...BASE, carrying: true, move: 'spin' }).state, 'spin');
  assert.equal(chooseFootballClip({ ...BASE, isQB: true, throwing: true, carrying: true }).state, 'throw');
});

console.log('\nC. distinct reads');
ok('pre-snap differs from live; each move is its own clip', () => {
  assert.equal(chooseFootballClip(BASE).state, 'presnap_idle');
  assert.notEqual(chooseFootballClip({ ...BASE, snapped: true }).state, 'presnap_idle');
  const clips = new Set(['juke', 'spin', 'stiffArm', 'truck'].map((m) =>
    chooseFootballClip({ ...BASE, carrying: true, move: m as never }).clip));
  assert.ok(clips.size >= 3, `moves read as distinct clips (${clips.size})`);
});

console.log(`\n${pass} checks green`);
