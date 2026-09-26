// Proves the basketball packages on the REAL forge rig: load the shipped
// hero in a NullEngine, build each clip against its skeleton, scrub to the
// key frame and measure where hands, knees and hips actually are.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from '../boneLookup';
import { followThroughFor } from '../../core/BasketballCore';
import {
  buildBlockReach, buildCrossover, buildDefendSlide, buildDribbleIdle, buildHesi, buildLayupGather, buildStealReach, buildFollowThrough,
  buildPullupGather, buildFloater, buildHandUp, buildScreenSet,
  buildLandAbsorb,   // HOOPS-DEPTH S4
  buildFollowThroughEarly, buildFollowThroughLate, buildContactReact,   // HOOPS-DEPTH S6 / S8
  buildPostUp, buildFadeaway, buildHook, buildSpin,   // HOOPS-MOVE-KIT-B (2026-09-08): the post kit (M4–M6)
  buildPumpFake, buildStepThrough, buildPivot, buildReverseLayup, buildHopStep, buildEuroStep,   // wave 2: the footwork (M8–M14)
  buildMikan, buildUpAndUnder, buildFingerRoll,   // 2026-09-16: the layup vocabulary
  buildScoopLayup, buildSpinLayup, buildHangLayup,   // 2026-09-18: the acrobatic layups
  buildShimmy, buildDropStep,                        // 2026-09-18: the post game
  buildInAndOut, buildBetweenLegsDribble, buildBehindBackDribble, buildDoubleCross, buildSnatchBack,
  buildShammgod, buildYoyo, buildAnkleStumble, buildAnkleSlip,   // 2026-09-16: the handle, and the ankles
  buildIdleStandHoops,   // HOOPS MOTION phase 3b (review): the ball-less watch with knees
} from './basketball';
import { basketballClipTable } from '../basketballTree';
import { HOOPS_OVERHEAD_CLIPS, anatomicalByDefault, closesLoop, withOverheadTransitions } from '../poseClip';
import { mirrorGroupsInPlace } from '../groupMirror';
import { MOCAP_OPPONENT_CLIPS, buildMocapOpponentClip } from './mocapOpponents';
import { CLIP_ALIASES } from '../clipAliases';

let scene: Scene; let sk: Skeleton;
const bind = new Map<TransformNode, { p: Vector3; q: Quaternion }>(); let root: TransformNode;

beforeAll(async () => {
  scene = new Scene(new NullEngine());
  scene.metadata = { felModeId: 'onevone' };   // HOOPS MOTION phase 3c: a hoops mode's bodies (the smoothing and the overhead pole rule are theirs)
  new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const b64 = readFileSync(process.env.FEL_HERO_GLB ?? 'public/models/fel-hero.glb').toString('base64');
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0];
  for (const b of sk.bones) { const n = b.getTransformNode(); if (n) bind.set(n, { p: n.position.clone(), q: (n.rotationQuaternion ?? Quaternion.Identity()).clone() }); } root = r.meshes[0] as TransformNode;
});

function at(g: AnimationGroup, sec: number): void {
  // one clip at a time, from bind: a stopped group leaves the bones it keyed where they were
  for (const x of scene.animationGroups) x.stop();
  for (const [n, t] of bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); }
  g.start(false, 1, g.from, g.to, false); g.goToFrame(sec * 30); scene.render();
}
/** Back to bind with nothing playing — build a clip from HERE (the builder fits the hands against the current pose). */
function rest(): void { for (const x of scene.animationGroups) x.stop(); for (const [n, t] of bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); } }
function pos(name: string): Vector3 {
  const n = boneNode(sk, name)!; n.computeWorldMatrix(true); return n.getAbsolutePosition();
}

