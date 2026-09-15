// registerAuthoredClips — build the authored clips a body's MODE owns against the live skeleton and register them
// into the CharacterAnimator. Registry-name hits beat aliases.
//
// SHARED-ANIM-BUS (2026-09-14): scoped. Every entry below is [clip name, builder]; a spawn builds core + the suites and
// borrows its mode names in clipScope.ts (read off `scene.metadata.felModeId`) and skips the rest — a skateboarder's rig
// no longer carries, logs or can play the dunk suite. An unscoped scene (no mode) still builds everything.

import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import type { CharacterAnimator } from '../CharacterAnimator';
import { ledgerFor, scopeAllows, scopeForScene, suiteOfClip, type ClipScope } from '../clipScope';
import { buildEastbay } from './eastbay';
import { buildChargeGather, buildLaunch, buildScoreHang, buildLandCrouch } from './dunkSuite';
import { buildMocapDunk } from './mocapDunk';
import { buildFinishWindmill, buildFinishTomahawk, buildFinishBlown, buildCelebrateBig } from './dunkFinishes';
import { buildSelfLob, buildBounceThrow, buildKickUp, buildCartwheel, buildDoubleUp, buildScorpion, buildLostFound, buildHideSeek, buildSpin360, buildBetweenLegs, buildCradle, buildDoubleClutch } from './dunkTricks';
import { buildIdleStand, buildStrafe, buildJumpUp, buildJumpLand } from './locomotion';
import { buildBaseClips } from './baseClips';
import { buildJuke, buildSpinMove, buildTackledFall, buildCarryRun, buildTouchdownSpike, buildStiffArm, buildQbThrow } from './football';
import { buildHitReact, buildKnockdown, buildGuardStep, buildShuffle, buildBlockHold, buildGuardImpact, buildParry, buildFloorHold, buildGetUp, buildWindupHold, buildEvade, buildLeanDodge, buildCombatRoll, buildCombatJump } from './karate';
import { buildFreeRunAirHold, buildFreeRunTuck, buildFreeRunSlide } from './freerun';
import {
  buildDribbleIdle, buildCrossover, buildHesi, buildLayupGather, buildDefendSlide, buildBlockReach, buildStealReach, buildFollowThrough,
  buildPullupGather, buildFloater, buildHandUp, buildScreenSet,   // HOOPS-MOVE-KIT-A
  buildPostUp, buildFadeaway, buildHook, buildSpin,   // HOOPS-MOVE-KIT-B (2026-09-08): the post kit (M4–M6)
  buildPumpFake, buildStepThrough, buildPivot, buildReverseLayup, buildHopStep, buildEuroStep,   // HOOPS-MOVE-KIT-B wave 2: the footwork (M8–M14)
} from './basketball';
import { buildBatStance, buildBatSwing, buildPitchOver, buildPitchSide } from './baseball';
import { buildGolfAddress, buildGolfSwing, buildGolfPutt, buildGolfFinishHold } from './golf';
import { buildTennisReady, buildTennisServe, buildTennisSwing, buildTennisShuffle } from './tennis';
import { buildVolleyBlock, buildVolleyReady, buildVolleySpike, buildVolleyShuffle } from './volleyball';
import { buildKeeperDive, buildKeeperSet, buildSoccerKick, buildKeeperDiveHold, buildKeeperRise } from './soccer';
import {
  buildBoardRideIdle, buildBoardCarveLeft, buildBoardCarveRight, buildBoardTuck,
  buildBoardGrab, buildBoardAir, buildBoardGrind, buildBoardLand, buildBoardPush,
  buildSkateKickflip, buildSkateBail,
  buildBoardManual, buildSkateOllie,   // VENICE-SKATE-THPS (2026-09-09): the manual had no clip and the pop had no body
} from './boardSuite';

