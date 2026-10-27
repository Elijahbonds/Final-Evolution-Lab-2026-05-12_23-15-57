// T-POSE (owner playtest, 2026-10-27): no demo surface may show the bind pose. Every body a player can wear (the guest's
// male kit, the female kit, the owner's scan), spawned the way the library stage spawns it (the 'library' clip scope, the
// stage's own registration and lazy build), plays every loop a demo surface can ask for: one per movement pattern from the
// library, the drill demos' loops, and the anatomy view's idle. At six phases of each loop the body must be well away
// from its bind pose (poseGuard), and a body left at bind must read as bind (the probe's own control).
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { CharacterAnimator } from '../anim/CharacterAnimator';
import { buildAuthoredClip, registerAuthoredClips } from '../anim/authored';
import { scopeForMode } from '../anim/clipScope';
import { KIT_BODY_URL, SCAN_BODY_URL } from '../core/heroBody';
import { DRILL_DEMO_LOOPS, SCREEN_DEMO_LOOPS, STILL_DEMO_CLIP } from '@/lib/library/surfaceDemo';
import { BIND_POSE_DEG, bindPoseDeviationDeg } from './poseGuard';

const BODIES = { male: KIT_BODY_URL.male, female: KIT_BODY_URL.female, scan: SCAN_BODY_URL } as const;
type Body = keyof typeof BODIES;
/** One loop per movement pattern the library plays (lib/library/demo.ts), plus a borrowed court clip. */
const PATTERN_LOOPS = ['ex_squat', 'ex_hinge', 'ex_lunge', 'ex_pushup', 'ex_press', 'ex_row', 'ex_curl', 'ex_plank', 'ex_crunch', 'ex_jump', 'ex_carry', 'ex_lateral_lunge', 'ex_bench_press', 'ex_wall_sit', 'ex_flow_bear_child', 'bball_layup_gather'];
const SURFACE_CLIPS = [...new Set([STILL_DEMO_CLIP, ...PATTERN_LOOPS, ...Object.values(DRILL_DEMO_LOOPS), ...Object.values(SCREEN_DEMO_LOOPS)].filter((c): c is string => !!c))];

const rigs: Partial<Record<Body, { scene: Scene; sk: Skeleton; animator: CharacterAnimator; bind: Map<TransformNode, { p: Vector3; q: Quaternion }> }>> = {};

beforeAll(async () => {
  for (const [body, url] of Object.entries(BODIES) as [Body, string][]) {
    const scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
    (scene.metadata ??= {}).felModeId = 'library';
    const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync(`public${url}`).toString('base64'), scene, undefined, '.glb');
    for (const g of r.animationGroups) g.stop();
    const sk = r.skeletons[0];
    const bind = new Map<TransformNode, { p: Vector3; q: Quaternion }>();
    for (const b of sk.bones) { const n = b.getTransformNode(); if (n) bind.set(n, { p: n.position.clone(), q: (n.rotationQuaternion ?? Quaternion.Identity()).clone() }); }
    const animator = new CharacterAnimator(scene, r.animationGroups);
    registerAuthoredClips(animator, scene, sk, scopeForMode('library'));
    rigs[body] = { scene, sk, animator, bind };
  }
}, 240_000);

function reset(body: Body): void {
  const r = rigs[body]!;
  for (const g of [...r.scene.animationGroups]) g.stop();
  for (const [n, t] of r.bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); }
  r.scene.render();
}

describe('no demo surface shows the bind (T-) pose', () => {
  it('the probe reads a body left at bind as bind (the control)', () => {
    for (const body of Object.keys(BODIES) as Body[]) {
      reset(body);
      expect(bindPoseDeviationDeg(rigs[body]!.sk), body).toBeLessThanOrEqual(BIND_POSE_DEG);
    }
  });

  it('every loop a surface can play builds on every body and holds the body away from bind at every phase', () => {
    const bad: string[] = [];
    for (const body of Object.keys(BODIES) as Body[]) {
      const r = rigs[body]!;
      for (const clip of SURFACE_CLIPS) {
        reset(body);
        if (!buildAuthoredClip(r.animator, r.scene, r.sk, clip)) { bad.push(`${body} ${clip}: did not build in the library scope`); continue; }
        const g = r.scene.animationGroups.find((x) => x.name === clip);
        if (!g || g.targetedAnimations.length === 0) { bad.push(`${body} ${clip}: no bound tracks`); continue; }
        const D = (g.to - g.from) / 30;
        for (let i = 0; i < 6; i++) {
          reset(body);
          g.start(false, 1, g.from, g.to, false); g.goToFrame(g.from + (D * i / 6) * 30); r.scene.render();
          const d = bindPoseDeviationDeg(r.sk);
          if (d == null || d < 15) bad.push(`${body} ${clip} @${(D * i / 6).toFixed(2)}s: ${d?.toFixed(1)}° from bind`);
        }
        g.stop();
      }
    }
    expect(bad).toEqual([]);
  });
});
