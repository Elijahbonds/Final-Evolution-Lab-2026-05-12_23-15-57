// Board stance — proof the rider actually stands ACROSS the deck.
//
// A board rider is turned sideways: feet along the board, hips and shoulders
// square to it, head turned back over the leading shoulder to look down the
// line. The first cut of boardSuite.ts carried a 16-degree spine twist and
// nothing else, so the rider rode chest-first into the wind like someone
// standing on a plank. Screenshots caught it, but "is he turned enough?" and
// "is he looking forward or backward?" are not questions an eye answers
// reliably at render resolution -- a 74-degree yaw and a -74-degree yaw look
// equally plausible in a low-poly silhouette, and one of them has him riding
// backwards.
//
// So it is measured. The character root faces its direction of travel (+Z
// local; the modes set rotation.y = atan2(vel.x, vel.z)), which makes every
// assertion here an angle against +Z.

import { NullEngine, Scene, FreeCamera, Vector3, Matrix } from '@babylonjs/core';
import { buildRig } from '../lib/babylon/characters/proceduralRig';
import { registerProceduralClips } from '../lib/babylon/characters/proceduralClips';
import { registerAuthoredClips } from '../lib/babylon/anim/authored';
import { CharacterAnimator } from '../lib/babylon/anim/CharacterAnimator';
import { boneNode } from '../lib/babylon/anim/boneLookup';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const engine = new NullEngine();
const scene = new Scene(engine);
new FreeCamera('cam', new Vector3(0, 0, -5), scene);
const rig = buildRig(scene, 'skateboard');
const animator = new CharacterAnimator(scene, []);
registerProceduralClips(animator, scene, rig.skeleton);
registerAuthoredClips(animator, scene, rig.skeleton);

/** World-space yaw of a bone's local +Z, in degrees, signed about Y. */
function yawOf(bone: string): number {
  const node = boneNode(rig.skeleton, bone);
  if (!node) return NaN;
  node.computeWorldMatrix(true);
  const fwd = Vector3.TransformNormal(new Vector3(0, 0, 1), node.getWorldMatrix());
  fwd.y = 0;
  return (Math.atan2(fwd.x, fwd.z) * 180) / Math.PI;
}

function worldPos(bone: string): Vector3 {
  const node = boneNode(rig.skeleton, bone);
  if (!node) return new Vector3(NaN, NaN, NaN);
  node.computeWorldMatrix(true);
  return node.getAbsolutePosition();
}

/** Drive a clip to a frame and settle the transforms. */
function pose(clip: string, at = 0.5): boolean {
  const g = scene.animationGroups.find((x) => x.name === clip);
  if (!g) return false;
  scene.animationGroups.forEach((x) => x.stop());
  g.play(true); g.pause();
  g.goToFrame(g.from + (g.to - g.from) * at);
  scene.render();
  rig.skeleton.computeAbsoluteMatrices?.();
  scene.render();
  return true;
}

const RIDE = ['board_ride_idle', 'board_tuck', 'board_grind', 'board_air'];

for (const clip of RIDE) {
  ok(pose(clip), `${clip} exists as a real animation group`);
  const hips = yawOf('Hips');
  const head = yawOf('Head');

  // Shoulders across the deck. Anything under ~45 degrees still reads as
  // riding chest-first, which is the bug this file exists to catch.
  ok(Math.abs(hips) >= 45, `${clip}: hips turned across the board (got ${hips.toFixed(1)} deg, want >=45)`);
  ok(Math.abs(hips) <= 95, `${clip}: hips not past square to the board (got ${hips.toFixed(1)} deg)`);

  // ...and the head still looking where the board is going. This is the check
  // that catches a sign flip: with the yaw inverted the head lands near 150
  // degrees off travel, which is a rider looking over the TAIL.
  ok(Math.abs(head) <= 30, `${clip}: head looks down the line of travel (got ${head.toFixed(1)} deg off +Z)`);

  console.log(`  ${clip.padEnd(18)} hips ${hips.toFixed(1).padStart(7)}   head ${head.toFixed(1).padStart(7)}`);
}

// Feet planted along the deck, not together. A stance narrower than the trucks
// reads as standing on a plank however far the shoulders are turned.
pose('board_ride_idle');
const lf = worldPos('LeftFoot'), rf = worldPos('RightFoot');
const alongBoard = Math.abs(lf.z - rf.z);
const acrossBoard = Math.abs(lf.x - rf.x);
console.log(`  stance width: ${alongBoard.toFixed(3)}m along the deck, ${acrossBoard.toFixed(3)}m across`);
ok(alongBoard >= 0.3, `feet are spread along the deck (got ${alongBoard.toFixed(3)}m, want >=0.30)`);
ok(alongBoard > acrossBoard, `feet are spread ALONG the board, not across it (${alongBoard.toFixed(3)} vs ${acrossBoard.toFixed(3)})`);

// The bail must BREAK the stance -- holding a textbook ride pose through a
// crash is what makes a fall read as choreography.
pose('skate_bail', 1);
const bailHips = yawOf('Hips');
console.log(`  skate_bail (end)   hips ${bailHips.toFixed(1)}`);
ok(Math.abs(bailHips) < 40, `skate_bail unwinds the stance by the end (got ${bailHips.toFixed(1)} deg)`);

scene.dispose();
engine.dispose();

if (fail.length) {
  console.error(`board-stance-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  x ' + f);
  process.exit(1);
}
console.log(`board-stance-tests: ${checks} checks green — the rider stands across the board and looks down the line`);
