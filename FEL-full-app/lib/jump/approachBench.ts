// approachBench — the approach-jump conditions of the accuracy bench (JUMP-PRO 2, 2026-10-24). Each take is one approach
// (lib/jump/approachTake.ts) filmed side-on through lib/pose/synth.ts and scored by lib/jump/bench.ts scoreTakes against
// the centre of mass's take-off-velocity height. Run it: `npx tsx scripts/jump-accuracy.ts --approach`.
//
// The "before" readers (the jump check's finder and T5) need a front calibration; they get the best one there is: the
// standing-reach clip filmed at the take-off spot through the same lens (lib/jump/approachTake.ts buildReach).
//
// Pure, deterministic.
import { filmTake, type FilmOptions } from './ballistic';
import { buildApproach, buildReach, APPROACH_CAMERA, type ApproachSpec } from './approachTake';
import { calibrateFront, type Calibration } from '@/lib/assess/calibration';
import { scoreTakes, type BenchTake, type ConditionResult, type JumpReaderFn } from './bench';
import { readApproach } from './approach';

export interface ApproachCondition {
  name: string;
  fps: number;
  spec: Omit<ApproachSpec, 'heightM'>;
  heights?: number[];
  film?: Omit<FilmOptions, 'fps' | 'seed'>;
  seeds?: number;
}

/** The approach heights (m, centre of mass): a modest, a good and a big approach vertical. */
export const APPROACH_HEIGHTS = [0.45, 0.6, 0.75];

const reachCal = new Map<string, Calibration | null>();
/** The front calibration from the standing-reach clip at the take-off spot (its first second, arms down). */
export function reachCalibration(fps: number, seed: number): Calibration | null {
  const k = `${fps}:${seed}`;
  if (!reachCal.has(k)) {
    const r = buildReach();
    const { frames } = filmTake({ clip: r.clip, truth: [], decoys: 0 }, { fps, seed, distance: APPROACH_CAMERA.distance });
    // 4.5 m out the landmark jitter is a bigger share of the body: the live sway gate refuses some stands, so the bench
    // reads on with a loose sway (the "before" readers get the best calibration there is)
    const stand = frames.filter((f) => f.t < 1400);
    const c0 = calibrateFront(stand, 4 / 3, 1000);
    const c = c0.ok ? c0 : calibrateFront(stand, 4 / 3, 1000, 0.3);
    reachCal.set(k, c.ok ? { aspect: 4 / 3, front: c.value, side: null } : null);
  }
  return reachCal.get(k)!;
}

export function approachTakes(c: ApproachCondition): BenchTake[] {
  const out: BenchTake[] = [];
  for (let seed = 1; seed <= (c.seeds ?? 4); seed++) {
    for (const h of c.heights ?? APPROACH_HEIGHTS) {
      const take = buildApproach({ ...c.spec, heightM: h });
      const { frames, truth } = filmTake({ clip: take.clip, truth: take.truth, decoys: 0 }, { fps: c.fps, seed: seed * 101 + Math.round(h * 100), distance: APPROACH_CAMERA.distance, ...c.film });
      out.push({ frames, truth, calib: reachCalibration(c.fps, seed) });
    }
  }
  return out;
}

export const runApproach = (c: ApproachCondition, reader: JumpReaderFn): ConditionResult => scoreTakes(c.name, c.fps, approachTakes(c), reader);

/** The approach reader behind the bench's signature (it needs no calibration: the legs are the ruler's check). */
export const approachReader: JumpReaderFn = (frames, _calib, fps) =>
  readApproach(frames, { aspect: 4 / 3, poseHz: fps }).jumps.map((j) => ({ takeoffT: j.takeoffT, landT: j.landT, heightCm: j.heightCm, valid: j.valid, ...(j.invalidWhy ? { why: j.invalidWhy } : {}) }));

/** The approach matrix: each condition at each frame rate. */
export function approachConditions(seeds = 4): ApproachCondition[] {
  const out: ApproachCondition[] = [];
  for (const fps of [30, 60, 120, 240]) {
    out.push({ name: 'one-foot, 4 m/s, arm swing', fps, spec: { takeoff: 'one' }, seeds });
    out.push({ name: 'one-foot, fast (5.5 m/s)', fps, spec: { takeoff: 'one', runSpeed: 5.5 }, seeds });
    out.push({ name: 'one-foot, slow (2.5 m/s)', fps, spec: { takeoff: 'one', runSpeed: 2.5 }, seeds });
    out.push({ name: 'two-foot step-close', fps, spec: { takeoff: 'two' }, seeds });
    out.push({ name: 'no arm swing', fps, spec: { takeoff: 'one', armSwing: false }, seeds });
    out.push({ name: 'run angled 12° toward the lens', fps, spec: { takeoff: 'one', headingDeg: 12 }, seeds });
    out.push({ name: 'run angled 12° away from the lens', fps, spec: { takeoff: 'one', headingDeg: -12 }, seeds });
    out.push({ name: 'bent-knee landing', fps, spec: { takeoff: 'one', landKnee: 0.3 }, seeds });
    out.push({ name: 'motion blur', fps, spec: { takeoff: 'one' }, film: { blur: true }, seeds });
  }
  return out;
}
