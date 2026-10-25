// The exercise library's loop kit (LIBRARY-ANATOMY-2, 2026-10-25): the helpers, stances and pose pairs every exercise loop
// file shares (exercise.ts, exerciseMore.ts, exerciseFloor.ts). Moved here unchanged from exercise.ts — the same numbers, the
// same solves — so a new loop file can use them without importing exercise.ts (which lists every file's loops).
// Conventions: see exercise.ts's header (targets in the FINAL frame, `rel` from the posed shoulder, every loop closes).
import { Vector3, type AnimationGroup, type Scene, type Skeleton, type TransformNode } from '@babylonjs/core';
import { buildPoseClip, REF_HIP_JOINT_Y, REF_HIPS_Y, SMOOTH_FPS, type Deg3, type PoseKey } from '../poseClip';
import { bindFrame } from '../bindFrame';
import { boneNode } from '../boneLookup';
import { smoothScalarKeys } from '../smoothKeys';

export type { Deg3 };
export type V3 = [number, number, number];
export interface Pair { Left?: V3; Right?: V3 }

/** The ankle target that lands the hero's ankles at stance height (basketball.ts ANKLE_Y, measured there). */
export const ANKLE = 0.095;
/** A plank's ankle: on the toes, the heel up — a hair higher than standing. */
export const TOE_ANKLE = 0.11;

/** Both sides from the right side's numbers: the left is the mirror (x negated). */
export const both = (x: number, y: number, z: number): Pair => ({ Left: [-x, y, z], Right: [x, y, z] });
/** Mirror a right-side pole / rel to the left. */
export const bothDir = (x: number, y: number, z: number): Pair => ({ Left: [-x, y, z], Right: [x, y, z] });

export interface ExKey {
  t: number;
  bones?: Record<string, Deg3>;
  /** wrist targets in the FINAL frame (root metres, after hipsY) */
  hands?: Pair;
  /** wrists from the posed shoulder (rides the torso) */
  rel?: Pair;
  /** LIBRARY-ANATOMY-2: a grip on a prop (a bar, a bench edge, a wall), in the body's own metres in the FINAL frame (poseClip
   *  handsBody): not re-scaled by the arm's length the way `hands` is, so a long-armed body's hands meet the same bar */
  handsAt?: Pair;
  poles?: Pair;
  /** ankle targets in the FINAL frame */
  feet?: Pair;
  kneePoles?: Pair;
  hipsY?: number;
  /** LIBRARY-ANATOMY-2: the hips shifted sideways (+ toward the body's right) and forward, body metres — a cossack sits over
   *  one foot, a lateral lunge over the stepping one. Targets stay in the final frame (planted feet stay put). */
  hipsX?: number;
  hipsZ?: number;
  hold?: boolean;
}

/** An ExKey → the solver's key: hands and feet are solved with the hips at bind and THEN lowered by hipsY, so a final-
 *  frame target is raised by −hipsY here (basketball.ts feetAt is the same move). */
export function k(e: ExKey): PoseKey {
  const h = e.hipsY ?? 0, x = e.hipsX ?? 0, z = e.hipsZ ?? 0;
  const up = (p?: Pair): Pair | undefined => p && {
    ...(p.Left ? { Left: [p.Left[0] - x, p.Left[1] - h, p.Left[2] - z] as V3 } : {}),
    ...(p.Right ? { Right: [p.Right[0] - x, p.Right[1] - h, p.Right[2] - z] as V3 } : {}),
  };
  return {
    t: e.t, bones: e.bones, hands: up(e.hands), handsRel: e.rel, poles: e.poles, feet: up(e.feet), kneePoles: e.kneePoles,
    ...(e.handsAt ? { handsBody: Object.fromEntries(Object.entries(e.handsAt).map(([s, v]) => [s, [v[0] - x, v[1], v[2] - z]])) as Pair } : {}),
    hipsY: e.hipsY, hold: e.hold,
  };
}

/** Linear mix of two keys (bones, targets, hipsY) — the in-between keys a rep is solved at, so a planted ankle is exactly
 *  on its target at every quarter of the range instead of drifting between two far-apart solves (measured on the squat:
 *  6 cm into the floor half-way down with only its top and bottom solved). Targets present on one side only are kept. */
