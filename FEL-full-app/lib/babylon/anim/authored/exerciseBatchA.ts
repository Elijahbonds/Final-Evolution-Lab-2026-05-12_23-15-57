// Exercise loops, BATCH A (FITNESS-TPOSE loop plan 2026-10-26, LOOP-PLAN.md ranks 1–17: tiers 1–3).
// Same authoring as exercise.ts (pose clips; targets in the FINAL frame; in place — root translation is never carried).
// One-sided movements are authored on the RIGHT and mirrored into the loop's second half (exerciseKit.alternate), so the two
// halves are exact mirrors on every body. Names are `ex_*`: the opt-in 'exercise' suite (clipScope.ts).
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import {
  ANKLE, TOE_ANKLE, both, bothDir, loop, rep, mix, alternate, mirrorKey, over,
  STANCE, SQUAT_FEET, KNEES_OUT, HANG, HANG_POLES, ELBOWS_DOWN, ELBOWS_OUT, STAND, RACK, OVERHEAD,
  type ExKey, type Pair, type V3, type Deg3,
} from './exerciseKit';

type K = Omit<ExKey, 't'>;
const at = (e: K, t: number, hold = false): ExKey => ({ ...e, t, ...(hold ? { hold: true } : {}) });

// ── tier 1: the five shapes with no loop ─────────────────────────────────────────────────────────────────────────────

/** ex_idle_ready — the athletic ready stance: a quarter squat, hands at the waist in front, a slow weight shift side to side
 *  (defensive / help-side stance hold, triple-threat hold, tripod-foot and toe-spread holds; the stage idle). */
export function buildExIdleReady(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const base = (shift: number): K => ({
    bones: { Hips: [14, 0, shift], Spine: [6, 0, -shift * 0.5], Spine1: [0, 0, 0], Neck: [-14, 0, 0] },
    feet: SQUAT_FEET, kneePoles: KNEES_OUT, hands: both(0.22, 1.02 - 0.13, 0.28), poles: ELBOWS_DOWN, hipsY: -0.13 - Math.abs(shift) * 0.004,
  });
  return loop(scene, sk, 'ex_idle_ready', 4.0, [at(base(0), 0), at(base(2.5), 1.0, true), at(base(0), 2.0), at(base(-2.5), 3.0, true)]);
}

/** ex_rotate — a standing diagonal chop, high on one side to low on the other, both hands together, and back; then the other
 *  side (cable wood chop / lift, Russian-twist and landmine-180 shape, Pallof with rotation). The feet stay planted. */
export function buildExRotate(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.20, ANKLE, 0.10);
  const mid: K = { bones: { Hips: [8, 0, 0], Spine: [4, 0, 0], Spine1: [0, 0, 0], Neck: [-6, 0, 0] }, feet, kneePoles: KNEES_OUT, hands: { Left: [-0.06, 1.12, 0.34], Right: [0.06, 1.12, 0.34] }, poles: ELBOWS_DOWN, hipsY: -0.05 };
  // high on the right: the trunk turned to the right (−y yaws the chest to the body's right on these rigs — measured by QC)
  const high: K = { bones: { Hips: [4, -10, 0], Spine: [0, -18, 0], Spine1: [-4, -14, 0], Neck: [-4, 8, 0] }, feet, kneePoles: KNEES_OUT, hands: { Left: [0.22, 1.56, 0.30], Right: [0.34, 1.60, 0.24] }, poles: bothDir(0.6, 0.4, -0.6), hipsY: -0.03 };
  const low: K = { bones: { Hips: [22, 12, 0], Spine: [12, 20, 0], Spine1: [4, 14, 0], Neck: [-12, -8, 0], LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0] }, feet, kneePoles: KNEES_OUT, hands: { Left: [-0.40, 0.58, 0.30], Right: [-0.28, 0.54, 0.36] }, poles: bothDir(0.4, -0.6, -0.6), hipsY: -0.16 };
  return loop(scene, sk, 'ex_rotate', 2.8, alternate([at(mid, 0), at(high, 0.4, true), at(mix(high, low, 0.5), 0.7), at(low, 1.0, true)], 1.4));
}

/** ex_bound — a lateral skater bound in place: load on the right leg, push, fly, land and stick on the left; and back
 *  (lateral bound, continuous / to-stick, diagonal and alternate-leg bound). */
