// MOVEMENT POLISH (2026-10-06) — the two opt-in layers: LandingAbsorb (a landing as deep as the fall) and SteerGrip (the hands stay on
// the wheel); and FootPlanting letting go of the floor when the body leaves it. The pure curves, then each layer on the hero rig (the GLB, NullEngine), measured
// the way scripts/probes/_movement-probe.ts measures the game.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FreeCamera, Matrix, NullEngine, Scene, SceneLoader, TransformNode, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { ABSORB, absorbAt, absorbDepth, absorbSec, mountLandingAbsorb, TouchdownDetector } from './LandingAbsorb';
import { bendPole, mountSteerGrip } from './SteerGrip';
import { mountFootPlanting } from './FootPlanting';
import { boneNode } from './boneLookup';
import { buildIdleStand } from './authored/locomotion';
import { buildPoseClip, REF_HIPS_Y } from './poseClip';
import { seatedKeys, STEER_LOCK_RAD } from './authored/seated';

const DT = 1 / 60;

async function rig(): Promise<{ scene: Scene; sk: Skeleton; root: TransformNode; frame: (n?: number) => void; pos: (b: string) => Vector3; dispose: () => void }> {
  const engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => DT * 1000;
  const scene = new Scene(engine); scene.useConstantAnimationDeltaTime = true;
  new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const b64 = readFileSync(process.env.FEL_HERO_GLB ?? 'public/models/fel-hero.glb').toString('base64');
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  const root = r.meshes[0] as unknown as TransformNode;
  root.rotation = new Vector3(0, 0, 0); root.scaling.setAll(1);   // CharacterLibrary.spawn's root
  const sk = r.skeletons[0];
  return {
    scene, sk, root,
    frame: (n = 1) => { for (let i = 0; i < n; i++) scene.render(); },
    pos: (b) => { const x = boneNode(sk, b)!; x.computeWorldMatrix(true); return x.getAbsolutePosition().clone(); },
    dispose: () => { scene.dispose(); engine.dispose(); },
  };
}
const loop = (g: AnimationGroup | null) => { g!.start(true, 1, g!.from, g!.to, false); return g!; };

describe('LandingAbsorb — the curves', () => {
  it('a hop the clip already covers adds nothing; harder falls sink deeper, to a cap', () => {
    expect(absorbDepth(2.4)).toBe(0);
    expect(absorbDepth(ABSORB.freeMps)).toBe(0);
    expect(absorbDepth(4.4)).toBeGreaterThan(absorbDepth(3.4));
    expect(absorbDepth(5.6)).toBeGreaterThan(absorbDepth(4.4));
    expect(absorbDepth(30)).toBe(ABSORB.maxM);
    expect(absorbDepth(-4.4)).toBe(absorbDepth(4.4));
    expect(absorbDepth(NaN)).toBe(0);
  });
  it('the sink eases down, peaks at the compress time, eases back to nothing — continuous, never past the depth', () => {
    const d = 0.08, end = absorbSec(d);
    expect(absorbAt(0, d)).toBe(0);
    expect(absorbAt(ABSORB.compressSec, d)).toBeCloseTo(d, 6);
    expect(absorbAt(end, d)).toBeCloseTo(0, 6);
    let prev = 0, maxStep = 0;
    for (let t = DT; t <= end + 1e-9; t += DT) { const v = absorbAt(t, d); expect(v).toBeLessThanOrEqual(d + 1e-9); maxStep = Math.max(maxStep, Math.abs(v - prev)); prev = v; }
    expect(maxStep).toBeLessThan(d * 0.4);                 // no one-frame drop: ≥ 3 frames down
    expect(absorbSec(ABSORB.maxM)).toBeGreaterThan(absorbSec(0.02));   // a deeper sink rises slower
  });
  it('the detector reads a ballistic touchdown at its impact speed, and ignores a teleport and a gentle ramp', () => {
    const det = new TouchdownDetector();
    let y = 0, vy = 4.5, hit = 0;
    det.step(0, DT);
    for (let i = 0; i < 200 && !hit; i++) { vy -= 9.81 * DT; y = Math.max(0, y + vy * DT); hit = det.step(y, DT); }
    expect(hit).toBeGreaterThan(4.0); expect(hit).toBeLessThan(4.8);
    const det2 = new TouchdownDetector(); det2.step(5, DT); expect(det2.step(0, DT)).toBe(0); expect(det2.step(0, DT)).toBe(0);
    const det3 = new TouchdownDetector(); let h = 2, got = 0; for (let i = 0; i < 120; i++) { h = Math.max(0, h - 1.0 * DT); got = Math.max(got, det3.step(h, DT)); }
    expect(got).toBe(0);
  });
});

