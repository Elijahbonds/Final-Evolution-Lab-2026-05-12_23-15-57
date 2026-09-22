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
// SKATE-MAJOR (2026-09-21): "open" was a wrist SPAN, which only the shoulder-height T could pass. The tuck is a fold —
// hips low, hands down and back by the hips; the air stands taller with the hands up at chest height and ahead of the
// body. Measured as heights, which is what separates them from the chase cam.
function handHeight(): number { const l = worldPos('LeftHand'), r = worldPos('RightHand'); return (l.y + r.y) / 2 - (rootNode?.getAbsolutePosition?.().y ?? 0); }
pose('board_tuck', 0); const tuckHips = hipsY(), tuckHands = handHeight();
pose('board_air', 0); const airHips = hipsY(), airHands = handHeight();
console.log(`  air vs tuck        hips ${airHips.toFixed(3)} vs ${tuckHips.toFixed(3)}   hands ${airHands.toFixed(3)} vs ${tuckHands.toFixed(3)}`);
ok(airHips > tuckHips + 0.08, `the plain air stands taller than the speed tuck (hips ${airHips.toFixed(3)} vs ${tuckHips.toFixed(3)})`);
ok(airHands > tuckHands + 0.12, `and carries the hands higher than the tuck's hands-by-the-hips (${airHands.toFixed(3)} vs ${tuckHands.toFixed(3)})`);

// ARMS ALIVE (ANIM-READABILITY, 2026-09-21). "Dead arms" is a clip whose hands never move: the rider rides a loop with
// the arms bolted on. Every clip a rider LIVES in — the two idles, the carves, the push, the grind — has to move its
// wrists across the loop by something the eye reads as alive, measured root-relative so the ride's own travel cannot
// stand in for it. A bolted-on arm scores 0.000 here.
function wristTravel(clip: string): number {
  const at = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const root = () => rootNode?.getAbsolutePosition?.() ?? Vector3.Zero();
  const tracks: Record<'LeftHand' | 'RightHand', Vector3[]> = { LeftHand: [], RightHand: [] };
  for (const t of at) {
    if (!pose(clip, t)) return NaN;
    const o = root();
    for (const b of ['LeftHand', 'RightHand'] as const) tracks[b].push(worldPos(b).subtract(o));
  }
  let most = 0;
  for (const b of ['LeftHand', 'RightHand'] as const) {
    for (let i = 0; i < tracks[b].length; i++) for (let j = i + 1; j < tracks[b].length; j++) {
      most = Math.max(most, Vector3.Distance(tracks[b][i], tracks[b][j]));
    }
  }
  return most;
}
for (const clip of ['board_ride_idle', 'board_stand_idle', 'board_carve_left', 'board_carve_right', 'board_push', 'board_grind']) {
  const travel = wristTravel(clip);
  console.log(`  ${clip.padEnd(18)} wrist travel ${Number.isNaN(travel) ? 'CLIP MISSING' : travel.toFixed(3)}`);
  ok(travel > 0.03, `${clip}: the arms are alive, not bolted on (wrist travel ${travel.toFixed(3)} m, want > 0.03)`);
}

// FEET OVER THE TRUCKS IN THE AIR (SKATE-MAJOR, 2026-09-21). The air family had no foot targets, so the stance yaw put the
// two feet side by side ACROSS the deck (measured live: 0.24 m across, 0.05 m along) — a rider in the air on a plank with
// his feet together. Same rule as the ground stance: spread along the deck, never across it.
for (const clip of ['board_air', 'skate_ollie', 'skate_kickflip', 'board_grab']) {
  for (const t of [0, 0.5, 1]) {
    if (!pose(clip, t)) { ok(false, `${clip}: clip missing`); break; }
    const l = worldPos('LeftFoot'), r = worldPos('RightFoot');
    const along = Math.abs(l.z - r.z), across = Math.abs(l.x - r.x);
    if (t === 0.5) console.log(`  ${clip.padEnd(18)} air feet: ${along.toFixed(3)} m along the deck, ${across.toFixed(3)} across`);
    ok(along >= 0.3, `${clip} @${t}: feet over the trucks in the air (${along.toFixed(3)} m along, want >= 0.30)`);
    ok(along > across, `${clip} @${t}: feet along the deck, not across it (${along.toFixed(3)} vs ${across.toFixed(3)})`);
  }
}

// NO T ON THE BOARD (SKATE-MAJOR, 2026-09-21). The live probe's "stiff-T" read is a measurable shape: BOTH hands at
// shoulder height (within 0.14 m) and reaching 0.32 m or more from their shoulders — the scarecrow. Measured on the
// baseline run: 211 such frames, 99 of them the grind, 51 the ollie, 38 the landings, the rest the air and its fades.
// Every clip a rider is seen in is sampled through its length here; the bail is exempt (flailing straight is the truth
// of a fall) and so is the grab (one hand is on the deck, the other is the style arm, by design).
function handRel(side: 'Left' | 'Right'): { dy: number; dh: number } {
  const sh = worldPos(`${side}Arm`), hd = worldPos(`${side}Hand`);
  return { dy: hd.y - sh.y, dh: Math.hypot(hd.x - sh.x, hd.z - sh.z) };
}
const T_LEVEL = 0.14, T_REACH = 0.32;
for (const clip of ['board_ride_idle', 'board_stand_idle', 'board_carve_left', 'board_carve_right', 'board_push', 'board_tuck', 'board_grind', 'board_manual', 'board_air', 'skate_ollie', 'skate_kickflip', 'board_land', 'board_land_sketchy']) {
  let tFrames = 0, worst = '';
  const line: string[] = [];
  for (const t of [0, 0.15, 0.3, 0.5, 0.65, 0.8, 1]) {
    if (!pose(clip, t)) { ok(false, `${clip}: clip missing`); break; }
    const L = handRel('Left'), R = handRel('Right');
    const isT = Math.abs(L.dy) < T_LEVEL && Math.abs(R.dy) < T_LEVEL && L.dh > T_REACH && R.dh > T_REACH;
    if (isT) { tFrames++; worst = `t ${t}: L dy ${L.dy.toFixed(2)} reach ${L.dh.toFixed(2)} · R dy ${R.dy.toFixed(2)} reach ${R.dh.toFixed(2)}`; }
    if (t === 0.5) line.push(`L dy ${L.dy.toFixed(2)} reach ${L.dh.toFixed(2)} · R dy ${R.dy.toFixed(2)} reach ${R.dh.toFixed(2)}`);
  }
  console.log(`  ${clip.padEnd(18)} hands@0.5 ${line[0] ?? '?'}${tFrames ? `   T at ${tFrames} sample(s)` : ''}`);
  ok(tFrames === 0, `${clip}: never holds both hands out at shoulder height (the T) — ${worst}`);
}

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
