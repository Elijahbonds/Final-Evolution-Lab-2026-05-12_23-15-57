/**
 * lib/anim/clip-registry.ts
 * =========================
 * M7a — canonical animation clip registry.
 *
 * Ports the donor `nexus::gameplay::clips` namespace
 * (gameplay__character_anim_state.h) into a typed TS const map, and folds in
 * the 10 mocap descriptor JSONs shipped in batch 5
 * (public/mocap/descriptors/anim_*.json) as registry metadata.
 *
 * This is the SINGLE source of truth for logical clip names. The animation
 * state machine (state-machine.ts) resolves game state into one of these
 * logical names; the avatar driver (avatar-driver.ts) maps the logical name
 * onto whatever concrete clip a given GLB actually ships (see CLIP_ALIASES).
 *
 * Pure data + pure helpers — no THREE, no DOM. Fully unit-testable.
 */

export type ClipCategory =
  | 'locomotion'
  | 'dunk'
  | 'karate'
  | 'basketball'
  | 'soccer'
  | 'football'
  | 'board'
  | 'story';

export interface ClipDef {
  /** Logical clip name (lower_snake_case, matches donor clips:: namespace). */
  name: string;
  category: ClipCategory;
  /** Looping clip (idle/locomotion/guard) vs. one-shot action. */
  loop: boolean;
}

/* ────────────────────────────────────────────────────────────────────────
 * clips:: namespace — verbatim logical names from the donor header.
 * ──────────────────────────────────────────────────────────────────────── */
export const CLIPS = {
  // Locomotion
  idle: 'idle_stand',
  run: 'run_forward',
  runBack: 'run_backward',
  sprint: 'sprint_forward',
  jump: 'jump_up',
  land: 'jump_land',
  fall: 'fall_loop',
  strafeL: 'strafe_left',
  strafeR: 'strafe_right',
  walk: 'walk_forward',

  // Dunk contest
  dunkApproach: 'dunk_approach_run',
  dunkCharge: 'dunk_charge_gather',
  dunkLaunch: 'dunk_launch',
  dunkAirborne: 'dunk_airborne_float',
  dunkScore: 'dunk_score_hang',
  dunkLand: 'dunk_land_crouch',
  dunk360Scoop: 'dunk_360_scoop',
  dunk360Eastbay: 'dunk_360_eastbay',
  dunk360FakeEastbay: 'dunk_360_fake_eastbay',
  dunkOffBoardWindmill: 'dunk_off_board_windmill',

  // Karate / combat
  karateIdle: 'karate_idle_stance',
  karateLightP: 'karate_punch_light',
  karateHeavyP: 'karate_punch_heavy',
  karateKick: 'karate_kick_roundhouse',
  karateBlock: 'karate_block',
  karateDodge: 'karate_dodge_roll',
  karateCounter: 'karate_counter_throw',
  karateHit: 'karate_hit_react',
  karateDown: 'karate_knockdown',
  karateWin: 'karate_victory_pose',

  // Basketball (pickup / 3v3)
  bballDribble: 'bball_dribble_run',
  bballShoot: 'bball_shoot_jumper',
  bballScore: 'bball_score_celebrate',
  bballDefend: 'bball_defend_stance',
  bballBlock: 'bball_block_reach',

  // Soccer
  soccerDribble: 'soccer_dribble_jog',
  soccerShoot: 'soccer_kick_shoot',
  soccerPass: 'soccer_kick_pass',
  soccerTackle: 'soccer_tackle_slide',
  soccerCeleb: 'soccer_goal_celebrate',
  soccerHeader: 'soccer_header_jump',

  // Football / kick return
  fbSprint: 'football_sprint_return',
  fbJukeLeft: 'football_juke_left',
  fbJukeRight: 'football_juke_right',
  fbSpin: 'football_spin_move',
  fbStiffArm: 'football_stiff_arm',
  fbTouchdown: 'football_touchdown_spike',
  fbTackled: 'football_tackled_fall',

  // Golf (M7b hero mode) // TUNE(elijah)
  golfIdle: 'golf_address_idle',
  golfSwing: 'golf_swing_full',
  golfPutt: 'golf_putt_stroke',
  golfCeleb: 'golf_fist_pump',

  // Baseball (M7b hero mode) // TUNE(elijah)
  baseballStance: 'baseball_bat_stance',
  baseballSwing: 'baseball_swing_full',
  baseballContact: 'baseball_contact_drive',
  baseballCeleb: 'baseball_homer_trot',

  // Board sports
  skateIdle: 'skate_idle_cruise',
  skateKickflip: 'skate_kickflip',
  skateHeelflip: 'skate_heelflip',
  skateTreflip: 'skate_treflip',
  skateBail: 'skate_bail_fall',
  snowCarve: 'snow_carve_lean',
  snowJump: 'snow_jump_float',
  snowGrab: 'snow_grab_indy',
  surfCarve: 'surf_carve_cutback',
  surfAerial: 'surf_aerial_360',
  surfTube: 'surf_tube_crouch',

  // Story / traversal
  grindEnter: 'grind_enter_lock',
  grindLoop: 'grind_loop_slide',
  grindTrick: 'grind_trick_pose',
  grindJump: 'grind_jump_exit',
  flightLaunch: 'flight_launch_burst',
  flightGlide: 'flight_glide_loop',
  flightBoost: 'flight_boost_surge',
  flightLand: 'flight_land_soft',
  boardMove: 'board_token_hop',
  boardLand: 'board_token_land',
  boardBoss: 'board_boss_ready',
} as const;

