import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { rimApproachAim, rimReachWeight } from './rimReach';

describe('rimReach — the hand onto the iron on a game dunk', () => {
  const rim = new Vector3(0, 3.05, 0), R = 0.225, ballR = 0.12;
  it('a ball short of the ring and under its plane aims over the FRONT lip first, then straight in', () => {
    const out = new Vector3();
    rimApproachAim({ x: 0, y: 2.9, z: 0.33 }, rim, R, ballR, out);
    expect(out.z).toBeGreaterThan(R);                 // out past the front of the ring
    expect(out.y).toBeGreaterThan(rim.y);             // and above its plane
    rimApproachAim({ x: 0, y: 3.2, z: 0.1 }, rim, R, ballR, out);
    expect(out.x).toBe(0); expect(out.z).toBe(0);     // over the plane: the centre
    expect(out.y).toBeCloseTo(rim.y + ballR + 0.02, 5);
    rimApproachAim(null, rim, R, ballR, out);
    expect(out.z).toBe(0);
  });
  it('the weight is off early, on through the flush and the hang, off once the body drops, never on a swat', () => {
    const rk = 0.55;
    expect(rimReachWeight(0.1, rk, false)).toBe(0);
    expect(rimReachWeight(rk, rk, false)).toBe(1);
    expect(rimReachWeight(0.62, rk, false)).toBe(1);   // the rim hang parks the clock here
    expect(rimReachWeight(0.9, rk, false)).toBe(0);
    expect(rimReachWeight(rk, rk, true)).toBe(0);
    let prev = 0; for (let k = 0; k <= 1; k += 0.01) { const w = rimReachWeight(k, rk, false); expect(Math.abs(w - prev)).toBeLessThan(0.12); prev = w; }   // smooth
  });
});