export function registerAuthoredClips(
  animator: CharacterAnimator, scene: Scene, skeleton: Skeleton,
  scope: ClipScope | null = scopeForScene(scene),
): string[] {
  const builders: [string, () => AnimationGroup | null][] = [
    ['idle_stand', () => buildIdleStand(scene, skeleton)],
    ['strafe_left', () => buildStrafe(scene, skeleton, 'left')],
    ['strafe_right', () => buildStrafe(scene, skeleton, 'right')],
    ['jump_up', () => buildJumpUp(scene, skeleton)],
    ['jump_land', () => buildJumpLand(scene, skeleton)],
    ['dunk_charge_gather', () => buildChargeGather(scene, skeleton)],
    ['dunk_launch', () => buildLaunch(scene, skeleton)],
    ['dunk_mocap', () => buildMocapDunk(scene, skeleton)],
    ['dunk_360_eastbay', () => buildEastbay(scene, skeleton)],
    ['dunk_score_hang', () => buildScoreHang(scene, skeleton)],
    ['dunk_land_crouch', () => buildLandCrouch(scene, skeleton)],
    ['dunk_finish_windmill', () => buildFinishWindmill(scene, skeleton)],
    ['dunk_finish_tomahawk', () => buildFinishTomahawk(scene, skeleton)],
    ['dunk_finish_blown', () => buildFinishBlown(scene, skeleton)],
    ['dunk_celebrate_big', () => buildCelebrateBig(scene, skeleton)],
    // DUNK-CONTROL-JUICE (2026-09-08): the named dunks — runway beats (self-lob, kick-up, cartwheel, double-up) and air shapes
    ['dunk_self_lob', () => buildSelfLob(scene, skeleton)],
    ['dunk_bounce_throw', () => buildBounceThrow(scene, skeleton)],   // DUNK-GLASS-BOUNCE: the bounce lob's two-hand throw down
    ['dunk_kick_up', () => buildKickUp(scene, skeleton)],
    ['dunk_cartwheel', () => buildCartwheel(scene, skeleton)],
    ['dunk_double_up', () => buildDoubleUp(scene, skeleton)],
    ['dunk_scorpion', () => buildScorpion(scene, skeleton)],
    ['dunk_lost_found', () => buildLostFound(scene, skeleton)],
    ['dunk_hide_seek', () => buildHideSeek(scene, skeleton)],
    ['dunk_between_legs', () => buildBetweenLegs(scene, skeleton)],   // the hardest trick finally has its own body (it shared the eastbay's)
    ['dunk_cradle', () => buildCradle(scene, skeleton)],
    ['dunk_double_clutch', () => buildDoubleClutch(scene, skeleton)],
    ['dunk_360_spin', () => buildSpin360(scene, skeleton)],
    ['football_juke_left', () => buildJuke(scene, skeleton, 'left')],
    ['football_juke_right', () => buildJuke(scene, skeleton, 'right')],
    ['football_spin_move', () => buildSpinMove(scene, skeleton)],
    ['football_tackled_fall', () => buildTackledFall(scene, skeleton)],
    ['football_td_spike', () => buildTouchdownSpike(scene, skeleton)],   // SHARED-ANIM-BUS: the spike (was an alias onto the karate uppercut)
    ['football_stiff_arm', () => buildStiffArm(scene, skeleton)],   // RECOGNISABLE: the locked shove (was an alias onto the jab)
    ['football_throw', () => buildQbThrow(scene, skeleton)],        // RECOGNISABLE: the pass (the tree's throw played the jab)
    ['karate_hit_react', () => buildHitReact(scene, skeleton)],
    ['karate_knockdown', () => buildKnockdown(scene, skeleton)],
    // MODE-STICK-FACE family (2026-09-07): sport-correct loco — the carrier's tucked-ball run, the fighter's guard step
    ['football_carry_run', () => buildCarryRun(scene, skeleton)],
    ['karate_guard_step', () => buildGuardStep(scene, skeleton)],
    ['karate_shuffle_left', () => buildShuffle(scene, skeleton, 'left')],    // BIOMECH-WAVE2 (2026-09-09) G2: a lock-on fighter travels SIDEWAYS — the forward guard step was the only loco either duel had
    ['karate_shuffle_right', () => buildShuffle(scene, skeleton, 'right')],
    ['karate_roll', () => buildCombatRoll(scene, skeleton)],    // 2026-09-14: combat had no roll and no jump at all
    ['karate_jump', () => buildCombatJump(scene, skeleton)],
    ['karate_block', () => buildBlockHold(scene, skeleton)],     // ANIM-READABILITY (combat, 2026-09-07): the guard verbs and the floor
    ['karate_guard_impact', () => buildGuardImpact(scene, skeleton)],
    ['karate_parry', () => buildParry(scene, skeleton)],
    ['karate_floor_hold', () => buildFloorHold(scene, skeleton)],
    ['karate_get_up', () => buildGetUp(scene, skeleton)],
    ['karate_windup_hold', () => buildWindupHold(scene, skeleton)],   // ANIM-READABILITY (creative, 2026-09-07): the counter-strike rival's telegraph
    ['karate_lean_dodge', () => buildLeanDodge(scene, skeleton)],    // KARATE-NEO-COOP (2026-09-07): the bullet-time lean (the endless dodge with no stick held)
    ['karate_evade', () => buildEvade(scene, skeleton)],        // KARATE-NEO-COOP (2026-09-07): the fighter's slip — the dodge was the football juke
    ['freerun_air_hold', () => buildFreeRunAirHold(scene, skeleton)],   // ANIM-READABILITY (creative): the runner's air hold, tuck and slide
    ['freerun_tuck', () => buildFreeRunTuck(scene, skeleton)],
    ['freerun_slide', () => buildFreeRunSlide(scene, skeleton)],
    // Board suite — skate / surf / snowboard all ride on these. Without them
    // every board clip fell through the alias table onto a karate stance.
    // Phase 3 (2026-09-03): the racket, club, net and keeper sports stop borrowing karate
    ['golf_address_idle', () => buildGolfAddress(scene, skeleton)],
    ['golf_swing_full', () => buildGolfSwing(scene, skeleton)],
    ['tennis_ready', () => buildTennisReady(scene, skeleton)],
    ['tennis_swing', () => buildTennisSwing(scene, skeleton)],
    ['tennis_serve', () => buildTennisServe(scene, skeleton)],
    ['volleyball_ready', () => buildVolleyReady(scene, skeleton)],
    ['volleyball_spike', () => buildVolleySpike(scene, skeleton)],
    ['volleyball_block', () => buildVolleyBlock(scene, skeleton)],
    ['soccer_kick_shoot', () => buildSoccerKick(scene, skeleton)],
    ['keeper_set', () => buildKeeperSet(scene, skeleton)],
    ['keeper_dive', () => buildKeeperDive(scene, skeleton)],
    // ANIM-READABILITY (net / precision, 2026-09-07): the putt, the ready shuffles, the keeper's held stretch and rise
    ['golf_putt', () => buildGolfPutt(scene, skeleton)],
    ['golf_finish_hold', () => buildGolfFinishHold(scene, skeleton)],
    ['tennis_shuffle_left', () => buildTennisShuffle(scene, skeleton, 'left')],
    ['tennis_shuffle_right', () => buildTennisShuffle(scene, skeleton, 'right')],
    ['volleyball_shuffle_left', () => buildVolleyShuffle(scene, skeleton, 'left')],
    ['volleyball_shuffle_right', () => buildVolleyShuffle(scene, skeleton, 'right')],
    ['keeper_dive_hold', () => buildKeeperDiveHold(scene, skeleton)],
    ['keeper_rise', () => buildKeeperRise(scene, skeleton)],
    ['board_ride_idle', () => buildBoardRideIdle(scene, skeleton)],
    ['board_carve_left', () => buildBoardCarveLeft(scene, skeleton)],
    ['board_carve_right', () => buildBoardCarveRight(scene, skeleton)],
    ['board_tuck', () => buildBoardTuck(scene, skeleton)],
    ['board_grab', () => buildBoardGrab(scene, skeleton)],
    ['board_air', () => buildBoardAir(scene, skeleton)],
    ['board_grind', () => buildBoardGrind(scene, skeleton)],
    ['board_land', () => buildBoardLand(scene, skeleton)],
    ['board_push', () => buildBoardPush(scene, skeleton)],   // ANIM-READABILITY (2026-09-07): the skate push, replacing the walk alias
    ['skate_kickflip', () => buildSkateKickflip(scene, skeleton)],
    ['skate_bail', () => buildSkateBail(scene, skeleton)],
    ['board_manual', () => buildBoardManual(scene, skeleton)],   // VENICE-SKATE-THPS: the back-truck balance act (the tree pointed 'manual' at the ride idle)
    ['skate_ollie', () => buildSkateOllie(scene, skeleton)],    // VENICE-SKATE-THPS: plant -> pop -> hang, the sticky beat under the pop
    // Basketball packages (Phase 4, 2026-09-03) — size-ups, gather, slide,
    // block and steal used to alias onto run/guard/jumpshot.
    ['bball_dribble_idle', () => buildDribbleIdle(scene, skeleton)],
    ['bball_crossover_left', () => buildCrossover(scene, skeleton, 'left')],
    ['bball_crossover_right', () => buildCrossover(scene, skeleton, 'right')],
    ['bball_hesi', () => buildHesi(scene, skeleton)],
    ['bball_layup_gather', () => buildLayupGather(scene, skeleton)],
    ['bball_defend_slide_left', () => buildDefendSlide(scene, skeleton, 'left')],
    ['bball_defend_slide_right', () => buildDefendSlide(scene, skeleton, 'right')],
    ['bball_block_reach', () => buildBlockReach(scene, skeleton)],
    ['bball_steal_reach', () => buildStealReach(scene, skeleton)],
    ['bball_follow_through', () => buildFollowThrough(scene, skeleton)],   // BIOMECH-HOOPS-WAVE1 (2026-09-08): the shot's follow-through (G5)
    ['bball_layup_gather_left', () => buildLayupGather(scene, skeleton, 'left')],   // HOOPS-MOVE-KIT-A (2026-09-08): the left-hand finish (M3)
    ['bball_pullup_gather', () => buildPullupGather(scene, skeleton)],          // HOOPS-MOVE-KIT-A: the player's pull-up gather (M1)
    ['bball_floater', () => buildFloater(scene, skeleton)],               // HOOPS-MOVE-KIT-A: the floater (M3)
    ['bball_hand_up', () => buildHandUp(scene, skeleton)],                // HOOPS-MOVE-KIT-A: the grounded hand-up contest (D3)
    ['bball_screen_set', () => buildScreenSet(scene, skeleton)],             // HOOPS-MOVE-KIT-A: the planted screen (O1)
    ['bball_post_up', () => buildPostUp(scene, skeleton)],                // HOOPS-MOVE-KIT-B (2026-09-08): the post-up seal (the path into M4–M6)
    ['bball_fadeaway', () => buildFadeaway(scene, skeleton)],              // HOOPS-MOVE-KIT-B: the fadeaway's lean (M4)
    ['bball_hook', () => buildHook(scene, skeleton)],                  // HOOPS-MOVE-KIT-B: the jump hook (M5)
    ['bball_hook_left', () => buildHook(scene, skeleton, 'left')],
    ['bball_spin', () => buildSpin(scene, skeleton)],                  // HOOPS-MOVE-KIT-B: the spin's body (M6)
    ['bball_pump_fake', () => buildPumpFake(scene, skeleton)],              // HOOPS-MOVE-KIT-B wave 2 (2026-09-08): the pump fake (M8)
    ['bball_step_through', () => buildStepThrough(scene, skeleton)],           // the step past his shoulder (M8)
    ['bball_pivot', () => buildPivot(scene, skeleton)],                 // the turn on a planted foot (M9)
    ['bball_layup_reverse', () => buildReverseLayup(scene, skeleton)],          // the far side, off the glass (M11)
    ['bball_layup_reverse_left', () => buildReverseLayup(scene, skeleton, 'left')],
    ['bball_hop_step', () => buildHopStep(scene, skeleton)],               // the two-foot gather (M13)
    ['bball_euro_step', () => buildEuroStep(scene, skeleton)],              // sell, cross (M14)
    // Baseball packages (Phase 6, 2026-09-03) — the derby borrowed karate clips.
    ['baseball_stance', () => buildBatStance(scene, skeleton)],
    ['baseball_swing', () => buildBatSwing(scene, skeleton)],
    ['baseball_pitch_over', () => buildPitchOver(scene, skeleton)],
    ['baseball_pitch_side', () => buildPitchSide(scene, skeleton)],
  ];
  const registered: string[] = [];
  let skipped = 0;
  for (const [name, build] of builders) {
    if (!scopeAllows(scope, name)) { skipped++; continue; }   // another sport's clip: never built, never playable here
    const g = build();
    if (g) { animator.register(g); registered.push(g.name); }
  }
  // The nine base clips (run, walk, guard, strikes, jumpshot) the forge bakes into
  // fel-hero.glb, built here on the live skeleton too so a body without baked
  // animations (the MPFB2 candidate) plays them — one source of truth.
  // ANIM-RESIDUAL: a scope may omit core base clips (the derby owns no fighter guard or strikes) — skipped like a foreign suite
  for (const g of buildBaseClips(scene, skeleton)) {
    if (!scopeAllows(scope, g.name)) { skipped++; g.dispose(); continue; }
    animator.register(g); registered.push(g.name);
  }
  animator.setScope(scope);
  const ledger = ledgerFor(scene);
  ledger.scope = scope;
  for (const n of registered) ledger.registered.add(n);
  // The mode's own suites lead the line: a console reader (or a truncated capture) sees what the body IS first.
  const core = (n: string) => (suiteOfClip(n) === 'core' ? 1 : 0);
  const line = [...registered].sort((a, b) => core(a) - core(b));
  const tag = scope ? `${scope.modeId} · core+${scope.suites.join('+') || '-'}${scope.borrow.length ? ` · borrow ${scope.borrow.join('+')}` : ''} · ${skipped} out-of-scope skipped` : 'unscoped';
  console.info(`[FEL-ANIM] authored clips registered (${tag}): ${line.join(', ')}`);
  return registered;
}
