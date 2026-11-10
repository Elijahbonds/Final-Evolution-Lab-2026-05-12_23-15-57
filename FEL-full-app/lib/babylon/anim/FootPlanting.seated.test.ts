// GAMEPLAY-CLEAN P5 — A SEATED BODY HOLDS NO PIN (FootPlanting, setPlantingSeated / PLANT_SEATED_OFF_ON / feel `anim.plantSeatedOff`).
// Aero Aces' pilot sits in the cockpit with his ankles at the root's height, so the layer read his feet as down and pinned them to
// the world while the plane flew on (the rig: knees 51–63° in a frame; none with ?noplant=1). A two-legged rig on a NullEngine, sitting
// (thighs forward, shins down, the ankles ~5 cm over the root), carried level at 15 m/s with a gentle bank.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bone, Matrix, MeshBuilder, NullEngine, Quaternion, Scene, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';

const knob = vi.hoisted(() => ({ v: new Map<string, number>() }));
vi.mock('../../feel-panel/feel', () => ({ feel: (id: string, def: number) => knob.v.get(id) ?? def }));
import { mountFootPlanting, setPlantingSeated, PLANT_SEATED_OFF_ON } from './FootPlanting';

afterEach(() => knob.v.clear());
const ang = (a: Quaternion, b: Quaternion) => 2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(a, b)))) * 180 / Math.PI;

function fly(opts: { seated: boolean; mps: number; plantFirst?: boolean }) {
  const engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const scene = new Scene(engine);
  const root = new TransformNode('root', scene); root.rotationQuaternion = Quaternion.Identity();
  const sk = new Skeleton('sk', 'sk', scene);
  const nodes: Record<string, TransformNode> = {};
  const add = (name: string, parent: TransformNode, pos: [number, number, number], q: Quaternion) => {
    const n = new TransformNode(name, scene); n.parent = parent; n.position.set(...pos); n.rotationQuaternion = q.clone(); nodes[name] = n; return n;
  };
  const hips = add('Hips', root, [0, 0.5, 0], Quaternion.Identity());   // sitting: the hips 0.5 m over the root
  const thighQ = Quaternion.RotationAxis(Vector3.Right(), -1.45), shinQ = Quaternion.RotationAxis(Vector3.Right(), 1.45);
  for (const [sd, x] of [['Left', 0.1], ['Right', -0.1]] as const) {
    const up = add(`${sd}UpLeg`, hips, [x, -0.02, 0], thighQ);
    const kn = add(`${sd}Leg`, up, [0, -0.44, 0], shinQ);
    add(`${sd}Foot`, kn, [0, -0.42, 0], Quaternion.Identity());
  }
  let parentBone: Record<string, Bone | null> = {};
  for (const n of Object.values(nodes)) {
    const pb = parentBone[(n.parent as TransformNode).name] ?? null;
    const b = new Bone(n.name, sk, pb, Matrix.Identity()); b.linkTransformNode(n); parentBone = { ...parentBone, [n.name]: b };
  }
  const mesh = MeshBuilder.CreateBox('body', { size: 0.1 }, scene); mesh.parent = root;
  const planting = mountFootPlanting(scene, mesh, sk, { root });
  const frame = (i: number, move: boolean) => {
    if (move) { root.position.z += opts.mps / 60; root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Forward(), 0.2 * Math.sin(i / 40)); }
    for (const sd of ['Left', 'Right']) { nodes[`${sd}UpLeg`].rotationQuaternion!.copyFrom(thighQ); nodes[`${sd}Leg`].rotationQuaternion!.copyFrom(shinQ); }
    for (const n of [root, ...Object.values(nodes)]) n.computeWorldMatrix(true);
    scene.onAfterAnimationsObservable.notifyObservers(scene);
  };
  let i = 0;
  if (opts.plantFirst) for (; i < 20; i++) frame(i, false);   // parked on the grid: the feet plant
  const plantedAtStart = planting.debug.left.planted;
  if (opts.seated) setPlantingSeated(sk, true);
  let prev = [nodes.LeftUpLeg, nodes.LeftLeg].map((n) => n.rotationQuaternion!.clone()), maxStep = 0, planted = 0;
  for (let k = 0; k < 240; k++, i++) {
    frame(i, true);
    if (planting.debug.left.planted || planting.debug.right.planted) planted++;
    const now = [nodes.LeftUpLeg, nodes.LeftLeg].map((n) => n.rotationQuaternion!.clone());
    maxStep = Math.max(maxStep, ...now.map((q, j) => ang(q, prev[j]))); prev = now;
  }
  const endOff = ang(nodes.LeftLeg.rotationQuaternion!, shinQ);
  planting.dispose(); scene.dispose(); engine.dispose();
  return { maxStep, planted, plantedAtStart, endOff };
}

describe('FootPlanting: a seated body holds no pin', () => {
  it('the default is on', () => { expect(PLANT_SEATED_OFF_ON).toBe(1); });

  it('control: unmarked (as the pilot was), the seated feet plant in flight and the legs leave the pose', () => {
    const now = fly({ seated: false, mps: 15 });
    knob.v.set('anim.plantReplantEase', 0); knob.v.set('anim.plantReleaseSec', 0); knob.v.set('anim.plantEngageSec', 0);
    const old = fly({ seated: false, mps: 15 });   // the planter before clean-3/4/5 (what aero shipped with until P3)
    console.log(`seated, unmarked: legs ${now.maxStep.toFixed(1)}°/frame, planted ${now.planted} frames; pre-P3 planter ${old.maxStep.toFixed(1)}°/frame`);
    // pinned in flight, and the legs pulled off the pose clip 12–19° a frame (this level rig; the plane's rolls and loops in play read
    // 51–63°, the rig's number — §4g). The marked body below: no pin, under 1°.
    for (const r of [now, old]) { expect(r.planted).toBeGreaterThan(20); expect(r.maxStep).toBeGreaterThan(10); }
  });

  it('knob at 0: the mark is ignored — exactly the unmarked layer', () => {
    knob.v.set('anim.plantSeatedOff', 0);
    const a = fly({ seated: true, mps: 15 });
    knob.v.clear();
    const b = fly({ seated: false, mps: 15 });
    expect(a).toEqual(b);
  });

  it('marked seated: no pin in flight, the legs stay on the pose clip', () => {
    const r = fly({ seated: true, mps: 15 });
    expect(r.planted).toBe(0);
    expect(r.maxStep).toBeLessThan(1);
    expect(r.endOff).toBeLessThan(0.01);
  });

  it('marked while a foot is planted (parked on the grid): the pin is let go through the release, no snap', () => {
    const r = fly({ seated: true, mps: 15, plantFirst: true });
    expect(r.plantedAtStart).toBe(true);
    expect(r.planted).toBe(0);
    expect(r.maxStep).toBeLessThan(12.5);
    expect(r.endOff).toBeLessThan(0.01);
  });
});
