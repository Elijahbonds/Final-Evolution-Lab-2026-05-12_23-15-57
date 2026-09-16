#!/usr/bin/env -S npx tsx
/**
 * scripts/boost-pickup-tests.ts — the boost pickup is ONE item (SHARD-PICKUP).
 *
 * Owner, 2026-09-16: "instead of floating bananas make it shards... the item needs to be
 * uniform". Before this, one mechanic drew two things — a cyan chevron decal on the ground
 * for boards and kart, and a fat GOLD torus in the air for aero. Gold is the coin colour,
 * so the aero pickup read as currency floating in the sky while paying no currency at all.
 *
 * Uniformity is the kind of property that decays quietly: a mode adds a tint "just for its
 * venue" and a year later there are six pickups again. So it is asserted, including the
 * source-level check that no mode passes a colour of its own.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { NullEngine, Scene, FreeCamera, Vector3 } from '@babylonjs/core';
import { BoostPads } from '../lib/babylon/visual/BoostPads';

let passed = 0;
const check = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ✓ ${name}`); };

const scene = new Scene(new NullEngine());
new FreeCamera('cam', new Vector3(0, 0, -5), scene);
const pads = new BoostPads(scene, [
  { pos: new Vector3(0, 30, 0), kind: 'ring', radius: 7, yaw: 0 },
  { pos: new Vector3(5, 0, 5), kind: 'pad', radius: 2.4, yaw: 0.4 },
]);
const ring = scene.meshes.find((m) => m.name === 'boostRing0');
const pad = scene.meshes.find((m) => m.name === 'boostPad1');

check('both kinds build', () => {
  assert.equal(pads.count, 2);
  assert.ok(ring, 'the flyer gate exists');
  assert.ok(pad, 'the ground pickup exists');
});

check('the flyer gate stays an OPENING, not a thing to dodge', () => {
  // The radius is the gameplay: a flyer passes THROUGH. A single solid crystal in the middle
  // of a 7 m gate would be an obstacle wearing a pickup's colours.
  const bb = ring!.getBoundingInfo().boundingBox;
  const span = bb.maximum.x - bb.minimum.x;
  assert.ok(span > 8, `the ring spans its gate (got ${span.toFixed(1)}m across a 7m radius)`);
  assert.ok(bb.maximum.z - bb.minimum.z < 4, 'and stays thin in the direction of travel');
});

check('the ground pickup hovers rather than lying on the surface', () => {
  assert.ok(pad!.position.y > 0.5, `hovers (y=${pad!.position.y.toFixed(2)})`);
});

check('no mode overrides the pickup colour', () => {
  const modes = path.join(__dirname, '..', 'lib', 'babylon', 'modes');
  const offenders: string[] = [];
  for (const f of fs.readdirSync(modes).filter((x) => x.endsWith('.ts'))) {
    const src = fs.readFileSync(path.join(modes, f), 'utf8');
    for (const m of src.matchAll(/new BoostPads\([^)]*\)/g)) {
      if (/'#[0-9a-fA-F]{3,8}'/.test(m[0])) offenders.push(f);
    }
  }
  assert.deepEqual(offenders, [], `these modes tint the shared pickup: ${offenders.join(', ')}`);
});

check('the pickup is never the coin colour', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'babylon', 'visual', 'BoostPads.ts'), 'utf8');
  // #f5b91a is the coin's gold (lib/babylon/core/Pickups.ts); #ffd75e was the old aero ring.
  assert.ok(!/#f5b91a|#ffd75e/i.test(src), 'boost must not wear gold — gold is what a coin is');
});

scene.dispose();
console.log(`\n✅ boost-pickup-tests: ${passed} checks green — one shard, six modes`);
