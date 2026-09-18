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
  'karate_hit_react', 'karate_knockdown',
]);

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
  karateBlock: 'guard',
  karateHitReact: 'karate_hit_react',
  karateKnockdown: 'karate_knockdown',

  // football
  footballJukeLeft: 'football_juke_left',
  footballJukeRight: 'football_juke_right',
  footballSpin: 'football_spin_move',
  footballHurdle: 'jump_up',
  footballTackled: 'football_tackled_fall',

  // board sports (skate / snowboard / surf) — fighter-rig clips give real,
  // readable motion instead of a static T-pose while riding.
  boardIdle: 'guard',
  boardCarve: 'walk',
  boardAir: 'jump_up',
  boardGrab: 'hook',
  boardFlipTrick: 'roundhouse',
  boardGrind: 'guard',
  boardTuck: 'guard',
  boardBail: 'football_tackled_fall',

  // precision sports
  golfAddress: 'guard',
  golfSwing: 'roundhouse',
  tennisIdle: 'guard',
  tennisForehand: 'jab',
  derbyStance: 'guard',
  derbySwing: 'uppercut',
  derbyPitch: 'jab',
  penaltyIdle: 'guard',
  penaltyStrike: 'high_kick',
  keeperIdle: 'guard',
  keeperDive: 'jumpshot',
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
    if (!isResolvable(name)) {
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
