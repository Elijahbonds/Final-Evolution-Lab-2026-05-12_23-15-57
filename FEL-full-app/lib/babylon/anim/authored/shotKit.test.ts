// lane/hoops-shot-content (2026-10-20): the shot kit on the REAL forge rig (the shipped hero in a NullEngine, as basketball.test.ts):
// each clip built on its skeleton, scrubbed to its keys, the hands, feet, hips and head measured.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from '../boneLookup';
import { buildStepbackGather, buildPullupGather, buildFollowThrough } from './basketball';
import {
  buildStepbackRelease, buildBankFollowThrough, buildCatchHop, STEPBACK_RELEASE_AT, STEPBACK_RELEASE_SEC, STEPBACK_RELEASE_01,
  CATCH_HOP_SEC, SHOT_KIT_CLIPS,
} from './shotKit';
import { ShotMeter } from '../../core/BasketballCore';
import { syncedShotSpeed } from '../../core/BallHandling';
import { REAL_CLIPS } from '../clipRegistry';
import { suiteOfClip } from '../clipScope';

let scene: Scene; let sk: Skeleton;
const bind = new Map<TransformNode, { p: Vector3; q: Quaternion }>();

beforeAll(async () => {
  scene = new Scene(new NullEngine());
  scene.metadata = { felModeId: 'onevone' };
  new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const b64 = readFileSync(process.env.FEL_HERO_GLB ?? 'public/models/fel-hero.glb').toString('base64');
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0];
  for (const b of sk.bones) { const n = b.getTransformNode(); if (n) bind.set(n, { p: n.position.clone(), q: (n.rotationQuaternion ?? Quaternion.Identity()).clone() }); }
});

function rest(): void { for (const x of scene.animationGroups) x.stop(); for (const [n, t] of bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); } }
function at(g: AnimationGroup, sec: number): void { rest(); g.start(false, 1, g.from, g.to, false); g.goToFrame(sec * 30); scene.render(); }
function pos(name: string): Vector3 { const n = boneNode(sk, name)!; n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); }
const JOINTS = ['RightHand', 'LeftHand', 'Hips', 'Head', 'LeftFoot', 'RightFoot', 'LeftLeg', 'RightLeg'];
function pose(g: AnimationGroup, sec: number): Record<string, Vector3> { at(g, sec); return Object.fromEntries(JOINTS.map((j) => [j, pos(j)])); }
function worst(a: Record<string, Vector3>, b: Record<string, Vector3>, joints = JOINTS): number { return Math.max(...joints.map((j) => Vector3.Distance(a[j], b[j]))); }
/** The shoulder line's yaw (deg): + = the right shoulder forward (+z — the rig faces +z at bind). */
function shoulderYaw(): number { const r = pos('RightArm'), l = pos('LeftArm'); return Math.atan2(r.z - l.z, r.x - l.x) * 180 / Math.PI; }

describe('the step-back release (its own release clip off the step-back gather)', () => {
  it('starts in the step-back gather\'s SET pose — the hold\'s fade is a continuation, not a swap', () => {
    rest(); const gather = buildStepbackGather(scene, sk)!; rest(); const rel = buildStepbackRelease(scene, sk)!;
    const set = pose(gather, 0.46), start = pose(rel, 0);
    expect(worst(set, start)).toBeLessThan(0.02);
  });
  it('at its release key: the shooting arm overhead, the chest leaning BACK over the hips, the split stance kept', () => {
    rest(); const rel = buildStepbackRelease(scene, sk)!;
    const p = pose(rel, STEPBACK_RELEASE_AT);
    expect(p.RightHand.y).toBeGreaterThan(p.Head.y + 0.2);
    expect(p.LeftHand.y).toBeGreaterThan(p.Head.y);
    expect(p.Head.z).toBeLessThan(p.Hips.z - 0.03);                       // the lean away (the rig faces +z)
    expect(Math.abs(p.LeftFoot.z - p.RightFoot.z)).toBeGreaterThan(0.06);  // the stagger the step left (a square jumper's feet are level)
    // off the floor with the hop the modes ride (riseHop): the feet are not driven through the floor by the clip itself
    expect(Math.min(p.LeftFoot.y, p.RightFoot.y)).toBeGreaterThan(-0.02);
  });
  it('rises: the ball goes up the whole way to the release (no second dip after the set)', () => {
    rest(); const rel = buildStepbackRelease(scene, sk)!;
    let last = -Infinity;
    for (let t = 0; t <= STEPBACK_RELEASE_AT + 1e-6; t += 0.04) { at(rel, t); const y = pos('RightHand').y; expect(y).toBeGreaterThan(last - 0.01); last = y; }
  });
  it('SAME WINDOWS: paced by syncedShotSpeed on its own release key, the release lands on the meter\'s green for every contest and gather', () => {
    for (const contest of [0, 0.3, 0.6, 1]) for (const gatherSec of [0, 0.3, 0.46]) {
      const m = new ShotMeter(); m.start(contest, 'jumper', gatherSec);
      const greenInRise01 = (m.greenCenter01 * m.durationSec - m.gatherSec) / m.riseSec;
      const speed = syncedShotSpeed(STEPBACK_RELEASE_SEC, m.riseSec, greenInRise01, STEPBACK_RELEASE_01);
      const releaseAfterRiseSec = STEPBACK_RELEASE_AT / speed;
      expect(releaseAfterRiseSec + m.gatherSec).toBeCloseTo(m.greenCenter01 * m.durationSec, 6);
      // and the meter itself is the jumper's, untouched (the window does not know which clip plays)
      const j = new ShotMeter(); j.start(contest, 'jumper', gatherSec);
      expect([m.durationSec, m.greenCenter01, m.greenHalfWidth01]).toEqual([j.durationSec, j.greenCenter01, j.greenHalfWidth01]);
    }
  });
});

