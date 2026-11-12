// hoops-gather G1 (owner 2026-11-12, "good gathers and pick ups"): THE PICK-UP READS THE BOUNCE (ballCarry.pickUp, planPickUp).
// Measured at eec53f24 (scripts/probes/hoops-gather): pressed near the floor the ball was taken 57–94 cm under the palm and flown up at
// 8.1 m/s to a still hand. With `hoops.pickupReadOn` 1 it stays on its bounce and the hand meets it; with 0 nothing changes.
import { describe, expect, it } from 'vitest';
import { Bone, Matrix, MeshBuilder, NullEngine, Quaternion, Scene, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';
import { mountBallCarry, planPickUp, fallingPhaseAt, risingPhaseAt, PICKUP_READ_ON, PICKUP_WAIT_MAX_SEC, PICKUP_REACH_M, PICKUP_RATE_MAX, PICKUP_TOP_GAP_M, PICKUP_CONTACT_M, PICKUP_OVERRUN_SEC, type BallCarry } from './ballCarry';
import { attachBallToHand } from './ballRig';
import { resetFeelForTests, setFeelOverride, setFeelSession, setFeelUser } from '../../feel-panel/feel';
import { FEEL_KNOB_BY_ID } from '../../feel-panel/knobs';
import { HOOPS_DRIBBLE, PUSHED_FLOOR_PHASE, pushedBounce01 } from './Dribble';

function rig(scene: Scene) {
  const root = new TransformNode('root', scene);
  root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI);   // facing the rim (−z)
  const sk = new Skeleton('sk', 'sk', scene);
  const nodes: Record<string, TransformNode> = {};
  const add = (name: string, parent: TransformNode, pos: [number, number, number], q = Quaternion.Identity()) => {
    const n = new TransformNode(name, scene); n.parent = parent; n.position.set(...pos); n.rotationQuaternion = q; nodes[name] = n; return n;
  };
  const hips = add('Hips', root, [0, 0.95, 0]);
  const spine = add('Spine2', hips, [0, 0.4, 0]);
  // mirrored: the rig's Left* bones on +x (the athlete's right, as drawn)
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
  return { root, sk, ball, nodes };
}
function driver(scene: Scene, carry: BallCarry, ball: import('@babylonjs/core').AbstractMesh) {
  const path: number[] = [];
  let last: Vector3 | null = null;
  /** a frame: the mode's update, the after-animations pass, then (`afterPhysics`) whatever moves the root before the camera draws —
   *  a Havok step — then the camera's before-render and the after-render (the recorder's slot) */
  const frame = (dt: number, speed: number, active: boolean, move?: () => void, afterPhysics?: () => void) => {
    move?.();
    carry.update(dt, speed, active);
    scene.onAfterAnimationsObservable.notifyObservers(scene);
    afterPhysics?.();
    scene.onBeforeCameraRenderObservable.notifyObservers(scene.activeCamera as never);
    scene.onAfterRenderObservable.notifyObservers(scene);
    ball.computeWorldMatrix(true);
    const p = ball.getAbsolutePosition().clone();
    if (last) path.push(Vector3.Distance(p, last));
    last = p;
    return p;
  };
  return { frame, path, reset: () => { path.length = 0; last = null; } };
}


const K = { waitMaxSec: PICKUP_WAIT_MAX_SEC, reachM: PICKUP_REACH_M, rateMax: PICKUP_RATE_MAX, topGapM: PICKUP_TOP_GAP_M };
const P = HOOPS_DRIBBLE;