export function mix(a: Omit<ExKey, 't'>, b: Omit<ExKey, 't'>, u: number): Omit<ExKey, 't'> {
  const n = (x: number, y: number) => x + (y - x) * u;
  const v = (x?: V3, y?: V3): V3 | undefined => (x && y ? [n(x[0], y[0]), n(x[1], y[1]), n(x[2], y[2])] : u < 0.5 ? x : y);
  const pair = (x?: Pair, y?: Pair): Pair | undefined => {
    if (!x && !y) return undefined;
    const L = v(x?.Left, y?.Left), R = v(x?.Right, y?.Right);
    return { ...(L ? { Left: L } : {}), ...(R ? { Right: R } : {}) };
  };
  const bones: Record<string, Deg3> = {};
  for (const name of new Set([...Object.keys(a.bones ?? {}), ...Object.keys(b.bones ?? {})])) {
    const x = a.bones?.[name] ?? [0, 0, 0], y = b.bones?.[name] ?? [0, 0, 0];
    bones[name] = [n(x[0], y[0]), n(x[1], y[1]), n(x[2], y[2])];
  }
  return {
    bones, hands: pair(a.hands, b.hands), rel: pair(a.rel, b.rel), ...(a.handsAt || b.handsAt ? { handsAt: pair(a.handsAt, b.handsAt) } : {}), poles: u < 0.5 ? a.poles : b.poles, feet: pair(a.feet, b.feet),
    kneePoles: u < 0.5 ? a.kneePoles : b.kneePoles, hipsY: n(a.hipsY ?? 0, b.hipsY ?? 0),
    ...(a.hipsX || b.hipsX ? { hipsX: n(a.hipsX ?? 0, b.hipsX ?? 0) } : {}), ...(a.hipsZ || b.hipsZ ? { hipsZ: n(a.hipsZ ?? 0, b.hipsZ ?? 0) } : {}),
  };
}

/** A loop: the keys at the given times, the last one a copy of the first at `duration`. A bone keyed on any key is keyed on
 *  every key (0 = its bind rotation where a key leaves it out) — a track keyed on two keys of five holds its value across
 *  the other three, and a foot pointed for the flight stayed pointed on the floor. */
export function loop(scene: Scene, sk: Skeleton, name: string, duration: number, keys: ExKey[], opts: { pivot?: boolean } = {}): AnimationGroup | null {
  let closed = [...keys, { ...keys[0], t: duration }];
  if (opts.pivot) closed = pivotFix(sk, closed);
  const names = new Set(closed.flatMap((e) => Object.keys(e.bones ?? {})));
  const filled = closed.map((e) => ({ ...e, bones: Object.fromEntries([...names].map((b) => [b, e.bones?.[b] ?? [0, 0, 0]])) as Record<string, Deg3> }));
  const g = buildPoseClip(scene, sk, name, duration, filled.map(k), { smooth: true, periodic: true });
  if (g && closed.some((e) => e.hipsX || e.hipsZ)) shiftHips(g, sk, closed, duration);
  return g;
}

/**
 * LIBRARY-ANATOMY-2: THE HIPS PIVOT. A hipsY is where the Hips BONE goes, and the bodies put that bone at different heights
 * over the same hip joints (the female kit 3 cm above them, the forge hero 5 cm below — poseClip.ts sizes by the joints).
 * Standing, that is nothing; pitched over onto the floor (the Hips at 90–130°) the hip joints swing round the bone, and the
 * female body's sat 9 cm lower and 8 cm further forward than the hero's: its knees went through the floor in the child's
 * pose. With `pivot`, each key's hipsY / hipsZ is corrected by the difference, so the hip JOINTS land where the reference
 * body's do. (Zero on the hero; opt-in, so the first pass's loops are unchanged.)
 */
