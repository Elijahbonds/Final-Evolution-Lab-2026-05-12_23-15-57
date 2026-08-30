// Gate 0 proof — runs the REAL Gate0Validator against the REAL procedural rig.
//
// Gate 0 is the standing blocker in the design bible: no animation-dependent
// work may be credited complete until it is verified resolved. Before this pass
// the default rig was 19 bones with deliberately no 'mixamorig:' prefix, so it
// could never pass — Gate 0 had been routed around rather than closed.
//
// This asserts against Gate0Validator itself (not a re-derivation of its rules)
// so the test cannot drift from the gate it claims to satisfy.

import { NullEngine, Scene, FreeCamera, Vector3 } from '@babylonjs/core';
import { buildRig, JOINTS, MIXAMO_PREFIX } from '../lib/babylon/characters/proceduralRig';
import { Gate0Validator } from '../lib/babylon/modes/Gate0Validator';
import { CharacterAnimator } from '../lib/babylon/anim/CharacterAnimator';
import { registerProceduralClips } from '../lib/babylon/characters/proceduralClips';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const engine = new NullEngine();
const scene = new Scene(engine);
new FreeCamera('cam', new Vector3(0, 0, -5), scene);

const rig = buildRig(scene, 'gate0');

// ── A. the gate itself ──────────────────────────────────────────────────────
const result = Gate0Validator.validateSkeleton(rig.skeleton, 'procedural', 'proceduralRig.ts');

ok(result.boneCount === 65, `A1 bone count is 65 (got ${result.boneCount})`);
ok(result.hasMixamoRigPrefix, 'A2 bones carry the mixamorig: prefix');
ok(result.hasTPose, 'A3 root is not displaced in XZ (validator T-pose check)');
ok(result.isYUp, 'A4 shoulder sits above root (Y-up check)');
ok(result.issues.length === 0, `A5 no issues (got: ${result.issues.join(' | ') || 'none'})`);
ok(result.passed, 'A6 GATE 0 PASSES');

// ── B. the consumer contract must be untouched ──────────────────────────────
// Every one of these names is looked up by proceduralMesh / proceduralClips /
// mirrored-clips / ballRig / GroundLock. Prefixing the node map would break all
// of them silently, so the prefix must live on BONES only.
const consumerNames = [
  'Hips', 'Spine', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot',
  'RightUpLeg', 'RightLeg', 'RightFoot',
];
for (const n of consumerNames) {
  ok(!!rig.nodes[n], `B-${n} node lookup still resolves`);
  ok(!!rig.offsets[n], `B-${n} offset lookup still resolves`);
}
ok(Object.keys(rig.nodes).every((k) => !k.startsWith(MIXAMO_PREFIX)),
  'B1 node map keys are UNPREFIXED');
ok(rig.skeleton.bones.every((b) => b.name.startsWith(MIXAMO_PREFIX)),
  'B2 every bone IS prefixed');

// ── C. hierarchy sanity ─────────────────────────────────────────────────────
ok(JOINTS.length === 65, `C1 JOINTS declares 65 (got ${JOINTS.length})`);
ok(new Set(JOINTS.map((j) => j.name)).size === 65, 'C2 no duplicate joint names');
// Every parent must be declared BEFORE its child or the node graph builds wrong.
const seen = new Set<string>();
let orderOk = true;
for (const j of JOINTS) {
  if (j.parent && !seen.has(j.parent)) orderOk = false;
  seen.add(j.name);
}
ok(orderOk, 'C3 every parent is declared before its children');
ok(JOINTS.filter((j) => j.parent === null).length === 1, 'C4 exactly one root joint');

// Spine2 must stay where it was before Spine1 was inserted, or the chest,
// back-number and both shoulders shift.
const spine2Y = rig.nodes.Spine.position.y + rig.nodes.Spine1.position.y + rig.nodes.Spine2.position.y;
ok(Math.abs(spine2Y - 0.32) < 1e-6, `C5 Spine→Spine2 rise preserved at 0.32m (got ${spine2Y.toFixed(4)})`);

// Fingers/toes exist (that is where 46 of the 65 come from).
ok(rig.skeleton.bones.some((b) => b.name.includes('LeftHandThumb1')), 'C6 hand bones exist');
ok(rig.skeleton.bones.some((b) => b.name.includes('LeftToe_End')), 'C7 toe bones exist');

// ── D. clips must still BUILD against the prefixed skeleton ────────────────
// This is the regression that prefixing the bones actually caused: clipBuilder
// matched bone names exactly, so 'mixamorig:LeftArm' resolved nothing and every
// clip built zero targets — 65 compliant bones and a character that never moved.
// The same bug would have hit a real Mixamo GLB, whose bones are always prefixed.
const animator = new CharacterAnimator(scene, []);
registerProceduralClips(animator, scene, rig.skeleton);
// Probe through the public surface: durationOf() resolves a clip or returns null.
const built = scene.animationGroups.map((g) => g.name);
ok(built.length > 0, `D1 clips build against a prefixed skeleton (got ${built.length})`);
ok(animator.durationOf('idle_stand') !== null, 'D2 idle_stand resolves');
ok(animator.durationOf('run') !== null, 'D3 run resolves');
const runGroup = scene.animationGroups.find((g) => g.name === 'run');
ok(!!runGroup && runGroup.targetedAnimations.length > 0,
  `D4 run actually targets joints (got ${runGroup?.targetedAnimations.length ?? 0})`);

scene.dispose();
engine.dispose();

if (fail.length) {
  console.error(`gate0-rig-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`gate0-rig-tests: ${checks} checks green — GATE 0 PASSES on the default rig`);
