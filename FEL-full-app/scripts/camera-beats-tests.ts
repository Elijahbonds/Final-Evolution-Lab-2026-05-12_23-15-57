#!/usr/bin/env -S npx tsx
/**
 * scripts/camera-beats-tests.ts — Mode 1 Phase 8 proof (headless).
 *
 *   A. The dunk-contest 'contest' preset is purpose-built: lower, closer,
 *      and slower-lagging than the live-play 'hoops' broadcast preset.
 *   B. pulse() pushes the camera IN (distance scale < 1) and recovers to 1
 *      as the beat decays; stronger beats push harder.
 *   C. Live camera sanity: with a pulse active the follow update still
 *      lands a finite, standoff-respecting position (no NaN, no collapse).
 *
 * Run: npx tsx scripts/camera-beats-tests.ts
 */

import assert from 'node:assert';
import { NullEngine, Scene, ArcRotateCamera, Vector3 } from '@babylonjs/core';
import { CameraDirector, FOLLOW_PRESETS } from '../lib/babylon/core/CameraDirector';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

console.log('\nA. contest vs hoops preset');
ok('contest is lower, closer, and slower than broadcast hoops', () => {
  const c = FOLLOW_PRESETS.contest, h = FOLLOW_PRESETS.hoops;
  assert.ok(c, 'contest preset exists');
  assert.ok(c.height < h.height, 'lower camera');
  assert.ok(c.distance < h.distance, 'closer framing');
  assert.ok(c.lag < h.lag, 'slower follow (glide, not track)');
});

console.log('\nB. reaction beats');
ok('pulse pushes in with ease-out and fully recovers', () => {
  const scene = new Scene(new NullEngine());
  const cam = new ArcRotateCamera('cam', 0, 0, 10, Vector3.Zero(), scene);
  const dir = new CameraDirector(scene, cam, 'hoops');
  assert.equal(dir.beatScale, 1);
  dir.pulse(1, 0.5);
  const first = dir.beatScale;
  assert.ok(first < 0.75, `hard beat pushes in (scale ${first.toFixed(2)})`);
  // decay over ~0.5s of frames
  (scene.getEngine() as NullEngine).getDeltaTime = () => 1000 / 60;
  for (let i = 0; i < 45; i++) dir.update(new Vector3(0, 0, 5), Vector3.Zero(), new Vector3(0, 3, 0));
  assert.ok(dir.beatScale > 0.95, `beat recovered (scale ${dir.beatScale.toFixed(2)})`);
});
ok('weak beats push less than strong beats', () => {
  const scene = new Scene(new NullEngine());
  const cam = new ArcRotateCamera('cam', 0, 0, 10, Vector3.Zero(), scene);
  const dir = new CameraDirector(scene, cam, 'hoops');
  dir.pulse(0.3, 0.5); const weak = dir.beatScale;
  dir.pulse(1.0, 0.5); const strong = dir.beatScale;
  assert.ok(strong < weak);
});

console.log('\nC. camera stays sane during a beat');
ok('follow update with a live beat produces a finite, non-collapsed position', () => {
  const scene = new Scene(new NullEngine());
  const cam = new ArcRotateCamera('cam', 0, 0, 10, Vector3.Zero(), scene);
  const dir = new CameraDirector(scene, cam, 'hoops');
  dir.pulse(1, 5);
  for (let i = 0; i < 30; i++) dir.update(new Vector3(0, 0, 5), Vector3.Zero(), new Vector3(0, 3.05, -0.6));
  const p = cam.position;
  assert.ok(Number.isFinite(p.x + p.y + p.z), 'finite');
  assert.ok(Vector3.Distance(p, new Vector3(0, 0, 5)) > 1.5, 'respects standoff');
});

console.log(`\n${pass} checks green`);
