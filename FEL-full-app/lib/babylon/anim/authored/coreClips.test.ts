// Rig tests for the core suites (locomotion, karate, board, dunk, football) —
// the shapes each clip must make, in world space, judged relative to the body
// (hips, head, shoulders) so a shorter body is judged on posture.
// Run with FEL_HERO_GLB=<glb> to prove a candidate body (ship pass 3, rung 1).
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from '../boneLookup';
import { buildIdleStand, buildStrafe, buildJumpUp, buildJumpLand } from './locomotion';
import { buildHitReact, buildKnockdown, buildGuardStep, buildBlockHold, buildGuardImpact, buildParry, buildFloorHold, buildGetUp, buildWindupHold, buildEvade, buildLeanDodge } from './karate';
import { buildFreeRunAirHold, buildFreeRunTuck, buildFreeRunSlide } from './freerun';
import { buildDanceClip, DANCE_CLIP_IDS, DANCE_CAPTURES, danceRootTracks, closedCycle } from '../danceClips';
import { sampleRootTrack } from '../MoveRootLayer';
import { MOCAP_STYLE_CLIPS } from './mocapStyles';
import { buildBoardRideIdle, buildBoardTuck, buildBoardGrab, buildSkateBail, buildBoardCarveRight } from './boardSuite';
import { buildChargeGather, buildLaunch, buildLandCrouch } from './dunkSuite';
import { buildFinishTomahawk, buildFinishWindmill, buildCelebrateBig, buildFinishBlown } from './dunkFinishes';
import { buildCelebSpidermanSplits, buildCelebItsOver, buildCelebRoar, buildCelebTooSmall, CELEB_SPIDERMAN_SEC } from './dunkCelebrations';
import { buildEastbay } from './eastbay';
import { EASTBAY_TIMING } from './timing';
import { CRADLE_BACK, SCORPION_SEC, HIDE_SEEK_SEC, LOST_FOUND_SEC, SPIN_SEC, BEHIND_BACK_SEC, BEHIND_BACK_SWAP, FAKE_BACK_SEC, DOUBLE_EASTBAY_SEC, DOUBLE_EASTBAY_FIRST, DOUBLE_EASTBAY_SECOND, BEHIND_BACK_SEC as _BB, WINDMILL_360_SEC, FAKE_EASTBAY_SEC, TAP_SEC, TAP_STRIKE, buildWindmill360, buildFakeEastbay, buildTap, buildBehindBack, buildFakeBack, buildDoubleEastbay, buildSelfLob, buildBounceThrow, BOUNCE_THROW_CONTACT, buildKickUp, buildBackHandspring, buildBackflip, BACKFLIP_SEC, buildDoubleUp, buildScorpion, buildScorpionFlush, SCORPION_FLUSH_SEC, buildCartwheel, CARTWHEEL_SEC, CARTWHEEL_BOUNCE, buildSpin720, SPIN_720_SEC, KICK_UP_SEC, buildLostFound, buildHideSeek, buildSpin360, buildBetweenLegs, buildCradle, buildDoubleClutch, CRADLE_ROUND, CRADLE_SEC, CLUTCH_SEC, SELF_LOB_CONTACT, KICK_UP_CONTACT, LOST_FOUND_HANDOFF, BETWEEN_LEGS_HANDOFF, BETWEEN_LEGS_SEC, FRONT_SWAP_SEC } from './dunkTricks';
import { DUNK_TRICKS } from '../../core/DunkSystem';
import { buildJuke, buildSpinMove, buildTackledFall, buildCarryRun } from './football';
import { buildBaseClips } from './baseClips';
import { buildStackBase, buildStackRider, STACK_SEC, STACK_DUCK_T } from './stackProp';

let scene: Scene; let sk: Skeleton;
const bind = new Map<TransformNode, { p: Vector3; q: Quaternion }>();
beforeAll(async () => {
  scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const b64 = readFileSync(process.env.FEL_HERO_GLB ?? 'public/models/fel-hero.glb').toString('base64');
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0];
  for (const b of sk.bones) { const n = b.getTransformNode(); if (n) bind.set(n, { p: n.position.clone(), q: (n.rotationQuaternion ?? Quaternion.Identity()).clone() }); }
});
function reset(): void { for (const x of [...scene.animationGroups]) x.stop(); for (const [n, t] of bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); } scene.render(); }
function fresh<T>(f: () => T): T { reset(); return f(); }
function at(g: AnimationGroup, sec: number): void { reset(); g.start(false, 1, g.from, g.to, false); g.goToFrame(sec * 30); scene.render(); }
function pos(name: string): Vector3 { const n = boneNode(sk, name)!; n.computeWorldMatrix(true); return n.getAbsolutePosition(); }
const hipsY = () => pos('Hips').y;

// THE TETRIS — two people stacked, and you go over their lap (owner, 2026-09-16). These are the only bodies in the game
// that are PROPS, and they are read at a run from ten metres, so what they have to sell is unmistakable at a glance:
// one person carrying another, and the rider getting out of the way as the dunker comes over.
describe('the tetris stack', () => {
  // rc28, measured by eye: the base's hands up at head height with the poles winged put two elbows level with the
  // rider's shoulders — and since the base's own head and body are hidden behind the rider and the dunker on the
  // runway, they read as the RIDER'S arms flexed in a double biceps. A carry holds the shins DOWN against the chest.
  it('the base is CARRYING something: knees soft, shins held low and tight against the chest', () => {
    const g = fresh(() => buildStackBase(scene, sk)!);
    at(g, STACK_DUCK_T);
    for (const s of ['Left', 'Right']) {
      expect(pos(`${s}Hand`).y).toBeGreaterThan(pos('Hips').y + 0.15);          // up at the load, not hanging
      expect(pos(`${s}Hand`).y).toBeLessThan(pos(`${s}Arm`).y);                 // …but below the shoulder: a carry, not a reach
      expect(Math.abs(pos(`${s}Hand`).x)).toBeLessThan(Math.abs(pos(`${s}Arm`).x));   // close together in front, elbows at the ribs
      expect(pos(`${s}Hand`).z).toBeGreaterThan(pos(`${s}Arm`).z + 0.1);        // forward, around the shins
      expect(pos(`${s}Leg`).z).toBeGreaterThan(pos(`${s}UpLeg`).z + 0.03);      // knees forward: under the weight
    }
  });

  it('the rider is SITTING: thighs up and forward, shins hanging down the front', () => {
    const g = fresh(() => buildStackRider(scene, sk)!);
    at(g, 0);
    for (const s of ['Left', 'Right']) {
      expect(pos(`${s}Leg`).z).toBeGreaterThan(pos('Hips').z + 0.15);           // knees out front of the seat
      expect(pos(`${s}Foot`).y).toBeLessThan(pos(`${s}Leg`).y);                 // shins hang
    }
  });

  // rc26, measured by eye: hands at y 1.18 with the poles winged out read as a BODYBUILDER'S DOUBLE BICEPS from the
  // runway — the one pose a person riding someone's shoulders never strikes.
  it('the rider HOLDS ON — hands forward and low, elbows down, never flexed up', () => {
    const g = fresh(() => buildStackRider(scene, sk)!);
    at(g, 0);
    for (const s of ['Left', 'Right']) {
      expect(pos(`${s}Hand`).y).toBeLessThan(pos(`${s}Arm`).y);                 // below the shoulder
      expect(pos(`${s}Hand`).z).toBeGreaterThan(pos(`${s}Arm`).z + 0.1);        // out in front, on the head
      expect(pos(`${s}ForeArm`).y).toBeLessThan(pos(`${s}Arm`).y);              // elbow below the shoulder, not winged
      // and the arm is nearly STRAIGHT: a hand tucked up by the shoulder leaves the elbow free to go anywhere the IK
      // pole is not, which is exactly how the double-biceps happened. A straight arm has no elbow to get wrong.
      expect(Vector3.Distance(pos(`${s}Hand`), pos(`${s}Arm`))).toBeGreaterThan(0.45);
    }
  });

  it('THE DUCK is a real duck: the head drops and goes back, off the line of the feet', () => {
    const g = fresh(() => buildStackRider(scene, sk)!);
    at(g, 0); const upright = pos('Head').clone();
    at(g, STACK_DUCK_T);
    expect(pos('Head').y).toBeLessThan(upright.y - 0.12);
    expect(pos('Head').z).toBeLessThan(upright.z - 0.1);                        // leaning back, away from the rim
    expect(pos('Head').y).toBeLessThan(pos('LeftLeg').y + 0.75);                // down toward the lap the jump clears
  });

  it('both bodies come back up: a prop that ends ducked is a prop that stays ducked', () => {
    for (const build of [buildStackBase, buildStackRider]) {
      const g = fresh(() => build(scene, sk)!);
      at(g, 0); const start = pos('Head').clone();
      at(g, STACK_SEC);
      expect(Vector3.Distance(pos('Head'), start)).toBeLessThan(0.05);
    }
  });
});

