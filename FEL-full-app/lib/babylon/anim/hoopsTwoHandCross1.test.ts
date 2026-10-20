// HOOPS-TWO-HAND-CROSS-1 (spec §3.1 item 1, §3.4 TH-1..TH-4). New tests only. The ball's hand state through a move: `carry.hand` is
// the start hand until the path reaches the first catch span by the other hand (its t0), then that hand — and the rig side (`handBone`)
// flips on the same frame. The double cross flips twice; a same-hand move never flips. The stick maps keep the destination through
// `carry.handAfterMove` (today's `hand`), so their behaviour is unchanged. TH-2 is read off the modes' source: no headless 1v1 / 3v3 mode
// sim runs under vitest (the live check is the probe harness, spec §3.5).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Bone, Matrix, MeshBuilder, NullEngine, Quaternion, Scene, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';
import { mountBallCarry, moveHandAt, type BallCarry } from './ballCarry';
import { requestMove } from './handleMotion';
import { attachBallToHand } from './ballRig';
import { pathFor, type Hand, type HandlePath, type PathMove } from './handlePaths';
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
  return { carry, frame };
}
/** This rig is mirrored: the rig's LeftHand is drawn on the athlete's right. */
const athleteOfBone = (b: string): 'Right' | 'Left' => (b === 'LeftHand' ? 'Right' : 'Left');
const cap = (h: Hand): 'Right' | 'Left' => (h === 'right' ? 'Right' : 'Left');
interface Frame { t: number; hand: string; bone: string; after: string }
/** Run the move out, one record per frame while it runs (its path time after the frame's update, the hand state, the rig hand). */
function runOut(carry: BallCarry, frame: () => void, max = 240): Frame[] {
  const out: Frame[] = [];
  for (let n = 0; n < max && carry.move; n++) {
    frame();
    const m = carry.move; if (!m) break;
    out.push({ t: m.t, hand: carry.hand, bone: carry.handBone, after: carry.handAfterMove });
  }
  return out;
}
const flipsOf = (xs: string[]): number => xs.reduce((n, x, i) => n + (i > 0 && x !== xs[i - 1] ? 1 : 0), 0);
/** The t0 of each catch span whose hand differs from the hand before it (the path's hand-offs). */
const handoffs = (p: HandlePath): number[] => { const o: number[] = []; let h = p.startHand; for (const s of p.segs) if (s.kind === 'catch' && s.hand && s.hand !== h) { o.push(s.t0); h = s.hand; } return o; };
/** Put the ball in the athlete's `want` hand (a crossover run out), back in the dribble. */
function toHand(s: ReturnType<typeof setup>, want: 'Right' | 'Left'): void {
  if (s.carry.hand !== want) { s.carry.runMove('crossover'); runOut(s.carry, s.frame); }
  for (let i = 0; i < 30; i++) s.frame();
  expect(s.carry.hand).toBe(want);
}
/** HOOPS-HAND-LABEL: frame `n` of a move on this rig (path time n / 60 s, the 60 fps frame clock) — a flip's exact frame boundary. */
const F = (n: number): number => n / 60;
/** Play `path` on the carry and assert the hand state against the path's own hand-offs on every frame. HOOPS-HAND-LABEL (Elijah, Oct 20
 *  1:11 PM PT): the hand flips on the frame the new palm holds the ball (`flipAt`, exact frame boundaries), not at the catch's t0. */
function expectHandoffs(path: HandlePath, want: number[], label: string, flipAt: number[]): Frame[] {
  const s = setup();
  toHand(s, cap(path.startHand));
  expect(handoffs(path).map((t) => +t.toFixed(4)), `${label}: the path's hand-offs`).toEqual(want.map((t) => +t.toFixed(4)));
  expect(s.carry.runMove(path), label).toBe(true);
  expect(s.carry.hand, `${label}: asked`).toBe(cap(path.startHand));
  const fr = runOut(s.carry, s.frame);
  expect(fr.length, label).toBeGreaterThan(10);
  for (const f of fr) {
    const k = flipAt.filter((t) => f.t >= t - 1e-6).length;   // flips passed
    const h = k % 2 === 0 ? path.startHand : (path.startHand === 'right' ? 'left' : 'right');
    expect(f.hand, `${label} t ${f.t.toFixed(3)}`).toBe(cap(h));
    expect(athleteOfBone(f.bone), `${label} t ${f.t.toFixed(3)}: handBone agrees with hand`).toBe(f.hand);
  }
  expect(flipsOf(fr.map((f) => f.hand)), label).toBe(flipAt.length);
  expect(s.carry.move, label).toBeNull();
  expect(s.carry.hand, `${label}: after`).toBe(cap(path.endHand));
  return fr;
}

