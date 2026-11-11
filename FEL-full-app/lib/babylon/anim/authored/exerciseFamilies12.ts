// DEMOS-FIX-2 (2026-11-11, owner 2026-11-10 "Fix the demos"): the loops for what the session player still showed a still for
// after DEMOS-FIX (scripts/probes/demos-fix/demos-audit.mts): FEL's four coach-template rows with no loop, the moves where the
// whole body rolls over, the machines, the travelling drills and the basketball program's drills. Each is read against its
// library entry's own setup and cues and, where it has one, its free-exercise-db source (scripts/probes/demo-loops/source-text.mjs).
// Same kit and pipeline as the library's loops: GATE 0 on every body is poseGuard.test.ts, the floor and the closed seam
// exercise.test.ts.
import { Quaternion, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import { ANKLE, TOE_ANKLE, STAND, HANG_POLES, HIGH_PLANK, both, bothDir, lie, rep, type Deg3, type ExKey, type Pair, type V3 } from './exerciseKit';
import { buildPoseClip, type PoseKey } from '../poseClip';
import { BEHIND_V2, BETWEEN_V2, CROSSOVER_V2, STANCE_FEET, carryStanceAtBind, handleV2Keys, mirrorKey, type V2Key } from './basketball';
import { run, at, other, sx, stride, BEAR, SIDE_PLANK } from './exerciseBody';
import { QUAD_POSE, turn } from './exerciseFloor';
import { alternating } from './exerciseMore';
import { DIPPED, FLIGHT, LANDED, PUSH, STANDING, STICK, oneLegLand, runStep, walkBack } from './exerciseSignature';

type Pose = Omit<ExKey, 't'>;
type Side = 'Left' | 'Right';
type Builder = (scene: Scene, sk: Skeleton) => AnimationGroup | null;
const D2R = Math.PI / 180;
/** The bar across the upper back (exerciseFamilies9.ts BAR). */
const BAR: Pair = { Left: [-0.24, 0.02, -0.10], Right: [0.24, 0.02, -0.10] };
const BAR_POLES = bothDir(0.3, -1, -0.3);
const BAR_GRIP: Record<string, Deg3> = { LeftHand: [0, 0, -85], RightHand: [0, 0, -85] };

// ── the pike push-up, hands up and feet up (FEL's coach templates) ─────────────────────────────────────────────────────

/** ex_pike_pushup_hands_up (Hands-Elevated Pike Push-Up) — the hands on a bench (demo.ts PROP_SHAPES handbench), the hips
 *  high so the body makes an upside-down V: the elbows bend and the top of the head lowers toward the bench, then press back
 *  up. */
const pikeHandsUp: Builder = (scene, sk) => {
  const top: Pose = { bones: { Hips: [112, 0, 0], Spine: [0, 0, 0], Neck: [-14, 0, 0], LeftFoot: [22, 0, 0], RightFoot: [22, 0, 0] }, feet: both(0.13, TOE_ANKLE + 0.04, -0.56), kneePoles: bothDir(0, 0, 1), handsAt: both(0.22, 0.47, 0.56), poles: bothDir(0.6, 0, -0.8), hipsY: -0.03, hipsZ: -0.38 };
  const low: Pose = { ...top, bones: { ...top.bones, Hips: [120, 0, 0], Neck: [-22, 0, 0] }, poles: bothDir(1, 0.3, -0.4), hipsY: -0.22, hipsZ: -0.22 };
  return rep(scene, sk, 'ex_pike_pushup_hands_up', top, low, 1.0, 0.15, 0.9, 0.45);
};

/** ex_pike_pushup_feet_up (Feet-Elevated Pike Push-Up) — the toes on a box behind (demo.ts PROP_SHAPES feetbox), the hands on
 *  the floor and the hips stacked high over them: lower slow, the top of the head toward the floor in front of the hands, then
 *  press up. */
const FEET_BOX_TOP = 0.44;
const pikeFeetUp: Builder = (scene, sk) => {
  const top: Pose = { bones: { Hips: [146, 0, 0], Spine: [0, 0, 0], Neck: [-10, 0, 0], LeftFoot: [40, 0, 0], RightFoot: [40, 0, 0] }, feet: both(0.13, FEET_BOX_TOP + TOE_ANKLE + 0.02, -0.52), kneePoles: bothDir(0, 0, 1), hands: both(0.22, 0.05, 0.46), poles: bothDir(0.6, 0, -0.8), hipsY: -0.02, hipsZ: 0.16 };
  const low: Pose = { ...top, bones: { ...top.bones, Hips: [154, 0, 0], Neck: [-18, 0, 0] }, poles: bothDir(1, 0.3, -0.4), hipsY: -0.20, hipsZ: 0.26 };
  return rep(scene, sk, 'ex_pike_pushup_feet_up', top, low, 1.2, 0.15, 0.9, 0.45);
};

// ── jumps and sticks (FEL's coach templates) ──────────────────────────────────────────────────────────────────────────

/** ex_broad_jump_double (Double Broad Jump and Stick) — two short broad jumps in a row, the second straight off the first
 *  landing (the arms swing back as the knees dip and through again), the last landing stuck for a two-count; walk back. */
const broadJumpDouble: Builder = (scene, sk) => {
  const d = 0.60;
  return run(scene, sk, 'ex_broad_jump_double', 5.6, [
    at(STANDING(0), 0, true), at(DIPPED(0), 0.5, true), at(PUSH(0.06), 0.64), at(FLIGHT(d * 0.5, 0.16), 0.8), at(LANDED(d), 0.98),
    at(DIPPED(d), 1.1), at(PUSH(d + 0.06), 1.24), at(FLIGHT(d * 1.5, 0.16), 1.4), at(LANDED(2 * d), 1.6, true), at(LANDED(2 * d), 2.5, true), at(STANDING(2 * d), 2.9, true),
    ...walkBack(2 * d, 2.9),
  ]);
};

/** ex_lateral_step_stick (Lateral Step and Stick) — a big step to the right; land on that foot and hold still for a two-count,
 *  the knee over the laces and the hips back a little; set the other foot down beside it; then the same to the left, back to
 *  the start. */
const lateralStepStick: Builder = (scene, sk) => {
  const d = 0.56, z = 0.04;
  // one foot in the air on the way out (the weight on the other), then both down wide as the step lands
  const lift = (s: Side, x: number): Pose => {
    const st = other(s);
    return { bones: { ...STAND, Hips: [6, 0, 0], [`${s}Foot`]: [-6, 0, 0] } as Record<string, Deg3>, feet: { [st]: [x + sx(st, 0.12), ANKLE, z], [s]: [x + sx(s, 0.30), ANKLE + 0.12, z] } as Pair, kneePoles: { [st]: [sx(st, 0.1), 0, 1], [s]: [sx(s, 0.3), 0, 1] } as Pair, hands: { Left: [x - 0.24, 0.86, z + 0.06], Right: [x + 0.24, 0.86, z + 0.06] }, poles: HANG_POLES, hipsY: -0.04, hipsX: x + sx(st, 0.06), hipsZ: z - 0.06 };
  };
  const wide = (s: Side, x0: number): Pose => {
    const st = other(s), x1 = x0 + sx(s, d);
    return { bones: { Hips: [14, 0, 0], Spine: [4, 0, 0], Neck: [-6, 0, 0], LeftFoot: [-12, 0, 0], RightFoot: [-12, 0, 0] }, feet: { [st]: [x0 + sx(st, 0.12), ANKLE, z], [s]: [x1 + sx(s, 0.09), ANKLE, z] } as Pair, kneePoles: { Left: [-0.3, 0, 1], Right: [0.3, 0, 1] }, hands: { Left: [(x0 + x1) / 2 - 0.26, 0.80, z + 0.16], Right: [(x0 + x1) / 2 + 0.26, 0.80, z + 0.16] }, poles: bothDir(0.4, -0.6, -0.4), hipsY: -0.14, hipsX: (x0 + x1) / 2 + sx(s, 0.10), hipsZ: z - 0.08 };
  };
  const stick = (s: Side, x: number): Pose => {
    const p = oneLegLand(s, x, z, 0.4), o = other(s);
    return { ...p, bones: { ...p.bones, [`${o}Foot`]: [-6, 0, 0] } as Record<string, Deg3>, feet: { ...p.feet, [o]: [x + sx(o, 0.20), ANKLE + 0.16, z - 0.06] } as Pair, kneePoles: { ...p.kneePoles, [o]: [sx(o, 0.2), 0, 1] } as Pair };
  };
  const stand = (x: number): Pose => STANDING(z, x);
  return run(scene, sk, 'ex_lateral_step_stick', 4.8, [
    at(stand(0), 0, true), at(lift('Right', 0), 0.35), at(wide('Right', 0), 0.6), at(stick('Right', d), 0.85, true), at(stick('Right', d), 1.75, true), at(stand(d), 2.15, true),
    at(lift('Left', d), 2.5), at(wide('Left', d), 2.75), at(stick('Left', 0), 3.0, true), at(stick('Left', 0), 3.9, true),
  ]);
};

// ── machines ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** ex_calf_press (the calf press on the leg press) — seated in the 45-degree leg press (demo.ts PROP_SHAPES legpress; the sled
 *  is not drawn), the legs long but not locked, the balls of the feet on the platform: the toes press away as far as they go,
 *  a beat, and the heels come back as far as they go. The ankles do all of it. */
const calfPress: Builder = (scene, sk) => {
  const base: Pose = { bones: { Hips: [-48, 0, 0], Spine: [0, 0, 0], Neck: [26, 0, 0], LeftLeg: [4, 0, 0], RightLeg: [4, 0, 0] }, feet: both(0.15, 0.84, 0.74), kneePoles: bothDir(0.2, 1, 0.4), hands: both(0.30, 0.40, -0.02), poles: bothDir(0.6, -0.4, 0), hipsY: -0.56 };
  const flexed: Pose = { ...base, bones: { ...base.bones, LeftFoot: [-24, 0, 0], RightFoot: [-24, 0, 0] } };
  const pointed: Pose = { ...base, bones: { ...base.bones, LeftFoot: [30, 0, 0], RightFoot: [30, 0, 0] } };
  return rep(scene, sk, 'ex_calf_press', flexed, pointed, 0.7, 0.4, 0.9, 0.3);
};

