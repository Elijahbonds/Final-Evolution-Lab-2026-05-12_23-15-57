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
  'idle_stand', 'strafe_left', 'strafe_right', 'jump_up', 'jump_land',
  'dunk_charge_gather', 'dunk_launch', 'dunk_mocap', 'dunk_360_eastbay', 'dunk_score_hang', 'dunk_land_crouch',
  'dunk_finish_windmill', 'dunk_finish_tomahawk', 'dunk_finish_blown', 'dunk_celebrate_big',
  'football_juke_left', 'football_juke_right', 'football_spin_move', 'football_tackled_fall',
  'karate_hit_react', 'karate_knockdown', 'karate_guard_step',   // the guard step (MODE-STICK-FACE) was authored + registered but never listed here
  'karate_block', 'karate_guard_impact', 'karate_parry', 'karate_floor_hold', 'karate_get_up',   // ANIM-READABILITY (combat, 2026-09-07)
  'karate_windup_hold', 'freerun_air_hold', 'freerun_tuck', 'freerun_slide',   // ANIM-READABILITY (creative, 2026-09-07)
  // the racket / club / net / keeper sports (anim/authored/{tennis,volleyball,golf,soccer}) — Phase 3, 2026-09-03; never
  // listed here (installSafePlay's clipNames check carried them). ANIM-READABILITY (net / precision, 2026-09-07) adds
  // the putt, the ready shuffles, the keeper's held stretch and rise.
  'tennis_ready', 'tennis_swing', 'tennis_serve', 'tennis_shuffle_left', 'tennis_shuffle_right',
  'volleyball_ready', 'volleyball_spike', 'volleyball_block', 'volleyball_shuffle_left', 'volleyball_shuffle_right',
  'golf_address_idle', 'golf_swing_full', 'golf_putt', 'golf_finish_hold',
  'soccer_kick_shoot', 'keeper_set', 'keeper_dive', 'keeper_dive_hold', 'keeper_rise',
  // basketball packages (anim/authored/basketball) — Phase 4, 2026-09-03
  'bball_dribble_idle', 'bball_crossover_left', 'bball_crossover_right', 'bball_hesi',
  'bball_layup_gather', 'bball_defend_slide_left', 'bball_defend_slide_right',
  'bball_block_reach', 'bball_steal_reach',
  // baseball packages (anim/authored/baseball) — Phase 6, 2026-09-03
  'baseball_stance', 'baseball_swing', 'baseball_pitch_over', 'baseball_pitch_side',
  // board suite — skate / surf / snowboard share these (anim/authored/boardSuite)
  'board_ride_idle', 'board_carve_left', 'board_carve_right', 'board_tuck',
  'board_grab', 'board_air', 'board_grind', 'board_land', 'board_push',
  'skate_kickflip', 'skate_bail',
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
  scoreCelebrate: 'uppercut',
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
