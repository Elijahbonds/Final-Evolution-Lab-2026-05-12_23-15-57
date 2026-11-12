// The dragon ride's numbers (DRAGON-RIDE-COMBO-2026-10-23 §0 and the Phase4 build notes). Every value is measured (cited), a
// verified base rule, or marked TUNE (a PM call Elijah can overrule). Art: the v5 GLBs (phase4-swoop p4s5), 24 fps.
//
// Pure: no Babylon. The measured per-frame tables below were read off the v5 GLBs (FK + linear-blend skinning at 24 fps, every
// LOD) and are re-derived from the shipped GLBs by the DR-* tests, so a re-export that moves the mesh fails a test.
import { RIM_HEIGHT_M } from '../core/courtDims';
import { RIM_REACH } from '../core/DriveFlight';
import { RIM_HOLD_DIP_M } from '../core/DunkHands';
import { GRAVITY } from '../core/DunkLob';
import { POWER_HANG_HAND_Y, POWER_SLAM_HAND_Y } from '../anim/authored/dunkFinishes';

export { RIM_HEIGHT_M, RIM_REACH, RIM_HOLD_DIP_M, GRAVITY, POWER_HANG_HAND_Y, POWER_SLAM_HAND_Y };

// ── art ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const DRAGON_GLB_DIR = '/models/dragon/';
/** LOD0 / LOD1 / LOD2 (v5 p4s5: 30,802 / 10,350 / 3,389 tris). */
export const DRAGON_GLB_FILES = ['fel-dragon-p4s5-lod0.glb', 'fel-dragon-p4s5-lod1.glb', 'fel-dragon-p4s5-lod2.glb'] as const;
/** The rider is the repo's own hero (CLOSED in the spec: the repo copy ships). */
export const RIDER_GLB = '/models/elijah-hero.glb';
export const DR_SEAT = 'DR_Seat', DR_ROOT = 'DR_Root';
export const DRAGON_FPS = 24;

export type DragonClip =
  | 'DR_Idle_Coil' | 'DR_Glide_Loop' | 'DR_Surf_Loop' | 'DR_Mount' | 'DR_Dive' | 'DR_LaunchOff' | 'DR_Swoop_Dunk' | 'DR_JumpOff_Pass';
/** Last frame of each clip at 24 fps (clip seconds × 24). */
export const CLIP_FRAMES: Readonly<Record<DragonClip, number>> = Object.freeze({
  DR_Idle_Coil: 48, DR_Glide_Loop: 24, DR_Surf_Loop: 32, DR_Mount: 20, DR_Dive: 20, DR_LaunchOff: 16, DR_Swoop_Dunk: 24, DR_JumpOff_Pass: 32,
});
/** The clips whose feet are on the floor (the v5 ground-contact pass): everything else is placed by the code's flight path. */
export const GROUNDED_CLIPS: readonly DragonClip[] = ['DR_Idle_Coil', 'DR_Mount', 'DR_LaunchOff'];

/** Morph target order on every LOD (mesh extras.targetNames). */
export const MORPH = Object.freeze({ wing_to_fin: 0, tail_fin: 1, water_spots: 2, corr_tuck_legs: 3, corr_wing_fold: 4 });
export const MORPH_NAMES = ['wing_to_fin', 'tail_fin', 'water_spots', 'corr_tuck_legs', 'corr_wing_fold'] as const;

// ── beats (frames, measured on the clips) ──────────────────────────────────────────────────────────────────────────────────
/** Mount: the rider parents to DR_Seat at f12 (the seat's dip) and stays parented. */
export const MOUNT_LOCK_F = 12;
/** v5 seat at the Mount f12 lock per LOD (FK; QC v5). Code reads DR_Seat, never these — they are the test's reference. */
export const MOUNT_LOCK_SEAT_Y = [1.764, 1.769, 1.816] as const;
export const SWOOP_CONTACT_F = 16;
export const JUMPOFF_RELEASE_F = 14;
/** Dive clip 0.833 s (f0–20); LaunchOff 0.667 s (f0–16). */
export const DIVE_CLIP_SEC = 20 / 24, LAUNCHOFF_CLIP_SEC = 16 / 24;

