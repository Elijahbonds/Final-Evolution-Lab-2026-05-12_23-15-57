// FITNESS-TPOSE (2026-10-26): the bodies players actually wear on the library stage — the owner's scan (desktop and the
// phone bake) and the male kit — get every exercise loop, and each loop MOVES the body (not left at bind, a T-pose).
// exercise.test.ts proves the loops' shapes on the forge hero and the female kit; this file adds the other three bodies
// (3D Art's diagnosis 2026-10-26 §7.5) without touching that file.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { EXERCISE_BUILDERS, EXERCISE_CLIPS } from './exercise';
import { CharacterAnimator } from '../CharacterAnimator';
import { buildAuthoredClip } from './index';
import { scopeForMode } from '../clipScope';

const BODIES = {
  scan: 'public/models/elijah-meshy.glb',
  scanMobile: 'public/models/elijah-meshy.mobile.glb',
  kitMale: 'public/models/candidates/fel-kit-male.glb',
} as const;
type Body = keyof typeof BODIES;
const rigs: Partial<Record<Body, { scene: Scene; sk: Skeleton; bind: Map<TransformNode, Quaternion>; clips: Map<string, AnimationGroup> }>> = {};

beforeAll(async () => {
  for (const [body, file] of Object.entries(BODIES) as [Body, string][]) {
    const scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
    const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync(file).toString('base64'), scene, undefined, '.glb');
    for (const g of r.animationGroups) g.stop();
    const sk = r.skeletons[0];
    const bind = new Map<TransformNode, Quaternion>();
    for (const b of sk.bones) { const n = b.getTransformNode(); if (n) bind.set(n, (n.rotationQuaternion ?? Quaternion.Identity()).clone()); }
    const clips = new Map<string, AnimationGroup>();
    for (const [name, build] of EXERCISE_BUILDERS) {
      for (const x of [...scene.animationGroups]) x.stop();
      for (const [n, q] of bind) n.rotationQuaternion = q.clone();
      const g = build(scene, sk); if (g) clips.set(name, g);
    }
    rigs[body] = { scene, sk, bind, clips };
  }
}, 180_000);

/** The largest bone turn from bind (degrees) across the loop. */
function maxSwing(body: Body, clip: string): number {
  const r = rigs[body]!;
  const g = r.clips.get(clip)!;
  let best = 0;
  for (let i = 0; i <= 8; i++) {
    for (const x of [...r.scene.animationGroups]) x.stop();
    for (const [n, q] of r.bind) n.rotationQuaternion = q.clone();
    g.start(false, 1, g.from, g.to, false); g.goToFrame(g.from + ((g.to - g.from) * i) / 8); r.scene.render();
    for (const [n, q] of r.bind) {
      const now = n.rotationQuaternion ?? Quaternion.Identity();
      const dot = Math.min(1, Math.abs(Quaternion.Dot(now, q)));
      best = Math.max(best, (2 * Math.acos(dot) * 180) / Math.PI);
    }
    g.stop();
  }
  return best;
}

describe('every exercise loop on the bodies the library stage spawns', () => {
  for (const body of Object.keys(BODIES) as Body[]) {
    it(`${body}: every loop builds, targets only this body's bones, and moves it off its bind pose`, () => {
      const r = rigs[body]!;
      const nodes = new Set(r.bind.keys());
      for (const name of EXERCISE_CLIPS) {
        const g = r.clips.get(name);
        expect(g, `${body} ${name}`).toBeTruthy();
        expect(g!.targetedAnimations.length, `${body} ${name}`).toBeGreaterThan(0);
        for (const ta of g!.targetedAnimations) if (ta.animation.targetProperty === 'rotationQuaternion') expect(nodes.has(ta.target as TransformNode), `${body} ${name} ${(ta.target as TransformNode).name}`).toBe(true);
        expect(maxSwing(body, name), `${body} ${name}`).toBeGreaterThan(10);
      }
    });

    it(`${body}: the stage's own path (buildAuthoredClip, then play) returns a playing group for the demo loops`, () => {
      const r = rigs[body]!;
      const animator = new CharacterAnimator(r.scene, []);
      for (const name of ['ex_squat', 'ex_split_squat', 'ex_jump', 'ex_march', 'ex_pushup', 'ex_press']) {
        expect(buildAuthoredClip(animator, r.scene, r.sk, name, scopeForMode('library')), `${body} ${name}`).toBe(true);
        expect(animator.play(name, { loop: true, fadeSec: 0.25, restart: true }), `${body} ${name}`).toBeTruthy();
      }
    });
  }
});