/** ex_chair_squat (the machine chair squat) — the machine's bar across the upper back (the rails are not drawn), the feet set
 *  out in front of the bar, shoulder-width, the toes out a little: the hips sit straight down as into a chair, the chest tall,
 *  until the thighs pass level; push the floor away to stand. */
const chairSquat: Builder = (scene, sk) => {
  const feet = both(0.17, ANKLE, 0.30), knees = bothDir(0.35, 0, 1);
  const top: Pose = { bones: { ...STAND, ...BAR_GRIP, Hips: [-4, 0, 0], Spine: [0, 0, 0] }, feet, kneePoles: knees, rel: BAR, poles: BAR_POLES, hipsY: -0.02, hipsZ: -0.02 };
  const low: Pose = { bones: { ...BAR_GRIP, Hips: [8, 0, 0], Spine: [2, 0, 0], Neck: [-6, 0, 0], LeftFoot: [-14, 0, 0], RightFoot: [-14, 0, 0] }, feet, kneePoles: knees, rel: BAR, poles: BAR_POLES, hipsY: -0.48, hipsZ: -0.06 };
  return rep(scene, sk, 'ex_chair_squat', top, low, 1.2, 0.25, 1.0, 0.45);
};

// ── lunges ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** ex_back_lunge_elevated (the elevated back lunge) — the bar across the upper back, standing on a short platform (demo.ts
 *  PROP_SHAPES lowstep): one foot steps back off it to the floor and the back knee drops straight down toward the floor; drive
 *  up through the front heel and step back onto the platform; the other leg. */
const STEP_H = 0.15;
const backLungeElevated: Builder = (scene, sk) => {
  const arms = { rel: BAR, poles: BAR_POLES };
  const stand: Pose = { bones: { ...STAND, ...BAR_GRIP }, feet: both(0.12, ANKLE + STEP_H, 0.04), kneePoles: bothDir(0.1, 0, 1), ...arms, hipsY: STEP_H };
  const go = (back: Side): Pose => {
    const front = other(back);
    return { bones: { ...STAND, ...BAR_GRIP, Hips: [6, 0, 0], [`${back}UpLeg`]: [16, 0, 0], [`${back}Leg`]: [30, 0, 0], [`${back}Foot`]: [10, 0, 0] } as Record<string, Deg3>, feet: { [front]: [sx(front, 0.13), ANKLE + STEP_H, 0.06], [back]: [sx(back, 0.12), ANKLE + 0.20, -0.34] } as Pair, kneePoles: { [front]: [sx(front, 0.1), 0, 1], [back]: [0, -0.4, 1] } as Pair, ...arms, hipsY: STEP_H - 0.10, hipsZ: -0.06 };
  };
  const low = (back: Side): Pose => {
    const front = other(back);
    return { bones: { ...BAR_GRIP, Hips: [6, 0, 0], Spine: [4, 0, 0], Neck: [-4, 0, 0], [`${front}Foot`]: [-12, 0, 0], [`${back}Foot`]: [-6, 0, 0] } as Record<string, Deg3>, feet: { [front]: [sx(front, 0.13), ANKLE + STEP_H, 0.06], [back]: [sx(back, 0.12), 0.15, -0.66] } as Pair, kneePoles: { [front]: [sx(front, 0.1), 0, 1], [back]: [0, -1, 0.3] } as Pair, ...arms, hipsY: -0.32, hipsZ: -0.28 };
  };
  const side = (back: Side, t0: number): ExKey[] => [at(go(back), t0 + 0.4), at(low(back), t0 + 0.95, true), at(low(back), t0 + 1.25, true), at(go(back), t0 + 1.8), at(stand, t0 + 2.2, true)];
  return run(scene, sk, 'ex_back_lunge_elevated', 4.6, [at(stand, 0, true), ...side('Right', 0), ...side('Left', 2.2)]);
};

/** ex_spiderman_lunge_walk (the Spiderman lunge walk) — a long lunge step forward, the foot planted outside its hand, both
 *  hands on the floor inside it; the inside elbow sinks toward the floor by the instep; then the back foot steps through to
 *  stand; the other side; then walk back to the start. */
const spidermanLungeWalk: Builder = (scene, sk) => {
  const L = 1.0;
  const stand = (z: number): Pose => STANDING(z);
  const low = (front: Side, z0: number, sink: boolean): Pose => {
    const back = other(front), zf = z0 + L;
    return {
      bones: { Hips: [sink ? 64 : 56, 0, 0], Spine: [6, 0, 0], Neck: [-30, 0, 0], [`${back}Foot`]: [10, 0, 0], [`${front}Foot`]: [-20, 0, 0] } as Record<string, Deg3>,
      feet: { [front]: [sx(front, 0.32), ANKLE, zf], [back]: [sx(back, 0.12), TOE_ANKLE + 0.04, z0] } as Pair,
      kneePoles: { [front]: [sx(front, 0.7), 0.2, 1], [back]: [0, -1, 0.1] } as Pair,
      hands: { [front]: [sx(front, 0.10), 0.05, zf + (sink ? -0.04 : 0.16)], [back]: [sx(back, 0.18), 0.05, zf + 0.18] } as Pair,
      poles: { [front]: sink ? [sx(front, 0.2), -1, -0.3] : [sx(front, 0.6), 0, -0.7], [back]: [sx(back, 0.6), 0, -0.7] } as Pair,
      hipsY: sink ? -0.62 : -0.56, hipsZ: z0 + 0.64,
    };
  };
  const go = (front: Side, z0: number): Pose => {
    const back = other(front);
    return { bones: { ...STAND, Hips: [20, 0, 0], Spine: [4, 0, 0], [`${front}UpLeg`]: [-40, 0, 0], [`${back}Foot`]: [-20, 0, 0] } as Record<string, Deg3>,
      feet: { [front]: [sx(front, 0.24), ANKLE + 0.14, z0 + 0.50], [back]: [sx(back, 0.12), ANKLE + 0.04, z0] } as Pair, kneePoles: bothDir(0.2, 0, 1),
      hands: { Left: [-0.24, 0.70, z0 + 0.36], Right: [0.24, 0.70, z0 + 0.36] }, poles: HANG_POLES, hipsY: -0.10, hipsZ: z0 + 0.22 };
  };
  const keys: ExKey[] = [at(stand(0), 0, true)];
  let t = 0, z = 0;
  for (const s of ['Left', 'Right'] as Side[]) {
    // (the back foot steps through lifted: dragged straight, its toes went through the floor, measured)
    const through: Pose = { ...STANDING(z + L * 0.7), bones: { ...STAND, Hips: [10, 0, 0], [`${other(s)}Foot`]: [-10, 0, 0] } as Record<string, Deg3>, feet: { [s]: [sx(s, 0.20), ANKLE, z + L], [other(s)]: [sx(other(s), 0.12), ANKLE + 0.14, z + L * 0.7] } as Pair, hipsY: -0.10, hipsZ: z + L * 0.85 };
    keys.push(at(go(s, z), t + 0.4), at(low(s, z, false), t + 0.8, true), at(low(s, z, true), t + 1.3, true), at(low(s, z, true), t + 1.6, true), at(low(s, z, false), t + 2.0, true), at(through, t + 2.35));
    z += L;
    keys.push(at(stand(z), t + 2.7, true));
    t += 2.7;
  }
  // (centred: it starts a lunge behind the middle of the stage and ends a lunge in front, so the camera keeps it in view)
  return run(scene, sk, 'ex_spiderman_lunge_walk', t + 3.0, [...keys, ...walkBack(z, t, 0.45, 0.5)].map((k) => ({ ...movePose(k, 0, -L), t: k.t, ...(k.hold ? { hold: true } : {}) })));
};

// ── on a bench ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** ex_bird_dog_row (the bird dog row) — the left hand and the left knee on a bench (demo.ts PROP_SHAPES rowbench), the back
 *  flat as a table, the right leg reaching long behind at hip height, a dumbbell hanging in the right hand: row it to the ribs,
 *  the elbow back past the body, and lower slow to full hang. */
const birdDogRow: Builder = (scene, sk) => {
  const base: Pose = {
    bones: { Hips: [86, 0, 0], Spine: [0, 0, 0], Neck: [-40, 0, 0], RightUpLeg: [0, 0, 0], RightLeg: [2, 0, 0], RightFoot: [30, 0, 0], LeftFoot: [60, 0, 0] },
    feet: { Left: [-0.14, 0.52, -0.74], Right: [0.12, 0.86, -1.16] }, kneePoles: { Left: [0, -1, 0.2], Right: [0, -1, 0] },
    handsAt: { Left: [-0.18, 0.48, 0.30] }, hands: { Right: [0.22, 0.40, 0.28] }, poles: { Left: [-0.6, 0.2, -0.7], Right: [0.4, 0, -0.9] }, hipsY: -0.06, hipsZ: -0.30,
  };
  const top: Pose = { ...base, hands: { Right: [0.24, 0.80, -0.02] }, poles: { Left: base.poles!.Left, Right: [0.3, 1, -0.6] } };
  return rep(scene, sk, 'ex_bird_dog_row', base, top, 0.8, 0.3, 1.2, 0.3);
};

/** ex_rollout_bench (the barbell rollout from a bench) — kneeling on a bench (demo.ts PROP_SHAPES kneelbench), the bar on the
 *  floor just past its end, the hands on it: the hips extend and the bar rolls forward, the arms long and passing overhead as
 *  far as the line holds; roll it back on the same path. */
const rolloutBench: Builder = (scene, sk) => {
  const legs = { feet: both(0.12, 0.50, -0.58), kneePoles: bothDir(0, -1, 0.1) };
  const start: Pose = { bones: { Hips: [128, 0, 0], Spine: [6, 0, 0], Neck: [-46, 0, 0], LeftFoot: [60, 0, 0], RightFoot: [60, 0, 0] }, ...legs, hands: both(0.20, 0.08, 0.30), poles: bothDir(0.3, 0.6, -0.6), hipsY: -0.10, hipsZ: -0.14 };
  const out: Pose = { bones: { Hips: [106, 0, 0], Spine: [0, 0, 0], Neck: [-24, 0, 0], LeftFoot: [60, 0, 0], RightFoot: [60, 0, 0] }, ...legs, hands: both(0.20, 0.08, 1.12), poles: bothDir(0.3, 1, 0), hipsY: -0.36, hipsZ: 0.30 };
  return run(scene, sk, 'ex_rollout_bench', 3.6, [at(start, 0, true), at(start, 0.3, true), at(out, 1.6, true), at(out, 2.0, true), at(start, 3.2, true)], true);
};

