// clipRegistry — semantic gesture layer + defense-in-depth against bind-pose
// (T-pose) regressions. Introduced in M42 (animation-reliability).
//
// IMPORTANT ADAPTATION NOTE (this build):
// The original M42 drop-in assumed animator.play() silently no-ops on an
// unregistered clip name, leaving the rig at bind pose with ZERO warning.
// That premise does NOT hold in THIS codebase: our CharacterAnimator.play()
// runs every name through resolveClip() (clipResolver.ts), which consults the
// rich CLIP_ALIASES table (clipAliases.ts) — mapping every sport-specific
// name (golf_address_idle, tennis_forehand, karate_punch_light, run_forward,
// board_ride_idle, penalty_strike, keeper_dive_left, ...) onto a REAL clip —
// and on a genuine miss logs a loud [FEL-ANIM] MISSING CLIP warning and falls
// back to `guard`. Bind pose is already categorically unreachable here.
//
// So installSafePlay() below is COOPERATIVE, not a replacement: it adds a
// second loud warning if a name is neither a real clip NOR a known alias key,
// then DELEGATES to the resolver-backed play so the alias table still works.
// Blindly substituting SAFE_DEFAULT (as the raw drop-in did) would DOWNGRADE
// behaviour — e.g. karate_punch_light would stop resolving to `jab`.
//
// SPORT_CLIP remains the recommended semantic table for NEW mode code: it maps
// each gesture onto the closest real clip available today (a generic
// fighter/locomotion rig). Commissioning bespoke sport mocap is a follow-up
// content workstream, not a code bug.

import type { CharacterAnimator, PlayOpts } from './CharacterAnimator';
import { CLIP_ALIASES } from './clipAliases';
import { reportDiag } from '../core/diag';

/** Names that actually exist on the live rig today (imported GLB + authored
 *  procedural clips). Single source of truth for "is this a real clip". */