function pivotFix(sk: Skeleton, keys: ExKey[]): ExKey[] {
  const bf = bindFrame(sk);
  for (const [n, t] of bf.bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); }
  const hips = boneNode(sk, 'Hips');
  const top = (hips?.parent as TransformNode | null) ?? hips;
  const walk = (n: TransformNode) => { n.computeWorldMatrix(true); for (const c of n.getChildTransformNodes(true)) walk(c); };
  if (!hips || !top) return keys;
  walk(top);
  const legs = ['LeftUpLeg', 'RightUpLeg'].map((n) => boneNode(sk, n)).filter((n): n is TransformNode => !!n);
  if (!legs.length) return keys;
  const rootY = (hips.parent as TransformNode | null)?.getAbsolutePosition().y ?? 0;
  const jointY = legs.reduce((a, n) => a + n.getAbsolutePosition().y, 0) / legs.length - rootY;
  const scale = jointY / REF_HIP_JOINT_Y || 1;
  const d = (jointY - (hips.getAbsolutePosition().y - rootY)) / scale - (REF_HIP_JOINT_Y - REF_HIPS_Y);   // this body's joint-below-bone vs the reference's
  if (Math.abs(d) < 0.005) return keys;
  return keys.map((e) => {
    const th = (((e.bones?.Hips ?? [0, 0, 0]) as Deg3)[0] * Math.PI) / 180;
    return { ...e, hipsY: (e.hipsY ?? 0) - (Math.cos(th) - 1) * d, hipsZ: (e.hipsZ ?? 0) - Math.sin(th) * d };
  });
}

/**
 * LIBRARY-ANATOMY-2: carry a key's hipsX / hipsZ on the Hips position track the clip already has (hipsY's), smoothed the
 * way poseClip smooths hipsY (the same holds, periodic), in the body's frame read off the rig at bind (the hip line for
 * right, the toes for front) and scaled by the body's hip height, as every target is. The limbs were solved with the
 * targets moved back by the shift (k), so after it a planted foot is where it was authored.
 */
function shiftHips(g: AnimationGroup, sk: Skeleton, keys: ExKey[], duration: number): void {
  const hips = boneNode(sk, 'Hips');
  const ta = hips && g.targetedAnimations.find((x) => x.target === hips && x.animation.targetProperty === 'position');
  const parent = hips?.parent as TransformNode | null;
  if (!hips || !ta || !parent) return;
  const at = (n: string) => { const b = boneNode(sk, n); b?.computeWorldMatrix(true); return b?.getAbsolutePosition().clone() ?? null; };
  const lul = at('LeftUpLeg'), rul = at('RightUpLeg'), lf = at('LeftFoot'), lt = at('LeftToeBase');
  if (!lul || !rul) return;
  const right = rul.subtract(lul); right.y = 0; right.normalize();
  let front = Vector3.Cross(Vector3.Up(), right).normalize();
  if (lf && lt) { const toe = lt.subtract(lf); toe.y = 0; if (Vector3.Dot(toe, front) < 0) front = front.scale(-1); }
  parent.computeWorldMatrix(true);
  const rootY = parent.getAbsolutePosition().y;
  const scale = ((lul.y + rul.y) / 2 - rootY) / REF_HIP_JOINT_Y || 1;
  const inv = parent.getWorldMatrix().clone().invert();
  const so = { fps: SMOOTH_FPS, duration, holds: keys.filter((e) => e.hold).map((e) => e.t), prefilter: 0, periodic: true };
  const dense = (f: (e: ExKey) => number) => smoothScalarKeys(keys.map((e) => ({ t: e.t, v: f(e) })), so);
  const xs = dense((e) => e.hipsX ?? 0), zs = dense((e) => e.hipsZ ?? 0);
  const sample = (d: { t: number; v: number }[], t: number) => {
    let i = 0;
    while (i < d.length - 2 && d[i + 1].t < t) i++;
    const a = d[i], b = d[Math.min(i + 1, d.length - 1)];
    return b.t > a.t ? a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t) : a.v;
  };
  for (const key of ta.animation.getKeys()) {
    const t = key.frame / SMOOTH_FPS;
    const w = right.scale(sample(xs, t) * scale).addInPlace(front.scale(sample(zs, t) * scale));
    const len = w.length();
    if (len < 1e-6) continue;
    const local = Vector3.TransformNormal(w, inv).normalize().scale(len);
    key.value = (key.value as Vector3).add(local);
  }
}

/** A two-pose rep: A (start) → B (end range) → A, with the given seconds down, held, up and rested. The way down and the
 *  way up are each solved at two in-between keys (mix). */
