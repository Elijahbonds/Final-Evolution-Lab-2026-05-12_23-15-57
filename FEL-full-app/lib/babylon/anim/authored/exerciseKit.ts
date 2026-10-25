// The exercise library's loop kit (LIBRARY-ANATOMY-2, 2026-10-25): the helpers, stances and pose pairs every exercise loop
// file shares (exercise.ts, exerciseMore.ts, exerciseFloor.ts). Moved here unchanged from exercise.ts — the same numbers, the
// same solves — so a new loop file can use them without importing exercise.ts (which lists every file's loops).
// Conventions: see exercise.ts's header (targets in the FINAL frame, `rel` from the posed shoulder, every loop closes).
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import { buildPoseClip, type Deg3, type PoseKey } from '../poseClip';

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
  poles?: Pair;
  /** ankle targets in the FINAL frame */
  feet?: Pair;
  kneePoles?: Pair;
  hipsY?: number;
  hold?: boolean;
}

/** An ExKey → the solver's key: hands and feet are solved with the hips at bind and THEN lowered by hipsY, so a final-
 *  frame target is raised by −hipsY here (basketball.ts feetAt is the same move). */
export function k(e: ExKey): PoseKey {
  const h = e.hipsY ?? 0;
  const up = (p?: Pair): Pair | undefined => p && {
    ...(p.Left ? { Left: [p.Left[0], p.Left[1] - h, p.Left[2]] as V3 } : {}),
    ...(p.Right ? { Right: [p.Right[0], p.Right[1] - h, p.Right[2]] as V3 } : {}),
  };
  return {
    t: e.t, bones: e.bones, hands: up(e.hands), handsRel: e.rel, poles: e.poles, feet: up(e.feet), kneePoles: e.kneePoles,
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
    bones, hands: pair(a.hands, b.hands), rel: pair(a.rel, b.rel), poles: u < 0.5 ? a.poles : b.poles, feet: pair(a.feet, b.feet),
    kneePoles: u < 0.5 ? a.kneePoles : b.kneePoles, hipsY: n(a.hipsY ?? 0, b.hipsY ?? 0),
  };
}

/** A loop: the keys at the given times, the last one a copy of the first at `duration`. A bone keyed on any key is keyed on
 *  every key (0 = its bind rotation where a key leaves it out) — a track keyed on two keys of five holds its value across
 *  the other three, and a foot pointed for the flight stayed pointed on the floor. */
export function loop(scene: Scene, sk: Skeleton, name: string, duration: number, keys: ExKey[]): AnimationGroup | null {
  const closed = [...keys, { ...keys[0], t: duration }];
  const names = new Set(closed.flatMap((e) => Object.keys(e.bones ?? {})));
  const filled = closed.map((e) => ({ ...e, bones: Object.fromEntries([...names].map((b) => [b, e.bones?.[b] ?? [0, 0, 0]])) as Record<string, Deg3> }));
  return buildPoseClip(scene, sk, name, duration, filled.map(k), { smooth: true, periodic: true });
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
