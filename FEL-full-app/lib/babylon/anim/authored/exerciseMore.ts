// More exercise loops (LIBRARY-ANATOMY-2, 2026-10-25) — the library's lifts done one arm at a time, arm after arm, and from
// the knees, made from the SAME two poses as the two-arm lift (exerciseKit.ts UPPER), so a one-arm curl is the curl.
//
// Owner decision (2026-10-25): raise the library's demo coverage only with correct, authored loops — a wrong movement
// never shows. A variation the library tags with a shape modifier (lib/library/demo.ts SHAPE_MODIFIERS: single-arm,
// alternating, half-kneeling, …) used to show the cue card because no loop did it; these are those loops.
//   · ONE ARM (`_one`): the right arm does the rep; the left stays where the lift starts (hanging, or at the shoulder for a
//     press the other hand still holds) — or, where the lift's start is a two-hand grip a free hand would not keep (behind
//     the head, at a cable), hangs at the side.
//   · ALTERNATING (`_alt`): a right rep, then a left rep; the resting side holds the start.
//   · HALF-KNEELING (`_hk`): the right knee down under the hip, the left foot flat in front, the trunk tall; TALL-KNEELING
//     (`_tk`): both knees down. The arms do the standing lift's rep from there.
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import {
  ANKLE, ELBOWS_OUT, HANG, HANG_POLES, loop, mix, repOf, UPPER, both, bothDir, type Deg3, type ExKey, type Pair, type RepPair, type V3,
} from './exerciseKit';

type Pose = Omit<ExKey, 't'>;
type Side = 'Left' | 'Right';
const SIDES: readonly Side[] = ['Left', 'Right'];

/** One pose's right side and another's left (hands, shoulder-relative hands, elbow poles; and any bone named for a side). */
export function sides(right: Pose, left: Pose): Pose {
  const pick = (r?: Pair, l?: Pair): Pair | undefined => {
    const out: Pair = {};
    if (r?.Right) out.Right = r.Right;
    if (l?.Left) out.Left = l.Left;
    return out.Left || out.Right ? out : undefined;
  };
  const bones: Record<string, Deg3> = {};
  for (const [n, v] of Object.entries(right.bones ?? {})) if (!n.startsWith('Left')) bones[n] = v;
  for (const [n, v] of Object.entries(left.bones ?? {})) if (n.startsWith('Left')) bones[n] = v;
  return { ...right, bones, hands: pick(right.hands, left.hands), rel: pick(right.rel, left.rel), poles: pick(right.poles, left.poles) };
}

/** The left arm hanging at the side (the start of a curl), whatever the lift's own start is. */
const HANG_LEFT: Pose = { hands: { Left: HANG.Left }, poles: { Left: HANG_POLES.Left } };

/** A one-arm version of a lift: the right arm reps, the left holds `free` (default: the lift's start). */
export function oneArm(p: RepPair, free?: Pose): RepPair {
  const f = free ? { ...p.a, ...free, rel: free.rel, hands: free.hands, poles: free.poles } : p.a;
  return { a: sides(p.a, f), b: sides(p.b, f), t: p.t };
}

/** An alternating loop: a right rep, then a left rep (each as the two-arm lift's timing), the resting side at the start. */
export function alternating(scene: Scene, sk: Skeleton, name: string, p: RepPair): AnimationGroup | null {
  const [down, hold, upSec, rest] = p.t;
  const D = down + hold + upSec + rest;
  const ease = (u: number) => u * u * (3 - 2 * u);
  const keys: ExKey[] = [];
  for (const [i, end] of [[0, sides(p.b, p.a)], [1, sides(p.a, p.b)]] as const) {
    const t0 = i * D, t1 = t0 + down, t2 = t1 + hold, t3 = t2 + upSec;
    keys.push({ ...p.a, t: t0, hold: true });
    for (const f of [1 / 3, 2 / 3]) keys.push({ ...mix(p.a, end, ease(f)), t: t0 + down * f });
    keys.push({ ...end, t: t1, hold: true });
    if (hold > 0) keys.push({ ...end, t: t2, hold: true });
    for (const f of [1 / 3, 2 / 3]) keys.push({ ...mix(end, p.a, ease(f)), t: t2 + upSec * f });
    keys.push({ ...p.a, t: t3, hold: true });
  }
  return loop(scene, sk, name, 2 * D, keys);
}

