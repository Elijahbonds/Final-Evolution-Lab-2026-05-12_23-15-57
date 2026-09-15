// Proves the opponents' CAPTURED clips on the bodies players actually wear (EVERYONE-BODY-MOCAP-OPPONENTS, 2026-09-14):
// the male and female kit bodies and the owner's scan, in a NullEngine. Each clip is built against the live skeleton,
// scrubbed, and measured — the move has to READ as the move on every body, not just exist.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from '../boneLookup';
import { MOCAP_OPPONENT_CLIPS, buildMocapOpponentClip } from './mocapOpponents';

const BODIES = {
  'kit-male': 'public/models/candidates/fel-kit-male.glb',
  'kit-female': 'public/models/candidates/fel-kit-female.glb',
  scan: 'public/models/elijah-meshy.glb',
} as const;

interface Rig { scene: Scene; sk: Skeleton; bind: Map<TransformNode, { p: Vector3; q: Quaternion }>; clips: Map<string, AnimationGroup> }
const rigs = new Map<string, Rig>();

beforeAll(async () => {
  for (const [key, file] of Object.entries(BODIES)) {
    const scene = new Scene(new NullEngine());
    new FreeCamera('c', new Vector3(0, 1, -3), scene);
    const b64 = readFileSync(file).toString('base64');
    const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
    for (const g of r.animationGroups) g.stop();
    const sk = r.skeletons[0];
    const bind = new Map<TransformNode, { p: Vector3; q: Quaternion }>();
    for (const b of sk.bones) { const n = b.getTransformNode(); if (n) bind.set(n, { p: n.position.clone(), q: (n.rotationQuaternion ?? Quaternion.Identity()).clone() }); }
    const rest = () => { for (const [n, t] of bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); } };
    const clips = new Map<string, AnimationGroup>();
    for (const c of MOCAP_OPPONENT_CLIPS) { rest(); const g = buildMocapOpponentClip(scene, sk, c); if (g) clips.set(c.name, g); }
    rigs.set(key, { scene, sk, bind, clips });
  }
}, 120_000);

function at(rig: Rig, name: string, sec: number): (bone: string) => Vector3 {
  for (const x of rig.scene.animationGroups) x.stop();
  for (const [n, t] of rig.bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); }
  const g = rig.clips.get(name)!;
  g.start(false, 1, g.from, g.to, false); g.goToFrame(Math.min(g.to, sec * 30)); rig.scene.render();
  return (bone: string) => { const n = boneNode(rig.sk, bone)!; n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); };
}
const clip = (name: string) => MOCAP_OPPONENT_CLIPS.find((c) => c.name === name)!;
/** The body's own right (hip line) and up, so every measurement is in the body's frame, not the world's. */
function frame(p: (b: string) => Vector3) {
  const right = p('RightUpLeg').subtract(p('LeftUpLeg')); right.y = 0; right.normalize();
  return { right, sideOf: (b: string) => Vector3.Dot(p(b).subtract(p('Hips')), right) };
}