describe('basketball packages on the forge rig', () => {
  // HOOPS MOTION phase 3b (review): the tree's `watch` played idle_stand, which keys no leg — its knees were the previous clip's (21–95°
  // across takes: the 1v1 hero 63.4 → 28.2° in a session). The hoops watch keys both legs on every key, so the knees are its own.
  it('the ball-less watch (bball_idle_stand) keys its own knees: the same bend on every key, whatever clip came before', () => {
    rest(); const watch = buildIdleStandHoops(scene, sk)!, slide = buildDefendSlide(scene, sk, 'left')!;
    const knee = () => { const a = pos('LeftUpLeg'), k = pos('LeftLeg'), f = pos('LeftFoot'); const u = a.subtract(k).normalize(), v = f.subtract(k).normalize(); return 180 - Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(u, v)))) * 180 / Math.PI; };
    const bends: number[] = [];
    for (const t of [0, 1.5, 3]) { at(watch, t); bends.push(knee()); }
    expect(Math.max(...bends) - Math.min(...bends)).toBeLessThan(1.5);
    expect(bends[0]).toBeGreaterThan(15); expect(bends[0]).toBeLessThan(40);   // soft athletic knees, not locked, not a crouch
    // after the deep slide stance (no reset to bind between them): the same knees
    at(slide, 0.25); const deep = knee();
    watch.start(true, 1, watch.from, watch.to, false); watch.goToFrame(0); scene.render();
    for (const x of scene.animationGroups) if (x !== watch) x.stop();
    scene.render();
    expect(Math.abs(deep - bends[0])).toBeGreaterThan(5);                       // (the slide really is a different bend)
    expect(Math.abs(knee() - bends[0])).toBeLessThan(1.5);
    watch.stop();
    // the tree's watch asks for it, and a rig that did not build it falls back to the base idle
    expect(basketballClipTable().watch.clip).toBe('bball_idle_stand');
    expect(CLIP_ALIASES.bball_idle_stand?.[0]).toBe('idle_stand');
  });
  it('dribble idle keeps the ball hand low and in front', () => {
    at(buildDribbleIdle(scene, sk)!, 0.4);
    const h = pos('RightHand'), head = pos('Head');
    expect(h.y).toBeLessThan(1.1);
    expect(h.z).toBeGreaterThan(0.15);
    expect(head.y).toBeGreaterThan(pos('Hips').y + 0.45);   // upright enough — relative, so a shorter body passes too
  });
  it('block reach puts both hands above the head', () => {
    at(buildBlockReach(scene, sk)!, 0.25);
    const head = pos('Head');
    expect(pos('LeftHand').y).toBeGreaterThan(head.y + 0.25);
    expect(pos('RightHand').y).toBeGreaterThan(head.y + 0.25);
  });
  // owner, 2026-09-16: "fix the legs when you jump for a block, they shouldn't go in the air". The clip keyed the hips,
  // one spine and the hands and nothing else, so the legs kept whatever the previous clip left them in — and the clip
  // before a block is almost always the defensive slide, which sits at thighs −28 with the knees at 40. Lift the root
  // under that and the man goes up with his knees tucked in front of him.
  it('block reach hangs the legs LONG underneath — a contest is not a tuck', () => {
    const g = buildBlockReach(scene, sk)!;
    at(g, 0);
    // the KNEE JOINT barely changes height between a bent leg and a straight one — it sits at the end of the thigh
    // either way. What a tuck does is bring it FORWARD of the hips, so that is what this measures.
    const loadedKnee = pos('LeftLeg').z - pos('Hips').z;     // the gather: knees forward, under the chest
    for (const t of [0.25, 0.5]) {
      at(g, t);
      for (const s of ['Left', 'Right']) {
        // the feet hang well below the hips, and the knee is nearly under the hip rather than lifted in front of it
        expect(pos(`${s}Foot`).y, `${s} foot at ${t}`).toBeLessThan(pos('Hips').y - 0.55);
        expect(pos(`${s}Leg`).z - pos('Hips').z, `${s} knee at ${t}`).toBeLessThan(loadedKnee - 0.04);
        expect(pos(`${s}Foot`).z, `${s} foot at ${t}`).toBeLessThan(pos('Hips').z + 0.32);   // under, not out in front
      }
    }
  });
  it('layup gather drives the inside knee up and the ball hand high', () => {
    at(buildLayupGather(scene, sk)!, 0.3);
    expect(pos('RightLeg').y).toBeGreaterThan(pos('LeftLeg').y + 0.3);   // knee well above the other knee
    expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y);
  });
  // HOOPS-MOVE-KIT-A (2026-09-08)
  // (each clip is built ONCE, from bind, before any scrub: the builder fits the hands against the skeleton's current pose)
  it('the LEFT layup is the mirror: the left knee up, the left hand high, the right hand low', () => {
    rest(); const left = buildLayupGather(scene, sk, 'left')!, right = buildLayupGather(scene, sk, 'right')!;
    at(left, 0.3);
    expect(pos('LeftLeg').y).toBeGreaterThan(pos('RightLeg').y + 0.3);
    expect(pos('LeftHand').y).toBeGreaterThan(pos('Head').y);
    expect(pos('RightHand').y).toBeLessThan(pos('Head').y);
    const lx = pos('LeftHand').x, rx = pos('RightHand').x;
    at(right, 0.3);
    expect(pos('RightHand').x).toBeCloseTo(-lx, 1);   // the high hand on the other side of the body
    expect(pos('LeftHand').x).toBeCloseTo(-rx, 1);
  });
  it('the layup lands with the feet under the body and the hands down the front (no T)', () => {
    at(buildLayupGather(scene, sk)!, 0.7);
    const lf = pos('LeftFoot'), rf = pos('RightFoot'), lh = pos('LeftHand'), rh = pos('RightHand'), sh = (pos('LeftArm').y + pos('RightArm').y) / 2;
    expect(Math.abs(lf.y - rf.y)).toBeLessThan(0.12);
    expect(lh.y).toBeLessThan(sh - 0.15); expect(rh.y).toBeLessThan(sh - 0.15);
    expect(Math.hypot(lh.x - rh.x, lh.z - rh.z)).toBeLessThan(0.7);
  });
  it('an early release is a short arm and a late one a flat push with the chest over — the release reads in the body (HOOPS-DEPTH S6)', () => {
    rest(); const green = buildFollowThrough(scene, sk)!;
    at(green, 0.15); const gHand = pos('RightHand').clone(), gHead = pos('Head').clone(), gHips = pos('Hips').clone();
    rest(); const early = buildFollowThroughEarly(scene, sk)!;
    at(early, 0.12); const eHand = pos('RightHand').clone(), eHead = pos('Head').clone();
    expect(eHand.y).toBeLessThan(gHand.y - 0.08);                 // the short arm: the ball leaves from the forehead, not overhead
    expect(eHand.y).toBeGreaterThan(eHead.y - 0.1);               // …still up by the face, not a chest pass
    rest(); const late = buildFollowThroughLate(scene, sk)!;
    at(late, 0.15); const lHand = pos('RightHand').clone(), lHead = pos('Head').clone(), lHips = pos('Hips').clone();
    expect(lHand.z - lHips.z).toBeGreaterThan(gHand.z - gHips.z + 0.08);   // the flat push: the hands out in front
    expect(lHead.z - lHips.z).toBeGreaterThan(gHead.z - gHips.z + 0.04);   // the chest pitched over the feet
    at(late, 0.4); const lKnee = Math.min(pos('LeftLeg').y, pos('RightLeg').y);
    at(green, 0.4); expect(lKnee).toBeLessThan(Math.min(pos('LeftLeg').y, pos('RightLeg').y) + 0.001);   // a heavier landing than the green one
    // all three end on the same stance, so the absorb and the loop after them do not change
    at(early, 0.6); const eEnd = pos('RightHand').clone(); at(green, 0.7); const gEnd = pos('RightHand').clone(); at(late, 0.7);
    expect(Vector3.Distance(eEnd, gEnd)).toBeLessThan(0.05); expect(Vector3.Distance(pos('RightHand'), gEnd)).toBeLessThan(0.05);
    expect(followThroughFor('early')).toBe('bball_follow_through_early'); expect(followThroughFor('late')).toBe('bball_follow_through_late');
    expect(followThroughFor('held')).toBe('bball_follow_through_late'); expect(followThroughFor('perfect')).toBe('bball_follow_through'); expect(followThroughFor('good')).toBe('bball_follow_through');
  });
  it('the bump braces with the forearms up and the elbows BENT — never a straight-armed reach (HOOPS-DEPTH S8)', () => {
    rest(); const g = buildContactReact(scene, sk)!;
    const elbow = (s: 'Left' | 'Right') => { const a = pos(`${s}Arm`), b = pos(`${s}ForeArm`), c = pos(`${s}Hand`); const u = a.subtract(b), v = c.subtract(b); return Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(u, v) / (u.length() * v.length())))) * 180 / Math.PI; };
    for (const t of [0, 0.12, 0.32]) { at(g, t); expect(elbow('Left'), `L @${t}`).toBeLessThan(150); expect(elbow('Right'), `R @${t}`).toBeLessThan(150); }
    at(g, 0.12); const head = pos('Head'); expect(pos('RightHand').z).toBeGreaterThan(pos('Hips').z + 0.1); expect(pos('RightHand').y).toBeLessThan(head.y + 0.05);   // in front, chest-high
  });
  it('the landing absorb takes the jump on the knees with the hands still high, then stands up (HOOPS-DEPTH S4)', () => {
    rest(); const g = buildLandAbsorb(scene, sk)!;
    at(g, 0);
    const kneeCatch = Math.min(pos('LeftLeg').y, pos('RightLeg').y), hipsCatch = pos('Hips').y, handCatch = pos('RightHand').y;
    expect(kneeCatch).toBeLessThan(0.6);                                  // the knees loaded
    at(g, 0.3);
    expect(pos('Hips').y).toBeGreaterThan(hipsCatch + 0.04);              // the hips come back up from the absorb (the knees unload)
    expect(pos('RightHand').y).toBeLessThan(handCatch - 0.3);            // the arms come down from the release
  });
  it('the pull-up gather brings both hands onto the ball at the hip with the knees loaded, then sets it at the chest', () => {
    rest(); const g = buildPullupGather(scene, sk)!;
    at(g, 0.14);
    const lh = pos('LeftHand'), rh = pos('RightHand'), hips = pos('Hips');
    expect(Vector3.Distance(lh, rh)).toBeLessThan(0.34);                 // both hands on the ball
    expect(rh.y).toBeLessThan(hips.y + 0.1);                             // at the hip
    expect(pos('LeftLeg').y).toBeLessThan(0.62); expect(pos('RightLeg').y).toBeLessThan(0.62);   // the knees loaded (bind ≈ 0.5 + hips drop)
    at(g, 0.3);
    const lh2 = pos('LeftHand'), rh2 = pos('RightHand');
    expect(Vector3.Distance(lh2, rh2)).toBeLessThan(0.34);
    expect(rh2.y).toBeGreaterThan(pos('Hips').y + 0.2);                  // up to the chest
    expect(rh2.y).toBeLessThan(pos('Head').y);
  });
  it('the hand-up contest: one arm straight up over the head, the other low, both feet on the floor, no jump', () => {
    rest(); const g = buildHandUp(scene, sk)!;
    at(g, 0.35);
    expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y + 0.25);
    expect(pos('LeftHand').y).toBeLessThan(pos('Head').y - 0.2);
    expect(pos('LeftFoot').y).toBeLessThan(0.15); expect(pos('RightFoot').y).toBeLessThan(0.15);
    expect(Math.abs(pos('LeftFoot').x - pos('RightFoot').x)).toBeGreaterThan(0.4);   // a wide stance
  });
  it('the screen: a wide planted base, both hands low in front of the hips, the chest tall', () => {
    rest(); const g = buildScreenSet(scene, sk)!;
    at(g, 0.45);
    expect(Math.abs(pos('LeftFoot').x - pos('RightFoot').x)).toBeGreaterThan(0.4);
    expect(pos('LeftHand').y).toBeLessThan(pos('Hips').y + 0.1); expect(pos('RightHand').y).toBeLessThan(pos('Hips').y + 0.1);
    expect(Vector3.Distance(pos('LeftHand'), pos('RightHand'))).toBeLessThan(0.3);
    expect(pos('Head').y).toBeGreaterThan(pos('Hips').y + 0.45);
  });
  it('the floater releases from a hand above the head, one-handed, the off hand at the chest', () => {
    rest(); const g = buildFloater(scene, sk)!;
    at(g, 0.35);
    expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y + 0.1);
    expect(pos('LeftHand').y).toBeLessThan(pos('Head').y);
    expect(pos('RightLeg').y).toBeGreaterThan(pos('LeftLeg').y + 0.25);   // the runner's knee
    at(g, 0.7);
    expect(pos('RightHand').y).toBeLessThan((pos('LeftArm').y + pos('RightArm').y) / 2 - 0.15);   // down the front at feet-down
  });
  it('defensive slide is wide and low with the hands below the shoulders', () => {
    at(buildDefendSlide(scene, sk, 'left')!, 0.25);
    const lf = pos('LeftFoot'), rf = pos('RightFoot');
    expect(Math.abs(lf.x - rf.x)).toBeGreaterThan(0.45);
    expect(pos('LeftHand').y).toBeLessThan(1.3);
    expect(Math.abs(pos('LeftHand').x)).toBeGreaterThan(0.28);
    expect(pos('LeftHand').z).toBeGreaterThan(0.2);   // in front, not out to the side
  });
  it('steal reach flashes the lead hand well forward', () => {
    const g = buildStealReach(scene, sk)!;
    at(g, 0); const before = pos('RightHand').z;
    at(g, 0.15); expect(pos('RightHand').z).toBeGreaterThan(before + 0.2);
  });
  it('crossover turns the hips and sweeps the ball hand across', () => {
    const g = buildCrossover(scene, sk, 'left')!;
    at(g, 0); const x0 = pos('RightHand').x;
    at(g, 0.2);
    const hips = boneNode(sk, 'Hips')!; hips.computeWorldMatrix(true);
    const yaw = Math.abs(hips.rotationQuaternion!.toEulerAngles().y);
    expect(yaw).toBeGreaterThan(0.3);
    expect(Math.abs(pos('RightHand').x - x0)).toBeGreaterThan(0.12);
  });
  it('follow-through starts overhead, snaps the shooting wrist forward and comes down the front (never a T)', () => {
    const g = buildFollowThrough(scene, sk)!;
    at(g, 0);
    const head = pos('Head');
    expect(pos('RightHand').y).toBeGreaterThan(head.y + 0.2);   // both arms overhead at the release frame
    expect(pos('LeftHand').y).toBeGreaterThan(head.y + 0.1);
    at(g, 0.15);
    expect(pos('RightHand').z).toBeGreaterThan(0.3);            // the wrist snap: the ball hand forward
    expect(pos('RightHand').y).toBeGreaterThan(pos('LeftHand').y + 0.2);   // the arm stays up while the off hand drops
    for (const t of [0.3, 0.45, 0.6, 0.7]) {
      at(g, t);
      const l = pos('LeftHand'), r = pos('RightHand'), la = pos('LeftArm'), ra = pos('RightArm');
      const along = Math.abs(((l.x - r.x) * (ra.x - la.x) + (l.z - r.z) * (ra.z - la.z)) / (Math.hypot(ra.x - la.x, ra.z - la.z) || 1));
      expect(along).toBeLessThan(0.9);                           // the hands never spread along the shoulders' line (a T is ~1.3 m)
      expect(l.z).toBeGreaterThan(0.1); expect(r.z).toBeGreaterThan(0.1);   // down the FRONT
    }
    at(g, 0.7);
    expect(pos('RightHand').y).toBeLessThan(1.4);                // settled to a ready stance
  });
  it('hesi loads the knees without moving the hands much', () => {
    const g = buildHesi(scene, sk)!;
    at(g, 0); const h0 = pos('RightHand').clone();
    at(g, 0.2);
    expect(Vector3.Distance(pos('RightHand'), h0)).toBeLessThan(0.2);
  });

  // ── HOOPS-MOVE-KIT-B (2026-09-08): the post kit on the rig ───────────────────────────────────────────────────────
  it('the post-up seal: a wide planted base, the ball out and low on the ball side, the seal arm BEHIND the ball', () => {
    rest(); const g = buildPostUp(scene, sk)!;
    at(g, 0.45);
    const lf = pos('LeftFoot'), rf = pos('RightFoot'), ball = pos('RightHand'), seal = pos('LeftHand'), hips = pos('Hips');
    expect(Math.abs(lf.x - rf.x)).toBeGreaterThan(0.4);                  // planted wide, a body he cannot get round
    expect(ball.y).toBeLessThan(hips.y + 0.15);                          // the ball low …
    expect(Math.abs(ball.x - hips.x)).toBeGreaterThan(0.25);             // … and out on the ball side, away from the poke
    expect(seal.z).toBeLessThan(ball.z);                                 // the off arm is the seal: behind the ball, into him
    expect(pos('Head').y).toBeGreaterThan(hips.y + 0.45);                // the chest tall through the back-down
  });
  it('M4 the FADEAWAY leans: at the release the shoulders are BEHIND the hips and the knees in FRONT of them', () => {
    rest(); const g = buildFadeaway(scene, sk)!;
    at(g, 0.38);
    const head = pos('Head'), hips = pos('Hips'), rh = pos('RightHand');
    const shoulders = (pos('LeftArm').z + pos('RightArm').z) / 2;
    // the rig faces +z at bind, so "behind" is −z: the lean is the shot
    expect(head.z).toBeLessThan(hips.z - 0.1);                           // the head thrown back over the hips
    expect(shoulders).toBeLessThan(hips.z - 0.08);                       // the whole shoulder line, not just the neck
    expect(pos('LeftLeg').z).toBeGreaterThan(hips.z + 0.1);              // the knees kicked out in front
    expect(pos('RightLeg').z).toBeGreaterThan(hips.z + 0.1);
    expect(rh.y).toBeGreaterThan(head.y);                                // the ball goes up out of the lean
    at(g, 0.8);
    const lf = pos('LeftFoot'), rf = pos('RightFoot');
    expect(Math.abs(lf.y - rf.y)).toBeLessThan(0.12);                    // a balanced landing …
    expect(pos('Head').z).toBeGreaterThan(pos('Hips').z - 0.08);         // … squared back up
    expect(pos('RightHand').y).toBeLessThan((pos('LeftArm').y + pos('RightArm').y) / 2 - 0.1);   // the arms down the front, no T
  });
  it('M5 the JUMP HOOK releases high and OUT to the side over a shielding arm, off the opposite knee', () => {
    rest(); const g = buildHook(scene, sk)!;
    at(g, 0.34);
    const head = pos('Head'), hips = pos('Hips'), ball = pos('RightHand'), shield = pos('LeftHand');
    expect(ball.y).toBeGreaterThan(head.y + 0.1);                        // over the top
    expect(Math.abs(ball.x - hips.x)).toBeGreaterThan(0.25);             // OUT to the side — this is what makes it a hook
    expect(shield.y).toBeGreaterThan(hips.y + 0.15);                     // the shield arm up …
    expect(shield.y).toBeLessThan(head.y);                               // … at shoulder height, not overhead
    expect(shield.x).toBeLessThan(ball.x - 0.5);                         // and on the other side of the body, between him and the ball
    expect(pos('LeftLeg').y).toBeGreaterThan(pos('RightLeg').y + 0.25);  // the opposite knee drives up
    at(g, 0.72);
    expect(pos('RightHand').y).toBeLessThan((pos('LeftArm').y + pos('RightArm').y) / 2 - 0.1);   // down the front at feet-down
  });
  it('the LEFT hook is the mirror: the left hand over the top, the right arm the shield, the right knee up', () => {
    rest(); const left = buildHook(scene, sk, 'left')!;
    at(left, 0.34);
    expect(pos('LeftHand').y).toBeGreaterThan(pos('Head').y + 0.1);
    expect(pos('RightHand').y).toBeLessThan(pos('Head').y);
    expect(pos('RightHand').x).toBeGreaterThan(pos('LeftHand').x + 0.5);
    expect(pos('RightLeg').y).toBeGreaterThan(pos('LeftLeg').y + 0.25);
  });
  it('M6 the SPIN protects the ball: both hands tight at the chest through the turn, the trail knee up, the exit back out front', () => {
    rest(); const g = buildSpin(scene, sk)!;
    at(g, 0.16);                                                         // the plant: the ball snaps in, the trail leg swings
    expect(Vector3.Distance(pos('LeftHand'), pos('RightHand'))).toBeLessThan(0.36);   // both hands on the ball — nothing to poke
    expect(pos('RightHand').y).toBeGreaterThan(pos('Hips').y + 0.15); expect(pos('RightHand').y).toBeLessThan(pos('Head').y);   // at the chest
    expect(pos('RightLeg').y).toBeGreaterThan(pos('LeftLeg').y + 0.15);  // the trail knee swinging round …
    expect(pos('LeftFoot').y).toBeLessThan(0.2);                         // … over a pivot foot that stays on the floor
    at(g, 0.34);                                                         // mid-turn: still tight to the chest, still tall
    expect(Vector3.Distance(pos('LeftHand'), pos('RightHand'))).toBeLessThan(0.36);
    expect(pos('Head').y).toBeGreaterThan(pos('Hips').y + 0.45);
    at(g, 0.6);
    expect(pos('RightHand').z).toBeGreaterThan(pos('Hips').z + 0.1);     // the exit: the ball back out front …
    expect(pos('RightHand').y).toBeLessThan(pos('Hips').y + 0.15);       // … and low, in the dribble
  });

  // ── HOOPS-MOVE-KIT-B wave 2 (2026-09-08): the footwork on the rig ───────────────────────────────────────────────
  it('M8 the PUMP FAKE sells the shot and keeps the feet on the floor', () => {
    rest(); const g = buildPumpFake(scene, sk)!;
    const restFootY = (pos('LeftFoot').y + pos('RightFoot').y) / 2;
    at(g, 0.22);
    expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y);                  // the ball up at the release height …
    expect(pos('LeftFoot').y).toBeLessThan(restFootY + 0.05);                   // … over feet that never left the floor
    expect(pos('RightFoot').y).toBeLessThan(restFootY + 0.05);
    expect(pos('LeftLeg').y).toBeLessThan(pos('Hips').y);                       // still loaded — that is the tell
    at(g, 0.5);
    expect(pos('RightHand').y).toBeLessThan(pos('Head').y);                     // and back down to the chest
  });
  it('M8 the STEP-THROUGH reaches a leg across and sweeps the ball low and away', () => {
    rest(); const g = buildStepThrough(scene, sk)!;
    at(g, 0.15);
    expect(pos('LeftFoot').y).toBeGreaterThan(pos('RightFoot').y + 0.1);        // the lead leg is in the air, reaching
    expect(pos('RightHand').y).toBeLessThan(pos('Hips').y + 0.2);               // the ball swept LOW, under the contest
    expect(pos('LeftHand').y).toBeLessThan(pos('Head').y);
    at(g, 0.3);
    expect(Math.abs(pos('LeftFoot').y - pos('RightFoot').y)).toBeLessThan(0.2); // planted through the gap, loaded
  });
  it('M9 the PIVOT keeps the ball tucked and the chest tall while the free leg steps around', () => {
    rest(); const g = buildPivot(scene, sk)!;
    at(g, 0.2);
    expect(Vector3.Distance(pos('LeftHand'), pos('RightHand'))).toBeLessThan(0.4);   // the ball protected across the body
    expect(pos('RightHand').y).toBeLessThan(pos('Head').y);
    expect(pos('RightLeg').y).toBeGreaterThan(pos('LeftLeg').y + 0.1);               // the free leg steps round
    expect(pos('Head').y).toBeGreaterThan(pos('Hips').y + 0.45);
  });
  it('M11 the REVERSE lays the ball back BEHIND the head, on the far side', () => {
    rest(); const g = buildReverseLayup(scene, sk)!;
    at(g, 0.34);
    const head = pos('Head'), hand = pos('RightHand');
    expect(hand.y).toBeGreaterThan(head.y);                                      // above …
    expect(hand.z).toBeLessThan(head.z);                                         // … and BEHIND it: laid back over the rim
    expect(pos('RightLeg').y).toBeGreaterThan(pos('LeftLeg').y + 0.25);          // off the inside knee
    at(g, 0.74);
    expect(pos('RightHand').y).toBeLessThan((pos('LeftArm').y + pos('RightArm').y) / 2 - 0.1);   // down the front at feet-down
  });
  it('the LEFT reverse is the mirror', () => {
    rest(); const left = buildReverseLayup(scene, sk, 'left')!;
    at(left, 0.34);
    expect(pos('LeftHand').y).toBeGreaterThan(pos('Head').y);
    expect(pos('LeftHand').z).toBeLessThan(pos('Head').z);
    expect(pos('LeftLeg').y).toBeGreaterThan(pos('RightLeg').y + 0.25);
  });
  it('M13 the HOP STEP takes both knees up TOGETHER and lands on both feet, square', () => {
    rest(); const g = buildHopStep(scene, sk)!;
    at(g, 0.12);
    expect(Math.abs(pos('LeftLeg').y - pos('RightLeg').y)).toBeLessThan(0.08);   // BOTH knees, together — the legality
    expect(pos('LeftLeg').y).toBeGreaterThan(0.5);
    expect(Vector3.Distance(pos('LeftHand'), pos('RightHand'))).toBeLessThan(0.4);   // the ball into both hands
    at(g, 0.26);
    expect(Math.abs(pos('LeftFoot').y - pos('RightFoot').y)).toBeLessThan(0.08);  // both feet land together
    expect(pos('LeftLeg').y).toBeLessThan(pos('Hips').y);                         // square and loaded
  });
  // ── the layup vocabulary (owner, 2026-09-16) ──────────────────────────────────────────────────────────────
  it('the MIKAN puts the ball up beside the ear, not out in front — that is the whole shot', () => {
    rest(); const g = buildMikan(scene, sk)!;
    at(g, 0.22);                                                                 // the release key
    const hand = pos('RightHand'), head = pos('Head');
    expect(hand.y).toBeGreaterThan(head.y);                                      // up, above the head
    expect(Vector3.Distance(new Vector3(hand.x, 0, hand.z), new Vector3(head.x, 0, head.z))).toBeLessThan(0.34);   // and CLOSE
    expect(pos('LeftLeg').y).toBeGreaterThan(pos('RightLeg').y + 0.15);          // the knee drives on the off side
  });

  it('…and it barely leaves the floor, because under the ring the defence is TIME', () => {
    rest(); const g = buildMikan(scene, sk)!;
    at(g, 0); const down = pos('Hips').y;
    at(g, 0.22);
    expect(pos('Hips').y - down).toBeLessThan(0.2);                              // a flick, not a leap
    at(g, 0.34);
    expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y);                   // the hand STAYS up — you are going again
  });

  // ACROBATIC LAYUPS (owner, 2026-09-18) — each one's tell, measured on the rig
  it('the SCOOP comes from the HIP: the ball hand starts low and forward, and releases above the head with the elbow BELOW the hand', () => {
    rest(); const g = buildScoopLayup(scene, sk)!;
    at(g, 0.16);
    expect(pos('RightHand').y).toBeLessThan(1.15);                               // the scoop starts low
    expect(pos('RightHand').z).toBeGreaterThan(0.3);                             // and out in front
    at(g, 0.32);
    expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y);                   // the release, above the head
    expect(pos('RightForeArm').y).toBeLessThan(pos('RightHand').y - 0.15);       // the arm from BELOW: elbow under the hand
    expect(pos('LeftLeg').y).toBeGreaterThan(pos('RightLeg').y + 0.15);          // the off knee drives
  });
  it('the SPIN LAYUP turns the body a full circle and comes out of it facing the way it went in, ball hand up', () => {
    rest(); const g = buildSpinLayup(scene, sk)!;
    const fwd = () => { const h = boneNode(sk, 'Hips')!; h.computeWorldMatrix(true); return Vector3.TransformNormal(Vector3.Forward(), h.getWorldMatrix()).normalize(); };
    at(g, 0); const f0 = fwd();
    at(g, 0.12); expect(Vector3.Dot(fwd(), f0)).toBeLessThan(0.1);               // a third of the way round: well off the entry facing
    at(g, 0.24); expect(Vector3.Dot(fwd(), f0)).toBeLessThan(0.1);
    at(g, 0.34); expect(Vector3.Dot(fwd(), f0)).toBeGreaterThan(0.9);            // out of the turn: facing the iron again
    expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y);                   // …with the ball hand up
    at(g, 0.12);
    expect(Vector3.Distance(pos('RightHand'), pos('LeftHand'))).toBeLessThan(0.36);   // tucked in two hands through the turn
  });
  it('the HANG goes up, CLUTCHES down to the chest, and releases late above the head', () => {
    rest(); const g = buildHangLayup(scene, sk)!;
    at(g, 0.18); const up = pos('RightHand').y; expect(up).toBeGreaterThan(pos('Head').y - 0.05);   // up, as if to finish
    at(g, 0.32); const clutch = pos('RightHand').y;
    expect(clutch).toBeLessThan(up - 0.45);                                      // pulled DOWN
    expect(Vector3.Distance(pos('RightHand'), pos('LeftHand'))).toBeLessThan(0.36);   // both hands on it
    at(g, 0.5); expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y);       // back up, late
  });

  // THE POST GAME (2026-09-18)
  it('the SHIMMY sells both ways with the ball tight at the chest and the feet planted', () => {
    rest(); const g = buildShimmy(scene, sk)!;
    const fwd = () => { const h = boneNode(sk, 'Hips')!; h.computeWorldMatrix(true); return Vector3.TransformNormal(Vector3.Forward(), h.getWorldMatrix()).normalize(); };
    at(g, 0); const f0 = fwd(); const lf0 = pos('LeftFoot'), rf0 = pos('RightFoot');
    at(g, 0.1); const a = Vector3.Cross(f0, fwd()).y;
    at(g, 0.2); const b = Vector3.Cross(f0, fwd()).y;
    expect(Math.sign(a)).not.toBe(Math.sign(b)); expect(Math.abs(a)).toBeGreaterThan(0.1); expect(Math.abs(b)).toBeGreaterThan(0.1);   // one way, then the other
    expect(Vector3.Distance(pos('RightHand'), pos('LeftHand'))).toBeLessThan(0.36);   // both hands on the ball
    expect(Vector3.Distance(pos('LeftFoot'), lf0)).toBeLessThan(0.12); expect(Vector3.Distance(pos('RightFoot'), rf0)).toBeLessThan(0.12);   // the feet never move
  });
  it('the DROP STEP turns the hips well past 90° from the seal and ends with the ball at the chest, loaded', () => {
    rest(); const g = buildDropStep(scene, sk)!;
    const fwd = () => { const h = boneNode(sk, 'Hips')!; h.computeWorldMatrix(true); return Vector3.TransformNormal(Vector3.Forward(), h.getWorldMatrix()).normalize(); };
    at(g, 0); const f0 = fwd(); const ballLow = pos('RightHand').y;
    expect(ballLow).toBeLessThan(1.1);                                             // the seal: the ball low on the ball side
    at(g, 0.34);
    expect(Vector3.Dot(fwd(), f0)).toBeLessThan(-0.1);                             // turned past 90°
    expect(Vector3.Distance(pos('RightHand'), pos('LeftHand'))).toBeLessThan(0.36);   // both hands on it, at the chest
    expect(pos('RightHand').y).toBeGreaterThan(pos('Hips').y + 0.05);
  });

  it('the UP AND UNDER sells the shot first: ball and chin UP with the feet still under you', () => {
    rest(); const g = buildUpAndUnder(scene, sk)!;
    at(g, 0); const ball0 = pos('RightHand').y, hip0 = pos('Hips').y;
    at(g, 0.16);
    expect(pos('RightHand').y).toBeGreaterThan(ball0 + 0.5);                     // the ball drives up — this is the lie
    expect(pos('Hips').y).toBeGreaterThan(hip0);                                 // and the body rises with it
  });

  it('…then DUCKS: the hips drop below where they started and the body turns through', () => {
    rest(); const g = buildUpAndUnder(scene, sk)!;
    at(g, 0.16); const hipUp = pos('Hips').y;
    at(g, 0.38);
    expect(pos('Hips').y).toBeLessThan(hipUp - 0.1);                             // under the arm that just went up
    at(g, 0.46);
    expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y);                   // the finish, extended
  });

  it('the FINGER ROLL reaches: the arm goes STRAIGHT and the ball ends up in FRONT of the head, not beside it', () => {
    rest(); const g = buildFingerRoll(scene, sk)!;
    at(g, 0.38);                                                                 // the release key
    const hand = pos('RightHand'), head = pos('Head'), shoulder = pos('RightArm'), elbow = pos('RightForeArm');
    expect(hand.y).toBeGreaterThan(head.y + 0.15);                               // high
    // straight arm: shoulder→hand is nearly the sum of its two segments (a folded layup arm is much shorter)
    const span = Vector3.Distance(shoulder, hand);
    const segs = Vector3.Distance(shoulder, elbow) + Vector3.Distance(elbow, hand);
    expect(span).toBeGreaterThan(segs * 0.9);
  });

  it('…and that is what tells it apart from a LAYUP, which folds the arm and keeps the ball close', () => {
    rest(); const roll = buildFingerRoll(scene, sk)!;
    at(roll, 0.38);
    const flat = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.z - b.z);
    const rollReach = Vector3.Distance(pos('RightArm'), pos('RightHand')), rollOut = flat(pos('RightArm'), pos('RightHand'));
    rest(); const lay = buildLayupGather(scene, sk)!;
    at(lay, 0.3);
    const layReach = Vector3.Distance(pos('RightArm'), pos('RightHand')), layOut = flat(pos('RightArm'), pos('RightHand'));
    // HOOPS MOTION phase 3c: both release keys are now reached exactly (the cubic passes through every key, and each is a held accent),
    // and at the release both arms are at full stretch — so the reach is measured OUT, in front: the finger roll's ball goes out toward
    // the rim, the layup's straight up (the straight-line reaches tie within the solver's own precision: 0.48543 against 0.48550 m)
    expect(rollReach).toBeGreaterThan(layReach - 1e-3);                          // the reach IS the shot
    expect(rollOut).toBeGreaterThan(layOut + 0.15);                              // …out in front of the head, not over it
  });

  it('the FLOATER has a left hand now — it used to push the ball up with the right one going either way', () => {
    rest(); const r = buildFloater(scene, sk, 'right')!;
    at(r, 0.35);
    const rx = pos('RightHand').x, rUp = pos('RightHand').y;
    rest(); const l = buildFloater(scene, sk, 'left')!;
    at(l, 0.35);
    expect(pos('LeftHand').y).toBeGreaterThan(pos('Head').y);                    // the LEFT hand is the one pushing it
    expect(pos('LeftHand').x).toBeLessThan(0);                                   // …on the left side of the body
    expect(rUp).toBeGreaterThan(pos('Head').y); expect(rx).toBeGreaterThan(0);   // and the right-handed one is unchanged
  });

  it('the EURO sells to the side it is asked to — the left variant plants the other leg first', () => {
    rest(); const r = buildEuroStep(scene, sk, 'right')!;
    at(r, 0.22);
    expect(pos('RightHand').x).toBeGreaterThan(0.3);                             // sell RIGHT: the ball swung over that hip
    rest(); const l = buildEuroStep(scene, sk, 'left')!;
    at(l, 0.22);
    expect(pos('LeftHand').x).toBeLessThan(-0.3);                                // sell LEFT: mirrored
  });

  // ── THE HANDLE (owner, 2026-09-16) ────────────────────────────────────────────────────────────────────────
  // Twelve moves in HandleSystem shared one hardwired crossover clip. Each of these measures the ONE thing that
  // tells its move apart from the others at dribble distance, because that is all a defender gets.
  it('BETWEEN THE LEGS gets DOWN to the ball — lower than a crossover, and the stance opens to make room', () => {
    // Measured against the crossover rather than against an absolute height: the hand target is IK-clamped by what
    // the arm can reach from the torso it is given (dropping the target 0.22 m moved the hand 5 mm), so what
    // separates this move from a low crossover is how far the whole BODY sits down to put the ball under itself.
    rest(); const cross = buildCrossover(scene, sk, 'right')!;
    at(cross, 0.2);
    const crossBall = pos('RightHand').y, crossHips = pos('Hips').y;
    const crossFeet = Math.abs(pos('LeftFoot').x - pos('RightFoot').x);
    rest(); const g = buildBetweenLegsDribble(scene, sk, 'right')!;
    at(g, 0.18);
    expect(pos('RightHand').y).toBeLessThan(crossBall - 0.1);                     // the ball lower than a crossover's
    expect(pos('Hips').y).toBeLessThan(crossHips - 0.1);                          // because the body went down to it
    expect(pos('RightHand').y).toBeLessThan(pos('Hips').y);                       // and it IS under him
    expect(Math.abs(pos('LeftFoot').x - pos('RightFoot').x)).toBeGreaterThan(crossFeet);   // room for it to pass
  });

  it('BEHIND THE BACK wraps the ball BEHIND the hips — the only move here where it goes backwards', () => {
    rest(); const g = buildBehindBackDribble(scene, sk, 'right')!;
    at(g, 0.18);
    expect(pos('RightHand').z).toBeLessThan(pos('Hips').z);                       // behind the hip line
  });

  it('IN AND OUT keeps its hand: the off hand never takes the ball, which is what makes it not a crossover', () => {
    rest(); const g = buildInAndOut(scene, sk, 'right')!;
    at(g, 0.16); const offOut = pos('LeftHand').clone();
    at(g, 0.28);
    expect(Vector3.Distance(pos('LeftHand'), offOut)).toBeLessThan(0.18);         // the off hand stayed put
  });

  it('the SHAMMGOD pushes the ball away on a long arm, then takes it back with the OTHER hand', () => {
    rest(); const g = buildShammgod(scene, sk, 'right')!;
    at(g, 0.2);
    const push = pos('RightHand');
    expect(push.z).toBeGreaterThan(pos('Hips').z + 0.4);                          // shoved out in FRONT
    const offStart = pos('LeftHand').x;
    at(g, 0.46);
    // `dir` is the side the ball ENDS on, so a shammgod to the RIGHT finishes with the OFF hand carrying it right.
    // Asserted as a movement across the body rather than an absolute x: reaching across is the most IK-clamped
    // thing in this file, and the eye reads the travel, not the coordinate.
    expect(pos('LeftHand').x).toBeGreaterThan(offStart + 0.3);
    expect(pos('LeftHand').x).toBeGreaterThan(0);                                 // …and it ended on the right side
  });

  it('the SNATCH BACK goes forward and then rips the ball BEHIND the hip line', () => {
    rest(); const g = buildSnatchBack(scene, sk)!;
    at(g, 0.14); const forward = pos('RightHand').z;
    at(g, 0.3);
    expect(pos('RightHand').z).toBeLessThan(forward - 0.4);                       // ripped back, hard
    expect(pos('RightHand').z).toBeLessThan(pos('Hips').z);
  });

  it('the DOUBLE CROSS crosses TWICE, and the second one is the lower of the two', () => {
    rest(); const g = buildDoubleCross(scene, sk, 'right')!;
    at(g, 0.16); const start = pos('RightHand').x, hip1 = pos('Hips').y;
    at(g, 0.3);
    expect(pos('RightHand').x).toBeLessThan(start - 0.4);                         // ONE: across to the other side
    at(g, 0.44);
    expect(pos('RightHand').x).toBeGreaterThan(start - 0.2);                      // TWO: and back, which is where it ends
    expect(pos('Hips').y).toBeLessThan(hip1);                                     // lower: the one that gets him
  });

  it('the YOYO goes nowhere — the ball moves and the body does not', () => {
    rest(); const g = buildYoyo(scene, sk)!;
    at(g, 0.18); const high = pos('RightHand').y, hips = pos('Hips').clone();
    at(g, 0.36);
    expect(pos('RightHand').y).toBeLessThan(high - 0.3);                          // the ball snapped down …
    expect(Math.abs(pos('Hips').x - hips.x)).toBeLessThan(0.1);                   // … and the hips stayed home
  });

  // ── ANKLE BREAKERS ───────────────────────────────────────────────────────────────────────────────────────
  it('the STUMBLE crosses his feet and drops him low, and he is STILL UP at the end of it', () => {
    rest(); const g = buildAnkleStumble(scene, sk)!;
    at(g, 0); const stance = pos('Hips').y;
    at(g, 0.32);
    expect(pos('Hips').y).toBeLessThan(stance - 0.1);                             // right down on it
    expect(Vector3.Distance(pos('LeftHand'), pos('RightHand'))).toBeGreaterThan(0.9);   // arms out for balance
    at(g, 0.62);
    expect(pos('Hips').y).toBeGreaterThan(stance - 0.06);                         // back up — that is the difference
  });

  it('the SLIP puts him on the floor and LEAVES him there — and it is a fall, not a knockdown', () => {
    rest(); const g = buildAnkleSlip(scene, sk)!;
    at(g, 0); const stance = pos('Hips').y;
    at(g, 0.5);
    expect(pos('Hips').y).toBeLessThan(stance - 0.55);                            // down
    expect(pos('RightHand').y).toBeLessThan(0.4);                                 // the hand reaching the floor behind him
    at(g, 0.78);
    expect(pos('Hips').y).toBeLessThan(stance - 0.5);                             // still down, watching you go
  });

  it('M14 the EURO steps to ONE side then crosses to the OTHER, with the ball going with it', () => {
    rest(); const g = buildEuroStep(scene, sk)!;
    at(g, 0.22);
    const aBall = pos('RightHand').x;
    expect(aBall).toBeGreaterThan(0.3);                                          // step A: the ball swung out to my right …
    expect(pos('RightFoot').y).toBeGreaterThan(pos('LeftFoot').y + 0.1);         // … off the RIGHT leg, reaching that way
    at(g, 0.36);
    expect(pos('RightHand').x).toBeLessThan(aBall - 0.3);                        // step B: the ball snatched across …
    expect(pos('LeftFoot').y).toBeGreaterThan(pos('RightFoot').y + 0.1);         // … and it is the OTHER leg crossing now
    at(g, 0.48);
    expect(Math.abs(pos('LeftFoot').y - pos('RightFoot').y)).toBeLessThan(0.2);  // planted, loaded to finish
  });

});