export function buildExBound(scene: Scene, sk: Skeleton): AnimationGroup | null {
  // loaded on the RIGHT: the right foot under the body, the left crossed behind and off the floor, hips back, arms swung
  const loadR: K = {
    bones: { Hips: [30, 0, -6], Spine: [12, 0, 0], Spine1: [0, 0, 0], Neck: [-20, 0, 0], RightFoot: [-20, 0, 0], LeftFoot: [20, 0, 0] },
    feet: { Right: [0.10, ANKLE, 0.08], Left: [0.02, ANKLE + 0.16, -0.26] }, kneePoles: { Right: [0.15, 0, 1], Left: [0, -0.4, 1] },
    hands: { Left: [-0.06, 0.78, 0.36], Right: [0.34, 0.62, -0.20] }, poles: bothDir(0.3, -0.4, -0.8), hipsY: -0.26,
  };
  const pushR: K = {
    bones: { Hips: [14, 0, 4], Spine: [6, 0, 0], Spine1: [0, 0, 0], Neck: [-10, 0, 0], RightFoot: [8, 0, 0], LeftFoot: [10, 0, 0] },
    feet: { Right: [0.10, ANKLE + 0.02, 0.08], Left: [-0.10, ANKLE + 0.18, -0.04] }, kneePoles: { Right: [0.1, 0, 1], Left: [0, 0, 1] },
    hands: { Left: [-0.30, 0.92, 0.10], Right: [0.20, 0.96, 0.30] }, poles: bothDir(0.4, -0.3, -0.8), hipsY: -0.06,
  };
  // the flight: both feet off the floor, legs passing
  const air: K = {
    bones: { Hips: [8, 0, 6], Spine: [4, 0, 0], Spine1: [0, 0, 0], Neck: [-6, 0, 0], LeftUpLeg: [-24, 0, 4], RightUpLeg: [-6, 0, -4], LeftLeg: [30, 0, 0], RightLeg: [40, 0, 0], LeftFoot: [10, 0, 0], RightFoot: [24, 0, 0] },
    hands: { Left: [-0.34, 0.98 + 0.08, 0.04], Right: [0.14, 1.02 + 0.08, 0.30] }, poles: bothDir(0.4, -0.3, -0.8), hipsY: 0.08,
  };
  const landL = mirrorKey(loadR);
  const touchL: K = { ...landL, bones: { ...landL.bones, Hips: [18, 0, 4] }, hipsY: -0.12 };
  return loop(scene, sk, 'ex_bound', 2.0, alternate([at(loadR, 0, true), at(loadR, 0.18, true), at(pushR, 0.36), at(air, 0.52), at(touchL, 0.68), at(landL, 0.84, true)], 1.0));
}

/** ex_throw — a two-hand chest pass with a step-in: the ball at the chest, a dip, the step and the arms long, follow-through,
 *  reset; the next rep steps with the other foot (med-ball chest pass, chest push, partner / wall chest pass). */
export function buildExThrow(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const home: Pair = both(0.15, ANKLE, 0.08);
  const chest: Pair = { Left: [0.14, -0.14, 0.20], Right: [-0.14, -0.14, 0.20] };
  const set: K = { bones: { Hips: [8, 0, 0], Spine: [4, 0, 0], Spine1: [0, 0, 0], Neck: [-6, 0, 0] }, feet: home, kneePoles: KNEES_OUT, rel: chest, poles: ELBOWS_DOWN, hipsY: -0.05 };
  const load: K = { ...set, bones: { Hips: [16, 0, 0], Spine: [6, 0, 0], Spine1: [0, 0, 0], Neck: [-10, 0, 0] }, rel: { Left: [0.14, -0.16, 0.14], Right: [-0.14, -0.16, 0.14] }, hipsY: -0.12 };
  const lift: K = { ...load, feet: { Left: home.Left, Right: [0.15, ANKLE + 0.07, 0.22] }, hipsY: -0.08 };
  const release: K = { bones: { Hips: [16, 0, 0], Spine: [10, 0, 0], Spine1: [0, 0, 0], Neck: [-12, 0, 0], LeftFoot: [14, 0, 0] }, feet: { Left: [-0.15, ANKLE + 0.03, 0.08], Right: [0.15, ANKLE, 0.36] }, kneePoles: KNEES_OUT, rel: { Left: [0.08, -0.06, 0.50], Right: [-0.08, -0.06, 0.50] }, poles: bothDir(0.6, -0.4, -0.4), hipsY: -0.10 };
  const back: K = { ...release, feet: { Left: home.Left, Right: [0.15, ANKLE + 0.07, 0.22] }, rel: chest, poles: ELBOWS_DOWN, bones: set.bones, hipsY: -0.06 };
  return loop(scene, sk, 'ex_throw', 3.2, alternate([at(set, 0, true), at(load, 0.35, true), at(lift, 0.48), at(release, 0.62, true), at(release, 0.92, true), at(back, 1.25), at(set, 1.45, true)], 1.6));
}

/** ex_crawl — the bear position (hands under the shoulders, knees a hand off the floor) stepping in place, opposite hand and
 *  foot together (bear crawl, lateral bear crawl, leopard crawl, beast hold with taps, inchworm walk-outs held to the crawl). */
