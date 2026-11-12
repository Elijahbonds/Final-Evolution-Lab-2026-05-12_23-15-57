// DEMOS-FIX (2026-11-10): the loops the programs people train from show a still for (docs/every-screen/demos.md, the
// every-screen lane's audit of the session player: the program builder, the signature programs and FEL's coach templates),
// most-used first — each read against its library entry's own setup and cues and, where it has one, its free-exercise-db
// source (scripts/probes/demo-loops/source-text.mjs). Same kit and pipeline as the library's loops: GATE 0 on every body is
// poseGuard.test.ts, the floor and the closed seam exercise.test.ts.
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import { ANKLE, HIGH_PLANK, STAND, TOE_ANKLE, both, bothDir, rep, seat, type Deg3, type ExKey, type Pair, type V3 } from './exerciseKit';
import { run, at, BEAR, FOREARM, SIDE_PLANK, hops, stride } from './exerciseBody';
import { kneel } from './exerciseMore';
import { LIE_BACK, POSITIONS, PRONE, SIDE, turn } from './exerciseFloor';
import { carry, march } from './exerciseAthletic';
import { DOOR_GRIP } from './exerciseWarmup';
import { stepUp } from './exerciseProps';

type Pose = Omit<ExKey, 't'>;
type Side = 'Left' | 'Right';
type Builder = (scene: Scene, sk: Skeleton) => AnimationGroup | null;
const ON_HIPS: Pair = { Left: [0.04, -0.42, 0.08], Right: [-0.04, -0.42, 0.08] };
const HIPS_POLES = bothDir(1, -0.2, 0);
const HANG_REL: Pair = { Left: [-0.03, -0.50, 0.04], Right: [0.03, -0.50, 0.04] };
const HANG_POLES = bothDir(0.2, -0.3, -0.9);
/** The bar across the upper back (exerciseFamilies9.ts BAR). */
const BAR: Pair = { Left: [-0.24, 0.02, -0.10], Right: [0.24, 0.02, -0.10] };
const BAR_POLES = bothDir(0.3, -1, -0.3);
const sx = (s: Side, x: number) => (s === 'Left' ? -x : x);
const other = (s: Side): Side => (s === 'Left' ? 'Right' : 'Left');
/** A held position, breathing: the chest lifts a little and settles. */
const breathe = (p: Pose, d: number): Pose => ({ ...p, bones: { ...p.bones, Spine1: [(((p.bones?.Spine1 ?? [0, 0, 0]) as Deg3)[0]) - d, 0, 0] } });
const hold = (name: string, p: Pose, dur = 3.2, pivot = false): Builder => (scene, sk) => run(scene, sk, name, dur, [at(breathe(p, 0), 0, true), at(breathe(p, 2.5), dur / 2, true)], pivot);

// ── hinges and bridges ────────────────────────────────────────────────────────────────────────────────────────────

/** ex_wall_hinge (Wall Hip Hinge) — standing a foot in front of a wall, facing away (demo.ts PROP_SHAPES wallhinge): the
 *  hips push back until they tap the wall, the hands sliding down the fronts of the thighs, the back long; stand tall. */
const wallHinge: Builder = (scene, sk) => {
  const feet = both(0.12, ANKLE, 0.10);
  const top: Pose = { bones: { ...STAND }, feet, kneePoles: bothDir(0.1, 0, 1), hands: both(0.14, 0.82, 0.10), poles: HANG_POLES, hipsY: 0 };
  const tap: Pose = { bones: { Hips: [56, 0, 0], Spine: [4, 0, 0], Neck: [-26, 0, 0], LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0] }, feet, kneePoles: bothDir(0.1, 0, 1), hands: both(0.12, 0.56, 0.24), poles: bothDir(0.3, 0, -1), hipsY: -0.10, hipsZ: -0.16 };
  return run(scene, sk, 'ex_wall_hinge', 2.8, [at(top, 0, true), at(tap, 1.1, true), at(tap, 1.35, true), at(top, 2.4, true)], true);
};

/** ex_frog_pump — on the back, the soles of the feet together and the knees fallen out wide, the feet close to the seat: the
 *  hips lift by pushing through the outsides of the feet, a beat at the top, and lower. */
const frogPump: Builder = (scene, sk) => {
  const feet: Pair = both(0.06, 0.09, 0.34), knees = bothDir(1, 0.5, 0.2);
  const down: Pose = { bones: { Hips: [-86, 0, 0], Spine: [0, 0, 0], Neck: [10, 0, 0], LeftFoot: [0, 0, -20], RightFoot: [0, 0, 20] }, feet, kneePoles: knees, hands: both(0.30, 0.04, -0.20), poles: bothDir(0.6, 0.3, 0), hipsY: -0.82 };
  const up: Pose = { ...down, bones: { ...down.bones, Hips: [-108, 0, 0], Neck: [26, 0, 0] }, hipsY: -0.68 };
  return rep(scene, sk, 'ex_frog_pump', down, up, 0.7, 0.4, 0.8, 0.3);
};

/** ex_hip_airplane_free (the single-leg hip airplane, no support) — standing on the left leg, bent forward until the trunk
 *  and the free leg are level, the hands hanging: the pelvis turns open toward the wall and back to level, slow. */
const hipAirplaneFree: Builder = (scene, sk) => {
  const p = (open: number): Pose => ({ bones: { Hips: [62, -open * 34, 0], Spine: [2, open * 6, 0], Neck: [-30, 0, 0], RightUpLeg: [-6, 0, 0], RightLeg: [6, 0, 0], RightFoot: [10, 0, 0] }, feet: { Left: [-0.10, ANKLE, 0.06] }, kneePoles: { Left: [0, 0, 1] }, rel: { Left: [0.05, -0.50, 0.02], Right: [-0.05, -0.50, 0.02] }, poles: HANG_POLES, hipsY: -0.08, hipsZ: -0.06 });
  return run(scene, sk, 'ex_hip_airplane_free', 3.0, [at(p(0), 0, true), at(p(1), 1.1, true), at(p(1), 1.5, true), at(p(0), 2.6, true)], true);
};

/** The single-leg bridges the coach templates program (the owner's Playbook ch. 8): one foot down, the other knee pulled toward
 *  the chest, the hips driven up and the top held still for five seconds. ex_bridge_sl_hug: the hands on the floor at the sides.
 *  ex_bridge_sl_load: a loaded backpack across the hips, held there with both hands. */
function bridgeSlKnee(name: string, load: boolean): Builder {
  // (the free foot on a target over the hips and its knee pointed toward the head: keyed by bones, the bridge's tilted pelvis
  // carried the knee past the chest and the shin pointed at the ceiling — the contact sheet showed a leg raised, not hugged)
  const knee: Record<string, Deg3> = { RightFoot: [10, 0, 0] };
  const hands = (y: number, z: number): Pick<Pose, 'hands' | 'poles'> => (load ? { hands: both(0.14, y, z), poles: bothDir(1, 0.4, 0.2) } : { hands: both(0.30, 0.04, -0.20), poles: bothDir(0.6, 0.3, 0) });
  const down: Pose = { bones: { Hips: [-86, 0, 0], Spine: [0, 0, 0], Neck: [10, 0, 0], ...knee }, feet: { Left: [-0.14, ANKLE, 0.50], Right: [0.14, 0.44, 0.16] }, kneePoles: { Left: [-0.1, 1, 0.2], Right: [0.1, 0.5, -1] }, ...hands(0.26, 0.02), hipsY: -0.82 };
  const up: Pose = { ...down, bones: { ...down.bones, Hips: [-116, 0, 0], Neck: [32, 0, 0] }, feet: { Left: [-0.14, ANKLE, 0.50], Right: [0.14, 0.60, 0.22] }, kneePoles: { Left: [-0.1, 1, 0.4], Right: [0.1, 0.5, -1] }, ...hands(0.48, 0.06), hipsY: -0.62 };
  return (scene, sk) => run(scene, sk, name, 7.2, [at(down, 0, true), at(down, 0.4, true), at(up, 1.4, true), at(up, 6.4, true)], true);
}

// ── lunges, split squats, step-ups ────────────────────────────────────────────────────────────────────────────────

/** ex_split_squat_supported — a split stance, the left foot in front, the right hand on a dowel planted beside (demo.ts
 *  PROP_SHAPES dowel) for balance only, the left hand on the hip: the back knee drops straight down and drives back up. */
const splitSquatSupported: Builder = (scene, sk) => {
  const dowel: V3 = [0.42, 0, 0.20];
  const up: Pose = { bones: { Hips: [2, 0, 0], Spine: [0, 0, 0], RightFoot: [-20, 0, 0], LeftFoot: [-2, 0, 0] }, feet: { Left: [-0.13, ANKLE, 0.30], Right: [0.13, ANKLE + 0.05, -0.36] }, kneePoles: { Left: [-0.1, 0, 1], Right: [0, -0.4, 1] }, rel: { Left: ON_HIPS.Left }, handsAt: { Right: [dowel[0], 0.96, dowel[2]] }, poles: { Left: HIPS_POLES.Left, Right: [0.6, -0.6, -0.3] }, hipsY: -0.04 };
  const down: Pose = { ...up, bones: { Hips: [4, 0, 0], Spine: [4, 0, 0], RightFoot: [-6, 0, 0], LeftFoot: [-14, 0, 0] }, feet: { Left: [-0.13, ANKLE, 0.30], Right: [0.13, 0.15, -0.36] }, kneePoles: { Left: [-0.1, 0, 1], Right: [0, -1, 0.3] }, handsAt: { Right: [dowel[0], 0.66, dowel[2]] }, hipsY: -0.40 };
  return rep(scene, sk, 'ex_split_squat_supported', up, down, 1.0, 0.25, 0.9, 0.35);
};