// ── the whole body rolls over ─────────────────────────────────────────────────────────────────────────────────────────

/** The hips' key for a plank pitched `pitch`° (exerciseKit HIGH_PLANK: 70) rolled `roll`° about the body's own long axis
 *  (+ turns the chest toward the body's left). Keyed as the same world-space Euler every pose uses. */
export function rolledHips(pitch: number, roll: number): Deg3 {
  const q = Quaternion.FromEulerAngles(pitch * D2R, 0, 0).multiply(Quaternion.FromEulerAngles(0, roll * D2R, 0));
  const e = q.toEulerAngles();
  return [e.x / D2R, e.y / D2R, e.z / D2R];
}

/** ex_pushup_t (the T push-up; the push-up to side plank) — one push-up, and as the body comes up it turns on the right hand
 *  into a side plank, the left arm reaching to the ceiling; back down to the plank; another push-up; and the turn to the
 *  other side. */
const pushupT: Builder = (scene, sk) => {
  const feet = both(0.11, TOE_ANKLE, -0.90);
  const top: Pose = { bones: { Hips: [70, 0, 0], Spine: [0, 0, 0], Neck: [-30, 0, 0], LeftFoot: [8, 0, 0], RightFoot: [8, 0, 0] }, feet, kneePoles: bothDir(0, -1, 0.1), hands: both(0.24, 0.05, 0.44), poles: bothDir(0.6, 0.2, -0.7), hipsY: -0.58 };
  const bottom: Pose = { ...top, bones: { ...top.bones, Hips: [84, 0, 0], Neck: [-40, 0, 0] }, hands: both(0.26, 0.05, 0.44), poles: bothDir(0.7, 0.4, -0.5), hipsY: -0.80 };
  /** u in 0..1: the turn on the `base` hand, the other arm sweeping up to the ceiling */
  const turned = (base: Side, u: number): Pose => {
    const up = other(base), k = base === 'Right' ? 1 : -1, ph = u * Math.PI / 2;
    const roll = k * u * 90;
    const xs = (x: number) => k * x;
    return {
      bones: { Hips: rolledHips(70, roll), Spine: [0, 0, 0], Neck: [-30 + 24 * u, 0, 0], LeftFoot: [8, 0, 0], RightFoot: [8, 0, 0] },
      feet: { [base]: [xs(0.11 + 0.08 * u), TOE_ANKLE - 0.04 * u, -0.90], [up]: [xs(-0.11 + 0.12 * u), TOE_ANKLE - 0.03 * u, -0.90 + 0.10 * u] } as Pair,
      kneePoles: { Left: [-k * Math.sin(ph), -Math.cos(ph), 0.1], Right: [-k * Math.sin(ph), -Math.cos(ph), 0.1] },
      hands: { [base]: [xs(0.24), 0.05, 0.44], [up]: [xs(0.24 - 0.48 * Math.cos(ph)), 0.05 + 1.40 * Math.sin(ph), 0.44] } as Pair,
      poles: { [base]: [xs(0.6), 0.2, -0.7], [up]: [xs(-0.6 * Math.cos(ph)), 0.2 + 0.8 * Math.sin(ph), -0.5] } as Pair,
      hipsY: -0.58, hipsX: xs(0.17 * Math.sin(ph)),
    };
  };
  const side = (base: Side, t0: number): ExKey[] => [
    at(bottom, t0 + 0.8, true), at(top, t0 + 1.6, true),
    at(turned(base, 1 / 3), t0 + 1.9), at(turned(base, 2 / 3), t0 + 2.2), at(turned(base, 1), t0 + 2.5, true), at(turned(base, 1), t0 + 3.3, true),
    at(turned(base, 2 / 3), t0 + 3.6), at(turned(base, 1 / 3), t0 + 3.9), at(top, t0 + 4.2, true),
  ];
  return run(scene, sk, 'ex_pushup_t', 8.6, [at(top, 0, true), ...side('Right', 0), ...side('Left', 4.2)], true);
};

/** ex_kb_arm_bar (the kettlebell arm bar) — lying on the right side, a light kettlebell pressed straight up to the ceiling in
 *  the left hand, the bottom arm long on the floor past the head: the chest rolls slowly toward the floor, the bell staying
 *  stacked over the shoulder (the arm vertical the whole way) and the top knee coming down to the floor in front; hold, and
 *  roll back to the side. (Shown on the right side, the bell in the left hand, so the chest faces the stage's floor camera.) */
const kbArmBar: Builder = (scene, sk) => {
  const p = (u: number): Pose => {
    const roll = 90 - 50 * u, ph = roll * D2R;
    const shoulder: V3 = [-0.18 * Math.cos(ph), 0.20 + 0.18 * Math.sin(ph), 0.44];
    return {
      bones: { Hips: rolledHips(88, roll), Spine: [0, 0, 0], Neck: [0, 0, 0], LeftFoot: [20, 0, 0], RightFoot: [20, 0, 0] },
      feet: { Right: [0.02, 0.07, -0.86], Left: [-0.02 - 0.24 * u, 0.17 - 0.06 * u, -0.86 + 0.30 * u] },
      kneePoles: { Right: [-1, 0, 0], Left: [-1, -0.3 * u, 0.4] },
      hands: { Left: [shoulder[0], shoulder[1] + 0.56, shoulder[2]], Right: [0.02, 0.06, 1.02] },
      poles: { Left: [-0.4, 0, -1], Right: [0, 1, 0] }, hipsY: -0.78 - 0.04 * u,
    };
  };
  return run(scene, sk, 'ex_kb_arm_bar', 6.0, [at(p(0), 0, true), at(p(0), 0.6, true), at(p(1 / 3), 1.2), at(p(2 / 3), 1.8), at(p(1), 2.4, true), at(p(1), 3.6, true), at(p(2 / 3), 4.2), at(p(1 / 3), 4.8)], true);
};

// ── the basketball program's drills ───────────────────────────────────────────────────────────────────────────────────

/** A pose turned `deg`° about the vertical (the Hips' yaw, and every final-frame target and pole with it): a loop that faces
 *  or runs another way is authored facing front and turned. +90 turns the body's front to its right (+x). (The Hips' keyed yaw
 *  turns the body the other way from the same rotation applied to the targets — the stage root's mirror: measured, a run turned
 *  with the same sign leaned its head back against the way its feet ran.) */
export function yawPose(p: Pose, deg: number): Pose {
  const q = Quaternion.FromEulerAngles(0, deg * D2R, 0);
  const rot = (v: V3): V3 => { const w = new Vector3(v[0], v[1], v[2]).applyRotationQuaternion(q); return [w.x, w.y, w.z]; };
  const pair = (x?: Pair): Pair | undefined => x && (Object.fromEntries(Object.entries(x).map(([k, v]) => [k, rot(v as V3)])) as Pair);
  const h = (p.bones?.Hips ?? [0, 0, 0]) as Deg3;
  const [hx, , hz] = rot([p.hipsX ?? 0, 0, p.hipsZ ?? 0]);
  return { ...p, bones: { ...p.bones, Hips: [h[0], h[1] - deg, h[2]] }, hands: pair(p.hands), handsAt: pair(p.handsAt), feet: pair(p.feet), poles: pair(p.poles), kneePoles: pair(p.kneePoles), hipsX: hx, hipsZ: hz };
}
/** A pose moved (dx, dz) on the floor: the hips and every final-frame target. */
export function movePose(p: Pose, dx: number, dz: number): Pose {
  const mv = (x?: Pair): Pair | undefined => x && (Object.fromEntries(Object.entries(x).map(([k, v]) => [k, [(v as V3)[0] + dx, (v as V3)[1], (v as V3)[2] + dz]])) as Pair);
  return { ...p, hands: mv(p.hands), handsAt: mv(p.handsAt), feet: mv(p.feet), hipsX: (p.hipsX ?? 0) + dx, hipsZ: (p.hipsZ ?? 0) + dz };
}

/** The defensive stance (exerciseSignature.ts ex_def_stance): wide, low, the hands out wide and active. */
const DEF = (x = 0, z = 0.06, lw = 0.34, rw = 0.34): Pose => ({ bones: { Hips: [22, 0, 0], Spine: [6, 0, 0], Neck: [-16, 0, 0], LeftFoot: [-14, 0, 0], RightFoot: [-14, 0, 0] }, feet: { Left: [x - lw, ANKLE + 0.01, z], Right: [x + rw, ANKLE + 0.01, z] }, kneePoles: bothDir(0.35, 0, 1), rel: { Left: [-0.38, -0.12, 0.22], Right: [0.38, -0.12, 0.22] }, poles: bothDir(0.3, -1, 0), hipsY: -0.30, hipsX: x, hipsZ: z - 0.06 });

/** ex_box_out (the box-out) — from the defensive stance facing the player, a turn on the left foot (the right foot swinging
 *  round behind) to put the back into him; sit low and wide, the elbows up and out, the head up to find the ball; two short
 *  pushes back into the space behind; then turn back and step up to the start. */
