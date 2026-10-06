// IMPROVE (2026-10-06, surf item 15): a move made on the ground is a LINK in the TrickMachine's chain (TrickMachine.link) —
// surf's wave moves and near misses. Cutback → air → snap multiplies; a wave move's own points are paid outside the pot (as they
// always were), so the pot takes only what the chain adds; a lone link that put nothing in the pot closes quietly.
import { describe, expect, it } from 'vitest';
import { TRICKS, TrickMachine, type BoardRig } from './boardCore';

function fake() {
  const rider = { grounded: true, vel: { scaleInPlace: () => undefined }, jump: () => undefined };
  const rig = { char: { root: { rotation: { y: 0, z: 0 } }, animator: { play: () => undefined } }, rider } as unknown as BoardRig;
  const hud: Record<string, string | number>[] = [];
  const tm = new TrickMachine(rig, (h) => hud.push(h), { anim: 'external' });
  const land = (t: typeof TRICKS.grab, airSec = 1.2): string | null => {
    rider.grounded = false; tm.start(t);
    for (let i = 0; i < airSec * 60; i++) tm.update(1 / 60);
    rider.grounded = true; return tm.update(1 / 60);
  };
  const ride = (sec: number): string | null => { let b: string | null = null; for (let i = 0; i < sec * 60; i++) b = tm.update(1 / 60) ?? b; return b; };
  return { tm, land, ride, hud };
}

describe('TrickMachine.link — a ground move in the chain (surf item 15)', () => {
  it('cutback → air → snap multiplies: the air lands at 2×, the snap adds its 3× share on top of its own points', () => {
    const { tm, land, ride } = fake();
    expect(tm.link('CUTBACK', 100, true)).toBe(0);          // 1×: paid outside, nothing for the pot yet
    expect(tm.combo).toBe(1);
    expect(land(TRICKS.grab)).toBe('GRAB +180 (2×)');        // the air after it lands at the multiplier it raised
    expect(tm.link('SNAP', 120, true)).toBe(240);            // 3×: the pot takes 120 × (3 − 1)
    expect(tm.comboPts).toBe(180 + 240);
    expect(ride(TrickMachine.LINK_GRACE_SEC + 0.1)).toBe('BANKED +420 · CUTBACK → GRAB → SNAP');
    expect(tm.score).toBe(420);                              // (the moves' own 220 the mode paid at once)
  });

  it('a link paid into the pot (a near miss) pays its points at the multiplier', () => {
    const { tm, land } = fake();
    land(TRICKS.grab);
    expect(tm.link('NEAR MISS', 50)).toBe(100);              // 2×
    expect(tm.comboPts).toBe(90 + 100);
  });

  it('a lone paid-outside link closes quietly when its window runs out — it cannot multiply a landing a minute later', () => {
    const { tm, land, ride, hud } = fake();
    tm.link('BOTTOM TURN', 40, true);
    expect(ride(TrickMachine.LINK_GRACE_SEC + 0.1)).toBeNull();   // no "BANKED +0"
    expect(tm.combo).toBe(0);
    expect(hud.at(-1)).toEqual({ pot: 0 });
    expect(land(TRICKS.grab)).toBe('GRAB +90');                    // 1×, a fresh chain
  });

  it('the multiplier cap still holds: a link repeated to death stops raising it', () => {
    const { tm } = fake();
    for (let i = 0; i < 6; i++) tm.link('CUTBACK', 10, true);
    expect(tm.combo).toBe(3);                                     // REPEAT_NO_MULT
  });

  it('a wipe (bail) loses the chain\'s share with the pot', () => {
    const { tm, land } = fake();
    tm.link('CUTBACK', 100, true); land(TRICKS.grab); tm.link('SNAP', 120, true);
    tm.bail();
    expect(tm.comboPts).toBe(0);
    expect(tm.score).toBe(0);
  });
});