/** The walking lunge: from standing, a long step forward and the back knee drops toward the floor; drive up and bring the back
 *  foot through to stand; the other leg; then walk back to the start. `arms`: the dumbbells hanging, the bar on the back, the
 *  hands on the hips. */
function walkingLunge(name: string, arms: Pose): Builder {
  const L = 0.66;
  const stand = (z: number): Pose => ({ bones: { ...STAND }, feet: both(0.12, ANKLE, z + 0.04), kneePoles: bothDir(0.1, 0, 1), ...arms, hipsY: 0, hipsZ: z });
  const low = (front: Side, z0: number): Pose => {
    const back = other(front);
    return {
      bones: { Hips: [4, 0, 0], Spine: [6, 0, 0], Neck: [-4, 0, 0], [`${front}Foot`]: [-14, 0, 0], [`${back}Foot`]: [-6, 0, 0] } as Record<string, Deg3>,
      feet: { [front]: [sx(front, 0.13), ANKLE, z0 + 0.04 + L], [back]: [sx(back, 0.12), 0.15, z0 + 0.04] } as Pair,
      kneePoles: { [front]: [sx(front, 0.1), 0, 1], [back]: [0, -1, 0.3] } as Pair, ...arms, hipsY: -0.42, hipsZ: z0 + L * 0.5,
    };
  };
  // (as the body starts forward the back heel comes up and its foot flexes, or the toes dip through the floor: measured)
  const go = (front: Side, z0: number): Pose => {
    const back = other(front);
    return {
      bones: { ...STAND, Spine: [2, 0, 0], [`${front}UpLeg`]: [-40, 0, 0], [`${back}Foot`]: [-20, 0, 0] } as Record<string, Deg3>,
      feet: { [front]: [sx(front, 0.13), ANKLE + 0.12, z0 + 0.36], [back]: [sx(back, 0.12), ANKLE + 0.04, z0 + 0.04] } as Pair,
      kneePoles: bothDir(0.1, 0, 1), ...arms, hipsY: -0.06, hipsZ: z0 + 0.14,
    };
  };
  const keys: ExKey[] = [at(stand(0), 0, true)];
  let t = 0, z = 0;
  for (const s of ['Left', 'Right'] as Side[]) {
    keys.push(at(go(s, z), t + 0.35), at(low(s, z), t + 0.75, true), at(low(s, z), t + 1.0, true));
    z += L;
    keys.push(at(stand(z), t + 1.75, true));
    t += 1.75;
  }
  // walk back: four steps
  for (let i = 1; i <= 4; i++) {
    const zz = z * (1 - i / 4);
    keys.push(at(stand(zz), t + i * 0.5, i === 4));
  }
  return (scene, sk) => run(scene, sk, name, t + 2.4, keys);
}

/** ex_side_split_squat_bar (the barbell side split squat) — the bar on the back, the feet wide, the lead foot turned out: the
 *  hips sit down toward the right foot, its knee bending over the toes, the left leg only slightly bent; up; then the left. */
const sideSplitSquatBar: Builder = (scene, sk) => {
  const feet: Pair = { Left: [-0.40, ANKLE, 0.08], Right: [0.40, ANKLE, 0.12] };
  const mid: Pose = { bones: { Hips: [6, 0, 0], Spine: [2, 0, 0], Neck: [-2, 0, 0] }, feet, kneePoles: bothDir(0.5, 0, 1), rel: BAR, poles: BAR_POLES, hipsY: -0.06 };
  const low = (k: 1 | -1): Pose => ({
    bones: { Hips: [26, 0, 0], Spine: [6, 0, 0], Neck: [-14, 0, 0], [k > 0 ? 'RightFoot' : 'LeftFoot']: [-22, 0, 0], [k > 0 ? 'LeftFoot' : 'RightFoot']: [-6, 0, 0] } as Record<string, Deg3>,
    feet, kneePoles: { Left: [-0.6, 0, 1], Right: [0.6, 0, 1] }, rel: BAR, poles: BAR_POLES, hipsY: -0.30, hipsX: 0.20 * k,
  });
  return run(scene, sk, 'ex_side_split_squat_bar', 5.2, [at(mid, 0, true), at(low(1), 1.1, true), at(low(1), 1.4, true), at(mid, 2.4, true), at(mid, 2.6, true), at(low(-1), 3.7, true), at(low(-1), 4.0, true)]);
};

// ── planks ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** ex_plank_incline (the incline plank) — the forearms on a bench (demo.ts PROP_SHAPES handbench), the body one long line
 *  down to the toes; held, breathing. */
const PLANK_INCLINE: Pose = { bones: { Hips: [62, 0, 0], Spine: [0, 0, 0], Neck: [-22, 0, 0], LeftFoot: [22, 0, 0], RightFoot: [22, 0, 0] }, feet: both(0.11, TOE_ANKLE + 0.04, -0.86), kneePoles: bothDir(0, -1, 0.1), handsAt: both(0.10, 0.49, 0.70), poles: bothDir(0.3, -1, -0.3), hipsY: -0.40, hipsZ: -0.04 };
/** The long-lever forearm plank: the elbows a hand further forward than the shoulders. */
const LONG: Pose = { ...FOREARM, bones: { ...FOREARM.bones, Hips: [80, 0, 0], Neck: [-38, 0, 0] }, hands: both(0.10, 0.06, 0.68), hipsY: -0.68 };
/** One limb moves and returns, then the other side's; the rest of the plank still. */
function plankMove(name: string, base: Pose, move: (s: Side) => Pose, dur = 3.2): Builder {
  const q = dur / 4;
  return (scene, sk) => run(scene, sk, name, dur, [at(base, 0, true), at(move('Left'), q, true), at(move('Left'), q * 1.5, true), at(base, 2 * q, true), at(move('Right'), 3 * q, true), at(move('Right'), q * 3.5, true)], true);
}
const footLift = (base: Pose, h: number, z = 0) => (s: Side): Pose => ({ ...base, feet: { [other(s)]: base.feet![other(s)], [s]: [sx(s, 0.13), (base.feet![s] as V3)[1] + h, (base.feet![s] as V3)[2] + z] } as Pair, kneePoles: { [other(s)]: base.kneePoles![other(s)], [s]: [0, -1, -0.2] } as Pair });
const handReach = (base: Pose, y: number, z: number) => (s: Side): Pose => ({ ...base, hands: { [other(s)]: base.hands![other(s)], [s]: [sx(s, 0.14), y, z] } as Pair, poles: { [other(s)]: base.poles![other(s)], [s]: [sx(s, 0.3), -1, 0] } as Pair });
/** The knee draws in along the side toward the same-side elbow (the foot off the floor) and back. */
const kneeIn = (base: Pose) => (s: Side): Pose => ({ ...base, bones: { ...base.bones, Hips: [(((base.bones!.Hips) as Deg3)[0]) - 4, 0, 0] }, feet: { [other(s)]: base.feet![other(s)], [s]: [sx(s, 0.28), 0.26, -0.20] } as Pair, kneePoles: { [other(s)]: base.kneePoles![other(s)], [s]: [sx(s, 0.9), 0.2, 0.6] } as Pair });

/** ex_plank_bird_dog — from a high plank: one hand reaches long to the wall ahead and the other foot to the wall behind, held,
 *  back down; the other pair. */
const plankBirdDog: Builder = (scene, sk) => {
  const base: Pose = { ...HIGH_PLANK, feet: both(0.14, TOE_ANKLE, -0.90) };
  const reach = (arm: Side): Pose => {
    const leg = other(arm);
    return { ...base, bones: { ...base.bones, Spine: [0, 0, sx(arm, -4)] }, hands: { [leg]: base.hands![leg], [arm]: [sx(arm, 0.16), 0.56, 1.06] } as Pair, poles: { [leg]: base.poles![leg], [arm]: [sx(arm, 0.3), -1, 0] } as Pair, feet: { [arm]: base.feet![arm], [leg]: [sx(leg, 0.14), 0.40, -0.98] } as Pair, kneePoles: { [arm]: base.kneePoles![arm], [leg]: [0, -1, -0.2] } as Pair };
  };
  return run(scene, sk, 'ex_plank_bird_dog', 4.0, [at(base, 0, true), at(reach('Right'), 1.0, true), at(reach('Right'), 1.4, true), at(base, 2.0, true), at(reach('Left'), 3.0, true), at(reach('Left'), 3.4, true)], true);
};
/** ex_bird_dog_hover — hands and knees with the knees hovering an inch off the floor (the bear hold): the opposite arm and leg
 *  reach long and hold, the rest still; the other pair. */
const birdDogHover: Builder = (scene, sk) => {
  const reach = (arm: Side): Pose => {
    const leg = other(arm);
    return { ...BEAR, bones: { ...BEAR.bones, [`${leg}Foot`]: [20, 0, 0] } as Record<string, Deg3>, hands: { [leg]: BEAR.hands![leg], [arm]: [sx(arm, 0.16), 0.50, 1.02] } as Pair, poles: { [leg]: BEAR.poles![leg], [arm]: [sx(arm, 0.3), -1, 0] } as Pair, feet: { [arm]: BEAR.feet![arm], [leg]: [sx(leg, 0.14), 0.46, -0.86] } as Pair, kneePoles: { [arm]: BEAR.kneePoles![arm], [leg]: [0, -1, -0.2] } as Pair };
  };
  return run(scene, sk, 'ex_bird_dog_hover', 4.0, [at(BEAR, 0, true), at(reach('Right'), 1.0, true), at(reach('Right'), 1.5, true), at(BEAR, 2.0, true), at(reach('Left'), 3.0, true), at(reach('Left'), 3.5, true)], true);
};
/** ex_reverse_plank_leg — face up, the hands on the floor under the shoulders, the heels on the floor, the body one long line:
 *  one foot lifts an inch and holds, down; the other. */
