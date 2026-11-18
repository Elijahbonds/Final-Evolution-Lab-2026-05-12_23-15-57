// lane/h3-handler (#314 port, anim/MoveEase): a handle move's hand-overs ease. On the node rig: at a move's start no arm bone turns faster
// than the ease allows (it popped 100°+ in a frame without it), the arm still gets where the move wants it, and — #384's timing kept
// exactly — the carry's hand label flips on the same frame with the ease on and off (the label is read before the ease draws).
import { afterEach, describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from '@babylonjs/core';
import { hoopsNodeRig } from '../../../tests/helpers/hoopsNodeRig';
import { openFeel, closeFeel } from '../../../tests/helpers/feelOverrides';
import { limitTurn, quatAngle, MOVE_EASE_RATE_DEG, MOVE_ARM_RATE_DEG, MOVE_EASE_SEC } from './MoveEase';

const DT = 1 / 60;
afterEach(() => closeFeel());

describe('limitTurn', () => {
  it('a turn under the limit is left alone; over it, slerped to exactly the limit along the same path', () => {
    const a = Quaternion.Identity(), b = Quaternion.RotationAxis(Vector3.Right(), 0.5);
    const q = b.clone(); expect(limitTurn(a, q, 1)).toBe(false); expect(q.equals(b)).toBe(true);
    const q2 = b.clone(); expect(limitTurn(a, q2, 0.2)).toBe(true);
    expect(quatAngle(a, q2)).toBeCloseTo(0.2, 6); expect(quatAngle(q2, b)).toBeCloseTo(0.3, 6);
  });
});

const ARM = ['LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm'];
/** A crossover (and a queued crossover: the double cross) asked at the stroke's top at a walk; per drawn frame after the ask: each arm
 *  bone's turn since the last drawn frame (deg), and the carry's hand label. */
function take(ease: boolean) {
  if (!ease) openFeel({ 'hoops.moveEaseOn': 0 });
  const r = hoopsNodeRig('right');
  let n = 0; while (n++ < 400 && !(n > 90 && r.carry.phase < 0.03)) r.frame(DT, 0.3);
  const last = ARM.map((b) => r.nodes[b].rotationQuaternion!.clone());
  r.carry.runMove('crossover'); r.carry.queueMove('crossover');
  const turns: number[] = [], hands: string[] = [], held: string[] = [];
  for (let i = 0; i < 80; i++) {
    r.frame(DT, 0.3);
    let mx = 0;
    ARM.forEach((b, k) => { const q = r.nodes[b].rotationQuaternion!; mx = Math.max(mx, quatAngle(last[k], q) * 180 / Math.PI); last[k].copyFrom(q); });
    turns.push(mx); hands.push(r.carry.hand); held.push(r.carry.handAfterMove);
  }
  r.dispose(); closeFeel();
  return { turns, hands, held };
}

describe('on the node rig: the hand-overs ease', () => {
  const on = take(true), off = take(false);
  it('without the ease the move\'s entry pops (an arm bone turning far past 1,000°/s in a frame); with it, never past the limit', () => {
    const win = Math.round(MOVE_EASE_SEC / DT);
    expect(Math.max(...off.turns.slice(0, win))).toBeGreaterThan(MOVE_EASE_RATE_DEG * DT * 2);
    for (const [i, t] of on.turns.entries()) expect(t, `frame ${i}`).toBeLessThanOrEqual((i < win ? MOVE_EASE_RATE_DEG : MOVE_ARM_RATE_DEG) * DT + 1e-6);
  });
  it('#384\'s hand label is untouched: the hand flips on the very same frames with the ease on and off (and its destination too)', () => {
    expect(on.hands).toEqual(off.hands);
    expect(on.held).toEqual(off.held);
    expect(new Set(on.hands).size).toBe(2);   // it did change hands (twice: the double cross)
  });
  it('the ease only delays the arm: the take ends on the same drawn pose (after the move, the dribble\'s own)', () => {
    expect(on.turns.at(-1)!).toBeLessThan(MOVE_EASE_RATE_DEG * DT + 1e-6);
  });
});

// hoops-items (2026-11-18): the hands ease too. The whip is a HAND bone (the behind-the-back's ball hand, 125-132° in one frame on the rig);
// the arm ease above never held the hands. On a node rig the hand is driven like a clip would flip it, and the ease is read off the bone.
import { ArmEase, MOVE_HAND_EASE_ON, MOVE_HAND_RATE_DEG } from './MoveEase';
import { Skeleton, Bone, Matrix, TransformNode, NullEngine, Scene } from '@babylonjs/core';
describe('the hand ease (hoops-items)', () => {
  const rig = () => {
    const scene = new Scene(new NullEngine()); const sk = new Skeleton('sk', 'sk', scene);
    const nodes: Record<string, TransformNode> = {};
    let parent: Bone | null = null;
    for (const n of ['RightShoulder', 'RightArm', 'RightForeArm', 'RightHand']) {
      const t = new TransformNode(n, scene); t.rotationQuaternion = Quaternion.Identity(); if (parent) t.parent = nodes[parent.name];
      const b = new Bone(n, sk, parent, Matrix.Identity()); b.linkTransformNode(t); nodes[n] = t; parent = b;
    }
    return { scene, sk, nodes };
  };
  const flip = (on: boolean) => {
    if (!on) openFeel({ 'hoops.moveHandEaseOn': 0 });
    const { scene, sk, nodes } = rig(); const ease = new ArmEase(sk);
    const hand = nodes.RightHand; const turns: number[] = []; let last = hand.rotationQuaternion!.clone();
    for (let f = 0; f < 12; f++) {
      if (f >= 3) hand.rotationQuaternion = Quaternion.RotationAxis(Vector3.Forward(), (130 * Math.PI) / 180);   // the clip's flip, frame 3
      ease.apply(f, DT, true);
      turns.push(quatAngle(last, hand.rotationQuaternion!) * 180 / Math.PI); last = hand.rotationQuaternion!.clone();
    }
    scene.dispose(); closeFeel();
    return { turns, end: quatAngle(Quaternion.RotationAxis(Vector3.Forward(), (130 * Math.PI) / 180), last) * 180 / Math.PI };
  };
  it('ships ON at 1800°/s: a 130° flip is drawn over several frames, never past 30° in one, and arrives', () => {
    expect(MOVE_HAND_EASE_ON).toBe(1); expect(MOVE_HAND_RATE_DEG).toBe(1800);
    const r = flip(true);
    expect(Math.max(...r.turns)).toBeLessThanOrEqual(MOVE_HAND_RATE_DEG * DT + 1e-6);
    expect(r.end).toBeLessThan(1e-3);
  });
  it('off: the hand flips 130° in the one frame, as before', () => {
    expect(Math.max(...flip(false).turns)).toBeCloseTo(130, 3);
  });
});
