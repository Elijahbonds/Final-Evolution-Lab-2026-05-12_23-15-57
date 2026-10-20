// hoops-handle (owner 2026-10-17: "The model only dribbles right handed, let's fix that. It needs to perform real crossovers. Sharpen up
// the moves."). THE BALL HAND on the hoops carry, read from the geometry the way the rig probe reads the game: which side of the body the
// ball bounces on (the root's +x is the athlete's right) and which palm is on it. On the node rig (tests/helpers/hoopsNodeRig), mirrored as
// the runtime bodies are.
//   · a crossing move ends in the OTHER hand and the dribble STAYS there; a move that does not cross (or crosses twice) keeps the hand;
//   · crosses back and forth alternate, as many times as asked;
//   · the left hand's dribble is the right hand's mirrored about the body's midline — the ball and the palm, frame for frame;
//   · the hand is never under the rising ball (a stance with no ball arm held it at the hip, and the ball rose through the wrist).
import { describe, expect, it } from 'vitest';
import { hoopsNodeRig, type HoopsNodeRig } from '../../../tests/helpers/hoopsNodeRig';
import { MOVE_SHAPE } from '../core/HandleShape';
import { pathFor, type PathMove } from './handlePaths';
import { clearOfBallWeight } from './Dribble';
import { armChain, reachArm } from './HandIK';
import { Vector3 } from '@babylonjs/core';

const DT = 1 / 60;
/** Dribble standing until the stroke's top after one full bounce. */
function toTop(r: HoopsNodeRig, speed = 0): void {
  let n = 0, wraps = 0, last = r.carry.phase;
  while (n++ < 600) { r.frame(DT, speed, true); if (r.carry.phase < last) wraps++; last = r.carry.phase; if (wraps >= 1 && r.carry.phase < 0.04) return; }
  throw new Error('never reached the top');
}
/** Run a move to its end, then `sec` of dribble; the ball's lateral (root frame) at every bounce's low point after the move. */
function play(r: HoopsNodeRig, move: PathMove, sec = 1.5, speed = 0): { lows: number[] } {
  expect(r.carry.runMove(move), move).toBe(true);
  let n = 0; while (r.carry.move && n++ < 240) r.frame(DT, speed, true);
  expect(r.carry.move, `${move} ended`).toBeNull();
  const lows: number[] = []; let prevY = Infinity, falling = false;
  for (let i = 0; i < Math.round(sec / DT); i++) {
    const p = r.local(r.frame(DT, speed, true));
    if (p.y > prevY && falling) lows.push(p.x);
    falling = p.y < prevY; prevY = p.y;
  }
  return { lows };
}
const sideOf = (x: number): 'right' | 'left' => (x > 0 ? 'right' : 'left');
/** The moves whose ball has a path, by how often it crosses the midline (MOVE_SHAPE; double_cross crosses twice). */
const PATH_MOVES = (Object.keys(MOVE_SHAPE) as PathMove[]).filter((m) => pathFor(m, 'right'));

describe('the ball hand after each move (the catch hand)', () => {
  for (const start of ['right', 'left'] as const) {
    for (const move of PATH_MOVES) {
      const crosses = MOVE_SHAPE[move as keyof typeof MOVE_SHAPE].crosses;
      const end = crosses % 2 === 1 ? (start === 'right' ? 'left' : 'right') : start;
      it(`${move} from the ${start} hand (${crosses} crossing${crosses === 1 ? '' : 's'}) ends in the ${end} hand, and the dribble stays there`, () => {
        const r = hoopsNodeRig(start); toTop(r);
        expect(r.carry.hand.toLowerCase()).toBe(start);
        const { lows } = play(r, move, 2.5);
        expect(r.carry.hand.toLowerCase(), 'the carry\'s hand').toBe(end);
        expect(lows.length, 'bounces after the move').toBeGreaterThanOrEqual(3);
        for (const x of lows) { expect(sideOf(x), `a bounce at x ${x.toFixed(3)}`).toBe(end); expect(Math.abs(x)).toBeGreaterThan(0.15); }
        r.dispose();
      });
    }
  }
  it('the named ones, as the owner asked: a cross, a between-the-legs, a behind-the-back, a momentum cross and a spin switch hands; a hesi, an in-and-out and a size-up (the yoyo) do not', () => {
    for (const m of ['crossover', 'between_legs', 'behind_back', 'momentum_cross', 'spin'] as const) expect(MOVE_SHAPE[m].crosses, m).toBe(1);
    for (const m of ['hesi', 'in_and_out', 'yoyo'] as const) expect(MOVE_SHAPE[m].crosses, m).toBe(0);
  });
});