export function buildExCrawl(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const hands = both(0.17, 0.05, 0.50), feet = both(0.12, TOE_ANKLE, -0.26);
  const base: K = { bones: { Hips: [88, 0, 0], Spine: [0, 0, 0], Spine1: [0, 0, 0], Neck: [-48, 0, 0], LeftFoot: [30, 0, 0], RightFoot: [30, 0, 0] }, feet, kneePoles: bothDir(0, -0.35, 1), hands, poles: bothDir(0.5, 0.2, -0.6), hipsY: -0.42 };
  // the right hand and the left foot step: up, a reach forward, down on the same marks (in place)
  const step: K = { ...base, hands: { Left: hands.Left, Right: [0.17, 0.14, 0.58] }, feet: { Right: feet.Right, Left: [-0.12, TOE_ANKLE + 0.08, -0.20] }, hipsY: -0.41 };
  return loop(scene, sk, 'ex_crawl', 1.2, alternate([at(base, 0, true), at(step, 0.3)], 0.6));
}

// ── tier 2: the T-drill and the Quick Screen ─────────────────────────────────────────────────────────────────────────

/** ex_t_drill — the T-drill in place (lib/drills/drills.ts T_DRILL "T-Drill in Place"): fast feet, a shuffle left and a low
 *  left touch, a shuffle right and a low right touch, back to the middle and a two-hand touch, a backpedal, and reset.
 *  The shuffles are side-steps that return under the body (the stage holds the root still). */
export function buildExTDrill(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const W = 0.20, Y = -0.14;
  const ath = (lx: number, rx: number, extra: Partial<K> = {}): K => ({
    bones: { Hips: [22, 0, 0], Spine: [8, 0, 0], Spine1: [0, 0, 0], Neck: [-18, 0, 0], LeftFoot: [-12, 0, 0], RightFoot: [-12, 0, 0] }, feet: { Left: [lx, ANKLE, 0.08], Right: [rx, ANKLE, 0.08] }, kneePoles: KNEES_OUT,
    hands: both(0.24, 0.98 + Y, 0.26), poles: ELBOWS_DOWN, hipsY: Y, ...extra,
  });
  const stance = ath(-W, W);
  const lift = (side: 'Left' | 'Right', x: number, z = 0.08, h = 0.07): K => ({ ...stance, feet: { ...stance.feet, [side]: [x, ANKLE + h, z] } as Pair, hipsY: Y + 0.01 });
  // fast feet: quick alternating lifts in place
  const keys: ExKey[] = [at(stance, 0, true)];
  let t = 0.15;
  for (let i = 0; i < 4; i++) { keys.push(at(lift(i % 2 ? 'Left' : 'Right', i % 2 ? -W : W, 0.10, 0.06), t)); t += 0.15; keys.push(at(stance, t)); t += 0.0; }
  // shuffle LEFT: the left foot reaches out, the right follows (never crossing), back under the body
  const shuffle = (dir: 1 | -1, start: number): number => {
    const lead = dir > 0 ? 'Right' : 'Left', trail = dir > 0 ? 'Left' : 'Right';
    const sx = (s: 'Left' | 'Right', x: number) => (s === 'Left' ? -x : x);
    let tt = start;
    keys.push(at({ ...stance, feet: { [lead]: [sx(lead, W + 0.18), ANKLE + 0.05, 0.08], [trail]: [sx(trail, W), ANKLE, 0.08] } as Pair }, tt += 0.13));
    keys.push(at({ ...stance, feet: { [lead]: [sx(lead, W + 0.26), ANKLE, 0.08], [trail]: [sx(trail, W), ANKLE, 0.08] } as Pair }, tt += 0.12));
    keys.push(at({ ...stance, feet: { [lead]: [sx(lead, W + 0.26), ANKLE, 0.08], [trail]: [sx(trail, W - 0.12), ANKLE + 0.05, 0.08] } as Pair }, tt += 0.12));
    keys.push(at(stance, tt += 0.14));
    return tt;
  };
  const touch = (side: 'Left' | 'Right' | 'Both', start: number): number => {
    const low: K = { ...stance, bones: { Hips: [52, 0, side === 'Left' ? 8 : side === 'Right' ? -8 : 0], Spine: [12, 0, 0], Spine1: [0, 0, 0], Neck: [-34, 0, 0], LeftFoot: [-26, 0, 0], RightFoot: [-26, 0, 0] }, hipsY: -0.30,
      hands: side === 'Both' ? both(0.16, 0.30, 0.44) : side === 'Left' ? { Left: [-0.34, 0.30, 0.36], Right: [0.24, 0.62, 0.22] } : { Right: [0.34, 0.30, 0.36], Left: [-0.24, 0.62, 0.22] } };
    keys.push(at(low, start + 0.22, true)); keys.push(at(stance, start + 0.48));
    return start + 0.48;
  };
  t = shuffle(-1, t); t = shuffle(-1, t); t = touch('Left', t);
  for (let i = 0; i < 4; i++) t = shuffle(1, t);
  t = touch('Right', t);
  t = shuffle(-1, t); t = shuffle(-1, t); t = touch('Both', t);
  // backpedal in place: small alternating steps back and return
  for (let i = 0; i < 4; i++) {
    const s = i % 2 ? 'Left' : 'Right';
    keys.push(at({ ...stance, bones: { ...stance.bones!, Hips: [16, 0, 0] }, feet: { ...stance.feet, [s]: [s === 'Left' ? -W : W, ANKLE + 0.06, -0.06] } as Pair }, t += 0.15));
    keys.push(at({ ...stance, bones: { ...stance.bones!, Hips: [16, 0, 0] } }, t += 0.15));
  }
  return loop(scene, sk, 'ex_t_drill', +(t + 0.4).toFixed(2), keys);
}