// ── kneeling ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// A down knee: the thigh straight under the hip, the shin flat on the floor behind, the foot pointed (its top on the
// floor). The hips drop by the thigh's length so the knee rests on the floor (measured: the knee joint 5–6 cm up).
/** hipsY that puts the down knee(s) on the floor. */
export const KNEEL_Y = -0.43;
const DOWN_KNEE = (s: Side): Record<string, Deg3> => ({ [`${s}UpLeg`]: [0, 0, s === 'Left' ? 3 : -3], [`${s}Leg`]: [90, 0, 0], [`${s}Foot`]: [62, 0, 0] });
/** The half-kneeling front foot: flat, a thigh's length in front, the shin upright. */
const FRONT_FOOT = (s: Side): V3 => [s === 'Left' ? -0.13 : 0.13, ANKLE, 0.42];

/** A standing pose with the legs replaced by kneeling ones: `down` the knees on the floor (one: half-kneeling, the other
 *  foot in front; both: tall-kneeling). Absolute hand targets drop with the hips; shoulder-relative ones ride the trunk. */
export function kneel(p: Pose, down: readonly Side[]): Pose {
  const dy = KNEEL_Y - (p.hipsY ?? 0);
  const bones: Record<string, Deg3> = {};
  for (const [n, v] of Object.entries(p.bones ?? {})) if (!/(UpLeg|Leg|Foot|ToeBase)$/.test(n)) bones[n] = v;
  for (const s of down) Object.assign(bones, DOWN_KNEE(s));
  const up = SIDES.filter((s) => !down.includes(s));
  const feet: Pair = {};
  for (const s of up) feet[s] = FRONT_FOOT(s);
  const hands = p.hands && Object.fromEntries(Object.entries(p.hands).map(([s, v]) => [s, [v[0], v[1] + dy, v[2]] as V3])) as Pair;
  return { ...p, bones, hands, feet: up.length ? feet : undefined, kneePoles: up.length ? bothDir(0.1, 0.4, 1) : undefined, hipsY: KNEEL_Y };
}
const hk = (p: RepPair): RepPair => ({ a: kneel(p.a, ['Right']), b: kneel(p.b, ['Right']), t: p.t });

/** The seated free hand: beside the bench, the arm long (the seated curl's start). */
const SEATED_HANG_LEFT: Pose = { hands: { Left: UPPER.seatedCurl.a.hands!.Left }, poles: { Left: UPPER.seatedCurl.a.poles!.Left } };

// ── more standing lifts (the same two-pose rep) ──────────────────────────────────────────────────────────────────────
/** The row's hinge: about 45° forward, soft knees (exerciseKit UPPER.row). */
const HINGED = { bones: UPPER.row.a.bones, feet: UPPER.row.a.feet, kneePoles: UPPER.row.a.kneePoles, hipsY: UPPER.row.a.hipsY };
const STAND_FEET = { bones: UPPER.curl.a.bones, feet: UPPER.curl.a.feet, hipsY: 0 };
export const MORE_UPPER = {
  /** ex_kickback — hinged like the row, the upper arms pinned back along the trunk: the forearms swing from hanging to
   *  straight back (triceps kickback). */
  kickback: { a: { ...HINGED, rel: { Left: [0.02, -0.44, -0.20] as V3, Right: [-0.02, -0.44, -0.20] as V3 }, poles: bothDir(0.15, 0.5, -1) }, b: { ...HINGED, rel: { Left: [0.02, -0.33, -0.42] as V3, Right: [-0.02, -0.33, -0.42] as V3 }, poles: bothDir(0.15, 1, -0.3) }, t: [0.6, 0.3, 0.8, 0.3] },
  /** ex_reverse_fly — hinged like the row: the arms open out to the sides to level with the back, elbows soft (rear-delt raise). */
  reverseFly: { a: { ...HINGED, rel: UPPER.row.a.rel, poles: bothDir(0.6, 0.3, -0.5) }, b: { ...HINGED, rel: { Left: [-0.50, -0.06, 0.04] as V3, Right: [0.50, -0.06, 0.04] as V3 }, poles: bothDir(0.2, 1, -0.2) }, t: [0.8, 0.3, 1.0, 0.3] },
  /** ex_pull_apart — standing, arms straight out in front at shoulder height: the hands pull apart to the sides (band pull-apart). */
  pullApart: { a: { ...STAND_FEET, rel: { Left: [0.06, -0.04, 0.50] as V3, Right: [-0.06, -0.04, 0.50] as V3 }, poles: bothDir(0.4, -1, 0) }, b: { ...STAND_FEET, rel: { Left: [-0.50, -0.04, 0.10] as V3, Right: [0.50, -0.04, 0.10] as V3 }, poles: bothDir(0.1, -1, -0.3) }, t: [0.7, 0.4, 0.8, 0.3] },
  /** ex_face_pull — standing, the hands from straight out in front to beside the ears, elbows high and wide (face pull). */
  facePull: { a: { ...STAND_FEET, rel: { Left: [0.08, 0.02, 0.50] as V3, Right: [-0.08, 0.02, 0.50] as V3 }, poles: bothDir(0.8, -0.2, 0) }, b: { ...STAND_FEET, rel: { Left: [0.02, 0.12, 0.06] as V3, Right: [-0.02, 0.12, 0.06] as V3 }, poles: bothDir(1, 0.4, -0.4) }, t: [0.7, 0.4, 0.8, 0.3] },
  /** ex_scaption — the raise a third of the way between in front and out to the side, thumbs up, to shoulder height. */
  scaption: { a: UPPER.lateral.a, b: { ...UPPER.lateral.b, hands: both(0.60, 1.38, 0.38), poles: bothDir(0.4, 0.4, -0.8) }, t: [0.8, 0.2, 1.0, 0.3] },
} satisfies Record<string, RepPair>;