const boxOut: Builder = (scene, sk) => {
  const pivot: V3 = [-0.30, ANKLE + 0.01, 0.06];
  // turning about the left foot: the right foot swings round it; the hips ride the middle
  const turnAt = (deg: number, low: boolean): Pose => {
    const a = deg * D2R, R = 0.62;
    const base = DEF(0, 0.06, 0.30, 0.30);
    const yp = yawPose({ ...base, feet: undefined, hipsX: 0, hipsZ: -0.06 }, deg);
    const right: V3 = [pivot[0] + R * Math.cos(a), ANKLE + (low ? 0.01 : 0.08), pivot[2] - R * Math.sin(a)];
    return { ...yp, feet: { Left: pivot, Right: right }, hipsX: (pivot[0] + right[0]) / 2, hipsZ: (pivot[2] + right[2]) / 2 + (yp.hipsZ ?? 0) };
  };
  // boxed out: turned round, sat low and wide, the elbows up and out, the head up toward the rim
  const boxed = (dz: number): Pose => {
    const b: Pose = { bones: { Hips: [26, 0, 0], Spine: [2, 0, 0], Neck: [-30, 0, 0], LeftFoot: [-16, 0, 0], RightFoot: [-16, 0, 0] }, feet: both(0.36, ANKLE + 0.01, 0.0), kneePoles: bothDir(0.4, 0, 1), rel: { Left: [-0.30, 0.10, 0.12], Right: [0.30, 0.10, 0.12] }, poles: bothDir(1, -0.2, 0), hipsY: -0.34, hipsZ: -0.10 };
    return movePose(yawPose(b, 180), 0.0, 0.06 + dz);
  };
  const stepBack = (dz: number, lead: Side): Pose => { const p = boxed(dz); return { ...p, feet: { ...p.feet, [lead]: [p.feet![lead]![0], ANKLE + 0.07, p.feet![lead]![2] - 0.08] } as Pair, hipsY: -0.30 }; };
  return run(scene, sk, 'ex_box_out', 4.8, [
    at(DEF(0, 0.06, 0.30, 0.30), 0, true), at(turnAt(60, false), 0.25), at(turnAt(120, false), 0.45), at(boxed(0), 0.7, true),
    at(stepBack(0.10, 'Left'), 1.0), at(boxed(0.12), 1.2, true), at(stepBack(0.24, 'Right'), 1.5), at(boxed(0.24), 1.7, true), at(boxed(0.24), 2.6, true),
    at(movePose(turnAt(120, false), 0, 0.24), 2.9), at(movePose(turnAt(60, false), 0, 0.24), 3.1), at(movePose(DEF(0, 0.06, 0.30, 0.30), 0, 0.24), 3.35, true),
    at(movePose(DEF(0, 0.06, 0.30, 0.30), 0, 0.12), 3.75), at(DEF(0, 0.06, 0.30, 0.30), 4.2, true),
  ]);
};

/** The defensive slide sideways (toward `dir`: +1 the body's right): the lead foot pushes out, the trail foot follows without
 *  crossing — the stance never narrower than the shoulders, the head level. Keys from x0, `n` slides of `w`. */
function slides(x0: number, dir: 1 | -1, n: number, w: number, t0: number, dt: number): ExKey[] {
  const keys: ExKey[] = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + dir * w * i;
    const lead: Side = dir > 0 ? 'Right' : 'Left';
    const out = DEF(x + dir * w / 2, 0.06, dir > 0 ? 0.30 : 0.30 + w / 2, dir > 0 ? 0.30 + w / 2 : 0.30);
    keys.push(at({ ...out, feet: { ...out.feet, [lead]: [out.feet![lead]![0], ANKLE + 0.05, 0.06] } as Pair, hipsY: -0.28 }, t0 + dt * (i + 0.4)));
    keys.push(at(DEF(x + dir * w, 0.06, 0.30, 0.30), t0 + dt * (i + 1)));
  }
  return keys;
}
/** Running steps sideways (toward `dir`), the body turned to face the way it runs: from x0 to x1 in `n` strides. */
function runAcross(x0: number, x1: number, n: number, t0: number, dt: number): ExKey[] {
  const dir = Math.sign(x1 - x0), yaw = dir > 0 ? 90 : -90, len = Math.abs(x1 - x0) / n;
  const keys: ExKey[] = [];
  for (let i = 1; i <= n; i++) {
    const s: Side = i % 2 ? 'Right' : 'Left';
    // authored running toward +z from 0, then turned to run along x and moved to x0
    const step = runStep(s, len * i, len * (i - 1));
    keys.push(at(movePose(yawPose(step, yaw), x0, 0.06), t0 + dt * i));
  }
  return keys;
}

/** ex_slide_run_slide (Slide-Run-Slide) — two defensive slides to the left; beaten, the hips open and the athlete turns and
 *  runs three steps; square up and slide twice more, ahead of the cone; then the same back to the right. (The cones are not
 *  drawn; the run is three steps.) */
const slideRunSlide: Builder = (scene, sk) => {
  const W = 0.26, X0 = 1.0;
  const half = (x0: number, dir: 1 | -1, t0: number): { keys: ExKey[]; x: number; t: number } => {
    const keys = slides(x0, dir, 2, W, t0, 0.32);
    let x = x0 + dir * 2 * W, t = t0 + 0.64;
    const x1 = x + dir * 0.90;
    keys.push(...runAcross(x, x1, 3, t, 0.2));
    x = x1; t += 0.6;
    keys.push(at(DEF(x + dir * 0.05, 0.06, 0.30, 0.30), t + 0.25, true));
    t += 0.25;
    keys.push(...slides(x + dir * 0.05, dir, 2, W, t, 0.32));
    return { keys, x: x + dir * 0.05 + dir * 2 * W, t: t + 0.64 };
  };
  const a = half(X0, -1, 0.3);
  const b = half(a.x, 1, a.t + 0.4);
  return run(scene, sk, 'ex_slide_run_slide', b.t + 0.4, [at(DEF(X0, 0.06, 0.30, 0.30), 0, true), ...a.keys, at(DEF(a.x, 0.06, 0.30, 0.30), a.t + 0.4, true), ...b.keys]);
};

/** ex_shuttle_5105 (the 5-10-5 shuttle) — from a low stance at the middle line: turn and sprint to the right, plant low and
 *  touch the line with the right hand; turn and sprint all the way across to the left, plant and touch with the left hand;
 *  turn and sprint back through the middle; stand. (Shown short: the 5 and 10 metres are 1 and 2 here, the cones and lines
 *  not drawn.) */
const shuttle5105: Builder = (scene, sk) => {
  const D = 0.9;
  const stance: Pose = { bones: { Hips: [34, 0, 0], Spine: [10, 0, 0], Neck: [-18, 0, 0], LeftFoot: [-18, 0, 0], RightFoot: [-18, 0, 0] }, feet: both(0.30, ANKLE, 0.06), kneePoles: bothDir(0.3, 0, 1), rel: { Left: [-0.06, -0.30, 0.30], Right: [0.06, -0.30, 0.30] }, poles: bothDir(0.3, -1, 0), hipsY: -0.32 };
  /** the plant: the outside foot wide and the hips dropped, the outside hand down to touch the line beside it, the body
   *  side-on (it ran in facing the line) */
  const plant = (x: number, dir: 1 | -1): Pose => {
    const s: Side = dir > 0 ? 'Right' : 'Left', o = other(s);
    const p: Pose = { bones: { Hips: [52, 0, 0], Spine: [14, 0, 0], Neck: [-26, 0, 0], [`${s}Foot`]: [-20, 0, 0], [`${o}Foot`]: [12, 0, 0] } as Record<string, Deg3>, feet: { [s]: [sx(s, 0.10), ANKLE + 0.02, 0.30], [o]: [sx(o, 0.16), ANKLE + 0.05, -0.30] } as Pair, kneePoles: bothDir(0.3, 0, 1), hands: { [s]: [sx(s, 0.30), 0.10, 0.36], [o]: [sx(o, 0.24), 0.70, 0.0] } as Pair, poles: { [s]: [sx(s, 0.6), 0, -0.6], [o]: [sx(o, 0.6), -0.6, -0.3] } as Pair, hipsY: -0.48, hipsZ: 0.0 };
    return movePose(yawPose(p, dir > 0 ? 90 : -90), x, 0.06);
  };
  const keys: ExKey[] = [at(stance, 0, true), at(stance, 0.4, true)];
  keys.push(...runAcross(0, D, 2, 0.4, 0.2), at(plant(D + 0.1, 1), 1.0, true), at(plant(D + 0.1, 1), 1.25, true));
  keys.push(...runAcross(D, -D, 4, 1.25, 0.2), at(plant(-D - 0.1, -1), 2.25, true), at(plant(-D - 0.1, -1), 2.5, true));
  keys.push(...runAcross(-D, 0, 2, 2.5, 0.2), at({ ...STICK(0.06), hipsX: 0.0 }, 3.1, true), at(stance, 3.6, true));
  return run(scene, sk, 'ex_shuttle_5105', 4.0, keys);
};

/** ex_hill_sprint (the hill sprint) — sprinting up a short slope (demo.ts PROP_SHAPES ramp), shown in place: the body leans
 *  into the hill from the ankles, each foot strikes under the hips and pushes the hill back down behind, the knee drives up and
 *  the arms drive hard. */
export const RAMP_Y = 0.12;
const hillSprint: Builder = (scene, sk) => {
  const step = (s: Side): Pose => {
    const p = stride(s, { [`${s}UpLeg`]: [-72, 0, 0], [`${s}Leg`]: [104, 0, 0], [`${s}Foot`]: [8, 0, 0] }, 0.02);
    const o = other(s);
    return { ...p, bones: { ...p.bones, Hips: [20, 0, 0], Spine: [6, 0, 0], Neck: [-10, 0, 0], [`${o}Foot`]: [4, 0, 0] } as Record<string, Deg3>, feet: { [o]: [sx(o, 0.11), ANKLE + RAMP_Y + 0.02, -0.06] } as Pair, hipsY: RAMP_Y - 0.04, hipsZ: 0.04 };
  };
  return run(scene, sk, 'ex_hill_sprint', 0.72, [at(step('Left'), 0), at(step('Right'), 0.36)]);
};

/** A dribble combo: two of the court's handle moves (anim/authored/basketball.ts, the v2 keys on this body's own stroke), the
 *  second off the hand the first ended in, so the ball comes back to the hand it started in and the combo loops. The feet are
 *  planted at the dribble stance wherever a move does not key them. The ball is not drawn (demo.ts isBallClip: the stage says
 *  so). */
