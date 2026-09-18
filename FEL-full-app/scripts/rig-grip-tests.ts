#!/usr/bin/env -S npx tsx
/**
 * scripts/rig-grip-tests.ts — TWO FISTS ON ONE HANDLE STAY ON IT.
 *
 * The floor sweep (rig-floor-tests) asked whether a body stands on the ground. This asks the
 * other half of the same question: whether the thing in its hands is actually held.
 *
 * It was not. Measured on a fresh rig, the fists opened to 0.57 m mid-bat-swing and 0.59 m
 * mid-golf-swing — as far apart as a fighting guard — so the bat and the club were held by one
 * hand or none through the only moment either mode scores. Both causes were the same:
 *
 *  1. MIRRORED ELBOW POLES. Two fists sharing a point share an arm plane, and the elbows trail
 *     that plane together. The swings alternated between same-side poles, mirrored poles and
 *     keys with no poles at all (which drops onto the solver's mirrored default), so one elbow
 *     flipped between every pair of keys.
 *  2. SPARSE KEYS THROUGH THE FASTEST ARC. buildPoseClip solves IK per key and interpolates the
 *     resulting BONE ROTATIONS, so two arms in different configurations take different paths in
 *     between. Golf had no key at all between the top of the backswing and impact — 0.2 s
 *     across the quickest part of the motion.
 *
 * THE CONTROL IS PART OF THE TEST. Three probes in this sweep gave confident wrong answers
 * before their controls caught them, so this one proves it can still tell a grip from a free
 * hand: if the free-hand clips ever stop reading far apart, the probe is broken and the grip
 * assertions below mean nothing.
 */
import assert from 'node:assert';
import { NullEngine, Scene, FreeCamera, Vector3, Quaternion } from '@babylonjs/core';
import { buildRig } from '../lib/babylon/characters/proceduralRig';
import { registerProceduralClips } from '../lib/babylon/characters/proceduralClips';
import { registerAuthoredClips } from '../lib/babylon/anim/authored';
import { CharacterAnimator } from '../lib/babylon/anim/CharacterAnimator';
import { boneNode } from '../lib/babylon/anim/boneLookup';

/** A shared grip may open this far and no further — a swing rolls the wrists, it does not let go. */
const GRIP_MAX = 0.30;
/** A free hand must read clearly wider, or the probe is not measuring what it claims. */
const FREE_MIN = 0.40;

const TWO_HANDED = ['baseball_stance', 'baseball_swing', 'golf_address_idle', 'golf_swing_full', 'golf_putt', 'golf_finish_hold'];
const FREE_HANDS = ['idle_stand', 'guard', 'run'];

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
function handGap(clip: string): { min: number; max: number } {
  const g = scene.animationGroups.find((x) => x.name === clip);
  assert.ok(g, `clip ${clip} is registered`);
  reset(); g!.start(true); g!.pause();
  let min = 99, max = -99;
  for (let f = g!.from; f <= g!.to; f += Math.max(0.5, (g!.to - g!.from) / 30)) {
    g!.goToFrame(f); scene.render();
    const L = boneNode(rig.skeleton, 'LeftHand'), R = boneNode(rig.skeleton, 'RightHand');
    if (!L || !R) continue;
    L.computeWorldMatrix(true); R.computeWorldMatrix(true);
    const d = Vector3.Distance(L.getAbsolutePosition(), R.getAbsolutePosition());
    min = Math.min(min, d); max = Math.max(max, d);
  }
  g!.stop();
  return { min, max };
}

let passed = 0;
const check = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ✓ ${name}`); };

check('the probe can still tell a free hand from a grip', () => {
  for (const c of FREE_HANDS) {
    const { max } = handGap(c);
    assert.ok(max > FREE_MIN, `${c}: free hands should read wide (got ${max.toFixed(2)}m) — if this fails the probe is broken, not the clip`);
  }
});

for (const clip of TWO_HANDED) {
  check(`${clip} keeps both fists on the handle`, () => {
    const { max } = handGap(clip);
    assert.ok(max <= GRIP_MAX, `${clip}: the fists opened to ${max.toFixed(2)}m (limit ${GRIP_MAX}) — the implement is held by one hand`);
  });
}

reset();
scene.dispose();
console.log(`\n✅ rig-grip-tests: ${passed} checks green — the bat and the club stay held`);