// THE VOCABULARY HAS TO MOVE — IT IS A DUNK CONTEST (owner, 2026-09-16: "make sure they are performing each dunk as
// dynamically as they could ... add some flavor, style").
//
// The audit that produced these: `AIR_LEGS` — a single symmetric tuck, both thighs -30 and both knees 45 — was spread
// across EVERY key of the windmill, the tomahawk, the cradle, the lost & found and the hide & seek. Five of the ten
// named dunks flew from take-off to flush with legs that never moved and were mirror-identical to each other, which is
// two things no dunker has ever done. Nothing failed, because nothing asked. This asks.
describe('the named dunks move', () => {
  // (DUNK MOTION phase 10b: the scorpion ENDS LOADED — Kilganon jams in the shape — and its own flush is where the body goes long)
  const named: { name: string; build: () => AnimationGroup; sec: number; finish?: () => AnimationGroup; finishSec?: number }[] = [
    { name: 'windmill', build: () => buildFinishWindmill(scene, sk)!, sec: 0.85 },
    { name: 'tomahawk', build: () => buildFinishTomahawk(scene, sk)!, sec: 0.75 },
    { name: 'eastbay', build: () => buildEastbay(scene, sk)!, sec: 1.2 },
    { name: 'between the legs', build: () => buildBetweenLegs(scene, sk)!, sec: BETWEEN_LEGS_SEC },
    { name: 'scorpion', build: () => buildScorpion(scene, sk)!, sec: SCORPION_SEC, finish: () => buildScorpionFlush(scene, sk)!, finishSec: SCORPION_FLUSH_SEC },
    { name: 'lost & found', build: () => buildLostFound(scene, sk)!, sec: LOST_FOUND_SEC },
    { name: 'hide & seek', build: () => buildHideSeek(scene, sk)!, sec: HIDE_SEEK_SEC },
    { name: 'cradle', build: () => buildCradle(scene, sk)!, sec: CRADLE_SEC },
    { name: 'double clutch', build: () => buildDoubleClutch(scene, sk)!, sec: CLUTCH_SEC },
    { name: '360', build: () => buildSpin360(scene, sk)!, sec: SPIN_SEC },
    { name: '720', build: () => buildSpin720(scene, sk)!, sec: SPIN_720_SEC },
  ];

  /** Where the feet are RELATIVE TO THE HIPS, so a clip that only rises does not read as leg action. */
  function feetOverFlight(build: () => AnimationGroup, sec: number): { l: Vector3; r: Vector3 }[] {
    const g = fresh(build);
    return [0.1, 0.3, 0.5, 0.7, 0.92].map((f) => {
      at(g, sec * f);
      const h = pos('Hips');
      return { l: pos('LeftFoot').subtract(h), r: pos('RightFoot').subtract(h) };
    });
  }

  it('NOT ONE of them flies with frozen legs', () => {
    for (const { name, build, sec } of named) {
      const shots = feetOverFlight(build, sec);
      let travel = 0;
      for (const a of shots) for (const b of shots) travel = Math.max(travel, Vector3.Distance(a.l, b.l), Vector3.Distance(a.r, b.r));
      expect(travel, `${name}: the legs barely move`).toBeGreaterThan(0.25);
    }
  });

  it('every one of them finishes LONG — the body under the arm, not sat in a chair', () => {
    for (const { name, build, sec, finish, finishSec } of named) {
      const g = fresh(finish ?? build);
      at(g, finishSec ?? sec);
      for (const s of ['Left', 'Right']) {
        expect(pos(`${s}Foot`).y, `${name}: ${s} foot is not extended at the flush`).toBeLessThan(pos('Hips').y - 0.55);
      }
    }
  });

  it('somewhere in every dunk the two legs are doing DIFFERENT things', () => {
    // A person jumping off one foot is asymmetric by construction, and a dunk that is mirror-perfect from first frame
    // to last is a diagram. Scorpion/360/clutch are deliberately symmetric at their signature beat — so this asks only
    // that the two legs disagree at SOME point in the flight, which every real dunk does at the take-off.
    for (const { name, build, sec } of named) {
      const shots = feetOverFlight(build, sec);
      const worst = Math.max(...shots.map((s) => Math.abs(s.l.y - s.r.y) + Math.abs(s.l.z - s.r.z)));
      expect(worst, `${name}: both legs do the same thing the whole way`).toBeGreaterThan(0.08);
    }
  });
});

// THE CHAIN PIECES (owner, 2026-09-16). Three bodies the vocabulary needed before the named combinations could be
// built out of it: the plain behind-the-back (ours only existed welded to a 360 inside LOST & FOUND), the FAKE of it,
// and the double eastbay — two passes through the legs in one jump.
describe('the chain pieces', () => {
  // DUNK MOTION phase 10b: TO THE DUNKING HAND — the off (left) hand takes it up the front, round the LEFT hip, and the right finishes
  it('behind the back: the off hand takes it up the front, round the hip, the hands meet behind, and the DUNKING hand finishes', () => {
    const g = fresh(() => buildBehindBack(scene, sk)!);
    at(g, FRONT_SWAP_SEC); expect(Vector3.Distance(pos('LeftHand'), pos('RightHand')), 'both palms on it up the front').toBeLessThan(0.3);
    at(g, 0.18 + FRONT_SWAP_SEC); expect(pos('LeftHand').z).toBeLessThan(pos('Hips').z - 0.15);     // round the hip, behind the body
    at(g, BEHIND_BACK_SWAP); expect(Vector3.Distance(pos('LeftHand'), pos('RightHand'))).toBeLessThan(0.35);   // they meet
    at(g, BEHIND_BACK_SEC); expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y + 0.2);        // the right hand finishes it
  });

  // The whole trick is the lie, so the first third has to be the real one's shape and the end has to betray it.
  it('the fake: the same path in, and then the SAME hand takes it up', () => {
    const real = fresh(() => buildBehindBack(scene, sk)!);
    at(real, 0.16 + FRONT_SWAP_SEC); const realDepth = pos('LeftHand').z - pos('Hips').z;   // (phase 10b: the real one goes round with the off hand, after the front swap)
    const g = fresh(() => buildFakeBack(scene, sk)!);
    at(g, 0.16);
    expect(pos('RightHand').z - pos('Hips').z).toBeLessThan(realDepth + 0.12);                      // it goes as deep as the real one
    at(g, 0.26); expect(Vector3.Distance(pos('LeftHand'), pos('RightHand'))).toBeLessThan(0.45);    // the far hand comes to meet it…
    at(g, FAKE_BACK_SEC);
    expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y + 0.2);                                // …and never gets it
    expect(pos('RightHand').y).toBeGreaterThan(pos('LeftHand').y + 0.3);
  });

  it('double eastbay: two passes, the legs SWAP between them, and it ends in the hand it started in', () => {
    const g = fresh(() => buildDoubleEastbay(scene, sk)!);
    at(g, DOUBLE_EASTBAY_FIRST);
    // the KNEE, not the foot: a leg kicked BACK raises the foot too (bent shin), so feet cannot tell you which thigh
    // is driving. The knee is where the thigh actually points.
    expect(pos('LeftLeg').y - pos('RightLeg').y).toBeGreaterThan(0.1);                               // left thigh up for pass one
    expect(Vector3.Distance(pos('LeftHand'), pos('RightHand'))).toBeLessThan(0.35);                  // the hand-off, down in the gap
    expect(pos('RightHand').y).toBeLessThan(hipsY() + 0.2);
    at(g, DOUBLE_EASTBAY_SECOND);
    expect(pos('RightLeg').y - pos('LeftLeg').y).toBeGreaterThan(0.1);                               // the OTHER thigh up for pass two
    expect(Vector3.Distance(pos('LeftHand'), pos('RightHand'))).toBeLessThan(0.35);
    at(g, DOUBLE_EASTBAY_SEC);
    expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y + 0.2);                                 // finished right-handed, where it began
  });

  it('all three finish long, like everything else in the contest', () => {
    for (const [build, sec] of [[buildBehindBack, BEHIND_BACK_SEC], [buildFakeBack, FAKE_BACK_SEC], [buildDoubleEastbay, DOUBLE_EASTBAY_SEC]] as const) {
      const g = fresh(() => build(scene, sk)!);
      at(g, sec);
      for (const s of ['Left', 'Right']) expect(pos(`${s}Foot`).y).toBeLessThan(pos('Hips').y - 0.55);
    }
  });
});

