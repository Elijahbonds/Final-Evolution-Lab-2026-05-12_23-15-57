/**
 * FEL AVATAR POSE GATE — proves the avatar's clips produce anatomically sane
 * poses, using the REAL Babylon loader (NullEngine) so what passes here is
 * what the app renders.
 *
 *   npx tsx scripts/avatar/validate-pose.mts [glb path]
 *
 * Why this exists: validate-render.mts proves pixels MOVE. It cannot prove
 * the pose is right — the retired Meshy hero passed a motion check while its
 * run clip put the character's hands above its head. This gate asserts
 * anatomy: hands below shoulders during locomotion, feet near the floor,
 * head at the top. An asset that fails here never reaches the app.
 *
 * Per-clip limits are honest about the move: a jumpshot's hands DO go
 * overhead; a high kick's foot DOES rise. The numbers below are the contract.
 */

import { readFileSync } from 'node:fs';
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';

const glbPath = process.argv[2] ?? 'public/models/fel-hero.glb';

// [maxHandY, maxFootY, minHeadY] sampled over the whole clip
const CLIP_LIMITS: Record<string, { hand: number; foot: number; headMin: number; headMax: number }> = {
  idle_stand: { hand: 1.15, foot: 0.20, headMin: 1.50, headMax: 1.80 },
  run:        { hand: 1.30, foot: 0.70, headMin: 1.45, headMax: 1.85 },
  walk:       { hand: 1.30, foot: 0.45, headMin: 1.45, headMax: 1.85 },
  guard:      { hand: 1.55, foot: 0.30, headMin: 1.45, headMax: 1.85 },
  jab:        { hand: 1.60, foot: 0.30, headMin: 1.40, headMax: 1.85 },
  hook:       { hand: 1.60, foot: 0.30, headMin: 1.40, headMax: 1.85 },
  uppercut:   { hand: 1.80, foot: 0.40, headMin: 1.30, headMax: 1.85 },
  jumpshot:   { hand: 2.15, foot: 0.60, headMin: 1.35, headMax: 1.90 },
  roundhouse: { hand: 1.55, foot: 1.65, headMin: 1.35, headMax: 1.85 },
  high_kick:  { hand: 1.55, foot: 1.85, headMin: 1.35, headMax: 1.85 },
};

const data = readFileSync(glbPath);
const engine = new BABYLON.NullEngine();
const scene = new BABYLON.Scene(engine);
new BABYLON.ArcRotateCamera('c', 0, 1.2, 5, new BABYLON.Vector3(0, 1, 0), scene);
const res = await BABYLON.SceneLoader.ImportMeshAsync('', 'data:;base64,', data.toString('base64'), scene, null, '.glb');
const skel = res.skeletons[0];
if (!skel) { console.error('FAIL: no skeleton'); process.exit(1); }

const bone = (n: string) => {
  const b = skel.bones.find((x) => x.name === n);
  if (!b) throw new Error(`missing bone ${n}`);
  return b;
};
const wy = (n: string) => BABYLON.Vector3.TransformCoordinates(BABYLON.Vector3.Zero(), bone(n).getAbsoluteMatrix()).y;

scene.render();

let failures = 0;
const fail = (msg: string) => { failures++; console.error(`  ✗ ${msg}`); };