// ── margins (PM calls, TUNE) ───────────────────────────────────────────────────────────────────────────────────────────────
export const DR_FLOOR_MARGIN_M = 0.10;   // TUNE: flying body above the floor / water
export const DR_HOOP_MARGIN_M = 0.15;    // TUNE: from the backboard, rim, net and pole
/** TUNE: rider-foot ↔ DR_Seat tolerance (DR-H1 / DR-M1: ≤ 1 mm). */
export const DR_SEAT_TOL_M = 0.001;
/** TUNE (v5 proposal): grounded frames have their lowest vertex in [0, +0.02]. */
export const GROUNDED_BAND_M = [0, 0.02] as const;

// ── the dunk band (arithmetic, Phase4 notes) ───────────────────────────────────────────────────────────────────────────────
/** Feet band where the hang hand is within [rim, rim + RIM_REACH]: rim − hang offset … rim + reach − hang offset (0.97 … 1.32). */
export const HANG_FEET_MIN = RIM_HEIGHT_M - POWER_HANG_HAND_Y;
export const HANG_FEET_MAX = RIM_HEIGHT_M + RIM_REACH - POWER_HANG_HAND_Y;
/** Feet ceiling for a slam that ends through the iron: rim + hold dip − slam offset (1.30). */
export const SLAM_FEET_MAX = RIM_HEIGHT_M + RIM_HOLD_DIP_M - POWER_SLAM_HAND_Y;

// ── swoop (option A) ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** Proposed swoop contact seat (top of the 0.97–1.30 band). */
export const SWOOP_SEAT_Y = 1.30;
/** QC v5: horizontal seat → rim centre at contact (LOD0), and the pass speed along the board on the court side (TUNE). */
export const SWOOP_SEAT_TO_RIM_M = 0.849;
/** TUNE: the DRAGON's flight speed past the hoop = 3D Art's QC reference path, 8 m/s along +X (QC v2; RE-SPEC "Pass speed" row,
 *  a TUNE reference). PM's 3.22 m/s (5:50 PM PT) is the RIDER's lateral leap (RE-SPEC: 1.28 m / 0.398 s); flying the dragon at 3.22
 *  makes it hit the dunk hoop (DR-J2 f30: 0 m) and opens its wings inside the hoop window (DR-J11 f4 span 2.09; DR-H14 f2), so the
 *  dragon keeps the QC path (PM 5:57 PM PT). The rider's sideways speed is solved in jumpOffDunk (RIDER_LEAP_LATERAL_MPS). */
export const DR_PASS_SPEED_MPS = 8;
/** TUNE (PM 5:50 PM PT): Glide cruise, = the existing Ride flight ([SBR] §4c L242). */
export const GLIDE_CRUISE_MPS = 14;
/** TUNE: the slam read around the swoop's contact (frames). */
export const SWOOP_SLAM_WINDOW_F = [12, 19] as const;

// ── jump-off (option B) ────────────────────────────────────────────────────────────────────────────────────────────────────
/** Level pass seat (LOD0 2.096 ≥ 1.974 + 0.10). */
export const JUMPOFF_SEAT_Y = 2.096;
/** QC v3: horizontal seat → rim at release (LOD0). */
export const DR_RELEASE_DIST_M = 1.28;
/** TUNE (PM 5:50 PM PT): the up-kick lasts 0.10 s (rise and back to seat height), so its speed is g·t/2. */
export const DR_UPKICK_SEC = 0.10;
export const DR_UPKICK_MPS = (GRAVITY * DR_UPKICK_SEC) / 2;
/** TUNE: the feet height the arc meets the hang at (inside 0.97–1.30). */
export const JUMPOFF_HANG_FEET_Y = 1.20;
/** TUNE (PM 5:50 PM PT): the dragon dunk's base hang, = RIM_HANG.ms 360 (core/DriveFlight.ts:48); the pump adds PUMP_EXTRA_MS. */
export const DR_BASE_HANG_SEC = 0.36;
// Slam hold: core/slamPress's SlamLatch.open takes the hold as a PARAMETER and has no default to import (RE-SPEC: TUNE), so
// SwoopDunk / JumpOffDunk take it from their caller; nothing here invents one.
/** TUNE: folded-wing span ceiling while near the hoop (v3 LOD0 1.431 + 0.02). */
export const FOLDED_SPAN_MAX_M = 1.431 + 0.02;
/** TUNE: DR-J11's span tolerance over each LOD's v3 folded span (1.431 / 1.429 / 1.499). */
export const J11_SPAN_TOL_M = 0.02;
/** Folded-wing top over the seat (v3/v5 measured 1.344) and its TUNE tolerance (DR-H14). */
export const FOLDED_TOP_M = 1.344, FOLDED_TOP_TOL_M = 0.01;

