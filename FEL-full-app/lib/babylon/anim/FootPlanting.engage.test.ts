// GAMEPLAY-CLEAN P3 — THE SOLVE ENGAGES OVER A BLEND (FootPlanting, PLANT_ENGAGE_SEC / feel `anim.plantEngageSec`). Derby's batter,
// standing still in a stance whose knees open AWAY from the root's forward, took a 25° thigh jump in one frame the first frame the
// layer solved his leg (the two-bone solve throws the knee toward the root's forward at any target weight), and jumped back when it
// stopped. A two-legged rig on a NullEngine: a still root, a "clip" whose knees turn out 40°, its ankle drifting a few mm a frame.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bone, Matrix, MeshBuilder, NullEngine, Quaternion, Scene, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';

const knob = vi.hoisted(() => ({ v: new Map<string, number>() }));
vi.mock('../../feel-panel/feel', () => ({ feel: (id: string, def: number) => knob.v.get(id) ?? def }));
import { mountFootPlanting, stepEngage, PLANT_ENGAGE_SEC } from './FootPlanting';

afterEach(() => knob.v.clear());

function rig() {
  const engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const scene = new Scene(engine);
  const root = new TransformNode('root', scene); root.rotationQuaternion = Quaternion.Identity();
  const sk = new Skeleton('sk', 'sk', scene);
  const nodes: Record<string, TransformNode> = {};
  const add = (name: string, parent: TransformNode, pos: [number, number, number], q: Quaternion) => {
    const n = new TransformNode(name, scene); n.parent = parent; n.position.set(...pos); n.rotationQuaternion = q.clone(); nodes[name] = n; return n;
  };
  const hips = add('Hips', root, [0, 0.88, 0], Quaternion.Identity());   // a crouched stance: the ankle ~5 cm above the root (planted)
  // the batting stance's knee: the thigh flexed, then turned OUT about the vertical (the knee toward the plate, not the root's forward)
  const thighQ = (sd: 'Left' | 'Right', t: number) => Quaternion.RotationAxis(Vector3.Up(), (sd === 'Left' ? 0.7 : -0.7))
    .multiply(Quaternion.RotationAxis(Vector3.Right(), -0.35 + 0.01 * Math.sin(t)));   // the thigh forward: the knee in FRONT
  for (const [sd, x] of [['Left', 0.1], ['Right', -0.1]] as const) {
    const up = add(`${sd}UpLeg`, hips, [x, -0.02, 0], thighQ(sd, 0));
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
  const knee = Quaternion.RotationAxis(Vector3.Right(), 0.7);
  let t = 0;
  const prev: Record<string, Quaternion> = {};
  let maxStepDeg = 0;
  /** one frame: the clip's pose (a breathing stance: the thigh sways 0.6° a cycle, the ankle a few mm), then the layer */
  const frame = () => {
    t += 0.35;
    for (const sd of ['Left', 'Right'] as const) { nodes[`${sd}UpLeg`].rotationQuaternion!.copyFrom(thighQ(sd, t)); nodes[`${sd}Leg`].rotationQuaternion!.copyFrom(knee); }
    for (const n of [root, ...Object.values(nodes)]) n.computeWorldMatrix(true);
    scene.onAfterAnimationsObservable.notifyObservers(scene);
    for (const sd of ['Left', 'Right']) {
      const q = nodes[`${sd}UpLeg`].rotationQuaternion!.clone();
      const p = prev[sd];
      if (p) { const d = 2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(p, q)))) * 180 / Math.PI; maxStepDeg = Math.max(maxStepDeg, d); }
      prev[sd] = q;
    }
  };
  return { frame, maxStep: () => maxStepDeg, planted: () => planting.debug.left.planted || planting.debug.right.planted,
    dispose: () => { planting.dispose(); scene.dispose(); engine.dispose(); } };
}

describe('FootPlanting: the solve engages over a blend', () => {
  it('stepEngage: 1/sec a second each way; a hard step at 0', () => {
    expect(stepEngage(0, true, 0.05, 0.1)).toBeCloseTo(0.5, 6);
    expect(stepEngage(1, false, 0.05, 0.1)).toBeCloseTo(0.5, 6);
    expect(stepEngage(0.9, true, 0.05, 0.1)).toBe(1);
    expect(stepEngage(0.3, true, 0.016, 0)).toBe(1);
    expect(stepEngage(0.3, false, 0.016, 0)).toBe(0);
    expect(PLANT_ENGAGE_SEC).toBe(0.1);
  });

  it('knob at 0 (the old layer): the still stance takes a one-frame thigh jump when the solve starts', () => {
    knob.v.set('anim.plantEngageSec', 0);
    const r = rig();
    for (let i = 0; i < 60; i++) r.frame();
    expect(r.planted()).toBe(true);
    expect(r.maxStep()).toBeGreaterThan(25);   // a hard pop (≥ 1500°/s at 60 fps): the rig's version of the batter's 25°
    r.dispose();
  });

  it('default: the same stance turns its thighs under half the pop threshold a frame (the 40° knee swing spread over the blend)', () => {
    const r = rig();
    for (let i = 0; i < 60; i++) r.frame();
    expect(r.planted()).toBe(true);
    expect(r.maxStep()).toBeLessThan(12.5);
    r.dispose();
  });
});
