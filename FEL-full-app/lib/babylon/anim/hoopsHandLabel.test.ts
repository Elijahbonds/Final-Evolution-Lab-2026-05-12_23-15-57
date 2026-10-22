// HOOPS-HAND-LABEL (item 4, option a; Elijah, Oct 20 12:33 PM PT: "use option (a) for the hand label"). New tests only. Through every
// crossing move, `carry.hand` (and the rig side, handBone) names the hand that actually HOLDS the ball: it flips on the drawn frame the new
// hand's palm is on the ball (the carry's palmOnBall rule: palm point within 0.3 m of the ball's centre) once that hand's catch span has
// begun — never at the span's t0 before the palm gets there, never late. The palm is measured here, off the scene's own hand nodes.
import { describe, expect, it } from 'vitest';
import { Bone, Matrix, MeshBuilder, NullEngine, Quaternion, Scene, Skeleton, TransformNode, Vector3, type Mesh } from '@babylonjs/core';
import { mountBallCarry, moveHandAt, type BallCarry } from './ballCarry';
import { attachBallToHand, palmOffsetOf } from './ballRig';
import { pathFor, type Hand, type HandlePath, type PathMove } from './handlePaths';
import { MOVE_SHAPE } from '../core/HandleShape';
import { MOVE_TURBO_REAL } from '../core/HandleSystem';

/** The node rig of ballCarry.moves.test (two arms, two legs; the rig's LEFT arm on the root's +x, the athlete's right), facing −z. */
function setup() {
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
    const el = add(`${sd}ForeArm`, sh, [0.02 * Math.sign(x), -0.28, 0], Quaternion.RotationAxis(Vector3.Right(), 0.4));
    add(`${sd}Hand`, el, [0, -0.26, 0]);
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
  attachBallToHand(ball, sk, 'LeftHand');
  const carry = mountBallCarry({ scene, ball, root, skeleton: sk, hoops: true });
  const frame = (dt = 1 / 60) => {
    carry.update(dt, 0.3, true);
    scene.onAfterAnimationsObservable.notifyObservers(scene);
    scene.onBeforeCameraRenderObservable.notifyObservers(scene.activeCamera as never);
    scene.onAfterRenderObservable.notifyObservers(scene);
  };
  for (let i = 0; i < 40; i++) frame();   // into the dribble
  return { carry, frame, scene, ball };
}
/** This rig is mirrored: the rig's LeftHand is drawn on the athlete's right. */
const rigOf = (h: Hand): 'LeftHand' | 'RightHand' => (h === 'right' ? 'LeftHand' : 'RightHand');
const athleteOfBone = (b: string): Hand => (b === 'LeftHand' ? 'right' : 'left');
const cap = (h: Hand): 'Right' | 'Left' => (h === 'right' ? 'Right' : 'Left');
const other = (h: Hand): Hand => (h === 'right' ? 'left' : 'right');
type S = ReturnType<typeof setup>;
/** The athlete hand's palm point to the ball's centre (m), measured off the drawn scene. */
function palmDist(s: S, h: Hand): number {
  const bone = rigOf(h); const n = s.scene.getTransformNodeByName(bone)!;
  n.computeWorldMatrix(true); (s.ball as Mesh).computeWorldMatrix(true);
  return Vector3.TransformCoordinates(palmOffsetOf(s.ball, bone), n.getWorldMatrix()).subtract(s.ball.getAbsolutePosition()).length();
}
interface Fr { t: number; hand: Hand; bone: Hand; palm: Record<Hand, number>; contacts: Hand[] }
function runOut(s: S, max = 240): Fr[] {
  const out: Fr[] = [];
  for (let n = 0; n < max && s.carry.move; n++) {
    s.frame(); const m = s.carry.move; if (!m) break;
    out.push({ t: m.t, hand: s.carry.hand === 'Right' ? 'right' : 'left', bone: athleteOfBone(s.carry.handBone), palm: { right: palmDist(s, 'right'), left: palmDist(s, 'left') }, contacts: m.contactHands.slice() });
  }
  return out;
}
function toHand(s: S, want: Hand): void {
  if (s.carry.hand !== cap(want)) { s.carry.runMove('crossover'); runOut(s); }
  for (let i = 0; i < 30; i++) s.frame();
  expect(s.carry.hand).toBe(cap(want));
}
/** The hand holding the ball on each frame, from the path and the measured palms alone: the start hand, handed on when the catch span
 *  under way is by the other hand AND that hand's palm is within 0.3 m of the ball. */
function holders(path: HandlePath, fr: Fr[]): Hand[] {
  let h = path.startHand;
  return fr.map((f) => { const c = moveHandAt(path, f.t); if (c !== h && f.palm[c] < 0.3) h = c; return h; });
}
const CROSSING = (Object.keys(MOVE_SHAPE) as PathMove[]).filter((m) => MOVE_SHAPE[m as keyof typeof MOVE_SHAPE].crosses > 0 && pathFor(m, 'right'));

