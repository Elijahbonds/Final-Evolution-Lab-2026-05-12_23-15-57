// registerAuthoredClips — build the authored clips a body's MODE owns against the live skeleton and register them
// into the CharacterAnimator. Registry-name hits beat aliases.
//
// SHARED-ANIM-BUS (2026-09-14): scoped. Every entry below is [clip name, builder]; a spawn builds core + the suites and
// borrows its mode names in clipScope.ts (read off `scene.metadata.felModeId`) and skips the rest — a skateboarder's rig
// no longer carries, logs or can play the dunk suite. An unscoped scene (no mode) still builds everything.

import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import type { CharacterAnimator } from '../CharacterAnimator';
import { OPT_IN_SUITES, ledgerFor, scopeAllows, scopeForScene, suiteOfClip, type ClipScope } from '../clipScope';
import { buildEastbay } from './eastbay';
import { buildChargeGather, buildLaunch, buildScoreHang, buildLandCrouch } from './dunkSuite';
import { buildDunkLandAbsorb } from './dunkLandAbsorb';
import { buildMocapDunk } from './mocapDunk';
import { buildCarryUpOne, buildCarryUpLeft, buildCarryUpTwo, buildFlushOne, buildFlushLeft, buildFlushTwo } from './dunkFlush';   // DUNK MOTION phase 4
import { buildGatherOne, buildGatherTwo, buildTakeOffOne } from './dunkTakeoff';   // DUNK MOTION phase 7: push 1-2 and the one-foot take-off
import { buildFinishWindmill, buildFinishTomahawk, buildFinishBlown, buildCelebrateBig, buildFinishReverse, buildFinishPower, buildFinishTwoHand } from './dunkFinishes';
import { buildDefendBackpedal, buildCloseout, buildDefendSlideHard, buildContactReact, buildCatchBall } from './basketball';   // DEFENSE-LOOK (2026-09-17) + HOOPS-10PHASE-2 phase 6 (the catch)
import { buildScoopLayup, buildSpinLayup, buildHangLayup, buildShimmy, buildDropStep } from './basketball';   // ACROBATIC LAYUPS + THE POST GAME (2026-09-18)
import { buildStackBase, buildStackRider, buildRowStand, buildRowCrouch, buildDubbleHold, buildDubbleKneel, buildBikeRider, buildSkateRider } from './stackProp';
import { buildCelebSpidermanSplits, buildCelebItsOver, buildCelebRoar, buildCelebTooSmall } from './dunkCelebrations';
import { buildSelfLob, buildBounceThrow, buildKickUp, buildBackHandspring, buildCartwheel, buildBackflip, buildDoubleUp, buildScorpion, buildScorpionFlush, buildSpin720, buildLostFound, buildHideSeek, buildSpin360, buildBetweenLegs, buildCradle, buildDoubleClutch, buildBehindBack, buildFakeBack, buildDoubleEastbay, buildWindmill360, buildFakeEastbay, buildTap } from './dunkTricks';
import { buildIdleStand, buildStrafe, buildJumpUp, buildJumpLand } from './locomotion';
import { buildBaseClips } from './baseClips';
import { buildJuke, buildSpinMove, buildTackledFall, buildCarryRun, buildTouchdownSpike, buildStiffArm, buildQbThrow } from './football';
import { buildHitReact, buildKnockdown, buildGuardStep, buildShuffle, buildBlockHold, buildGuardImpact, buildParry, buildFloorHold, buildGetUp, buildWindupHold, buildEvade, buildLeanDodge, buildCombatRoll, buildCombatJump, buildElbow, buildSpinElbow } from './karate';
import { buildFreeRunAirHold, buildFreeRunTuck, buildFreeRunSlide } from './freerun';
import {
  buildDribbleIdle, buildIdleStandHoops, buildCrossover, buildMomentumCross, buildBtbSlide, buildHesiV2, buildYoyoV2, buildPausin, buildJab, buildPivotV2, buildSnatchBackV2, buildShimmyQuick, buildDefRetreat, buildDefLunge, buildDefStandup, buildDefCrossRun, buildStepbackRival, buildSkipGather, buildHesi, buildInAndOut, buildBetweenLegsDribble, buildBehindBackDribble,
  buildDoubleCross, buildSnatchBack, buildShammgod, buildYoyo, buildAnkleStumble, buildAnkleSlip, buildStepbackGather, buildLayupGather, buildMikan, buildUpAndUnder, buildFingerRoll, buildDefendSlide, buildBlockReach, buildStealReach, buildFollowThrough,
  buildPullupGather, buildFloater, buildHandUp, buildScreenSet,   // HOOPS-MOVE-KIT-A
  buildLandAbsorb,   // HOOPS-DEPTH S4
  buildFollowThroughEarly, buildFollowThroughLate,   // HOOPS-DEPTH S6
  buildPostUp, buildFadeaway, buildHook, buildSpin,   // HOOPS-MOVE-KIT-B (2026-09-08): the post kit (M4–M6)
  buildPumpFake, buildStepThrough, buildPivot, buildReverseLayup, buildHopStep, buildEuroStep,   // HOOPS-MOVE-KIT-B wave 2: the footwork (M8–M14)
} from './basketball';
import { buildStepbackRelease, buildBankFollowThrough, buildCatchHop } from './shotKit';   // hoops-shot-content (2026-10-20): the step-back's release, the bank's follow-through, the 3PT catch hop
import { buildBatStance, buildBatSwing, buildPitchOver, buildPitchSide } from './baseball';
import { buildPartyThink, buildPartyBuzz, buildPartyLocked, buildPartyYes, buildPartyFacepalm, buildPartyShrug, buildPartyWin, buildPartyWinIn, buildPartyLose, buildPartyTalk, buildPartyPresent } from './party';   // BRAINBRAWL-MAJOR (+ talk/present: RESIDUAL)
import { buildGolfAddress, buildGolfSwing, buildGolfPutt, buildGolfFinishHold } from './golf';
import { buildTennisReady, buildTennisServe, buildTennisSwing, buildTennisShuffle } from './tennis';
import { buildVolleyBlock, buildVolleyReady, buildVolleySpike, buildVolleyShuffle } from './volleyball';
import { buildKeeperDive, buildKeeperSet, buildSoccerKick, buildKeeperDiveHold, buildKeeperRise } from './soccer';
import {
  buildBoardRideIdle, buildBoardCarveLeft, buildBoardCarveRight, buildBoardTuck,
  buildBoardGrab, buildBoardAir, buildBoardGrind, buildBoardLand, buildBoardPush, buildBoardStandIdle, buildBoardLandSketchy,
  buildSkateKickflip, buildSkateBail, buildSnowBail,
  buildBoardManual, buildSkateOllie,   // VENICE-SKATE-THPS (2026-09-09): the manual had no clip and the pop had no body
} from './boardSuite';
import {
  buildExSquat, buildExSquatBar, buildExHinge, buildExGoodMorning, buildExSplitSquat, buildExLunge, buildExReverseLunge, buildExCalfRaise,
  buildExJump, buildExPogo, buildExJumpRope, buildExMarch, buildExCarry, buildExJumpingJack, buildExPlankHigh, buildExMountainClimber, buildExPress, buildExCurl, buildExLateralRaise, buildExFrontRaise,
  buildExRow, buildExUprightRow, buildExShrug, buildExTricepsOverhead, buildExPushdown, buildExPushup, buildExPlank, buildExBridge,
  buildExDeadBug, buildExBirdDog, buildExCrunch, buildExArmCircles, buildExQuadStretch, buildExBreathe,
  buildExerciseClip,
  buildExSeatedPress, buildExSeatedCurl, buildExSeatedLateralRaise, buildExSeatedTriceps, buildExBenchPress, buildExFloorPress, buildExFly, buildExSkullCrusher, buildExInclinePress, buildExInclineFly,
} from './exercise';   // LIBRARY-ANATOMY (2026-10-25): the exercise library's demo loops — opt-in suite, built on the library stage only

