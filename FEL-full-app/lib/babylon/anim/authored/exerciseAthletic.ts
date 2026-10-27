// Athletic exercise loops (LIBRARY-ANATOMY-2, 2026-10-25): anti-rotation presses, med-ball throws, chops and lifts, carries,
// swings, rotator-cuff work — each a STANCE (standing, half- or tall-kneeling, split, lateral lunge, one leg, stepping in)
// under an ARM ACTION (press out and back, throw from the chest, scoop from the hip …), because the library names them
// that way: "Band Pallof Press, Half-Kneeling", "Split-Stance Med Ball Rotational Scoop Toss".
//
// Owner decision (2026-10-25): raise coverage only with correct, authored loops. A throw is shown as the athlete throws it
// — the load, the release, the follow-through and the reset — with no ball drawn (the card says so, as it does for the
// court's drills); an anti-rotation press is the arms' path with the trunk held square (the band is not drawn either).
//
// Torso turns: the arms are written in the TRUNK's frame and turned with it (Spine yaw +θ turns the chest to the body's
// left — measured: +30° carried the right shoulder 9 cm forward), so a scoop's hands stay in front of a turning chest.
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import { ANKLE, STANCE, HANG, HANG_POLES, OVERHEAD, both, bothDir, loop, mix, type Deg3, type ExKey, type Pair, type V3 } from './exerciseKit';
import { KNEEL_Y } from './exerciseMore';

type Pose = Omit<ExKey, 't'>;
type Side = 'Left' | 'Right';

// ── stances ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export type StanceId = 'standing' | 'halfkneel' | 'tallkneel' | 'split' | 'lateral' | 'single' | 'stepin';
interface Legs { bones: Record<string, Deg3>; feet?: Pair; kneePoles?: Pair; hipsY: number; hipsX?: number; kneeling?: boolean }
const DOWN_KNEE = (s: Side): Record<string, Deg3> => ({ [`${s}UpLeg`]: [0, 0, s === 'Left' ? 3 : -3], [`${s}Leg`]: [90, 0, 0], [`${s}Foot`]: [62, 0, 0] });
/** The legs of a stance; `u` is the action's phase (0 loaded, 1 released) — only the step-in moves its feet with it. */
function legs(st: StanceId, u: number): Legs {
  switch (st) {
    case 'standing': return { bones: {}, feet: both(0.15, ANKLE, 0.08), kneePoles: bothDir(0.15, 0, 1), hipsY: -0.04 };
    case 'halfkneel': return { bones: DOWN_KNEE('Right'), feet: { Left: [-0.13, ANKLE, 0.42] }, kneePoles: bothDir(0.1, 0.4, 1), hipsY: KNEEL_Y, kneeling: true };
    case 'tallkneel': return { bones: { ...DOWN_KNEE('Left'), ...DOWN_KNEE('Right') }, hipsY: KNEEL_Y, kneeling: true };
    case 'split': return { bones: { RightFoot: [18, 0, 0] }, feet: { Left: [-0.13, ANKLE, 0.30], Right: [0.13, 0.15, -0.36] }, kneePoles: bothDir(0.1, 0, 1), hipsY: -0.08 };
    case 'lateral': return { bones: { LeftFoot: [-24, 0, 0], RightFoot: [-14, 0, 0] }, feet: both(0.42, ANKLE + 0.015, 0.08), kneePoles: { Left: [-0.5, 0, 1], Right: [0.6, 0, 1] }, hipsY: -0.36, hipsX: 0.20 };
    case 'single': return { bones: { RightUpLeg: [-62, 0, 0], RightLeg: [88, 0, 0], RightFoot: [20, 0, 0] }, feet: { Left: [-0.09, ANKLE, 0.06] }, kneePoles: { Left: [0, 0, 1] }, hipsY: -0.04 };
    case 'stepin': {
      // the left foot steps in as the throw goes: lifted half-way, planted forward by the release
      const z = 0.06 + 0.30 * Math.min(1, u), y = ANKLE + 0.10 * Math.sin(Math.PI * Math.min(1, u));
      return { bones: {}, feet: { Left: [-0.14, y, z], Right: [0.14, ANKLE, 0.02] }, kneePoles: bothDir(0.15, 0, 1), hipsY: -0.04 - 0.04 * Math.min(1, u) };
    }
  }
}

// ── arm actions ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** One key of an action: the hands from the shoulders in the trunk's frame, the elbow poles, the trunk's turn (yaw, + to the
 *  body's left) and lean (pitch), how far the hips sink, and `u` (0 loaded → 1 released) for a stance that steps. */
