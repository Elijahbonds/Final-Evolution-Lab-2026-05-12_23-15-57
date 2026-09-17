// OneVOneMode v3 — REPLACES the M52 file. The comprehensive upgrade: 1v1
// becomes a full TWO-WAY game with a real ball. Everything from v2 is kept
// (momentum, make-it-take-it, ankle-breakers, body collision, shot variety,
// FIRST TO 11) and four systems land on top:
//   THE BALL FLIES — every jump shot arcs from the release hand to the rim
//     (ShotArc): makes drop through the net, misses clang off the iron and
//     bounce live for the rebound race. No more teleporting results.
//   DRIVE DUNKS — attack the rim at speed with turbo in the tank and the
//     shot button THROWS IT DOWN instead of raising a meter. Do it through
//     a defender parked in the lane and it's a POSTERIZE attempt: flush it
//     and they're on the floor ("POSTERIZED!"), big momentum; get stuffed
//     by the contest and it's a live-ball miss.
//   TURBO — sprint is a resource (drains/regens, re-arms at 25%). Gates
//     dunks so they're earned. HUD shows the tank.
//   REAL DEFENSE — lose the ball (miss + their rebound, a strip, their make
//     under make-it-take-it) and the rival CHECKS UP at the top and DRIVES;
//     you defend. Stay in front and they have to sidestep (the ball crosses
//     over — poke STEAL on it); hold them in front and they pull up from
//     range; time a BLOCK jump (A) on their gather to erase the shot. Your
//     positioning drives their make% exactly like theirs drives yours.
//
// BIOMECH-HOOPS-WAVE1 (2026-09-08) — the dunk contest's body control, ported (SPEC-BIOMECH-HOOPS-WAVE1 G1–G6):
//   G1 facing — a defender's chest stays ON the handler through the slide (both bodies faced their TRAVEL while the slide
//       clip moved them sideways: a sideways-shuffling run); the shooter squares to the rim through the meter, the dunker
//       through the flight (both kept the last dribble heading); every turn is a slew (Biomech.slewYaw), never a snap.
//   G2/G5 — the shared Posture Poses layer (anim/PostureLayer, the dunk's) on BOTH bodies: thoracic / clavicles / head /
//       feet per hoops window (core/HoopsPosture), the chest aimed at the rim (offense) or the handler (defense), the eyes
//       on the iron / the ball; the follow-through is an authored beat held until the arc resolves (the hold used to
//       release 420 ms in and drop into the defensive stance mid-arc); a make celebrates; feet-down after a dunk is the
//       land crouch.
//   G3/G6 — the drive dunk's slam resolves at the IRON (k 0.55 of the flight, the hand at the rim), the make flushes the
//       ball through the net and the miss clanks off the front; it used to release the ball on the feet-down frame from
//       a hand at hip height and leave it floating there until the reset.
//   G4 — a block jump outside the gather says so (JUMPED EARLY), the way the whiffed reach already did.
//
// HOOPS-MOVE-KIT-A (2026-09-08) — the owner's eye: "is the 1-dribble pull-up natural? does a contested drive dunk feel body
// contact? real layups?" (SPEC-HOOPS-MOVE-KIT M1–M3, the pure rules in core/HoopsMoves):
//   M1 the player's shot had NO GATHER — the squeeze stopped the feet on the frame (driveBody skipped while `shooting`) and
//      the jumpshot rose from wherever the body was, at whatever speed (the teleport shot). Now a moving squeeze is a
//      PULL-UP: the plant bleeds the speed over 0.2–0.34 s (≤ 1 m of travel) on the authored gather clip, the ball into both
//      hands, then the rise; a set body rises at once; contested with the stick pulled off the rim it is a STEP-BACK (the
//      rival's own). The meter runs THROUGH the gather (ShotMeter.start(…, gatherSec)): the green is the clip's release frame.
//   M2 the drive dunk's contest was a make% rolled at the squeeze and a scripted parabola THROUGH the defender. Now the
//      contest is a BODY in the flight path (contestDrive): the bump fires where the flying root meets him — hit-stop micro,
//      thud, the flight clock slows (the velocity kill), he is shoved or (a made poster) put on the floor RIGHT THERE; a set
//      body squarely in the lane is a harder finish than a late one. A foul-speed hit on the airborne body (the ContactSystem
//      now knows who is airborne) is an AND-ONE on a make / the ball back on a miss — it used to reset the possession mid-flight.
//   M3 a layup METERED ON THE JUMPSHOT and finished on the dunk launch clip (a two-arm sweep through a T); a floater was a
//      jumper. Now a layup is gathered on the side the drive comes from (left / right authored finishes, the ball in that
//      hand), paced so the top of the hop is the green, a real hop to feet-down; the floater is its own clip on the soft arc.
//
// HOOPS-MOVE-KIT-A amendment (2026-09-08) — the DEFENSE contest package (core/HoopsDefense, D1–D3). The owner: "defense
// must block dunks, shots and layups; strip the ball easier during body collisions; contest without jumping."
//   D1 BLOCK — the rival never blocked anything and never dunked (nothing to swat). Now the AI puts a hand up on my load
//      (aiHandsUp) or jumps to block timed to my green, and blocks a layup / jumper / dunk at the release by aiBlockChance
//      (a hand up inside range, more when set); the ball is knocked LOOSE from my hand (BLOCKED! / SWATTED AT THE RIM!). The
//      rival DUNKS a lane he has beaten (a blow-by: AttackerBrain 'dunk') — a real flight I can SWAT with a timed jump inside
//      range while he is in the air (jumpSwats: REJECTED AT THE RIM!), or take a poster on if he makes it through me.
//   D2 STRIP — a hard body contact opens a 0.4 s window in which the ball is loose in the hands: my poke connects inside it
//      whatever the crossover read says (bumpExposure), and a set AI defender I run into strips me on his roll (aiBumpStrips).
//      A strip knocks the ball LOOSE from the palm (stripBall / the loose ball) — it used to warp the possession to the check.
//   D3 CONTEST NO-JUMP — X HELD is a grounded hand-up (bball_hand_up, verticality): inside 1.6 m facing the shooter it adds
//      contest (groundContest) to the rival's release, and the AI's hand-up adds it to mine; the contest now bites the make
//      chance itself (contestedPct — it used to narrow only the meter) and a strong one ALTERS the release (a higher arc).
//
// ONEVONE-DEFENSE-LOGIC (2026-09-07) — the owner's eye: "we can't play defense, the logic is kinda off, the animations
// need work". Measured on /dev/mode/onevone with a fake pad driving the deny point (scripts/probes/_onevone-defense-probe.mts):
//   (1) the rival's possession was a 2.2 s TIMER (x = sin(t) weave, z lerped to the rim) that ignored the defender — in
//       front of the drive 30–63 % of the frames, the rival still released 0.77–0.86 m from the rim every time; there was
//       no gather, so a block cue never existed (0 A presses on cue in 8 possessions); the poke was a timer read too
//       (exposure = |cos(2.1 t)|) and was 1.0 at t = 0 — a strip was answered by a counter-strip 0.10 s later, 4 of 4;
//   (2) after that steal the ball WARPED BACK TO THE RIVAL: the rival's live dribble (foeCarry) deactivated a frame after
//       the hand-off and, seeing the ball un-parented and un-released, re-attached it to the rival's palm — the
//       "PICKED THEIR POCKET!" banner was followed by "STRIPPED" 1.3 s later and the ball spent that second at
//       (3, 2.6, −2); their miss was ALWAYS "YOUR BOARD" (the race only ran on my possession); their make handed ME the
//       ball (loser's ball, not make-it-take-it); the defence watchdog of the previous possession fired into the next one
//       and forced a release 1.1 s in; the loose ball only stepped on my possession; every foul-speed contact on defence
//       was "FOUL ON YOU" because ContactEvent.a was always the first body added;
//   (3) three owners played the hero's rig (the tree, the A-press jump chain to idle_stand, the shot / dunk plays) and
//       two the rival's (the per-frame run / idle play cut every hit react to a frame; the jumpshot's onEnd chain);
//       the hero's steal had no reach, the block was jump_up → idle_stand, the defensive slide always went left.
// Now: AttackerBrain (BasketballCore) drives the rival — check, drive, sidestep when contained, gather telegraph, blow-by
// on a whiff / an early jump, pull-up when held in front; BasketballAnimTree is the ONE owner of both bodies (beats /
// holds, cut callbacks ignored); giveBall() hands the ball over with both carries off; possessionToken guards every
// timer; make-it-take-it both ways; the board is a race on both ends; the loose ball always steps.

import { nerve, standingOf } from '../core/Nerve';
import { tickScuff, scuffPuffScale, scuffVolume, SCUFF_IDLE, type ScuffState } from '../core/ScuffFx';
import { MeshBuilder, Quaternion, TransformNode as BABYLON_TransformNode, Vector3 } from '@babylonjs/core';
import { dressBall } from '../visual/meshyProps';
import type { AbstractMesh, TransformNode } from '@babylonjs/core';
import { type SpawnedCharacter } from '../core/CharacterLibrary';
import { CharacterPipeline } from '../core/characterPipeline';   // suite pass: the sanctioned spawn paths (identity for the player, roster variety for the rival)
import { tintGarmentSlot, SLOT_KEYS } from '../core/playerIdentity';   // …and the rival's jersey
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { VenueKit } from '../visual/VenueKit';
import { applyOceanCourt } from '../visual/CourtSurface';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';  // M74
import { BallSim } from '../core/BallPhysics';
import { resolveRim, forcedMissProfile } from '../core/RimPhysics';              // the miss meets the iron it earned
import { inStance, stanceWish } from '../core/DefensiveStance';   // the slide was cosmetic until now
import { judge, rule, isGoaltending, paintClock, THREE_SECOND_LIMIT, possessionAfterScore, type ScoringFormat } from '../core/Ref';   // the rules live in the handbook, not in here
import {
  CHAIN_IDLE, BASELINE_HANDLE, pushChain, tickChain, tightness, moveFromContext, gathersIntoShot,
  resolveHandleMove, SHAKE_RANGE, OFF_THE_HEAD_RANGE, offTheHeadOdds, offTheHeadLoose, moveImpulse,
  moveClip, ANKLE_STUMBLE_CLIP, ANKLE_SLIP_CLIP,
  // bodyRight lives in HoopsMoves with the rest of the body-frame helpers
  type ChainState, type HandleMove,
} from '../core/HandleSystem';   // Street chains x 2K brakes, gated on the handle the PRQ scan earned
import {
  THREAT_IDLE, inTripleThreat, isJabInput, jabBiteOdds, canJab, throwJab, tickThreat, jabBurst,
  type ThreatState,
} from '../core/TripleThreat';   // the stance the half-court game starts from
import {
  dunkKindFor, isContactDunk, posterPlant, posterFall, contactBanner, contactHitStopMs, POSTER_RELEASE_K,
} from '../core/ContactDunk';   // dunked ON, not dunked beside
import { ballVsBodies, resolvePickup, bobbleVelocity, boardOutcome, ballOutOfPlay, HOOPS_BALL_BOUNDS, type BodyRef } from '../core/LooseBall';   // and somebody has to go and get it
import { attachBallToHand, releaseBall, clankOffRim } from '../anim/ballRig';
import { startFlush, stepFlush, type FlushState } from '../core/RimFlush';   // DUNK-FANATIC (2026-09-17): the contest's flush — over the lip, down the axis, out of the net — on the game's dunks
import { RIM_RADIUS } from '../core/RimPhysics';
import { NET_EXIT_MPS, NET_DROP_NUDGE } from '../core/NetExit';
import { mountPostureLayer, type PostureLayer } from '../anim/PostureLayer';   // BIOMECH-HOOPS-WAVE1: the dunk's Posture Poses, shared
import { BodyMotion, dynamicPose } from '../core/DynamicPosture';   // the body answers its MOTION, not just its state
import { hoopsPose, HOOPS_INPUT_IDLE, RELEASE_SEC, LAND_SEC, CELEBRATE_SEC, type HoopsPostureInput, type ShotWindow } from '../core/HoopsPosture';
import { slewYaw, yawTo, playFacing, DRIVE_DUNK, driveDunkY } from '../core/Biomech';
import { PlayerSlot, LocalInputSource, AISource } from '../core/PlayerSlot';
import { attachNetplay, type NetplayHandle } from '../../net/attach';   // opt-in: ?net=<room>, same shape as ?agent=1
import { AgentControlSource } from '../core/AgentControlSource';  // M69: intent play under ?agent=1
import { agentBridge } from '../core/AgentBridge';
import {
  DribbleController, ShotMeter, DefenderBrain, contestLevel, clampToHalfCourt, isThree,
  resolveBodyCollision, classifyShot, ANKLE_BREAK_STUN_SEC,
  TurboMeter, ShotArc, checkDriveDunk, checkBlock, BLOCK_RANGE, DUNK_PCT,
  STEAL_EXPOSURE_MIN, AttackerBrain, RIVAL_DRIVE_SPEED, rivalShotPct, handUpContest, distXZ, HAND_UP_SEC,
  SHOT_QUALITY_PCT, type ShotQuality, type ShotContext, type PostShot, type ShotStyle, BODY_STANDOFF } from '../core/BasketballCore';
import { DribbleStateMachine, syncedShotSpeed, RELEASE_FRAME_01 } from '../core/BallHandling';
import { releaseFrameOf } from '../anim/opponentMotion';   // HOOPS MOVEMENT: the release frame of the clip that plays
import { refuse } from '../core/Refusal';   // MECHANICS PASS: a press that cannot act is answered
import { ContactSystem, HARD_CONTACT_SPEED, FOUL_CLOSING_SPEED } from '../core/ContactSystem';
import { pickHoopsDunk, dunkSpeedRatio } from '../core/HoopsDunks';
import { trickFromFlick, trickWindow, judgeFlick, trickPct, STICK_TRICK, CONTACT_TRICK_BONUS } from '../core/DunkTrickStick';
import {   // HOOPS-MOVE-KIT-A (2026-09-08): the gather, the finish kit, the drive contest
  planGather, gatherWish, gatherLabel, gatherTravel, stickBack01, STEPBACK_STICK_BACK_MIN, type GatherPlan,
  pickLayupSide, planFinish, finishHopY, finishStride, FINISH_LABEL, type FinishPlan, type FinishStyle,
  contestDrive, bumpShove, BUMP_SLOW, BUMP_SLOW_SEC, type DriveContest, bodyRight } from '../core/HoopsMoves';
import {   // HOOPS-MOVE-KIT-B (2026-09-08): the post kit — M4 the fade, M5 the hook, M6 the spin
  canPostUp, postYaw, postWish, postFadeAway, POST_FADE_STICK_MIN, fadeDrift,
  pickHookSide, hookShield,
  planSpin, spinYaw, spinPos, spinOffContact, postSpinSide, SPIN_ARM_SEC, SPIN_BEAT_K, SPIN_EXIT_SPEED, SPIN_STUN_SEC, SPIN_TRIGGER_RANGE, SPIN_COOLDOWN_SEC, type SpinPlan,
} from '../core/HoopsMoves';
import {   // HOOPS-MOVE-KIT-B wave 2 (2026-09-08): M7 the running hook, M8 the pump + step-through, M9 the pivot,
  // M10 the floater over length, M11 the reverse, M12 the glass, M13 the hop step, M14 the euro
  runningHook, HOOK_ON_ME, isPumpFake, planStepThrough, PUMP_MAX_SEC, STEP_THROUGH_SEC, PUMP_BITE_RANGE, PUMP_BITE_CHANCE, PUMP_BITE_STUN,
  pivotFrom, planPivot, PIVOT_MAX_SPEED,
  rimProtected, isReverseFinish, reverseSide,
  inBankBand, bankPoint, BANK_PCT_BONUS,
  planHopStep, HOP_RANGE, planEuro, euroSell, euroAvailable,
} from '../core/HoopsMoves';
import {   // HOOPS-MOVE-KIT-A amendment (D1–D3): the defense contest package
  groundContest, aiBlockChance, bumpExposure, aiBumpStrips, jumpSwats, contestedPct, alteredApex, aiHandsUp, facingCos,
  AI_BLOCK_JUMP_CHANCE, AI_BLOCK_RANGE,
} from '../core/HoopsDefense';
import { BOX_OUT_RANGE } from '../core/HoopsOffball';   // HOOPS-MOVE-KIT-A O2: the rival boxes me out on my shot
import { MomentumBus } from '../core/MomentumBus';
import { BasketballAnimTree, FootPlant } from '../anim/basketballTree';
import { mountBallCarry, type BallCarry } from '../anim/ballCarry';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit, applyTrail, type TrailLevel } from '../visual/EffectsKit';
import { retreatFor, closeoutFor } from '../anim/basketballTree';   // DEFENSE-LOOK (2026-09-17)
import { mountPlayerRing, type PlayerRingHandle } from '../visual/PlayerRing';   // PLAYER RING (2026-09-17): stamina at the feet, the creator glyph over the head
import { readPlayerIcon } from '../visual/playerIcon';
import { netExitVelocity, netExitKindOf, netExitMph, type NetExitKind } from '../core/NetExit';   // NET EXIT (2026-09-17)
import { showtimeAsked, pickShowtime, judgeShowtime, showtimeMeterT, posterRide, SHOWTIME_FLIGHT_MS, SHOWTIME_HANG_FROM, SHOWTIME_HANG_TO, SHOWTIME_HANG_SCALE, SHOWTIME_DEADLINE_K, SHOWTIME_PCT, POSTER_RIDE_SHARE } from '../core/ShowtimeDunk';   // SHOWTIME (2026-09-17)
import type { ParticleSystem } from '@babylonjs/core';   // suite pass: the hot hand's shot trails (the dunk contest's ball trail, on the game)
import { HoopJuice } from '../visual/HoopJuice';   // A+ P0: the hoop answers the make (shared with Dunk; Meshy never scaled)
import { assertSpawned } from '../core/FrameGuard';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { DUNK_CONFIG as SHARED_CFG } from './modeConfigs';

/** Exported so hoop-alignment-tests can check it against the venue's hoop. */
export const RIM = new Vector3(0, 3.05, -0.6);
/** The rim's point on the floor — what a drive's range is measured against (see the checkDriveDunk call). */
const RIM_FLOOR = new Vector3(RIM.x, 0, RIM.z);
/** HOOPS-MOVE-KIT-B M12: the backboard hangs behind the ring and faces the court (+z) — the square's own direction. */
const BOARD_NORMAL = new Vector3(0, 0, 1);
const TARGET_SCORE = 11;
/**
 * Score and you keep it — classic 1-on-1, both ways.
 *
 * DECLARED alongside 3v3's `alternating` (FIBA 3x3), because the two modes answering the most basic
 * question in a half-court game differently used to be an accident of where each one happened to call
 * `startDefense` / `opponentPossession`, rather than a decision. The ref answers it now.
 */
const FORMAT: ScoringFormat = 'make_it_take_it';
// FORMAT FIX: scoring used to be "1pt inside a 4.2-unit paint radius, 2pts
// anywhere past it, no matter how far" — a made shot was never worth 3, and
// a layup was worth LESS than a jumper, which is backwards from every real
// basketball convention (NBA 2K's stated benchmark included). Paint and
// mid-range shots are both a normal 2, and only shots beyond a real
// 3-point arc distance score 3 — reachable inside the mode's half-court
// movement bounds (clampToHalfCourt goes out to depth 14.5, width 7.2).
// The arc is NOT a circle. This was a flat 6.7m radius — the same mistake 3PT
// shipped as its D1 and 3v3 repeated, all three independently, because the real
// line lived inside ThreePointMode instead of the shared basketball core. It is
// 6.71m in the corners and 7.24m at the top, and that gap is the shot selection.
// isThree() answers it per angle.
/** Metres of rebound advantage for holding BOX OUT — worth a body length. */
/** How long the spin's exit keeps your feet set for a shot. Short: it is a reward for the move, not a
 *  free permanent gather. */
const SPIN_GATHER_SEC = 0.45;

/** The paint, as a floor radius from the ring — the ref's three-second clock runs inside it.
 *  A real key is ~4.9 m deep and 4.9 m wide measured from the baseline, so the ring sits well inside it;
 *  2.6 m was tighter than any actual lane and a defender's body denies that ground anyway (measured: a
 *  handler walking at the ring was held at 3.19 m and never entered). 3.6 m is the honest half-court key. */
const PAINT_RADIUS = 3.6;
const BOX_OUT_EDGE = 1.6;
/** How much a board is decided by the bounce rather than by position. */
const REBOUND_JITTER = 2.6;
/** My possession: I take it back to the top, the rival sets 3 m in. */
const MY_SPAWN = new Vector3(0, 0, 5), FOE_SPAWN = new Vector3(0, 0, 2);
/** Their possession: the CHECK. The rival checks up beyond the arc (top 7.24 m → z 6.64); I set 2 m inside him. */
const CHECK_FOE = new Vector3(0, 0, 9.2), CHECK_ME = new Vector3(0, 0, 7.2);
/** A poke's reach. Body collision holds two players ~1.1 m apart; 1.2 sat ON the standoff and flickered. */
/** The lines themselves — the same box clampToHalfCourt holds bodies inside. */
const COURT_HALF_WIDTH = 7.2, COURT_DEPTH = 14.5;
/** How close to the line counts as ON it (the clamp parks you exactly there, so this is a touch of slack). */
const OOB_EPSILON = 0.08;
/** …and how long you have to keep pushing at it before it is a call, so a bump into the line is not a turnover. */
const OOB_GRACE_SEC = 0.35;
const STEAL_RANGE = 1.6;
/** How long the feet have to be planted before a charge can be drawn — a charge is arriving early, not colliding. */
/** A reach that ARRIVES on the handler at this speed is a foul; slower than this it is a whiff at thin air. */
const REACH_FOUL_SPEED = 1.6;
const CHARGE_SET_SEC = 0.18;
/**
 * Inside this of a planted defender is CONTACT; past it he went round you.
 *
 * Anchored to BODY_STANDOFF rather than picked: two bodies cannot be closer than 1.10 m (resolveBodyCollision
 * pushes them apart at radius*2), so the old 1.15 asked for a gap the physics forbids — measured live, a plant
 * held for 7.7 s never saw the driver inside 1.30 m and no charge was ever drawn. "He arrived at the body you
 * planted" is a chest-to-chest arrival at the standoff, plus room for the frame he arrives on.
 */
const CHARGE_RANGE = BODY_STANDOFF + 0.5;
const REACH_COOLDOWN_SEC = 0.4;          // a reach is a commitment, not a mash
const REACH_WHIFF_STUN_SEC = 0.45;       // a whiffed reach costs your feet
const JUMP_SEC = 0.75;                   // the contest jump's clock (physics lands the body)
const STANDING_GATHER_MS = 220;          // DEFENSE-LOOK: the two-foot squat before a standing dunk's flight
const JUMP_VY = 3.0;                     // m/s — ~0.46 m apex, 0.6 s of air
const JUMPER_HOP_APEX = 0.30;            // DEFENSE-LOOK: a jump shot leaves the floor — the root rides this arc through the rise and lands after the release
/** BIOMECH-HOOPS-WAVE1: the facing slew (rad/s) — a turn, never a snap; the shooter / dunker eases onto the rim at this rate. */
const FACE_RATE = 10, FACE_RIM_RATE = 6;
/** A defender inside this range of the handler keeps his chest on him (beyond it he runs to his spot, facing the travel). */
const DEFEND_FACE_RANGE = 6;
// "SPRINT in to DUNK, ease off to LAY IT IN" is the one line this hint was missing, and the fix that made the layup
// reachable (see the checkDriveDunk call) is worth nothing if nobody is told the choice exists.
const HINT_OFFENCE = 'HOLD R2 (SHIFT) + a direction to SPRINT · R2 + SQUARE (SHIFT + L) at the rim = DUNK, SQUARE (L) alone = LAY IT IN · SQUARE (L): hold, release in the green · L2 (F): POST UP · snap the stick for ankles · pull BACK for a HESI · hold L1 (Q)/LT near the block to POST UP (back to the rim: shoot for a HOOK, pull off the rim for a FADEAWAY, swing the stick across to SPIN) · drive into a body to SPIN off him';
const HINT_DEFENCE = 'STAY IN FRONT — they sidestep, you slide · HOLD L2 (F): SIT DOWN and slide faster · SQUARE (L): STEAL as the ball crosses over (hold it for a HAND UP) · TRIANGLE (I): jump on the gather to BLOCK · HOLD CIRCLE (K): plant and TAKE THE CHARGE · L1: BOX OUT';

type Possession = 'mine' | 'defense';
/** Their possession: the check, the drive (incl. sidestep / blow-by / gather), the shot in the air, over. */
type DefensePhase = 'check' | 'drive' | 'shot' | 'over';

