// HOOPS MOTION phase 3d (S30): ONE LEG-IK WRITER DURING A PLANT. The plant-and-cut lock (basketballTree.FootPlant) and the foot-planting layer
// (FootPlanting, on every spawned body) both solved the planted leg on every frame of the lock, each to its own pin, and the foot left the
// lock's pin for the layer's in one frame when the lock ran out. The lock claims its leg now; the layer stands off and takes the foot over
// from the lock's pin. A two-legged rig on a NullEngine, its "clip" re-posing the legs every frame while the root skates forward.
import { describe, expect, it } from 'vitest';
import { Bone, Matrix, MeshBuilder, NullEngine, Quaternion, Scene, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';
import { mountFootPlanting, claimLeg, releaseLeg, legClaimed } from './FootPlanting';
import { FootPlant } from './basketballTree';

function rig() {
  const engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const scene = new Scene(engine);
  const root = new TransformNode('root', scene); root.rotationQuaternion = Quaternion.Identity();
  const sk = new Skeleton('sk', 'sk', scene);
  const nodes: Record<string, TransformNode> = {};
  const clipQ: Record<string, Quaternion> = {};
  const add = (name: string, parent: TransformNode, pos: [number, number, number], q: Quaternion) => {
    const n = new TransformNode(name, scene); n.parent = parent; n.position.set(...pos); n.rotationQuaternion = q.clone(); nodes[name] = n; clipQ[name] = q.clone(); return n;
  };
  const hips = add('Hips', root, [0, 0.93, 0], Quaternion.Identity());
  for (const [sd, x] of [['Left', 0.1], ['Right', -0.1]] as const) {
    const up = add(`${sd}UpLeg`, hips, [x, -0.02, 0], Quaternion.RotationAxis(Vector3.Right(), 0.2));
    const kn = add(`${sd}Leg`, up, [0, -0.44, 0], Quaternion.RotationAxis(Vector3.Right(), -0.4));
    add(`${sd}Foot`, kn, [0, -0.42, 0], Quaternion.Identity());
  }
  let parentBone: Record<string, Bone | null> = {};
  for (const n of Object.values(nodes)) {
    const pb = parentBone[(n.parent as TransformNode).name] ?? null;
    const b = new Bone(n.name, sk, pb, Matrix.Identity()); b.linkTransformNode(n); parentBone = { ...parentBone, [n.name]: b };
  }
  const mesh = MeshBuilder.CreateBox('body', { size: 0.1 }, scene); mesh.parent = root;
  const planting = mountFootPlanting(scene, mesh, sk, { root });
  /** the clip's pose (both legs, every frame), then the after-animations pass (the layer, then a lock if one is planted) */
  const frame = (step = 0.004) => {
    root.position.z += step;   // the root skates forward under a clip whose feet stay put in its own frame
    for (const [n, q] of Object.entries(clipQ)) nodes[n].rotationQuaternion!.copyFrom(q);
    for (const n of [root, ...Object.values(nodes)]) n.computeWorldMatrix(true);
    scene.onAfterAnimationsObservable.notifyObservers(scene);
    for (const n of Object.values(nodes)) n.computeWorldMatrix(true);
  };
  const ankle = (sd: 'Left' | 'Right') => nodes[`${sd}Foot`].getAbsolutePosition().clone();
  const legAsClip = (sd: 'Left' | 'Right') => Math.abs(Quaternion.Dot(nodes[`${sd}UpLeg`].rotationQuaternion!, clipQ[`${sd}UpLeg`])) > 0.99999
    && Math.abs(Quaternion.Dot(nodes[`${sd}Leg`].rotationQuaternion!, clipQ[`${sd}Leg`])) > 0.99999;
  return { scene, sk, mesh, planting, frame, ankle, legAsClip, dispose: () => { planting.dispose(); scene.dispose(); engine.dispose(); } };
}

describe('S30: one leg-IK writer during a plant', () => {
  it('the layer pins a planted foot against a skating root (the baseline it had)', () => {
    const r = rig();
    for (let i = 0; i < 3; i++) r.frame();
    const at = r.ankle('Left');
    for (let i = 0; i < 10; i++) r.frame();
    expect(Math.hypot(r.ankle('Left').x - at.x, r.ankle('Left').z - at.z)).toBeLessThan(0.005);   // held while the root moved 4 cm
    expect(r.legAsClip('Left')).toBe(false);
    r.dispose();
  });
  it('a claimed leg is left to its claimant (the other leg is still pinned), and the claim\'s end hands the foot over from the claim\'s pin', () => {
    const r = rig();
    for (let i = 0; i < 12; i++) r.frame();
    const pin = r.ankle('Left').add(new Vector3(0.03, 0, -0.02));   // the lock's own pin: not where the layer holds the foot
    claimLeg(r.sk, 'Left', pin);
    expect(legClaimed(r.sk, 'Left')).toBe(true);
    for (let i = 0; i < 10; i++) {
      r.frame();
      expect(r.legAsClip('Left')).toBe(true);    // HEAD: the layer solved this leg too, every frame of the lock
      expect(r.legAsClip('Right')).toBe(false);  // the unclaimed leg is still the layer's
    }
    releaseLeg(r.sk, 'Left');
    r.frame();   // the handover: the layer takes the foot from the lock's pin (still planted in the clip), not from its own old pin
    expect(Math.hypot(r.ankle('Left').x - pin.x, r.ankle('Left').z - pin.z)).toBeLessThan(0.005);
    const next = r.ankle('Left'); r.frame();
    expect(Vector3.Distance(r.ankle('Left'), next)).toBeLessThan(0.01);   // and it holds it there
    r.dispose();
  });
  it('FootPlant (the dribbler\'s plant-and-cut lock) claims the leg it pins for its window and releases it', () => {
    const r = rig();
    for (let i = 0; i < 6; i++) r.frame();
    const lock = new FootPlant(r.sk, r.mesh as never);
    lock.plant();
    const side = legClaimed(r.sk, 'Left') ? 'Left' : 'Right';
    expect(legClaimed(r.sk, side)).toBe(true);
    const held = r.ankle(side);
    for (let i = 0; i < 8; i++) { r.frame(); lock.update(1 / 60); }
    expect(Math.hypot(r.ankle(side).x - held.x, r.ankle(side).z - held.z)).toBeLessThan(0.005);   // the lock holds it in the world
    for (let i = 0; i < 12; i++) { r.frame(); lock.update(1 / 60); }   // past PLANT_LOCK_SEC
    expect(lock.active).toBe(false);
    expect(legClaimed(r.sk, side)).toBe(false);
    lock.dispose();
    r.dispose();
  });
});