describe('TH-1: the ball-hand state follows the crossover', () => {
  it('moveHandAt: a right-to-left crossover is the right hand until its catch t0 (0.30 s at pace 1, HP:126), the left from t0 on', () => {
    const p = pathFor('crossover', 'right')!;
    expect(handoffs(p)).toEqual([0.30]);
    for (let t = 0; t < p.duration; t += 0.005) expect(moveHandAt(p, t), `t ${t.toFixed(3)}`).toBe(t < 0.30 ? 'right' : 'left');
    expect(moveHandAt(p, 0.30)).toBe('left');
  });
  it('on the carry, R → L: `hand` is Right on every frame before the left palm holds the ball (frame 19, t 0.317 — the catch t0 is 0.30), Left from it on, and handBone agrees on each frame', () => {
    const fr = expectHandoffs(pathFor('crossover', 'right')!, [0.30], 'crossover R→L', [F(19)]);
    expect(fr.some((f) => f.t < F(19) - 1e-6) && fr.some((f) => f.t >= F(19) - 1e-6)).toBe(true);
  });
  it('mirrored, L → R: Left until the right palm holds it (frame 20, t 0.333), Right from it on', () => {
    expectHandoffs(pathFor('crossover', 'left')!, [0.30], 'crossover L→R', [F(20)]);
  });
  it('the destination stays readable through handAfterMove: the end hand on every frame of the move (today\'s `hand`)', () => {
    const s = setup();
    s.carry.runMove(pathFor('crossover', 'right')!);
    expect(s.carry.handAfterMove).toBe('Left');
    for (const f of runOut(s.carry, s.frame)) expect(f.after, `t ${f.t.toFixed(3)}`).toBe('Left');
    expect(s.carry.handAfterMove).toBe(s.carry.hand);
  });
  it('a move asked mid-bounce (the path re-built from the drawn ball) flips at ITS catch span\'s t0, never at the move\'s first frame', () => {
    const s = setup();
    for (let i = 0; i < 9; i++) s.frame();   // somewhere in the bounce
    expect(s.carry.runMove('crossover')).toBe(true);
    const fr = runOut(s.carry, s.frame);
    expect(fr[0].hand).toBe('Right');
    expect(flipsOf(fr.map((f) => f.hand))).toBe(1);
    for (const f of fr) expect(athleteOfBone(f.bone)).toBe(f.hand);
  });
});

describe('TH-2: the modes\' ball-hand feeds follow it', () => {
  const one = readFileSync('lib/babylon/modes/OneVOneMode.ts', 'utf8');
  const three = readFileSync('lib/babylon/modes/ThreeVThreeMode.ts', 'utf8');
  it('the trees\' ballHand reads carry.hand (the hand the ball is in) in 1v1 (me, the rival) and 3v3 (me, every body, the foe driver)', () => {
    expect(one).toContain("ballHand: meCarry?.hand === 'Left' ? 'left' : 'right'");
    expect(one).toContain("ballHand: foeCarry?.hand === 'Left' ? 'left' : 'right'");
    expect(three).toContain("ballHand: carries.get(me)?.hand === 'Left' ? 'left' : 'right'");
    expect(three).toContain("ballHand: carries.get(body)?.hand === 'Left' ? 'left' : 'right'");
    expect(three).toContain("ballHand: carries.get(f)?.hand === 'Left' ? 'left' : 'right'");
    expect(one + three).not.toMatch(/ballHand: [^,]*handAfterMove/);
  });
  it('the stick map, the strong-hand return and the body-control source read handAfterMove (stick behaviour unchanged)', () => {
    expect(one).toContain("hand: meCarry?.handAfterMove ?? 'Right', escape:");
    expect(one).toContain("stepStrongHand(strongHand, dt, { hand: meCarry?.handAfterMove === 'Left'");
    expect(one).toContain("hand: () => meCarry?.handAfterMove ?? 'Right', emit:");
    expect(three).toContain("hand: carries.get(me)?.handAfterMove ?? 'Right', escape:");
    expect(three).toContain("stepStrongHand(strongHand, dt, { hand: myC?.handAfterMove === 'Left'");
    expect(three).toContain("hand: () => carries.get(me)?.handAfterMove ?? 'Right', emit:");
  });
  it('the feed (as the modes compute it) equals carry.hand on every frame of a left-stick crossover and a right-stick (flicked) crossover', () => {
    for (const flick of [false, true]) {
      const s = setup();
      const res = requestMove({ carry: s.carry, beat: () => {} }, { move: 'crossover', cutSide: 'left', flick, decide: { kind: 'none' } });
      expect(res.ball, `flick ${flick}`).toBe('started');
      const fr = runOut(s.carry, s.frame);
      for (const f of fr) {
        const feed = f.hand === 'Left' ? 'left' : 'right';
        expect(feed, `flick ${flick} t ${f.t.toFixed(3)}`).toBe(f.hand.toLowerCase());
        expect(athleteOfBone(f.bone), `flick ${flick} t ${f.t.toFixed(3)}`).toBe(f.hand);
      }
      expect(fr[0].hand).toBe('Right'); expect(flipsOf(fr.map((f) => f.hand)), `flick ${flick}`).toBe(1);
    }
  });
});

