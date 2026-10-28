// Floor and mobility loops (LIBRARY-ANATOMY-2, 2026-10-25): the library's mobility positions — the down dog, the child's
// pose, the pigeon, the 90/90, the spiderman lunge … — each a loop of its own (the position, breathing, or the small
// movement it is named for: the cat-camel's wave, the frog's rock, the cossack's shift), and the FLOWS the library pairs
// them into (family mobility-flow: "flow from A to B", "from A through B to C"), made from the same positions.
//
// Owner decision (2026-10-25): coverage rises only with correct, authored loops. A flow is its positions, each held for a
// breath, joined by the move between them; a three-position flow goes A → B → C and back through B. The positions are
// authored in the kit's convention (exerciseKit.ts): torso bones, hands and feet as targets in the final frame.
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import { FLOW_SEQS, flowClip } from './exerciseFlows';
import { ANKLE, TOE_ANKLE, HIGH_PLANK, both, bothDir, loop, mix, type Deg3, type ExKey, type Pair } from './exerciseKit';

type Pose = Omit<ExKey, 't'>;

/** The kneeling hipsY (exerciseMore.ts KNEEL_Y): a knee joint ~5 cm off the floor under a vertical thigh. */
const KNEEL_Y = -0.43;
/** A down knee by bones (the thigh under the hip, the shin flat behind, the foot pointed). */
const downKnee = (s: 'Left' | 'Right'): Record<string, Deg3> => ({ [`${s}UpLeg`]: [0, 0, s === 'Left' ? 3 : -3], [`${s}Leg`]: [90, 0, 0], [`${s}Foot`]: [62, 0, 0] });
export const QUAD_HANDS: Pair = both(0.18, 0.05, 0.52);
/** Hands and knees by targets: the knee under the hip, the shin flat behind, the foot pointed (so a move to or from a
 *  position solved by targets interpolates targets, not a bone pose into a target pose). */
export const QUAD_LEGS = { feet: both(0.12, 0.09, -0.42), kneePoles: bothDir(0, -1, 0.1) };

// ── the base poses the lying, side-lying and seated positions are made from ──
/** On the back, knees bent, feet flat (the bridge's floor pose, exercise.ts ex_bridge). */
export const SUPINE: Pose = { bones: { Hips: [-86, 0, 0], Spine: [0, 0, 0], Neck: [10, 0, 0] }, feet: both(0.14, ANKLE, 0.50), kneePoles: bothDir(0.1, 1, 0.2), hands: both(0.30, 0.04, -0.20), poles: bothDir(0.6, 0.3, 0), hipsY: -0.82 };
/** On the back with the legs keyed by bones (no foot targets): the base the legs-in-the-air positions add their legs to. */
export const LIE_BACK: Pose = { bones: { Hips: [-86, 0, 0], Spine: [0, 0, 0], Neck: [10, 0, 0] }, hands: both(0.30, 0.04, -0.20), poles: bothDir(0.6, 0.3, 0), hipsY: -0.84 };
/** Face down, the forehead on the hands, the legs long, the feet pointed. */
export const PRONE: Pose = { bones: { Hips: [88, 0, 0], Spine: [0, 0, 0], Neck: [-6, 0, 0], LeftFoot: [60, 0, 0], RightFoot: [60, 0, 0] }, feet: both(0.11, 0.06, -0.86), kneePoles: bothDir(0, -1, 0), hands: both(0.10, 0.10, 0.42), poles: bothDir(1, 0.2, 0), hipsY: -0.84 };
/** Face down, the arms long overhead on the floor (the superman's start). */
const PRONE_LONG: Pose = { ...PRONE, hands: both(0.20, 0.06, 0.98), poles: bothDir(0.3, 1, 0) };
/** On the right side, the head toward −z and the chest toward +x (the stage's floor camera), the knees bent and stacked,
 *  the head on the bottom arm. The Hips' yaw −90 then roll 90 lays the body down that way (measured on the rig). */