const REVERSE_PLANK: Pose = { bones: { Hips: [-62, 0, 0], Spine: [0, 0, 0], Neck: [16, 0, 0], LeftLeg: [2, 0, 0], RightLeg: [2, 0, 0], LeftFoot: [-30, 0, 0], RightFoot: [-30, 0, 0] }, feet: both(0.12, 0.08, 1.02), kneePoles: bothDir(0, 1, 0), hands: both(0.22, 0.05, -0.18), poles: bothDir(0.3, 0, -1), hipsY: -0.62 };

/** The dead bug's base (exercise.ts ex_dead_bug): on the back, the knees over the hips. */
const DB_LEGS: Record<string, Deg3> = { LeftUpLeg: [-90, 0, 4], RightUpLeg: [-90, 0, -4], LeftLeg: [90, 0, 0], RightLeg: [90, 0, 0] };
const legLong = (s: Side): Record<string, Deg3> => ({ [`${s}UpLeg`]: [-14, 0, 0], [`${s}Leg`]: [8, 0, 0] });
/** ex_dead_bug_legs / ex_dead_bug_wall — on the back, the knees over the hips: the legs take turns reaching long toward the
 *  floor, slow, the arms on the floor at the sides (legs only) or overhead pressing a wall behind the head (demo.ts
 *  PROP_SHAPES wallhead). */
function deadBugLegs(name: string, hands: Pair, poles: Pair): Builder {
  const base: Pose = { ...LIE_BACK, bones: { ...LIE_BACK.bones, ...DB_LEGS }, hands, poles, hipsY: -0.86 };
  const reach = (s: Side): Pose => ({ ...base, bones: { ...base.bones, ...legLong(s) } });
  return (scene, sk) => run(scene, sk, name, 3.2, [at(base, 0, true), at(reach('Left'), 0.8, true), at(base, 1.6, true), at(reach('Right'), 2.4, true)], true);
}
/** ex_dead_bug_press — on the back, the knees over the hips, a light bell at the chest in one hand: it presses up to the ceiling
 *  as the other side's leg reaches long toward the floor; both back; the other hand. */
const deadBugPress: Builder = (scene, sk) => {
  const chest = (s: Side): V3 => [sx(s, 0.14), 0.36, -0.30], up = (s: Side): V3 => [sx(s, 0.18), 1.40, -0.40];
  const base = (s: Side): Pose => ({ ...LIE_BACK, bones: { ...LIE_BACK.bones, ...DB_LEGS }, hands: { [s]: chest(s), [other(s)]: [sx(other(s), 0.30), 0.04, -0.20] } as Pair, poles: bothDir(0.8, 0.3, 0), hipsY: -0.86 });
  const press = (s: Side): Pose => ({ ...base(s), bones: { ...LIE_BACK.bones, ...DB_LEGS, ...legLong(other(s)) }, hands: { [s]: up(s), [other(s)]: [sx(other(s), 0.30), 0.04, -0.20] } as Pair });
  const swap = (from: Side): Pose => ({ ...base(from), hands: { [from]: chest(from), [other(from)]: chest(other(from)) } as Pair });
  return run(scene, sk, 'ex_dead_bug_press', 5.6, [at(base('Right'), 0, true), at(press('Right'), 0.9, true), at(press('Right'), 1.3, true), at(base('Right'), 2.2, true), at(swap('Right'), 2.8, true),
    at(base('Left'), 3.0, true), at(press('Left'), 3.9, true), at(press('Left'), 4.3, true), at(base('Left'), 5.0, true), at(swap('Left'), 5.3, true)], true);
};

/** ex_bear_lateral (the lateral bear crawl) — on hands and feet, the knees hovering a fist off the floor, the back flat: small
 *  steps sideways, a hand and the same-side foot then the other pair, three to the right and three back. */
const bearLateral: Builder = (scene, sk) => {
  const S = 0.16;
  const at3 = (x: number): Pose => ({ ...BEAR, hands: { Left: [-0.18 + x, 0.05, 0.52], Right: [0.18 + x, 0.05, 0.52] }, feet: { Left: [-0.14 + x, TOE_ANKLE + 0.04, -0.36], Right: [0.14 + x, TOE_ANKLE + 0.04, -0.36] }, hipsX: x });
  const keys: ExKey[] = [];
  let t = 0, x = 0;
  for (const d of [1, 1, 1, -1, -1, -1] as const) {
    const lead: Side = d > 0 ? 'Right' : 'Left', trail = other(lead);
    // the lead hand and foot step out (the hips half-way), then the trail pair follows
    const half: Pose = { ...BEAR, hands: { [lead]: [sx(lead, 0.18) + x + d * S, 0.05, 0.52], [trail]: [sx(trail, 0.18) + x, 0.05, 0.52] } as Pair, feet: { [lead]: [sx(lead, 0.14) + x + d * S, TOE_ANKLE + 0.04, -0.36], [trail]: [sx(trail, 0.14) + x, TOE_ANKLE + 0.04, -0.36] } as Pair, hipsX: x + (d * S) / 2 };
    keys.push(at(at3(x), t, true), at(half, t + 0.35, true));
    x += d * S; t += 0.7;
  }
  return run(scene, sk, 'ex_bear_lateral', t, keys, true);
};

// ── push-ups ──────────────────────────────────────────────────────────────────────────────────────────────────────

const PU_FEET = both(0.11, TOE_ANKLE, -0.90), PU_KNEES = bothDir(0, -1, 0.1);
const PU_TOP: Pose = { bones: { Hips: [70, 0, 0], Spine: [0, 0, 0], Neck: [-30, 0, 0], LeftFoot: [8, 0, 0], RightFoot: [8, 0, 0] }, feet: PU_FEET, kneePoles: PU_KNEES, hands: both(0.24, 0.05, 0.44), poles: bothDir(0.6, 0.2, -0.7), hipsY: -0.58 };
const PU_LOW: Pose = { ...PU_TOP, bones: { ...PU_TOP.bones, Hips: [84, 0, 0], Neck: [-40, 0, 0] }, hands: both(0.26, 0.05, 0.44), poles: bothDir(0.7, 0.4, -0.5), hipsY: -0.80 };
/** ex_pushup_staggered — one hand a little ahead of the other, the body one long line: down and up; the hands swap. */
const pushupStaggered: Builder = (scene, sk) => {
  const st = (lead: Side, p: Pose): Pose => ({ ...p, hands: { [lead]: [sx(lead, 0.25), 0.05, 0.58], [other(lead)]: [sx(other(lead), 0.25), 0.05, 0.30] } as Pair });
  return run(scene, sk, 'ex_pushup_staggered', 4.4, [at(st('Left', PU_TOP), 0, true), at(st('Left', PU_LOW), 0.9, true), at(st('Left', PU_LOW), 1.05, true), at(st('Left', PU_TOP), 1.9, true),
    at(st('Right', PU_TOP), 2.2, true), at(st('Right', PU_LOW), 3.1, true), at(st('Right', PU_LOW), 3.25, true), at(st('Right', PU_TOP), 4.1, true)], true);
};
/** ex_pushup_one_arm (the single-arm push-up) — the feet wide, the right hand under the shoulder, the left hand behind the back:
 *  down as one line, and up. */
const pushupOneArm: Builder = (scene, sk) => {
  const feet = both(0.34, TOE_ANKLE, -0.90);
  const top: Pose = { ...PU_TOP, bones: { ...PU_TOP.bones, Hips: [70, 0, -6], Spine: [0, 0, -4] }, feet, hands: { Right: [0.14, 0.05, 0.44], Left: [0.02, 0.50, 0.06] }, poles: { Right: [0.6, 0.2, -0.7], Left: [-0.6, 0.6, -0.4] } };
  // (the free hand rests on the low back: a target above the pelvis, lower as the body lowers)
  const low: Pose = { ...top, bones: { ...PU_LOW.bones, Hips: [80, 0, -8], Spine: [0, 0, -4] }, hands: { Right: [0.14, 0.05, 0.44], Left: [0.02, 0.34, 0.06] }, poles: { Right: [0.7, 0.4, -0.5], Left: [-0.6, 0.6, -0.4] }, hipsY: -0.74 };
  return rep(scene, sk, 'ex_pushup_one_arm', top, low, 1.1, 0.15, 0.9, 0.35);
};
/** ex_pushup_eccentric — from the top of a push-up, the body lowers to the floor over a slow five-count as one line; the knees
 *  come down and the arms press up from the knees, then the feet go back to the plank. */