// ── bind pose: a real T-pose ────────────────────────────────────────────────
// NOTE: the Babylon glTF loader initializes animated node TRS from the first
// frame of the first animation, so node worlds at load are NOT the bind pose.
// The honest bind check is the skin's inverse bind matrices: invert IBM to
// recover each joint's bind world position.
console.log('bind pose (from skin IBMs):');
{
  const bindPos = (name: string): BABYLON.Vector3 => {
    const b = skel.bones.find((x) => x.name === name)!;
    const m = b.getAbsoluteInverseBindMatrix().invert();
    return BABYLON.Vector3.TransformCoordinates(BABYLON.Vector3.Zero(), m);
  };
  const hand = bindPos('LeftHand'), foot = bindPos('LeftFoot'), head = bindPos('Head');
  console.log(`  hand y ${hand.y.toFixed(3)} x ${hand.x.toFixed(3)} · foot y ${foot.y.toFixed(3)} · head y ${head.y.toFixed(3)}`);
  if (Math.abs(hand.y - 1.47) > 0.08) fail(`bind hands not at shoulder height (got ${hand.y.toFixed(3)}, want ≈1.47) — bind is not a T-pose`);
  if (Math.abs(Math.abs(hand.x) - 0.72) > 0.08) fail(`bind hands not out to the side (|x| ${Math.abs(hand.x).toFixed(3)}, want ≈0.72)`);
  if (foot.y > 0.15) fail(`bind foot floating (${foot.y.toFixed(3)})`);
  if (head.y < 1.5 || head.y > 1.75) fail(`bind head off (${head.y.toFixed(3)})`);
}

// ── load state: must be the natural idle, never bind ───────────────────────
{
  const handY = wy('LeftHand');
  console.log(`load state: hand y ${handY.toFixed(3)} (must be < 1.30 — arms down, not T-posed)`);
  if (handY > 1.30) fail('loaded rest state has hands at shoulder height — first clip in file is not arms-down (see forge.mts idle_stand note)');
}

// ── clips: anatomy over time ────────────────────────────────────────────────
for (const group of scene.animationGroups) {
  const limits = CLIP_LIMITS[group.name];
  if (!limits) { console.log(`  (skip ${group.name} — no limits declared)`); continue; }
  group.start(false);
  let maxHand = -1, maxFoot = -1, minHead = 99, maxHead = -1, sumHandRun = 0, samples = 0;
  const STEPS = 12;
  for (let k = 0; k <= STEPS; k++) {
    group.goToFrame(group.from + ((group.to - group.from) * k) / STEPS);
    scene.render();
    const lh = wy('LeftHand'), rh = wy('RightHand');
    const lf = wy('LeftFoot'), rf = wy('RightFoot');
    const hd = wy('Head');
    maxHand = Math.max(maxHand, lh, rh);
    maxFoot = Math.max(maxFoot, lf, rf);
    minHead = Math.min(minHead, hd);
    maxHead = Math.max(maxHead, hd);
    if (group.name === 'run' || group.name === 'walk') { sumHandRun += (lh + rh) / 2; samples++; }
  }
  group.stop();
  const ok = maxHand <= limits.hand && maxFoot <= limits.foot && minHead >= limits.headMin && maxHead <= limits.headMax;
  console.log(`  ${ok ? '✓' : '✗'} ${group.name.padEnd(11)} maxHand ${maxHand.toFixed(2)} (≤${limits.hand}) · maxFoot ${maxFoot.toFixed(2)} (≤${limits.foot}) · head ${minHead.toFixed(2)}–${maxHead.toFixed(2)}`);
  if (maxHand > limits.hand) fail(`${group.name}: hand rose to ${maxHand.toFixed(2)} (limit ${limits.hand})`);
  if (maxFoot > limits.foot) fail(`${group.name}: foot rose to ${maxFoot.toFixed(2)} (limit ${limits.foot})`);
  if (minHead < limits.headMin) fail(`${group.name}: head dropped to ${minHead.toFixed(2)} (min ${limits.headMin})`);
  if (maxHead > limits.headMax) fail(`${group.name}: head rose to ${maxHead.toFixed(2)} (max ${limits.headMax})`);
  // the T-pose trap: during locomotion hands must hang LOW on average
  if (samples > 0) {
    const avg = sumHandRun / samples;
    if (avg > 1.15) fail(`${group.name}: average hand height ${avg.toFixed(2)} — arms are out, not swinging (T-pose signature)`);
  }
}

if (failures) {
  console.error(`\n✗ POSE GATE: ${failures} failure(s) — ${glbPath} does not ship.`);
  process.exit(1);
}
console.log(`\n✔ POSE GATE GREEN — ${glbPath} animates anatomically.`);
process.exit(0);
