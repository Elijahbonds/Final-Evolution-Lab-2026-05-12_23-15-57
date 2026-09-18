import { describe, expect, it } from 'vitest';
import { BEATEN_M, scramSwitch } from './Matchups';

describe('scramSwitch', () => {
  const A = [{ x: -4, z: 4 }, { x: 0, z: 2 }, { x: 4, z: 4 }];   // attackers
  it('holds matchups when nobody is beaten', () => {
    const D = [{ x: -4, z: 5 }, { x: 0, z: 3 }, { x: 4, z: 5 }];
    const marks = [0, 1, 2];
    expect(scramSwitch(marks, D, A)).toBe(marks);                 // same reference: no change
  });
  it('swaps when a defender is beaten and a teammate is clearly closer to his man', () => {
    // defender 0 chased a drive to the rim (0, 1); his man (-4, 4) is open; defender 1 stands at (-3, 4)
    const D = [{ x: 0, z: 1 }, { x: -3, z: 4 }, { x: 4, z: 5 }];
    expect(scramSwitch([0, 1, 2], D, A)).toEqual([1, 0, 2]);
  });
  it('never leaves an attacker unmarked and never switches for a marginal gain', () => {
    const D = [{ x: -4, z: 4 + BEATEN_M + 0.1 }, { x: -4, z: 4 + BEATEN_M - 0.5 }, { x: 4, z: 5 }];   // teammate only 0.6 closer
    const r = scramSwitch([0, 1, 2], D, A);
    expect([...r].sort()).toEqual([0, 1, 2]);
    expect(r).toEqual([0, 1, 2]);
  });
});