/** Every authored clip as [name, builder] for this skeleton (the table registerAuthoredClips walks). */
function authoredBuilders(scene: Scene, skeleton: Skeleton): [string, () => AnimationGroup | null][] {
  return [
    ['idle_stand', () => buildIdleStand(scene, skeleton)],
    ['strafe_left', () => buildStrafe(scene, skeleton, 'left')],
    ['strafe_right', () => buildStrafe(scene, skeleton, 'right')],
    ['jump_up', () => buildJumpUp(scene, skeleton)],
    ['jump_land', () => buildJumpLand(scene, skeleton)],
    ['dunk_charge_gather', () => buildChargeGather(scene, skeleton)],
    ['dunk_launch', () => buildLaunch(scene, skeleton)],
    ['dunk_mocap', () => buildMocapDunk(scene, skeleton)],
    ['dunk_360_eastbay', () => buildEastbay(scene, skeleton)],
    ['dunk_behind_back', () => buildBehindBack(scene, skeleton)],
    ['dunk_fake_back', () => buildFakeBack(scene, skeleton)],
    ['dunk_double_eastbay', () => buildDoubleEastbay(scene, skeleton)],
    ['dunk_360_windmill', () => buildWindmill360(scene, skeleton)],
    ['dunk_fake_eastbay', () => buildFakeEastbay(scene, skeleton)],
    ['dunk_tap', () => buildTap(scene, skeleton)],
    ['prop_row_stand', () => buildRowStand(scene, skeleton)],
    ['prop_row_crouch', () => buildRowCrouch(scene, skeleton)],
    ['prop_dubble_hold', () => buildDubbleHold(scene, skeleton)],   // DUNK MOTION phase 10: the Dubble Up's helper
    ['prop_dubble_kneel', () => buildDubbleKneel(scene, skeleton)],  // …and his line, on all fours
    ['prop_bike_rider', () => buildBikeRider(scene, skeleton)],
    ['prop_skate_rider', () => buildSkateRider(scene, skeleton)],
    ['dunk_score_hang', () => buildScoreHang(scene, skeleton)],
    ['dunk_land_crouch', () => buildLandCrouch(scene, skeleton)],
    ['dunk_finish_windmill', () => buildFinishWindmill(scene, skeleton)],
    ['dunk_finish_tomahawk', () => buildFinishTomahawk(scene, skeleton)],
    ['dunk_finish_reverse', () => buildFinishReverse(scene, skeleton)],   // DEFENSE-LOOK (2026-09-17): the baseline reverse
    ['dunk_finish_power', () => buildFinishPower(scene, skeleton)],       // DUNK-CLIPS (2026-09-17): the one-hand power slam (the game's default)
    ['dunk_finish_two_hand', () => buildFinishTwoHand(scene, skeleton)],  // …and the standing two-hand flush
    // DUNK MOTION phase 4 (2026-09-23): the carry-up while the flight waits for the SLAM, and the flush itself, in the hand the ball is in
    ['dunk_carry_up', () => buildCarryUpOne(scene, skeleton)], ['dunk_carry_up_left', () => buildCarryUpLeft(scene, skeleton)], ['dunk_carry_up_two', () => buildCarryUpTwo(scene, skeleton)],
    ['dunk_flush_one', () => buildFlushOne(scene, skeleton)], ['dunk_flush_left', () => buildFlushLeft(scene, skeleton)], ['dunk_flush_two', () => buildFlushTwo(scene, skeleton)],
    ['dunk_gather_one', () => buildGatherOne(scene, skeleton)], ['dunk_gather_two', () => buildGatherTwo(scene, skeleton)], ['dunk_take_off_one', () => buildTakeOffOne(scene, skeleton)],
    ['dunk_finish_blown', () => buildFinishBlown(scene, skeleton)],
    ['dunk_celebrate_big', () => buildCelebrateBig(scene, skeleton)],
    // DUNK-CONTROL-JUICE (2026-09-08): the named dunks — runway beats (self-lob, kick-up, cartwheel, double-up) and air shapes
    ['dunk_self_lob', () => buildSelfLob(scene, skeleton)],
    ['dunk_bounce_throw', () => buildBounceThrow(scene, skeleton)],   // DUNK-GLASS-BOUNCE: the bounce lob's two-hand throw down
    ['dunk_kick_up', () => buildKickUp(scene, skeleton)],
    ['dunk_back_handspring', () => buildBackHandspring(scene, skeleton)],
    ['dunk_cartwheel', () => buildCartwheel(scene, skeleton)],   // DUNK MOTION phase 10b: Jus Fly's
    ['dunk_backflip', () => buildBackflip(scene, skeleton)],
    ['prop_stack_base', () => buildStackBase(scene, skeleton)],
    ['prop_stack_rider', () => buildStackRider(scene, skeleton)],
    ['dunk_double_up', () => buildDoubleUp(scene, skeleton)],
    ['dunk_scorpion', () => buildScorpion(scene, skeleton)],
    ['dunk_flush_scorpion', () => buildScorpionFlush(scene, skeleton)],   // phase 10b: the scorpion jams in its own shape
    ['dunk_lost_found', () => buildLostFound(scene, skeleton)],
    ['dunk_hide_seek', () => buildHideSeek(scene, skeleton)],
    ['dunk_between_legs', () => buildBetweenLegs(scene, skeleton)],   // the hardest trick finally has its own body (it shared the eastbay's)
    ['dunk_cradle', () => buildCradle(scene, skeleton)],
    ['dunk_double_clutch', () => buildDoubleClutch(scene, skeleton)],
    ['dunk_360_spin', () => buildSpin360(scene, skeleton)],
    ['dunk_720_spin', () => buildSpin720(scene, skeleton)],   // phase 10b: the 720
    // DUNK MOTION phase 12: what a dunker does on the floor after the make (Ruffin's Spider-Man splits, Carter's "it's over", the roar, too small)
    ['dunk_celeb_spiderman_splits', () => buildCelebSpidermanSplits(scene, skeleton)],
    ['dunk_celeb_its_over', () => buildCelebItsOver(scene, skeleton)],
    ['dunk_celeb_roar', () => buildCelebRoar(scene, skeleton)],
    ['dunk_celeb_too_small', () => buildCelebTooSmall(scene, skeleton)],
    ['dunk_land_absorb', () => buildDunkLandAbsorb(scene, skeleton)],
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
    ['karate_elbow', () => buildElbow(scene, skeleton)],          // STORM STRIKES (2026-09-17): the close-range elbow link
    ['karate_spin_elbow', () => buildSpinElbow(scene, skeleton)],  // …and the spinning back elbow
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
    ['board_stand_idle', () => buildBoardStandIdle(scene, skeleton)],       // ANIM-READABILITY (2026-09-21): stopped ≠ cruising
    ['board_land_sketchy', () => buildBoardLandSketchy(scene, skeleton)],   // ANIM-READABILITY (2026-09-21): a sketchy landing looks sketchy
    ['board_push', () => buildBoardPush(scene, skeleton)],   // ANIM-READABILITY (2026-09-07): the skate push, replacing the walk alias
    ['skate_kickflip', () => buildSkateKickflip(scene, skeleton)],
    ['skate_bail', () => buildSkateBail(scene, skeleton)],
    ['snow_bail', () => buildSnowBail(scene, skeleton)],   // GATE-CRASHER-POLISH-2: the snowboard's wipeout, down in the snow
    ['board_manual', () => buildBoardManual(scene, skeleton)],   // VENICE-SKATE-THPS: the back-truck balance act (the tree pointed 'manual' at the ride idle)
    ['skate_ollie', () => buildSkateOllie(scene, skeleton)],    // VENICE-SKATE-THPS: plant -> pop -> hang, the sticky beat under the pop
    // Basketball packages (Phase 4, 2026-09-03) — size-ups, gather, slide,
    // block and steal used to alias onto run/guard/jumpshot.
    ['bball_dribble_idle', () => buildDribbleIdle(scene, skeleton)],
    ['bball_idle_stand', () => buildIdleStandHoops(scene, skeleton)],   // HOOPS MOTION phase 3b (review): the watch with knees
    ['bball_crossover_left', () => buildCrossover(scene, skeleton, 'left')],
    ['bball_crossover_right', () => buildCrossover(scene, skeleton, 'right')],
    ['bball_momentum_cross_left', () => buildMomentumCross(scene, skeleton, 'left')],     // HOOPS MOTION phase 4c (plan §4.2): its own path's clip
    ['bball_momentum_cross_right', () => buildMomentumCross(scene, skeleton, 'right')],
    ['bball_btb_slide_left', () => buildBtbSlide(scene, skeleton, 'left')],     // H2 (owner 2026-10-16): the BTB slide
    ['bball_btb_slide_right', () => buildBtbSlide(scene, skeleton, 'right')],
    ['bball_hesi_v2_left', () => buildHesiV2(scene, skeleton, 'left')],     // H2b (plan §4.8): the hesitation on its float path
    ['bball_hesi_v2_right', () => buildHesiV2(scene, skeleton, 'right')],
    ['bball_yoyo_v2_left', () => buildYoyoV2(scene, skeleton, 'left')],     // H2b (plan §4.9)
    ['bball_yoyo_v2_right', () => buildYoyoV2(scene, skeleton, 'right')],
    ['bball_pausin_left', () => buildPausin(scene, skeleton, 'left')],      // H2b (plan §4.18)
    ['bball_pausin_right', () => buildPausin(scene, skeleton, 'right')],
    ['bball_jab', () => buildJab(scene, skeleton)],                         // H2b (plan §4.11)
    ['bball_pivot_v2_left', () => buildPivotV2(scene, skeleton, 'left')],   // H2b (plan §4.16)
    ['bball_pivot_v2_right', () => buildPivotV2(scene, skeleton, 'right')],
    ['bball_snatch_back_v2_left', () => buildSnatchBackV2(scene, skeleton, 'left')],   // H2b (plan §4.13)
    ['bball_snatch_back_v2_right', () => buildSnatchBackV2(scene, skeleton, 'right')],
    ['bball_shimmy_quick', () => buildShimmyQuick(scene, skeleton)],                   // H2b (plan §4.23)
    ['bball_def_retreat', () => buildDefRetreat(scene, skeleton)],                     // H2c: the defender's reactions
    ['bball_def_lunge_left', () => buildDefLunge(scene, skeleton, 'left')],
    ['bball_def_lunge_right', () => buildDefLunge(scene, skeleton, 'right')],
    ['bball_def_standup', () => buildDefStandup(scene, skeleton)],
    ['bball_def_cross_run_left', () => buildDefCrossRun(scene, skeleton, 'left')],     // H2c: the crossover step
    ['bball_def_cross_run_right', () => buildDefCrossRun(scene, skeleton, 'right')],
    ['bball_stepback_rival', () => buildStepbackRival(scene, skeleton)],                // H2c (plan §4.21)
    ['bball_skip_gather_left', () => buildSkipGather(scene, skeleton, 'left')],         // H2e: the skip gather
    ['bball_skip_gather_right', () => buildSkipGather(scene, skeleton, 'right')],
    ['bball_hesi', () => buildHesi(scene, skeleton)],
    // THE HANDLE (2026-09-16): HandleSystem's twelve moves had three clips between them
    ['bball_in_and_out_left', () => buildInAndOut(scene, skeleton, 'left')],
    ['bball_in_and_out_right', () => buildInAndOut(scene, skeleton, 'right')],
    ['bball_between_legs_left', () => buildBetweenLegsDribble(scene, skeleton, 'left')],
    ['bball_between_legs_right', () => buildBetweenLegsDribble(scene, skeleton, 'right')],
    ['bball_behind_back_left', () => buildBehindBackDribble(scene, skeleton, 'left')],
    ['bball_behind_back_right', () => buildBehindBackDribble(scene, skeleton, 'right')],
    ['bball_double_cross_left', () => buildDoubleCross(scene, skeleton, 'left')],
    ['bball_double_cross_right', () => buildDoubleCross(scene, skeleton, 'right')],
    ['bball_snatch_back', () => buildSnatchBack(scene, skeleton)],
    ['bball_shammgod_left', () => buildShammgod(scene, skeleton, 'left')],
    ['bball_shammgod_right', () => buildShammgod(scene, skeleton, 'right')],
    ['bball_yoyo', () => buildYoyo(scene, skeleton)],
    // …and the two ways an ankle breaker ends, which were a karate punch and a karate knockdown
    ['bball_ankle_stumble', () => buildAnkleStumble(scene, skeleton)],
    ['bball_ankle_slip', () => buildAnkleSlip(scene, skeleton)],
    ['bball_stepback_gather', () => buildStepbackGather(scene, skeleton)],   // it played the pull-up's clip
    ['bball_layup_gather', () => buildLayupGather(scene, skeleton)],
    // the layup vocabulary (owner, 2026-09-16): the shot from under the ring, and the one that beats a jumper
    ['bball_mikan', () => buildMikan(scene, skeleton)],
    ['bball_mikan_left', () => buildMikan(scene, skeleton, 'left')],
    ['bball_up_and_under', () => buildUpAndUnder(scene, skeleton)],
    ['bball_up_and_under_left', () => buildUpAndUnder(scene, skeleton, 'left')],
    ['bball_finger_roll', () => buildFingerRoll(scene, skeleton)],
    ['bball_finger_roll_left', () => buildFingerRoll(scene, skeleton, 'left')],
    // ACROBATIC LAYUPS (owner, 2026-09-18): the scoop (the contact layup), the spin, the hang / double clutch
    ['bball_layup_scoop', () => buildScoopLayup(scene, skeleton)], ['bball_layup_scoop_left', () => buildScoopLayup(scene, skeleton, 'left')],
    ['bball_layup_spin', () => buildSpinLayup(scene, skeleton)], ['bball_layup_spin_left', () => buildSpinLayup(scene, skeleton, 'left')],
    ['bball_layup_hang', () => buildHangLayup(scene, skeleton)], ['bball_layup_hang_left', () => buildHangLayup(scene, skeleton, 'left')],
    ['bball_shimmy', () => buildShimmy(scene, skeleton)],   // THE POST GAME (2026-09-18)
    ['bball_drop_step', () => buildDropStep(scene, skeleton)], ['bball_drop_step_left', () => buildDropStep(scene, skeleton, 'left')],
    ['bball_floater_left', () => buildFloater(scene, skeleton, 'left')],           // the runner going the other way
    ['bball_euro_step_left', () => buildEuroStep(scene, skeleton, 'left')],        // a euro that sells LEFT
    ['bball_defend_slide_left', () => buildDefendSlide(scene, skeleton, 'left')],
    ['bball_defend_slide_right', () => buildDefendSlide(scene, skeleton, 'right')],
    ['bball_defend_backpedal', () => buildDefendBackpedal(scene, skeleton)],                 // DEFENSE-LOOK (2026-09-17): the retreat
    ['bball_closeout', () => buildCloseout(scene, skeleton)],                                 // …the closeout
    ['bball_contact_react', () => buildContactReact(scene, skeleton)],                      // the bump (2026-09-17): hands in FRONT, never the fighter's flinch
    ['bball_catch', () => buildCatchBall(scene, skeleton)],                                 // HOOPS-10PHASE-2 phase 6: hands out to meet the pass, then in to secure it
    ['bball_defend_slide_hard_left', () => buildDefendSlideHard(scene, skeleton, 'left')],   // …and the sat-down slide (intense D)
    ['bball_defend_slide_hard_right', () => buildDefendSlideHard(scene, skeleton, 'right')],
    ['bball_block_reach', () => buildBlockReach(scene, skeleton)],
    ['bball_steal_reach', () => buildStealReach(scene, skeleton)],
    ['bball_follow_through', () => buildFollowThrough(scene, skeleton)],   // BIOMECH-HOOPS-WAVE1 (2026-09-08): the shot's follow-through (G5)
    ['bball_layup_gather_left', () => buildLayupGather(scene, skeleton, 'left')],   // HOOPS-MOVE-KIT-A (2026-09-08): the left-hand finish (M3)
    ['bball_pullup_gather', () => buildPullupGather(scene, skeleton)],          // HOOPS-MOVE-KIT-A: the player's pull-up gather (M1)
    ['bball_land_absorb', () => buildLandAbsorb(scene, skeleton)],              // HOOPS-DEPTH S4: the jump shot comes down on its knees
    ['bball_follow_through_early', () => buildFollowThroughEarly(scene, skeleton)],   // HOOPS-DEPTH S6: the early release's short arm
    ['bball_follow_through_late', () => buildFollowThroughLate(scene, skeleton)],     // HOOPS-DEPTH S6: the late release's flat push and heavy landing
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
    // hoops-shot-content (2026-10-20): the shot types that played someone else's body (anim/authored/shotKit.ts)
    ['bball_stepback_release', () => buildStepbackRelease(scene, skeleton)],             // the step-back rises out of its own set
    ['bball_follow_through_bank_left', () => buildBankFollowThrough(scene, skeleton, 'left')],    // called glass: the follow-through to the square
    ['bball_follow_through_bank_right', () => buildBankFollowThrough(scene, skeleton, 'right')],
    ['bball_catch_hop', () => buildCatchHop(scene, skeleton)],                           // 3PT: the hop into the set on the catch
    // Baseball packages (Phase 6, 2026-09-03) — the derby borrowed karate clips.
    ['baseball_stance', () => buildBatStance(scene, skeleton)],
    ['baseball_swing', () => buildBatSwing(scene, skeleton)],
    ['baseball_pitch_over', () => buildPitchOver(scene, skeleton)],
    ['baseball_pitch_side', () => buildPitchSide(scene, skeleton)],
    // The quiz podium (BRAINBRAWL-MAJOR, 2026-09-24): think, buzz in, lock in, the verdicts, the finish — see party.ts
    ['party_think', () => buildPartyThink(scene, skeleton)], ['party_buzz', () => buildPartyBuzz(scene, skeleton)],
    ['party_locked', () => buildPartyLocked(scene, skeleton)], ['party_yes', () => buildPartyYes(scene, skeleton)],
    ['party_facepalm', () => buildPartyFacepalm(scene, skeleton)], ['party_shrug', () => buildPartyShrug(scene, skeleton)],
    ['party_win', () => buildPartyWin(scene, skeleton)], ['party_win_in', () => buildPartyWinIn(scene, skeleton)], ['party_lose', () => buildPartyLose(scene, skeleton)],
    // BRAINBRAWL-RESIDUAL: the podiums and the host talk
    ['party_talk', () => buildPartyTalk(scene, skeleton)], ['party_present', () => buildPartyPresent(scene, skeleton)],
    // LIBRARY-ANATOMY (2026-10-25): the exercise library's demo loops (anim/authored/exercise.ts) — the 'exercise' suite, opt-in
    ['ex_squat', () => buildExSquat(scene, skeleton)],
    ['ex_squat_bar', () => buildExSquatBar(scene, skeleton)],
    ['ex_hinge', () => buildExHinge(scene, skeleton)],
    ['ex_good_morning', () => buildExGoodMorning(scene, skeleton)],
    ['ex_split_squat', () => buildExSplitSquat(scene, skeleton)],
    ['ex_lunge', () => buildExLunge(scene, skeleton)],
    ['ex_reverse_lunge', () => buildExReverseLunge(scene, skeleton)],
    ['ex_calf_raise', () => buildExCalfRaise(scene, skeleton)],
    ['ex_jump', () => buildExJump(scene, skeleton)],
    ['ex_pogo', () => buildExPogo(scene, skeleton)],
    ['ex_jump_rope', () => buildExJumpRope(scene, skeleton)],
    ['ex_march', () => buildExMarch(scene, skeleton)],
    ['ex_carry', () => buildExCarry(scene, skeleton)],
    ['ex_jumping_jack', () => buildExJumpingJack(scene, skeleton)],
    ['ex_press', () => buildExPress(scene, skeleton)],
    ['ex_curl', () => buildExCurl(scene, skeleton)],
    ['ex_lateral_raise', () => buildExLateralRaise(scene, skeleton)],
    ['ex_front_raise', () => buildExFrontRaise(scene, skeleton)],
    ['ex_row', () => buildExRow(scene, skeleton)],
    ['ex_upright_row', () => buildExUprightRow(scene, skeleton)],
    ['ex_shrug', () => buildExShrug(scene, skeleton)],
    ['ex_triceps_overhead', () => buildExTricepsOverhead(scene, skeleton)],
    ['ex_pushdown', () => buildExPushdown(scene, skeleton)],
    ['ex_pushup', () => buildExPushup(scene, skeleton)],
    ['ex_plank', () => buildExPlank(scene, skeleton)],
    ['ex_plank_high', () => buildExPlankHigh(scene, skeleton)],
    ['ex_mountain_climber', () => buildExMountainClimber(scene, skeleton)],
    ['ex_bridge', () => buildExBridge(scene, skeleton)],
    ['ex_dead_bug', () => buildExDeadBug(scene, skeleton)],
    ['ex_bird_dog', () => buildExBirdDog(scene, skeleton)],
    ['ex_crunch', () => buildExCrunch(scene, skeleton)],
    ['ex_seated_press', () => buildExSeatedPress(scene, skeleton)],
    ['ex_seated_curl', () => buildExSeatedCurl(scene, skeleton)],
    ['ex_seated_lateral_raise', () => buildExSeatedLateralRaise(scene, skeleton)],
    ['ex_seated_triceps', () => buildExSeatedTriceps(scene, skeleton)],
    ['ex_bench_press', () => buildExBenchPress(scene, skeleton)],
    ['ex_floor_press', () => buildExFloorPress(scene, skeleton)],
    ['ex_fly', () => buildExFly(scene, skeleton)],
    ['ex_skull_crusher', () => buildExSkullCrusher(scene, skeleton)],
    ['ex_incline_press', () => buildExInclinePress(scene, skeleton)],
    ['ex_incline_fly', () => buildExInclineFly(scene, skeleton)],
    ['ex_arm_circles', () => buildExArmCircles(scene, skeleton)],
    ['ex_quad_stretch', () => buildExQuadStretch(scene, skeleton)],
    ['ex_breathe', () => buildExBreathe(scene, skeleton)],
    // LIBRARY-ANATOMY-2 (2026-10-25): the loops added for coverage (exerciseMore.ts, exerciseFloor.ts, exerciseAthletic.ts), each built by name
    ['ex_curl_one', () => buildExerciseClip('ex_curl_one', scene, skeleton)],
    ['ex_press_one', () => buildExerciseClip('ex_press_one', scene, skeleton)],
    ['ex_lateral_raise_one', () => buildExerciseClip('ex_lateral_raise_one', scene, skeleton)],
    ['ex_front_raise_one', () => buildExerciseClip('ex_front_raise_one', scene, skeleton)],
    ['ex_triceps_overhead_one', () => buildExerciseClip('ex_triceps_overhead_one', scene, skeleton)],
    ['ex_pushdown_one', () => buildExerciseClip('ex_pushdown_one', scene, skeleton)],
    ['ex_row_one', () => buildExerciseClip('ex_row_one', scene, skeleton)],
    ['ex_upright_row_one', () => buildExerciseClip('ex_upright_row_one', scene, skeleton)],
    ['ex_seated_press_one', () => buildExerciseClip('ex_seated_press_one', scene, skeleton)],
    ['ex_seated_curl_one', () => buildExerciseClip('ex_seated_curl_one', scene, skeleton)],
    ['ex_seated_lateral_raise_one', () => buildExerciseClip('ex_seated_lateral_raise_one', scene, skeleton)],
    ['ex_seated_triceps_one', () => buildExerciseClip('ex_seated_triceps_one', scene, skeleton)],
    ['ex_skull_crusher_one', () => buildExerciseClip('ex_skull_crusher_one', scene, skeleton)],
    ['ex_fly_one', () => buildExerciseClip('ex_fly_one', scene, skeleton)],
    ['ex_incline_press_one', () => buildExerciseClip('ex_incline_press_one', scene, skeleton)],
    ['ex_incline_fly_one', () => buildExerciseClip('ex_incline_fly_one', scene, skeleton)],
    ['ex_curl_alt', () => buildExerciseClip('ex_curl_alt', scene, skeleton)],
    ['ex_press_alt', () => buildExerciseClip('ex_press_alt', scene, skeleton)],
    ['ex_lateral_raise_alt', () => buildExerciseClip('ex_lateral_raise_alt', scene, skeleton)],
    ['ex_front_raise_alt', () => buildExerciseClip('ex_front_raise_alt', scene, skeleton)],
    ['ex_row_alt', () => buildExerciseClip('ex_row_alt', scene, skeleton)],
    ['ex_seated_press_alt', () => buildExerciseClip('ex_seated_press_alt', scene, skeleton)],
    ['ex_seated_curl_alt', () => buildExerciseClip('ex_seated_curl_alt', scene, skeleton)],
    ['ex_incline_press_alt', () => buildExerciseClip('ex_incline_press_alt', scene, skeleton)],
    ['ex_kickback', () => buildExerciseClip('ex_kickback', scene, skeleton)],
    ['ex_kickback_one', () => buildExerciseClip('ex_kickback_one', scene, skeleton)],
    ['ex_reverse_fly', () => buildExerciseClip('ex_reverse_fly', scene, skeleton)],
    ['ex_pull_apart', () => buildExerciseClip('ex_pull_apart', scene, skeleton)],
    ['ex_face_pull', () => buildExerciseClip('ex_face_pull', scene, skeleton)],
    ['ex_scaption', () => buildExerciseClip('ex_scaption', scene, skeleton)],
    ['ex_front_raise_overhead', () => buildExerciseClip('ex_front_raise_overhead', scene, skeleton)],
    ['ex_press_hk', () => buildExerciseClip('ex_press_hk', scene, skeleton)],
    ['ex_press_hk_one', () => buildExerciseClip('ex_press_hk_one', scene, skeleton)],
    ['ex_press_hk_alt', () => buildExerciseClip('ex_press_hk_alt', scene, skeleton)],
    ['ex_pos_squat', () => buildExerciseClip('ex_pos_squat', scene, skeleton)],
    ['ex_pos_cossack', () => buildExerciseClip('ex_pos_cossack', scene, skeleton)],
    ['ex_pos_fold', () => buildExerciseClip('ex_pos_fold', scene, skeleton)],
    ['ex_pos_spider', () => buildExerciseClip('ex_pos_spider', scene, skeleton)],
    ['ex_pos_frog', () => buildExerciseClip('ex_pos_frog', scene, skeleton)],
    ['ex_pos_inchworm', () => buildExerciseClip('ex_pos_inchworm', scene, skeleton)],
    ['ex_pos_dog', () => buildExerciseClip('ex_pos_dog', scene, skeleton)],
    ['ex_pos_child', () => buildExerciseClip('ex_pos_child', scene, skeleton)],
    ['ex_pos_pigeon', () => buildExerciseClip('ex_pos_pigeon', scene, skeleton)],
    ['ex_pos_halfsplit', () => buildExerciseClip('ex_pos_halfsplit', scene, skeleton)],
    ['ex_pos_lowlunge', () => buildExerciseClip('ex_pos_lowlunge', scene, skeleton)],
    ['ex_pos_kneel', () => buildExerciseClip('ex_pos_kneel', scene, skeleton)],
    ['ex_pos_ninety', () => buildExerciseClip('ex_pos_ninety', scene, skeleton)],
    ['ex_pos_shinbox', () => buildExerciseClip('ex_pos_shinbox', scene, skeleton)],
    ['ex_pos_catcamel', () => buildExerciseClip('ex_pos_catcamel', scene, skeleton)],
    ['ex_pos_thread', () => buildExerciseClip('ex_pos_thread', scene, skeleton)],
    ['ex_pos_bear', () => buildExerciseClip('ex_pos_bear', scene, skeleton)],
    ['ex_pos_cobra', () => buildExerciseClip('ex_pos_cobra', scene, skeleton)],
    ['ex_pos_lizard', () => buildExerciseClip('ex_pos_lizard', scene, skeleton)],
    ['ex_pos_butterfly', () => buildExerciseClip('ex_pos_butterfly', scene, skeleton)],
    ['ex_pos_supine', () => buildExerciseClip('ex_pos_supine', scene, skeleton)],
    ['ex_pos_supine9090', () => buildExerciseClip('ex_pos_supine9090', scene, skeleton)],
    ['ex_pos_legsup', () => buildExerciseClip('ex_pos_legsup', scene, skeleton)],
    ['ex_pos_kneehug', () => buildExerciseClip('ex_pos_kneehug', scene, skeleton)],
    ['ex_pos_oneknee', () => buildExerciseClip('ex_pos_oneknee', scene, skeleton)],
    ['ex_pos_happybaby', () => buildExerciseClip('ex_pos_happybaby', scene, skeleton)],
    ['ex_pos_kneerock', () => buildExerciseClip('ex_pos_kneerock', scene, skeleton)],
    ['ex_pos_figure4', () => buildExerciseClip('ex_pos_figure4', scene, skeleton)],
    ['ex_pos_lyinghams', () => buildExerciseClip('ex_pos_lyinghams', scene, skeleton)],
    ['ex_pos_prone', () => buildExerciseClip('ex_pos_prone', scene, skeleton)],
    ['ex_pos_pike', () => buildExerciseClip('ex_pos_pike', scene, skeleton)],
    ['ex_pos_straddle', () => buildExerciseClip('ex_pos_straddle', scene, skeleton)],
    ['ex_pos_switch', () => buildExerciseClip('ex_pos_switch', scene, skeleton)],
    ['ex_pos_rockback', () => buildExerciseClip('ex_pos_rockback', scene, skeleton)],
    ['ex_pos_childside', () => buildExerciseClip('ex_pos_childside', scene, skeleton)],
    ['ex_pos_dogpedal', () => buildExerciseClip('ex_pos_dogpedal', scene, skeleton)],
    ['ex_pos_side', () => buildExerciseClip('ex_pos_side', scene, skeleton)],
    ['ex_pos_openbook', () => buildExerciseClip('ex_pos_openbook', scene, skeleton)],
    ['ex_pos_clamshell', () => buildExerciseClip('ex_pos_clamshell', scene, skeleton)],
    ['ex_pos_sideraise', () => buildExerciseClip('ex_pos_sideraise', scene, skeleton)],
    ['ex_pos_sideer', () => buildExerciseClip('ex_pos_sideer', scene, skeleton)],
    ['ex_pos_superman', () => buildExerciseClip('ex_pos_superman', scene, skeleton)],
    ['ex_pos_sidelunge', () => buildExerciseClip('ex_pos_sidelunge', scene, skeleton)],
    ['ex_pos_couch', () => buildExerciseClip('ex_pos_couch', scene, skeleton)],
    ['ex_flow_squat_cossack', () => buildExerciseClip('ex_flow_squat_cossack', scene, skeleton)],
    ['ex_flow_squat_fold', () => buildExerciseClip('ex_flow_squat_fold', scene, skeleton)],
    ['ex_flow_squat_spider', () => buildExerciseClip('ex_flow_squat_spider', scene, skeleton)],
    ['ex_flow_squat_frog', () => buildExerciseClip('ex_flow_squat_frog', scene, skeleton)],
    ['ex_flow_fold_inchworm', () => buildExerciseClip('ex_flow_fold_inchworm', scene, skeleton)],
    ['ex_flow_fold_dog', () => buildExerciseClip('ex_flow_fold_dog', scene, skeleton)],
    ['ex_flow_inchworm_dog', () => buildExerciseClip('ex_flow_inchworm_dog', scene, skeleton)],
    ['ex_flow_inchworm_spider', () => buildExerciseClip('ex_flow_inchworm_spider', scene, skeleton)],
    ['ex_flow_dog_spider', () => buildExerciseClip('ex_flow_dog_spider', scene, skeleton)],
    ['ex_flow_dog_child', () => buildExerciseClip('ex_flow_dog_child', scene, skeleton)],
    ['ex_flow_dog_pigeon', () => buildExerciseClip('ex_flow_dog_pigeon', scene, skeleton)],
    ['ex_flow_dog_halfsplit', () => buildExerciseClip('ex_flow_dog_halfsplit', scene, skeleton)],
    ['ex_flow_spider_halfsplit', () => buildExerciseClip('ex_flow_spider_halfsplit', scene, skeleton)],
    ['ex_flow_spider_lowlunge', () => buildExerciseClip('ex_flow_spider_lowlunge', scene, skeleton)],
    ['ex_flow_halfsplit_kneel', () => buildExerciseClip('ex_flow_halfsplit_kneel', scene, skeleton)],
    ['ex_flow_halfsplit_lowlunge', () => buildExerciseClip('ex_flow_halfsplit_lowlunge', scene, skeleton)],
    ['ex_flow_kneel_lowlunge', () => buildExerciseClip('ex_flow_kneel_lowlunge', scene, skeleton)],
    ['ex_flow_kneel_ninety', () => buildExerciseClip('ex_flow_kneel_ninety', scene, skeleton)],
    ['ex_flow_ninety_pigeon', () => buildExerciseClip('ex_flow_ninety_pigeon', scene, skeleton)],
    ['ex_flow_ninety_shinbox', () => buildExerciseClip('ex_flow_ninety_shinbox', scene, skeleton)],
    ['ex_flow_pigeon_child', () => buildExerciseClip('ex_flow_pigeon_child', scene, skeleton)],
    ['ex_flow_child_catcamel', () => buildExerciseClip('ex_flow_child_catcamel', scene, skeleton)],
    ['ex_flow_child_thread', () => buildExerciseClip('ex_flow_child_thread', scene, skeleton)],
    ['ex_flow_child_frog', () => buildExerciseClip('ex_flow_child_frog', scene, skeleton)],
    ['ex_flow_catcamel_thread', () => buildExerciseClip('ex_flow_catcamel_thread', scene, skeleton)],
    ['ex_flow_catcamel_frog', () => buildExerciseClip('ex_flow_catcamel_frog', scene, skeleton)],
    ['ex_flow_thread_frog', () => buildExerciseClip('ex_flow_thread_frog', scene, skeleton)],
    ['ex_flow_bear_dog', () => buildExerciseClip('ex_flow_bear_dog', scene, skeleton)],
    ['ex_flow_bear_child', () => buildExerciseClip('ex_flow_bear_child', scene, skeleton)],
    ['ex_flow_bear_inchworm', () => buildExerciseClip('ex_flow_bear_inchworm', scene, skeleton)],
    ['ex_flow_cobra_dog', () => buildExerciseClip('ex_flow_cobra_dog', scene, skeleton)],
    ['ex_flow_cobra_child', () => buildExerciseClip('ex_flow_cobra_child', scene, skeleton)],
    ['ex_flow_lizard_spider', () => buildExerciseClip('ex_flow_lizard_spider', scene, skeleton)],
    ['ex_flow_lizard_halfsplit', () => buildExerciseClip('ex_flow_lizard_halfsplit', scene, skeleton)],
    ['ex_flow_lizard_dog', () => buildExerciseClip('ex_flow_lizard_dog', scene, skeleton)],
    ['ex_flow_butterfly_ninety', () => buildExerciseClip('ex_flow_butterfly_ninety', scene, skeleton)],
    ['ex_flow_butterfly_frog', () => buildExerciseClip('ex_flow_butterfly_frog', scene, skeleton)],
    ['ex_flow_couch_kneel', () => buildExerciseClip('ex_flow_couch_kneel', scene, skeleton)],
    ['ex_flow_couch_halfsplit', () => buildExerciseClip('ex_flow_couch_halfsplit', scene, skeleton)],
    ['ex_flow_couch_lowlunge', () => buildExerciseClip('ex_flow_couch_lowlunge', scene, skeleton)],
    ['ex_flow_pigeon_lizard', () => buildExerciseClip('ex_flow_pigeon_lizard', scene, skeleton)],
    ['ex_flow_squat_butterfly', () => buildExerciseClip('ex_flow_squat_butterfly', scene, skeleton)],
    ['ex_flow_cossack_squat_fold', () => buildExerciseClip('ex_flow_cossack_squat_fold', scene, skeleton)],
    ['ex_flow_cossack_squat_spider', () => buildExerciseClip('ex_flow_cossack_squat_spider', scene, skeleton)],
    ['ex_flow_cossack_squat_frog', () => buildExerciseClip('ex_flow_cossack_squat_frog', scene, skeleton)],
    ['ex_flow_butterfly_squat_cossack', () => buildExerciseClip('ex_flow_butterfly_squat_cossack', scene, skeleton)],
    ['ex_flow_fold_squat_spider', () => buildExerciseClip('ex_flow_fold_squat_spider', scene, skeleton)],
    ['ex_flow_fold_squat_frog', () => buildExerciseClip('ex_flow_fold_squat_frog', scene, skeleton)],
    ['ex_flow_butterfly_squat_fold', () => buildExerciseClip('ex_flow_butterfly_squat_fold', scene, skeleton)],
    ['ex_flow_frog_squat_spider', () => buildExerciseClip('ex_flow_frog_squat_spider', scene, skeleton)],
    ['ex_flow_butterfly_squat_spider', () => buildExerciseClip('ex_flow_butterfly_squat_spider', scene, skeleton)],
    ['ex_flow_butterfly_squat_frog', () => buildExerciseClip('ex_flow_butterfly_squat_frog', scene, skeleton)],
    ['ex_flow_inchworm_fold_squat', () => buildExerciseClip('ex_flow_inchworm_fold_squat', scene, skeleton)],
    ['ex_flow_dog_fold_squat', () => buildExerciseClip('ex_flow_dog_fold_squat', scene, skeleton)],
    ['ex_flow_dog_fold_inchworm', () => buildExerciseClip('ex_flow_dog_fold_inchworm', scene, skeleton)],
    ['ex_flow_inchworm_spider_squat', () => buildExerciseClip('ex_flow_inchworm_spider_squat', scene, skeleton)],
    ['ex_flow_dog_spider_squat', () => buildExerciseClip('ex_flow_dog_spider_squat', scene, skeleton)],
    ['ex_flow_halfsplit_spider_squat', () => buildExerciseClip('ex_flow_halfsplit_spider_squat', scene, skeleton)],
    ['ex_flow_lowlunge_spider_squat', () => buildExerciseClip('ex_flow_lowlunge_spider_squat', scene, skeleton)],
    ['ex_flow_lizard_spider_squat', () => buildExerciseClip('ex_flow_lizard_spider_squat', scene, skeleton)],
    ['ex_flow_dog_spider_inchworm', () => buildExerciseClip('ex_flow_dog_spider_inchworm', scene, skeleton)],
    ['ex_flow_halfsplit_spider_inchworm', () => buildExerciseClip('ex_flow_halfsplit_spider_inchworm', scene, skeleton)],
    ['ex_flow_inchworm_spider_lowlunge', () => buildExerciseClip('ex_flow_inchworm_spider_lowlunge', scene, skeleton)],
    ['ex_flow_inchworm_spider_lizard', () => buildExerciseClip('ex_flow_inchworm_spider_lizard', scene, skeleton)],
    ['ex_flow_dog_spider_halfsplit', () => buildExerciseClip('ex_flow_dog_spider_halfsplit', scene, skeleton)],
    ['ex_flow_dog_spider_lowlunge', () => buildExerciseClip('ex_flow_dog_spider_lowlunge', scene, skeleton)],
    ['ex_flow_dog_spider_lizard', () => buildExerciseClip('ex_flow_dog_spider_lizard', scene, skeleton)],
    ['ex_flow_halfsplit_spider_lowlunge', () => buildExerciseClip('ex_flow_halfsplit_spider_lowlunge', scene, skeleton)],
    ['ex_flow_halfsplit_spider_lizard', () => buildExerciseClip('ex_flow_halfsplit_spider_lizard', scene, skeleton)],
    ['ex_flow_lizard_spider_lowlunge', () => buildExerciseClip('ex_flow_lizard_spider_lowlunge', scene, skeleton)],
    ['ex_flow_child_frog_squat', () => buildExerciseClip('ex_flow_child_frog_squat', scene, skeleton)],
    ['ex_flow_catcamel_frog_squat', () => buildExerciseClip('ex_flow_catcamel_frog_squat', scene, skeleton)],
    ['ex_flow_squat_frog_thread', () => buildExerciseClip('ex_flow_squat_frog_thread', scene, skeleton)],
    ['ex_flow_catcamel_frog_child', () => buildExerciseClip('ex_flow_catcamel_frog_child', scene, skeleton)],
    ['ex_flow_child_frog_thread', () => buildExerciseClip('ex_flow_child_frog_thread', scene, skeleton)],
    ['ex_flow_butterfly_frog_child', () => buildExerciseClip('ex_flow_butterfly_frog_child', scene, skeleton)],
    ['ex_flow_catcamel_frog_thread', () => buildExerciseClip('ex_flow_catcamel_frog_thread', scene, skeleton)],
    ['ex_flow_butterfly_frog_catcamel', () => buildExerciseClip('ex_flow_butterfly_frog_catcamel', scene, skeleton)],
    ['ex_flow_butterfly_frog_thread', () => buildExerciseClip('ex_flow_butterfly_frog_thread', scene, skeleton)],
    ['ex_flow_fold_inchworm_spider', () => buildExerciseClip('ex_flow_fold_inchworm_spider', scene, skeleton)],
    ['ex_flow_bear_inchworm_fold', () => buildExerciseClip('ex_flow_bear_inchworm_fold', scene, skeleton)],
    ['ex_flow_bear_inchworm_dog', () => buildExerciseClip('ex_flow_bear_inchworm_dog', scene, skeleton)],
    ['ex_flow_bear_inchworm_spider', () => buildExerciseClip('ex_flow_bear_inchworm_spider', scene, skeleton)],
    ['ex_flow_fold_dog_spider', () => buildExerciseClip('ex_flow_fold_dog_spider', scene, skeleton)],
    ['ex_flow_child_dog_fold', () => buildExerciseClip('ex_flow_child_dog_fold', scene, skeleton)],
    ['ex_flow_fold_dog_pigeon', () => buildExerciseClip('ex_flow_fold_dog_pigeon', scene, skeleton)],
    ['ex_flow_fold_dog_halfsplit', () => buildExerciseClip('ex_flow_fold_dog_halfsplit', scene, skeleton)],
    ['ex_flow_bear_dog_fold', () => buildExerciseClip('ex_flow_bear_dog_fold', scene, skeleton)],
    ['ex_flow_cobra_dog_fold', () => buildExerciseClip('ex_flow_cobra_dog_fold', scene, skeleton)],
    ['ex_flow_fold_dog_lizard', () => buildExerciseClip('ex_flow_fold_dog_lizard', scene, skeleton)],
    ['ex_flow_child_dog_inchworm', () => buildExerciseClip('ex_flow_child_dog_inchworm', scene, skeleton)],
    ['ex_flow_inchworm_dog_pigeon', () => buildExerciseClip('ex_flow_inchworm_dog_pigeon', scene, skeleton)],
    ['ex_flow_halfsplit_dog_inchworm', () => buildExerciseClip('ex_flow_halfsplit_dog_inchworm', scene, skeleton)],
    ['ex_flow_cobra_dog_inchworm', () => buildExerciseClip('ex_flow_cobra_dog_inchworm', scene, skeleton)],
    ['ex_flow_inchworm_dog_lizard', () => buildExerciseClip('ex_flow_inchworm_dog_lizard', scene, skeleton)],
    ['ex_flow_child_dog_spider', () => buildExerciseClip('ex_flow_child_dog_spider', scene, skeleton)],
    ['ex_flow_pigeon_dog_spider', () => buildExerciseClip('ex_flow_pigeon_dog_spider', scene, skeleton)],
    ['ex_flow_bear_dog_spider', () => buildExerciseClip('ex_flow_bear_dog_spider', scene, skeleton)],
    ['ex_flow_cobra_dog_spider', () => buildExerciseClip('ex_flow_cobra_dog_spider', scene, skeleton)],
    ['ex_flow_child_dog_pigeon', () => buildExerciseClip('ex_flow_child_dog_pigeon', scene, skeleton)],
    ['ex_flow_child_dog_halfsplit', () => buildExerciseClip('ex_flow_child_dog_halfsplit', scene, skeleton)],
    ['ex_flow_bear_dog_child', () => buildExerciseClip('ex_flow_bear_dog_child', scene, skeleton)],
    ['ex_flow_child_dog_cobra', () => buildExerciseClip('ex_flow_child_dog_cobra', scene, skeleton)],
    ['ex_flow_child_dog_lizard', () => buildExerciseClip('ex_flow_child_dog_lizard', scene, skeleton)],
    ['ex_flow_halfsplit_dog_pigeon', () => buildExerciseClip('ex_flow_halfsplit_dog_pigeon', scene, skeleton)],
    ['ex_flow_bear_dog_pigeon', () => buildExerciseClip('ex_flow_bear_dog_pigeon', scene, skeleton)],
    ['ex_flow_cobra_dog_pigeon', () => buildExerciseClip('ex_flow_cobra_dog_pigeon', scene, skeleton)],
    ['ex_flow_lizard_dog_pigeon', () => buildExerciseClip('ex_flow_lizard_dog_pigeon', scene, skeleton)],
    ['ex_flow_bear_dog_halfsplit', () => buildExerciseClip('ex_flow_bear_dog_halfsplit', scene, skeleton)],
    ['ex_flow_cobra_dog_halfsplit', () => buildExerciseClip('ex_flow_cobra_dog_halfsplit', scene, skeleton)],
    ['ex_flow_halfsplit_dog_lizard', () => buildExerciseClip('ex_flow_halfsplit_dog_lizard', scene, skeleton)],
    ['ex_flow_bear_dog_cobra', () => buildExerciseClip('ex_flow_bear_dog_cobra', scene, skeleton)],
    ['ex_flow_bear_dog_lizard', () => buildExerciseClip('ex_flow_bear_dog_lizard', scene, skeleton)],
    ['ex_flow_cobra_dog_lizard', () => buildExerciseClip('ex_flow_cobra_dog_lizard', scene, skeleton)],
    ['ex_flow_catcamel_child_dog', () => buildExerciseClip('ex_flow_catcamel_child_dog', scene, skeleton)],
    ['ex_flow_dog_child_thread', () => buildExerciseClip('ex_flow_dog_child_thread', scene, skeleton)],
    ['ex_flow_dog_child_frog', () => buildExerciseClip('ex_flow_dog_child_frog', scene, skeleton)],
    ['ex_flow_catcamel_child_pigeon', () => buildExerciseClip('ex_flow_catcamel_child_pigeon', scene, skeleton)],
    ['ex_flow_pigeon_child_thread', () => buildExerciseClip('ex_flow_pigeon_child_thread', scene, skeleton)],
    ['ex_flow_frog_child_pigeon', () => buildExerciseClip('ex_flow_frog_child_pigeon', scene, skeleton)],
    ['ex_flow_bear_child_pigeon', () => buildExerciseClip('ex_flow_bear_child_pigeon', scene, skeleton)],
    ['ex_flow_cobra_child_pigeon', () => buildExerciseClip('ex_flow_cobra_child_pigeon', scene, skeleton)],
    ['ex_flow_catcamel_child_thread', () => buildExerciseClip('ex_flow_catcamel_child_thread', scene, skeleton)],
    ['ex_flow_bear_child_catcamel', () => buildExerciseClip('ex_flow_bear_child_catcamel', scene, skeleton)],
    ['ex_flow_catcamel_child_cobra', () => buildExerciseClip('ex_flow_catcamel_child_cobra', scene, skeleton)],
    ['ex_flow_bear_child_thread', () => buildExerciseClip('ex_flow_bear_child_thread', scene, skeleton)],
    ['ex_flow_cobra_child_thread', () => buildExerciseClip('ex_flow_cobra_child_thread', scene, skeleton)],
    ['ex_flow_bear_child_frog', () => buildExerciseClip('ex_flow_bear_child_frog', scene, skeleton)],
    ['ex_flow_cobra_child_frog', () => buildExerciseClip('ex_flow_cobra_child_frog', scene, skeleton)],
    ['ex_flow_bear_child_cobra', () => buildExerciseClip('ex_flow_bear_child_cobra', scene, skeleton)],
    ['ex_flow_dog_pigeon_ninety', () => buildExerciseClip('ex_flow_dog_pigeon_ninety', scene, skeleton)],
    ['ex_flow_child_pigeon_ninety', () => buildExerciseClip('ex_flow_child_pigeon_ninety', scene, skeleton)],
    ['ex_flow_lizard_pigeon_ninety', () => buildExerciseClip('ex_flow_lizard_pigeon_ninety', scene, skeleton)],
    ['ex_flow_child_pigeon_lizard', () => buildExerciseClip('ex_flow_child_pigeon_lizard', scene, skeleton)],
    ['ex_flow_dog_halfsplit_kneel', () => buildExerciseClip('ex_flow_dog_halfsplit_kneel', scene, skeleton)],
    ['ex_flow_dog_halfsplit_lowlunge', () => buildExerciseClip('ex_flow_dog_halfsplit_lowlunge', scene, skeleton)],
    ['ex_flow_couch_halfsplit_dog', () => buildExerciseClip('ex_flow_couch_halfsplit_dog', scene, skeleton)],
    ['ex_flow_kneel_halfsplit_spider', () => buildExerciseClip('ex_flow_kneel_halfsplit_spider', scene, skeleton)],
    ['ex_flow_couch_halfsplit_spider', () => buildExerciseClip('ex_flow_couch_halfsplit_spider', scene, skeleton)],
    ['ex_flow_kneel_halfsplit_lowlunge', () => buildExerciseClip('ex_flow_kneel_halfsplit_lowlunge', scene, skeleton)],
    ['ex_flow_kneel_halfsplit_lizard', () => buildExerciseClip('ex_flow_kneel_halfsplit_lizard', scene, skeleton)],
    ['ex_flow_couch_halfsplit_kneel', () => buildExerciseClip('ex_flow_couch_halfsplit_kneel', scene, skeleton)],
    ['ex_flow_lizard_halfsplit_lowlunge', () => buildExerciseClip('ex_flow_lizard_halfsplit_lowlunge', scene, skeleton)],
    ['ex_flow_couch_halfsplit_lowlunge', () => buildExerciseClip('ex_flow_couch_halfsplit_lowlunge', scene, skeleton)],
    ['ex_flow_couch_halfsplit_lizard', () => buildExerciseClip('ex_flow_couch_halfsplit_lizard', scene, skeleton)],
    ['ex_flow_kneel_lowlunge_spider', () => buildExerciseClip('ex_flow_kneel_lowlunge_spider', scene, skeleton)],
    ['ex_flow_couch_lowlunge_spider', () => buildExerciseClip('ex_flow_couch_lowlunge_spider', scene, skeleton)],
    ['ex_flow_couch_lowlunge_kneel', () => buildExerciseClip('ex_flow_couch_lowlunge_kneel', scene, skeleton)],
    ['ex_flow_halfsplit_kneel_ninety', () => buildExerciseClip('ex_flow_halfsplit_kneel_ninety', scene, skeleton)],
    ['ex_flow_lowlunge_kneel_ninety', () => buildExerciseClip('ex_flow_lowlunge_kneel_ninety', scene, skeleton)],
    ['ex_flow_couch_kneel_ninety', () => buildExerciseClip('ex_flow_couch_kneel_ninety', scene, skeleton)],
    ['ex_flow_kneel_ninety_pigeon', () => buildExerciseClip('ex_flow_kneel_ninety_pigeon', scene, skeleton)],
    ['ex_flow_kneel_ninety_shinbox', () => buildExerciseClip('ex_flow_kneel_ninety_shinbox', scene, skeleton)],
    ['ex_flow_butterfly_ninety_kneel', () => buildExerciseClip('ex_flow_butterfly_ninety_kneel', scene, skeleton)],
    ['ex_flow_pigeon_ninety_shinbox', () => buildExerciseClip('ex_flow_pigeon_ninety_shinbox', scene, skeleton)],
    ['ex_flow_butterfly_ninety_pigeon', () => buildExerciseClip('ex_flow_butterfly_ninety_pigeon', scene, skeleton)],
    ['ex_flow_butterfly_ninety_shinbox', () => buildExerciseClip('ex_flow_butterfly_ninety_shinbox', scene, skeleton)],
    ['ex_flow_child_bear_inchworm', () => buildExerciseClip('ex_flow_child_bear_inchworm', scene, skeleton)],
    ['ex_flow_pigeon_lizard_spider', () => buildExerciseClip('ex_flow_pigeon_lizard_spider', scene, skeleton)],
    ['ex_flow_halfsplit_lizard_pigeon', () => buildExerciseClip('ex_flow_halfsplit_lizard_pigeon', scene, skeleton)],
    ['ex_flow_frog_butterfly_ninety', () => buildExerciseClip('ex_flow_frog_butterfly_ninety', scene, skeleton)],
    ['ex_flow_ninety_butterfly_squat', () => buildExerciseClip('ex_flow_ninety_butterfly_squat', scene, skeleton)],
    ['ex_pallofpress_standing', () => buildExerciseClip('ex_pallofpress_standing', scene, skeleton)],
    ['ex_pallofpress_hk', () => buildExerciseClip('ex_pallofpress_hk', scene, skeleton)],
    ['ex_pallofpress_tk', () => buildExerciseClip('ex_pallofpress_tk', scene, skeleton)],
    ['ex_pallofpress_split', () => buildExerciseClip('ex_pallofpress_split', scene, skeleton)],
    ['ex_pallofpress_lateral', () => buildExerciseClip('ex_pallofpress_lateral', scene, skeleton)],
    ['ex_pallofpress_single', () => buildExerciseClip('ex_pallofpress_single', scene, skeleton)],
    ['ex_pallofhold_standing', () => buildExerciseClip('ex_pallofhold_standing', scene, skeleton)],
    ['ex_pallofhold_hk', () => buildExerciseClip('ex_pallofhold_hk', scene, skeleton)],
    ['ex_pallofhold_tk', () => buildExerciseClip('ex_pallofhold_tk', scene, skeleton)],
    ['ex_pallofhold_split', () => buildExerciseClip('ex_pallofhold_split', scene, skeleton)],
    ['ex_pallofhold_lateral', () => buildExerciseClip('ex_pallofhold_lateral', scene, skeleton)],
    ['ex_pallofhold_single', () => buildExerciseClip('ex_pallofhold_single', scene, skeleton)],
    ['ex_pallofoverhead_standing', () => buildExerciseClip('ex_pallofoverhead_standing', scene, skeleton)],
    ['ex_pallofoverhead_hk', () => buildExerciseClip('ex_pallofoverhead_hk', scene, skeleton)],
    ['ex_pallofoverhead_tk', () => buildExerciseClip('ex_pallofoverhead_tk', scene, skeleton)],
    ['ex_pallofoverhead_split', () => buildExerciseClip('ex_pallofoverhead_split', scene, skeleton)],
    ['ex_pallofoverhead_lateral', () => buildExerciseClip('ex_pallofoverhead_lateral', scene, skeleton)],
    ['ex_pallofoverhead_single', () => buildExerciseClip('ex_pallofoverhead_single', scene, skeleton)],
    ['ex_pallofrotate_standing', () => buildExerciseClip('ex_pallofrotate_standing', scene, skeleton)],
    ['ex_pallofrotate_hk', () => buildExerciseClip('ex_pallofrotate_hk', scene, skeleton)],
    ['ex_pallofrotate_tk', () => buildExerciseClip('ex_pallofrotate_tk', scene, skeleton)],
    ['ex_pallofrotate_split', () => buildExerciseClip('ex_pallofrotate_split', scene, skeleton)],
    ['ex_pallofrotate_lateral', () => buildExerciseClip('ex_pallofrotate_lateral', scene, skeleton)],
    ['ex_pallofrotate_single', () => buildExerciseClip('ex_pallofrotate_single', scene, skeleton)],
    ['ex_chest_standing', () => buildExerciseClip('ex_chest_standing', scene, skeleton)],
    ['ex_chest_tk', () => buildExerciseClip('ex_chest_tk', scene, skeleton)],
    ['ex_chest_hk', () => buildExerciseClip('ex_chest_hk', scene, skeleton)],
    ['ex_chest_split', () => buildExerciseClip('ex_chest_split', scene, skeleton)],
    ['ex_chest_stepin', () => buildExerciseClip('ex_chest_stepin', scene, skeleton)],
    ['ex_chest_single', () => buildExerciseClip('ex_chest_single', scene, skeleton)],
    ['ex_overhead_standing', () => buildExerciseClip('ex_overhead_standing', scene, skeleton)],
    ['ex_overhead_tk', () => buildExerciseClip('ex_overhead_tk', scene, skeleton)],
    ['ex_overhead_hk', () => buildExerciseClip('ex_overhead_hk', scene, skeleton)],
    ['ex_overhead_split', () => buildExerciseClip('ex_overhead_split', scene, skeleton)],
    ['ex_overhead_stepin', () => buildExerciseClip('ex_overhead_stepin', scene, skeleton)],
    ['ex_overhead_single', () => buildExerciseClip('ex_overhead_single', scene, skeleton)],
    ['ex_scoop_standing', () => buildExerciseClip('ex_scoop_standing', scene, skeleton)],
    ['ex_scoop_tk', () => buildExerciseClip('ex_scoop_tk', scene, skeleton)],
    ['ex_scoop_hk', () => buildExerciseClip('ex_scoop_hk', scene, skeleton)],
    ['ex_scoop_split', () => buildExerciseClip('ex_scoop_split', scene, skeleton)],
    ['ex_scoop_stepin', () => buildExerciseClip('ex_scoop_stepin', scene, skeleton)],
    ['ex_scoop_single', () => buildExerciseClip('ex_scoop_single', scene, skeleton)],
    ['ex_shotput_standing', () => buildExerciseClip('ex_shotput_standing', scene, skeleton)],
    ['ex_shotput_tk', () => buildExerciseClip('ex_shotput_tk', scene, skeleton)],
    ['ex_shotput_hk', () => buildExerciseClip('ex_shotput_hk', scene, skeleton)],
    ['ex_shotput_split', () => buildExerciseClip('ex_shotput_split', scene, skeleton)],
    ['ex_shotput_stepin', () => buildExerciseClip('ex_shotput_stepin', scene, skeleton)],
    ['ex_shotput_single', () => buildExerciseClip('ex_shotput_single', scene, skeleton)],
    ['ex_sidetoss_standing', () => buildExerciseClip('ex_sidetoss_standing', scene, skeleton)],
    ['ex_sidetoss_tk', () => buildExerciseClip('ex_sidetoss_tk', scene, skeleton)],
    ['ex_sidetoss_hk', () => buildExerciseClip('ex_sidetoss_hk', scene, skeleton)],
    ['ex_sidetoss_split', () => buildExerciseClip('ex_sidetoss_split', scene, skeleton)],
    ['ex_sidetoss_stepin', () => buildExerciseClip('ex_sidetoss_stepin', scene, skeleton)],
    ['ex_sidetoss_single', () => buildExerciseClip('ex_sidetoss_single', scene, skeleton)],
    ['ex_underhand_standing', () => buildExerciseClip('ex_underhand_standing', scene, skeleton)],
    ['ex_underhand_tk', () => buildExerciseClip('ex_underhand_tk', scene, skeleton)],
    ['ex_underhand_hk', () => buildExerciseClip('ex_underhand_hk', scene, skeleton)],
    ['ex_underhand_split', () => buildExerciseClip('ex_underhand_split', scene, skeleton)],
    ['ex_underhand_stepin', () => buildExerciseClip('ex_underhand_stepin', scene, skeleton)],
    ['ex_underhand_single', () => buildExerciseClip('ex_underhand_single', scene, skeleton)],
    ['ex_singlepush_standing', () => buildExerciseClip('ex_singlepush_standing', scene, skeleton)],
    ['ex_singlepush_tk', () => buildExerciseClip('ex_singlepush_tk', scene, skeleton)],
    ['ex_singlepush_hk', () => buildExerciseClip('ex_singlepush_hk', scene, skeleton)],
    ['ex_singlepush_split', () => buildExerciseClip('ex_singlepush_split', scene, skeleton)],
    ['ex_singlepush_stepin', () => buildExerciseClip('ex_singlepush_stepin', scene, skeleton)],
    ['ex_rotoverhead_standing', () => buildExerciseClip('ex_rotoverhead_standing', scene, skeleton)],
    ['ex_rotoverhead_tk', () => buildExerciseClip('ex_rotoverhead_tk', scene, skeleton)],
    ['ex_rotoverhead_hk', () => buildExerciseClip('ex_rotoverhead_hk', scene, skeleton)],
    ['ex_rotoverhead_split', () => buildExerciseClip('ex_rotoverhead_split', scene, skeleton)],
    ['ex_rotoverhead_stepin', () => buildExerciseClip('ex_rotoverhead_stepin', scene, skeleton)],
    ['ex_rotoverhead_single', () => buildExerciseClip('ex_rotoverhead_single', scene, skeleton)],
    ['ex_chop_hk', () => buildExerciseClip('ex_chop_hk', scene, skeleton)],
    ['ex_lift_hk', () => buildExerciseClip('ex_lift_hk', scene, skeleton)],
    ['ex_chop_standing', () => buildExerciseClip('ex_chop_standing', scene, skeleton)],
    ['ex_lift_standing', () => buildExerciseClip('ex_lift_standing', scene, skeleton)],
    ['ex_slam_standing', () => buildExerciseClip('ex_slam_standing', scene, skeleton)],
    ['ex_backtoss_standing', () => buildExerciseClip('ex_backtoss_standing', scene, skeleton)],
    ['ex_squatthrow_standing', () => buildExerciseClip('ex_squatthrow_standing', scene, skeleton)],
    ['ex_carry_rack', () => buildExerciseClip('ex_carry_rack', scene, skeleton)],
    ['ex_carry_overhead', () => buildExerciseClip('ex_carry_overhead', scene, skeleton)],
    ['ex_march_carry', () => buildExerciseClip('ex_march_carry', scene, skeleton)],
    ['ex_march_rack', () => buildExerciseClip('ex_march_rack', scene, skeleton)],
    ['ex_march_overhead', () => buildExerciseClip('ex_march_overhead', scene, skeleton)],
    ['ex_kb_swing', () => buildExerciseClip('ex_kb_swing', scene, skeleton)],
    ['ex_kb_swing_one', () => buildExerciseClip('ex_kb_swing_one', scene, skeleton)],
    ['ex_er_side', () => buildExerciseClip('ex_er_side', scene, skeleton)],
    ['ex_ir_side', () => buildExerciseClip('ex_ir_side', scene, skeleton)],
    ['ex_er_90', () => buildExerciseClip('ex_er_90', scene, skeleton)],
    ['ex_ir_90', () => buildExerciseClip('ex_ir_90', scene, skeleton)],
    ['ex_er_90_hk', () => buildExerciseClip('ex_er_90_hk', scene, skeleton)],
    ['ex_ir_90_hk', () => buildExerciseClip('ex_ir_90_hk', scene, skeleton)],
    ['ex_er_side_split', () => buildExerciseClip('ex_er_side_split', scene, skeleton)],
    ['ex_ir_side_split', () => buildExerciseClip('ex_ir_side_split', scene, skeleton)],
    ['ex_halo', () => buildExerciseClip('ex_halo', scene, skeleton)],
    ['ex_side_bend', () => buildExerciseClip('ex_side_bend', scene, skeleton)],
    ['ex_cable_press_one', () => buildExerciseClip('ex_cable_press_one', scene, skeleton)],
    ['ex_cable_row_one', () => buildExerciseClip('ex_cable_row_one', scene, skeleton)],
  ];
}

