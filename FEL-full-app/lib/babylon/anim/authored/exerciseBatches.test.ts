// FITNESS-TPOSE (2026-10-26): the new exercise loops (exerciseBatch*.ts) proven on the FIVE bodies the library stage wears:
// the owner's scan and its mobile tier (the bodies the T-pose bug sat on), the male and female kits, and the forge hero.
// Same harness as exercise.test.ts. Per loop: it builds (never null, so no T-pose fallback) and is in the opt-in exercise suite;
// frame 0 is a pose, not the bind (both forearms at least 15 deg off bind); it closes (no pop at the seam); nothing goes through
// the floor (the repo's -0.035 m joint limit); the feet and hands its spec plants stay put (0.04 m); and an alternating loop's
// halves are mirror images (left at t = mirrored right at t + D/2), a symmetric loop its own mirror (0.06 m: the scan is not symmetric).
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from '../boneLookup';
import { suiteOfClip } from '../clipScope';
import { BATCH_BUILDERS, BATCH_SPEC } from './exerciseBatches.spec';

const BODIES = {
  scan: 'public/models/elijah-meshy.glb', scanMobile: 'public/models/elijah-meshy.mobile.glb', kitMale: 'public/models/candidates/fel-kit-male.glb',
  hero: process.env.FEL_HERO_GLB ?? 'public/models/fel-hero.glb', female: 'public/models/candidates/fel-kit-female.glb',
} as const;
type Body = keyof typeof BODIES;
const BODY_LIST = Object.keys(BODIES) as Body[];
const JOINTS = ['Hips', 'Head', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase', 'LeftLeg', 'RightLeg', 'LeftForeArm', 'RightForeArm', 'LeftArm', 'RightArm'];
interface Rig { scene: Scene; sk: Skeleton; bind: Map<TransformNode, { p: Vector3; q: Quaternion }>; clips: Map<string, AnimationGroup>; bindPos: Map<string, Vector3> }
const rigs: Partial<Record<Body, Rig>> = {};

beforeAll(async () => {
  for (const [body, file] of Object.entries(BODIES) as [Body, string][]) {
    const scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
    const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync(file).toString('base64'), scene, undefined, '.glb');
    for (const g of r.animationGroups) g.stop();
    const sk = r.skeletons[0];
    const bind = new Map<TransformNode, { p: Vector3; q: Quaternion }>();
    for (const b of sk.bones) { const n = b.getTransformNode(); if (n) bind.set(n, { p: n.position.clone(), q: (n.rotationQuaternion ?? Quaternion.Identity()).clone() }); }
    rigs[body] = { scene, sk, bind, clips: new Map(), bindPos: new Map() };
    reset(body); for (const j of JOINTS) rigs[body]!.bindPos.set(j, pos(body, j));
    for (const [name, build] of BATCH_BUILDERS) { reset(body); const g = build(scene, sk); if (g) rigs[body]!.clips.set(name, g); }
  }
}, 600_000);

function reset(body: Body): void {
  const r = rigs[body]!;
  for (const x of [...r.scene.animationGroups]) x.stop();
  for (const [n, t] of r.bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); }
  r.scene.render();
}
function at(body: Body, clip: string, sec: number): void {
  reset(body);
  const g = rigs[body]!.clips.get(clip)!;
  g.start(false, 1, g.from, g.to, false); g.goToFrame(g.from + sec * 30); rigs[body]!.scene.render();
}
const dur = (body: Body, clip: string) => { const g = rigs[body]!.clips.get(clip)!; return (g.to - g.from) / 30; };
function pos(body: Body, name: string): Vector3 { const n = boneNode(rigs[body]!.sk, name)!; n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); }
const mirrorOf = (j: string) => (j.startsWith('Left') ? 'Right' + j.slice(4) : j.startsWith('Right') ? 'Left' + j.slice(5) : j);

describe('FITNESS-TPOSE batches: every new loop on the five library bodies', () => {
  it('builds on every body (no null, so no T-pose fallback), is in the exercise suite, and frame 0 is a pose, not the bind', () => {
    const bad: string[] = [];
    for (const body of BODY_LIST) for (const [name] of BATCH_BUILDERS) {
      if (!rigs[body]!.clips.has(name)) { bad.push(`${body} ${name}: null`); continue; }
      if (suiteOfClip(name) !== 'exercise') bad.push(`${name}: suite ${suiteOfClip(name)}`);
      at(body, name, 0);
      for (const s of ['Left', 'Right']) {
        const b = rigs[body]!.bindPos.get(`${s}ForeArm`)!.subtract(rigs[body]!.bindPos.get(`${s}Arm`)!).normalize();
        const f = pos(body, `${s}ForeArm`).subtract(pos(body, `${s}Arm`)).normalize();
        const deg = (Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(b, f)))) * 180) / Math.PI;
        if (deg < 15) bad.push(`${body} ${name}: ${s} arm ${deg.toFixed(0)} deg from bind (T-pose)`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('closes, stays above the floor, keeps planted feet and hands put, and mirrors', () => {
    const bad: string[] = [];
    for (const body of BODY_LIST) for (const [name] of BATCH_BUILDERS) {
      if (!rigs[body]!.clips.has(name)) continue;
      const D = dur(body, name), N = 48, spec = BATCH_SPEC[name] ?? {};
      const fr: Map<string, Vector3>[] = [];
      for (let i = 0; i <= N; i++) { at(body, name, (D * i) / N); fr.push(new Map(JOINTS.map((j) => [j, pos(body, j)]))); }
      const seam = Math.max(...JOINTS.map((j) => Vector3.Distance(fr[0].get(j)!, fr[N].get(j)!)));
      if (seam > 0.02) bad.push(`${body} ${name}: seam ${seam.toFixed(3)} m`);
      for (const j of JOINTS) { const low = Math.min(...fr.map((m) => m.get(j)!.y)); if (low < -0.035) bad.push(`${body} ${name} ${j} at ${low.toFixed(3)}`); }
      for (const [j, t0, t1, h] of spec.planted ?? []) {
        const w = fr.filter((_, i) => (D * i) / N >= t0 - 1e-6 && (D * i) / N <= t1 + 1e-6).map((m) => m.get(j)!);
        if (w.length < 2) continue;
        const d = Math.max(...w.map((p) => (h ? Math.hypot(p.x - w[0].x, p.z - w[0].z) : Vector3.Distance(p, w[0]))));
        if (d > 0.04) bad.push(`${body} ${name} ${j} drifts ${d.toFixed(3)} m in ${t0}-${t1} s`);
      }
      if (spec.mirror) {
        const sh = spec.mirror === 'half' ? N / 2 : 0; let worst = 0;
        for (let i = 0; i < N; i++) for (const j of JOINTS) {
          const a = fr[i].get(j)!, p = fr[(i + sh) % N].get(mirrorOf(j))!;
          worst = Math.max(worst, Vector3.Distance(a, new Vector3(-p.x, p.y, p.z)));
        }
        if (worst > 0.06) bad.push(`${body} ${name}: mirror off by ${worst.toFixed(3)} m`);
      }
    }
    expect(bad).toEqual([]);
  }, 600_000);
});