interface ArmKey { t: number; L: V3; R: V3; poles?: Pair; yaw?: number; lean?: number; drop?: number; u?: number; hold?: boolean }

const turnV = (v: V3, deg: number): V3 => { const r = (deg * Math.PI) / 180; return [v[0] * Math.cos(r) - v[2] * Math.sin(r), v[1], v[0] * Math.sin(r) + v[2] * Math.cos(r)]; };
const TOGETHER = (y: number, z: number, w = 0.15): { L: V3; R: V3 } => ({ L: [w, y, z], R: [-w, y, z] });
const P_DOWN = bothDir(0.6, -1, -0.2);

/** The anti-rotation press (Pallof): the hands together at the sternum, pressed straight out and back, the trunk square. */
const PALLOF_CHEST = TOGETHER(-0.24, 0.20, 0.16), PALLOF_OUT = TOGETHER(-0.12, 0.50), PALLOF_UP = TOGETHER(0.50, 0.12);
export const ACTIONS: Readonly<Record<string, { dur: number; keys: ArmKey[] }>> = {
  pallofpress: { dur: 2.6, keys: [{ t: 0, ...PALLOF_CHEST, poles: P_DOWN, hold: true }, { t: 0.8, ...PALLOF_OUT, poles: P_DOWN, hold: true }, { t: 1.3, ...PALLOF_OUT, poles: P_DOWN, hold: true }, { t: 2.1, ...PALLOF_CHEST, poles: P_DOWN, hold: true }] },
  pallofhold: { dur: 4.4, keys: [{ t: 0, ...PALLOF_CHEST, poles: P_DOWN, hold: true }, { t: 0.8, ...PALLOF_OUT, poles: P_DOWN, hold: true }, { t: 3.2, ...PALLOF_OUT, poles: P_DOWN, hold: true }, { t: 3.9, ...PALLOF_CHEST, poles: P_DOWN, hold: true }] },
  pallofoverhead: { dur: 3.6, keys: [{ t: 0, ...PALLOF_CHEST, poles: P_DOWN, hold: true }, { t: 0.7, ...PALLOF_OUT, poles: P_DOWN, hold: true }, { t: 1.4, ...PALLOF_UP, poles: bothDir(1, 0, -0.2), hold: true }, { t: 1.8, ...PALLOF_UP, poles: bothDir(1, 0, -0.2), hold: true }, { t: 2.5, ...PALLOF_OUT, poles: P_DOWN, hold: true }, { t: 3.1, ...PALLOF_CHEST, poles: P_DOWN, hold: true }] },
  // the rotate-out: arms long in front, the trunk turns away from the anchor (to the left) and back, the hands staying in front of the chest
  pallofrotate: { dur: 3.0, keys: [{ t: 0, ...PALLOF_OUT, poles: P_DOWN, hold: true }, { t: 1.0, ...PALLOF_OUT, poles: P_DOWN, yaw: 40, hold: true }, { t: 1.5, ...PALLOF_OUT, poles: P_DOWN, yaw: 40, hold: true }, { t: 2.5, ...PALLOF_OUT, poles: P_DOWN, hold: true }] },
  // the cable chop: from high beside the right shoulder, the arms pull down and across to the left hip, the trunk turning
  chop: { dur: 2.6, keys: [{ t: 0, L: [0.38, 0.28, 0.30], R: [0.02, 0.32, 0.30], yaw: -35, poles: bothDir(0.6, -0.4, -0.4), hold: true }, { t: 0.9, L: [-0.02, -0.46, 0.28], R: [-0.36, -0.40, 0.30], yaw: 35, lean: 10, poles: P_DOWN, hold: true }, { t: 1.3, L: [-0.02, -0.46, 0.28], R: [-0.36, -0.40, 0.30], yaw: 35, lean: 10, poles: P_DOWN, hold: true }] },
  // the lift: the chop reversed — from low by the right hip up and across to high over the left shoulder
  lift: { dur: 2.6, keys: [{ t: 0, L: [0.36, -0.44, 0.30], R: [0.02, -0.46, 0.28], yaw: -35, lean: 10, poles: P_DOWN, hold: true }, { t: 0.9, L: [-0.02, 0.30, 0.30], R: [-0.38, 0.28, 0.30], yaw: 35, poles: bothDir(0.6, -0.4, -0.4), hold: true }, { t: 1.3, L: [-0.02, 0.30, 0.30], R: [-0.38, 0.28, 0.30], yaw: 35, poles: bothDir(0.6, -0.4, -0.4), hold: true }] },
  // ── med-ball throws (a load, the release, the follow-through, the reset) ──
  chest: { dur: 2.2, keys: [{ t: 0, ...TOGETHER(-0.20, 0.18, 0.14), poles: bothDir(0.8, -0.6, 0), lean: 4, drop: -0.08, u: 0, hold: true }, { t: 0.42, ...TOGETHER(-0.10, 0.52, 0.10), poles: bothDir(0.6, -0.6, 0), lean: 10, drop: 0, u: 1 }, { t: 0.7, ...TOGETHER(-0.12, 0.50, 0.10), poles: bothDir(0.6, -0.6, 0), lean: 12, drop: -0.02, u: 1, hold: true }, { t: 1.6, ...TOGETHER(-0.20, 0.18, 0.14), poles: bothDir(0.8, -0.6, 0), lean: 4, drop: -0.08, u: 0 }] },
  overhead: { dur: 2.3, keys: [{ t: 0, ...TOGETHER(0.50, -0.06, 0.10), poles: bothDir(1, 0, 0.2), lean: -8, u: 0, hold: true }, { t: 0.4, ...TOGETHER(0.16, 0.48, 0.10), poles: bothDir(1, -0.2, 0), lean: 12, u: 1 }, { t: 0.65, ...TOGETHER(-0.14, 0.46, 0.10), poles: bothDir(0.8, -0.6, 0), lean: 20, drop: -0.04, u: 1, hold: true }, { t: 1.7, ...TOGETHER(0.50, -0.06, 0.10), poles: bothDir(1, 0, 0.2), lean: -8, u: 0 }] },
  scoop: { dur: 2.6, keys: [{ t: 0, L: [0.32, -0.50, 0.24], R: [0.04, -0.54, 0.14], poles: P_DOWN, yaw: -50, lean: 18, drop: -0.14, u: 0, hold: true }, { t: 0.45, L: [-0.04, -0.06, 0.46], R: [-0.32, -0.08, 0.40], poles: bothDir(0.6, -0.6, -0.2), yaw: 40, lean: 2, u: 1 }, { t: 0.75, L: [-0.10, 0.08, 0.40], R: [-0.36, 0.06, 0.32], poles: bothDir(0.6, -0.6, -0.2), yaw: 60, u: 1, hold: true }, { t: 1.9, L: [0.32, -0.50, 0.24], R: [0.04, -0.54, 0.14], poles: P_DOWN, yaw: -50, lean: 18, drop: -0.14, u: 0 }] },
  sidetoss: { dur: 2.5, keys: [{ t: 0, L: [0.32, -0.34, 0.26], R: [0.04, -0.38, 0.18], poles: P_DOWN, yaw: -50, lean: 8, drop: -0.08, u: 0, hold: true }, { t: 0.42, L: [-0.04, -0.20, 0.48], R: [-0.32, -0.22, 0.42], poles: bothDir(0.6, -0.6, -0.2), yaw: 40, u: 1 }, { t: 0.72, L: [-0.10, -0.16, 0.42], R: [-0.36, -0.18, 0.34], poles: bothDir(0.6, -0.6, -0.2), yaw: 60, u: 1, hold: true }, { t: 1.8, L: [0.32, -0.34, 0.26], R: [0.04, -0.38, 0.18], poles: P_DOWN, yaw: -50, lean: 8, drop: -0.08, u: 0 }] },
  shotput: { dur: 2.5, keys: [{ t: 0, L: [0.28, -0.10, 0.20], R: [0.0, 0.02, 0.10], poles: { Left: [-0.6, -0.6, 0], Right: [0.6, -0.8, -0.2] }, yaw: -45, drop: -0.08, u: 0, hold: true }, { t: 0.42, L: [-0.04, -0.30, 0.10], R: [-0.08, 0.02, 0.52], poles: { Left: [-0.6, -0.6, -0.3], Right: [0.6, -0.6, 0] }, yaw: 35, u: 1 }, { t: 0.72, L: [-0.06, -0.32, 0.06], R: [-0.10, -0.02, 0.50], poles: { Left: [-0.6, -0.6, -0.3], Right: [0.6, -0.6, 0] }, yaw: 45, u: 1, hold: true }, { t: 1.8, L: [0.28, -0.10, 0.20], R: [0.0, 0.02, 0.10], poles: { Left: [-0.6, -0.6, 0], Right: [0.6, -0.8, -0.2] }, yaw: -45, drop: -0.08, u: 0 }] },
  singlepush: { dur: 2.2, keys: [{ t: 0, L: [0.10, -0.24, 0.24], R: [0.0, 0.0, 0.10], poles: { Left: [-0.6, -0.6, 0], Right: [0.6, -0.8, -0.2] }, yaw: -12, drop: -0.06, u: 0, hold: true }, { t: 0.4, L: [0.04, -0.34, 0.14], R: [-0.06, 0.0, 0.52], poles: { Left: [-0.6, -0.6, -0.3], Right: [0.6, -0.6, 0] }, yaw: 14, u: 1 }, { t: 0.7, L: [0.04, -0.34, 0.14], R: [-0.06, -0.02, 0.50], poles: { Left: [-0.6, -0.6, -0.3], Right: [0.6, -0.6, 0] }, yaw: 18, u: 1, hold: true }, { t: 1.6, L: [0.10, -0.24, 0.24], R: [0.0, 0.0, 0.10], poles: { Left: [-0.6, -0.6, 0], Right: [0.6, -0.8, -0.2] }, yaw: -12, drop: -0.06, u: 0 }] },
  underhand: { dur: 2.4, keys: [{ t: 0, ...TOGETHER(-0.54, 0.22, 0.14), poles: P_DOWN, lean: 34, drop: -0.30, u: 0, hold: true }, { t: 0.45, ...TOGETHER(0.30, 0.34, 0.12), poles: bothDir(1, -0.2, 0), lean: -2, drop: 0.02, u: 1 }, { t: 0.7, ...TOGETHER(0.46, 0.20, 0.12), poles: bothDir(1, 0, 0), lean: -6, drop: 0.02, u: 1, hold: true }, { t: 1.8, ...TOGETHER(-0.54, 0.22, 0.14), poles: P_DOWN, lean: 34, drop: -0.30, u: 0 }] },
  rotoverhead: { dur: 2.5, keys: [{ t: 0, ...TOGETHER(0.50, -0.06, 0.10), poles: bothDir(1, 0, 0.2), yaw: -40, lean: -6, u: 0, hold: true }, { t: 0.42, ...TOGETHER(0.14, 0.48, 0.10), poles: bothDir(1, -0.2, 0), yaw: 25, lean: 10, u: 1 }, { t: 0.7, ...TOGETHER(-0.14, 0.46, 0.10), poles: bothDir(0.8, -0.6, 0), yaw: 40, lean: 16, u: 1, hold: true }, { t: 1.8, ...TOGETHER(0.50, -0.06, 0.10), poles: bothDir(1, 0, 0.2), yaw: -40, lean: -6, u: 0 }] },
  slam: { dur: 2.2, keys: [{ t: 0, ...TOGETHER(0.52, 0.0, 0.10), poles: bothDir(1, 0, 0.2), lean: -6, drop: 0.02, hold: true }, { t: 0.4, ...TOGETHER(-0.56, 0.18, 0.12), poles: P_DOWN, lean: 44, drop: -0.26 }, { t: 0.7, ...TOGETHER(-0.58, 0.16, 0.12), poles: P_DOWN, lean: 46, drop: -0.28, hold: true }, { t: 1.6, ...TOGETHER(0.52, 0.0, 0.10), poles: bothDir(1, 0, 0.2), lean: -6, drop: 0.02 }] },
  backtoss: { dur: 2.4, keys: [{ t: 0, ...TOGETHER(-0.54, 0.22, 0.14), poles: P_DOWN, lean: 34, drop: -0.30, hold: true }, { t: 0.45, ...TOGETHER(0.48, -0.12, 0.12), poles: bothDir(1, 0, 0.2), lean: -14, drop: 0.03 }, { t: 0.7, ...TOGETHER(0.46, -0.20, 0.12), poles: bothDir(1, 0, 0.2), lean: -18, drop: 0.02, hold: true }, { t: 1.8, ...TOGETHER(-0.54, 0.22, 0.14), poles: P_DOWN, lean: 34, drop: -0.30 }] },
  squatthrow: { dur: 2.3, keys: [{ t: 0, ...TOGETHER(-0.20, 0.18, 0.14), poles: bothDir(0.8, -0.6, 0), lean: 18, drop: -0.34, hold: true }, { t: 0.45, ...TOGETHER(0.50, 0.14, 0.12), poles: bothDir(1, -0.2, 0), lean: -2, drop: 0.03 }, { t: 0.7, ...TOGETHER(0.50, 0.12, 0.12), poles: bothDir(1, -0.2, 0), lean: -2, drop: 0.02, hold: true }, { t: 1.7, ...TOGETHER(-0.20, 0.18, 0.14), poles: bothDir(0.8, -0.6, 0), lean: 18, drop: -0.34 }] },
};

