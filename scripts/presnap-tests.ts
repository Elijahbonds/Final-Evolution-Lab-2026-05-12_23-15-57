#!/usr/bin/env -S npx tsx
/**
 * scripts/presnap-tests.ts — Mode 4 Phase 2 proof (headless).
 *   A. The read is GENUINELY INFORMATIVE: press-man reads man+blitz and
 *      suggests the beating concept; cover-2 reads zone; box count tracks
 *      real alignment numbers.
 *   B. Play-beats-shell is checkable and correct (streaks beat man,
 *      slants beat zone, dive beats blitz).
 *   C. The flow: formation → playcall → read → snapReady → snapped; you
 *      can't snap early; cycling the playbook wraps.
 *
 * Run: npx tsx scripts/presnap-tests.ts
 */
import assert from 'node:assert';
import {
  PreSnapFlow, readDefense, playBeatsShell, PLAYBOOK, DEFENSE_FORMATIONS,
} from '../lib/babylon/core/PreSnap';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

console.log('\nA. the read is real information');
ok('press-man reads as man + blitz with a usable suggestion', () => {
  const r = readDefense(DEFENSE_FORMATIONS.find((d) => d.id === 'press-man')!);
  assert.equal(r.shell, 'man');
  assert.ok(r.blitzComing);
  assert.ok(/blitz/i.test(r.suggestion));
  assert.ok(r.confidence01 > 0.9, 'a creeped-up LB is a loud tell');
});
ok('cover-2 reads zone with an honest box count', () => {
  const r = readDefense(DEFENSE_FORMATIONS.find((d) => d.id === 'cover2')!);
  assert.equal(r.shell, 'zone');
  assert.ok(!r.blitzComing);
  assert.ok(r.boxCount >= 3 && r.boxCount <= 5, `box ${r.boxCount}`);
  assert.ok(/slants|zone|run|pass/i.test(r.suggestion), 'a usable suggestion exists');
});

console.log('\nB. play-beats-shell');
ok('each concept beats its target coverage', () => {
  const man = readDefense(DEFENSE_FORMATIONS[1]);
  const zone = readDefense(DEFENSE_FORMATIONS[0]);
  assert.ok(playBeatsShell(PLAYBOOK.find((p) => p.id === 'streaks')!, { ...man, blitzComing: false }));
  assert.ok(playBeatsShell(PLAYBOOK.find((p) => p.id === 'slants')!, zone));
  assert.ok(playBeatsShell(PLAYBOOK.find((p) => p.id === 'dive')!, man));   // blitz home
  assert.ok(!playBeatsShell(PLAYBOOK.find((p) => p.id === 'streaks')!, zone), 'streaks do not beat zone');
});

console.log('\nC. the flow');
ok('formation → playcall → read → snap; no early snap; playbook wraps', () => {
  const f = new PreSnapFlow();
  assert.equal(f.phase, 'formation');
  assert.ok(!f.snap(), 'cannot snap before the read');
  f.advance(); assert.equal(f.phase, 'playcall');
  f.cyclePlaycall(-1);
  assert.equal(f.playcallIdx, PLAYBOOK.length - 1, 'wraps');
  f.advance(); assert.equal(f.phase, 'read');
  f.advance();
  assert.equal(f.phase, 'snapReady');
  assert.ok(f.read !== null, 'the read populates at read time');
  assert.ok(f.snap());
  assert.equal(f.phase, 'snapped');
});

console.log(`\n${pass} checks green`);