describe('planPickUp (pure)', () => {
  it('the falling leg inverts: fallingPhaseAt(h) is on [0, floor] and its height is h', () => {
    for (const h of [0, 0.2, 0.5, 0.8, 1]) { const ph = fallingPhaseAt(h); expect(ph).toBeGreaterThanOrEqual(0); expect(ph).toBeLessThanOrEqual(PUSHED_FLOOR_PHASE + 1e-9); expect(pushedBounce01(ph)).toBeCloseTo(h, 4); }
  });
  it('near the top: take it now (null), as today', () => {
    expect(planPickUp(P.palmY - 0.02, false, P, 1.7, K)).toBeNull();
    expect(planPickUp(P.palmY - PICKUP_TOP_GAP_M + 0.01, true, P, 1.7, K)).toBeNull();
  });
  it('at the floor: waits for the bounce, meets the hand PICKUP_REACH_M under the palm, inside the wait and the speed-up', () => {
    const pl = planPickUp(P.ballR, false, P, 1.7, K)!;
    expect(pl).not.toBeNull();
    expect(pl.sec).toBeLessThanOrEqual(PICKUP_WAIT_MAX_SEC + 1e-9);
    expect(pl.rate).toBeLessThanOrEqual(1.7 * PICKUP_RATE_MAX + 1e-9);
    expect(pl.rate).toBeGreaterThanOrEqual(1.7 - 1e-9);   // never slower than its own bounce
    expect(pl.phaseMeet).toBeCloseTo(risingPhaseAt(1 - PICKUP_REACH_M / (P.palmY - P.ballR)), 6);
    expect(pl.phaseMeet).toBeGreaterThan(PUSHED_FLOOR_PHASE);
  });
  it('falling from mid-stroke: the meeting is on the way back up (through the floor)', () => {
    const mid = P.ballR + 0.5 * (P.palmY - P.ballR);
    const pl = planPickUp(mid, false, P, 1.7, K)!;
    expect(pl.phase0).toBeLessThan(PUSHED_FLOOR_PHASE);
    expect(pl.phaseMeet).toBeGreaterThan(PUSHED_FLOOR_PHASE);
  });
  it('rising past the hand\'s reach: take it now; a meeting that cannot be made inside the wait: take it now', () => {
    expect(planPickUp(P.palmY - 0.2, true, P, 1.7, K)).toBeNull();
    expect(planPickUp(P.palmY - 0.6, false, P, 1.7, { ...K, waitMaxSec: 0.05, rateMax: 1 })).toBeNull();
  });
  it('the knobs ship at the constants, and the switch ships OFF (today exactly)', () => {
    expect(PICKUP_READ_ON).toBe(0);
    expect(FEEL_KNOB_BY_ID.get('hoops.pickupReadOn')!.def).toBe(PICKUP_READ_ON);
    expect(FEEL_KNOB_BY_ID.get('hoops.pickupWaitMaxSec')!.def).toBe(PICKUP_WAIT_MAX_SEC);
    expect(FEEL_KNOB_BY_ID.get('hoops.pickupReachM')!.def).toBe(PICKUP_REACH_M);
    expect(FEEL_KNOB_BY_ID.get('hoops.pickupRateMax')!.def).toBe(PICKUP_RATE_MAX);
    expect(FEEL_KNOB_BY_ID.get('hoops.pickupTopGapM')!.def).toBe(PICKUP_TOP_GAP_M);
    expect(FEEL_KNOB_BY_ID.get('hoops.pickupContactM')!.def).toBe(PICKUP_CONTACT_M);
    expect(FEEL_KNOB_BY_ID.get('hoops.pickupOverrunSec')!.def).toBe(PICKUP_OVERRUN_SEC);
  });
});

/** Dribble until the ball is low and falling (just before the floor), then hand back the carry, the rig and the frame driver. */
function lowBall(readOn: number) {
  resetFeelForTests(); setFeelUser(true); setFeelSession(null); setFeelOverride('hoops.pickupReadOn', readOn);
  const scene = new Scene(new NullEngine());
  const r = rig(scene);
  attachBallToHand(r.ball, r.sk, 'LeftHand');
  const carry: BallCarry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk, hoops: true });
  const d = driver(scene, carry, r.ball);
  for (let i = 0; i < 40; i++) d.frame(1 / 60, 0.2, true);
  for (let i = 0; i < 120 && !(carry.phase > PUSHED_FLOOR_PHASE - 0.1 && carry.phase < PUSHED_FLOOR_PHASE - 0.03); i++) d.frame(1 / 60, 0.2, true);
  return { scene, r, carry, d };
}
const handGap = (r: ReturnType<typeof rig>, hand: 'LeftHand' | 'RightHand') => { r.nodes[hand].computeWorldMatrix(true); r.ball.computeWorldMatrix(true); return Vector3.Distance(r.nodes[hand].getAbsolutePosition(), r.ball.getAbsolutePosition()); };