/** The trunk's turn split down the chain (the pelvis takes less of it on two feet, none from the knees). */
function trunk(yaw: number, lean: number, kneeling: boolean): Record<string, Deg3> {
  // (kneeling, the pelvis stays square and upright: its legs are posed by bones, and a tilted pelvis would lift the down shin)
  const hipYaw = kneeling ? 0 : 0.35 * yaw, hipLean = kneeling ? 0 : lean * 0.6;
  const rest = yaw - hipYaw;
  return { Hips: [hipLean, hipYaw, 0], Spine: [lean - hipLean + 2, rest * 0.55, 0], Spine1: [0, rest * 0.45, 0], Neck: [-lean * 0.5, -yaw * 0.25, 0] };
}

/** An action in a stance: each key's trunk, the arms turned with it, the stance's legs under it. */
function stanceAction(scene: Scene, sk: Skeleton, name: string, st: StanceId, action: string): AnimationGroup | null {
  const A = ACTIONS[action];
  const keys: ExKey[] = A.keys.map((k) => {
    const g = legs(st, k.u ?? 0);
    const yaw = k.yaw ?? 0;
    // a kneeling body does not sink or fold at the knees: its hips stay where the knees put them; it leans from the hips
    // (on one leg it sinks and folds less: the free leg hangs from the pelvis)
    const drop = g.kneeling ? 0 : st === 'single' ? Math.max(k.drop ?? 0, -0.10) : (k.drop ?? 0);
    const lean = g.kneeling ? Math.min(k.lean ?? 0, 20) : st === 'single' ? Math.min(k.lean ?? 0, 16) : (k.lean ?? 0);
    const bones: Record<string, Deg3> = { ...trunk(yaw, lean, !!g.kneeling), ...g.bones };
    // a flat foot under a sinking body flexes at the ankle (exercise.ts ex_squat: −34° at a 0.40 m sink), or its toes cut the floor
    // and a body driving up through a throw rises onto the balls of its feet (the heels lift with the hips)
    let feet = g.feet;
    for (const s of ['Left', 'Right'] as const) {
      if (!g.feet?.[s] || (st === 'split' && s === 'Right')) continue;
      if (drop < 0) bones[`${s}Foot`] = [((g.bones[`${s}Foot`]?.[0]) ?? 0) + 100 * drop, 0, 0];
      else if (drop > 0) { bones[`${s}Foot`] = [((g.bones[`${s}Foot`]?.[0]) ?? 0) + 30, 0, 0]; const f = g.feet[s]!; feet = { ...feet, [s]: [f[0], f[1] + 2 * drop, f[2]] }; }
    }
    // the hip's forward fold drops the chest; the feet keep their targets (the legs bend to them)
    return {
      t: k.t, hold: k.hold, bones, feet, kneePoles: g.kneePoles, hipsY: g.hipsY + drop, ...(g.hipsX ? { hipsX: g.hipsX } : {}),
      rel: { Left: turnV(k.L, yaw), Right: turnV(k.R, yaw) }, poles: k.poles && { Left: k.poles.Left && turnV(k.poles.Left as V3, yaw), Right: k.poles.Right && turnV(k.poles.Right as V3, yaw) },
    };
  });
  // every move is solved half-way too (as the kit's rep() does), so a planted foot stays planted between two far-apart keys
  const dense: ExKey[] = [];
  keys.forEach((k, i) => {
    dense.push(k);
    const n = keys[i + 1] ?? { ...keys[0], t: A.dur };
    dense.push({ ...mix(k, n, 0.5), t: (k.t + n.t) / 2 });
  });
  return loop(scene, sk, name, A.dur, dense);
}

