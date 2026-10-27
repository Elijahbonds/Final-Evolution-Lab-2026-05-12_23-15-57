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
} as const satisfies Record<string, string>;
