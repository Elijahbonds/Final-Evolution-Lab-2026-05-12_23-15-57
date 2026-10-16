// RIG-PERF (2026-10-16, owner: "optimise the rig layers" — the motion must be identical). The allocation pass on PostureLayer,
// TwoBoneIK and FootPlanting is proven here: the same seeded clips, root path, posture feed and arm reaches run through the frozen
// pre-change layers (tests/helpers/rigLegacy, 0a4a250b) and through the live ones, on the real hero rig, and every bone's local
// position, rotation and world matrix — and every layer readout — must match BIT FOR BIT (Object.is: −0 ≠ 0) on every frame.
// No tolerance: the rewrite keeps every float operation and its order (Babylon's ToRef forms are the same arithmetic as the
// allocating forms they replace), so there is nothing a tolerance would be needed for.
import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from '@babylonjs/core';
import { firstDifference, runRigScenario, type RigImpl, type RigScenario, type RigTrace } from '@/tests/helpers/rigEquivalence';
import * as LegacyPosture from '@/tests/helpers/rigLegacy/PostureLayer.legacy';
import * as LegacyPlant from '@/tests/helpers/rigLegacy/FootPlanting.legacy';
import * as LegacyIK from '@/tests/helpers/rigLegacy/TwoBoneIK.legacy';
import * as LegacyHand from '@/tests/helpers/rigLegacy/HandIK.legacy';
import * as Posture from './PostureLayer';
import * as Plant from './FootPlanting';
import * as IK from './TwoBoneIK';
import * as Hand from './HandIK';
import { boneNode } from './boneLookup';
import { HOOPS_LEGS, HOOPS_POSTURE } from '../core/HoopsPosture';
import { POSTURE } from '../core/DunkPosture';
import { LEGS } from '../core/DunkLegs';
import { COMBAT_LEGS, COMBAT_POSTURE } from '../core/CombatPosture';
import { RUN_LEGS, RUN_POSTURE } from '../core/RunPosture';
import { STAGE_LEGS, STAGE_POSTURE } from '../core/StagePosture';
import { LOCO_CLIP } from './LocoBus';
import { DANCE_CLIP_IDS } from './danceClips';

const LEGACY: RigImpl = { name: 'legacy', mountPostureLayer: LegacyPosture.mountPostureLayer, mountFootPlanting: LegacyPlant.mountFootPlanting, claimLeg: LegacyPlant.claimLeg, releaseLeg: LegacyPlant.releaseLeg, solveChainInFrame: LegacyIK.solveChainInFrame,
  makeHingeArm: LegacyHand.makeHingeArm as RigImpl['makeHingeArm'], hingeArmApply: LegacyHand.hingeArmApply as RigImpl['hingeArmApply'] };
const LIVE: RigImpl = { name: 'live', mountPostureLayer: Posture.mountPostureLayer, mountFootPlanting: Plant.mountFootPlanting, claimLeg: Plant.claimLeg, releaseLeg: Plant.releaseLeg, solveChainInFrame: IK.solveChainInFrame,
  makeHingeArm: Hand.makeHingeArm as RigImpl['makeHingeArm'], hingeArmApply: Hand.hingeArmApply as RigImpl['hingeArmApply'] };

