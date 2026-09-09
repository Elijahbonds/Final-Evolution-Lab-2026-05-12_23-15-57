// Proves the basketball packages on the REAL forge rig: load the shipped
// hero in a NullEngine, build each clip against its skeleton, scrub to the
// key frame and measure where hands, knees and hips actually are.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from '../boneLookup';
import {
  buildBlockReach, buildCrossover, buildDefendSlide, buildDribbleIdle, buildHesi, buildLayupGather, buildStealReach, buildFollowThrough,
  buildPullupGather, buildFloater, buildHandUp, buildScreenSet,
  buildPostUp, buildFadeaway, buildHook, buildSpin,   // HOOPS-MOVE-KIT-B (2026-09-08): the post kit (M4–M6)
  buildPumpFake, buildStepThrough, buildPivot, buildReverseLayup, buildHopStep, buildEuroStep,   // wave 2: the footwork (M8–M14)
} from './basketball';

let scene: Scene; let sk: Skeleton;
const bind = new Map<TransformNode, { p: Vector3; q: Quaternion }>(); let root: TransformNode;

beforeAll(async () => {
  scene = new Scene(new NullEngine());
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
