// FITNESS-TPOSE (2026-10-26): what each new loop's QC holds it to: the feet/hands it plants and when (seconds into the loop;
// `true` = horizontal only, a toe pivot or heel rise allowed), and whether its halves mirror ('half': left at t = mirrored right
// at t + D/2) or it is its own mirror ('self'). Generated from fel-specs/fitness-tpose-fix/qc/specs_*.py by qc/mkspec.py.
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import { EXERCISE_BATCH_A_BUILDERS } from './exerciseBatchA';
import { EXERCISE_BATCH_B1_BUILDERS } from './exerciseBatchB1';
import { EXERCISE_BATCH_B2_BUILDERS } from './exerciseBatchB2';
import { EXERCISE_BATCH_B3_BUILDERS } from './exerciseBatchB3';
import { EXERCISE_BATCH_B4_BUILDERS } from './exerciseBatchB4';
import { EXERCISE_BATCH_B5_BUILDERS } from './exerciseBatchB5';
import { EXERCISE_BATCH_B6_BUILDERS } from './exerciseBatchB6';
import { EXERCISE_BATCH_C1_BUILDERS } from './exerciseBatchC1';
import { EXERCISE_BATCH_C2_BUILDERS } from './exerciseBatchC2';

export type Win = [joint: string, t0: number, t1: number, horizontalOnly?: boolean];
export interface LoopSpec { planted?: Win[]; mirror?: 'half' | 'self' }
export const BATCH_BUILDERS: readonly (readonly [string, (scene: Scene, sk: Skeleton) => AnimationGroup | null])[] = [...EXERCISE_BATCH_A_BUILDERS, ...EXERCISE_BATCH_B1_BUILDERS, ...EXERCISE_BATCH_B2_BUILDERS, ...EXERCISE_BATCH_B3_BUILDERS, ...EXERCISE_BATCH_B4_BUILDERS, ...EXERCISE_BATCH_B5_BUILDERS, ...EXERCISE_BATCH_B6_BUILDERS, ...EXERCISE_BATCH_C1_BUILDERS, ...EXERCISE_BATCH_C2_BUILDERS];
export const BATCH_SPEC: Record<string, LoopSpec> = {
  // batchA
  ex_idle_ready: { planted: [['LeftFoot', 0, 4.0], ['RightFoot', 0, 4.0]], mirror: 'half' },
  ex_rotate: { planted: [['LeftFoot', 0, 2.8], ['RightFoot', 0, 2.8]], mirror: 'half' },
  ex_bound: { planted: [['RightFoot', 0, 0.3], ['LeftFoot', 0.7, 1.3], ['RightFoot', 1.7, 2.0]], mirror: 'half' },
  ex_throw: { planted: [['LeftFoot', 0, 1.6, true], ['RightFoot', 1.6, 3.2, true], ['RightFoot', 0, 0.35]], mirror: 'half' },
  ex_crawl: { planted: [['LeftHand', 0, 0.6], ['RightFoot', 0, 0.6], ['RightHand', 0.6, 1.2], ['LeftFoot', 0.6, 1.2]], mirror: 'half' },
  ex_t_drill: {  },
  ex_knee_to_wall: { planted: [['RightFoot', 0, 2.8], ['LeftFoot', 0, 3.0], ['LeftFoot', 3.5, 6.3], ['RightFoot', 3.5, 6.5]], mirror: 'half' },
  ex_single_leg_squat: { planted: [['RightFoot', 0, 3.0], ['LeftFoot', 3.2, 6.2]], mirror: 'half' },
  ex_breathe_prone: { planted: [['LeftHand', 0, 6], ['RightHand', 0, 6], ['LeftFoot', 0, 6], ['RightFoot', 0, 6]] },
  ex_breathe_legs_up_wall: { planted: [['LeftFoot', 0, 6], ['RightFoot', 0, 6]], mirror: 'self' },
  ex_ankle_circles: { planted: [['LeftFoot', 0, 4.8], ['RightFoot', 4.8, 9.6]], mirror: 'half' },
  ex_hip_circles_9090: { mirror: 'half' },
  ex_pogo_single: { mirror: 'half' },
  ex_bridge_single_pulse: { planted: [['RightFoot', 0, 3.72], ['LeftFoot', 3.72, 7.72], ['RightFoot', 7.72, 8.0]], mirror: 'half' },
  ex_press_oscillation: { planted: [['LeftFoot', 0, 7.6], ['RightFoot', 0, 7.6]], mirror: 'half' },
  ex_throw_vertical: { planted: [['LeftFoot', 0, 2.4, true], ['RightFoot', 0, 2.4, true]], mirror: 'self' },
  ex_box_out: { planted: [['RightFoot', 0, 3.4, true]] },
  // batchB1
  ex_jump_stick: { planted: [['LeftFoot', 0, 0.45], ['RightFoot', 0, 0.45], ['LeftFoot', 1.45, 2.8], ['RightFoot', 1.45, 2.8]], mirror: 'self' },
  ex_flow_squat_lunge: { planted: [['LeftFoot', 0, 4.0], ['RightFoot', 0, 4.0], ['LeftHand', 2.0, 2.4], ['RightHand', 2.0, 2.4]], mirror: 'self' },
  ex_cut: { planted: [['RightFoot', 1.1, 1.3], ['LeftFoot', 2.7, 2.9], ['LeftFoot', 0.6, 1.3]], mirror: 'half' },
  ex_stretch_hold: { planted: [['LeftFoot', 0, 6.4], ['RightFoot', 0, 6.4]], mirror: 'half' },
  ex_pushup_variants: { planted: [['LeftHand', 0, 4.4], ['RightHand', 0, 4.4], ['LeftFoot', 0, 2.2], ['RightFoot', 2.2, 4.4]], mirror: 'half' },
  ex_sprint_start: { planted: [['LeftFoot', 0, 0.5], ['RightFoot', 0, 0.5]] },
  ex_raise_overhead: { planted: [['LeftFoot', 0, 3.0], ['RightFoot', 0, 3.0]], mirror: 'self' },
  ex_curl_supported: { planted: [['LeftFoot', 0, 3.0], ['RightFoot', 0, 3.0]], mirror: 'self' },
  ex_sprint_drill: { mirror: 'half' },
  ex_olympic_lift: { planted: [['LeftFoot', 0, 3.2, true], ['RightFoot', 0, 3.2, true]], mirror: 'self' },
  // batchB2
  ex_pallof: { planted: [['LeftFoot', 0, 3.2], ['RightFoot', 0, 3.2]], mirror: 'self' },
  ex_iso_capacity: { planted: [['LeftFoot', 0, 6.4], ['RightFoot', 0, 6.4]], mirror: 'self' },
  ex_lunge_lateral: { planted: [['LeftFoot', 0, 2.4], ['RightFoot', 0.6, 1.8], ['RightFoot', 2.4, 4.8], ['LeftFoot', 3.0, 4.2]], mirror: 'half' },
  ex_press_alt: { planted: [['LeftFoot', 0, 3.2], ['RightFoot', 0, 3.2]], mirror: 'half' },
  ex_machine_cardio: { mirror: 'half' },
  ex_curl_incline: { planted: [['LeftFoot', 0, 2.6], ['RightFoot', 0, 2.6]], mirror: 'self' },
  ex_pulldown: { planted: [['LeftFoot', 0, 2.7], ['RightFoot', 0, 2.7]], mirror: 'self' },
  ex_pullup: { planted: [['LeftHand', 0, 3.0], ['RightHand', 0, 3.0]], mirror: 'self' },
  ex_triceps_lying: { planted: [['LeftFoot', 0, 2.6], ['RightFoot', 0, 2.6]], mirror: 'self' },
  ex_bench_variants: { planted: [['LeftFoot', 0, 2.7], ['RightFoot', 0, 2.7]], mirror: 'self' },
  // batchB3
  ex_ladder: { mirror: 'half' },
  ex_row_chest_supported: { planted: [['LeftFoot', 0, 2.5], ['RightFoot', 0, 2.5]], mirror: 'self' },
  ex_lateral_raise_bent: { planted: [['LeftFoot', 0, 2.6], ['RightFoot', 0, 2.6]], mirror: 'self' },
  ex_triceps_single_overhead: { planted: [['LeftFoot', 0, 4.0], ['RightFoot', 0, 4.0]], mirror: 'half' },
  ex_crunch_variants: { planted: [['LeftFoot', 0, 3.2], ['RightFoot', 0, 3.2]], mirror: 'half' },
  ex_plank_reach: { planted: [['LeftFoot', 0, 4.0], ['RightFoot', 0, 4.0], ['LeftHand', 0, 2.0], ['RightHand', 2.0, 4.0]], mirror: 'half' },
  ex_row_inverted: { planted: [['LeftFoot', 0, 2.75], ['RightFoot', 0, 2.75], ['LeftHand', 0, 2.75], ['RightHand', 0, 2.75]], mirror: 'self' },
  ex_throw_rotational: { planted: [['LeftFoot', 0, 3.6, true], ['RightFoot', 0, 3.6, true]], mirror: 'half' },
  ex_dip: { planted: [['LeftHand', 0, 2.7], ['RightHand', 0, 2.7]], mirror: 'self' },
  ex_sl_rdl: { planted: [['RightFoot', 0, 2.8], ['LeftFoot', 2.8, 5.6]], mirror: 'half' },
  // batchB4
  ex_hip_thrust: { planted: [['LeftFoot', 0, 3.1], ['RightFoot', 0, 3.1]], mirror: 'self' },
  ex_row_single: { planted: [['LeftFoot', 0, 4.0], ['RightFoot', 0, 4.0], ['LeftHand', 0, 1.8]], mirror: 'half' },
  ex_cable_crossover: { planted: [['LeftFoot', 0, 2.5], ['RightFoot', 0, 2.5]] },
  ex_good_morning_var: { planted: [['LeftFoot', 0, 2.7], ['RightFoot', 0, 2.7]], mirror: 'self' },
  ex_dynamic_warmup: { planted: [['LeftFoot', 0, 2.0], ['RightFoot', 2.0, 4.0]], mirror: 'half' },
  ex_squat_var: { planted: [['LeftFoot', 0, 2.7], ['RightFoot', 0, 2.7]], mirror: 'self' },
  ex_rotator_cuff: { planted: [['LeftFoot', 0, 2.5], ['RightFoot', 0, 2.5]], mirror: 'self' },
  ex_leg_curl_slider: { planted: [['LeftHand', 0, 2.8], ['RightHand', 0, 2.8]], mirror: 'self' },
  ex_grip_wrist: { planted: [['LeftFoot', 0, 2.0], ['RightFoot', 0, 2.0], ['LeftHand', 0, 2.0], ['RightHand', 0, 2.0]], mirror: 'self' },
  ex_step_up: { planted: [['RightFoot', 0.65, 2.5], ['LeftFoot', 0, 0.65], ['LeftFoot', 3.65, 5.5], ['RightFoot', 3.0, 3.65]], mirror: 'half' },
  // batchB5
  ex_row_seated_cable: { planted: [['LeftFoot', 0, 2.85], ['RightFoot', 0, 2.85]], mirror: 'self' },
  ex_carry_strongman: { mirror: 'half' },
  ex_jump_rope_variants: { mirror: 'half' },
  ex_throw_overhead: { planted: [['LeftFoot', 0, 2.4], ['RightFoot', 0, 2.4]], mirror: 'self' },
  ex_leg_press: { planted: [['LeftHand', 0, 2.6], ['RightHand', 0, 2.6]], mirror: 'self' },
  ex_straight_arm_pulldown: { planted: [['LeftFoot', 0, 2.4], ['RightFoot', 0, 2.4]], mirror: 'self' },
  ex_leg_raise: { planted: [['LeftHand', 0, 3.0], ['RightHand', 0, 3.0]], mirror: 'self' },
  ex_side_plank: { planted: [['LeftHand', 0, 3.0]] },
  ex_sled_push: { planted: [['LeftFoot', 0, 0.62], ['RightFoot', 0.7, 1.32]], mirror: 'half' },
  ex_kb_swing: { planted: [['LeftFoot', 0, 1.8], ['RightFoot', 0, 1.8]], mirror: 'self' },
  // batchB6
  ex_foam_roll: { planted: [['LeftHand', 0, 3.2], ['RightHand', 0, 3.2]], mirror: 'self' },
  ex_curl_alt: { planted: [['LeftFoot', 0, 3.2], ['RightFoot', 0, 3.2]], mirror: 'half' },
  ex_pullover: { planted: [['LeftFoot', 0, 3.0], ['RightFoot', 0, 3.0]], mirror: 'self' },
  ex_face_pull: { planted: [['LeftFoot', 0, 2.5], ['RightFoot', 0, 2.5]], mirror: 'self' },
  ex_triceps_kickback: { planted: [['LeftFoot', 0, 2.1], ['RightFoot', 0, 2.1]], mirror: 'self' },
  ex_lunge_walking: { planted: [['RightFoot', 0, 2.6, true], ['LeftFoot', 2.6, 5.2, true]], mirror: 'half' },
  ex_calf_raise_single: { planted: [['RightFoot', 0, 2.2, true], ['RightHand', 0.35, 1.85], ['LeftFoot', 2.2, 4.4, true], ['LeftHand', 2.55, 4.05]], mirror: 'half' },
  ex_neck: { planted: [['LeftFoot', 0, 6.4], ['RightFoot', 0, 6.4]] },
  ex_curl_hammer: { planted: [['LeftFoot', 0, 3.2], ['RightFoot', 0, 3.2]], mirror: 'half' },
  ex_pushdown_variants: { planted: [['LeftFoot', 0, 2.2], ['RightFoot', 0, 2.2]], mirror: 'self' },
  ex_burpee: { planted: [['LeftHand', 0.5, 1.6], ['RightHand', 0.5, 1.6], ['LeftFoot', 0.88, 1.2], ['RightFoot', 0.88, 1.2]], mirror: 'self' },
  ex_calf_raise_seated: { planted: [['LeftFoot', 0, 2.3, true], ['RightFoot', 0, 2.3, true]], mirror: 'self' },
  ex_tib_raise: { planted: [['LeftFoot', 0, 2.0], ['RightFoot', 0, 2.0]], mirror: 'self' },
  // batchC1
  ex_bball_pullup: { planted: [['LeftFoot', 0, 1.38], ['RightFoot', 0, 1.38], ['LeftFoot', 2.12, 3.6], ['RightFoot', 2.12, 3.6]] },
  ex_bball_handle_combo: { planted: [['LeftFoot', 0, 2.0], ['RightFoot', 0, 2.0]], mirror: 'half' },
  ex_bball_catch_shoot: { planted: [['LeftFoot', 0, 0.93], ['RightFoot', 0, 0.93], ['LeftFoot', 1.67, 3.0], ['RightFoot', 1.67, 3.0]] },
  ex_bball_drive_finish: { planted: [['LeftFoot', 0, 1.0], ['RightFoot', 0, 0.28], ['RightFoot', 0.65, 1.1], ['LeftFoot', 1.24, 1.36], ['LeftFoot', 2.04, 3.8], ['RightFoot', 2.04, 3.8]] },
  ex_bball_v_dribble: { planted: [['LeftFoot', 0, 3.2], ['RightFoot', 0, 3.2]], mirror: 'half' },
  // batchC2
  ex_bball_closeout: { planted: [['LeftFoot', 0, 3.2, true], ['RightFoot', 0, 3.2, true], ['LeftFoot', 1.12, 3.2], ['RightFoot', 1.12, 3.2], ['LeftFoot', 0, 0.4], ['RightFoot', 0, 0.4]] },
  ex_bball_triple_threat: { planted: [['LeftFoot', 0, 3.4], ['RightFoot', 0, 0.32], ['RightFoot', 0.64, 0.8], ['RightFoot', 1.14, 2.36], ['RightFoot', 2.64, 2.68]] },
  ex_bball_pass: { planted: [['LeftFoot', 0, 1.6], ['RightFoot', 0, 0.32], ['RightFoot', 0.6, 1.16], ['RightFoot', 1.48, 3.2], ['LeftFoot', 1.6, 1.92], ['LeftFoot', 2.2, 2.76]], mirror: 'half' },
  ex_soccer_touches: { planted: [['LeftFoot', 0, 0.4], ['RightFoot', 0.4, 0.8]], mirror: 'half' },
  ex_volleyball: { planted: [['LeftFoot', 0, 2.8], ['RightFoot', 0, 2.8]] },
};
