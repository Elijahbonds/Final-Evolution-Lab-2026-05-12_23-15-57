// hoops-perf (2026-11-12, owner: "cut heap churn … never change a result"). The allocation pass on the per-frame body layers —
// footGlide, SecondaryMotion, LandingAbsorb (and the AdditiveTrack they share) — is proven here the way rigLayers.equivalence proves
// the RIG-PERF pass: the same seeded clips, root path and posture feed run on the real hero rig through the FROZEN pre-change layers
// (tests/helpers/rigLegacy/*.churn.legacy.ts, lane/finish-release 87e4b9f0) and through the live ones, and every bone's local position,
// rotation and world matrix must match BIT FOR BIT on every frame. No tolerance: each ToRef form is its allocating form's own maths.
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../feel-panel/feel', () => ({ feel: (id: string, def: number) => (id === 'anim.plantEngageSec' || id === 'anim.hipYawFold' || id === 'anim.plantReleaseSec' || id === 'anim.plantReplantEase' || id === 'anim.plantSeatedOff' ? 0 : def) }));
import { Vector3 } from '@babylonjs/core';
import type { Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { firstDifference, runRigScenario, type RigImpl, type RigScenario } from '@/tests/helpers/rigEquivalence';
import * as Posture from './PostureLayer';
import * as Plant from './FootPlanting';
import * as IK from './TwoBoneIK';
import * as Hand from './HandIK';
import * as Glide from './footGlide';
import * as Secondary from './SecondaryMotion';
import * as Landing from './LandingAbsorb';
import * as Additive from './AdditiveTrack';
import * as LegacyGlide from '@/tests/helpers/rigLegacy/footGlide.churn.legacy';
import * as LegacySecondary from '@/tests/helpers/rigLegacy/SecondaryMotion.churn.legacy';
import * as LegacyLanding from '@/tests/helpers/rigLegacy/LandingAbsorb.churn.legacy';
import * as LegacyAdditive from '@/tests/helpers/rigLegacy/AdditiveTrack.churn.legacy';
import { NavBounds } from '../core/NavBounds';
import { NavBounds as LegacyNavBounds } from '@/tests/helpers/rigLegacy/NavBounds.churn.legacy';
import { HOOPS_LEGS, HOOPS_POSTURE } from '../core/HoopsPosture';
import { POSTURE } from '../core/DunkPosture';
import { LEGS } from '../core/DunkLegs';

type Layers = { glide: typeof Glide; secondary: typeof Secondary; landing: typeof Landing };
/** The RIG-PERF impl (live posture, planting, IK, hinge) with the three body layers mounted beside the planter, as a spawn mounts them. */
function implWith(name: string, L: Layers): RigImpl {
  return {
    name, mountPostureLayer: Posture.mountPostureLayer, claimLeg: Plant.claimLeg, releaseLeg: Plant.releaseLeg, solveChainInFrame: IK.solveChainInFrame,
    makeHingeArm: Hand.makeHingeArm as RigImpl['makeHingeArm'], hingeArmApply: Hand.hingeArmApply as RigImpl['hingeArmApply'],
    mountFootPlanting: (scene: Scene, skinned, sk: Skeleton, opts: { root: TransformNode; intensity?: number }) => {
      const plant = Plant.mountFootPlanting(scene, skinned, sk, opts);
      const glide = L.glide.FootGlide.for(scene, sk, opts.root);
      let f = 0;
      const look = new Vector3();
      const sec = L.secondary.mountSecondaryMotion(scene, sk, { intensity: 1, activity: () => (f++ % 120) / 120, lookTarget: () => (f % 200 < 150 ? look.set(Math.sin(f * 0.03) * 3, 1.6, 2 + Math.cos(f * 0.02)) : null) });
      const land = L.landing.mountLandingAbsorb(scene, sk, opts.root);
      return { get debug() { return plant.debug; }, dispose() { plant.dispose(); glide.dispose(); sec.dispose(); land.dispose(); } };
    },
  };
}
const LEGACY = implWith('legacy-churn', { glide: LegacyGlide as unknown as typeof Glide, secondary: LegacySecondary as unknown as typeof Secondary, landing: LegacyLanding as unknown as typeof Landing });
const LIVE = implWith('live-churn', { glide: Glide, secondary: Secondary, landing: Landing });

const SCENARIOS: RigScenario[] = [
  { name: '3v3', clips: ['bball_mc_dribble_run', 'bball_mc_crossover_left', 'bball_mc_defend_slide_left', 'bball_mc_jumpshot', 'bball_mc_spin'], frames: 300, clipFrames: 50, postures: HOOPS_POSTURE, legs: HOOPS_LEGS, speed: 4, turn: 2.5, hop: [236, 252], plantIntensity: 1, seed: 33 },
  { name: 'dunk', clips: ['run', 'dunk_mc_tomahawk', 'dunk_360_windmill', 'dunk_land_crouch'], frames: 300, clipFrames: 60, postures: POSTURE, legs: LEGS, speed: 6, turn: 0.8, jump: [150, 192], spin: true, plantIntensity: 0.6, seed: 7 },
  { name: 'idle', clips: ['idle_stand', 'bball_mc_dribble_run', 'idle_stand'], frames: 240, clipFrames: 80, postures: HOOPS_POSTURE, legs: HOOPS_LEGS, speed: 0.3, turn: 0.2, plantIntensity: 1, seed: 3 },
];

describe('the per-frame body layers move every bone exactly as before the allocation pass (frozen 87e4b9f0 vs live, bit for bit)', () => {
  for (const sc of SCENARIOS) {
    it(`${sc.name}: every bone's local position / rotation / world matrix identical on every frame`, async () => {
      const a = await runRigScenario(LEGACY, sc), b = await runRigScenario(LIVE, sc);
      expect(a.missingClips).toEqual([]);
      expect(a.rows.length).toBe(sc.frames);
      expect(firstDifference(a, b), `${sc.name}: the first column that differs`).toBeNull();
    }, 120_000);
  }
  it('the check can see a change: a one-ulp nudge to a bone in the live run is caught', async () => {
    const sc = SCENARIOS[2];
    const a = await runRigScenario(LIVE, sc);
    const b = await runRigScenario(LIVE, sc, (frame, sk) => { if (frame === 120) { const n = sk.bones[5].getTransformNode()!; n.position.x += 1e-9; n.computeWorldMatrix(true); } });
    expect(firstDifference(a, b)).not.toBeNull();
  }, 120_000);
});

describe('AdditiveTrack: the same bases and the same answers as before, without an array a call', () => {
  it('a seeded stream of writes and reads gives the frozen copy\'s values exactly', () => {
    let t = 7; const rnd = () => { t = (t * 16807) % 2147483647; return t / 2147483647; };
    const qa = new LegacyAdditive.AdditiveQuat(), qb = new Additive.AdditiveQuat(), sa = new LegacyAdditive.AdditiveScalar(), sb = new Additive.AdditiveScalar();
    let last = [0, 0, 0, 1];
    for (let i = 0; i < 4000; i++) {
      const same = rnd() < 0.4;   // the clip left the bone alone: it shows what we wrote
      const cur = same ? last : [rnd(), rnd(), rnd(), rnd()];
      const ba = [...qa.baseFor(cur[0], cur[1], cur[2], cur[3])], bb = [...qb.baseFor(cur[0], cur[1], cur[2], cur[3])];
      expect(bb).toEqual(ba);
      const out = [ba[0] + 0.01, ba[1], ba[2] - 0.01, ba[3]];
      qa.wrote(out[0], out[1], out[2], out[3]); qb.wrote(out[0], out[1], out[2], out[3]); last = out;
      const v = rnd() < 0.4 ? i * 0.5 : rnd();
      expect(Object.is(sb.baseFor(v), sa.baseFor(v))).toBe(true);
      sa.wrote(v + 1); sb.wrote(v + 1);
      if (i % 500 === 0) { qa.reset(); qb.reset(); sa.reset(); sb.reset(); }
    }
  });
});

describe('NavBounds: the same walkable point for every query as before (number keys, a reused candidate list)', () => {
  it('a navmesh of convex cells, 20 000 seeded points inside, outside and on edges', () => {
    const polys = [] as { pts: [number, number][] }[];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) { const x = i * 3 - 9, z = j * 3 - 6; polys.push({ pts: [[x, z], [x + 2.5, z], [x + 2.8, z + 2.6], [x + 0.2, z + 2.4]] }); }
    const data = { mapKey: 'eq', cell: 2, polys, bbox: [-9, -6, 9, 6] as [number, number, number, number] };
    const a = new LegacyNavBounds(data), b = new NavBounds(data);
    let t = 11; const rnd = () => { t = (t * 48271) % 2147483647; return t / 2147483647; };
    for (let k = 0; k < 20000; k++) {
      const x = (rnd() - 0.5) * 30, z = (rnd() - 0.5) * 24;
      expect(b.contains(x, z)).toBe(a.contains(x, z));
      const p = a.constrain(x, z), q = b.constrain(x, z);
      expect(Object.is(q[0], p[0]) && Object.is(q[1], p[1])).toBe(true);
    }
  });
});
