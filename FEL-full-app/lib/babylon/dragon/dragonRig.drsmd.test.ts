// DR-S1/S2 (Surf morphs), DR-M1 (Mount parent lock), DR-D1…D4 (Dive arc), DR-M1…M4 (corrective drivers), DR-G1v5…G5v5 and DR-F1
// (ground contact / flight floor), DR-H15-style LOD forcing for grounded clips, and the shipped art itself.
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dragonRig, minY, type GlbRig } from '../../../tests/dragon-ride/glbRig';
import {
  CLIP_FRAMES, DIVE_CLIP_SEC, DIVE_DEPTH_M, DIVE_SEC, DRAGON_GLB_FILES, DR_FLOOR_MARGIN_M, DR_M3_THROW_M, DR_SEAT_TOL_M, FLIGHT_MIN_SEAT, GROUNDED_BAND_M,
  JUMPOFF_RELEASE_F, MORPH_NAMES, MOUNT_LOCK_F, MOUNT_LOCK_SEAT_Y, RIDER_GLB, SWOOP_CONTACT_F, type DragonClip,
} from './dragonRideConsts';
import { SurfMorphDriver } from './surfMorphs';
import { RiderSeatLink } from './riderSeat';
import { diveAt, planDive } from './diveArc';
import { axisAngleFromRestDeg, correctiveWeights, foldWeight, tuckWeight } from './correctiveMorphs';
import { naturalLod, pickDragonLod } from './dragonLod';
import { TEST_LOD } from '../../../tests/dragon-ride/fixtures';

type Lod = 0 | 1 | 2;
const LODS: Lod[] = [0, 1, 2];
const PUB = path.resolve(__dirname, '../../../public');
const v3 = (a: readonly number[]) => ({ x: a[0], y: a[1], z: a[2] });

describe('the shipped art', () => {
  it('the three v5 LODs sit in public/models/dragon with every clip, the five morphs, DR_Seat and DR_Root; the rider is elijah-hero.glb', () => {
    const want = [2490176, 1517168, 871400], tris = [30802, 10350, 3389];
    DRAGON_GLB_FILES.forEach((f, i) => expect(statSync(path.join(PUB, 'models/dragon', f)).size).toBe(want[i]));
    for (const lod of LODS) {
      const r = dragonRig(lod);
      expect(r.clipNames().sort()).toEqual(Object.keys(CLIP_FRAMES).sort());
      for (const c of Object.keys(CLIP_FRAMES) as DragonClip[]) expect(r.clipFrames(c)).toBe(CLIP_FRAMES[c]);
      expect(r.targetNames).toEqual([...MORPH_NAMES]);
      expect(r.joints.filter((j) => r.json.nodes[j].name?.startsWith('DR_')).length).toBe(65);
      r.nodeIndex('DR_Seat'); r.nodeIndex('DR_Root');
      expect(r.triangleCount()).toBe(tris[lod]);
    }
    expect(existsSync(path.join(PUB, RIDER_GLB))).toBe(true);
  });
});

describe('DR-S1 / DR-S2 Surf water morphs', () => {
  it('DR-S1: after 0.25 s in Surf both fins read 1.0 (spots ramp over 0.4 s)', () => {
    const d = new SurfMorphDriver(); let w = d.update(0, true);
    for (let i = 0; i < 15; i++) w = d.update(1 / 60, true);
    expect(w.wing_to_fin).toBeCloseTo(1, 9); expect(w.tail_fin).toBeCloseTo(1, 9); expect(w.water_spots).toBeLessThan(1);
    for (let i = 0; i < 9; i++) w = d.update(1 / 60, true);
    expect(w.water_spots).toBeCloseTo(1, 9);
  });
  it('DR-S2: 3.0 s after Surf ends all three morphs read 0; the spots hold 1.0 for 1.5 s first', () => {
    const d = new SurfMorphDriver(); for (let i = 0; i < 60; i++) d.update(1 / 60, true);
    let w = d.update(0, false);
    for (let i = 0; i < 84; i++) w = d.update(1 / 60, false);   // 1.4 s
    expect(w.water_spots).toBe(1); expect(w.wing_to_fin).toBe(0);
    for (let i = 0; i < 96; i++) w = d.update(1 / 60, false);   // 3.0 s
    expect(w).toEqual({ wing_to_fin: 0, tail_fin: 0, water_spots: 0 });
  });
  it('weights stay in 0..1 and are frame-rate independent (seconds, not frames)', () => {
    const at = (fps: number) => { const d = new SurfMorphDriver(); let w = d.update(0, true); for (let i = 0; i < fps * 0.1; i++) w = d.update(1 / fps, true); for (let i = 0; i < fps * 1.8; i++) w = d.update(1 / fps, false); return w; };
    const a = at(30), b = at(120);
    for (const k of ['wing_to_fin', 'tail_fin', 'water_spots'] as const) { expect(a[k]).toBeCloseTo(b[k], 6); expect(a[k]).toBeGreaterThanOrEqual(0); expect(a[k]).toBeLessThanOrEqual(1); }
    const big = new SurfMorphDriver().update(99, true); expect(big.wing_to_fin).toBe(1);
  });
});