const pushupEccentric: Builder = (scene, sk) => {
  const floor: Pose = { ...PU_LOW, hipsY: -0.84 };
  const kneesDown: Pose = { bones: { Hips: [66, 0, 0], Spine: [0, 0, 0], Neck: [-36, 0, 0], LeftFoot: [40, 0, 0], RightFoot: [40, 0, 0] }, feet: both(0.11, 0.16, -0.72), kneePoles: bothDir(0, -1, 0.3), hands: both(0.26, 0.05, 0.44), poles: bothDir(0.7, 0.4, -0.5), hipsY: -0.68 };
  const kneesUp: Pose = { ...kneesDown, bones: { ...kneesDown.bones, Hips: [52, 0, 0], Neck: [-28, 0, 0] }, hands: both(0.24, 0.05, 0.44), poles: bothDir(0.6, 0.2, -0.7), hipsY: -0.58 };
  return run(scene, sk, 'ex_pushup_eccentric', 6.0, [at(PU_TOP, 0, true), at(floor, 2.6, true), at(kneesDown, 3.2, true), at(kneesUp, 4.0, true), at(kneesUp, 4.4, true), at(PU_TOP, 5.3, true)], true);
};

// ── the shoulders face down ───────────────────────────────────────────────────────────────────────────────────────

const proneArms = (hands: Pair, poles: Pair, lift: number): Pose => ({ ...PRONE, bones: { ...PRONE.bones, Neck: [-6 - lift * 6, 0, 0] }, hands: Object.fromEntries(Object.entries(hands).map(([s, v]) => [s, [v[0], v[1] + lift, v[2]]])) as Pair, poles });
const Y_HANDS = both(0.40, 0.05, 0.94), Y_POLES = bothDir(0.3, 1, 0.3);
const W_HANDS = both(0.36, 0.05, 0.40), W_POLES = bothDir(1, 0.2, -0.6);
const T_HANDS = both(0.72, 0.05, 0.30), T_POLES = bothDir(0.2, 1, 0.2);
/** ex_prone_y / ex_prone_w — face down, the arms overhead in a Y with the thumbs up (or the elbows bent and tucked into a W):
 *  the hands (and elbows) lift off the floor, held a beat, and lower. */
const proneLift = (name: string, hands: Pair, poles: Pair, h: number): Builder => (scene, sk) => run(scene, sk, name, 2.4, [at(proneArms(hands, poles, 0), 0, true), at(proneArms(hands, poles, h), 0.7, true), at(proneArms(hands, poles, h), 1.5, true)], true);
/** ex_prone_yt (the prone Y-T raise) — face down: the arms lift in a Y, lower; then out in a T, lift, lower: one rep. */
const proneYT: Builder = (scene, sk) => run(scene, sk, 'ex_prone_yt', 4.8, [
  at(proneArms(Y_HANDS, Y_POLES, 0), 0, true), at(proneArms(Y_HANDS, Y_POLES, 0.12), 0.7, true), at(proneArms(Y_HANDS, Y_POLES, 0.12), 1.3, true), at(proneArms(Y_HANDS, Y_POLES, 0), 1.9, true),
  at(proneArms(T_HANDS, T_POLES, 0), 2.5, true), at(proneArms(T_HANDS, T_POLES, 0.12), 3.1, true), at(proneArms(T_HANDS, T_POLES, 0.12), 3.7, true), at(proneArms(T_HANDS, T_POLES, 0), 4.2, true),
], true);

// ── rows and pulls ────────────────────────────────────────────────────────────────────────────────────────────────

/** ex_gorilla_row — a wide stance, bent forward at the hips, two bells on the floor between the feet: one bell rows to the
 *  ribs while the other hand pushes its bell into the floor; down; the other side. */
const gorillaRow: Builder = (scene, sk) => {
  const feet = both(0.32, ANKLE, 0.12);
  const base: Record<string, Deg3> = { Hips: [62, 0, 0], Spine: [4, 0, 0], Neck: [-30, 0, 0], LeftFoot: [-16, 0, 0], RightFoot: [-16, 0, 0] };
  const bells: Pair = both(0.14, 0.18, 0.22);
  const p = (s: Side | null): Pose => ({
    bones: s ? { ...base, Spine: [4, sx(s, 8), 0] } : base, feet, kneePoles: bothDir(0.5, 0, 1),
    hands: s ? { [other(s)]: bells[other(s)] } as Pair : bells, ...(s ? { rel: { [s]: [sx(s, -0.02), -0.26, -0.18] } as Pair } : {}),
    poles: s ? { [other(s)]: [sx(other(s), 0.4), 0, -1], [s]: [sx(s, 0.3), 0.6, -0.8] } as Pair : bothDir(0.4, 0, -1), hipsY: -0.30, hipsZ: -0.04,
  });
  return run(scene, sk, 'ex_gorilla_row', 3.6, [at(p(null), 0, true), at(p('Right'), 0.7, true), at(p('Right'), 0.95, true), at(p(null), 1.8, true), at(p('Left'), 2.5, true), at(p('Left'), 2.75, true)], true);
};

/** ex_inverted_row_feet_up — under a hip-high bar with the heels up on a bench (demo.ts PROP_SHAPES lowbarfeet), the body one
 *  straight plank: the chest pulls to the bar, a beat, and lowers. */
const invertedRowFeetUp: Builder = (scene, sk) => {
  const legs = { LeftFoot: [-24, 0, 0] as Deg3, RightFoot: [-24, 0, 0] as Deg3 };
  const p = (hips: number, hy: number, poles: Pair): Pose => ({ bones: { Hips: [hips, 0, 0], Spine: [0, 0, 0], Neck: [12, 0, 0], ...legs }, feet: both(0.12, 0.53, 0.98), kneePoles: bothDir(0, 1, 0), handsAt: both(0.26, 0.98, -0.36), poles, hipsY: hy, hipsZ: 0.08 });
  return run(scene, sk, 'ex_inverted_row_feet_up', 2.6, [at(p(-86, -0.50, bothDir(0.6, -0.6, 0.5)), 0, true), at(p(-82, -0.30, bothDir(0.6, -1, 0.4)), 0.9, true), at(p(-82, -0.30, bothDir(0.6, -1, 0.4)), 1.2, true)], true);
};

const BAR_Y = 2.20;   // (exerciseProps.ts: the pull-up bar, demo.ts PROP_SHAPES pullbar)
/** ex_pullup_eccentric (the eccentric pull-up) — from the top, the chin over the bar: the body lowers to a dead hang over a slow
 *  five-count; then a step back up to the top. */
const pullupEccentric: Builder = (scene, sk) => {
  const legs: Record<string, Deg3> = { LeftUpLeg: [-10, 0, 2], RightUpLeg: [-10, 0, -2], LeftLeg: [22, 0, 0], RightLeg: [22, 0, 0], LeftFoot: [20, 0, 0], RightFoot: [20, 0, 0] };
  const p = (hy: number, bones: Record<string, Deg3> = {}): Pose => ({ bones: { Hips: [0, 0, 0], Spine: [0, 0, 0], Neck: [0, 0, 0], ...legs, ...bones }, handsAt: both(0.26, BAR_Y - 0.02, 0.02), poles: bothDir(1, -0.4, 0), hipsY: hy });
  const top = p(0.62, { Spine: [-6, 0, 0], Neck: [-10, 0, 0] });
  return run(scene, sk, 'ex_pullup_eccentric', 5.0, [at(top, 0, true), at(top, 0.4, true), at(p(0.44), 2.2), at(p(0.26), 3.6, true), at(p(0.26), 4.0, true)]);
};

/** ex_door_row_one (the single-arm door frame row) — one hand on the frame (demo.ts PROP_SHAPES doorway), the feet in, leaning
 *  back on a straight arm: the chest pulls straight toward the frame without the body turning toward the free arm; lower slow. */
const doorRowOne: Builder = (scene, sk) => {
  const feet = both(0.13, ANKLE, 0.30);
  const lean: Pose = { bones: { Hips: [-14, 0, 0], Spine: [0, 0, 0], Neck: [10, 0, 0], LeftLeg: [4, 0, 0], RightLeg: [4, 0, 0], LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0] }, feet, kneePoles: bothDir(0.05, 0, 1), handsAt: { Right: DOOR_GRIP.Right }, rel: { Left: ON_HIPS.Left }, poles: { Right: [0.6, -0.8, 0], Left: HIPS_POLES.Left }, hipsY: -0.05, hipsZ: -0.20 };
  const pulled: Pose = { ...lean, bones: { ...lean.bones, Hips: [-6, 0, 0], Neck: [4, 0, 0], LeftFoot: [-4, 0, 0], RightFoot: [-4, 0, 0] }, poles: { Right: [0.8, -0.4, -0.4], Left: HIPS_POLES.Left }, hipsY: -0.02, hipsZ: -0.02 };
  return rep(scene, sk, 'ex_door_row_one', lean, pulled, 0.6, 0.2, 1.2, 0.5);
};

/** ex_pulldown_hk_one (the half-kneeling single-arm pulldown) — half-kneeling at a cable, the right knee down, one handle
 *  overhead in the right hand: the elbow pulls down toward the back pocket, and the arm goes back up long; the left hand on
 *  the hip. */
const pulldownHkOne: Builder = (scene, sk) => {
  const a: Pose = kneel({ bones: { Hips: [-4, 0, 0], Spine: [0, 0, 0], Neck: [4, 0, 0] }, rel: { Right: [0.06, 0.52, 0.10], Left: ON_HIPS.Left }, poles: { Right: [1, -0.2, 0], Left: HIPS_POLES.Left }, hipsY: 0 }, ['Right']);
  const b: Pose = kneel({ bones: { Hips: [-6, 0, 0], Spine: [0, 0, 0], Neck: [2, 0, 0] }, rel: { Right: [0.02, -0.06, -0.04], Left: ON_HIPS.Left }, poles: { Right: [0.6, -1, -0.4], Left: HIPS_POLES.Left }, hipsY: 0 }, ['Right']);
  return rep(scene, sk, 'ex_pulldown_hk_one', a, b, 0.8, 0.3, 1.0, 0.3);
};

