// DR-H7…DR-H15 (DR_Swoop_Dunk) and DR-J1…DR-J12 (DR_JumpOff_Pass), DR-F1 for both passes. The v5 GLBs the game ships are re-skinned
// here (testkit/glbRig: FK + linear-blend skinning with the clip's morph weights, 24 fps) and placed on the code's flight path in
// the hoop frame (rim centre (0, RIM_HEIGHT_M, 0), board toward −Z, court +Z) against the dunk hoop built from courtDims.HOOP.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dragonRig, minY, maxY, spanZ, type GlbRig } from '../../../tests/dragon-ride/glbRig';
import { hoopDistance, inHoopFootprint } from '../../../tests/dragon-ride/hoopSdf';
import {
  CLIP_FRAMES, DR_FLOOR_MARGIN_M, DR_HOOP_MARGIN_M, FOLDED_TOP_M, FOLDED_TOP_TOL_M, DR_RELEASE_DIST_M, FOLDED_SPAN_MAX_M, J11_SPAN_TOL_M, HANG_FEET_MAX, HANG_FEET_MIN, JUMPOFF_RELEASE_F,
  POWER_HANG_HAND_Y, POWER_SLAM_HAND_Y, RIM_HEIGHT_M, RIM_HOLD_DIP_M, RIM_REACH, SLAM_FEET_MAX, SWOOP_CONTACT_F, SWOOP_SEAT_Y,
} from './dragonRideConsts';
import { swoopHands, swoopSeatAt, SwoopDunk } from './swoopDunk';
import { JumpOffDunk, jumpOffSeatAt, planLeap, RIDER_LEAP_LATERAL_MPS } from './jumpOffDunk';
import { pickDragonLod } from './dragonLod';
import { TEST_LOD, TEST_SLAM_HOLD_SEC } from '../../../tests/dragon-ride/fixtures';

const EPS = 1e-9;
type Lod = 0 | 1 | 2;

/** Pose the clip at `f` on LOD `lod` and translate it so DR_Seat sits on `seat` (the clips carry no root motion). */
function placed(rig: GlbRig, clip: string, f: number, seat: { x: number; y: number; z: number }) {
  const p = rig.pose(clip, f), dx = seat.x - p.seat[0], dy = seat.y - p.seat[1], dz = seat.z - p.seat[2];
  const P = Float64Array.from(p.P, (v, i) => v + (i % 3 === 0 ? dx : i % 3 === 1 ? dy : dz));
  return { P, seatClip: p.seat };
}
function sweep(P: Float64Array) { let m = Infinity; for (let i = 0; i < P.length; i += 3) m = Math.min(m, hoopDistance(P[i], P[i + 1], P[i + 2])); return m; }
/** Any dragon vertex inside the hoop's floor footprint + margin (XZ). */
function nearHoop(P: Float64Array): boolean { for (let i = 0; i < P.length; i += 3) if (inHoopFootprint(P[i], P[i + 2], DR_HOOP_MARGIN_M)) return true; return false; }