function handleCombo(name: string, a: { move: 'crossover' | 'between_legs' | 'behind_back'; keys: readonly V2Key[]; mirror: boolean }, b: typeof a): Builder {
  return (scene, sk) => {
    const st = carryStanceAtBind(sk);
    // (a foot behind the stance line is on its ball, the heel up: the between's trail foot, keyed flat, put its toes 6 cm into
    // the floor, measured)
    const ball = (k: PoseKey): PoseKey => (k.feet ? { ...k, feet: Object.fromEntries(Object.entries(k.feet).map(([sd, v]) => [sd, (v as V3)[2] < 0 ? [(v as V3)[0], (v as V3)[1] + 0.05, (v as V3)[2]] : v])) } : k);
    const lift = (k: PoseKey): PoseKey => (k.feet ? { ...k, feet: Object.fromEntries(Object.entries(k.feet).map(([sd, v]) => [sd, [(v as V3)[0], (v as V3)[1] + 0.012, (v as V3)[2]]])) } : k);
    const plant = (k: PoseKey): PoseKey => lift(k.feet ? ball(k) : { ...k, feet: { Left: [STANCE_FEET.Left[0], STANCE_FEET.Left[1] - (k.hipsY ?? 0), STANCE_FEET.Left[2]], Right: [STANCE_FEET.Right[0], STANCE_FEET.Right[1] - (k.hipsY ?? 0), STANCE_FEET.Right[2]] }, kneesFront: true });
    const A = handleV2Keys(a.move, a.keys, st), B = handleV2Keys(b.move, b.keys, st);
    const ka = (a.mirror ? A.keys.map(mirrorKey) : A.keys).map(plant);
    const gap = 0.08;   // one beat between the moves: the ball's pound into the second hand's stroke
    const t1 = A.path.duration + gap;
    const kb = (b.mirror ? B.keys.map(mirrorKey) : B.keys).map(plant).map((k) => ({ ...k, t: k.t + t1 }));
    const D = t1 + B.path.duration + gap;
    return buildPoseClip(scene, sk, name, D, [...ka, ...kb, { ...ka[0], t: D }], { smooth: true, prefilter: 0, periodic: true });
  };
}

/** Running in place with the ball (the ball is not drawn): `s` the leg driving up, the other foot down under the hips; the
 *  right hand on the ball — `push`: out in front and low, pushing it ahead to run onto; else coming back up to meet it at the
 *  hip. The left arm drives with the legs. `lean`: the body's forward lean; `rate`: how high the knees come. */
function dribbleStride(s: Side, push: boolean, lean = 14, rate = 1): Pose {
  const o = other(s);
  const p = stride(s, { [`${s}UpLeg`]: [-56 * rate, 0, 0], [`${s}Leg`]: [84 * rate, 0, 0], [`${s}Foot`]: [12, 0, 0] }, 0.02);
  return {
    ...p, bones: { ...p.bones, Hips: [lean, 0, 0], Spine: [6, 0, 0], Neck: [-12, 0, 0], [`${o}Foot`]: [10, 0, 0] } as Record<string, Deg3>,
    rel: undefined,
    hands: { Right: push ? [0.26, 0.78, 0.52] : [0.26, 0.96, 0.30], Left: s === 'Left' ? [-0.22, 0.98, -0.10] : [-0.22, 1.06, 0.30] },
    poles: { Right: [0.5, -0.4, -0.8], Left: [-0.3, -1, -0.2] },
  };
}

/** ex_speed_dribble (the full-court speed dribble) — shown in place: running, the right hand pushes the ball far out in front
 *  every other step and comes back up to it, the body leaning into the run, the eyes up. (The travel the length of the floor is
 *  not drawn; the ball is not drawn.) */
const speedDribble: Builder = (scene, sk) => run(scene, sk, 'ex_speed_dribble', 0.64, [at(dribbleStride('Left', true), 0), at(dribbleStride('Right', false), 0.32)]);

/** ex_change_pace_dribble (the change-of-pace dribble) — shown in place: slow, the ball pounded low beside the hip on easy
 *  steps; then the burst: the body drops its lean forward, the steps quicken and the ball is pushed out in front; then slow
 *  again. (The cones and the travel are not drawn; the ball is not drawn.) */
const changePaceDribble: Builder = (scene, sk) => {
  const slow = (s: Side, down: boolean): Pose => {
    const p = dribbleStride(s, false, 8, 0.5);
    return { ...p, hands: { ...p.hands, Right: down ? [0.30, 0.66, 0.22] : [0.30, 0.92, 0.22] } };
  };
  return run(scene, sk, 'ex_change_pace_dribble', 2.4, [
    at(slow('Left', true), 0), at(slow('Right', false), 0.4), at(slow('Left', true), 0.8), at(slow('Right', false), 1.2),
    at(dribbleStride('Left', true, 20, 1.1), 1.45), at(dribbleStride('Right', false, 20, 1.1), 1.7), at(dribbleStride('Left', true, 20, 1.1), 1.95), at(dribbleStride('Right', false, 18, 1.0), 2.2),
  ]);
};

/** The layup's last step and reach (exerciseHoops.ts ex_layup_steps), on `hand`'s side: off the other foot, the hand's-side knee
 *  driving up, the hand reaching high with the ball, the other hand guarding it. */
function layupFinish(hand: Side): Pose {
  const o = other(hand), k = hand === 'Right' ? 1 : -1;
  return {
    bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], Neck: [-10, 0, 0], [`${hand}UpLeg`]: [-84, 0, 0], [`${hand}Leg`]: [92, 0, 0], [`${hand}Foot`]: [10, 0, 0], [`${o}Foot`]: [30, 0, 0] } as Record<string, Deg3>,
    feet: { [o]: [sx(o, 0.10), ANKLE + 0.08, 0.06] } as Pair, kneePoles: { [o]: [sx(o, 0.05), 0, 1] } as Pair,
    hands: { [hand]: [k * 0.16, 2.10, 0.30], [o]: [k * -0.20, 1.40, 0.24] } as Pair, poles: { [hand]: [k * 0.6, -0.6, -0.2], [o]: [k * -0.8, -0.4, 0.2] } as Pair, hipsY: 0.08,
  };
}
/** The gather: both hands on the ball at the chest, a step landing under the hips. */
function gather(s: Side): Pose {
  const p = dribbleStride(s, false, 6, 0.6);
  return { ...p, hands: { Right: [0.14, 1.12, 0.32], Left: [-0.12, 1.12, 0.34] }, poles: bothDir(0.6, -0.8, -0.2) };
}

/** ex_cross_layup (the crossover into a layup) — shown in place: two dribbling strides with the right hand, the ball crossed low
 *  in front of the knees to the left hand, two strides dribbling with the left, the gather, and the left-hand layup off the
 *  right foot; land, and reset. (The cones, the travel and the basket are not drawn; the ball is not drawn.) */
const crossLayup: Builder = (scene, sk) => {
  const left = (s: Side, push: boolean): Pose => { const p = dribbleStride(s, push); return { ...p, hands: { Left: push ? [-0.26, 0.78, 0.52] : [-0.26, 0.96, 0.30], Right: s === 'Right' ? [0.22, 0.98, -0.10] : [0.22, 1.06, 0.30] }, poles: { Left: [-0.5, -0.4, -0.8], Right: [0.3, -1, -0.2] } }; };
  const cross: Pose = { bones: { Hips: [26, 0, 0], Spine: [10, 0, 0], Neck: [-20, 0, 0], LeftFoot: [-26, 0, 0], RightFoot: [-26, 0, 0] }, feet: both(0.22, ANKLE + 0.01, 0.08), kneePoles: bothDir(0.3, 0, 1), hands: { Right: [0.02, 0.56, 0.40], Left: [-0.22, 0.62, 0.34] }, poles: bothDir(0.6, -0.6, -0.4), hipsY: -0.22 };
  const set: Pose = { ...STANDING(0.06), hands: { Right: [0.26, 0.96, 0.30], Left: [-0.22, 1.02, 0.20] }, poles: bothDir(0.5, -0.6, -0.6) };
  return run(scene, sk, 'ex_cross_layup', 3.8, [
    at(set, 0, true), at(dribbleStride('Left', true), 0.3), at(dribbleStride('Right', false), 0.6), at(cross, 0.9, true),
    // (out of the low cross the left foot lifts first: left to the stride's bones from the floor, its toes went through it)
    at({ ...cross, feet: { Left: [-0.18, ANKLE + 0.10, 0.10], Right: cross.feet!.Right }, hipsY: -0.14 }, 1.05), at(left('Left', true), 1.25), at(left('Right', false), 1.5), at(gather('Left'), 1.8), at(layupFinish('Left'), 2.15, true), at(layupFinish('Left'), 2.4, true),
    at({ ...STICK(0.06), rel: undefined, hands: { Right: [0.18, 0.80, 0.34], Left: [-0.16, 0.80, 0.36] }, poles: bothDir(0.6, -0.8, -0.2) }, 2.8, true), at(set, 3.4, true),
  ]);
};

/** ex_speed_layup (full-court layup lines) — shown in place: the speed dribble (the right hand pushing the ball out in front), the
 *  gather, and the right-hand layup off the left foot, the ball lifted high and soft; land, and back the other way. (The travel
 *  the length of the floor and the basket are not drawn; the ball is not drawn.) */
const speedLayup: Builder = (scene, sk) => {
  const set: Pose = { ...STANDING(0.06), hands: { Right: [0.26, 0.96, 0.30], Left: [-0.22, 1.02, 0.20] }, poles: bothDir(0.5, -0.6, -0.6) };
  return run(scene, sk, 'ex_speed_layup', 3.2, [
    at(set, 0, true), at(dribbleStride('Left', true), 0.3), at(dribbleStride('Right', false), 0.6), at(dribbleStride('Left', true), 0.9), at(dribbleStride('Right', false), 1.2),
    at(gather('Left'), 1.45), at(layupFinish('Right'), 1.8, true), at(layupFinish('Right'), 2.05, true),
    at({ ...STICK(0.06), rel: undefined, hands: { Right: [0.18, 0.80, 0.34], Left: [-0.16, 0.80, 0.36] }, poles: bothDir(0.6, -0.8, -0.2) }, 2.45, true), at(set, 2.9, true),
  ]);
};