export const SIDE: Pose = { bones: { Hips: [0, -90, 90], Spine: [0, 0, 0], Neck: [0, 0, 0], LeftUpLeg: [-45, 0, 0], RightUpLeg: [-45, 0, 0], LeftLeg: [90, 0, 0], RightLeg: [90, 0, 0] }, hands: { Right: [0.04, 0.06, -0.92], Left: [0.10, 0.36, 0.10] }, poles: { Right: [0, 1, 0], Left: [0.2, 0.4, 1] }, hipsY: -0.78 };
/** Side-lying with the knees bent to right angles and both arms long in front at shoulder height (the open book's start). */
const SIDE_ARMS: Pose = { ...SIDE, bones: { ...SIDE.bones, LeftUpLeg: [-90, 0, 0], RightUpLeg: [-90, 0, 0] }, hands: { Right: [0.46, 0.10, -0.42], Left: [0.46, 0.16, -0.42] }, poles: { Right: [0, 1, 0.2], Left: [0, 1, 0.2] } };
/** Hands and knees, neutral (defined with the targets the moves interpolate). */
export const QUAD_POSE: Pose = { bones: { Hips: [90, 0, 0], Spine: [0, 0, 0], Neck: [-40, 0, 0], LeftFoot: [60, 0, 0], RightFoot: [60, 0, 0] }, ...QUAD_LEGS, hands: QUAD_HANDS, poles: bothDir(0.6, 0.2, -0.5), hipsY: -0.40 };
/** Child's pose (POSITIONS.child). */
export const CHILD: Pose = { bones: { Hips: [96, 0, 0], Spine: [12, 0, 0], Spine1: [6, 0, 0], Neck: [-10, 0, 0], LeftFoot: [60, 0, 0], RightFoot: [60, 0, 0] }, feet: both(0.11, 0.08, -0.10), kneePoles: bothDir(0.1, -0.1, 1), hands: both(0.20, 0.05, 0.80), poles: bothDir(0.3, 0.2, -1), hipsY: -0.63 };
/** Down dog (POSITIONS.dog). */
export const DOG: Pose = { bones: { Hips: [134, 0, 0], Spine: [0, 0, 0], Neck: [-6, 0, 0], LeftFoot: [4, 0, 0], RightFoot: [4, 0, 0] }, feet: both(0.13, ANKLE + 0.05, -0.70), kneePoles: bothDir(0, 0, 1), hands: both(0.22, 0.05, 0.52), poles: bothDir(0.5, 0, -1), hipsY: -0.26, hipsZ: -0.16 };
/** The 90/90 sit, right leg in front (POSITIONS.ninety is it mirrored, left leg in front). */
const NINETY: Pose = { bones: { Hips: [-4, 0, 0], Spine: [0, 0, 0], Neck: [0, 0, 0] }, feet: { Right: [-0.30, 0.08, 0.40], Left: [-0.48, 0.08, -0.40] }, kneePoles: { Right: [0.4, 0.3, 1], Left: [-1, 0.3, 0] }, hands: both(0.32, 0.05, -0.06), poles: bothDir(0.5, 0, -1), hipsY: -0.80 };
/** Sitting with both knees up, the feet flat in front, the hands behind on the floor (the 90/90 switch's middle). */
const SEATED_KNEES_UP: Pose = { bones: { Hips: [-8, 0, 0], Spine: [0, 0, 0], Neck: [0, 0, 0] }, feet: both(0.24, ANKLE, 0.42), kneePoles: bothDir(0.2, 1, 0.6), hands: both(0.26, 0.05, -0.20), poles: bothDir(0.5, 0, -1), hipsY: -0.80 };

/** The same pose on the other side: Left and Right swapped, x negated (a bone's yaw and roll flip, its pitch does not). */
export function mirror(p: Pose): Pose {
  const sw = (n: string) => (n.startsWith('Left') ? `Right${n.slice(4)}` : n.startsWith('Right') ? `Left${n.slice(5)}` : n);
  const pair = (q?: Pair): Pair | undefined => q && { ...(q.Right ? { Left: [-q.Right[0], q.Right[1], q.Right[2]] } : {}), ...(q.Left ? { Right: [-q.Left[0], q.Left[1], q.Left[2]] } : {}) };
  const bones = p.bones && Object.fromEntries(Object.entries(p.bones).map(([n, [x, y, z]]) => [sw(n), [x, -y, -z] as Deg3]));
  return { ...p, bones, hands: pair(p.hands), rel: pair(p.rel), poles: pair(p.poles), feet: pair(p.feet), kneePoles: pair(p.kneePoles), ...(p.hipsX ? { hipsX: -p.hipsX } : {}) };
}

/** Side-lying positions are authored with the body's head toward −z and turned half round about the vertical for the
 *  stage, so the chest faces its floor camera (the rig shots showed the back): targets (x, z) → (−x, −z), the yaw flipped. */
export function turn(p: Pose): Pose {
  const pair = (q?: Pair): Pair | undefined => q && Object.fromEntries(Object.entries(q).map(([k, v]) => [k, [-v[0], v[1], -v[2]]])) as Pair;
  const hips = (p.bones?.Hips ?? [0, 0, 0]) as Deg3;
  return { ...p, bones: { ...p.bones, Hips: [hips[0], -hips[1], hips[2]] }, hands: pair(p.hands), rel: pair(p.rel), poles: pair(p.poles), feet: pair(p.feet), kneePoles: pair(p.kneePoles), ...(p.hipsX ? { hipsX: -p.hipsX } : {}), ...(p.hipsZ ? { hipsZ: -p.hipsZ } : {}) };
}
const SIDE_LYING = new Set(['side', 'openbook', 'clamshell', 'sideraise', 'sideer']);

