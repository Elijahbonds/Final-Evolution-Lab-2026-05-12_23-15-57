// hoops-handle (2026-10-17): a node rig for the hoops carry — two arms hanging, two legs, MIRRORED the way the runtime hoops bodies are
// (the rig's LEFT arm on the root's +x, the athlete's right; the root turned π to face −z) — and the frame the modes run (the mode's
// update, the after-animations pass, the camera's before-render, the after-render). The same rig ballCarry.moves.test builds, here so the
// ball-hand tests share one. `clip` (optional) is the stand-in clip: called before every pass, the way an animation group poses the arm.
import { Bone, Matrix, MeshBuilder, NullEngine, Quaternion, Scene, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';
import type { AbstractMesh } from '@babylonjs/core';
import { mountBallCarry, type BallCarry } from '../../lib/babylon/anim/ballCarry';
import { attachBallToHand } from '../../lib/babylon/anim/ballRig';

export interface HoopsNodeRig {
  scene: Scene; root: TransformNode; sk: Skeleton; ball: AbstractMesh; nodes: Record<string, TransformNode>; carry: BallCarry;
  /** One frame: the carry ticked at `speed01`, the passes run; the ball's world position after it. */
  frame(dt: number, speed01: number, active?: boolean): Vector3;
  /** A world point in the root's frame (x = the athlete's right, z forward, y up). */
  local(p: Vector3): Vector3;
  /** The repo's PALM read (ballCarry.movesRig.test): a hand bone to the ball's centre, less the palm-held 0.15 m — per athlete hand. */
  palm(): { right: number; left: number };
  dispose(): void;
}

/** `startHand`: the athlete's hand the ball starts in (the rig's LeftHand is drawn on his right). */
/** `armScale` lengthens the forearm and the hand (1: the rig's 0.54 m arm, its hand hanging at ~0.93 m — a real hero's hangs at 0.86). */
export function hoopsNodeRig(startHand: 'right' | 'left' = 'right', clip?: (nodes: Record<string, TransformNode>) => void, armScale = 1): HoopsNodeRig {
  const scene = new Scene(new NullEngine());
  const root = new TransformNode('root', scene);
  root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI);
  const sk = new Skeleton('sk', 'sk', scene);
  const nodes: Record<string, TransformNode> = {};
  const add = (name: string, parent: TransformNode, pos: [number, number, number], q = Quaternion.Identity()) => {
    const n = new TransformNode(name, scene); n.parent = parent; n.position.set(...pos); n.rotationQuaternion = q; nodes[name] = n; return n;
  };
  const hips = add('Hips', root, [0, 0.95, 0]);
  const spine = add('Spine2', hips, [0, 0.4, 0]);
  for (const [sd, x] of [['Left', 0.18], ['Right', -0.18]] as const) {
    const sh = add(`${sd}Arm`, spine, [x, 0.1, 0], Quaternion.RotationAxis(new Vector3(0, 0, 1), x > 0 ? 0.2 : -0.2));
    const el = add(`${sd}ForeArm`, sh, [0.02 * Math.sign(x), -0.28 * armScale, 0], Quaternion.RotationAxis(Vector3.Right(), 0.4));
    add(`${sd}Hand`, el, [0, -0.26 * armScale, 0]);
    const up = add(`${sd}UpLeg`, hips, [x * 0.55, -0.05, 0]);
    const kn = add(`${sd}Leg`, up, [0, -0.42, 0]);
    add(`${sd}Foot`, kn, [0, -0.4, 0]);
  }
  let parentBone: Record<string, Bone | null> = {};
  for (const n of Object.values(nodes)) {
    const pb = parentBone[(n.parent as TransformNode).name] ?? null;
    const b = new Bone(n.name, sk, pb, Matrix.Identity()); b.linkTransformNode(n); parentBone = { ...parentBone, [n.name]: b };
  }
  for (const n of [root, ...Object.values(nodes)]) n.computeWorldMatrix(true);
  const ball = MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, scene);
  (ball.metadata ??= {}).felPalmMirrorLeft = true;
  attachBallToHand(ball, sk, startHand === 'right' ? 'LeftHand' : 'RightHand');
  const bind = new Map(Object.values(nodes).map((n) => [n, n.rotationQuaternion!.clone()] as const));
  const clipObs = scene.onBeforeAnimationsObservable.add(() => { for (const [n, q] of bind) n.rotationQuaternion!.copyFrom(q); clip?.(nodes); });
  const carry = mountBallCarry({ scene, ball, root, skeleton: sk, hoops: true });
  const local = (p: Vector3): Vector3 => { root.computeWorldMatrix(true); return p.subtract(root.getAbsolutePosition()).applyRotationQuaternion(Quaternion.Inverse(root.rotationQuaternion!)); };
  const frame = (dt: number, speed01: number, active = true): Vector3 => {
    carry.update(dt, speed01, active);
    scene.onBeforeAnimationsObservable.notifyObservers(scene);
    scene.onAfterAnimationsObservable.notifyObservers(scene);
    scene.onBeforeCameraRenderObservable.notifyObservers(scene.activeCamera as never);
    scene.onAfterRenderObservable.notifyObservers(scene);
    ball.computeWorldMatrix(true);
    return ball.getAbsolutePosition().clone();
  };
  const palm = () => {
    ball.computeWorldMatrix(true); const b = ball.getAbsolutePosition();
    const d = (n: TransformNode) => { n.computeWorldMatrix(true); return Vector3.Distance(n.getAbsolutePosition(), b) - 0.15; };
    return { right: d(nodes.LeftHand), left: d(nodes.RightHand) };   // the rig's LeftHand is the athlete's right
  };
  return { scene, root, sk, ball, nodes, carry, frame, local, palm, dispose: () => { carry.dispose(); scene.onBeforeAnimationsObservable.remove(clipObs); scene.dispose(); } };
}