/** ex_lying_machine_squat (the lying machine squat) — face up in the machine, the back flat on its reclined pad and the
 *  shoulders under its pads (demo.ts PROP_SHAPES lyingpad; the sled is not drawn), the feet shoulder-width on the platform, the
 *  hands on the handles: press up through the balls of the feet until the body is long, hold a second, and lower until the
 *  thighs are level with the platform. */
const lyingMachineSquat: Builder = (scene, sk) => {
  const feet = both(0.16, ANKLE, 0.42), hands: Pair = { Left: [0.02, 0.02, 0.06], Right: [-0.02, 0.02, 0.06] };
  const top: Pose = { bones: { Hips: [-34, 0, 0], Spine: [0, 0, 0], Neck: [18, 0, 0], LeftFoot: [8, 0, 0], RightFoot: [8, 0, 0] }, feet, kneePoles: bothDir(0.3, 0, 1), rel: hands, poles: bothDir(0.5, -1, 0), hipsY: -0.12, hipsZ: -0.12 };
  const low: Pose = { ...top, bones: { ...top.bones, Hips: [-30, 0, 0], LeftFoot: [-24, 0, 0], RightFoot: [-24, 0, 0] }, hipsY: -0.50, hipsZ: -0.38 };
  return rep(scene, sk, 'ex_lying_machine_squat', low, top, 1.0, 0.8, 1.2, 0.3);
};

// ── the program builder's band kit and the rest it reaches (DEMOS-FIX-2, second pass) ─────────────────────────────────────

const PALLOF_OUT: Pair = { Left: [0.15, -0.12, 0.50], Right: [-0.15, -0.12, 0.50] };
const PALLOF_POLES = bothDir(0.6, -1, -0.2);

/** ex_pallof_march (the band anti-rotation march) — side-on to a band at chest height (not drawn), the handle pressed straight
 *  out from the chest in both hands and held still; march in place, the knees up, the trunk square. */
const pallofMarch: Builder = (scene, sk) => {
  const p = (s: Side | null): Pose => {
    const base: Pose = { bones: { ...STAND, Spine: [0, 0, 0] }, feet: both(0.13, ANKLE, 0.06), kneePoles: bothDir(0.1, 0, 1), rel: PALLOF_OUT, poles: PALLOF_POLES, hipsY: -0.02 };
    if (!s) return base;
    const o = other(s);
    return { ...base, bones: { ...base.bones, [`${s}UpLeg`]: [-74, 0, 0], [`${s}Leg`]: [84, 0, 0], [`${s}Foot`]: [12, 0, 0] } as Record<string, Deg3>, feet: { [o]: [sx(o, 0.13), ANKLE, 0.06] } as Pair, kneePoles: { [o]: [sx(o, 0.1), 0, 1] } as Pair };
  };
  return run(scene, sk, 'ex_pallof_march', 2.4, [at(p(null), 0, true), at(p('Left'), 0.45, true), at(p(null), 0.9, true), at(p(null), 1.2, true), at(p('Right'), 1.65, true), at(p(null), 2.1, true)]);
};

/** ex_pallof_walkout (the Pallof press walkout) — side-on to a band at chest height (not drawn), the handle pressed out from the
 *  chest and held: two side-steps away from the anchor (to the left) and two back, the trunk square, the hands still. */
const pallofWalkout: Builder = (scene, sk) => {
  const W = 0.24;
  const p = (x: number, wide: 0 | 1 | -1): Pose => ({ bones: { ...STAND, Hips: [6, 0, 0], Spine: [0, 0, 0] }, feet: { Left: [x - 0.14 - (wide < 0 ? W : 0), wide < 0 ? ANKLE + 0.05 : ANKLE, 0.06], Right: [x + 0.14 + (wide > 0 ? W : 0), wide > 0 ? ANKLE + 0.05 : ANKLE, 0.06] }, kneePoles: bothDir(0.15, 0, 1), rel: PALLOF_OUT, poles: PALLOF_POLES, hipsY: -0.06, hipsX: x + (wide < 0 ? -W / 2 : wide > 0 ? W / 2 : 0) });
  // stepping left: the left foot out (in the air, then down wide), the right foot closes
  return run(scene, sk, 'ex_pallof_walkout', 4.0, [
    at(p(0, 0), 0, true), at(p(0, -1), 0.3), at({ ...p(-W, 0), feet: { Left: [-W - 0.14, ANKLE, 0.06], Right: [0.14, ANKLE, 0.06] }, hipsX: -W / 2 }, 0.5), at(p(-W, 0), 0.75, true),
    at(p(-W, -1), 1.05), at({ ...p(-2 * W, 0), feet: { Left: [-2 * W - 0.14, ANKLE, 0.06], Right: [-W + 0.14, ANKLE, 0.06] }, hipsX: -1.5 * W }, 1.25), at(p(-2 * W, 0), 1.5, true), at(p(-2 * W, 0), 2.0, true),
    at(p(-2 * W, 1), 2.3), at({ ...p(-W, 0), feet: { Left: [-2 * W - 0.14, ANKLE, 0.06], Right: [-W + 0.14, ANKLE, 0.06] }, hipsX: -1.5 * W }, 2.5), at(p(-W, 0), 2.75, true),
    at(p(-W, 1), 3.05), at({ ...p(0, 0), feet: { Left: [-W - 0.14, ANKLE, 0.06], Right: [0.14, ANKLE, 0.06] }, hipsX: -W / 2 }, 3.25), at(p(0, 0), 3.5, true),
  ]);
};

/** ex_pull_apart_diag (the diagonal band pull-apart) — the band held in front at shoulder height, arms long: pulled apart on a
 *  diagonal, the right hand up toward the ceiling and the left down toward the floor, a beat, and back; then the other
 *  diagonal. (The band is not drawn.) */
const pullApartDiag: Builder = (scene, sk) => {
  const base: Pose = { bones: { ...STAND, Spine: [0, 0, 0] }, feet: both(0.13, ANKLE, 0.06), kneePoles: bothDir(0.1, 0, 1), hands: both(0.10, 1.40, 0.56), poles: bothDir(0.4, -0.6, -0.6), hipsY: 0 };
  const apart = (up: Side): Pose => ({ ...base, hands: { [up]: [sx(up, 0.56), 1.80, 0.18], [other(up)]: [sx(other(up), 0.56), 0.98, 0.18] } as Pair, poles: { [up]: [sx(up, 0.3), -0.4, -1], [other(up)]: [sx(other(up), 0.3), 0.4, -1] } as Pair });
  return run(scene, sk, 'ex_pull_apart_diag', 4.0, [at(base, 0, true), at(apart('Right'), 0.8, true), at(apart('Right'), 1.1, true), at(base, 2.0, true), at(apart('Left'), 2.8, true), at(apart('Left'), 3.1, true)], true);
};

/** ex_pull_apart_overhead (the overhead band pull-apart) — standing tall, the band overhead, arms long, the hands a little wider
 *  than the shoulders: pulled apart and down behind the head until it touches the upper back, a beat, and back up. */
const pullApartOverhead: Builder = (scene, sk) => {
  const base: Pose = { bones: { ...STAND, Spine: [0, 0, 0] }, feet: both(0.13, ANKLE, 0.06), kneePoles: bothDir(0.1, 0, 1), hands: both(0.26, 2.06, 0.06), poles: bothDir(1, 0, -0.2), hipsY: 0 };
  const down: Pose = { ...base, bones: { ...base.bones, Neck: [6, 0, 0] }, hands: both(0.62, 1.50, -0.12), poles: bothDir(0.6, -1, -0.4) };
  return rep(scene, sk, 'ex_pull_apart_overhead', base, down, 0.9, 0.35, 0.9, 0.3);
};

/** ex_side_plank_row (the side plank with a band row) — the side plank on the right forearm facing a band anchored at chest
 *  height (not drawn), the top hand reaching to it: row it to the ribs, the elbow back, the hips up and still; reach back. */
const sidePlankRow: Builder = (scene, sk) => {
  const reach: Pose = { ...SIDE_PLANK, hands: { Right: SIDE_PLANK.hands!.Right, Left: [0.52, 0.56, -0.42] }, poles: { Right: SIDE_PLANK.poles!.Right, Left: [0.2, 1, 0.4] } };
  const rowed: Pose = { ...reach, hands: { Right: SIDE_PLANK.hands!.Right, Left: [0.06, 0.66, -0.22] }, poles: { Right: SIDE_PLANK.poles!.Right, Left: [-0.4, 1, 0.6] } };
  return rep(scene, sk, 'ex_side_plank_row', turn(reach), turn(rowed), 0.7, 0.3, 0.9, 0.3);
};

/** ex_bear_plank_row (the bear plank with a band row) — the bear plank (the knees an inch up), the body still: one hand rows the
 *  band (not drawn) to the ribs and sets back down, then the other. */
const bearPlankRow: Builder = (scene, sk) => {
  const P: Pose = { ...BEAR, feet: both(0.18, TOE_ANKLE + 0.04, -0.36) };
  return alternating(scene, sk, 'ex_bear_plank_row', { a: P, b: { ...P, bones: { ...P.bones, Spine: [0, 6, 0] }, hands: both(0.22, 0.40, 0.26), poles: bothDir(0.3, 1, -0.6) }, t: [0.7, 0.3, 0.8, 0.3] });
};

/** ex_bird_dog_band_row (the bird dog with a band row) — on hands and knees on a mat: one leg reaches long back toward the wall
 *  while the other hand rows a band (not drawn) to the ribs; back down, and the other side. */
const birdDogBandRow: Builder = (scene, sk) => {
  const side = (leg: Side): Pose => {
    const hand = other(leg), stay = leg;
    return { ...QUAD_POSE, bones: { ...QUAD_POSE.bones, [`${leg}UpLeg`]: [0, 0, 0], [`${leg}Leg`]: [4, 0, 0], [`${leg}Foot`]: [40, 0, 0] } as Record<string, Deg3>,
      feet: { [other(leg)]: QUAD_POSE.feet![other(leg)], [leg]: [sx(leg, 0.12), 0.48, -0.86] } as Pair, kneePoles: { [other(leg)]: [0, -1, 0.1], [leg]: [0, -1, 0] } as Pair,
      hands: { [stay]: QUAD_POSE.hands![stay], [hand]: [sx(hand, 0.22), 0.40, 0.14] } as Pair, poles: { [stay]: [sx(stay, 0.6), 0.2, -0.5], [hand]: [sx(hand, 0.3), 1, -0.6] } as Pair };
  };
  return run(scene, sk, 'ex_bird_dog_band_row', 4.4, [at(QUAD_POSE, 0, true), at(side('Left'), 0.9, true), at(side('Left'), 1.3, true), at(QUAD_POSE, 2.2, true), at(side('Right'), 3.1, true), at(side('Right'), 3.5, true)], true);
};

