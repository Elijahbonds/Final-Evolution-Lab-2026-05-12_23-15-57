// DEMO-LOOPS-10 (2026-11-10): the next measured gaps — the hamstring, quad, hip and calf stretches, the side-lying crunches,
// the standing and seated hip work, the back curl, the foam roller under the side of the leg, the pull-up's variations,
// the kettlebell windmill and two lying leg-over warm-ups — each read against the movement its entry was imported as
// (free-exercise-db; scripts/probes/demo-loops/source-text.mjs prints it). Same kit and pipeline as the library's loops:
// GATE 0 on every body is poseGuard.test.ts, the floor and the closed seam exercise.test.ts.
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import { ANKLE, HANG, HANG_POLES, KNEES_OUT, SEAT_Y, SQUAT_FEET, STAND, TOE_ANKLE, both, bothDir, rep, seat, type Deg3, type ExKey, type Pair, type V3 } from './exerciseKit';
import { run, at } from './exerciseBody';
import { LIE_BACK, POSITIONS, PRONE, QUAD_HANDS, QUAD_LEGS, SIDE, SUPINE, mirror, turn } from './exerciseFloor';

type Pose = Omit<ExKey, 't'>;
type Side = 'Left' | 'Right';
type Builder = (scene: Scene, sk: Skeleton) => AnimationGroup | null;
const ON_HIPS: Pair = { Left: [0.04, -0.42, 0.08], Right: [-0.04, -0.42, 0.08] };
const HIPS_POLES = bothDir(1, -0.2, 0);

// ── the hamstrings ────────────────────────────────────────────────────────────────────────────────────────────────

/** ex_ham_9090 — on the back, the left leg long on the floor, the right hip and knee bent to right angles, the hands bracing
 *  behind the thigh: the knee straightens until the leg points at the ceiling, a brief pause, and bends again. */
const ham9090: Builder = (scene, sk) => {
  const p = (knee: number): Pose => ({
    ...LIE_BACK, bones: { ...LIE_BACK.bones, Neck: [12, 0, 0], RightUpLeg: [-88, 0, 0], RightLeg: [knee, 0, 0], RightFoot: [-10, 0, 0], LeftUpLeg: [-2, 0, 0], LeftLeg: [2, 0, 0], LeftFoot: [-10, 0, 0] },
    hands: { Right: [0.14, 0.44, 0.02], Left: [0.04, 0.42, 0.02] }, poles: bothDir(1, 0, -0.3),
  });
  return run(scene, sk, 'ex_ham_9090', 3.8, [at(p(90), 0, true), at(p(6), 1.2, true), at(p(6), 1.9, true), at(p(90), 3.1, true)], true);
};

/** ex_ham_leg_up — on the back, the left knee bent and its foot flat to steady the spine, the right leg up in the air: the knee
 *  straightens so the sole faces the ceiling, then the hands draw the long leg toward the nose; held, and eased back. */
const hamLegUp: Builder = (scene, sk) => {
  const p = (hip: number, knee: number): Pose => {
    const z = 0.02 + (hip + 84) * 0.006;
    return {
      ...SUPINE, bones: { ...SUPINE.bones, Neck: [12, 0, 0], RightUpLeg: [hip, 0, 0], RightLeg: [knee, 0, 0], RightFoot: [-14, 0, 0] },
      feet: { Left: SUPINE.feet!.Left }, kneePoles: { Left: SUPINE.kneePoles!.Left }, hands: { Right: [0.14, 0.50, z], Left: [0.04, 0.48, z] }, poles: bothDir(1, 0, -0.3),
    };
  };
  return run(scene, sk, 'ex_ham_leg_up', 5.0, [at(p(-66, 40), 0, true), at(p(-84, 4), 1.2, true), at(p(-104, 4), 2.4, true), at(p(-104, 4), 3.4, true), at(p(-84, 4), 4.2)], true);
};

/** ex_lying_leg_out / ex_lying_leg_across — on the back, the legs long, a belt looped round one foot: the leg swings out
 *  to the side as far as it goes (the groin and hamstring), or across the body to the other side, kept long and off the floor
 *  (the IT band and glute); the hand on the belt draws it a little further, eases, and draws again. */
function lyingLegSwing(name: string, across: boolean): Builder {
  const arms: Pose = across
    ? { hands: { Left: [-0.30, 0.34, 0.16], Right: [0.60, 0.05, -0.40] }, poles: { Left: [-1, 0.2, 0], Right: [0, 1, 0] } }
    : { hands: { Right: [0.50, 0.24, 0.10], Left: [-0.30, 0.04, -0.20] }, poles: { Right: [1, 0.2, 0], Left: [-0.6, 0.3, 0] } };
  const right = (u: number): Pose => ({
    ...LIE_BACK, ...arms,
    bones: { ...LIE_BACK.bones, Neck: [10, 0, 0], LeftUpLeg: [-2, 0, 0], LeftLeg: [2, 0, 0], LeftFoot: [-10, 0, 0], RightUpLeg: across ? [-2 - 60 * u, 0, 62 * u] : [-2 - 22 * u, 0, -58 * u], RightLeg: [3, 0, 0], RightFoot: [-16 * u, 0, 0] },
  });
  // (the stage's floor camera looks at the body's left side: the leg that swings OUT is the left one, toward the camera — the
  // right one swung away behind the body on the contact sheet; the leg that crosses is the right one, coming toward it)
  const p = (u: number): Pose => (across ? right(u) : mirror(right(u)));
  return (scene, sk) => run(scene, sk, name, 5.6, [at(p(0), 0, true), at(p(0.85), 1.4, true), at(p(1), 2.6, true), at(p(0.85), 3.4, true), at(p(1), 4.2, true)], true);
}