/**
 * LIBRARY-ANATOMY (2026-10-25): build ONE authored clip on demand and register it — for a LAZY scope (clipScope.ts
 * `lazy`: the exercise library's stage), which builds only the core clips at spawn and the clip an entry plays when it is
 * asked for, instead of ~80 a page shows one of at a time (measured: the spawn's clip builds were about half of the
 * stage's 12 s load on the 4x-throttled phone profile). Refuses a name outside the body's scope. Returns whether the
 * clip is now registered.
 */
export function buildAuthoredClip(animator: CharacterAnimator, scene: Scene, skeleton: Skeleton, name: string, scope: ClipScope | null = scopeForScene(scene)): boolean {
  if (animator.clipNames.has(name)) return true;
  if (!scopeAllows(scope, name)) return false;
  const entry = authoredBuilders(scene, skeleton).find(([n]) => n === name);
  const g = entry?.[1]() ?? null;
  if (!g) return false;
  animator.register(g);
  ledgerFor(scene).registered.add(g.name);
  return true;
}

export function registerAuthoredClips(
  animator: CharacterAnimator, scene: Scene, skeleton: Skeleton,
  scope: ClipScope | null = scopeForScene(scene),
): string[] {
  const builders = authoredBuilders(scene, skeleton);
  const registered: string[] = [];
  let skipped = 0;
  for (const [name, build] of builders) {
    if (!scopeAllows(scope, name)) { skipped++; continue; }   // another sport's clip: never built, never playable here
    if (scope?.lazy && suiteOfClip(name) !== 'core') { skipped++; continue; }   // LIBRARY-ANATOMY: a lazy scope builds the rest on demand (buildAuthoredClip)
    if (!scope && OPT_IN_SUITES.includes(suiteOfClip(name))) { skipped++; continue; }   // LIBRARY-ANATOMY: an opt-in suite is built only where a scope names it
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