/** ex_guillotine_press (the barbell guillotine bench press) — lying on the bench, the bar held straight over the NECK, arms
 *  locked: lowered slow until it is an inch from the neck, the elbows out wide, a beat, and pressed back up. */
const guillotinePress: Builder = (scene, sk) => {
  const a = lie({ hands: both(0.26, 1.10, -0.60), poles: bothDir(0.9, -0.3, 0) });
  const b = lie({ hands: both(0.30, 0.68, -0.60), poles: bothDir(1, -0.4, 0.1) });
  return rep(scene, sk, 'ex_guillotine_press', a, b, 1.6, 0.4, 0.8, 0.35);
};

/** ex_anti_gravity_press (the anti-gravity press) — face down on an incline bench (demo.ts PROP_SHAPES proneincline), the bar
 *  brought up near the chest with a reverse grip: pressed straight out in front of the head, the arms level with the floor,
 *  and back. */
const PRONE_PAD: Pose = { bones: { Hips: [52, 0, 0], Spine: [0, 0, 0], Neck: [-30, 0, 0], LeftFoot: [-44, 0, 0], RightFoot: [-44, 0, 0] }, feet: both(0.14, ANKLE + 0.02, -0.80), kneePoles: bothDir(0.1, 0, 1), hipsY: -0.33, hipsZ: -0.42 };
const antiGravityPress: Builder = (scene, sk) => {
  const a: Pose = { ...PRONE_PAD, rel: both(0.20, -0.16, 0.20), poles: bothDir(0.8, -0.2, -0.6) };
  const b: Pose = { ...PRONE_PAD, bones: { ...PRONE_PAD.bones, Neck: [-36, 0, 0] }, rel: both(0.22, 0.42, 0.34), poles: bothDir(0.6, -0.4, -0.6) };
  return rep(scene, sk, 'ex_anti_gravity_press', a, b, 0.9, 0.3, 1.0, 0.35);
};

/** ex_handstand_pushup (the handstand push-up) — upside down, the heels on the wall behind (demo.ts PROP_SHAPES wall), the
 *  hands on the floor a little wider than the shoulders, the body long: lowered slow until the head almost touches the floor,
 *  and pushed back up until the elbows are nearly locked. */
const handstandPushup: Builder = (scene, sk) => {
  const top: Pose = { bones: { Hips: [178, 0, 0], Spine: [0, 0, 0], Neck: [14, 0, 0], LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0] }, feet: both(0.10, 1.96, 0.62), kneePoles: bothDir(0, 0, -1), hands: both(0.26, 0.05, 0.40), poles: bothDir(1, 0, -0.3), hipsY: 0.18, hipsZ: 0.52 };
  const low: Pose = { ...top, feet: both(0.10, 1.62, 0.62), poles: bothDir(1, 0.2, -0.1), hipsY: -0.16 };
  return rep(scene, sk, 'ex_handstand_pushup', top, low, 1.6, 0.2, 1.0, 0.4);
};

/** The bar the muscle-up pulls over (demo.ts PROP_SHAPES pullbar: its top at 2.22). */
const BAR_TOP = 2.20;
/** ex_muscle_up (the strict muscle-up on the bar) — from a dead hang: the pull, the chest driven to the bar, the elbows thrown
 *  back as the shoulders roll over it, the dip from the bottom to straight arms with the bar at the hips; lower back through
 *  the same path to the hang. `kip`: the kipping muscle-up — the legs swing back and then forward and up to start it. */
function muscleUp(name: string, kip: boolean): Builder {
  const legs = (k: number): Record<string, Deg3> => ({ LeftUpLeg: [-10 - k, 0, 2], RightUpLeg: [-10 - k, 0, -2], LeftLeg: [22, 0, 0], RightLeg: [22, 0, 0], LeftFoot: [20, 0, 0], RightFoot: [20, 0, 0] });
  const hang = (hy: number, hips: number, k: number, hands: Pair, poles: Pair, spine = 0, neck = 0): Pose => ({ bones: { Hips: [hips, 0, 0], Spine: [spine, 0, 0], Neck: [neck, 0, 0], ...legs(k) }, handsAt: hands, poles, hipsY: hy });
  const GRIP = both(0.26, BAR_TOP - 0.02, 0.02), OVER = both(0.26, BAR_TOP + 0.02, 0.06);
  const deadHang = hang(0.26, 0, 0, GRIP, bothDir(1, -0.4, 0));
  const pulled = hang(0.66, -6, 10, GRIP, bothDir(1, -0.4, 0), -6, -10);
  const chest = hang(0.86, 18, 16, GRIP, bothDir(0.6, 0.2, -1), 4, -14);
  const turnOver = hang(1.02, 34, 20, OVER, bothDir(0.4, 0.6, -1), 8, -20);
  const support = hang(1.30, 8, 6, OVER, bothDir(0.3, 0, -1), 2, -6);
  const keys: ExKey[] = [at(deadHang, 0, true)];
  let t = 0;
  if (kip) {
    keys.push(at(hang(0.26, -12, -24, GRIP, bothDir(1, -0.4, 0), -8), 0.5), at(hang(0.30, 14, 40, GRIP, bothDir(1, -0.4, 0), 6), 1.0));
    t = 1.0;
  }
  keys.push(at(pulled, t + 0.7), at(chest, t + 1.0), at(turnOver, t + 1.3, true), at(support, t + 1.9, true), at(support, t + 2.4, true), at(turnOver, t + 3.1, true), at(chest, t + 3.5), at(pulled, t + 3.9), at(deadHang, t + 4.6, true));
  return (scene, sk) => run(scene, sk, name, t + 5.0, keys);
}

/** ex_leg_over_floor_press (the kettlebell leg-over floor press) — lying on the floor, the bell in the right hand on the chest,
 *  the right leg straight and crossed over the left, the free arm out to the side on the floor: press to lockout, and lower
 *  until the elbow touches the floor, the bell staying over the elbow. */
const legOverFloorPress: Builder = (scene, sk) => {
  const base: Pose = { bones: { Hips: [-88, 0, 0], Spine: [0, 0, 0], Neck: [10, 0, 0], LeftLeg: [4, 0, 0], RightLeg: [4, 0, 0], LeftFoot: [-20, 0, 0], RightFoot: [-20, 0, 0] }, feet: { Left: [-0.10, ANKLE, 0.80], Right: [-0.14, ANKLE + 0.10, 0.76] }, kneePoles: { Left: [0, 1, 0], Right: [0, 1, 0] }, hipsY: -0.84 };
  const free: V3 = [-0.62, 0.06, -0.30];
  const up: Pose = { ...base, hands: { Right: [0.20, 0.70, -0.44], Left: free }, poles: { Right: [0.7, -0.5, 0], Left: [-0.3, 1, 0] } };
  const low: Pose = { ...base, hands: { Right: [0.27, 0.30, -0.34], Left: free }, poles: { Right: [0.8, -0.6, 0], Left: [-0.3, 1, 0] } };
  return rep(scene, sk, 'ex_leg_over_floor_press', up, low, 0.9, 0.25, 0.8, 0.35);
};

/** ex_db_vertical_swing (the dumbbell vertical swing) — one dumbbell held in both hands between the legs: hiked back between
 *  the legs, the hips and knees and ankles driving up into a jump as the bell swings overhead; land soft, the knees bending, and
 *  draw the bell down to the chest, then back between the legs. */
const dbVerticalSwing: Builder = (scene, sk) => {
  const bell = (y: number, z: number): Pair => ({ Left: [-0.05, y, z], Right: [0.05, y, z] });
  const stand: Pose = { bones: { ...STAND }, feet: both(0.17, ANKLE, 0.06), kneePoles: bothDir(0.2, 0, 1), hands: bell(0.72, 0.18), poles: bothDir(0.6, -0.4, -0.6), hipsY: 0 };
  const hike: Pose = { bones: { Hips: [60, 0, 0], Spine: [4, 0, 0], Neck: [-28, 0, 0], LeftFoot: [-14, 0, 0], RightFoot: [-14, 0, 0] }, feet: both(0.17, ANKLE, 0.06), kneePoles: bothDir(0.3, 0, 1), hands: bell(0.48, -0.20), poles: bothDir(0.4, 0.2, -1), hipsY: -0.20, hipsZ: -0.10 };
  const drive: Pose = { bones: { Hips: [4, 0, 0], Spine: [-2, 0, 0], LeftFoot: [26, 0, 0], RightFoot: [26, 0, 0] }, feet: both(0.17, ANKLE + 0.07, 0.06), kneePoles: bothDir(0.2, 0, 1), hands: bell(1.50, 0.40), poles: bothDir(0.8, -0.2, -0.4), hipsY: 0.04 };
  const air: Pose = { bones: { Hips: [-2, 0, 0], Spine: [-4, 0, 0], LeftUpLeg: [-6, 0, 4], RightUpLeg: [-6, 0, -4], LeftLeg: [16, 0, 0], RightLeg: [16, 0, 0], LeftFoot: [30, 0, 0], RightFoot: [30, 0, 0] }, hands: bell(2.20, 0.02), poles: bothDir(1, 0, -0.2), hipsY: 0.22 };
  const land: Pose = { bones: { Hips: [22, 0, 0], Spine: [8, 0, 0], Neck: [-10, 0, 0], LeftFoot: [-24, 0, 0], RightFoot: [-24, 0, 0] }, feet: both(0.17, ANKLE + 0.01, 0.06), kneePoles: bothDir(0.25, 0, 1), hands: bell(1.12, 0.26), poles: bothDir(0.6, -0.8, -0.2), hipsY: -0.24, hipsZ: -0.06 };
  return run(scene, sk, 'ex_db_vertical_swing', 3.4, [at(stand, 0, true), at(hike, 0.6, true), at(drive, 0.9), at(air, 1.15, true), at(land, 1.5, true), at(land, 1.8, true), at({ ...stand, hands: bell(1.12, 0.22) }, 2.3, true), at(stand, 2.9, true)]);
};

