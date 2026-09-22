// boards pass phase 4 (2026-09-22): the THPS combo loop on the TrickMachine (snow / surf / carnival's gauntlet).
//
// Before: the combo banked the FRAME after every landing, so `combo` never passed 1× in play; the same trick mashed eight
// times paid 8× (skate's masher lesson, unlearned on the other two boards); the bank was silent. Now a landing opens a grace
// window in which the next trick is the next link, repeats decay to nothing, and the bank names the line.
import { describe, expect, it } from 'vitest';
import { TRICKS, TrickMachine, type BoardRig } from './boardCore';

function fake() {
  const rider = { grounded: true, vel: { scaleInPlace: () => undefined }, jump: () => undefined };
  const rig = { char: { root: { rotation: { y: 0, z: 0 } }, animator: { play: () => undefined } }, rider } as unknown as BoardRig;
  const hud: Record<string, string | number>[] = [];
  const tm = new TrickMachine(rig, (h) => hud.push(h), { anim: 'external' });
  /** pop, throw `t`, hold the air for `airSec`, land, and return the landing banner */
  const land = (t: typeof TRICKS.grab, airSec = 1.2): string | null => {
    rider.grounded = false; tm.start(t);
    for (let i = 0; i < airSec * 60; i++) tm.update(1 / 60);
    rider.grounded = true; return tm.update(1 / 60);
  };
  /** ride the ground for `sec`, returning the first banner (the bank) if one fires */
  const ride = (sec: number): string | null => { let b: string | null = null; for (let i = 0; i < sec * 60; i++) b = tm.update(1 / 60) ?? b; return b; };
  return { tm, land, ride, hud };
}

describe('TrickMachine combo loop (phase 4)', () => {
  it('a second trick inside the grace window is the 2× link; the bank names the line', () => {
    const { tm, land, ride } = fake();
    expect(land(TRICKS.grab)).toBe('GRAB +90');
    expect(ride(0.5)).toBeNull();                                   // still open: no bank inside the window
    expect(land(TRICKS.spin)).toBe('360 +280 (2×)');                // 140 × 2
    expect(tm.combo).toBe(2);
    const bank = ride(TrickMachine.LINK_GRACE_SEC + 0.1);
    expect(bank).toBe('BANKED +370 · GRAB → 360');
    expect(tm.score).toBe(370);
    expect(tm.combo).toBe(0);
  });

  it('the same trick again decays (75 / 50 / 25 / 10 %) and then is no link at all', () => {
    const { land } = fake();
    expect(land(TRICKS.grab)).toBe('GRAB +90');
    expect(land(TRICKS.grab)).toBe('GRAB · REPEAT ×2 +136 (2×)');   // 68 × 2
    expect(land(TRICKS.grab)).toBe('GRAB · REPEAT ×3 +135 (3×)');   // 45 × 3
    // the 4th and 5th repeats pay their decayed points but no longer raise the multiplier (REPEAT_NO_MULT = 3)
    expect(land(TRICKS.grab)).toBe('GRAB · REPEAT ×4 +69 (3×)');    // 23 × 3
    expect(land(TRICKS.grab)).toBe('GRAB · REPEAT ×5 +27 (3×)');    // 9 × 3
    expect(land(TRICKS.grab)).toBe('GRAB · REPEAT — NOTHING');
  });

  it('a bail drops the open combo and its memory', () => {
    const { tm, land, ride } = fake();
    land(TRICKS.grab); land(TRICKS.spin);
    tm.bail();
    expect(tm.comboPts).toBe(0);
    expect(ride(2)).toBeNull();                                     // nothing to bank
    expect(land(TRICKS.grab)).toBe('GRAB +90');                     // the repeat memory went with the combo
  });

  // phase 6 — the landing read: the fraction of the turn completed at touchdown (0.95 clean / 0.7 sketchy / below = bail)
  it('a spin cut short lands sketchy for half, and shorter still is the bail', () => {
    const { land } = fake();
    expect(land(TRICKS.spin, 1.2)).toBe('360 +140');                    // 2.2 turns/s × 1.2 s: the full turn
    expect(land(TRICKS.flipA, 0.35)).toBe('SKETCHY KICKFLIP +120 (2×)');   // 0.77 of the flip: half of 120 at 2×
    expect(land(TRICKS.spin, 0.2)).toBe('BAILED');                      // 0.44 of the turn
  });
  it('a grab poked rather than held lands sketchy', () => {
    const { land } = fake();
    expect(land(TRICKS.grab, 0.2)).toBe('SKETCHY GRAB +45');            // held 0.2 s (0.8 of the 0.25 s a clean grab needs)
    expect(land(TRICKS.spin, 1.2)).toBe('360 +280 (2×)');                // the sketchy grab still counted as a link
    expect(land(TRICKS.grab, 0.05)).toBe('BAILED');                      // 0.05 s: a poke too short even for sketchy (0.1 s)
  });

  it('letting the window run out banks, and the next trick starts a fresh 1× line', () => {
    const { land, ride } = fake();
    land(TRICKS.grab);
    expect(ride(2)).toMatch(/^BANKED \+90 · GRAB$/);
    expect(land(TRICKS.grab)).toBe('GRAB +90');
  });
});