/** ex_front_raise_overhead — the front raise carried on up to overhead, arms long all the way (front raise to overhead). */
function frontRaiseOverhead(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const down = UPPER.front.a, level = UPPER.front.b;
  const top: Pose = { ...level, hands: both(0.18, 2.06, 0.12), poles: bothDir(1, 0.2, -0.2) };
  const mid: Pose = { ...level, hands: both(0.18, 1.82, 0.46), poles: bothDir(1, 0, -0.3) };
  const low: Pose = { ...level, hands: both(0.18, 1.12, 0.48), poles: ELBOWS_OUT };
  return loop(scene, sk, 'ex_front_raise_overhead', 3.2, [
    { ...down, t: 0, hold: true }, { ...low, t: 0.4 }, { ...level, t: 0.7 }, { ...mid, t: 1.0 }, { ...top, t: 1.3, hold: true }, { ...top, t: 1.55, hold: true },
    { ...mid, t: 1.9 }, { ...level, t: 2.2 }, { ...low, t: 2.5 }, { ...down, t: 2.85, hold: true },
  ]);
}

type Builder = (scene: Scene, sk: Skeleton) => AnimationGroup | null;
const one = (name: string, p: RepPair, free?: Pose): [string, Builder] => [name, (scene, sk) => repOf(scene, sk, name, oneArm(p, free))];
const alt = (name: string, p: RepPair): [string, Builder] => [name, (scene, sk) => alternating(scene, sk, name, p)];
const two = (name: string, p: RepPair): [string, Builder] => [name, (scene, sk) => repOf(scene, sk, name, p)];

/** Every loop in this file: [name, builder]. */
export const MORE_BUILDERS: readonly [string, Builder][] = [
  // one arm
  one('ex_curl_one', UPPER.curl), one('ex_press_one', UPPER.press, HANG_LEFT), one('ex_lateral_raise_one', UPPER.lateral), one('ex_front_raise_one', UPPER.front),
  one('ex_triceps_overhead_one', UPPER.tricepsOverhead, HANG_LEFT), one('ex_pushdown_one', UPPER.pushdown, HANG_LEFT), one('ex_row_one', UPPER.row), one('ex_upright_row_one', UPPER.upright),
  one('ex_seated_press_one', UPPER.seatedPress, SEATED_HANG_LEFT), one('ex_seated_curl_one', UPPER.seatedCurl), one('ex_seated_lateral_raise_one', UPPER.seatedLateral),
  one('ex_seated_triceps_one', UPPER.seatedTriceps, SEATED_HANG_LEFT),
  one('ex_skull_crusher_one', UPPER.skull), one('ex_fly_one', UPPER.fly), one('ex_incline_press_one', UPPER.inclinePress), one('ex_incline_fly_one', UPPER.inclineFly),
  // alternating
  alt('ex_curl_alt', UPPER.curl), alt('ex_press_alt', UPPER.press), alt('ex_lateral_raise_alt', UPPER.lateral), alt('ex_front_raise_alt', UPPER.front), alt('ex_row_alt', UPPER.row),
  alt('ex_seated_press_alt', UPPER.seatedPress), alt('ex_seated_curl_alt', UPPER.seatedCurl), alt('ex_incline_press_alt', UPPER.inclinePress),
  // more standing lifts
  two('ex_kickback', MORE_UPPER.kickback), one('ex_kickback_one', MORE_UPPER.kickback), two('ex_reverse_fly', MORE_UPPER.reverseFly), two('ex_pull_apart', MORE_UPPER.pullApart),
  two('ex_face_pull', MORE_UPPER.facePull), two('ex_scaption', MORE_UPPER.scaption), ['ex_front_raise_overhead', frontRaiseOverhead],
  // half-kneeling (the right knee down)
  two('ex_press_hk', hk(UPPER.press)), one('ex_press_hk_one', hk(UPPER.press), kneel({ ...UPPER.press.a, ...HANG_LEFT, rel: undefined }, ['Right'])), alt('ex_press_hk_alt', hk(UPPER.press)),
];