/** Positions with a front leg are authored right-leg-front and shown LEFT-leg-front: the stage's floor camera looks at the
 *  body's left side, and every one of them leads with the same leg so a flow never swaps legs between two positions. */
const FRONT_LEG = new Set(['spider', 'lizard', 'halfsplit', 'lowlunge', 'kneel', 'couch', 'pigeon', 'ninety', 'shinbox', 'thread']);

/** Each position: one pose (held, breathing) or the poses of the small movement it is named for (looped in order). */
export const POSITIONS: Readonly<Record<string, readonly Pose[]>> = Object.fromEntries(Object.entries({
  // a deep squat held, hands together at the chest
  squat: [{ bones: { Hips: [30, 0, 0], Spine: [10, 0, 0], Spine1: [0, 0, 0], Neck: [-20, 0, 0], LeftFoot: [-36, 0, 0], RightFoot: [-36, 0, 0] }, feet: both(0.20, ANKLE, 0.10), kneePoles: bothDir(0.45, 0, 1), rel: { Left: [0.13, -0.26, 0.30], Right: [-0.13, -0.26, 0.30] }, poles: bothDir(0.25, -1, -0.1), hipsY: -0.47 }],
  // the cossack shift: wide feet, sit over one, the other leg long with its toes up — then the other side
  cossack: (['Right', 'Left'] as const).map((s): Pose => {
    const k = s === 'Right' ? 1 : -1;
    return {
      bones: { Hips: [22, 0, 0], Spine: [8, 0, 0], Neck: [-14, 0, 0], [`${s === 'Right' ? 'Left' : 'Right'}Foot`]: [-30, 0, 0], [`${s}Foot`]: [-18, 0, 0] },
      feet: both(0.44, ANKLE + 0.015, 0.08), kneePoles: { Left: [-0.6, 0, 1], Right: [0.6, 0, 1] }, rel: { Left: [0.13, -0.26, 0.30], Right: [-0.13, -0.26, 0.30] }, poles: bothDir(0.25, -1, -0.1),
      hipsY: -0.42, hipsX: 0.24 * k,
    };
  }),
  // standing forward fold: legs long, hanging heavy
  fold: [{ bones: { Hips: [88, 0, 0], Spine: [14, 0, 0], Spine1: [8, 0, 0], Neck: [10, 0, 0] }, feet: both(0.12, ANKLE, 0.06), kneePoles: bothDir(0, 0, 1), rel: { Left: [0.06, -0.50, 0.02], Right: [-0.06, -0.50, 0.02] }, poles: bothDir(0.3, 0, -1), hipsY: -0.06, hipsZ: -0.10 }],
  // spiderman lunge: from the plank, the right foot outside the right hand, the back leg long, the hips sunk
  spider: [{ bones: { Hips: [58, 0, 0], Spine: [6, 0, 0], Neck: [-30, 0, 0], LeftFoot: [10, 0, 0] }, feet: { Right: [0.34, ANKLE, 0.42], Left: [-0.12, TOE_ANKLE + 0.04, -0.80] }, kneePoles: { Right: [0.7, 0.2, 1], Left: [0, -1, 0.1] }, hands: both(0.20, 0.05, 0.62), poles: bothDir(0.6, 0, -0.7), hipsY: -0.60 }],
  // the frog rock: hands and knees with the knees wide — rock back toward the heels and forward again
  frog: [0, 1].map((u): Pose => ({
    bones: { Hips: [86 + 14 * u, 0, 0], Spine: [0, 0, 0], Neck: [-50, 0, 0], LeftFoot: [64, 0, 0], RightFoot: [64, 0, 0] },
    feet: both(0.42, 0.12, -0.22), kneePoles: bothDir(1, -0.6, 0.3), hands: both(0.18, 0.05, 0.62), poles: bothDir(0.5, 0, -0.8),
    hipsY: -0.58 - 0.06 * u, hipsZ: -0.24 * u,
  })),
  // the inchworm's far end: the long plank the hands walk out to
  inchworm: [HIGH_PLANK],
  // down dog: hands and feet on the floor, the hips high, one long line from the hands to the hips
  dog: [DOG],
  // child's pose: sitting back on the heels, the trunk folded over the thighs, the arms long on the floor
  child: [CHILD],
  // pigeon: the right shin across the front on the floor, the left leg long behind, sitting tall between them
  pigeon: [{ bones: { Hips: [10, 0, 0], Spine: [0, 0, 0], Neck: [-4, 0, 0], LeftFoot: [60, 0, 0] }, feet: { Right: [-0.22, 0.08, 0.32], Left: [-0.14, 0.06, -0.84] }, kneePoles: { Right: [1, 0.3, 0.6], Left: [0, -1, -0.1] }, hands: both(0.30, 0.05, 0.22), poles: bothDir(0.5, 0, -1), hipsY: -0.72 }],
  // half split: back knee down, the front leg straight with its toes up, the hips back, folded over the front leg
  halfsplit: [{ bones: { Hips: [50, 0, 0], Spine: [12, 0, 0], Neck: [-14, 0, 0], LeftFoot: [62, 0, 0], RightFoot: [-30, 0, 0] }, feet: { Right: [0.13, ANKLE, 0.66], Left: [-0.12, 0.08, -0.50] }, kneePoles: { Right: [0, 1, 0.2], Left: [0, -1, 0.1] }, hands: both(0.24, 0.05, 0.40), poles: bothDir(0.5, 0, -1), hipsY: KNEEL_Y, hipsZ: -0.10 }],
  // low lunge reach: back knee down, the front knee over the ankle, the hips sunk forward, the arms up
  lowlunge: [{ bones: { Hips: [-4, 0, 0], Spine: [-6, 0, 0], Neck: [6, 0, 0], LeftFoot: [62, 0, 0], RightFoot: [-10, 0, 0] }, feet: { Right: [0.13, ANKLE, 0.58], Left: [-0.12, 0.10, -0.72] }, kneePoles: { Right: [0.1, 0, 1], Left: [0, -1, 0.1] }, rel: { Left: [0.04, 0.54, 0.04], Right: [-0.04, 0.54, 0.04] }, poles: bothDir(1, 0, 0), hipsY: -0.55, hipsZ: 0.06 }],
  // half-kneeling hip opener: tall from the down knee, the hips shifted forward until the front of the hip opens
  kneel: [{ bones: { Hips: [-4, 0, 0], Spine: [0, 0, 0], Neck: [0, 0, 0], LeftFoot: [62, 0, 0] }, feet: { Right: [0.13, ANKLE, 0.50], Left: [-0.12, 0.08, -0.46] }, kneePoles: { Right: [0.1, 0, 1], Left: [0, -1, 0.1] }, rel: { Left: [0.06, -0.40, 0.02], Right: [-0.06, -0.40, 0.02] }, poles: bothDir(1, 0, -0.3), hipsY: -0.47, hipsZ: 0.10 }],
  // the 90/90 sit: the right leg bent in front, the left bent to the side, sitting tall
  ninety: [NINETY],
  // the shin box rise: from the 90/90 up to tall kneeling on the same two shins, and back down
  shinbox: [
    { bones: { Hips: [-4, 0, 0], Spine: [0, 0, 0], Neck: [0, 0, 0] }, feet: { Right: [-0.30, 0.08, 0.40], Left: [-0.48, 0.08, -0.40] }, kneePoles: { Right: [0.4, 0.3, 1], Left: [-1, 0.3, 0] }, hands: both(0.32, 0.05, -0.06), poles: bothDir(0.5, 0, -1), hipsY: -0.80 },
    { bones: { Hips: [0, 0, 0], Spine: [0, 0, 0], Neck: [0, 0, 0], LeftFoot: [50, 0, 0], RightFoot: [50, 0, 0] }, feet: { Right: [-0.30, 0.10, 0.40], Left: [-0.48, 0.10, -0.40] }, kneePoles: { Right: [0.3, -0.6, 1], Left: [-1, -0.6, 0] }, rel: { Left: [0.0, -0.20, 0.30], Right: [0.0, -0.20, 0.30] }, poles: bothDir(0.4, -1, 0), hipsY: -0.50, hipsX: -0.04, hipsZ: 0.06 },
  ],
  // cat-camel: on hands and knees, the back rounds up toward the ceiling, then sags toward the floor
  catcamel: [
    { bones: { Hips: [80, 0, 0], Spine: [18, 0, 0], Spine1: [16, 0, 0], Neck: [-10, 0, 0], LeftFoot: [60, 0, 0], RightFoot: [60, 0, 0] }, ...QUAD_LEGS, hands: QUAD_HANDS, poles: bothDir(0.6, 0.2, -0.5), hipsY: -0.40 },
    { bones: { Hips: [106, 0, 0], Spine: [-16, 0, 0], Spine1: [-14, 0, 0], Neck: [-50, 0, 0], LeftFoot: [60, 0, 0], RightFoot: [60, 0, 0] }, ...QUAD_LEGS, hands: QUAD_HANDS, poles: bothDir(0.6, 0.2, -0.5), hipsY: -0.40 },
  ],
  // thread the needle: on hands and knees, the right hand slides under the body along the floor, then opens to the ceiling
  thread: [
    { bones: { Hips: [92, 0, 0], Spine: [8, 0, -14], Spine1: [4, 0, -14], Neck: [-30, 0, 0], LeftFoot: [60, 0, 0], RightFoot: [60, 0, 0] }, ...QUAD_LEGS, hands: { Left: [-0.18, 0.05, 0.52], Right: [-0.42, 0.06, 0.32] }, poles: { Left: [-0.6, 0.2, -0.5], Right: [0, 0.6, -0.6] }, hipsY: -0.44 },
    { bones: { Hips: [90, 0, 0], Spine: [0, 0, 16], Spine1: [0, 0, 16], Neck: [-40, 0, 0], LeftFoot: [60, 0, 0], RightFoot: [60, 0, 0] }, ...QUAD_LEGS, hands: { Left: [-0.18, 0.05, 0.52], Right: [0.48, 1.00, 0.34] }, poles: { Left: [-0.6, 0.2, -0.5], Right: [0.4, -0.3, -1] }, hipsY: -0.40 },
  ],
  // bear hold: hands and toes on the floor, the knees an inch up, the back long
  bear: [{ bones: { Hips: [88, 0, 0], Spine: [0, 0, 0], Neck: [-46, 0, 0], LeftFoot: [0, 0, 0], RightFoot: [0, 0, 0] }, feet: both(0.13, TOE_ANKLE + 0.04, -0.36), kneePoles: bothDir(0, -1, 0.3), hands: QUAD_HANDS, poles: bothDir(0.6, 0.2, -0.5), hipsY: -0.36 }],
  // cobra: lying face down, the hands push the chest up, the hips stay on the floor
  cobra: [{ bones: { Hips: [86, 0, 0], Spine: [-38, 0, 0], Spine1: [-26, 0, 0], Neck: [-24, 0, 0], LeftFoot: [60, 0, 0], RightFoot: [60, 0, 0] }, feet: both(0.11, 0.07, -0.86), kneePoles: bothDir(0, -1, 0), hands: both(0.22, 0.05, 0.30), poles: bothDir(0.3, 0, -1), hipsY: -0.82 }],
  // lizard: the spiderman lunge sunk low, the forearms down inside the front foot
  lizard: [{ bones: { Hips: [70, 0, 0], Spine: [8, 0, 0], Neck: [-36, 0, 0], LeftFoot: [10, 0, 0] }, feet: { Right: [0.30, ANKLE, 0.40], Left: [-0.12, TOE_ANKLE + 0.04, -0.82] }, kneePoles: { Right: [0.8, 0.2, 1], Left: [0, -1, 0.1] }, hands: both(0.10, 0.06, 0.60), poles: bothDir(0.2, -1, -0.2), hipsY: -0.70 }],
  // butterfly: sitting tall, the soles together, the knees falling out, the hands on the feet
  butterfly: [{ bones: { Hips: [-2, 0, 0], Spine: [4, 0, 0], Neck: [-4, 0, 0], LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0] }, feet: both(0.07, 0.08, 0.34), kneePoles: bothDir(1, 0.4, 0.2), hands: both(0.09, 0.16, 0.40), poles: bothDir(1, 0, 0), hipsY: -0.80 }],
  // couch stretch: the back knee down against the wall, the back shin up the wall, tall over the front foot
  // ── lying on the back (the bridge's floor pose: knees bent, feet flat), on the front, on the side ──
  supine: [SUPINE],
  // on the back, the hips and knees bent to right angles, the calves level (feet on a wall or a bench)
  supine9090: [{ ...LIE_BACK, bones: { ...LIE_BACK.bones, LeftUpLeg: [-90, 0, 4], RightUpLeg: [-90, 0, -4], LeftLeg: [90, 0, 0], RightLeg: [90, 0, 0] } }],
  // legs up the wall: on the back, the legs straight up
  legsup: [{ ...LIE_BACK, bones: { ...LIE_BACK.bones, LeftUpLeg: [-88, 0, 3], RightUpLeg: [-88, 0, -3], LeftLeg: [2, 0, 0], RightLeg: [2, 0, 0], LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0] } }],
  // both knees hugged to the chest
  kneehug: [{ ...LIE_BACK, bones: { ...LIE_BACK.bones, Neck: [16, 0, 0], LeftUpLeg: [-128, 0, 8], RightUpLeg: [-128, 0, -8], LeftLeg: [130, 0, 0], RightLeg: [130, 0, 0] }, hands: both(0.13, 0.42, -0.02), poles: bothDir(1, 0.2, -0.3) }],
  // one knee hugged to the chest, the other leg long on the floor
  oneknee: [{ ...LIE_BACK, bones: { ...LIE_BACK.bones, Neck: [14, 0, 0], LeftUpLeg: [-125, 0, 4], LeftLeg: [130, 0, 0], RightUpLeg: [-2, 0, 0], RightLeg: [2, 0, 0], RightFoot: [-10, 0, 0] }, hands: both(0.06, 0.40, -0.04), poles: bothDir(1, 0.2, -0.3) }],
  // happy baby: on the back, the knees wide and bent, the hands holding the soles, rocking side to side
  happybaby: [-1, 1].map((k): Pose => ({ ...LIE_BACK, bones: { ...LIE_BACK.bones, Hips: [-86, 0, 6 * k], LeftUpLeg: [-118, 0, 34], RightUpLeg: [-118, 0, -34], LeftLeg: [92, 0, 0], RightLeg: [92, 0, 0], LeftFoot: [-20, 0, 0], RightFoot: [-20, 0, 0] }, hands: both(0.36, 0.56, -0.10), poles: bothDir(1, -0.3, -0.3) })),
  // the supine knee rock / twist: on the back, knees bent together, falling to one side and then the other, the shoulders flat
  kneerock: [1, -1].map((k): Pose => ({ ...SUPINE, bones: { ...SUPINE.bones, Hips: [-86, 0, 0], LeftUpLeg: [-55, 0, 40 * k], RightUpLeg: [-55, 0, 40 * k], LeftLeg: [100, 0, 0], RightLeg: [100, 0, 0] }, feet: undefined, kneePoles: undefined, hands: both(0.62, 0.05, -0.40), poles: bothDir(0, 1, 0) })),
  // figure-4 on the back: the right ankle crossed over the left knee, the hands pulling the left thigh in
  figure4: [{ ...LIE_BACK, bones: { ...LIE_BACK.bones, Neck: [14, 0, 0], LeftUpLeg: [-100, 0, 0], LeftLeg: [90, 0, 0], RightUpLeg: [-80, 0, -50], RightLeg: [110, 0, 0] }, hands: both(0.06, 0.40, 0.02), poles: bothDir(1, 0.2, -0.3) }],
  // the lying hamstring stretch: on the back, the right leg straight up held behind the thigh, the left long on the floor
  lyinghams: [{ ...LIE_BACK, bones: { ...LIE_BACK.bones, Neck: [12, 0, 0], RightUpLeg: [-82, 0, 0], RightLeg: [4, 0, 0], LeftUpLeg: [-2, 0, 0], LeftLeg: [2, 0, 0], LeftFoot: [-10, 0, 0] }, hands: { Right: [0.14, 0.52, 0.02], Left: [0.04, 0.50, 0.02] }, poles: bothDir(1, 0, -0.3) }],
  // lying face down, the forehead on the stacked hands, breathing (crocodile breathing)
  prone: [PRONE],
  // seated on the floor, the legs long, folded forward reaching for the feet
  pike: [{ bones: { Hips: [36, 0, 0], Spine: [16, 0, 0], Spine1: [8, 0, 0], Neck: [6, 0, 0], LeftUpLeg: [-124, 0, 3], RightUpLeg: [-124, 0, -3], LeftLeg: [2, 0, 0], RightLeg: [2, 0, 0], LeftFoot: [-14, 0, 0], RightFoot: [-14, 0, 0] }, hands: both(0.13, 0.14, 0.66), poles: bothDir(0.8, 0, -0.5), hipsY: -0.80 }],
  // the wide straddle: seated, the legs long and wide, reaching forward between them
  straddle: [{ bones: { Hips: [30, 0, 0], Spine: [14, 0, 0], Spine1: [8, 0, 0], Neck: [0, 0, 0], LeftUpLeg: [-118, 0, 38], RightUpLeg: [-118, 0, -38], LeftLeg: [2, 0, 0], RightLeg: [2, 0, 0], LeftFoot: [-14, 0, 0], RightFoot: [-14, 0, 0] }, hands: both(0.18, 0.06, 0.62), poles: bothDir(0.8, 0, -0.5), hipsY: -0.80 }],
  // the 90/90 switch: from the 90/90 one way, the knees swing up over to the 90/90 the other way, and back
  switch: [NINETY, SEATED_KNEES_UP, mirror(NINETY), SEATED_KNEES_UP],
  // the quadruped rock-back: from hands and knees, the hips rock back toward the heels and forward again
  rockback: [QUAD_POSE, { ...QUAD_POSE, bones: { ...QUAD_POSE.bones, Hips: [104, 0, 0], Neck: [-30, 0, 0] }, feet: both(0.12, 0.09, -0.32), hipsY: -0.56, hipsZ: -0.24 }],
  // child's pose with the hands walked over to one side (the side reach), then the other
  childside: [1, -1].map((k): Pose => ({ ...CHILD, bones: { ...CHILD.bones, Spine: [12, 0, 10 * k], Spine1: [6, 0, 10 * k] }, hands: { Left: [-0.06 + 0.34 * k, 0.07, 0.74], Right: [0.30 + 0.34 * k, 0.07, 0.70] }, poles: bothDir(0.2, 0.6, -1) })),
  // the down dog calf pedal: the down dog, one heel then the other pressed toward the floor
  dogpedal: [1, -1].map((k): Pose => ({ ...DOG, feet: { Left: [-0.13, ANKLE + (k > 0 ? 0.02 : 0.12), -0.70], Right: [0.13, ANKLE + (k > 0 ? 0.12 : 0.02), -0.70] }, bones: { ...DOG.bones, LeftFoot: [k > 0 ? -6 : 24, 0, 0], RightFoot: [k > 0 ? 24 : -6, 0, 0] } })),
  // side-lying: on the right side, the knees bent and stacked, the head on the bottom arm (side-lying breathing)
  side: [SIDE],
  // the side-lying windmill / open book: the top arm sweeps from on top of the bottom one over to the floor behind, the chest opening
  openbook: [SIDE_ARMS, { ...SIDE_ARMS, bones: { ...SIDE_ARMS.bones, Spine: [0, -24, 0], Spine1: [0, -20, 0], Neck: [0, -16, 0] }, hands: { ...SIDE_ARMS.hands, Left: [-0.38, 0.24, -0.42] }, poles: { ...SIDE_ARMS.poles, Left: [0, 1, 0] } }],
  // the side-lying clamshell: knees bent and stacked, the top knee opens up toward the ceiling, the feet together
  clamshell: [SIDE, { ...SIDE, bones: { ...SIDE.bones, LeftUpLeg: [-45, 0, 36] } }],
  // the side-lying leg raise: the bottom leg bent, the top leg long, lifted and lowered
  sideraise: [0, 1].map((u): Pose => ({ ...SIDE, bones: { ...SIDE.bones, LeftUpLeg: [-4, 0, 6 + 34 * u], LeftLeg: [2, 0, 0], LeftFoot: [-10, 0, 0] } })),
  // the side-lying external rotation: the top elbow on the ribs, the forearm turns from across the belly up to the ceiling
  sideer: [{ ...SIDE, hands: { ...SIDE.hands, Left: [0.20, 0.20, -0.14] }, poles: { ...SIDE.poles, Left: [-0.3, 0.2, 1] } }, { ...SIDE, hands: { ...SIDE.hands, Left: [0.02, 0.58, -0.16] }, poles: { ...SIDE.poles, Left: [-0.3, 0.2, 1] } }],
  // the superman: lying face down, the arms long overhead and the legs long, both lifted off the floor and lowered
  superman: [PRONE_LONG, { ...PRONE_LONG, bones: { ...PRONE_LONG.bones, Hips: [84, 0, 0], Spine: [-10, 0, 0], Spine1: [-8, 0, 0], Neck: [-14, 0, 0] }, hands: both(0.20, 0.30, 0.98), feet: both(0.12, 0.22, -0.82) }],
  // the side-lying stance for a standing side-lunge hold: sat over the right foot, the left leg long (one side, held)
  sidelunge: [{ bones: { Hips: [22, 0, 0], Spine: [8, 0, 0], Neck: [-14, 0, 0], LeftFoot: [-30, 0, 0], RightFoot: [-18, 0, 0] }, feet: both(0.44, ANKLE + 0.015, 0.08), kneePoles: { Left: [-0.6, 0, 1], Right: [0.6, 0, 1] }, rel: { Left: [0.13, -0.26, 0.30], Right: [-0.13, -0.26, 0.30] }, poles: bothDir(0.25, -1, -0.1), hipsY: -0.42, hipsX: 0.24 }],
  couch: [{ bones: { Hips: [-2, 0, 0], Spine: [0, 0, 0], Neck: [0, 0, 0], LeftFoot: [40, 0, 0] }, feet: { Right: [0.13, ANKLE, 0.46], Left: [-0.12, 0.44, -0.24] }, kneePoles: { Right: [0.1, 0, 1], Left: [0, -1, 0.2] }, rel: { Left: [0.06, -0.40, 0.02], Right: [-0.06, -0.40, 0.02] }, poles: bothDir(1, 0, -0.3), hipsY: -0.45, hipsZ: 0.04 }],
} as Record<string, Pose[]>).map(([n, ps]) => [n, FRONT_LEG.has(n) ? ps.map(mirror) : SIDE_LYING.has(n) ? ps.map(turn) : ps]));

