// DUNK-BALL-ARMS-RIM (2026-09-14): the made dunk's ball goes over the lip, down the ring's axis, out of the net, to the floor.
import { describe, it, expect } from 'vitest';
import { startFlush, stepFlush, sweptTouch, ringDistance, ringClearance, NET_DEPTH_M, RING_TUBE_M, type V3 } from './RimFlush';

const rim = { x: 0, y: 3.05, z: -10.28 }, RR = 0.225, BR = 0.12;
/** Run a flush at 60 fps and keep every frame. */
function run(release: V3, fps = 60, maxSec = 1.5) {
  const s = startFlush(release, rim, RR, BR); const frames: { t: number; pos: V3; phase: string }[] = [{ t: 0, pos: { ...s.pos }, phase: s.phase }];
  for (let i = 0; i < maxSec * fps && s.phase !== 'free'; i++) { stepFlush(s, rim, RR, BR, 1 / fps); frames.push({ t: s.t, pos: { ...s.pos }, phase: s.phase }); }
  return { s, frames };
}
// the live contacts measured at base (8586f1e): radial out from the axis toward the court, height over the ring
const CONTACTS: [string, V3][] = [
  ['POWER windmill (0.23 m out, 4 cm over)', { x: 0.03, y: 3.09, z: -10.28 + 0.228 }],
  ['LATE (0.27 m out, 1 cm under)', { x: -0.02, y: 3.04, z: -10.28 + 0.27 }],
  ['SIG left hand (0.16 m out, 3 cm under)', { x: 0.06, y: 3.02, z: -10.28 + 0.15 }],
  ['a touch from the front (0.34 m out, 5 cm over)', { x: 0, y: 3.10, z: -10.28 + 0.34 }],
  ['dead centre, over', { x: 0, y: 3.2, z: -10.28 }],
];

describe('RimFlush — a make goes through the ring, not the iron', () => {
  for (const [name, rel] of CONTACTS) {
    it(`${name}: never deeper than a touch into the iron after it starts moving, crosses the plane inside the ring, out of the net, falling`, () => {
      const { s, frames } = run(rel);
      const startPen = Math.max(0, ringClearance(BR) - ringDistance(rel, rim, RR));
      // after the first two frames the ball is never further INTO the iron than where the hand let it go (and never more than a squash)
      for (const f of frames.slice(2)) expect(ringDistance(f.pos, rim, RR)).toBeGreaterThanOrEqual(Math.min(ringClearance(BR), ringClearance(BR) - startPen) - 1e-3);
      let crossR = -1;
      for (let i = 1; i < frames.length; i++) if (frames[i - 1].pos.y >= rim.y && frames[i].pos.y < rim.y) { crossR = Math.hypot(frames[i].pos.x - rim.x, frames[i].pos.z - rim.z); break; }
      if (rel.y >= rim.y) { expect(crossR).toBeGreaterThanOrEqual(0); expect(crossR).toBeLessThanOrEqual(RR - BR - RING_TUBE_M + 1e-3); }
      expect(s.phase).toBe('free');
      expect(s.pos.y).toBeLessThanOrEqual(rim.y - NET_DEPTH_M + 1e-6);
      expect(s.vel.y).toBeLessThan(-1);   // still falling out of the net — the ball sim takes it to the floor
      expect(s.t).toBeLessThan(0.45);     // through before the old 0.47 s beat the verdict waits on
      // once it is going down it never comes back up (no bounce-off ghost)
      const lowest = frames.findIndex((f) => f.phase === 'net');
      for (let i = lowest + 1; i < frames.length; i++) expect(frames[i].pos.y).toBeLessThanOrEqual(frames[i - 1].pos.y + 1e-9);
      // no frame-to-frame jump a camera would read as a teleport
      for (let i = 1; i < frames.length; i++) expect(Math.hypot(frames[i].pos.x - frames[i - 1].pos.x, frames[i].pos.y - frames[i - 1].pos.y, frames[i].pos.z - frames[i - 1].pos.z)).toBeLessThan(0.08);
    });
  }
  it('sweptTouch puts the release on the touch, not 5 cm inside the metal (the jam moves the ball ~0.1 m a frame)', () => {
    const prev = { x: 0, y: 3.10, z: -10.28 + 0.40 }, cur = { x: 0, y: 3.08, z: -10.28 + 0.27 };   // clear → 3.7 cm into the iron
    expect(ringDistance(cur, rim, RR)).toBeLessThan(ringClearance(BR) - 0.03);
    const t = sweptTouch(prev, cur, rim, RR, BR);
    expect(ringDistance(t, rim, RR)).toBeCloseTo(ringClearance(BR), 3);
    expect(t.z).toBeGreaterThan(cur.z); expect(t.z).toBeLessThan(prev.z);
    // clear this frame, or already in the iron last frame: unchanged
    expect(sweptTouch(prev, prev, rim, RR, BR)).toEqual(prev);
    expect(sweptTouch(cur, { ...cur, y: cur.y + 0.001 }, rim, RR, BR).y).toBeCloseTo(cur.y + 0.001, 6);
    // and a flush from the touch never enters the iron at all
    const { frames } = run(t);
    for (const f of frames) expect(ringDistance(f.pos, rim, RR)).toBeGreaterThanOrEqual(ringClearance(BR) - 2e-3);
  });
  it('takes a Babylon-style vector (x/y/z on accessors) without losing its fields', () => {
    class Acc { constructor(private _x: number, private _y: number, private _z: number) {} get x() { return this._x; } get y() { return this._y; } get z() { return this._z; } }
    const s = startFlush(new Acc(0.02, 3.1, -10.0) as unknown as V3, rim, RR, BR);
    expect(Number.isFinite(s.pos.y)).toBe(true); expect(Number.isFinite(s.from.y)).toBe(true);
    stepFlush(s, rim, RR, BR, 1 / 60); expect(Number.isFinite(s.pos.y)).toBe(true);
  });
  it('is frame-rate independent where it counts: out of the net at about the same time and place at 30 and 144 fps', () => {
    const a = run(CONTACTS[0][1], 30).s, b = run(CONTACTS[0][1], 144).s;
    expect(Math.abs(a.t - b.t)).toBeLessThan(0.05);
    expect(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z)).toBeLessThan(0.03);
  });
});