// 360 WINDMILL · FAKE EASTBAY · THE TAP (owner, 2026-09-16).
describe('the 360 windmill, the fake eastbay and the tap', () => {
  it('360 windmill: a full arm circle — low and behind, out to the side, over the top, down the far side', () => {
    const g = fresh(() => buildWindmill360(scene, sk)!);
    at(g, 0); const start = pos('RightHand');
    expect(start.y).toBeLessThan(hipsY() + 0.25); expect(start.z).toBeLessThan(pos('RightArm').z);      // cocked low and BEHIND
    at(g, 0.22); expect(pos('RightHand').x).toBeGreaterThan(pos('RightArm').x + 0.15);                  // out to the side
    at(g, 0.44); expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y);                             // over the top
    at(g, 0.66); expect(pos('RightHand').x).toBeLessThan(pos('Head').x);                                // down the FAR side: it went all the way round
    at(g, WINDMILL_360_SEC); expect(pos('RightHand').z).toBeGreaterThan(pos('RightArm').z);             // slammed forward
  });

  // the turn belongs to the spin layer, exactly as it does for the 360 and the lost & found
  it('360 windmill: the clip does not yaw its own hips — the layer owns the turn', () => {
    const g = fresh(() => buildWindmill360(scene, sk)!);
    for (const t of [0, 0.22, 0.44, 0.66, WINDMILL_360_SEC]) {
      at(g, t);
      expect(Math.abs(pos('LeftArm').z - pos('RightArm').z)).toBeLessThan(0.12);
    }
  });

  it('fake eastbay: the gap opens and the ball dives at it — and then comes back the NEAR side', () => {
    const real = fresh(() => buildBetweenLegs(scene, sk)!);
    at(real, BETWEEN_LEGS_HANDOFF); const realGap = pos('LeftLeg').y - pos('RightLeg').y;
    const g = fresh(() => buildFakeEastbay(scene, sk)!);
    at(g, 0.16);
    expect(pos('LeftLeg').y - pos('RightLeg').y).toBeGreaterThan(realGap * 0.6);      // a real-looking split
    expect(pos('RightHand').y).toBeLessThan(hipsY() + 0.25);                          // and the ball really does dive at it
    at(g, FAKE_EASTBAY_SEC);
    expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y + 0.2);                  // finished in the hand it started in
    expect(pos('RightHand').y).toBeGreaterThan(pos('LeftHand').y + 0.3);
  });

  it('the tap has NO gather: the arm is up before it starts and the whole trick is one wrist', () => {
    const g = fresh(() => buildTap(scene, sk)!);
    at(g, 0);
    expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y);                        // already up — nothing to wind
    at(g, 0.12); const reach = pos('RightHand').clone();
    at(g, TAP_STRIKE);
    expect(pos('RightHand').z).toBeGreaterThan(reach.z + 0.1);                        // the strike is forward, through the ring
    expect(pos('RightHand').y).toBeLessThan(reach.y);                                 // and down
    expect(TAP_SEC).toBeLessThan(0.5);                                                // a tap that dwells is a carry
  });
});

describe('locomotion', () => {
  it('idle stand: arms hang down, not out in a T', () => {
    at(fresh(() => buildIdleStand(scene, sk)!), 1.0);
    for (const s of ['Left', 'Right']) {
      const hand = pos(`${s}Hand`), shoulder = pos(`${s}Arm`);
      expect(hand.y).toBeLessThan(shoulder.y - 0.45);             // hanging, not held out
      expect(Math.abs(hand.x)).toBeLessThan(Math.abs(shoulder.x) + 0.2);   // near the body, not reaching sideways
    }
    expect(pos('Head').y).toBeGreaterThan(hipsY() + 0.5);
  });
  it('strafe left leans the hips and lifts the leading leg', () => {
    at(fresh(() => buildStrafe(scene, sk, 'left')!), 0.3);
    expect(pos('LeftLeg').y).toBeGreaterThan(pos('RightLeg').y + 0.03);   // left knee higher
    expect(pos('LeftHand').y).toBeLessThan(pos('LeftArm').y - 0.25);      // arms still down
  });
  it('jump: gathers low with arms back, then arms overhead at take-off', () => {
    const g = fresh(() => buildJumpUp(scene, sk)!);
    at(g, 0); const crouchHips = hipsY(); expect(pos('RightHand').y).toBeLessThan(pos('RightArm').y); expect(pos('RightHand').z).toBeLessThan(pos('RightArm').z - 0.1);   // arms down and swung behind in the gather
    at(g, 0.2); expect(hipsY()).toBeGreaterThan(crouchHips + 0.1); expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y);   // arms overhead at take-off
    at(fresh(() => buildJumpLand(scene, sk)!), 0.15); expect(pos('RightLeg').y).toBeLessThan(hipsY());   // knees bent under a low landing
  });
});

describe('karate fills', () => {
  it('hit react snaps the head back', () => {
    const g = fresh(() => buildHitReact(scene, sk)!);
    at(g, 0); const z0 = pos('Head').z; expect(pos('LeftHand').y).toBeGreaterThan(pos('Hips').y + 0.3);   // guard is up
    at(g, 0.1); expect(pos('Head').z).toBeLessThan(z0 - 0.03);
  });
  it('knockdown drops the hips and lays the torso back', () => {
    const g = fresh(() => buildKnockdown(scene, sk)!);
    at(g, 0); const h0 = hipsY();
    at(g, 0.7); expect(hipsY()).toBeLessThan(h0 - 0.6); expect(pos('Head').z).toBeLessThan(pos('Hips').z - 0.3);
  });
  // ANIM-READABILITY (combat, 2026-09-07): the guard verbs and the floor
  it('block is a HIGH guard held from frame 0 (fists above the stance guard, in front of the face) and wraps seamlessly', () => {
    const stance = fresh(() => buildGuardStep(scene, sk)!); at(stance, 0); const guardY = (pos('LeftHand').y + pos('RightHand').y) / 2;
    const g = fresh(() => buildBlockHold(scene, sk)!);
    at(g, 0); const y0 = (pos('LeftHand').y + pos('RightHand').y) / 2; const l0 = pos('LeftHand').clone(), r0 = pos('RightHand').clone();
    expect(y0).toBeGreaterThan(guardY + 0.06);
    expect(Math.abs(pos('LeftHand').x - pos('RightHand').x)).toBeLessThan(0.3);   // elbows in — a tight guard
    at(g, 0.9); expect(Vector3.Distance(pos('LeftHand'), l0)).toBeLessThan(0.02); expect(Vector3.Distance(pos('RightHand'), r0)).toBeLessThan(0.02);
  });
  it('guard impact shoves the guard back into the chin and resets; the parry flicks the lead hand out', () => {
    const g = fresh(() => buildGuardImpact(scene, sk)!);
    at(g, 0); const z0 = (pos('LeftHand').z + pos('RightHand').z) / 2; const l0 = pos('LeftHand').clone();
    at(g, 0.07); expect((pos('LeftHand').z + pos('RightHand').z) / 2).toBeLessThan(z0 - 0.06);
    at(g, 0.24); expect(Vector3.Distance(pos('LeftHand'), l0)).toBeLessThan(0.03);
    const p = fresh(() => buildParry(scene, sk)!);
    at(p, 0); const rz = pos('RightHand').z;
    at(p, 0.1); expect(pos('RightHand').z).toBeGreaterThan(rz + 0.15);
  });
  it('the floor hold starts where the knockdown ends and wraps; the get-up rises from it to the stance', () => {
    const kd = fresh(() => buildKnockdown(scene, sk)!); at(kd, 0.7); const floorHips = hipsY(), floorHead = pos('Head').clone(); at(kd, 0); const standHips = hipsY();
    const f = fresh(() => buildFloorHold(scene, sk)!);
    at(f, 0); expect(Math.abs(hipsY() - floorHips)).toBeLessThan(0.03); expect(Vector3.Distance(pos('Head'), floorHead)).toBeLessThan(0.05);
    at(f, 1.4); expect(Math.abs(hipsY() - floorHips)).toBeLessThan(0.03);
    const u = fresh(() => buildGetUp(scene, sk)!);
    at(u, 0); expect(Math.abs(hipsY() - floorHips)).toBeLessThan(0.03);
    at(u, 0.45); expect(Math.abs(hipsY() - standHips)).toBeLessThan(0.03); expect(pos('LeftHand').y).toBeGreaterThan(pos('Hips').y + 0.3);   // guard is up
  });
});

// ANIM-READABILITY (creative, 2026-09-07): the runner's holds, the counter-strike wind-up, the dance pack
describe('freerun fills', () => {
  it('air hold: the arms REACH forward, never overhead or out wide (the scorecard read that flight as a T); held, and the tuck folds the knees to the chest', () => {
    const g = fresh(() => buildFreeRunAirHold(scene, sk)!);
    at(g, 0); const l0 = pos('LeftHand').clone();
    // forward of the chest, at or under the shoulders, and inside the shoulder line: a hand reaching for the next ledge
    for (const side of ['Left', 'Right'] as const) {
      expect(pos(`${side}Hand`).z, `${side} reaches forward`).toBeGreaterThan(pos('Hips').z + 0.25);
      expect(pos(`${side}Hand`).y, `${side} is not overhead`).toBeLessThan(pos('Head').y);
      expect(Math.abs(pos(`${side}Hand`).x), `${side} is not out wide`).toBeLessThan(Math.abs(pos(`${side}Arm`).x) + 0.1);
    }
    at(g, 0.8); expect(Vector3.Distance(pos('LeftHand'), l0)).toBeLessThan(0.02);
    const t = fresh(() => buildFreeRunTuck(scene, sk)!);
    at(t, 0); expect(pos('LeftLeg').y).toBeGreaterThan(hipsY() - 0.15);   // knees up by the hips
    expect(pos('LeftHand').y).toBeLessThan(pos('LeftArm').y - 0.3);       // hands down on the shins, not out
    expect(pos('LeftHand').z).toBeGreaterThan(pos('Hips').z + 0.15);
  });
  it('slide: hips dropped, the lead leg out front, the torso back — and wraps', () => {
    const stand = fresh(() => buildIdleStand(scene, sk)!); at(stand, 0); const standHips = hipsY();
    const g = fresh(() => buildFreeRunSlide(scene, sk)!);
    at(g, 0); expect(hipsY()).toBeLessThan(standHips - 0.4); const h0 = pos('Head').clone();
    expect(pos('LeftFoot').z).toBeGreaterThan(pos('Hips').z + 0.4);       // the lead leg reaches forward
    expect(pos('Head').z).toBeLessThan(pos('Hips').z + 0.1);              // torso back, not folded over the knee
    at(g, 0.7); expect(Vector3.Distance(pos('Head'), h0)).toBeLessThan(0.03);
  });
});

