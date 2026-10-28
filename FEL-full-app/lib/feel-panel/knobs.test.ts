// feel-panel lane (owner 2026-10-20): the catalogue's defaults ARE the shipped constants, every bound is safe, and every knob is read.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEEL_KNOBS, FEEL_KNOB_BY_ID, clampKnob, stepDecimals } from './knobs';
import { AI_HAND_RANGE_M, AI_HAND_DWELL_SEC, AI_HAND_GAP_SEC } from '@/lib/babylon/core/AiBallHand';
import { HAND_CLEAR_M } from '@/lib/babylon/anim/Dribble';
import { DIST_GREEN_NEAR_M, DIST_GREEN_FAR_M, DIST_GREEN_MAX_NARROW } from '@/lib/babylon/core/ShotWindow';
import { SHOT_CLOCK_1V1_SEC, SHOT_CLOCK_3V3_SEC } from '@/lib/babylon/core/ShotClock';
import { DUNK_RING_QUALITY, DUNK_SHORT_BIAS, DUNK_CLANK_MIN_MPS, DUNK_CLANK_SPAN_MPS } from '@/lib/babylon/core/RimForAll';
import { COMBO_OPEN_K, COMBO_GRACE_SEC } from '@/lib/babylon/anim/comboFlow';
import { GUARD_RANGE_M } from '@/lib/babylon/core/GuardHand';
import { PROTECT_DRIBBLE_ON, REST_BOUNCE_ON, REST_TEMPO_IDLE, REST_TEMPO_PROTECT, CLIP_LOCK_GAIN, CLIP_LOCK_HZ_MAX, CLIP_LOCK_MAX_MPS, PROTECT_GUARD_ON, GUARD_BACK_M, GUARD_OUT_M, GUARD_DROP_M, GUARD_SEC, GUARD_BAR_X_M, GUARD_BAR_Y_M, GUARD_BAR_Z_M } from '@/lib/babylon/anim/RestDribble';
import { EYES_ON_DEFENDER_ON, READ_RANGE_M, READ_SPEED01, READ_GLANCE_EVERY_SEC, READ_GLANCE_SEC, PROTECT_POSTURE_ON, PROTECT_TURN_DEG, PROTECT_EYES, PROTECT_CHEST_AIM } from '@/lib/babylon/core/HoopsLook';
import { PROTECT_SINK_M, PROTECT_SINK_SEC } from '@/lib/babylon/anim/ProtectSink';
import { MOVE_EASE_ON, MOVE_EASE_SEC, MOVE_EASE_RATE_DEG, MOVE_ARM_RATE_DEG } from '@/lib/babylon/anim/MoveEase';
import { JUMPER_HOP_ON, JUMPER_APEX_AFTER_RELEASE_SEC, JUMPER_MIN_LOAD_SEC, JUMPER_HANG_ON, JUMPER_HANG_SCALE } from '@/lib/babylon/core/JumperHop';
import { FT_SETUP_SEC, FT_ROUTINE_SEC, FT_SET_SEC, FT_RESULT_SEC, FT_DIST_NARROW_01 } from '@/lib/babylon/core/FreeThrows';
import { BANK_SET_DEG, BANK_GLANCE_MS } from '@/lib/babylon/hoops/shotLooks';
import { OVERTIME_3V3_SEC } from '@/lib/babylon/modes/threevthreeOvertime';
import { OOP_LOB_FLIGHT_SEC, OOP_LATE_CATCH_CLIP_T, REAL_JUMP_PERSONAL, RUNWAY_STRIDE_SCALE, SLAM_HITSTOP_BIG_MS, SLAM_SHAKE_BIG, LAND_LEAD_SEC } from '@/lib/babylon/core/DunkFlagship';   // dunk-flagship
import { BALL_SIDE_SHADE_ON, SHADE_OFFSET_M, SHADE_REACT_SEC, SHADE_SHIFT_MPS, SHADE_FLIP_M, SHADE_RANGE_M, SHADE_RESEED_M } from '@/lib/babylon/core/BallSideShade';
import { OFF_BALL_LOOK_ON, MAN_GLANCE_EVERY_SEC, MAN_GLANCE_SEC } from '@/lib/babylon/core/OffBallLook';   // lane/h3-aware
import { POSSESSION_SWAP_ON, FOE_SPACE_ANGLE_K, HAS_BALL_M } from '@/lib/babylon/core/PossessionSwap';
import { DEFENSE_STANCE_ON, DEFENSE_RAISE_M, RAISE_REACH, STANCE_EASE_SEC, DEFEND_LEAN_DEG, DEFEND_SPINE1_DEG } from '@/lib/babylon/core/DefenseStance';
import {
  MATE_READ_ON, MATE_SETTLE_SEC, MATE_READ_SEC, MATE_HOLD_MAX_SEC, MATE_SHOOT_RANGE_M, MATE_DRIVE_FROM_M, MATE_FINISH_M, MATE_DRIVE_MAX_SEC, MATE_LANE_M,
} from '@/lib/babylon/modes/threevthreeMate';
import { AI_REACH_TELL_ON, AI_REACH_TELL_SEC, AI_REACH_STUN_SEC, AI_REACH_GATE, AI_STEAL_CHANCE, AI_STEAL_ON_BUMP, POKE_READ_ON, STEAL_RATE_PER_SEC, POKE_RANGE, POKE_LEAD_SEC } from '@/lib/babylon/core/ReachTell';
import { BODY_SEP_ON, ONEVONE_CAPSULE_RADIUS, BODY_HARD_GAP, SEP_PUSH_MPS, SEP_DEADBAND, SEP_POP_MAX } from '@/lib/babylon/core/BodySeparation';
import * as BLK from '@/lib/babylon/core/HoopsBlocks';
import {
  HOOPS_JOG_TAU, HOOPS_SPRINT_TAU, HOOPS_JOG_ACCEL, HOOPS_SPRINT_ACCEL, HOOPS_LOAD_SCALE, HOOPS_GEAR_DOWN_DECEL, HOOPS_STOP_DECEL_LOW, HOOPS_STOP_DECEL_HIGH,
  HOOPS_PLANT_DECEL, HOOPS_HANDLER_TURN_DEG, HOOPS_TURN_TRUE_ARC, HOOPS_KICK_SEC, HOOPS_CUT_SEC, HOOPS_JERK, HOOPS_REVERSE_DEG, HOOPS_REVERSE_DECEL,
  HOOPS_RETREAT_SPEED_K,
  HANDLER_JOG_TAU, HANDLER_JOG_ACCEL, HANDLER_LOAD_SCALE, HANDLER_STOP_DECEL_LOW, HANDLER_STOP_DECEL_HIGH, HANDLER_FIRST_STEP_MPS,
  HANDLER_REVERSE_PLANT_HOLD, HANDLER_REVERSE_LAUNCH_SEC,
} from '@/lib/babylon/core/HoopsStick';
import { PORTRAIT_HERO_MARGIN } from '@/lib/babylon/modes/netPortraitCam';
import { AI_REACT_ROOKIE_MS, AI_REACT_PRO_MS, AI_REACT_ELITE_MS } from '@/lib/babylon/hoops/reaction';   // lane/hoops-round2
import { DOUBLE_TEAM_ON, DOUBLE_PAINT_M, DOUBLE_AFTER_SEC, DOUBLE_MAX_SEC, DOUBLE_COOLDOWN_SEC, SWITCH_ON_SCREEN_ON, SWITCH_HELP_M, SWITCH_COOLDOWN_SEC } from '@/lib/babylon/hoops/teamDefense';
import { HAND_CHECK_ON, HAND_CHECK_REACH_OVER_M, HAND_CHECK_GAP_SEC, HAND_CHECK_FOUL_COUNT, HAND_CHECK_WINDOW_SEC, CONTACT_POSE_ON, CONTACT_EASE_IN_SEC, CONTACT_EASE_OUT_SEC } from '@/lib/babylon/hoops/handCheck';
import { CHEST_LEAN_DEG } from '@/lib/babylon/hoops/contactPoses';
import * as P2B from '@/lib/babylon/hoops/blocks';   // hoops-p02
import { AI_BLOCK_JUMP_CHANCE } from '@/lib/babylon/core/HoopsDefense';   // hoops-p02
import * as P2C from '@/lib/babylon/hoops/contest';   // hoops-p02
import { STEAL_DICE_ON, STRIP_REACH_M, STRIP_SHIELD_M, STRIP_BALL_MAX_Y } from '@/lib/babylon/hoops/steals';   // hoops-p02
import { ONBALL_CUSHION_M, ONBALL_CUSHION_PER_MPS } from '@/lib/babylon/hoops/pressure';   // hoops-p02

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== 'node_modules') out.push(...tsFiles(p)); }
    else if (/\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}