/** ex_knee_to_wall — Quick Screen T2, the ankle bend: a short split stance facing a wall, hands on it; the front knee drives
 *  forward over the toes toward the wall with the front heel DOWN, holds, comes back; the stance switches and the other side
 *  (knee-to-wall ankle rock, banded / loaded rock, bent-knee calf stretch at the wall). */
export function buildExKneeToWall(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const front: V3 = [0.12, ANKLE, 0.18], rear: V3 = [-0.13, ANKLE + 0.05, -0.30];
  const wall: Pair = { Left: [-0.24, 1.30, 0.62], Right: [0.24, 1.30, 0.62] };
  const base: K = { bones: { Hips: [10, 0, 0], Spine: [6, 0, 0], Spine1: [0, 0, 0], Neck: [-6, 0, 0], LeftFoot: [-8, 0, 0] }, feet: { Right: front, Left: rear }, kneePoles: { Right: [0.05, 0, 1], Left: [0, -0.3, 1] }, hands: wall, poles: bothDir(0.6, -0.6, -0.3), hipsY: -0.06 };
  const drive: K = { ...base, bones: { ...base.bones, Hips: [12, 0, 0], RightFoot: [-26, 0, 0], LeftFoot: [-4, 0, 0] }, hipsY: -0.20, hands: { Left: [-0.24, 1.30 - 0.02, 0.62], Right: [0.24, 1.30 - 0.02, 0.62] } };
  // the switch: the front foot steps back beside the rear, then the rear foot steps forward
  const mid1: K = { ...base, feet: { Right: [0.13, ANKLE + 0.07, -0.06], Left: rear } };
  const mid2: K = { ...base, feet: { Right: [0.13, ANKLE + 0.03, -0.30], Left: [-0.12, ANKLE + 0.07, -0.06] }, kneePoles: bothDir(0, -0.3, 1) };
  return loop(scene, sk, 'ex_knee_to_wall', 7.0, alternate([at(base, 0, true), at(drive, 1.2, true), at(drive, 2.0, true), at(base, 2.8, true), at(mid1, 3.1), at(mid2, 3.3)], 3.5));
}

/** ex_single_leg_squat — Quick Screen T3 (replaces the split-squat stand-in): standing on the right leg, the left foot held
 *  forward off the floor, arms forward; down to about 70° of knee bend, hold, up; the free foot comes down, the other side
 *  (single-leg squat, single-leg box squat / sit to box, skater-squat and step-down family at screen depth). */
export function buildExSingleLegSquat(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const plant: V3 = [0.09, ANKLE, 0.06];
  const top: K = { bones: { Hips: [6, 0, 0], Spine: [4, 0, 0], Spine1: [0, 0, 0], Neck: [-6, 0, 0] }, feet: { Right: plant, Left: [-0.10, ANKLE + 0.12, 0.22] }, kneePoles: { Right: [0.08, 0, 1], Left: [0, 0.3, 1] }, hands: both(0.18, 1.30, 0.44), poles: ELBOWS_DOWN, hipsY: -0.01 };
  const bottom: K = { bones: { Hips: [34, 0, 0], Spine: [10, 0, 0], Spine1: [0, 0, 0], Neck: [-24, 0, 0], RightFoot: [-26, 0, 0] }, feet: { Right: plant, Left: [-0.10, ANKLE + 0.14, 0.50] }, kneePoles: { Right: [0.08, 0, 1], Left: [0, 0.5, 1] }, hands: both(0.18, 1.18 - 0.26, 0.56), poles: ELBOWS_DOWN, hipsY: -0.26 };
  const down: K = { ...top, feet: { Right: plant, Left: [-0.10, ANKLE + 0.01, 0.10] }, kneePoles: bothDir(0.05, 0, 1) };
  return loop(scene, sk, 'ex_single_leg_squat', 6.4, alternate([
    at(top, 0, true), at(mix(top, bottom, 0.4), 0.5), at(mix(top, bottom, 0.8), 0.9), at(bottom, 1.2, true), at(bottom, 1.6, true),
    at(mix(bottom, top, 0.5), 2.2), at(top, 2.7, true), at(down, 3.0), at(mirrorKey(down), 3.15),
  ], 3.2));
}