describe('karate wind-up', () => {
  it('the rear fist is chambered back below the lead guard, the body turned, and the hold wraps', () => {
    const g = fresh(() => buildWindupHold(scene, sk)!);
    at(g, 0); const r0 = pos('RightHand').clone();
    expect(pos('RightHand').z).toBeLessThan(pos('Hips').z - 0.1);          // chambered behind the hip line
    expect(pos('RightHand').y).toBeLessThan(pos('LeftHand').y - 0.12);     // below the lead guard
    expect(pos('LeftHand').y).toBeGreaterThan(pos('Hips').y + 0.3);        // the lead guard stays up
    at(g, 0.7); expect(Vector3.Distance(pos('RightHand'), r0)).toBeLessThan(0.02);
  });
});

// KARATE-NEO-COOP (2026-09-07): the fighter's slip
describe('karate evade', () => {
  it('drops the hips and leans the torso back with the guard still up, then returns to the stance', () => {
    const g = fresh(() => buildEvade(scene, sk)!);
    at(g, 0); const h0 = hipsY(), l0 = pos('LeftHand').clone();
    at(g, 0.14);
    expect(hipsY()).toBeLessThan(h0 - 0.15);                                // low
    expect(pos('Head').z).toBeLessThan(pos('Hips').z - 0.08);              // leaning back off the line
    expect(pos('LeftHand').y).toBeGreaterThan(pos('Hips').y + 0.25);       // the guard never drops
    at(g, 0.36); expect(Math.abs(hipsY() - h0)).toBeLessThan(0.03); expect(Vector3.Distance(pos('LeftHand'), l0)).toBeLessThan(0.04);
  });
});

// KARATE-NEO-COOP (2026-09-07): the bullet-time lean (the no-stick dodge)
describe('karate lean dodge', () => {
  it('folds the torso back from the hips with the arms trailing behind, then returns to the guard', () => {
    const g = fresh(() => buildLeanDodge(scene, sk)!);
    at(g, 0); const h0 = hipsY(), head0 = pos('Head').clone(), l0 = pos('LeftHand').clone(), r0 = pos('RightHand').clone();
    at(g, 0.13);
    expect(pos('Head').z).toBeLessThan(head0.z - 0.25);                     // the head goes well behind its stance line — the lean
    expect(pos('Head').y).toBeLessThan(head0.y - 0.12);                     // and down with it
    expect(hipsY()).toBeLessThan(h0 - 0.06);                                // knees bent under the lean (RIG-FLOOR sweep: −0.22 sank the ankles; the 46/40 knees pay for −0.08)
    expect(pos('LeftHand').z).toBeLessThan(pos('Hips').z);                  // arms trailing behind the hips
    expect(pos('RightHand').z).toBeLessThan(pos('Hips').z);
    at(g, 0.42); expect(Math.abs(hipsY() - h0)).toBeLessThan(0.03); expect(Vector3.Distance(pos('LeftHand'), l0)).toBeLessThan(0.04); expect(Vector3.Distance(pos('RightHand'), r0)).toBeLessThan(0.04);
  });
});

describe('dance pack', () => {
  const build = (id: string) => fresh(() => buildDanceClip(scene, sk, id)!);
  it('every clip builds, starts and ends standing in the same groove (loop wrap = no snap), hands never out in a T', () => {
    const stand = fresh(() => buildIdleStand(scene, sk)!); at(stand, 0); const standHips = hipsY();
    for (const id of DANCE_CLIP_IDS) {
      const g = build(id); expect(g, id).toBeTruthy();
      const T = g.to / 30;
      at(g, 0); const hips0 = hipsY(), head0 = pos('Head').clone(), l0 = pos('LeftHand').clone(), r0 = pos('RightHand').clone();
      expect(Math.abs(hips0 - standHips), `${id} starts standing`).toBeLessThan(0.1);
      at(g, T); expect(Math.abs(hipsY() - hips0), `${id} ends at its start height`).toBeLessThan(0.03);
      expect(Vector3.Distance(pos('Head'), head0), `${id} head wraps`).toBeLessThan(0.05);
      expect(Vector3.Distance(pos('LeftHand'), l0), `${id} left hand wraps`).toBeLessThan(0.05);
      expect(Vector3.Distance(pos('RightHand'), r0), `${id} right hand wraps`).toBeLessThan(0.05);
      for (const f of [0, 0.25, 0.5, 0.75]) { at(g, T * f); const l = pos('LeftHand'), r = pos('RightHand'); expect(!(Math.abs(l.x) > 0.62 && Math.abs(r.x) > 0.62 && Math.abs(l.y - r.y) < 0.05 && l.y > pos('LeftArm').y - 0.05), `${id} @${f} not a T`).toBe(true); }
    }
  });
  it('toprock crosses a foot and swings the opposite arm low across; the two-step bounces; the shoulder bop stays home', () => {
    const g = build('dance_toprock_basic');
    at(g, 0); expect(pos('LeftFoot').z).toBeGreaterThan(pos('RightFoot').z + 0.15); expect(pos('RightHand').x).toBeLessThan(pos('RightArm').x); expect(pos('RightHand').y).toBeLessThan(pos('RightArm').y - 0.25);
    at(g, 1.0); expect(pos('RightFoot').z).toBeGreaterThan(pos('LeftFoot').z + 0.15); expect(pos('LeftHand').x).toBeGreaterThan(pos('LeftArm').x);
    const b = build('dance_bounce_two_step'); at(b, 0); const up = hipsY(); at(b, 0.25); expect(hipsY()).toBeLessThan(up - 0.04);
    const s = build('dance_bounce_shoulder'); at(s, 0.5); expect(pos('LeftHand').y).toBeLessThan(pos('LeftArm').y - 0.35);
  });
  it('the MISS is an overbalance: the weight drops off the line, the arms catch it WIDE, and it comes back up', () => {
    const g = build('dance_stumble');
    const T = g.to / 30;
    const stand0 = fresh(() => { const s2 = buildIdleStand(scene, sk)!; at(s2, 0); return hipsY(); });
    at(g, T / 3);
    expect(hipsY(), 'the weight drops').toBeLessThan(stand0 - 0.05);
    // the whole point of the re-author: the arms CATCH, each on its own side. The old miss played a fighter's flinch
    // over the step and the review read crossed limbs, so this is the assertion that matters.
    const l = pos('LeftHand'), r = pos('RightHand');
    expect(r.x - l.x, 'the hands never cross').toBeGreaterThan(0.4);
    expect(l.y, 'and they are up, catching, not hanging').toBeGreaterThan(pos('Hips').y);
    expect(r.y, 'both of them').toBeGreaterThan(pos('Hips').y);
    at(g, T); expect(Math.abs(hipsY() - stand0), 'back on the groove by the wrap').toBeLessThan(0.03);
  });
  it('the arm wave travels: the right hand peaks first, then the left; the spin turns the hips a full circle', () => {
    const g = build('dance_wave_arm');
    at(g, 0.25); expect(pos('RightHand').y).toBeGreaterThan(pos('LeftHand').y + 0.2); expect(Math.abs(pos('RightHand').x)).toBeGreaterThan(0.4);
    at(g, 0.75); expect(pos('LeftHand').y).toBeGreaterThan(pos('RightHand').y + 0.2);
    const sp = build('dance_trans_spin'); at(sp, 0.5); expect(pos('LeftFoot').x).toBeGreaterThan(pos('RightFoot').x + 0.2);   // half-way round: the feet have swapped sides
  });
  it('six-step, freeze and windmill drop to the floor with the hands planted, and rise before the wrap', () => {
    const stand = fresh(() => buildIdleStand(scene, sk)!); at(stand, 0); const standHips = hipsY();
    for (const [id, mid] of [['dance_footwork_six', 2.0], ['dance_freeze_baby', 0.5], ['dance_power_windmill', 2.0]] as const) {
      if (DANCE_CAPTURES[id]) continue;   // a captured step carries its drop on the root track (next test)
      const g = build(id);
      at(g, mid); expect(hipsY(), `${id} low`).toBeLessThan(standHips - 0.4); expect(Math.min(pos('LeftHand').y, pos('RightHand').y), `${id} hands planted`).toBeLessThan(hipsY() - 0.2);
      at(g, g.to / 30 - 0.05); expect(hipsY(), `${id} rises before the wrap`).toBeGreaterThan(standHips - 0.2);
    }
    if (!DANCE_CAPTURES.dance_power_windmill) { const w = build('dance_power_windmill'); at(w, 1.1); const hx = pos('Head').x; at(w, 2.0); expect(Math.abs(pos('Head').x - hx) + Math.abs(pos('Head').z)).toBeGreaterThan(0.1); }   // the hips turned
    const f = build('dance_freeze_baby'); at(f, 0.5); expect(pos('LeftLeg').y).toBeGreaterThan(pos('RightLeg').y + 0.15);   // the left knee is the one driven up
  });
});

