// GAMEPLAY-CLEAN P4 — THE RELEASE EASES IN ROTATION (FootPlanting, PLANT_RELEASE_SEC / feel `anim.plantReleaseSec`). Football Rush's
// hurdle and TD spike let a pinned foot go on the same frame the root dropped 0.36 m and the clip cut to a new pose: the layer's last
// target-fade solve rebuilt the leg in one frame (thighs 41–70°; 29° with the planter off). A two-legged rig on a NullEngine: a root
// skating forward under a planted stance, then one frame where the root drops (airborne by AIRBORNE_VY) and the clip's thighs swing.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bone, Matrix, MeshBuilder, NullEngine, Quaternion, Scene, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';

const knob = vi.hoisted(() => ({ v: new Map<string, number>() }));
vi.mock('../../feel-panel/feel', () => ({ feel: (id: string, def: number) => knob.v.get(id) ?? def }));
import { mountFootPlanting, PLANT_RELEASE_SEC, RELEASE_FADE_SEC } from './FootPlanting';

afterEach(() => knob.v.clear());

const ang = (a: Quaternion, b: Quaternion) => 2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(a, b)))) * 180 / Math.PI;

/** The largest per-frame thigh turn over the release (the drop frame and the frames after it). */
function releaseStep(): { maxStep: number; clipStep: number } {
  const engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const scene = new Scene(engine);
  const root = new TransformNode('root', scene); root.rotationQuaternion = Quaternion.Identity();
  const sk = new Skeleton('sk', 'sk', scene);
  const nodes: Record<string, TransformNode> = {};
  const add = (name: string, parent: TransformNode, pos: [number, number, number], q: Quaternion) => {
    const n = new TransformNode(name, scene); n.parent = parent; n.position.set(...pos); n.rotationQuaternion = q.clone(); nodes[name] = n; return n;
  };
  const hips = add('Hips', root, [0, 0.88, 0], Quaternion.Identity());
  for (const [sd, x] of [['Left', 0.1], ['Right', -0.1]] as const) {
    const up = add(`${sd}UpLeg`, hips, [x, -0.02, 0], Quaternion.RotationAxis(Vector3.Right(), -0.35));
    const kn = add(`${sd}Leg`, up, [0, -0.44, 0], Quaternion.RotationAxis(Vector3.Right(), 0.7));
    add(`${sd}Foot`, kn, [0, -0.42, 0], Quaternion.Identity());
  }
  let parentBone: Record<string, Bone | null> = {};
  for (const n of Object.values(nodes)) {
    const pb = parentBone[(n.parent as TransformNode).name] ?? null;
    const b = new Bone(n.name, sk, pb, Matrix.Identity()); b.linkTransformNode(n); parentBone = { ...parentBone, [n.name]: b };
  }
  const mesh = MeshBuilder.CreateBox('body', { size: 0.1 }, scene); mesh.parent = root;
  const planting = mountFootPlanting(scene, mesh, sk, { root });
  let thigh = -0.35, knee = 0.7;
  const frame = () => {
    for (const sd of ['Left', 'Right']) { nodes[`${sd}UpLeg`].rotationQuaternion!.copyFrom(Quaternion.RotationAxis(Vector3.Right(), thigh)); nodes[`${sd}Leg`].rotationQuaternion!.copyFrom(Quaternion.RotationAxis(Vector3.Right(), knee)); }
    for (const n of [root, ...Object.values(nodes)]) n.computeWorldMatrix(true);
    scene.onAfterAnimationsObservable.notifyObservers(scene);
  };
  for (let i = 0; i < 30; i++) { root.position.z += 0.004; frame(); }   // planted, the root skating: the pin holds the foot back
  expect(planting.debug.left.planted).toBe(true);
  let prev = nodes.LeftUpLeg.rotationQuaternion!.clone(); let maxStep = 0;
  const clipBefore = Quaternion.RotationAxis(Vector3.Right(), thigh);
  // the drop: the root falls 0.3 m in a frame (airborne) and the clip cuts to a new pose (thigh −0.35 → +0.45 rad, knee 0.7 → 0.1)
  root.position.y -= 0.3; thigh = 0.45; knee = 0.1;
  for (let i = 0; i < 12; i++) {
    frame(); if (i === 0) root.position.y += 0;   // (the root then stays down)
    const q = nodes.LeftUpLeg.rotationQuaternion!.clone(); maxStep = Math.max(maxStep, ang(prev, q)); prev = q;
  }
  const clipStep = ang(clipBefore, Quaternion.RotationAxis(Vector3.Right(), thigh));
  planting.dispose(); scene.dispose(); engine.dispose();
  return { maxStep, clipStep };
}

describe('FootPlanting: a release eases in rotation', () => {
  it('the default is the old fade\'s own time', () => { expect(PLANT_RELEASE_SEC).toBe(RELEASE_FADE_SEC); });

  it('a release on a frame the root drops and the clip cuts: the thigh moves a slice of the gap a frame, not the whole cut', () => {
    knob.v.set('anim.plantReleaseSec', 0);
    const old = releaseStep();
    knob.v.clear();
    const now = releaseStep();
    expect(old.clipStep).toBeGreaterThan(40);            // the clip's own cut: 46°
    // on this rig the old target fade moves the thigh 13.5° on its worst frame, the rotation release 6.0° (the live hurdle, where the
    // fade's target and the new pose disagree far more, read 41–70°: the rig measures that one, §4f)
    expect(now.maxStep).toBeLessThan(old.maxStep * 0.6);
    expect(now.maxStep).toBeLessThan(12.5);              // under half the pop threshold a frame
  });
});