// ── carries, swings, rotator cuff, halo, side bend ─────────────────────────────────────────────────────────────────
/** A loaded walk in place (exercise.ts ex_carry's step), the arms holding `arms`. */
function carry(scene: Scene, sk: Skeleton, name: string, arms: Pose): AnimationGroup | null {
  const step = (s: 1 | -1, t: number): ExKey => ({
    t, bones: { Hips: [0, 0, 0], Spine: [0, 0, 0], Spine1: [0, 0, 0], Neck: [0, 0, 0], LeftUpLeg: [-22 * s, 0, 0], RightUpLeg: [22 * s, 0, 0], LeftLeg: [s > 0 ? 20 : 6, 0, 0], RightLeg: [s > 0 ? 6 : 20, 0, 0] },
    ...arms, hipsY: -0.01,
  });
  const pass = (t: number, s: 1 | -1): ExKey => ({
    t, bones: { Hips: [0, 0, 0], Spine: [0, 0, 0], Spine1: [0, 0, 0], Neck: [0, 0, 0], [`${s > 0 ? 'Right' : 'Left'}UpLeg`]: [-28, 0, 0], [`${s > 0 ? 'Right' : 'Left'}Leg`]: [40, 0, 0] } as Record<string, Deg3>,
    ...arms, hipsY: 0.0,
  });
  return loop(scene, sk, name, 1.4, [step(1, 0), pass(0.35, 1), step(-1, 0.7), pass(1.05, -1)]);
}
/** A slow loaded march in place: one knee driven to hip height and set down, then the other, the arms holding `arms`. */
function march(scene: Scene, sk: Skeleton, name: string, arms: Pose): AnimationGroup | null {
  const up = (s: Side): ExKey => {
    const down: Side = s === 'Left' ? 'Right' : 'Left';
    return { t: 0, bones: { Hips: [0, 0, 0], Spine: [0, 0, 0], Neck: [0, 0, 0], [`${s}UpLeg`]: [-84, 0, 0], [`${s}Leg`]: [92, 0, 0], [`${s}Foot`]: [-6, 0, 0] } as Record<string, Deg3>, feet: { [down]: [down === 'Left' ? -0.11 : 0.11, ANKLE, 0.04] } as Pair, kneePoles: bothDir(0, 0, 1), ...arms, hipsY: 0 };
  };
  const mid: ExKey = { t: 0, bones: { Hips: [0, 0, 0], Spine: [0, 0, 0], Neck: [0, 0, 0] }, feet: both(0.11, ANKLE, 0.04), kneePoles: bothDir(0, 0, 1), ...arms, hipsY: 0 };
  return loop(scene, sk, name, 2.4, [{ ...mid, t: 0 }, { ...up('Left'), t: 0.6, hold: true }, { ...up('Left'), t: 0.8, hold: true }, { ...mid, t: 1.2 }, { ...up('Right'), t: 1.8, hold: true }, { ...up('Right'), t: 2.0, hold: true }]);
}
const ARMS_SIDES: Pose = { hands: both(0.26, 0.80, 0.02), poles: bothDir(0.3, -0.2, -0.9) };
/** The front rack: the fists at the collarbones, close in, the elbows down and tucked (lower than the press's start). */
const ARMS_RACK: Pose = { rel: { Left: [0.09, -0.08, 0.15], Right: [-0.09, -0.08, 0.15] }, poles: bothDir(0.2, -1, 0.2) };
const ARMS_OVERHEAD: Pose = { rel: OVERHEAD, poles: bothDir(1, 0.1, -0.1) };

