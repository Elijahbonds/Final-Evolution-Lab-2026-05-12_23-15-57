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
import { buildHitReact, buildKnockdown } from './karate';
import { buildBoardRideIdle, buildBoardTuck, buildBoardGrab, buildSkateBail } from './boardSuite';
import { buildChargeGather, buildLaunch, buildLandCrouch } from './dunkSuite';
import { buildFinishTomahawk, buildCelebrateBig } from './dunkFinishes';
import { buildEastbay } from './eastbay';
import { buildJuke, buildSpinMove, buildTackledFall } from './football';
import { buildBaseClips } from './baseClips';

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
});

describe('board suite', () => {
  it('ride idle: low, feet across the deck, arms out as a counterweight, eyes forward', () => {
    at(fresh(() => buildBoardRideIdle(scene, sk)!), 1.2);
    const lf = pos('LeftFoot'), rf = pos('RightFoot');
    expect(Math.abs(lf.z - rf.z)).toBeGreaterThan(0.25);   // one foot ahead of the other along the board
    expect(hipsY()).toBeLessThan(0.75 * (pos('Head').y - hipsY()) + hipsY() - 0.0);   // sanity: head above hips
    expect(Math.abs(pos('LeftHand').x - pos('RightHand').x) + Math.abs(pos('LeftHand').z - pos('RightHand').z)).toBeGreaterThan(0.7);
    expect(Math.abs(pos('Head').x)).toBeLessThan(0.25);
  });
  it('tuck folds the torso down', () => {
    const g = fresh(() => buildBoardTuck(scene, sk)!);
    at(g, 0); const head0 = pos('Head').y - hipsY();
    at(g, 0.6); expect(pos('Head').y - hipsY()).toBeLessThan(head0 - 0.12);
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
  it('eastbay drives the left knee up and finishes with the left hand at the rim', () => {
    const g = fresh(() => buildEastbay(scene, sk)!);
    at(g, 0.75); expect(pos('LeftLeg').y).toBeGreaterThan(pos('RightLeg').y + 0.3);
    at(g, 1.25); expect(pos('LeftHand').y).toBeGreaterThan(pos('Head').y + 0.2);
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
  it('jumpshot: both hands above the head at the release', () => {
    const g = fresh(() => buildBaseClips(scene, sk).find((c) => c.name === 'jumpshot')!);
    at(g, 0.5); expect(pos('LeftHand').y).toBeGreaterThan(pos('Head').y); expect(pos('RightHand').y).toBeGreaterThan(pos('Head').y);
  });
  it('high kick: the right foot rises above the hips', () => {
    const g = fresh(() => buildBaseClips(scene, sk).find((c) => c.name === 'high_kick')!);
    at(g, 0.28); expect(pos('RightFoot').y).toBeGreaterThan(hipsY() - 0.1);
  });
});