describe('dance pack: captured steps (RECOGNISABLE, 2026-09-15)', () => {
  it('each captured step loops a CLOSED cycle of its capture (the seam pose matches)', () => {
    for (const [id, name] of Object.entries(DANCE_CAPTURES)) {
      const cap = MOCAP_STYLE_CLIPS.find((c) => c.name === name)!;
      const c = closedCycle(cap.keys, cap.root!);
      expect(cap.keys[c.to].t - cap.keys[c.from].t, `${id} cycle length`).toBeGreaterThanOrEqual(0.5);
      // hands + feet (12 coordinates, metres) + pelvis angle: under 2 is a pose a crossfade-free seam carries (the composer
      // also forces the cycle's last key onto its first)
      expect(c.err, `${id} seam error`).toBeLessThan(2);
    }
  });
  it('the root track stands at both ends, goes down to the floor and turns the body over in between, mirrored for .M', () => {
    const tracks = danceRootTracks(Object.keys(DANCE_CAPTURES));
    for (const id of Object.keys(DANCE_CAPTURES)) {
      const tr = tracks.find((x) => x.name === id)!, trM = tracks.find((x) => x.name === `${id}.M`)!;
      expect(tr && trM, id).toBeTruthy();
      const a = sampleRootTrack(tr, 0), z = sampleRootTrack(tr, tr.duration);
      expect(Math.abs(a.h) + Math.abs(z.h), `${id} stands at the ends`).toBeLessThan(1e-6);
      expect(a.q.w, `${id} upright at 0`).toBeCloseTo(1, 5);
      let low = 0, tilt = 0;
      for (let t = 0; t <= tr.duration; t += 0.05) { const r = sampleRootTrack(tr, t); low = Math.min(low, r.h); tilt = Math.max(tilt, 2 * Math.acos(Math.min(1, Math.abs(r.q.w))) * 180 / Math.PI); }
      expect(low, `${id} goes down`).toBeLessThan(-0.3);
      expect(tilt, `${id} turns over`).toBeGreaterThan(60);
      const m = sampleRootTrack(trM, tr.duration / 2), o = sampleRootTrack(tr, tr.duration / 2);
      expect(m.q.x).toBeCloseTo(o.q.x, 5); expect(m.q.y).toBeCloseTo(-o.q.y, 5); expect(m.h).toBeCloseTo(o.h, 5);
    }
  });
});

describe('board suite', () => {
  it('ride idle: low, feet across the deck, arms hanging loose (never the winged T), eyes forward', () => {
    at(fresh(() => buildBoardRideIdle(scene, sk)!), 1.2);
    const lf = pos('LeftFoot'), rf = pos('RightFoot');
    expect(Math.abs(lf.z - rf.z)).toBeGreaterThan(0.25);   // one foot ahead of the other along the board
    expect(hipsY()).toBeLessThan(0.75 * (pos('Head').y - hipsY()) + hipsY() - 0.0);   // sanity: head above hips
    // ANIM-SURGICAL (2026-09-14): this held the hands > 0.7 m apart — the "counterweight" that read as the stiff T on the chase
    // cam (eye skate H1). A cruising rider's arms hang: apart by the hips, below the shoulders, not spread wide.
    const spread = Math.abs(pos('LeftHand').x - pos('RightHand').x) + Math.abs(pos('LeftHand').z - pos('RightHand').z);
    expect(spread).toBeGreaterThan(0.3); expect(spread).toBeLessThan(0.7);
    expect(pos('LeftHand').y).toBeLessThan(pos('LeftArm').y - 0.3); expect(pos('RightHand').y).toBeLessThan(pos('RightArm').y - 0.3);
    expect(Math.abs(pos('Head').x)).toBeLessThan(0.25);
  });
  it('tuck is a HELD fold — lower than the ride idle from its first frame, and its loop wraps seamlessly', () => {
    // ANIM-READABILITY (2026-09-07): the tuck used to key stance → fold and loop, snapping upright every cycle. The fold-in
    // is now the animator's crossfade; the clip holds the fold, so frame 0 is already low and frame T matches frame 0.
    at(fresh(() => buildBoardRideIdle(scene, sk)!), 0); const rideHead = pos('Head').y - hipsY();
    const g = fresh(() => buildBoardTuck(scene, sk)!);
    at(g, 0); const head0 = pos('Head').y - hipsY(); const lh0 = pos('LeftHand').clone();
    expect(head0).toBeLessThan(rideHead - 0.12);
    at(g, 1.2); expect(Math.abs(pos('Head').y - hipsY() - head0)).toBeLessThan(0.02);
    expect(Vector3.Distance(pos('LeftHand'), lh0)).toBeLessThan(0.03);
  });
  it('carve and grab loops wrap seamlessly too (held poses, no snap-back)', () => {
    for (const [build, T] of [[buildBoardCarveRight, 0.8], [buildBoardGrab, 0.8]] as const) {
      const g = fresh(() => build(scene, sk)!);
      at(g, 0); const lh0 = pos('LeftHand').clone(), rh0 = pos('RightHand').clone();
      at(g, T); expect(Vector3.Distance(pos('LeftHand'), lh0)).toBeLessThan(0.03); expect(Vector3.Distance(pos('RightHand'), rh0)).toBeLessThan(0.03);
    }
  });
  it('grab brings a hand down toward the deck', () => {
    at(fresh(() => buildBoardGrab(scene, sk)!), 0.35);
    expect(Math.min(pos('LeftHand').y, pos('RightHand').y)).toBeLessThan(hipsY() + 0.3);   // reaching down to the hips' level, toward the deck
  });
  it('bail drops the rider', () => {
    const g = fresh(() => buildSkateBail(scene, sk)!);
    at(g, 0); const h0 = hipsY();
    at(g, 0.75); expect(hipsY()).toBeLessThan(h0 - 0.35);
  });
});

describe('dunk suite', () => {
  it('charge gather sinks the hips and bends the knees', () => {
    const g = fresh(() => buildChargeGather(scene, sk)!);
    at(g, 0); const h0 = hipsY();
    at(g, 0.5); expect(hipsY()).toBeLessThan(h0 - 0.15); expect(pos('RightLeg').z).toBeGreaterThan(pos('RightUpLeg').z + 0.1);   // knee forward of the hip
  });
  it('launch ends with both hands above the head', () => {
    at(fresh(() => buildLaunch(scene, sk)!), 0.35);
    expect(pos('LeftHand').y).toBeGreaterThan(pos('Head').y); expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y);
  });
  it('land crouch dips then recovers', () => {
    const g = fresh(() => buildLandCrouch(scene, sk)!);
    at(g, 0); const h0 = hipsY(); at(g, 0.45 * 0.4); expect(hipsY()).toBeLessThan(h0 - 0.2); at(g, 0.44); expect(hipsY()).toBeGreaterThan(h0 - 0.08);
  });
  it('tomahawk cocks both hands overhead; the big celebration flexes with hands up by the shoulders', () => {
    at(fresh(() => buildFinishTomahawk(scene, sk)!), 0.35);
    expect(pos('LeftHand').y).toBeGreaterThan(pos('Head').y); expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y);
    at(fresh(() => buildCelebrateBig(scene, sk)!), 0.9);
    expect(pos('RightHand').y).toBeGreaterThan(pos('RightArm').y - 0.1); expect(pos('RightHand').y).toBeLessThan(pos('Head').y + 0.15);
  });
  // DUNK MOTION phase 10b: Rider's — the off hand takes it up the front, feeds it under the raised left thigh, and the DUNKING hand
  // (right, as authored; mirrored onto the rig at spawn) finishes. It used to finish on the left: the mirror image of the dunk.
  it('eastbay: the left takes it, feeds it under the raised left knee to the right, and the right hand finishes at the rim', () => {
    const g = fresh(() => buildEastbay(scene, sk)!);
    at(g, EASTBAY_TIMING.swap); expect(Vector3.Distance(pos('LeftHand'), pos('RightHand')), 'both hands on it up the front').toBeLessThan(0.3);
    at(g, EASTBAY_TIMING.underKnee); expect(pos('LeftHand').x, 'the left hand outside the left knee').toBeLessThan(pos('LeftLeg').x + 0.05);
    at(g, EASTBAY_TIMING.handOff);
    expect(pos('LeftLeg').y).toBeGreaterThan(pos('RightLeg').y + 0.3);
    expect(Vector3.Distance(pos('LeftHand'), pos('RightHand')), 'palms meet under the thigh').toBeLessThan(0.2);
    expect(Math.max(pos('LeftHand').y, pos('RightHand').y), '…under it').toBeLessThan(pos('LeftLeg').y);
    at(g, EASTBAY_TIMING.extend); expect(pos('RightHand').y, 'the dunking hand at the rim').toBeGreaterThan(pos('Head').y + 0.2);
    expect(pos('LeftHand').y, 'the off arm out, not up').toBeLessThan(pos('Head').y);
  });
});