export type ClipKey = keyof typeof CLIPS;
export type ClipName = (typeof CLIPS)[ClipKey];

/** Loop-vs-oneshot classification for every logical clip name. */
const LOOPING = new Set<string>([
  CLIPS.idle, CLIPS.run, CLIPS.runBack, CLIPS.sprint, CLIPS.fall,
  CLIPS.strafeL, CLIPS.strafeR, CLIPS.walk,
  CLIPS.dunkApproach, CLIPS.dunkAirborne,
  CLIPS.karateIdle,
  CLIPS.bballDribble, CLIPS.bballDefend,
  CLIPS.soccerDribble,
  CLIPS.fbSprint,
  CLIPS.golfIdle, CLIPS.baseballStance,
  CLIPS.skateIdle, CLIPS.snowCarve, CLIPS.surfCarve, CLIPS.surfTube,
  CLIPS.grindLoop, CLIPS.flightGlide,
]);

export function isLoopClip(name: string): boolean {
  return LOOPING.has(name);
}

/* ────────────────────────────────────────────────────────────────────────
 * Mocap descriptors (batch 5) — folded-in metadata.
 * Each descriptor routes a logical clip into its ABP / blend-space / modes.
 * Descriptor JSON lives at public/mocap/descriptors/<id>.json (FBX urls).
 * ──────────────────────────────────────────────────────────────────────── */
export interface MocapDescriptor {
  id: string;
  clip: string; // logical clip name it feeds
  abp: string | null; // animation blueprint bucket
  blendSpace: string | null; // blend-space membership (locomotion)
  loop: boolean;
  modes: string[]; // game modes that consume this clip
  descriptorPath: string; // public path to the JSON descriptor
}