describe('ballCarry.pickUp', () => {
  it('OFF (the shipped default): taken on the press frame from wherever the ball is — the old sequence exactly', () => {
    const { r, carry, d } = lowBall(0);
    try {
      expect(r.ball.position.y + 0).toBeLessThan(0.6);   // (the ball is low)
      expect(carry.pickUp('LeftHand')).toBe('now');
      expect(r.ball.parent).toBe(r.nodes.LeftHand);
      expect(carry.pickingUp).toBe(false);
      d.frame(1 / 60, 0, false);
      expect(carry.active).toBe(false);
    } finally { resetFeelForTests(); }
  });
  it('ON, pressed low: the ball stays on its bounce, the hand goes down, and it is taken where they meet — close, inside the wait, never yanked', () => {
    const { r, carry, d } = lowBall(1);
    try {
      r.nodes.LeftHand.computeWorldMatrix(true);
      const hand0 = r.nodes.LeftHand.getAbsolutePosition().y;
      const gap0 = handGap(r, 'LeftHand');
      expect(carry.pickUp('LeftHand')).toBe('reading');
      expect(carry.pickingUp).toBe(true);
      expect(r.ball.parent).toBeNull();
      let frames = 0, minHand = hand0, gapAtTake = Infinity; d.reset();
      for (; frames < 40 && !r.ball.parent; frames++) { d.frame(1 / 60, 0, false); r.nodes.LeftHand.computeWorldMatrix(true); minHand = Math.min(minHand, r.nodes.LeftHand.getAbsolutePosition().y); if (r.ball.parent) gapAtTake = handGap(r, 'LeftHand'); }
      expect(r.ball.parent).toBe(r.nodes.LeftHand);
      expect(frames).toBeLessThanOrEqual(Math.ceil((PICKUP_WAIT_MAX_SEC + PICKUP_OVERRUN_SEC) * 60) + 1);
      expect(gapAtTake).toBeLessThan(gap0 - 0.25);          // it is taken far nearer the hand than it was at the press
      expect(minHand).toBeLessThan(hand0 - 0.05);           // the hand went down to it
      expect(Math.max(...d.path)).toBeLessThan(0.16);        // the ball never jumps
      expect(carry.pickingUp).toBe(false);
    } finally { resetFeelForTests(); }
  });
  it('ON: settlePickUp takes a waiting ball at once (before a release); an activation drops the wait and dribbles on', () => {
    const a = lowBall(1);
    try {
      expect(a.carry.pickUp('LeftHand')).toBe('reading');
      a.d.frame(1 / 60, 0, false);
      a.carry.settlePickUp();
      expect(a.r.ball.parent).toBe(a.r.nodes.LeftHand);
      expect(a.carry.pickingUp).toBe(false);
    } finally { resetFeelForTests(); }
    const b = lowBall(1);
    try {
      expect(b.carry.pickUp('LeftHand')).toBe('reading');
      b.d.frame(1 / 60, 0, false);
      b.d.frame(1 / 60, 0.2, true);
      expect(b.carry.pickingUp).toBe(false);
      expect(b.carry.active).toBe(true);
    } finally { resetFeelForTests(); }
  });
  it('ON, the other hand asked for: met by the dribbling hand, then handed palm to palm', () => {
    const { r, carry, d } = lowBall(1);
    try {
      carry.pickUp('RightHand');
      for (let i = 0; i < 40 && carry.pickingUp; i++) d.frame(1 / 60, 0, false);
      expect(r.ball.parent).toBe(r.nodes.RightHand);
    } finally { resetFeelForTests(); }
  });
});
