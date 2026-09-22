// A limb accessory is measured off the body it is hung on (CLOTHING-SOFT-RESIDUAL, 2026-09-21). The eye's teal clip at the
// shoulder, the teal shard on the shin and the "stretched" upper arm were one rigid tube each, sized in metres from a
// reference body and centred where they overran the joint. These pin the geometry that replaces that.
import { describe, expect, it } from 'vitest';
import { ringFit, ringRadius, trimSpan, tubeCoverage, tubeFit, TUBE_EASE, TUBE_MIN_RING, TUBE_SPANS } from './accessoryFit';

/** Skin points of a tapered limb along a→b: `rings` rings of `seg` points, radius r0 at a easing to r1 at b. */
function limb(a: [number, number, number], b: [number, number, number], r0: number, r1: number, rings = 40, seg = 16): number[] {
  const P: number[] = [];
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1), r = r0 + (r1 - r0) * t;
    const cx = a[0] + (b[0] - a[0]) * t, cy = a[1] + (b[1] - a[1]) * t, cz = a[2] + (b[2] - a[2]) * t;
    for (let j = 0; j < seg; j++) { const an = 2 * Math.PI * j / seg; P.push(cx + r * Math.cos(an), cy, cz + r * Math.sin(an)); }
  }
  return P;
}
const A = { x: 0, y: 1.0, z: 0 }, B = { x: 0, y: 0.6, z: 0 };   // a 0.40 m shin, straight down

describe('a tube is measured off the skin', () => {
  it('a ring reads the limb radius at its fraction of the segment, and the ease stands the tube off it', () => {
    const P = limb([0, 1.0, 0], [0, 0.6, 0], 0.07, 0.04);   // calf 7 cm → ankle 4 cm
    const top = ringRadius(P, A, B, 0.30), bottom = ringRadius(P, A, B, 0.80);
    expect(top.n).toBeGreaterThanOrEqual(TUBE_MIN_RING); expect(bottom.n).toBeGreaterThanOrEqual(TUBE_MIN_RING);
    expect(top.r).toBeCloseTo(0.07 - 0.03 * 0.30, 2);
    expect(bottom.r).toBeCloseTo(0.07 - 0.03 * 0.80, 2);
    const fit = tubeFit(P, A, B, TUBE_SPANS.legsleeve)!;
    expect(fit.r0).toBeCloseTo(top.r + TUBE_EASE, 2); expect(fit.r1).toBeCloseTo(bottom.r + TUBE_EASE, 2);
    expect(fit.c0.x).toBeCloseTo(0, 3); expect(fit.c0.z).toBeCloseTo(0, 3);   // a limb centred on its bone: rings on the axis
    expect(fit.c0.y).toBeCloseTo(1.0 - 0.4 * 0.30, 3); expect(fit.c1.y).toBeCloseTo(1.0 - 0.4 * 0.80, 3);
  });

  it('a limb whose centreline is off its bone (the calf sits behind the shin) gets rings centred on the SKIN, not the bone', () => {
    const P = limb([0, 1.0, 0.03], [0, 0.6, 0.03], 0.05, 0.05);   // the skin's centre 3 cm behind the bone axis
    const ring = ringFit(P, A, B, 0.5);
    expect(ring.c.z).toBeCloseTo(0.03, 3); expect(ring.c.x).toBeCloseTo(0, 3);
    expect(ring.r).toBeCloseTo(0.05, 2);                                      // the limb's own radius, not 8 cm (3 + 5) about the bone
    expect(ringRadius(P, A, B, 0.5).r).toBeGreaterThan(0.075);                // which is what a bone-centred max reads
  });

  it('the other limb beside the segment is not this limb — even the other shin 6 cm away, or the torso beside an upper arm', () => {
    const shin = limb([0, 1.0, 0], [0, 0.6, 0], 0.06, 0.04);
    const other = limb([0.18, 1.0, 0], [0.18, 0.6, 0], 0.06, 0.04);   // the other shin: centres 18 cm apart, surfaces 6 cm apart
    expect(ringRadius([...shin, ...other], A, B, 0.5).r).toBeLessThan(0.06);
    expect(ringRadius([...shin, ...other], A, B, 0.5).r).toBeCloseTo(ringRadius(shin, A, B, 0.5).r, 6);
    const torso: number[] = []; for (let i = 0; i <= 40; i++) for (let j = -6; j <= 6; j++) torso.push(0.09, 1.0 - i * 0.01, j * 0.01);   // a wall 9 cm out
    expect(ringRadius([...shin, ...torso], A, B, 0.5).r).toBeCloseTo(ringRadius(shin, A, B, 0.5).r, 6);
  });

  it('no skin to measure (a roster rig with no body mesh, a slab in a gap) → no fit, not a guess', () => {
    expect(tubeFit([], A, B, TUBE_SPANS.legsleeve)).toBeNull();
    expect(tubeFit(limb([0, 1.0, 0], [0, 0.6, 0], 0.06, 0.04, 3, 4), A, B, TUBE_SPANS.legsleeve)).toBeNull();   // three sparse rings: nothing in the slabs
  });

  it('every span sits strictly inside its segment — a tube never starts inside the joint above it', () => {
    for (const s of Object.values(TUBE_SPANS)) { expect(s.from).toBeGreaterThan(0); expect(s.to).toBeLessThan(1); expect(s.to).toBeGreaterThan(s.from); }
    expect(TUBE_SPANS.armsleeve.from).toBeGreaterThanOrEqual(0.3);   // below the deltoid: the eye's shoulder clip
    expect(TUBE_SPANS.legsleeve.to).toBeLessThanOrEqual(0.85);       // above the ankle: the eye's shard ran calf → ankle
  });
});

