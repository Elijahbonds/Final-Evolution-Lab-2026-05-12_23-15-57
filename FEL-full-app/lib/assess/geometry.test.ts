// The geometry against the joints it was filmed from (spec §12 Phase 0: every measure within ±2° of the truth on the
// synthetic fixtures). Each pose is built in 3-D (lib/assess/replay.ts, lib/mirror/fixtures/build.ts), filmed through
// the app's virtual webcam (lib/pose/synth.ts), measured from the IMAGE, and compared with the angle read off the
// joints in the plane the lens sees.
import { describe, expect, it } from 'vitest';
import { restPose, type Joints } from '@/lib/pose/synth';
import type { Lm } from '@/lib/pose/landmarks';
import { readFixture } from '@/lib/mirror/fixtures/load';
import { toPoseFrames } from '@/lib/mirror/fixtures';
import { kneeInwardRatio } from '@/lib/babylon/nexus/neuro-mirror/rules/squat-audit';
import {
  angleAt, facingSign, fppa, hipAboveKnee, hipFlexion, kneeFlexion, kneeFlexionFromFront, kneeFlexionWorld, kneeInsideRatio,
  lateralTrunkLean, nearSide, pelvicTilt, pt, shoulderFlexion, tibiaAngle, trunkAngle, trunkTibiaDiff, weightShift,
} from './geometry';
import { film, kneeWallJoints, kneeWallTruth, ohsJoints, ohsTruth, slsJoints, slsTruth, turnSide, type OhsOpts, type SlsOpts } from './replay';

const TOL = 2;
const still = (j: Joints) => film({ fps: 60, frames: [j, j, j] });
const shot = (j: Joints) => { const c = still(j); return { img: c.frames[0].image, world: c.frames[0].world!, aspect: c.aspect }; };

describe('side view: knee, hip, trunk, tibia, shoulder — within ±2° of the joints', () => {
  const cases: OhsOpts[] = [
    {}, { kneeFlex: 75, tibia: 20, trunk: 30 }, { kneeFlex: 100, tibia: 45, trunk: 60, shoulderFlex: 140 },
    { kneeFlex: 135, tibia: 30, trunk: 45, shoulderFlex: 160 }, { heelRiseM: 0.04 },
  ];
  for (const o of cases) {
    for (const d of [0.3, 0.6, 1]) {
      it(`overhead squat ${JSON.stringify(o)} at depth ${d}`, () => {
        const j = ohsJoints(d, o);
        const truth = ohsTruth(j);
        const { img, aspect } = shot(turnSide(j, 'left'));
        const face = facingSign(img);
        expect(face).toBe(-1);                          // left side to the lens faces image-left
        expect(nearSide(img)).toBe('left');
        expect(Math.abs(kneeFlexion(img, 'left', aspect) - truth.kneeFlex)).toBeLessThanOrEqual(TOL);
        expect(Math.abs(hipFlexion(img, 'left', aspect) - truth.hipFlex)).toBeLessThanOrEqual(TOL);
        expect(Math.abs(trunkAngle(img, aspect, face as -1) - truth.trunk)).toBeLessThanOrEqual(TOL);
        expect(Math.abs(tibiaAngle(img, 'left', aspect, face as -1) - truth.tibia)).toBeLessThanOrEqual(TOL);
        expect(Math.abs(trunkTibiaDiff(img, 'left', aspect, face as -1) - truth.trunkTibia)).toBeLessThanOrEqual(TOL);
        expect(Math.abs(shoulderFlexion(img, 'left', aspect) - truth.shoulderFlex)).toBeLessThanOrEqual(TOL);
        expect(Math.abs(hipAboveKnee(img, 'left', aspect) - truth.hipAboveKnee)).toBeLessThanOrEqual(0.03);
      });
    }
  }

  it('the knee-to-wall shin, each side, facing either way', () => {
    for (const side of ['left', 'right'] as const) {
      for (const tibiaMax of [30, 38, 46]) {
        const j = kneeWallJoints(side, 1, { tibiaMax });
        const { img, aspect } = shot(turnSide(j, side));
        const face = facingSign(img);
        expect(face, side).toBe(side === 'left' ? -1 : 1);
        expect(nearSide(img), side).toBe(side);
        expect(Math.abs(tibiaAngle(img, side, aspect, face as 1 | -1) - kneeWallTruth(j, side).tibia), `${side} ${tibiaMax}`).toBeLessThanOrEqual(TOL);
      }
    }
  });

  it('WHY THE ASPECT: the same angle read in normalised units is off by more than the tolerance', () => {
    const j = ohsJoints(1, { tibia: 40 });
    const { img, aspect } = shot(turnSide(j, 'left'));
    const raw = angleAt(pt(img[23], 1), pt(img[25], 1), pt(img[27], 1));
    const right = angleAt(pt(img[23], aspect), pt(img[25], aspect), pt(img[27], aspect));
    expect(Math.abs(raw - right)).toBeGreaterThan(TOL);
  });
});

