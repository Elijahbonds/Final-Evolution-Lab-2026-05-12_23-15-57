#!/usr/bin/env -S npx tsx
/**
 * scripts/rig-joint-tests.ts — NO LIMB FOLDS THROUGH ITSELF.
 *
 * Third dimension of the rig sweep, after the floor (rig-floor-tests) and the grip
 * (rig-grip-tests). Those ask where a body is; this asks whether its joints are possible.
 *
 * `hands` targets are ABSOLUTE from the root, so a pose that wants the fists "tucked in"
 * can easily name a point that sits on top of the shoulder itself — and the two-bone solver
 * can only reach that by closing the elbow past what an arm does. Measured before this:
 *
 *   karate_jump          R elbow  6 deg, L 10   (fists at the shoulders for the whole jump)
 *   baseball_pitch_side  L elbow 11 deg         (glove tucked into the armpit)
 *   baseball_pitch_over  L elbow 16 deg
 *   karate_guard_impact  R elbow 18 deg, L 22
 *
 * A human elbow closes to roughly 30-35 degrees before flesh stops it; below 25 the forearm
 * is inside the bicep. Every one of those was a target ~0.16 m from its own shoulder joint.
 *
 * THE CONTROL IS PART OF THE TEST, as in rig-grip: known-good poses must still read as
 * sensible human angles, or the probe is not measuring an elbow.
 */
import assert from 'node:assert';
import { NullEngine, Scene, FreeCamera, Vector3, Quaternion } from '@babylonjs/core';
import { buildRig } from '../lib/babylon/characters/proceduralRig';
import { registerProceduralClips } from '../lib/babylon/characters/proceduralClips';
import { registerAuthoredClips } from '../lib/babylon/anim/authored';
import { CharacterAnimator } from '../lib/babylon/anim/CharacterAnimator';
import { boneNode } from '../lib/babylon/anim/boneLookup';

/** Below this the limb is inside itself. */
const FOLD_MIN = 25;

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
function reset(): void {
  for (const g of scene.animationGroups) g.stop();
  for (const [n, t] of bind) { if (!n) continue; n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); }
  scene.render();
}
function wp(b: string): Vector3 | null {
  const n = boneNode(rig.skeleton, b); if (!n) return null;
  n.computeWorldMatrix(true); return n.getAbsolutePosition().clone();
}
/** Interior angle at the middle joint: 180 = straight, smaller = folded. */
function joint(a: string, b: string, c: string): number {
  const A = wp(a), B = wp(b), C = wp(c); if (!A || !B || !C) return NaN;
  const u = A.subtract(B), v = C.subtract(B);
  if (u.length() < 1e-6 || v.length() < 1e-6) return NaN;
  return (Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(u.normalize(), v.normalize())))) * 180) / Math.PI;
}
const JOINTS: [string, string, string, string][] = [
  ['L elbow', 'LeftArm', 'LeftForeArm', 'LeftHand'],
  ['R elbow', 'RightArm', 'RightForeArm', 'RightHand'],
  ['L knee', 'LeftUpLeg', 'LeftLeg', 'LeftFoot'],
  ['R knee', 'RightUpLeg', 'RightLeg', 'RightFoot'],
];
function minima(clip: string): Record<string, number> {
  const g = scene.animationGroups.find((x) => x.name === clip);
  assert.ok(g, `clip ${clip} is registered`);
  reset(); g!.start(true); g!.pause();
  const out: Record<string, number> = {};
  for (let f = g!.from; f <= g!.to; f += Math.max(0.5, (g!.to - g!.from) / 25)) {
    g!.goToFrame(f); scene.render();
    for (const [label, a, b, c] of JOINTS) {
      const v = joint(a, b, c);
      if (Number.isFinite(v)) out[label] = Math.min(out[label] ?? 999, v);
    }
  }
  g!.stop();
  return out;
}

let passed = 0;
const check = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ✓ ${name}`); };

check('the probe reads known-good poses as human', () => {
  // a guard holds the fists at the chin; an idle hangs the arms near straight
  const guard = minima('guard'), idle = minima('idle_stand');
  assert.ok(guard['L elbow'] > 40 && guard['L elbow'] < 140, `guard elbow should be a fighter's fold (got ${guard['L elbow']?.toFixed(0)})`);
  assert.ok(idle['L elbow'] > 120, `idle arms hang near straight (got ${idle['L elbow']?.toFixed(0)})`);
});

check('no clip folds a limb through itself', () => {
  const bad: string[] = [];
  let clips = 0;
  for (const g of scene.animationGroups) {
    clips++;
    const m = minima(g.name);
    for (const [label, v] of Object.entries(m)) {
      if (v < FOLD_MIN) bad.push(`${g.name} ${label} ${v.toFixed(0)}deg`);
    }
  }
  assert.ok(clips > 100, `the whole library should be swept (got ${clips})`);
  assert.deepEqual(bad, [], `limbs folded past ${FOLD_MIN}deg:\n   ${bad.join('\n   ')}`);
  console.log(`      (${clips} clips x ${JOINTS.length} joints)`);
});

reset();
scene.dispose();
console.log(`\n✅ rig-joint-tests: ${passed} checks green — every elbow and knee is possible`);
