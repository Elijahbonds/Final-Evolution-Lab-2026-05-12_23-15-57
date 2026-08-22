#!/usr/bin/env -S npx tsx
/**
 * scripts/flick-stick-tests.ts — Mode 3 Phase 4 proof (headless).
 *
 * Plays recorded stick traces through the recognizer and asserts exact
 * trick identity — the "no mash-random" contract.
 *
 *   A. Each gesture in the vocabulary produces exactly its own trick.
 *   B. Longest match wins (treflip's 4-token arc beats kickflip's prefix).
 *   C. Holds are grabs and require a real hold (no flick false-positives).
 *   D. Slow gestures (outside the budget) match nothing; partial traces
 *      match nothing; releasing a hold ends the grab.
 *
 * Run: npx tsx scripts/flick-stick-tests.ts
 */

import assert from 'node:assert';
import { FlickStick, GESTURES } from '../lib/babylon/core/FlickStick';
import type { FelInput } from '../lib/babylon/core/InputBus';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

const S = (x: number, y: number): FelInput => ({ t: 'stick', side: 'R', x, y });
const DIR_VEC: Record<string, [number, number]> = {
  up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0],
  upL: [-0.7, 0.7], upR: [0.7, 0.7], downL: [-0.7, -0.7], downR: [0.7, -0.7],
};

/** Play a token sequence at 60ms steps. */
function trace(tokens: string[], stepMs = 60): FlickStick {
  const fs = new FlickStick();
  let t = 1000;
  let last: string | null = null;
  for (const tok of tokens) {
    const [x, y] = DIR_VEC[tok];
    if (tok !== last) { fs.feed(S(x, y), t); t += stepMs; last = tok; }
  }
  return fs;
}

console.log('\nA. vocabulary identity');
ok('every flick/spin gesture matches exactly itself', () => {
  for (const g of GESTURES) {
    if (!Array.isArray(g.pattern)) continue;
    // replay and capture the match: feed returns the trick on completion
    const fs = new FlickStick();
    let t = 1000; let matched: string | null = null;
    let last: string | null = null;
    for (const tok of g.pattern) {
      if (tok === last) continue;
      const [x, y] = DIR_VEC[tok];
      const r = fs.feed(S(x, y), t);
      if (r) matched = r.id;
      t += 60; last = tok;
    }
    assert.equal(matched, g.id, `gesture for ${g.id} got ${matched}`);
  }
});

console.log('\nB. longest match');
ok('the 4-token treflip arc is not misread as kickflip', () => {
  const fs = new FlickStick();
  let t = 1000; let matched: string | null = null;
  for (const tok of ['downL', 'down', 'downR', 'right']) {
    const [x, y] = DIR_VEC[tok];
    const r = fs.feed(S(x, y), t);
    if (r) matched = r.id;
    t += 60;
  }
  assert.equal(matched, 'treflip');
});

console.log('\nC. holds are grabs');
ok('holding right long enough = INDY; releasing ends it', () => {
  const fs = new FlickStick();
  let t = 1000;
  let got: string | null = null;
  for (let i = 0; i < 10; i++) { const r = fs.feed(S(1, 0), t); if (r) got = r.id; t += 30; }
  assert.equal(got, 'indy');
  assert.ok(fs.heldGrab, 'grab held');
  fs.feed(S(0, 0), t);
  assert.equal(fs.heldGrab, null, 'release ends the grab');
});
ok('a quick flick THROUGH right is not a grab', () => {
  const fs = new FlickStick();
  const r1 = fs.feed(S(1, 0), 1000);
  const r2 = fs.feed(S(0, -1), 1040);   // 40ms later — below hold minimum
  assert.ok(!r1 && !r2);
  assert.equal(fs.heldGrab, null);
});

console.log('\nD. garbage in, nothing out');
ok('slow gestures expire; partial traces match nothing', () => {
  const fs = new FlickStick();
  let t = 1000; let matched = false;
  for (const tok of ['down', 'up']) {
    const [x, y] = DIR_VEC[tok];
    if (fs.feed(S(x, y), t)) matched = true;
    t += 900;                            // way past the budget
  }
  assert.ok(!matched, 'no ollie across a 900ms gap');
  const fs2 = new FlickStick();
  assert.ok(!fs2.feed(S(0, -1), 1000), 'a lone down-flick is not a trick');
});

console.log(`\n${pass} checks green`);