/** The kettlebell swing: a hinge, the bell swung back between the legs and snapped forward to chest height by the hips. */
function swing(scene: Scene, sk: Skeleton, name: string, oneArm: boolean): AnimationGroup | null {
  const feet = both(0.20, ANKLE, 0.10);
  const back = (hands: Pair): ExKey => ({ t: 0, bones: { Hips: [58, 0, 0], Spine: [4, 0, 0], Neck: [-30, 0, 0] }, feet, kneePoles: bothDir(0.2, 0, 1), rel: hands, poles: bothDir(0.2, 0, -1), hipsY: -0.14 });
  const top = (hands: Pair): ExKey => ({ t: 0, bones: { Hips: [-2, 0, 0], Spine: [0, 0, 0], Neck: [0, 0, 0] }, feet, kneePoles: bothDir(0.2, 0, 1), rel: hands, poles: bothDir(0.4, -1, 0), hipsY: 0 });
  const two = (y: number, z: number): Pair => ({ Left: [0.12, y, z], Right: [-0.12, y, z] });
  const R = (p: Pair): Pair => (oneArm ? { Right: [-0.02, p.Right![1], p.Right![2]], Left: [0.04, -0.46, 0.10] } : p);
  return loop(scene, sk, name, 1.6, [
    { ...back(R(two(-0.50, -0.20))), t: 0, hold: true }, { ...top(R(two(-0.40, 0.30))), t: 0.35 }, { ...top(R(two(-0.10, 0.50))), t: 0.55, hold: true },
    { ...top(R(two(-0.40, 0.30))), t: 0.85 }, { ...back(R(two(-0.46, 0.10))), t: 1.15 },
  ]);
}

