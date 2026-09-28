// calibration — the athlete's own standing lines, read before anything is scored (spec §3.3).
//
// Every test is scored against the person in front of the camera, not against a textbook body: the floor line the feet
// leave and land on, the standing body height every "share of body height" is measured in, the hip width, and the
// NEUTRAL knee and pelvis. A bow-legged or knock-kneed stance is that athlete's zero, so a knee that sits 4° in while
// standing still is not scored as 4° of valgus in a single-leg squat (spec §3.3 step 1).
//
//   front  stand still, facing the camera, arms by the sides, 3 s  → floor, body height, hips, FPPA and pelvic baselines
//   side   stand still side-on, 2 s                                 → the side view's floor and heel lines, facing
//
// Medians throughout, so a single bad frame moves nothing. A hold that sways more than calib.maxSway of the body's height
// is refused (the athlete is told to stand still), because a baseline read mid-shuffle would be a wrong zero for every
// test after it.
//
// Pure: frames in, lines out. Nothing is stored beyond the session (these are numbers about a body, held in memory).
import { CORE_POINTS, NOSE, type PoseFrame } from '@/lib/pose/landmarks';
import { sideWidth, SIDE_WIDTH_MAX } from '@/lib/mirror/framing';
import {
  facingSign, fppa, footLowY, hipMidY, nearSide, pelvicTilt, visible, weightShift, worldHeight,
} from './geometry';
import { th } from './thresholds';
import type { Side } from './protocol';

export interface PerSide<T> { left: T; right: T }

export interface FrontCalibration {
  /** Each foot's lowest point standing (image y, down): its own floor line. */
  footFloorY: PerSide<number>;
  /** Each heel standing. */
  heelFloorY: PerSide<number>;
  /** The lower of the two floor lines. */
  floorY: number;
  /** Nose to floor, image-height units: the ruler every "share of body height" uses. */
  bodyHeight: number;
  /** Standing hip midpoint y. */
  hipY: number;
  /** Hip joint to ankle, standing (image y), per leg: the front view's depth estimate reads against it. */
  legY: PerSide<number>;
  /** Hip width, normalised x. */
  hipWidth: number;
  /** Neutral FPPA per knee, standing (deg). */
  fppa: PerSide<number>;
  /** Pelvic tilt standing on two feet, read for each stance leg (deg). */
  pelvicTilt: PerSide<number>;
  /** Hip midpoint against the ankle midpoint, standing, in hip widths. */
  shift: number;
  /** Nose to floor in world metres, when the frames carried world landmarks; null otherwise. */
  worldHeight: number | null;
  frames: number;
}

export interface SideCalibration {
  floorY: number;
  heelFloorY: PerSide<number>;
  bodyHeight: number;
  hipY: number;
  /** Which way the athlete faced (+1 image-right, −1 image-left) and which side was nearer the lens. */
  facing: 1 | -1;
  near: Side;
  frames: number;
}

export interface Calibration {
  aspect: number;
  front: FrontCalibration | null;
  side: SideCalibration | null;
}

export type CalibrationResult<T> = { ok: true; value: T } | { ok: false; why: string };

const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b), m = s.length >> 1;
  return s.length === 0 ? NaN : s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const perSide = <T>(f: (s: Side) => T): PerSide<T> => ({ left: f('left'), right: f('right') });

/** The frames a calibration can read: a body, its core points seen. */
function usable(frames: readonly PoseFrame[]): PoseFrame[] {
  const vis = th('gate.visibility');
  return frames.filter((f) => f.present && f.image.length >= 33 && visible(f.image, CORE_POINTS, vis));
}

/** How far the hips wandered during the hold, in body heights (image-height units, x scaled by aspect). */
function sway(frames: readonly PoseFrame[], aspect: number, bodyHeight: number): number {
  const xs = frames.map((f) => ((f.image[23].x + f.image[24].x) / 2) * aspect), ys = frames.map((f) => hipMidY(f.image));
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / bodyHeight;
}

/** Enough of the hold was seen: at least 60% of the frames a `ms`-long hold at the delivered rate would have. */
function enough(all: readonly PoseFrame[], good: readonly PoseFrame[], ms: number): boolean {
  if (all.length < 2) return false;
  const span = all[all.length - 1].t - all[0].t;
  return span >= ms * 0.9 && good.length >= Math.max(5, all.length * 0.6);
}

