// THE STANCE HAD TO ACTUALLY DO SOMETHING (2026-09-13).
//
// The animation was already in both modes — defending, slideDir, the two slide clips, a defend_idle in the
// tree — and it changed the body by nothing. A crouched defender covered ground exactly like an upright
// one, measured by reading every speed path in 1v1 and 3v3. These tests pin the trade that makes it a
// decision rather than a costume.

import { describe, it, expect } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import {
  inStance, stanceWish, lateralAuthority,
  STANCE_RANGE, STANCE_SPRINT_MAX, STANCE_LATERAL_GAIN, STANCE_FORWARD_PENALTY, UPRIGHT_LATERAL_PENALTY,
} from './DefensiveStance';

const guarding = { onDefense: true, distToMan: 1.5, speed01: 0.3 };

describe('when you are in a stance at all', () => {
  it('guarding somebody close, not sprinting', () => {
    expect(inStance(guarding)).toBe(true);
  });

  it('never on offence', () => {
    expect(inStance({ ...guarding, onDefense: false })).toBe(false);
  });

  it('NOT WHILE SPRINTING — sprinting is standing up, and that is what makes it a choice', () => {
    expect(inStance({ ...guarding, speed01: STANCE_SPRINT_MAX + 0.01 })).toBe(false);
    expect(inStance({ ...guarding, speed01: STANCE_SPRINT_MAX })).toBe(true);
  });

  it('not with nobody to guard — you are recovering, not sliding', () => {
    expect(inStance({ ...guarding, distToMan: STANCE_RANGE + 0.1 })).toBe(false);
    expect(inStance({ ...guarding, distToMan: Infinity })).toBe(false);
  });

  it('not while stunned or on the floor', () => {
    expect(inStance({ ...guarding, disabled: true })).toBe(false);
  });
});

describe('THE TRADE', () => {
  const yaw = 0;                                   // facing +z
  const forwardWish = new Vector3(0, 0, 1);
  const lateralWish = new Vector3(1, 0, 0);

  it('in a stance you slide FASTER sideways', () => {
    const on = stanceWish(lateralWish, yaw, true);
    const off = stanceWish(lateralWish, yaw, false);
    expect(on.length()).toBeGreaterThan(off.length());
    expect(on.length()).toBeCloseTo(STANCE_LATERAL_GAIN, 5);
  });

  it('and you go forward SLOWER — the stance costs something', () => {
    const on = stanceWish(forwardWish, yaw, true);
    const off = stanceWish(forwardWish, yaw, false);
    expect(on.length()).toBeLessThan(off.length());
    expect(on.length()).toBeCloseTo(STANCE_FORWARD_PENALTY, 5);
  });

  it('upright you are quick forward and SLOW sideways — which is why the crossover works', () => {
    expect(stanceWish(forwardWish, yaw, false).length()).toBeCloseTo(1, 5);
    expect(stanceWish(lateralWish, yaw, false).length()).toBeCloseTo(UPRIGHT_LATERAL_PENALTY, 5);
  });

  it('THE SAME INPUT PRODUCES A DIFFERENT BODY DEPENDING WHERE IT ASKS TO GO — the whole idea', () => {
    const on = stanceWish(lateralWish, yaw, true).length() / stanceWish(forwardWish, yaw, true).length();
    const off = stanceWish(lateralWish, yaw, false).length() / stanceWish(forwardWish, yaw, false).length();
    expect(on).toBeGreaterThan(1);      // in a stance, sideways is your best direction
    expect(off).toBeLessThan(1);        // upright, it is your worst
  });
});

describe('the maths behaves', () => {
  it('respects the facing rather than the world axes', () => {
    // facing +x now: a wish along +x is FORWARD, so it takes the forward penalty, not the lateral gain
    const yaw = Math.PI / 2;
    const along = stanceWish(new Vector3(1, 0, 0), yaw, true);
    expect(along.length()).toBeCloseTo(STANCE_FORWARD_PENALTY, 5);
  });

  it('does not mutate the input — a mode passing its own velocity must not compound every frame', () => {
    const wish = new Vector3(1, 0, 1);
    const before = wish.clone();
    stanceWish(wish, 0.7, true);
    expect(wish.equalsWithEpsilon(before, 1e-9)).toBe(true);
  });

  it('a zero wish stays zero in both states', () => {
    for (const engaged of [true, false]) {
      expect(stanceWish(new Vector3(0, 0, 0), 1.2, engaged).length()).toBeCloseTo(0, 9);
    }
  });

  it('y is carried through untouched — this is a planar decision', () => {
    expect(stanceWish(new Vector3(1, 5, 1), 0, true).y).toBe(5);
  });

  it('a brain and a body cannot disagree about lateral authority', () => {
    expect(lateralAuthority(true)).toBeGreaterThan(lateralAuthority(false));
    expect(lateralAuthority(true)).toBe(1);
  });
});