/** ex_runner_stretch — one leg long behind, the trunk lowered over the front leg, a hand on the floor either side of the front
 *  foot, its heel down: the seat pushes up toward the ceiling as the front leg straightens, then lowers back toward the floor. */
const runnerStretch: Builder = (scene, sk) => {
  const feet: Pair = { Left: [-0.12, ANKLE, 0.42], Right: [0.12, TOE_ANKLE + 0.04, -0.80] };
  const hands: Pair = { Left: [-0.32, 0.05, 0.46], Right: [0.08, 0.05, 0.46] };
  const low: Pose = { bones: { Hips: [58, 0, 0], Spine: [6, 0, 0], Neck: [-30, 0, 0], RightFoot: [10, 0, 0] }, feet, kneePoles: { Left: [-0.1, 0.2, 1], Right: [0, -1, 0.1] }, hands, poles: bothDir(0.6, 0, -0.7), hipsY: -0.60 };
  const high: Pose = { bones: { Hips: [98, 0, 0], Spine: [10, 0, 0], Neck: [-10, 0, 0], RightFoot: [10, 0, 0], LeftFoot: [-10, 0, 0] }, feet, kneePoles: { Left: [-0.1, 0.4, 1], Right: [0, -1, 0.1] }, hands, poles: bothDir(0.6, 0, -0.7), hipsY: -0.34, hipsZ: -0.12 };
  return run(scene, sk, 'ex_runner_stretch', 5.0, [at(low, 0, true), at(low, 1.0, true), at(high, 2.2, true), at(high, 3.2, true), at(low, 4.4, true)], true);
};

/** ex_stand_ham_calf — standing, the left foot a step in front, its leg straight and its toes lifted off the floor, the back knee
 *  bent: the trunk leans forward over the front leg and the hands draw the top of the foot back (the belt's pull); eased, drawn
 *  again, and up. */
const standHamCalf: Builder = (scene, sk) => {
  const up: Pose = { bones: { ...STAND }, feet: { Left: [-0.11, ANKLE, 0.36], Right: [0.11, ANKLE, 0.0] }, kneePoles: bothDir(0.1, 0, 1), hands: HANG, poles: HANG_POLES, hipsY: -0.02, hipsZ: 0.08 };
  const fold = (d: number): Pose => ({
    bones: { Hips: [50 + d, 0, 0], Spine: [10, 0, 0], Neck: [-22, 0, 0], LeftFoot: [-24, 0, 0], RightFoot: [-16, 0, 0] },
    feet: { Left: [-0.11, ANKLE + 0.015, 0.36], Right: [0.11, ANKLE, 0.0] }, kneePoles: bothDir(0.1, 0, 1), hands: { Left: [-0.13, 0.30, 0.48], Right: [-0.03, 0.34, 0.46] }, poles: bothDir(0.6, 0, -0.6), hipsY: -0.16, hipsZ: -0.10,
  });
  return run(scene, sk, 'ex_stand_ham_calf', 6.0, [at(up, 0, true), at(fold(0), 1.4, true), at(fold(8), 2.8, true), at(fold(0), 3.8, true), at(fold(8), 4.6, true), at(up, 5.6, true)], true);
};

/** ex_leg_grab (the upper back-leg grab) — sitting, the legs out in front and together, the knees soft: the trunk folds to hug the
 *  thighs from underneath, the chest down on the knees; then the back pulls up and away from the knees against the arms,
 *  rounding; and down again. */
const legGrab: Builder = (scene, sk) => {
  const p = (hips: number, round: number, neck: number): Pose => ({
    bones: { Hips: [hips, 0, 0], Spine: [16 + round, 0, 0], Spine1: [8 + round, 0, 0], Neck: [neck, 0, 0], LeftUpLeg: [-98 - hips, 0, 3], RightUpLeg: [-98 - hips, 0, -3], LeftLeg: [18, 0, 0], RightLeg: [18, 0, 0], LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0] },
    hands: both(0.08, 0.07, 0.30), poles: bothDir(1, 0.2, -0.2), hipsY: -0.80,
  });
  return run(scene, sk, 'ex_leg_grab', 5.0, [at(p(46, 0, 4), 0, true), at(p(46, 0, 4), 1.4, true), at(p(26, 10, 14), 2.6, true), at(p(26, 10, 14), 3.6, true)], true);
};

/** ex_chair_leg_out — sitting upright on a chair (demo.ts PROP_SHAPES seat), the hands gripping its sides: one leg lifts and
 *  straightens, the ankle flexed, moves out to the side as far as it goes, back to the middle, and down. */