export function rep(scene: Scene, sk: Skeleton, name: string, a: Omit<ExKey, 't'>, b: Omit<ExKey, 't'>, down = 1.0, hold = 0.3, upSec = 0.9, rest = 0.4): AnimationGroup | null {
  const t1 = down, t2 = down + hold, t3 = t2 + upSec, D = t3 + rest;
  const ease = (u: number) => u * u * (3 - 2 * u);   // the in-between keys sit where an eased rep is at that time
  const keys: ExKey[] = [{ ...a, t: 0, hold: true }];
  for (const f of [1 / 3, 2 / 3]) keys.push({ ...mix(a, b, ease(f)), t: t1 * f });
  keys.push({ ...b, t: t1, hold: true });
  if (hold > 0) keys.push({ ...b, t: t2, hold: true });
  for (const f of [1 / 3, 2 / 3]) keys.push({ ...mix(b, a, ease(f)), t: t2 + upSec * f });
  keys.push({ ...a, t: t3, hold: true });
  return loop(scene, sk, name, D, keys);
}

// ── shared stances ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Hip-width stance, toes a touch forward of the root (the hips sit back over the heels in a squat or a hinge). */
export const STANCE: Pair = both(0.13, ANKLE, 0.08);
/** Squat stance: a little wider, knees tracking out over the toes. */
export const SQUAT_FEET: Pair = both(0.19, ANKLE, 0.10);
export const KNEES_OUT: Pair = bothDir(0.35, 0, 1);
/** Arms hanging at the sides, a soft elbow (locomotion.ts HANG_DEFAULT). */
export const HANG: Pair = both(0.24, 0.84, 0.06);
export const HANG_POLES: Pair = bothDir(0.2, -0.3, -0.9);
export const ELBOWS_DOWN: Pair = bothDir(0.25, -1, -0.1);
export const ELBOWS_BACK: Pair = bothDir(0.15, -0.4, -1);
export const ELBOWS_OUT: Pair = bothDir(1, -0.2, -0.2);
export const ELBOWS_UP: Pair = bothDir(0.6, 0.6, -0.4);
export const STAND: Record<string, Deg3> = { Hips: [0, 0, 0], Spine: [2, 0, 0], Spine1: [0, 0, 0], Neck: [0, 0, 0] };

// ── the press's two ends, and the high plank (exercise.ts) ──
export const RACK: Pair = { Left: [0.0, 0.05, 0.14], Right: [0.0, 0.05, 0.14] };
export const OVERHEAD: Pair = { Left: [0.0, 0.62, -0.02], Right: [0.0, 0.62, -0.02] };
export const HIGH_PLANK: Omit<ExKey, 't'> = { bones: { Hips: [70, 0, 0], Spine: [0, 0, 0], Neck: [-30, 0, 0], LeftFoot: [8, 0, 0], RightFoot: [8, 0, 0] }, feet: both(0.11, TOE_ANKLE, -0.90), kneePoles: bothDir(0, -1, 0.1), hands: both(0.24, 0.05, 0.44), poles: bothDir(0.6, 0.2, -0.7), hipsY: -0.58 };

// ── on a bench (exercise.ts) ──
export const SEAT_Y = -0.37;   // hipsY that sits the pelvis on a 0.44 m bench
export const SEATED: Omit<ExKey, 't' | 'hands' | 'rel' | 'poles'> = {
  bones: { Hips: [0, 0, 0], Spine: [0, 0, 0], Neck: [0, 0, 0], LeftUpLeg: [-86, 0, 8], RightUpLeg: [-86, 0, -8] },
  feet: both(0.19, ANKLE, 0.48), kneePoles: bothDir(0.1, 0.3, 1), hipsY: SEAT_Y,
};
export const seat = (e: Omit<ExKey, 't'>): Omit<ExKey, 't'> => ({ ...SEATED, ...e, bones: { ...SEATED.bones, ...(e.bones ?? {}) }, hipsY: SEAT_Y });
export const LIE_Y = -0.42;    // hipsY that lays the back on a 0.44 m bench
export const LYING: Omit<ExKey, 't' | 'hands' | 'rel' | 'poles'> = {
  bones: { Hips: [-90, 0, 0], Spine: [0, 0, 0], Neck: [8, 0, 0] },
  feet: both(0.26, ANKLE, 0.40), kneePoles: bothDir(0.3, 1, 0.2), hipsY: LIE_Y,
};
export const lie = (e: Omit<ExKey, 't'>): Omit<ExKey, 't'> => ({ ...LYING, ...e, bones: { ...LYING.bones, ...(e.bones ?? {}) }, hipsY: LIE_Y });
export const INCLINE_Y = -0.38;
export const INCLINED: Omit<ExKey, 't' | 'hands' | 'rel' | 'poles'> = {
  bones: { Hips: [-45, 0, 0], Spine: [0, 0, 0], Neck: [10, 0, 0] },
  feet: both(0.22, ANKLE, 0.46), kneePoles: bothDir(0.2, 0.6, 1), hipsY: INCLINE_Y,
};
export const incline = (e: Omit<ExKey, 't'>): Omit<ExKey, 't'> => ({ ...INCLINED, ...e, bones: { ...INCLINED.bones, ...(e.bones ?? {}) }, hipsY: INCLINE_Y });