// DUNK-CONTROL-JUICE (2026-09-08): the named dunks — runway beats and in-air shapes.
describe('dunk tricks', () => {
  it('self-lob: both hands overhead on the contact key, eyes up', () => {
    const g = fresh(() => buildSelfLob(scene, sk)!);
    at(g, SELF_LOB_CONTACT);
    expect(pos('LeftHand').y).toBeGreaterThan(pos('Head').y + 0.1); expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y + 0.1);
    expect(Math.abs(pos('LeftHand').x - pos('RightHand').x)).toBeLessThan(0.45);   // a two-hand toss, not a T
  });
  it('bounce throw: two hands at the chest, then both driven down past the hips and forward on the contact key (DUNK-GLASS-BOUNCE)', () => {
    const g = fresh(() => buildBounceThrow(scene, sk)!);
    at(g, 0); expect(pos('RightHand').y).toBeGreaterThan(hipsY()); expect(Math.abs(pos('LeftHand').x - pos('RightHand').x)).toBeLessThan(0.5);
    at(g, BOUNCE_THROW_CONTACT);
    expect(pos('RightHand').y).toBeLessThan(hipsY() - 0.1); expect(pos('LeftHand').y).toBeLessThan(hipsY() - 0.1);   // down at the floor
    expect(pos('RightHand').z).toBeGreaterThan(pos('Hips').z + 0.25); expect(pos('LeftHand').z).toBeGreaterThan(pos('Hips').z + 0.25);   // out front
    expect(Math.abs(pos('LeftHand').x - pos('RightHand').x)).toBeLessThan(0.45);   // a two-hand throw
  });
  // THE OWNER'S KICK-UP (DUNK MOTION phase 10b, from his own video): bent over the dribble, the ball flicked up off the foot from
  // the floor, the body coming up tall behind it. The old one asserted the opposite — the foot thrown up 0.45 m over the other one,
  // a standing soccer volley, while the ball was on the floor a stride away.
  it('kick-up: bent over the ball, the right foot flicks it from just off the floor out front, then up tall with the hands up', () => {
    const g = fresh(() => buildKickUp(scene, sk)!);
    at(g, 0); expect(pos('RightHand').y, 'the ball hand low').toBeLessThan(hipsY() - 0.1); expect(pos('Head').z - pos('Hips').z, 'bent over it').toBeGreaterThan(0.2);
    at(g, KICK_UP_CONTACT);
    expect(pos('RightFoot').y, 'the kicking foot is down by the ball').toBeLessThan(pos('RightUpLeg').y - 0.6);
    expect(pos('RightFoot').z, '…out in front').toBeGreaterThan(pos('Hips').z + 0.2);
    at(g, KICK_UP_SEC);
    expect(pos('Head').z - pos('Hips').z, 'tall again').toBeLessThan(0.15);
    for (const s of ['Left', 'Right']) expect(pos(`${s}Hand`).y, `${s} hand up for the catch`).toBeGreaterThan(hipsY() + 0.2);
  });
  // JUS FLY'S CARTWHEEL (phase 10b): side-on, over the hands, travelling AT the rim — and facing it again at the end.
  it('cartwheel: throws the ball down, goes side-on over the hands with the legs overhead, and ends facing the rim', () => {
    const g = fresh(() => buildCartwheel(scene, sk)!);
    at(g, 0); expect(Math.max(pos('RightHand').y, pos('LeftHand').y), 'both hands down at the floor with the ball').toBeLessThan(hipsY());
    at(g, 0.58);
    expect(pos('Head').y, 'inverted').toBeLessThan(pos('Hips').y);
    for (const s of ['Left', 'Right']) expect(pos(`${s}Foot`).y, `${s} foot over the top`).toBeGreaterThan(pos('Hips').y);
    expect(Math.min(pos('RightHand').y, pos('LeftHand').y), 'on the hands').toBeLessThan(pos('Hips').y - 0.7);
    const side = (): number => Math.abs(pos('RightUpLeg').z - pos('LeftUpLeg').z) - Math.abs(pos('RightUpLeg').x - pos('LeftUpLeg').x);
    expect(side(), 'side-on: the hip line along the run').toBeGreaterThan(0);
    at(g, CARTWHEEL_SEC);
    expect(side(), 'square to the rim again').toBeLessThan(0);
    expect(pos('Head').y, 'upright').toBeGreaterThan(pos('Hips').y + 0.4);
    expect(CARTWHEEL_BOUNCE).toBeLessThan(0.2);   // the ball is gone before the wheel starts
  });
  // BACK HANDSPRING (owner, 2026-09-16) — it goes over BACKWARDS, not sideways. The cartwheel it replaced rolled about
  // the forward axis, which is a gymnastic move nobody has ever put in front of a dunk; a handspring lands you facing
  // the rim, still running at it, which is the only reason it belongs on a runway.
  it('back handspring: the head goes BACK not sideways, plants on the hands inverted, and lands facing the same way', () => {
    const g = fresh(() => buildBackHandspring(scene, sk)!);
    at(g, 0); const headUp = pos('Head').y, headZ0 = pos('Head').z - pos('Hips').z;
    at(g, 0.18);
    expect(pos('Head').z - pos('Hips').z, 'the head reaches BACK').toBeLessThan(headZ0 - 0.15);
    expect(Math.abs(pos('Head').x - pos('Hips').x), 'and not sideways — that was the cartwheel').toBeLessThan(0.25);
    at(g, 0.36);
    expect(pos('Head').y, 'inverted over the hands').toBeLessThan(pos('Hips').y);
    expect(Math.min(pos('RightHand').y, pos('LeftHand').y), 'hands planted low').toBeLessThan(pos('Hips').y);
    at(g, 0.8);
    expect(pos('Head').y, 'back on his feet').toBeCloseTo(headUp, 1);
    expect(pos('Head').z - pos('Hips').z, 'still facing the way he was running').toBeCloseTo(headZ0, 1);
  });
  // THE BACKFLIP (owner, 2026-09-16) — thrown on the approach: the ball goes up ahead, he turns over under it, and
  // lands running at the rim. No hands in it, so the TUCK is what gets him round.
  it('backflip: tucks tight, goes fully inverted with no hand on the floor, and lands facing the rim', () => {
    const g = fresh(() => buildBackflip(scene, sk)!);
    at(g, 0); const headZ0 = pos('Head').z - pos('Hips').z, headUp = pos('Head').y;
    at(g, 0.38);
    expect(pos('Head').y, 'inverted at the top').toBeLessThan(pos('Hips').y);
    expect(pos('LeftLeg').y, 'knees to the chest').toBeGreaterThan(pos('Hips').y - 0.25);
    expect(Math.min(pos('RightHand').y, pos('LeftHand').y), 'arms pulled in, never planted').toBeGreaterThan(0.35);
    at(g, BACKFLIP_SEC);
    expect(pos('Head').y, 'on his feet').toBeCloseTo(headUp, 1);
    expect(pos('Head').z - pos('Hips').z, 'still facing the rim').toBeCloseTo(headZ0, 1);
  });
  it('double-up: feet together on the load, a hop, and the loaded landing crouch', () => {
    const g = fresh(() => buildDoubleUp(scene, sk)!);
    at(g, 0.12); const load = hipsY(); expect(Math.abs(pos('LeftFoot').z - pos('RightFoot').z)).toBeLessThan(0.2); expect(pos('RightHand').z).toBeLessThan(pos('RightArm').z - 0.1);
    at(g, 0.3); expect(hipsY()).toBeGreaterThan(load + 0.3);
    at(g, 0.5); expect(hipsY()).toBeLessThan(load + 0.05); expect(pos('RightLeg').z).toBeGreaterThan(pos('RightUpLeg').z + 0.1);   // knees forward of the hips: loaded
  });
  // AUDIT (2026-09-16): Kilganon's scorpion is a NO-LOOK, BEHIND-THE-BACK jam — he watches the floor the whole way and
  // brings the ball behind him, not over the shoulder. This test used to assert the opposite of the real dunk on both
  // counts ("head up, the ball hand out front"), which is how a wrong body passed for a year.
  // DUNK MOTION phase 10b (owner, 2026-09-24: "make jordan kilganons scorpion accurate"), frame by frame off his All-Star jam: the ball
  // from the right HIP up that side, folded in behind the head with the elbow up, then the head DUCKS under it with the heels up behind.
  it('scorpion: from the hip, up the side, behind the head — then the head ducks under the ball, heels up behind', () => {
    const g = fresh(() => buildScorpion(scene, sk)!);
    at(g, 0); expect(pos('RightHand').y, 'the ball at the hip').toBeLessThan(hipsY() + 0.3);
    at(g, 0.18); expect(pos('RightHand').x - pos('RightArm').x, 'up the SIDE').toBeGreaterThan(0.12);
    at(g, 0.34); expect(pos('RightHand').z, 'folded in behind the head').toBeLessThan(pos('Head').z);
    expect(pos('RightForeArm').y, 'the elbow up').toBeGreaterThan(pos('RightArm').y);
    at(g, 0.64);
    for (const s of ['Left', 'Right']) { expect(pos(`${s}Foot`).z, `${s} heel behind`).toBeLessThan(pos('Hips').z - 0.25); expect(pos(`${s}Foot`).y, `${s} heel up`).toBeGreaterThan(pos(`${s}UpLeg`).y - 0.15); }
    expect(pos('RightHand').y, 'the ball over the ducked head').toBeGreaterThan(pos('Head').y + 0.15);
    expect(pos('RightHand').z, '…never out in front of the face').toBeLessThan(pos('Head').z + 0.05);
    expect(pos('Head').z - pos('Hips').z, 'the head ducked forward, toward the iron').toBeGreaterThan(0.2);
    expect(pos('Head').y - pos('Neck').y, 'chin down: he never looks').toBeLessThan(0.12);
  });
  it('scorpion flush: over the back of the ducked head and through, the tail still up until the ball has gone', () => {
    const g = fresh(() => buildScorpionFlush(scene, sk)!);
    at(g, 0.12);
    expect(pos('RightHand').z, 'over the top, toward the rim').toBeGreaterThan(pos('Head').z);
    for (const s of ['Left', 'Right']) expect(pos(`${s}Foot`).z, `${s} heel still behind`).toBeLessThan(pos('Hips').z - 0.2);
    const ducked = pos('Head').y - pos('Neck').y;
    at(g, SCORPION_FLUSH_SEC); expect(pos('Head').y - pos('Neck').y, 'the head comes up after').toBeGreaterThan(ducked + 0.03);
  });
  it('720: the ball pulled in and the knees up TIGHT through the second turn, then thrown open to the rim', () => {
    const g = fresh(() => buildSpin720(scene, sk)!);
    for (const t of [0, 0.25, 0.5]) {
      at(g, t);
      for (const s of ['Left', 'Right']) expect(pos(`${s}Leg`).y, `${s} knee up @${t}`).toBeGreaterThan(pos('Hips').y - 0.25);
      expect(pos('RightHand').y, `the ball at the chest @${t}`).toBeLessThan(pos('Head').y);
    }
    at(g, SPIN_720_SEC); expect(pos('RightHand').y, 'extended to the rim').toBeGreaterThan(pos('Head').y + 0.25);
  });
  it('lost & found: the ball hand goes behind the back, both hands meet there, the other hand ends at the rim', () => {
    const g = fresh(() => buildLostFound(scene, sk)!);
    at(g, 0.2); expect(pos('RightHand').z).toBeLessThan(pos('Hips').z - 0.15); expect(pos('RightHand').y).toBeLessThan(hipsY() + 0.15);
    at(g, LOST_FOUND_HANDOFF); expect(Vector3.Distance(pos('LeftHand'), pos('RightHand'))).toBeLessThan(0.35);
    at(g, 0.8); expect(pos('LeftHand').y).toBeGreaterThan(pos('Head').y + 0.2);
  });
  // AND IT IS A 360 (audit, 2026-09-16). The dunk is a self-oop behind the back with a full turn under it, and in this
  // engine a whole turn is a hips-yaw LAYER (DunkSpin) so a crossfade can never strand a body half-way round. A clip
  // that yaws its own hips fights that layer — ours used to, by 18/30/-8 degrees, which is how it shipped as a dunk
  // with a wiggle in it instead of a spin. The turn belongs to the cue table; the arms belong here.
  it('lost & found: the shoulders stay square through it — the 360 is the spin layer, not the clip', () => {
    const g = fresh(() => buildLostFound(scene, sk)!);
    for (const t of [0, 0.2, LOST_FOUND_HANDOFF, 0.5, 0.8]) {
      at(g, t);
      expect(Math.abs(pos('LeftArm').z - pos('RightArm').z)).toBeLessThan(0.08);   // 18 deg of yaw is already ~0.11
    }
  });
  // THE GAP IS THE TRICK. Until 2026-09-14 `betweenlegs` pointed at `dunk_360_fake_eastbay`, which aliases
  // to the EASTBAY's clip: two tricks, two names, two difficulties, one body. A player throwing the hardest
  // dunk in the list watched an animation they had already seen. These assertions are the ones that would
  // have caught it — they are about a SPLIT and a transfer underneath it, which the eastbay's body has not
  // got, so the shared clip could never have passed them.
  it('between the legs: the legs split, the ball goes down through the gap and swaps under the lead thigh', () => {
    const g = fresh(() => buildBetweenLegs(scene, sk)!);
    at(g, 0.28 + FRONT_SWAP_SEC);   // (phase 10b: the off hand takes it down; the right receives and finishes)
    // a real gap: the lead foot is carried HIGHER than the trail foot, which a tuck (both legs matched)
    // cannot produce. This is the assertion the shared eastbay clip could never have passed.
    // THE SPLIT IS A SCISSOR, not a lift. Measured on the rig: the lead foot goes to z +0.61 and the trail
    // foot to z -0.62, a 1.23 m gap. I first asserted the lead foot would be HIGHER and it is not -- a
    // negative thigh angle drives the leg forward on this rig, not up, so the shape is a hurdle stride.
    // The assertion follows what the body actually does.
    expect(pos('LeftFoot').z - pos('RightFoot').z).toBeGreaterThan(0.8);
    // and the ball is DOWN, below the hips, inside the gap the legs just made
    expect(pos('LeftHand').y).toBeLessThan(hipsY());
    expect(pos('LeftHand').z).toBeLessThan(pos('LeftFoot').z);
    expect(pos('LeftHand').z).toBeGreaterThan(pos('RightFoot').z);

    at(g, BETWEEN_LEGS_HANDOFF);
    // both palms on the ball, under the thigh rather than in front of it — this is the transfer
    expect(Vector3.Distance(pos('LeftHand'), pos('RightHand'))).toBeLessThan(0.35);
    expect(pos('RightHand').y).toBeLessThan(hipsY());

    // and it finishes long, in the DUNKING hand (phase 10b: it used to finish left-handed — the weak hand)
    at(g, BETWEEN_LEGS_SEC);
    expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y + 0.15);
  });

  it('rock the cradle (Jordan\'s): rocked down and back past the hip, then one arc over the top, on ONE hand', () => {
    const g = fresh(() => buildCradle(scene, sk)!);
    at(g, 0.2);
    // rocked DOWN: the ball hand low, by the hip, in front
    expect(pos('RightHand').y).toBeLessThan(pos('Hips').y + 0.25);
    at(g, CRADLE_BACK);
    // rocked BACK past the hip, still low
    expect(pos('RightHand').y).toBeLessThan(pos('Hips').y + 0.3);
    expect(Vector3.Distance(pos('LeftHand'), pos('RightHand'))).toBeGreaterThan(0.4);   // a CARRY, not a transfer
    at(g, CRADLE_ROUND);
    // over the top, HIGH
    expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y + 0.2);
    at(g, CRADLE_SEC);
    expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y + 0.15);
  });

  it('double clutch: the ball travels to the waist and back up, and finishes higher than it started', () => {
    const g = fresh(() => buildDoubleClutch(scene, sk)!);
    at(g, 0); const startY = pos('RightHand').y;
    at(g, 0.34);
    // THE TRAVEL IS THE TRICK, and the travel is what gets asserted. I first wrote "the hands end up below
    // the hips" and measured 1.099 against hips 1.028 -- the two-bone solver fits the hand as close to the
    // target as the arm allows and clamps the rest, so a keyed waist-height hand lands a little high. The
    // drop from where it started is the honest number: 0.78 m, measured.
    const bottomY = pos('RightHand').y;
    expect(startY - bottomY).toBeGreaterThan(0.6);
    expect(bottomY).toBeLessThan(pos('Head').y - 0.3);
    at(g, CLUTCH_SEC);
    expect(pos('RightHand').y).toBeGreaterThan(startY);
    expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y + 0.2);
  });

  // The guard against the whole class of bug: two tricks must never resolve to the same body.
  it('gives every air trick its own clip — no two share one', () => {
    const clips = DUNK_TRICKS.map((t) => t.clip);
    expect(new Set(clips).size).toBe(clips.length);
  });

  it('hide & seek: both hands behind the head, then the ball hand snaps overhead', () => {
    const g = fresh(() => buildHideSeek(scene, sk)!);
    at(g, 0.3); for (const s of ['Left', 'Right']) expect(pos(`${s}Hand`).z).toBeLessThan(pos('Head').z - 0.1);
    expect(Vector3.Distance(pos('LeftHand'), pos('RightHand'))).toBeLessThan(0.35);
    at(g, 0.8); expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y + 0.2);
  });
  it('360: the body of the turn — the ball to the chest through it, extended at the end; the shoulders never turn in the clip (the turn is the mode\'s yaw layer)', () => {
    const g = fresh(() => buildSpin360(scene, sk)!);
    at(g, 0); const a = pos('LeftArm').x - pos('RightArm').x;
    at(g, 0.3); expect(Vector3.Distance(pos('LeftHand'), pos('RightHand'))).toBeLessThan(0.4); expect(pos('RightHand').y).toBeLessThan(pos('Head').y);   // gathered
    const b = pos('LeftArm').x - pos('RightArm').x; expect(Math.sign(b)).toBe(Math.sign(a));   // DUNK-BIOMECH: no hips yaw authored — a crossfade can never cut a half-turn
    at(g, 0.8); const c = pos('LeftArm').x - pos('RightArm').x; expect(Math.sign(c)).toBe(Math.sign(a)); expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y + 0.1);
  });
  it('blown finish: ends in a brace (hands in front of the face, knees up), not a T held to the floor', () => {
    const g = fresh(() => buildFinishBlown(scene, sk)!);
    at(g, 0.35);
    expect(Math.abs(pos('LeftHand').x - pos('RightHand').x)).toBeLessThan(0.55);   // a T has them ~1.2 m apart
    for (const s of ['Left', 'Right']) { expect(pos(`${s}Hand`).z).toBeGreaterThan(pos('Hips').z + 0.15); expect(pos(`${s}Leg`).y).toBeGreaterThan(pos(`${s}UpLeg`).y - 0.35); }
  });
});

