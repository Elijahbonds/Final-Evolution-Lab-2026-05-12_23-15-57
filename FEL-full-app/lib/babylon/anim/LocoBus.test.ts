// SHARED-ANIM-BUS (2026-09-14) — the loco / facing / arms decisions, pure, and the authored clips held to the arms limits
// on the forge rig (the same `handsInChest` + `armsVerdict` the production readout grades a live body with).
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { armsVerdict, handsInChest, locoPick, stepYaw, wrapYaw, LOCO_TUNE, type ArmWindow } from './LocoBus';
import { armWindowOf } from './animProbe';
import { boneNode } from './boneLookup';
import { buildIdleStand } from './authored/locomotion';
import { buildBaseClips } from './authored/baseClips';
import { buildBatStance, buildBatSwing } from './authored/baseball';
import { buildBoardRideIdle, buildBoardPush } from './authored/boardSuite';
import { buildCarryRun, buildTackledFall, buildTouchdownSpike } from './authored/football';

describe('LocoBus — loco', () => {
  it('picks idle / walk / run / sprint off speed, facing the travel', () => {
    expect(locoPick({ speed: 0.2 }).window).toBe('idle');
    expect(locoPick({ speed: 0.2 }).faceYaw).toBeNull();                        // standing still keeps its facing
    const walk = locoPick({ speed: 1.4, moveX: 1, moveZ: 0 });
    expect(walk.window).toBe('walk'); expect(walk.faceYaw).toBeCloseTo(Math.PI / 2);
    expect(locoPick({ speed: 4, moveX: 0, moveZ: 1 }).window).toBe('run');
    const sprint = locoPick({ speed: 9, moveX: 0, moveZ: 1 });
    expect(sprint.window).toBe('sprint'); expect(sprint.clip).toBe('run');       // the run at a faster rate, not a second 1.4x
    expect(sprint.rate).toBeGreaterThan(locoPick({ speed: 4, moveX: 0, moveZ: 1 }).rate);
    expect(locoPick({ speed: LOCO_TUNE.runRef, moveX: 0, moveZ: 1 }).rate).toBeCloseTo(1);   // the stride matches at the reference
  });
  it('strafes / backpedals while facing something it is not travelling toward', () => {
    expect(locoPick({ speed: 1.2, moveX: 1, moveZ: 0, lockYaw: 0 }).window).toBe('strafe_right');
    expect(locoPick({ speed: 1.2, moveX: -1, moveZ: 0, lockYaw: 0 }).window).toBe('strafe_left');
    const back = locoPick({ speed: 3, moveX: 0, moveZ: -1, lockYaw: 0 });
    expect(back.window).toBe('backpedal'); expect(back.faceYaw).toBe(0);
    expect(locoPick({ speed: 3, moveX: 0.2, moveZ: 1, lockYaw: 0 }).window).toBe('run');   // a lock inside 45° just runs at it
  });
});

