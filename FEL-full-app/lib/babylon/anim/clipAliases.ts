// Registry clip name → [existing asset clip, speedRatio].
// Current asset (elijah-hero.glb): guard, high_kick, hook, jab, jumpshot,
// roundhouse, run, walk, uppercut. Authored clips (see files/anim/authored/*)
// register under their REGISTRY names and take precedence over these aliases.

export const CLIP_ALIASES: Record<string, [string, number]> = {
  // locomotion
  idle_stand: ['guard', 0.45],
  idle: ['idle_stand', 1.0],
  cheer: ['jump_up', 0.9],     // Ship Pass 6: the roster crowd's cheer — arms overhead on the big moment (no baked cheer on any body)   // Ship Pass 6: roster bodies never baked an 'idle'; the authored idle_stand stands in (karate enemies asked for it)
  walk_forward: ['walk', 1.0],
  run_forward: ['run', 1.0],
  run_backward: ['run', -1.0],
  sprint_forward: ['run', 1.4],
  jump_up: ['jumpshot', 1.1],
  jump_land: ['guard', 1.6],
  fall_loop: ['freerun_air_hold', 1.0],   // RECOGNISABLE (2026-09-15): a body in the air, not the karate guard
  strafe_left: ['walk', 1.1],
  strafe_right: ['walk', 1.1],
  // dunk
  dunk_approach_run: ['run', 1.2],
  dunk_charge_gather: ['guard', 1.2],
  dunk_launch: ['jumpshot', 1.0],
  dunk_airborne_float: ['jumpshot', 0.35],
  dunk_score_hang: ['jumpshot', 0.5],
  dunk_land_crouch: ['guard', 1.4],
  // DUNK-CONTROL-JUICE (2026-09-08): the mid-air tricks used to alias onto the JUMPSHOT (a set shot, 0.8×) — the 360, the
  // windmill and the between-the-legs now play authored dunk bodies (the eastbay is authored under its own name).
  dunk_360_scoop: ['dunk_360_spin', 1.0],
  dunk_360_eastbay: ['jumpshot', 0.8],
  dunk_360_fake_eastbay: ['dunk_360_eastbay', 1.0],
  dunk_off_board_windmill: ['dunk_finish_windmill', 1.0],
  // karate
  karate_idle_stance: ['guard', 0.8],
  karate_punch_light: ['jab', 1.1],
  karate_punch_heavy: ['hook', 0.95],
  karate_kick_roundhouse: ['roundhouse', 1.0],
  // THE HUNDRED distinct moves (2026-09-15): each string has its own captured motion (karate_mc_* in authored/mocapOpponents).
  // These aliases are the fallback when a rig could not build the capture — the move still reads as its family of swing.
  karate_cross: ['hook', 1.0],
  karate_whirl: ['roundhouse', 1.0],
  karate_backspin: ['roundhouse', 1.0],
  karate_typhoon: ['uppercut', 1.0],
  karate_hammer: ['hook', 1.0],
  karate_heavy: ['uppercut', 1.0],
  karate_rush: ['jab', 1.0],
  karate_stagger: ['karate_hit_react', 0.7],   // REACTIVE ENEMIES: the reel falls back to a slow flinch
  karate_counter_throw: ['uppercut', 0.9],
  karate_dodge_roll: ['karate_roll', 1.0],   // RECOGNISABLE: the authored roll (was the guard)
  karate_hit_react: ['guard', 2.0],
  karate_knockdown: ['guard', 0.8],
  karate_victory_pose: ['dunk_celebrate_big', 1.0],   // ANIM-READABILITY (combat): arms overhead, not a slow uppercut
  // basketball
  bball_dribble_run: ['run', 0.9],
  bball_shoot_jumper: ['jumpshot', 1.0],
  bball_score_celebrate: ['dunk_celebrate_big', 1.0],   // RECOGNISABLE: arms up for a make (was the karate uppercut)
  bball_defend_stance: ['bball_defend_slide_left', 0.45],   // low, wide, slow sway
  // football
  football_sprint_return: ['run', 1.35],
  football_juke_left: ['walk', 1.8],
  football_juke_right: ['walk', 1.8],
  football_spin_move: ['roundhouse', 1.2],
  // football_stiff_arm: authored (anim/authored/football) — was ['jab', 0.8]
  football_touchdown_spike: ['football_td_spike', 1.0],   // SHARED-ANIM-BUS: was the karate uppercut
  football_tackled_fall: ['guard', 1.2],
  // soccer
  soccer_dribble_jog: ['run', 0.85],
  soccer_kick_shoot: ['high_kick', 1.0],
  soccer_kick_pass: ['soccer_kick_shoot', 1.25],   // RECOGNISABLE: a kick through a ball (was the karate high kick)
  soccer_tackle_slide: ['freerun_slide', 1.0],   // RECOGNISABLE: down on the hip (was the guard)
  soccer_goal_celebrate: ['dunk_celebrate_big', 1.0],
  soccer_header_jump: ['jump_up', 1.1],
  // golf / baseball
  golf_address_idle: ['guard', 0.5],
  golf_swing_full: ['hook', 0.7],
  golf_putt_stroke: ['golf_putt', 1.0],
  golf_fist_pump: ['dunk_celebrate_big', 1.0],
  // SHARED-ANIM-BUS (2026-09-14): the bat names play the BAT clips (anim/authored/baseball) — they were the karate guard
  // and the karate hook, so any caller still using the old names swung a boxer's hook with a bat in its hand.
  baseball_bat_stance: ['baseball_stance', 1.0],
  baseball_swing_full: ['baseball_swing', 1.0],
  baseball_contact_drive: ['baseball_swing', 1.1],
  baseball_homer_trot: ['run', 0.7],
  // board sports
  skate_idle_cruise: ['guard', 0.5],
  skate_kickflip: ['high_kick', 1.2],
  skate_heelflip: ['skate_kickflip', 1.0],   // RECOGNISABLE: the flip clip (the deck's direction is TrickPose's)
  skate_treflip: ['skate_kickflip', 0.9],
  skate_bail: ['guard', 1.5],
  snow_carve_loop: ['guard', 0.5],
  snow_jump: ['board_air', 1.0],
  snow_grab: ['board_grab', 1.0],
  surf_carve_loop: ['guard', 0.5],
  surf_aerial: ['board_air', 1.0],
  surf_tube_loop: ['guard', 0.4],
  // M39 shared board-core clips (skate/snowboard/surf ride on these five)
  board_ride_idle: ['guard', 0.6],
  board_air: ['jumpshot', 0.5],
  board_tuck: ['guard', 1.25],
  board_grab: ['jumpshot', 0.4],
  board_grind: ['guard', 1.0],
  // M40 precision-sports clips (tennis / golf / baseball / soccer)
  tennis_forehand: ['tennis_swing', 1.0],   // RECOGNISABLE: the racket swing (was the boxer's hook)
  golf_address: ['guard', 0.5],
  golf_drive_swing: ['golf_swing_full', 1.0],
  derby_bat_stance: ['baseball_stance', 1.0],
  derby_swing: ['baseball_swing', 1.0],
  derby_pitch: ['baseball_pitch_over', 1.0],
  penalty_strike: ['soccer_kick_shoot', 1.0],
  keeper_dive_left: ['keeper_dive', 1.0],   // RECOGNISABLE: a keeper dive, never a roundhouse; mirrored variants are registered per-mode when available
  keeper_dive_right: ['keeper_dive', 1.0],
};

export const FALLBACK_CLIP: [string, number] = ['guard', 0.6];
