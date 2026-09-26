// strikeVeto — the three rules the floor and the fight reader share (movement play P7). The floor's own streams still pin
// its behaviour (lib/input/bodyFloor.test.ts, spaceGate); these pin the rules themselves.
import { describe, it, expect } from 'vitest';
import { StrikeVeto, CROUCH_DEAD, STRIKE_LOOKBACK_MS, STRIKE_SQUAT_MOVE, OVERHEAD_STRIKE_MS } from './strikeVeto';

const feed = (v: StrikeVeto, from: number, to: number, squat: (t: number) => number | null, overhead: (t: number) => boolean = () => false) => {
  for (let t = from; t <= to; t += 33) v.push(t, squat(t), overhead(t));
};

describe('StrikeVeto', () => {
  it('a strike on the ground from a stand counts', () => {
    const v = new StrikeVeto();
    feed(v, 0, 1000, () => 0.05);
    expect(v.ok(990, 0.05, false)).toBe(true);
  });
  it('no strike in a jump', () => {
    const v = new StrikeVeto();
    feed(v, 0, 1000, () => 0.05);
    expect(v.ok(990, null, true)).toBe(false);
  });
  it('none within OVERHEAD_STRIKE_MS of both wrists overhead (the arms coming down)', () => {
    const v = new StrikeVeto();
    feed(v, 0, 1000, () => 0.05, (t) => t <= 500);
    expect(v.overheadAt).toBe(495);
    expect(v.ok(495 + OVERHEAD_STRIKE_MS, 0.05, false)).toBe(false);
    expect(v.ok(495 + OVERHEAD_STRIKE_MS + 1, 0.05, false)).toBe(true);
  });
  it('none out of a MOVING crouch (a jump\'s gather); a crouch HELD is a fighting stance', () => {
    const moving = new StrikeVeto();
    feed(moving, 0, 1000, (t) => (t < 800 ? 0.05 : 0.05 + (t - 800) / 200 * 0.4));   // dipping to 0.45
    expect(moving.inGather(990, 0.45)).toBe(true);
    expect(moving.ok(990, 0.45, false)).toBe(false);
    const held = new StrikeVeto();
    feed(held, 0, 1000, () => CROUCH_DEAD + 0.1);
    expect(held.inGather(990, CROUCH_DEAD + 0.1)).toBe(false);
    expect(held.ok(990, CROUCH_DEAD + 0.1, false)).toBe(true);
  });
  it('a shallow dip (never CROUCH_DEAD) is no gather however it moves', () => {
    const v = new StrikeVeto();
    feed(v, 0, 1000, (t) => 0.02 + (Math.sin(t / 60) + 1) * 0.12);
    expect(v.inGather(990, 0.2)).toBe(false);
  });
  it('judges the crouch at the strike\'s own instant, told late: crouched then (or now), and moving over the lookback', () => {
    const v = new StrikeVeto();
    // crouched and moving at 600, stood up since
    feed(v, 0, 1000, (t) => (t < 400 ? 0.05 : t < 650 ? 0.05 + (t - 400) / 250 * (CROUCH_DEAD + 0.05) : 0.05));
    expect(v.inGather(640, 0.05)).toBe(true);
    expect(v.inGather(990, 0.05)).toBe(false);
    expect(STRIKE_SQUAT_MOVE).toBeGreaterThan(0);
    expect(STRIKE_LOOKBACK_MS).toBe(300);
  });
  it('clearSquats forgets the crouch but keeps the overhead instant; reset forgets both', () => {
    const v = new StrikeVeto();
    feed(v, 0, 300, () => 0.5, () => true);
    v.clearSquats();
    expect(v.overheadAt).toBe(297);
    v.reset();
    expect(v.overheadAt).toBe(-Infinity);
  });
});