/** A position's loop: its pose breathing (a slow, small lift of the chest), or its movement's poses in turn. */
function positionKeys(name: string, t0: number, slot: number): ExKey[] {
  const ps = POSITIONS[name];
  if (ps.length === 1) return [{ ...ps[0], t: t0, hold: true }, { ...ps[0], t: t0 + slot, hold: true }];
  const step = slot / ps.length;
  return ps.flatMap((p, i) => [{ ...p, t: t0 + i * step, hold: true }, { ...p, t: t0 + i * step + step * 0.55, hold: true }]);
}

/** ex_pos_<name>: the position on its own (its movement looped, or held for a breath). */
function position(scene: Scene, sk: Skeleton, name: string): AnimationGroup | null {
  const ps = POSITIONS[name];
  if (ps.length === 1) {
    const p = ps[0];
    const breathe = (d: number): Pose => ({ ...p, bones: { ...p.bones, Spine1: [((p.bones?.Spine1 ?? [0, 0, 0]) as Deg3)[0] - d, 0, 0] as Deg3 } });
    return loop(scene, sk, `ex_pos_${name}`, 4.0, [{ ...breathe(0), t: 0, hold: true }, { ...breathe(3), t: 2.0, hold: true }], { pivot: true });
  }
  const step = 1.6;
  const keys: ExKey[] = [];
  ps.forEach((p, i) => { keys.push({ ...p, t: i * step, hold: true }, { ...p, t: i * step + 0.7, hold: true }, ...between(p, ps[(i + 1) % ps.length], i * step + 0.7, step - 0.7, 0.02)); });
  return loop(scene, sk, `ex_pos_${name}`, ps.length * step, keys, { pivot: true });
}

