// HOOPS-CROSS-FIXUP-2 item 2 (owner 2026-10-20: "change contract line 48 to handAfterMove"). New tests only. The rival's crossover decision
// (OneVOneMode, `const crosses = …`) reads the ball's DESTINATION hand: since HOOPS-TWO-HAND-CROSS-1 `carry.hand` is the start hand until the
// catch, so QA's repro — a crossover decided mid-move, before the catch, toward the hand the ball is already heading to — read crosses=true and
// queued a second crossing behind the first (the ball crossed back). The mode's own expression is read off its source and evaluated on the
// node rig of hoopsTwoHandCross1.test (no headless 1v1 mode sim runs under vitest), then fed to requestMove exactly as the mode does.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Bone, Matrix, MeshBuilder, NullEngine, Quaternion, Scene, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';
import { mountBallCarry, type BallCarry } from './ballCarry';
import { requestMove } from './handleMotion';
import { attachBallToHand } from './ballRig';

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
  return { carry, frame };
}

/** The mode's `crosses` right-hand side, as written in OneVOneMode.ts, made callable. */
function modeCrosses(): (foeCarry: BallCarry | null, dec: { crossover: 'left' | 'right' }) => boolean {
  const one = readFileSync('lib/babylon/modes/OneVOneMode.ts', 'utf8');
  const m = one.match(/const crosses = (!!foeCarry && [^;\n]+);/);
  expect(m, 'the rival\'s crosses line').not.toBeNull();
  return new Function('foeCarry', 'dec', `return ${m![1]};`) as never;
}
/** The rival's call, as the mode makes it (decide none, his capture by name, the path only when it crosses). */
function rivalCross(carry: BallCarry, dir: 'left' | 'right', crosses: boolean) {
  return requestMove({ carry, beat: () => {} }, { move: 'crossover', hint: dir, decide: { kind: 'none' }, clip: `bball_mc_crossover_${dir}`, fadeSec: 0.12, speedRatio: 1, path: crosses ? undefined : false });
}
/** Mid-move: a right-to-left crossover running, path time past half its hand-off but before the catch (0.30 s): `hand` still Right. */
function midCrossover() {
  const s = setup();
  expect(s.carry.hand).toBe('Right');
  expect(s.carry.runMove('crossover')).toBe(true);
  while (s.carry.move && s.carry.move.t < 0.2) s.frame();
  expect(s.carry.move?.t).toBeLessThan(0.3);
  expect(s.carry.hand, 'before the catch').toBe('Right');
  expect(s.carry.handAfterMove, 'the destination').toBe('Left');
  return s;
}

describe('HOOPS-CROSS-FIXUP-2: the rival\'s crossover decision reads the destination hand', () => {
  it('QA repro: a crossover decided mid-move, toward the hand the ball is already heading to, is crosses=false — no second path, the ball ends in that hand', () => {
    const crosses = modeCrosses();
    const s = midCrossover();
    expect(crosses(s.carry, { crossover: 'left' })).toBe(false);
    const res = rivalCross(s.carry, 'left', crosses(s.carry, { crossover: 'left' }));
    expect(res.ball).toBe('none');
    const hands: string[] = [];
    for (let n = 0; n < 240 && s.carry.move; n++) { s.frame(); hands.push(s.carry.hand); }
    expect(s.carry.move).toBeNull();
    expect(hands.reduce((k, h, i) => k + (i > 0 && h !== hands[i - 1] ? 1 : 0), 0), 'one hand-off, not two').toBe(1);
    expect(s.carry.hand).toBe('Left');
  });
  it('control: the old read (`hand`, the start hand) called the same decision a crossing and queued the ball back to the right', () => {
    const s = midCrossover();
    const old = (s.carry.hand === 'Left' ? 'left' : 'right') !== 'left';
    expect(old).toBe(true);
    expect(rivalCross(s.carry, 'left', old).ball).toBe('queued');
    for (let n = 0; n < 240 && s.carry.move; n++) s.frame();
    expect(s.carry.hand).toBe('Right');
  });
  it('a mid-move crossover back toward the START hand is still a crossing (queued behind the catch), and with no move running the read is `hand`', () => {
    const crosses = modeCrosses();
    const s = midCrossover();
    expect(crosses(s.carry, { crossover: 'right' })).toBe(true);
    expect(rivalCross(s.carry, 'right', true).ball).toBe('queued');
    for (let n = 0; n < 240 && s.carry.move; n++) s.frame();
    expect(s.carry.hand).toBe('Right');
    for (let i = 0; i < 30; i++) s.frame();
    expect(s.carry.move).toBeNull();
    expect(s.carry.handAfterMove).toBe(s.carry.hand);
    expect(crosses(s.carry, { crossover: 'right' })).toBe(false);
    expect(crosses(s.carry, { crossover: 'left' })).toBe(true);
    expect(crosses(null, { crossover: 'left' })).toBe(false);
  });
});