export const MOCAP_DESCRIPTORS: Record<string, MocapDescriptor> = {
  standing_idle: {
    id: 'anim_standing_idle', clip: CLIPS.idle, abp: 'ABP_Shared',
    blendSpace: 'BS_Shared_Locomotion', loop: true,
    modes: ['basketball_h2h', 'basketball_dunk', 'basketball_3v3', 'karate_h2h',
      'karate_endless', 'baseball', 'football', 'soccer', 'golf', 'tennis',
      'volleyball', 'surfing', 'gymnastics', 'brain_brawl'],
    descriptorPath: '/mocap/descriptors/anim_standing_idle.json',
  },
  sprint_run_loop: {
    id: 'anim_sprint_run_loop', clip: CLIPS.sprint, abp: 'ABP_Shared',
    blendSpace: 'BS_Shared_Locomotion', loop: true,
    modes: ['football', 'soccer', 'basketball_3v3', 'karate_endless'],
    descriptorPath: '/mocap/descriptors/anim_sprint_run_loop.json',
  },
  basketball_dribble_run: {
    id: 'anim_basketball_dribble_run', clip: CLIPS.bballDribble, abp: 'ABP_Basketball',
    blendSpace: 'BS_Basketball_Locomotion', loop: true,
    modes: ['basketball_h2h', 'basketball_3v3', 'basketball_dunk'],
    descriptorPath: '/mocap/descriptors/anim_basketball_dribble_run.json',
  },
  basketball_defensive_idle: {
    id: 'anim_basketball_defensive_idle', clip: CLIPS.bballDefend, abp: 'ABP_Basketball',
    blendSpace: null, loop: true,
    modes: ['basketball_h2h', 'basketball_3v3'],
    descriptorPath: '/mocap/descriptors/anim_basketball_defensive_idle.json',
  },
  basketball_jump_shot: {
    id: 'anim_basketball_jump_shot', clip: CLIPS.bballShoot, abp: 'ABP_Basketball',
    blendSpace: null, loop: false,
    modes: ['basketball_h2h', 'basketball_3v3', 'threePoint'],
    descriptorPath: '/mocap/descriptors/anim_basketball_jump_shot.json',
  },
  basketball_dunk: {
    id: 'anim_basketball_dunk', clip: CLIPS.dunkLaunch, abp: 'ABP_Basketball',
    blendSpace: null, loop: false,
    modes: ['basketball_dunk'],
    descriptorPath: '/mocap/descriptors/anim_basketball_dunk.json',
  },
  karate_idle_stance: {
    id: 'anim_karate_idle_stance', clip: CLIPS.karateIdle, abp: 'ABP_Karate',
    blendSpace: null, loop: true,
    modes: ['karate_h2h', 'karate_endless'],
    descriptorPath: '/mocap/descriptors/anim_karate_idle_stance.json',
  },
  karate_punch_kick_combo: {
    id: 'anim_karate_punch_kick_combo', clip: CLIPS.karateKick, abp: 'ABP_Karate',
    blendSpace: null, loop: false,
    modes: ['karate_h2h', 'karate_endless'],
    descriptorPath: '/mocap/descriptors/anim_karate_punch_kick_combo.json',
  },
  golf_swing: {
    id: 'anim_golf_swing', clip: 'golf_swing_full', abp: null,
    blendSpace: null, loop: false,
    modes: ['golf'],
    descriptorPath: '/mocap/descriptors/anim_golf_swing.json',
  },
  defeat_knockdown: {
    id: 'anim_defeat_knockdown', clip: CLIPS.karateDown, abp: 'ABP_Shared',
    blendSpace: null, loop: false,
    modes: ['karate_h2h', 'karate_endless', 'basketball_h2h'],
    descriptorPath: '/mocap/descriptors/anim_defeat_knockdown.json',
  },
};

/** All descriptors that belong to a given mode (used to preload a mode's set). */
export function descriptorsForMode(modeId: string): MocapDescriptor[] {
  return Object.values(MOCAP_DESCRIPTORS).filter((d) => d.modes.includes(modeId));
}

/** Look up the descriptor feeding a given logical clip name, if any. */
export function descriptorForClip(clipName: string): MocapDescriptor | null {
  return Object.values(MOCAP_DESCRIPTORS).find((d) => d.clip === clipName) ?? null;
}

/* ────────────────────────────────────────────────────────────────────────
 * CLIP_ALIASES — logical clip name → concrete clip names shipped in the
 * project GLBs (elijah-hero.glb, elijah.glb, /models/clips/*.glb).
 *
 * The state machine speaks logical names; a given GLB only carries a handful
 * of concrete clips. The driver walks the alias list in order and plays the
 * first one the loaded GLB actually has. This is how we guarantee
 * "velocity>0 ⇒ a locomotion clip plays" even when the ideal clip is absent:
 * every entry ends in a clip that ships in elijah-hero.glb.
 *
 * elijah-hero.glb clips: guard, jab, hook, high_kick, roundhouse, uppercut,
 *                        jumpshot, run, walk
 * ──────────────────────────────────────────────────────────────────────── */