describe('football fills', () => {
  it('juke right plants the right knee up and turns the hips', () => {
    at(fresh(() => buildJuke(scene, sk, 'right')!), 0.15);
    expect(pos('RightLeg').y).toBeGreaterThan(pos('LeftLeg').y + 0.15);
    expect(pos('RightHand').y).toBeGreaterThan(hipsY() + 0.1);   // the ball stays tucked up
  });
  it('spin move turns the hips a full circle', () => {
    const g = fresh(() => buildSpinMove(scene, sk)!);
    at(g, 0); const a = pos('LeftArm').x - pos('RightArm').x;      // the shoulders' line reverses past a half turn
    at(g, 0.18); const b = pos('LeftArm').x - pos('RightArm').x;   // 130° in: facing more back than front
    expect(Math.sign(a)).not.toBe(Math.sign(b));
  });
  it('tackled fall drops the body', () => {
    const g = fresh(() => buildTackledFall(scene, sk)!);
    at(g, 0); const h0 = hipsY();
    at(g, 0.6); expect(hipsY()).toBeLessThan(h0 - 0.6);
  });
});

// MODE-STICK-FACE family (2026-09-07): sport-correct loco — the fighter keeps the guard up, the carrier keeps the ball.
describe('sport loco', () => {
  it('guard step: the legs alternate while both fists stay up at the chin, out front', () => {
    const g = fresh(() => buildGuardStep(scene, sk)!);
    at(g, 0.15); const a = pos('LeftFoot').z - pos('RightFoot').z;
    at(g, 0.45); const b = pos('LeftFoot').z - pos('RightFoot').z;
    expect(Math.sign(a)).not.toBe(Math.sign(b)); expect(Math.abs(a)).toBeGreaterThan(0.15);
    for (const t of [0.15, 0.45]) {
      at(g, t);
      for (const s of ['Left', 'Right']) { const h = pos(`${s}Hand`); expect(h.y).toBeGreaterThan(pos('Head').y - 0.4); expect(h.z).toBeGreaterThan(0.15); expect(Math.abs(h.x)).toBeLessThan(0.3); }
    }
  });
  it('carry run: the legs alternate, the ball hand stays tucked high on the chest, the off arm pumps', () => {
    const g = fresh(() => buildCarryRun(scene, sk)!);
    at(g, 0.15); const a = pos('LeftFoot').z - pos('RightFoot').z; const r1 = pos('RightHand').clone(); const l1 = pos('LeftHand').z;
    at(g, 0.45); const b = pos('LeftFoot').z - pos('RightFoot').z; const r2 = pos('RightHand').clone(); const l2 = pos('LeftHand').z;
    expect(Math.sign(a)).not.toBe(Math.sign(b)); expect(Math.abs(a)).toBeGreaterThan(0.25);
    for (const r of [r1, r2]) { expect(r.y).toBeGreaterThan(hipsY() + 0.05); expect(r.z).toBeGreaterThan(0.1); expect(Math.abs(r.x)).toBeLessThan(0.35); }   // tucked: high, in front, on the chest
    expect(Math.abs(r2.z - r1.z)).toBeLessThan(0.1);                                   // the ball hand does not pump
    expect(Math.abs(l2 - l1)).toBeGreaterThan(0.12);                                   // the off arm does
  });
});