// ── the standing (and seated) upper-body lifts as data: [start, end of range, seconds down, held, up, rested] ──────────
export interface RepPair { a: Omit<ExKey, 't'>; b: Omit<ExKey, 't'>; t: [number, number, number, number] }
const PRESS_BASE = { bones: { ...STAND, Spine: [0, 0, 0] as Deg3 }, feet: STANCE };
const ROW_FEET = both(0.14, ANKLE, 0.18);
const ROW_BONES = { Hips: [48, 0, 0] as Deg3, Spine: [4, 0, 0] as Deg3, Neck: [-24, 0, 0] as Deg3, LeftLeg: [18, 0, 0] as Deg3, RightLeg: [18, 0, 0] as Deg3 };
const PUSHDOWN_BONES = { ...STAND, Spine: [8, 0, 0] as Deg3 };
export const UPPER = {
  press: { a: { ...PRESS_BASE, rel: RACK, poles: bothDir(0.4, -1, 0.3), hipsY: 0 }, b: { ...PRESS_BASE, bones: { ...PRESS_BASE.bones, Neck: [4, 0, 0] as Deg3 }, rel: OVERHEAD, poles: bothDir(1, 0.1, -0.1), hipsY: 0 }, t: [0.8, 0.25, 1.0, 0.35] },
  curl: { a: { bones: STAND, feet: STANCE, hands: both(0.22, 0.86, 0.10), poles: ELBOWS_BACK, hipsY: 0 }, b: { bones: STAND, feet: STANCE, hands: both(0.20, 1.34, 0.20), poles: bothDir(0.15, -0.8, -0.6), hipsY: 0 }, t: [0.8, 0.2, 1.0, 0.3] },
  lateral: { a: { bones: STAND, feet: STANCE, hands: both(0.22, 0.86, 0.12), poles: ELBOWS_OUT, hipsY: 0 }, b: { bones: STAND, feet: STANCE, hands: both(0.74, 1.38, 0.10), poles: bothDir(0.2, 0.6, -0.8), hipsY: 0 }, t: [0.8, 0.2, 1.0, 0.3] },
  front: { a: { bones: STAND, feet: STANCE, hands: both(0.17, 0.86, 0.16), poles: ELBOWS_OUT, hipsY: 0 }, b: { bones: STAND, feet: STANCE, hands: both(0.18, 1.40, 0.60), poles: ELBOWS_OUT, hipsY: 0 }, t: [0.8, 0.2, 1.0, 0.3] },
  row: { a: { bones: ROW_BONES, feet: ROW_FEET, kneePoles: bothDir(0.1, 0, 1), rel: { Left: [0.04, -0.50, 0.06] as V3, Right: [-0.04, -0.50, 0.06] as V3 }, poles: ELBOWS_OUT, hipsY: -0.08 }, b: { bones: ROW_BONES, feet: ROW_FEET, kneePoles: bothDir(0.1, 0, 1), rel: { Left: [-0.02, -0.30, -0.22] as V3, Right: [0.02, -0.30, -0.22] as V3 }, poles: bothDir(0.4, 0.5, -0.8), hipsY: -0.08 }, t: [0.7, 0.3, 0.9, 0.3] },
  upright: { a: { bones: STAND, feet: STANCE, hands: both(0.10, 0.84, 0.14), poles: ELBOWS_OUT, hipsY: 0 }, b: { bones: STAND, feet: STANCE, hands: both(0.10, 1.36, 0.16), poles: bothDir(1, 0.5, 0), hipsY: 0 }, t: [0.8, 0.2, 0.9, 0.3] },
  tricepsOverhead: { a: { bones: STAND, feet: STANCE, rel: { Left: [0.14, 0.22, -0.14] as V3, Right: [-0.14, 0.22, -0.14] as V3 }, poles: bothDir(0.2, 1, 0.3), hipsY: 0 }, b: { bones: STAND, feet: STANCE, rel: { Left: [0.12, 0.52, 0.02] as V3, Right: [-0.12, 0.52, 0.02] as V3 }, poles: bothDir(0.2, 1, 0.3), hipsY: 0 }, t: [0.8, 0.2, 1.0, 0.3] },
  pushdown: { a: { bones: PUSHDOWN_BONES, feet: STANCE, hands: both(0.15, 1.12, 0.30), poles: ELBOWS_BACK, hipsY: 0 }, b: { bones: PUSHDOWN_BONES, feet: STANCE, hands: both(0.16, 0.86, 0.18), poles: ELBOWS_BACK, hipsY: 0 }, t: [0.7, 0.2, 0.9, 0.3] },
  seatedPress: { a: seat({ rel: RACK, poles: bothDir(0.4, -1, 0.3) }), b: seat({ rel: OVERHEAD, poles: bothDir(1, 0.1, -0.1) }), t: [0.8, 0.25, 1.0, 0.35] },
  seatedCurl: { a: seat({ hands: both(0.25, 0.86 + SEAT_Y, 0.08), poles: ELBOWS_BACK }), b: seat({ hands: both(0.21, 1.34 + SEAT_Y, 0.20), poles: bothDir(0.15, -0.8, -0.6) }), t: [0.8, 0.2, 1.0, 0.3] },
  seatedLateral: { a: seat({ hands: both(0.25, 0.86 + SEAT_Y, 0.10), poles: ELBOWS_OUT }), b: seat({ hands: both(0.74, 1.38 + SEAT_Y, 0.10), poles: bothDir(0.2, 0.6, -0.8) }), t: [0.8, 0.2, 1.0, 0.3] },
  seatedTriceps: { a: seat({ rel: { Left: [0.14, 0.22, -0.14], Right: [-0.14, 0.22, -0.14] }, poles: bothDir(0.2, 1, 0.3) }), b: seat({ rel: { Left: [0.12, 0.52, 0.02], Right: [-0.12, 0.52, 0.02] }, poles: bothDir(0.2, 1, 0.3) }), t: [0.8, 0.2, 1.0, 0.3] },
  bench: { a: lie({ hands: both(0.24, 1.10, -0.44), poles: bothDir(0.7, -0.5, 0) }), b: lie({ hands: both(0.27, 0.70, -0.34), poles: bothDir(0.7, -0.7, 0.1) }), t: [1.0, 0.2, 0.9, 0.35] },
  fly: { a: lie({ hands: both(0.12, 1.08, -0.42), poles: bothDir(0.6, -0.3, 0.2) }), b: lie({ hands: both(0.70, 0.66, -0.40), poles: bothDir(0.2, -1, 0.1) }), t: [1.1, 0.2, 1.0, 0.35] },
  skull: { a: lie({ hands: both(0.12, 1.10, -0.46), poles: bothDir(0.2, 0.6, 0.6) }), b: lie({ hands: both(0.11, 0.78, -0.70), poles: bothDir(0.15, 1, 0.3) }), t: [0.9, 0.2, 0.9, 0.35] },
  inclinePress: { a: incline({ hands: both(0.22, 1.42, -0.26), poles: bothDir(0.7, -0.3, 0.1) }), b: incline({ hands: both(0.28, 1.04, -0.14), poles: bothDir(0.7, -0.7, 0.2) }), t: [1.0, 0.2, 0.9, 0.35] },
  inclineFly: { a: incline({ hands: both(0.12, 1.42, -0.26), poles: bothDir(0.6, -0.3, 0.2) }), b: incline({ hands: both(0.68, 1.00, -0.22), poles: bothDir(0.2, -1, 0.1) }), t: [1.1, 0.2, 1.0, 0.35] },
} satisfies Record<string, RepPair>;

/** rep() over a RepPair. */
export const repOf = (scene: Scene, sk: Skeleton, name: string, p: RepPair): AnimationGroup | null => rep(scene, sk, name, p.a, p.b, ...p.t);