describe('the feel knob catalogue', () => {
  it('the #375 numbers are registered with their shipped defaults', () => {
    const def = (id: string) => FEEL_KNOB_BY_ID.get(id)?.def;
    expect(def('hoops.aiHandRangeM')).toBe(AI_HAND_RANGE_M);
    expect(def('hoops.aiHandDwellSec')).toBe(AI_HAND_DWELL_SEC);
    expect(def('hoops.aiHandGapSec')).toBe(AI_HAND_GAP_SEC);
    expect(def('hoops.handClearM')).toBe(HAND_CLEAR_M);
    expect([AI_HAND_RANGE_M, AI_HAND_DWELL_SEC, AI_HAND_GAP_SEC, HAND_CLEAR_M]).toEqual([2.4, 0.35, 0.9, 0.01]);
    // hoops-shot-core
    expect(def('hoops.distGreenNearM')).toBe(DIST_GREEN_NEAR_M);
    expect(def('hoops.distGreenFarM')).toBe(DIST_GREEN_FAR_M);
    expect(def('hoops.distGreenMaxNarrow')).toBe(DIST_GREEN_MAX_NARROW);
    expect(def('hoops.shotClock1v1Sec')).toBe(SHOT_CLOCK_1V1_SEC);
    expect(def('hoops.shotClock3v3Sec')).toBe(SHOT_CLOCK_3V3_SEC);
    expect(def('hoops.dunkRingQuality')).toBe(DUNK_RING_QUALITY);
    expect(def('hoops.dunkShortBias')).toBe(DUNK_SHORT_BIAS);
    expect(def('hoops.dunkClankMinMps')).toBe(DUNK_CLANK_MIN_MPS);
    expect(def('hoops.dunkClankSpanMps')).toBe(DUNK_CLANK_SPAN_MPS);
    // hoops-moves (group "Hoops · handle")
    expect(def('hoops.comboOpenK')).toBe(COMBO_OPEN_K);
    expect(def('hoops.comboGraceSec')).toBe(COMBO_GRACE_SEC);
    expect(def('hoops.guardRangeM')).toBe(GUARD_RANGE_M);
    // tiebreak-cam (group "Tennis · camera")
    expect(def('tennis.portraitHeroMargin')).toBe(PORTRAIT_HERO_MARGIN);
    // hoops-round2 (HOP-02 "Hoops · AI reaction", HOP-03 "Hoops · team defense", HOP-04 "Hoops · contact"): the owner's 420 / 220 / 120
    expect(def('hoops.aiReactRookieMs')).toBe(AI_REACT_ROOKIE_MS);
    expect(def('hoops.aiReactProMs')).toBe(AI_REACT_PRO_MS);
    expect(def('hoops.aiReactEliteMs')).toBe(AI_REACT_ELITE_MS);
    expect([AI_REACT_ROOKIE_MS, AI_REACT_PRO_MS, AI_REACT_ELITE_MS]).toEqual([420, 220, 120]);
    expect(def('hoops.doubleTeamOn')).toBe(DOUBLE_TEAM_ON);
    expect(def('hoops.doublePaintM')).toBe(DOUBLE_PAINT_M);
    expect(def('hoops.doubleAfterSec')).toBe(DOUBLE_AFTER_SEC);
    expect(def('hoops.doubleMaxSec')).toBe(DOUBLE_MAX_SEC);
    expect(def('hoops.doubleCooldownSec')).toBe(DOUBLE_COOLDOWN_SEC);
    expect(def('hoops.switchOnScreenOn')).toBe(SWITCH_ON_SCREEN_ON);
    expect(def('hoops.switchHelpM')).toBe(SWITCH_HELP_M);
    expect(def('hoops.switchCooldownSec')).toBe(SWITCH_COOLDOWN_SEC);
    expect(def('hoops.handCheckOn')).toBe(HAND_CHECK_ON);
    expect(def('hoops.handCheckReachOverM')).toBe(HAND_CHECK_REACH_OVER_M);
    expect(def('hoops.handCheckGapSec')).toBe(HAND_CHECK_GAP_SEC);
    expect(def('hoops.handCheckFoulCount')).toBe(HAND_CHECK_FOUL_COUNT);
    expect(def('hoops.handCheckWindowSec')).toBe(HAND_CHECK_WINDOW_SEC);
    expect(def('hoops.contactPoseOn')).toBe(CONTACT_POSE_ON);
    expect(def('hoops.contactEaseInSec')).toBe(CONTACT_EASE_IN_SEC);
    expect(def('hoops.contactEaseOutSec')).toBe(CONTACT_EASE_OUT_SEC);
    expect(def('hoops.contactChestLeanDeg')).toBe(CHEST_LEAN_DEG);
    expect([COMBO_OPEN_K, COMBO_GRACE_SEC, GUARD_RANGE_M]).toEqual([0.5, 0.15, 2.0]);
    // hoops-shot-content
    expect(def('hoops.ftSetupSec')).toBe(FT_SETUP_SEC);
    expect(def('hoops.ftRoutineSec')).toBe(FT_ROUTINE_SEC);
    expect(def('hoops.ftSetSec')).toBe(FT_SET_SEC);
    expect(def('hoops.ftResultSec')).toBe(FT_RESULT_SEC);
    expect(def('hoops.bankSetDeg')).toBe(BANK_SET_DEG);
    expect(def('hoops.bankGlanceMs')).toBe(BANK_GLANCE_MS);
    expect([FT_SETUP_SEC, FT_ROUTINE_SEC, FT_SET_SEC, FT_RESULT_SEC, BANK_SET_DEG, BANK_GLANCE_MS]).toEqual([0.9, 1.2, 0.3, 1.1, 12, 1100]);
    expect(def('hoops.ftDistNarrow01')).toBe(FT_DIST_NARROW_01);
    expect(FT_DIST_NARROW_01).toBe(0);   // owner 2026-10-24: the line keeps the full open window
    // hoops-defense-fx
    expect(def('hoops.ballSideShadeOn')).toBe(BALL_SIDE_SHADE_ON ? 1 : 0);
    expect(def('hoops.shadeOffsetM')).toBe(SHADE_OFFSET_M);
    expect(def('hoops.shadeHoldSec')).toBe(SHADE_REACT_SEC);
    expect(def('hoops.shadeSlideMps')).toBe(SHADE_SHIFT_MPS);
    expect(def('hoops.shadeDeadBandM')).toBe(SHADE_FLIP_M);
    expect(def('hoops.shadeRangeM')).toBe(SHADE_RANGE_M);
    expect(def('hoops.shadeReseedM')).toBe(SHADE_RESEED_M);
    expect([BALL_SIDE_SHADE_ON, SHADE_OFFSET_M, SHADE_REACT_SEC, SHADE_SHIFT_MPS, SHADE_FLIP_M, SHADE_RANGE_M, SHADE_RESEED_M]).toEqual([true, 0.5, 0.22, 2.4, 0.08, 2.4, 1.0]);
    // lane/h3-handler (#312 / #314 ports): "Hoops · handle (rest)" and "Hoops · jump shot"
    const pins: [string, number][] = [
      ['hoops.protectDribbleOn', PROTECT_DRIBBLE_ON], ['hoops.restBounceOn', REST_BOUNCE_ON], ['hoops.restTempoIdle', REST_TEMPO_IDLE], ['hoops.restTempoProtect', REST_TEMPO_PROTECT],
      ['hoops.clipLockGain', CLIP_LOCK_GAIN], ['hoops.clipLockHzMax', CLIP_LOCK_HZ_MAX], ['hoops.clipLockMaxMps', CLIP_LOCK_MAX_MPS],
      ['hoops.eyesOnDefenderOn', EYES_ON_DEFENDER_ON], ['hoops.readRangeM', READ_RANGE_M], ['hoops.readSpeed01', READ_SPEED01], ['hoops.readGlanceEverySec', READ_GLANCE_EVERY_SEC], ['hoops.readGlanceSec', READ_GLANCE_SEC],
      ['hoops.protectGuardOn', PROTECT_GUARD_ON], ['hoops.guardBackM', GUARD_BACK_M], ['hoops.guardOutM', GUARD_OUT_M], ['hoops.guardDropM', GUARD_DROP_M], ['hoops.guardSec', GUARD_SEC],
      ['hoops.guardBarXM', GUARD_BAR_X_M], ['hoops.guardBarYM', GUARD_BAR_Y_M], ['hoops.guardBarZM', GUARD_BAR_Z_M],
      ['hoops.protectPostureOn', PROTECT_POSTURE_ON], ['hoops.protectTurnDeg', PROTECT_TURN_DEG], ['hoops.protectEyes', PROTECT_EYES], ['hoops.protectChestAim', PROTECT_CHEST_AIM],
      ['hoops.protectSinkM', PROTECT_SINK_M], ['hoops.protectSinkSec', PROTECT_SINK_SEC],
      ['hoops.moveEaseOn', MOVE_EASE_ON], ['hoops.moveEaseSec', MOVE_EASE_SEC], ['hoops.moveEaseRateDeg', MOVE_EASE_RATE_DEG], ['hoops.moveArmRateDeg', MOVE_ARM_RATE_DEG],
      ['hoops.jumperHopOn', JUMPER_HOP_ON], ['hoops.jumperApexAfterReleaseSec', JUMPER_APEX_AFTER_RELEASE_SEC], ['hoops.jumperMinLoadSec', JUMPER_MIN_LOAD_SEC], ['hoops.jumperHangOn', JUMPER_HANG_ON], ['hoops.jumperHangScale', JUMPER_HANG_SCALE],
    ];
    for (const [id, v] of pins) expect(def(id), id).toBe(v);
    // the ported numbers (#312: REST_TEMPO 1.2 / 1.45, clip lock gain 3 / 2.6 Hz, READ 3.5 m / 0.42, PROTECT_TURN 50°, eyes 0.9, chestAim 0.8,
    // PROTECT_SINK 0.06; #314: MOVE_EASE 0.2 s / 1000°/s / 1800°/s, JUMPER apex +0.03 s, load 0.08 s, hang 0.1) and every feature ON
    expect(pins.map(([, v]) => v)).toEqual([1, 1, 1.2, 1.45, 3, 2.6, 0.4, 1, 3.5, 0.42, 2.4, 0.55, 1, 0.22, 0.06, 0.06, 0.15, 0.15, 1.06, 0.34, 1, 50, 0.9, 0.8, 0.06, 0.18, 1, 0.2, 1000, 1800, 1, 0.03, 0.08, 1, 0.1]);
    // lane/h3-aware (groups "Hoops · 3v3 awareness" and "Hoops · teammate": PR #313 / #315's numbers)
    expect(def('hoops.offBallLookOn')).toBe(OFF_BALL_LOOK_ON);
    expect(def('hoops.manGlanceEverySec')).toBe(MAN_GLANCE_EVERY_SEC);
    expect(def('hoops.manGlanceSec')).toBe(MAN_GLANCE_SEC);
    expect(def('hoops.possessionSwapOn')).toBe(POSSESSION_SWAP_ON);
    expect(def('hoops.foeSpaceAngleK')).toBe(FOE_SPACE_ANGLE_K);
    expect(def('hoops.hasBallM')).toBe(HAS_BALL_M);
    expect(def('hoops.defenseStanceOn')).toBe(DEFENSE_STANCE_ON);
    expect(def('hoops.defenseRaiseM')).toBe(DEFENSE_RAISE_M);
    expect(def('hoops.raiseReach')).toBe(RAISE_REACH);
    expect(def('hoops.stanceEaseSec')).toBe(STANCE_EASE_SEC);
    expect(def('hoops.defendLeanDeg')).toBe(DEFEND_LEAN_DEG);
    expect(def('hoops.defendSpine1Deg')).toBe(DEFEND_SPINE1_DEG);
    expect([OFF_BALL_LOOK_ON, MAN_GLANCE_EVERY_SEC, MAN_GLANCE_SEC, POSSESSION_SWAP_ON, FOE_SPACE_ANGLE_K, HAS_BALL_M]).toEqual([1, 1.6, 0.4, 1, 0.3, 1.0]);
    expect([DEFENSE_STANCE_ON, DEFENSE_RAISE_M, RAISE_REACH, STANCE_EASE_SEC, DEFEND_LEAN_DEG, DEFEND_SPINE1_DEG]).toEqual([1, 0.15, 0.97, 0.18, -6, 2]);
    expect(def('hoops.mateReadOn')).toBe(MATE_READ_ON);
    expect(def('hoops.mateSettleSec')).toBe(MATE_SETTLE_SEC);
    expect(def('hoops.mateReadSec')).toBe(MATE_READ_SEC);
    expect(def('hoops.mateHoldMaxSec')).toBe(MATE_HOLD_MAX_SEC);
    expect(def('hoops.mateShootRangeM')).toBe(MATE_SHOOT_RANGE_M);
    expect(def('hoops.mateDriveFromM')).toBe(MATE_DRIVE_FROM_M);
    expect(def('hoops.mateFinishM')).toBe(MATE_FINISH_M);
    expect(def('hoops.mateDriveMaxSec')).toBe(MATE_DRIVE_MAX_SEC);
    expect(def('hoops.mateLaneM')).toBe(MATE_LANE_M);
    expect([MATE_READ_ON, MATE_SETTLE_SEC, MATE_READ_SEC, MATE_HOLD_MAX_SEC, MATE_SHOOT_RANGE_M, MATE_DRIVE_FROM_M, MATE_FINISH_M, MATE_DRIVE_MAX_SEC, MATE_LANE_M]).toEqual([1, 0.35, 0.9, 1.8, 7.3, 8.5, 2.4, 1.6, 0.9]);
    // lane/hoops-def-tell (#273 T-A, T-C; #274 BLK-1)
    expect(def('hoops.aiReachTellOn')).toBe(AI_REACH_TELL_ON ? 1 : 0);
    expect(def('hoops.aiReachTellSec')).toBe(AI_REACH_TELL_SEC);
    expect(def('hoops.aiReachStunSec')).toBe(AI_REACH_STUN_SEC);
    expect(def('hoops.aiReachGate')).toBe(AI_REACH_GATE);
    expect(def('hoops.aiStealChance')).toBe(AI_STEAL_CHANCE);
    expect(def('hoops.aiStealOnBump')).toBe(AI_STEAL_ON_BUMP);
    expect(def('hoops.pokeReadOn')).toBe(POKE_READ_ON ? 1 : 0);
    expect(def('hoops.stealRatePerSec')).toBe(STEAL_RATE_PER_SEC);
    expect(def('hoops.pokeRangeM')).toBe(POKE_RANGE);
    expect(def('hoops.pokeLeadSec')).toBe(POKE_LEAD_SEC);
    expect([AI_REACH_TELL_ON, AI_REACH_TELL_SEC, AI_REACH_STUN_SEC, AI_REACH_GATE, AI_STEAL_CHANCE, AI_STEAL_ON_BUMP, POKE_READ_ON, STEAL_RATE_PER_SEC, POKE_RANGE, POKE_LEAD_SEC])
      .toEqual([true, 0.25, 0.35, 0.7, 0.22, 0.6, true, 1.2, 1.2, 0.1]);   // hoops-p02: AI_REACH_GATE TUNED 0.5 → 0.7
    // hoops-p02 (1v1/3v3 phase 2): blocks, the contest, the AI strip, on-ball pressure — defaults pinned
    expect(def('hoops.blockDiceOn')).toBe(P2B.BLOCK_DICE_ON ? 1 : 0);
    expect(def('hoops.blkShoulderM')).toBe(P2B.SHOULDER_M);
    expect(def('hoops.blkArmM')).toBe(P2B.ARM_M);
    expect(def('hoops.blkContactM')).toBe(P2B.CONTACT_M);
    expect(def('hoops.blkLookSec')).toBe(P2B.LOOK_SEC);
    expect(def('hoops.blkReleaseJumperM')).toBe(P2B.RELEASE_JUMPER_M);
    expect(def('hoops.blkReleaseLayupM')).toBe(P2B.RELEASE_LAYUP_M);
    expect(def('hoops.aiBlockLeadSec')).toBe(P2B.AI_BLOCK_LEAD_SEC);
    expect(def('hoops.aiBlockReactOn')).toBe(P2B.AI_BLOCK_REACT_ON ? 1 : 0);
    expect(def('hoops.aiBlockJumpChance')).toBe(AI_BLOCK_JUMP_CHANCE);
    expect(def('hoops.blkDeflectMps')).toBe(P2B.DEFLECT_MPS);
    expect(def('hoops.blkDeflectUpMps')).toBe(P2B.DEFLECT_UP_MPS);
    expect(def('hoops.oneContestOn')).toBe(P2C.ONE_CONTEST_ON ? 1 : 0);
    expect(def('hoops.contestRangeM')).toBe(P2C.CONTEST_RANGE_M);
    expect(def('hoops.contestDistW')).toBe(P2C.CONTEST_DIST_W);
    expect(def('hoops.contestJump')).toBe(P2C.JUMP_CONTEST);
    expect(def('hoops.contestJumpFloor')).toBe(P2C.JUMP_CONTEST_FLOOR);
    expect(def('hoops.contestCloseout')).toBe(P2C.CLOSEOUT_CONTEST);
    expect(def('hoops.contestCloseoutFullMps')).toBe(P2C.CLOSEOUT_FULL_MPS);
    expect(def('hoops.stealDiceOn')).toBe(STEAL_DICE_ON ? 1 : 0);
    expect(def('hoops.stripReachM')).toBe(STRIP_REACH_M);
    expect(def('hoops.stripShieldM')).toBe(STRIP_SHIELD_M);
    expect(def('hoops.stripBallMaxY')).toBe(STRIP_BALL_MAX_Y);
    expect(def('hoops.onBallCushionM')).toBe(ONBALL_CUSHION_M);
    expect(def('hoops.onBallCushionPerMps')).toBe(ONBALL_CUSHION_PER_MPS);
    expect(def('hoops.bodySepOn')).toBe(BODY_SEP_ON ? 1 : 0);
    expect(def('hoops.capsuleRadius1v1M')).toBe(ONEVONE_CAPSULE_RADIUS);
    expect(def('hoops.bodyHardGapM')).toBe(BODY_HARD_GAP);
    expect(def('hoops.sepPushMps')).toBe(SEP_PUSH_MPS);
    expect(def('hoops.sepDeadbandM')).toBe(SEP_DEADBAND);
    expect(def('hoops.sepPopMaxM')).toBe(SEP_POP_MAX);
    expect([BODY_SEP_ON, ONEVONE_CAPSULE_RADIUS, BODY_HARD_GAP, SEP_PUSH_MPS, SEP_DEADBAND, SEP_POP_MAX]).toEqual([true, 0.55, 0.9, 2.4, 0.01, 0.1]);
    for (const [nm, U] of [['Contest', 'CONTEST'], ['Swat', 'SWAT'], ['Spike', 'SPIKE'], ['Chase', 'CHASE'], ['Pin', 'PIN'], ['Catch', 'CATCH']] as const) {
      expect(def(`hoops.blk${nm}TMs`)).toBe(BLK[`BLK_${U}_T_MS`]);
      expect(def(`hoops.blk${nm}HalfMs`)).toBe(BLK[`BLK_${U}_HALF_MS`]);
    }
    expect(def('hoops.blkHoldMs')).toBe(BLK.HOLD_MS);
    expect(def('hoops.blkCatchMeterFullMs')).toBe(BLK.CATCH_METER_FULL_MS);
    expect(def('hoops.blkSwatRangeLayupM')).toBe(BLK.SWAT_RANGE_LAYUP);
    expect(def('hoops.blkSwatRangeJumperM')).toBe(BLK.SWAT_RANGE_JUMPER);
    expect(def('hoops.blkCatchMaxAngleDeg')).toBe(BLK.CATCH_MAX_ANGLE);
    expect(def('hoops.blkCatchMaxDistM')).toBe(BLK.CATCH_MAX_DIST);
    expect(def('hoops.blkSpikeMaxAngleDeg')).toBe(BLK.SPIKE_MAX_ANGLE);
    expect(def('hoops.blkPinGlassMaxM')).toBe(BLK.PIN_GLASS_MAX);
    expect(def('hoops.blkFoulAngleDeg')).toBe(BLK.FOUL_BAD_ANGLE_DEG);
    expect(def('hoops.blkFoulAnglePct')).toBe(BLK.FOUL_BAD_ANGLE_PCT);
    expect(def('hoops.blkFoulHardGapPct')).toBe(BLK.FOUL_HARD_GAP_PCT);
    expect(def('hoops.blkFoulStandoffPct')).toBe(BLK.FOUL_STANDOFF_PCT);
    expect(def('hoops.blkFoulLateMarginMs')).toBe(BLK.FOUL_LATE_MARGIN_MS);
    expect(def('hoops.blkFoulLatePct')).toBe(BLK.FOUL_LATE_PCT);
    expect([BLK.FOUL_BAD_ANGLE_PCT, BLK.FOUL_HARD_GAP_PCT, BLK.FOUL_STANDOFF_PCT, BLK.FOUL_LATE_PCT]).toEqual([0.25, 0.5, 0.15, 0.35]);
    // hoops-reverse (group "Hoops · movement"): #311's H3a stick, every default the release value — test changed (hoops-p01): five rows'
    // defaults are now the 1v1 / 3v3 handler's TUNED values (H3a's own), pinned below; the release constants stay (the dunk approach's)
    expect(def('hoops.jogTau')).toBe(HANDLER_JOG_TAU);
    expect(def('hoops.sprintTau')).toBe(HOOPS_SPRINT_TAU);
    expect(def('hoops.jogAccel')).toBe(HANDLER_JOG_ACCEL);
    expect(def('hoops.sprintAccel')).toBe(HOOPS_SPRINT_ACCEL);
    expect(def('hoops.loadScale')).toBe(HANDLER_LOAD_SCALE);
    expect(def('hoops.gearDownDecel')).toBe(HOOPS_GEAR_DOWN_DECEL);
    expect(def('hoops.stopDecelLow')).toBe(HANDLER_STOP_DECEL_LOW);
    expect(def('hoops.stopDecelHigh')).toBe(HANDLER_STOP_DECEL_HIGH);
    expect(def('hoops.plantDecel')).toBe(HOOPS_PLANT_DECEL);
    expect(def('hoops.handlerTurnDeg')).toBe(HOOPS_HANDLER_TURN_DEG);
    expect(def('hoops.turnTrueArc')).toBe(HOOPS_TURN_TRUE_ARC);
    expect(def('hoops.kickSec')).toBe(HOOPS_KICK_SEC);
    expect(def('hoops.cutSec')).toBe(HOOPS_CUT_SEC);
    expect(def('hoops.jerk')).toBe(HOOPS_JERK);
    expect(def('hoops.reverseDeg')).toBe(HOOPS_REVERSE_DEG);
    expect(def('hoops.reverseDecel')).toBe(HOOPS_REVERSE_DECEL);
    expect([HOOPS_JOG_TAU, HOOPS_SPRINT_TAU, HOOPS_JOG_ACCEL, HOOPS_SPRINT_ACCEL, HOOPS_LOAD_SCALE, HOOPS_GEAR_DOWN_DECEL, HOOPS_STOP_DECEL_LOW, HOOPS_STOP_DECEL_HIGH,
      HOOPS_PLANT_DECEL, HOOPS_HANDLER_TURN_DEG, HOOPS_TURN_TRUE_ARC, HOOPS_KICK_SEC, HOOPS_CUT_SEC, HOOPS_JERK, HOOPS_REVERSE_DEG, HOOPS_REVERSE_DECEL])
      .toEqual([0.17, 0.15, 15, 24, 0.45, 9, 22, 11, 47.6, 540, 0, 0, 0, 0, 135, 47.6]);
    // hoops-p01: the handler's TUNED stop / launch (H3a's) and the three new answers
    expect([HANDLER_JOG_TAU, HANDLER_JOG_ACCEL, HANDLER_LOAD_SCALE, HANDLER_STOP_DECEL_LOW, HANDLER_STOP_DECEL_HIGH]).toEqual([0.1, 22, 0.7, 32, 26]);
    expect(def('hoops.firstStepMps')).toBe(HANDLER_FIRST_STEP_MPS);
    expect(def('hoops.reversePlantHold')).toBe(HANDLER_REVERSE_PLANT_HOLD);
    expect(def('hoops.reverseLaunchSec')).toBe(HANDLER_REVERSE_LAUNCH_SEC);
    expect([HANDLER_FIRST_STEP_MPS, HANDLER_REVERSE_PLANT_HOLD, HANDLER_REVERSE_LAUNCH_SEC]).toEqual([0.3, 0, 0.2]);
    expect(def('hoops.retreatSpeedK')).toBe(HOOPS_RETREAT_SPEED_K);   // TUNED (new), owner 2026-10-24
    expect(HOOPS_RETREAT_SPEED_K).toBe(0.7);
    // hoops-overtime (new: PR #268's 30 s)
    expect(def('hoops.overtime3v3Sec')).toBe(OVERTIME_3V3_SEC);
    expect(def('dunk.oopLobFlightSec')).toBe(OOP_LOB_FLIGHT_SEC);   // dunk-flagship (new)
    expect(def('dunk.oopLateCatchClipT')).toBe(OOP_LATE_CATCH_CLIP_T); // dunk-flagship Phase 3 (new)
    expect(def('dunk.realJumpPersonal')).toBe(REAL_JUMP_PERSONAL);     // dunk-flagship Phase 5 (new, off)
    expect(REAL_JUMP_PERSONAL).toBe(0);
    expect(def('dunk.runwayStrideScale')).toBe(RUNWAY_STRIDE_SCALE); // dunk-flagship (new, default = the shipped pace)
    expect(def('dunk.slamHitStopBigMs')).toBe(SLAM_HITSTOP_BIG_MS);  // dunk-flagship TUNED (new; every make was 70)
    expect(def('dunk.slamShakeBig')).toBe(SLAM_SHAKE_BIG);
    expect(def('dunk.landLeadSec')).toBe(LAND_LEAD_SEC);             // dunk-flagship Phase 2 (new)           // dunk-flagship TUNED (new; every make was 0.12)
    expect(OVERTIME_3V3_SEC).toBe(30);
  });

  it('every row is well formed: unique `<area>.<camelName>` id, min ≤ default ≤ max, the default on the step grid, a source', () => {
    expect(new Set(FEEL_KNOBS.map((k) => k.id)).size).toBe(FEEL_KNOBS.length);
    for (const k of FEEL_KNOBS) {
      expect(k.id, k.id).toMatch(/^[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/);
      expect(k.min, k.id).toBeLessThan(k.max);
      expect(k.def, k.id).toBeGreaterThanOrEqual(k.min);
      expect(k.def, k.id).toBeLessThanOrEqual(k.max);
      expect(k.step, k.id).toBeGreaterThan(0);
      expect(clampKnob(k, k.def), k.id).toBe(k.def);
      expect(k.source, k.id).toMatch(/^lib\/\S+\.ts [A-Z][A-Z0-9_]+$/);
      expect(k.label.length, k.id).toBeGreaterThan(0);
    }
  });

  it('each row\'s `source` names a real file that exports that constant', () => {
    for (const k of FEEL_KNOBS) {
      const [file, name] = k.source.split(' ');
      expect(readFileSync(file, 'utf8'), k.id).toMatch(new RegExp(`export const ${name} = `));
    }
  });

  it('every knob is read through feel() somewhere in lib/, and every feel(\'…\') read names a registered knob', () => {
    const reads = new Set<string>();
    for (const f of tsFiles('lib')) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\bfeel\('([^']+)'/g)) reads.add(m[1]);
    }
    for (const k of FEEL_KNOBS) expect(reads.has(k.id), `${k.id} is never read`).toBe(true);
    for (const id of reads) expect(FEEL_KNOB_BY_ID.has(id), `feel('${id}') is not in the catalogue`).toBe(true);
  });

  it('clampKnob: finite numbers only, inside the bounds, on the grid', () => {
    const k = FEEL_KNOB_BY_ID.get('hoops.aiHandRangeM')!;
    expect(clampKnob(k, 2.43)).toBe(2.45);
    expect(clampKnob(k, -1)).toBe(k.min);
    expect(clampKnob(k, 1e9)).toBe(k.max);
    expect(clampKnob(k, Number.POSITIVE_INFINITY)).toBeNull();
    expect(clampKnob(k, '3')).toBeNull();
    expect(stepDecimals(0.05)).toBe(2);
    expect(stepDecimals(0.001)).toBe(3);
    expect(stepDecimals(1)).toBe(0);
  });
});
