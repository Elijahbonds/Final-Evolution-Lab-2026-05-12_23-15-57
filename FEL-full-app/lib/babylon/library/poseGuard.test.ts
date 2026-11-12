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
import { KIT_BODY_MOBILE_URL, KIT_BODY_URL, SCAN_BODY_MOBILE_URL, SCAN_BODY_URL } from '../core/heroBody';
import { EXERCISE_CLIPS } from '../anim/authored/exercise';
import { boneNode } from '../anim/boneLookup';
import { DRILL_DEMO_LOOPS, SCREEN_DEMO_LOOPS, STILL_DEMO_CLIP } from '@/lib/library/surfaceDemo';
import { BIND_POSE_DEG, bindPoseDeviationDeg } from './poseGuard';

// DEMO-SPEED (2026-10-27): + the scan's phone file (heroBody SCAN_BODY_MOBILE_URL), which a phone's stage now loads for the scan
const BODIES = { male: KIT_BODY_URL.male, female: KIT_BODY_URL.female, scan: SCAN_BODY_URL, scanMobile: SCAN_BODY_MOBILE_URL, maleMobile: KIT_BODY_MOBILE_URL.male, femaleMobile: KIT_BODY_MOBILE_URL.female } as const;
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

// DEMO-SPEED (2026-10-27), GATE 0 for the scan's phone file: the same 22 bones under the same names, and every authored loop a
// surface can play (the library's exercise suite — the signature programs' loops are in it — and the drill / screen loops)
// moves it exactly as it moves the full scan: off bind at every phase, every joint within 1 cm of the full scan's.
// DEMO-SPEED-2 (2026-10-28): the kit bodies' phone files (heroBody KIT_BODY_MOBILE_URL) are held to the same, each against its kit file.
const PAIRS = [['scan', 'scanMobile'], ['male', 'maleMobile'], ['female', 'femaleMobile']] as const;
for (const [FULL, PHONE] of PAIRS) describe(`${PHONE} plays every loop ${FULL} plays, the same way`, () => {
  const JOINTS = ['Hips', 'Head', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot', 'LeftForeArm', 'RightLeg'];
  it(`has ${FULL}'s skeleton: the same bones, by name, in the same order`, () => {
    const names = (b: Body) => rigs[b]!.sk.bones.map((x) => x.name);
    expect(names(PHONE)).toEqual(names(FULL));
    expect(names(FULL).length).toBe(22);
  });
  it(`every authored loop builds on it, holds it off bind, and puts its joints where ${FULL}'s go`, () => {
    const bad: string[] = [];
    let worst = 0;
    const clips = [...new Set([...EXERCISE_CLIPS, ...SURFACE_CLIPS])];
    for (const clip of clips) {
      const g: Partial<Record<Body, NonNullable<ReturnType<Scene['getAnimationGroupByName']>>>> = {};
      for (const body of [FULL, PHONE] as const) {
        const r = rigs[body]!;
        reset(body);
        if (!buildAuthoredClip(r.animator, r.scene, r.sk, clip)) { bad.push(`${body} ${clip}: did not build`); continue; }
        const grp = r.scene.animationGroups.find((x) => x.name === clip);
        if (!grp || grp.targetedAnimations.length === 0) { bad.push(`${body} ${clip}: no bound tracks`); continue; }
        g[body] = grp;
      }
      if (!g[FULL] || !g[PHONE]) continue;
      const D = (g[FULL]!.to - g[FULL]!.from) / 30;
      for (let i = 0; i < 4; i++) {
        const at: Partial<Record<Body, Vector3[]>> = {};
        for (const body of [FULL, PHONE] as const) {
          const r = rigs[body]!; const grp = g[body]!;
          reset(body);
          grp.start(false, 1, grp.from, grp.to, false); grp.goToFrame(grp.from + (D * i / 4) * 30); r.scene.render();
          const d = bindPoseDeviationDeg(r.sk);
          // the live stage's own line (BIND_POSE_DEG), not the 15° the surface loops above clear: ex_arm_circles stands
          // straight with the arms out — 8.5–13.8° off bind on both scans, by design of the movement, and the stage shows it
          if (body === PHONE && (d == null || d <= BIND_POSE_DEG)) bad.push(`${body} ${clip} @${(D * i / 4).toFixed(2)}s: ${d?.toFixed(1)}° from bind`);
          at[body] = JOINTS.map((j) => { const n = boneNode(r.sk, j)!; n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); });
          grp.stop();
        }
        JOINTS.forEach((j, k) => { const e = Vector3.Distance(at[FULL]![k], at[PHONE]![k]); worst = Math.max(worst, e); if (e > 0.01) bad.push(`${clip} @${(D * i / 4).toFixed(2)}s ${j}: ${(e * 100).toFixed(1)} cm apart`); });
      }
    }
    expect(bad).toEqual([]);
    expect(clips.length).toBeGreaterThan(150);
    expect(worst).toBeLessThan(0.01);
  }, 240_000);
});