describe('the bank follow-through (called glass)', () => {
  it('starts on the green follow-through\'s release key and ends on its ready stance (the absorb and loop after it are unchanged)', () => {
    rest(); const green = buildFollowThrough(scene, sk)!;
    for (const side of ['left', 'right'] as const) {
      rest(); const bank = buildBankFollowThrough(scene, sk, side)!;
      expect(worst(pose(green, 0), pose(bank, 0), ['RightHand', 'LeftHand', 'Hips'])).toBeLessThan(0.07);
      expect(worst(pose(green, 0.7), pose(bank, 0.7), ['RightHand', 'LeftHand', 'Hips', 'LeftFoot', 'RightFoot'])).toBeLessThan(0.03);
    }
  });
  it('turns the chest and carries the wrist TO the glass side, the eyes up; the two sides are mirror images in the torso, the hand stays the right', () => {
    rest(); const green = buildFollowThrough(scene, sk)!; at(green, 0.15); const g = { yaw: shoulderYaw(), rh: pos('RightHand'), head: pos('Head') };
    const read = (side: 'left' | 'right') => { rest(); const b = buildBankFollowThrough(scene, sk, side)!; at(b, 0.15); return { yaw: shoulderYaw(), rh: pos('RightHand'), lh: pos('LeftHand'), head: pos('Head') }; };
    const L = read('left'), R = read('right');
    // glass on the LEFT: the right shoulder comes forward (+), and the wrist carries left of the green one; on the RIGHT, the other way
    expect(L.yaw - g.yaw).toBeGreaterThan(6); expect(R.yaw - g.yaw).toBeLessThan(-6);
    expect(L.rh.x).toBeLessThan(g.rh.x - 0.03); expect(R.rh.x).toBeGreaterThan(g.rh.x + 0.03);   // (the right side meets the arm's reach: +0.037 m measured)
    // the shooting hand is still the high one (a bank is a right-hand shot either side)
    expect(L.rh.y).toBeGreaterThan(L.lh.y + 0.2); expect(R.rh.y).toBeGreaterThan(R.lh.y + 0.2);
  });
});

describe('the 3PT catch hop', () => {
  it('both feet leave the floor on the hop and come down together, loaded', () => {
    rest(); const hop = buildCatchHop(scene, sk)!;
    const p0 = pose(hop, 0), up = pose(hop, 0.08), down = pose(hop, 0.17);
    expect(up.LeftFoot.y).toBeGreaterThan(p0.LeftFoot.y + 0.04);
    expect(up.RightFoot.y).toBeGreaterThan(p0.RightFoot.y + 0.04);
    expect(Math.abs(down.LeftFoot.y - down.RightFoot.y)).toBeLessThan(0.03);   // two feet, together
    expect(down.Hips.y).toBeLessThan(p0.Hips.y - 0.05);                         // loaded
  });
  it('lands in the pull-up gather\'s SET, in the same 0.3 s — the rise after it starts from the same pose at the same time', () => {
    rest(); const gather = buildPullupGather(scene, sk)!; rest(); const hop = buildCatchHop(scene, sk)!;
    expect(CATCH_HOP_SEC).toBeCloseTo(0.3, 6);
    expect(Math.abs((hop.to - hop.from) - (gather.to - gather.from))).toBeLessThan(1e-6);
    expect(worst(pose(gather, 0.3), pose(hop, CATCH_HOP_SEC))).toBeLessThan(0.02);
  });
});

describe('the kit is registered like every authored clip', () => {
  it('every kit clip is a REAL clip of the hoops suite (resolvable, built for 1v1 / 3v3 / 3PT, mirrored with the bball_ family)', () => {
    for (const c of SHOT_KIT_CLIPS) { expect(REAL_CLIPS.has(c), c).toBe(true); expect(suiteOfClip(c), c).toBe('hoops'); expect(c.startsWith('bball_')).toBe(true); }
  });
});
