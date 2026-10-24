// lane/h3-aware (PR #313's H3c, ported): who my teammates guard on their ball, their spacers' lanes, and "his man has the ball"
// (HAS_BALL_M, release 1.8 m → 1.0 m) — a screener beside the handler is not the handler.
import { afterEach, describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { DefenderBrain } from './BasketballCore';
import { assignMateMarks, foeSpaceAngle, hasBallM, possessionSwapOn, HAS_BALL_M, FOE_SPACE_ANGLE_K } from './PossessionSwap';
import { closeFeel, openFeel } from '@/tests/helpers/feelOpen';
import { setFeelSession } from '../../feel-panel/feel';
import { feelSessionBlock } from '../../feel-panel/sessionGate';

const DT = 1 / 60;
const HOOP = new Vector3(0, 3.05, -0.6);
const v = (x: number, z: number) => new Vector3(x, 0, z);

afterEach(() => closeFeel());

describe('assignMateMarks — on their ball the driver is mine; each teammate takes one of the others, the nearer first', () => {
  it('two teammates, two men off the ball: each takes the one by him', () => {
    expect(assignMateMarks([v(-4, 5), v(4, 5)], [v(0, 6.5), v(-4.5, 6.5), v(4.5, 6.5)], 0)).toEqual([1, 2]);
    expect(assignMateMarks([v(4, 5), v(-4, 5)], [v(0, 6.5), v(-4.5, 6.5), v(4.5, 6.5)], 0)).toEqual([2, 1]);
  });
  it('a swing makes a new driver: his old man is somebody\'s again, the new driver is nobody\'s but mine', () => {
    const marks = assignMateMarks([v(-4, 5), v(4, 5)], [v(0, 6.5), v(-4.5, 6.5), v(4.5, 6.5)], 1);
    expect(marks).not.toContain(1);
    expect(new Set(marks).size).toBe(2);
  });
  it('the first teammate takes the nearer man; the second the one left (never the same man twice)', () => {
    expect(assignMateMarks([v(-4, 5), v(-3, 5)], [v(0, 6.5), v(-4.5, 6.5), v(4.5, 6.5)], 0)).toEqual([1, 2]);
  });
  it('no driver (the ball in the air): all three are open to them', () => {
    expect(assignMateMarks([v(0, 6), v(4, 5)], [v(0, 6.5), v(-4.5, 6.5), v(4.5, 6.5)], -1)).toEqual([0, 2]);
  });
});

describe('their spacers\' lanes', () => {
  it('the wings at ±0.3π, the top at 0', () => {
    expect(foeSpaceAngle(0)).toBeCloseTo(FOE_SPACE_ANGLE_K * Math.PI, 9);
    expect(foeSpaceAngle(1)).toBe(0);
    expect(foeSpaceAngle(2)).toBeCloseTo(-FOE_SPACE_ANGLE_K * Math.PI, 9);
  });
});

// At 1.8 m the screener's defender left him to close out on the ball too (two or more defenders on the ball in 11 % of the frames
// someone had it, #313's _aware-read).
describe('DefenderBrain — the man with the ball (HAS_BALL_M)', () => {
  const at = (mark: Vector3, ball: Vector3) => {
    const brain = new DefenderBrain(0.6, 1, () => 0.99);
    const handler = v(0, 6.5), self = mark.add(v(0, -1.5));
    for (let t = 0; t < 1; t += DT) brain.decide(DT, self, ball, HOOP, [], [handler, mark]);
    return brain.job;
  };
  const screener = v(1.4, 6.5), ballInHandlersHand = new Vector3(0.3, 0.9, 6.5);
  it('ships at 1.0 m (release 1.8)', () => { expect(HAS_BALL_M).toBe(1.0); expect(hasBallM()).toBe(1.0); expect(possessionSwapOn()).toBe(true); });
  it('a screener 1.1 m off the ball: his man plays him (deny), not the ball', () => {
    expect(at(screener, ballInHandlersHand)).not.toMatch(/onball|closeout/);
  });
  it('the man with the ball in his hands: on the ball', () => {
    expect(at(screener, screener.add(new Vector3(0.3, 0.9, 0.1)))).toMatch(/onball|closeout/);
  });
  it('the knob read live: hoops.hasBallM 1.8 is release (the screener reads as the handler again)', () => {
    openFeel({ 'hoops.hasBallM': 1.8 });
    expect(hasBallM()).toBe(1.8);
    expect(at(screener, ballInHandlersHand)).toMatch(/onball|closeout/);
  });
  it('a ranked run ignores the override', () => {
    openFeel({ 'hoops.hasBallM': 1.8 });
    setFeelSession(feelSessionBlock('/play/threevthree', '?ranked=1'));
    expect(hasBallM()).toBe(HAS_BALL_M);
  });
});