export const CLIP_ALIASES: Record<string, string[]> = {
  // Locomotion
  [CLIPS.idle]: ['idle_stand', 'idle', 'guard'],
  [CLIPS.walk]: ['walk_forward', 'walk', 'run'],
  [CLIPS.run]: ['run_forward', 'run', 'walk'],
  [CLIPS.sprint]: ['sprint_forward', 'sprint', 'run', 'walk'],
  [CLIPS.runBack]: ['run_backward', 'walk', 'run'],

  // Karate — maps onto elijah-hero strike clips
  [CLIPS.karateIdle]: ['karate_idle_stance', 'guard', 'idle_stand', 'idle'],
  [CLIPS.karateLightP]: ['karate_punch_light', 'jab', 'hook'],
  [CLIPS.karateHeavyP]: ['karate_punch_heavy', 'hook', 'uppercut', 'jab'],
  [CLIPS.karateKick]: ['karate_kick_roundhouse', 'high_kick', 'roundhouse'],
  [CLIPS.karateBlock]: ['karate_block', 'guard'],
  [CLIPS.karateDodge]: ['karate_dodge_roll', 'guard'],
  [CLIPS.karateCounter]: ['karate_counter_throw', 'uppercut', 'hook'],
  [CLIPS.karateHit]: ['karate_hit_react', 'guard'],
  [CLIPS.karateDown]: ['karate_knockdown', 'guard'],
  [CLIPS.karateWin]: ['karate_victory_pose', 'guard'],

  // Basketball
  [CLIPS.bballDribble]: ['bball_dribble_run', 'run', 'walk'],
  [CLIPS.bballShoot]: ['bball_shoot_jumper', 'jumpshot'],
  [CLIPS.bballDefend]: ['bball_defend_stance', 'guard', 'idle_stand'],
  [CLIPS.bballBlock]: ['bball_block_reach', 'jumpshot'],
  [CLIPS.bballScore]: ['bball_score_celebrate', 'guard'],

  // Dunk
  [CLIPS.dunkApproach]: ['dunk_approach_run', 'run', 'sprint'],
  [CLIPS.dunkCharge]: ['dunk_charge_gather', 'guard'],
  [CLIPS.dunkLaunch]: ['dunk_launch', 'jumpshot'],
  [CLIPS.dunkAirborne]: ['dunk_airborne_float', 'jumpshot'],
  [CLIPS.dunkScore]: ['dunk_score_hang', 'jumpshot'],

  // Soccer — aliased onto elijah-hero.glb concrete clips // TUNE(elijah)
  [CLIPS.soccerDribble]: ['soccer_dribble_jog', 'run', 'walk'],
  [CLIPS.soccerShoot]: ['soccer_kick_shoot', 'high_kick', 'roundhouse'],
  [CLIPS.soccerPass]: ['soccer_kick_pass', 'jab', 'hook'],
  [CLIPS.soccerTackle]: ['soccer_tackle_slide', 'roundhouse', 'high_kick'],
  [CLIPS.soccerCeleb]: ['soccer_goal_celebrate', 'uppercut', 'guard'],
  [CLIPS.soccerHeader]: ['soccer_header_jump', 'jumpshot', 'high_kick'],

  // Football / kick return // TUNE(elijah)
  [CLIPS.fbSprint]: ['football_sprint_return', 'sprint', 'run', 'walk'],
  [CLIPS.fbJukeLeft]: ['football_juke_left', 'hook', 'jab'],
  [CLIPS.fbJukeRight]: ['football_juke_right', 'jab', 'hook'],
  [CLIPS.fbSpin]: ['football_spin_move', 'roundhouse', 'high_kick'],
  [CLIPS.fbStiffArm]: ['football_stiff_arm', 'uppercut', 'hook'],
  [CLIPS.fbTouchdown]: ['football_touchdown_spike', 'uppercut', 'guard'],
  [CLIPS.fbTackled]: ['football_tackled_fall', 'guard'],

  // Golf // TUNE(elijah)
  [CLIPS.golfIdle]: ['golf_address_idle', 'guard', 'idle_stand', 'idle'],
  [CLIPS.golfSwing]: ['golf_swing_full', 'roundhouse', 'high_kick', 'uppercut'],
  [CLIPS.golfPutt]: ['golf_putt_stroke', 'jab', 'guard'],
  [CLIPS.golfCeleb]: ['golf_fist_pump', 'uppercut', 'guard'],

  // Baseball // TUNE(elijah)
  [CLIPS.baseballStance]: ['baseball_bat_stance', 'guard', 'idle_stand', 'idle'],
  [CLIPS.baseballSwing]: ['baseball_swing_full', 'roundhouse', 'high_kick', 'uppercut'],
  [CLIPS.baseballContact]: ['baseball_contact_drive', 'high_kick', 'roundhouse'],
  [CLIPS.baseballCeleb]: ['baseball_homer_trot', 'uppercut', 'guard'],
};

/**
 * Resolve a logical clip name to the first concrete clip present in the
 * supplied GLB clip list. Guarantees a non-null result whenever `available`
 * is non-empty (final fallback = first available clip) so the driver never
 * leaves the avatar in a T-pose.
 */
export function resolveConcreteClip(logical: string, available: string[]): string | null {
  if (available.length === 0) return null;
  const set = new Set(available);
  if (set.has(logical)) return logical;
  const aliases = CLIP_ALIASES[logical];
  if (aliases) {
    for (const a of aliases) if (set.has(a)) return a;
  }
  // Never T-pose: prefer a guard/idle-ish clip, else first available.
  for (const fallback of ['guard', 'idle_stand', 'idle', 'walk', 'run']) {
    if (set.has(fallback)) return fallback;
  }
  return available[0];
}