describe('DR-M1 (Mount parenting) / DR-G5v5', () => {
  it('parents at Mount f12 without a snap; rider ↔ DR_Seat offset constant (≤ 1 mm) to the end of Mount and across Glide, Surf, Dive and LaunchOff', () => {
    for (const lod of LODS) {
      const r = dragonRig(lod), link = new RiderSeatLink();
      expect(link.beginMount()).toBe(true);
      const seatAt = (c: string, f: number) => v3(r.pose(c, f).seat);
      const riderAtLock = { x: seatAt('DR_Mount', MOUNT_LOCK_F).x, y: seatAt('DR_Mount', MOUNT_LOCK_F).y, z: seatAt('DR_Mount', MOUNT_LOCK_F).z };
      for (let f = 0; f < MOUNT_LOCK_F; f++) expect(link.mountFrame(f, riderAtLock, seatAt('DR_Mount', f))).toBe(false);
      expect(link.mountFrame(MOUNT_LOCK_F, riderAtLock, seatAt('DR_Mount', MOUNT_LOCK_F))).toBe(true);
      const off0 = link.seatOffset!;
      expect(Math.hypot(off0.x, off0.y, off0.z)).toBeLessThanOrEqual(DR_SEAT_TOL_M);   // no snap: the rider stays where he was
      expect(seatAt('DR_Mount', MOUNT_LOCK_F).y).toBeCloseTo(MOUNT_LOCK_SEAT_Y[lod], 3);   // DR-G5v5: 1.764 / 1.769 / 1.816
      const frames: [string, number][] = [];
      for (let f = MOUNT_LOCK_F; f <= CLIP_FRAMES.DR_Mount; f++) frames.push(['DR_Mount', f]);
      for (const c of ['DR_Glide_Loop', 'DR_Surf_Loop', 'DR_Dive', 'DR_LaunchOff'] as DragonClip[]) for (let f = 0; f <= CLIP_FRAMES[c]; f += 2) frames.push([c, f]);
      for (const [c, f] of frames) {
        const s = seatAt(c, f), w = link.riderWorld(s)!;
        expect(Math.abs(Math.hypot(w.x - s.x, w.y - s.y, w.z - s.z) - Math.hypot(off0.x, off0.y, off0.z))).toBeLessThanOrEqual(DR_SEAT_TOL_M);
      }
    }
  });
  it('unparents only on a dismount, the LaunchOff release or the jump tap; never re-parents mid-air', () => {
    const calls: string[] = [];
    const link = new RiderSeatLink({ parent: () => calls.push('p'), unparent: () => calls.push('u') });
    link.beginMount(); link.mountFrame(MOUNT_LOCK_F, { x: 0, y: 2, z: 0 }, { x: 0, y: 2, z: 0 });
    expect(link.release('jumpTap')).toBe(true);
    expect(link.beginMount()).toBe(false);   // mid-air
    link.landed(); expect(link.beginMount()).toBe(true);
    expect(calls).toEqual(['p', 'u']);
    const src = readFileSync(path.resolve(__dirname, 'riderSeat.ts'), 'utf8');
    expect(src).not.toMatch(/1\.7[0-9]{2}|1\.816/);   // code reads DR_Seat; hard-codes no height
  });
});

