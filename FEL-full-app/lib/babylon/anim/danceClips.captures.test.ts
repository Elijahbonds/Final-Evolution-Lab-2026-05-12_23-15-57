// MUSIC-SUITE P9 (2026-09-29), moves — the captured breaking and popping steps on the REAL hero rig (the anim probe pattern:
// NullEngine + public/models/fel-hero.glb, every frame sampled, the production builders — not a re-implementation).
//
//   * the two RECOGNISABLE captures (windmill, six-step) compose byte for byte as before (hashes taken before this change);
//   * every captured move composes STANDING → capture → STANDING, builds on the rig, and loops with no T-pose frame and
//     no snap at the wrap — through a real crossfade in and out too;
//   * its root track stands at both ends; the standing moves stay upright, the floor moves go down and turn over;
//   * a captured move that could not build dances its procedural sibling (never a placeholder).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from './boneLookup';
import {
  buildDanceClip, CAPTURE_SIBLING, composeCapturedStep, DANCE_ALIASES, DANCE_CLIP_IDS, danceRootTracks, MOVE_CAPTURES,
  resolveDanceClip,
} from './danceClips';
import { CharacterAnimator } from './CharacterAnimator';
import { sampleRootTrack } from './MoveRootLayer';
import { CAPTURED_MOVES } from '../dance/moves';

const sha = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const REF_SEC_PER_BEAT = 0.5;   // danceClips REF_BPM 120
const BONES = ['Hips', 'Spine', 'Neck', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm'];
/** How far a bone's local rotation is from identity (deg). On this Mixamo-style rig identity on the arm chain IS the T-pose
 *  (its imported bind is an A-pose, LeftArm ≈ −14°): a bone no key drives reports identity (danceClips.transSpin.test). */
const degFromIdentity = (q: Quaternion): number => (Math.acos(Math.min(1, Math.abs(q.w))) * 360) / Math.PI;

let scene: Scene;
let sk: Skeleton;
beforeAll(async () => {
  scene = new Scene(new NullEngine());
  new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const b64 = readFileSync('public/models/fel-hero.glb').toString('base64');
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0];
});

describe('the RECOGNISABLE captures are untouched', () => {
  it('the windmill and the six-step compose exactly as before; the old ids\' root tracks too (hashes taken before P9 moves)', () => {
    expect(sha(composeCapturedStep('dance_power_windmill'))).toBe('c653ddb680d70fec0efff3185e1c9124e7ae197a869f728fe99ec719cbbc7622');
    expect(sha(composeCapturedStep('dance_footwork_six'))).toBe('44afb355b1ec615fa81e289253cfaa09532a50290ff8355db5e3910ebb471e8c');
    const oldIds = DANCE_CLIP_IDS.filter((id) => !CAPTURED_MOVES.some((m) => m.id === id));
    expect(oldIds).toHaveLength(9);
    expect(sha(danceRootTracks(oldIds))).toBe('b0521061bba6ba3c15f3b1982c51a026df3e4192a2b540841bd68c6455893d54');
  });
});

describe('every captured move composes on the standing contract', () => {
  for (const m of CAPTURED_MOVES) {
    it(`${m.id}: standing at 0 and at the end, times rising, the step's own length`, () => {
      const c = composeCapturedStep(m.id)!;
      expect(c, m.id).toBeTruthy();
      expect(c.duration).toBeCloseTo(m.beats * REF_SEC_PER_BEAT, 9);
      expect(c.keys[0].t).toBe(0);
      expect(c.keys[c.keys.length - 1].t).toBeCloseTo(c.duration, 9);
      for (let i = 1; i < c.keys.length; i++) expect(c.keys[i].t, `${m.id} key ${i}`).toBeGreaterThanOrEqual(c.keys[i - 1].t);
      expect(c.keys[0]).toEqual({ ...c.keys[c.keys.length - 1], t: 0 });                  // the same standing pose both ends
      expect(c.root[0]).toEqual([0, 0, 0, 0, 1, 0]);
      expect(c.root[c.root.length - 1]).toEqual([c.duration, 0, 0, 0, 1, 0]);
      expect(c.root.length).toBe(c.keys.length);                                          // body and root on one timeline
      // most of the step is the capture, not the drop and the rise
      const plan = MOVE_CAPTURES[m.id];
      expect((plan.inBeats + plan.outBeats) / m.beats).toBeLessThanOrEqual(0.45);
    });
  }
});