// HOOPS MOTION phase 3c (plan §3 "Anatomical elbow poles"; the gate: wrong-way elbow frames ≤ 1 per window on the overhead clips). The
// probe's own test (_hoops-motion-probe elbowBad): the elbow's direction off the shoulder→hand line — BACK with the hand over the shoulder
// (high), FORWARD with it below (low) — on every 30 fps frame of each overhead clip, built on this rig and mirrored in place the way the
// hoops modes play it (hoopsHand.rightHandHoops → groupMirror).
describe('the overhead families point their elbows where an elbow can (HOOPS MOTION 3c)', () => {
  const wrongWay = (): number => {
    const lu = pos('LeftUpLeg'), ru = pos('RightUpLeg'), lf = pos('LeftFoot'), lt = pos('LeftToeBase');
    const across = ru.subtract(lu); across.y = 0; across.normalize();
    let fwd = new Vector3(across.z, 0, -across.x); if (Vector3.Dot(fwd, lt.subtract(lf)) < 0) fwd = fwd.scale(-1);
    let n = 0;
    for (const sd of ['Left', 'Right']) {
      const S = pos(sd + 'Arm'), E = pos(sd + 'ForeArm'), H = pos(sd + 'Hand');
      const ax = H.subtract(S), al = ax.length(); if (al < 1e-3) continue;
      const u = S.subtract(E).normalize(), v = H.subtract(E).normalize(); if (Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(u, v)))) * 180 / Math.PI > 160) continue;
      const axn = ax.scale(1 / al), e = E.subtract(S), pe = e.subtract(axn.scale(Vector3.Dot(e, axn))); if (pe.length() < 1e-3) continue;
      const p = pe.normalize(), pf = Vector3.Dot(p, fwd), handUp = H.y - S.y;
      if ((handUp > 0.15 && pf < -0.5 && p.y < 0.3) || (handUp < -0.1 && pf > 0.6)) n++;
    }
    return n;
  };
  const BUILD: Record<string, () => AnimationGroup | null> = {
    bball_floater: () => buildFloater(scene, sk), bball_floater_left: () => buildFloater(scene, sk, 'left'),
    bball_hook: () => buildHook(scene, sk), bball_hook_left: () => buildHook(scene, sk, 'left'),
    bball_layup_reverse: () => buildReverseLayup(scene, sk), bball_layup_reverse_left: () => buildReverseLayup(scene, sk, 'left'),
    bball_finger_roll: () => buildFingerRoll(scene, sk), bball_finger_roll_left: () => buildFingerRoll(scene, sk, 'left'),
    bball_mikan: () => buildMikan(scene, sk), bball_mikan_left: () => buildMikan(scene, sk, 'left'),
    bball_up_and_under: () => buildUpAndUnder(scene, sk), bball_up_and_under_left: () => buildUpAndUnder(scene, sk, 'left'),
    bball_layup_spin: () => buildSpinLayup(scene, sk), bball_layup_spin_left: () => buildSpinLayup(scene, sk, 'left'),
    bball_layup_hang: () => buildHangLayup(scene, sk), bball_layup_hang_left: () => buildHangLayup(scene, sk, 'left'),
    bball_fadeaway: () => buildFadeaway(scene, sk), bball_block_reach: () => buildBlockReach(scene, sk),
    bball_hand_up: () => buildHandUp(scene, sk), bball_follow_through_late: () => buildFollowThroughLate(scene, sk),
    bball_mc_layup_gather: () => buildMocapOpponentClip(scene, sk, MOCAP_OPPONENT_CLIPS.find((c) => c.name === 'bball_mc_layup_gather')!),
    bball_mc_layup_gather_left: () => buildMocapOpponentClip(scene, sk, MOCAP_OPPONENT_CLIPS.find((c) => c.name === 'bball_mc_layup_gather_left')!),
  };
  it('the overhead families are the plan\'s list — twenty clips with their _left versions — and get the rule on their overhead keys', () => {
    expect(HOOPS_OVERHEAD_CLIPS.length).toBe(20);
    for (const n of HOOPS_OVERHEAD_CLIPS) { expect(anatomicalByDefault(n, 'onevone'), n).toBe('overhead'); expect(anatomicalByDefault(n, 'dunk'), n).toBe(false); expect(BUILD[n], n).toBeDefined(); }
    for (const n of ['bball_dribble_idle', 'bball_crossover_left', 'bball_layup_gather', 'bball_pullup_gather', 'bball_stepback_gather', 'bball_spin', 'bball_hesi']) expect(anatomicalByDefault(n, 'threevthree'), n).toBe(false);   // the low handle and gather clips stay as they are
    expect(anatomicalByDefault('dunk_finish_windmill', 'dunk')).toBe(true); expect(anatomicalByDefault('dunk_gather_push1', 'dunk')).toBe(false);   // (the dunk family's rule, unchanged)
    // the captured layup's extension pole points where an overhead elbow can (forward and out), no longer out and BACK
    for (const n of ['bball_mc_layup_gather', 'bball_mc_layup_gather_left']) {
      const c = MOCAP_OPPONENT_CLIPS.find((x) => x.name === n)!;
      const ext = c.keys.filter((k) => (k.hands?.Right?.[1] ?? 0) > 2.0 || (k.hands?.Left?.[1] ?? 0) > 2.0);
      expect(ext.length, n).toBeGreaterThan(3);
      for (const k of ext) { const hi = (k.hands?.Right?.[1] ?? 0) > (k.hands?.Left?.[1] ?? 0) ? 'Right' : 'Left'; expect(k.poles?.[hi]?.[2] ?? 0, `${n} t${k.t}`).toBeGreaterThan(0.3); }
    }
  });
  it('the overhead keys\' wrong-way elbows are gone, as the hoops modes play the clips (mirrored): ≤ 1 a play on the Mikan, the up-and-under and the fadeaway (5 / 5 / 2 before), ≤ 2 on every authored overhead clip, the captured layup no worse', () => {
    // what is left (measured here, 30 fps): one or two frames IN TRANSIT (the reverse's descent: 2, from 5) and the LOW keys the rule leaves
    // alone — the spin layup's two-hand tuck, the captured layup's gather (the plan: the low handle and gather poses stay as they are). In
    // the game the descents' transition keys took the fadeaway's follow-through from 8 wrong-way frames to 1, the shimmy fade's 8 to 1
    // and the drive finish's 6 to 0 (smoke1 → smoke2, attempt 1 each)
    const LIMIT: Record<string, number> = { bball_mikan: 1, bball_mikan_left: 1, bball_up_and_under: 1, bball_up_and_under_left: 1, bball_fadeaway: 1, bball_mc_layup_gather: 3, bball_mc_layup_gather_left: 9 };
    const rows: string[] = [];
    for (const [name, build] of Object.entries(BUILD)) {
      rest(); const g = build()!; mirrorGroupsInPlace([g], sk);
      const dur = (g.to - g.from) / 30; let bad = 0;
      for (let t = 0; t <= dur + 1e-6; t += 1 / 30) {
        for (const x of scene.animationGroups) x.stop();
        for (const [n, tr] of bind) { n.position.copyFrom(tr.p); n.rotationQuaternion = tr.q.clone(); }
        g.start(false, 1, g.from, g.to, false); g.goToFrame(g.from + t * 30); scene.render();
        bad += wrongWay();
      }
      g.stop(); g.dispose();
      if (bad > (LIMIT[name] ?? 2)) rows.push(`${name}: ${bad}`);
    }
    expect(rows, rows.join(' · ')).toEqual([]);   // base (3b tree, the same count): the reverse 5, the Mikan 5, the up-and-under 5, the fadeaway 2, the spin layup 1, the captured layup 3 / 9
  });
  it('a descent from an overhead key to a low one gets a transition key half-way, solved under the rule; an ascent does not', () => {
    const down = withOverheadTransitions([{ t: 0.4, hands: { Right: [0.2, 2.0, 0.2] }, bones: { Spine: [-6, 0, 0] } }, { t: 0.8, hands: { Right: [0.24, 1.1, 0.3] }, bones: { Spine: [10, 0, 0] } }]);
    expect(down.length).toBe(3); expect(down[1].t).toBeCloseTo(0.6, 9); expect(down[1].transition).toBe(true);
    expect(down[1].hands?.Right).toEqual([0.22, 1.55, 0.25]); expect(down[1].bones?.Spine).toEqual([2, 0, 0]);
    expect(withOverheadTransitions([{ t: 0, hands: { Right: [0.24, 1.1, 0.3] } }, { t: 0.3, hands: { Right: [0.2, 2.0, 0.2] } }]).length).toBe(2);
    expect(withOverheadTransitions([{ t: 0, hands: { Right: [0.2, 2.0, 0.2] } }, { t: 0.3, hands: { Right: [0.2, 1.9, 0.3] } }]).length).toBe(2);   // both overhead
  });
  it('a looping clip is smoothed as one (poseClip closesLoop): the dribble idle, the hand up, the watch, idle_stand\'s own keys', () => {
    expect(closesLoop([{ t: 0, hipsY: -0.05, bones: { Spine: [14, 0, 0] } }, { t: 0.4, hipsY: -0.07 }, { t: 0.8, hipsY: -0.05, bones: { Spine: [14, 0, 0] } }], 0.8)).toBe(true);
    expect(closesLoop([{ t: 0, hipsY: 0 }, { t: 0.4, hipsY: -0.07 }, { t: 0.8, hipsY: -0.05 }], 0.8)).toBe(false);
    expect(closesLoop([{ t: 0, hipsY: 0 }, { t: 0.4, hipsY: -0.07 }, { t: 0.7, hipsY: 0 }], 0.8)).toBe(false);   // not at the clip's end
  });
});