const FRAMES = 300;
export const RIG_SCENARIOS: RigScenario[] = [
  { name: '3v3', clips: ['bball_mc_dribble_run', 'bball_mc_crossover_left', 'bball_mc_defend_slide_left', 'bball_mc_jumpshot', 'bball_mc_spin'], frames: FRAMES, clipFrames: 50, postures: HOOPS_POSTURE, legs: HOOPS_LEGS, speed: 4, turn: 2.5, hop: [236, 252], plantIntensity: 1, seed: 33 },
  { name: 'dunk', clips: ['run', 'dunk_mc_tomahawk', 'dunk_360_windmill', 'dunk_land_crouch'], frames: FRAMES, clipFrames: 60, postures: POSTURE, legs: LEGS, speed: 6, turn: 0.8, jump: [150, 192], spin: true, plantIntensity: 1, seed: 7 },
  { name: 'karate', clips: ['karate_guard_step', 'karate_mc_jab', 'karate_mc_roundhouse', 'karate_mc_hook', 'karate_shuffle_left'], frames: FRAMES, clipFrames: 45, postures: COMBAT_POSTURE, legs: COMBAT_LEGS, speed: 1.2, turn: 3, hop: [200, 216], plantIntensity: 1, seed: 11 },
  { name: 'sprint', clips: [LOCO_CLIP.run, 'run', LOCO_CLIP.walk], frames: FRAMES, clipFrames: 80, postures: RUN_POSTURE, legs: RUN_LEGS, speed: 8.5, turn: 0.4, jump: [220, 246], plantIntensity: 0.6, seed: 100 },
  { name: 'dance', clips: [DANCE_CLIP_IDS[0], DANCE_CLIP_IDS[1], 'dance_power_windmill', 'dance_footwork_six'], frames: FRAMES, clipFrames: 75, postures: STAGE_POSTURE, legs: STAGE_LEGS, speed: 0.6, turn: 4, hop: [120, 136], plantIntensity: 1, seed: 5 },
];

const runs = new Map<string, Promise<[RigTrace, RigTrace]>>();
const pair = (sc: RigScenario) => { let p = runs.get(sc.name); if (!p) { p = (async () => [await runRigScenario(LEGACY, sc), await runRigScenario(LIVE, sc)] as [RigTrace, RigTrace])(); runs.set(sc.name, p); } return p; };

describe('the rig layers move every bone exactly as before the allocation pass (legacy 0a4a250b vs live, bit for bit)', () => {
  for (const sc of RIG_SCENARIOS) {
    it(`${sc.name}: ${FRAMES} frames, every bone's local position / rotation / world matrix and every layer readout identical`, async () => {
      const [a, b] = await pair(sc);
      expect(a.missingClips, `${sc.name}: every named clip is in the library`).toEqual([]);
      // the run exercises what it claims to: the clips change, feet plant and let go, the layer steps out and back in, the reach
      // slerps; the jump scenarios go airborne (and the dunk spins); every scenario claims a leg and teleports once
      expect(a.coverage.plantedFrames, `${sc.name} coverage`).toBeGreaterThan(20);
      expect(a.coverage.releases).toBeGreaterThan(0);
      expect(a.coverage.claimFrames).toBe(18);
      expect(a.coverage.teleports).toBe(1);
      expect(a.coverage.reachSlerpFrames).toBeGreaterThan(50);
      expect(a.coverage.postureOffFrames).toBeGreaterThan(0);
      expect(a.coverage.postureOk).toBe(1);
      expect(a.coverage.aimFrames).toBeGreaterThan(50);
      expect(a.coverage.eyesFrames).toBeGreaterThan(50);
      if (sc.jump || sc.hop) expect(a.coverage.flyingFrames).toBeGreaterThan(5);
      if (sc.hop) expect(a.coverage.liftOffWhilePlanted, `${sc.name}: a hop leaves a planted foot`).toBeGreaterThan(0);
      expect(a.coverage.hinges).toBe(2);
      expect(a.coverage.propsUnderBones).toBe(2);
      if (sc.spin) expect(a.coverage.spinFrames).toBeGreaterThan(20);
      expect(a.rows.length).toBe(FRAMES);
      const d = firstDifference(a, b);
      expect(d, d ? `${sc.name}: first difference at frame ${d.frame}, ${d.column}: ${d.a} vs ${d.b} (${d.count} numbers differ)` : '').toBeNull();
    });
  }
});

describe('the equivalence check catches a change (mutation)', () => {
  it('a 1e-9 rad turn of one forearm on one frame is reported at that frame and bone', async () => {
    const sc = RIG_SCENARIOS[0];
    const [a] = await pair(sc);
    const tweak = Quaternion.RotationAxis(new Vector3(0, 0, 1), 1e-9);
    const b = await runRigScenario(LIVE, sc, (frame, sk) => { if (frame === 120) { const n = boneNode(sk, 'LeftForeArm')!; n.rotationQuaternion = tweak.multiply(n.rotationQuaternion!); } });
    const d = firstDifference(a, b);
    expect(d).not.toBeNull();
    expect(d!.frame).toBe(120);
    expect(d!.column.startsWith('LeftForeArm')).toBe(true);
  });
});