describe('DR_Swoop_Dunk (option A): the rider stays on the seat and dunks at contact f16', () => {
  it('DR-H7 / DR-H8: hang hand inside [rim, rim + RIM_REACH]; slam end at or under rim + RIM_HOLD_DIP_M', () => {
    const h = swoopHands();
    expect(h.hangHandY).toBeGreaterThanOrEqual(RIM_HEIGHT_M - EPS);
    expect(h.hangHandY).toBeLessThanOrEqual(RIM_HEIGHT_M + RIM_REACH + EPS);
    expect(h.slamEndHandY).toBeLessThanOrEqual(RIM_HEIGHT_M + RIM_HOLD_DIP_M + 1e-9);
  });

  it('DR-H9: contact seat in [RIM − hang offset, RIM + dip − slam offset], the offsets read from the power slam keys', () => {
    const src = readFileSync(path.resolve(__dirname, '../anim/authored/dunkFinishes.ts'), 'utf8');
    expect(src).toMatch(/hands: \{ Right: \[0\.20, POWER_HANG_HAND_Y, 0\.06\]/);
    expect(src).toMatch(/hands: \{ Right: \[0\.16, POWER_SLAM_HAND_Y, 0\.46\]/);
    const seat = swoopSeatAt(SWOOP_CONTACT_F).y;
    expect(seat).toBe(SWOOP_SEAT_Y);
    expect(seat).toBeGreaterThanOrEqual(RIM_HEIGHT_M - POWER_HANG_HAND_Y - EPS);
    expect(seat).toBeLessThanOrEqual(RIM_HEIGHT_M + RIM_HOLD_DIP_M - POWER_SLAM_HAND_Y + EPS);
    expect(HANG_FEET_MIN).toBeCloseTo(0.97, 9); expect(HANG_FEET_MAX).toBeCloseTo(1.32, 9); expect(SLAM_FEET_MAX).toBeCloseTo(1.30, 9);
  });

  it('DR-H10: the rider stays parented to DR_Seat through the whole swoop (no release path exists)', () => {
    const s = new SwoopDunk(TEST_SLAM_HOLD_SEC); s.tap();
    for (let f = 0; f <= CLIP_FRAMES.DR_Swoop_Dunk; f++) { s.step(f); expect(s.rider).toBe('parented'); }
  });

  for (const lod of [0, 1] as Lod[]) {
    it(`DR-H11 / DR-F1 (LOD${lod}): no dragon vertex below floor + 0.10 on any swoop frame`, () => {
      const rig = dragonRig(lod);
      for (let f = 0; f <= CLIP_FRAMES.DR_Swoop_Dunk; f++) expect(minY(placed(rig, 'DR_Swoop_Dunk', f, swoopSeatAt(f)).P)).toBeGreaterThanOrEqual(DR_FLOOR_MARGIN_M - 1e-6);
    });
    it(`DR-H14 (LOD${lod}): every vertex ≥ 0.15 from the dunk rim / net / board / pole; wings folded (top ≤ seat + 1.344 + tol) while within 0.15 of the footprint`, () => {
      const rig = dragonRig(lod);
      let nearFrames = 0;
      for (let f = 0; f <= CLIP_FRAMES.DR_Swoop_Dunk; f++) {
        const s = swoopSeatAt(f), { P } = placed(rig, 'DR_Swoop_Dunk', f, s);
        expect(sweep(P), `f${f}`).toBeGreaterThanOrEqual(DR_HOOP_MARGIN_M);
        if (nearHoop(P)) { nearFrames++; expect(maxY(P) - s.y, `f${f}`).toBeLessThanOrEqual(FOLDED_TOP_M + FOLDED_TOP_TOL_M); }
      }
      expect(nearFrames).toBeGreaterThan(0);
    });
  }

  it('DR-H13: D (seat → lowest skinned vertex at f16) ≤ contact seat − 0.10 on LOD0 and LOD1; LOD2 would not (so it is forced off)', () => {
    const D = (lod: Lod) => { const p = dragonRig(lod).pose('DR_Swoop_Dunk', SWOOP_CONTACT_F); return p.seat[1] - minY(p.P); };
    expect(D(0)).toBeCloseTo(1.187, 3); expect(D(1)).toBeCloseTo(1.191, 3); expect(D(2)).toBeCloseTo(1.222, 3);
    expect(D(0)).toBeLessThanOrEqual(SWOOP_SEAT_Y - DR_FLOOR_MARGIN_M);
    expect(D(1)).toBeLessThanOrEqual(SWOOP_SEAT_Y - DR_FLOOR_MARGIN_M);
    expect(D(2)).toBeGreaterThan(SWOOP_SEAT_Y - DR_FLOOR_MARGIN_M);
  });

  it('DR-H15: while DR_Swoop_Dunk plays the active LOD is never LOD2, at any camera distance', () => {
    for (let d = 0; d <= 500; d += 0.5) expect(pickDragonLod(d, 'DR_Swoop_Dunk', TEST_LOD)).not.toBe(2);
  });

  it('the feel: tap commits; a slam in the read is a slam; no press is a MISS; no tap flies on', () => {
    const run = (tap: boolean, slamAt: number | null) => { const s = new SwoopDunk(TEST_SLAM_HOLD_SEC); if (tap) s.tap(); for (let f = 0; f <= CLIP_FRAMES.DR_Swoop_Dunk; f++) { if (slamAt === f) s.slam(f); s.step(f); } return s.outcome; };
    expect(run(true, 16)).toBe('slam');
    expect(run(true, null)).toBe('miss');
    expect(run(false, 16)).toBe('flyOn');
    expect(run(true, 22)).toBe('miss');
  });
});

describe('DR_JumpOff_Pass (option B): the rider leaps off at f14 and drops to the rim', () => {
  const seat14 = jumpOffSeatAt(JUMPOFF_RELEASE_F);
  for (const lod of [0, 1, 2] as Lod[]) {
    it(`DR-J1 / DR-F1 (LOD${lod}): no dragon vertex below floor + 0.10 on any frame of the pass`, () => {
      const rig = dragonRig(lod);
      for (let f = 0; f <= CLIP_FRAMES.DR_JumpOff_Pass; f++) expect(minY(placed(rig, 'DR_JumpOff_Pass', f, jumpOffSeatAt(f)).P), `f${f}`).toBeGreaterThanOrEqual(DR_FLOOR_MARGIN_M - 1e-6);
    });
    it(`DR-J2 / DR-J12 (LOD${lod}): every vertex ≥ 0.15 from the DUNK hoop (NexusWebScene bounds via courtDims), every frame`, () => {
      const rig = dragonRig(lod);
      for (let f = 0; f <= CLIP_FRAMES.DR_JumpOff_Pass; f++) expect(sweep(placed(rig, 'DR_JumpOff_Pass', f, jumpOffSeatAt(f)).P), `f${f}`).toBeGreaterThanOrEqual(DR_HOOP_MARGIN_M);
    });
    it(`DR-J11 (LOD${lod}): wings folded (span ≤ folded + TUNE) from hoop approach through release until ≥ 0.15 past the hoop`, () => {
      const rig = dragonRig(lod);
      const folded = (lod === 2 ? 1.499 : lod === 1 ? 1.429 : 1.431) + J11_SPAN_TOL_M;   // v3 measured folded span per LOD
      const near: number[] = [];
      for (let f = 0; f <= CLIP_FRAMES.DR_JumpOff_Pass; f++) if (nearHoop(placed(rig, 'DR_JumpOff_Pass', f, jumpOffSeatAt(f)).P)) near.push(f);
      expect(near.length).toBeGreaterThan(0);
      const f0 = Math.min(near[0], JUMPOFF_RELEASE_F), f1 = Math.max(near[near.length - 1], JUMPOFF_RELEASE_F);
      let worst = 0;
      for (let f = f0; f <= f1; f++) { const sp = spanZ(placed(rig, 'DR_JumpOff_Pass', f, jumpOffSeatAt(f)).P); worst = Math.max(worst, sp); expect(sp, `f${f}`).toBeLessThanOrEqual(folded); }
      console.log(`DR-J11 LOD${lod}: window f${f0}-f${f1}, worst span ${worst.toFixed(3)} (limit ${folded.toFixed(3)})`);
    });
  }

  it('DR-J3: parented up to the tap, unparented on the tap frame, never re-parented before landing', () => {
    const j = new JumpOffDunk(TEST_SLAM_HOLD_SEC);
    for (let f = 0; f < JUMPOFF_RELEASE_F; f++) { j.ride(f); expect(j.parented).toBe(true); expect(j.feetPos.y).toBe(jumpOffSeatAt(f).y); }
    expect(j.tap(JUMPOFF_RELEASE_F)).toBe(true);
    j.ride(JUMPOFF_RELEASE_F);
    expect(j.parentLog.at(-1)).toEqual({ frame: JUMPOFF_RELEASE_F, parented: false });
    for (let k = 0; k < 400 && j.phase !== 'landed'; k++) { j.step(1 / 120); expect(j.parented).toBe(false); }
    for (let f = JUMPOFF_RELEASE_F + 1; f <= CLIP_FRAMES.DR_JumpOff_Pass; f++) j.ride(f);
    expect(j.parentLog.filter((e) => e.frame >= JUMPOFF_RELEASE_F).every((e) => !e.parented)).toBe(true);
    expect(j.phase).toBe('landed');
  });

  it('DR-J4 / DR-J5: hang hand in [rim, rim + RIM_REACH]; slam end ≤ rim + RIM_HOLD_DIP_M', () => {
    const h = new JumpOffDunk(TEST_SLAM_HOLD_SEC).hands();
    expect(h.hangHandY).toBeGreaterThanOrEqual(RIM_HEIGHT_M - EPS);
    expect(h.hangHandY).toBeLessThanOrEqual(RIM_HEIGHT_M + RIM_REACH + EPS);
    expect(h.slamEndHandY).toBeLessThanOrEqual(RIM_HEIGHT_M + RIM_HOLD_DIP_M + EPS);
  });

  it('DR-J6: the rider lands with feet at Y 0 and never falls through', () => {
    const j = new JumpOffDunk(TEST_SLAM_HOLD_SEC); j.ride(JUMPOFF_RELEASE_F); j.tap(JUMPOFF_RELEASE_F); j.slam();
    let lowest = Infinity;
    for (let k = 0; k < 2000 && j.phase !== 'landed'; k++) { j.step(1 / 240); lowest = Math.min(lowest, j.feetPos.y); }
    expect(j.phase).toBe('landed'); expect(j.feetPos.y).toBe(0); expect(lowest).toBeGreaterThanOrEqual(0);
  });

  it('DR-J7: no slam press after the tap is a MISS, never a flush; a press held into the hang slams', () => {
    const go = (press: 'none' | 'early' | 'hang') => {
      const j = new JumpOffDunk(TEST_SLAM_HOLD_SEC); j.ride(JUMPOFF_RELEASE_F); j.tap(JUMPOFF_RELEASE_F);
      const tHang = j.leap!.tHang;
      for (let t = 0; j.phase !== 'landed' && t < 5; t += 1 / 240) {
        if (press === 'early' && Math.abs(t - (tHang - 0.1)) < 1 / 480) j.slam();
        if (press === 'hang' && j.phase === 'hang') j.slam();
        j.step(1 / 240);
      }
      return j.outcome;
    };
    expect(go('none')).toBe('miss');
    expect(go('hang')).toBe('slam');
    expect(go('early')).toBe('slam');
  });

  it('DR-J8: no tap — the rider never unparents and the dragon flies on (no dunk)', () => {
    const j = new JumpOffDunk(TEST_SLAM_HOLD_SEC);
    for (let f = 0; f <= CLIP_FRAMES.DR_JumpOff_Pass; f++) j.ride(f);
    expect(j.parentLog.every((e) => e.parented)).toBe(true);
    expect(j.outcome).toBe('flyOn');
    expect(new JumpOffDunk(TEST_SLAM_HOLD_SEC).tap(JUMPOFF_RELEASE_F - 3)).toBe(false);   // a tap off the release frame does not leave the dragon
  });

  it('DR-J9: the release frame is f14, the seat level there and ≥ 1.974 + 0.10', () => {
    expect(JUMPOFF_RELEASE_F).toBe(14);
    expect(seat14.y).toBeGreaterThanOrEqual(2.074);
    expect(jumpOffSeatAt(13).y).toBe(seat14.y); expect(jumpOffSeatAt(15).y).toBe(seat14.y);
    const p = dragonRig(0).pose('DR_JumpOff_Pass', JUMPOFF_RELEASE_F);
    expect(p.seat[1]).toBeCloseTo(1.95, 3);   // the clip's seat is level (no root motion): the height is the code's
  });

  it('DR-J10: release 1.28 m from the rim horizontally; the arc meets the hang band (feet 0.97–1.32) at the hang beat', () => {
    expect(Math.hypot(seat14.x, seat14.z)).toBeCloseTo(DR_RELEASE_DIST_M, 9);
    const leap = planLeap(seat14.y);
    const yAt = (t: number) => leap.feet0 + leap.vy * t - 0.5 * 9.81 * t * t;
    expect(yAt(leap.tHang)).toBeGreaterThanOrEqual(HANG_FEET_MIN - 1e-9);
    expect(yAt(leap.tHang)).toBeLessThanOrEqual(Math.min(HANG_FEET_MAX, SLAM_FEET_MAX) + 1e-9);
    const j = new JumpOffDunk(TEST_SLAM_HOLD_SEC); j.ride(JUMPOFF_RELEASE_F); j.tap(JUMPOFF_RELEASE_F);
    while (j.phase === 'leap') j.step(1 / 240);
    expect(j.phase).toBe('hang');
    expect(j.feetPos.z).toBeCloseTo(RIM_REACH, 6);   // the root stops a bent arm short of the ring's centre
  });
});

describe('v3 (PM 5:57 PM PT): the rider leap speed is the solved one', () => {
  it('DR-v3-1: RIDER_LEAP_LATERAL_MPS = (release distance − RIM_REACH) / tHang of the solved leap', () => {
    const p = planLeap();
    expect(RIDER_LEAP_LATERAL_MPS).toBeCloseTo((DR_RELEASE_DIST_M - RIM_REACH) / p.tHang, 9);
    console.log(`RIDER_LEAP_LATERAL_MPS ${RIDER_LEAP_LATERAL_MPS.toFixed(4)} m/s, tHang ${p.tHang.toFixed(4)} s`);
  });
});
