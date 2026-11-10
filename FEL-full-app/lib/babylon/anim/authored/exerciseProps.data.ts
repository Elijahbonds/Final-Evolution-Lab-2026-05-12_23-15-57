// Which prop each loop in exerciseProps.ts needs (LIBRARY-ANATOMY-2, 2026-10-25): data only, so the pure demo table
// (lib/library/demo.ts DEMO_PROPS) reads it without importing Babylon. The stage draws the prop (demo.ts PROP_SHAPES).
export const PROPPED_LOOPS = {
  ex_step_up: 'box', ex_step_up_knee: 'box', ex_step_up_lat: 'boxside', ex_step_down: 'stepbox', ex_step_down_lat: 'stepbox', ex_sl_box_squat: 'boxback',
  ex_bulgarian: 'rearbench', ex_bulgarian_bar: 'rearbench', ex_lying_leg_curl: 'legcurl', ex_seated_leg_curl: 'seat', ex_leg_extension: 'seat', ex_leg_extension_one: 'seat',
  ex_seated_calf: 'seat', ex_hip_thrust: 'thrust', ex_hip_thrust_sl: 'thrust', ex_bridge_feetup: 'feetbenchfront',
  ex_pullup: 'pullbar', ex_chinup: 'pullbar', ex_dead_hang: 'pullbar', ex_scap_pullup: 'pullbar', ex_pulldown: 'seat', ex_pulldown_close: 'seat', ex_pulldown_one: 'seat',
  ex_inverted_row: 'lowbar', ex_dip: 'dipbars', ex_dip_hold: 'dipbars', ex_bench_dip: 'dipbench', ex_bench_dip_bent: 'dipbench',
  ex_incline_pushup: 'handbench', ex_decline_pushup: 'feetbench', ex_wall_pushup: 'wall',
  ex_incline_curl: 'incline', ex_incline_curl_alt: 'incline', ex_spider_curl: 'proneincline', ex_chest_row: 'proneincline', ex_incline_y: 'proneincline', ex_incline_t: 'proneincline', ex_incline_w: 'proneincline',
  ex_preacher_curl: 'preacher', ex_preacher_curl_one: 'preacher', ex_concentration_curl: 'seat',
  // exerciseVariants.ts
  ex_calf_raise_step: 'calfstep', ex_calf_raise_step_sl: 'calfstep', ex_calf_raise_bent_step: 'calfstep', ex_calf_raise_bent_step_sl: 'calfstep',
  ex_wall_sit: 'wallback', ex_wall_sit_sl: 'wallback', ex_seated_row: 'rowseat', ex_seated_row_one: 'rowseat',
  ex_seated_reverse_fly: 'seat', ex_seated_reverse_fly_one: 'seat', ex_seated_kickback: 'seat', ex_seated_kickback_one: 'seat', ex_pullover: 'bench', ex_pullover_bent: 'bench',
  // exerciseDrills.ts (DEMO-LOOPS)
  ex_knee_to_wall: 'wall', ex_wall_drive: 'wall', ex_wall_march: 'wall',
  ex_back_wall_arm_raise: 'wallback', ex_wall_chin_tuck: 'wallback', ex_wall_slide_liftoff: 'wall', ex_box_jump: 'box', ex_drop_landing: 'stepbox',
  ex_seated_breathe: 'seat', ex_incline_scap_push_up: 'handbench', ex_supported_sl_rdl: 'dowel', ex_hip_airplane: 'dowel', ex_copenhagen_knee: 'cphbench', ex_copenhagen_raise_knee: 'cphbench', ex_calf_smr: 'roller', ex_piriformis_smr: 'rollerseat',
  ex_decline_press: 'decline', ex_decline_fly: 'decline', ex_decline_fly_one: 'decline', ex_decline_skull: 'decline', ex_decline_skull_one: 'decline',
  // exerciseWarmup.ts (DEMO-LOOPS-4): the wall the calf rock and the Wake-Up's locks lean on; the door post and the doorway
  ex_wall_calf_rock: 'wall', ex_wall_locks: 'wall', ex_doorway_chest_rock: 'doorpost', ex_door_row: 'doorway',
  // exerciseFamilies.ts (DEMO-LOOPS-4): the bar the hanging raises hang from, the parallel bars the knee raise holds itself up on
  ex_hang_leg_raise: 'pullbar', ex_hang_pike: 'pullbar', ex_bar_leg_raise: 'dipbars',
  // exerciseAsks.ts: the seat the one-leg calf raise sits on; the box the push-off (in front) and the stride jumps (beside) drive up from
  ex_seated_calf_one: 'seat', ex_box_pushoff: 'box', ex_stride_jump: 'boxside', ex_stride_jump_cross: 'boxside',
  // exerciseFamilies5.ts (DEMO-LOOPS-5): the flat bench the leg raise and pull-in lie on (the legs off its end), the bench the
  // seated tuck, the seated rope crunch and the chair stretches sit on
  ex_bench_leg_raise: 'bench', ex_bench_leg_pull_in: 'bench', ex_seated_leg_tuck: 'seat', ex_rope_crunch_seat: 'seat', ex_seat_side_bend: 'seat', ex_seat_twist: 'seat',
  // exerciseGrip.ts (DEMO-LOOPS-6): the bench the seated wrist curls sit on; the bench the kneeling ones lean across
  ex_wrist_curl: 'seat', ex_wrist_curl_down: 'seat', ex_wrist_curl_one: 'seat', ex_wrist_curl_one_down: 'seat', ex_wrist_curl_bench: 'handbench', ex_wrist_curl_bench_down: 'handbench',
  // exerciseFamilies7.ts (DEMO-LOOPS-7): the benches the presses, raises and twists sit or lie on; the decline bench; the bar
  ex_bench_press_one: 'bench', ex_chest_press_seat: 'seat', ex_chest_press_incline: 'seat', ex_chest_press_decline: 'seat', ex_incline_shoulder_raise: 'incline', ex_front_raise_incline: 'incline',
  ex_arnold_seated: 'seat', ex_bradford_seated: 'seat', ex_seat_twist_bar: 'seat', ex_decline_crunch: 'decline', ex_decline_oblique: 'decline', ex_decline_situp: 'decline', ex_gorilla_chin: 'pullbar',
  // exerciseFamilies8.ts (DEMO-LOOPS-8): the chair the ankle lesson's circles sit on, and the wall its knee-to-wall faces
  ex_ankle_unlock: 'seatwall',
  // the flat bench the lying curl, the raise-to-pullover and the Tate and JM presses lie on; the seats; the preacher pad the
  // machine triceps extension pushes down; the wall the lat stretch leans on
  ex_lying_db_curl: 'bench', ex_raise_pullover: 'bench', ex_tate_press: 'bench', ex_jm_press: 'bench', ex_pec_deck: 'seat', ex_chair_chest_stretch: 'seat',
  ex_machine_triceps: 'preacher', ex_lat_wall_stretch: 'wall',
  // exerciseFamilies9.ts (DEMO-LOOPS-9): the box beside the lateral box jump and behind the box squat; the seats; the rollers
  ex_box_jump_lat: 'boxside', ex_box_squat_bar: 'boxback', ex_seated_high_row: 'seat', ex_row_to_neck: 'rowseat',
  ex_hamstring_smr: 'rollerthigh', ex_quad_smr: 'rollerquad', ex_upper_back_smr: 'rollerback', ex_lower_back_smr: 'rollerlow',
  // exerciseFamilies10.ts (DEMO-LOOPS-10): the chair, the thigh machines' seat, the rollers under the side of the leg, the bar
  ex_chair_leg_out: 'seat', ex_seat_abduction: 'seat', ex_seat_adduction: 'seat', ex_it_band_smr: 'rollerit', ex_peroneal_smr: 'rollershin',
  ex_pullup_rear: 'pullbar', ex_pullup_side: 'pullbar', ex_sternum_chin: 'pullbar',
} as const satisfies Record<string, string>;