/** ex_landmine_press_hk (the half-kneeling landmine press) — half-kneeling facing the bar's end, the right knee down and the
 *  bar end at the right shoulder: pressed up and away along its arc until the arm is long, and lowered back to the shoulder. */
const landminePressHk: Builder = (scene, sk) => {
  const a: Pose = kneel({ bones: { Hips: [-2, 0, 0], Spine: [0, 0, 0], Neck: [0, 0, 0] }, rel: { Right: [0.10, -0.04, 0.16], Left: ON_HIPS.Left }, poles: { Right: [0.4, -1, 0.1], Left: HIPS_POLES.Left }, hipsY: 0 }, ['Right']);
  const b: Pose = kneel({ bones: { Hips: [2, 0, 0], Spine: [2, 0, 0], Neck: [0, 0, 0] }, rel: { Right: [0.10, 0.38, 0.46], Left: ON_HIPS.Left }, poles: { Right: [0.6, -0.6, 0], Left: HIPS_POLES.Left }, hipsY: 0 }, ['Right']);
  return rep(scene, sk, 'ex_landmine_press_hk', a, b, 0.8, 0.2, 1.0, 0.35);
};

// ── carries and holds ─────────────────────────────────────────────────────────────────────────────────────────────

const ARMS_SIDES: Pose = { hands: both(0.27, 0.80, 0.02), poles: bothDir(0.3, -0.2, -0.9) };
/** A bell held at the chest by the horns, the elbows in and down (the goblet). */
const ARMS_GOBLET: Pose = { rel: { Left: [0.15, -0.22, 0.24], Right: [-0.15, -0.22, 0.24] }, poles: bothDir(0.25, -1, -0.1) };
/** A loaded bag hugged high on the chest: the forearms wrapped round it, the hands reaching to its far sides. */
const ARMS_HUG: Pose = { rel: { Left: [0.24, -0.16, 0.30], Right: [-0.24, -0.14, 0.32] }, poles: bothDir(0.8, -0.6, 0) };
const TALL = (arms: Pose): Pose => ({ bones: { ...STAND, Spine: [0, 0, 0] }, feet: both(0.12, ANKLE, 0.04), kneePoles: bothDir(0.1, 0, 1), ...arms, hipsY: -0.01 });

// ── locomotion in place ───────────────────────────────────────────────────────────────────────────────────────────

/** ex_quick_feet — tall on the balls of the feet: fast, light steps on the spot, the feet barely leaving the floor, the arms
 *  pumping small. */
const quickFeet: Builder = (scene, sk) => {
  const step = (s: Side): Pose => ({
    bones: { Hips: [8, 0, 0], Spine: [4, 0, 0], Neck: [-4, 0, 0], [`${s}UpLeg`]: [-30, 0, 0], [`${s}Leg`]: [56, 0, 0], [`${s}Foot`]: [0, 0, 0], [`${other(s)}Foot`]: [18, 0, 0] } as Record<string, Deg3>,
    feet: { [other(s)]: [sx(other(s), 0.14), ANKLE + 0.06, 0.06] } as Pair, kneePoles: bothDir(0.1, 0, 1),
    rel: { [other(s)]: [sx(other(s), -0.02), -0.20, 0.22], [s]: [sx(s, 0.0), -0.36, -0.10] } as Pair, poles: bothDir(0.2, -1, 0), hipsY: -0.03,
  });
  return run(scene, sk, 'ex_quick_feet', 0.4, [at(step('Left'), 0), at(step('Right'), 0.2)]);
};

/** ex_dot_drill — on the balls of the feet over five dots (four corners and a centre, the stage draws none): two-foot hops
 *  centre → front-left → front-right → centre → back-left → back-right, quick and light. */
const dotDrill: Builder = (scene, sk) => hops(scene, sk, 'ex_dot_drill', [[0, 0], [-0.18, 0.18], [0.18, 0.18], [0, 0], [-0.18, -0.18], [0.18, -0.18]], false, 0.08, 2.4);

/** ex_line_steps (line quick steps) — facing a line on the floor: quick, light steps over it and back, one foot after the other. */
const lineSteps: Builder = (scene, sk) => {
  const stepAt = (lz: number, rz: number, lift: Side | null): Pose => ({
    bones: { Hips: [8, 0, 0], Spine: [4, 0, 0], Neck: [-4, 0, 0], LeftFoot: [lift === 'Left' ? 16 : -4, 0, 0], RightFoot: [lift === 'Right' ? 16 : -4, 0, 0] },
    feet: { Left: [-0.13, ANKLE + (lift === 'Left' ? 0.08 : 0.02), lz], Right: [0.13, ANKLE + (lift === 'Right' ? 0.08 : 0.02), rz] }, kneePoles: bothDir(0.1, 0, 1),
    rel: { Left: [0.0, -0.30, 0.16], Right: [0.0, -0.30, 0.16] }, poles: bothDir(0.2, -1, 0), hipsY: -0.08, hipsZ: (lz + rz) / 2 - 0.04,
  });
  const B = -0.06, F = 0.22;
  return run(scene, sk, 'ex_line_steps', 1.2, [at(stepAt(B, B, null), 0), at(stepAt((B + F) / 2, B, 'Left'), 0.15), at(stepAt(F, B, null), 0.3), at(stepAt(F, (B + F) / 2, 'Right'), 0.45), at(stepAt(F, F, null), 0.6),
    at(stepAt((B + F) / 2, F, 'Left'), 0.75), at(stepAt(B, F, null), 0.9), at(stepAt(B, (B + F) / 2, 'Right'), 1.05)]);
};


// ── side planks (authored as exerciseBody's: on the right forearm, the head toward −z, the chest toward +x; turned to face the
// floor camera) ─────────────────────────────────────────────────────────────────────────────────────────────────────

const SP = SIDE_PLANK;
/** Side-lying on the right side, the legs long and stacked (exerciseFloor.ts SIDE with the knees straight). */
const SIDE_LYING_BASE: Pose = { ...SIDE, bones: { ...SIDE.bones, LeftUpLeg: [-6, 0, 0], RightUpLeg: [-6, 0, 0], LeftLeg: [4, 0, 0], RightLeg: [4, 0, 0] } };
/** ex_side_plank_short — on the right forearm with the knees bent behind, the hips lifted from the knees to the shoulders in a
 *  line; held, breathing. */
const SIDE_SHORT: Pose = { ...SP, bones: { ...SP.bones, LeftUpLeg: [0, 0, 0], RightUpLeg: [0, 0, 0], LeftLeg: [90, 0, 0], RightLeg: [90, 0, 0], LeftFoot: [20, 0, 0], RightFoot: [20, 0, 0] }, feet: undefined, kneePoles: undefined, hipsY: -0.60 };
/** ex_side_plank_dip — the side plank: the hips lower toward the floor and lift back up, slow. */
const sideDip: Builder = (scene, sk) => run(scene, sk, 'ex_side_plank_dip', 2.8, [at(turn(SP), 0, true), at(turn({ ...SP, bones: { ...SP.bones, Spine: [0, 0, -4], Spine1: [0, 0, -2] }, hipsY: -0.66 }), 1.1, true), at(turn({ ...SP, bones: { ...SP.bones, Spine: [0, 0, -4], Spine1: [0, 0, -2] }, hipsY: -0.66 }), 1.4, true)], true);
/** ex_side_plank_reach_through — the side plank: the top hand reaches down and under the body toward the wall behind, the
 *  chest turning to the floor, then opens back up to the ceiling. */
const sideReachThrough: Builder = (scene, sk) => {
  const under: Pose = { ...SP, bones: { ...SP.bones, Spine: [0, 22, -14], Spine1: [0, 14, -10], Neck: [0, 10, -4] }, hands: { Right: SP.hands!.Right, Left: [-0.34, 0.22, -0.44] }, poles: { Right: SP.poles!.Right, Left: [1, 0.4, 0] } };
  return run(scene, sk, 'ex_side_plank_reach_through', 3.2, [at(turn(SP), 0, true), at(turn(under), 1.2, true), at(turn(under), 1.5, true), at(turn(SP), 2.7, true)], true);
};
/** ex_side_plank_arm_reach — the side plank on the forearm: the top hand reaches long toward the wall beyond the head and holds,
 *  the body still; back to the ceiling. */
const sideArmReach: Builder = (scene, sk) => {
  const reach: Pose = { ...SP, hands: { Right: SP.hands!.Right, Left: [0.04, 0.44, -1.00] }, poles: { Right: SP.poles!.Right, Left: [0.2, 1, 0] } };
  return run(scene, sk, 'ex_side_plank_arm_reach', 3.2, [at(turn(SP), 0, true), at(turn(reach), 1.0, true), at(turn(reach), 2.0, true)], true);
};

// ── mobility: lift-offs and the loaded and moving positions ───────────────────────────────────────────────────────

/** A position (exerciseFloor.ts POSITIONS: the front-leg ones shown left leg in front, so the back leg is the right) with
 *  the back leg lifted an inch and held, then lowered slow. */
function liftOff(name: string, pos: string, lift: (p: Pose) => Pose): Builder {
  const p = POSITIONS[pos][0];
  return (scene, sk) => run(scene, sk, name, 4.4, [at(p, 0, true), at(p, 0.6, true), at(lift(p), 1.4, true), at(lift(p), 3.0, true), at(p, 3.9, true)], true);
}
const raiseFoot = (s: Side, dy: number) => (p: Pose): Pose => ({ ...p, feet: { ...p.feet, [s]: [(p.feet![s] as V3)[0], (p.feet![s] as V3)[1] + dy, (p.feet![s] as V3)[2]] } as Pair });