/** The move between two positions: the last pose of one to the first of the next, solved half-way too. */
function between(a: Pose, b: Pose, t0: number, dur: number, rise = 0.08): ExKey[] {
  // a foot or a hand that travels more than a step's worth is carried, not slid; and the body rises a little mid-move, so a
  // knee or a toe never cuts the floor while the limbs re-solve from one position to the next
  const lift = (u: number, pa?: Pair, pb?: Pair, pm?: Pair, dy = 0.12): Pair | undefined => {
    if (!pm) return pm;
    const out: Pair = { ...pm };
    for (const s of ['Left', 'Right'] as const) {
      const x = pa?.[s], y = pb?.[s], z = out[s];
      if (x && y && z) out[s] = [z[0], Math.max(z[1], (Math.hypot(x[0] - y[0], x[2] - y[2]) > 0.2 ? Math.max(x[1], y[1]) + dy * Math.sin(Math.PI * u) : z[1])), z[2]];
    }
    return out;
  };
  return [1 / 3, 2 / 3].map((u) => {
    const m = mix(a, b, u);
    return { ...m, feet: lift(u, a.feet, b.feet, m.feet), hands: lift(u, a.hands, b.hands, m.hands, 0.10), hipsY: (m.hipsY ?? 0) + rise * Math.sin(Math.PI * u), t: t0 + dur * u };
  });
}