/**
 * `ms` and `maxSway` default to the register's; a replay of a recorded stream that never stood still for three seconds
 * (the owner's jump takes start mid-dip) passes its own, and says so where it does.
 */
export function calibrateFront(frames: readonly PoseFrame[], aspect: number, ms = th('calib.frontMs'), maxSway = th('calib.maxSway')): CalibrationResult<FrontCalibration> {
  const good = usable(frames).filter((f) => {
    const w = sideWidth({ landmarks: f.image });
    return w === null || w >= SIDE_WIDTH_MAX;          // facing the camera, not side-on
  });
  if (!enough(frames, good, ms)) return { ok: false, why: 'Stand still facing the camera, whole body in the shot, for three seconds.' };
  const footFloorY = perSide((s) => median(good.map((f) => footLowY(f.image, s))));
  const floorY = Math.max(footFloorY.left, footFloorY.right);
  const bodyHeight = floorY - median(good.map((f) => f.image[NOSE].y));
  if (!(bodyHeight > 0.2)) return { ok: false, why: 'Step back so your whole body, head to feet, is in the shot.' };
  if (sway(good, aspect, bodyHeight) > maxSway) return { ok: false, why: 'Hold still for a moment, arms by your sides.' };
  const hipY = median(good.map((f) => hipMidY(f.image)));
  return {
    ok: true,
    value: {
      footFloorY, floorY, bodyHeight, hipY,
      heelFloorY: perSide((s) => median(good.map((f) => f.image[s === 'left' ? 29 : 30].y))),
      legY: perSide((s) => median(good.map((f) => f.image[s === 'left' ? 27 : 28].y - f.image[s === 'left' ? 23 : 24].y))),
      hipWidth: median(good.map((f) => Math.abs(f.image[23].x - f.image[24].x))),
      fppa: perSide((s) => median(good.map((f) => fppa(f.image, s, aspect)))),
      pelvicTilt: perSide((s) => median(good.map((f) => pelvicTilt(f.image, s, aspect)))),
      shift: median(good.map((f) => weightShift(f.image))),
      worldHeight: ((): number | null => {
        const w = good.map((f) => worldHeight(f.world)).filter((x): x is number => x !== null);
        return w.length >= good.length / 2 ? median(w) : null;
      })(),
      frames: good.length,
    },
  };
}

export function calibrateSide(frames: readonly PoseFrame[], aspect: number, ms = th('calib.sideMs')): CalibrationResult<SideCalibration> {
  const good = usable(frames).filter((f) => {
    const w = sideWidth({ landmarks: f.image });
    return w !== null && w < SIDE_WIDTH_MAX && facingSign(f.image) !== 0;
  });
  if (!enough(frames, good, ms)) return { ok: false, why: 'Turn side-on and stand still for two seconds.' };
  const faces = good.map((f) => facingSign(f.image));
  const facing: 1 | -1 = faces.filter((x) => x > 0).length >= faces.length / 2 ? 1 : -1;
  const floorY = median(good.map((f) => Math.max(footLowY(f.image, 'left'), footLowY(f.image, 'right'))));
  const bodyHeight = floorY - median(good.map((f) => f.image[NOSE].y));
  if (!(bodyHeight > 0.2)) return { ok: false, why: 'Step back so your whole body, head to feet, is in the shot.' };
  if (sway(good, aspect, bodyHeight) > th('calib.maxSway')) return { ok: false, why: 'Hold still for a moment.' };
  const nears = good.map((f) => nearSide(f.image));
  return {
    ok: true,
    value: {
      floorY, bodyHeight, facing,
      heelFloorY: perSide((s) => median(good.map((f) => f.image[s === 'left' ? 29 : 30].y))),
      hipY: median(good.map((f) => hipMidY(f.image))),
      near: nears.filter((n) => n === 'left').length >= nears.length / 2 ? 'left' : 'right',
      frames: good.length,
    },
  };
}

/** Frames from `from` for `ms` of capture time (the calibration window of a replayed capture). */
export function window(frames: readonly PoseFrame[], ms: number, from = frames[0]?.t ?? 0): PoseFrame[] {
  return frames.filter((f) => f.t >= from && f.t <= from + ms);
}