const chairLegOut: Builder = (scene, sk) => {
  const p = (right: V3): Pose => seat({ hands: both(0.25, 0.86 + SEAT_Y, 0.04), poles: bothDir(0.2, -0.3, -0.9), feet: { Left: [-0.19, ANKLE, 0.48], Right: right }, bones: { RightFoot: [right[1] > 0.3 ? -16 : 0, 0, 0] } });
  const down: V3 = [0.19, ANKLE, 0.48], front: V3 = [0.19, 0.50, 0.80], out: V3 = [0.52, 0.50, 0.66];
  return run(scene, sk, 'ex_chair_leg_out', 5.6, [at(p(down), 0, true), at(p(front), 1.1, true), at(p(out), 2.3, true), at(p(out), 2.8, true), at(p(front), 3.9, true), at(p(down), 4.9, true)]);
};

// ── the quads and the hip flexors ─────────────────────────────────────────────────────────────────────────────────

/** ex_quad_allfours — on the hands and knees: the right leg lifts off the floor and the right hand reaches back to hold its foot,
 *  the knee fully bent; the hips press toward the floor, eased and pressed again; then back to all fours. */
const quadAllFours: Builder = (scene, sk) => {
  const p = (u: number, hand: V3, pole: V3): Pose => ({
    bones: { Hips: [90, 0, 0], Spine: [-4 * u, 0, 14 * u], Spine1: [0, 0, 12 * u], Neck: [-40, 0, 0], LeftFoot: [60, 0, 0], RightUpLeg: [-90 + 64 * u, 0, 0], RightLeg: [90 + 65 * u, 0, 0], RightFoot: [34, 0, 0] },
    feet: { Left: QUAD_LEGS.feet.Left }, kneePoles: { Left: QUAD_LEGS.kneePoles.Left }, hands: { Left: [-0.14, 0.05, 0.52], Right: hand }, poles: { Left: [-0.6, 0.2, -0.5], Right: pole }, hipsY: -0.40 - 0.03 * u,
  });
  const floor = QUAD_HANDS.Right as V3, foot: V3 = [0.12, 0.64, -0.08], back: V3 = [0.8, 0.4, -0.2];
  return run(scene, sk, 'ex_quad_allfours', 6.4, [at(p(0, floor, [0.6, 0.2, -0.5]), 0, true), at(p(0.9, foot, back), 1.6, true), at(p(1, foot, back), 3.0, true), at(p(0.9, foot, back), 4.0, true), at(p(1, foot, back), 4.8, true)], true);
};

const proneLeg = (thigh: number, knee: number): Record<string, Deg3> => ({ RightUpLeg: [thigh, 0, 0], RightLeg: [knee, 0, 0], RightFoot: [30, 0, 0] });
/** ex_prone_quad — face down, a belt looped round the right foot and held over the shoulders in both hands: the knee bends and the
 *  hands pull until the knee and the hip come off the floor; held, eased, pulled again. */
const proneQuad: Builder = (scene, sk) => {
  const p = (u: number): Pose => ({
    ...PRONE, bones: { ...PRONE.bones, Spine: [-10 * u, 0, 0], Spine1: [-6 * u, 0, 0], Neck: [-6 - 10 * u, 0, 0], ...proneLeg(14 * u, 96 + 34 * u) },
    feet: { Left: PRONE.feet!.Left }, kneePoles: { Left: PRONE.kneePoles!.Left }, hands: both(0.14, 0.24 + 0.10 * u, 0.30 - 0.10 * u), poles: bothDir(1, 0.3, 0.2),
  });
  return run(scene, sk, 'ex_prone_quad', 5.0, [at(p(0), 0, true), at(p(1), 1.4, true), at(p(1), 2.8, true), at(p(0.6), 3.4), at(p(1), 4.0, true)], true);
};
/** ex_half_locust — face down, the left hand under the left hip bone, the right knee bent and its foot held in the right hand:
 *  the foot lifts into the air as the shoulders lift off the floor; held, and down. */
const halfLocust: Builder = (scene, sk) => {
  const p = (u: number): Pose => ({
    ...PRONE, bones: { ...PRONE.bones, Spine: [-8 - 12 * u, 0, 0], Spine1: [-4 - 10 * u, 0, 0], Neck: [-10 - 8 * u, 0, 0], ...proneLeg(2 + 14 * u, 140) },
    feet: { Left: PRONE.feet!.Left }, kneePoles: { Left: PRONE.kneePoles!.Left }, hands: { Left: [-0.12, 0.05, 0.02], Right: [0.14, 0.34 + 0.12 * u, -0.10] }, poles: { Left: [-1, 0.2, 0], Right: [0.6, 0.8, 0] },
  });
  return run(scene, sk, 'ex_half_locust', 4.6, [at(p(0), 0, true), at(p(1), 1.2, true), at(p(1), 2.6, true), at(p(0), 3.8, true)], true);
};

/** ex_camel (looking at the ceiling) — kneeling, sat back, a hand on each heel: the seat lifts up and forward as the head goes
 *  back to look at the ceiling, the back arching; held, and sat back down. */
const camel: Builder = (scene, sk) => {
  const shins = { feet: both(0.11, 0.08, -0.38), kneePoles: bothDir(0.05, 0.2, 1) };
  const heels = both(0.14, 0.17, -0.40);
  const sit: Pose = { bones: { Hips: [-4, 0, 0], Spine: [0, 0, 0], Spine1: [0, 0, 0], Neck: [0, 0, 0], LeftFoot: [62, 0, 0], RightFoot: [62, 0, 0] }, ...shins, hands: heels, poles: bothDir(0.3, 0, -1), hipsY: -0.64, hipsZ: -0.32 };
  const up: Pose = { bones: { Hips: [-32, 0, 0], Spine: [-20, 0, 0], Spine1: [-16, 0, 0], Neck: [-26, 0, 0], LeftFoot: [62, 0, 0], RightFoot: [62, 0, 0] }, ...shins, hands: heels, poles: bothDir(0.3, 0, -1), hipsY: -0.46, hipsZ: -0.08 };
  return run(scene, sk, 'ex_camel', 5.4, [at(sit, 0, true), at(up, 1.4, true), at(up, 3.2, true), at(sit, 4.6, true)], true);
};