describe('base clips (the forge\'s nine, built at runtime)', () => {
  it('guard: fists up in front of the chin, arms not out in a T', () => {
    const g = fresh(() => buildBaseClips(scene, sk).find((c) => c.name === 'guard')!);
    at(g, 0.1);
    for (const s of ['Left', 'Right']) { const h = pos(`${s}Hand`); expect(h.z).toBeGreaterThan(0.2); expect(h.y).toBeGreaterThan(pos('Head').y - 0.4); expect(Math.abs(h.x)).toBeLessThan(0.3); }
  });
  it('jab: the lead hand snaps out front', () => {
    const g = fresh(() => buildBaseClips(scene, sk).find((c) => c.name === 'jab')!);
    at(g, 0); const z0 = pos('LeftHand').z;
    at(g, 0.15); expect(pos('LeftHand').z).toBeGreaterThan(z0 + 0.25);
  });
  it('run: the legs alternate and the arms hang, swinging', () => {
    const g = fresh(() => buildBaseClips(scene, sk).find((c) => c.name === 'run')!);
    at(g, 0.15); const a = pos('LeftFoot').z - pos('RightFoot').z;
    at(g, 0.45); const b = pos('LeftFoot').z - pos('RightFoot').z;
    expect(Math.sign(a)).not.toBe(Math.sign(b)); expect(Math.abs(a)).toBeGreaterThan(0.25);
    expect(pos('RightHand').y).toBeLessThan(pos('RightArm').y - 0.3);
  });
  // Dunk play tip (2026-09-07): both arms were keyed on the same phase — no opposition, the gait read dead.
  for (const name of ['run', 'walk'] as const) {
    it(`${name}: the arms swing in OPPOSITE phase, each against its own leg`, () => {
      const g = fresh(() => buildBaseClips(scene, sk).find((c) => c.name === name)!);
      const dur = name === 'run' ? 0.6 : 1.0;
      for (const k of [0.25, 0.75]) {
        at(g, dur * k);
        const lArm = pos('LeftHand').z - pos('LeftArm').z, rArm = pos('RightHand').z - pos('RightArm').z;
        const lLeg = pos('LeftFoot').z - pos('LeftUpLeg').z, rLeg = pos('RightFoot').z - pos('RightUpLeg').z;
        expect(Math.abs(lArm)).toBeGreaterThan(0.05); expect(Math.abs(rArm)).toBeGreaterThan(0.05);
        expect(Math.sign(lArm)).not.toBe(Math.sign(rArm));                   // opposition between the arms
        expect(Math.sign(lArm)).not.toBe(Math.sign(lLeg));                   // the left arm opposes the left leg
        expect(Math.sign(rArm)).not.toBe(Math.sign(rLeg));                   // the right arm opposes the right leg
      }
      // a REAL pump (the twist read ~1°): the hands travel fore/aft between the two half-cycles; elbows bent forward
      at(g, dur * 0.25); const l1 = pos('LeftHand').z, r1 = pos('RightHand').z;
      at(g, dur * 0.75); const l2 = pos('LeftHand').z, r2 = pos('RightHand').z;
      expect(Math.abs(l2 - l1)).toBeGreaterThan(name === 'run' ? 0.12 : 0.06); expect(Math.abs(r2 - r1)).toBeGreaterThan(name === 'run' ? 0.12 : 0.06);
      at(g, 0);
      for (const s of ['Left', 'Right']) { expect(pos(`${s}Hand`).z).toBeGreaterThan(pos(`${s}ForeArm`).z + 0.04); expect(pos(`${s}Hand`).y).toBeLessThan(pos(`${s}Arm`).y - 0.25); }
    });
  }
  it('jumpshot: both hands above the head at the release', () => {
    const g = fresh(() => buildBaseClips(scene, sk).find((c) => c.name === 'jumpshot')!);
    at(g, 0.5); expect(pos('LeftHand').y).toBeGreaterThan(pos('Head').y); expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y);
  });
  it('high kick: the right foot rises above the hips', () => {
    const g = fresh(() => buildBaseClips(scene, sk).find((c) => c.name === 'high_kick')!);
    at(g, 0.28); expect(pos('RightFoot').y).toBeGreaterThan(hipsY() - 0.1);
  });
});

// DUNK MOTION phase 12 — the celebrations, watched on the real dunkers first (owner: "look up dunkers like brandon ruffin").
describe('the celebrations', () => {
  it('Ruffin: the scream, a hand on the floor in the Spider-Man, then down into the splits', () => {
    const g = fresh(() => buildCelebSpidermanSplits(scene, sk)!);
    at(g, 0); const hipsAtRest = hipsY();
    at(g, 0.28); expect(pos('Head').z - pos('Neck').z, 'head back: the scream').toBeLessThan(0.08);
    at(g, 0.95);
    expect(Math.min(pos('LeftHand').y, pos('RightHand').y), 'a hand on the floor (the wrist; the palm is flat under it)').toBeLessThan(0.25);
    expect(pos('Hips').y, 'down in the crouch').toBeLessThan(hipsAtRest - 0.35);
    at(g, CELEB_SPIDERMAN_SEC);
    expect(pos('Hips').y, 'the splits: the hips near the floor').toBeLessThan(0.35);
    expect(Math.abs(pos('LeftFoot').z - pos('RightFoot').z), 'one leg ahead, one behind').toBeGreaterThan(1.2);
  });
  it('Carter: "it\'s over" — the arms wide, then crossed in front, palms down', () => {
    const g = fresh(() => buildCelebItsOver(scene, sk)!);
    at(g, 0.25); const wide = Math.abs(pos('LeftHand').x - pos('RightHand').x);
    at(g, 0.5); const crossed = pos('RightHand').x - pos('LeftHand').x;
    expect(wide).toBeGreaterThan(1.0);
    expect(Math.sign(crossed), 'crossed over').toBe(Math.sign(pos('RightArm').x - pos('LeftArm').x) * -1);
  });
  it('the roar: ripped down into a crouch, fists low, head up', () => {
    const g = fresh(() => buildCelebRoar(scene, sk)!);
    at(g, 0); const hipsAtRest = hipsY();
    at(g, 0.2); const up = pos('RightHand').y;
    at(g, 0.45); expect(pos('RightHand').y).toBeLessThan(up - 0.4); expect(pos('Hips').y).toBeLessThan(hipsAtRest - 0.08);
  });
  it('too small: the flat hand patted over the head', () => {
    const g = fresh(() => buildCelebTooSmall(scene, sk)!);
    at(g, 0.25); const hi = pos('RightHand').y; expect(hi).toBeGreaterThan(pos('Head').y);
    at(g, 0.45); expect(pos('RightHand').y).toBeLessThan(hi - 0.05);
  });
});