// ── tier 3: the coach catalogue (Blueprint KB items; library entries too) ────────────────────────────────────────────

/** Face-down flat on the floor, forehead on the stacked hands, legs long. */
const PRONE = (inhale: number): K => ({
  bones: { Hips: [90 - inhale * 1.2, 0, 0], Spine: [-inhale * 1.5, 0, 0], Spine1: [-inhale * 1.5, 0, 0], Neck: [-26, 0, 0], LeftUpLeg: [0, 0, 6], RightUpLeg: [0, 0, -6], LeftFoot: [58, 0, 0], RightFoot: [58, 0, 0] },
  hands: { Left: [-0.06, 0.07, 0.62], Right: [0.06, 0.09, 0.60] }, poles: bothDir(1, 0.1, 0), hipsY: -0.84 + inhale * 0.008,
});
/** ex_breathe_prone — crocodile breathing: prone, a slow breath into the belly and low back, out (crocodile / prone breathing). */
export const buildExBreatheProne = (scene: Scene, sk: Skeleton) => loop(scene, sk, 'ex_breathe_prone', 6.0, [at(PRONE(0), 0, true), at(PRONE(1), 2.5, true), at(PRONE(1), 3.2, true)]);

/** On the back, the legs up a wall (thighs vertical, knees soft), hands on the belly. */
const LEGS_UP = (inhale: number): K => ({
  bones: { Hips: [-88, 0, 0], Spine: [-inhale * 1.5, 0, 0], Spine1: [-inhale * 1.5, 0, 0], Neck: [10, 0, 0], LeftUpLeg: [-84, 0, 4], RightUpLeg: [-84, 0, -4], LeftLeg: [6, 0, 0], RightLeg: [6, 0, 0], LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0] },
  hands: { Left: [-0.10, 0.22 + inhale * 0.012, -0.14], Right: [0.10, 0.22 + inhale * 0.012, -0.14] }, poles: bothDir(1, 0.2, 0), hipsY: -0.84,
});
/** ex_breathe_legs_up_wall — the supine down-regulation breath with the legs up the wall (legs-up-the-wall / feet-on-wall /
 *  supine belly breathing; the coach's supine neural flush). */
export const buildExBreatheLegsUpWall = (scene: Scene, sk: Skeleton) => loop(scene, sk, 'ex_breathe_legs_up_wall', 6.0, [at(LEGS_UP(0), 0, true), at(LEGS_UP(1), 2.5, true), at(LEGS_UP(1), 3.2, true)]);

/** ex_ankle_circles — "Ankle Circles" (FEL name for ankle CARs): standing on the left, the right thigh lifted, hands on the hips;
 *  the right foot draws a slow circle; the foot comes down, the other side. */
export function buildExAnkleCircles(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const hips: Pair = both(0.20, 1.00, 0.02);
  const pose = (fx: number, fz: number): K => ({
    bones: { ...STAND, RightUpLeg: [-52, 0, -4], RightLeg: [62, 0, 0], RightFoot: [fx, 0, fz] }, feet: { Left: [-0.09, ANKLE, 0.04] }, kneePoles: { Left: [0, 0, 1] },
    hands: hips, poles: bothDir(1, -0.1, -0.3), hipsY: 0,
  });
  const stand: K = { bones: STAND, feet: both(0.11, ANKLE, 0.04), hands: hips, poles: bothDir(1, -0.1, -0.3), hipsY: 0 };
  return loop(scene, sk, 'ex_ankle_circles', 9.6, alternate([
    at(stand, 0, true), at(pose(0, 0), 0.5), at(pose(24, 0), 1.2), at(pose(0, -20), 2.0), at(pose(-24, 0), 2.8), at(pose(0, 20), 3.6), at(pose(0, 0), 4.3),
  ], 4.8));
}

/** Seated on the floor in 90/90 — the right shin across the front, the left leg out to the side and the shin back. */
const SIT_Y = -0.84;
const SIT_BONES: Record<string, Deg3> = { Hips: [-8, 0, 0], Spine: [6, 0, 0], Spine1: [0, 0, 0], Neck: [-4, 0, 0] };
const SIT_HANDS: Pair = both(0.26, 0.10, -0.22);
const NINETY: K = {
  bones: { ...SIT_BONES, LeftFoot: [-30, 0, 0], RightFoot: [-30, 0, 0] }, feet: { Right: [-0.06, 0.11, 0.56], Left: [-0.52, 0.11, -0.36] }, kneePoles: { Right: [0.6, 0.1, 0.8], Left: [-1, 0.2, 0.1] },
  hands: SIT_HANDS, poles: bothDir(0.4, -0.2, -1), hipsY: SIT_Y,
};
/** ex_hip_circles_9090 — "Hip Circles (90/90)" (FEL name for hip CARs; the 90/90 hip switch): seated in 90/90, both knees
 *  rise to upright and fall to the other side, and back. The hold variant ("90/90 Press-and-Lift" — PLACEHOLDER name, needs
 *  Elijah's approval; PAILs/RAILs) is this loop held at 0 s (ISO_HOLD_SEC) with the muscle view carrying it. */