describe('DR-D1 … DR-D4 the Dive (code-driven arc)', () => {
  it('DR-D1: the root drops DIVE_DEPTH_M over the dive (from a high Glide)', () => {
    const p = planDive(20, 0);
    expect(p.depth).toBeCloseTo(DIVE_DEPTH_M, 9);
    expect(p.startSeatY - diveAt(p, p.diveSec).seatY).toBeCloseTo(DIVE_DEPTH_M, 9);
  });
  it('DR-D2: the dive lasts DIVE_SEC with the clip time-scaled to match; the wing fold peak holds through the bottom', () => {
    const p = planDive(20, 0, { diveSec: 1.2 });
    expect(p.clipRate * 1.2).toBeCloseTo(DIVE_CLIP_SEC, 9);
    expect(diveAt(p, 1.2).clipT).toBeCloseTo(DIVE_CLIP_SEC, 9);
    expect(DIVE_SEC).toBeCloseTo(0.833, 3);
    const r = dragonRig(0), wing = r.nodeIndex('DR_WingUpper_L');
    const angle = (f: number) => Math.abs(axisAngleFromRestDeg(r.restRotation(wing), r.localRotation('DR_Dive', f, wing))[0]);
    const n = CLIP_FRAMES.DR_Dive, peak = Math.max(...Array.from({ length: n + 1 }, (_, f) => angle(f)));
    expect(peak).toBeCloseTo(40, 0);
    expect(angle(n)).toBeCloseTo(peak, 3);   // the fold is at its peak at the bottom (the dive's last frame)
  });
  it('DR-D3: DR_Seat stays at 1.95 on every Dive frame and DR_Root has no translation; the parented rider rides the arc', () => {
    const r = dragonRig(0);
    for (let f = 0; f <= CLIP_FRAMES.DR_Dive; f++) { expect(r.pose('DR_Dive', f).seat[1]).toBeCloseTo(1.95, 4); expect(r.pose('DR_Dive', f).nodeWorld('DR_Root')).toEqual(r.pose('DR_Dive', 0).nodeWorld('DR_Root')); }
    const link = new RiderSeatLink(); link.beginMount(); link.mountFrame(MOUNT_LOCK_F, { x: 0, y: 20, z: 0 }, { x: 0, y: 20, z: 0 });
    const p = planDive(20, 0);
    for (let t = 0; t <= p.diveSec + p.pullUpSec; t += 0.05) { const s = { x: 0, y: diveAt(p, t).seatY, z: 0 }, w = link.riderWorld(s)!; expect(Math.hypot(w.x - s.x, w.y - s.y, w.z - s.z)).toBeLessThanOrEqual(DR_SEAT_TOL_M); }
  });
  it('DR-D4 / DR-F1: the root never goes below the ground / water + the Dive flight floor, every LOD, every frame', () => {
    for (const ground of [0, 1.5]) {
      const p = planDive(ground + 3, ground);
      expect(p.clamped).toBe(true);
      for (const lod of LODS) {
        const r = dragonRig(lod);
        for (let t = 0; t <= p.diveSec + p.pullUpSec + 1e-9; t += 1 / 48) {
          const a = diveAt(p, t), f = Math.min(CLIP_FRAMES.DR_Dive, Math.round(a.clipT * 24)), pose = r.pose('DR_Dive', f);
          expect(a.seatY - (pose.seat[1] - minY(pose.P))).toBeGreaterThanOrEqual(ground + DR_FLOOR_MARGIN_M - 1e-6);
        }
      }
    }
  });
});

describe('DR-M1 … DR-M4 corrective morph drivers', () => {
  const driven = (r: GlbRig, clip: string, f: number) => {
    const th = r.nodeIndex('DR_HindThigh_L'), wg = r.nodeIndex('DR_WingUpper_L');
    return [tuckWeight(axisAngleFromRestDeg(r.restRotation(th), r.localRotation(clip, f, th))[0]), foldWeight(axisAngleFromRestDeg(r.restRotation(wg), r.localRotation(clip, f, wg))[0])];
  };
  it('DR-M1: at Swoop f16 and JumpOff f14 the code-driven weights equal the keyed weights within 0.01 (every LOD)', () => {
    for (const lod of LODS) {
      const r = dragonRig(lod);
      for (const [c, f] of [['DR_Swoop_Dunk', SWOOP_CONTACT_F], ['DR_JumpOff_Pass', JUMPOFF_RELEASE_F]] as const) {
        const keyed = r.pose(c, f).w!, d = driven(r, c, f);
        expect(Math.abs(d[0] - keyed[3])).toBeLessThanOrEqual(0.01);
        expect(Math.abs(d[1] - keyed[4])).toBeLessThanOrEqual(0.01);
      }
    }
  });
  it('DR-M3: at every partial-fold frame no vertex is thrown more than DR_M3_THROW_M past the authored (keyed) skin', () => {
    for (const lod of LODS) {
      const r = dragonRig(lod);
      for (const [c, fs] of [['DR_Swoop_Dunk', [2, 3, 4, 5, 6]], ['DR_JumpOff_Pass', [26, 27, 28, 29, 30, 31, 32]]] as const) for (const f of fs) {
        const d = driven(r, c, f), a = r.pose(c, f, [0, 0, 0, d[0], d[1]]).P, b = r.pose(c, f).P;
        let worst = 0; for (let i = 0; i < a.length; i += 3) worst = Math.max(worst, Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1], a[i + 2] - b[i + 2]));
        expect(worst, `LOD${lod} ${c} f${f}`).toBeLessThanOrEqual(DR_M3_THROW_M);
      }
    }
  });
  it('DR-M4: both weights stay in 0..1 and fall back to 0 in Glide, Idle, Surf, Mount, Dive and LaunchOff', () => {
    const I = [0, 0, 0, 1] as const, bent = [Math.sin(-1.2), 0, 0, Math.cos(-1.2)] as const;
    for (const c of ['DR_Glide_Loop', 'DR_Idle_Coil', 'DR_Surf_Loop', 'DR_Mount', 'DR_Dive', 'DR_LaunchOff'] as DragonClip[]) {
      expect(correctiveWeights(c, { drivenTuckOrFold: false, thighRest: I, thigh: bent, wingRest: I, wing: bent })).toMatchObject({ corr_tuck_legs: 0, corr_wing_fold: 0, source: 'off' });
    }
    for (let x = -400; x <= 400; x += 7) { for (const v of [tuckWeight(x), foldWeight(x)]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); } }
    expect(correctiveWeights('DR_Swoop_Dunk', { drivenTuckOrFold: true, thighRest: I, thigh: I, wingRest: I, wing: I, keyed: [2, -1] })).toMatchObject({ corr_tuck_legs: 1, corr_wing_fold: 0, source: 'keyed' });
  });
});

