#!/usr/bin/env -S npx tsx
/**
 * scripts/rig-floor-tests.ts — NO CLIP PUTS A FOOT THROUGH THE FLOOR.
 *
 * The board-stance suite had 24 checks and every one of them was about YAW — which way the
 * rider faces — so a stance that rode 5 cm under its own deck survived on all four board
 * sports at once. Height was simply not a thing anything asked about. This is that question,
 * asked of every clip in the game rather than one suite's.
 *
 * TWO WAYS TO GET A FALSE ANSWER HERE, both hit while writing this:
 *  - An AnimationGroup must be STARTED before goToFrame has an animatable to seek. A stopped
 *    group reports the bind pose for every frame, which reads as "every knee is locked at
 *    180" — perfectly consistent, entirely wrong.
 *  - A clip inherits whatever the previous one left on any bone it does not key itself. Run
 *    the floor clips first and `karate_guard_step` reads 86 cm underground; run it alone and
 *    it is at +0.09. So the bind pose is restored between clips.
 */
import assert from 'node:assert';
import { NullEngine, Scene, FreeCamera, Vector3, Quaternion } from '@babylonjs/core';
import { buildRig } from '../lib/babylon/characters/proceduralRig';
import { registerProceduralClips } from '../lib/babylon/characters/proceduralClips';
import { registerAuthoredClips } from '../lib/babylon/anim/authored';
import { CharacterAnimator } from '../lib/babylon/anim/CharacterAnimator';
import { boneNode } from '../lib/babylon/anim/boneLookup';

/** How far under the floor an ankle may reach: a boot presses into turf, a shin does not. */
const FLOOR_TOLERANCE = -0.10;

/**
 * Clips measured below tolerance in the authored pose but CLAMPED at runtime, with the thing
 * that clamps them named. Anything not on this list has to stand on its own.
 *
 * EMPTY, AND IT SHOULD STAY THAT WAY. It briefly held dunk_mocap on the claim that
 * basketballTree "plants the dunk legs" — which was read off an import rather than measured.
 * That plant pins the ankle's X and Z and explicitly KEEPS THE CLIP'S HEIGHT
 * (`target.set(pin.x, ankle.getAbsolutePosition().y, pin.z)`), so it corrects nothing
 * vertically and the dunk's opening frame really did put a boot through the court. Fixed at
 * its generator instead. An exemption here needs a measurement, not an import.
 */
const RUNTIME_PLANTED: Record<string, string> = {};

const scene = new Scene(new NullEngine());
new FreeCamera('cam', new Vector3(0, 0, -5), scene);
const rig = buildRig(scene, 'default');
const animator = new CharacterAnimator(scene, []);
registerProceduralClips(animator, scene, rig.skeleton);
registerAuthoredClips(animator, scene, rig.skeleton);

const bind = new Map<ReturnType<typeof boneNode>, { p: Vector3; q: Quaternion }>();
for (const b of rig.skeleton.bones) {
  const n = b.getTransformNode();
  if (n) bind.set(n, { p: n.position.clone(), q: (n.rotationQuaternion ?? Quaternion.Identity()).clone() });
}
function resetPose(): void {
  for (const g of scene.animationGroups) g.stop();
  for (const [n, t] of bind) { if (!n) continue; n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); }
  scene.render();
}
function footY(side: 'Left' | 'Right'): number {
  const n = boneNode(rig.skeleton, `${side}Foot`);
  if (!n) return NaN;
  n.computeWorldMatrix(true);
  return n.getAbsolutePosition().y;   // the rig spawns with its root at y=0, so world y IS floor height
}

const offenders: string[] = [];
let measured = 0;
for (const g of scene.animationGroups) {
  resetPose();
  g.start(true); g.pause();
  let lowest = 99;
  for (let f = g.from; f <= g.to; f += Math.max(0.5, (g.to - g.from) / 30)) {
    g.goToFrame(f); scene.render();
    const y = Math.min(footY('Left'), footY('Right'));
    if (Number.isFinite(y)) lowest = Math.min(lowest, y);
  }
  g.stop();
  if (!Number.isFinite(lowest)) continue;
  measured++;
  if (lowest < FLOOR_TOLERANCE && !RUNTIME_PLANTED[g.name]) {
    offenders.push(`${g.name} (lowest ankle ${lowest.toFixed(3)})`);
  }
}
resetPose();

console.log(`  measured ${measured} clips, tolerance ${FLOOR_TOLERANCE}`);
assert.ok(measured > 100, `the whole library should be swept (got ${measured})`);
assert.deepEqual(offenders, [], `clips with a foot through the floor:\n   ${offenders.join('\n   ')}`);
console.log(`  ✓ no clip puts a foot more than ${Math.abs(FLOOR_TOLERANCE) * 100}cm under the floor`);
console.log(`  ✓ ${Object.keys(RUNTIME_PLANTED).length} clip(s) exempt — the list is empty, every clip stands on its own`);

scene.dispose();
console.log(`\n✅ rig-floor-tests: the library stands on the ground`);
