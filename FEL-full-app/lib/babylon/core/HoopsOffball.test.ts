import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import {
  pickScreenSide, screenSpot, stepScreen, SCREEN_IDLE, rollLaneOpen, rollTarget, navigateAround, boxOutSpot, boardWinner, jobObjective,
  SCREEN_HOLD_SEC, SCREEN_AFTER_SEC, SCREEN_OFFSET, BOX_OUT_GAP, NAVIGATE_OFFSET, CRASH_RADIUS,
} from './HoopsOffball';

const RIM = new Vector3(0, 3.05, -0.6);
const V = (x: number, z: number) => new Vector3(x, 0, z);

describe('O1 — the screen', () => {
  it('the screen goes on the middle shoulder: a handler on the right gets the left-side spot, and the spot sits beside the defender toward the handler', () => {
    expect(pickScreenSide(V(3, 6), RIM)).toBe(-1); expect(pickScreenSide(V(-3, 6), RIM)).toBe(1);
    const def = V(0, 4), handler = V(0, 6);
    const spot = screenSpot(def, handler, RIM, 1);
    expect(Math.abs(spot.x)).toBeCloseTo(SCREEN_OFFSET, 5);   // beside him, perpendicular to his line to the rim
    expect(spot.z).toBeGreaterThan(def.z);                    // a step toward the handler
    expect(spot.z).toBeLessThan(handler.z);
  });
  it('approach → SET when at the spot → holds the plant → ROLL (lane open) or POP, then done', () => {
    const spot = V(0.8, 4.2);
    let st = stepScreen(SCREEN_IDLE, 0.1, V(3, 5), spot, V(0, 6), RIM, true);
    expect(st.phase).toBe('approach');
    st = stepScreen(st, 0.1, V(0.9, 4.3), spot, V(0, 6), RIM, true);
    expect(st.phase).toBe('set');
    for (let i = 0; i < 10; i++) st = stepScreen(st, 0.1, V(0.9, 4.3), spot, V(0, 6), RIM, true);   // 1.0 s of the 1.2 s hold
    expect(st.phase).toBe('set');
    st = stepScreen(st, SCREEN_HOLD_SEC - 1.0 + 0.05, V(0.9, 4.3), spot, V(0, 6), RIM, true);
    expect(st.phase).toBe('roll');
    for (let t = 0; t < SCREEN_AFTER_SEC + 0.1; t += 0.1) st = stepScreen(st, 0.1, V(0.9, 4.3), spot, V(0, 6), RIM, true);
    expect(st.phase).toBe('done');
    // a closed lane pops instead
    let p = stepScreen({ ...SCREEN_IDLE, phase: 'set', heldSec: SCREEN_HOLD_SEC }, 0.1, V(0.9, 4.3), spot, V(0, 6), RIM, false);
    expect(p.phase).toBe('pop');
    void p;
  });
  it('the handler USING the screen (driving past it) releases the plant early', () => {
    let st = { ...SCREEN_IDLE, phase: 'set' as const, heldSec: 0.2 };
    st = stepScreen(st, 0.1, V(0.9, 4.3), V(0.8, 4.2), V(0, 3.0), RIM, true);   // the handler is 0.6 m nearer the rim than the screener
    expect(st.phase).toBe('roll');
  });
  it('the roll lane and its target', () => {
    expect(rollLaneOpen(V(1, 4), RIM, [V(-3, 2)])).toBe(true);
    expect(rollLaneOpen(V(1, 4), RIM, [V(0.6, 1.8)])).toBe(false);
    const t = rollTarget(V(1, 4), RIM);
    expect(Math.hypot(t.x - RIM.x, t.z - RIM.z)).toBeCloseTo(CRASH_RADIUS, 5);
  });
  it('the defender navigates a set screener between him and his spot: OVER toward the ball, UNDER away; nothing when clear', () => {
    const self = V(0, 3), target = V(0, 5), screener = V(0.1, 3.9), ball = V(1.5, 5.5);
    const over = navigateAround(self, target, screener, ball, true)!, under = navigateAround(self, target, screener, ball, false)!;
    expect(over).not.toBeNull(); expect(under).not.toBeNull();
    expect(Math.abs(over.x)).toBeCloseTo(NAVIGATE_OFFSET, 5);
    expect(Math.sign(over.x)).toBe(Math.sign(ball.x - self.x));
    expect(Math.sign(under.x)).toBe(-Math.sign(over.x));
    expect(navigateAround(self, target, V(2, 3.9), ball, true)).toBeNull();     // off the line
    expect(navigateAround(self, target, V(0, 2.5), ball, true)).toBeNull();     // behind him
  });
});

describe('O2 — the box-out and the board', () => {
  it('the seal sits between the man and the rim, facing the man', () => {
    const { spot, faceYaw } = boxOutSpot(V(0, 3), RIM);
    expect(spot.z).toBeCloseTo(3 - BOX_OUT_GAP, 5);
    expect(Math.cos(faceYaw)).toBeGreaterThan(0.99);   // yaw 0 = +z: facing the man who is at +z of the spot
  });
  it('the board: the nearest body is the favourite, a seal is worth a body length, the bounce jitters it', () => {
    const ball = V(0, 1);
    expect(boardWinner([{ team: 'me', pos: V(0, 1.5), boxing: false }, { team: 'foe', pos: V(0, 4), boxing: false }], ball, () => 0.5)).toBe('me');
    // 1.3 m further but sealing: wins (1.6 m edge)
    expect(boardWinner([{ team: 'me', pos: V(0, 1.5), boxing: false }, { team: 'foe', pos: V(0, 2.8), boxing: true }], ball, () => 0.5)).toBe('foe');
    expect(boardWinner([{ team: 'me', pos: V(0, 1.5), boxing: false }, { team: 'foe', pos: V(0, 3.5), boxing: true }], ball, () => 0.5)).toBe('me');
  });
});

describe('O3 — awareness: every job faces its objective', () => {
  it('jobs face the right thing', () => {
    const ctx = { ball: V(2, 5), rim: RIM, mark: V(1, 2), screened: V(0, 4) };
    expect(jobObjective('screen', ctx)).toBe(ctx.screened);
    expect(jobObjective('boxout', ctx)).toBe(ctx.mark); expect(jobObjective('onball', ctx)).toBe(ctx.mark);
    expect(jobObjective('crash', ctx)).toBe(RIM); expect(jobObjective('roll', ctx)).toBe(RIM);
    expect(jobObjective('space', ctx)).toBe(ctx.ball); expect(jobObjective('help', ctx)).toBe(ctx.ball);
    expect(jobObjective('boxout', { ball: ctx.ball, rim: RIM })).toBe(ctx.ball);   // no man: the ball
  });
});
