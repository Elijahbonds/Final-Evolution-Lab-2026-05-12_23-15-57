import { describe, expect, it } from 'vitest';
import { answerOwner, playerForSlot } from './localPads';

describe('local pads', () => {
  it('seats four pads on four players', () => {
    expect([0, 1, 2, 3].map((slot) => playerForSlot(slot, 4))).toEqual([0, 1, 2, 3]);
  });

  it('does not let P1s d-pad answer for P2 when two pads are in', () => {
    const pads = 4;
    const seats = [0, 1, 2, 3].map((slot) => ({
      face: answerOwner({ pads, slot, playerCount: 2, from: 'face' }),
      dpad: answerOwner({ pads, slot, playerCount: 2, from: 'dpad' }),
    }));
    expect(seats[0]).toEqual({ face: 0, dpad: null });
    expect(seats[1]).toEqual({ face: null, dpad: 1 });
    expect(seats[2]).toEqual({ face: null, dpad: null });
    expect(seats[3]).toEqual({ face: null, dpad: null });
  });

  it('keeps keyboard arrows as P2 only when fewer than two pads are connected', () => {
    expect(answerOwner({ pads: 0, slot: 0, playerCount: 2, from: 'key-dpad' })).toBe(1);
    expect(answerOwner({ pads: 1, slot: 0, playerCount: 2, from: 'dpad' })).toBe(1);
    expect(answerOwner({ pads: 2, slot: 0, playerCount: 2, from: 'key-dpad' })).toBeNull();
  });
});