/** Hands and knees, neutral: the way a body passes between two floor positions that do not join directly (lying face down
 *  to sitting back on the heels goes through it, as a person's does). */
const QUAD: Pose = QUAD_POSE;
/** Moves made through a waypoint: the pair (either order) → the pose passed through on the way. */
const VIA: Readonly<Record<string, Pose>> = {
  'child|cobra': QUAD, 'child|pigeon': QUAD, 'dog|pigeon': QUAD, 'cobra|dog': HIGH_PLANK,
};
const via = (a: string, b: string): Pose | undefined => VIA[`${a}|${b}`] ?? VIA[`${b}|${a}`];

/** A flow through the positions (A → B, or A → B → C → B), each held for its slot, the moves between them. */
export function flow(scene: Scene, sk: Skeleton, name: string, seq: readonly string[]): AnimationGroup | null {
  const order = seq.length > 2 ? [...seq, ...seq.slice(1, -1).reverse()] : [...seq];
  const SLOT = 2.0, MOVE = 1.2;
  const keys: ExKey[] = [];
  let t = 0;
  order.forEach((pos, i) => {
    keys.push(...positionKeys(pos, t, SLOT));
    t += SLOT;
    const next = order[(i + 1) % order.length];
    const a = POSITIONS[pos][POSITIONS[pos].length - 1], b = POSITIONS[next][0];
    const w = via(pos, next);
    if (w) {
      keys.push(...between(a, w, t, MOVE * 0.6), { ...w, t: t + MOVE * 0.6 }, ...between(w, b, t + MOVE * 0.6, MOVE * 0.6));
      t += MOVE * 1.2;
    } else {
      keys.push(...between(a, b, t, MOVE));
      t += MOVE;
    }
  });
  return loop(scene, sk, name, t, keys, { pivot: true });
}

export const POSITION_NAMES = Object.keys(POSITIONS);
type Builder = (scene: Scene, sk: Skeleton) => AnimationGroup | null;
export const FLOOR_BUILDERS: readonly [string, Builder][] = [
  ...POSITION_NAMES.map((p) => [`ex_pos_${p}`, (scene: Scene, sk: Skeleton) => position(scene, sk, p)] as [string, Builder]),
  ...FLOW_SEQS.map((s) => [flowClip(s), (scene: Scene, sk: Skeleton) => flow(scene, sk, flowClip(s), s.split('-'))] as [string, Builder]),
];