/** Rotator cuff, elbow pinned at the side bent to 90°: the forearm turns from across the belly out to the side (external
 *  rotation) — the internal rotation is the same arc the other way. The right arm works; the left hangs. */
function cuffSide(scene: Scene, sk: Skeleton, name: string, external: boolean, st: StanceId): AnimationGroup | null {
  const g = legs(st, 0);
  const inn: V3 = [-0.24, -0.27, 0.14], out: V3 = [0.12, -0.27, 0.20];
  const key = (R: V3, t: number): ExKey => ({ t, hold: true, bones: { Hips: [0, 0, 0], Spine: [2, 0, 0], Neck: [0, 0, 0], ...g.bones }, feet: g.feet, kneePoles: g.kneePoles, hipsY: g.hipsY, rel: { Right: R }, hands: { Left: [HANG.Left![0], HANG.Left![1] + g.hipsY, HANG.Left![2]] }, poles: { Right: [0.3, -1, -0.3], Left: HANG_POLES.Left } });
  const [a, b] = external ? [inn, out] : [out, inn];
  return loop(scene, sk, name, 2.4, [key(a, 0), key(b, 0.9), key(b, 1.3)]);
}
/** Rotator cuff with the upper arm out level with the shoulder, the elbow at 90°: the forearm turns from pointing forward
 *  up to pointing at the ceiling (external) — or down from the ceiling (internal). */
