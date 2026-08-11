#!/usr/bin/env -S npx tsx
/**
 * scripts/rival-circuit-tests.ts — Story Phase 3 proof (headless).
 *   A. Beats resolve per trigger with PRQ-biased difficulty + taunt.
 *   B. The manifest is valid against the real mode registry.
 *   C. The tier-4 beat is the aerial flight duel (spine requirement).
 */
import assert from 'node:assert';
import { RIVAL_BEATS, rivalEncounter, validateBeats } from '../lib/babylon/core/RivalCircuit';
import { MODES } from '../lib/babylon/modes/registry';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

ok('beats resolve per trigger with PRQ bias', () => {
  const e = rivalEncounter('gate_dunk', 'ELITE');
  assert.ok(e && e.id === 'vane_t1_court');
  assert.ok(e.aiDifficulty > 1, 'ELITE gets a harder Vane');
  assert.ok(e.taunt.length > 0);
  assert.equal(rivalEncounter('gate_nowhere', 'READY'), null);
});

ok('manifest validates against the real registry', () => {
  assert.deepEqual(validateBeats(RIVAL_BEATS, new Set(Object.keys(MODES))), []);
});

ok('the tier-4 beat is the aerial duel (spine §2/§4)', () => {
  const sky = RIVAL_BEATS.find((b) => b.tier === 4);
  assert.ok(sky?.aerial === true);
  assert.ok(sky.camera.decisivePulse >= 1, 'the chase gets the big beat');
});

console.log(`\n${pass} checks green`);