/** ex_side_quad — lying on the right side, the right knee bent to a right angle on the floor in front (it steadies the trunk):
 *  the left knee bends behind and the left hand holds the foot; the left hip presses forward as the foot pushes back into the
 *  hand, eased, and again. */
const sideQuad: Builder = (scene, sk) => {
  const p = (u: number): Pose => turn({
    ...SIDE, bones: { ...SIDE.bones, RightUpLeg: [-90, 0, 0], RightLeg: [90, 0, 0], LeftUpLeg: [10 + 10 * u, 0, 0], LeftLeg: [150, 0, 0], LeftFoot: [30, 0, 0] },
    hands: { Right: SIDE.hands!.Right, Left: [-0.20 - 0.03 * u, 0.30, 0.04] }, poles: { Right: [0, 1, 0], Left: [-0.4, 0.6, -0.4] },
  });
  return run(scene, sk, 'ex_side_quad', 5.0, [at(p(0), 0, true), at(p(1), 1.4, true), at(p(1), 2.8, true), at(p(0), 3.6), at(p(1), 4.2, true)], true);
};

/** ex_stand_hip_flexor — standing tall, the left foot a little in front of the right: both knees bend, the back heel lifts and the
 *  right hip presses forward; held, and up. ex_soleus_stretch — the same stance: both knees bend with the back heel kept on the
 *  floor (the soleus and Achilles of the back leg); held, and up. */
function staggered(name: string, kind: 'hipflexor' | 'soleus'): Builder {
  const feet = (heel: number): Pair => ({ Left: [-0.11, ANKLE, 0.22], Right: [0.11, ANKLE + heel, -0.12] });
  const up: Pose = { bones: { ...STAND }, feet: feet(0), kneePoles: bothDir(0.1, 0, 1), rel: ON_HIPS, poles: HIPS_POLES, hipsY: -0.01 };
  const low: Pose = kind === 'hipflexor'
    ? { bones: { Hips: [-8, 0, 0], Spine: [6, 0, 0], Neck: [0, 0, 0], RightFoot: [34, 0, 0], LeftFoot: [-10, 0, 0] }, feet: feet(0.07), kneePoles: bothDir(0.1, 0, 1), rel: ON_HIPS, poles: HIPS_POLES, hipsY: -0.10, hipsZ: 0.06 }
    : { bones: { Hips: [8, 0, 0], Spine: [2, 0, 0], Neck: [-4, 0, 0], RightFoot: [-26, 0, 0], LeftFoot: [-16, 0, 0] }, feet: feet(0), kneePoles: bothDir(0.1, 0, 1), rel: ON_HIPS, poles: HIPS_POLES, hipsY: -0.17, hipsZ: 0.02 };
  return (scene, sk) => run(scene, sk, name, 5.0, [at(up, 0, true), at(low, 1.2, true), at(low, 3.2, true), at(up, 4.4, true)], true);
}

/** ex_sit_squat (sit squats) — feet shoulder-width: the hips sit back and the knees bend part of the way down, above parallel,
 *  and the squat is reversed quickly back to standing. */
const sitSquat: Builder = (scene, sk) => {
  const hands: Pair = { Left: [0.13, -0.24, 0.26], Right: [-0.13, -0.24, 0.26] }, poles = bothDir(0.25, -1, -0.1);
  return rep(scene, sk, 'ex_sit_squat',
    { bones: { ...STAND, Hips: [4, 0, 0] }, feet: SQUAT_FEET, kneePoles: KNEES_OUT, rel: hands, poles, hipsY: 0 },
    { bones: { Hips: [24, 0, 0], Spine: [8, 0, 0], Neck: [-14, 0, 0], LeftFoot: [-16, 0, 0], RightFoot: [-16, 0, 0] }, feet: SQUAT_FEET, kneePoles: KNEES_OUT, rel: hands, poles, hipsY: -0.22, hipsZ: -0.08 },
    0.6, 0.05, 0.4, 0.45);
};

/** ex_seat_calf_stretch — sitting up on the floor, the left knee bent and its foot flat to steady the trunk, the right leg straight
 *  and its ankle flexed: the right hand reaches the toes and draws them back; a little further, held, and eased. */
const seatCalfStretch: Builder = (scene, sk) => {
  const p = (lean: number): Pose => ({
    bones: { Hips: [26 + lean, 0, 0], Spine: [14, 0, 0], Spine1: [8, 0, 0], Neck: [-8, 0, 0], RightUpLeg: [-114 - lean, 0, -3], RightLeg: [3, 0, 0], RightFoot: [-22, 0, 0] },
    feet: { Left: [-0.20, ANKLE, 0.38] }, kneePoles: { Left: [-0.3, 1, 0.5] }, hands: { Right: [0.12, 0.27, 0.80], Left: [-0.20, 0.42, 0.34] }, poles: { Right: [0.8, 0, -0.5], Left: [-1, 0, -0.2] }, hipsY: -0.80,
  });
  return run(scene, sk, 'ex_seat_calf_stretch', 4.6, [at(p(0), 0, true), at(p(8), 1.4, true), at(p(8), 3.0, true)], true);
};