export const REAL_CLIPS = new Set<string>([
  // imported GLB (generic fighter rig)
  'guard', 'high_kick', 'hook', 'jab', 'jumpshot', 'roundhouse', 'run', 'uppercut', 'walk',
  // authored/code-driven procedural clips (always safe)
  // LIBRARY-ANATOMY (2026-10-25): the exercise library's demo loops (anim/authored/exercise.ts; the opt-in 'exercise' suite — built
  // on the library stage only, clipScope OPT_IN_SUITES)
  'ex_squat', 'ex_squat_bar', 'ex_hinge', 'ex_good_morning', 'ex_split_squat', 'ex_lunge', 'ex_reverse_lunge', 'ex_calf_raise', 'ex_jump', 'ex_pogo', 'ex_jump_rope', 'ex_march', 'ex_carry', 'ex_jumping_jack', 'ex_press', 'ex_curl', 'ex_lateral_raise', 'ex_front_raise', 'ex_row', 'ex_upright_row', 'ex_shrug', 'ex_triceps_overhead', 'ex_pushdown', 'ex_pushup', 'ex_plank', 'ex_plank_high', 'ex_mountain_climber', 'ex_bridge', 'ex_dead_bug', 'ex_bird_dog', 'ex_crunch', 'ex_seated_press', 'ex_seated_curl', 'ex_seated_lateral_raise', 'ex_seated_triceps', 'ex_bench_press', 'ex_floor_press', 'ex_fly', 'ex_skull_crusher', 'ex_incline_press', 'ex_incline_fly', 'ex_arm_circles', 'ex_quad_stretch', 'ex_breathe',
  // LIBRARY-ANATOMY-2 (2026-10-25): the loops added for coverage (built by name, authored/exercise.ts buildExerciseClip)
  'ex_curl_one', 'ex_press_one', 'ex_lateral_raise_one', 'ex_front_raise_one', 'ex_triceps_overhead_one', 'ex_pushdown_one', 'ex_row_one', 'ex_upright_row_one', 'ex_seated_press_one', 'ex_seated_curl_one', 'ex_seated_lateral_raise_one', 'ex_seated_triceps_one', 'ex_skull_crusher_one', 'ex_fly_one', 'ex_incline_press_one', 'ex_incline_fly_one', 'ex_curl_alt', 'ex_press_alt', 'ex_lateral_raise_alt', 'ex_front_raise_alt', 'ex_row_alt', 'ex_seated_press_alt', 'ex_seated_curl_alt', 'ex_incline_press_alt', 'ex_kickback', 'ex_kickback_one', 'ex_reverse_fly', 'ex_pull_apart', 'ex_face_pull', 'ex_scaption', 'ex_front_raise_overhead', 'ex_press_hk', 'ex_press_hk_one', 'ex_press_hk_alt', 'ex_pos_squat', 'ex_pos_cossack', 'ex_pos_fold', 'ex_pos_spider', 'ex_pos_frog', 'ex_pos_inchworm', 'ex_pos_dog', 'ex_pos_child', 'ex_pos_pigeon', 'ex_pos_halfsplit', 'ex_pos_lowlunge', 'ex_pos_kneel', 'ex_pos_ninety', 'ex_pos_shinbox', 'ex_pos_catcamel', 'ex_pos_thread', 'ex_pos_bear', 'ex_pos_cobra', 'ex_pos_lizard', 'ex_pos_butterfly', 'ex_pos_supine', 'ex_pos_supine9090', 'ex_pos_legsup', 'ex_pos_kneehug', 'ex_pos_oneknee', 'ex_pos_happybaby', 'ex_pos_kneerock', 'ex_pos_figure4', 'ex_pos_lyinghams', 'ex_pos_prone', 'ex_pos_pike', 'ex_pos_straddle', 'ex_pos_switch', 'ex_pos_rockback', 'ex_pos_childside', 'ex_pos_dogpedal', 'ex_pos_side', 'ex_pos_openbook', 'ex_pos_clamshell', 'ex_pos_sideraise', 'ex_pos_sideer', 'ex_pos_superman', 'ex_pos_sidelunge', 'ex_pos_couch', 'ex_flow_squat_cossack', 'ex_flow_squat_fold', 'ex_flow_squat_spider', 'ex_flow_squat_frog', 'ex_flow_fold_inchworm', 'ex_flow_fold_dog', 'ex_flow_inchworm_dog', 'ex_flow_inchworm_spider', 'ex_flow_dog_spider', 'ex_flow_dog_child', 'ex_flow_dog_pigeon', 'ex_flow_dog_halfsplit', 'ex_flow_spider_halfsplit', 'ex_flow_spider_lowlunge', 'ex_flow_halfsplit_kneel', 'ex_flow_halfsplit_lowlunge', 'ex_flow_kneel_lowlunge', 'ex_flow_kneel_ninety', 'ex_flow_ninety_pigeon', 'ex_flow_ninety_shinbox', 'ex_flow_pigeon_child', 'ex_flow_child_catcamel', 'ex_flow_child_thread', 'ex_flow_child_frog', 'ex_flow_catcamel_thread', 'ex_flow_catcamel_frog', 'ex_flow_thread_frog', 'ex_flow_bear_dog', 'ex_flow_bear_child', 'ex_flow_bear_inchworm', 'ex_flow_cobra_dog', 'ex_flow_cobra_child', 'ex_flow_lizard_spider', 'ex_flow_lizard_halfsplit', 'ex_flow_lizard_dog', 'ex_flow_butterfly_ninety', 'ex_flow_butterfly_frog', 'ex_flow_couch_kneel', 'ex_flow_couch_halfsplit', 'ex_flow_couch_lowlunge', 'ex_flow_pigeon_lizard', 'ex_flow_squat_butterfly', 'ex_flow_cossack_squat_fold', 'ex_flow_cossack_squat_spider', 'ex_flow_cossack_squat_frog', 'ex_flow_butterfly_squat_cossack', 'ex_flow_fold_squat_spider', 'ex_flow_fold_squat_frog', 'ex_flow_butterfly_squat_fold', 'ex_flow_frog_squat_spider', 'ex_flow_butterfly_squat_spider', 'ex_flow_butterfly_squat_frog', 'ex_flow_inchworm_fold_squat', 'ex_flow_dog_fold_squat', 'ex_flow_dog_fold_inchworm', 'ex_flow_inchworm_spider_squat', 'ex_flow_dog_spider_squat', 'ex_flow_halfsplit_spider_squat', 'ex_flow_lowlunge_spider_squat', 'ex_flow_lizard_spider_squat', 'ex_flow_dog_spider_inchworm', 'ex_flow_halfsplit_spider_inchworm', 'ex_flow_inchworm_spider_lowlunge', 'ex_flow_inchworm_spider_lizard', 'ex_flow_dog_spider_halfsplit', 'ex_flow_dog_spider_lowlunge', 'ex_flow_dog_spider_lizard', 'ex_flow_halfsplit_spider_lowlunge', 'ex_flow_halfsplit_spider_lizard', 'ex_flow_lizard_spider_lowlunge', 'ex_flow_child_frog_squat', 'ex_flow_catcamel_frog_squat', 'ex_flow_squat_frog_thread', 'ex_flow_catcamel_frog_child', 'ex_flow_child_frog_thread', 'ex_flow_butterfly_frog_child', 'ex_flow_catcamel_frog_thread', 'ex_flow_butterfly_frog_catcamel', 'ex_flow_butterfly_frog_thread', 'ex_flow_fold_inchworm_spider', 'ex_flow_bear_inchworm_fold', 'ex_flow_bear_inchworm_dog', 'ex_flow_bear_inchworm_spider', 'ex_flow_fold_dog_spider', 'ex_flow_child_dog_fold', 'ex_flow_fold_dog_pigeon', 'ex_flow_fold_dog_halfsplit', 'ex_flow_bear_dog_fold', 'ex_flow_cobra_dog_fold', 'ex_flow_fold_dog_lizard', 'ex_flow_child_dog_inchworm', 'ex_flow_inchworm_dog_pigeon', 'ex_flow_halfsplit_dog_inchworm', 'ex_flow_cobra_dog_inchworm', 'ex_flow_inchworm_dog_lizard', 'ex_flow_child_dog_spider', 'ex_flow_pigeon_dog_spider', 'ex_flow_bear_dog_spider', 'ex_flow_cobra_dog_spider', 'ex_flow_child_dog_pigeon', 'ex_flow_child_dog_halfsplit', 'ex_flow_bear_dog_child', 'ex_flow_child_dog_cobra', 'ex_flow_child_dog_lizard', 'ex_flow_halfsplit_dog_pigeon', 'ex_flow_bear_dog_pigeon', 'ex_flow_cobra_dog_pigeon', 'ex_flow_lizard_dog_pigeon', 'ex_flow_bear_dog_halfsplit', 'ex_flow_cobra_dog_halfsplit', 'ex_flow_halfsplit_dog_lizard', 'ex_flow_bear_dog_cobra', 'ex_flow_bear_dog_lizard', 'ex_flow_cobra_dog_lizard', 'ex_flow_catcamel_child_dog', 'ex_flow_dog_child_thread', 'ex_flow_dog_child_frog', 'ex_flow_catcamel_child_pigeon', 'ex_flow_pigeon_child_thread', 'ex_flow_frog_child_pigeon', 'ex_flow_bear_child_pigeon', 'ex_flow_cobra_child_pigeon', 'ex_flow_catcamel_child_thread', 'ex_flow_bear_child_catcamel', 'ex_flow_catcamel_child_cobra', 'ex_flow_bear_child_thread', 'ex_flow_cobra_child_thread', 'ex_flow_bear_child_frog', 'ex_flow_cobra_child_frog', 'ex_flow_bear_child_cobra', 'ex_flow_dog_pigeon_ninety', 'ex_flow_child_pigeon_ninety', 'ex_flow_lizard_pigeon_ninety', 'ex_flow_child_pigeon_lizard', 'ex_flow_dog_halfsplit_kneel', 'ex_flow_dog_halfsplit_lowlunge', 'ex_flow_couch_halfsplit_dog', 'ex_flow_kneel_halfsplit_spider', 'ex_flow_couch_halfsplit_spider', 'ex_flow_kneel_halfsplit_lowlunge', 'ex_flow_kneel_halfsplit_lizard', 'ex_flow_couch_halfsplit_kneel', 'ex_flow_lizard_halfsplit_lowlunge', 'ex_flow_couch_halfsplit_lowlunge', 'ex_flow_couch_halfsplit_lizard', 'ex_flow_kneel_lowlunge_spider', 'ex_flow_couch_lowlunge_spider', 'ex_flow_couch_lowlunge_kneel', 'ex_flow_halfsplit_kneel_ninety', 'ex_flow_lowlunge_kneel_ninety', 'ex_flow_couch_kneel_ninety', 'ex_flow_kneel_ninety_pigeon', 'ex_flow_kneel_ninety_shinbox', 'ex_flow_butterfly_ninety_kneel', 'ex_flow_pigeon_ninety_shinbox', 'ex_flow_butterfly_ninety_pigeon', 'ex_flow_butterfly_ninety_shinbox', 'ex_flow_child_bear_inchworm', 'ex_flow_pigeon_lizard_spider', 'ex_flow_halfsplit_lizard_pigeon', 'ex_flow_frog_butterfly_ninety', 'ex_flow_ninety_butterfly_squat', 'ex_pallofpress_standing', 'ex_pallofpress_hk', 'ex_pallofpress_tk', 'ex_pallofpress_split', 'ex_pallofpress_lateral', 'ex_pallofpress_single', 'ex_pallofhold_standing', 'ex_pallofhold_hk', 'ex_pallofhold_tk', 'ex_pallofhold_split', 'ex_pallofhold_lateral', 'ex_pallofhold_single', 'ex_pallofoverhead_standing', 'ex_pallofoverhead_hk', 'ex_pallofoverhead_tk', 'ex_pallofoverhead_split', 'ex_pallofoverhead_lateral', 'ex_pallofoverhead_single', 'ex_pallofrotate_standing', 'ex_pallofrotate_hk', 'ex_pallofrotate_tk', 'ex_pallofrotate_split', 'ex_pallofrotate_lateral', 'ex_pallofrotate_single', 'ex_chest_standing', 'ex_chest_tk', 'ex_chest_hk', 'ex_chest_split', 'ex_chest_stepin', 'ex_chest_single', 'ex_overhead_standing', 'ex_overhead_tk', 'ex_overhead_hk', 'ex_overhead_split', 'ex_overhead_stepin', 'ex_overhead_single', 'ex_scoop_standing', 'ex_scoop_tk', 'ex_scoop_hk', 'ex_scoop_split', 'ex_scoop_stepin', 'ex_scoop_single', 'ex_shotput_standing', 'ex_shotput_tk', 'ex_shotput_hk', 'ex_shotput_split', 'ex_shotput_stepin', 'ex_shotput_single', 'ex_sidetoss_standing', 'ex_sidetoss_tk', 'ex_sidetoss_hk', 'ex_sidetoss_split', 'ex_sidetoss_stepin', 'ex_sidetoss_single', 'ex_underhand_standing', 'ex_underhand_tk', 'ex_underhand_hk', 'ex_underhand_split', 'ex_underhand_stepin', 'ex_underhand_single', 'ex_singlepush_standing', 'ex_singlepush_tk', 'ex_singlepush_hk', 'ex_singlepush_split', 'ex_singlepush_stepin', 'ex_rotoverhead_standing', 'ex_rotoverhead_tk', 'ex_rotoverhead_hk', 'ex_rotoverhead_split', 'ex_rotoverhead_stepin', 'ex_rotoverhead_single', 'ex_chop_hk', 'ex_lift_hk', 'ex_chop_standing', 'ex_lift_standing', 'ex_slam_standing', 'ex_backtoss_standing', 'ex_squatthrow_standing', 'ex_carry_rack', 'ex_carry_overhead', 'ex_march_carry', 'ex_march_rack', 'ex_march_overhead', 'ex_kb_swing', 'ex_kb_swing_one', 'ex_er_side', 'ex_ir_side', 'ex_er_90', 'ex_ir_90', 'ex_er_90_hk', 'ex_ir_90_hk', 'ex_er_side_split', 'ex_ir_side_split', 'ex_halo', 'ex_side_bend', 'ex_cable_press_one', 'ex_cable_row_one', 'ex_lateral_lunge', 'ex_curtsy_lunge', 'ex_sumo_deadlift', 'ex_sl_rdl', 'ex_kickstand_rdl', 'ex_reverse_crunch', 'ex_situp', 'ex_situp_34', 'ex_bicycle', 'ex_heel_touch', 'ex_flutter', 'ex_toe_touch', 'ex_vup', 'ex_hollow', 'ex_hollow_tuck', 'ex_hollow_rock', 'ex_dead_bug_heel', 'ex_plank_forearm_leg', 'ex_plank_forearm_reach', 'ex_plank_forearm_knee', 'ex_plank_high_leg', 'ex_plank_high_reach', 'ex_plank_high_knee', 'ex_plank_bear_leg', 'ex_plank_bear_reach', 'ex_plank_bear_knee', 'ex_shoulder_tap', 'ex_bear_tap', 'ex_side_plank', 'ex_side_plank_leg', 'ex_squat_thrust', 'ex_burpee', 'ex_seal_jack', 'ex_high_knees', 'ex_butt_kicks', 'ex_a_skip', 'ex_power_skip', 'ex_b_skip', 'ex_tuck_jump', 'ex_star_jump', 'ex_split_jump', 'ex_sl_jump', 'ex_pogo_fb', 'ex_pogo_lat', 'ex_pogo_sl', 'ex_lateral_hops', 'ex_lateral_hops_sl', 'ex_lateral_bound', 'ex_rope_alt', 'ex_rope_highknee', 'ex_rope_sl', 'ex_rope_side', 'ex_rope_fb', 'ex_rope_double', 'ex_rope_boxer', 'ex_rope_scissor', 'ex_rope_wide', 'ex_bear_crawl', 'ex_leopard_crawl', 'ex_crab_walk', 'ex_crab_reach', 'ex_step_up', 'ex_step_up_knee', 'ex_step_up_lat', 'ex_step_down', 'ex_step_down_lat', 'ex_sl_box_squat', 'ex_pistol', 'ex_pistol_goblet', 'ex_skater_squat', 'ex_bulgarian', 'ex_bulgarian_bar', 'ex_lying_leg_curl', 'ex_seated_leg_curl', 'ex_leg_extension', 'ex_leg_extension_one', 'ex_seated_calf', 'ex_standing_leg_curl', 'ex_hip_thrust', 'ex_hip_thrust_sl', 'ex_bridge_march', 'ex_bridge_sl', 'ex_bridge_feetup', 'ex_slider_curl', 'ex_nordic', 'ex_pullup', 'ex_chinup', 'ex_dead_hang', 'ex_scap_pullup', 'ex_pulldown', 'ex_pulldown_close', 'ex_pulldown_one', 'ex_straight_arm_pulldown', 'ex_inverted_row', 'ex_dip', 'ex_dip_hold', 'ex_bench_dip', 'ex_bench_dip_bent', 'ex_incline_pushup', 'ex_decline_pushup', 'ex_wall_pushup', 'ex_plyo_pushup', 'ex_hand_release', 'ex_incline_curl', 'ex_incline_curl_alt', 'ex_spider_curl', 'ex_chest_row', 'ex_incline_y', 'ex_incline_t', 'ex_incline_w', 'ex_preacher_curl', 'ex_preacher_curl_one', 'ex_concentration_curl', 'ex_calf_raise_sl', 'ex_calf_raise_bent', 'ex_calf_raise_bent_sl', 'ex_calf_raise_step', 'ex_calf_raise_step_sl', 'ex_calf_raise_bent_step', 'ex_calf_raise_bent_step_sl', 'ex_high_curl', 'ex_high_curl_one', 'ex_z_press', 'ex_z_press_one', 'ex_z_press_alt', 'ex_wall_sit', 'ex_wall_sit_sl', 'ex_spanish_squat', 'ex_seated_row', 'ex_seated_row_one', 'ex_decline_press', 'ex_decline_fly', 'ex_decline_fly_one', 'ex_decline_skull', 'ex_decline_skull_one', 'ex_spiderman_pushup', 'ex_archer_pushup', 'ex_seated_reverse_fly', 'ex_seated_reverse_fly_one', 'ex_seated_kickback', 'ex_seated_kickback_one', 'ex_pullover', 'ex_pullover_bent',
  // DEMO-LOOPS (2026-10-27): the checks and drills the owner sees (built by name, authored/exercise.ts buildExerciseClip)
  'ex_overhead_squat', 'ex_knee_to_wall', 'ex_sl_squat_partial', 'ex_jump_hands_hips', 'ex_cmj_dip', 'ex_wall_drive', 'ex_wall_march', 'ex_decel_three', 'ex_t_drill', 'ex_approach_one', 'ex_approach_two', 'ex_wake_up', 'ex_def_stance', 'ex_sl_balance', 'ex_sl_balance_head', 'ex_seated_breathe', 'ex_adductor_squeeze', 'ex_band_row', 'ex_tke', 'ex_lateral_walk', 'ex_back_wall_arm_raise', 'ex_wall_chin_tuck', 'ex_wall_slide_liftoff', 'ex_box_jump', 'ex_broad_jump_stick', 'ex_sl_hop_stick', 'ex_lateral_hop_stick', 'ex_drop_landing', 'ex_snap_down', 'ex_supported_sl_rdl', 'ex_hip_airplane', 'ex_two_point_start', 'ex_arm_swing', 'ex_prone_t', 'ex_incline_scap_push_up', 'ex_approach_jump_one_step', 'ex_approach_jump_two_step', 'ex_approach_jump_three_step', 'ex_approach_jump_one_foot', 'ex_decel_stick', 'ex_jump_stop', 'ex_lateral_skip', 'ex_copenhagen_knee', 'ex_copenhagen_raise_knee',
  'idle_stand', 'strafe_left', 'strafe_right', 'jump_up', 'jump_land',
  'dunk_charge_gather', 'dunk_launch', 'dunk_mocap', 'dunk_360_eastbay', 'dunk_score_hang', 'dunk_land_crouch', 'dunk_land_absorb',
  'dunk_finish_windmill', 'dunk_finish_tomahawk', 'dunk_finish_blown', 'dunk_celebrate_big',
  'dunk_self_lob', 'dunk_bounce_throw', 'dunk_kick_up', 'dunk_back_handspring', 'dunk_cartwheel', 'dunk_backflip', 'dunk_flush_scorpion', 'dunk_720_spin', 'dunk_celeb_spiderman_splits', 'dunk_celeb_its_over', 'dunk_celeb_roar', 'dunk_celeb_too_small', 'prop_stack_base', 'prop_stack_rider', 'prop_row_stand', 'prop_row_crouch', 'prop_dubble_hold', 'prop_dubble_kneel', 'prop_bike_rider', 'prop_skate_rider', 'dunk_double_up', 'dunk_scorpion', 'dunk_lost_found', 'dunk_hide_seek', 'dunk_360_spin', 'dunk_between_legs', 'dunk_cradle', 'dunk_double_clutch', 'dunk_behind_back', 'dunk_fake_back', 'dunk_double_eastbay', 'dunk_360_windmill', 'dunk_fake_eastbay', 'dunk_tap',   // DUNK-CONTROL-JUICE (2026-09-08): the named dunks
  'football_juke_left', 'football_juke_right', 'football_spin_move', 'football_tackled_fall', 'football_td_spike',
  'karate_hit_react', 'karate_knockdown', 'karate_guard_step',   // the guard step (MODE-STICK-FACE) was authored + registered but never listed here
  'karate_block', 'karate_guard_impact', 'karate_parry', 'karate_floor_hold', 'karate_get_up',   // ANIM-READABILITY (combat, 2026-09-07)
  'karate_windup_hold', 'freerun_air_hold', 'freerun_tuck', 'freerun_slide',   // ANIM-READABILITY (creative, 2026-09-07)
  'karate_lean_dodge',   // KARATE-NEO-COOP (2026-09-07): the bullet-time lean
  'karate_evade',   // KARATE-NEO-COOP (2026-09-07): the fighter's slip (the endless dodge)
  'karate_shuffle_left', 'karate_shuffle_right',   // BIOMECH-WAVE2 (2026-09-09): the lock-on strafe
  'karate_roll', 'karate_jump',   // 2026-09-14: combat had no roll and no jump in ANY of its four modes
  'football_stiff_arm', 'football_throw',   // RECOGNISABLE (2026-09-15): authored (the stiff arm and the pass both played the jab)
  'football_carry_run',   // BIOMECH-WAVE2: authored (MODE-STICK-FACE) and registered on the animator, never listed — the football tree resolves it (same case as bball_follow_through)
  // the racket / club / net / keeper sports (anim/authored/{tennis,volleyball,golf,soccer}) — Phase 3, 2026-09-03; never
  // listed here (installSafePlay's clipNames check carried them). ANIM-READABILITY (net / precision, 2026-09-07) adds
  // the putt, the ready shuffles, the keeper's held stretch and rise.
  'tennis_ready', 'tennis_swing', 'tennis_serve', 'tennis_shuffle_left', 'tennis_shuffle_right',
  'volleyball_ready', 'volleyball_spike', 'volleyball_block', 'volleyball_shuffle_left', 'volleyball_shuffle_right',
  'golf_address_idle', 'golf_swing_full', 'golf_putt', 'golf_finish_hold',
  'soccer_kick_shoot', 'keeper_set', 'keeper_dive', 'keeper_dive_hold', 'keeper_rise',
  // basketball packages (anim/authored/basketball) — Phase 4, 2026-09-03
  'bball_idle_stand',   // HOOPS MOTION phase 3b: the ball-less watch with its own knees (authored + aliased, never listed here)
  'bball_dribble_idle', 'bball_crossover_left', 'bball_crossover_right', 'bball_hesi',
  'bball_layup_gather', 'bball_defend_slide_left', 'bball_defend_slide_right',
  'bball_block_reach', 'bball_steal_reach',
  'bball_follow_through',   // BIOMECH-HOOPS-WAVE1 (the tree resolves it through the animator; listed so isResolvable agrees)
  'bball_pullup_gather', 'bball_layup_gather_left', 'bball_floater', 'bball_hand_up', 'bball_screen_set',   // HOOPS-MOVE-KIT-A (2026-09-08): M1 gather, M3 left layup + floater, D3 hand-up, O1 screen
  'bball_land_absorb',   // HOOPS-DEPTH S4 (2026-09-23): the jump shot's landing
  'bball_follow_through_early', 'bball_follow_through_late',   // HOOPS-DEPTH S6: the release reads in the body
  'bball_post_up', 'bball_fadeaway', 'bball_hook', 'bball_hook_left', 'bball_spin',   // HOOPS-MOVE-KIT-B (2026-09-08): the post seal, M4 fade, M5 hook (L/R), M6 spin
  'bball_pump_fake', 'bball_step_through', 'bball_pivot', 'bball_layup_reverse', 'bball_layup_reverse_left', 'bball_hop_step', 'bball_euro_step',   // KIT-B wave 2: M8 pump + step-through, M9 pivot, M11 reverse, M13 hop, M14 euro
  'bball_stepback_release', 'bball_follow_through_bank_left', 'bball_follow_through_bank_right', 'bball_catch_hop',   // hoops-shot-content (2026-10-20): anim/authored/shotKit.ts
  // baseball packages (anim/authored/baseball) — Phase 6, 2026-09-03
  'baseball_stance', 'baseball_swing', 'baseball_pitch_over', 'baseball_pitch_side',
  // board suite — skate / surf / snowboard share these (anim/authored/boardSuite)
  'board_ride_idle', 'board_carve_left', 'board_carve_right', 'board_tuck',
  'board_grab', 'board_air', 'board_grind', 'board_land', 'board_push',
  'skate_kickflip', 'skate_bail', 'board_manual', 'skate_ollie',
  'board_stand_idle', 'board_land_sketchy',   // ANIM-READABILITY (2026-09-21)
  'snow_bail',   // GATE-CRASHER-POLISH-2 (2026-09-28): the snowboard's wipeout — down in the snow, board strapped on (boardSuite)
  // REGISTRY DRIFT, CLOSED (2026-09-18). 42 authored clips had no entry here — the whole HOOPS handle kit
  // (shammgod, yoyo, snatch-back, the ankle breakers), the layup/finish kit, the hard defensive slides, the
  // elbow strikes and three dunk finishes. They still PLAYED, because installSafePlay's second clause accepts
  // any name the animator has registered — but `isResolvable()` said no, which is what every static check and
  // every blend tree proof asks. Read off anim/authored/index.ts; `clip-registry-tests.ts` now keeps it honest.
  'dunk_carry_up', 'dunk_carry_up_left', 'dunk_carry_up_two', 'dunk_flush_one', 'dunk_flush_left', 'dunk_flush_two',   // DUNK MOTION phase 4
  'dunk_gather_one', 'dunk_gather_two', 'dunk_take_off_one',   // DUNK MOTION phase 7
  'dunk_finish_reverse', 'dunk_finish_power', 'dunk_finish_two_hand', 'karate_elbow', 'karate_spin_elbow', 'bball_in_and_out_left',
  'bball_in_and_out_right', 'bball_between_legs_left', 'bball_between_legs_right', 'bball_behind_back_left', 'bball_behind_back_right',
  'bball_double_cross_left', 'bball_double_cross_right', 'bball_snatch_back', 'bball_shammgod_left', 'bball_shammgod_right', 'bball_yoyo',
  'bball_momentum_cross_left', 'bball_momentum_cross_right',   // HOOPS MOTION phase 4c (plan §4.2)
  'bball_btb_slide_left', 'bball_btb_slide_right',   // H2 (owner 2026-10-16): the BTB slide
  'bball_hesi_v2_left', 'bball_hesi_v2_right',   // H2b (plan §4.8): the hesitation v2
  'bball_yoyo_v2_left', 'bball_yoyo_v2_right', 'bball_pausin_left', 'bball_pausin_right', 'bball_jab', 'bball_pivot_v2_left', 'bball_pivot_v2_right', 'bball_snatch_back_v2_left', 'bball_snatch_back_v2_right', 'bball_shimmy_quick', 'bball_def_retreat', 'bball_def_lunge_left', 'bball_def_lunge_right', 'bball_def_standup', 'bball_def_cross_run_left', 'bball_def_cross_run_right', 'bball_stepback_rival', 'bball_skip_gather_left', 'bball_skip_gather_right',   // H2b / H2c / H2e
  'bball_ankle_stumble', 'bball_ankle_slip', 'bball_stepback_gather', 'bball_mikan', 'bball_mikan_left', 'bball_up_and_under',
  'bball_up_and_under_left', 'bball_finger_roll', 'bball_finger_roll_left', 'bball_layup_scoop', 'bball_layup_scoop_left', 'bball_layup_spin',
  'bball_layup_spin_left', 'bball_layup_hang', 'bball_layup_hang_left', 'bball_shimmy', 'bball_drop_step', 'bball_drop_step_left', 'bball_floater_left',
  'bball_euro_step_left', 'bball_defend_backpedal', 'bball_closeout', 'bball_contact_react', 'bball_defend_slide_hard_left',
  'bball_defend_slide_hard_right',
  'bball_catch',   // HOOPS-10PHASE-2 phase 6: authored/basketball.ts — hands out to meet a pass, in to secure it
  // the quiz podium (BRAINBRAWL-MAJOR, 2026-09-24): authored/party.ts
  'party_think', 'party_buzz', 'party_locked', 'party_yes', 'party_facepalm', 'party_shrug', 'party_win', 'party_win_in', 'party_lose',
  'party_talk', 'party_present',   // BRAINBRAWL-RESIDUAL: the podiums and the host talk
]);