describe('crossing back and forth', () => {
  it('six crossovers in a row alternate R→L→R→L→R→L→R, the dribble on the new side between every one', () => {
    const r = hoopsNodeRig('right'); toTop(r);
    const hands: string[] = [];
    for (let i = 0; i < 6; i++) {
      const { lows } = play(r, 'crossover', 0.9, 0.3);
      hands.push(r.carry.hand);
      for (const x of lows) expect(sideOf(x)).toBe(r.carry.hand.toLowerCase());
    }
    expect(hands).toEqual(['Left', 'Right', 'Left', 'Right', 'Left', 'Right']);
    r.dispose();
  });
  it('the left hand holds at a standstill and at a run — 4 s each, no input', () => {
    for (const speed of [0, 0.85]) {
      const r = hoopsNodeRig('right'); toTop(r, speed);
      const { lows } = play(r, 'crossover', 4, speed);
      expect(r.carry.hand).toBe('Left');
      expect(lows.length).toBeGreaterThanOrEqual(6);
      expect(lows.every((x) => x < -0.15)).toBe(true);
      r.dispose();
    }
  });
});

describe('the left hand\'s dribble is the right hand\'s mirror about the midline', () => {
  for (const speed of [0, 0.6]) {
    it(`at speed01 ${speed}: the ball and the palm, frame for frame (x negated, y and z the same)`, () => {
      const R = hoopsNodeRig('right'), L = hoopsNodeRig('left');
      for (let i = 0; i < 150; i++) {
        const pr = R.local(R.frame(DT, speed, true)), pl = L.local(L.frame(DT, speed, true));
        expect(pl.x, `frame ${i} x`).toBeCloseTo(-pr.x, 3); expect(pl.y, `frame ${i} y`).toBeCloseTo(pr.y, 3); expect(pl.z, `frame ${i} z`).toBeCloseTo(pr.z, 3);
        const ar = R.palm(), al = L.palm();
        expect(al.left, `frame ${i}: the left palm as the right one was`).toBeCloseTo(ar.right, 3);
      }
      expect(R.carry.hand).toBe('Right'); expect(L.carry.hand).toBe('Left');
      R.dispose(); L.dispose();
    });
  }
});

describe('no hand through the ball (the PROTECT stance: no ball arm, the hand at the hip)', () => {
  it('clearOfBallWeight: none while the clip\'s hand is clear; enough to put it on the ball\'s top as the ball rises past it', () => {
    expect(clearOfBallWeight(1.0, 1.1, 0.6)).toBe(0);                 // the ball well under the hand
    expect(clearOfBallWeight(0.87, 1.13, 0.98, 0)).toBeCloseTo((0.98 - 0.87) / (1.13 - 0.87), 6);
    expect(clearOfBallWeight(0.87, 1.13, 1.20)).toBe(1);               // past the target: all the way
    expect(clearOfBallWeight(0.87, 0.87, 1.0)).toBe(0);                // no target above the hand: nothing to blend
  });
  /** The PROTECT stance (rig, base: the ball hand's bone at 0.86–0.87 m on the ball's line — 0.26 m out, 0.16 m ahead — through the
   *  whole flight, and the ball rising through it). On the game's hero the flight's 0.6 blend did not lift that hand (measured the same
   *  with ?nomotion=1: the carry's own pass); on this rig it would, so the stand-in clip holds the hand lower, at 0.64 m, where the blend
   *  alone still leaves the wrist inside the rising ball — the case the clearance closes. Posed before every pass, as a clip poses it. */
  const protectClip = (start: 'right' | 'left') => (n: Record<string, import('@babylonjs/core').TransformNode>) => {
    const sk = n.Hips.getScene().skeletons[0]; const root = n.Hips.parent as import('@babylonjs/core').TransformNode;
    const rig = start === 'right' ? 'Left' : 'Right'; const x = start === 'right' ? 0.26 : -0.26;
    const ch = armChain(sk, rig)!; root.computeWorldMatrix(true);
    const toW = (lx: number, ly: number, lz: number) => Vector3.TransformCoordinates(new Vector3(lx, ly, lz), root.getWorldMatrix());
    for (const k of Object.values(n)) k.computeWorldMatrix(true);
    reachArm(ch, toW(x, 0.64, 0.16), toW(x * 2, 1.0, -0.4).subtract(root.getAbsolutePosition()), 1);
  };
  for (const start of ['right', 'left'] as const) {
    it(`standing, the ${start} hand: the ball hand's palm read never goes inside the ball (≥ −0.045 m: the held palm is −0.03)`, () => {
      const r = hoopsNodeRig(start, protectClip(start), 1.6);   // an arm long enough to hold the hand there
      // the stand-in clip really holds the hand on the ball's line at the hip (the case: without the carry's reach it sits inside the
      // ball's path)
      r.scene.onBeforeAnimationsObservable.notifyObservers(r.scene);
      const hand = r.nodes[start === 'right' ? 'LeftHand' : 'RightHand']; hand.computeWorldMatrix(true);
      const h = r.local(hand.getAbsolutePosition());
      expect(h.y).toBeCloseTo(0.64, 2); expect(Math.abs(h.x)).toBeCloseTo(0.26, 2);
      let worst = Infinity;
      for (let i = 0; i < 240; i++) { r.frame(DT, 0, true); const p = r.palm(); worst = Math.min(worst, start === 'right' ? p.right : p.left); }
      expect(worst).toBeGreaterThanOrEqual(-0.045);
      r.dispose();
    });
  }
});