/** ex_butterfly_curl (the groin and back stretch) — sitting, the knees bent out and the soles together, the fingers laced behind
 *  the head: the trunk curls down, the elbows to the insides of the thighs; a brief pause, and back up, head up and back long. */
const butterflyCurl: Builder = (scene, sk) => {
  const B = POSITIONS.butterfly[0];
  const p = (u: number): Pose => ({
    ...B, bones: { ...B.bones, Hips: [-2 + 26 * u, 0, 0], Spine: [4 + 24 * u, 0, 0], Spine1: [16 * u, 0, 0], Neck: [-4 + 16 * u, 0, 0] }, hands: undefined,
    rel: { Left: [0.10, 0.13 - 0.10 * u, -0.02 + 0.14 * u], Right: [-0.10, 0.13 - 0.10 * u, -0.02 + 0.14 * u] }, poles: bothDir(1, 0.1 - 0.5 * u, -0.1 + 0.5 * u),
  });
  return run(scene, sk, 'ex_butterfly_curl', 4.4, [at(p(0), 0, true), at(p(1), 1.4, true), at(p(1), 2.2, true), at(p(0), 3.6, true)], true);
};

// ── the side-lying crunches ───────────────────────────────────────────────────────────────────────────────────────

/** ex_side_crunch — lying on the right side, the legs stacked and the knees a little bent, the left hand behind the head: the
 *  trunk crunches up sideways, the elbow toward the hip, a second's hold, and slowly down. ex_side_jackknife — the legs long:
 *  the top leg lifts as the trunk crunches up to meet it. */
function sideCrunch(name: string, leg: boolean): Builder {
  // (measured on the rig: lying on the right side, a NEGATIVE spine roll lifts the head off the floor)
  const bend = -1;
  const p = (u: number): Pose => turn({
    ...SIDE, bones: { ...SIDE.bones, Spine: [0, 0, 16 * u * bend], Spine1: [0, 0, 12 * u * bend], Neck: [0, 0, 8 * u * bend], LeftUpLeg: leg ? [-4, 0, 6 + 34 * u] : [-24, 0, 0], RightUpLeg: leg ? [-4, 0, 0] : [-24, 0, 0], LeftLeg: leg ? [3, 0, 0] : [40, 0, 0], RightLeg: leg ? [3, 0, 0] : [40, 0, 0] },
    hands: { Right: [0.42, 0.05, -0.36], Left: [-0.08, 0.28 + 0.14 * u, -0.66 + 0.04 * u] }, poles: { Right: [0, 1, 0.2], Left: [-0.2, 1, -0.6] },
  });
  return (scene, sk) => run(scene, sk, name, 2.8, [at(p(0), 0, true), at(p(1), 0.9, true), at(p(1), 1.3, true), at(p(0), 2.3, true)], true);
}

// ── the hips ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** The standing hip work — on the right leg, the hands on the hips (a hand on a post, or the cable's frame, in the gym): the left
 *  leg moves from `rest` to `end` against the band or cable, a pause, and back. ex_hip_abduction_stand: straight out to the side.
 *  ex_hip_adduction_stand: from out at the side across in front of the standing leg. ex_hip_extension_stand: straight back,
 *  the knee kept straight. ex_hip_flexion_stand: the knee up to hip height. */
function hipStand(name: string, rest: Deg3, end: Deg3, knee: number, lean: number): Builder {
  const p = (leg: Deg3, kneeDeg: number, u: number): Pose => ({
    bones: { ...STAND, Hips: [lean * u, 0, 0], LeftUpLeg: leg, LeftLeg: [kneeDeg, 0, 0], LeftFoot: [0, 0, 0] },
    feet: { Right: [0.10, ANKLE, 0.06] }, kneePoles: { Right: [0.05, 0, 1] }, rel: ON_HIPS, poles: HIPS_POLES, hipsY: -0.005, hipsX: 0.06,
  });
  return (scene, sk) => run(scene, sk, name, 2.8, [at(p(rest, 4, 0), 0, true), at(p(end, knee, 1), 0.9, true), at(p(end, knee, 1), 1.4, true), at(p(rest, 4, 0), 2.3, true)]);
}

/** ex_donkey_kick (the glute kickback) — on the hands and knees: one leg lifts, its knee kept at a right angle, until the thigh
 *  is in line with the back and the sole faces the ceiling; a second's squeeze, and down; twice, then the other leg. */
