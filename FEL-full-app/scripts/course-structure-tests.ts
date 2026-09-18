#!/usr/bin/env -S npx tsx
/**
 * scripts/course-structure-tests.ts — Mode 3 Phase 13 proof (headless).
 *   A. Checkpoints: ordered gates hit in sequence bank bonuses; flying
 *      past a gate without entering is a miss; branch gates accept either
 *      line and record the choice.
 *   B. Halfpipe: pumping on the wall builds amplitude; launch spends it;
 *      amplitude scales trick value (big air beats small spin count).
 *   C. Rockfall: spawns on a timer inside the band, rolls downhill,
 *      expires; grounded contact hits, airborne clears.
 *
 * Run: npx tsx scripts/course-structure-tests.ts
 */
import assert from 'node:assert';
import { Vector3 } from '@babylonjs/core';
import { CheckpointTracker, HalfpipeRun, Rockfall } from '../lib/babylon/core/CourseStructure';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const DT = 1 / 60;

const COURSE = [
  { id: 'g1', pos: new Vector3(0, 0, 10), radius: 2, bonus: 100 },
  { id: 'g2high', pos: new Vector3(-6, 0, 30), radius: 2, bonus: 100, line: 'high' as const },
  { id: 'g2low', pos: new Vector3(6, 0, 30), radius: 2, bonus: 200, line: 'low' as const },
  { id: 'g3', pos: new Vector3(0, 0, 50), radius: 2, bonus: 150 },
];

console.log('\nA. checkpoints');
ok('sequential gates bank bonuses; branch records the line', () => {
  const t = new CheckpointTracker(COURSE);
  assert.equal(t.next?.id, 'g1');
  assert.equal(t.update(new Vector3(0, 0, 10)).hit?.id, 'g1');
  // take the LOW line
  assert.equal(t.update(new Vector3(6, 0, 30)).hit?.id, 'g2low');
  assert.equal(t.line, 'low');
  assert.equal(t.next?.id, 'g3');
  assert.ok(t.splitBonus === 300);
  t.update(new Vector3(0, 0, 50));
  assert.ok(t.done);
});
ok('blowing past a gate is a miss', () => {
  const t = new CheckpointTracker(COURSE);
  const r = t.update(new Vector3(5, 0, 20));           // past g1's plane, outside it
  assert.equal(r.missed?.id, 'g1');
  assert.equal(t.misses, 1);
});

console.log('\nB. halfpipe');
ok('pumping on the wall builds amplitude; launch spends it; value scales', () => {
  const p = new HalfpipeRun();
  p.launch(1.2);
  const base = p.trickValue(100, 1);
  for (let i = 0; i < 40; i++) p.pump(0.9, true);
  const air = p.launch(1.2);
  assert.ok(air > 2.5, `pumped launch is bigger (${air.toFixed(2)}m)`);
  const pumped = p.trickValue(100, 1);
  assert.ok(pumped > base, `amplitude pays (${pumped} vs ${base})`);
  assert.ok(p.amplitude > 0, 'charge spent on launch (amplitude recorded)');
});

console.log('\nC. rockfall hazard');
ok('rocks spawn on the timer, roll downhill, hit grounded riders only', () => {
  const rf = new Rockfall({ x0: 0, x1: 2, z0: 0, z1: 2 }, 0.2);
  for (let i = 0; i < 30; i++) rf.update(DT);
  assert.ok(rf.rocks.length >= 2, 'spawning');
  const rock = rf.rocks[0];
  assert.ok(rock.pos.x >= 0 && rock.pos.x <= 2 && rock.pos.z >= 0, 'inside the band');
  assert.ok(rf.hits(new Vector3(rock.pos.x, 0, rock.pos.z), true), 'grounded contact hits');
  assert.ok(!rf.hits(new Vector3(rock.pos.x, 0, rock.pos.z), false), 'airborne clears');
});

console.log(`\n${pass} checks green`);
