// hoops-p05 — hipSteer: the pelvis turns toward the travel and the chest stays on the man. The pure curve, then the layer on the hero rig
// (the GLB, NullEngine): the legs turn about the vertical by the angle asked, the shoulders do not move, and the off knob writes nothing.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, TransformNode, Vector3 } from '@babylonjs/core';
import type { Skeleton } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from './boneLookup';
import { BACKPEDAL_REVERSED_TRAVEL_DEG, HIP_STEER_FROM_MPS, HIP_STEER_FULL_MPS, HIP_STEER_MAX_DEG, HipSteer, LOOP_TRAVEL_DEG, steerWantedDeg, steerWeight, stepSteer } from './hipSteer';
import { resetFeelForTests, setFeelOverride, setFeelSession, setFeelUser } from '../../feel-panel/feel';

const RAD = Math.PI / 180;
afterEach(() => resetFeelForTests());

describe('hipSteer — the curve', () => {
  it('no turn standing or shifting weight; all of it from the full speed', () => {
    expect(steerWeight(0)).toBe(0);
    expect(steerWeight(HIP_STEER_FROM_MPS)).toBe(0);
    expect(steerWeight(HIP_STEER_FULL_MPS)).toBe(1);
    expect(steerWeight(9)).toBe(1);
    const mid = steerWeight((HIP_STEER_FROM_MPS + HIP_STEER_FULL_MPS) / 2);
    expect(mid).toBeGreaterThan(0.4); expect(mid).toBeLessThan(0.6);
  });
  it('the turn is the travel less the loop, the short way round, capped', () => {
    expect(steerWantedDeg(LOOP_TRAVEL_DEG.defend_slide, -90 * RAD, 3)).toBeCloseTo(0, 6);          // a slide along its own axis: square hips
    expect(steerWantedDeg(LOOP_TRAVEL_DEG.defend_slide, -120 * RAD, 3)).toBeCloseTo(-30, 6);       // sliding left and a little back: the hips open 30° that way
    expect(steerWantedDeg(LOOP_TRAVEL_DEG.defend_backpedal, 150 * RAD, 3)).toBeCloseTo(-30, 6);
    expect(steerWantedDeg(LOOP_TRAVEL_DEG.defend_backpedal, -170 * RAD, 3)).toBeCloseTo(10, 6);     // across ±180: the short way
    expect(steerWantedDeg(LOOP_TRAVEL_DEG.run, 80 * RAD, 3)).toBe(HIP_STEER_MAX_DEG);               // capped
    expect(steerWantedDeg(BACKPEDAL_REVERSED_TRAVEL_DEG, Math.PI, 3)).toBeCloseTo(33, 6);            // the reversed capture going straight back
  });
  it('a state that is not a stepping loop, or a body with no travel, is not steered', () => {
    expect(steerWantedDeg(null, 1, 3)).toBe(0);
    expect(steerWantedDeg(undefined, 1, 3)).toBe(0);
    expect(steerWantedDeg(0, undefined, 3)).toBe(0);
    expect(steerWantedDeg(0, NaN, 3)).toBe(0);
    expect(steerWantedDeg(0, 0.5, 0.2)).toBe(0);
    expect(LOOP_TRAVEL_DEG.defend_idle).toBeUndefined();
    expect(LOOP_TRAVEL_DEG.watch).toBeUndefined();
  });
  it('the ease is frame-rate independent, never overshoots, and tau 0 is at once', () => {
    let a = 0; for (let i = 0; i < 60; i++) a = stepSteer(a, 40, 1 / 60);
    let b = 0; for (let i = 0; i < 30; i++) b = stepSteer(b, 40, 1 / 30);
    expect(a).toBeCloseTo(b, 6);
    expect(a).toBeGreaterThan(39); expect(a).toBeLessThanOrEqual(40);
    expect(stepSteer(0, 40, 1 / 60, 0)).toBe(40);
    expect(stepSteer(7, 40, 0)).toBe(7);
    // no frame turns more than a fifth of the way: an ease, not a cut
    expect(stepSteer(0, 40, 1 / 60)).toBeLessThan(8);
  });
});

async function rig(): Promise<{ scene: Scene; sk: Skeleton; root: TransformNode; pos: (b: string) => Vector3; dispose: () => void }> {
  const engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const scene = new Scene(engine); scene.useConstantAnimationDeltaTime = true;
  new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const b64 = readFileSync(process.env.FEL_HERO_GLB ?? 'public/models/fel-hero.glb').toString('base64');
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  const root = r.meshes[0] as unknown as TransformNode;
  root.rotationQuaternion = null; root.rotation = new Vector3(0, 0, 0); root.scaling.setAll(1);   // CharacterLibrary.spawn's root
  const sk = r.skeletons[0];
  return { scene, sk, root, pos: (b) => { const x = boneNode(sk, b)!; x.computeWorldMatrix(true); return x.getAbsolutePosition().clone(); }, dispose: () => { scene.dispose(); engine.dispose(); } };
}
/** The yaw (deg, + = toward +x from +z) of the line from bone `b` to bone `a`, turned to read 0 for a square body. */
const lineYaw = (a: Vector3, b: Vector3): number => Math.atan2(-(a.z - b.z), a.x - b.x) / RAD;
const wrap = (d: number): number => ((d + 180) % 360 + 360) % 360 - 180;