describe('on the hero rig: builds, and loops with no T-pose frame', () => {
  const rot = (name: string): Quaternion => boneNode(sk, name)!.rotationQuaternion!.clone();
  for (const m of CAPTURED_MOVES) {
    it(`${m.id}: every frame finite and unit, never both arms in a T, the spine always keyed; the wrap does not snap`, () => {
      const g = buildDanceClip(scene, sk, m.id)!;
      expect(g, `${m.id} built`).toBeTruthy();
      expect(g.targetedAnimations.length).toBeGreaterThan(8);
      g.start(true, 1, g.from, g.to, false);
      let minSpine = Infinity, tFrames = 0;
      for (let f = g.from; f <= g.to; f += 1) {
        g.goToFrame(f); scene.render();
        for (const name of BONES) {
          const q = rot(name);
          expect(Number.isFinite(q.x + q.y + q.z + q.w), `${m.id} ${name}@${f}`).toBe(true);
          expect(q.length(), `${m.id} ${name}@${f} unit`).toBeCloseTo(1, 3);
        }
        minSpine = Math.min(minSpine, degFromIdentity(rot('Spine')));
        if (degFromIdentity(rot('LeftArm')) < 8 && degFromIdentity(rot('RightArm')) < 8) tFrames++;
      }
      expect(tFrames, `${m.id} T-pose frames`).toBe(0);
      expect(minSpine, `${m.id} spine collapsed to identity`).toBeGreaterThan(2);
      // the loop wrap: the last frame's pose is the first frame's (both are STANDING)
      g.goToFrame(g.from); scene.render();
      const first = BONES.map(rot);
      g.goToFrame(g.to); scene.render();
      const last = BONES.map(rot);
      first.forEach((q, i) => expect(Math.abs(Quaternion.Dot(q, last[i])), `${m.id} ${BONES[i]} wraps`).toBeGreaterThan(0.9995));
      g.stop(); g.dispose();
    });
  }

  it('through a real crossfade in from a procedural step and out to the next, the spine never drops to identity', () => {
    (scene.getEngine() as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
    const groups: AnimationGroup[] = [buildDanceClip(scene, sk, 'dance_bounce_shoulder')!, ...CAPTURED_MOVES.map((m) => buildDanceClip(scene, sk, m.id)!)];
    const animator = new CharacterAnimator(scene, groups);
    const spineOk = (): void => {
      const q = boneNode(sk, 'Spine')!.rotationQuaternion!;
      expect(Number.isFinite(q.x + q.y + q.z + q.w)).toBe(true);
      expect(degFromIdentity(q), 'Spine toward identity — the T-pose signature').toBeGreaterThan(2);
    };
    animator.play('dance_bounce_shoulder', { loop: true, fadeSec: 0 });
    scene.render(); spineOk();
    for (const m of CAPTURED_MOVES) {
      animator.play(m.id, { loop: true, fadeSec: 0.12 });   // DanceMode.danceMove's own fade
      for (let i = 0; i < 12; i++) { scene.render(); spineOk(); }
    }
    animator.play('dance_bounce_shoulder', { loop: true, fadeSec: 0.12 });
    for (let i = 0; i < 12; i++) { scene.render(); spineOk(); }
    for (const g of groups) g.dispose();
  });
});

describe('the root tracks', () => {
  const tilt = (q: Quaternion): number => (2 * Math.acos(Math.min(1, Math.abs(q.w))) * 180) / Math.PI;
  it('each captured move has one (and a mirrored .M); it stands at both ends', () => {
    const tracks = danceRootTracks(CAPTURED_MOVES.map((m) => m.id));
    for (const m of CAPTURED_MOVES) {
      const tr = tracks.find((x) => x.name === m.id)!, trM = tracks.find((x) => x.name === `${m.id}.M`)!;
      expect(tr && trM, m.id).toBeTruthy();
      const a = sampleRootTrack(tr, 0), z = sampleRootTrack(tr, tr.duration);
      expect(a.q.w).toBeCloseTo(1, 9); expect(z.q.w).toBeCloseTo(1, 9);
      expect(a.h).toBe(0); expect(z.h).toBe(0);
    }
  });
  it('the standing moves stay up and upright; the floor moves go down or turn the body over', () => {
    const tracks = danceRootTracks(CAPTURED_MOVES.map((m) => m.id));
    const span = (id: string) => {
      const tr = tracks.find((x) => x.name === id)!;
      let low = 0, maxTilt = 0;
      for (let t = 0; t <= tr.duration; t += 0.02) { const r = sampleRootTrack(tr, t); low = Math.min(low, r.h); maxTilt = Math.max(maxTilt, tilt(r.q)); }
      return { low, maxTilt };
    };
    for (const id of ['dance_toprock_kick', 'dance_pop_moonwalk', 'dance_pop_robot']) {
      const s = span(id);
      expect(s.maxTilt, `${id} upright`).toBeLessThan(35);
      expect(s.low, `${id} on its feet`).toBeGreaterThan(-0.4);
    }
    expect(span('dance_freeze_side').maxTilt, 'the side freeze lies over').toBeGreaterThan(90);
    expect(span('dance_power_headstand').maxTilt, 'the headstand spin inverts').toBeGreaterThan(150);
    const heli = span('dance_power_helicopter');
    expect(heli.low, 'the helicopter goes to the floor').toBeLessThan(-0.3);
  });
});

describe('a captured move that could not build (never a placeholder)', () => {
  it('dances its procedural sibling when the sibling registered, else the sport-clip alias', () => {
    for (const m of CAPTURED_MOVES) {
      expect(resolveDanceClip(m.id, (x) => x === m.id)).toBe(m.id);
      expect(resolveDanceClip(m.id, (x) => x === CAPTURE_SIBLING[m.id])).toBe(CAPTURE_SIBLING[m.id]);
      expect(resolveDanceClip(m.id, () => false)).toBe(DANCE_ALIASES[m.id]);
    }
    // the old ids resolve exactly as before
    expect(resolveDanceClip('dance_power_windmill', () => false)).toBe('roundhouse');
    expect(resolveDanceClip('dance_toprock_basic', (x) => x === 'dance_toprock_basic')).toBe('dance_toprock_basic');
  });
});
