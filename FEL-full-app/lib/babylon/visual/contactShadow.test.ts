import { describe, it, expect } from 'vitest';
import { followFloor, type FloorState } from './contactShadow';

describe('the contact disc never floats over the feet (GATE-CRASHER-MAJOR)', () => {
  it('follows a body down a slope at once', () => {
    // the snow rider: 11 m/s down a 0.22 rad piste drops ~2.5 m a second
    const st: FloorState = { floorY: 0, awaySince: -1 };
    let worst = 0;
    for (let f = 1; f <= 180; f++) {
      const y = -2.5 * (f / 60);
      followFloor(st, y, f / 60);
      worst = Math.max(worst, st.floorY - y);
    }
    expect(worst).toBeLessThan(0.03);
  });
  it('still stays on the floor through a jump, and re-anchors on a platform it stays on', () => {
    const st: FloorState = { floorY: 0, awaySince: -1 };
    followFloor(st, 1.2, 0.1);                 // in the air: the disc keeps the floor
    expect(st.floorY).toBe(0);
    followFloor(st, 1.2, 0.5);
    expect(st.floorY).toBe(0);
    followFloor(st, 1.2, 1.8);                 // still up there 1.7 s later: a platform
    expect(st.floorY).toBe(1.2);
  });
  it('rides a small step without a pop', () => {
    const st: FloorState = { floorY: 0, awaySince: -1 };
    followFloor(st, 0.1, 0.1);
    expect(st.floorY).toBeCloseTo(0.02, 6);
  });
});