function cuff90(scene: Scene, sk: Skeleton, name: string, external: boolean, st: StanceId): AnimationGroup | null {
  const g = legs(st, 0);
  const fwd: V3 = [0.26, 0.0, 0.24], up: V3 = [0.26, 0.26, -0.02];
  const key = (R: V3, t: number): ExKey => ({ t, hold: true, bones: { Hips: [0, 0, 0], Spine: [2, 0, 0], Neck: [0, 0, 0], ...g.bones }, feet: g.feet, kneePoles: g.kneePoles, hipsY: g.hipsY, rel: { Right: R }, hands: { Left: [HANG.Left![0], HANG.Left![1] + g.hipsY, HANG.Left![2]] }, poles: { Right: [0.4, -1, -0.4], Left: HANG_POLES.Left } });
  const [a, b] = external ? [fwd, up] : [up, fwd];
  return loop(scene, sk, name, 2.4, [key(a, 0), key(b, 0.9), key(b, 1.3)]);
}

/** The halo: a weight held in both hands circled round the head, at the back of the neck half-way, then the other way. */
function halo(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const at = (deg: number, t: number): ExKey => {
    const r = (deg * Math.PI) / 180, c: V3 = [0.26 * Math.sin(r), 0.14, 0.24 * Math.cos(r)];
    return { t, bones: { Hips: [0, 0, 0], Spine: [2, 0, 0], Neck: [0, 0, 0] }, feet: STANCE, rel: { Left: [c[0] + 0.14, c[1], c[2]], Right: [c[0] - 0.14, c[1], c[2]] }, poles: bothDir(1, -0.2, 0.2), hipsY: 0 };
  };
  return loop(scene, sk, 'ex_halo', 4.0, [at(0, 0), at(90, 0.5), at(180, 1.0), at(270, 1.5), at(360, 2.0), at(270, 2.5), at(180, 3.0), at(90, 3.5)]);
}

/** The standing side bend: a weight in the right hand, the trunk bends sideways down toward it and back up past straight. */
function sideBend(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const at = (deg: number, t: number): ExKey => ({ t, hold: true, bones: { Hips: [0, 0, 0], Spine: [2, 0, -deg * 0.55], Spine1: [0, 0, -deg * 0.45], Neck: [0, 0, deg * 0.2] }, feet: STANCE, rel: { Right: [0.0, -0.50, 0.04], Left: [0.10, -0.20, 0.10] }, poles: { Right: [0.3, 0, -1], Left: [-0.6, -0.8, 0] }, hipsY: 0 });
  return loop(scene, sk, 'ex_side_bend', 3.0, [at(0, 0), at(32, 1.0), at(32, 1.3), at(-10, 2.2)]);
}

/** The single-arm standing cable press / row: the right hand pushes from the chest out in front (or pulls from out in front to
 *  the ribs), the left at the side, a staggered stance. */
function cableOne(scene: Scene, sk: Skeleton, name: string, press: boolean): AnimationGroup | null {
  const g = legs('split', 0);
  const chest: V3 = [0.0, -0.18, 0.12], out: V3 = [-0.04, -0.16, 0.52], ribs: V3 = [0.02, -0.30, -0.10];
  const [a, b] = press ? [chest, out] : [out, ribs];
  const key = (R: V3, t: number, pole: V3): ExKey => ({ t, hold: true, bones: { Hips: [4, 0, 0], Spine: [2, 0, 0], Neck: [0, 0, 0], ...g.bones }, feet: g.feet, kneePoles: g.kneePoles, hipsY: g.hipsY, rel: { Right: R }, hands: { Left: [HANG.Left![0], HANG.Left![1] + g.hipsY, HANG.Left![2]] }, poles: { Right: pole, Left: HANG_POLES.Left } });
  return loop(scene, sk, name, 2.2, [key(a, 0, [0.6, -0.8, -0.2]), key(b, 0.8, press ? [0.6, -0.6, 0] : [0.3, 0.4, -1]), key(b, 1.2, press ? [0.6, -0.6, 0] : [0.3, 0.4, -1])]);
}