const donkeyKick: Builder = (scene, sk) => {
  const base: Record<string, Deg3> = { Hips: [90, 0, 0], Spine: [0, 0, 0], Neck: [-50, 0, 0], LeftUpLeg: [-90, 0, 0], RightUpLeg: [-90, 0, 0], LeftLeg: [90, 0, 0], RightLeg: [90, 0, 0], LeftFoot: [34, 0, 0], RightFoot: [34, 0, 0] };
  const p = (leg: Side | null): Pose => ({ bones: leg ? { ...base, [`${leg}UpLeg`]: [-2, 0, 0], [`${leg}Leg`]: [90, 0, 0], [`${leg}Foot`]: [10, 0, 0] } : base, hands: both(0.18, 0.05, 0.52), poles: bothDir(0.6, 0.2, -0.5), hipsY: -0.40 });
  const reps = (leg: Side, t0: number): ExKey[] => [0, 1].flatMap((i) => [at(p(leg), t0 + i * 1.8 + 0.8, true), at(p(leg), t0 + i * 1.8 + 1.2, true), at(p(null), t0 + i * 1.8 + 1.8, true)]);
  return run(scene, sk, 'ex_donkey_kick', 7.2, [at(p(null), 0, true), ...reps('Left', 0), ...reps('Right', 3.6)]);
};

/** ex_monster_walk — a band round the ankles and another round the knees, the feet kept shoulder-width so the bands stay tight,
 *  a quarter squat: short steps forward, left then right, then the same steps backward to the start. */
const monsterWalk: Builder = (scene, sk) => {
  const step = 0.12, x = 0.20;
  const p = (l: number, r: number): Pose => ({
    bones: { Hips: [18, 0, 0], Spine: [6, 0, 0], Neck: [-10, 0, 0], LeftFoot: [-14, 0, 0], RightFoot: [-14, 0, 0] },
    feet: { Left: [-x, ANKLE, 0.08 + l * step], Right: [x, ANKLE, 0.08 + r * step] }, kneePoles: bothDir(0.3, 0, 1), rel: ON_HIPS, poles: HIPS_POLES, hipsY: -0.16, hipsZ: ((l + r) / 2) * step,
  });
  const seq: [number, number][] = [[0, 0], [1, 0], [1, 2], [3, 2], [3, 3], [3, 2], [1, 2], [1, 0]];
  return run(scene, sk, 'ex_monster_walk', seq.length * 0.55, seq.map(([l, r], i) => at(p(l, r), i * 0.55, true)));
};

/** ex_seat_abduction / ex_seat_adduction — the thigh machines: seated upright, the hands on the handles at the sides, the trunk
 *  still: the knees press apart against the pads and come back together (abductor), or start apart and press together
 *  (adductor). */
function seatThighs(name: string, open: boolean): Builder {
  const p = (u: number): Pose => seat({ feet: both(0.11 + 0.26 * u, ANKLE, 0.48 - 0.04 * u), kneePoles: bothDir(0.05 + 0.9 * u, 0.3, 1), hands: both(0.27, 0.86 + SEAT_Y, 0.06), poles: bothDir(0.2, -0.3, -0.9) });
  const a = open ? 0 : 1, b = 1 - a;
  return (scene, sk) => run(scene, sk, name, 3.0, [at(p(a), 0, true), at(p(0.5), 0.5), at(p(b), 1.0, true), at(p(b), 1.5, true), at(p(0.5), 2.05), at(p(a), 2.6, true)]);
}

// ── the back ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** ex_prone_back_curl (the lower back curl) — face down, the arms out to the sides: the low back lifts the chest off the floor,
 *  the head up, the arms lifting with it (they do not push); and down. */
const proneBackCurl: Builder = (scene, sk) => {
  const p = (u: number): Pose => ({ ...PRONE, bones: { ...PRONE.bones, Spine: [-16 * u, 0, 0], Spine1: [-12 * u, 0, 0], Neck: [-6 - 14 * u, 0, 0] }, hands: both(0.62, 0.06 + 0.16 * u, 0.40 - 0.08 * u), poles: bothDir(0, 0.2, -1) });
  return run(scene, sk, 'ex_prone_back_curl', 3.2, [at(p(0), 0, true), at(p(1), 1.0, true), at(p(1), 1.6, true), at(p(0), 2.7, true)], true);
};

// ── the foam roller under the side of the leg (demo.ts PROP_SHAPES rollerit / rollershin: the roller stays put) ─────────

/** ex_it_band_smr — lying on the right side, the right thigh on the roller between the hip and the knee, the weight on the forearm
 *  and on the top foot crossed over in front: the body rolls so the roller travels from the hip to the knee and back.
 *  ex_peroneal_smr — the roller under the outside of the lower leg, the hips lifted: from below the knee to above the ankle. */
function sideRoll(name: string, hipsY: number, footY: number, reach: number): Builder {
  const p = (dz: number): Pose => turn({
    bones: { Hips: [0, -90, 90], Spine: [0, 0, -14], Spine1: [0, 0, -10], Neck: [0, 0, -4], RightFoot: [-10, 0, 0] },
    feet: { Right: [0.02, footY, 0.84 + dz], Left: [0.34, ANKLE, 0.30] }, kneePoles: { Right: [1, 0, 0], Left: [0.2, 1, 0] },
    hands: { Right: [0.24, 0.07, -0.50], Left: [0.44, 0.05, -0.22] }, poles: { Right: [0, -1, 0.1], Left: [0.3, 1, -0.3] }, hipsY, hipsZ: dz,
  });
  return (scene, sk) => run(scene, sk, name, 3.6, [at(p(-reach), 0, true), at(p(reach), 1.7, true)], true);
}

// ── the bar ───────────────────────────────────────────────────────────────────────────────────────────────────────