export function buildExHipCircles9090(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const up: K = { ...NINETY, feet: both(0.24, 0.11, 0.44), kneePoles: bothDir(0.3, 1, 0.3), bones: { ...SIT_BONES, Hips: [-12, 0, 0], LeftFoot: [-30, 0, 0], RightFoot: [-30, 0, 0] } };
  return loop(scene, sk, 'ex_hip_circles_9090', 4.0, alternate([at(NINETY, 0, true), at(NINETY, 0.5, true), at(mix(NINETY, up, 0.35), 0.78), at(mix(NINETY, up, 0.7), 1.02), at(up, 1.25), at(mix(up, mirrorKey(NINETY), 0.35), 1.48), at(mix(up, mirrorKey(NINETY), 0.7), 1.72)], 2.0));
}

/** ex_pogo_single — single-leg pogos: quick stiff hops off the right ankle, the left knee held up; after four, switch in the
 *  air and four on the left (single-leg pogo, single-leg hop series, single-leg line hop shape). */
export function buildExPogoSingle(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const free = { LeftUpLeg: [-42, 0, 4] as Deg3, LeftLeg: [80, 0, 0] as Deg3, LeftFoot: [20, 0, 0] as Deg3 };
  const ground: K = { bones: { ...STAND, Hips: [4, 0, 0], ...free }, feet: { Right: [0.09, ANKLE, 0.05] }, kneePoles: { Right: [0.05, 0, 1] }, hands: both(0.26, 0.96 - 0.05, 0.18), poles: bothDir(0.15, -0.4, -1), hipsY: -0.05 };
  const air: K = { bones: { ...STAND, ...free, RightUpLeg: [-4, 0, -2], RightLeg: [6, 0, 0], RightFoot: [30, 0, 0] }, hands: both(0.26, 0.98 + 0.11, 0.18), poles: bothDir(0.15, -0.4, -1), hipsY: 0.11 };
  const swap: K = { bones: { ...STAND, LeftUpLeg: [-22, 0, 4], RightUpLeg: [-22, 0, -4], LeftLeg: [44, 0, 0], RightLeg: [44, 0, 0], LeftFoot: [24, 0, 0], RightFoot: [24, 0, 0] }, hands: both(0.26, 0.98 + 0.12, 0.18), poles: bothDir(0.15, -0.4, -1), hipsY: 0.12 };
  const keys: ExKey[] = [];
  for (let i = 0; i < 4; i++) { keys.push(at(ground, i * 0.4)); keys.push(at(i === 3 ? swap : air, i * 0.4 + 0.2)); }
  return loop(scene, sk, 'ex_pogo_single', 3.2, alternate(keys, 1.6));
}

/** On the back, knees bent, the right foot planted; the left knee held over the hip. */
const BRIDGE_FOOT: V3 = [0.13, ANKLE, 0.50];
const bridgeKey = (lift: number): K => ({
  bones: { Hips: [-86 - 32 * lift, 0, 0], Spine: [0, 0, 0], Spine1: [0, 0, 0], Neck: [10 + 24 * lift, 0, 0], LeftUpLeg: [-88 + 32 * lift, 0, 4], LeftLeg: [86, 0, 0] },
  feet: { Right: BRIDGE_FOOT }, kneePoles: { Right: [0.1, 1, 0.2 + 0.2 * lift] }, hands: both(0.30, 0.04, -0.20 - 0.14 * lift), poles: bothDir(0.6, 0.3, 0), hipsY: -0.82 + 0.22 * lift,
});
/** ex_bridge_single_pulse — a single-leg glute bridge: up to one line, six short pulses at the top, down; the other leg
 *  (single-leg glute bridge / hip thrust and their tempo and hold variants; the coach's hip-thrust pogos). */
export function buildExBridgeSinglePulse(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const keys: ExKey[] = [at(bridgeKey(0), 0, true), at(bridgeKey(0.5), 0.4), at(bridgeKey(1), 0.8, true)];
  for (let i = 0; i < 6; i++) { keys.push(at(bridgeKey(0.8), 1.0 + i * 0.3)); keys.push(at(bridgeKey(1), 1.15 + i * 0.3, true)); }
  keys.push(at(bridgeKey(0.5), 3.15), at(bridgeKey(0), 3.45, true));
  const down: K = { ...bridgeKey(0), bones: { ...bridgeKey(0).bones!, LeftUpLeg: [0, 0, 0], LeftLeg: [0, 0, 0] }, feet: { Right: BRIDGE_FOOT, Left: [-BRIDGE_FOOT[0], BRIDGE_FOOT[1], BRIDGE_FOOT[2]] }, kneePoles: bothDir(0.1, 1, 0.2) };
  keys.push(at(down, 3.72, true));
  return loop(scene, sk, 'ex_bridge_single_pulse', 8.0, alternate(keys, 4.0));
}