/** ex_goblet_reach (the goblet deep squat hold with reach) — sitting in a deep squat, a light bell at the chest: the bell
 *  presses out toward the wall ahead and comes back, the heels down. */
const gobletReach: Builder = (scene, sk) => {
  const sq = POSITIONS.squat[0];
  const out: Pose = { ...sq, rel: { Left: [0.10, -0.12, 0.54], Right: [-0.10, -0.12, 0.54] }, poles: bothDir(0.3, -1, 0) };
  return run(scene, sk, 'ex_goblet_reach', 4.4, [at(sq, 0, true), at(sq, 0.8, true), at(out, 1.8, true), at(out, 2.6, true), at(sq, 3.6, true)], true);
};

/** Tall kneeling with the down shins on targets (exerciseFamilies9.ts kneelIK): the pelvis can turn and the knees stay put. */
const kneelTall = (p: Pose): Pose => {
  const k = kneel(p, ['Left', 'Right']);
  return { ...k, bones: { ...k.bones, LeftFoot: [62, 0, 0], RightFoot: [62, 0, 0] }, feet: { Left: [-0.11, 0.07, -0.38], Right: [0.11, 0.07, -0.38] }, kneePoles: bothDir(0.05, -0.3, 1) };
};
/** ex_tk_hip_rotation (tall-kneeling hip rotation) — kneeling tall, the hands on the hips: the belt line turns to one wall and
 *  back, then the other, the knees still on the floor. */
const tkHipRotation: Builder = (scene, sk) => {
  const p = (yaw: number): Pose => kneelTall({ bones: { Hips: [0, yaw, 0], Spine: [0, -yaw * 0.3, 0], Neck: [0, -yaw * 0.3, 0] }, rel: ON_HIPS, poles: HIPS_POLES, hipsY: 0 });
  return run(scene, sk, 'ex_tk_hip_rotation', 4.0, [at(p(0), 0, true), at(p(24), 1.0, true), at(p(0), 2.0, true), at(p(-24), 3.0, true)], true);
};

/** ex_spinal_wave — standing tall, the hands on the thighs: a slow wave rolls down from the head to the belt line — the chin,
 *  then the upper back, then the low back curling — and back up from the belt line to the head. */
const spinalWave: Builder = (scene, sk) => {
  const p = (neck: number, s1: number, s0: number, hips: number, handY: number): Pose => ({ bones: { Hips: [hips, 0, 0], Spine: [s0, 0, 0], Spine1: [s1, 0, 0], Neck: [neck, 0, 0] }, feet: both(0.12, ANKLE, 0.06), kneePoles: bothDir(0.1, 0, 1), hands: both(0.14, handY, 0.14), poles: HANG_POLES, hipsY: hips > 6 ? -0.03 : 0 });
  return run(scene, sk, 'ex_spinal_wave', 5.2, [at(p(0, 0, 0, 0, 0.84), 0, true), at(p(26, 0, 0, 0, 0.84), 0.8), at(p(28, 20, 0, 0, 0.80), 1.5), at(p(28, 22, 16, 10, 0.70), 2.3, true),
    at(p(20, 18, 4, 4, 0.76), 3.0), at(p(14, 4, -6, 0, 0.82), 3.7), at(p(-6, -4, -2, 0, 0.84), 4.4)]);
};

/** ex_snow_angel_floor (the floor snow angel) — face up, the legs long, the arms out on the floor at the sides: the backs of the
 *  hands slide along the floor up overhead and back down, slow. */
const snowAngelFloor: Builder = (scene, sk) => {
  const legs: Record<string, Deg3> = { LeftUpLeg: [0, 0, 0], RightUpLeg: [0, 0, 0], LeftLeg: [2, 0, 0], RightLeg: [2, 0, 0], LeftFoot: [30, 0, 0], RightFoot: [30, 0, 0] };
  const p = (hands: Pair): Pose => ({ ...LIE_BACK, bones: { ...LIE_BACK.bones, ...legs }, hands, poles: bothDir(0, 1, 0.2) });
  return run(scene, sk, 'ex_snow_angel_floor', 4.8, [at(p(both(0.40, 0.05, 0.02)), 0, true), at(p(both(0.70, 0.05, -0.46)), 1.2), at(p(both(0.30, 0.06, -1.00)), 2.2, true), at(p(both(0.70, 0.05, -0.46)), 3.4)], true);
};

/** ex_knee_hug_walk (the walking knee hug) — a step, and one knee hugged up to the chest standing tall on the other foot; step
 *  on; the other knee; four, then walk back. */
const kneeHugWalk: Builder = (scene, sk) => {
  const stand = (z: number): Pose => ({ bones: { ...STAND }, feet: both(0.12, ANKLE, z + 0.04), kneePoles: bothDir(0.1, 0, 1), rel: HANG_REL, poles: HANG_POLES, hipsY: 0, hipsZ: z });
  const hug = (s: Side, z: number): Pose => {
    const st = other(s);
    return { bones: { ...STAND, [`${s}UpLeg`]: [-112, 0, 0], [`${s}Leg`]: [118, 0, 0], [`${s}Foot`]: [20, 0, 0] } as Record<string, Deg3>, feet: { [st]: [sx(st, 0.10), ANKLE, z + 0.04] } as Pair, kneePoles: { [st]: [sx(st, 0.1), 0, 1] } as Pair, rel: { Left: [0.08, -0.46, 0.38], Right: [-0.08, -0.46, 0.38] }, poles: bothDir(0.8, -0.6, -0.2), hipsY: 0.01, hipsZ: z };
  };
  const D = 0.40, keys: ExKey[] = [at(stand(0), 0, true)];
  let t = 0, z = 0;
  for (const s of ['Left', 'Right', 'Left', 'Right'] as Side[]) { z += D; keys.push(at(hug(s, z - D / 2), t + 0.7, true), at(hug(s, z - D / 2), t + 1.4, true), at(stand(z), t + 2.0, true)); t += 2.0; }
  for (let i = 1; i <= 4; i++) keys.push(at(stand(z * (1 - i / 4)), t + i * 0.5, i === 4));
  return run(scene, sk, 'ex_knee_hug_walk', t + 2.4, keys);
};

/** ex_thoracic_circle_seat (the seated controlled thoracic circle) — sitting tall on a bench, the hands on the thighs: the
 *  ribcage draws the biggest slow circle it can — forward, to the side, back, the other side — the belt line still. */
const thoracicCircleSeat: Builder = (scene, sk) => {
  const p = (x: number, z: number): Pose => seat({ bones: { Spine: [x, 0, z], Spine1: [x * 0.8, 0, z * 0.8], Neck: [-x * 0.5, 0, -z * 0.5] }, hands: both(0.16, 0.56, 0.30), poles: bothDir(0.4, -0.6, -0.6) });
  return run(scene, sk, 'ex_thoracic_circle_seat', 6.4, [at(p(14, 0), 0), at(p(0, 14), 1.6), at(p(-10, 0), 3.2), at(p(0, -14), 4.8)]);
};

/** ex_kb_hike_pass (the kettlebell hike pass) — the bell a foot in front, the hips pushed back and the hands on the handle: the
 *  bell is hiked back between the legs and set down in front again; stand, reset, again. */
const kbHikePass: Builder = (scene, sk) => {
  const feet = both(0.20, ANKLE, 0.10);
  const hinge = (hands: Pair, poles: Pair): Pose => ({ bones: { Hips: [60, 0, 0], Spine: [4, 0, 0], Neck: [-30, 0, 0], LeftFoot: [-12, 0, 0], RightFoot: [-12, 0, 0] }, feet, kneePoles: bothDir(0.2, 0, 1), hands, poles, hipsY: -0.16 });
  const front = hinge(both(0.05, 0.22, 0.42), bothDir(0.3, 0, -1)), back = hinge(both(0.05, 0.46, -0.20), bothDir(0.2, 0, -1));
  const top: Pose = { bones: { ...STAND }, feet, kneePoles: bothDir(0.2, 0, 1), rel: HANG_REL, poles: HANG_POLES, hipsY: 0 };
  return run(scene, sk, 'ex_kb_hike_pass', 3.6, [at(top, 0, true), at(front, 0.9, true), at(back, 1.35), at(front, 1.9, true), at(front, 2.2, true), at(top, 3.0, true)], true);
};

/** ex_back_ext_45 (the 45-degree back extension) — the hips on the pad of a 45-degree bench, the feet anchored, the arms crossed
 *  on the chest (demo.ts PROP_SHAPES hyper45): the trunk lowers toward the floor slowly, folding at the hips, then lifts back
 *  to one straight line with the legs. */
const backExt45: Builder = (scene, sk) => {
  const crossed: Pair = { Left: [0.30, 0.04, 0.12], Right: [-0.30, 0.06, 0.14] }, poles = bothDir(-0.2, -0.3, 1);
  const legs = { feet: both(0.12, 0.24, -0.58), kneePoles: bothDir(0, -1, 0.4) };
  const top: Pose = { bones: { Hips: [44, 0, 0], Spine: [0, 0, 0], Neck: [-10, 0, 0], LeftFoot: [-20, 0, 0], RightFoot: [-20, 0, 0] }, ...legs, rel: crossed, poles, hipsY: -0.22, hipsZ: 0.02 };
  const low: Pose = { ...top, bones: { ...top.bones, Hips: [104, 0, 0], Neck: [-20, 0, 0] }, hipsY: -0.26, hipsZ: -0.02 };
  return run(scene, sk, 'ex_back_ext_45', 3.4, [at(top, 0, true), at(low, 1.4, true), at(low, 1.7, true), at(top, 2.8, true)], true);
};