describe('LandingAbsorb on the hero rig', () => {
  it('a 5 m/s landing sinks the hips by its depth while the feet stay put, then hands the pose back', async () => {
    // two bodies in lockstep on the same idle: the control shows what the clip alone does frame by frame (its breath moves the hips)
    const ctl = await rig(), r = await rig();
    for (const x of [ctl, r]) { loop(buildIdleStand(x.scene, x.sk)); x.frame(10); }
    const h = mountLandingAbsorb(r.scene, r.sk, r.root, { auto: false });
    h.impact(5);
    const want = absorbDepth(5);
    let deepest = 0, footMove = 0;
    const n = Math.ceil(absorbSec(want) / DT) + 2;
    for (let i = 0; i < n; i++) {
      ctl.frame(); r.frame();
      deepest = Math.max(deepest, ctl.pos('Hips').y - r.pos('Hips').y);
      footMove = Math.max(footMove, Vector3.Distance(r.pos('LeftFoot'), ctl.pos('LeftFoot')), Vector3.Distance(r.pos('RightFoot'), ctl.pos('RightFoot')));
    }
    expect(deepest).toBeGreaterThan(want * 0.85); expect(deepest).toBeLessThan(want * 1.15);
    expect(footMove).toBeLessThan(0.02);
    ctl.frame(3); r.frame(3);
    expect(h.drop).toBe(0);
    expect(Math.abs(r.pos('Hips').y - ctl.pos('Hips').y)).toBeLessThan(0.001);   // the clip's own hips again
    expect(Vector3.Distance(r.pos('LeftLeg'), ctl.pos('LeftLeg'))).toBeLessThan(0.002);   // and its own knees
    ctl.dispose(); r.dispose();
  }, 60_000);
});

describe('SteerGrip', () => {
  it('the bend pole points from the limb\'s midline to its middle joint', () => {
    const p = bendPole(new Vector3(0, 1, 0), new Vector3(0.3, 0.5, 0), new Vector3(0, 0, 0), Vector3.Up());
    expect(p.x).toBeCloseTo(1); expect(p.y).toBeCloseTo(0);
    expect(bendPole(new Vector3(0, 1, 0), new Vector3(0, 0.5, 0), new Vector3(0, 0, 0), Vector3.Up()).y).toBeCloseTo(1);   // straight: the fallback
  });
  it('the driver\'s hands follow the rim to full lock and back (Velocity Kart\'s seat, hub and damping)', async () => {
    const r = await rig();
    const kart = new TransformNode('kart', r.scene);
    r.root.parent = kart; r.root.scaling.setAll(0.92); r.root.position.set(0, -0.08 - REF_HIPS_Y * 0.92, -0.30);
    const seat = buildPoseClip(r.scene, r.sk, 'kart_seated', 0.5, seatedKeys())!; seat.start(true, 1, 0, 0.5, false);
    const hub = new TransformNode('hub', r.scene); hub.parent = kart; hub.position.set(0, 0.28, -0.02); hub.rotation.x = (90 - 22) * Math.PI / 180;
    const wheel = new TransformNode('wheel', r.scene); wheel.parent = hub;
    const g = mountSteerGrip(r.scene, r.sk, wheel);
    r.frame(6);
    expect(g.gripped).toBe(true);
    wheel.computeWorldMatrix(true);
    const inv = Matrix.Invert(wheel.getWorldMatrix());
    const grip = ['LeftHand', 'RightHand'].map((h) => Vector3.TransformCoordinates(r.pos(h), inv));
    let worst = 0;
    for (let f = 0; f < 90; f++) {
      const steer = f < 45 ? 1 : -1;
      wheel.rotation.y += (-steer * STEER_LOCK_RAD - wheel.rotation.y) * Math.min(1, 8 * DT);
      r.root.rotation.z += (steer * 8 * Math.PI / 180 - r.root.rotation.z) * Math.min(1, 8 * DT);
      r.frame(); wheel.computeWorldMatrix(true);
      ['LeftHand', 'RightHand'].forEach((h, i) => { worst = Math.max(worst, Vector3.Distance(r.pos(h), Vector3.TransformCoordinates(grip[i], wheel.getWorldMatrix()))); });
    }
    expect(worst).toBeLessThan(0.02);   // 21.9 cm without the grip (_movement-probe `kart`)
    r.dispose();
  }, 60_000);
});

describe('FootPlanting — a body in the air has no planted foot', () => {
  it('a take-off (the root rising and running on) carries the feet with the body instead of pinning them to the floor', async () => {
    const r = await rig();
    loop(buildIdleStand(r.scene, r.sk));
    mountFootPlanting(r.scene, r.sk.bones[0].getTransformNode()! as never, r.sk, { root: r.root });
    r.frame(20);   // standing: both feet planted
    const rel = (b: string) => r.pos(b).subtract(r.root.getAbsolutePosition());
    const before = [rel('LeftFoot'), rel('RightFoot')];
    let worst = 0;
    for (let i = 0; i < 12; i++) {
      r.root.position.y += 3.5 * DT; r.root.position.z += 6 * DT;   // a 6 m/s run's take-off
      r.frame();
      if (i >= 6) worst = Math.max(worst, Vector3.Distance(rel('LeftFoot'), before[0]), Vector3.Distance(rel('RightFoot'), before[1]));
    }
    expect(worst).toBeLessThan(0.03);   // pinned to the floor, the feet trail the body by the drift limit (0.32 m) before letting go
    r.dispose();
  }, 60_000);
});
