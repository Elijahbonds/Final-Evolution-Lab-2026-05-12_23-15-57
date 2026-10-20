// hoops-handle (owner 2026-10-17: "The model only dribbles right handed, let's fix that. It needs to perform real crossovers"). THE REAL
// BASKETBALL TREE on the forge hero, NullEngine: the idle dribble built for this body, mirrored right-handed (rightHandHoops), its
// left-hand twin made at spawn (leftDribbleTwins), a real CharacterAnimator and BasketballAnimTree, the hoops carry — fed each frame
// the way the modes feed them (the tree told the carry's hand). Read from the geometry: a crossover takes the ball across the body to the
// other hand, the tree plays the loop's `_left` twin, the dribble STAYS there, and at every touch the palm on the ball is the left one.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, MeshBuilder, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { buildDribbleIdle } from './authored/basketball';
import { CharacterAnimator } from './CharacterAnimator';
import { BasketballAnimTree, type AnimTreeInput } from './basketballTree';
import { rightHandHoops, leftDribbleTwins } from './hoopsHand';
import { mountBallCarry, type BallCarry } from './ballCarry';
import { attachBallToHand } from './ballRig';
import { rigHandOnSide } from './athleteSide';
import { boneNode } from './boneLookup';

let engine: NullEngine; let scene: Scene; let sk: Skeleton; let root: TransformNode;
let animator: CharacterAnimator; let tree: BasketballAnimTree; let carry: BallCarry; let ball: AbstractMesh;
beforeAll(async () => {
  engine = new NullEngine(); (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  scene = new Scene(engine);
  new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const b64 = readFileSync('public/models/fel-hero.glb').toString('base64');
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0]; root = r.meshes[0] as TransformNode;
  root.scaling.setAll(1);   // the spawn's reset: the runtime's mirrored body
  const idle = buildDribbleIdle(scene, sk)!;
  animator = new CharacterAnimator(scene, [idle]);
  rightHandHoops(animator, sk);
  expect(leftDribbleTwins(animator, sk)).toEqual(['bball_dribble_idle_left']);
  tree = new BasketballAnimTree(animator);
  ball = MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, scene);
  (ball.metadata ??= {}).felPalmMirrorLeft = true;
  attachBallToHand(ball, sk, rigHandOnSide(sk, root, 'right'));
  carry = mountBallCarry({ scene, ball, root, skeleton: sk, hoops: true });
}, 120000);
afterAll(() => { carry?.dispose(); scene?.dispose(); engine?.dispose(); });

const IDLE: AnimTreeInput = { speed01: 0, speedMps: 0, crossover: false, hasBall: true, shooting: false, dunking: false, driving: false, defending: false, bracing: false, staggered: false, nearestDefender: 9 };
/** The body's frame: x = the athlete's right (the root's +x, which rigHandOnSide reads), z forward. */
const local = (p: Vector3): Vector3 => { root.computeWorldMatrix(true); return p.subtract(root.getAbsolutePosition()).applyRotationQuaternion(Quaternion.Inverse(root.absoluteRotationQuaternion)); };
const at = (rig: string): Vector3 => { const n = boneNode(sk, rig)!; n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); };
interface Frame { ball: Vector3; palm: { right: number; left: number }; clip: string }
function frame(): Frame {
  tree.update({ ...IDLE, ballHand: carry.hand === 'Left' ? 'left' : 'right', moveActive: !!carry.move });
  carry.update(1 / 60, 0, true);
  scene.render();
  ball.computeWorldMatrix(true);
  const b = ball.getAbsolutePosition().clone();
  const rR = rigHandOnSide(sk, root, 'right'), rL = rigHandOnSide(sk, root, 'left');
  return { ball: local(b), palm: { right: Vector3.Distance(at(rR), b) - 0.15, left: Vector3.Distance(at(rL), b) - 0.15 }, clip: (animator as unknown as { currentName: string }).currentName };
}

describe('the real basketball tree, the forge hero: a crossover to the left hand, and the dribble stays there', () => {
  it('right hand first (the natural hand), then a crossover: the ball crosses low, the tree plays the left twin, the left palm takes every touch', () => {
    const before: Frame[] = []; for (let i = 0; i < 90; i++) before.push(frame());
    expect(carry.hand).toBe('Right');
    expect(before.at(-1)!.clip).toBe('bball_dribble_idle');
    const lowsR = before.filter((f, i) => i > 0 && i < before.length - 1 && f.ball.y < before[i - 1].ball.y && f.ball.y <= before[i + 1].ball.y);
    expect(lowsR.length).toBeGreaterThan(0);
    for (const f of lowsR) expect(f.ball.x, 'a right-hand bounce on his right').toBeGreaterThan(0.15);
    // wait for the stroke's top, then cross
    let n = 0; while (n++ < 120 && carry.phase > 0.04) frame();
    expect(carry.runMove('crossover')).toBe(true);
    const cross: Frame[] = []; while (carry.move && cross.length < 120) cross.push(frame());
    expect(carry.move).toBeNull();
    expect(carry.hand).toBe('Left');
    const floor = cross.reduce((a, f) => (f.ball.y < a.ball.y ? f : a));
    expect(Math.abs(floor.ball.x), 'the crossing bounce lands by the midline').toBeLessThan(0.1);
    expect(floor.ball.y).toBeLessThan(0.2);
    const after: Frame[] = []; for (let i = 0; i < 240; i++) after.push(frame());
    expect(carry.hand, 'no input: the ball stays in the left hand').toBe('Left');
    expect(after.at(-1)!.clip, 'the tree plays the loop\'s left twin').toBe('bball_dribble_idle_left');
    const lowsL = after.filter((f, i) => i > 0 && i < after.length - 1 && f.ball.y < after[i - 1].ball.y && f.ball.y <= after[i + 1].ball.y);
    expect(lowsL.length).toBeGreaterThanOrEqual(4);
    for (const f of lowsL) expect(f.ball.x, 'a left-hand bounce on his left').toBeLessThan(-0.15);
    // at every touch (a palm within 5 cm of the held palm) it is the LEFT palm, and the right hand is well off the ball
    const touches = after.filter((f) => Math.min(f.palm.left, f.palm.right) < 0.05);
    expect(touches.length).toBeGreaterThan(20);
    for (const f of touches) { expect(f.palm.left).toBeLessThan(f.palm.right); expect(f.palm.right).toBeGreaterThan(0.2); }
    // and back: a second crossover, the right hand and the right loop again
    n = 0; while (n++ < 120 && carry.phase > 0.04) frame();
    expect(carry.runMove('crossover')).toBe(true);
    while (carry.move) frame();
    const back: Frame[] = []; for (let i = 0; i < 120; i++) back.push(frame());
    expect(carry.hand).toBe('Right'); expect(back.at(-1)!.clip).toBe('bball_dribble_idle');
  });
});
