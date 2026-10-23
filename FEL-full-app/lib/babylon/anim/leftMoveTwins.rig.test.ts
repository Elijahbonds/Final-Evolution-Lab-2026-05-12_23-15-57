// hoops-moves (owner 2026-10-20: "the spin from the left hand"). THE REAL SPIN BODY on the forge hero, NullEngine: the authored spin made
// right-handed on screen (rightHandHoops), then its left-hand twin (leftMoveTwins) — read from the geometry: at the spin's exit the ball
// hand out front is the athlete's RIGHT on `bball_spin` and his LEFT on `bball_spin_left`, the hands' laterals mirror, and the hips wind
// the other way through the plant.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { buildSpin } from './authored/basketball';
import { CharacterAnimator } from './CharacterAnimator';
import { rightHandHoops } from './hoopsHand';
import { leftMoveTwins, spinClipFor } from './leftMoveTwins';
import { rigHandOnSide } from './athleteSide';
import { boneNode } from './boneLookup';

let engine: NullEngine; let scene: Scene; let sk: Skeleton; let root: TransformNode; let animator: CharacterAnimator;
let made: string[] = [];
beforeAll(async () => {
  engine = new NullEngine();
  scene = new Scene(engine);
  new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const b64 = readFileSync('public/models/fel-hero.glb').toString('base64');
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0]; root = r.meshes[0] as TransformNode;
  root.scaling.setAll(1);   // the spawn's reset: the runtime's mirrored body
  animator = new CharacterAnimator(scene, [buildSpin(scene, sk)!]);
  rightHandHoops(animator, sk);
  made = leftMoveTwins(animator, sk);
}, 120000);
afterAll(() => { scene?.dispose(); engine?.dispose(); });

const groups = () => (animator as unknown as { groups: Map<string, AnimationGroup> }).groups;
const local = (p: Vector3): Vector3 => { root.computeWorldMatrix(true); return p.subtract(root.getAbsolutePosition()).applyRotationQuaternion(Quaternion.Inverse(root.absoluteRotationQuaternion)); };
const at = (rig: string): Vector3 => { const n = boneNode(sk, rig)!; n.computeWorldMatrix(true); return local(n.getAbsolutePosition()); };
/** The pose at k (0..1) of a clip: each athlete hand in the body's frame (x = his right, z forward), and the hips' yaw (deg). */
function pose(name: string, k: number) {
  for (const g of groups().values()) g.stop();
  const g = groups().get(name)!;
  g.start(false, 1); g.goToFrame(g.from + (g.to - g.from) * k); g.pause();
  scene.render();
  const hips = boneNode(sk, 'Hips')!; hips.computeWorldMatrix(true);
  const f = Vector3.TransformNormal(new Vector3(0, 0, 1), hips.getWorldMatrix());
  const rf = local(root.getAbsolutePosition().add(f));
  return { right: at(rigHandOnSide(sk, root, 'right')), left: at(rigHandOnSide(sk, root, 'left')), hipYaw: Math.atan2(rf.x, rf.z) * 180 / Math.PI };
}

describe('the spin from the left hand: bball_spin_left, the right-handed spin mirrored', () => {
  it('is made once, at spawn, and only from a right-handed source (idempotent)', () => {
    expect(made).toEqual(['bball_spin_left']);
    expect(leftMoveTwins(animator, sk)).toEqual([]);
    expect(spinClipFor({ hand: 'Left', move: null }, animator)).toBe('bball_spin_left');
    expect(spinClipFor({ hand: 'Right', move: null }, animator)).toBe('bball_spin');
  });
  it('the exit: the ball hand out front is the right on bball_spin and the LEFT on the twin — the hands\' laterals mirror', () => {
    const r = pose('bball_spin', 1), l = pose('bball_spin_left', 1);
    expect(r.right.z - r.left.z, 'right spin: the right hand leads').toBeGreaterThan(0.08);
    expect(l.left.z - l.right.z, 'left spin: the left hand leads').toBeGreaterThan(0.08);
    expect(l.left.x).toBeCloseTo(-r.right.x, 1); expect(l.right.x).toBeCloseTo(-r.left.x, 1);
  });
  it('the plant: the hips wind the other way', () => {
    const r = pose('bball_spin', 0.34 / 0.6), l = pose('bball_spin_left', 0.34 / 0.6), r0 = pose('bball_spin', 0), l0 = pose('bball_spin_left', 0);
    const wr = r.hipYaw - r0.hipYaw, wl = l.hipYaw - l0.hipYaw;
    expect(Math.abs(wr)).toBeGreaterThan(8);
    expect(Math.sign(wl)).toBe(-Math.sign(wr));
    expect(wl).toBeCloseTo(-wr, 0);
  });
});