// NOTE ON THIS LIST. isResolvable() — and therefore installSafePlay's gate —
// consults this STATIC table, not the animator's live groups. So an authored
// clip that is registered, playing, and moving the rig is still rejected here if
// its name is absent, and the mode silently falls back to a safe pose. That is
// what happened the moment the board suite introduced names with no alias entry:
// `board_land` was built and registered, and still logged MISSING CLIP eight
// times a run. Anything added to anim/authored MUST be added here too.

/** The universal fallback when nothing better applies. Always real. */
const SAFE_DEFAULT = 'guard';

/** A name is resolvable if it is a real clip OR a known alias key that the
 *  resolver can map onto a real clip. */
export function isResolvable(name: string): boolean {
  return REAL_CLIPS.has(name) || Object.prototype.hasOwnProperty.call(CLIP_ALIASES, name);
}

/**
 * Semantic gesture -> clip name. Every value is either a real clip or a known
 * alias key, so playGesture() is always resolvable. Re-point the whole game at
 * real assets by editing this one table. //TUNE(elijah): gesture->clip mapping.
 */
export const SPORT_CLIP = {
  // locomotion (shared)
  idle: 'idle_stand',
  moveLoop: 'run',
  // MODE-STICK-FACE family (2026-09-07): sport-correct loco. A fighter moves with the guard UP, a carrier with the
  // ball TUCKED — the shared run (arms pumping at the hips) is for athletes with empty hands.
  combatStep: 'karate_guard_step',
  footballCarryRun: 'football_carry_run',
  walkLoop: 'walk',
  jumpUp: 'jump_up',
  jumpLand: 'jump_land',
  fallReact: 'football_tackled_fall',

  // basketball
  dunkChargeGather: 'dunk_charge_gather',
  dunkLaunchPower: 'dunk_launch',
  dunkLaunchFlashy: 'roundhouse',
  dunkLaunchSig: 'dunk_360_eastbay',
  dunkScoreHang: 'dunk_score_hang',
  dunkLandCrouch: 'dunk_land_crouch',
  // M111 performance/timing-driven finishes
  dunkFinishWindmill: 'dunk_finish_windmill',
  dunkFinishTomahawk: 'dunk_finish_tomahawk',
  dunkFinishBlown: 'dunk_finish_blown',
  dunkCelebrateBig: 'dunk_celebrate_big',
  scoreCelebrate: 'dunk_celebrate_big',   // RECOGNISABLE (2026-09-15): arms up for a make — was the karate uppercut (3PT, carnival)
  buzzerSlap: 'uppercut',               // the quiz podium's buzz: a hand driven straight up IS the move there (party/Contestants)
  // M47 alley-oop prop — teammate toss/catch beat (mapped to real clips)
  teammateToss: 'jumpshot',            // arm-raise reads as a lob release
  teammateIdle: 'idle_stand',

  // karate
  karateStance: 'guard',
  karateJab: 'jab',
  karateKick: 'high_kick',
  karateHeavy: 'uppercut',
  karateBlock: 'karate_block',   // ANIM-READABILITY (combat, 2026-09-07): the authored high guard (was the stance clip — invisible)
  karateHitReact: 'karate_hit_react',
  karateKnockdown: 'karate_knockdown',
  karateWindup: 'karate_windup_hold',   // ANIM-READABILITY (creative, 2026-09-07): the telegraph — rear fist chambered, weight back

  // football
  footballJukeLeft: 'football_juke_left',
  footballJukeRight: 'football_juke_right',
  footballSpin: 'football_spin_move',
  footballHurdle: 'jump_up',
  footballTackled: 'football_tackled_fall',

  // Board sports (skate / snowboard / surf). These were fighter-rig stand-ins --
  // a real, readable motion beats a T-pose while riding, and that is what they
  // bought. But 'guard' is a KARATE GUARD: upright, square to the front, fists
  // up. Three of the eight resolved to it, so the idle, the tuck and the grind
  // were all the same martial-arts pose on a moving board.
  //
  // boardSuite.ts authors these for real now. Repointing the TABLE matters as
  // much as authoring them: skate drives its animation through BoardAnimTree,
  // but surf and snowboard call SPORT_CLIP.board* directly, so pointing only
  // the tree at the new clips left two of the three modes still riding in a
  // karate stance -- which is exactly what the first snowboard capture showed.
  boardIdle: 'board_ride_idle',
  boardCarve: 'board_carve_right',
  boardAir: 'board_air',
  boardGrab: 'board_grab',
  boardFlipTrick: 'skate_kickflip',
  boardGrind: 'board_grind',
  boardTuck: 'board_tuck',
  boardBail: 'skate_bail',

  // precision sports
  golfAddress: 'golf_address_idle',   // Phase 3: authored (was the karate guard)
  golfSwing: 'golf_swing_full',       // (was the roundhouse)
  golfPutt: 'golf_putt',              // ANIM-READABILITY (net / precision, 2026-09-07): on the green (was the full swing)
  golfFinish: 'golf_finish_hold',     // ANIM-READABILITY: the finish held after the swing (was a 0.12 s snap back to the address)
  tennisIdle: 'tennis_ready',
  tennisForehand: 'tennis_swing',
  tennisServe: 'tennis_serve',        // ANIM-READABILITY: the serve (was the forehand)
  tennisShuffleLeft: 'tennis_shuffle_left', tennisShuffleRight: 'tennis_shuffle_right',   // the baseline shuffle in the ready arms (was the hanging strafe)
  volleyReady: 'volleyball_ready', volleySpike: 'volleyball_spike',
  volleyBlock: 'volleyball_block',    // ANIM-READABILITY: the block (was the spike)
  volleyShuffleLeft: 'volleyball_shuffle_left', volleyShuffleRight: 'volleyball_shuffle_right',
  derbyStance: 'baseball_stance',        // Phase 6: real bat stance (was the karate guard)
  derbySwing: 'baseball_swing',          // (was the uppercut)
  derbyPitch: 'baseball_pitch_over',     // fastball + changeup: the same look, by design
  derbyPitchSide: 'baseball_pitch_side', // the slider's three-quarter arm slot
  penaltyIdle: 'idle_stand',
  penaltyStrike: 'soccer_kick_shoot',  // (was the karate high kick)
  keeperIdle: 'keeper_set',
  keeperDive: 'keeper_dive',           // (was the jumpshot)
  keeperDiveHold: 'keeper_dive_hold',  // ANIM-READABILITY: the stretch held on the ground until the kick is decided
  keeperRise: 'keeper_rise',           // ANIM-READABILITY: off the ground back to the set
} as const;