describe('DR-G1v5 … DR-G4v5 ground contact, LOD forcing', () => {
  const grounded: DragonClip[] = ['DR_Idle_Coil', 'DR_Mount', 'DR_LaunchOff'];
  it('DR-G1v5 / DR-G2v5: every grounded frame on every LOD has its lowest vertex in [0, 0.02], never below 0', () => {
    for (const lod of LODS) { const r = dragonRig(lod); for (const c of grounded) for (let f = 0; f <= CLIP_FRAMES[c]; f++) { const y = minY(r.pose(c, f).P); expect(y, `LOD${lod} ${c} f${f}`).toBeGreaterThanOrEqual(GROUNDED_BAND_M[0]); expect(y).toBeLessThanOrEqual(GROUNDED_BAND_M[1]); } }
  });
  it('DR-G3v5: LOD2 (the toe hover, measured ≤ 0.062 m) never shows on a grounded clip inside the hero range', () => {
    for (const c of grounded) for (let d = 0; d <= TEST_LOD.heroGroundedRangeM; d += 0.5) expect(pickDragonLod(d, c, TEST_LOD)).not.toBe(2);
    const hover = dragonRig(2).pose('DR_LaunchOff', 8).seat[1] - dragonRig(0).pose('DR_LaunchOff', 8).seat[1];
    expect(hover).toBeLessThanOrEqual(0.062 + 0.001);
    expect(naturalLod(TEST_LOD.heroGroundedRangeM + 1, TEST_LOD)).toBe(2);
  });
  it('DR-G4v5: an LOD0↔LOD1 switch on any grounded frame moves the seat ≤ 0.02 m; the LaunchOff → Glide hand-off needs no pop', () => {
    for (const c of grounded) for (let f = 0; f <= CLIP_FRAMES[c]; f++) expect(Math.abs(dragonRig(0).pose(c, f).seat[1] - dragonRig(1).pose(c, f).seat[1])).toBeLessThanOrEqual(0.02);
    for (const lod of LODS) expect(dragonRig(lod).pose('DR_LaunchOff', CLIP_FRAMES.DR_LaunchOff).seat[1]).toBeGreaterThanOrEqual(FLIGHT_MIN_SEAT.glide);
  });
  it('DR-F1: Glide at its flight floor and Surf at its water floor keep every LOD ≥ 0.10 clear on every frame', () => {
    for (const lod of LODS) {
      const r = dragonRig(lod);
      for (const [c, seat] of [['DR_Glide_Loop', FLIGHT_MIN_SEAT.glide], ['DR_Surf_Loop', FLIGHT_MIN_SEAT.surfAboveWater]] as const) for (let f = 0; f <= CLIP_FRAMES[c]; f++) {
        const p = r.pose(c, f); expect(seat - (p.seat[1] - minY(p.P)), `LOD${lod} ${c} f${f}`).toBeGreaterThanOrEqual(DR_FLOOR_MARGIN_M - 1e-6);
      }
    }
  });
});
