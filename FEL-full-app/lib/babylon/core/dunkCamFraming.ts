// CAMERA TIP (2026-10-29): the dunk contest's four ugly views — CAMERA-VIEW-AUDIT-2026-10-29 and AM's visual QA (REPORT.md items
// 1-3 and 8) — behind ONE knob, `cam.dunkFraming`, default OFF. Off, every function here hands back exactly what DunkMode used
// before (the 2K High feel stays the default; Elijah's camera picks are pending). Pure: no scene, no camera, testable alone.
// Every number is TUNE (the audit's band / AM's suggested ranges), not measured on device.
import { feel } from '../../feel-panel/feel';
import { RIM_HEIGHT_M } from './courtDims';

/** `cam.dunkFraming` default: off. */
export const CAM_DUNK_FRAMING_ON = 0;
export function dunkFramingOn(): boolean {
  return feel('cam.dunkFraming', CAM_DUNK_FRAMING_ON) >= 0.5;
}

export interface V3 { x: number; y: number; z: number }
/** A tall (portrait) screen: width / height under 1. */
export const isTall = (aspect: number): boolean => Number.isFinite(aspect) && aspect > 0 && aspect < 1;

// ── 1. THE SLAM / HANG RIM CUT on a phone (QA 1): pulled back so the dunker AND the rim read, aimed between them ──
/** Today's rim cut, unchanged: rim + (2.9, 1.15 m up, 1.9), aim height 1.5 (DunkMode). */
export const RIM_CUT_OFFSET = { x: 2.9, y: 1.15, z: 1.9 } as const;
export const RIM_CUT_AIM_H = 1.5;
/** TUNE: extra distance on a tall screen (QA: "add ~1.5–2 m of distance" — distance, not FOV, so fovGather's pinch is untouched). */
export const TALL_SLAM_PULL_M = 1.75;
/** TUNE: the camera at least level with the iron (audit #4: y ≥ 3.0, rim 3.05), looking across it, not up through the net. */
export const TALL_SLAM_MIN_Y = 3.1;
/** The aim between the dunker's chest (~1.4 m) and the rim (QA 1: "offset the look-at between the player's chest and the rim"). */
export const SLAM_AIM_BETWEEN_H = (1.4 + RIM_HEIGHT_M) / 2;

export function rimCutSpot(rim: V3, aspect: number, on = dunkFramingOn()): { at: V3; aimH: number } {
  const base = { x: rim.x + RIM_CUT_OFFSET.x, y: RIM_CUT_OFFSET.y, z: rim.z + RIM_CUT_OFFSET.z };
  if (!on || !isTall(aspect)) return { at: base, aimH: RIM_CUT_AIM_H };
  const dx = RIM_CUT_OFFSET.x, dz = RIM_CUT_OFFSET.z, len = Math.hypot(dx, dz);
  const k = (len + TALL_SLAM_PULL_M) / len;
  return { at: { x: rim.x + dx * k, y: Math.max(TALL_SLAM_MIN_Y, base.y), z: rim.z + dz * k }, aimH: SLAM_AIM_BETWEEN_H };
}

// ── 2. THE RESET CAM UNDER THE HOOP (QA 2): never inside the stanchion / pad / board box, and raised ──
/** TUNE: the hoop's keep-out box about the backboard face (venuePropSets DUNK_BACKBOARD_Z; stanchion foot −11.6): the pole and
 *  pad sit 0.9 m behind the glass, the board and arm ±0.95 m across; the camera keeps OCCLUSION_MARGIN 0.6 m off it. */
export const HOOP_KEEP_OUT = { halfX: 0.95, behindM: 1.3, frontM: 0.25, topY: 4.0, margin: 0.6 } as const;
/** TUNE: the reset / verdict camera at least this high near the hoop (QA 2: "raise the reset cam so the rim isn't cropped"). */
export const RESET_MIN_Y = 2.6;
/** Within this horizontal distance in front of the glass the camera is "under the hoop". */
export const UNDER_HOOP_M = 2.4;

/** The camera position, pushed out IN FRONT of the board (toward the court, +z) and raised when it sits in or under the hoop. */
export function clearOfHoop(cam: V3, backboardZ: number, on = dunkFramingOn()): V3 {
  if (!on) return cam;
  const k = HOOP_KEEP_OUT;
  const nearX = Math.abs(cam.x) < k.halfX + k.margin;
  const inBox = nearX && cam.z < backboardZ + k.frontM + k.margin && cam.z > backboardZ - k.behindM - k.margin && cam.y < k.topY + k.margin;
  const under = nearX && cam.z >= backboardZ && cam.z < backboardZ + UNDER_HOOP_M;
  if (!inBox && !under) return cam;
  return { x: cam.x, y: Math.max(cam.y, RESET_MIN_Y), z: Math.max(cam.z, backboardZ + UNDER_HOOP_M) };
}

// ── 3 + 8. THE RUN-UP FOLLOW (the contest preset: 5.6 m back, 1.7 m up) ──
/** Today's 'contest' preset distance / height (CameraDirector FOLLOW_PRESETS.contest), repeated for the overlay. */
export const CONTEST_FOLLOW = { distance: 5.6, height: 1.7, pitchCapDeg: 12 } as const;
/** TUNE: over the shoulder (QA 3): up ~1 m, back ~1.5 m, and a pitch cap that lets it tilt down to the player. */
export const SHOULDER_UP_M = 1.0, SHOULDER_BACK_M = 1.5, SHOULDER_PITCH_CAP_DEG = 20;
/** TUNE: the phone idle (QA 8): ~3 m closer than the shoulder framing, aimed a bit higher (more look-ahead toward the rim). */
export const TALL_IDLE_CLOSER_M = 3.0, TALL_IDLE_LOOK_AHEAD = 1.6;
/** Standing still: under this speed on the runway is the idle / start view. */
export const IDLE_SPEED_MPS = 0.4;

export type FollowTune = { distance?: number; height?: number; pitchCapDeg?: number; lookAhead?: number };
/** The follow overlay for the run-up, or null (no overlay — today's preset) with the knob off or outside the run-up. */
export function runUpTune(opts: { runUp: boolean; speed: number; aspect: number }, on = dunkFramingOn()): FollowTune | null {
  if (!on || !opts.runUp) return null;
  const shoulder = { distance: CONTEST_FOLLOW.distance + SHOULDER_BACK_M, height: CONTEST_FOLLOW.height + SHOULDER_UP_M, pitchCapDeg: SHOULDER_PITCH_CAP_DEG };
  if (isTall(opts.aspect) && opts.speed < IDLE_SPEED_MPS) return { ...shoulder, distance: shoulder.distance - TALL_IDLE_CLOSER_M, lookAhead: TALL_IDLE_LOOK_AHEAD };
  return shoulder;
}
/** A stable key for a tune (so DunkMode re-applies it only on change). */
export const tuneKey = (t: FollowTune | null): string => (t ? JSON.stringify(t) : '');
