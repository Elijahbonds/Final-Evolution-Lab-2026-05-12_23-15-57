import { describe, it, expect } from 'vitest';
import { retargetToPoseKeys, mirrorKey, closeLoop, CANON, type JointStream, type Canon, type V3 } from './mocapRetarget';
import { parseBvh, forwardKinematics, jointIndex } from './bvh';

// A body authored in ANATOMICAL space (+x its right, +y up, +z its front), in cm.
function body(o: { crouch?: number; rightHand?: V3; hipTurnDeg?: number } = {}): Record<Canon, V3> {
  const c = o.crouch ?? 0, turn = ((o.hipTurnDeg ?? 0) * Math.PI) / 180;
  // a hip turn: rotate the hip line about the hips (positive = RIGHT hip forward)
  const hip = (side: number): V3 => [side * 10 * Math.cos(turn), 95 - c, side * 10 * Math.sin(turn)];
  return {
    Hips: [0, 100 - c, 0], Chest: [0, 140 - c, 0], Neck: [0, 155 - c, 0], Head: [0, 170 - c, 0],
    LeftArm: [-18, 150 - c, 0], LeftForeArm: [-20, 122 - c, -6], LeftHand: [-20, 96 - c, 4],
    RightArm: [18, 150 - c, 0], RightForeArm: [20, 122 - c, -6], RightHand: o.rightHand ?? [20, 96 - c, 4],
    LeftUpLeg: hip(-1), LeftLeg: [-10, 52 - c / 2, 6], LeftFoot: [-10, 8, 0], LeftToe: [-10, 2, 16],
    RightUpLeg: hip(1), RightLeg: [10, 52 - c / 2, 6], RightFoot: [10, 8, 0], RightToe: [10, 2, 16],
  };
}
/** Place an anatomical body in a SOURCE space: yawed by `deg`, and x-mirrored for a source of the other handedness. */
function toSource(b: Record<Canon, V3>, deg: number, mirrorX: boolean): Record<Canon, V3> {
  const a = (deg * Math.PI) / 180, out = {} as Record<Canon, V3>;
  for (const j of CANON) {
    const [x, y, z] = b[j];
    const p: V3 = [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];
    out[j] = mirrorX ? [-p[0], p[1], p[2]] : p;
  }
  return out;
}
const stream = (frames: Record<Canon, V3>[], fps = 30): JointStream => ({ fps, frames });
const hold = (b: Record<Canon, V3>, n = 20) => Array.from({ length: n }, () => b);

