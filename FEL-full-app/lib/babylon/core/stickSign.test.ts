// HOOPS MOTION phase 4b (plan G12, U10 / S31) — THE LEFT-STICK CUT'S SIDE IS ONE VALUE. Facing the rim and facing the camera, at both
// baskets' orientations: the cut's side (sideOfVector against the facing BEFORE the cut) = the clip's side = the carry's end hand. Phase 3
// read the clip's side off the defender (sideAwayFrom) and 3v3's tree off the wish's WORLD x, while the carry took the cut's: two frames,
// two answers (S31). The renderer (anim/handleMotion) takes the cut's side as the reversal's end side; the carry plays it.
import { describe, expect, it } from 'vitest';
import { Bone, Matrix, MeshBuilder, NullEngine, Quaternion, Scene, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';
import { sideOfVector, athleteRight } from '../anim/athleteSide';
import { requestMove, type HandleHost } from '../anim/handleMotion';
import { mountBallCarry } from '../anim/ballCarry';
import { attachBallToHand } from '../anim/ballRig';
import { rigHandOnSide } from '../anim/athleteSide';

/** Facing yaws: toward one basket (−z) and the other (+z), side-on both ways — each also "facing the camera" (the yaw + π). */
const FACINGS = [Math.PI, 0, Math.PI / 2, -Math.PI / 2, 0.6, Math.PI + 0.6];
/** A cut 60–80° off the facing to one side (a crossover's reversal), in the world's plane. */
const cutOf = (yaw: number, side: 1 | -1, deg = 70): { x: number; z: number } => { const a = yaw + side * (deg * Math.PI) / 180; return { x: Math.sin(a), z: Math.cos(a) }; };

describe('G12 — the left-stick cut\'s side = the clip\'s side = the carry\'s end hand (both baskets, facing the rim or the camera)', () => {
  it('the renderer names the clip and ends the ball on the cut\'s side, from either hand (a crossing, or its same-hand twin)', () => {
    for (const yaw of FACINGS) for (const s of [1, -1] as const) for (const hand of ['Right', 'Left'] as const) {
      const cut = cutOf(yaw, s), cutSide = sideOfVector(yaw, cut);
      // the side really is the athlete's side of the cut: the cut against his right (athleteRight, the drawn side)
      const r = athleteRight(yaw); expect(cutSide).toBe(cut.x * r.x + cut.z * r.z > 0 ? 'right' : 'left');
      let ran = '';
      const host: HandleHost = { carry: { hand, move: null, runMove: (m: unknown) => { ran = String(m); return true; }, queueMove: () => true } as never, beat: () => {} };
      const res = requestMove(host, { move: 'crossover', cutSide, flick: true, decide: { kind: 'none' } });
      expect(res.endHand, `yaw ${yaw.toFixed(2)} cut ${cutSide} from ${hand}`).toBe(cutSide);
      expect(res.clipDir).toBe(cutSide);
      expect(res.clip!.endsWith(`_${cutSide}`)).toBe(true);
      expect(ran).toBe(res.twin ? 'in_and_out' : 'crossover');
    }
  });

  it('…and the carry plays it there: on the mirrored node rig at each facing, the ball ends on the athlete\'s cut side', () => {
    for (const yaw of FACINGS) for (const s of [1, -1] as const) {
      const scene = new Scene(new NullEngine());
      const root = new TransformNode('root', scene); root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), yaw);
      const sk = new Skeleton('sk', 'sk', scene); const nodes: Record<string, TransformNode> = {};
      const add = (name: string, parent: TransformNode, pos: [number, number, number], q = Quaternion.Identity()) => { const n = new TransformNode(name, scene); n.parent = parent; n.position.set(...pos); n.rotationQuaternion = q; nodes[name] = n; return n; };
      const hips = add('Hips', root, [0, 0.95, 0]); const spine = add('Spine2', hips, [0, 0.4, 0]);
      for (const [sd, x] of [['Left', 0.18], ['Right', -0.18]] as const) {   // mirrored: the rig's Left arm on the root's +x (the athlete's right)
        const sh = add(`${sd}Arm`, spine, [x, 0.1, 0]); const el = add(`${sd}ForeArm`, sh, [0, -0.28, 0]); add(`${sd}Hand`, el, [0, -0.26, 0]);
        const up = add(`${sd}UpLeg`, hips, [x * 0.55, -0.05, 0]); const kn = add(`${sd}Leg`, up, [0, -0.42, 0]); add(`${sd}Foot`, kn, [0, -0.4, 0]);
      }
      let pb: Record<string, Bone | null> = {};
      for (const n of Object.values(nodes)) { const b = new Bone(n.name, sk, pb[(n.parent as TransformNode).name] ?? null, Matrix.Identity()); b.linkTransformNode(n); pb = { ...pb, [n.name]: b }; }
      for (const n of [root, ...Object.values(nodes)]) n.computeWorldMatrix(true);
      const ball = MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, scene); (ball.metadata ??= {}).felPalmMirrorLeft = true;
      attachBallToHand(ball, sk, rigHandOnSide(sk, root, 'right'));
      const carry = mountBallCarry({ scene, ball, root, skeleton: sk, hoops: true });
      const frame = () => { carry.update(1 / 60, 0.3, true); scene.onAfterAnimationsObservable.notifyObservers(scene); scene.onBeforeCameraRenderObservable.notifyObservers(scene.activeCamera as never); scene.onAfterRenderObservable.notifyObservers(scene); };
      for (let i = 0; i < 40; i++) frame();
      const cutSide = sideOfVector(yaw, cutOf(yaw, s));
      const res = requestMove({ carry, beat: () => {} }, { move: 'crossover', cutSide, flick: true, decide: { kind: 'none' } });
      for (let i = 0; i < 90; i++) frame();
      ball.computeWorldMatrix(true);
      const d = ball.getAbsolutePosition().subtract(root.getAbsolutePosition()), rt = athleteRight(yaw);
      const drawnSide = d.x * rt.x + d.z * rt.z > 0 ? 'right' : 'left';
      expect(res.endHand, `yaw ${yaw.toFixed(2)}`).toBe(cutSide);
      expect(carry.hand.toLowerCase(), `yaw ${yaw.toFixed(2)} cut ${cutSide}`).toBe(cutSide);
      expect(drawnSide, `yaw ${yaw.toFixed(2)} cut ${cutSide}: the ball as drawn`).toBe(cutSide);
      carry.dispose(); scene.dispose();
    }
  });
});
