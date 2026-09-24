// DUNK MOTION phase 7 (2026-09-23): push 1-2 and the take-off, measured on the real hero rig in node.
import { readFileSync } from 'node:fs';
import { FreeCamera, NullEngine, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { beforeAll, describe, it, expect } from 'vitest';
import { boneNode } from '../boneLookup';
import { buildGatherOne, buildGatherTwo, buildTakeOffOne, GATHER_SEC, TAKE_OFF_ONE_SEC } from './dunkTakeoff';

let scene: Scene, sk: Skeleton;
beforeAll(async () => {
  scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const b64 = readFileSync('public/models/fel-hero.glb').toString('base64');
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0];
}, 120000);
const pos = (n: string) => { const b = boneNode(sk, n)! as TransformNode; b.computeWorldMatrix(true); return b.getAbsolutePosition().clone(); };
/** Sample a clip paused at t (a playing group would also advance by wall-clock on render). */
function at(g: AnimationGroup, t: number): void { g.goToFrame(t * 30); scene.render(); }
function fresh(build: () => AnimationGroup | null): AnimationGroup { const g = build()!; g.start(false, 1, g.from, g.to, false); g.pause(); return g; }
/** Forward along the body (the toes' side), from the two feet's midpoint at bind. */
function forwardOf(): Vector3 { const f = pos('LeftToeBase').subtract(pos('LeftFoot')); f.y = 0; return f.normalize(); }

describe('push 1-2 — two real steps into the take-off', () => {
  it('off one: the penultimate foot strikes out AHEAD, then the plant foot is ahead at the line — the feet alternate', () => {
    const g = fresh(() => buildGatherOne(scene, sk));
    at(g, 0); const fwd = forwardOf();
    at(g, 0.12);
    const ahead12 = Vector3.Dot(pos('RightFoot').subtract(pos('LeftFoot')), fwd);
    expect(ahead12).toBeGreaterThan(0.6);                                            // the long penultimate: the right foot well ahead
    expect(pos('RightFoot').y).toBeLessThan(pos('LeftFoot').y);                      // on the floor, the push foot leaving it
    at(g, GATHER_SEC);
    expect(Vector3.Dot(pos('LeftFoot').subtract(pos('RightFoot')), fwd)).toBeGreaterThan(0.6);   // …and the plant (2) is the left, ahead
    g.stop();
  });
  it('a clip built on a posed rig is the same clip (the build starts from bind)', () => {
    const crouched = fresh(() => buildGatherTwo(scene, sk)); at(crouched, GATHER_SEC);   // leave the rig 0.26 m low
    const g = fresh(() => buildTakeOffOne(scene, sk)); crouched.stop();
    at(g, 0.2); expect(pos('RightHand').y).toBeGreaterThan(1.7);
    g.stop();
  });
  it('off two: the second foot CLOSES beside the first under a deeper gather', () => {
    const one = fresh(() => buildGatherOne(scene, sk)); at(one, GATHER_SEC); const hipsOne = pos('Hips').y; one.stop();
    const g = fresh(() => buildGatherTwo(scene, sk));
    at(g, 0); const fwd = forwardOf();
    at(g, GATHER_SEC);
    expect(Math.abs(Vector3.Dot(pos('LeftFoot').subtract(pos('RightFoot')), fwd))).toBeLessThan(0.15);   // side by side
    expect(pos('Hips').y).toBeLessThan(hipsOne - 0.05);                                                   // lower than the one-foot plant
    g.stop();
  });
});

describe('the arms in push 1-2 — off two, BACK on the push and UP on 2 (owner, 2026-09-23)', () => {
  it('both hands swing behind the hips on the push, bottom out on 1, and are rising on 2', () => {
    const g = fresh(() => buildGatherTwo(scene, sk));
    at(g, 0); const fwd = forwardOf(); const behind = (n: string) => Vector3.Dot(pos(n).subtract(pos('Hips')), fwd);
    // back on PUSH: the arm at full extension behind a trunk leaning over the run (~0.19 m behind the hip centre is the arm's reach)
    expect(behind('RightHand')).toBeLessThan(-0.15); expect(behind('LeftHand')).toBeLessThan(-0.15);
    at(g, 0.12); const low = Math.max(pos('RightHand').y, pos('LeftHand').y), hipsAt1 = pos('Hips').y;
    at(g, 0.32); const bottomL = pos('LeftHand').y, bottomR = pos('RightHand').y;
    at(g, GATHER_SEC);
    expect(pos('LeftHand').y).toBeGreaterThan(bottomL + 0.1); expect(pos('RightHand').y).toBeGreaterThan(bottomR + 0.1);   // UP on 2
    expect(low).toBeLessThan(hipsAt1 + 0.05);                  // driven down to the hips on 1
    expect(behind('LeftHand')).toBeGreaterThan(0.15);           // the off arm already coming up the front
    g.stop();
  });
  it('off one the ball comes up off the dribble in FRONT and is ripped back to the hip by the plant — a different body', () => {
    const g = fresh(() => buildGatherOne(scene, sk));
    at(g, 0); const fwd = forwardOf(); const ahead = () => Vector3.Dot(pos('RightHand').subtract(pos('Hips')), fwd);
    expect(ahead()).toBeGreaterThan(0.1);
    at(g, GATHER_SEC); expect(ahead()).toBeLessThan(0);
    g.stop();
  });
});

describe('the one-foot take-off — knee drive, arm strike, the lead leg drops', () => {
  it('the take-off foot leaves LAST, the free knee drives to the hip, and both arms strike up on the same beat', () => {
    const g = fresh(() => buildTakeOffOne(scene, sk));
    at(g, 0);
    const handsLow = Math.max(pos('RightHand').y, pos('LeftHand').y);
    at(g, 0.1);
    expect(pos('LeftFoot').y).toBeLessThan(pos('RightFoot').y - 0.3);               // the plant foot still down, the free foot up
    expect(pos('RightLeg').y).toBeGreaterThan(pos('Hips').y - 0.12);                // the knee driven to hip height
    const struck = Math.min(pos('RightHand').y, pos('LeftHand').y);
    expect(struck).toBeGreaterThan(handsLow + 0.45);                                  // both arms struck up past the face on the beat…
    at(g, 0.2);
    expect(Math.min(pos('RightHand').y, pos('LeftHand').y)).toBeGreaterThan(struck + 0.25);   // …and still going: the swing carries on up with the body
    expect(Math.min(pos('RightHand').y, pos('LeftHand').y)).toBeGreaterThan(pos('Head').y);
    g.stop();
  });
  it('through the rise the lead leg DROPS long and the take-off leg folds behind (the owner\'s cue)', () => {
    const g = fresh(() => buildTakeOffOne(scene, sk));
    at(g, 0.3); const kneeHigh = pos('RightLeg').y - pos('Hips').y;
    at(g, TAKE_OFF_ONE_SEC);
    const kneeLow = pos('RightLeg').y - pos('Hips').y;
    expect(kneeHigh - kneeLow).toBeGreaterThan(0.25);                               // the knee came down a long way
    expect(pos('RightFoot').y).toBeLessThan(pos('LeftFoot').y - 0.1);               // the lead foot now the LOWER one: the long leg
    expect(pos('LeftHand').y).toBeLessThan(pos('RightHand').y - 0.3);               // and the off arm thrown down under the ball hand
    g.stop();
  });
});