type Builder = (scene: Scene, sk: Skeleton) => AnimationGroup | null;
const STANCE_SUFFIX: Readonly<Record<StanceId, string>> = { standing: 'standing', halfkneel: 'hk', tallkneel: 'tk', split: 'split', lateral: 'lateral', single: 'single', stepin: 'stepin' };
/** The (action, stance) pairs the library names: anti-rotation in six stances, throws in six (the single-arm push has no one-leg version). */
export const STANCE_ACTIONS: readonly [string, StanceId][] = [
  ...(['pallofpress', 'pallofhold', 'pallofoverhead', 'pallofrotate'] as const).flatMap((a) => (['standing', 'halfkneel', 'tallkneel', 'split', 'lateral', 'single'] as const).map((s): [string, StanceId] => [a, s])),
  ...(['chest', 'overhead', 'scoop', 'shotput', 'sidetoss', 'underhand', 'singlepush', 'rotoverhead'] as const).flatMap((a) => (['standing', 'tallkneel', 'halfkneel', 'split', 'stepin', 'single'] as const).filter((s) => !(a === 'singlepush' && s === 'single')).map((s): [string, StanceId] => [a, s])),
  ['chop', 'halfkneel'], ['lift', 'halfkneel'], ['chop', 'standing'], ['lift', 'standing'],
  ['slam', 'standing'], ['backtoss', 'standing'], ['squatthrow', 'standing'],
];
export const stanceActionClip = (action: string, st: StanceId): string => `ex_${action}_${STANCE_SUFFIX[st]}`;

export const ATHLETIC_BUILDERS: readonly [string, Builder][] = [
  ...STANCE_ACTIONS.map(([a, s]): [string, Builder] => [stanceActionClip(a, s), (scene, sk) => stanceAction(scene, sk, stanceActionClip(a, s), s, a)]),
  ['ex_carry_rack', (scene, sk) => carry(scene, sk, 'ex_carry_rack', ARMS_RACK)],
  ['ex_carry_overhead', (scene, sk) => carry(scene, sk, 'ex_carry_overhead', ARMS_OVERHEAD)],
  ['ex_march_carry', (scene, sk) => march(scene, sk, 'ex_march_carry', ARMS_SIDES)],
  ['ex_march_rack', (scene, sk) => march(scene, sk, 'ex_march_rack', ARMS_RACK)],
  ['ex_march_overhead', (scene, sk) => march(scene, sk, 'ex_march_overhead', ARMS_OVERHEAD)],
  ['ex_kb_swing', (scene, sk) => swing(scene, sk, 'ex_kb_swing', false)],
  ['ex_kb_swing_one', (scene, sk) => swing(scene, sk, 'ex_kb_swing_one', true)],
  ['ex_er_side', (scene, sk) => cuffSide(scene, sk, 'ex_er_side', true, 'standing')],
  ['ex_ir_side', (scene, sk) => cuffSide(scene, sk, 'ex_ir_side', false, 'standing')],
  ['ex_er_90', (scene, sk) => cuff90(scene, sk, 'ex_er_90', true, 'standing')],
  ['ex_ir_90', (scene, sk) => cuff90(scene, sk, 'ex_ir_90', false, 'standing')],
  ['ex_er_90_hk', (scene, sk) => cuff90(scene, sk, 'ex_er_90_hk', true, 'halfkneel')],
  ['ex_ir_90_hk', (scene, sk) => cuff90(scene, sk, 'ex_ir_90_hk', false, 'halfkneel')],
  ['ex_er_side_split', (scene, sk) => cuffSide(scene, sk, 'ex_er_side_split', true, 'split')],
  ['ex_ir_side_split', (scene, sk) => cuffSide(scene, sk, 'ex_ir_side_split', false, 'split')],
  ['ex_halo', halo],
  ['ex_side_bend', sideBend],
  ['ex_cable_press_one', (scene, sk) => cableOne(scene, sk, 'ex_cable_press_one', true)],
  ['ex_cable_row_one', (scene, sk) => cableOne(scene, sk, 'ex_cable_row_one', false)],
];