describe('chainRotation is unchanged on its own (the bindFrame and DunkMode callers)', () => {
  it('the live and frozen chainRotation return the same quaternion, bit for bit, for every bone of a posed rig', async () => {
    const sc = RIG_SCENARIOS[2];
    let checked = 0, mismatched = 0;
    await runRigScenario(LIVE, { ...sc, frames: 40 }, (frame, sk) => {
      if (frame % 10 !== 9) return;
      const frameNode = IK.frameAbove(sk.bones[0].getTransformNode()!);
      for (const b of sk.bones) {
        const n = b.getTransformNode(); if (!n) continue;
        const q1 = IK.chainRotation(n, frameNode), q0 = LegacyIK.chainRotation(n, frameNode);
        checked++; if (!(Object.is(q1.x, q0.x) && Object.is(q1.y, q0.y) && Object.is(q1.z, q0.z) && Object.is(q1.w, q0.w))) mismatched++;
      }
    });
    expect(checked).toBeGreaterThan(80);
    expect(mismatched).toBe(0);
  });
});

describe('the pure solver matches on the branches live motion never reaches', () => {
  // a straight chain (the bend axis falls back to the pole, then +z, then +x), a target on the chain's own line both ways (the aim's
  // identity and half-turn branches), a degenerate bone, a target at the root, out of reach, and a pole along the chain
  const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
  const cases: [string, IK.TwoBoneInput][] = [
    ['straight, no pole', { root: V(0, 1, 0), mid: V(0, 0.5, 0), end: V(0, 0, 0), target: V(0.1, 0.1, 0.2) }],
    ['straight, pole', { root: V(0, 1, 0), mid: V(0, 0.5, 0), end: V(0, 0, 0), target: V(0.1, 0.1, 0.2), pole: V(0, 0, 1) }],
    ['straight along +z, no pole', { root: V(0, 0, 0), mid: V(0, 0, 0.5), end: V(0, 0, 1), target: V(0.2, 0.1, 0.8) }],
    ['straight along +z, pole along it', { root: V(0, 0, 0), mid: V(0, 0, 0.5), end: V(0, 0, 1), target: V(0.2, 0.1, 0.8), pole: V(0, 0, 1) }],
    ['target behind (half turn)', { root: V(0, 1, 0), mid: V(0, 0.55, 0.02), end: V(0, 0.1, 0), target: V(0, 1.9, 0) }],
    ['target dead ahead (identity aim)', { root: V(0, 1, 0), mid: V(0, 0.55, 0.05), end: V(0, 0.1, 0), target: V(0, 0.1, 0) }],
    ['degenerate upper bone', { root: V(0, 1, 0), mid: V(0, 1, 0), end: V(0, 0.5, 0), target: V(0, 0.4, 0.1) }],
    ['target at the root', { root: V(0, 1, 0), mid: V(0, 0.5, 0.1), end: V(0, 0, 0), target: V(0, 1, 0), pole: V(0, 0, 1) }],
    ['out of reach', { root: V(0, 1, 0), mid: V(0.05, 0.5, 0.1), end: V(0, 0, 0), target: V(3, -2, 1), pole: V(0, 0, 1) }],
  ];
  for (const [name, input] of cases) {
    it(name, () => {
      const a = LegacyIK.solveTwoBone(input), b = IK.solveTwoBone(input);
      for (const k of ['x', 'y', 'z', 'w'] as const) { expect(Object.is(b.root[k], a.root[k]), `root.${k} ${b.root[k]} vs ${a.root[k]}`).toBe(true); expect(Object.is(b.mid[k], a.mid[k]), `mid.${k}`).toBe(true); }
      expect(Object.is(b.reach, a.reach)).toBe(true);
    });
  }
});