// ── dive ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const DIVE_DEPTH_M = 4.0;            // TUNE
export const DIVE_PITCH_DEG = 30;           // TUNE (nose down)
export const DIVE_SEC = DIVE_CLIP_SEC;      // TUNE (default = the clip, so the fold and the drop line up)
export const DIVE_PULLUP_SEC = LAUNCHOFF_CLIP_SEC;

// ── surf morphs ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const SURF_FIN_IN_SEC = 0.25, SURF_SPOTS_IN_SEC = 0.4, SURF_FIN_OUT_SEC = 0.25, SURF_SPOTS_HOLD_SEC = 1.5, SURF_SPOTS_OUT_SEC = 1.0;   // TUNE

// ── corrective drivers (measured endpoints, v3) ────────────────────────────────────────────────────────────────────────────
export const TUCK_THIGH_X_DEG = -114.3;   // DR_HindThigh_L, Swoop f0 → f16
export const FOLD_WING_X_DEG = 85.3;      // DR_WingUpper_L, Swoop f0 → f6
export const FOLD_KNEE = 0.75;            // TUNE (QC-authored smoothstep knee)
/** TUNE (a PM call Elijah can overrule; PM ruling 5:44 PM PT): DR-M3 measures a code-driven partial fold against the keyed skin,
 *  limit 0.08 m. Measured worst on v5: 0.072 m (JumpOff f26) / 0.066 m (Swoop f4). */
export const DR_M3_THROW_M = 0.08;

// ── LOD ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Switch distances and the grounded hero range are TUNE with no source (RE-SPEC); the caller passes them (dragonLod's LodRanges).

// ── flight floor (v5, measured; min code seat = max over frames of (seat − lowest) + 0.10, max over LODs) ───────────────────
export const FLIGHT_MIN_SEAT = Object.freeze({ glide: 1.931, dive: 2.079, surfAboveWater: 2.105, launchOffExit: 2.079 });
/** Per-frame (seat − lowest vertex), ceil to mm. Swoop: max over LOD0/1 (LOD2 never plays in the swoop, DR-H15). JumpOff: all
 *  LODs. Measured on the v5 GLBs; the DR-F1 / DR-H11 / DR-J1 tests re-skin the GLBs and hold the code to these. */
export const SWOOP_SEAT_TO_LOW = [1.979, 1.984, 1.993, 1.999, 2.007, 2.006, 1.97, 1.894, 1.777, 1.624, 1.489, 1.397, 1.328, 1.268, 1.221, 1.192, 1.191, 1.221, 1.328, 1.489, 1.777, 1.97, 2.007, 1.993, 1.979] as const;
export const JUMPOFF_SEAT_TO_LOW = [1.979, 1.987, 1.998, 2.007, 1.998, 1.924, 1.777, 1.581, 1.465, 1.347, 1.251, 1.225, 1.223, 1.223, 1.223, 1.223, 1.223, 1.223, 1.223, 1.225, 1.233, 1.3, 1.396, 1.499, 1.6, 1.777, 1.908, 1.984, 2.01, 1.998, 1.996, 1.985, 1.979] as const;