for (const body of Object.keys(BODIES)) {
  describe(`captured opponent clips on the ${body} body`, () => {
    it('every clip builds, and no bone ever carries a NaN', () => {
      const rig = rigs.get(body)!;
      expect([...rig.clips.keys()].sort()).toEqual(MOCAP_OPPONENT_CLIPS.map((c) => c.name).sort());
      for (const c of MOCAP_OPPONENT_CLIPS) {
        for (const u of [0, 0.5, 1]) {
          const p = at(rig, c.name, u * c.duration);
          for (const b of ['Hips', 'Head', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot']) {
            const v = p(b); expect(Number.isFinite(v.x + v.y + v.z), `${c.name} ${b} @${u}`).toBe(true);
          }
        }
      }
    });

    it('grounded captures keep a foot ON the floor (ankle at this body\'s own bind height), never floating or sunk', () => {
      const rig = rigs.get(body)!;
      for (const [n, t] of rig.bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); }
      for (const x of rig.scene.animationGroups) x.stop();
      rig.scene.render();
      const ank = (p: (b: string) => Vector3) => Math.min(p('LeftFoot').y, p('RightFoot').y);
      const bindAnkle = ank((b) => { const n = boneNode(rig.sk, b)!; n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); });
      for (const c of MOCAP_OPPONENT_CLIPS.filter((c) => /dribble_idle|defend_slide|defend_stance|crossover|hesi|_run$|drive/.test(c.name))) {
        const ys: number[] = [];
        for (let u = 0; u <= 1.0001; u += 0.125) ys.push(ank(at(rig, c.name, u * c.duration)));
        ys.sort((a, b) => a - b);
        const p50 = ys[Math.floor(ys.length / 2)];
        expect(ys[0], `${c.name} lowest ankle vs bind ${bindAnkle.toFixed(3)}`).toBeGreaterThan(bindAnkle - 0.04);
        expect(p50, `${c.name} median ankle vs bind ${bindAnkle.toFixed(3)}`).toBeLessThan(bindAnkle + 0.07);
      }
    });

    it('the jump shot RELEASES above the head, then the follow-through comes down', () => {
      const rig = rigs.get(body)!, js = clip('bball_mc_jumpshot');
      // CMU 06_15's shooter sets the ball at the FOREHEAD (hands 2.20 torso-heights over the floor, head 2.17) and releases
      // well over it — so the set is judged against the head band, and the release against the set
      const set = at(rig, js.name, 0.05), setHand = set('RightHand').y - set('Head').y;
      const top = at(rig, js.name, js.duration * 0.8), topHand = Math.max(top('RightHand').y, top('LeftHand').y) - top('Head').y;
      expect(setHand).toBeLessThan(0.2);                         // set at the face / forehead (a shorter torso puts it just over her head)
      expect(topHand).toBeGreaterThan(0.12);                     // the release is over the head
      expect(topHand - setHand).toBeGreaterThan(0.08);           // …and above where it was set
      const ft = clip('bball_mc_follow_through');
      const end = at(rig, ft.name, ft.duration), endHand = Math.max(end('RightHand').y, end('LeftHand').y) - end('Head').y;
      expect(endHand).toBeLessThan(topHand - 0.2);
    });

    it('the dribble keeps the ball hand low, out front, and bouncing', () => {
      const rig = rigs.get(body)!, d = clip('bball_mc_dribble_idle');
      const ys: number[] = [];
      // measured from the HIP JOINTS: the female kit's Hips bone sits 8 cm below her legs' top, so "above the Hips bone"
      // read 8 cm high on her for the same hand
      for (let u = 0; u <= 1.0001; u += 0.1) { const p = at(rig, d.name, u * d.duration); ys.push(p('RightHand').y - (p('LeftUpLeg').y + p('RightUpLeg').y) / 2); }
      expect(Math.max(...ys)).toBeLessThan(0.5);                 // the catch peaks at the chest (0.46 m over the hip joints on every body), never the shoulders
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.1);   // it actually bounces
      const a = at(rig, d.name, 0)('RightHand').y, b = at(rig, d.name, d.duration)('RightHand').y;
      expect(Math.abs(a - b)).toBeLessThan(0.05);                // the loop closes
    });

    it('the crossovers carry the hand ACROSS the body, to the side they are named for', () => {
      const rig = rigs.get(body)!;
      for (const [name, hand, dir] of [['bball_mc_crossover_right', 'LeftHand', 1], ['bball_mc_crossover_left', 'RightHand', -1]] as const) {
        const c = clip(name);
        const s0 = frame(at(rig, name, 0.02)).sideOf(hand);
        const s1p = at(rig, name, c.duration * 0.55), s1 = frame(s1p).sideOf(hand);
        expect((s1 - s0) * dir, `${name}: the ${hand} moves toward the ${dir > 0 ? 'right' : 'left'}`).toBeGreaterThan(0.12);
      }
    });

    it('the celebration (the owner\'s own take) ends with both hands over the head', () => {
      const rig = rigs.get(body)!, c = clip('dunk_mc_celebrate_big');
      const p0 = at(rig, c.name, 0.02), start = Math.max(p0('LeftHand').y, p0('RightHand').y) - p0('Head').y;
      const p1 = at(rig, c.name, c.duration * 0.95);
      expect(p1('LeftHand').y).toBeGreaterThan(p1('Head').y);
      expect(p1('RightHand').y).toBeGreaterThan(p1('Head').y);
      expect(start).toBeLessThan(0.05);
    });

    it('the knockdown puts the head near the floor and the get-up stands back up', () => {
      const rig = rigs.get(body)!;
      const kd = clip('karate_mc_knockdown'), gu = clip('karate_mc_get_up');
      // relative to this body's own standing head height: the female kit body is shorter, and an absolute metre bar
      // measured the body rather than the move (0.66 m of a 1.5 m head on her, 0.7+ on the taller two)
      const p0 = at(rig, kd.name, 0), stand = p0('Head').y - Math.min(p0('LeftFoot').y, p0('RightFoot').y);
      const drop = p0('Head').y - at(rig, kd.name, kd.duration)('Head').y;
      expect(drop / stand).toBeGreaterThan(0.45);
      const up0 = at(rig, gu.name, 0)('Head').y, up1 = at(rig, gu.name, gu.duration)('Head').y;
      expect((up1 - up0) / stand).toBeGreaterThan(0.4);
    });
  });
}