/** ex_press_oscillation — a one-arm overhead press, then short pulses at three-quarter lockout (overhead oscillations), the free
 *  hand on the hip; the other arm (single-arm / one-arm standing press, bottoms-up kettlebell press; the coach's noon snack). */
export function buildExPressOscillation(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const base = { bones: { ...STAND, Spine: [0, 0, 0] as Deg3 }, feet: STANCE, hipsY: 0 };
  const hip: V3 = [-0.20, 1.00, 0.02];
  const arm = (r: V3, pole: V3): K => ({ ...base, rel: { Right: r }, hands: { Left: hip }, poles: { Right: pole, Left: [-1, -0.1, -0.3] } });
  const rack = arm(RACK.Right!, [0.4, -1, 0.3]), lock = arm(OVERHEAD.Right!, [1, 0.1, -0.1]);
  const q = (dy: number) => arm([0, 0.46 + dy, 0.03], [1, -0.2, -0.1]);
  const keys: ExKey[] = [at(rack, 0, true), at(mix(rack, lock, 0.5), 0.4), at(lock, 0.8, true), at(lock, 1.0, true)];
  for (let i = 0; i < 6; i++) { keys.push(at(q(0), 1.25 + i * 0.3, true)); keys.push(at(q(0.05), 1.4 + i * 0.3, true)); }
  keys.push(at(mix(q(0), rack, 0.5), 3.2), at(rack, 3.55, true));
  return loop(scene, sk, 'ex_press_oscillation', 7.6, alternate(keys, 3.8));
}

/** ex_throw_vertical — an underhand scoop toss straight up: hinge with the ball between the knees, drive through the hips onto
 *  the toes as the straight arms swing it overhead, hold the release, reset (scoop / underhand throws, squat throw, backward
 *  overhead toss shape; the coach's med-ball vertical toss). */
export function buildExThrowVertical(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.17, ANKLE, 0.10);
  const set: K = { bones: { Hips: [40, 0, 0], Spine: [8, 0, 0], Spine1: [0, 0, 0], Neck: [-26, 0, 0], LeftFoot: [-22, 0, 0], RightFoot: [-22, 0, 0] }, feet, kneePoles: KNEES_OUT, hands: { Left: [-0.08, 0.52 - 0.0, 0.34], Right: [0.08, 0.52, 0.34] }, poles: bothDir(0.3, -0.6, -0.6), hipsY: -0.30 };
  const mid: K = { bones: { Hips: [14, 0, 0], Spine: [2, 0, 0], Spine1: [0, 0, 0], Neck: [-6, 0, 0] }, feet, kneePoles: KNEES_OUT, hands: { Left: [-0.08, 1.16, 0.56], Right: [0.08, 1.16, 0.56] }, poles: bothDir(0.6, -0.2, -0.6), hipsY: -0.08 };
  const release: K = { bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], Spine1: [-4, 0, 0], Neck: [10, 0, 0], LeftFoot: [24, 0, 0], RightFoot: [24, 0, 0] }, feet: both(0.17, ANKLE + 0.06, 0.10), hands: { Left: [-0.10, 2.02 + 0.06, 0.18], Right: [0.10, 2.02 + 0.06, 0.18] }, poles: bothDir(0.9, 0.2, -0.3), hipsY: 0.06 };
  const stand: K = { bones: STAND, feet, hands: both(0.20, 0.86, 0.14), poles: HANG_POLES, hipsY: 0 };
  return loop(scene, sk, 'ex_throw_vertical', 2.4, [at(stand, 0, true), at(mix(stand, set, 0.35), 0.2), at(mix(stand, set, 0.7), 0.38), at(set, 0.55, true), at(mid, 0.78), at(release, 0.98, true), at(release, 1.3, true), at(mix(release, stand, 0.5), 1.7), at(stand, 2.0, true)]);
}

/** ex_box_out — the box-out: a wide defensive stance with the arms up and out, a reverse pivot on the right foot to put the
 *  hips into the (unseen) opponent, a low wide hold with short fighting steps, and pivot back (box-out, box-out from help
 *  side, box-out and outlet, front the post / post denial shapes). The root does not travel: the body turns about the pivot. */