/** ex_hk_hip_shift (the banded hip distraction stretch) — half-kneeling, the right foot in front, a band from a post behind
 *  around the top of the front thigh (not drawn): the hips shift slowly forward into the stretch and hold, breathing, and
 *  ease back. */
const hkHipShift: Builder = (scene, sk) => {
  const back: Pose = { bones: { Hips: [-4, 0, 0], Spine: [0, 0, 0], Neck: [0, 0, 0], LeftFoot: [62, 0, 0] }, feet: { Right: [0.13, ANKLE, 0.50], Left: [-0.12, 0.08, -0.46] }, kneePoles: { Right: [0.1, 0, 1], Left: [0, -1, 0.1] }, rel: { Left: [0.06, -0.40, 0.02], Right: [-0.06, -0.40, 0.02] }, poles: bothDir(1, 0, -0.3), hipsY: -0.47, hipsZ: 0.06 };
  const fwd: Pose = { ...back, bones: { ...back.bones, Hips: [-8, 0, 0], RightFoot: [-22, 0, 0] }, hipsY: -0.50, hipsZ: 0.20 };
  return run(scene, sk, 'ex_hk_hip_shift', 4.4, [at(back, 0, true), at(fwd, 1.3, true), at({ ...fwd, bones: { ...fwd.bones, Spine1: [-2.5, 0, 0] } }, 2.3, true), at(fwd, 3.2, true)], true);
};

/** ex_band_shoulder_sink (the banded shoulder distraction stretch) — the right hand through a band at head height in front (not
 *  drawn), walked back until it pulls: the hips go back and the chest sinks toward the floor, the arm long overhead, the left
 *  hand on the hip; breathe, and ease up. */
const bandShoulderSink: Builder = (scene, sk) => {
  const anchor: V3 = [0.18, 1.62, 0.86];
  const up: Pose = { bones: { ...STAND, Hips: [12, 0, 0] }, feet: both(0.14, ANKLE, 0.0), kneePoles: bothDir(0.1, 0, 1), handsAt: { Right: anchor }, rel: { Left: [0.04, -0.42, 0.08] }, poles: { Right: [0.4, -0.2, -1], Left: [1, -0.2, 0] }, hipsY: -0.02, hipsZ: -0.04 };
  const sunk: Pose = { ...up, bones: { Hips: [62, 0, 0], Spine: [8, 0, 0], Spine1: [6, 0, 0], Neck: [-10, 0, 0], LeftLeg: [10, 0, 0], RightLeg: [10, 0, 0] }, hipsY: -0.10, hipsZ: -0.22 };
  return run(scene, sk, 'ex_band_shoulder_sink', 4.6, [at(up, 0, true), at(sunk, 1.3, true), at({ ...sunk, bones: { ...sunk.bones, Spine1: [9, 0, 0] } }, 2.4, true), at(sunk, 3.4, true)], true);
};

/** ex_high_plank_row (the high plank with a band row) — the high plank, the feet a little wide, the body still: one hand rows the
 *  band (not drawn) to the ribs and sets back down, then the other. */
const highPlankRow: Builder = (scene, sk) => {
  const P: Pose = { ...HIGH_PLANK, feet: both(0.24, TOE_ANKLE, -0.90) };
  return alternating(scene, sk, 'ex_high_plank_row', { a: P, b: { ...P, bones: { ...P.bones, Spine: [0, 6, 0] }, hands: both(0.22, 0.40, 0.26), poles: bothDir(0.3, 1, -0.6) }, t: [0.7, 0.3, 0.8, 0.3] });
};

/** ex_kneel_cable_triceps (the kneeling cable triceps extension) — kneeling with the back to a high pulley, leaning forward over a
 *  bench set across in front (demo.ts PROP_SHAPES handbench), the backs of the upper arms on it and the bar held behind the
 *  head (the cable is not drawn): the forearms sweep forward in a half circle until the elbows lock and the arms are level
 *  with the floor; a beat; back slow, the elbows parked. */
const kneelCableTriceps: Builder = (scene, sk) => {
  const base: Pose = { bones: { Hips: [82, 0, 0], Spine: [2, 0, 0], Neck: [-30, 0, 0], LeftFoot: [60, 0, 0], RightFoot: [60, 0, 0] }, feet: both(0.12, 0.09, -0.52), kneePoles: bothDir(0, -1, 0.1), hipsY: -0.40, hipsZ: -0.10 };
  const bent: Pose = { ...base, hands: both(0.10, 0.66, 0.44), poles: bothDir(0.15, -1, 0.3) };
  const long: Pose = { ...base, hands: both(0.10, 0.56, 0.98), poles: bothDir(0.15, -1, 0.3) };
  return rep(scene, sk, 'ex_kneel_cable_triceps', bent, long, 0.8, 0.4, 1.1, 0.3);
};

/** ex_clock_pushup (the clock push-up) — a push-up driven up hard enough that the hands leave the floor, the body turning about
 *  the feet so the hands land a step round to the left (about 30°); another push-up and round to the left again; then two
 *  back to the start. (flag in demo.ts: the source goes all the way round the clock; the loop goes two round and two back.) */
const clockPushup: Builder = (scene, sk) => {
  const feet = both(0.11, TOE_ANKLE, -0.90);
  const top: Pose = { bones: { Hips: [70, 0, 0], Spine: [0, 0, 0], Neck: [-30, 0, 0], LeftFoot: [8, 0, 0], RightFoot: [8, 0, 0] }, feet, kneePoles: bothDir(0, -1, 0.1), hands: both(0.24, 0.05, 0.44), poles: bothDir(0.6, 0.2, -0.7), hipsY: -0.58 };
  const low: Pose = { ...top, bones: { ...top.bones, Hips: [84, 0, 0], Neck: [-40, 0, 0] }, hands: both(0.26, 0.05, 0.44), poles: bothDir(0.7, 0.4, -0.5), hipsY: -0.80 };
  const air: Pose = { ...top, bones: { ...top.bones, Hips: [66, 0, 0] }, hands: both(0.24, 0.20, 0.50), poles: bothDir(0.6, 0, -0.8), hipsY: -0.50 };
  // turned `deg` about the feet (+ round to the body's right): the pose turned about the vertical through the feet
  const about = (p: Pose, deg: number): Pose => movePose(yawPose(movePose(p, 0, 0.90), deg), 0, -0.90);
  const keys: ExKey[] = [];
  let t = 0;
  // the four reps: 0° → −30° → −60°, then back −60° → −30° → 0° (−: round to the body's left)
  for (let i = 0; i < 4; i++) {
    const d0 = i < 2 ? -30 * i : -30 * (4 - i), d1 = i < 2 ? -30 * (i + 1) : -30 * (3 - i);
    keys.push(at(about(top, d0), t, true), at(about(low, d0), t + 0.6, true), at(about(air, (d0 + d1) / 2), t + 0.95));
    t += 1.25;
  }
  return run(scene, sk, 'ex_clock_pushup', t, keys, true);
};

export const FAMILY12_BUILDERS: readonly [string, Builder][] = [
  ['ex_pike_pushup_hands_up', pikeHandsUp], ['ex_pike_pushup_feet_up', pikeFeetUp], ['ex_broad_jump_double', broadJumpDouble], ['ex_lateral_step_stick', lateralStepStick],
  ['ex_calf_press', calfPress], ['ex_chair_squat', chairSquat], ['ex_back_lunge_elevated', backLungeElevated], ['ex_spiderman_lunge_walk', spidermanLungeWalk],
  ['ex_bird_dog_row', birdDogRow], ['ex_rollout_bench', rolloutBench], ['ex_pushup_t', pushupT],
  ['ex_kb_arm_bar', kbArmBar], ['ex_box_out', boxOut], ['ex_slide_run_slide', slideRunSlide], ['ex_shuttle_5105', shuttle5105], ['ex_hill_sprint', hillSprint],
  // the right hand's between the legs, then the left hand's behind the back; the right hand's crossover, then the left hand's between
  ['ex_combo_between_behind', handleCombo('ex_combo_between_behind', { move: 'between_legs', keys: BETWEEN_V2, mirror: false }, { move: 'behind_back', keys: BEHIND_V2, mirror: true })],
  ['ex_speed_dribble', speedDribble], ['ex_change_pace_dribble', changePaceDribble], ['ex_cross_layup', crossLayup], ['ex_speed_layup', speedLayup], ['ex_lying_machine_squat', lyingMachineSquat],
  ['ex_pallof_march', pallofMarch], ['ex_pallof_walkout', pallofWalkout], ['ex_pull_apart_diag', pullApartDiag], ['ex_pull_apart_overhead', pullApartOverhead],
  ['ex_side_plank_row', sidePlankRow], ['ex_bear_plank_row', bearPlankRow], ['ex_bird_dog_band_row', birdDogBandRow], ['ex_guillotine_press', guillotinePress], ['ex_anti_gravity_press', antiGravityPress],
  ['ex_handstand_pushup', handstandPushup], ['ex_muscle_up', muscleUp('ex_muscle_up', false)], ['ex_muscle_up_kip', muscleUp('ex_muscle_up_kip', true)], ['ex_leg_over_floor_press', legOverFloorPress],
  ['ex_clock_pushup', clockPushup], ['ex_high_plank_row', highPlankRow], ['ex_kneel_cable_triceps', kneelCableTriceps], ['ex_db_vertical_swing', dbVerticalSwing], ['ex_hk_hip_shift', hkHipShift], ['ex_band_shoulder_sink', bandShoulderSink],
  ['ex_combo_cross_between', handleCombo('ex_combo_cross_between', { move: 'crossover', keys: CROSSOVER_V2, mirror: false }, { move: 'between_legs', keys: BETWEEN_V2, mirror: true })],
];
