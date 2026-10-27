// hoops-p02 (1v1/3v3 phase 2): the AI's strip is a hand on the ball, never a roll (hoops/steals aiStripLands; core/ReachTell).
import { describe, expect, it } from 'vitest';
import { aiStripLands, STEAL_DICE_ON, STRIP_REACH_M, STRIP_BALL_MAX_Y } from './steals';
import { resolveAiReach } from '../core/ReachTell';

const handler = { x: 0, z: 0 };
describe('aiStripLands', () => {
  it('ships with the dice off', () => { expect(STEAL_DICE_ON).toBe(false); });
  it('a ball off the palm, on his side, inside his reach: the hand gets there', () => {
    expect(aiStripLands({ x: 0.3, z: 1.1 }, handler, { x: 0.3, y: 0.5, z: 0.3 }).lands).toBe(true);
  });
  it('the same ball held at the top of the dribble is not stripped — unless the bump jarred it loose', () => {
    const ball = { x: 0.3, y: STRIP_BALL_MAX_Y + 0.1, z: 0.3 };
    expect(aiStripLands({ x: 0.3, z: 1.1 }, handler, ball).lands).toBe(false);
    expect(aiStripLands({ x: 0.3, z: 1.1 }, handler, ball, true).lands).toBe(true);
  });
  it('a ball behind the handler\'s body is shielded', () => {
    const r = aiStripLands({ x: 0, z: 0.9 }, handler, { x: 0.05, y: 0.5, z: -0.35 });
    expect(r.clear).toBeLessThan(0.1); expect(r.lands).toBe(false);
  });
  it('out of reach is out of reach', () => {
    expect(aiStripLands({ x: 0, z: STRIP_REACH_M + 0.6 }, handler, { x: 0.4, y: 0.5, z: 0.2 }).lands).toBe(false);
  });
});

describe('resolveAiReach with the hand read: the outcome is the geometry, the roll is never drawn', () => {
  const base = { tellSec: 0.3, eligible: true, inRange: true, movedDuringTell: false, exposed: false, onHim: false, carrierSpeed: 0, foulSpeed: 3 };
  const noRoll = () => { throw new Error('rolled'); };
  it('hand on the ball → strip; off it → whiff', () => {
    expect(resolveAiReach({ ...base, roll: noRoll, handOnBall: true }, 0.25)).toBe('strip');
    expect(resolveAiReach({ ...base, roll: noRoll, handOnBall: false }, 0.25)).toBe('whiff');
  });
  it('moving the ball in the tell still beats it', () => {
    expect(resolveAiReach({ ...base, movedDuringTell: true, roll: noRoll, handOnBall: true }, 0.25)).toBe('whiff');
  });
  it('without the read (the A/B), today\'s roll', () => {
    expect(resolveAiReach({ ...base, roll: () => 0 }, 0.25)).toBe('strip');
    expect(resolveAiReach({ ...base, roll: () => 0.99 }, 0.25)).toBe('whiff');
  });
});
