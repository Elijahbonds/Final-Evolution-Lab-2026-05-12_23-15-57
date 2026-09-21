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

const RIDE = ['board_ride_idle', 'board_tuck', 'board_grind', 'board_air', 'board_stand_idle', 'board_land_sketchy'];

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

// FEET ON THE DECK (SKATE-LEGS). The stance was authored against the floor, but the deck
// sits at root-local y=0.03 (BoardSync) while GroundRide snaps the root to the ground —
// so "standing" put both ankles at -0.01..-0.04, through the board and into the dirt, on
// all four board sports at once. Nothing caught it because every check here was about
// YAW: which way the rider faces, never what height they ride at.
//
// The reference is the rest of the game: every other grounded stance puts an ankle at
// +0.03..+0.08 above the root (idle_stand 0.07, guard 0.03, golf 0.06, tennis 0.06). On a
// deck 0.03-0.04 up, a riding ankle belongs above that, never below it.
const rootNode = rig.skeleton.bones[0].getTransformNode()?.parent as unknown as { getAbsolutePosition?: () => Vector3; computeWorldMatrix?: (f: boolean) => void } | null;
function ankleY(side: 'Left' | 'Right'): number {
  const n = boneNode(rig.skeleton, `${side}Foot`);
  if (!n || !rootNode?.getAbsolutePosition) return NaN;
  n.computeWorldMatrix(true);
  rootNode.computeWorldMatrix?.(true);
  return n.getAbsolutePosition().y - rootNode.getAbsolutePosition().y;
}
const DECK_TOP = 0.03;   // BoardSync parks the deck here, root-local
for (const clip of ['board_ride_idle', 'board_carve_left', 'board_carve_right', 'board_tuck', 'board_grind', 'board_stand_idle', 'board_land_sketchy']) {
  if (!pose(clip, 0.5)) { ok(false, `${clip}: clip missing`); continue; }
  const lo = Math.min(ankleY('Left'), ankleY('Right'));
  console.log(`  ${clip.padEnd(18)} lowest ankle ${lo.toFixed(3)} (deck top ${DECK_TOP})`);
  ok(lo > DECK_TOP, `${clip}: the rider stands ON the deck, not through it (ankle ${lo.toFixed(3)} vs deck ${DECK_TOP})`);
  ok(lo < 0.30, `${clip}: and not hovering above it (ankle ${lo.toFixed(3)})`);
}

// RECOGNIZABLE ON SIGHT (ANIM-READABILITY, 2026-09-21). Two states used to share a clip with a neighbour; the new clips
// have to differ from that neighbour by something the eye can see from the chase cam, measured here on the rig.
function hipsY(): number { const n = boneNode(rig.skeleton, 'Hips'); n!.computeWorldMatrix(true); return n!.getAbsolutePosition().y - (rootNode?.getAbsolutePosition?.().y ?? 0); }
function wristSpan(): number { const l = worldPos('LeftHand'), r = worldPos('RightHand'); return Math.hypot(l.x - r.x, l.y - r.y, l.z - r.z); }
pose('board_ride_idle', 0); const rideHips = hipsY();
pose('board_stand_idle', 0); const standHips = hipsY();
console.log(`  stand vs ride      hips ${standHips.toFixed(3)} vs ${rideHips.toFixed(3)}`);
ok(standHips - rideHips >= 0.10, `a stopped rider STANDS: hips ${(standHips - rideHips).toFixed(3)} m above the ride crouch (want >= 0.10)`);
pose('board_land', 0.35); const cleanHips = hipsY(), cleanSpan = wristSpan();
pose('board_land_sketchy', 0.25); const sketchHips = hipsY(), sketchSpan = wristSpan();
console.log(`  sketchy vs clean   hips ${sketchHips.toFixed(3)} vs ${cleanHips.toFixed(3)}   wrists ${sketchSpan.toFixed(3)} vs ${cleanSpan.toFixed(3)}`);
ok(sketchHips < cleanHips - 0.03, `a sketchy landing slams deeper than a clean one (${sketchHips.toFixed(3)} vs ${cleanHips.toFixed(3)})`);
ok(sketchSpan > cleanSpan + 0.15, `and the arms are thrown out to catch it (wrist span ${sketchSpan.toFixed(3)} vs ${cleanSpan.toFixed(3)})`);
pose('board_tuck', 0); const tuckSpan = wristSpan();
pose('board_air', 0); const airSpan = wristSpan();
ok(airSpan > tuckSpan + 0.2, `the plain air is OPEN, not the speed tuck (wrist span ${airSpan.toFixed(3)} vs ${tuckSpan.toFixed(3)})`);

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
