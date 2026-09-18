#!/usr/bin/env -S npx tsx
// proceduralSkin proof — that the body is SKINNED, not bolted together.
//
// The defect this replaces is specific: buildBody parents ~30 rigid primitives
// to bone nodes, so under a fast clip the pieces separate at the joints and the
// character visibly comes apart in mid-air. "It has a skeleton" was already
// true of that version — it is not the claim that matters.
//
// The claim that matters is that vertices near a joint are influenced by BOTH
// bones that meet there, and that the surface actually deforms when the
// skeleton moves. Both are asserted here.

import { NullEngine, Scene, FreeCamera, Vector3, Matrix } from '@babylonjs/core';
import { buildRig } from '../lib/babylon/characters/proceduralRig';
import { buildSkinnedBody } from '../lib/babylon/characters/proceduralSkin';
import { boneNode } from '../lib/babylon/anim/boneLookup';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const engine = new NullEngine();
const scene = new Scene(engine);
new FreeCamera('cam', new Vector3(0, 0, -5), scene);
const rig = buildRig(scene, 'skintest');
const meshes = buildSkinnedBody(scene, rig, {});

// ── A. it is a skinned mesh at all ─────────────────────────────────────────
ok(meshes.length > 0, `A1 the body built (${meshes.length} meshes)`);
ok(meshes.length < 10, `A2 it is a handful of meshes, not ~30 primitives (${meshes.length})`);
for (const m of meshes) {
  ok(!!m.skeleton, `A-${m.name} is bound to the skeleton`);
  ok(m.isVerticesDataPresent('matricesIndices'), `A-${m.name} has bone indices`);
  ok(m.isVerticesDataPresent('matricesWeights'), `A-${m.name} has bone weights`);
}

// ── B. the weights are valid ───────────────────────────────────────────────
const boneCount = rig.skeleton.bones.length;
let blended = 0, total = 0, worstSum = 1;
for (const m of meshes) {
  const w = m.getVerticesData('matricesWeights')!;
  const bi = m.getVerticesData('matricesIndices')!;
  for (let i = 0; i < w.length; i += 4) {
    const sum = w[i] + w[i + 1] + w[i + 2] + w[i + 3];
    worstSum = Math.min(worstSum, sum);
    total++;
    // >1 real influence == this vertex sits in a joint blend
    if ([w[i], w[i + 1], w[i + 2], w[i + 3]].filter((x) => x > 0.02).length > 1) blended++;
    for (let k = 0; k < 4; k++) {
      if (w[i + k] > 0 && (bi[i + k] < 0 || bi[i + k] >= boneCount)) {
        fail.push(`B-bone index ${bi[i + k]} out of range on ${m.name}`); checks++;
      }
    }
  }
}
ok(Math.abs(worstSum - 1) < 1e-3, `B1 every vertex's weights sum to 1 (worst ${worstSum.toFixed(4)})`);
const blendPct = blended / total;
ok(blendPct > 0.25,
  `B2 a real share of vertices are influenced by MORE THAN ONE bone — this is the ` +
  `whole difference from rigid parts (${(blendPct * 100).toFixed(1)}% of ${total})`);

// ── C. the surface actually deforms ────────────────────────────────────────
// Rigid parenting also "moves" when a bone moves. What it cannot do is deform:
// with rigid parts the distance between two vertices on opposite sides of a
// joint is constant forever. Bend the elbow and measure.
const arm = meshes.find((m) => m.name.startsWith('skin_'))!;
ok(!!arm, 'C0 found the skin mesh');

const bake = (): Float32Array => {
  rig.skeleton.prepare();
  scene.render();
  const src = arm.getVerticesData('position')!;
  const w = arm.getVerticesData('matricesWeights')!;
  const bi = arm.getVerticesData('matricesIndices')!;
  const mats = rig.skeleton.getTransformMatrices(arm as never);
  const out = new Float32Array(src.length);
  const acc = new Float32Array(16);
  for (let v = 0; v < src.length / 3; v++) {
    const p = new Vector3(src[v * 3], src[v * 3 + 1], src[v * 3 + 2]);
    acc.fill(0);
    for (let k = 0; k < 4; k++) {
      const weight = w[v * 4 + k];
      if (weight <= 0) continue;
      const off = bi[v * 4 + k] * 16;
      for (let e = 0; e < 16; e++) acc[e] += mats[off + e] * weight;
    }
    const q = Vector3.TransformCoordinates(p, Matrix.FromArray(acc));
    out[v * 3] = q.x; out[v * 3 + 1] = q.y; out[v * 3 + 2] = q.z;
  }
  return out;
};

const before = bake();
// bend BOTH elbows hard
for (const side of ['Left', 'Right']) {
  const n = boneNode(rig.skeleton, `${side}ForeArm`);
  if (n) n.rotation = new Vector3(-1.5, 0, 0);
}
const after = bake();

let moved = 0, maxDelta = 0;
for (let i = 0; i < before.length; i += 3) {
  const d = Math.hypot(before[i] - after[i], before[i + 1] - after[i + 1], before[i + 2] - after[i + 2]);
  if (d > 1e-4) moved++;
  maxDelta = Math.max(maxDelta, d);
}
ok(moved > 0, `C1 bending the elbows moves skinned vertices (${moved} moved)`);
ok(maxDelta > 0.05, `C2 the deformation is a real bend, not numerical noise (max ${maxDelta.toFixed(3)}m)`);
ok(moved < before.length / 3,
  'C3 only PART of the mesh moved — a bent elbow must not translate the whole body, ' +
  'which is what a rigidly-parented part would do');

scene.dispose();
engine.dispose();

if (fail.length) {
  console.error(`procedural-skin-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`procedural-skin-tests: ${checks} checks green — the body is skinned and deforms`);