describe('a tube under a shown top', () => {
  const UA = { x: 0, y: 1.4, z: 0 }, EL = { x: 0, y: 1.12, z: 0 };   // a 0.28 m upper arm
  const sleeve = (fromT: number, toT: number) => limb([0, 1.4 - 0.28 * fromT, 0], [0, 1.4 - 0.28 * toT, 0], 0.075, 0.07, 12, 12);   // a tee sleeve 1.3 cm off a 6 cm arm
  it('a short sleeve over the top of the tube: the covered stations are the ones under it', () => {
    const cov = tubeCoverage(sleeve(0, 0.5), UA, EL, TUBE_SPANS.armsleeve, 0.066);
    expect(cov.slice(0, 2)).toEqual([true, true]);          // 34 % → 50 % of the arm: under the sleeve
    expect(cov.slice(4)).toEqual([false, false, false, false]);
  });
  it('…and the tube is trimmed to start past the sleeve, with daylight', () => {
    const cov = tubeCoverage(sleeve(0, 0.5), UA, EL, TUBE_SPANS.armsleeve, 0.066);
    const t = trimSpan(TUBE_SPANS.armsleeve, cov, 0.28)!;
    expect(t).not.toBeNull();
    expect(t.from).toBeGreaterThan(0.5);                    // starts where the sleeve ends…
    expect(t.from * 0.28 - 0.5 * 0.28).toBeGreaterThan(0.01);   // …plus the gap
    expect(t.to).toBeCloseTo(TUBE_SPANS.armsleeve.to, 6);
  });
  it('a long sleeve over the whole tube hides it', () => {
    const cov = tubeCoverage(sleeve(0, 1), UA, EL, TUBE_SPANS.armsleeve, 0.066);
    expect(cov.every(Boolean)).toBe(true);
    expect(trimSpan(TUBE_SPANS.armsleeve, cov, 0.28)).toBeNull();
  });
  it('a coarse sleeve (a ring every 2.5 cm over 2 cm stations) still reads as one surface: one bare station between covered ones is covered', () => {
    const cov = tubeCoverage(sleeve(0, 1), UA, EL, TUBE_SPANS.armsleeve, 0.066);   // 12 rings on 0.28 m
    expect(cov.every(Boolean)).toBe(true);
    expect(tubeCoverage([], UA, EL, TUBE_SPANS.armsleeve, 0.066).some(Boolean)).toBe(false);   // nothing fills from nothing
  });
  it('the torso beside a hanging arm is not a sleeve: cloth on one side of the tube covers nothing', () => {
    // the tee's flank: a wall of points 6 cm to one side of the arm, the whole length of it
    const flank: number[] = [];
    for (let i = 0; i <= 28; i++) for (let j = -3; j <= 3; j++) flank.push(0.06, 1.4 - i * 0.01, j * 0.01);
    const cov = tubeCoverage(flank, UA, EL, TUBE_SPANS.armsleeve, 0.066);
    expect(cov.some(Boolean)).toBe(false);
    expect(trimSpan(TUBE_SPANS.armsleeve, cov, 0.28)).toEqual(TUBE_SPANS.armsleeve);
  });
  it('a tank (nothing on the arm) leaves the tube whole', () => {
    const cov = tubeCoverage([], UA, EL, TUBE_SPANS.armsleeve, 0.066);
    expect(trimSpan(TUBE_SPANS.armsleeve, cov, 0.28)).toEqual(TUBE_SPANS.armsleeve);
  });
  it('a cut that leaves less than the shortest drawable tube hides it', () => {
    expect(trimSpan({ from: 0.3, to: 0.6 }, [true, true, true, true, true, true, false, false], 0.28)).toBeNull();   // 75 % covered, 7 cm left less the gap
  });
});