describe('HOOPS-HAND-LABEL: the hand label and the hand holding the ball agree on every frame', () => {
  it('the crossing moves are the ten MOVE_SHAPE marks as crossing', () => {
    expect(CROSSING.sort()).toEqual(['behind_back', 'between_legs', 'crossover', 'double_cross', 'momentum_btb', 'momentum_cross', 'shammgod', 'snatch_back', 'spin', 'steezo_roll']);
  });
  it('every crossing move, both hands, at pace 1 and the turbo\'s pace: hand === handBone === the holding hand on every frame, the flip on the palm\'s own frame', () => {
    for (const mv of CROSSING) for (const pace of [1, MOVE_TURBO_REAL]) for (const h of ['right', 'left'] as const) {
      const label = `${mv} ${h} pace ${pace}`;
      const path = pathFor(mv, h, pace)!; const s = setup(); toHand(s, h);
      expect(s.carry.runMove(path), label).toBe(true);
      const fr = runOut(s); expect(fr.length, label).toBeGreaterThan(10);
      const hold = holders(path, fr);
      fr.forEach((f, i) => {
        expect(f.hand, `${label} t ${f.t.toFixed(4)}`).toBe(hold[i]);
        expect(f.bone, `${label} t ${f.t.toFixed(4)}: handBone`).toBe(f.hand);
        if (i > 0 && f.hand !== fr[i - 1].hand) {
          expect(f.palm[f.hand], `${label} t ${f.t.toFixed(4)}: the new palm is on the ball on its flip frame`).toBeLessThan(0.3);
          expect(moveHandAt(path, f.t), `${label}: its catch span has begun`).toBe(f.hand);
          // exact: the frame before, the catch was not yet that hand's or its palm was not yet there
          const p = fr[i - 1]; expect(moveHandAt(path, p.t) !== f.hand || p.palm[f.hand] >= 0.3, `${label} t ${p.t.toFixed(4)}: not a frame early`).toBe(true);
        }
      });
      expect(s.carry.move, label).toBeNull();
      expect(s.carry.hand, `${label}: after, the end hand`).toBe(cap(path.endHand));
    }
  });
  it('a crossover does flip (once, R → L and L → R): the label is not frozen on the start hand', () => {
    for (const h of ['right', 'left'] as const) {
      const s = setup(); toHand(s, h); s.carry.runMove(pathFor('crossover', h)!);
      const fr = runOut(s);
      expect(fr[0].hand).toBe(h); expect(fr[fr.length - 1].hand).toBe(other(h));
      expect(fr.filter((f, i) => i > 0 && f.hand !== fr[i - 1].hand).length).toBe(1);
    }
  });
  it('the double cross on this rig: it flips twice, at the palm\'s frames (out to the other hand, then back), the new palm on the ball on each flip frame — the start hand at the end', () => {
    for (const pace of [1, MOVE_TURBO_REAL]) for (const h of ['right', 'left'] as const) {
      const path = pathFor('double_cross', h, pace)!; const s = setup(); toHand(s, h); s.carry.runMove(path);
      const fr = runOut(s);
      const flips = fr.map((f, i) => i).filter((i) => i > 0 && fr[i].hand !== fr[i - 1].hand);
      const want = pace === 1 ? (h === 'right' ? [17, 33] : [18, 33]) : (h === 'right' ? [13, 26] : [14, 26]);
      expect(flips.map((i) => Math.round(fr[i].t * 60)), `pace ${pace} ${h}: the flip frames`).toEqual(want);
      expect(flips.map((i) => fr[i].hand), `pace ${pace} ${h}: out, then back`).toEqual([other(h), h]);
      for (const i of flips) expect(fr[i].palm[fr[i].hand], `pace ${pace} ${h} t ${fr[i].t.toFixed(4)}: the new palm on its flip frame`).toBeLessThan(0.3);
      expect(s.carry.hand).toBe(cap(h));
    }
  });
  it('a crossover queued behind a crossover, and a crossover asked mid-bounce: each flip is on a frame the new palm is on the ball, handBone with it', () => {
    const runs: [string, (s: S) => void][] = [
      ['queued', (s) => { expect(s.carry.runMove('crossover')).toBe(true); expect(s.carry.queueMove('crossover')).toBe(true); }],
      ['mid-bounce', (s) => { for (let i = 0; i < 9; i++) s.frame(); expect(s.carry.runMove('crossover')).toBe(true); }],
    ];
    for (const [label, go] of runs) {
      const s = setup(); go(s);
      const fr = runOut(s);
      let flips = 0;
      fr.forEach((f, i) => {
        expect(f.bone, `${label} t ${f.t.toFixed(4)}`).toBe(f.hand);
        const was = i > 0 ? fr[i - 1].hand : 'right';
        if (f.hand !== was) { flips++; expect(f.palm[f.hand], `${label} t ${f.t.toFixed(4)}: the new palm`).toBeLessThan(0.3); }
      });
      expect(flips, label).toBe(label === 'queued' ? 2 : 1);
    }
  });
});