describe('mocapRetarget — any capture becomes body-local pose keys in the rig\'s conventions', () => {
  for (const [deg, mirrorX] of [[0, false], [70, false], [-135, true], [200, true]] as const) {
    it(`a hand out to the RIGHT and FORWARD reads +x/+z whatever the source facing (${deg}°) and handedness (mirror ${mirrorX})`, () => {
      const b = body({ rightHand: [60, 140, 30] });
      const r = retargetToPoseKeys(stream(hold(toSource(b, deg, mirrorX))), { from: 0, to: 0.6, smoothSec: 0 });
      const k = r.keys[3];
      expect(k.hands!.Right![0]).toBeGreaterThan(0.2);   // right
      expect(k.hands!.Right![2]).toBeGreaterThan(0.08);  // forward
      expect(k.hands!.Left![0]).toBeLessThan(0);          // the other hand stays on the left
      expect(k.feet!.Left![1] + k.hipsY!).toBeLessThan(0.2);   // ankles land near the floor at standing
      expect(Math.abs(k.bones!.Hips![1])).toBeLessThanOrEqual(1);
    });
  }

  it('scales the source LEG to the reference body (the one span every rig agrees on)', () => {
    const b = body();
    const leg = Math.hypot(...([0, 1, 2].map((i) => b.LeftUpLeg[i] - b.LeftLeg[i]))) + Math.hypot(...([0, 1, 2].map((i) => b.LeftLeg[i] - b.LeftFoot[i])));
    const r = retargetToPoseKeys(stream(hold(b)), { from: 0, to: 0.6, smoothSec: 0 });
    expect(r.scale).toBeCloseTo(0.82 / leg, 3);
    // …so a standing body's ankles are keyed at ankle height, not floating
    expect(r.keys[0].feet!.Left![1] + r.keys[0].hipsY!).toBeLessThan(0.2);
  });

  it('carries a crouch in hipsY, and a planted foot lands at ankle height standing AND crouched', () => {
    // poseClip solves with the hips at bind and then moves the whole solved body by hipsY — so where a foot really ends
    // up is its target PLUS hipsY, and that is what has to stay on the floor
    const frames = [...hold(body(), 10), ...hold(body({ crouch: 30 }), 10)];
    const r = retargetToPoseKeys(stream(frames), { from: 0, to: 0.63, smoothSec: 0, keyFps: 30 });
    const stand = r.keys[0], low = r.keys[r.keys.length - 1];
    expect(low.hipsY!).toBeLessThan(stand.hipsY! - 0.2);
    const landed = (k: typeof low) => Math.min(k.feet!.Left![1], k.feet!.Right![1]) + k.hipsY!;
    expect(landed(stand)).toBeCloseTo(0.07, 1);
    expect(landed(low)).toBeCloseTo(0.07, 1);
  });

  it('a RIGHT-hip-forward turn is a POSITIVE Hips yaw (the rig\'s measured convention), against the window\'s median facing', () => {
    const frames = [...hold(body(), 15), ...hold(body({ hipTurnDeg: 30 }), 5)];
    const r = retargetToPoseKeys(stream(frames.map((f) => toSource(f, 40, true))), { from: 0, to: 0.63, smoothSec: 0, keyFps: 30 });   // in a yawed, mirrored source
    expect(r.keys[r.keys.length - 1].bones!.Hips![1]).toBeGreaterThan(20);
    expect(Math.abs(r.keys[0].bones!.Hips![1])).toBeLessThan(3);
  });

  it('mirror swaps the sides and negates x and yaw; a loop ends on its first key', () => {
    const r = retargetToPoseKeys(stream(hold(body({ rightHand: [60, 140, 30] }))), { from: 0, to: 0.6, smoothSec: 0 });
    const m = mirrorKey(r.keys[0]);
    expect(m.hands!.Left![0]).toBeCloseTo(-r.keys[0].hands!.Right![0], 5);
    const keys = r.keys.map((k, i) => ({ ...k, hipsY: i * -0.01 }));
    const looped = closeLoop(keys);
    expect(looped[looped.length - 1].hipsY).toBeCloseTo(looped[0].hipsY!, 5);
  });

  it('reads a BVH: channel order composes rotations, End Sites become <parent>End joints', () => {
    const text = `HIERARCHY
ROOT Hips
{
  OFFSET 0 0 0
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  JOINT Spine
  {
    OFFSET 0 10 0
    CHANNELS 3 Zrotation Xrotation Yrotation
    End Site
    {
      OFFSET 0 5 0
    }
  }
}
MOTION
Frames: 2
Frame Time: 0.5
0 100 0 0 0 0 0 0 0
0 100 0 90 0 0 0 0 0
`;
    const b = parseBvh(text);
    expect(b.joints.map((j) => j.name)).toEqual(['Hips', 'Spine', 'SpineEnd']);
    expect(b.frames).toHaveLength(2);
    const f0 = forwardKinematics(b, 0), f1 = forwardKinematics(b, 1);
    expect(f0.pos[jointIndex(b, 'SpineEnd')]).toEqual([0, 115, 0]);
    const end = f1.pos[jointIndex(b, 'SpineEnd')];   // hips rolled 90° about Z: +y offsets now point −x
    expect(end[0]).toBeCloseTo(-15, 5); expect(end[1]).toBeCloseTo(100, 5);
  });
});