describe('LocoBus — facing', () => {
  it('turns along the shortest arc, never overshoots, and is frame-rate independent', () => {
    expect(stepYaw(3.0, -3.0, 1, 10)).toBeCloseTo(wrapYaw(-3.0));              // across the ±π seam, the short way
    expect(stepYaw(0, 1, 0.05, 10)).toBeCloseTo(0.5);
    expect(stepYaw(0, 0.2, 0.05, 10)).toBeCloseTo(0.2);                          // clamped at the target
    let a = 0, b = 0;
    for (let i = 0; i < 60; i++) a = stepYaw(a, 2, 1 / 60, 1.5);
    for (let i = 0; i < 30; i++) b = stepYaw(b, 2, 1 / 30, 1.5);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('LocoBus — arms verdicts', () => {
  const h = (fwd: number, up: number, out: number) => ({ fwd, up, out });
  it('names a stance with the hands behind the chest, a cruising T, and passes a relaxed body', () => {
    expect(armsVerdict('stance', h(-0.14, 0.01, -0.47), h(-0.15, 0.01, 0.2)).behind).toBe(true);   // the 2a0304b batter
    expect(armsVerdict('ride', h(0.37, -0.03, 0.17), h(-0.13, -0.21, 0.33)).high).toBe(true);        // the 2a0304b skater
    expect(armsVerdict('loco', h(0.05, -0.1, 0.35), h(0.05, -0.1, 0.35)).tee).toBe(true);
    expect(armsVerdict('loco', h(0.05, -0.48, 0.05), h(0.05, -0.48, 0.06)).ok).toBe(true);
    expect(armsVerdict('free', h(-1, 1, 1), h(-1, 1, 1)).ok).toBe(true);
  });
});

describe('the authored clips keep their arms inside the bus limits (forge rig)', () => {
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
  const at = (g: AnimationGroup, sec: number) => {
    for (const x of scene.animationGroups) x.stop();
    for (const [n, t] of bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); }
    g.start(false, 1, g.from, g.to, false); g.goToFrame(sec * 30); scene.render();
  };
  const pos = (n: string) => { const x = boneNode(sk, n)!; x.computeWorldMatrix(true); return x.getAbsolutePosition().clone(); };
  const judge = (g: AnimationGroup, times: number[], window: ArmWindow = armWindowOf(g.name)) => {
    const bad: string[] = [];
    for (const t of times) {
      at(g, t);
      const hands = handsInChest({ hips: pos('Hips'), neck: pos('Neck'), leftShoulder: pos('LeftArm'), rightShoulder: pos('RightArm'), leftHand: pos('LeftHand'), rightHand: pos('RightHand') }, { x: 0, y: 0, z: 1 });
      const v = armsVerdict(window, hands.left, hands.right);
      if (!v.ok) bad.push(`${g.name}@${t}: ${v.reasons.join('; ')}`);
    }
    return bad;
  };
  const elbow = (s: 'Left' | 'Right') => { const u = pos(`${s}Arm`).subtract(pos(`${s}ForeArm`)), v = pos(`${s}Hand`).subtract(pos(`${s}ForeArm`)); return Math.acos(Vector3.Dot(u, v) / (u.length() * v.length())) * 180 / Math.PI; };

  it('derby: the stance holds the hands in FRONT of the chest with the lead elbow bent (was 0.13 m behind, 178°)', () => {
    const g = buildBatStance(scene, sk)!;
    expect(judge(g, [0, 0.3, 0.6, 0.9, 1.2], 'stance')).toEqual([]);
    at(g, 0.3); expect(elbow('Left')).toBeLessThan(140);
    at(buildBatSwing(scene, sk)!, 0); expect(elbow('Left')).toBeLessThan(140);   // the swing starts from the same load
  });
  it('skate: the cruise and the push keep both hands low (was shoulder height, the stiff T)', () => {
    expect(judge(buildBoardRideIdle(scene, sk)!, [0, 0.6, 1.2, 1.8, 2.4], 'ride')).toEqual([]);
    expect(judge(buildBoardPush(scene, sk)!, [0, 0.1, 0.2, 0.3, 0.42], 'ride')).toEqual([]);
  });
  it('football: the carry, the hit brace and the TD spike never lock out wide or high (the scan-body melt)', () => {
    expect(judge(buildCarryRun(scene, sk)!, [0, 0.15, 0.3, 0.45, 0.6], 'carry')).toEqual([]);
    expect(judge(buildTackledFall(scene, sk)!, [0, 0.12, 0.25], 'carry')).toEqual([]);   // the hit; the ground phase reaches back for the turf
    expect(judge(buildTouchdownSpike(scene, sk)!, [0, 0.11, 0.22, 0.32, 0.42, 0.55, 0.7, 0.85, 1.0], 'celebrate')).toEqual([]);
  });
  it('loco: the idle and the run cycle stay in the loco window', () => {
    expect(judge(buildIdleStand(scene, sk)!, [0, 0.5, 1], 'loco')).toEqual([]);
    const run = buildBaseClips(scene, sk).find((g) => g.name === 'run')!;
    expect(judge(run, [0, 0.1, 0.2, 0.3, 0.4, 0.5], 'loco')).toEqual([]);
  });
});