describe('TH-3: the double cross flips twice; same-hand moves never flip', () => {
  it('the double cross: catches at 0.26 s and 0.52 s (HP:158-160), and on this rig it flips twice, at the palm\'s frames, back to the start hand — and mirrored', () => {
    expectHandoffs(pathFor('double_cross', 'right')!, [0.26, 0.52], 'double cross R', [F(17), F(33)]);
    expectHandoffs(pathFor('double_cross', 'left')!, [0.26, 0.52], 'double cross L', [F(18), F(33)]);
  });
  it('a crossover QUEUED behind a crossover applies the same rule to its own path: two flips, each with handBone, the start hand at the end', () => {
    const s = setup();
    expect(s.carry.runMove('crossover')).toBe(true); expect(s.carry.queueMove('crossover')).toBe(true);
    expect(s.carry.hand).toBe('Right'); expect(s.carry.handAfterMove).toBe('Right');
    const fr = runOut(s.carry, s.frame);
    expect(flipsOf(fr.map((f) => f.hand))).toBe(2);
    for (const f of fr) expect(athleteOfBone(f.bone)).toBe(f.hand);
    const first = fr.findIndex((f) => f.hand === 'Left');
    expect(fr.slice(0, first).every((f) => f.hand === 'Right')).toBe(true);
    expect(s.carry.hand).toBe('Right');
  });
  it('hesi, in-and-out, yoyo, jab, PAUSIN\' (0 crossings): no hand-off in the path, no flip on any frame, either hand', () => {
    for (const mv of ['hesi', 'in_and_out', 'yoyo', 'jab', 'pausin'] as PathMove[]) {
      for (const h of ['right', 'left'] as const) {
        const p = pathFor(mv, h)!; expect(p, mv).not.toBeNull();
        expectHandoffs(p, [], `${mv} ${h}`, []);
      }
    }
  });
});

describe('TH-4: no flip before the hand-off', () => {
  const T0: [PathMove, number][] = [['between_legs', 0.30], ['behind_back', 0.34], ['shammgod', 0.34], ['spin', 0.49], ['momentum_cross', 0.32]];
  /** HOOPS-HAND-LABEL: the frame the new palm holds the ball, measured on this rig — [pace 1 R→L, pace 1 L→R, turbo R→L, turbo L→R]. */
  const PALM: Record<string, [number, number, number, number]> = {
    between_legs: [20, 21, 16, 17], behind_back: [21, 22, 17, 17], shammgod: [24, 24, 19, 20], spin: [31, 31, 25, 25], momentum_cross: [21, 22, 17, 17],
  };
  it(`each with its F4 catch t0 (t0 / pace at the turbo's MOVE_TURBO_REAL ${MOVE_TURBO_REAL}), flipping on the palm's frame, both hands`, () => {
    expect(MOVE_TURBO_REAL).toBe(1.25);   // read from code (HandleSystem), the value the spec left UNMEASURED
    for (const [mv, t0] of T0) {
      for (const [pi, pace] of [1, MOVE_TURBO_REAL].entries()) {
        for (const [hi, h] of (['right', 'left'] as const).entries()) {
          const n = PALM[mv][2 * pi + hi];
          expect(F(n), `${mv} ${h} pace ${pace}: the palm frame is after the catch t0`).toBeGreaterThan(t0 / pace);
          expectHandoffs(pathFor(mv, h, pace)!, [t0 / pace], `${mv} ${h} pace ${pace}`, [F(n)]);
        }
      }
    }
  });
});
