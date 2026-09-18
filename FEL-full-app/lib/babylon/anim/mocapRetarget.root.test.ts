// THE ROOT TRACK (2026-09-15): a flip / cartwheel / spin comes out as the pelvis's orientation, and the pose keys stay an
// upright body inside it.
import { describe, it, expect } from 'vitest';
import { retargetToPoseKeys, quatFromAxes, CANON, type Canon, type V3, type JointStream } from './mocapRetarget';

function body(): Record<Canon, V3> {
  return {
    Hips: [0, 100, 0], Chest: [0, 140, 0], Neck: [0, 155, 0], Head: [0, 170, 0],
    LeftArm: [-18, 150, 0], LeftForeArm: [-20, 122, -6], LeftHand: [-20, 96, 4],
    RightArm: [18, 150, 0], RightForeArm: [20, 122, -6], RightHand: [20, 96, 4],
    LeftUpLeg: [-10, 95, 0], LeftLeg: [-10, 52, 6], LeftFoot: [-10, 8, 0], LeftToe: [-10, 2, 16],
    RightUpLeg: [10, 95, 0], RightLeg: [10, 52, 6], RightFoot: [10, 8, 0], RightToe: [10, 2, 16],
  };
}
/** Rotate the whole body about its hips: axis 'x' = a flip (pitch), 'z' = a cartwheel (roll), 'y' = a spin; lift by `up` cm. */
function turned(axis: 'x' | 'y' | 'z', deg: number, up = 0): Record<Canon, V3> {
  const b = body(), a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), hy = 100;
  const out = {} as Record<Canon, V3>;
  for (const j of CANON) {
    const [x, y0, z] = b[j]; const y = y0 - hy;
    let p: V3;
    if (axis === 'x') p = [x, y * c - z * s, y * s + z * c];
    else if (axis === 'z') p = [x * c - y * s, x * s + y * c, z];
    else p = [x * c + z * s, y, -x * s + z * c];
    out[j] = [p[0], p[1] + hy + up, p[2]];
  }
  return out;
}
const stream = (frames: Record<Canon, V3>[]): JointStream => ({ fps: 30, frames });
const qAngleDeg = (q: number[]) => (2 * Math.acos(Math.min(1, Math.abs(q[3]))) * 180) / Math.PI;

describe('quatFromAxes', () => {
  it('a 90° yaw (front → +x) is the quaternion Babylon builds for RotationYawPitchRoll(π/2, 0, 0)', () => {
    const q = quatFromAxes([0, 0, -1], [0, 1, 0], [1, 0, 0]);
    expect(q[0]).toBeCloseTo(0); expect(q[1]).toBeCloseTo(Math.SQRT1_2); expect(q[2]).toBeCloseTo(0); expect(q[3]).toBeCloseTo(Math.SQRT1_2);
  });
});

describe('the root track', () => {
  it('a BACKFLIP comes out as the pelvis turning over, while the body keys stay upright', () => {
    const frames = Array.from({ length: 31 }, (_, i) => turned('x', -360 * (i / 30), 60 * Math.sin((Math.PI * i) / 30)));
    const r = retargetToPoseKeys(stream(frames), { from: 0, to: 1, smoothSec: 0, keyFps: 30, rootTrack: true });
    expect(r.root).toBeDefined();
    const mid = r.root![Math.floor(r.root!.length / 2)];
    expect(qAngleDeg(mid.slice(1, 5))).toBeGreaterThan(150);          // upside down at the top
    expect(mid[5]).toBeGreaterThan(0.3);                               // and in the air
    for (const k of r.keys) {
      expect(k.hands!.Right![1]).toBeLessThan(1.2);                    // the hands stay where they hang, in the body's frame
      expect(k.feet!.Left![1]).toBeLessThan(0.3);
      expect(k.bones!.Hips).toEqual([0, 0, 0]);
    }
    // consecutive keys stay in one hemisphere (a slerp never takes the long way round)
    for (let i = 1; i < r.root!.length; i++) {
      const a = r.root![i - 1], b = r.root![i];
      expect(a[1] * b[1] + a[2] * b[2] + a[3] * b[3] + a[4] * b[4]).toBeGreaterThan(0);
    }
  });

  it('a CARTWHEEL rolls about the front axis; a SPIN turns about up', () => {
    const cart = retargetToPoseKeys(stream(Array.from({ length: 31 }, (_, i) => turned('z', 360 * (i / 30)))), { from: 0, to: 1, smoothSec: 0, keyFps: 30, rootTrack: true });
    const cm = cart.root![15];
    expect(Math.abs(cm[3])).toBeGreaterThan(0.9);                      // the z (front) part carries it at 180°
    const spin = retargetToPoseKeys(stream(Array.from({ length: 31 }, (_, i) => turned('y', 270 * (i / 30)))), { from: 0, to: 1, smoothSec: 0, keyFps: 30, rootTrack: true });
    const sq = spin.root![20];
    expect(Math.abs(sq[2])).toBeGreaterThan(Math.abs(sq[1]));          // y part dominates
    expect(Math.abs(sq[2])).toBeGreaterThan(Math.abs(sq[3]));
  });

  it('standing still is an identity track at zero height', () => {
    const r = retargetToPoseKeys(stream(Array.from({ length: 20 }, () => body())), { from: 0, to: 0.6, smoothSec: 0, rootTrack: true });
    for (const k of r.root!) { expect(qAngleDeg(k.slice(1, 5))).toBeLessThan(2); expect(Math.abs(k[5])).toBeLessThan(0.08); }
  });
});