const BAR_Y = 2.20;   // (exerciseProps.ts: the pull-up bar, demo.ts PROP_SHAPES pullbar)
/** The pull-up's variations. ex_pullup_rear — a wide grip, the trunk and head brought forward so the bar comes down behind the
 *  neck. ex_pullup_side — a wide grip: up leaning toward one hand, down, up toward the other. ex_sternum_chin — a shoulder-width
 *  underhand grip, leaning back the whole way: pulled until the lower chest touches the bar, the hips and legs at 45 degrees. */
function barPull(name: string, kind: 'rear' | 'side' | 'sternum'): Builder {
  const legs: Record<string, Deg3> = { LeftUpLeg: [-10, 0, 2], RightUpLeg: [-10, 0, -2], LeftLeg: [22, 0, 0], RightLeg: [22, 0, 0], LeftFoot: [20, 0, 0], RightFoot: [20, 0, 0] };
  const w = kind === 'sternum' ? 0.18 : 0.38;
  const poles = kind === 'sternum' ? bothDir(0.3, -0.5, 0.8) : bothDir(1, -0.4, 0);
  const p = (hy: number, bones: Record<string, Deg3> = {}, hx = 0, hz = 0): Pose => ({ bones: { Hips: [0, 0, 0], Spine: [0, 0, 0], Spine1: [0, 0, 0], Neck: [0, 0, 0], ...legs, ...bones }, handsAt: both(w, BAR_Y - 0.02, 0.02), poles, hipsY: hy, ...(hx ? { hipsX: hx } : {}), ...(hz ? { hipsZ: hz } : {}) });
  return (scene, sk) => {
    if (kind === 'rear') {
      const hang = p(0.26, { Hips: [4, 0, 0], Neck: [8, 0, 0] }, 0, 0.05), top = p(0.58, { Hips: [8, 0, 0], Neck: [18, 0, 0] }, 0, 0.11);
      return run(scene, sk, name, 2.8, [at(hang, 0, true), at(top, 0.9, true), at(top, 1.3, true)]);
    }
    if (kind === 'side') {
      const hang = p(0.26), top = (k: number) => p(0.58, { Spine: [-6, 0, 0], Neck: [-10, 0, 0] }, 0.16 * k);
      return run(scene, sk, name, 4.6, [at(hang, 0, true), at(top(1), 0.9, true), at(top(1), 1.3, true), at(hang, 2.3, true), at(top(-1), 3.2, true), at(top(-1), 3.6, true)]);
    }
    const inLine: Record<string, Deg3> = { LeftUpLeg: [-4, 0, 2], RightUpLeg: [-4, 0, -2], LeftLeg: [10, 0, 0], RightLeg: [10, 0, 0] };
    const hang = p(0.24, { Hips: [-14, 0, 0], Spine: [-6, 0, 0], Neck: [-8, 0, 0] }, 0, 0.07);
    const top = p(0.96, { Hips: [-44, 0, 0], Spine: [-8, 0, 0], Spine1: [-4, 0, 0], Neck: [-14, 0, 0], ...inLine }, 0, 0.22);
    return run(scene, sk, name, 3.2, [at(hang, 0, true), at(top, 1.1, true), at(top, 1.6, true)]);
  };
}

// ── the kettlebell windmill ───────────────────────────────────────────────────────────────────────────────────────

/** ex_kb_windmill — a bell locked out overhead on the right arm, the feet wide: the seat pushes out toward the bell's side as the
 *  trunk bends over to the other, the free hand sliding down inside the left leg to the floor, the eyes on the bell and the arm
 *  staying vertical; a second's pause, and back up. */
const kbWindmill: Builder = (scene, sk) => {
  // (measured on the rig: standing, NEGATIVE hip and spine rolls lean the trunk to the body's left, away from the bell)
  const feet = both(0.26, ANKLE, 0.08);
  const top: Pose = { bones: { ...STAND, Neck: [-8, 0, 0] }, feet, kneePoles: bothDir(0.2, 0, 1), rel: { Right: [-0.02, 0.60, 0.0], Left: [0.04, -0.44, 0.08] }, poles: { Right: [1, 0.1, -0.1], Left: [-0.4, -0.4, -0.8] }, hipsY: 0 };
  const low: Pose = { bones: { Hips: [30, 0, -50], Spine: [6, 0, -26], Spine1: [0, 0, -20], Neck: [-10, 0, 30], LeftFoot: [-8, 0, 0], RightFoot: [-8, 0, 0] }, feet, kneePoles: bothDir(0.2, 0, 1), rel: { Right: [0.0, 0.60, 0.0] }, hands: { Left: [-0.30, 0.10, 0.16] }, poles: { Right: [1, 0.1, -0.1], Left: [-0.4, -0.4, -0.8] }, hipsY: -0.14, hipsX: 0.16 };
  return run(scene, sk, 'ex_kb_windmill', 4.6, [at(top, 0, true), at(low, 1.6, true), at(low, 2.3, true), at(top, 3.9, true)], true);
};

// ── the lying leg-overs (warm-ups) ────────────────────────────────────────────────────────────────────────────────

/** ex_supine_windmill — on the back, the arms out to the sides, the legs long: one leg lifts and crosses quickly over the body
 *  toward the floor by the opposite hand; back to the start, and the other leg. */