describe('hipSteer — on the hero rig', () => {
  it('the legs turn about the vertical by the angle asked, toward the travel; the shoulders, the head and the hips\' height stay', async () => {
    const R = await rig();
    try {
      const steer = HipSteer.for(R.scene, R.sk, R.root);
      const bones = ['Hips', 'Spine', 'Spine1', 'Spine2', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftArm', 'RightArm', 'Head'].map((n) => boneNode(R.sk, n)!);
      const rest = bones.map((n) => (n.rotationQuaternion ?? Quaternion.Identity()).clone());
      const pose = () => bones.forEach((n, i) => { n.rotationQuaternion = rest[i].clone(); });
      const frame = () => { pose(); R.scene.onAfterAnimationsObservable.notifyObservers(R.scene); };
      const read = () => ({ hip: lineYaw(R.pos('LeftUpLeg'), R.pos('RightUpLeg')), feet: lineYaw(R.pos('LeftFoot'), R.pos('RightFoot')), chest: lineYaw(R.pos('LeftArm'), R.pos('RightArm')), head: R.pos('Head'), hipsY: R.pos('Hips').y, footY: R.pos('LeftFoot').y });
      frame(); const base = read();
      // a slide to the body's LEFT (−90°) while the body travels left and BACK (−130°): the pelvis opens 40° that way (negative)
      for (let i = 0; i < 120; i++) steer.drive({ state: 'defend_slide', travelOffRad: -130 * RAD, speedMps: 3, dtSec: 1 / 60 });
      expect(steer.turnDeg).toBeCloseTo(-40, 1);
      frame(); const on = read();
      expect(wrap(on.hip - base.hip)).toBeCloseTo(-40, 0);     // the hip line turned with it
      expect(wrap(on.feet - base.feet)).toBeCloseTo(-40, 0);   // …and the feet under it
      expect(Math.abs(wrap(on.chest - base.chest))).toBeLessThan(0.5);   // the chest stays on the man
      expect(Vector3.Distance(on.head, base.head)).toBeLessThan(0.02);
      expect(on.hipsY).toBeCloseTo(base.hipsY, 4);
      expect(on.footY).toBeCloseTo(base.footY, 3);              // a turn about the vertical: no foot leaves the floor
      // back to the loop's own axis: the turn eases out, and at 0 the layer writes nothing
      for (let i = 0; i < 240; i++) steer.drive({ state: 'defend_slide', travelOffRad: -90 * RAD, speedMps: 3, dtSec: 1 / 60 });
      expect(steer.turnDeg).toBe(0);
      frame(); const off = read();
      expect(wrap(off.hip - base.hip)).toBeCloseTo(0, 6);
    } finally { R.dispose(); }
  });
  it('a hold keeps the turn where it is (a bump on defence), and steering resumes from there', () => {
    const st = new HipSteer({ onAfterAnimationsObservable: { add: () => null } } as never, { bones: [] } as never, {} as never);
    for (let i = 0; i < 120; i++) st.drive({ state: 'defend_slide', travelOffRad: -130 * RAD, speedMps: 3, dtSec: 1 / 60 });
    const t = st.turnDeg; expect(t).toBeCloseTo(-40, 1);
    for (let i = 0; i < 30; i++) st.drive({ state: null, hold: true, travelOffRad: -130 * RAD, speedMps: 3, dtSec: 1 / 60 });
    expect(st.turnDeg).toBe(t);
    st.drive({ state: null, travelOffRad: -130 * RAD, speedMps: 3, dtSec: 1 / 60 });
    expect(Math.abs(st.turnDeg)).toBeLessThan(Math.abs(t));   // released: it eases out again
  });
  it('knob hoops.hipSteerOn 0: nothing is written (today\'s legs exactly)', async () => {
    setFeelUser(true); setFeelSession(null); setFeelOverride('hoops.hipSteerOn', 0);
    const R = await rig();
    try {
      const steer = HipSteer.for(R.scene, R.sk, R.root);
      const hips = boneNode(R.sk, 'Hips')!; const q0 = hips.rotationQuaternion!.clone();
      for (let i = 0; i < 60; i++) steer.drive({ state: 'defend_backpedal', travelOffRad: 140 * RAD, speedMps: 4, dtSec: 1 / 60 });
      expect(steer.turnDeg).toBe(0);
      R.scene.onAfterAnimationsObservable.notifyObservers(R.scene);
      expect(hips.rotationQuaternion!.equalsWithEpsilon(q0, 1e-9)).toBe(true);
    } finally { R.dispose(); }
  });
});