export const OneVOneMode: ModeDefinition = (() => {
  let me: SpawnedCharacter, foe: SpawnedCharacter, ball: AbstractMesh, ballSim: BallSim;
  let onevoneVenue: VenueHandle | null = null;  // M74
  let meSlot: PlayerSlot, foeSlot: PlayerSlot, localSource: LocalInputSource;
  /** Null unless ?net=<room> and NEXT_PUBLIC_NETD_URL are both present. */
  let net: NetplayHandle | null = null;
  let meDribble: DribbleController;
  let meDribbleSM: DribbleStateMachine;
  let meAnimTree: BasketballAnimTree, foeAnimTree: BasketballAnimTree;
  let meFootPlant: FootPlant;
  let meCarry: BallCarry | null = null, foeCarry: BallCarry | null = null;   // live dribble (ball off the palm)
  let wasPlanting = false;
  let shotMeter: ShotMeter;
  let turbo: TurboMeter;
  // MECHANICS PASS (2026-09-15): TURBO (RT) was silent half the time — held while standing still or with an empty tank, the
  // body simply did not sprint. The press edge is answered with why.
  let sprintWas = false;
  function answerSprint(ctx: ModeContext, sprint: boolean, moving: boolean): void {
    if (sprint && !sprintWas) {
      // (sprint is the stick pushed past 0.85 — PlayerSlot — so the edge is a full push, not a button; only the empty tank needs words)
      if (turbo.t01 < 0.05) refuse(ctx, 'TURBO EMPTY');
      else if (!moving) refuse(ctx, 'TURBO NEEDS A DIRECTION');
    }
    sprintWas = sprint;
  }
  let arc: ShotArc;
  let arcPoints = 0, arcLabel = '';
  let myScore = 0, foeScore = 0, momentum = 0;
  let shotTrail: ParticleSystem | null = null; let shotTrailLevel: TrailLevel = 'off';   // suite pass: the hot hand's shot trail
  let mbus = new MomentumBus();               // Phase 6: shared Game-Breaker
  /** Report a highlight and mirror the bus into the HUD momentum meter. */
  function swing(kind: Parameters<MomentumBus['report']>[0]['kind']): void {
    mbus.report({ kind });
    momentum = Math.round(mbus.score01 * 100);
  }
  let possession: Possession = 'mine';
  /** Bumped on every possession change — every timer that changes possession checks it (a stale watchdog used to force
   *  the NEXT possession's release 1.1 s in). */
  let possessionToken = 0;
  let carrying = true, shooting = false, dunking = false;
  /** The ball is live on the floor (a miss, a block) — BallSim owns it, whoever's possession it is. */
  let loose = false;
  /** What the shot earned, recorded at the RELEASE so the iron can answer it when the arc arrives. */
  let shotMiss: { quality01: number; short: number; lateral: number } | null = null;
  /** A live board: the ball is off the iron and nobody has secured it. Bodies must go and get it. */
  let board: { age: number; contestedCalled: boolean; shooter: 'mine' | 'defense' } | null = null;
  /** Seconds I have been standing in the paint with the ball — the ref's three-second clock. */
  let paintSec = 0;
  /** The ball's height last frame, so the ref can tell a ball on the way UP from one on the way DOWN. */
  let prevBallY = 0;
  /** One goaltending call per shot — the test is true for many frames of one falling ball. */
  let goaltendCalled = false;
  let paintWarned = false;   // dev-only: the warning logs once per trip into the paint
  let ended = false;
  let foeStunSec = 0;
  /** The rival is on the floor (posterized) — held there by the tree until the stun ends. */
  let foeFloored = false;
  let lookX = 0, lookY = 0;   // R stick → camera look (MODE-STICK-FACE family, 2026-09-07)
  let currentShot: ShotContext | null = null;
  /** Contest level at shot start — kept so the RESULT banner can say why. */
  let shotContest = 0;
  /** Contest level on the RIVAL's release — so their makes grade your D. */
  let defContest = 0;
  /** Defender's closing speed toward the handler (m/s) — a SET defender
   *  doesn't bite on a hesi; only one running at you does. */
  let foeClosingSpeed = 0;
  /** Decaying memory of that closing speed — a defender who JUST sprinted at
   *  you is on their heels for about a second after they arrive. That's the
   *  real 2K bite window: measured live, a press closes in ~0.35s and a pure
   *  "currently closing" test expired before a human (or driver) could pull
   *  the stick. */
  let foeCloseMemory = 0;
  // defense phase state
  let defPhase: DefensePhase = 'over';
  const attacker = new AttackerBrain();
  /** Push the scoreboard into the rival's shot selection. Called wherever a possession starts. */
  const nerveTheAttacker = (): void => { attacker.patience = 1 / Math.max(0.5, nerve(rivalStanding()).aggression); };
  let gatherShown = false, stepbackShown = false;
  let myJumpAge = Infinity;
  let dunkLabel = '';            // which dunk the drive earned (HoopsDunks) — the banner names it when it lands
  let oobSec = 0;                // how long the carrier has been ON the line, still pushing at it
  let takingCharge = false;      // Circle held on defence — planted, waiting to wear it
  let chargeSetSec = 0;          // how long the feet have been down (a charge is arriving early, not colliding)                 // seconds since my contest jump left the floor
  let meStunSec = 0;                        // whiffed reach costs you your feet
  let reachCooldown = 0;
  /** The shot trigger's last state — the gather sound fires on the way down, once. */
  let contact: ContactSystem | null = null;      // Phase 4: Havok bodies when ready
  let hoopJuice: HoopJuice | null = null;        // A+ P0 CONTACT-lite: rim spring / net squash / hoop flash on a make
  let contactLatch = false;                      // A+ P0: the dunk's ONE punch per attempt — never re-fired by the banner or the stun
  let hud: ModeContext['setHud'] = () => {};
  // ── BIOMECH-HOOPS-WAVE1 (2026-09-08): the Posture Poses layer per body, and the hoops windows it reads ──
  let mePosture: { layer: PostureLayer; dispose(): void } | null = null, foePosture: { layer: PostureLayer; dispose(): void } | null = null;
  const meBio: HoopsPostureInput = { ...HOOPS_INPUT_IDLE }, foeBio: HoopsPostureInput = { ...HOOPS_INPUT_IDLE };
  let meShotWin: ShotWindow = 'none', meShotSec = 0, foeShotWin: ShotWindow = 'none', foeShotSec = 0;   // load (the meter / the gather) → release → follow (until the arc resolves)
  let meLandSec = 0, meCelebrateSec = 0, meSpeed01 = 0, foeSpeed01 = 0;
  let scuff: ScuffState = { ...SCUFF_IDLE };
  let dunkFlight: { k: number; made: boolean | null } | null = null;                 // the drive dunk's flight clock (the posture windows ride it)
  let dunkFlush: { releasePos: Vector3; since: number; kind: NetExitKind; st?: FlushState } | null = null;               // the make's ball through the iron (G6)
  // ── HOOPS-MOVE-KIT-A ──
  let gather: { plan: GatherPlan; t: number } | null = null;                         // M1: the jumper's gather before the rise (the body still moves)
  // HOOPS-MOVE-KIT-B: the post kit's live state — the seal I hold (M4–M6's path) and the pivot in flight (M6)
  let posting = false;
  let spin: { plan: SpinPlan; t: number; beat: boolean } | null = null;
  let spinCooldown = 0, spinArmed = 0;   // M6: a body I meet ARMS the spin; the stick swung across throws it
  /** The handle drives the vocabulary, the chain window and how tight the ball rides (HandleSystem).
   *  PRQ is not plumbed into the modes yet, so this is the baseline scan; `?handle=` overrides it so the
   *  max-handle behaviour can actually be driven and proved rather than only unit-tested. */
  let handle = BASELINE_HANDLE;
  /** What just happened in my hands, and how long ago — a chain, not a sequence of separate presses. */
  let chain: ChainState = { ...CHAIN_IDLE };
  /** Seconds left of the spin's gather window: a shot pressed inside it skips the load and rises at once. */
  let spinGather = 0;
  /** TRIPLE THREAT: the jab's clocks and how many lies he has already seen this possession. */
  let threat: ThreatState = { ...THREAT_IDLE };
  /** How long the stick has been pushed, and how hard — a TAP is a jab, a LEAN is a drive. */
  let stickHeld = 0, stickPeak = 0;
  /** The jab's burst is an impulse on the first step out of the stance, never a per-frame multiplier. */
  let burstArmed = false;
  /** Was I in the stance when this push STARTED? The jab is judged on that, not on the release frame. */
  let jabEligible = false;
  /** A body planted chest-to-chest for a contact dunk, waiting to go down at the flush. */
  let posterVictim: { kind: ReturnType<typeof dunkKindFor>; released: boolean; plant?: Vector3; fall?: Vector3; reacted?: boolean } | null = null;   // SHOWTIME: the plant and the fall line, so he rides the flight
  let showtimePress = false, showtimeCam = false;
  let camSnapPending = false;   // POLISH: a reset asks the camera to cut, not chase
  let ring: PlayerRingHandle | null = null;   // PLAYER RING: who you are, and how much turbo is left   // SHOWTIME: SQUARE in the air (raw, so a pad, a key and a probe all reach it), and whether the side camera is on
  let spinClip = 'bball_spin';           // M9: the same machinery turns a PIVOT (a shorter sweep, no travel)
  let pumpWindow = 0;                    // M8: seconds left in which a squeeze is a STEP-THROUGH (he bit the fake)
  let banked: Vector3 | null = null;     // M12: the glass point this release is routed through
  let finish: { plan: FinishPlan; t: number; released: boolean } | null = null;
  let riseHop: { t: number; dur: number } | null = null;   // DEFENSE-LOOK: the jump shot's hop (the finishes had theirs; the jumper shot flat-footed — measured from the side, feet on the floor at the release)      // M3: a layup / floater in flight (the stride, the hop, the finish clip)
  let driveContest: DriveContest | null = null;                                      // M2: the body in the dunk's path
  let finishFoul = false;                                                            // M2: fouled in the air on a dunk / a finish — and-one on a make, the ball back on a miss
  const foeVelLast = new Vector3();                                                  // the defender's velocity this frame (the contest reads set vs moving)
  const devContacts: { t: number; severity: string; closing: number; attacker: string; victim: string; attackerSpeed: number }[] = [];   // dev: the last Havok contact events (probes)
  // ── the DEFENSE contest package (D1–D3) ──
  let bumpAge = Infinity;                       // D2: seconds since the last hard body contact with the handler (the strip window)
  let meHandUp = false, foeHandUp = false, foeHandUpLeft = 0;   // D3: the grounded hand-up contests (mine held on X; the AI's on my load)
  let foeBlockJumpAge = Infinity, foeBlockAt = -1;               // D1: the AI's contest jump (timed to my green: seconds into the meter)
  let meFloored = false;                        // D1: posterized BY the rival — on the floor until the stun ends
  let foeDunkFlight: { k: number; made: boolean | null } | null = null;   // D1: the rival's dunk in the air (the posture windows ride it)
  let defenseLuck: number | null = null;        // dev: force the AI's block / strip / hand-up rolls (1 = always, 0 = never)
  const roll = (): number => defenseLuck ?? Math.random();   // dev: the roll VALUE forced (0 = every chance lands, 0.99 = none)
  /** Where the RIVAL stands, for Nerve. Lateness reads off whoever is closer to 11 — at 10-2 it is nearly over. */
  const rivalStanding = () =>
    standingOf(foeScore, myScore, TARGET_SCORE, Math.min(1, Math.max(myScore, foeScore) / TARGET_SCORE));
  let foeBrain: DefenderBrain | null = null;     // O2/O3: the rival's brain (his job / box-out readouts)
  let lastFoeJob = '';
  let foeSealing = false;                       // mirrors the brain's seal so the board can read it as real position
  let lastBumpStripAt = 0;                       // D2: one bump-strip roll per 1.5 s
  const ballWorld = (): Vector3 => ball.getAbsolutePosition();
  /** The layer's feed: the window's stance and feet, the chest on the rim (offense) or the handler (defense), the eyes on the
   *  iron (offense) or the ball (defense). */
  // DYNAMIC POSTURE. hoopsPose returns the authored stance for the window; the motion tracker says how hard the
  // body is living in it. Before this a drive at a walk and a drive at a sprint were byte-identical, and a hard
  // cut looked exactly like running straight because every authored stance is pitch-only. One tracker per body,
  // because the acceleration has to be resolved in THAT body's frame to tell a brake from a turn.
  const meMotion = new BodyMotion();
  const foeMotion = new BodyMotion();
  const feedFor = (bio: HoopsPostureInput, aim: Vector3, eyes: Vector3, motion: BodyMotion, exertion: number, airborne: boolean) => {
    const { window, pose, legs } = hoopsPose(bio);
    return { pose: dynamicPose(pose, motion.signals(bio.speed01, exertion, airborne), window), legs, aim, eyes, window };
  };
  /** Face a body the play's way, slewed: the objective inside range, else the travel, else the heading. */
  const facePlay = (root: TransformNode, vel: Vector3, objective: Vector3 | null, range: number, dt: number, rate = FACE_RATE): number => {
    const yaw = slewYaw(root.rotation.y, playFacing(root.position, vel, objective, range, root.rotation.y), rate, dt);
    face(root, yaw); return yaw;
  };

  /** MODE-STICK-FACE (2026-09-07): the stick is CAMERA-relative. The hoops camera sits behind the offence looking at the
   *  rim (−z) and Babylon is left-handed, so a raw +x intent ran to SCREEN-LEFT (the dunk runway's bug, measured here
   *  too: stick-right Δscreen −2.4 m). Up = the camera's flat forward, right = screen right, handed back to the
   *  dribble in its own stick space (+Y = −Z). AI intents never pass through here. */
  function camRel(ctx: ModeContext, mx: number, my: number): [number, number] {
    const w = ctx.camDirector.forwardFlat().scale(my).addInPlace(ctx.camDirector.rightFlat().scale(mx));
    return [w.x, -w.z];
  }
  /** Face a root by yaw. The Havok contact body writes root.rotationQuaternion every step, so an Euler yaw alone was
   *  IGNORED — the hero faced his spawn direction for the whole game (measured: facing·travel 0.2 on a strafe). With
   *  the body's pre-step enabled (ContactSystem), the quaternion written here is what the body — and the eye — keeps. */
  function face(root: TransformNode, yaw: number): void {
    root.rotation.y = yaw;
    if (root.rotationQuaternion) Quaternion.RotationYawPitchRollToRef(yaw, 0, 0, root.rotationQuaternion);
  }
  /** Body-right for a yaw (measured, MODE-STICK-FACE): which way a slide goes in the body frame. */
  function slideDirFor(yaw: number, vel: Vector3): 'left' | 'right' {
    return vel.x * Math.cos(yaw) - vel.z * Math.sin(yaw) > 0.3 ? 'right' : 'left';
  }
  function driveBody(id: string, root: TransformNode, vel: Vector3, dt: number): void {
    if (contact?.isReady) {
      // soft court bounds: kill the outward velocity component at the edge
      const p = root.position;
      const v = vel.clone();
      if ((p.x > 7.2 && v.x > 0) || (p.x < -7.2 && v.x < 0)) v.x = 0;
      if ((p.z > 14.5 && v.z > 0) || (p.z < 0.5 && v.z < 0)) v.z = 0;
      contact.drive(id, v, dt);
      // The velocity kill is soft on purpose, but an impulse (dunk flight,
      // steal knock-back, body contact) can still carry a body past the
      // baseline — measured 2026-09-02: hero at z −1.4 behind the rim, camera
      // clamped into the corner on top of him. Beyond a hand's width out,
      // put the body back on the line. Inside the box physics is untouched.
      // The dunk flight lands at RIM.z + 0.5 (z −0.1), legitimately behind the
      // z 0.5 line, and the flight itself writes the root directly — so the
      // near line is the RIM PLANE, not the play line, and nothing fires
      // mid-dunk.
      const OUT = 0.15, BEHIND_RIM = 0.5 - RIM.z;   // fires only past z −0.6
      if (!dunking && (p.x > 7.2 + OUT || p.x < -7.2 - OUT || p.z > 14.5 + OUT || p.z < 0.5 - BEHIND_RIM)) {
        const back = p.clone();
        if (!onevoneVenue?.constrain(back)) clampToHalfCourt(back, 7.2, 14.5);   // phase 3: navmesh first, box when no map
        contact.teleport(id, back);
      }
    } else {
      root.position.addInPlace(vel.scale(dt));
      if (!onevoneVenue?.constrain(root.position)) clampToHalfCourt(root.position, 7.2, 14.5);
    }
  }
  function place(id: 'me' | 'foe', root: TransformNode, pos: Vector3, yaw: number): void {
    if (contact?.isReady) contact.teleport(id, pos); else root.position.copyFrom(pos);
    face(root, yaw);
  }
  /** The ONE hand-off. Both live dribbles go off FIRST with the ball marked released, so neither hands it back to its
   *  own palm on the way out (the warp-back bug above); then the ball rides the new owner's hand. */
  function giveBall(to: 'me' | 'foe'): void {
    (ball.metadata ??= {}).felReleased = true;
    meCarry?.update(0, 0, false); foeCarry?.update(0, 0, false);
    attachBallToHand(ball, (to === 'me' ? me : foe).skeleton, 'RightHand');
    loose = false;
  }
  /** The ball leaves a hand for the floor: BallSim owns it until someone picks it up. */
  function launchLoose(from: Vector3, vel: Vector3): void {
    ballSim.launch(from, vel);
    loose = true;
  }

  const cfg = { heroUrl: SHARED_CFG.heroUrl };

  /** MY possession: I take it back to the top. (Also the reset after my make: make-it-take-it.) */
  function resetPositions(): void {
    possessionToken++;
    possession = 'mine'; carrying = true; shooting = false; dunking = false; defPhase = 'over';
    currentShot = null; myJumpAge = Infinity; meStunSec = 0; reachCooldown = 0; goaltendCalled = false; paintSec = 0;
    threat = { ...THREAT_IDLE }; stickHeld = 0; stickPeak = 0; burstArmed = false; jabEligible = false; spinGather = 0; posterVictim = null;
    meMotion.reset(); foeMotion.reset();   // a check-up moves bodies metres in a frame; that is not acceleration
    arc.active = false;
    meShotWin = 'none'; foeShotWin = 'none'; dunkFlight = null; dunkFlush = null; meLandSec = 0; meCelebrateSec = 0;   // BIOMECH-HOOPS-WAVE1
    if (gather || finish || spin || posting) meAnimTree.release();   // HOOPS-MOVE-KIT-A/B: a held gather / finish / seal / pivot is lifted with the possession
    gather = null; finish = null; spin = null; posting = false; spinCooldown = 0; spinArmed = 0; pumpWindow = 0; banked = null; driveContest = null; finishFoul = false; contact?.setAirborne('me', false);
    clearDefense();
    place('me', me.root, MY_SPAWN, Math.PI);
    place('foe', foe.root, FOE_SPAWN, 0);
    if (!contact?.isReady) me.root.position.y = 0;
    meDribble.setFacing(Math.PI);           // reset means facing the rim again
    giveBall('me');
    meAnimTree.releaseHold();                // a reach / a layup finish in flight plays out; only a held shot is lifted
    if (!foeFloored) foeAnimTree.releaseHold();
    hud({ hint: HINT_OFFENCE, shotType: '', shotMeterT: 0 });
    camSnapPending = true;   // POLISH: the bodies moved metres — the camera CUTS to them on the next frame (it used to chase at ~60 m/s for ten frames, measured)
  }

  /** Schedule the banner's clear: the latest schedule wins, so an older flash's timeout never wipes a newer banner. */
  function bannerClearLater(ctx: ModeContext, ms: number): void { const id = ++bannerSeq; setTimeout(() => { if (bannerSeq === id) ctx.setHud({ banner: '' }); }, ms); }
  let bannerSeq = 0;   // POLISH (2026-09-17): banners race one channel — an older flash's timeout used to wipe a newer banner early
  function bannerFlash(ctx: ModeContext, text: string, ms = 800): void {
    const id = ++bannerSeq;
    ctx.setHud({ banner: text });
    setTimeout(() => { if (bannerSeq === id) ctx.setHud({ banner: '' }); }, ms);
  }

  function checkGameOver(ctx: ModeContext): boolean {
    if (myScore >= TARGET_SCORE) { ended = true; SoundKit.play('whistle'); ctx.end('WIN', myScore, { foeScore, momentum }); return true; }
    if (foeScore >= TARGET_SCORE) { ended = true; SoundKit.play('whistle'); ctx.end('LOSS', myScore, { foeScore }); return true; }
    return false;
  }

  /** A possession-changing timer: only fires if the possession it was scheduled in is still the live one. */
  function later(ms: number, fn: () => void): void {
    const tok = possessionToken;
    setTimeout(() => { if (!ended && possessionToken === tok) fn(); }, ms);
  }

  return {
    modeId: 'onevone', mood: 'goldenHour', camPreset: 'hoops',

    async load(ctx: ModeContext) {
      // ONE BUS PER MOUNT, OWNED BY THE HARNESS. This mode built its own, which worked and was
      // INAUDIBLE: the crowd swell and the tier sting are bound to the harness's bus, and there was
      // exactly one onTierChange subscriber in the game. Same reports, same weights, now heard.
      mbus = ctx.momentum;
      hud = (u) => ctx.setHud(u);
      onevoneVenue = mountVenue(ctx, 'basketball_h2h', { keepGameplayCamera: true, location: ctx.location });
      if (!onevoneVenue) { VenueKit.buildCourt(ctx.scene, 'venice'); applyOceanCourt(ctx.scene, 'venice'); }
      me = await CharacterPipeline.spawnPlayer(ctx.scene, cfg.heroUrl, { position: MY_SPAWN.clone(), yawRad: Math.PI, startClip: SPORT_CLIP.idle });
      ring?.dispose(); ring = mountPlayerRing(ctx.scene, me.root, { color: '#22d3ee', icon: readPlayerIcon() });   // PLAYER RING
      me.secondary?.setLookTarget(() => ball?.position ?? null);    // Phase 2: eyes on the ball
      neverBindPose(me.animator, SPORT_CLIP.idle); installSafePlay(me.animator, 'onevone-me');
      ctx.groundLock?.track(me.root, me.skeleton);
      foe = await CharacterPipeline.spawnNpc(ctx.scene, cfg.heroUrl, { position: FOE_SPAWN.clone(), tint: '#ff2d78', startClip: SPORT_CLIP.idle });
      tintGarmentSlot(foe, SLOT_KEYS.jersey, '#ff2d78');   // suite pass: the rival wears the rival's colour (the tint alone was only a roster seed)
      foe.secondary?.setLookTarget(() => ball?.position ?? null);
      neverBindPose(foe.animator, SPORT_CLIP.idle); installSafePlay(foe.animator, 'onevone-foe');
      ctx.groundLock?.track(foe.root, foe.skeleton);
      onevoneVenue?.hidePlaceholders();  // M74

      ball = MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, ctx.scene);
      void dressBall(ball, 'basketball');   // Meshy ball skin rides the physics sphere (visual only)
      shotTrail?.dispose(); shotTrail = EffectsKit.ballTrail(ctx.scene, ball); shotTrailLevel = 'soft'; applyTrail(shotTrail, 'off'); shotTrailLevel = 'off';
      ballSim = new BallSim(ball, 0.12);
      attachBallToHand(ball, me.skeleton, 'RightHand');
      EffectsKit.ambient(ctx.scene, 'venice');
      EffectsKit.ballTrail(ctx.scene, ball);
      hoopJuice?.dispose(); hoopJuice = new HoopJuice(ctx.scene, RIM);   // A+ P0: juice-only ring + net, material clones — no meshy_hoop_* transform is touched
      if (typeof window !== 'undefined') {
        const q = Number(new URLSearchParams(window.location.search).get('handle'));
        if (Number.isFinite(q) && q > 0) { handle = Math.max(0, Math.min(100, q)); console.info(`[1V1-HANDLE] handle ${handle} (override)`); }
      }
      if (process.env.NODE_ENV === 'development') { const dev = (window as unknown as { __FEL_DEV__?: { hoopJuiceUsed?: unknown } }).__FEL_DEV__; if (dev) dev.hoopJuiceUsed = hoopJuice.used; }
      SoundKit.startAmbient('stadium');

      localSource = new LocalInputSource();
      // M69: when driven by an agent (?agent=1), the hero slot reads from the
      // AgentControlSource instead of local input. Human play is untouched.
      const agentCtl = agentBridge() ? new AgentControlSource() : null;
      if (agentCtl) {
        ctx.agent.control = agentCtl;
        ctx.agent.getScore = () => myScore;
      }
      meSlot = new PlayerSlot('me', agentCtl ?? localSource, true);
      // NETPLAY (2026-09-12): with ?net=<room> the opponent is driven by a remote player instead
      // of the DefenderBrain. Exactly the ?agent=1 precedent above — one source swap, and with no
      // flag present nothing is constructed and nothing connects.
      net = attachNetplay('onevone');
      foeSlot = net
        ? new PlayerSlot('foe', net.sourceFor('foe'), false)
        : new PlayerSlot('foe', new AISource(foe.root.position, {
        // getAbsolutePosition, NOT .position: while the ball rides a hand it
        // is PARENTED to the hand bone and .position is a palm-local offset
        // (~origin). Fed that, the defender's deny point collapsed onto the
        // rim — measured live: the "defender" parked at (0, 0.3) and never
        // marked anyone, in every game this mode has ever played.
        ball: () => ball.getAbsolutePosition(), hoop: () => RIM, allies: () => [], foes: () => [me.root.position],
      }, (foeBrain = new DefenderBrain(0.7))), false);

      // Phase 4: Havok contact bodies. If the physics wasm is unavailable
      // the mode falls back to the kinematic path unchanged.
      try {
        contact = new ContactSystem();
        await contact.init(ctx.scene);
        contact.addBody('me', me.root);
        contact.addBody('foe', foe.root);
      } catch (e) {
        console.warn('[1v1] physics unavailable, kinematic fallback:', e);
        contact = null;
      }

      meDribble = new DribbleController();
      meDribble.setFacing(Math.PI);           // spawned facing the rim (yaw π)
      meDribbleSM = new DribbleStateMachine();
      void meDribbleSM;
      meAnimTree = new BasketballAnimTree(me.animator);
      foeAnimTree = new BasketballAnimTree(foe.animator);
      meFootPlant = new FootPlant(me.skeleton, me.meshes[0] as never);
      // BIOMECH-HOOPS-WAVE1: the Posture Poses layer on both bodies — mounted BEFORE the carries (observer order = add
      // order: the dribble arm must solve against the posed shoulders). The layer owns the eyes; the secondary head-look
      // is stood down (it looked at ball.position — a palm-LOCAL offset while carried, i.e. the world origin).
      me.secondary?.setLookTarget(() => null); foe.secondary?.setLookTarget(() => null);
      net?.dispose(); net = null;   // NETPLAY: say bye and close the socket with the rest of teardown
      mePosture?.dispose(); foePosture?.dispose();
      mePosture = mountPostureLayer(ctx.scene, me.skeleton, me.root, () => feedFor(meBio, possession === 'mine' ? RIM : foe.root.position, possession === 'mine' ? RIM : ballWorld(), meMotion, 1 - turbo.t01, myJumpAge !== Infinity || dunking), '1V1-PP');
      foePosture = mountPostureLayer(ctx.scene, foe.skeleton, foe.root, () => feedFor(foeBio, possession === 'mine' ? me.root.position : RIM, possession === 'mine' ? ballWorld() : RIM, foeMotion, 0, foeBlockJumpAge !== Infinity || !!foeDunkFlight), '1V1-PP-FOE');
      meCarry?.dispose(); foeCarry?.dispose();
      meCarry = mountBallCarry({ scene: ctx.scene, ball, root: me.root, skeleton: me.skeleton });
      foeCarry = mountBallCarry({ scene: ctx.scene, ball, root: foe.root, skeleton: foe.skeleton });
      shotMeter = new ShotMeter();
      turbo = new TurboMeter();
      arc = new ShotArc();
      myScore = 0; foeScore = 0; momentum = 0; ended = false; foeStunSec = 0; foeFloored = false; loose = false;
      ctx.heroRef.current = me.root;
      ctx.objectiveRef.current = RIM;
      mbus.reset();
      mbus.onTierChange((tier) => {
        if (tier === 'on_fire') { bannerFlash(ctx, "YOU'RE ON FIRE!", 1100); SoundKit.play('crowdCheer', { volume: 0.7 }); }
        else if (tier === 'hot') bannerFlash(ctx, 'HEATING UP…', 800);
        else if (tier === 'cold') bannerFlash(ctx, 'GONE COLD', 700);
      });
      ctx.camDirector.snapTo(me.root.position, RIM);
      assertSpawned(ctx.scene, { hero: me.root, minWorldMeshes: 6, modeId: 'onevone' });
      resetPositions();
      ctx.setHud({ score: myScore, foeScore, target: TARGET_SCORE, momentum: 0, turbo: 100, hint: HINT_OFFENCE });
      // dev probes (ONEVONE-DEFENSE-LOGIC): the possession machine, readable without the HUD
      if (process.env.NODE_ENV === 'development') {
        (ctx.scene.metadata ??= {}).onevone = { possession: () => possession, defPhase: () => defPhase, attackPhase: () => attacker.phase, foeRoot: foe.root, myJumpAge: () => myJumpAge, block: () => contestJump(ctx), driveSpeed: () => foeVelLast.length(), takingCharge: () => takingCharge, flightK: () => dunkFlight?.k ?? -1, contacts: () => devContacts.slice(), luck: (v: number | null) => { defenseLuck = v; }, bumpAge: () => bumpAge, handUp: () => ({ me: meHandUp, foe: foeHandUp }), ended: () => ended, post: () => ({ posting, spinning: !!spin, brace: !!meSlot.intent.brace, can: canPostUp(me.root.position, RIM_FLOOR, foeStunSec > 0 || foeFloored ? null : foe.root.position), carrying, shooting, finish: !!finish, gather: !!gather, foeStun: foeStunSec, armed: spinArmed, pump: pumpWindow, glass: !!banked, held: meAnimTree.held ?? '' }), foeJob: () => (foeBrain?.boxing ? 'boxout' : foeBrain?.job ?? ''), foeBoxing: () => !!foeBrain?.boxing, defend: () => { if (!ended && possession === 'mine') startDefense(ctx, 'PROBE — DEFEND!'); }, offense: () => { if (!ended) resetPositions(); }, standing: () => { /* DEFENSE-LOOK probe geometry: me a stride in front of the rim with the ball, the rival stunned, the tank full — the standing dunk's set-up */ if (ended) return false; if (possession !== 'mine') resetPositions(); foeStunSec = 1.6; me.root.position.set(RIM_FLOOR.x + 0.35, 0, RIM_FLOOR.z + 1.15); meDribble.vel.set(0, 0, 0); meDribble.setFacing(yawTo(me.root.position, RIM_FLOOR)); turbo.t01 = 1; console.info('[1V1-CONTACT] probe standing geometry set'); return true; }, poster: () => { if (ended) return false; /* A poster needs three things at once: my possession, a run-up, and a defender ON HIS FEET inside 1.5 m    between me and the ring. A driver cannot arrange that — bumping him on the way in keeps him STUNNED,    and 1v1 passes a null defender while he is stunned, so contestDrive returns its no-defender sentinel    (t NaN lateral NaN) and the contact dunk can never be read. This seam sets the geometry up exactly    once, the same way defend()/offense() exist so a probe can reach either possession deterministically. */ if (possession !== 'mine') resetPositions(); foeStunSec = 0; foeFloored = false; posterVictim = null; const toRim = RIM_FLOOR.subtract(me.root.position); toRim.y = 0; if (toRim.lengthSquared() < 1e-4) return false; toRim.normalize(); /* far enough out for a real run-up: the dribble controller integrates its own velocity from the stick    and discards a direct write, so the drive-dunk speed minimum is only met by actually accelerating. */ me.root.position.set(RIM_FLOOR.x - toRim.x * 5.2, 0, RIM_FLOOR.z - toRim.z * 5.2); foe.root.position.set(RIM_FLOOR.x - toRim.x * 1.3, 0, RIM_FLOOR.z - toRim.z * 1.3); face(foe.root, yawTo(foe.root.position, me.root.position)); meDribble.setFacing(yawTo(me.root.position, RIM_FLOOR)); meDribble.vel.copyFrom(toRim.scale(6.2)); turbo.t01 = 1; console.info('[1V1-CONTACT] probe poster geometry set'); return true; } };   // BIOMECH-HOOPS-WAVE1: `defend()` / `offense()` let a probe reach either possession deterministically
        const dev = (window as unknown as { __FEL_DEV__?: { hoopsPosture?: unknown } }).__FEL_DEV__;
        if (dev) dev.hoopsPosture = { me: () => mePosture?.layer.get() ?? null, foe: () => foePosture?.layer.get() ?? null, bio: () => ({ me: { ...meBio }, foe: { ...foeBio } }) };   // BIOMECH-HOOPS-WAVE1 probes
      }
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      localSource.feed(e);
      if (e.t === 'stick' && e.side === 'R') { lookX = e.x; lookY = e.y; }   // MODE-STICK-FACE: R stick → the director's look orbit
      if (dunking && e.t === 'button' && e.btn === 'X' && e.pressed) showtimePress = true;   // SHOWTIME: the timed flush
      // BLOCK / contest jump on defense: A leaves the floor. The BODY of it now lives in contestJump(), because the
      // same press also has to be reachable from the slot — see that function.
      if (e.t === 'button' && e.btn === 'Y' && e.pressed && contestJump(ctx)) {   // Triangle = BLOCK (2K map)
        /* jumped */
      } else if (e.t === 'button' && e.pressed && e.btn === 'L1') {
        // PHONE CONTROLS (rc8 check): BOX OUT / the planted foot is a held STANCE, and a tap of it had no answer unless a
        // rebound happened to be live. The stance going down is heard and named, once per press.
        SoundKit.play('uiTick', { pitch: 0.75, volume: 0.35 });
        ctx.juice.callout(possession === 'mine' ? 'FOOT PLANTED' : 'BOXING OUT', '#cbd5e1', 380);
      } else if (e.t === 'button' && e.pressed && (e.btn === 'Y' || e.btn === 'X')) {
        // MECHANICS PASS (2026-09-15): BLOCK and STEAL are defense verbs, and on offense (or mid-jump, or stunned) they did
        // nothing and said nothing — 41 % of deliberate presses on the run-2 probe. Each is answered with why.
        // 2K map: Triangle blocks, Square steals — and Square is the SHOT on offence, so only the block is refused there.
        if (possession !== 'defense') { if (e.btn === 'Y') refuse(ctx, 'BLOCK IS FOR DEFENSE'); }
        else if (meStunSec > 0) refuse(ctx, 'STUNNED');
        else if (e.btn === 'Y' && myJumpAge !== Infinity) refuse(ctx, 'ALREADY UP');
        else if (e.btn === 'X' && reachCooldown > 0) refuse(ctx, 'RECOVERING');
        // SCORECARD CONTROLS (2026-09-15): a steal thrown from out of range reached for nothing and said nothing (5 of 7
        // presses silent in the rc11 capture) — the reach is a commitment, so the distance is the answer
        else if (e.btn === 'X' && Vector3.Distance(me.root.position, foe.root.position) > 1.7) refuse(ctx, 'TOO FAR TO REACH');
      } else if (e.t === 'button' && e.pressed && e.btn === 'B' && possession === 'mine') {
        refuse(ctx, 'NO TEAMMATE TO SCREEN');   // Circle calls a screen in 3v3; one-on-one there is nobody to call
      }
      // The SHOT's gather is heard as SQUARE goes down (the meter it starts is a number, which reads as nothing).
      // There is no "SHOOT ON OFFENSE" refusal on this button any more: under the 2K map Square is the STEAL when
      // you do not have the ball, so refusing it on defence would have refused every poke in the game.
      if (e.t === 'button' && e.btn === 'X' && e.pressed && possession === 'mine') SoundKit.play('uiTick', { pitch: 0.7, volume: 0.3 });
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;
      // the harness cools the shared meter on real time now -- a second update() here decayed it twice as fast
      // this exact curve is now MomentumFx.crowdLevel, applied by the harness for every mode --
      // it was extracted FROM here because this is the mode people have actually played
      meSlot.poll(dt);
      foeSlot.poll(dt);
      // NETPLAY: publish this player's intent at the tick rate (the session throttles; calling it
      // every rendered frame is correct and cheap). No-op when ?net= was absent.
      net?.tick(meSlot.intent);
      foeStunSec = Math.max(0, foeStunSec - dt);
      reachCooldown = Math.max(0, reachCooldown - dt);
      // the contest jump's clock; the kinematic fallback flies the root itself (physics lands the Havok body)
      if (myJumpAge !== Infinity) {
        myJumpAge += dt;
        if (!contact?.isReady) me.root.position.y = Math.max(0, Math.sin(Math.min(1, myJumpAge / JUMP_SEC) * Math.PI) * 0.46);
        if (myJumpAge >= JUMP_SEC) { myJumpAge = Infinity; if (!contact?.isReady) me.root.position.y = 0; }
      }
      // DEFENSE-LOOK: the jump shot's hop — the same arc the finishes ride (finishHopY), on the jumper's own clock
      if (riseHop && !finish && !dunking) {
        riseHop.t += dt;
        me.root.position.y = Math.max(0, Math.sin(Math.min(1, riseHop.t / riseHop.dur) * Math.PI) * JUMPER_HOP_APEX);
        if (riseHop.t >= riseHop.dur) { riseHop = null; me.root.position.y = 0; }
      } else if (riseHop) riseHop = null;
      // a posterized rival gets up when the stun ends (the tree held the floor)
      if (foeFloored && foeStunSec === 0) { foeFloored = false; foeAnimTree.beat('karate_get_up'); }
      if (meFloored && meStunSec === 0) { meFloored = false; meAnimTree.beat('karate_get_up'); }   // D1: posterized by the rival, back up
      bumpAge += dt;   // D2: the strip window's clock
      if (foeBlockJumpAge !== Infinity) { foeBlockJumpAge += dt; if (foeBlockJumpAge >= JUMP_SEC) foeBlockJumpAge = Infinity; }   // D1: the AI's contest jump
      if (foeHandUp) { foeHandUpLeft -= dt; if (foeHandUpLeft <= 0) { foeHandUp = false; foeAnimTree.releaseHold(); } }

      // ── the ball in flight (either end's shot) ──
      // THE HOT HAND'S TRAIL (suite pass): my shot streaks when the momentum meter is up — the dunk contest's ball trail, on the game
      if (shotTrail) { const want: TrailLevel = arc.active && momentum >= 70 ? 'hang' : 'off'; if (want !== shotTrailLevel) { shotTrailLevel = want; applyTrail(shotTrail, want); } }
      if (arc.active) {
        const res = arc.step(dt, ball.position);
        // O2: the seal ends with the ball — but on a MISS the ball is not done, it is live off the iron, and a
        // seal that releases the instant the arc resolves is a seal that never contests the thing it exists for.
        // It now holds until somebody actually comes down with it (liveBoard clears it).
        if (res === 'made') { foeBrain?.boxOut(null); foeSealing = false; }
        if (res === 'made') {
          SoundKit.play('score', { pitch: 1 });
          SoundKit.play('swish', { volume: 0.7 });   // through the net, which is not an impact at all
          EffectsKit.burst(ctx.scene, RIM, 'net');
          { const nk = netExitKindOf(arc.shotStyle); const v = netExitVelocity(nk); launchLoose(ball.position.clone(), new Vector3(v.x, v.y, v.z)); console.info(`[1V1-NET] ${nk} exit ${netExitMph(nk)} mph`); }   // NET EXIT: the swish leaves with the shot's own pace, a layup drops
          if (possession === 'mine') {
            myScore += arcPoints;
            swing('big_make');
            meShotWin = 'none'; meCelebrateSec = CELEBRATE_SEC; meAnimTree.beat('bball_score_celebrate', { fadeSec: 0.15 });   // BIOMECH-HOOPS-WAVE1 G5: the make's end pose
            // A+ P0 CONTACT-lite, the soft sibling: a jumper drops through with a small feel hit and a short shake —
            // no hit-stop latch, no flash, no slam thud (that is the dunk's). The hoop still answers the make.
            ctx.feel.impact(0.4);
            ctx.juice.shake(0.06, 100);
            hoopJuice?.punch();
            console.info('[1V1-JUICE] jumper make');
            // the WHY was named at release (GREEN/EARLY/LATE + contest); the
            // resolution just confirms the result and the points
            // PARITY THE OTHER WAY: 3v3 already asks the ref for this one and 1v1 asserted its own banner. It is
            // the same rule; only one of them should be writing it down.
            const andOne = finishFoul ? judge('and_one', { offense: 'me', shooter: 'me', fouled: 'me' }) : null;
            ctx.setHud({ score: myScore, momentum, banner: andOne ? `${arcLabel} +${arcPoints} — ${andOne.banner}` : `${arcLabel} +${arcPoints}` });   // HOOPS-MOVE-KIT-A M2: fouled on the finish
            if (andOne) { finishFoul = false; SoundKit.play('crowdCheer', { volume: 0.5 }); console.info(`[1V1-REF] ${andOne.id} → ${andOne.ball} (${andOne.shots} shot)`); }
            carrying = true;
            if (checkGameOver(ctx)) return;
            later(700, () => { ctx.setHud({ banner: '' }); resetPositions(); });   // make it, take it
          } else {
            foeScore += arcPoints;
            foeShotWin = 'none';
            SoundKit.play('crowdGroan', { volume: 0.4 });
            // your defence is graded on their makes too — a wide-open look
            // you gave them should READ as your mistake
            ctx.setHud({
              foeScore,
              banner: defContest >= 0.5 ? 'THEY SCORE — THROUGH YOUR CONTEST'
                : defContest <= 0.15 ? 'THEY SCORE — LEFT WIDE OPEN' : 'THEY SCORE',
            });
            if (checkGameOver(ctx)) return;
            // MAKE IT, TAKE IT — both ways. This handed ME the ball after their make (loser's ball).
            // The format decides; `possessionAfterScore` is the one place that answers it.
            const after = possessionAfterScore(FORMAT, 'foe');
            later(900, () => {
              ctx.setHud({ banner: '' });
              if (after === 'foe') startDefense(ctx, 'MAKE IT, TAKE IT — DEFEND!');
              else resetPositions();
            });
          }
        } else if (res === 'missed') {
          SoundKit.play('miss');
          meShotWin = 'none'; foeShotWin = 'none';   // BIOMECH-HOOPS-WAVE1: the follow-through ends when the arc does
          // THE MISS IS THE FEEDBACK — it used to be `new Vector3((Math.random()-0.5)*3, 2.5, 1.5+Math.random())`,
          // so the ball never touched the ring and every miss looked identical. Now the iron answers the shot
          // that was actually taken: EARLY is short off the front and comes BACK at the shooter, LATE is long
          // off the back and runs AWAY, a contest pushes it short. That is how a shooter reads their stroke.
          const shooterPos = possession === 'mine' ? me.root.position : foe.root.position;
          const toShooter = shooterPos.subtract(RIM); toShooter.y = 0;
          const rim = resolveRim(RIM, toShooter, forcedMissProfile(
            shotMiss?.quality01 ?? 0.45,
            { short: shotMiss?.short ?? 0.4, lateral: shotMiss?.lateral ?? 0 },
          ), 0.06);
          shotMiss = null;
          launchLoose(rim.contact, rim.outVel);
          SoundKit.play('rattle', { volume: 0.34 });   // it hit IRON — a rattle, not a generic thump
          hoopJuice?.punch();
          if (possession === 'mine') bannerFlash(ctx, rim.label, 850);
          console.info(`[1V1-RIM] ${rim.kind} — ${rim.label}`);
          // HOOPS-MOVE-KIT-A M2: fouled in the air on a finish that missed — the ball back, no board race
          if (finishFoul && possession === 'mine') {
            finishFoul = false;
            const call = judge('shooting_foul', { offense: 'me', shooter: 'me', fouled: 'me' });
            console.info(`[1V1-REF] ${call.id} on a miss → ${call.ball}`);
            bannerFlash(ctx, `${call.banner} — ${call.ball === 'me' ? 'BALL BACK' : 'THEIR BALL'}`, 1000);
            later(900, () => (call.ball === 'me' ? resetPositions() : startDefense(ctx, 'THEIR BALL — DEFEND!')));
            return;
          }
          // THE BOARD IS A CONTEST, and BOX OUT is how you win it — on BOTH ends.
          //
          // This was a bare distance comparison, which made it deterministic —
          // and since you shoot after driving, you are essentially always the
          // closer body. Measured: with EVERY shot deliberately missed, the
          // banner read "YOUR BOARD" every single time and the opponent never
          // got a possession at all. And on THEIR miss it was "YOUR BOARD"
          // unconditionally: the race only ran on my possession.
          //
          // Distance still names the favourite. Boxing out is worth a real body
          // length on top of it — which is the whole point of a verb the mode
          // tells you to hold — and a little randomness keeps a board from being
          // decided before the ball leaves the rim.
          // and now the ball is LIVE. boardRace compared two distances, added a box-out bonus and rolled a
          // die — the ball's real position was read once and it was never in play, so there was nothing to
          // chase. The board is now decided by bodies actually reaching the ball (liveBoard below);
          // boardRace survives only as the stall guard if nobody comes down with it.
          board = { age: 0, contestedCalled: false, shooter: possession };
        }
      } else if (loose && !dunking) {
        ballSim.step(dt);
        if (board) liveBoard(ctx, dt);
      }

      // ── THE REF, per frame ──────────────────────────────────────────────────────────────────────
      // THREE SECONDS: an offensive body may not camp in the paint. Without it the strongest strategy in
      // a half-court game is to stand under the ring and wait, which is why the rule exists in basketball.
      // The clock resets the instant I leave, so cutting through is free — it is camping that is called.
      if (possession === 'mine' && carrying && !dunking && !ended) {
        paintSec = paintClock(paintSec, distXZ(me.root.position, RIM_FLOOR) < PAINT_RADIUS, dt);
        if (paintSec === 0) paintWarned = false;
        if (paintSec >= THREE_SECOND_LIMIT) {
          paintSec = 0;
          const call = judge('three_seconds', { offense: 'me' });
          console.info(`[1V1-REF] ${call.id} → ${call.ball}`);
          if (call.whistle) SoundKit.play('whistle');
          swing('turnover');
          ctx.setHud({ momentum });
          bannerFlash(ctx, `${call.banner} — THEIR BALL`, 1000);
          later(900, () => startDefense(ctx, 'CHECK UP — DEFEND!'));
        } else if (paintSec > THREE_SECOND_LIMIT - 1) {
          ctx.setHud({ hint: 'GET OUT OF THE PAINT' });   // the ref warns before he calls it
          if (process.env.NODE_ENV === 'development' && !paintWarned) {
            paintWarned = true;
            console.info(`[1V1-REF] paint clock ${paintSec.toFixed(2)}s — warning`);
          }
        }
      } else { paintSec = 0; paintWarned = false; }

      // GOALTENDING: a ball touched on its way DOWN counts. The existing block fires at the RELEASE,
      // which is a clean block on the way up; this is the other case — a late contest jump that reaches
      // a ball already falling toward the ring. Swatting that away used to be free, which made a
      // mistimed jump strictly better than a well-timed one.
      const ballVelY = dt > 1e-5 ? (ball.position.y - prevBallY) / dt : 0;
      prevBallY = ball.position.y;
      if (arc.active && possession === 'defense' && myJumpAge !== Infinity && !goaltendCalled
          && distXZ(me.root.position, RIM_FLOOR) < 1.5
          && isGoaltending(ballVelY, ball.position.y, RIM.y)) {
        goaltendCalled = true;
        const call = judge('goaltending', { offense: 'foe', shooter: 'foe' });
        console.info(`[1V1-REF] ${call.id} (ball y ${ball.position.y.toFixed(2)} falling ${ballVelY.toFixed(1)}) → ${call.ball}`);
        if (call.whistle) SoundKit.play('whistle');
        arc.active = false;
        foeScore += arcPoints || 2;
        ctx.setHud({ foeScore, banner: call.banner });
        later(900, () => { ctx.setHud({ banner: '' }); if (!checkGameOver(ctx)) resetPositions(); });
      }
      // BIOMECH-HOOPS-WAVE1 G6: the drive dunk's make flushes THROUGH the iron from the release, then drops out of the net
      if (dunkFlush) {
        dunkFlush.since += dt;
        // DUNK-FANATIC: the ball goes OVER the lip and DOWN through the ring (RimFlush), never carried in flat from a metre out
        // (measured: every game dunk's ball reached rim height 1.0 m in front of the ring, then slid in)
        if (!dunkFlush.st) dunkFlush.st = startFlush(dunkFlush.releasePos, RIM, RIM_RADIUS, 0.12, NET_EXIT_MPS[dunkFlush.kind] + NET_DROP_NUDGE, NET_EXIT_MPS[dunkFlush.kind] + NET_DROP_NUDGE);
        const st = stepFlush(dunkFlush.st, RIM, RIM_RADIUS, 0.12, dt); ball.position.set(st.pos.x, st.pos.y, st.pos.z);
        if (st.phase === 'free') { const v = netExitVelocity(dunkFlush.kind); launchLoose(ball.position.clone(), new Vector3(v.x, v.y, v.z)); console.info(`[1V1-NET] ${dunkFlush.kind} exit ${netExitMph(dunkFlush.kind)} mph`); dunkFlush = null; }
      }

      // ══ MY POSSESSION ══
      if (possession === 'mine') {
        const intent = meSlot.intent;
        const moving = Math.hypot(intent.moveX, intent.moveY) > 0.1;
        const sprintOk = turbo.gate(dt, intent.sprint, moving);
        ctx.setHud({ turbo: Math.round(turbo.t01 * 100) }); ring?.set(turbo.t01);
        answerSprint(ctx, intent.sprint, moving);
        // Stick-space is normalised in LocalInputSource — see PlayerSlot.
        const [mx, my] = camRel(ctx, intent.moveX, intent.moveY);
        const drib = meDribble.update(dt, mx, my, sprintOk);
        meSpeed01 = drib.speed01;
        const defPos = foeStunSec > 0 || foeFloored ? null : foe.root.position;   // HOOPS-MOVE-KIT-B: the body the post / the spin read
        if (shooting) {   // BIOMECH-HOOPS-WAVE1 G1: the shooter squares to the rim through the meter (he kept the last dribble heading)
          const yaw = slewYaw(me.root.rotation.y, yawTo(me.root.position, RIM), FACE_RIM_RATE, dt); face(me.root, yaw); meDribble.setFacing(yaw);
        }
        // HOOPS-MOVE-KIT-A M1: the GATHER moves the body — the pull-up's plant bleeds the speed to zero, the step-back goes
        // away from the rim — then the rise starts (the meter has been running since the squeeze)
        if (gather) {
          gather.t += dt;
          driveBody('me', me.root, gatherWish(gather.plan, gather.t), dt);
          if (gather.t >= gather.plan.sec) {
            const plan = gather.plan; gather = null;
            // HOOPS-MOVE-KIT-B wave 2: the footwork gathers (step-through / hop / euro) end IN a finish, where the feet land
            if (plan.then && plan.then !== 'rise') startFinish(ctx, plan.then, shotContest, defPos, plan.side, plan.sec);
            else beginRise();
          }
        }
        if (finish) stepFinish(dt);   // M3: the finish's stride and hop (before and after the release, to feet-down)
        // HOOPS-MOVE-KIT-B: M6 the pivot owns the body while it turns; otherwise M4–M6's path — L1/LT held with a body to
        // back down is a POST-UP (the back to the basket, a slow back-down, the stick across = a quick spin out of it)
        chain = tickChain(chain, dt, handle);   // the chain expires on its own; a late press starts a new one
        spinGather = Math.max(0, spinGather - dt);
        threat = tickThreat(threat, dt);

        // ── TRIPLE THREAT ─────────────────────────────────────────────────────────────────────────
        // Standing still with the ball is not idle, it is THREATENING: shoot, drive and the footwork that
        // sells either are all live, and the JAB is how you find out which one he is guessing. The same
        // stick direction is both the lie and the truth — a TAP jabs, a LEAN drives — which is why the jab
        // cannot have its own button without losing the thing that makes it work.
        const stickMag = Math.hypot(mx, my);
        const threatening = inTripleThreat({
          carrying, speed01: drib.speed01, busy: shooting || dunking || !!finish || !!gather || !!spin, posting,
        });
        if (stickMag > 0.45) {
          // LATCH the stance at the START of the push. Evaluating it at the release was wrong: the tap
          // itself moves the body past the stance's speed limit, so by the time the stick came back to
          // centre the read was always "driving" and no jab ever fired (measured: 0 jabs in 80 s).
          if (stickHeld === 0) jabEligible = threatening;
          stickHeld += dt; stickPeak = Math.max(stickPeak, stickMag);
        }
        else {
          if (jabEligible && stickHeld > 0 && isJabInput(stickHeld, stickPeak) && canJab(threat)) {
            const dist = distXZ(me.root.position, foe.root.position);
            const live = foeStunSec === 0 && !foeFloored;
            const odds = live ? jabBiteOdds({
              defenderDist: dist,
              defenderClosing: foeVelLast.length() > 1.4,
              defenderSet: foeVelLast.length() < 0.6,
              handle,
              shownThisPossession: threat.shown,
            }) : 0;
            const bought = live && roll() < odds;
            threat = throwJab(threat, bought);
            burstArmed = bought;
            meAnimTree.beat('bball_hesi', { fadeSec: 0.05 });   // the sharpest authored weight-shift: the jab
            SoundKit.play('whoosh', { pitch: 1.25, volume: 0.28 });
            if (bought) {
              foeStunSec = Math.max(foeStunSec, 0.3);
              foeAnimTree.beat('bball_contact_react', { fadeSec: 0.07 });
              ctx.feel?.impact?.(0.2);
              bannerFlash(ctx, 'HE BIT THE JAB — GO!', 600);
            } else if (threat.shown >= 3) bannerFlash(ctx, 'HE IS NOT BUYING IT', 550);
            console.info(`[1V1-THREAT] jab #${threat.shown} odds ${odds.toFixed(2)} bought ${bought}`);
          }
          stickHeld = 0; stickPeak = 0; jabEligible = false;
        }
        // the advantage is ONE impulse on the first step out of the stance, not a per-frame multiplier
        // (scaling the velocity every frame would compound into a teleport)
        if (burstArmed && threat.advantage > 0 && drib.speed01 > 0.3) {
          meDribble.vel.scaleInPlace(jabBurst(threat));
          burstArmed = false;
          console.info('[1V1-THREAT] jab burst spent');
        }
        spinCooldown = Math.max(0, spinCooldown - dt);
        spinArmed = Math.max(0, spinArmed - dt);
        if (spin) stepSpin(ctx, dt);
        else if (updatePost(ctx, dt, mx, my, defPos)) { /* the seal owns the stick */ }
        else if (spinArmed > 0 && spinCooldown <= 0 && carrying && !shooting && !dunking && !finish && !gather) {
          // M6: off the body I just met, on the swing ACROSS MY PATH — read against the travel, not the body's yaw, which
          // lags the stick through a turn (a diagonal drive read as a full swing for the few frames the chest was catching
          // up, and spun on its own: measured on the KIT-A layup scenario)
          const heading = meDribble.vel.lengthSquared() > 1 ? Math.atan2(meDribble.vel.x, meDribble.vel.z) : me.root.rotation.y;
          const side = postSpinSide(mx, -my, heading);
          if (side) { spinArmed = 0; startSpin(ctx, defPos, side); }
        }
        if (!shooting && !dunking && !spin) {
          if (!finish && !posting) { driveBody('me', me.root, meDribble.vel, dt); face(me.root, drib.facingRad); }
          const nearestDef = foeStunSec > 0 ? Infinity : Vector3.Distance(me.root.position, foe.root.position);
          meAnimTree.update({
            // STRIDE MATCHING needs real ground speed: speed01 is normalised and cannot pace a stride
            speedMps: Math.hypot(meDribble.vel.x, meDribble.vel.z),
            speed01: drib.speed01, crossover: drib.crossover, crossoverDir: mx >= 0 ? 'right' : 'left', nearestDefender: nearestDef,
            hasBall: carrying, shooting, dunking,
            driving: sprintOk && drib.speed01 > 0.6
              && Vector3.Dot(meDribble.vel, RIM.subtract(me.root.position)) > 0,
            defending: false, bracing: false, staggered: false,
          });
          // plant-and-cut contact lock: pin the plant foot with IK
          if (drib.planting && !wasPlanting) {
            meFootPlant.plant((n) => new BABYLON_TransformNode(n, ctx.scene));
          }
          wasPlanting = drib.planting;
          meFootPlant.update(dt);
          // the ball leaves the palm while I carry; a crossover swaps hands
          meCarry?.update(dt, drib.speed01, carrying && !shooting && !dunking && !finish);
          if (drib.crossover && !finish && !posting) meCarry?.switchHand();   // HOOPS-MOVE-KIT-A: no size-up reads inside a finish's hop (KIT-B: nor inside a seal)
          if (drib.crossover && !finish && !posting) {
            SoundKit.play('whoosh', { pitch: 1.4, volume: 0.4 });
            ctx.feel?.impact?.(0.1);
            // A crossover is a CHAIN LINK now, not an isolated event. The old read was a single
            // checkAnkleBreak on one move, so depth could not matter and a spammed crossover was as
            // dangerous as a real sequence. Chain depth is the skill, and the chain cannot repeat a move.
            //
            // WHICH move the flick becomes is read off the situation (moveFromContext), not off a new
            // button: the vocabulary had eight moves and two bindings, so measured in a probe every chain
            // was depth 1 forever and the hard ankle break was unreachable in play. A low handle still
            // only ever gets the basics out of the same input.
            const toRim = RIM_FLOOR.subtract(me.root.position); toRim.y = 0;
            const foeDist = distXZ(me.root.position, foe.root.position);
            const foeLive = foeStunSec === 0 && !foeFloored;
            doMove(ctx, moveFromContext({
              speed01: drib.speed01,
              retreating: Vector3.Dot(meDribble.vel, toRim) < -0.2,
              pressured: foeDist < 2.0 && foeLive,
              last: chain.last,
              // the two reads the deep vocabulary needs: without them `shammgod` and `off_the_head` are
              // priced moves that no situation can ever produce
              chainLength: chain.length,
              inHisChest: foeLive && foeDist < OFF_THE_HEAD_RANGE,
            }, handle));
          }
          // HESITATION — the pullback plant. You spent your momentum; if the
          // defender was CLOSING on you, they bite and you own the next beat
          // (the controller's explode-out window is already armed). A set
          // defender standing off does NOT bite — that's the read.
          if (drib.hesitation && !finish && !posting) {
            doMove(ctx, 'hesi');   // the pull-back is a link: hesi into cross is the oldest combo there is
            turbo.t01 = Math.max(0, turbo.t01 - 0.05);
            SoundKit.play('whoosh', { pitch: 0.8, volume: 0.3 });
            ctx.setHud({ turbo: Math.round(turbo.t01 * 100) }); ring?.set(turbo.t01);
            // 2.4m: the defender's settle point on a stationary handler is
            // ~2m out (deny lever 0.35), so 1.9m put the bite permanently
            // one step out of reach — measured live, it could never trigger.
            const inRange = Vector3.Distance(me.root.position, foe.root.position) < 2.4;
            if (foeStunSec === 0 && inRange && foeCloseMemory > 0.8) {
              foeStunSec = 0.45;
              SoundKit.play('impact', { pitch: 1.1, volume: 0.35 });
              ctx.feel?.impact?.(0.2);
              foeAnimTree.beat('bball_contact_react');
              bannerFlash(ctx, 'BIT ON THE HESI!');
            } else {
              bannerFlash(ctx, 'HESI…', 500);
            }
          }
        }

        // the rival defends: the DefenderBrain's deny point, the press, the strip roll
        const foeIntent = foeSlot.intent;
        const foeVel = foeStunSec > 0 ? new Vector3(0, 0, 0) : new Vector3(foeIntent.moveX, 0, -foeIntent.moveY).scale(3.6);
        foeVelLast.copyFrom(foeVel);   // HOOPS-MOVE-KIT-A M2: the drive contest reads set vs moving
        // the posture trackers: each body's acceleration resolved in its OWN frame (a brake and a turn are the
        // same world-space number otherwise)
        meMotion.update(meDribble.vel.x, meDribble.vel.z, me.root.rotation.y, dt);
        foeMotion.update(foeVel.x, foeVel.z, foe.root.rotation.y, dt);
        if (foeStunSec === 0) {
          // closing speed toward the handler feeds the hesi bite read
          const toMe = me.root.position.subtract(foe.root.position); toMe.y = 0;
          foeClosingSpeed = toMe.lengthSquared() > 1e-4
            ? Math.max(0, Vector3.Dot(foeVel, toMe.normalize()))
            : 0;
          foeCloseMemory = Math.max(foeClosingSpeed, foeCloseMemory - dt * 2.5);
          driveBody('foe', foe.root, foeVel, dt);
          // BIOMECH-HOOPS-WAVE1 G1: a defender's chest stays ON the handler through the slide (he used to face his travel —
          // a sideways-shuffling run); beyond range he runs to his spot facing the travel; every turn a slew
          facePlay(foe.root, foeVel, foeStunSec > 0 ? null : me.root.position, DEFEND_FACE_RANGE, dt);
        }
        foeSpeed01 = Math.min(1, foeVel.length() / 3.6);
        if (foeBrain && foeBrain.job !== lastFoeJob) { lastFoeJob = foeBrain.job; console.info(`[1V1-DEF] rival job ${lastFoeJob}`); }   // DEFENSE-LOOK: the lab reads the closeout / recover
        foeAnimTree.update({
          speedMps: Math.hypot(foeVel.x, foeVel.z),
          speed01: Math.min(1, foeVel.length() / 3.6), crossover: false, nearestDefender: Infinity,
          hasBall: false, shooting: false, dunking: false, driving: false,
          defending: true, bracing: !!foeBrain?.boxing, staggered: false, slideDir: slideDirFor(foe.root.rotation.y, foeVel),   // O2: the seal stance while boxing
          retreat: retreatFor(foe.root.position, foeVel, me.root.position), closeout: foeBrain?.job === 'closeout' && distXZ(foe.root.position, me.root.position) < 2.4, intense: foeBrain?.job === 'onball' && distXZ(foe.root.position, me.root.position) < 2.0,   // DEFENSE-LOOK
        });
        // same standoff fix as the defensive poke: bodies rest ~1.1m apart
        // HOOPS-MOVE-KIT-B: a SEALED post man cannot be poked from behind — the body is between him and the ball, which is
        // what the seal is for (the ball is held out on the ball side). Front the post (get on my chest side) and the poke
        // is live again; a bump strip roll always is.
        const sealed = posting && facingCos(me.root.rotation.y, me.root.position, foe.root.position) < 0.2;
        // OUT OF BOUNDS OFF THE CARRIER — a rule that did not exist. `clampToHalfCourt` keeps every body inside
        // the lines, so dribbling into the sideline was an invisible wall you slid along for free: the one way to
        // lose the ball by leaving the floor was a LOOSE ball on a rebound. The clamp still holds the body (a
        // player half off the court looks broken), but the line is now a line — carry into it and the ref calls it.
        if (carrying && !shooting && !dunking && !finish && possession === 'mine') {
          const p = me.root.position;
          const outX = Math.abs(p.x) >= COURT_HALF_WIDTH - OOB_EPSILON;
          const outZ = p.z >= COURT_DEPTH - OOB_EPSILON;
          const pushingOut = (outX && Math.sign(mx) === Math.sign(p.x) && Math.abs(mx) > 0.3) || (outZ && my > 0.3);
          oobSec = outX || outZ ? oobSec + dt : 0;
          if (pushingOut && oobSec >= OOB_GRACE_SEC) {
            oobSec = 0;
            const call = judge('out_of_bounds', { offense: 'me', shooter: 'me' });
            if (call.whistle) SoundKit.play('whistle');
            meCarry?.update(0, 0, false);
            console.info(`[1V1-REF] ${call.id} off the carrier at x ${p.x.toFixed(2)} z ${p.z.toFixed(2)} → ${call.ball}`);
            bannerFlash(ctx, `${call.banner} — ${call.ball === 'me' ? 'YOUR BALL' : 'THEIR BALL'}`, 900);
            if (call.ball === 'me') resetPositions(); else startDefense(ctx, `${call.banner} — DEFEND!`);
            return;
          }
        } else oobSec = 0;
        if (foeStunSec === 0 && carrying && !shooting && !dunking && !finish && !gather && !sealed && foeIntent.steal && Vector3.Distance(me.root.position, foe.root.position) < 1.6) {
          stripBall(ctx, 'STRIPPED!');   // D2: the ball goes LOOSE from the hand (it used to warp both bodies to the check)
          return;
        }
        // D1: the AI's contest jump, timed to my green
        if (shooting && foeBlockAt >= 0 && shotMeter.t * shotMeter.durationSec >= foeBlockAt) {
          foeBlockAt = -1; foeBlockJumpAge = 0; foeHandUp = false;
          foeAnimTree.beat('bball_block_reach');
          if (contact?.isReady) contact.hop('foe', JUMP_VY);
          console.info('[1V1-DEF] ai block jump');
        }

        if (!contact?.isReady && resolveBodyCollision(me.root.position, foe.root.position) && meDribble.vel.lengthSquared() > 9) {
          SoundKit.play('impact', { pitch: 1.1, volume: 0.15 });
          // HOOPS-MOVE-KIT-B M6 (no-Havok path): I met his body at speed with the ball — the spin is ARMED (the swing of
          // the stick across throws it). Never with the shot trigger already down: a squeeze is a committed shot.
          if (carrying && !shooting && !dunking && !finish && !gather && !spin && spinCooldown <= 0 && intent.actionHeld <= 0.02
            && spinOffContact(meDribble.vel, me.root.position, me.root.rotation.y, defPos)) spinArmed = SPIN_ARM_SEC;
        }

        // shot start — drive context first: a hot drive DUNKS instead of metering
        if (!shooting && !dunking && !spin && carrying && meSlot.intent.actionHeld > 0.02) {
          const defenderPos = foeStunSec > 0 ? null : foe.root.position;
          // A+ P0: the gate measures a 3-D distance and the rim sits 3.05 m up — against RIM itself a floor-bound body can
          // NEVER be inside DUNK_RANGE (2.8 m), so the drive dunk had never fired in play (measured: every squeeze at speed
          // inside 2.6 m of the rim metered a jumper). The range is a floor distance; judge it against the rim's floor point.
          // HOOPS-MOVE-KIT-B M4/M5: with my back to the basket the squeeze is the POST's own shot — the stick pulled off
          // the rim asks for the FADEAWAY, anything else is the JUMP HOOK. (A sealed body is never fast enough to dunk.)
          const toRimNow = RIM_FLOOR.subtract(me.root.position); toRimNow.y = 0; toRimNow.normalize();
          const post: PostShot = posting ? (stickBack01(mx, -my, toRimNow) >= POST_FADE_STICK_MIN ? 'fade' : 'hook') : 'none';
          // THE DUNK IS THE SPRINT FINISH, AND THE LAYUP IS THE ONE OFF THE GAS — which is what this gate was always
          // meant to say and did not. It was handed `turbo.t01`, the TANK, so "attacking the rim with turbo" was
          // satisfied by anyone who simply had fuel: at DUNK_MIN_TURBO 0.25 a player who has never once pressed sprint
          // sits at a full 1.0, and DUNK_MIN_SPEED 3.4 is half of the 6.4 top speed — a jog. So EVERY drive that
          // arrived at the rim converted to a dunk, and the layup, which is the highest-percentage shot in
          // classifyShot (pctMod 1.18) and carries the whole finish system behind it (pickLayupSide, the euro, the
          // step-through, the reverse), could not be reached in normal play at all. Measured on the lab: four drives
          // at full stick, four possessions with no shot meter and no `[1V1-MOVE] finish` in the log; the same drive
          // with the stick eased to 0.45 produced a finish on the first attempt.
          //
          // `sprintOk` is the turbo gate's own answer for this frame — sprint HELD, moving, and fuel in the tank — so
          // the read becomes the one the player can feel: hold it in and go up strong, ease off it and lay it in.
          const kind = posting ? 'none' : checkDriveDunk(me.root.position, meDribble.vel, RIM_FLOOR, sprintOk ? turbo.t01 : 0, defenderPos);
          if (kind !== 'none') { startDunk(ctx, kind); }
          // the FOOTWORK reads the body even when he is frozen: a defender who has just BITTEN a pump is exactly the man you
          // step through, and passing null there killed every step-through the fake had earned (measured: 0 of 1).
          else if (!posting && startFootwork(ctx, mx, my, foeFloored ? null : foe.root.position)) { /* M8 / M13 / M14 */ }
          else {
            shooting = true;
            banked = null;   // M12: each release calls its own glass
            // G6: the live dribble is PARKED — the ball comes back to the palm for the meter and leaves the HAND at the release
            // (the carry's deactivate sat inside the !shooting guard, so the ball stayed at its last bounce point on the floor
            // through the whole meter and the arc started from there — measured ball–hand 1.56 m in the load)
            meCarry?.update(0, 0, false);
            if (!ball.parent) attachBallToHand(ball, me.skeleton, 'RightHand');
            const contest = contestLevel(me.root.position, defenderPos);
            shotContest = contest;
            currentShot = classifyShot(me.root.position, meDribble.vel, RIM, contest, posting ? post : faceUpRead(defenderPos));
            console.info(`[1V1-SHOT] gather ${currentShot.style} rim ${distXZ(me.root.position, RIM_FLOOR).toFixed(2)} speed ${Math.hypot(meDribble.vel.x, meDribble.vel.z).toFixed(1)} contest ${contest.toFixed(2)}`);
            // HOOPS-MOVE-KIT-A: a layup / floater is a FINISH (M3); a jumper GATHERS first (M1) — a set body rises at once.
            // HOOPS-MOVE-KIT-B: the hook (M5) and the fadeaway (M4) are finishes too — their own clip, their own hop.
            if (currentShot.style === 'layup' || currentShot.style === 'floater' || currentShot.style === 'hook' || currentShot.style === 'fadeaway' || currentShot.style === 'reverse') startFinish(ctx, currentShot.style, contest, defenderPos);
            else startRise(ctx, contest, mx, my);
            aiContestLoad(ctx);   // D1/D3: the AI puts a hand up on the load, or times a block jump to the green
          }
        }
        if (shooting) {
          const t = shotMeter.update(dt);
          ctx.setHud({ shotMeterT: t });
          // HOOPS-MOVE-KIT-B M8: let go this early and it is a PUMP FAKE, not a 0.35-pct brick — and he can bite it
          if (meSlot.intent.action && isPumpFake(t * shotMeter.durationSec) && !finish) { pumpFake(ctx, defPos); }
          else if (meSlot.intent.action || t >= 1) releaseJumper(ctx, shotMeter.release());
        }
        pumpWindow = Math.max(0, pumpWindow - dt);

        // …but NOT while you are in the air on a dunk: the right stick is the TRICK stick then, and a flick that
        // threw a windmill must not also swing the camera 90° off the rim at the moment you want to watch it.
        if (!dunking) ctx.camDirector.look(lookX, lookY, dt);
        if (camSnapPending) { camSnapPending = false; ctx.camDirector.snapTo(me.root.position, RIM); }
        ctx.camDirector.update(me.root.position, meDribble.vel, RIM);
      }

      // ── Phase 4: contact events (fouls/hard contact) from Havok ──
      if (contact?.isReady) {
        for (const c of contact.drainContacts()) {
          if (process.env.NODE_ENV === 'development') { devContacts.push({ t: performance.now(), severity: c.severity, closing: c.closingSpeed, attacker: c.attacker, victim: c.victim, attackerSpeed: c.attackerSpeed }); if (devContacts.length > 40) devContacts.shift(); }
          if (c.severity === 'foul') {
            // A SCRAMBLE IS NOT A POSSESSION. Every branch below asks whose ball it is, so a foul-speed collision
            // while the ball is LOOSE — the one moment neither team is on offence — had nowhere to land and was
            // dropped. `loose_ball_foul` has been in the handbook the whole time, awarding it to whoever was
            // fouled, which is exactly the case the possession-shaped branches cannot express.
            if (loose && !dunking && c.closingSpeed >= FOUL_CLOSING_SPEED) {
              const victim: 'me' | 'foe' = c.victim === 'me' ? 'me' : 'foe';
              const call = judge('loose_ball_foul', { offense: possession === 'mine' ? 'me' : 'foe', fouled: victim });
              if (call.whistle) SoundKit.play('whistle');
              console.info(`[1V1-REF] ${call.id} ${c.closingSpeed.toFixed(1)} m/s on ${victim} → ${call.ball}`);
              bannerFlash(ctx, `${call.banner} — ${call.ball === 'me' ? 'YOUR BALL' : 'THEIR BALL'}`, 900);
              board = null; ballSim.stop(); loose = false;
              if (call.ball === 'me') resetPositions(); else startDefense(ctx, `${call.banner} — DEFEND!`);
              return;
            }
            // THE CHARGE, ON THE COLLISION CHANNEL. Every branch in this drain was `possession === 'mine'`, so on
            // DEFENCE every contact the physics reported was dropped on the floor — which is why a planted defender
            // could be run through at 5.0 m/s and nothing was called. A charge IS a collision; polling the distance
            // from the update loop could never be as good, because the driver steers around a spot and arrives at a
            // body. The distance read below stays as a fallback for the no-Havok path.
            if (possession === 'defense' && takingCharge && c.attacker === 'foe' && c.victim === 'me'
              && c.attackerSpeed >= FOUL_CLOSING_SPEED && chargeSetSec >= CHARGE_SET_SEC && defPhase !== 'over') {
              SoundKit.play('whistle');
              swing('steal');
              ctx.setHud({ momentum });
              EffectsKit.burst(ctx.scene, me.root.position.add(new Vector3(0, 1.0, 0)), 'dust');
              ctx.feel?.impact?.(0.45);
              meAnimTree.beat('bball_contact_react', { fadeSec: 0.06 });
              foeAnimTree.beat('bball_contact_react', { fadeSec: 0.06 });
                // THE REF OWNS THE CONSEQUENCE. This asserted "YOUR BALL" itself, which is the exact thing Ref.ts
              // exists to stop — a rule living in two places will disagree after the next tuning pass. The mode
              // reports the fact (a foul-speed body arrived at a SET defender) and carries out the call.
              const call = judge('charge', { offense: 'foe', fouled: 'me' });
              bannerFlash(ctx, `${call.banner} — ${call.ball === 'me' ? 'YOUR BALL' : 'THEIR BALL'}!`, 1100);
              console.info(`[1V1-REF] ${call.id} at ${c.attackerSpeed.toFixed(1)} m/s (set ${chargeSetSec.toFixed(2)}s) → ${call.ball}`);
              defPhase = 'over';
              later(800, () => (call.ball === 'me' ? resetPositions() : startDefense(ctx, 'THEIR BALL — DEFEND!')));
            } else if (possession === 'mine' && (dunking || finish) && c.victim === 'me') {
              // HOOPS-MOVE-KIT-A M2: fouled IN THE AIR — the attempt plays out (it used to reset the possession mid-flight, with
              // the flight observer still flying the body): a make is an AND-ONE, a miss is the ball back
              // FOULED IN THE AIR. Which call this IS depends on whether it goes in, so the ref is asked when the
              // attempt resolves (the and-one below) — this is the whistle and the flag, not the ruling.
              if (!finishFoul) { finishFoul = true; SoundKit.play('whistle'); bannerFlash(ctx, rule('shooting_foul').call, 400); console.info(`[1V1-REF] foul in the air (${c.closingSpeed.toFixed(1)} m/s) — and-one pending on the attempt`); }
            } else if (possession === 'mine' && !shooting && !dunking && !finish && carrying && c.attacker === 'me' && c.attackerSpeed >= FOUL_CLOSING_SPEED && foeVelLast.length() < 1.0 && foeStunSec === 0) {
              // HOOPS-MOVE-KIT-A M2: a sprint THROUGH a set defender is a CHARGE (a foul-speed contact on offense was never
              // read — the handler ran through bodies for free); a moving defender who gets hit is just beaten (below)
              SoundKit.play('whistle');
              swing('turnover');
              ctx.setHud({ momentum });
              const call = judge('charge', { offense: 'me', fouled: 'foe' });
              bannerFlash(ctx, `${call.banner} — ${call.ball === 'me' ? 'YOUR BALL' : 'THEIR BALL'}`, 1000);
              console.info(`[1V1-REF] ${call.id} ${c.closingSpeed.toFixed(1)} m/s into a set body → ${call.ball}`);
              later(900, () => (call.ball === 'me' ? resetPositions() : startDefense(ctx, 'CHECK UP — DEFEND!')));
            } else if (possession === 'mine' && !shooting && !dunking && !finish && carrying && c.attacker === 'foe' && c.victim === 'me' && c.attackerSpeed >= FOUL_CLOSING_SPEED) {
              // M2: a defender running THROUGH the handler at foul speed — the ball back
              SoundKit.play('whistle');
              const call = judge('blocking_foul', { offense: 'me', fouled: 'me' });   // the charge's mirror
              bannerFlash(ctx, `${call.banner} — ${call.ball === 'me' ? 'BALL BACK' : 'THEIR BALL'}`, 1000);
              console.info(`[1V1-REF] ${call.id} ${c.closingSpeed.toFixed(1)} m/s by the defender → ${call.ball}`);
              if (call.ball === 'me') resetPositions(); else startDefense(ctx, 'THEIR BALL — DEFEND!');
            } else if (possession === 'mine' && (c.attacker === 'me' || c.attacker === 'foe') && !shooting && !dunking && !finish) {
              hardHit(ctx, c.attacker, c.victim, c.closingSpeed);   // a foul-speed collision with a MOVING defender: a hard hit, no whistle
            } else if (possession === 'mine' && shooting && c.victim === 'me') {
              SoundKit.play('whistle');
              mbus.report({ kind: 'big_make', weight: 8 }); momentum = Math.round(mbus.score01 * 100);
              ctx.setHud({ momentum });
              const call = judge('shooting_foul', { offense: 'me', fouled: 'me', shooter: 'me' });
              bannerFlash(ctx, `${call.banner} — ${call.ball === 'me' ? 'BALL BACK' : 'THEIR BALL'}`, 1000);
              console.info(`[1V1-REF] ${call.id} → ${call.ball} (${call.shots} shots in the book)`);
              if (call.ball === 'me') resetPositions(); else startDefense(ctx, 'THEIR BALL — DEFEND!');
            } else if (possession === 'defense' && defPhase !== 'over' && c.attacker === 'me' && c.attackerSpeed >= FOUL_CLOSING_SPEED) {
              // I ran through them: their ball again, checked up
              SoundKit.play('whistle');
              mbus.report({ kind: 'turnover', weight: -10 }); momentum = Math.round(mbus.score01 * 100);
              ctx.setHud({ momentum });
              bannerFlash(ctx, 'FOUL ON YOU — THEIR BALL', 900);
              defPhase = 'over';
              later(900, () => startDefense(ctx, 'CHECK UP — DEFEND!'));
            } else if (possession === 'defense' && defPhase !== 'over' && c.attacker === 'foe' && meDribble.vel.length() < 1.0) {
              // they ran through a SET defender: the charge (a moving defender who gets hit is just beaten)
              SoundKit.play('whistle');
              swing('turnover');
              ctx.setHud({ momentum });
              bannerFlash(ctx, 'CHARGE — YOUR BALL', 1000);
              defPhase = 'over';
              later(900, () => resetPositions());
            }
          } else if (c.severity === 'hard') {
            hardHit(ctx, c.attacker, c.victim, c.closingSpeed);
          }
          // D2: any hard / foul contact with the handler opens the strip window — mine on defense (the poke connects inside it),
          // the AI's on my possession (a set defender I bump strips on his roll)
          if (c.severity !== 'bump') {
            if (possession === 'defense' && (defPhase === 'check' || defPhase === 'drive')) bumpAge = 0;
            else if (c.severity === 'hard' && possession === 'mine' && carrying && !shooting && !dunking && !finish && !gather && foeStunSec === 0 && !foeFloored
              && c.attacker === 'me' && c.attackerSpeed >= 4.0 && performance.now() - lastBumpStripAt > 2500) {
              lastBumpStripAt = performance.now();   // I barrelled into him: one roll per collision, never on a defender bumping ME
              const facing = facingCos(foe.root.rotation.y, foe.root.position, me.root.position);
              if (aiBumpStrips(foeVelLast.length() < 1.0, facing, roll)) { stripBall(ctx, 'STRIPPED ON THE BUMP!'); return; }
            }
            // HOOPS-MOVE-KIT-B M6: he did not take it — a drive that MEETS a body still in front of it ARMS the spin
            if (possession === 'mine' && carrying && !shooting && !dunking && !finish && !gather && !spin && spinCooldown <= 0
              && meSlot.intent.actionHeld <= 0.02   // a committed squeeze is a shot, never a pivot
              && (c.attacker === 'me' || c.victim === 'me')
              && spinOffContact(meDribble.vel, me.root.position, me.root.rotation.y, foeStunSec > 0 || foeFloored ? null : foe.root.position)) {
              spinArmed = SPIN_ARM_SEC;
            }
          }
        }
      }

      // ══ THEIR POSSESSION — you defend ══
      if (possession === 'defense') {
        meStunSec = Math.max(0, meStunSec - dt);
        // I move freely on D (turbo still gates sprint) — unless a whiffed
        // reach took my feet. That's the price of a bad gamble.
        const intent = meSlot.intent;
        const moving = Math.hypot(intent.moveX, intent.moveY) > 0.1;
        const sprintOk = turbo.gate(dt, intent.sprint, moving);
        ctx.setHud({ turbo: Math.round(turbo.t01 * 100) }); ring?.set(turbo.t01);
        answerSprint(ctx, intent.sprint, moving);
        // Stick-space is normalised in LocalInputSource — see PlayerSlot.
        const [mxRaw, myRaw] = camRel(ctx, intent.moveX, intent.moveY);
        // THE STANCE COSTS AND PAYS (DefensiveStance). The slide clips were already playing here and did
        // nothing to the body — a crouched defender covered ground exactly like an upright one. In a stance
        // you slide faster and go forward slower; upright it inverts, which is what makes a crossover work.
        const sitting = !!intent.intense;   // L2 HELD — 2K's intense D: sit down on him deliberately
        // the latch comes BEFORE the movement, because planting your feet has to actually take them away from you
        takingCharge = !!intent.takeCharge && meStunSec === 0 && !meFloored && myJumpAge === Infinity && defPhase !== 'over';
        const engagedStance = inStance({
          onDefense: true,
          distToMan: distXZ(me.root.position, foe.root.position),
          speed01: meSpeed01,   // last frame's push: the stance reads what the body is already doing
          disabled: meStunSec > 0 || meFloored,
          intense: sitting,
        });
        const scaled = stanceWish(new Vector3(mxRaw, 0, myRaw), me.root.rotation.y, engagedStance, sitting);
        const mx = scaled.x, my = scaled.z;
        const drib = meStunSec > 0 || takingCharge   // planted: a charge is taken standing still, or it is a block
          ? meDribble.update(dt, 0, 0, false)
          : meDribble.update(dt, mx, my, sprintOk);
        meSpeed01 = drib.speed01;
        driveBody('me', me.root, meDribble.vel, dt);
        // BIOMECH-HOOPS-WAVE1 G1: on defense the chest stays on the handler (the slide clips move the body sideways; facing
        // the travel read as a sideways-shuffling run, measured facing·travel 1.0 on every slide); the dribble layer is told
        // so a pull-back away from him stays a back-pedal with the chest on him
        const defYaw = facePlay(me.root, meDribble.vel, foe.root.position, DEFEND_FACE_RANGE, dt);
        meDribble.setFacing(defYaw);
        contact?.brace('me', intent.brace ?? false);
        meAnimTree.update({
          speedMps: Math.hypot(meDribble.vel.x, meDribble.vel.z),
          speed01: drib.speed01, crossover: false, nearestDefender: Infinity,
          hasBall: false, shooting: false, dunking: false, driving: false,
          defending: true, bracing: intent.brace ?? false, staggered: false, slideDir: slideDirFor(defYaw, meDribble.vel),
          retreat: retreatFor(me.root.position, meDribble.vel, foe.root.position), closeout: closeoutFor(me.root.position, meDribble.vel, foe.root.position, drib.speed01), intense: sitting,   // DEFENSE-LOOK
        });
        const dist = Vector3.Distance(me.root.position, foe.root.position);
        // D3: X HELD = the grounded hand-up (verticality) — a hold the tree never interrupts; re-held after a reach beat
        // …and the JUMP is the same read, one line down: the slot carries it now, so a pad, a phone, a network peer
        // and the agent bridge all reach the block through one wire (PlayerSlot.Intent.jump).
        if (intent.jump) contestJump(ctx);
        // TAKE THE CHARGE (Circle held). The charge was a one-way call: sprint through a SET defender on MY
        // possession and it was an offensive foul, but with the ball the other way the rival drove through a
        // standing player for free — there was no way to plant and nothing read it if you had. Holding it stops you
        // dead (that is the price: you are not sliding any more, and if he goes round you he is gone), and a
        // foul-speed body arriving inside a stride of a planted defender is their turnover.
        if (takingCharge) {
          chargeSetSec += dt;
          const closing = foeVelLast.length();
          if (chargeSetSec >= CHARGE_SET_SEC && distXZ(me.root.position, foe.root.position) <= CHARGE_RANGE && closing >= FOUL_CLOSING_SPEED) {
            SoundKit.play('whistle');
            swing('steal');
            ctx.setHud({ momentum });
            EffectsKit.burst(ctx.scene, me.root.position.add(new Vector3(0, 1.0, 0)), 'dust');
            ctx.feel?.impact?.(0.45);
            meAnimTree.beat('bball_contact_react', { fadeSec: 0.06 });
            foeAnimTree.beat('bball_contact_react', { fadeSec: 0.06 });
            const call = judge('charge', { offense: 'foe', fouled: 'me' });   // the ref, not the mode — see above
            bannerFlash(ctx, `${call.banner} — ${call.ball === 'me' ? 'YOUR BALL' : 'THEIR BALL'}!`, 1100);
            console.info(`[1V1-REF] ${call.id} at ${closing.toFixed(1)} m/s (set ${chargeSetSec.toFixed(2)}s) → ${call.ball}`);
            defPhase = 'over';
            later(800, () => (call.ball === 'me' ? resetPositions() : startDefense(ctx, 'THEIR BALL — DEFEND!')));
          }
        } else chargeSetSec = 0;
        const wantHandUp = !!intent.contest && myJumpAge === Infinity && meStunSec === 0 && !meFloored && defPhase !== 'over';
        if (wantHandUp !== meHandUp) { meHandUp = wantHandUp; if (meHandUp) console.info('[1V1-DEF] hand up (me)'); else meAnimTree.releaseHold(); }
        if (meHandUp && !meAnimTree.busy) meAnimTree.hold('bball_hand_up', { fadeSec: 0.14 });

        if (defPhase === 'check' || defPhase === 'drive') {
          // the rival attacks — reading ME: contained → sidestep, open → drive, held → pull-up, a jump at nothing → blow-by
          const dec = attacker.decide(dt, foe.root.position, me.root.position, RIM_FLOOR, { defenderAirborne: myJumpAge !== Infinity && myJumpAge < 0.6 });
          if (defPhase === 'check' && dec.phase !== 'check') defPhase = 'drive';
          const sp = dec.wish.length();
          foeSpeed01 = Math.min(1, sp / RIVAL_DRIVE_SPEED);
          if (dec.phase === 'gather' || dec.phase === 'stepback') { if (foeShotWin === 'none') foeShotWin = 'load'; }   // BIOMECH-HOOPS-WAVE1: the telegraph is the load
          driveBody('foe', foe.root, dec.wish, dt);
          foeVelLast.copyFrom(dec.wish);   // …on THEIR possession too: the charge and every set-vs-moving read below
                                           // were looking at a vector only ever written while I had the ball, so a
                                           // driver measured 0.0 m/s all the way to the rim (probe: driver peak 0.0).
          // a driver faces the rim through a sidestep (a crossover, not a run sideways); a blow-by runs its line
          face(foe.root, dec.phase === 'blowby' && sp > 0.5 ? Math.atan2(dec.wish.x, dec.wish.z) : Math.atan2(RIM.x - foe.root.position.x, RIM.z - foe.root.position.z));
          // the gather / step-back are mode-owned beats — the tree's loop choice must not race them (a 'protect'
          // stance played on the gather's first frame popped the hand 0.45 m)
          if (dec.phase !== 'gather' && dec.phase !== 'stepback') foeAnimTree.update({
            speedMps: sp,
            speed01: Math.min(1, sp / RIVAL_DRIVE_SPEED), crossover: false, nearestDefender: dist,
            hasBall: true, shooting: false, dunking: false, driving: dec.phase === 'blowby',
            defending: false, bracing: false, staggered: false,
          });
          if (dec.phase === 'stepback' && !stepbackShown) { stepbackShown = true; foeAnimTree.beat('bball_hesi', { fadeSec: 0.1 }); }   // the step-back reads as a check: the body loads
          if (dec.crossover) {
            // the ball SWITCHES hands — the read. A same-hand shuffle (dec.step without a crossover) keeps the dribble loop.
            foeAnimTree.beat(dec.crossover === 'left' ? 'bball_crossover_left' : 'bball_crossover_right', { fadeSec: 0.12 });
            foeCarry?.switchHand();
            SoundKit.play('whoosh', { pitch: 1.3, volume: 0.3 });
          }
          if (dec.phase === 'gather') {
            // THE TELEGRAPH: the ball comes back to the palm and the body loads for GATHER_SEC — the block cue
            if (!gatherShown) {
              gatherShown = true;
              foeCarry?.update(0, 0, false);
              if (distXZ(foe.root.position, RIM_FLOOR) < 2.2) foeAnimTree.beat('bball_layup_gather');
              else foeAnimTree.hold(SPORT_CLIP.dunkChargeGather, { fadeSec: 0.08 });
              SoundKit.play('whoosh', { pitch: 0.9, volume: 0.25 });
            }
          } else {
            foeCarry?.update(dt, Math.max(0.3, Math.min(1, sp / RIVAL_DRIVE_SPEED)), true);   // the live dribble (the check is an idle dribble)
          }

          // STEAL poke: a read, not a dice roll. The rival's crossover / weave EXPOSES the ball — poke while it crosses
          // over and it's yours; reach while they're protecting it (or gathering) and you're off your feet while they go by.
          if (intent.steal && reachCooldown === 0 && meStunSec === 0) {
            reachCooldown = REACH_COOLDOWN_SEC;
            meAnimTree.beat('bball_steal_reach', { fadeSec: 0.14 });
            // D2: inside the bump window the ball is loose in his hands — the poke connects whatever the crossover read says
            const exposure = bumpExposure(dec.exposure, bumpAge);
            if (dist < STEAL_RANGE && (dec.exposure >= STEAL_EXPOSURE_MIN || exposure >= STEAL_EXPOSURE_MIN) && dec.phase !== 'gather' && dec.phase !== 'check') {
              const onBump = bumpAge <= 0.4 && dec.exposure < STEAL_EXPOSURE_MIN;
              SoundKit.play('impact', { pitch: 1.3, volume: 0.4 });
              swing('steal');
              attacker.noteStolen();   // the rival learns: fewer crossovers in front of this defender
              ctx.setHud({ momentum });
              // the ball is knocked LOOSE toward me (no warp into a palm); the possession follows after it settles
              foeCarry?.update(0, 0, false);
              const from = ballWorld().clone(); releaseBall(ball);
              const toMe = me.root.position.subtract(foe.root.position); toMe.y = 0; toMe.normalize();
              launchLoose(from, toMe.scale(1.8).add(new Vector3(0, 1.0, 0)));
              defPhase = 'over';
              foeAnimTree.beat('bball_contact_react', { fadeSec: 0.08 });
              bannerFlash(ctx, onBump ? 'STRIPPED ON THE BUMP!' : 'PICKED THEIR POCKET!');
              console.info(`[1V1-DEF] strip by me ${onBump ? 'on the bump' : 'on the crossover'} exposure ${exposure.toFixed(2)} bumpAge ${bumpAge.toFixed(2)}`);
              later(750, () => resetPositions());
              return;
            }
            meStunSec = REACH_WHIFF_STUN_SEC;
            if (dist < 2.4) attacker.blowBy();
            SoundKit.play('whoosh', { pitch: 0.7, volume: 0.3 });
            // A REACH THROUGH THE BODY IS A FOUL — `reach_in` has been in the handbook the whole time with nothing
            // calling it. Only when you actually arrive on him at speed; a reach at thin air is a whiff, and keeps
            // the answer it always had.
            if (dist <= BODY_STANDOFF + 0.25 && meDribble.vel.length() >= REACH_FOUL_SPEED) {
              const call = judge('reach_in', { offense: 'foe', fouled: 'foe' });
              if (call.whistle) SoundKit.play('whistle');
              console.info(`[1V1-REF] ${call.id} at ${dist.toFixed(2)} m → ${call.ball}`);
              bannerFlash(ctx, `${call.banner} — ${call.ball === 'me' ? 'YOUR BALL' : 'THEIR BALL'}`, 900);
              defPhase = 'over';
              later(700, () => (call.ball === 'me' ? resetPositions() : startDefense(ctx, 'THEIR BALL — DEFEND!')));
              return;
            }
            bannerFlash(ctx, 'REACH — THEY GO BY', 700);
          }

          if (dec.shot === 'dunk') foeDunk(ctx); else if (dec.shot) releaseRival(ctx, dec.shot);   // D1: the beaten lane is a DUNK — swat it
        } else if (defPhase === 'shot') {
          // the shot is up: the rival crashes the board when the ball is loose, else holds the follow-through / a stance
          const wish = new Vector3(0, 0, 0);
          if (loose) {
            const toBall = ball.position.subtract(foe.root.position); toBall.y = 0;
            if (toBall.length() > 0.7) wish.copyFrom(toBall.normalize().scale(3.0));
          }
          driveBody('foe', foe.root, wish, dt);
          foeSpeed01 = Math.min(1, wish.length() / 3.6);
          if (wish.lengthSquared() > 0.05) face(foe.root, slewYaw(foe.root.rotation.y, Math.atan2(wish.x, wish.z), FACE_RATE, dt));
          foeAnimTree.update({
            speed01: Math.min(1, wish.length() / 3.6), crossover: false, nearestDefender: Infinity,
            hasBall: false, shooting: false, dunking: false, driving: false,
            defending: false, bracing: false, staggered: false,
          });
        }

        if (!contact?.isReady) resolveBodyCollision(me.root.position, foe.root.position);

        // Ship Pass 6: a two-point fit on a foe within arm's reach put the camera inside a body (sweep frame 2026-09-05);
        // frame a point 1.5 m past the rival toward the rim — never inside a body, and the check at the top is on screen
        // (a rim frame put the rival behind the camera at the check).
        const past = RIM_FLOOR.subtract(foe.root.position); past.y = 0;
        const look = past.lengthSquared() > 1e-4 ? foe.root.position.add(past.normalize().scale(1.5)) : foe.root.position;
        // …but NOT while you are in the air on a dunk: the right stick is the TRICK stick then, and a flick that
        // threw a windmill must not also swing the camera 90° off the rim at the moment you want to watch it.
        if (!dunking) ctx.camDirector.look(lookX, lookY, dt);
        if (camSnapPending) { camSnapPending = false; ctx.camDirector.snapTo(me.root.position, look); }
        ctx.camDirector.update(me.root.position, meDribble.vel, look);
      }

      // THE FLOOR ANSWERS A HARD STOP. Dust existed and ten modes called it — for knockdowns, tackles and
      // landings, never for STOPPING, which is the most violent thing a body does on a court on purpose.
      //
      // Two placement decisions:
      //   · DECELERATION, not a per-frame speed drop. The same cut has to puff at 30 fps and at 144, and a
      //     frame delta scales with the frame — see ScuffFx.
      //   · ONCE PER FRAME, not inside the possession branch. `meDribble` drives the body on offense AND on
      //     defense (two update() call sites), and a tick that only ran on offense would carry a stale
      //     prevSpeed across the turnover and puff for a stop that happened a possession ago. A defensive
      //     slide stopping dead is the squeak you most want anyway.
      {
        const sc = tickScuff(scuff, Math.hypot(meDribble.vel.x, meDribble.vel.z), dt, myJumpAge === Infinity && !meFloored);
        scuff = sc.state;
        if (sc.strength > 0) {
          EffectsKit.burst(ctx.scene, me.root.position.clone(), 'dust', scuffPuffScale(sc.strength));
          SoundKit.play('squeak', { volume: scuffVolume(sc.strength), pitch: 0.92 + sc.strength * 0.2 });
        }
      }

      // ── BIOMECH-HOOPS-WAVE1: this frame's hoops windows for the Posture Poses layer (read in after-animations) ──
      meLandSec = Math.max(0, meLandSec - dt); meCelebrateSec = Math.max(0, meCelebrateSec - dt);
      if (meShotWin === 'release') { meShotSec += dt; if (meShotSec >= RELEASE_SEC) meShotWin = 'follow'; }
      if (foeShotWin === 'release') { foeShotSec += dt; if (foeShotSec >= RELEASE_SEC) foeShotWin = 'follow'; }
      if (foeShotWin !== 'none' && possession === 'defense' && defPhase === 'over' && !arc.active) foeShotWin = 'none';
      const foeDist = Vector3.Distance(me.root.position, foe.root.position);
      Object.assign(meBio, {
        role: possession === 'mine' ? 'offense' : 'defense', hasBall: possession === 'mine' && carrying, speed01: meSpeed01,
        nearestDefender: foeStunSec > 0 ? Infinity : foeDist, shot: meShotWin, flight: dunkFlight, landed: meLandSec > 0, celebrate: meCelebrateSec > 0,
        reaching: meAnimTree.held === 'bball_steal_reach' || meAnimTree.held === 'bball_block_reach' || meHandUp, staggered: meStunSec > 0 && !meFloored && possession === 'defense', floored: meFloored,
        posting, spinning: !!spin,   // HOOPS-MOVE-KIT-B: the seal turns the chest AWAY from the rim; the pivot owns it through the turn
      } satisfies HoopsPostureInput);
      Object.assign(foeBio, {
        role: possession === 'mine' ? 'defense' : 'offense', hasBall: possession === 'defense' && defPhase !== 'shot' && defPhase !== 'over' && !loose, speed01: foeSpeed01,
        nearestDefender: possession === 'defense' ? foeDist : Infinity, shot: foeShotWin, flight: foeDunkFlight, landed: false, celebrate: false,
        reaching: foeAnimTree.held === 'bball_steal_reach' || foeAnimTree.held === 'bball_block_reach' || foeHandUp, staggered: foeStunSec > 0 && !foeFloored, floored: foeFloored,
      } satisfies HoopsPostureInput);
    },

    dispose() {
      meFootPlant?.dispose();
      mePosture?.dispose(); foePosture?.dispose(); mePosture = null; foePosture = null;   // BIOMECH-HOOPS-WAVE1
      meCarry?.dispose(); foeCarry?.dispose(); meCarry = null; foeCarry = null;
      contact?.dispose(); contact = null;
      shotTrail?.dispose(); shotTrail = null;
      ring?.dispose(); ring = null;
      me?.dispose(); foe?.dispose(); ball?.dispose();
      meSlot?.dispose(); foeSlot?.dispose();
      SoundKit.stopAmbient();
      hoopJuice?.dispose(); hoopJuice = null;        // A+ P0: restores any hoop material the punch swapped
      onevoneVenue?.dispose(); onevoneVenue = null;  // M74
    },
  };

  /**
   * LEAVE THE FLOOR TO CONTEST. Returns true if the jump actually happened.
   *
   * One body, two callers, and that is the whole point. It was inline in `onInput` reading the raw button stream,
   * which meant the block was the ONE defensive verb that did not travel the slot — the slide, the stance, the
   * box-out, the hand-up and the poke all read `meSlot.intent`. Invisible on a pad, because the pad feeds both
   * paths; fatal to anything else, because this mode builds its slot as `agentCtl ?? localSource` and therefore
   * bypasses local input entirely under the agent bridge. Measured before this existed: five defensive
   * possessions, five buckets conceded, zero stops.
   *
   * Calling it twice in a frame is harmless — the `myJumpAge === Infinity` gate is the latch.
   */
  function contestJump(ctx: ModeContext): boolean {
    if (possession !== 'defense' || myJumpAge !== Infinity || meStunSec > 0 || defPhase === 'over') return false;
    myJumpAge = 0;
    meAnimTree.beat('bball_block_reach');
    if (contact?.isReady) contact.hop('me', JUMP_VY);
    SoundKit.play('whoosh', { pitch: 1.2, volume: 0.35 });
    // BIOMECH-HOOPS-WAVE1 G4: a jump outside the gather is a wasted one — say so (the whiffed reach already does)
    if (attacker.phase !== 'gather') bannerFlash(ctx, 'JUMPED EARLY — WAIT FOR THE GATHER', 600);
    return true;
  }

  /** THEIR possession: the check. The rival checks up beyond the arc, I set inside him, the drive starts after
   *  CHECK_HOLD_SEC. No timer decides the release — the AttackerBrain reads my body. */
  function startDefense(ctx: ModeContext, banner: string): void {
    possessionToken++;
    possession = 'defense'; carrying = false; shooting = false; dunking = false; currentShot = null;
    defPhase = 'check'; attacker.reset(); nerveTheAttacker(); gatherShown = false; stepbackShown = false; goaltendCalled = false; paintSec = 0;
    threat = { ...THREAT_IDLE }; stickHeld = 0; stickPeak = 0; burstArmed = false; jabEligible = false; spinGather = 0; posterVictim = null;
    meMotion.reset(); foeMotion.reset();   // a check-up moves bodies metres in a frame; that is not acceleration
    myJumpAge = Infinity; meStunSec = 0; reachCooldown = 0; defContest = 0;
    arc.active = false;
    meShotWin = 'none'; foeShotWin = 'none'; dunkFlight = null; dunkFlush = null; meLandSec = 0; meCelebrateSec = 0;   // BIOMECH-HOOPS-WAVE1
    if (gather || finish || spin || posting) meAnimTree.release();   // HOOPS-MOVE-KIT-A/B: a held gather / finish / seal / pivot is lifted with the possession
    gather = null; finish = null; spin = null; posting = false; spinCooldown = 0; spinArmed = 0; pumpWindow = 0; banked = null; driveContest = null; finishFoul = false; contact?.setAirborne('me', false);
    clearDefense();
    place('foe', foe.root, CHECK_FOE, Math.PI);
    place('me', me.root, CHECK_ME, 0);
    if (!contact?.isReady) me.root.position.y = 0;
    meDribble.setFacing(0);                  // set facing the rival
    foeStunSec = 0;
    if (foeFloored) { foeFloored = false; foeAnimTree.beat('karate_get_up'); }
    else foeAnimTree.releaseHold();
    meAnimTree.releaseHold();
    giveBall('foe');
    bannerFlash(ctx, banner, 1000);
    ctx.setHud({ hint: HINT_DEFENCE, shotType: '', shotMeterT: 0 });
  }

  /** The rival's release: block check, contest (+ a hand up), the make roll, the arc. */
  function releaseRival(ctx: ModeContext, style: 'layup' | 'jumper'): void {
    defPhase = 'shot'; gatherShown = false;
    foeShotWin = 'release'; foeShotSec = 0;   // BIOMECH-HOOPS-WAVE1: release → follow-through until the arc resolves
    foeCarry?.update(0, 0, false);
    releaseBall(ball);
    // a jumper rises out of the gather hold; a layup leaves the hand at the top of the layup gather beat, which plays out
    // (a jumpshot cut in over it popped the hand 0.37 m)
    if (style === 'jumper') foeAnimTree.beat('jumpshot', { fadeSec: 0.1, onSettle: () => { if (defPhase === 'shot') foeAnimTree.beat('bball_follow_through', { fadeSec: 0.1 }); } });   // BIOMECH-HOOPS-WAVE1 G5: the rival holds his follow-through too
    // BLOCK check — a timed jump in range erases it. A jumper needs the blocker INSIDE the step-back (1.2 m — from further
    // out a hand up is a contest, below); a layup at the rim can be chased down from BLOCK_RANGE.
    const blockRange = style === 'jumper' ? 1.2 : BLOCK_RANGE;
    // distXZ, not Vector3.Distance: a blocker is in the AIR by definition here, and counting his height as distance
    // from the shooter is what made a well-timed jumper block fail (see checkBlock).
    if (checkBlock(me.root.position, foe.root.position, myJumpAge) && distXZ(me.root.position, foe.root.position) <= blockRange) {
      SoundKit.play('impact', { pitch: 0.7, volume: 0.6 });
      SoundKit.play('crowdCheer', { volume: 0.6 });
      ctx.feel?.impact?.(0.5);
      EffectsKit.burst(ctx.scene, ball.position.clone(), 'sparks');
      swing('block');
      launchLoose(ball.getAbsolutePosition(), new Vector3((Math.random() - 0.5) * 4, 2, 3));
      ctx.setHud({ momentum });
      bannerFlash(ctx, 'REJECTED!', 900);
      defPhase = 'over';
      later(1000, () => resetPositions());
      return;
    }
    // no block — my contest (distance + a hand up) and their range set the make%
    // D3: a grounded hand-up inside range facing him counts (verticality) on top of the distance and a contest jump
    const ground = groundContest(distXZ(me.root.position, foe.root.position), facingCos(me.root.rotation.y, me.root.position, foe.root.position), meHandUp);
    const contest = Math.min(1, handUpContest(contestLevel(foe.root.position, me.root.position), myJumpAge) + ground);
    defContest = contest;
    const range = distXZ(foe.root.position, RIM_FLOOR);
    // THE RIVAL FEELS THE SCORE NOW. His make chance came straight off range and contest, so he shot the
    // same at 0-0 as down 2-10 with the game gone.
    //
    // THE INVARIANT HAS TO HOLD IN THE GAME, NOT JUST IN THE MODULE. Applying nerve's `edge` upward here
    // would have made a trailing rival shoot BETTER for free, which is the exact trap Nerve exists to
    // refuse. So the two halves are split where they honestly belong: `aggression` drives
    // AttackerBrain.patience (a rival who is behind FORCES the look -- he pulls up out of a contain
    // sooner), and `mistake` DIVIDES the make chance, because a forced shot is a worse shot. Down big and
    // late he shoots more often and makes fewer, which is what chasing a game looks like.
    const nrv = nerve(rivalStanding());
    const made = Math.random() < rivalShotPct(range, contest, style) / Math.max(0.5, nrv.mistake);
    arcPoints = style === 'layup' ? 2 : isThree(foe.root.position, RIM) ? 3 : 2;
    // The RIVAL's miss has to be readable too. Measured with a probe: every rim contact in a 150 s run
    // came back "front — SHORT", because only the hero's release recorded a profile and the AI fell
    // through to the default short bias — so the iron answered identically every single time, which is
    // the exact failure the rim work existed to fix. His miss now comes off the contest and the range:
    // a hand in his face or a shot past his limit is short off the front, an open look sprays.
    shotMiss = {
      quality01: Math.max(0.15, 0.85 - contest * 0.5 - Math.max(0, range - 6) * 0.05),
      short: contest * 0.8 + Math.max(0, range - 7) * 0.12,
      lateral: (Math.random() - 0.5) * 0.9,
    };
    arc.start(ball.getAbsolutePosition(), RIM, made, style, alteredApex(contest));   // a strong contest ALTERS the release
    console.info(`[1V1-DEF] rival release ${style} contest ${contest.toFixed(2)} handUp ${ground > 0} pct ${rivalShotPct(range, contest, style).toFixed(2)}`);
    // the read at the release, before the arc lands — same as the hero's GREEN / CONTESTED tags
    if (contest >= 0.5) bannerFlash(ctx, ground > 0 ? 'CONTESTED — HAND UP!' : 'CONTESTED!', 500);
    else if (contest <= 0.15) bannerFlash(ctx, 'WIDE OPEN…', 500);
  }

  function startDunk(ctx: ModeContext, kind: 'dunk' | 'poster' | 'standing'): void {
    dunking = true; shooting = false; contactLatch = false; finishFoul = false;   // A+ P0: a fresh attempt gets one punch
    meShotWin = 'none'; dunkFlush = null; let resolved = false; dunkFlight = { k: 0, made: null };   // BIOMECH-HOOPS-WAVE1
    let trickThrown = false;                       // one trick per flight: the stick is a commitment, not a masher
    turbo.t01 = Math.max(0, turbo.t01 - 0.3);           // dunks spend fuel
    const from = me.root.position.clone();
    const landing = new Vector3(RIM.x, 0, RIM.z + DRIVE_DUNK.landAheadZ);
    // HOOPS-MOVE-KIT-A M2: the contest is a BODY in the flight's path — where the bump lands, how square he is, whether he is
    // set; the make chance follows the body (a set wall on a poster: 0.62; a late, moving one: nearer the open 0.78)
    const defenderPos = foeStunSec > 0 ? null : foe.root.position;
    const c = contestDrive(from, landing, defenderPos, defenderPos ? foeVelLast : null, kind === 'standing' ? 'dunk' : kind);
    driveContest = c;
    // SHOWTIME (owner, 2026-09-17): R2 in, the right stick held BACK on an open lane — or any contact dunk — and the
    // dunk contest's vocabulary comes to the game: a long flight with a slow hang, a side camera, and a flush you TIME.
    const showtime = showtimeAsked(kind, lookY);
    const flightTotal = showtime ? SHOWTIME_FLIGHT_MS : DRIVE_DUNK.flightMs;
    let showtimeK: number | null = null; showtimePress = false;
    // OFF THE BACKBOARD. The off-glass throw existed only in the dunk contest (DunkLob.glassLobVelocity) even
    // though 1v1 already has the square's geometry — BOARD_NORMAL, bankPoint, inBankBand and the glass button
    // that routes a bank SHOT. So the one thing missing was routing a DUNK through it. Hold the glass button
    // into the takeoff from the bank band and the ball is thrown off the square and caught at the iron: a
    // self-pass, which is what an off-the-backboard dunk actually is.
    const glassDunk = !!meSlot.intent.glass && inBankBand(me.root.position, RIM_FLOOR, BOARD_NORMAL)
      ? bankPoint(me.root.position, RIM, BOARD_NORMAL)
      : null;
    if (glassDunk) { releaseBall(ball); bannerFlash(ctx, 'OFF THE GLASS!', 700); console.info('[1V1-GLASS] off-the-backboard dunk armed'); }
    console.info(`[1V1-CONTACT] drive contest ${kind} contested ${c.contested} t ${c.t.toFixed(2)} lateral ${c.lateral.toFixed(2)} set ${c.set} pct ${c.pct.toFixed(2)}`);
    let made = Math.random() < c.pct;
    let swatted = false;
    // D1: the AI reads the takeoff — a hand up (or a live contest jump) in the lane can SWAT the dunk at the bump
    if (c.contested && defenderPos && !foeHandUp && foeBlockJumpAge === Infinity && aiHandsUp(distXZ(me.root.position, foe.root.position), facingCos(foe.root.rotation.y, foe.root.position, me.root.position), roll)) {
      foeHandUp = true; foeHandUpLeft = 1.2; foeAnimTree.hold('bball_hand_up', { fadeSec: 0.14 }); console.info('[1V1-DEF] ai hand up on the takeoff');
    }
    SoundKit.play('whoosh', { pitch: 0.85 });
    // BIOMECH-HOOPS-WAVE1 G6: the live dribble is PARKED first — the ball comes back to the palm and rides the hand through
    // the flight (it used to stay at the last bounce point on the floor while the body flew, measured ballY 0.85 through the
    // whole flight); the launch's last frame is HELD to feet-down (the 0.35 s clip ran out mid-air into the run loop)
    meCarry?.update(0, 0, false);
    if (!ball.parent) attachBallToHand(ball, me.skeleton, 'RightHand');
    // WHICH DUNK THIS DRIVE EARNED (owner, 2026-09-16). Every dunk in this mode played `dunk_launch` — the same two
    // clips off a jog down the middle and off a full-speed baseline drive through a set body — while the whole
    // authored dunk vocabulary was ALREADY on the rig: ClipScope gives `onevone` the suites ['hoops', 'dunk'], so
    // the windmill, the tomahawk, the cradle, the double clutch, the 360 and the eastbay were registered and never
    // asked for. HoopsDunks reads what the drive already knows and picks; nothing here is newly authored.
    const toRimNow2 = RIM_FLOOR.subtract(from); toRimNow2.y = 0;
    const driveDir = meDribble.vel.clone(); driveDir.y = 0;
    const speedNow = driveDir.length();
    // how much of the approach is ACROSS the ring's face rather than at it — the angle the wind-up dunks want
    const lateral01 = speedNow > 0.1 && toRimNow2.lengthSquared() > 1e-4
      ? Math.min(1, Math.abs(driveDir.x * toRimNow2.normalize().z - driveDir.z * toRimNow2.x) / speedNow)
      : 0;
    const picked = showtime ? pickShowtime({ roll, contact: kind === 'poster', momentum01: mbus.score01 }) : pickHoopsDunk({
      speed: speedNow,
      lateral01,
      contest01: c.contested ? Math.min(1, Math.max(0, 1 - Math.abs(c.lateral))) : 0,
      // A POSTER IS A SET BODY IN THE WAY, NOT MERELY A BODY NEARBY. checkDriveDunk says 'poster' for any defender
      // inside 1.5 m — and in a one-on-one the defender is ALWAYS near the rim when you drive it, so every drive
      // came back a poster, the picker's first branch won every time, and the vocabulary collapsed back to one
      // dunk: ten angled drives at 6.4 m/s with lateral 0.50 (a windmill by every other measure) all came out
      // TOMAHAWK. contestDrive already draws the distinction the animation needs — a body that is CONTESTED and
      // SET is one you go over; a late-sliding one is a shoulder you went through, and that is a windmill with
      // somebody in the frame.
      poster: kind === 'poster' && c.contested && c.set,
      momentum01: mbus.score01,
      roll,
      standing: kind === 'standing',
    });
    dunkLabel = picked.label;
    if (showtime) {   // the side camera: low, off the drive's flank, aimed at the iron
      const dir = RIM_FLOOR.subtract(from); dir.y = 0; if (dir.lengthSquared() < 1e-4) dir.set(0, 0, -1); dir.normalize();
      const right = new Vector3(dir.z, 0, -dir.x);
      ctx.camDirector.setFixed(RIM_FLOOR.add(right.scale(3.6)).add(dir.scale(-1.4)).add(new Vector3(0, 1.5, 0)), 1.7, true);
      showtimeCam = true;
      bannerFlash(ctx, kind === 'poster' ? 'SHOWTIME — OVER HIM · SQUARE AT THE RIM' : 'SHOWTIME — SQUARE AT THE RIM', 900);
      console.info(`[1V1-SHOWTIME] ${picked.label} (${picked.clip}) ${kind === 'poster' ? 'over a body' : 'open'} — time the flush`);
    }
    // THE STANDING DUNK GATHERS FIRST (DEFENSE-LOOK, 2026-09-17): a two-foot squat under the rim, then the flight.
    let gatherLeft = kind === 'standing' ? STANDING_GATHER_MS : 0;
    if (gatherLeft > 0) meAnimTree.beat('dunk_charge_gather', { fadeSec: 0.06 });
    else meAnimTree.beat(picked.clip, { holdEnd: true, speedRatio: dunkSpeedRatio(picked, flightTotal / 1000) });
    ctx.setHud({ shotType: picked.label });
    if (picked.flashy) ctx.camDirector.pulse(0.35, 0.4);
    console.info(`[1V1-DUNK] ${picked.label} (${picked.clip}) speed ${speedNow.toFixed(1)} lateral ${lateral01.toFixed(2)} contest ${(c.contested ? 1 : 0)} momentum ${mbus.score01.toFixed(2)}`);
    contact?.setAirborne('me', true);
    // the flight's own clock: real time, FROZEN for the bump's hit-stop and slowed for BUMP_SLOW_SEC after it (the velocity kill)
    const trickWin = trickWindow(c.bumpK);   // a CONTACT dunk's window rides the bump; a clean one is fixed
    let flightMs = 0, last = performance.now(), bumped = false, freezeMs = 0, slowMs = 0;
    const obs = ctx.scene.onBeforeRenderObservable.add(() => {
      const nowMs = performance.now(); const realMs = Math.min(50, nowMs - last); last = nowMs;
      const fdt = realMs / 1000;
      if (gatherLeft > 0) { gatherLeft -= realMs; if (gatherLeft <= 0) meAnimTree.beat(picked.clip, { holdEnd: true, speedRatio: dunkSpeedRatio(picked, flightTotal / 1000) }); return; }   // the squat before the two-foot flight
      let scale = 1;
      if (freezeMs > 0) { freezeMs -= realMs; scale = 0; }
      else if (slowMs > 0) { slowMs -= realMs; scale = BUMP_SLOW; }
      else if (showtime && flightMs / flightTotal >= SHOWTIME_HANG_FROM && flightMs / flightTotal <= SHOWTIME_HANG_TO) scale = SHOWTIME_HANG_SCALE;   // SHOWTIME: the hang
      flightMs += realMs * scale;
      const k = Math.min(1, flightMs / flightTotal);
      me.root.position.x = from.x + (RIM.x - from.x) * k;
      me.root.position.z = from.z + (RIM.z + DRIVE_DUNK.landAheadZ - from.z) * k;
      me.root.position.y = driveDunkY(k);
      // BIOMECH-HOOPS-WAVE1 G1/G3: the chest eases onto the iron through the flight (it kept the drive's heading — a slam
      // from a body yawed 40° off the rim); the posture windows ride the flight clock (rise / hang / extend / jam / brace)
      face(me.root, slewYaw(me.root.rotation.y, yawTo(me.root.position, RIM) + (picked.reverse ? Math.PI : 0), FACE_RIM_RATE * (picked.reverse ? 2 : 1), fdt));   // a REVERSE turns its back to the iron
      dunkFlight = { k, made: resolved ? made : null };
      // THE TRICK STICK (owner, 2026-09-16). Once the feet leave, the right stick stops being the camera orbit and
      // becomes the trick stick: a flick asks for a trick and WHEN you threw it decides whether you get it. The
      // window rides the FLIGHT clock, so the hit-stop and the bump's slow motion — which stretch a dunk's real
      // duration by a third — cannot silently move the target.
      if (showtime) {
        ctx.setHud({ shotMeterT: showtimeMeterT(k) });
        if (showtimeK === null && (showtimePress || k >= SHOWTIME_DEADLINE_K)) {
          const j = showtimePress ? judgeShowtime(k) : 'none'; showtimePress = false; showtimeK = k;
          made = roll() < SHOWTIME_PCT[j] * (kind === 'poster' ? Math.max(0.6, c.pct) : 1);
          if (j === 'perfect') { ctx.juice.hitStop(70); ctx.camDirector.pulse(0.7, 0.45); SoundKit.play('crowdCheer', { volume: 0.6 }); }
          bannerFlash(ctx, j === 'perfect' ? `${picked.label} — PERFECT!` : j === 'good' ? `${picked.label}!` : j === 'early' ? 'EARLY — OFF THE FRONT' : j === 'late' ? 'LATE — OFF THE BACK' : picked.label, 800);
          console.info(`[1V1-SHOWTIME] flush ${j} at k ${k.toFixed(2)} made ${made}`);
        }
      }
      // SHOWTIME: the victim RIDES the flight — bowled back along his fall line from the bump to the release, a little off the floor
      if (posterVictim && !posterVictim.released && posterVictim.plant && posterVictim.fall && c.bumpK !== null && k > c.bumpK) {
        const ride = posterRide(c.bumpK, POSTER_RELEASE_K, k);
        foe.root.position.x = posterVictim.plant.x + posterVictim.fall.x * 0.16 * POSTER_RIDE_SHARE * ride.s;
        foe.root.position.z = posterVictim.plant.z + posterVictim.fall.z * 0.16 * POSTER_RIDE_SHARE * ride.s;
        if (!contact?.isReady) foe.root.position.y = ride.lift;
        if (!posterVictim.reacted && ride.s > 0.35) { posterVictim.reacted = true; foeAnimTree.beat('bball_contact_react', { fadeSec: 0.05, holdEnd: true }); }
      }
      if (!trickThrown && !showtime) {
        const asked = trickFromFlick(lookX, lookY);
        if (asked) {
          trickThrown = true;
          const judge = judgeFlick(k, trickWin);
          const spec = STICK_TRICK[asked];
          if (judge === 'green') {
            const onTheBump = c.bumpK !== null;
            made = roll() < trickPct(c.pct, asked, judge) + (onTheBump ? CONTACT_TRICK_BONUS : 0);
            meAnimTree.beat(spec.clip, { holdEnd: true, speedRatio: dunkSpeedRatio({ clip: spec.clip, label: spec.label, sec: 0.7, flashy: true }, flightTotal / 1000) });
            ctx.setHud({ shotType: spec.label });
            ctx.camDirector.pulse(0.4, 0.45);
            SoundKit.play('whoosh', { pitch: 1.3, volume: 0.45 });
            bannerFlash(ctx, onTheBump ? `${spec.label} ON HIM!` : spec.label, 900);
          } else {
            // a trick you could not land is a decision with a price — that is what makes throwing one mean anything
            made = roll() < trickPct(c.pct, asked, judge);
            bannerFlash(ctx, judge === 'early' ? 'TOO EARLY!' : 'TOO LATE!', 700);
          }
          resolved = true;
          console.info(`[1V1-DUNK] trick ${asked} ${judge} at k ${k.toFixed(2)} (window ${trickWin.from.toFixed(2)}-${trickWin.to.toFixed(2)}, bump ${c.bumpK === null ? 'none' : c.bumpK.toFixed(2)}) → ${made ? 'MADE' : 'MISSED'}`);
        }
      }
      // M2: the bodies meet — the bump
      if (!bumped && c.bumpK !== null && k >= c.bumpK) {
        bumped = true; freezeMs = 45; slowMs = BUMP_SLOW_SEC * 1000;
        // D1: a hand up (or a contest jump) on a set body squarely in the lane can SWAT it — the ball knocked loose HERE
        const handUp = foeHandUp || foeBlockJumpAge <= HAND_UP_SEC;
        const swatChance = aiBlockChance('dunk', 0, handUp, c.set, c.strength01);
        if (swatChance > 0 && roll() < swatChance) {
          swatted = true; made = false; carrying = false;   // the ball is LOOSE — an active carry re-attached it to my palm at feet-down (a 3 m warp)
          const at = ballWorld().clone(); releaseBall(ball);
          launchLoose(at, c.dir.scale(-2.2).add(new Vector3((Math.random() - 0.5) * 2, 1.3, 0)));
          SoundKit.play('impact', { pitch: 0.7, volume: 0.6 }); SoundKit.play('crowdGroan', { volume: 0.5 });
          ctx.feel?.impact?.(0.5); ctx.juice.shake(0.1, 120);
          foeAnimTree.beat('bball_block_reach', { fadeSec: 0.06 });
          console.info(`[1V1-DEF] ai swat at the bump chance ${swatChance.toFixed(2)}`);
        } else driveBump(ctx, c, made && kind === 'poster', (1 - k) * flightTotal > 320);
      }
      // the victim goes down once the ball is past him — held through the rise, released at the FLUSH, so the
      // fall lands after the ball is through rather than at the moment of contact
      if (posterVictim && k >= POSTER_RELEASE_K) posterVictimRelease(ctx);
      // the self-pass: out to the square on the way up, back to the iron to meet the hand
      if (glassDunk) {
        const g = Math.min(1, k / 0.55);
        if (k < 0.55) ball.position.copyFrom(Vector3.Lerp(from.add(new Vector3(0, 1.2, 0)), glassDunk, g));
        else ball.position.copyFrom(Vector3.Lerp(glassDunk, RIM, Math.min(1, (k - 0.55) / 0.35)));
      }
      if (!resolved && !swatted && k >= DRIVE_DUNK.resolveK) {
        // G6: the slam resolves AT THE IRON — the ball leaves the hand at the rim; a make flushes through the net, a miss
        // clanks off the front (it used to let go on the feet-down frame, from a hand at hip height, and float there)
        resolved = true;
        const releasePos = ball.getAbsolutePosition().clone(); releaseBall(ball);
        if (made) dunkFlush = { releasePos, since: 0, kind: kind === 'poster' ? 'poster' : showtime ? 'showtime' : 'dunk' };
        else { missClank(ctx); launchLoose(releasePos, clankOffRim(ball, RIM)); }
      }
      if (k < 1) return;
      ctx.scene.onBeforeRenderObservable.remove(obs);
      dunking = false; dunkFlight = null; meLandSec = LAND_SEC; driveContest = null;
      if (showtimeCam) { showtimeCam = false; ctx.camDirector.toggle(); ctx.camDirector.snapTo(me.root.position, RIM); }   // POLISH: a cut back, not a lerp from the side camera   // SHOWTIME: the follow camera comes back at feet-down
      if (showtime) ctx.setHud({ shotMeterT: 0 });
      contact?.setAirborne('me', false);
      meAnimTree.beat(SPORT_CLIP.dunkLandCrouch, { fadeSec: 0.08 });   // G5: feet-down is the land crouch, never an idle flash
      meDribble.setFacing(me.root.rotation.y);
      const fouled = finishFoul; finishFoul = false;
      if (made) {
        // A DUNK IS WORTH TWO. The comment above TARGET_SCORE records the
        // scoring scale being fixed from "1 inside the paint, 2 outside" to real
        // 2s and 3s — but only the JUMP SHOT path was updated. The dunk kept
        // awarding 1, so the best shot in basketball stayed worth half a jumper,
        // the exact bug that fix was written to remove. 3v3 had it too.
        myScore += 2;
        const posterized = kind === 'poster';
        swing(posterized ? 'posterize' : 'highlight_dunk');
        ctx.camDirector.pulse(posterized ? 0.85 : 0.6, 0.5);
        SoundKit.play('score', { pitch: 0.9 });
        SoundKit.play('crowdCheer', { volume: posterized ? 0.8 : 0.5 });
        contactPunch(ctx);   // A+ P0: hit-stop + shake + flash + the ONE slam thud + HoopJuice (replaces the bare feel.impact, which was a second thud)
        EffectsKit.burst(ctx.scene, RIM, 'net');
        if (posterized && !foeFloored) {   // M2: a contested poster put him down AT THE BUMP; an uncontested one drops him here
          foeStunSec = 1.4; foeFloored = true;
          foeAnimTree.beat(SPORT_CLIP.karateKnockdown, { settleTo: { clip: 'karate_floor_hold' } });
      SoundKit.play('thud', { volume: 0.8 });   // a body hits the floor; a floor does not ring
          EffectsKit.burst(ctx.scene, foe.root.position.add(new Vector3(0, 0.3, 0)), 'dust');
        }
        ctx.setHud({ score: myScore, momentum });
        bannerFlash(ctx, fouled ? (posterized ? 'POSTERIZED — AND ONE!' : 'THROWN DOWN — AND ONE!') : posterized ? 'POSTERIZED!' : 'THROWN DOWN!', 1000);
        carrying = false;   // BIOMECH-HOOPS-WAVE1: the ball is in the net, not in the hand — the reset hands it back (an active carry would have snatched it out of the flush)
        if (checkGameOver(ctx)) return;
        later(posterized ? 1500 : 900, () => resetPositions());   // a posterized body gets up before it is moved
      } else {
        SoundKit.play('miss');
        SoundKit.play('crowdGroan', { volume: 0.4 });
        // the clank and the loose ball fired at the resolve (k 0.55), off the front of the iron — BIOMECH-HOOPS-WAVE1 G6
        if (fouled) { bannerFlash(ctx, 'FOULED AT THE RIM — BALL BACK', 1000); later(900, () => resetPositions()); }
        else if (swatted) { swing('turnover'); ctx.setHud({ momentum }); bannerFlash(ctx, 'SWATTED AT THE RIM!', 1000); later(900, () => boardRace(ctx)); }   // D1: the ball went loose at the bump — the board decides
        else {
          bannerFlash(ctx, kind === 'poster' ? 'STUFFED AT THE RIM!' : 'RATTLED OUT');
          later(900, () => startDefense(ctx, 'THEIR BALL — CHECK UP, DEFEND!'));
        }
      }
    });
  }

  // ── HOOPS-MOVE-KIT-A (2026-09-08): M1 the gather, M2 the bump, M3 the finish ────────────────────────────────────────
  /** M1: the jumper. A moving body GATHERS (the pull-up plant, or the step-back under a contest with the stick pulled off
   *  the rim) on the authored gather clip while the meter runs; a set body rises at once. */
  function startRise(ctx: ModeContext, contest: number, mx: number, my: number): void {
    const toRim = RIM_FLOOR.subtract(me.root.position); toRim.y = 0; toRim.normalize();
    const plan = planGather(meDribble.vel, me.root.position, RIM_FLOOR, contest, stickBack01(mx, -my, toRim));
    // THE SPIN ALREADY GATHERED. Its exit squares you at the rim with your feet under you, so paying the
    // gather again is charging twice for footwork you have done — and it is what made the spin dead-end
    // into a separate shot input instead of flowing into one. Inside the spin's window the body rises at
    // once, which is the reward for the move.
    const gathered = spinGather > 0;
    if (gathered) {
      spinGather = 0;
      shotMeter.start(contest, currentShot?.style ?? 'jumper', 0);
      gather = null;
      beginRise();
      ctx.setHud({ shotType: `${currentShot?.label ?? 'JUMPER'} — OFF THE SPIN` });
      console.info('[1V1-HANDLE] spin gather consumed — rising at once');
      return;
    }
    shotMeter.start(contest, currentShot?.style ?? 'jumper', plan.sec);
    if (plan.sec > 0) {
      gather = { plan, t: 0 };
      meShotWin = 'gather'; meShotSec = 0;
      // A STEP-BACK IS NOT A PULL-UP. Every gather kind played the pull-up's clip, so a step-back — which the mode
      // drives BACKWARDS at STEPBACK_SPEED — was a body sliding away from the rim in a pull-up's planted pose,
      // with nothing pushing it. Each kind gets its own gather now.
      const gatherClip = plan.kind === 'stepback' ? 'bball_stepback_gather' : 'bball_pullup_gather';
      const clipSec = me.animator.durationOf(gatherClip) ?? 0.3;
      meAnimTree.beat(gatherClip, { holdEnd: true, fadeSec: 0.06, speedRatio: clipSec / plan.sec });
      SoundKit.play('whoosh', { pitch: 1.0, volume: 0.2 });
      console.info(`[1V1-MOVE] gather ${plan.kind} ${plan.sec.toFixed(2)} s from ${plan.v0.length().toFixed(1)} m/s`);
    } else { gather = null; beginRise(); }
    ctx.setHud({ shotType: gatherLabel(plan.kind, currentShot?.label ?? 'JUMPER') });
  }
  /** The rise: the jumpshot HELD, paced so its release frame lands on the meter's green (ShotReleaseSync) — after the gather. */
  function beginRise(): void {
    meShotWin = 'load'; meShotSec = 0;   // BIOMECH-HOOPS-WAVE1: the shot's posture clock
    riseHop = { t: 0, dur: shotMeter.riseSec + 0.32 };   // leave the floor with the rise, land a beat after the release
    const clipSec = me.animator.durationOf('jumpshot') ?? 1.0;
    const greenInRise01 = (shotMeter.greenCenter01 * shotMeter.durationSec - shotMeter.gatherSec) / shotMeter.riseSec;
    meAnimTree.hold('jumpshot', { speedRatio: syncedShotSpeed(clipSec, shotMeter.riseSec, greenInRise01, releaseFrameOf(me.animator, 'jumpshot', RELEASE_FRAME_01)), fadeSec: 0.08 });
  }
  /** M3: a layup / floater. The ball into the finishing hand (the side the drive comes from, or away from the defender),
   *  the finish clip paced so its release key (the top of the hop) is the green, the body strides the last step and hops. */
  function startFinish(ctx: ModeContext, style: FinishStyle, contest: number, defenderPos: Vector3 | null, sideIn?: 'left' | 'right', preSec = 0): void {
    // HOOPS-MOVE-KIT-B M5: a hook shoots with the hand AWAY from him (the off shoulder is the shield) — and that shield is
    // worth something before the ball even leaves: the contest that reaches the meter is cut.
    // Wave 2: `sideIn` is the hand the FOOTWORK ended on (the euro's crossing hand, the step-through's shoulder) and
    // `preSec` is the meter that footwork already spent — the clip is paced to what is LEFT before the green.
    const side = sideIn ?? (style === 'layup' ? pickLayupSide(me.root.position, RIM_FLOOR, me.root.rotation.y, defenderPos)
      : style === 'hook' ? pickHookSide(me.root.position, RIM_FLOOR, me.root.rotation.y, defenderPos)
      : style === 'reverse' ? reverseSide(me.root.position, RIM_FLOOR, me.root.rotation.y, meDribble.vel) : 'right');
    meCarry?.update(0, 0, false);
    attachBallToHand(ball, me.skeleton, side === 'left' ? 'LeftHand' : 'RightHand');
    if (preSec <= 0) shotMeter.start(style === 'hook' ? hookShield(contest) : contest, style);   // a footwork gather already started it
    // M4: the fade's escape line — off the defender when he is on me, straight off the rim otherwise
    const plan = planFinish(style, side, shotMeter.durationSec, shotMeter.greenCenter01,
      // the DIRECTION of the fade reaches the body here: without it a "BASELINE FADE — LEFT" drifted straight
      // back like every other fade and the two shots were one shot with different HUD text
      style === 'fadeaway' ? postFadeAway(me.root.position, RIM_FLOOR, defenderPos, currentShot?.drift ?? 'none') : undefined, preSec);
    finish = { plan, t: 0, released: false };
    posting = false;
    meShotWin = style === 'fadeaway' ? 'fade' : style === 'hook' ? 'hook' : 'gather'; meShotSec = 0;
    if (style === 'reverse') banked = bankPoint(me.root.position, RIM, BOARD_NORMAL);   // M11/M12: a reverse is laid off the glass
    meAnimTree.beat(plan.clip, { holdEnd: true, fadeSec: 0.06, speedRatio: plan.speedRatio });
    contact?.setAirborne('me', true);
    SoundKit.play('whoosh', { pitch: 1.1, volume: 0.25 });
    ctx.setHud({ shotType: FINISH_LABEL[style][side] });
    console.info(`[1V1-MOVE] finish ${style} ${side} release ${plan.releaseSec.toFixed(2)} s hop ${plan.hopSec.toFixed(2)} s`);
  }
  /** The finish in flight: the stride to the rim until the release, the hop to feet-down, then the tree's loop. */
  function stepFinish(dt: number): void {
    if (!finish) return;
    finish.t += dt;
    const k = finish.t / finish.plan.hopSec;
    // HOOPS-MOVE-KIT-B M4: a fadeaway does not stride at the rim — it GIVES GROUND, ballistically, from the push-off to
    // feet-down (fadeDrift), which is the separation the shot exists to buy.
    driveBody('me', me.root, finish.plan.style === 'fadeaway' ? fadeDrift(finish.plan) : finishStride(finish.plan.style, me.root.position, RIM_FLOOR, finish.released), dt);
    me.root.position.y = finishHopY(finish.plan.style, k);
    if (k < 1) return;
    me.root.position.y = 0;
    if (meShotWin === 'fade' || meShotWin === 'hook') { meShotWin = 'follow'; meShotSec = 0; }   // the lean / the sweep holds to feet-down, then the follow-through
    finish = null;
    contact?.setAirborne('me', false);
    meAnimTree.release();   // the landing key → the loop the game asks for
    meDribble.setFacing(me.root.rotation.y);
  }
  // ── HOOPS-MOVE-KIT-B wave 2 (2026-09-08): M7–M14 ──────────────────────────────────────────────────────────────────
  /** The FACE-UP read at the squeeze (M7 / M10 / M11): a drive across the rim finishes REVERSE off the glass, a body in
   *  the way in the paint is a RUNNING HOOK over him, a protected rim is a FLOATER over the length rather than a layup
   *  driven into a chest. 'none' leaves KIT-A's classifier exactly as it was. */
  function faceUpRead(defenderPos: Vector3 | null): PostShot {
    if (isReverseFinish(me.root.position, RIM_FLOOR, meDribble.vel)) return 'reverse';
    const onMe = defenderPos ? distXZ(me.root.position, defenderPos) : Infinity;
    // he is on my HIP: hook over him. He is waiting AT the rim: float it over him. Same read, two shots — and the order
    // matters (with the hook first it took every floater in the paint).
    if (onMe <= HOOK_ON_ME && runningHook(meDribble.vel, me.root.position, RIM_FLOOR, defenderPos)) return 'hook';
    // the floater over length only takes shots that were NOT layups: inside the layup band a drive still finishes at the
    // rim (KIT-A M3 — the contest and the block are what punish driving into a chest, not a silent style swap)
    if (distXZ(me.root.position, RIM_FLOOR) >= 2.2 && rimProtected(me.root.position, RIM_FLOOR, defenderPos)) return 'floater';
    return 'none';
  }
  /** M8 / M13 / M14: the FOOTWORK squeezes — a step-through inside the pump window, a euro when the stick sells a side
   *  against help, a hop step off an explosive gather. Each is a GatherPlan with real legs that ends IN a finish; the
   *  meter runs through the footwork exactly as it runs through the pull-up's plant. Returns whether one took the squeeze. */
  function startFootwork(ctx: ModeContext, mx: number, my: number, defenderPos: Vector3 | null): boolean {
    const contest = contestLevel(me.root.position, defenderPos);
    const yaw = me.root.rotation.y;
    const dist = distXZ(me.root.position, RIM_FLOOR);
    let plan: GatherPlan | null = null;
    if (pumpWindow > 0 && defenderPos && dist < 5.4) plan = planStepThrough(me.root.position, RIM_FLOOR, yaw, defenderPos);   // M8
    else if (euroAvailable(meDribble.vel, me.root.position, RIM_FLOOR, defenderPos)) {                                        // M14
      const sell = euroSell(mx, -my, yaw);
      if (sell) plan = planEuro(me.root.position, RIM_FLOOR, yaw, sell, rimProtected(me.root.position, RIM_FLOOR, defenderPos) ? 'floater' : 'layup');
    }
    // M13: the explosive two-foot gather. The face-up READS beat it — a body on my hip is a hook over him, a body sitting
    // at the rim is a floater over him, a drive across the rim is a reverse — because hopping into a chest is not a move.
    // With none of those on, an explosive squeeze is a HOP STEP. (Without this order the hop swallowed every driving
    // squeeze at full stick: 5 of 5 running-hook attempts; with the order inverted it never fired at all in 1v1, where
    // the on-ball defender is on the line the whole way.)
    const read = faceUpRead(defenderPos);
    const onMeNow = defenderPos ? distXZ(me.root.position, defenderPos) : Infinity;
    const hopBeaten = read === 'reverse' || read === 'floater' || (read === 'hook' && onMeNow <= HOOK_ON_ME);
    // … and a stick pulled AWAY from the rim is asking for a STEP-BACK (KIT-A M1) or a FADE, never a hop: a hop step goes
    // forward by definition (measured: the KIT-A step-back scenario came out HOP STEP in 3v3).
    const toRimNow = new Vector3(RIM_FLOOR.x - me.root.position.x, 0, RIM_FLOOR.z - me.root.position.z).normalize();
    const pullingBack = stickBack01(mx, -my, toRimNow) >= STEPBACK_STICK_BACK_MIN;
    if (!plan && !hopBeaten && !pullingBack && meSlot.intent.sprint && dist < HOP_RANGE && meDribble.vel.length() > 2.0) {
      plan = planHopStep(meDribble.vel, me.root.position, RIM_FLOOR, dist < 2.8 ? 'layup' : 'rise');
    }
    if (!plan) return false;
    shooting = true;
    shotContest = contest;
    pumpWindow = 0;
    meCarry?.update(0, 0, false);
    if (!ball.parent) attachBallToHand(ball, me.skeleton, 'RightHand');
    currentShot = plan.then === 'rise' ? classifyShot(me.root.position, meDribble.vel, RIM, contest) : { style: plan.then as ShotStyle, label: gatherLabel(plan.kind, 'FINISH'), pctMod: plan.then === 'floater' ? 1.0 : 1.18, drift: 'none' };
    shotMeter.start(contest, currentShot.style, plan.sec);
    gather = { plan, t: 0 };
    meShotWin = 'footwork'; meShotSec = 0;
    // THE EURO'S CLIP FOLLOWS THE SIDE IT SELLS. This picked by `plan.kind` alone, so a euro that sold LEFT still
    // played the sell-right shape and the body went one way while the move went the other. `plan.side` is the
    // CROSSING hand, so the sell is its opposite.
    const clip = plan.kind === 'stepthrough' ? 'bball_step_through'
      : plan.kind === 'hop' ? 'bball_hop_step'
      : plan.side === 'left' ? 'bball_euro_step' : 'bball_euro_step_left';
    const clipSec = me.animator.durationOf(clip) ?? plan.sec;
    meAnimTree.beat(clip, { holdEnd: true, fadeSec: 0.06, speedRatio: clipSec / plan.sec });
    SoundKit.play('whoosh', { pitch: 1.15, volume: 0.3 });
    ctx.setHud({ shotType: gatherLabel(plan.kind, currentShot.label) });
    console.info(`[1V1-MOVE] footwork ${plan.kind} ${plan.sec.toFixed(2)} s → ${plan.then} ${plan.side ?? ''} travel ${gatherTravel(plan).toFixed(2)} m`);
    aiContestLoad(ctx);
    return true;
  }
  /** M8: the PUMP FAKE — the trigger came up before the meter had run PUMP_MAX_SEC. The ball goes back to the chest, the
   *  shot is off, and a contesting body inside range can LEAVE ITS FEET (he bit) — which opens the step-through window. */
  function pumpFake(ctx: ModeContext, defPos: Vector3 | null): void {
    shooting = false; gather = null; currentShot = null;
    shotMeter.active = false;
    meShotWin = 'pump'; meShotSec = 0;
    pumpWindow = STEP_THROUGH_SEC;
    meAnimTree.beat('bball_pump_fake', { fadeSec: 0.06 });
    SoundKit.play('whoosh', { pitch: 1.3, volume: 0.25 });
    const bit = !!defPos && foeStunSec === 0 && !foeFloored && distXZ(me.root.position, defPos) <= PUMP_BITE_RANGE && roll() < PUMP_BITE_CHANCE;
    if (bit) {
      foeStunSec = PUMP_BITE_STUN;
      foeAnimTree.beat('bball_block_reach');
      if (contact?.isReady) contact.hop('foe', JUMP_VY);
      SoundKit.play('whoosh', { pitch: 0.9, volume: 0.4 });
    }
    ctx.setHud({ shotType: '', shotMeterT: 0 });
    bannerFlash(ctx, bit ? 'HE BIT THE PUMP!' : 'PUMP FAKE', 500);
    console.info(`[1V1-MOVE] pump fake bit ${bit}`);
  }

  // ── HOOPS-MOVE-KIT-B (2026-09-08): M4–M6's path (the seal) and M6 (the pivot) ──────────────────────────────────────
  /** The POST-UP: L1/LT held with a body to back down inside the post band seals him — the BACK to the basket (the chest
   *  turned away, slewed), the authored seal HELD, and the stick becomes a slow back-down / a shuffle along the lane
   *  (postWish) instead of a drive. Swing the stick ACROSS the body and it is a quick spin off his shoulder (M6). */
  function updatePost(ctx: ModeContext, dt: number, mx: number, my: number, defPos: Vector3 | null): boolean {
    const plant = !!meSlot.intent.brace && carrying && !shooting && !dunking && !finish && !gather;
    // HOOPS-MOVE-KIT-B M9: L1 is PLANT YOUR FOOT. With a body to back down inside the band it is the post seal (M4–M6);
    // anywhere else it is TRIPLE THREAT — the feet stop and the stick swung across turns you on the planted foot (a front
    // pivot opens to the stick; swung across AND back it is a reverse pivot, through your own back). No travel either way.
    const want = plant && canPostUp(me.root.position, RIM_FLOOR, defPos);
    if (plant && !want) {
      if (posting) { posting = false; meAnimTree.releaseHold(); }
      if (meDribble.vel.length() < PIVOT_MAX_SPEED && spinCooldown <= 0) {
        const pv = pivotFrom(mx, -my, me.root.rotation.y);
        if (pv) { startSpin(ctx, defPos, pv.side, pv); return true; }
      }
      meDribble.vel.scaleInPlace(0);   // the plant foot is down: a triple-threat body does not drift
      return true;
    }
    if (want !== posting) {
      posting = want;
      if (posting) { meAnimTree.hold('bball_post_up', { fadeSec: 0.12 }); SoundKit.play('whoosh', { pitch: 0.7, volume: 0.2 }); console.info('[1V1-MOVE] post up'); }
      else meAnimTree.releaseHold();
    }
    if (!posting) return false;
    // the stick swung across the body out of the seal is the QUICK SPIN (M6)
    // the quick spin is read against the LANE (the post's own facing), not the body's transient yaw: through the turn-around
    // into the seal the live yaw sweeps past perpendicular, and a stick held straight at the rim read as fully lateral
    // there — every back-down fired a spin one frame in (measured). And a seal that has not settled cannot spin out of
    // itself yet.
    const seal = postYaw(me.root.position, RIM_FLOOR);
    const settled = Math.abs(Math.atan2(Math.sin(me.root.rotation.y - seal), Math.cos(me.root.rotation.y - seal))) < 0.6;
    const side = postSpinSide(mx, -my, seal);
    if (settled && side && spinCooldown <= 0) { startSpin(ctx, defPos, side); return true; }
    const yaw = slewYaw(me.root.rotation.y, seal, FACE_RIM_RATE, dt);
    face(me.root, yaw); meDribble.setFacing(yaw);
    const toRim = RIM_FLOOR.subtract(me.root.position); toRim.y = 0; toRim.normalize();
    const wish = postWish(mx, -my, toRim);
    // the movement layer keeps ramping toward the stick while the seal holds it to a back-down — let go of L1 at full
    // stick and the stored 6 m/s would fire the body out of the post on the frame. The seal IS the velocity.
    meDribble.vel.copyFrom(wish);
    driveBody('me', me.root, wish, dt);
    return true;
  }
  /** M6: the SPIN. The foot plants on his side and the body swings a full turn around it (an eased, monotonic pivot — never
   *  a snap) while the root ARCS around that foot and carries out the far side on the exit line; the exit hands the drive
   *  its speed back, so the move ends IN a finish rather than in a standstill. */
  function startSpin(ctx: ModeContext, defPos: Vector3 | null, side?: 'left' | 'right', pivotRead?: { side: 'left' | 'right'; reverse: boolean }): void {
    if (spin || shooting || dunking || finish || gather) return;
    // M9: a PIVOT is the same machinery with a shorter sweep and NO travel — the planted foot never moves
    const plan = pivotRead ? planPivot(me.root.position, me.root.rotation.y, pivotRead.side, pivotRead.reverse)
      : planSpin(me.root.position, me.root.rotation.y, RIM_FLOOR, defPos, side);
    spin = { plan, t: 0, beat: !!pivotRead };   // a pivot has no shoulder-clear beat: nobody was beaten
    spinClip = pivotRead ? 'bball_pivot' : 'bball_spin';
    spinCooldown = SPIN_COOLDOWN_SEC;
    if (posting) { posting = false; }
    meCarry?.update(0, 0, false);   // the ball comes into the hands for the turn (the clip holds it at the chest)
    if (!ball.parent) attachBallToHand(ball, me.skeleton, 'RightHand');
    const clipSec = me.animator.durationOf(spinClip) ?? plan.sec;
    meAnimTree.beat(spinClip, { holdEnd: true, fadeSec: 0.06, speedRatio: clipSec / plan.sec });
    SoundKit.play('whoosh', { pitch: pivotRead ? 0.95 : 1.25, volume: pivotRead ? 0.2 : 0.35 });
    if (pivotRead) bannerFlash(ctx, pivotRead.reverse ? 'REVERSE PIVOT' : 'PIVOT', 400);
    console.info(`[1V1-MOVE] ${pivotRead ? (pivotRead.reverse ? 'reverse pivot' : 'front pivot') : 'spin'} ${plan.side} yaw ${plan.yaw0.toFixed(2)} sweep ${(plan.sweep * 180 / Math.PI).toFixed(0)}°`);
  }
  function stepSpin(ctx: ModeContext, dt: number): void {
    if (!spin) return;
    spin.t += dt;
    const t = Math.min(spin.t, spin.plan.sec);
    const target = spinPos(spin.plan, t);
    const to = new Vector3(target.x - me.root.position.x, 0, target.z - me.root.position.z);
    driveBody('me', me.root, dt > 1e-4 ? to.scale(1 / dt) : to, dt);   // the arc as a velocity: physics and the kinematic path agree
    face(me.root, spinYaw(spin.plan, t));
    if (!spin.beat && t >= spin.plan.sec * SPIN_BEAT_K) {
      spin.beat = true;
      ctx.feel?.impact?.(0.22); ctx.juice.shake(0.05, 90);
      SoundKit.play('whoosh', { pitch: 0.85, volume: 0.45 });
      const beaten = foeStunSec === 0 && !foeFloored && Vector3.Distance(me.root.position, foe.root.position) <= SPIN_TRIGGER_RANGE + 0.5;
      if (beaten) { foeStunSec = SPIN_STUN_SEC; foeAnimTree.beat('bball_contact_react', { fadeSec: 0.06 }); }
      bannerFlash(ctx, beaten ? 'SPIN — BEAT HIM!' : 'SPIN!', 500);
      console.info(`[1V1-MOVE] spin shoulder clear beaten ${beaten}`);
    }
    if (spin.t < spin.plan.sec) return;
    const exitYaw = Math.atan2(spin.plan.exit.x, spin.plan.exit.z);
    face(me.root, exitYaw);
    meDribble.setFacing(exitYaw);
    // M6 the spin comes out INTO the drive; M9 a pivot is a turn in place — it hands nothing back, the feet are still set
    meDribble.vel.copyFrom(spinClip === 'bball_pivot' ? new Vector3(0, 0, 0) : spin.plan.exit.scale(SPIN_EXIT_SPEED));
    spin = null;
    meAnimTree.release();
    // "SPIN MOVE GATHERS" — the spin used to DEAD-END here: it finished, spinCooldown armed, and the
    // player had to start a fresh shot input, which is the exact opposite of a chain. The exit is already
    // squared at the rim with the feet under me, so it flows straight into the gather: the spin becomes a
    // chain link that sets your feet rather than a move you recover from.
    if (gathersIntoShot('spin')) {
      chain = pushChain('spin', chain, handle);
      spinGather = SPIN_GATHER_SEC;
      console.info(`[1V1-HANDLE] spin gathers — chain ${chain.length}, window ${SPIN_GATHER_SEC}s`);
    }
  }

  /** M2: a hard hit on the floor READS on the body that took it (the solver already bleeds the runner's momentum) — never on
   *  a body the dunk's own bump is handling, never on a floored one, never on a body inside a held beat (the follow-through,
   *  a reach: a react cut the held follow-through, measured). */
  function hardHit(ctx: ModeContext, attacker: string, victim: string, closing: number): void {
    SoundKit.play('impact', { pitch: 1.0, volume: 0.3 });
    ctx.feel?.impact?.(0.25);
    if (dunking || closing < HARD_CONTACT_SPEED) return;
    let react = false;
    if (victim === 'foe' && foeStunSec === 0 && !foeFloored && !foeAnimTree.busy) { foeAnimTree.beat('bball_contact_react', { fadeSec: 0.06 }); react = true; }
    else if (victim === 'me' && meStunSec === 0 && !shooting && !finish && !gather && meShotWin === 'none' && !meAnimTree.busy) { meAnimTree.beat('bball_contact_react', { fadeSec: 0.06 }); react = true; }
    ctx.juice.shake(0.05, 80);
    console.info(`[1V1-CONTACT] hard ${attacker} → ${victim} ${closing.toFixed(1)} m/s react ${react}`);
  }
  /** M2: the bodies meet in the flight — hit-stop micro (the flight clock freezes with the clips), the thud, the shove or
   *  the knockdown. CONTACT you feel before the iron, not a make% number. */
  function driveBump(ctx: ModeContext, c: DriveContest, floorHim: boolean, banner: boolean): void {
    // WHAT KIND of dunk the contact makes this. The distinction decides whether the victim is pulled into
    // the animation at all: a late-sliding body is a shoulder you went THROUGH and dragging him under the
    // rim would read as a teleport, while a SET body is a man you went OVER.
    const kind = dunkKindFor({ strength01: c.strength01, set: c.set, present: true });
    ctx.juice.hitStop(contactHitStopMs(kind));
    ctx.juice.shake(kind === 'body_bag' ? 0.13 : 0.08, kind === 'body_bag' ? 150 : 110);
    ctx.feel.impact(kind === 'body_bag' ? 0.5 : 0.3);
    SoundKit.play('impact', { pitch: kind === 'body_bag' ? 0.82 : 0.95, volume: kind === 'body_bag' ? 0.7 : 0.55 });
    EffectsKit.burst(ctx.scene, foe.root.position.add(new Vector3(0, 1.0, 0)), 'dust');

    if (isContactDunk(kind) && !foeFloored) {
      // CHEST TO CHEST. bumpShove pushed him off the drive line, so by the flush he was somewhere else and
      // the slam landed beside a bystander — the one thing "chest to chest dunked on" is not. He is planted
      // BETWEEN me and the ring, squared at me, and held there through the flight; the fall comes at the
      // flush (posterVictim below), after the ball is through, which is the order those things happen in.
      const plant = posterPlant(RIM_FLOOR, me.root.position);
      if (contact?.isReady) contact.setAirborne('foe', false);
      foe.root.position.copyFrom(plant.spot);
      face(foe.root, plant.faceYaw);
      foeStunSec = Math.max(foeStunSec, 1.2);
      foeAnimTree.beat('bball_hand_up', { holdEnd: true, fadeSec: 0.05 });   // he is CONTESTING it, arms up
      posterVictim = { kind, released: false, plant: plant.spot.clone(), fall: posterFall(RIM_FLOOR, plant.spot, kind), reacted: false };   // SHOWTIME: and he rides the flight from here
      console.info(`[1V1-CONTACT] ${kind} — victim planted chest to chest at ${plant.spot.z.toFixed(2)}`);
    } else {
      const shove = bumpShove(c);
      if (floorHim) {
        foeStunSec = 1.4; foeFloored = true;
        foeAnimTree.beat(SPORT_CLIP.karateKnockdown, { settleTo: { clip: 'karate_floor_hold' } });
      SoundKit.play('thud', { volume: 0.8 });   // a body hits the floor; a floor does not ring
      } else if (!foeFloored) {
        foeStunSec = Math.max(foeStunSec, 0.35);
        foeAnimTree.beat('bball_contact_react', { fadeSec: 0.06 });
      }
      if (contact?.isReady) contact.shove('foe', shove); else foe.root.position.addInPlace(shove.scale(0.16));
      console.info(`[1V1-CONTACT] drive bump ${kind} strength ${c.strength01.toFixed(2)} set ${c.set} floor ${floorHim} shove ${shove.length().toFixed(1)}`);
    }
    if (banner) bannerFlash(ctx, contactBanner(kind), kind === 'body_bag' ? 1100 : 500);
  }

  /** The victim of a contact dunk goes down at the FLUSH, not at the bump — the ball is through first. */
  function posterVictimRelease(ctx: ModeContext): void {
    if (!posterVictim || posterVictim.released) return;
    posterVictim.released = true;
    const fall = posterFall(RIM_FLOOR, foe.root.position, posterVictim.kind);
    foeFloored = true;
    foeStunSec = posterVictim.kind === 'body_bag' ? 2.1 : 1.5;
    foeAnimTree.beat(SPORT_CLIP.karateKnockdown, { settleTo: { clip: 'karate_floor_hold' } });
      SoundKit.play('thud', { volume: 0.8 });   // a body hits the floor; a floor does not ring
    if (contact?.isReady) contact.shove('foe', fall); else foe.root.position.addInPlace(fall.scale(0.16));
    EffectsKit.burst(ctx.scene, foe.root.position.add(new Vector3(0, 0.3, 0)), 'dust');
    SoundKit.play('crowdCheer', { volume: 0.7 });
    console.info(`[1V1-CONTACT] ${posterVictim.kind} victim goes down, fall ${fall.length().toFixed(1)}`);
    posterVictim = null;
  }

  // ── A+ P0 CONTACT-lite (PM brief ONEVONE-A-PLUS-P0, 2026-09-06) ─────────────────────────────────────────────────
  // The dunk contest's CONTACT orchestra is the ceiling; 1v1 takes the lite cut: one make punch, one miss clank.
  // No hang slowMo (1v1 has no hang latch), no FOV gather, no land settle, no trail phases.
  /** The dunk make's flush frame: hit-stop, shake, white-gold flash, ONE slam thud, and the hoop answers. Latched once per attempt. */
  function contactPunch(ctx: ModeContext): void {
    if (contactLatch) return;
    contactLatch = true;
    ctx.juice.hitStop(70);
    ctx.juice.shake(0.12, 140);
    ctx.juice.flash('#fff6dd', 120);
    SoundKit.play('impact', { pitch: 0.7, volume: 0.8 });
    hoopJuice?.punch();
    console.info('[1V1-JUICE] dunk contact punch');
  }
  /** The dunk miss / stuff: a light metallic clank with a small feel hit — never the make's punch, never HoopJuice. */
  function missClank(ctx: ModeContext): void {
    ctx.feel.impact(0.4);
    SoundKit.play('impact', { pitch: 1.35, volume: 0.45 });
    console.info('[1V1-JUICE] dunk miss clank');
  }

  function releaseJumper(ctx: ModeContext, quality: ShotQuality): void {
    shooting = false;
    const pctMod = currentShot?.pctMod ?? 1;
    // D3: the contest at the RELEASE (a hand up, a contest jump, the body) bites the make chance itself
    const foeDist = distXZ(me.root.position, foe.root.position);
    const foeFacing = facingCos(foe.root.rotation.y, foe.root.position, me.root.position);
    const foeUp = foeHandUp || foeBlockJumpAge <= HAND_UP_SEC;
    const ground = foeStunSec > 0 || foeFloored ? 0 : groundContest(foeDist, foeFacing, foeHandUp);
    shotContest = Math.min(1, handUpContest(contestLevel(me.root.position, foeStunSec > 0 ? null : foe.root.position), foeBlockJumpAge) + ground);
    // HOOPS-MOVE-KIT-B M5: the shielding shoulder is between him and the ball — the hand that gets there is worth less
    if (currentShot?.style === 'hook') shotContest = hookShield(shotContest);
    // M12: CALLED GLASS — R1 held inside the band routes the ball through the square, and a bank from there is a real edge
    if (!banked && meSlot.intent.glass && inBankBand(me.root.position, RIM_FLOOR, BOARD_NORMAL)) banked = bankPoint(me.root.position, RIM, BOARD_NORMAL);
    if (banked) console.info(`[1V1-MOVE] called glass at ${banked.x.toFixed(2)}, ${banked.y.toFixed(2)}, ${banked.z.toFixed(2)}`);
    const pct = contestedPct(SHOT_QUALITY_PCT[quality] * pctMod * mbus.multiplier(), shotContest) + (banked ? BANK_PCT_BONUS : 0);
    arcPoints = isThree(me.root.position, RIM) ? 3 : 2;
    arcLabel = currentShot?.label ?? 'SHOT';
    const made = Math.random() < Math.min(0.98, pct);
    // D1: the AI's block at the release — a hand up (or a jump) inside range; the ball is knocked LOOSE from the hand
    const blockChance = foeStunSec > 0 || foeFloored ? 0 : aiBlockChance(currentShot?.style ?? 'jumper', foeDist, foeUp, foeVelLast.length() < 1.0);
    console.info(`[1V1-DEF] my release ${currentShot?.style} contest ${shotContest.toFixed(2)} handUp ${foeHandUp} jump ${foeBlockJumpAge <= HAND_UP_SEC} block ${blockChance.toFixed(2)} rim ${distXZ(me.root.position, RIM_FLOOR).toFixed(2)}`);
    if (blockChance > 0 && roll() < blockChance) { blockedShot(ctx); return; }
    releaseBall(ball);
    // BIOMECH-HOOPS-WAVE1: release → follow-through until the arc resolves. HOOPS-MOVE-KIT-B: a fade / a hook keeps its
    // OWN window to feet-down (the release stance would stand the lean back up mid-air, which is the shot).
    meShotWin = finish && (finish.plan.style === 'fadeaway' || finish.plan.style === 'hook')
      ? (finish.plan.style === 'fadeaway' ? 'fade' : 'hook') : 'release';
    meShotSec = 0;
    gather = null;   // HOOPS-MOVE-KIT-A M1: a release inside the gather is a rushed shot — the plant stops where it is
    // The jumpshot was HELD by the tree (meter-paced from shot start) up to its release frame (both arms overhead). The
    // authored FOLLOW-THROUGH takes it from there (its first key matches that frame, so the crossfade is a continuation):
    // the wrist snaps, the arms come down the front — and it is HELD as the end pose until the arc resolves (G5). The
    // timed release() it replaces dropped the body into the defensive stance 420 ms in, mid-arc.
    // HOOPS-MOVE-KIT-A M3: a layup / floater lets go FROM ITS OWN CLIP at the top of the hop and rides it to feet-down (it
    // used to cut to the dunk launch clip — a two-arm sweep through a T).
    if (finish) finish.released = true;
    else meAnimTree.beat('bball_follow_through', { fadeSec: 0.1 });
    ctx.setHud({ shotType: '', shotMeterT: 0 });
    // SHOT FEEDBACK — 2K tells you WHY at the moment of release, not after
    // the arc resolves. Quality word + contest tag: an early contested
    // fadeaway that rims out was legible as a bad shot before it landed.
    // Before this, only a perfect release said anything at all.
    const tag = (shotContest >= 0.5 ? ' — CONTESTED' : shotContest <= 0.15 ? ' — WIDE OPEN' : '') + (banked ? ' — OFF THE GLASS' : '');
    if (quality === 'perfect') {
      SoundKit.play('uiTick', { pitch: 1.5, volume: 0.4 });
      SoundKit.play('crowdCheer', { volume: 0.35 });
      ctx.feel?.impact?.(0.2);
      bannerFlash(ctx, `GREEN!${tag}`, 700);
      ctx.camDirector.pulse(0.3, 0.35);
    } else if (quality === 'early') {
      bannerFlash(ctx, `EARLY${tag}`, 700);
    } else if (quality === 'late') {
      bannerFlash(ctx, `LATE${tag}`, 700);
    } else if (quality === 'brick') {
      bannerFlash(ctx, `WAY LATE${tag}`, 800);
    }
    if (!made) swing('miss');
    // What this shot earned, handed to the iron when the arc gets there. EARLY is rushed — short, off the
    // front. LATE is long, off the back. A brick sprays laterally. A hand in the face pushes it short on
    // top of whatever the timing did, which is why a contested miss comes back at you.
    shotMiss = {
      quality01: quality === 'perfect' ? 0.95 : quality === 'early' || quality === 'late' ? 0.55 : 0.2,
      short: (quality === 'early' ? 0.8 : quality === 'late' ? -0.8 : quality === 'brick' ? 0.3 : 0) + shotContest * 0.7,
      lateral: quality === 'brick' ? (Math.random() < 0.5 ? -0.7 : 0.7) : 0,
    };
    carrying = false;
    arc.start(ball.getAbsolutePosition(), RIM, made, currentShot?.style ?? 'jumper', alteredApex(shotContest), banked);   // D3: a strong contest ALTERS the release; M12: the glass
    // O2: the shot is up — the rival SEALS me (the box-out between me and the rim, his chest on me) until the ball comes down
    if (foeStunSec === 0 && !foeFloored && distXZ(foe.root.position, RIM_FLOOR) < BOX_OUT_RANGE) { foeBrain?.boxOut(me.root.position); foeSealing = true; console.info('[1V1-OFF] box out (the rival seals me)'); }
  }

  // ── HOOPS-MOVE-KIT-A amendment: the DEFENSE contest package (D1–D3) ────────────────────────────────────────────────
  function clearDefense(): void {
    bumpAge = Infinity; foeBlockJumpAge = Infinity; foeBlockAt = -1; foeDunkFlight = null;
    if (foeHandUp) { foeHandUp = false; foeAnimTree.releaseHold(); }
    if (meHandUp) { meHandUp = false; meAnimTree.releaseHold(); }
    contact?.setAirborne('foe', false);
  }
  /**
   * A MOVE HAPPENED — one door for every handle move, so the chain is always correct.
   *
   * Street Vol 2's signature is that moves chain: the second one starts before the first has finished,
   * and three together read as a highlight rather than three inputs. 2K's half is that none of it is
   * free — you must own the move, you must be inside the window, and you cannot repeat one.
   *
   * The ankles are decided HERE rather than at the crossover, because depth is the skill: a single
   * crossover should rarely break anyone and a three-deep chain at a real handle should look inevitable.
   */
  function doMove(ctx: ModeContext, move: HandleMove): void {
    // THE DECISION IS SHARED (HandleSystem.resolveHandleMove); what stays here is the RENDERING — this
    // mode's clips, banners and defender. 3v3 renders the same outcome its own way, so a tuning change to
    // the chain or the odds lands in both games instead of one.
    const outcome = resolveHandleMove(move, chain, handle, {
      present: foeStunSec <= 0 && !foeFloored,
      closing: foeVelLast.length() > 1.4 && facingCos(foe.root.rotation.y, foe.root.position, me.root.position) > 0,
      set: foeVelLast.length() < 0.6,
      within: distXZ(me.root.position, foe.root.position) < SHAKE_RANGE,
    }, roll);
    if (!outcome.owned) return;                      // not in my hands yet — the gate IS the upgrade
    chain = outcome.chain;

    // THE MOVE ITSELF. Everything below renders what the move DID — the banner, the defender, the chain — and
    // nothing rendered the move: the tree's one crossover state (hardwired to `bball_crossover_left`) was the
    // body for all twelve of them. The ball ends on the side away from him, which is the side the move was for.
    const toHim = foe.root.position.subtract(me.root.position);
    const right = bodyRight(me.root.rotation.y);
    const moveDir: 'left' | 'right' = (toHim.x * right.x + toHim.z * right.z) > 0 ? 'left' : 'right';
    const clip = moveClip(move, moveDir);
    if (clip) meAnimTree.beat(clip, { fadeSec: 0.07 });
    console.info(`[1V1-HANDLE] move ${move} ${moveDir} → ${clip ?? 'mode-owned'} (chain ${chain.length}, handle ${handle})`);

    // OFF THE HEAD is the only move where the ball leaves your hands, so it resolves HERE rather than
    // through the ankle-break roll below. Everything else in this vocabulary is a decision about a chain;
    // this one is a decision about the ball, and it can lose it.
    if (move === 'off_the_head' && carrying && foeStunSec === 0 && !foeFloored) {
      const odds = offTheHeadOdds({
        handle,
        dist: distXZ(me.root.position, foe.root.position),
        facingCos: facingCos(foe.root.rotation.y, foe.root.position, me.root.position),
        defenderSpeed: foeVelLast.length(),
      });
      SoundKit.play('whoosh', { pitch: 1.35, volume: 0.4 });
      if (odds > 0 && roll() < odds) {
        // off him and back to me: he is cooked, and the crowd knows
        foeStunSec = Math.max(foeStunSec, 0.8);
        foeAnimTree.beat('bball_contact_react');
        SoundKit.play('impact', { pitch: 1.2, volume: 0.55 });
        SoundKit.play('crowdCheer', { volume: 0.8 });
        EffectsKit.burst(ctx.scene, foe.root.position.add(new Vector3(0, 1.5, 0)), 'sparks');
        ctx.feel?.impact?.(0.5);
        ctx.juice.shake(0.1, 150);
        swing('ankle_break');
        bannerFlash(ctx, 'OFF THE HEAD!', 1100);
        console.info(`[1V1-HANDLE] off the head — CLEAN (odds ${odds.toFixed(2)})`);
      } else {
        // it did not come back. The ball is loose BEHIND him, which is the worst place for you.
        const dir = offTheHeadLoose(me.root.position, foe.root.position);
        const from = ballWorld().clone();
        releaseBall(ball); carrying = false;
        launchLoose(from, new Vector3(dir.x * 5.5, 1.2, dir.z * 5.5));
        board = { age: 0, contestedCalled: false, shooter: 'mine' };
        SoundKit.play('miss');
        bannerFlash(ctx, 'OFF THE HEAD — LOST IT', 1000);
        console.info(`[1V1-HANDLE] off the head — MISSED (odds ${odds.toFixed(2)})`);
      }
      return;
    }

    if (outcome.restarted) {
      if (process.env.NODE_ENV === 'development') console.info(`[1V1-HANDLE] ${move} out of window — new chain`);
      return;
    }
    // THE BODY GOES WHERE THE MOVE SAYS. One shot, never a per-frame scale (that compounds into a
    // teleport — same reason the jab burst is written the way it is). The lateral sign is AWAY from him,
    // which is the mode's read rather than the table's.
    {
      const imp = moveImpulse(move);
      if (imp.forward !== 0 || imp.lateral !== 0) {
        const yaw = me.root.rotation.y;
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        const rx = fz, rz = -fx;
        const toFoe = foe.root.position.subtract(me.root.position);
        const side = (toFoe.x * rx + toFoe.z * rz) > 0 ? -1 : 1;    // go the other way from him
        meDribble.vel.addInPlace(new Vector3(
          fx * imp.forward + rx * imp.lateral * side, 0, fz * imp.forward + rz * imp.lateral * side,
        ));
      }
    }
    const tier = outcome.tier;
    if (process.env.NODE_ENV === 'development') console.info(`[1V1-HANDLE] move ${move} chain ${chain.length} (${tier})`);
    if (tier !== 'single') {
      SoundKit.play('whoosh', { pitch: 1.1 + chain.length * 0.12, volume: 0.35 });
      ctx.feel?.impact?.(0.08 * chain.length);
    }
    if (outcome.broke === 'none') return;
    const odds = outcome.odds;

    swing('ankle_break');
    SoundKit.play('impact', { pitch: 0.8, volume: 0.5 });
    SoundKit.play('crowdCheer', { volume: 0.55 });
    EffectsKit.burst(ctx.scene, foe.root.position.add(new Vector3(0, 0.2, 0)), 'dust');
    ctx.setHud({ momentum });

    if (outcome.broke === 'hard') {
      // "ankle breakers" — he goes DOWN, and has to get up. The same floored state the poster dunk uses,
      // so there is one way a body ends up on this floor and one way it comes back.
      foeFloored = true;
      foeStunSec = ANKLE_BREAK_STUN_SEC * 1.8;
      // HE SLIPPED, HE WAS NOT PUNCHED. This played the poster dunk's karate knockdown — a man taking a blow —
      // for a defender whose feet went out from under him going for a ball that was not there. The slip is its
      // own clip now: the foot slides out, the hand reaches back for the floor, and he sits there watching you go.
      foeAnimTree.beat(ANKLE_SLIP_CLIP, { settleTo: { clip: 'karate_floor_hold' } });
      SoundKit.play('thud', { volume: 0.8 });   // a body hits the floor; a floor does not ring
      ctx.feel?.impact?.(0.55);
      ctx.juice.shake(0.09, 140);
      bannerFlash(ctx, 'ANKLES — HE IS DOWN!', 1100);
      console.info(`[1V1-HANDLE] HARD ankle break, chain ${chain.length} handle ${handle}`);
    } else {
      foeStunSec = ANKLE_BREAK_STUN_SEC;
      foeAnimTree.beat(ANKLE_STUMBLE_CLIP);   // …and the softer one is a STUMBLE, not a hit react: he caught it, late
      ctx.feel?.impact?.(0.35);
      bannerFlash(ctx, tier === 'highlight' ? 'ANKLES!' : 'SHOOK HIM!');
      console.info(`[1V1-HANDLE] ankle break, chain ${chain.length} handle ${handle} odds ${odds.toFixed(2)}`);
    }
  }

  /** The two bodies as the loose ball sees them: a jumper reaches higher, a floored body cannot reach at all. */
  function reboundBodies(): BodyRef[] {
    return [
      {
        id: 'me', pos: me.root.position, radius: 0.34,
        reachY: 2.15 + (myJumpAge !== Infinity ? 0.4 : 0),
        boxingOut: meSlot.intent.brace ?? false,
        unavailable: meFloored || meStunSec > 0,
      },
      {
        id: 'foe', pos: foe.root.position, radius: 0.34,
        reachY: 2.15 + (foeBlockJumpAge !== Infinity ? 0.4 : 0),
        boxingOut: foeSealing,
        unavailable: foeFloored || foeStunSec > 0,
      },
    ];
  }

  /**
   * THE LIVE BOARD — the ball is off the iron and in play, and whoever gets to it comes down with it.
   *
   * This is the difference between a rebound and a result. The ball bounces off bodies on its way
   * down, a seal is worth real position because the sealed body is physically further from the ball,
   * and a hot ball in traffic can squirt loose and keep the board alive. BRACE still matters — but it
   * matters by putting you where the ball is, not by adding to a roll.
   *
   * boardRace is kept as the stall guard: if the ball somehow settles untouched, the mode must still
   * hand out a possession rather than sit there.
   */
  function liveBoard(ctx: ModeContext, dt: number): void {
    if (!board) return;
    board.age += dt;
    const bodies = reboundBodies();

    // the ball off a chest — a tip is a real event and the crowd should hear it
    const hit = ballVsBodies(ballSim.prevPos as Vector3, ballSim.pos, ballSim.vel, ballSim.radius, bodies);
    if (hit) {
      ballSim.vel.copyFrom(hit.outVel);
      ballSim.pos.copyFrom(hit.contact);
      ball.position.copyFrom(ballSim.pos);
      SoundKit.play('impact', { pitch: 1.1, volume: 0.25 });
      console.info(`[1V1-BOARD] tipped off ${hit.body.id}`);
    }

    // OUT OF PLAY — the REF calls it, reading the handbook. The mode reports the fact (the ball left the
    // floor, and who shot it) and carries out whatever comes back; it does not decide the consequence.
    if (ballOutOfPlay(ballSim.pos, HOOPS_BALL_BOUNDS)) {
      const call = judge('out_of_bounds', {
        offense: possession === 'mine' ? 'me' : 'foe',
        shooter: board.shooter === 'mine' ? 'me' : 'foe',
      });
      board = null; foeBrain?.boxOut(null); foeSealing = false; ballSim.stop(); loose = false;
      console.info(`[1V1-REF] ${call.id} → ${call.ball}`);
      if (call.whistle) SoundKit.play('whistle');
      if (call.ball === 'me') { bannerFlash(ctx, `${call.banner} — YOUR BALL`, 900); resetPositions(); }
      else startDefense(ctx, `${call.banner} — THEIR BALL, DEFEND!`);
      return;
    }

    const r = resolvePickup(ballSim.pos, ballSim.vel, bodies);
    if (r.contested && !board.contestedCalled) { board.contestedCalled = true; bannerFlash(ctx, 'CONTESTED BOARD!', 600); }

    if (r.winner && r.bobbled) {
      // secured but not cleanly — it squirts away and the board is still live
      ballSim.vel.copyFrom(bobbleVelocity(ballSim.vel));
      SoundKit.play('impact', { pitch: 1.3, volume: 0.2 });
      console.info(`[1V1-BOARD] bobbled by ${r.winner.id} — still live`);
      return;
    }

    if (r.winner) { awardBoard(ctx, r.winner.id === 'me' ? 'me' : 'foe', r.contested); return; }

    // stall guard: the ball has settled and nobody went and got it. The log names WHY — which body was
    // where, and whether it was even able to go — because "nobody came down with it" on its own tells
    // you nothing about whether the pursuit is broken or the bodies were legitimately beaten to it.
    if (board.age > 4) {
      const why = bodies.map((x) => {
        const d = Math.hypot(ballSim.pos.x - x.pos.x, ballSim.pos.z - x.pos.z);
        return `${x.id} d=${d.toFixed(2)}${x.unavailable ? ' UNAVAILABLE' : ''}${x.boxingOut ? ' sealing' : ''}`;
      }).join(' · ');
      console.info(`[1V1-BOARD] nobody came down with it (${why}) ball y=${ballSim.pos.y.toFixed(2)} — falling back to the race`);
      board = null;
      boardRace(ctx);
    }
  }

  /**
   * Somebody came down with it.
   *
   * WHOSE miss it was decides what happens next, because those are two different basketball events.
   * Win the board off YOUR OWN miss and it is an offensive rebound: the play does not stop, nobody is
   * teleported to the check, and you can go straight back up — a PUTBACK. Win it off THEIR miss and
   * it is a change of possession, which in a half-court 1v1 means taking it back out.
   *
   * Resetting on every board was what made offensive rebounds worthless: the reward for winning one
   * was the same check-up you would have got for losing it.
   */
  function awardBoard(ctx: ModeContext, who: 'me' | 'foe', contested: boolean): void {
    const shooter = board?.shooter ?? possession;
    const sealed = who === 'me' ? (meSlot.intent.brace ?? false) : foeSealing;
    board = null;
    foeBrain?.boxOut(null); foeSealing = false;
    ballSim.stop(); loose = false;
    // shooter is the mode's possession wording ('mine' = me, 'defense' = the rival had it)
    const offensive = boardOutcome(who, shooter === 'mine' ? 'me' : 'foe') === 'putback';
    console.info(`[1V1-BOARD] ${who} secures it${contested ? ' (contested)' : ''}${offensive ? ' — OFFENSIVE, play on' : ''}`);

    if (offensive && who === 'me') { securePutback(ctx, contested); return; }
    if (offensive && who === 'foe') { foePutback(ctx, contested); return; }

    if (who === 'foe') startDefense(ctx, contested ? 'THEY RIP IT AWAY — DEFEND!' : 'THEIR BOARD — DEFEND!');
    else {
      bannerFlash(ctx, contested ? 'YOU RIP IT AWAY — YOUR BALL' : sealed ? 'BOXED OUT — YOUR BOARD' : 'YOUR BOARD');
      resetPositions();
    }
  }

  /** PUTBACK — my own board, my ball, right where I am. No teleport, no check, go straight back up. */
  function securePutback(ctx: ModeContext, contested: boolean): void {
    possessionToken++;
    possession = 'mine'; carrying = true; shooting = false; dunking = false; defPhase = 'over';
    currentShot = null; arc.active = false; myJumpAge = Infinity;
    meShotWin = 'none'; foeShotWin = 'none'; dunkFlight = null; dunkFlush = null;
    if (gather || finish || spin || posting) meAnimTree.release();
    gather = null; finish = null; spin = null; posting = false; pumpWindow = 0; banked = null; finishFoul = false;
    clearDefense();
    giveBall('me');
    meAnimTree.releaseHold();
    // the body keeps its feet and its heading — it is the same play, still going
    meDribble.setFacing(yawTo(me.root.position, RIM));
    swing('big_make');
    SoundKit.play('crowdCheer', { volume: 0.35 });
    bannerFlash(ctx, contested ? 'RIPS THE BOARD — PUT IT BACK!' : 'OFFENSIVE BOARD — PUT IT BACK!', 900);
    ctx.setHud({ hint: HINT_OFFENCE, shotType: '', shotMeterT: 0, momentum });
  }

  /** Their offensive board: they keep the possession where they stand and can go straight back up at me. */
  function foePutback(ctx: ModeContext, contested: boolean): void {
    possessionToken++;
    possession = 'defense'; carrying = false; shooting = false; dunking = false; currentShot = null;
    // straight to 'drive', never 'check': they already have the ball at the rim, there is nothing to check up for
    defPhase = 'drive'; attacker.reset(); nerveTheAttacker(); gatherShown = false; stepbackShown = false;
    myJumpAge = Infinity; meStunSec = 0; reachCooldown = 0; defContest = 0;
    arc.active = false; meShotWin = 'none'; foeShotWin = 'none';
    if (gather || finish || spin || posting) meAnimTree.release();
    gather = null; finish = null; spin = null; posting = false; pumpWindow = 0; banked = null; finishFoul = false;
    clearDefense();
    giveBall('foe');
    meAnimTree.releaseHold();
    if (!foeFloored) foeAnimTree.releaseHold();
    SoundKit.play('crowdGroan', { volume: 0.3 });
    bannerFlash(ctx, contested ? 'THEY RIP THE BOARD — CONTEST IT!' : 'THEIR OFFENSIVE BOARD — CONTEST IT!', 900);
    ctx.setHud({ hint: HINT_DEFENCE, shotType: '', shotMeterT: 0 });
  }

  /** The board is a race (both ends): distance names the favourite, BOX OUT is worth a body length, the bounce jitters it. */
  function boardRace(ctx: ModeContext): void {
    const meD = Vector3.Distance(me.root.position, ball.position);
    const foeD = Vector3.Distance(foe.root.position, ball.position);
    const boxing = meSlot.intent.brace ?? false;
    const edge = (foeD - meD) + (boxing ? BOX_OUT_EDGE : 0) + (Math.random() - 0.5) * REBOUND_JITTER;
    if (edge <= 0) startDefense(ctx, possession === 'mine' ? 'THEIR BOARD — DEFEND!' : 'THEIR BOARD — DEFEND AGAIN!');
    else { bannerFlash(ctx, boxing ? 'BOXED OUT — YOUR BOARD' : 'YOUR BOARD'); resetPositions(); }
  }
  /** D2: the AI takes the ball — knocked LOOSE from my hand toward him, the reach on him, the possession follows once it
   *  settles (it used to warp both bodies to the check on the frame). */
  function stripBall(ctx: ModeContext, banner: string): void {
    SoundKit.play('impact', { pitch: 1.2, volume: 0.35 });
    swing('turnover');
    ctx.setHud({ momentum });
    foeAnimTree.beat('bball_steal_reach', { fadeSec: 0.14 });
    meCarry?.update(0, 0, false);
    const from = ballWorld().clone(); releaseBall(ball);
    const toFoe = foe.root.position.subtract(me.root.position); toFoe.y = 0; toFoe.normalize();
    launchLoose(from, toFoe.scale(1.6).add(new Vector3(0, 1.2, 0)));
    carrying = false;
    bannerFlash(ctx, banner, 900);
    console.info(`[1V1-DEF] strip by the ai: ${banner}`);
    later(750, () => startDefense(ctx, 'CHECK UP — DEFEND!'));
  }
  /** D1/D3: the AI's read on my load — a hand up inside range facing me (the contest), or a block jump timed to the green. */
  function aiContestLoad(ctx: ModeContext): void {
    if (foeStunSec > 0 || foeFloored) return;
    const dist = distXZ(me.root.position, foe.root.position);
    const facing = facingCos(foe.root.rotation.y, foe.root.position, me.root.position);
    if (dist <= AI_BLOCK_RANGE + 0.3 && facing >= 0 && roll() < AI_BLOCK_JUMP_CHANCE) {
      foeBlockAt = Math.max(0.05, shotMeter.greenCenter01 * shotMeter.durationSec - 0.15);
      console.info(`[1V1-DEF] ai block jump armed at ${foeBlockAt.toFixed(2)} s`);
    } else if (aiHandsUp(dist, facing, roll)) {
      foeHandUp = true; foeHandUpLeft = shotMeter.durationSec + 0.6;
      foeAnimTree.hold('bball_hand_up', { fadeSec: 0.14 });
      console.info(`[1V1-DEF] ai hand up at ${dist.toFixed(2)} m`);
    }
    void ctx;
  }
  /** D1: BLOCKED at the release — the ball knocked loose from my hand, low, back the way it came; the follow-through still
   *  goes up (the hands come up empty); the board decides. */
  function blockedShot(ctx: ModeContext): void {
    const from = ballWorld().clone(); releaseBall(ball);
    const away = me.root.position.subtract(foe.root.position); away.y = 0; away.normalize();
    launchLoose(from, away.scale(2.2).add(new Vector3((Math.random() - 0.5) * 1.5, 1.0, 0)));
    carrying = false; gather = null;
    meShotWin = 'release'; meShotSec = 0;
    if (finish) finish.released = true; else meAnimTree.beat('bball_follow_through', { fadeSec: 0.1 });
    swing('miss');
    SoundKit.play('impact', { pitch: 0.75, volume: 0.55 });
    SoundKit.play('crowdGroan', { volume: 0.4 });
    ctx.feel?.impact?.(0.4);
    ctx.juice.shake(0.08, 100);
    ctx.setHud({ shotType: '', shotMeterT: 0, momentum });
    bannerFlash(ctx, foeBlockJumpAge <= HAND_UP_SEC ? 'BLOCKED!' : 'BLOCKED — HAND IN THE SHOT!', 900);
    console.info('[1V1-DEF] blocked at the release');
    later(900, () => boardRace(ctx));
  }
  /** D1: the rival THROWS IT DOWN on a lane he has beaten — a real flight (the drive dunk's clock) I can SWAT with a timed
   *  jump inside range while he is in the air; a body in his path is bumped, and floored if he finishes through it. */
  function foeDunk(ctx: ModeContext): void {
    defPhase = 'shot'; gatherShown = false; foeShotWin = 'none';
    foeCarry?.update(0, 0, false);
    if (!ball.parent) attachBallToHand(ball, foe.skeleton, 'RightHand');
    const from = foe.root.position.clone();
    const landing = new Vector3(RIM.x, 0, RIM.z + DRIVE_DUNK.landAheadZ);
    const inLane = distXZ(me.root.position, foe.root.position) < 1.5 && meStunSec === 0 && !meFloored;
    const c = contestDrive(from, landing, meStunSec > 0 || meFloored ? null : me.root.position, meDribble.vel, inLane ? 'poster' : 'dunk');
    const ground = groundContest(distXZ(me.root.position, foe.root.position), facingCos(me.root.rotation.y, me.root.position, foe.root.position), meHandUp);
    const contest = Math.min(1, contestLevel(foe.root.position, me.root.position) * 0.5 + ground + (myJumpAge <= HAND_UP_SEC ? 0.3 : 0));
    let made = Math.random() < contestedPct(c.pct, contest);
    let swatted = false, bumped = false, resolved = false;
    defContest = contest;
    foeAnimTree.beat(SPORT_CLIP.dunkLaunchPower, { holdEnd: true });
    contact?.setAirborne('foe', true);
    SoundKit.play('whoosh', { pitch: 0.85 });
    console.info(`[1V1-DEF] rival dunk ${inLane ? 'poster' : 'open'} contest ${contest.toFixed(2)} pct ${contestedPct(c.pct, contest).toFixed(2)} bumpK ${c.bumpK === null ? 'none' : c.bumpK.toFixed(2)}`);
    let flightMs = 0, last = performance.now(), freezeMs = 0, slowMs = 0;
    const obs = ctx.scene.onBeforeRenderObservable.add(() => {
      const nowMs = performance.now(); const realMs = Math.min(50, nowMs - last); last = nowMs;
      const fdt = realMs / 1000;
      let scale = 1;
      if (freezeMs > 0) { freezeMs -= realMs; scale = 0; }
      else if (slowMs > 0) { slowMs -= realMs; scale = BUMP_SLOW; }
      flightMs += realMs * scale;
      const k = Math.min(1, flightMs / DRIVE_DUNK.flightMs);
      foe.root.position.x = from.x + (RIM.x - from.x) * k;
      foe.root.position.z = from.z + (RIM.z + DRIVE_DUNK.landAheadZ - from.z) * k;
      foe.root.position.y = driveDunkY(k);
      face(foe.root, slewYaw(foe.root.rotation.y, yawTo(foe.root.position, RIM), FACE_RIM_RATE, fdt));
      foeDunkFlight = { k, made: resolved ? made && !swatted : null };
      // the SWAT: my fresh jump inside range while he is between the takeoff and the resolve
      if (!swatted && !resolved && jumpSwats(k, myJumpAge, Math.min(distXZ(me.root.position, foe.root.position), distXZ(me.root.position, ball.getAbsolutePosition())))) {
        swatted = true; made = false;
        const at = ballWorld().clone(); releaseBall(ball);
        const away = foe.root.position.subtract(me.root.position); away.y = 0; away.normalize();
        launchLoose(at, away.scale(-2.5).add(new Vector3((Math.random() - 0.5) * 2, 1.5, 0)));
        swing('block');
        SoundKit.play('impact', { pitch: 0.7, volume: 0.6 }); SoundKit.play('crowdCheer', { volume: 0.7 });
        ctx.feel?.impact?.(0.5); ctx.juice.hitStop(50); ctx.juice.shake(0.1, 120);
        EffectsKit.burst(ctx.scene, at, 'sparks');
        ctx.setHud({ momentum });
        bannerFlash(ctx, 'REJECTED AT THE RIM!', 1000);
        console.info(`[1V1-DEF] swat at k ${k.toFixed(2)} jumpAge ${myJumpAge.toFixed(2)}`);
      }
      // the bump: he goes THROUGH me — the hit, and the floor if he finishes
      if (!bumped && !swatted && c.bumpK !== null && k >= c.bumpK) {
        bumped = true; freezeMs = 45; slowMs = BUMP_SLOW_SEC * 1000;
        ctx.juice.hitStop(45); ctx.juice.shake(0.08, 110); ctx.feel?.impact?.(0.3);
        SoundKit.play('impact', { pitch: 0.95, volume: 0.55 });
        if (made && inLane) { meStunSec = 1.4; meFloored = true; meHandUp = false; meAnimTree.beat(SPORT_CLIP.karateKnockdown, { settleTo: { clip: 'karate_floor_hold' } }); SoundKit.play('thud', { volume: 0.8 }); }
        else if (!meFloored && meStunSec === 0) { meStunSec = Math.max(meStunSec, 0.3); meAnimTree.beat('bball_contact_react', { fadeSec: 0.06 }); meHandUp = false; }
        if (contact?.isReady) contact.shove('me', bumpShove(c)); else me.root.position.addInPlace(bumpShove(c).scale(0.16));
        console.info(`[1V1-DEF] rival dunk bump strength ${c.strength01.toFixed(2)} floorMe ${made && inLane}`);
      }
      if (!resolved && !swatted && k >= DRIVE_DUNK.resolveK) {
        resolved = true;
        const releasePos = ball.getAbsolutePosition().clone(); releaseBall(ball);
        if (made) dunkFlush = { releasePos, since: 0, kind: inLane ? 'poster' : 'dunk' };
        else { missClank(ctx); launchLoose(releasePos, clankOffRim(ball, RIM)); }
      }
      if (k < 1) return;
      ctx.scene.onBeforeRenderObservable.remove(obs);
      foeDunkFlight = null; contact?.setAirborne('foe', false);
      foeAnimTree.beat(SPORT_CLIP.dunkLandCrouch, { fadeSec: 0.08 });
      if (made) {
        foeScore += 2;
        SoundKit.play('score', { pitch: 0.9 }); SoundKit.play('crowdGroan', { volume: 0.5 });
        contactPunch(ctx);
        EffectsKit.burst(ctx.scene, RIM, 'net');
        ctx.setHud({ foeScore, banner: inLane ? 'POSTERIZED — THEY THREW IT DOWN ON YOU' : 'THEY THREW IT DOWN' });
        if (checkGameOver(ctx)) return;
        later(meFloored ? 1600 : 1000, () => { ctx.setHud({ banner: '' }); startDefense(ctx, 'MAKE IT, TAKE IT — DEFEND!'); });
      } else {
        if (!swatted) { SoundKit.play('miss'); bannerFlash(ctx, 'THEY RATTLED IT OUT', 800); }
        later(900, () => boardRace(ctx));
      }
    });
  }
})();

// HUD fields: foeScore, target, momentum, shotMeterT, shotType, camFollowM
// (dropped — was debug), and NEW turbo (0-100 — render as a small fuel bar
// under the momentum meter).