describe('front view: FPPA, pelvis, trunk lean, depth — within ±2° of the joints', () => {
  const cases: SlsOpts[] = [
    {}, { kneeIn: 0.03 }, { kneeIn: 0.06 }, { kneeIn: -0.03 }, { pelvicDrop: 8 }, { trunkLean: 12 }, { depth: 45, kneeIn: 0.05, pelvicDrop: 6, trunkLean: 8 },
  ];
  for (const stance of ['left', 'right'] as const) {
    for (const o of cases) {
      it(`single-leg squat on the ${stance} ${JSON.stringify(o)}`, () => {
        for (const d of [0.5, 1]) {
          const j = slsJoints(stance, d, o);
          const truth = slsTruth(j, stance);
          const { img, world, aspect } = shot(j);
          expect(Math.abs(fppa(img, stance, aspect) - truth.fppa), `fppa d=${d}`).toBeLessThanOrEqual(TOL);
          expect(Math.abs(pelvicTilt(img, stance, aspect) - truth.pelvicTilt), `pelvis d=${d}`).toBeLessThanOrEqual(TOL);
          expect(Math.abs(lateralTrunkLean(img, aspect) - truth.trunkLean), `lean d=${d}`).toBeLessThanOrEqual(TOL);
          expect(Math.abs(kneeFlexionWorld(world, stance) - truth.kneeFlex), `world knee d=${d}`).toBeLessThanOrEqual(TOL);
        }
      });
    }
  }

  it('WHY THE PARALLAX CORRECTION: without it a straight knee bending toward the lens reads over 2° pushed out', () => {
    const { img, aspect } = shot(slsJoints('left', 1));
    expect(fppa(img, 'left', aspect, 0)).toBeLessThan(-TOL);        // hfov 0 = no correction
    expect(Math.abs(fppa(img, 'left', aspect))).toBeLessThanOrEqual(TOL);
  });

  it('FPPA is + for a knee caving in and − for a knee pushed out, on the correct leg', () => {
    const inL = shot(slsJoints('left', 1, { kneeIn: 0.06 }));
    const outL = shot(slsJoints('left', 1, { kneeIn: -0.04 }));
    expect(fppa(inL.img, 'left', inL.aspect)).toBeGreaterThan(8);
    expect(fppa(outL.img, 'left', outL.aspect)).toBeLessThan(-4);
    const inR = shot(slsJoints('right', 1, { kneeIn: 0.06 }));
    expect(fppa(inR.img, 'right', inR.aspect)).toBeGreaterThan(8);
  });

  it('knee flexion from the front WITHOUT world landmarks is an estimate, within ±6° on a clean single-leg squat', () => {
    const stand = shot(slsJoints('left', 0));
    const legY = stand.img[27].y - stand.img[23].y;
    for (const depth of [30, 45, 62]) {
      const j = slsJoints('left', 1, { depth });
      const { img } = shot(j);
      expect(Math.abs(kneeFlexionFromFront(img, 'left', legY) - slsTruth(j, 'left').kneeFlex), `${depth}`).toBeLessThanOrEqual(6);
    }
  });

  it('a level stance reads a level pelvis, an upright trunk, and no weight shift', () => {
    const { img, aspect } = shot(restPose());
    expect(Math.abs(pelvicTilt(img, 'left', aspect))).toBeLessThan(0.5);
    expect(lateralTrunkLean(img, aspect)).toBeLessThan(0.5);
    expect(Math.abs(weightShift(img))).toBeLessThan(0.02);
  });
});

describe('the knee-inside ratio is squat-audit\'s, number for number', () => {
  for (const name of ['squat_clean', 'squat_knee_in_left', 'squat_knee_in_right', 'squat_knees_out_both']) {
    it(name, () => {
      for (const f of toPoseFrames(readFixture(name)).filter((x) => x.present)) {
        const img = f.image as Lm[];
        const hipX = (img[23].x + img[24].x) / 2, half = Math.abs(img[23].x - img[24].x) / 2;
        expect(kneeInsideRatio(img, 'left')).toBeCloseTo(kneeInwardRatio(img[23], img[25], img[27], hipX, half), 10);
        expect(kneeInsideRatio(img, 'right')).toBeCloseTo(kneeInwardRatio(img[24], img[26], img[28], hipX, half), 10);
      }
    });
  }

  it('reads the caving knee on its own side, and a clean squat reads clean', () => {
    const peak = (name: string, side: 'left' | 'right') =>
      Math.max(...toPoseFrames(readFixture(name)).filter((f) => f.present).map((f) => kneeInsideRatio(f.image, side)));
    expect(peak('squat_knee_in_left', 'left')).toBeGreaterThan(0.35);
    expect(peak('squat_knee_in_left', 'right')).toBeLessThan(0.15);
    expect(peak('squat_clean', 'left')).toBeLessThan(0.15);
    expect(peak('squat_clean', 'right')).toBeLessThan(0.15);
  });
});