export type SportGesture = keyof typeof SPORT_CLIP;

/**
 * Wraps a CharacterAnimator so EVERY play() call is validated. Cooperative:
 * resolvable names (real clip OR known alias) pass straight through to the
 * resolver-backed play; only a genuinely-unknown name is logged loudly and
 * redirected to SAFE_DEFAULT. Idempotent (guarded by __safePlayInstalled).
 * Call once per spawned character, immediately after neverBindPose().
 */
export function installSafePlay(animator: CharacterAnimator, modeId: string): void {
  const a = animator as CharacterAnimator & { __safePlayInstalled?: boolean };
  if (a.__safePlayInstalled) return;
  a.__safePlayInstalled = true;
  const rawPlay = animator.play.bind(animator);
  animator.play = (name: string, opts: PlayOpts = {}) => {
    // A registered authored clip is resolvable too. isResolvable() knows the
    // GLB's clips and the static alias table only, so an authored clip with no
    // alias entry (tennis_swing, keeper_dive…) was refused here and never
    // reached the resolver that would have found it — measured 2026-09-03.
    if (!isResolvable(name) && !animator.clipNames.has(name)) {
      reportDiag('clip', `MISSING CLIP ${name} in ${modeId}`);
      console.error(`[FEL-ANIM] MISSING CLIP "${name}" requested in "${modeId}" — no real clip or alias; falling back to "${SAFE_DEFAULT}" (bind pose avoided)`);
      return rawPlay(SAFE_DEFAULT, opts);
    }
    // resolvable — let the resolver-backed play handle real clips + aliases
    return rawPlay(name, opts);
  };
}

/** Convenience: play a semantic gesture by its SPORT_CLIP key. */
export function playGesture(animator: CharacterAnimator, gesture: SportGesture, opts: PlayOpts = {}): void {
  animator.play(SPORT_CLIP[gesture], opts);
}