/** The sprint drills in place (exerciseBody.ts stride: one foot on its ball, the opposite arm driving). ex_ankling: tiny,
 *  springy steps, the ankle rolling over from the ball of the foot, the knee barely bending. ex_straight_leg_run: the legs stay
 *  stiff, a quick short pull under the hips. ex_fast_leg: two easy steps, then the third leg cycles fast — the heel up under
 *  the seat and the foot struck down under the hip. */
const ankling: Builder = (scene, sk) => run(scene, sk, 'ex_ankling', 0.6, [
  at(stride('Left', { LeftUpLeg: [-12, 0, 0], LeftLeg: [22, 0, 0], LeftFoot: [-12, 0, 0] }, 0.01), 0), at(stride('Right', { RightUpLeg: [-12, 0, 0], RightLeg: [22, 0, 0], RightFoot: [-12, 0, 0] }, 0.01), 0.3)]);
const straightLegRun: Builder = (scene, sk) => run(scene, sk, 'ex_straight_leg_run', 0.7, [
  at(stride('Left', { LeftUpLeg: [-44, 0, 0], LeftLeg: [4, 0, 0], LeftFoot: [-14, 0, 0] }, 0.04), 0), at(stride('Right', { RightUpLeg: [-44, 0, 0], RightLeg: [4, 0, 0], RightFoot: [-14, 0, 0] }, 0.04), 0.35)]);
const fastLeg: Builder = (scene, sk) => {
  const easy = (s: Side) => stride(s, { [`${s}UpLeg`]: [-30, 0, 0], [`${s}Leg`]: [50, 0, 0], [`${s}Foot`]: [6, 0, 0] }, 0.03);
  const cycle = (s: Side) => stride(s, { [`${s}UpLeg`]: [-60, 0, 0], [`${s}Leg`]: [128, 0, 0], [`${s}Foot`]: [30, 0, 0] }, 0.04);
  return run(scene, sk, 'ex_fast_leg', 2.1, [at(easy('Left'), 0), at(easy('Right'), 0.35), at(cycle('Left'), 0.6), at(easy('Right'), 1.05), at(easy('Left'), 1.4), at(cycle('Right'), 1.65)]);
};


// ── machines, the roller, the Copenhagen, the pass-through ────────────────────────────────────────────────────────

/** ex_leg_press — seated in the 45-degree leg press, the back flat on its pad and the hands on the handles (demo.ts
 *  PROP_SHAPES legpress: the seat and the back pad; the sled is not drawn): the knees bend toward the chest as far as the back
 *  stays flat on the pad, and the feet push the platform away through the whole foot. */
const legPress: Builder = (scene, sk) => {
  const base: Pose = { bones: { Hips: [-48, 0, 0], Spine: [0, 0, 0], Neck: [26, 0, 0], LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0] }, kneePoles: bothDir(0.3, 1, 0.6), hands: both(0.30, 0.40, -0.02), poles: bothDir(0.6, -0.4, 0), hipsY: -0.56 };
  const out: Pose = { ...base, feet: both(0.15, 0.82, 0.70) }, bent: Pose = { ...base, feet: both(0.16, 0.66, 0.40) };
  return rep(scene, sk, 'ex_leg_press', out, bent, 1.1, 0.2, 0.9, 0.35);
};
/** ex_hack_squat — in the hack squat, the back flat against the inclined pad, the feet hip-width a little in front, the hands on
 *  the handles at the shoulders (demo.ts PROP_SHAPES hackpad): down to the depth the back stays flat on the pad, the knees out
 *  over the laces, and drive back up. */
const hackSquat: Builder = (scene, sk) => {
  const feet = both(0.15, ANKLE, 0.30), hands: Pair = { Left: [0.02, 0.02, 0.06], Right: [-0.02, 0.02, 0.06] };
  const top: Pose = { bones: { Hips: [-14, 0, 0], Spine: [0, 0, 0], Neck: [12, 0, 0] }, feet, kneePoles: bothDir(0.35, 0, 1), rel: hands, poles: bothDir(0.5, -1, 0), hipsY: -0.04, hipsZ: -0.02 };
  const low: Pose = { ...top, bones: { ...top.bones, Hips: [-10, 0, 0], LeftFoot: [-30, 0, 0], RightFoot: [-30, 0, 0] }, hipsY: -0.46, hipsZ: -0.18 };
  return rep(scene, sk, 'ex_hack_squat', top, low, 1.1, 0.2, 0.9, 0.35);
};
/** ex_lat_smr — lying on the right side, the roller under the back of the armpit (demo.ts PROP_SHAPES rollerlat), the bottom arm
 *  long overhead, the top hand on the floor in front: the weight eases onto the roller, the body rocking a little up and down
 *  the side of the back. */
const latSmr: Builder = (scene, sk) => {
  const p = (dz: number): Pose => turn({ ...SIDE_LYING_BASE, hands: { Right: [0.04, 0.10, -0.94 + dz], Left: [0.34, 0.05, -0.30 + dz] }, poles: { Right: [0, 1, 0], Left: [0.3, 1, 0] }, hipsY: -0.64, hipsZ: dz });
  return run(scene, sk, 'ex_lat_smr', 3.6, [at(p(-0.05), 0, true), at(p(0.05), 1.7, true)], true);
};
/** ex_copenhagen_long (the long-lever Copenhagen plank) — on the right forearm, the top foot on a bench (demo.ts PROP_SHAPES
 *  cphlong), the bottom leg hanging under it: the hips lift into one line with the shoulders and hold, breathing. */
const COPENHAGEN_LONG: Pose = { ...SIDE_PLANK, bones: { ...SIDE_PLANK.bones, LeftLeg: [2, 0, 0], RightLeg: [10, 0, 0] }, feet: { Left: [-0.02, 0.52, 0.86], Right: [0.06, 0.16, 0.78] }, kneePoles: { Left: [1, 0, 0], Right: [1, 0, 0.2] }, hipsY: -0.50 };
/** ex_lunge_pass (the lunge pass-through) — a kettlebell in the right hand: the left foot steps forward into a lunge and the
 *  bell passes under the front thigh to the left hand; push back to standing; the right foot steps forward and the bell passes
 *  back. */
const lungePass: Builder = (scene, sk) => {
  const stand = (bell: Side): Pose => ({ bones: { ...STAND }, feet: both(0.12, ANKLE, 0.04), kneePoles: bothDir(0.1, 0, 1), hands: { [bell]: [sx(bell, 0.26), 0.80, 0.04], [other(bell)]: [sx(other(bell), 0.24), 0.84, 0.06] } as Pair, poles: HANG_POLES, hipsY: 0 });
  const low = (front: Side): Pose => {
    const back = other(front);
    return {
      bones: { Hips: [26, 0, 0], Spine: [14, 0, 0], Neck: [-14, 0, 0], [`${front}Foot`]: [-14, 0, 0], [`${back}Foot`]: [-6, 0, 0] } as Record<string, Deg3>,
      feet: { [front]: [sx(front, 0.13), ANKLE, 0.66], [back]: [sx(back, 0.12), 0.15, 0.04] } as Pair, kneePoles: { [front]: [sx(front, 0.1), 0, 1], [back]: [0, -1, 0.3] } as Pair,
      // (both hands meet under the front thigh: the outside hand from beside the knee, the inside one between the legs)
      hands: { [front]: [sx(front, 0.30), 0.24, 0.52], [back]: [sx(front, 0.0), 0.24, 0.50] } as Pair, poles: bothDir(0.5, -0.4, -0.4), hipsY: -0.42, hipsZ: 0.32,
    };
  };
  // (half-way down and up, the front foot already planted and the back heel half up: straight between standing and the
  // bottom the back toes dipped through the floor, measured)
  const half = (front: Side): Pose => { const l = low(front), back = other(front); return { ...l, bones: { ...l.bones, Hips: [8, 0, 0], Spine: [4, 0, 0], [`${back}Foot`]: [-18, 0, 0] } as Record<string, Deg3>, feet: { ...l.feet, [back]: [sx(back, 0.12), 0.12, 0.04] } as Pair, hipsY: -0.18, hipsZ: 0.22 }; };
  return run(scene, sk, 'ex_lunge_pass', 5.2, [at(stand('Right'), 0, true), at(half('Left'), 0.6), at(low('Left'), 0.95, true), at(low('Left'), 1.3, true), at(half('Left'), 1.7), at(stand('Left'), 2.2, true), at(stand('Left'), 2.6, true),
    at(half('Right'), 3.2), at(low('Right'), 3.55, true), at(low('Right'), 3.9, true), at(half('Right'), 4.3), at(stand('Right'), 4.8, true)]);
};
/** ex_hip_rot_liftoff_seat (the seated hip rotation lift-off) — sitting tall on a bench, the right shin turned out (the foot
 *  out to the side, the knee where it was): the foot lifts an inch toward the far wall and holds, the knee still; lower slow. */
