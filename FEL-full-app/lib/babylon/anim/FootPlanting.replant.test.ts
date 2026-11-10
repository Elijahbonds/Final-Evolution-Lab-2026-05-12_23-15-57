// GAMEPLAY-CLEAN P5 — A FOOT THAT PLANTS AGAIN CARRIES ITS RELEASE THROUGH (FootPlanting, PLANT_REPLANT_EASE_ON / feel
// `anim.plantReplantEase`). P4's rotation release was ENDED on the spot by a replant, and it had zeroed the engage: the leg jumped the
// rest of the way from the held pose to the clip in one frame. A stance foot sliding to the drift limit is let go there and — low and
// still — planted again on the next frame, so a body sliding in a stance popped a thigh at every release.
// A two-legged rig on a NullEngine: a "clip" stance with its knees turned out 40° (the knee off the root's forward, so the pinned solve
// and the clip disagree by tens of degrees), the root sliding at a steady speed: plant, drift to the limit, release, replant, again.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bone, Matrix, MeshBuilder, NullEngine, Quaternion, Scene, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';

const knob = vi.hoisted(() => ({ v: new Map<string, number>() }));
vi.mock('../../feel-panel/feel', () => ({ feel: (id: string, def: number) => knob.v.get(id) ?? def }));
import { mountFootPlanting, PLANT_REPLANT_EASE_ON } from './FootPlanting';

afterEach(() => knob.v.clear());

const ang = (a: Quaternion, b: Quaternion) => 2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(a, b)))) * 180 / Math.PI;

/** Slide the stance for `frames` at `speed` m/s along `dir`; the largest one-frame thigh turn after the first engage has settled,
 *  the releases seen, how many of them were followed by a replant on the very next frame, and the thigh once the slide has stopped. */
function slide(speed: number, dir: [number, number], frames = 400) {
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
  const thighQ = (sd: 'Left' | 'Right') => Quaternion.RotationAxis(Vector3.Up(), sd === 'Left' ? 0.7 : -0.7).multiply(Quaternion.RotationAxis(Vector3.Right(), -0.35));
  const kneeQ = Quaternion.RotationAxis(Vector3.Right(), 0.7);
  for (const [sd, x] of [['Left', 0.1], ['Right', -0.1]] as const) {
    const up = add(`${sd}UpLeg`, hips, [x, -0.02, 0], thighQ(sd));
    const kn = add(`${sd}Leg`, up, [0, -0.44, 0], kneeQ);
    add(`${sd}Foot`, kn, [0, -0.42, 0], Quaternion.Identity());
  }
  let parentBone: Record<string, Bone | null> = {};
  for (const n of Object.values(nodes)) {
    const pb = parentBone[(n.parent as TransformNode).name] ?? null;
    const b = new Bone(n.name, sk, pb, Matrix.Identity()); b.linkTransformNode(n); parentBone = { ...parentBone, [n.name]: b };
  }
  const mesh = MeshBuilder.CreateBox('body', { size: 0.1 }, scene); mesh.parent = root;
  const planting = mountFootPlanting(scene, mesh, sk, { root });
  let prev: Quaternion | null = null, maxStep = 0, releases = 0, replantsNext = 0, was = false, sinceRelease = 99, plantedFrames = 0;
  const frame = (move: boolean) => {
    if (move) { root.position.x += dir[0] * speed / 60; root.position.z += dir[1] * speed / 60; }
    for (const sd of ['Left', 'Right'] as const) { nodes[`${sd}UpLeg`].rotationQuaternion!.copyFrom(thighQ(sd)); nodes[`${sd}Leg`].rotationQuaternion!.copyFrom(kneeQ); }
    for (const n of [root, ...Object.values(nodes)]) n.computeWorldMatrix(true);
    scene.onAfterAnimationsObservable.notifyObservers(scene);
  };
  for (let i = 0; i < frames; i++) {
    frame(true);
    const now = planting.debug.left.planted;
    if (was && !now) { releases++; sinceRelease = 0; } else sinceRelease++;
    if (!was && now && sinceRelease === 1) replantsNext++;
    was = now; if (now) plantedFrames++;
    const q = nodes.LeftUpLeg.rotationQuaternion!.clone();
    if (prev && i > 30) maxStep = Math.max(maxStep, ang(prev, q));
    prev = q;
  }
  // the root stops: whatever release was in flight runs out, and the leg rests where the plant holds it
  for (let i = 0; i < 60; i++) frame(false);
  const end = nodes.LeftUpLeg.rotationQuaternion!.clone();
  planting.dispose(); scene.dispose(); engine.dispose();
  return { maxStep, releases, replantsNext, plantedFrames, end };
}

describe('FootPlanting: a replant carries the release through', () => {
  it('the default is on', () => { expect(PLANT_REPLANT_EASE_ON).toBe(1); });

  it('the run is what it claims: the stance slides to the drift limit, is let go, and plants again on the next frame, many times', () => {
    const r = slide(1.5, [0, 1]);
    expect(r.releases).toBeGreaterThan(10);
    expect(r.replantsNext).toBeGreaterThan(10);
    expect(r.plantedFrames).toBeGreaterThan(300);
  });

  it('knob at 0 (as P4 shipped): the thigh takes a hard one-frame jump at a release that replants', () => {
    for (const [speed, dir] of [[0.5, [1, 0]], [1.5, [0, 1]], [3, [0, 1]]] as [number, [number, number]][]) {
      knob.v.set('anim.plantReplantEase', 0);
      const r = slide(speed, dir);
      expect(r.maxStep, `speed ${speed}`).toBeGreaterThan(25);   // ≥ 1500°/s at 60 fps: a hard pop (33° measured)
    }
  });

  it('default: the same slides turn the thigh under half the pop threshold a frame, and the plant count is unchanged', () => {
    for (const [speed, dir] of [[0.5, [1, 0]], [1.5, [0, 1]], [1.5, [1, 0]], [3, [0, 1]]] as [number, [number, number]][]) {
      const now = slide(speed, dir);
      knob.v.set('anim.plantReplantEase', 0); const old = slide(speed, dir); knob.v.clear();
      expect(now.maxStep, `speed ${speed} dir ${dir}`).toBeLessThan(12.5);
      expect(now.maxStep, `speed ${speed} dir ${dir}`).toBeLessThan(old.maxStep * 0.4);
      expect(now.releases).toBe(old.releases);            // the contact logic is untouched: the same plants and releases
      expect(now.plantedFrames).toBe(old.plantedFrames);
    }
  });

  it('only the ease differs: once the slide stops and the release has run out, the leg rests exactly where the old layer put it', () => {
    for (const [speed, dir] of [[0.5, [1, 0]], [1.5, [0, 1]], [3, [0, 1]]] as [number, [number, number]][]) {
      const now = slide(speed, dir);
      knob.v.set('anim.plantReplantEase', 0); const old = slide(speed, dir); knob.v.clear();
      expect(ang(now.end, old.end), `speed ${speed}`).toBeLessThan(1e-3);
    }
  });

  it('with P4\'s release off (anim.plantReleaseSec 0) the knob changes nothing: no release is ever in flight', () => {
    knob.v.set('anim.plantReleaseSec', 0);
    const a = slide(1.5, [0, 1]);
    knob.v.set('anim.plantReplantEase', 0);
    const b = slide(1.5, [0, 1]);
    expect(a.maxStep).toBe(b.maxStep);
  });
});