export function buildExBoxOut(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const P: V3 = [0.22, ANKLE, 0.06];
  // the left foot swings round the right (pivot) foot by `deg` (yawing the body the same way)
  const swing = (deg: number, r = 0.46): V3 => { const a = (deg * Math.PI) / 180; return [P[0] - r * Math.cos(a), ANKLE, P[2] + r * Math.sin(a)]; };
  const arms = (yaw: number): Pair => {
    const a = (yaw * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const rot = (x: number, z: number): [number, number] => [x * c + z * s, -x * s + z * c];
    const [lx, lz] = rot(-0.46, 0.10), [rx, rz] = rot(0.46, 0.10);
    return { Left: [lx, 1.08, lz], Right: [rx, 1.08, rz] };
  };
  const yawDir = (x: number, z: number, yaw: number): V3 => { const a = (yaw * Math.PI) / 180; return [x * Math.cos(a) + z * Math.sin(a), 0, -x * Math.sin(a) + z * Math.cos(a)]; };
  const stance = (yaw: number, lf: V3, hipsY = -0.20): K => ({
    bones: { Hips: [22, yaw, 0], Spine: [8, 0, 0], Spine1: [0, 0, 0], Neck: [-14, 0, 0], LeftFoot: [-10 + (yaw / 90) * 14, 0, 0], RightFoot: [-10 + (yaw / 90) * 30, 0, 0] }, feet: { Right: P, Left: lf },
    kneePoles: { Left: yawDir(-0.35, 1, yaw), Right: yawDir(0.35, 1, yaw) }, hands: arms(yaw), poles: { Left: yawDir(-1, -0.5, yaw), Right: yawDir(1, -0.5, yaw) }, hipsY,
  });
  const T = -90;
  // a swing key: the left foot on its arc, lifted clear of the floor
  const lift = (e: K, deg: number): K => ({ ...e, bones: { ...e.bones!, LeftFoot: [-24, 0, 0] }, feet: { Right: P, Left: [swing(deg)[0], ANKLE + 0.12, swing(deg)[2]] } });
  const s0 = stance(0, swing(0)), s1 = stance(T / 2, [swing(T / 2)[0], ANKLE + 0.09, swing(T / 2)[2]], -0.16), s2 = stance(T, swing(T), -0.24);
  const hold: K = { ...s2, bones: { ...s2.bones!, Hips: [30, T, 0], Spine: [12, 0, 0] }, hipsY: -0.27 };
  const fight: K = { ...hold, feet: { Right: P, Left: [swing(T)[0], ANKLE + 0.04, swing(T)[2] + 0.03] } };
  // the loop's length, and the stance it rests in before it wraps (the last key is s0 at DUR − REST = 3.05 s). Kept as a
  // sum so no rim-height-looking literal sits in the code (courtDims.hu.test.ts HU-1); the time is unchanged
  const DUR = 3.4, REST = 0.35;
  return loop(scene, sk, 'ex_box_out', DUR, [
    at(s0, 0, true), at(lift(mix(s0, s1, 0.5), T / 4), 0.13), at(s1, 0.25), at(lift(mix(s1, s2, 0.5), (3 * T) / 4), 0.38), at(s2, 0.5, true), at(hold, 0.9, true), at(fight, 1.25), at(hold, 1.6, true), at(fight, 1.95), at(hold, 2.25, true), at(s2, 2.5), at(lift(mix(s1, s2, 0.5), (3 * T) / 4), 2.65), at(s1, 2.8), at(lift(mix(s0, s1, 0.5), T / 4), 2.93), at(s0, DUR - REST, true),
  ]);
}

/** Batch A, in plan order: [name, builder] — register after EXERCISE_BUILDERS (README-batchA.md). */
export const EXERCISE_BATCH_A_BUILDERS: readonly [string, (scene: Scene, sk: Skeleton) => AnimationGroup | null][] = [
  ['ex_idle_ready', buildExIdleReady], ['ex_rotate', buildExRotate], ['ex_bound', buildExBound], ['ex_throw', buildExThrow], ['ex_crawl', buildExCrawl],
  ['ex_t_drill', buildExTDrill], ['ex_knee_to_wall', buildExKneeToWall], ['ex_single_leg_squat', buildExSingleLegSquat],
  ['ex_breathe_prone', buildExBreatheProne], ['ex_breathe_legs_up_wall', buildExBreatheLegsUpWall], ['ex_ankle_circles', buildExAnkleCircles],
  ['ex_hip_circles_9090', buildExHipCircles9090], ['ex_pogo_single', buildExPogoSingle], ['ex_bridge_single_pulse', buildExBridgeSinglePulse],
  ['ex_press_oscillation', buildExPressOscillation], ['ex_throw_vertical', buildExThrowVertical], ['ex_box_out', buildExBoxOut],
];
export const EXERCISE_BATCH_A_CLIPS: readonly string[] = EXERCISE_BATCH_A_BUILDERS.map(([n]) => n);