const hipRotLiftoffSeat: Builder = (scene, sk) => {
  const p = (lift: number): Pose => seat({ feet: { Left: [-0.19, ANKLE, 0.48], Right: [0.46 + lift * 0.03, ANKLE + lift * 0.04, 0.42] }, kneePoles: { Left: [-0.1, 0.3, 1], Right: [0, 0.3, 1] }, hands: both(0.24, 0.50, 0.02), poles: bothDir(0.2, -0.3, -0.9) });
  return run(scene, sk, 'ex_hip_rot_liftoff_seat', 4.4, [at(p(0), 0, true), at(p(0), 0.6, true), at(p(1), 1.4, true), at(p(1), 3.0, true), at(p(0), 3.9, true)]);
};


/** ex_rollout_knees (the ab rollout on the knees) — kneeling, the hands on the bar on the floor under the shoulders: the bar
 *  rolls forward and the body lengthens toward one straight line from the knees, only as far as the line holds, a second's
 *  pause, and the bar is pulled back to the start with the arms long. */
const rolloutKnees: Builder = (scene, sk) => {
  const legs = { feet: both(0.12, 0.09, -0.42), kneePoles: bothDir(0, -1, 0.1) };
  const start: Pose = { bones: { Hips: [80, 0, 0], Spine: [6, 0, 0], Neck: [-34, 0, 0], LeftFoot: [60, 0, 0], RightFoot: [60, 0, 0] }, ...legs, hands: both(0.20, 0.08, 0.44), poles: bothDir(0.3, 0.6, -0.6), hipsY: -0.42, hipsZ: -0.02 };
  const out: Pose = { bones: { Hips: [100, 0, 0], Spine: [2, 0, 0], Neck: [-24, 0, 0], LeftFoot: [60, 0, 0], RightFoot: [60, 0, 0] }, ...legs, hands: both(0.20, 0.08, 1.06), poles: bothDir(0.3, 1, 0), hipsY: -0.56, hipsZ: 0.10 };
  return run(scene, sk, 'ex_rollout_knees', 3.4, [at(start, 0, true), at(start, 0.3, true), at(out, 1.5, true), at(out, 1.9, true), at(start, 3.0, true)], true);
};
/** ex_jefferson_curl (the loaded Jefferson curl) — standing on a box (demo.ts PROP_SHAPES stepbox) with a very light bell hanging
 *  in the hands, the knees straight but soft: the body rolls down one segment at a time — the chin, the upper back, the low
 *  back, then the hips — toward the floor below the box, and rolls back up the same way. */
const jeffersonCurl: Builder = (scene, sk) => {
  const top = 0.40;
  const p = (neck: number, s1: number, s0: number, hips: number, dz: number): Pose => ({ bones: { Hips: [hips, 0, 0], Spine: [s0, 0, 0], Spine1: [s1, 0, 0], Neck: [neck, 0, 0], LeftLeg: [6, 0, 0], RightLeg: [6, 0, 0] }, feet: both(0.10, ANKLE + top, 0.02), kneePoles: bothDir(0.05, 0, 1), rel: { Left: [0.05, -0.52, 0.04], Right: [-0.05, -0.52, 0.04] }, poles: HANG_POLES, hipsY: top - (hips > 20 ? 0.04 : 0), hipsZ: dz });
  return run(scene, sk, 'ex_jefferson_curl', 6.8, [at(p(0, 0, 0, 0, 0), 0, true), at(p(30, 0, 0, 0, 0), 0.8), at(p(32, 26, 0, 0, 0), 1.6), at(p(32, 28, 26, 14, -0.03), 2.4), at(p(32, 30, 34, 80, -0.14), 3.2, true), at(p(32, 30, 34, 80, -0.14), 3.8, true),
    at(p(32, 28, 26, 14, -0.03), 4.6), at(p(32, 26, 0, 0, 0), 5.3), at(p(24, 0, 0, 0, 0), 6.0)]);
};

export const FAMILY11_BUILDERS: readonly [string, Builder][] = [
  ['ex_wall_hinge', wallHinge], ['ex_frog_pump', frogPump], ['ex_hip_airplane_free', hipAirplaneFree],
  ['ex_bridge_sl_hug', bridgeSlKnee('ex_bridge_sl_hug', false)], ['ex_bridge_sl_load', bridgeSlKnee('ex_bridge_sl_load', true)],
  ['ex_split_squat_supported', splitSquatSupported],
  ['ex_walking_lunge', walkingLunge('ex_walking_lunge', { rel: HANG_REL, poles: HANG_POLES })],
  ['ex_walking_lunge_bar', walkingLunge('ex_walking_lunge_bar', { rel: BAR, poles: BAR_POLES })],
  ['ex_walking_lunge_bw', walkingLunge('ex_walking_lunge_bw', { rel: ON_HIPS, poles: HIPS_POLES })],
  ['ex_side_split_squat_bar', sideSplitSquatBar],
  ['ex_step_up_bar', (scene, sk) => stepUp(scene, sk, 'ex_step_up_bar', false, { rel: BAR, poles: BAR_POLES })],
  ['ex_plank_incline', hold('ex_plank_incline', PLANK_INCLINE, 3.2, true)],
  ['ex_plank_long', hold('ex_plank_long', LONG, 3.2, true)],
  ['ex_plank_long_leg', plankMove('ex_plank_long_leg', LONG, footLift(LONG, 0.06))],
  ['ex_plank_long_reach', plankMove('ex_plank_long_reach', LONG, handReach(LONG, 0.40, 1.02))],
  ['ex_plank_long_knee', plankMove('ex_plank_long_knee', LONG, kneeIn(LONG))],
  ['ex_plank_bird_dog', plankBirdDog], ['ex_bird_dog_hover', birdDogHover],
  ['ex_reverse_plank_leg', plankMove('ex_reverse_plank_leg', REVERSE_PLANK, (s) => ({ ...footLift(REVERSE_PLANK, 0.06)(s), kneePoles: { [other(s)]: REVERSE_PLANK.kneePoles![other(s)], [s]: [0, 1, 0] } as Pair }))],
  ['ex_dead_bug_legs', deadBugLegs('ex_dead_bug_legs', both(0.30, 0.04, -0.20), bothDir(0.6, 0.3, 0))],
  ['ex_dead_bug_wall', deadBugLegs('ex_dead_bug_wall', both(0.18, 0.10, -1.04), bothDir(0.4, 1, 0))],
  ['ex_dead_bug_press', deadBugPress], ['ex_bear_lateral', bearLateral],
  ['ex_pushup_staggered', pushupStaggered], ['ex_pushup_one_arm', pushupOneArm], ['ex_pushup_eccentric', pushupEccentric],
  ['ex_prone_y', proneLift('ex_prone_y', Y_HANDS, Y_POLES, 0.12)], ['ex_prone_w', proneLift('ex_prone_w', W_HANDS, W_POLES, 0.10)], ['ex_prone_yt', proneYT],
  ['ex_gorilla_row', gorillaRow], ['ex_inverted_row_feet_up', invertedRowFeetUp], ['ex_pullup_eccentric', pullupEccentric],
  ['ex_door_row_one', doorRowOne], ['ex_pulldown_hk_one', pulldownHkOne], ['ex_landmine_press_hk', landminePressHk],
  ['ex_hold_farmer', hold('ex_hold_farmer', TALL(ARMS_SIDES))], ['ex_hold_goblet', hold('ex_hold_goblet', TALL(ARMS_GOBLET))], ['ex_hold_hug', hold('ex_hold_hug', TALL(ARMS_HUG))],
  ['ex_carry_goblet', (scene, sk) => carry(scene, sk, 'ex_carry_goblet', ARMS_GOBLET)], ['ex_carry_hug', (scene, sk) => carry(scene, sk, 'ex_carry_hug', ARMS_HUG)],
  ['ex_march_hug', (scene, sk) => march(scene, sk, 'ex_march_hug', ARMS_HUG)],
  ['ex_quick_feet', quickFeet], ['ex_dot_drill', dotDrill], ['ex_line_steps', lineSteps],
  ['ex_side_plank_short', hold('ex_side_plank_short', turn(SIDE_SHORT), 3.2, true)], ['ex_side_plank_dip', sideDip], ['ex_side_plank_reach_through', sideReachThrough], ['ex_side_plank_arm_reach', sideArmReach],
  ['ex_couch_liftoff', liftOff('ex_couch_liftoff', 'couch', (p) => ({ ...p, hipsY: (p.hipsY ?? 0) + 0.04 }))],
  ['ex_pigeon_liftoff', liftOff('ex_pigeon_liftoff', 'pigeon', raiseFoot('Right', 0.06))],
  ['ex_ninety_liftoff', liftOff('ex_ninety_liftoff', 'ninety', raiseFoot('Right', 0.05))],
  ['ex_goblet_reach', gobletReach], ['ex_tk_hip_rotation', tkHipRotation], ['ex_spinal_wave', spinalWave], ['ex_snow_angel_floor', snowAngelFloor],
  ['ex_knee_hug_walk', kneeHugWalk], ['ex_thoracic_circle_seat', thoracicCircleSeat], ['ex_kb_hike_pass', kbHikePass], ['ex_back_ext_45', backExt45],
  ['ex_ankling', ankling], ['ex_straight_leg_run', straightLegRun], ['ex_fast_leg', fastLeg],
  ['ex_leg_press', legPress], ['ex_hack_squat', hackSquat], ['ex_lat_smr', latSmr], ['ex_copenhagen_long', hold('ex_copenhagen_long', turn(COPENHAGEN_LONG), 3.2, true)], ['ex_lunge_pass', lungePass], ['ex_hip_rot_liftoff_seat', hipRotLiftoffSeat],
  ['ex_rollout_knees', rolloutKnees], ['ex_jefferson_curl', jeffersonCurl],
];