const supineWindmill: Builder = (scene, sk) => {
  const long: Pose = { ...LIE_BACK, hands: both(0.62, 0.05, -0.40), poles: bothDir(0, 1, 0), bones: { ...LIE_BACK.bones, LeftUpLeg: [0, 0, 0], RightUpLeg: [0, 0, 0], LeftLeg: [2, 0, 0], RightLeg: [2, 0, 0], LeftFoot: [30, 0, 0], RightFoot: [30, 0, 0] } };
  const leg = (s: Side, across: number): Pose => { const k = s === 'Left' ? 1 : -1; return { ...long, bones: { ...long.bones, [`${s}UpLeg`]: [-84 - 20 * across, 0, -74 * across * k], [`${s}Leg`]: [6, 0, 0], [`${s}Foot`]: [0, 0, 0], Neck: [10, 30 * across * k, 0] } }; };
  const one = (s: Side, t0: number): ExKey[] => [at(leg(s, 0), t0 + 0.5), at(leg(s, 1), t0 + 0.9, true), at(leg(s, 1), t0 + 1.1, true), at(leg(s, 0), t0 + 1.5)];
  return run(scene, sk, 'ex_supine_windmill', 4.0, [at(long, 0, true), ...one('Left', 0), at(long, 2.0, true), ...one('Right', 2.0)], true);
};

/** ex_iron_cross_stretch — face down, the arms out to the sides with the palms on the floor: one knee bends and that leg comes
 *  up and across the back of the body toward the floor by the opposite hand; straight back, and the other leg. */
const ironCrossStretch: Builder = (scene, sk) => {
  const flat: Record<string, Deg3> = { ...PRONE.bones, LeftUpLeg: [0, 0, 0], RightUpLeg: [0, 0, 0], LeftLeg: [2, 0, 0], RightLeg: [2, 0, 0] };
  const base: Pose = { bones: flat, hands: both(0.62, 0.06, 0.40), poles: bothDir(0, 0.2, -1), hipsY: PRONE.hipsY };
  const over = (s: Side): Pose => { const k = s === 'Left' ? 1 : -1; return { ...base, bones: { ...flat, [`${s}UpLeg`]: [26, 0, -62 * k], [`${s}Leg`]: [70, 0, 0], [`${s}Foot`]: [20, 0, 0], Neck: [-6, -24 * k, 0] } }; };
  return run(scene, sk, 'ex_iron_cross_stretch', 4.0, [at(base, 0, true), at(over('Left'), 0.9, true), at(over('Left'), 1.2, true), at(base, 2.0, true), at(over('Right'), 2.9, true), at(over('Right'), 3.2, true)], true);
};

export const FAMILY10_BUILDERS: readonly [string, Builder][] = [
  ['ex_ham_9090', ham9090], ['ex_ham_leg_up', hamLegUp], ['ex_lying_leg_out', lyingLegSwing('ex_lying_leg_out', false)], ['ex_lying_leg_across', lyingLegSwing('ex_lying_leg_across', true)],
  ['ex_runner_stretch', runnerStretch], ['ex_stand_ham_calf', standHamCalf], ['ex_leg_grab', legGrab], ['ex_chair_leg_out', chairLegOut],
  ['ex_quad_allfours', quadAllFours], ['ex_prone_quad', proneQuad], ['ex_half_locust', halfLocust], ['ex_camel', camel], ['ex_side_quad', sideQuad],
  ['ex_sit_squat', sitSquat], ['ex_stand_hip_flexor', staggered('ex_stand_hip_flexor', 'hipflexor')], ['ex_soleus_stretch', staggered('ex_soleus_stretch', 'soleus')], ['ex_seat_calf_stretch', seatCalfStretch], ['ex_butterfly_curl', butterflyCurl],
  ['ex_side_crunch', sideCrunch('ex_side_crunch', false)], ['ex_side_jackknife', sideCrunch('ex_side_jackknife', true)],
  ['ex_hip_abduction_stand', hipStand('ex_hip_abduction_stand', [-2, 0, 0], [-2, 0, 34], 4, 0)], ['ex_hip_adduction_stand', hipStand('ex_hip_adduction_stand', [-4, 0, 22], [-12, 0, -18], 4, 0)],
  ['ex_hip_extension_stand', hipStand('ex_hip_extension_stand', [-2, 0, 0], [24, 0, 0], 4, 8)], ['ex_hip_flexion_stand', hipStand('ex_hip_flexion_stand', [-2, 0, 0], [-88, 0, 0], 90, 0)],
  ['ex_donkey_kick', donkeyKick], ['ex_monster_walk', monsterWalk], ['ex_seat_abduction', seatThighs('ex_seat_abduction', true)], ['ex_seat_adduction', seatThighs('ex_seat_adduction', false)],
  ['ex_prone_back_curl', proneBackCurl], ['ex_it_band_smr', sideRoll('ex_it_band_smr', -0.64, 0.17, 0.10)], ['ex_peroneal_smr', sideRoll('ex_peroneal_smr', -0.56, 0.17, 0.08)],
  ['ex_pullup_rear', barPull('ex_pullup_rear', 'rear')], ['ex_pullup_side', barPull('ex_pullup_side', 'side')], ['ex_sternum_chin', barPull('ex_sternum_chin', 'sternum')],
  ['ex_kb_windmill', kbWindmill], ['ex_supine_windmill', supineWindmill], ['ex_iron_cross_stretch', ironCrossStretch],
];
