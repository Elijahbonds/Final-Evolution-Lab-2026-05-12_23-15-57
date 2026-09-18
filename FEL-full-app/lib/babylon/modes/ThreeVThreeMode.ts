// ThreeVThreeMode v3 — REPLACES the M52 file. The comprehensive upgrade
// (same systems as OneVOne v3, wired for the team game). Everything from
// v2 is kept — body collision on all 15 pairs, ankle-breakers, shot
// variety, TeammateBrain spacing/cuts, pass-to-open-man, assists — plus:
//   THE BALL FLIES — my attempts arc for real (ShotArc): makes drop, misses
//     clang and go live.
//   DRIVE DUNKS — attack the rim hot with turbo and the shot button throws
//     it down; through a parked defender = POSTERIZE (they hit the floor).
//   TURBO — sprint is fuel (drains/regens); HUD shows the tank.
//   BLOCK ON DEFENSE — opponent possessions are now contestable with a
//     timed jump (A) around their release, on top of the positional make%
//     your D already sets. Time it in range and the shot is REJECTED.
//
// BIOMECH-HOOPS-WAVE1 (2026-09-08) — the dunk contest's body control, ported (SPEC-BIOMECH-HOOPS-WAVE1 G1–G6), the
// 1v1's discipline on all six bodies:
//   G2 ONE owner per rig — BasketballAnimTree on every body (the mode played run / idle per frame on all six and cut every
//      hit react to a frame; the carrier ran the empty-handed run; the shot metered on the dunk CROUCH then popped to the
//      jumpshot at the release); the meter now paces the jumpshot to the green, the release flows into the authored
//      follow-through, HELD until the arc resolves (G5), a make celebrates, a knockdown goes to the floor and gets up.
//   G1 defenders keep their chest ON the carrier inside range (they faced their travel); on defense I face the driver;
//      the shooter squares to the rim through the meter and the dunker through the flight; every turn a slew.
//   G3/G6 the drive dunk resolves at the IRON (flush / clank, the land crouch at feet-down); teammate and rival shots FLY
//      (they let go of the ball and it hung in the air until the next possession).
//   G4 a block jump before the driver's release says JUMPED EARLY.
//   The shared Posture Poses layer (anim/PostureLayer) on all six: chest on the rim / the carrier, eyes on the iron / the
//   ball, feet flat in the stances, the dunk's flight windows on the drive dunk.

// HOOPS-MOVE-KIT-A (2026-09-08) — the 1v1's move kit on the team game (SPEC-HOOPS-MOVE-KIT M1–M3, rules in core/HoopsMoves):
//   M1 the squeeze stopped my feet on the frame and the jumpshot rose at speed (the teleport shot) → a moving squeeze is a
//      PULL-UP gather (the plant bleeds the speed on the authored gather clip, the ball into both hands, then the rise; a
//      STEP-BACK under a contest with the stick pulled off the rim), the meter running through the gather.
//   M2 3v3 had NO contact — resolveBodyCollision pushed two circles apart, symmetric, no momentum, no event. Now every pair
//      exchanges momentum along the contact normal with the ContactSystem's severity (resolveBodyContact): a sprint into a
//      set defender bleeds my speed and reads as a hit on him; a foul-speed hit on me in the air is an AND-ONE / the ball
//      back; the drive dunk's contest is a BODY in the flight path (the bump: hit-stop micro, the flight slows, he is shoved
//      or put down at the contact, a set wall is a harder finish).
//   M3 a layup metered on the jumpshot and finished on the dunk launch clip → left / right layup finishes gathered on the
//      side the drive comes from, paced to the green with a real hop; the floater is its own clip on the soft arc.
//   O1–O3 (the second amendment, core/HoopsOffball): one teammate a possession SCREENS my defender (runs to his shoulder,
//      PLANTS on bball_screen_set, rolls if the lane is open or pops), the defender fights over / under it (DefenderBrain
//      navigateAround, over costs speed); on any shot the defenders BOX OUT their man (the seal between him and the rim, the
//      chest on him) while the offense crashes, and the board is a race (boardWinner) instead of a possession change by fiat;
//      every AI body carries one JOB and faces its objective (the dev seam `jobs()` reads them).
//   D1–D3 (the amendment, core/HoopsDefense): the AI puts a hand up on my load or times a block jump to my green and blocks a
//      layup / jumper / dunk at the release (the ball knocked loose); the rival's drive ends in a DUNK when the lane is open —
//      a flight I can SWAT with a timed jump inside range (REJECTED); a hard contact opens the strip window (my X poke inside
//      1.6 m connects; a set defender I bump strips me on his roll, the ball loose, no warp); X HELD is a grounded hand-up
//      that contests the driver's release (and the AI's contests mine), the contest biting the make chance and altering the arc.
import { nerve, standingOf } from '../core/Nerve';
import { tickScuff, scuffPuffScale, scuffVolume, SCUFF_IDLE, type ScuffState } from '../core/ScuffFx';
import { MeshBuilder, Vector3 } from '@babylonjs/core';
import { dressBall } from '../visual/meshyProps';
import type { AbstractMesh, TransformNode } from '@babylonjs/core';
import { BasketballAnimTree } from '../anim/basketballTree';
import { mountPostureLayer, type PostureLayer } from '../anim/PostureLayer';
import { BodyMotion, dynamicPose } from '../core/DynamicPosture';   // the body answers its MOTION, not just its state
import { hoopsPose, HOOPS_INPUT_IDLE, RELEASE_SEC, LAND_SEC, CELEBRATE_SEC, type HoopsPostureInput, type ShotWindow } from '../core/HoopsPosture';
import { slewYaw, yawTo, playFacing, DRIVE_DUNK, driveDunkY } from '../core/Biomech';
import { StickHandleReader, stickMoveFor, pausinWanted, type StickGesture } from '../core/StickHandle';
import type { HoopsDunk } from '../core/HoopsDunks';   // STICK HANDLE (2026-09-17)
import { driveDunkKFor, handForward, handShiftTarget, stepShift, driveDunkPos, hangWanted, RIM_HANG, rimProtectorJump, rimProtectorSwats, RIM_PROTECT, chestRide, VICTIM_SLIDE, slideStep, type ShowtimeJudge } from '../core/DriveFlight';   // DUNK-FANATIC (2026-09-17): at the iron by the resolve, the rim hang, the rim protector, the chest ride
import { clankOffRim } from '../anim/ballRig';
import { startFlush, stepFlush, type FlushState } from '../core/RimFlush';   // DUNK-FANATIC (2026-09-17): the contest's flush on the game's dunks
import { RIM_RADIUS } from '../core/RimPhysics';
import { NET_EXIT_MPS, NET_DROP_NUDGE } from '../core/NetExit';
import { syncedShotSpeed, RELEASE_FRAME_01 } from '../core/BallHandling';
import { releaseFrameOf } from '../anim/opponentMotion';   // HOOPS MOVEMENT: the release frame of the clip that plays
import { refuse } from '../core/Refusal';   // MECHANICS PASS: a press that cannot act is answered
import { type SpawnedCharacter } from '../core/CharacterLibrary';
import { CharacterPipeline } from '../core/characterPipeline';   // suite pass: the sanctioned spawn paths
import { tintGarmentSlot, SLOT_KEYS } from '../core/playerIdentity';   // …and the team jerseys
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { VenueKit } from '../visual/VenueKit';
import { applyOceanCourt } from '../visual/CourtSurface';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';  // M74
import { BallSim } from '../core/BallPhysics';
import { attachBallToHand, releaseBall } from '../anim/ballRig';
import { mountRimReach, rimReachWeight, type RimReachHandle } from '../anim/rimReach';   // HAND AND RIM (owner, 2026-09-18)
import { isFinishStyle, planDropStep, planShimmyFade, stickAtRim01, POST_DROP_STICK_MIN, SHIMMY_CONTEST_CUT, PUMP_MAX_SEC } from '../core/HoopsMoves';
import { mountBallCarry, type BallCarry } from '../anim/ballCarry';
import { PlayerSlot, LocalInputSource, AISource } from '../core/PlayerSlot';
import { attachNetplay, type NetplayHandle } from '../../net/attach';   // opt-in: ?net=<room> seats a human in the first AI slot
import { AgentControlSource } from '../core/AgentControlSource';  // M69: intent play under ?agent=1 (same seam as 1v1)
import { agentBridge } from '../core/AgentBridge';
import {
  DribbleController, ShotMeter, DefenderBrain, TeammateBrain, contestLevel, clampToHalfCourt, isThree,
  resolveBodyCollision, checkAnkleBreak, classifyShot, ANKLE_BREAK_STUN_SEC,
  TurboMeter, ShotArc, checkDriveDunk, checkBlock, DUNK_PCT,
  SHOT_QUALITY_PCT, type ShotQuality, type ShotContext, type PostShot, type ShotStyle, BODY_STANDOFF } from '../core/BasketballCore';
import { lockTarget, choosePassType, PassFlight, type PassType } from '../core/BallHandling';
import { HARD_CONTACT_SPEED, FOUL_CLOSING_SPEED } from '../core/ContactSystem';
import {   // HOOPS-MOVE-KIT-A
  canPostUp, postYaw, postWish, postFadeAway, POST_FADE_STICK_MIN, fadeDrift,   // HOOPS-MOVE-KIT-B (2026-09-08): M4 the fade
  pickHookSide, hookShield,                                                      // M5 the hook
  planSpin, spinYaw, spinPos, spinOffContact, postSpinSide, SPIN_ARM_SEC, SPIN_BEAT_K, SPIN_EXIT_SPEED, SPIN_STUN_SEC, SPIN_TRIGGER_RANGE, SPIN_COOLDOWN_SEC, type SpinPlan,   // M6 the spin
  passFakeBite, passFakeShiftTo, PASS_FAKE_STUN,   // the pass fake (owner, 2026-09-13)
  runningHook, HOOK_ON_ME, isPumpFake, planStepThrough, STEP_THROUGH_SEC, PUMP_BITE_RANGE, PUMP_BITE_CHANCE, PUMP_BITE_STUN,   // wave 2: M7 / M8
  pivotFrom, planPivot, PIVOT_MAX_SPEED, rimProtected, isReverseFinish, reverseSide,                               // M9 / M10 / M11
  inBankBand, bankPoint, BANK_PCT_BONUS, planHopStep, HOP_RANGE, planEuro, euroSell, euroAvailable, gatherTravel,  // M12 / M13 / M14
  planGather, gatherWish, gatherLabel, stickBack01, STEPBACK_STICK_BACK_MIN, type GatherPlan,
  pickLayupSide, planFinish, finishHopY, finishStride, FINISH_LABEL, type FinishPlan, type FinishStyle,
  contestDrive, bumpShove, BUMP_SLOW, BUMP_SLOW_SEC, type DriveContest, resolveBodyContact, bodyRight, FINISH_CLIP } from '../core/HoopsMoves';
import {   // HOOPS-MOVE-KIT-A amendment (D1–D3): the defense contest package (the 1v1's, on the team game)
  groundContest, aiBlockChance, bumpExposure, aiBumpStrips, jumpSwats, contestedPct, alteredApex, aiHandsUp, facingCos,
  AI_BLOCK_JUMP_CHANCE, AI_BLOCK_RANGE, BUMP_STRIP_WINDOW_SEC,
} from '../core/HoopsDefense';
import { HAND_UP_SEC, handUpContest, distXZ, rivalShotPct, proximityContest01, LAYUP_RANGE } from '../core/BasketballCore';
import { boardWinner, BOX_OUT_RANGE, jobObjective, type BoardBody } from '../core/HoopsOffball';   // HOOPS-MOVE-KIT-A O1–O3
import { resolveRim, forcedMissProfile } from '../core/RimPhysics';                               // the miss meets the iron it earned
import { judge, isGoaltending, paintClock, THREE_SECOND_LIMIT, possessionAfterScore, foulAward, type ScoringFormat } from '../core/Ref';         // the rules live in the handbook, not in here
import {
  CHAIN_IDLE, BASELINE_HANDLE, tickChain, moveFromContext, resolveHandleMove, SHAKE_RANGE,
  moveClip, ANKLE_STUMBLE_CLIP,
  OFF_THE_HEAD_RANGE, offTheHeadOdds, offTheHeadLoose, moveImpulse, type ChainState, type HandleMove,
  moveRate, moveFadeSec,   // MOVE PACE
} from '../core/HandleSystem';   // the vocabulary 1v1 had and this mode did not
import {
  THREAT_IDLE, inTripleThreat, isJabInput, jabBiteOdds, canJab, throwJab, tickThreat, jabBurst,
  type ThreatState,
} from '../core/TripleThreat';   // standing still with the ball is not idle — it is threatening
import { inStance, stanceWish } from '../core/DefensiveStance';   // the slide was cosmetic until now
import { MomentumBus } from '../core/MomentumBus';   // Phase 6: the shared Game-Breaker layer
import {
  dunkKindFor, isContactDunk, posterPlant, posterFall, contactBanner, contactHitStopMs, POSTER_RELEASE_K,
  type ContactDunkKind,
} from '../core/ContactDunk';   // dunked ON, not dunked beside
import { ballVsBodies, resolvePickup, bobbleVelocity, boardOutcome, ballOutOfPlay, HOOPS_BALL_BOUNDS, type BodyRef } from '../core/LooseBall';   // and six bodies contest it
import { scramSwitch } from '../core/Matchups';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit, applyTrail, type TrailLevel } from '../visual/EffectsKit';
import { retreatFor, closeoutFor } from '../anim/basketballTree';   // DEFENSE-LOOK (2026-09-17)
import { mountPlayerRing, type PlayerRingHandle } from '../visual/PlayerRing';   // PLAYER RING (2026-09-17): stamina at the feet, the creator glyph over the head
import { readPlayerIcon } from '../visual/playerIcon';
import { netExitVelocity, netExitKindOf, netExitMph, type NetExitKind } from '../core/NetExit';   // NET EXIT (2026-09-17)
import { SHOWTIME_FLUSH_K, SHOWTIME_GOOD_K, showtimeAsked, pickShowtime, judgeShowtime, showtimeMeterT, posterRide, SHOWTIME_FLIGHT_MS, SHOWTIME_HANG_FROM, SHOWTIME_HANG_TO, SHOWTIME_HANG_SCALE, SHOWTIME_DEADLINE_K, SHOWTIME_PCT } from '../core/ShowtimeDunk';   // SHOWTIME (2026-09-17)
import type { ParticleSystem } from '@babylonjs/core';   // suite pass: the hot hand's shot trails (the dunk contest's ball trail, on the game)
import { HoopJuice } from '../visual/HoopJuice';   // A+ P0: the hoop answers the make (shared with Dunk / 1v1; Meshy never scaled)
import { mountShotMeter3D, type ShotMeter3DHandle } from '../visual/ShotMeter3D';   // THE SHOT METER (owner, 2026-09-18): the 2K bar beside the shooter's head
import { pickHoopsDunk, dunkSpeedRatio, PAUSIN_DUNK } from '../core/HoopsDunks';
import { driveIntent, driveLateral, bodiesMet } from '../core/DriveLine';
import { assertSpawned } from '../core/FrameGuard';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { DUNK_CONFIG as SHARED_CFG } from './modeConfigs';

/** Exported so hoop-alignment-tests can check it against the venue's hoop. */
export const RIM = new Vector3(0, 3.05, -0.6);
/** The rim's point on the floor — what a drive's range is measured against (see the checkDriveDunk call). */
const RIM_FLOOR = new Vector3(RIM.x, 0, RIM.z);
/** HOOPS-MOVE-KIT-B M12: the backboard hangs behind the ring and faces the court (+z). */
const BOARD_NORMAL = new Vector3(0, 0, 1);
const TARGET_SCORE = 21;
/**
 * Every make is a change of possession — the FIBA 3x3 rule, which is the format 3-on-3 actually plays.
 *
 * DECLARED, because 1v1 runs `make_it_take_it` and the two modes disagreeing about who gets the ball after
 * a bucket used to be an accident of two `later(…, opponentPossession)` calls buried in scoring branches
 * rather than a decision. Changing this line changes the format; nothing else needs touching.
 */
const FORMAT: ScoringFormat = 'alternating';
// FORMAT FIX: was "1pt inside the paint, 2pts anywhere past it" — no shot
// was ever worth 3, and a layup scored LESS than a jumper. "First to 21" is
// the real streetball 2s-and-3s format (matching NBA 2K's stated
// benchmark); this radius sits inside the court's clampToHalfCourt bounds
// (width 8, depth 15) so a real 3 is reachable but not trivial.
//
// The arc is NOT a circle. This was `THREE_POINT_RADIUS = 6.75`, a single flat
// radius — the exact mistake 3PT shipped as its D1 and then fixed, made again
// here because the knowledge lived in ThreePointMode rather than in the shared
// basketball core. The real line is 6.71m in the corners and 7.24m at the top,
// and that difference IS the shot selection: a corner three is the bargain and
// the top of the key is the hard one. isThree() now answers it per angle.
const POSSESSION_SEC = 90;
/** BIOMECH-HOOPS-WAVE1: the facing slew (rad/s); a defender inside this range keeps his chest on the carrier. */
const FACE_RATE = 10, FACE_RIM_RATE = 6, DEFEND_FACE_RANGE = 6;

interface Body {
  char: SpawnedCharacter; slot: PlayerSlot; drib: DribbleController; stunSec: number;
  /** HOOPS-MOVE-KIT-A M2: this frame's planar velocity (the AI bodies'; the hero's is his dribble controller's live vector). */
  vel: Vector3;
  /** D1: an AI defender's contest jump clock (Infinity on the floor) — kinematic, the body has no Havok capsule here. */
  jumpAge: number;
  /** 2026-09-17: an AI defender's reach is a commitment — this long before he can reach again. */
  reachCooldown: number;
  /** O1–O3: the AI brain (its job / screen / box-out readouts); null for the hero. */
  brain: TeammateBrain | DefenderBrain | null;
  /** O1: the screen clip is held on this body. */
  screenHeld: boolean;
  // BIOMECH-HOOPS-WAVE1: the one animation owner, the Posture Poses layer and the hoops window it reads
  tree: BasketballAnimTree; posture: { layer: PostureLayer; dispose(): void } | null; bio: HoopsPostureInput;
  floored: boolean; shotWin: ShotWindow; shotSec: number; landSec: number; celebrateSec: number; speed01: number;
  /** DYNAMIC POSTURE: this body's own motion tracker. Per body, because an acceleration only means 'braking' or
   *  'turning' once it is resolved in the frame of the body that felt it — six bodies, six frames. */
  motion: BodyMotion;
}

export const ThreeVThreeMode: ModeDefinition = (() => {
  let threeVenue: VenueHandle | null = null;  // M74
  let ctx0: ModeContext | null = null;        // O2: the HUD from the box-out helper
  let me: Body;
  let mates: Body[] = [];
  let foes: Body[] = [];
  let ball: AbstractMesh, ballSim: BallSim;
  let localSource: LocalInputSource;
  /** Null unless ?net=<room>. One AI seat becomes a remote player. */
  let net: NetplayHandle | null = null;
  let netSeatTaken = false;
  let agentCtl: AgentControlSource | null = null;   // M69: the hero slot's source under ?agent=1; null for human play
  let shotMeter: ShotMeter;
  let turbo: TurboMeter;
  let arc: ShotArc;
  let arcMade = false, arcPoints = 0, arcLabel = '', arcQuality: ShotQuality = 'good';
  let myScore = 0, foeScore = 0, assists = 0, timeLeft = POSSESSION_SEC;
  /** Where the OTHER team stands, for Nerve. Lateness reads off whoever is closer to 21. */
  const foeStanding = () =>
    standingOf(foeScore, myScore, TARGET_SCORE, Math.min(1, Math.max(myScore, foeScore) / TARGET_SCORE));
  let carrierId: 'me' | 'mate0' | 'mate1' | 'foeTeam' = 'me';
  let shooting = false, dunking = false, ended = false, lastPasserWasMe = false;
  let currentShot: ShotContext | null = null;
  /** Contest at shot start — so the release banner can say why. */
  let shotContest = 0;
  /** What a NON-hero shot earned (the mate's and the opponent's both fly on mateArc), read at the iron. */
  let mateMiss: { from: Vector3; team: 'me' | 'foe'; quality01: number; short: number; lateral: number } | null = null;
  /** A live board: the ball is off the iron and none of the six bodies has it yet. */
  let board: { age: number; contestedCalled: boolean; shooter: 'me' | 'foe' } | null = null;
  /** Per-foe closing-speed memory for the hesi bite (same read as 1v1). */
  let foeCloseMem: number[] = [];
  let myJumpAge = Infinity;                      // block-jump timer (defense)
  const passFlight = new PassFlight();
  const carries = new Map<Body, BallCarry>();   // live dribble per body on my team
  let meSpeed01 = 0;
  let meIntensity01 = 0, meGear = 'stop';   // DRIBBLE PACE
  let scuff: ScuffState = { ...SCUFF_IDLE };
  let lookX = 0, lookY = 0;   // R stick → camera look (MODE-STICK-FACE family, 2026-09-07)
  const rStick = new StickHandleReader(); let stickGestures: StickGesture[] = []; let pausedDribble = false;
  let postStick = { x: 0, y: 0 }; let stickShot: { side: 'left' | 'right'; shimmy: boolean; started: boolean; shimmied: boolean } | null = null; let shimmyLeft = 0;   // POST HOOK (2K20): in the post the R stick up-left / up-right IS the hook (R2: the shimmy first)   // STICK HANDLE
  let passTargetId: 'mate0' | 'mate1' = 'mate0';
  let passType: PassType = 'chest';
  /** Each teammate's velocity this frame — the lob needs to know who is CUTTING (D7). */
  const mateVel: Vector3[] = [new Vector3(), new Vector3()];
  /** The defenders' brains and their current marks — the scram switch re-marks them (lock: defensive switching). */
  const defenderBrains: DefenderBrain[] = [];
  let marks: number[] = [];
  let switchBannerAt = 0;
  let foeShotBlocked = false;
  // THE SHOT METER (owner, 2026-09-18): the world bar beside the shooter's head + the HUD's green window, fed by the
  // same ShotMeter numbers the release is graded by
  let meter3d: ShotMeter3DHandle | null = null; let hudGreen = '';
  let meReach: RimReachHandle | null = null;   // HAND AND RIM: the dunk's hand onto the ring
  const meterStart = (contest: number, style?: Parameters<ShotMeter['start']>[1], gather?: number): void => {
    shotMeter.start(contest, style ?? 'jumper', gather ?? 0);
    hudGreen = `${shotMeter.greenCenter01.toFixed(3)},${shotMeter.greenHalfWidth01.toFixed(3)}`;
    meter3d?.begin({ center: shotMeter.greenCenter01, half: shotMeter.greenHalfWidth01 });
  };
  const meterRelease = (): ReturnType<ShotMeter['release']> => { const q = shotMeter.release(); meter3d?.end(q); return q; };
  let hoopJuice: HoopJuice | null = null;        // A+ P0 CONTACT-lite: rim spring / net squash / hoop flash on a make
  let contactLatch = false;                      // A+ P0: the dunk's ONE punch per attempt — never re-fired by the banner or the stun
  // ── BIOMECH-HOOPS-WAVE1 ──
  let driver: Body | null = null;                // the rival driving on their possession (its tree carries the ball, it faces the rim, the AI drive skips it)
  let driveK = 0;                                // the rival drive's clock 0..1 (the block window is its end)
  let driveSec = 1.1;                            // …and how long that clock runs: the distance at DRIVE_MPS (suite pass)
  let driveMps = 0;                              // the drive's nominal speed — the dunk picker reads it (a clocked drive's velocity vector is ~0)
  let paintSec = 0, paintWarned = false;          // the three-second clock, and whether the ref has warned yet
  let goaltendCalled = false;                    // one call per shot
  const lastFoeJobs = new Map<Body, string>();   // DEFENSE-LOOK: job-change log
  let foeShotScored = false;                     // the rival's release already banked its two (a goaltend on it whistles, it does not score again)
  let prevBallY = 0;                             // for the ball's vertical rate (goaltending reads it falling)
  let chargeLastGap = -1;                        // last frame's gap to the driver, for the closing RATE
  let oobSec = 0;                                // how long the carrier has been ON the line, still pushing at it
  let takingCharge = false;                      // Circle held on defence — planted, waiting to wear it
  let chargeSetSec = 0;                          // how long the feet have been down
/** How long the feet have to be planted before a charge can be drawn. */
/** The lines themselves — the box clampToHalfCourt holds bodies inside (8 x 15 here, wider than 1v1's half). */
const COURT_HALF_WIDTH = 8, COURT_DEPTH = 15;
/** How close to the line counts as ON it, and how long you must keep pushing at it before it is a call. */
const OOB_EPSILON = 0.08, OOB_GRACE_SEC = 0.35;
/** A reach that ARRIVES on the handler at this speed is a foul; slower than this it is a whiff at thin air. */
const REACH_FOUL_SPEED = 1.6;
/** The paint, measured from the rim's floor point — the same radius 1v1 uses. */
const PAINT_RADIUS = 3.6;
/** How far into the drive contact starts counting — before this the bodies are just where the reset left them. */
const CONTACT_MIN_K = 0.18;
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
  let dunkFlight: { k: number; made: boolean | null } | null = null;
  let dunkFlush: { releasePos: Vector3; since: number; kind: NetExitKind; st?: FlushState } | null = null;
  // ── HOOPS-MOVE-KIT-A ──
  let gather: { plan: GatherPlan; t: number } | null = null;                         // M1: the jumper's gather before the rise
  let finish: { plan: FinishPlan; t: number; released: boolean } | null = null;      // M3: a layup / floater in flight
  // ── HOOPS-MOVE-KIT-B: the post kit (M4–M6) ──
  /** The handle drives the vocabulary and the chain window (HandleSystem) — 3v3 never had either. */
  let handle = BASELINE_HANDLE;
  let chain: ChainState = { ...CHAIN_IDLE };
  let posting = false;                                                               // the seal I hold (the path into the fade / the hook / the quick spin)
  let spin: { plan: SpinPlan; t: number; beat: boolean } | null = null;              // M6: the pivot in flight
  let spinCooldown = 0, spinArmed = 0;   // M6: a body I meet ARMS the spin; the stick swung across throws it
  // Phase 6's shared Game-Breaker layer. 3v3 reported NOTHING into it: posters, ankle-breakers, swats and
  // steals in this mode were invisible to the momentum system, so the tier never moved, the multiplier
  // never applied and the crowd never escalated — the highlight plays happened and the game did not notice.
  let mbus = new MomentumBus();
  let momentum = 0;
  let shotTrail: ParticleSystem | null = null; let shotTrailLevel: TrailLevel = 'off';   // suite pass: the hot hand's shot trail
  /** Report a highlight and mirror the bus into the HUD momentum meter (the 1v1's). */
  function swing(kind: Parameters<MomentumBus['report']>[0]['kind']): void {
    mbus.report({ kind });
    momentum = Math.round(mbus.score01 * 100);
  }
  /** STATIONARY OFFENCE: the stance the half-court game starts from. 3v3 stood in idle holding the ball. */
  let threat: ThreatState = { ...THREAT_IDLE };
  let stickHeld = 0, stickPeak = 0, jabEligible = false, burstArmed = false;
  // One fake per wind-up: the button is HELD, so without this it re-fires every frame.
  // There is deliberately no separate "lane is open" timer — the defender has been physically moved and
  // frozen, so the opening is the geometry itself. A second timer nothing reads is dead state.
  let passFakeCooldown = 0;
  let spinClip = 'bball_spin';           // M9: the same machinery turns a PIVOT (a shorter sweep, no travel)
  let pumpWindow = 0;                    // M8: seconds left in which a squeeze is a STEP-THROUGH (he bit the fake)
  let banked: Vector3 | null = null;     // M12: the glass point this release is routed through
  let driveContest: DriveContest | null = null;                                      // M2: the body in the dunk's path
  /** The man being dunked ON — held chest to chest through the flight, dropped at the flush. */
  let posterVictim: { body: Body; kind: ContactDunkKind; released: boolean; plant?: Vector3; fall?: Vector3; reacted?: boolean } | null = null;
  let victimSlide: { body: Body; dir: Vector3; left: number } | null = null;   // DUNK-FANATIC: the released victim slides clear of the landing   // SHOWTIME: the plant and the fall line
  let showtimePress = false, showtimeCam = false;   // SHOWTIME: SQUARE in the air (raw), and the side camera
  let ring: PlayerRingHandle | null = null;   // PLAYER RING
  /** What the contact made this dunk. Captured AT THE BUMP because `driveContest` is cleared on
   *  feet-down, before the score is awarded — so reading it there narrowed to `never`. */
  let lastDunkKind: ContactDunkKind = 'clean';
  let finishFoul = false;                                                            // M2: fouled in the air — and-one / the ball back
  const contactCooldown = new Map<string, number>();                                 // M2: one contact event per pair per 300 ms (the Havok solver's own gate)
  /** Bumped on every possession change; every timer that changes possession checks it (the 1v1's rule) — a stale
   *  setTimeout(resetPossession) from the rival's possession fired INTO my next one and teleported me mid-meter (measured). */
  let possessionToken = 0;
  let shootPressWas = false;   // MECHANICS PASS: the SHOOT trigger's press edge
  // ── the DEFENSE contest package (D1–D3) ──
  let bumpAge = Infinity;                                  // D2: seconds since the last hard contact with the handler
  let meHandUp = false;                                    // D3: my grounded hand-up (X held)
  let foeHandUp: Body | null = null, foeHandUpLeft = 0;    // D3: the AI defender with a hand up on my load
  let foeBlocker: Body | null = null, foeBlockAt = -1;     // D1: the AI's contest jump timed to my green
  let meFloored = false, meStunSec = 0;                    // D1: posterized BY the rival
  let driveStolen = false;                                 // D2: my poke took the driver's ball
  let foeDunkFlight: { k: number; made: boolean | null } | null = null;
  let defenseLuck: number | null = null;                   // dev: force the AI's rolls (1 = always, 0 = never)
  const roll = (): number => defenseLuck ?? Math.random();   // dev: the roll VALUE forced (0 = every chance lands, 0.99 = none)
  const JUMP_SEC = 0.75, JUMP_APEX = 0.46;
  const JUMPER_HOP_APEX = 0.30;   // DEFENSE-LOOK: a jump shot leaves the floor
  let riseHop: { t: number; dur: number } | null = null;
  const DRIVE_MPS = 5.4;            // the rival's sprint drive (suite pass): the clock is distance / this. Past HoopsDunks' WINDUP_SPEED (5.0) on a full-length drive, so the vocabulary opens; a short drive stays a power dunk
  const TEAM_JERSEY = { mine: '#22d3ee', theirs: '#ff2d78' } as const;   // the slot colours the HUD already speaks (cyan = us, pink = them)
  const AI_REACH_COOLDOWN_SEC = 1.2, AI_STEAL_CHANCE = 0.22, AI_STEAL_ON_BUMP = 0.6, AI_REACH_GATE = 0.5;   // measured at 0.6 s: ten reaches and four reach-in fouls in nine possessions — a foul every other trip   // the AI defender's reach: its cadence and its odds (open / on the bump)
  const STANDING_GATHER_MS = 220;   // DEFENSE-LOOK: the two-foot squat before a standing dunk's flight
  const DUNK_SHARE = 0.55;          // of the OPEN lanes, the share the rival throws down (the rest are layups); nerve tilts it
  const GATHER_TELL_SEC = 0.35;     // the last stretch of the drive reads as the GATHER — the block's window, on the seam and the hint
  // ── the OFF-BALL package (O1–O3) ──
  let screenTurn = 0;                                      // O1: which mate screens this possession (alternates)
  let boxingOut = false;                                   // O2: a shot is up — the seals / the crash
  let lastBumpStripAt = 0;                                 // D2: one bump-strip roll per 1.5 s
  const mateBrain = (b: Body): TeammateBrain | null => b.brain instanceof TeammateBrain ? b.brain : null;
  const foeBrain = (b: Body): DefenderBrain | null => b.brain instanceof DefenderBrain ? b.brain : null;
  const bodyPos = (b: Body): Vector3 => b.char.root.position;
  const jobOf = (b: Body): string => b === me ? (carrierId === 'me' ? 'handler' : carrierId === 'foeTeam' ? (meHandUp ? 'contest' : me.slot.intent.brace ? 'boxout' : 'onball') : 'space') : mateBrain(b)?.job ?? (foeBrain(b) ? (b === driver ? 'handler' : foeBrain(b)!.job) : 'idle');
  const jumpY = (age: number): number => age === Infinity ? 0 : Math.max(0, Math.sin(Math.min(1, age / JUMP_SEC) * Math.PI) * JUMP_APEX);
  const mateArc = new ShotArc();                 // teammate / rival shots FLY (the ball used to hang at the release point)
  const ballWorld = (): Vector3 => ball.getAbsolutePosition();
  const isFoe = (b: Body): boolean => foes.includes(b);
  /** What a body's chest squares to: a defender → the carrier; an attacker → the rim. */
  function objectiveFor(b: Body): Vector3 {
    // O3: a body's chest goes to its JOB's objective (the screened man, the boxed man, the rim on a crash / roll, the ball)
    const mb = b !== me ? mateBrain(b) : null, db = b !== me ? foeBrain(b) : null;
    // a spacer / cutter watches the BALL (that is how a pass is caught), a screener his man, a crasher / roller the rim
    if (mb) return jobObjective(mb.boxing ? 'boxout' : mb.job, { ball: ballWorld(), rim: RIM, mark: mb.objective, screened: mb.screened });
    if (db && db.boxing && db.objective) return db.objective;
    if (isFoe(b)) { const cb = carrierBody(); return carrierId === 'foeTeam' ? RIM : cb ? cb.char.root.position : ballWorld(); }
    return carrierId === 'foeTeam' ? (driver ? driver.char.root.position : ballWorld()) : RIM;
  }
  function feedFor(b: Body) {
    const { window, pose, legs } = hoopsPose(b.bio);
    const def = b.bio.role === 'defense';
    // the authored stance says what the window looks like; the tracker says how hard this body is living in it.
    // Before this, six bodies in the same window were byte-identical however differently they were moving.
    const airborne = b.jumpAge !== Infinity;
    const dyn = dynamicPose(pose, b.motion.signals(b.speed01, b === me ? meIntensity01 * 0.7 : 0, airborne), window);   // DRIBBLE PACE: the sprint reads as work
    return { pose: dyn, legs, aim: objectiveFor(b), eyes: def ? ballWorld() : RIM, window };
  }
  /** Face a body the play's way, slewed: the objective inside range, else the travel, else the heading. */
  const facePlay = (root: TransformNode, vel: Vector3, objective: Vector3 | null, range: number, dt: number, rate = FACE_RATE): number => {
    root.rotation.y = slewYaw(root.rotation.y, playFacing(root.position, vel, objective, range, root.rotation.y), rate, dt); return root.rotation.y;
  };
  const slideDirFor = (yaw: number, vel: Vector3): 'left' | 'right' => (vel.x * Math.cos(yaw) - vel.z * Math.sin(yaw) > 0.3 ? 'right' : 'left');
  /** The per-frame window clocks and the layer's input for one body. */
  function bioTick(b: Body, dt: number, role: HoopsPostureInput['role'], hasBall: boolean, nearestDefender: number, reaching: boolean): void {
    // DYNAMIC POSTURE: feed this body's own tracker. The hero's live vector is his dribble controller's; an AI
    // body's is the one the movement step wrote this frame (see Body.vel).
    const v = b === me ? me.drib.vel : b.vel;
    b.motion.update(v.x, v.z, b.char.root.rotation.y, dt);
    b.landSec = Math.max(0, b.landSec - dt); b.celebrateSec = Math.max(0, b.celebrateSec - dt);
    if (b.shotWin === 'release') { b.shotSec += dt; if (b.shotSec >= RELEASE_SEC) b.shotWin = 'follow'; }
    Object.assign(b.bio, {
      role, hasBall, speed01: b.speed01, nearestDefender, shot: b.shotWin, flight: b === me ? dunkFlight : null, landed: b.landSec > 0, celebrate: b.celebrateSec > 0,
      reaching: reaching || (b !== me && (foeHandUp === b || b.jumpAge !== Infinity)), staggered: b === me ? meStunSec > 0 && !meFloored : b.stunSec > 0 && !b.floored, floored: b === me ? meFloored : b.floored,
    } satisfies HoopsPostureInput);
  }

  const cfg = { heroUrl: SHARED_CFG.heroUrl };

  function allyPositions(): Vector3[] { return [me.char.root.position, ...mates.map((m) => m.char.root.position)]; }
  function foePositions(): Vector3[] { return foes.map((f) => f.char.root.position); }
  function everyBody(): Body[] { return [me, ...mates, ...foes]; }
  function carrierBody(): Body | null {
    if (carrierId === 'me') return me;
    if (carrierId === 'mate0') return mates[0];
    if (carrierId === 'mate1') return mates[1];
    return null;
  }

  /** BIOMECH-HOOPS-WAVE1 G6 (the 1v1's giveBall discipline): every live dribble is PARKED before the ball is re-parented —
   *  a carry still active across the hand-off wrote its WORLD dribble point into the now hand-LOCAL ball (measured: the ball
   *  6 m from the hero, parented to his own hand, after a reset while he was dribbling; a one-frame warp on every steal). */
  function parkCarries(): void { carries.forEach((c) => c.update(0, 0, false)); }
  function giveBallTo(id: typeof carrierId): void {
    carrierId = id;
    parkCarries();
    const body = carrierBody();
    if (body) attachBallToHand(ball, body.char.skeleton, 'RightHand');
  }

  /**
   * LEAVE THE FLOOR TO CONTEST. Returns true if the jump happened. One body, two callers: the raw A press and the
   * slot's `jump` edge — see the note on `PlayerSlot.Intent.jump` for why the block needed a wire of its own.
   */
  /** Schedule the banner's clear: the latest schedule wins, so an older flash's timeout never wipes a newer banner. */
  function bannerClearLater(ctx: ModeContext, ms: number): void { const id = ++bannerSeq; setTimeout(() => { if (bannerSeq === id) ctx.setHud({ banner: '' }); }, ms); }
  let bannerSeq = 0;   // POLISH (2026-09-17): banners race one channel — the latest wins, an older timeout never wipes it
  function bannerFlash(ctx: ModeContext, text: string, ms = 800): void {
    const id = ++bannerSeq;
    ctx.setHud({ banner: text });
    setTimeout(() => { if (bannerSeq === id) ctx.setHud({ banner: '' }); }, ms);
  }
  function contestJump(ctx: ModeContext): boolean {
    if (carrierId !== 'foeTeam' || myJumpAge !== Infinity) return false;
    myJumpAge = 0;
    console.info(`[3V3-DEF] my block jump at driveK ${driveK.toFixed(2)}`);
    me.tree.beat('bball_block_reach');   // BIOMECH-HOOPS-WAVE1: the block reach (was jump_up → idle, two owners on the rig)
    SoundKit.play('whoosh', { pitch: 1.2, volume: 0.35 });
    // G4: a wasted jump says so
    if (driveK < 1 - (GATHER_TELL_SEC + 0.15) / driveSec) { bannerFlash(ctx, 'JUMPED EARLY — WAIT FOR THE RELEASE', 600); }
    return true;
  }

  /** A possession-changing timer: only fires if the possession it was scheduled in is still the live one. */
  function later(ms: number, fn: () => void): void {
    const tok = possessionToken;
    setTimeout(() => { if (!ended && possessionToken === tok) fn(); }, ms);
  }
  function resetPossession(toMe = true): void {
    possessionToken++;
    goaltendCalled = false; foeShotScored = false; paintSec = 0; paintWarned = false;   // one goaltend per shot, and the paint clock is per possession
    // every body is about to be teleported; a reset is not an acceleration
    for (const b of everyBody()) b.motion.reset();
    me.char.root.position.set(0, 0, 6);
    // MODE-STICK-FACE (2026-09-07): face the rim AND tell the dribble so. The movement layer's facing starts at 0 no
    // matter which way the model spawned, and a push AGAINST the facing is a back-pedal that keeps the chest where it
    // is (DribbleController) — so with the hero spawned facing +z and the rim at −z, push-forward ran him BACKWARDS
    // to the rim for the whole drive (measured: facing·travel −1 for 4.4 m/s). 1v1 has always called setFacing(π).
    me.char.root.rotation.y = Math.PI; me.drib.setFacing(Math.PI);
    mates[0].char.root.position.set(-3.5, 0, 4);
    mates[1].char.root.position.set(3.5, 0, 4);
    foes.forEach((f, i) => f.char.root.position.set((i - 1) * 3, 0, 2));
    ctx0?.camDirector.snapTo(me.char.root.position, RIM);   // POLISH: the bodies moved metres — the camera cuts to them, it does not chase
    shooting = false; currentShot = null;
    if (gather || finish || spin || posting) me.tree.release();   // HOOPS-MOVE-KIT-A/B: a held gather / finish / seal / pivot is lifted with the possession
    gather = null; finish = null; spin = null; posting = false; spinCooldown = 0; spinArmed = 0; stickGestures = []; rStick.reset(); stickShot = null; shimmyLeft = 0; if (pausedDribble) { pausedDribble = false; me.drib.pause(false); } pumpWindow = 0; banked = null; driveContest = null; finishFoul = false; passFakeCooldown = 0; threat = { ...THREAT_IDLE }; stickHeld = 0; stickPeak = 0; jabEligible = false; burstArmed = false; me.char.root.position.y = 0;
    clearDefense();
    // BIOMECH-HOOPS-WAVE1: the possession's clocks; a held shot is lifted, a floored body gets up
    driver = null; driveK = 0; dunkFlight = null; dunkFlush = null; mateArc.active = false; posterVictim = null; victimSlide = null; lastDunkKind = 'clean';
    for (const b of everyBody()) { b.shotWin = 'none'; b.landSec = 0; b.celebrateSec = 0; b.tree.releaseHold(); if (b.floored) { b.floored = false; b.stunSec = 0; b.tree.beat('karate_get_up'); } }
    if (toMe) giveBallTo('me');
    // O1/O3: one job each for the possession — one mate SCREENS my defender, the other spaces (alternating)
    endBoxOut();
    screenTurn = (screenTurn + 1) % 2;
    mates.forEach((m, i) => mateBrain(m)?.setJob(i === screenTurn ? 'screen' : 'space'));
  }

  return {
    modeId: 'threevthree', mood: 'goldenHour', camPreset: 'team',

    async load(ctx: ModeContext) {
      // ONE BUS PER MOUNT, OWNED BY THE HARNESS. This mode built its own, which worked and was
      // INAUDIBLE: the crowd swell and the tier sting are bound to the harness's bus, and there was
      // exactly one onTierChange subscriber in the game. Same reports, same weights, now heard.
      mbus = ctx.momentum;
      ctx0 = ctx;
      threeVenue = mountVenue(ctx, 'basketball_3v3', { keepGameplayCamera: true, location: ctx.location });
      if (!threeVenue) { VenueKit.buildCourt(ctx.scene, 'venice'); applyOceanCourt(ctx.scene, 'venice'); }
      const spawnBody = async (
        pos: Vector3, tint: string | undefined, ai: boolean,
        aiKind: 'teammate' | 'defender', slotAngle = 0, markIndex: number | null = null,
      ): Promise<Body> => {
        const char = ai
          ? await CharacterPipeline.spawnNpc(ctx.scene, cfg.heroUrl, { position: pos, tint, startClip: SPORT_CLIP.idle })
          : await CharacterPipeline.spawnPlayer(ctx.scene, cfg.heroUrl, { position: pos, startClip: SPORT_CLIP.idle });
        // TEAM KITS (suite pass, 2026-09-16). Six kit bodies in the roster's own tops read as one pickup crowd — the eye
        // had no way to tell a teammate from a defender but the hero's purple. The AI bodies wear their team's jersey
        // (the tint used to be only a roster SEED; the roster's baked kit ignored it); the hero keeps the wardrobe he
        // chose, because he is the one you steer and that is how you find him.
        if (ai) tintGarmentSlot(char, SLOT_KEYS.jersey, aiKind === 'teammate' ? TEAM_JERSEY.mine : TEAM_JERSEY.theirs);
        char.secondary?.setLookTarget(() => ball?.position ?? null);   // Phase 2: all six watch the ball
        neverBindPose(char.animator, SPORT_CLIP.idle);
        installSafePlay(char.animator, 'threevthree');
        ctx.groundLock?.track(char.root, char.skeleton);
        // PERSPECTIVE. `allies` and `foes` used to be the same two functions for
        // everyone, so a DEFENDER was handed the player's team as its allies and
        // its own team as its foes — exactly backwards. It did not matter while
        // DefenderBrain ignored both, and would have silently produced a defence
        // that marked its own teammates the moment it stopped ignoring them.
        // getAbsolutePosition, NOT .position — while carried, the ball is
        // parented to the carrier's hand and .position is palm-local (~origin).
        // Brains anchored on it read the ball as permanently at the rim:
        // defenders never saw a carrier (markHasBall could not be true) and
        // never played on-ball defence at all. Same bug as 1v1, same seam.
        const world = aiKind === 'teammate'
          ? { ball: () => ball.getAbsolutePosition(), hoop: () => RIM, allies: allyPositions, foes: foePositions }
          : { ball: () => ball.getAbsolutePosition(), hoop: () => RIM, allies: foePositions, foes: allyPositions };
        let brain: TeammateBrain | DefenderBrain | null = null;
        if (ai) {
          if (aiKind === 'teammate') brain = new TeammateBrain(slotAngle);
          else { const db = new DefenderBrain(0.55, markIndex); defenderBrains.push(db); marks.push(markIndex ?? 0); brain = db; }
        }
        // NETPLAY (2026-09-12): with ?net=<room> the FIRST AI seat becomes a remote player — one
        // human opponent among the AI, which is the smallest honest step for a 6-body mode. The
        // rest keep their brains. No flag, no change.
        const takeNetSeat = !!net && ai && !netSeatTaken;
        if (takeNetSeat) netSeatTaken = true;
        const slot = takeNetSeat
          ? new PlayerSlot('net1', net!.sourceFor('net1'), false)
          : ai && brain
            ? new PlayerSlot('ai', new AISource(char.root.position, world, brain), false)
            : new PlayerSlot('me', agentCtl ?? localSource, true);
        // BIOMECH-HOOPS-WAVE1: one animation owner per rig, and the Posture Poses layer (mounted here, BEFORE the carries —
        // the dribble arm solves against the posed shoulders); the layer owns the eyes
        char.secondary?.setLookTarget(() => null);
        const body: Body = { char, slot, drib: new DribbleController(), stunSec: 0, vel: new Vector3(), jumpAge: Infinity, reachCooldown: 0, brain, screenHeld: false, tree: new BasketballAnimTree(char.animator), posture: null, bio: { ...HOOPS_INPUT_IDLE }, floored: false, shotWin: 'none', shotSec: 0, landSec: 0, celebrateSec: 0, speed01: 0, motion: new BodyMotion() };
        body.posture = mountPostureLayer(ctx.scene, char.skeleton, char.root, () => feedFor(body), `3V3-PP-${ai ? aiKind : 'me'}`);
        return body;
      };

      localSource = new LocalInputSource();

      net = attachNetplay('threevthree'); netSeatTaken = false;   // no-op without ?net=
      // M69 (mirrors 1v1): when driven by an agent (?agent=1), the hero slot reads from the AgentControlSource
      // instead of local input. Human play is untouched — the bridge is only installed under the dev flag.
      agentCtl = agentBridge() ? new AgentControlSource() : null;
      if (agentCtl) { ctx.agent.control = agentCtl; ctx.agent.getScore = () => myScore; }
      me = await spawnBody(new Vector3(0, 0, 6), undefined, false, 'teammate');
      ring?.dispose(); ring = mountPlayerRing(ctx.scene, me.char.root, { color: TEAM_JERSEY.mine, icon: readPlayerIcon() });   // PLAYER RING: the one you steer, in your team's colour
      mates = [
        await spawnBody(new Vector3(-3.5, 0, 4), '#22d3ee', true, 'teammate', Math.PI * 0.25),
        await spawnBody(new Vector3(3.5, 0, 4), '#22d3ee', true, 'teammate', -Math.PI * 0.25),
      ];
      // Each defender MARKS A MAN: allyPositions() is [me, mate0, mate1], so
      // 0/1/2 is a real matchup. Three defenders with no assignment all solved
      // for the same point between the ball and the rim and arrived in a heap,
      // which is what the first 3v3 screenshot showed.
      foes = [
        await spawnBody(new Vector3(-2, 0, 2), '#ff2d78', true, 'defender', 0, 0),
        await spawnBody(new Vector3(0, 0, 1.5), '#ff2d78', true, 'defender', 0, 1),
        await spawnBody(new Vector3(2, 0, 2), '#ff2d78', true, 'defender', 0, 2),
      ];

      ball = MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, ctx.scene);
      void dressBall(ball, 'basketball');   // Meshy ball skin rides the physics sphere (visual only)
      shotTrail?.dispose(); shotTrail = EffectsKit.ballTrail(ctx.scene, ball); shotTrailLevel = 'soft'; applyTrail(shotTrail, 'off'); shotTrailLevel = 'off';
      carries.forEach((c) => c.dispose()); carries.clear();
      for (const b of [me, ...mates]) carries.set(b, mountBallCarry({ scene: ctx.scene, ball, root: b.char.root, skeleton: b.char.skeleton }));
      meReach?.dispose(); meReach = mountRimReach({ scene: ctx.scene, skeleton: me.char.skeleton, root: me.char.root, ball, rim: RIM, ringR: RIM_RADIUS });
      ballSim = new BallSim(ball, 0.12);
      shotMeter = new ShotMeter();
      turbo = new TurboMeter();
      arc = new ShotArc();
      EffectsKit.ambient(ctx.scene, 'venice');
      EffectsKit.ballTrail(ctx.scene, ball);
      hoopJuice?.dispose(); hoopJuice = new HoopJuice(ctx.scene, RIM);   // A+ P0: juice-only ring + net, material clones — no meshy_hoop_* transform is touched
      meter3d?.dispose(); meter3d = mountShotMeter3D(ctx.scene);
      if (process.env.NODE_ENV === 'development') { const dev = (window as unknown as { __FEL_DEV__?: { hoopJuiceUsed?: unknown } }).__FEL_DEV__; if (dev) dev.hoopJuiceUsed = hoopJuice.used; }
      SoundKit.startAmbient('stadium');
      // `?handle=` — the same probe override 1v1 carries. Chain depth is only reachable at a real handle,
      // so without this the 3v3 vocabulary could be shipped and never actually driven past depth 1.
      if (typeof window !== 'undefined') {
        const q = Number(new URLSearchParams(window.location.search).get('handle'));
        if (Number.isFinite(q) && q > 0) { handle = Math.max(0, Math.min(100, q)); console.info(`[3V3-HANDLE] handle ${handle} (override)`); }
      }

      myScore = 0; foeScore = 0; assists = 0; timeLeft = POSSESSION_SEC; ended = false;
      shotContest = 0; foeCloseMem = foes.map(() => 0);
      ctx.heroRef.current = me.char.root;
      ctx.objectiveRef.current = RIM;
      ctx.camDirector.snapTo(me.char.root.position, RIM);
      threeVenue?.hidePlaceholders();  // M74: drop stand-ins now that real chars are in
      assertSpawned(ctx.scene, { hero: me.char.root, minWorldMeshes: 6, modeId: 'threevthree' });
      resetPossession(true);
      if (process.env.NODE_ENV === 'development') { const dev = (window as unknown as { __FEL_DEV__?: { hoopsPosture?: unknown } }).__FEL_DEV__; const seam = { me: () => me.posture?.layer.get() ?? null, foe: () => foes[0]?.posture?.layer.get() ?? null, bio: () => ({ me: { ...me.bio }, foe: { ...(foes[0]?.bio ?? {}) } }), carrier: () => carrierId, offense: () => { if (!ended) resetPossession(true); }, defend: () => { if (!ended) { resetPossession(false); void opponentPossession(ctx); } }, /* resetPossession(false) only RESETS: its toMe branch is the only thing that hands the ball out, so on its own it leaves the rock wherever it was and no drive ever starts. opponentPossession() is what a defensive possession actually IS here — the 1v1 seam's defend() calls startDefense() for the same reason. */ attackPhase: () => (driveK > 0 && driveK >= 1 - GATHER_TELL_SEC / driveSec ? 'gather' : driveK > 0 ? 'drive' : 'check'), driveK: () => driveK, driveSpeed: () => (driver ? driver.vel.length() : 0), takingCharge: () => takingCharge, flightK: () => (dunkFlight ? dunkFlight.k : foeDunkFlight ? foeDunkFlight.k : -1)   /* MY flight's clock first (the showtime press is timed off it), then the rival's */, luck: (v: number | null) => { defenseLuck = v; }, bumpAge: () => bumpAge, handUp: () => ({ me: meHandUp, foe: !!foeHandUp }), post: () => { const n = nearestLiveFoe(); return { posting, spinning: !!spin, brace: !!me.slot.intent.brace, can: canPostUp(me.char.root.position, RIM_FLOOR, n ? n.char.root.position : null), carrying: carrierId === 'me', shooting, finish: !!finish, gather: !!gather, foeStun: n ? n.stunSec : -1, armed: spinArmed, pump: pumpWindow, glass: !!banked, held: me.tree.held ?? '' }; }, driverRoot: () => driver?.char.root ?? null, block: () => (ctx0 ? contestJump(ctx0) : false), /* the block with no bridge latency: the lab's jump was landing at driveK 1.00 behind its own steer queue */ ended: () => ended, boxing: () => boxingOut,
          // O3: every body's job, its objective and how squarely it faces it (the probes' awareness read)
          jobs: () => everyBody().map((b, i) => { const mb = mateBrain(b), db = foeBrain(b); const obj = b === me ? (carrierId === 'me' ? RIM : (driver?.char.root.position ?? ballWorld())) : objectiveFor(b); const p = bodyPos(b); const yaw = b.char.root.rotation.y; const v = b === me ? me.drib.vel : b.vel; return { id: b === me ? 'me' : isFoe(b) ? `foe${foes.indexOf(b)}` : `mate${mates.indexOf(b)}`, i, job: jobOf(b), phase: mb?.screen.phase ?? (db ? (db.fightingOver === null ? '' : db.fightingOver ? 'over' : 'under') : ''), x: p.x, z: p.z, y: p.y, speed: Math.hypot(v.x, v.z), facing: facingCos(yaw, p, obj), objX: obj.x, objZ: obj.z, boxing: !!(mb?.boxing || db?.boxing), root: b.char.root }; }), get foeRoot() { return driver ? driver.char.root : (foes[0]?.char.root ?? null); }, /* the man to guard is whoever is DRIVING */ nearestFoeRoot: () => foes.reduce<Body | null>((b, f) => !b || Vector3.Distance(f.char.root.position, me.char.root.position) < Vector3.Distance(b.char.root.position, me.char.root.position) ? f : b, null)?.char.root ?? null }; if (dev) dev.hoopsPosture = seam; (ctx.scene.metadata ??= {}).threevthree = seam; }   // BIOMECH-HOOPS-WAVE1 probes
      ctx.setHud({
        score: myScore, foeScore, target: TARGET_SCORE, time: timeLeft, ast: assists,
        hint: 'HOLD R2 (SHIFT) + a direction to SPRINT · R2 + SQUARE (SHIFT + L) at the rim = DUNK, SQUARE (L) alone = LAY IT IN · SQUARE (L): hold, release in the green · BOTTOM BUTTON (J): PASS (hold to FAKE) · CIRCLE (K): call a SCREEN · L2 (F): POST UP (L2/L1 · shoot = HOOK · stick off the rim = FADE, with R2 = SHIMMY FADE · stick at the rim = DROP STEP · stick across = SPIN · let go early = PUMP, then shoot = UP AND UNDER) · snap the stick to break ankles',
      });
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      localSource.feed(e);
      if (e.t === 'stick' && e.side === 'R') {   // MODE-STICK-FACE: R stick → the look orbit — except on the floor with the ball: the DRIBBLE STICK (2K)
        if (posting && carrierId === 'me' && !shooting && !dunking) {   // POST HOOK (2K20): with the post held the stick is the SHOT stick
          postStick = { x: e.x, y: e.y };
          if (!stickShot && e.y < -0.5 && Math.abs(e.x) > 0.3) { stickShot = { side: e.x > 0 ? 'right' : 'left', shimmy: !!me.slot.intent.sprint, started: false, shimmied: false }; shimmyLeft = stickShot.shimmy ? 0.22 : 0; }
          rStick.reset(); lookX = 0; lookY = 0;
        } else {
        const onFloor = carrierId === 'me' && !shooting && !dunking && !finish && !gather && !spin;
        if (onFloor) { stickGestures.push(...rStick.feed(e.x, e.y, performance.now() / 1000)); lookX = 0; lookY = 0; }
        else { rStick.reset(); lookX = e.x; lookY = e.y; }
        }
      }
      if (dunking && e.t === 'button' && e.btn === 'X' && e.pressed) showtimePress = true;   // SHOWTIME: the timed flush
      // BLOCK jump while defending an opponent possession. The body lives in contestJump() so the slot can reach it
      // too — 1v1 carries the same split, and the reason is written out there.
      if (e.t === 'button' && e.btn === 'Y' && e.pressed && contestJump(ctx)) {   // Triangle = BLOCK (2K map)
        /* jumped */
      } else if (e.t === 'button' && e.btn === 'Y' && e.pressed) {
        refuse(ctx, carrierId !== 'foeTeam' ? 'BLOCK IS FOR DEFENSE' : 'ALREADY UP');   // MECHANICS PASS: the press is answered
      } else if (e.t === 'button' && e.btn === 'A' && e.pressed && carrierId === 'me') {
        // THE WIND-UP IS HEARD ON THE PRESS (2026-09-15). B is a tap-or-hold verb: a tap passes, a hold sells the fake,
        // and the hold's own answer cannot arrive until PASS_FAKE_HOLD_MS has gone by — which is past the window a
        // press is judged in, so a HELD pass read as a dead button on the capture (4 of 11). A passer's hands move the
        // instant the button goes down; the tick says so, and the pass or the fake still lands on its own beat.
        SoundKit.play('uiTick', { pitch: 1.15, volume: 0.3 });
      } else if (e.t === 'button' && e.btn === 'A' && e.pressed) {
        refuse(ctx, carrierId === 'foeTeam' ? 'NO BALL TO PASS' : 'YOUR TEAMMATE HAS IT');   // SCORECARD CONTROLS (2026-09-15)
      } else if (e.t === 'button' && e.btn === 'B' && e.pressed && carrierId === 'foeTeam') {
        refuse(ctx, 'NOBODY TO SCREEN FOR ON D');   // Circle is the screen call; on defence it is the charge, held
      } else if (e.t === 'dpad' && e.pressed) {
        refuse(ctx, 'MOVE WITH THE STICK');   // the d-pad is not a verb here, and a dead direction reads as a dead pad
      }
      // the SHOT's gather is heard as SQUARE goes down (the meter it starts is a number, which reads as nothing).
      // No 'SHOOT ON OFFENSE' refusal here: under the 2K map Square is the STEAL without the ball.
      if (e.t === 'button' && e.btn === 'X' && e.pressed && carrierId === 'me') SoundKit.play('uiTick', { pitch: 0.7, volume: 0.3 });
    },

    update(ctx: ModeContext, dt: number) {
      meter3d?.update(dt); if (!shooting && !dunking && meter3d?.visible()) meter3d.end(null);   // a shot that ended without a release (a block, a strip) drops the bar
      if (ended) return;
      timeLeft -= dt;
      if (timeLeft <= 0) {
        ended = true; SoundKit.play('whistle');
        // A TIE IS NOT A WIN (2026-09-12 mechanic pass). This read `myScore >= foeScore`, so a
        // game that ran out of clock level — 21-21 — reported WIN and the recap said GAME WON.
        // It is a rule the game never states, and a player who ties and is told they won has
        // been given a reason not to trust the scoreboard. Reaching TARGET_SCORE is still an
        // outright win; only the buzzer can produce a level game, and it says so now.
        const verdict = myScore > foeScore ? 'WIN' : myScore === foeScore ? 'DRAW' : 'LOSS';
        return ctx.end(verdict, myScore, { foeScore, assists });
      }
      ctx.setHud({ time: Math.ceil(timeLeft) });
      // the carrier dribbles (ball off the palm, arm reaches); everyone else's
      // carry is idle. Shots, dunks and passes put the ball back in the palm.
      const cbNow = carrierBody();
      // HOOPS-MOVE-KIT-A: never while the ball is in the air or on a finish — an active carry on the release frame yanked the
      // flying ball to the dribble point (carrierId stays 'me' until the next possession)
      const ballReleased = !!(ball.metadata as { felReleased?: boolean } | undefined)?.felReleased;
      for (const [b, c] of carries) c.update(dt, b === me ? meSpeed01 : 0.5, cbNow === b && !(b === me && pausedDribble) && !shooting && !dunking && !passFlight.active && !arc.active && !finish && !gather && !ballReleased && !(b === me && !!spin));

      // poll every body; tick stagger timers
      net?.tick(me.slot.intent);   // no-op without ?net=
      for (const b of everyBody()) { b.slot.poll(dt); b.stunSec = Math.max(0, b.stunSec - dt); if (b.jumpAge !== Infinity) { b.jumpAge += dt; b.char.root.position.y = jumpY(b.jumpAge); if (b.jumpAge >= JUMP_SEC) { b.jumpAge = Infinity; b.char.root.position.y = 0; } } }
      if (myJumpAge !== Infinity) myJumpAge += dt;
      if (victimSlide) { const step = slideStep(victimSlide.left, dt); victimSlide.body.char.root.position.addInPlace(victimSlide.dir.scale(step)); victimSlide.left -= step; if (victimSlide.left <= 1e-4) victimSlide = null; }   // DUNK-FANATIC
      if (riseHop && !finish && !dunking) {   // DEFENSE-LOOK: the jump shot's hop
        riseHop.t += dt;
        me.char.root.position.y = Math.max(0, Math.sin(Math.min(1, riseHop.t / riseHop.dur) * Math.PI) * JUMPER_HOP_APEX);
        if (riseHop.t >= riseHop.dur) { riseHop = null; me.char.root.position.y = 0; }
      } else if (riseHop) riseHop = null;
      for (const f of foes) f.reachCooldown = Math.max(0, f.reachCooldown - dt);
      // D1–D3 clocks
      bumpAge += dt; meStunSec = Math.max(0, meStunSec - dt);
      if (meFloored && meStunSec === 0) { meFloored = false; me.tree.beat('karate_get_up'); }
      if (foeHandUp) { foeHandUpLeft -= dt; if (foeHandUpLeft <= 0) { foeHandUp.tree.releaseHold(); foeHandUp = null; } }
      if (shooting && foeBlocker && foeBlockAt >= 0 && shotMeter.t * shotMeter.durationSec >= foeBlockAt) {
        foeBlockAt = -1; foeBlocker.jumpAge = 0; foeBlocker.tree.beat('bball_block_reach'); if (foeHandUp === foeBlocker) foeHandUp = null;
        console.info('[3V3-DEF] ai block jump');
      }
      // D3: X HELD on defense = the grounded hand-up (verticality); D2: X pressed inside reach of the driver = the poke
      if (carrierId === 'foeTeam') {
        if (me.slot.intent.jump) contestJump(ctx);   // the block on the same wire as the hand-up and the poke
        // TAKE THE CHARGE (Circle held) — plant and wear it. Same trade as 1v1: you stop dead, and a driver who
        // arrives at foul speed inside a stride of your planted feet has given the ball back.
        takingCharge = !!me.slot.intent.takeCharge && meStunSec === 0 && !meFloored && myJumpAge === Infinity;
        if (takingCharge && driver) {
          chargeSetSec += dt;
          // CLOSING RATE, NOT SPEED. `driver.vel.length()` peaks at 1.4 m/s here against the 4.2 a foul needs, so
          // the charge was unreachable in this mode for a completely different reason than 1v1's: the rival's
          // drive is a CLOCKED animation (driveK walks a path) and its velocity vector is a by-product, not a
          // physical speed. What a charge actually measures is how fast he arrived AT YOU — the rate the gap is
          // closing — which is the honest read either way and the one a clocked drive can still answer.
          const gapNow = distXZ(me.char.root.position, driver.char.root.position);
          const closing = chargeLastGap < 0 || dt <= 0 ? 0 : Math.max(0, (chargeLastGap - gapNow) / dt);
          chargeLastGap = gapNow;
          if (chargeSetSec >= CHARGE_SET_SEC && gapNow <= CHARGE_RANGE && closing >= FOUL_CLOSING_SPEED) {
            // THE REF OWNS THE CONSEQUENCE — the same refactor 1v1 got. The handbook says a charge is the
            // DEFENCE's ball; the mode reports the fact and carries out the call instead of asserting one.
            const call = judge('charge', { offense: 'foeTeam' === carrierId ? 'foe' : 'me', fouled: 'me' });
            if (call.whistle) SoundKit.play('whistle');
            swing('steal');
            ctx.setHud({ momentum, banner: `${call.banner} — ${call.ball === 'me' ? 'YOUR BALL' : 'THEIR BALL'}!` });
            bannerClearLater(ctx, 1100);
            me.tree.beat(ANKLE_STUMBLE_CLIP, { fadeSec: 0.06 });        // he ran into you; nobody punched either of you
            driver.tree.beat(ANKLE_STUMBLE_CLIP, { fadeSec: 0.06 });
            console.info(`[3V3-REF] ${call.id} at ${closing.toFixed(1)} m/s (set ${chargeSetSec.toFixed(2)}s) → ${call.ball}`);
            driveStolen = true;
            later(800, () => (call.ball === 'me' ? resetPossession(true) : void opponentPossession(ctx)));
          }
        } else if (!takingCharge) { chargeSetSec = 0; chargeLastGap = -1; }
        const wantHandUp = !!me.slot.intent.contest && myJumpAge === Infinity && !meFloored && meStunSec === 0;
        if (wantHandUp !== meHandUp) { meHandUp = wantHandUp; if (meHandUp) console.info('[3V3-DEF] hand up (me)'); else me.tree.releaseHold(); }
        if (meHandUp && !me.tree.busy) me.tree.hold('bball_hand_up', { fadeSec: 0.14 });
        if (me.slot.intent.steal && driver && !driveStolen && !foeDunkFlight && meStunSec === 0 && distXZ(me.char.root.position, driver.char.root.position) < 1.6) {
          me.tree.beat('bball_steal_reach', { fadeSec: 0.14 });
          const exposure = bumpExposure(0.3, bumpAge);
          if (exposure >= 0.5 || roll() < 0.3) { driveStolen = true; swing('steal'); ctx.setHud({ momentum }); console.info(`[3V3-DEF] strip by me ${bumpAge <= BUMP_STRIP_WINDOW_SEC ? 'on the bump' : 'on the roll'} bumpAge ${bumpAge.toFixed(2)}`); }
          else {
            meStunSec = 0.35;
            // A REACH THROUGH THE BODY IS A FOUL, and `reach_in` has been in the handbook the whole time with
            // nothing calling it. Only when you actually arrive on him at speed: a reach at thin air is just a
            // whiff, and it keeps the old "they go by" answer.
            const onHim = distXZ(me.char.root.position, driver.char.root.position) <= BODY_STANDOFF + 0.25;
            if (onHim && me.drib.vel.length() >= REACH_FOUL_SPEED) {
              const call = judge('reach_in', { offense: 'foe', fouled: 'foe' });
              if (call.whistle) SoundKit.play('whistle');
              ctx.setHud({ banner: `${call.banner} — ${call.ball === 'me' ? 'YOUR BALL' : 'THEIR BALL'}` });
              bannerClearLater(ctx, 900);
              console.info(`[3V3-REF] ${call.id} → ${call.ball}`);
              driveStolen = true;
              later(700, () => (call.ball === 'me' ? resetPossession(true) : void opponentPossession(ctx)));
            } else { bannerFlash(ctx, 'REACH — THEY GO BY', 600); }
          }
        }
      } else if (meHandUp) { meHandUp = false; me.tree.releaseHold(); }

      // the ball in flight (my arced attempt)
      // BIOMECH-HOOPS-WAVE1 G6: teammate / rival shots fly; the drive dunk's make flushes through the iron
      if (mateArc.active) {
        const r = mateArc.step(dt, ball.position, ball);
        if (r === 'missed') {
          // a teammate's or an opponent's miss also meets the iron now, and also leaves a LIVE ball —
          // it used to launch a random vector and then no board was contested for it at all
          deflectMiss(mateMiss?.from ?? ball.position, mateMiss?.quality01 ?? 0.45, mateMiss?.short ?? 0.4, mateMiss?.lateral ?? 0);
          board = { age: 0, contestedCalled: false, shooter: mateMiss?.team ?? 'foe' };
          mateMiss = null;
        } else if (r === 'made') { const nk = netExitKindOf(mateArc.shotStyle); const v = netExitVelocity(nk); ballSim.launch(ball.position.clone(), new Vector3(v.x, v.y, v.z)); console.info(`[3V3-NET] ${nk} exit ${netExitMph(nk)} mph`); }   // NET EXIT
      }
      else if (dunkFlush) {   // DUNK-FANATIC: over the lip and down through the ring (RimFlush), never carried in flat from a metre out
        dunkFlush.since += dt;
        if (!dunkFlush.st) dunkFlush.st = startFlush(dunkFlush.releasePos, RIM, RIM_RADIUS, 0.12, NET_EXIT_MPS[dunkFlush.kind] + NET_DROP_NUDGE, NET_EXIT_MPS[dunkFlush.kind] + NET_DROP_NUDGE);
        const st = stepFlush(dunkFlush.st, RIM, RIM_RADIUS, 0.12, dt); ball.position.set(st.pos.x, st.pos.y, st.pos.z);
        if (st.phase === 'free') { const v = netExitVelocity(dunkFlush.kind); ballSim.launch(ball.position.clone(), new Vector3(v.x, v.y, v.z)); console.info(`[3V3-NET] ${dunkFlush.kind} exit ${netExitMph(dunkFlush.kind)} mph`); dunkFlush = null; }
      }
      else if (!ball.parent && !arc.active && !passFlight.active) ballSim.step(dt);   // DUNK-FANATIC: steps through a rim hang / a mid-flight swat too
      if (board && !arc.active && !mateArc.active) liveBoard(ctx, dt);
      // THREE SECONDS. Without it the strongest play in a half-court game is to stand under the ring and wait,
      // which is exactly why the rule exists — and 3v3, with two team-mates to pass you the ball while you camp,
      // wanted it more than 1v1 did. The clock resets the instant you leave: cutting through is free, camping is
      // what gets called.
      if (carrierId === 'me' && !dunking && !ended) {
        paintSec = paintClock(paintSec, distXZ(me.char.root.position, RIM_FLOOR) < PAINT_RADIUS, dt);
        if (paintSec === 0) paintWarned = false;
        if (paintSec >= THREE_SECOND_LIMIT) {
          paintSec = 0;
          const call = judge('three_seconds', { offense: 'me' });
          console.info(`[3V3-REF] ${call.id} → ${call.ball}`);
          if (call.whistle) SoundKit.play('whistle');
          swing('turnover');
          ctx.setHud({ momentum, banner: `${call.banner} — ${call.ball === 'me' ? 'YOUR BALL' : 'THEIR BALL'}` });
          bannerClearLater(ctx, 1000);
          later(900, () => (call.ball === 'me' ? resetPossession(true) : void opponentPossession(ctx)));
        } else if (paintSec > THREE_SECOND_LIMIT - 1) {
          ctx.setHud({ hint: 'GET OUT OF THE PAINT' });   // the ref warns before he calls it
          if (process.env.NODE_ENV === 'development' && !paintWarned) {
            paintWarned = true;
            console.info(`[3V3-REF] paint clock ${paintSec.toFixed(2)}s — warning`);
          }
        }
      } else { paintSec = 0; paintWarned = false; }
      // GOALTENDING (2026-09-16). 1v1 has had this since the ref existed and 3v3 never did, so the one defensive
      // play that should be punished — jumping late and swatting the ball on its way DOWN into the ring — was the
      // best thing you could do here. Same read as 1v1's: their shot in the air, me off the floor near the rim,
      // ball above the ring and falling.
      const ballVelYNow = dt > 1e-5 ? (ball.position.y - prevBallY) / dt : 0;
      prevBallY = ball.position.y;
      // …and it is THEIR shot specifically. `arc` is MY shot and `mateArc` carries both a team-mate's and the
      // rival's, so `arc.active || carrierId !== 'me'` would have let me goaltend my own attempt — and awarded
      // the other team two for it. Their possession, their arc.
      if (mateArc.active && carrierId === 'foeTeam' && myJumpAge !== Infinity && !goaltendCalled
          && distXZ(me.char.root.position, RIM_FLOOR) < 1.5
          && isGoaltending(ballVelYNow, ball.position.y, RIM.y)) {
        goaltendCalled = true;
        const call = judge('goaltending', { offense: 'foe', shooter: 'foe' });
        console.info(`[3V3-REF] ${call.id} (ball y ${ball.position.y.toFixed(2)} falling ${ballVelYNow.toFixed(1)}) → ${call.ball}`);
        if (call.whistle) SoundKit.play('whistle');
        mateArc.active = false;
        // THE BASKET COUNTS — ONCE (suite pass, 2026-09-16). The rival's release banks its two the moment the shot is
        // decided (before the ball flies), so a goaltend on a MADE shot was scoring it twice: measured, a possession
        // conceding 4. On a miss the call is what makes it a basket; on a make it is only the whistle.
        if (!foeShotScored) foeScore += 2;
        ctx.setHud({ foeScore, banner: call.banner });
        bannerClearLater(ctx, 900);
        // 3v3 has no checkGameOver helper — it inlines the target check everywhere, so this matches that idiom
        later(900, () => {
          if (foeScore >= TARGET_SCORE) { ended = true; SoundKit.play('whistle'); ctx.end('LOSS', myScore, { foeScore, assists }); return; }
          resetPossession(true);
        });
      }
      // THE HOT HAND'S TRAIL (suite pass): my shot streaks when the momentum meter is up — the dunk contest's ball trail, on the game
      if (shotTrail) { const want: TrailLevel = arc.active && momentum >= 70 ? 'hang' : 'off'; if (want !== shotTrailLevel) { shotTrailLevel = want; applyTrail(shotTrail, want); } }
      if (arc.active) {
        const res = arc.step(dt, ball.position, ball);
        if (res === 'made') {
          myScore += arcPoints;
          { const nk = netExitKindOf(arc.shotStyle); const v = netExitVelocity(nk); ballSim.launch(ball.position.clone(), new Vector3(v.x, v.y, v.z)); console.info(`[3V3-NET] ${nk} exit ${netExitMph(nk)} mph`); }   // NET EXIT
          me.shotWin = 'none'; me.celebrateSec = CELEBRATE_SEC; me.tree.beat('bball_score_celebrate', { fadeSec: 0.26 });   // BIOMECH-HOOPS-WAVE1 G5
          // A THREE is not a routine bucket and must not land like one. The mode
          // had no camera pulse anywhere, so a deep splash and a two-foot layup
          // produced identical feedback — Phase 7's bar is that the big moment
          // is distinguishable, and Phase 8's is that the moments which earn it
          // get the juice.
          const bigShot = arcPoints === 3;
          SoundKit.play('score', { pitch: arcQuality === 'perfect' ? 1.2 : 1 });
          SoundKit.play('swish', { volume: arcQuality === 'perfect' ? 0.85 : 0.6 });
          EffectsKit.burst(ctx.scene, RIM, 'net');
          if (bigShot || arcQuality === 'perfect') {
            SoundKit.play('crowdCheer', { volume: bigShot ? 1 : 0.7 });
            ctx.camDirector.pulse(bigShot ? 0.85 : 0.5, 0.5);
          }
          // A+ P0 CONTACT-lite, the soft sibling (mirrors 1v1): every jumper drops through with a small feel hit and a
          // short shake — no hit-stop latch, no flash, no slam thud (that is the dunk's). The hoop still answers the make.
          ctx.feel?.impact?.(bigShot ? 0.45 : 0.4);
          ctx.juice.shake(0.06, 100);
          hoopJuice?.punch();
          console.info('[3V3-JUICE] jumper make');
          if (bigShot) EffectsKit.burst(ctx.scene, me.char.root.position.add(new Vector3(0, 1.8, 0)), 'sparks');
          // HOOPS-MOVE-KIT-A M2: fouled on the finish. The REF names the call and decides who gets the
          // ball; this branch used to write the banner itself and then hand the ball over unconditionally,
          // which meant an and-one in 3v3 was worth strictly less than an and-one in 1v1 for no stated
          // reason. `foulAward` says what a foul is worth in a format with no free throws: the ball.
          const andOneCall = finishFoul ? judge('and_one', { offense: 'me', shooter: 'me', fouled: 'me' }) : null;
          finishFoul = false;
          ctx.setHud({
            score: myScore,
            banner: andOneCall ? `${arcLabel} — ${andOneCall.banner}`
              : arcQuality === 'perfect' ? `${arcLabel} — SPLASH!` : `${arcLabel} — GOOD!`,
          });
          bannerClearLater(ctx, 800);
          if (myScore >= TARGET_SCORE) { ended = true; SoundKit.play('whistle'); ctx.end('WIN', myScore, { foeScore, assists }); return; }
          if (andOneCall) {
            console.info(`[3V3-REF] ${andOneCall.id} → ${andOneCall.ball} (${foulAward(andOneCall)})`);
            if (andOneCall.whistle) SoundKit.play('whistle');
          }
          // an and-one keeps the ball with the fouled team; otherwise the FORMAT decides, and 3x3 alternates
          const next = andOneCall ? andOneCall.ball ?? 'me' : possessionAfterScore(FORMAT, 'me');
          later(300, () => (next === 'me' ? resetPossession(true) : void opponentPossession(ctx)));
        } else if (res === 'missed') {
          SoundKit.play('miss');
          me.shotWin = 'none';
          // EARLY is short off the front and comes back at me, LATE is long off the back; a hand in my
          // face pushes it short on top of the timing. arcQuality / shotContest were already recorded
          // at the release, so the iron can answer the shot that was actually taken.
          deflectMiss(
            me.char.root.position,
            arcQuality === 'perfect' ? 0.95 : arcQuality === 'early' || arcQuality === 'late' ? 0.55 : 0.2,
            (arcQuality === 'early' ? 0.8 : arcQuality === 'late' ? -0.8 : arcQuality === 'brick' ? 0.3 : 0) + shotContest * 0.7,
            arcQuality === 'brick' ? (Math.random() < 0.5 ? -0.7 : 0.7) : 0,
          );
          if (finishFoul) {   // HOOPS-MOVE-KIT-A M2: fouled in the air on a miss — the ref calls it
            finishFoul = false;
            const call = judge('shooting_foul', { offense: 'me', shooter: 'me', fouled: 'me', detail: 'ON THE FINISH' });
            console.info(`[3V3-REF] ${call.id} → ${call.ball} (${foulAward(call)})`);
            if (call.whistle) SoundKit.play('whistle');
            // no free throws in this format (Ref.FREE_THROWS_IMPLEMENTED) — a foul is answered with the ball
            ctx.setHud({ banner: `${call.banner} — ${call.ball === 'me' ? 'BALL BACK' : 'THEIR BALL'}` });
            bannerClearLater(ctx, 900);
            const back = call.ball ?? 'me';
            later(900, () => (back === 'me' ? resetPossession(true) : void opponentPossession(ctx)));
          } else {
            ctx.setHud({ banner: 'RIMS OUT' });
            bannerClearLater(ctx, 700);
            board = { age: 0, contestedCalled: false, shooter: 'me' };   // O2: the board is LIVE, not a race
          }
        }
      }

      const iAmCarrier = carrierId === 'me';
      const meIntent = me.slot.intent;
      // CIRCLE — CALL FOR A SCREEN (owner's 2K map). The screen system was already here and already good; what was
      // missing is that it was assigned FOR you, one mate per possession on an alternating turn, so a pick was
      // something that happened near you rather than something you asked for. A call re-tasks the mate who is not
      // carrying: he comes and sets it now.
      if (meIntent.screen && carrierId === 'me' && !ended) {
        const helper = mates.find((m) => mateBrain(m)?.job !== 'screen') ?? mates[0];
        const hb = helper && mateBrain(helper);
        if (hb) {
          hb.setJob('screen');
          mates.filter((m) => m !== helper).forEach((m) => mateBrain(m)?.setJob('space'));
          SoundKit.play('uiTick', { pitch: 0.9, volume: 0.35 });
          ctx.juice.callout('SCREEN COMING', '#fcd34d', 520);
          console.info('[3V3-OFF] screen called');
        }
      }
      const moving = Math.hypot(meIntent.moveX, meIntent.moveY) > 0.1;
      const sprintOk = turbo.gate(dt, meIntent.sprint, moving);
      ctx.setHud({ turbo: Math.round(turbo.t01 * 100) }); ring?.set(turbo.t01);
        // Stick-space is normalised in LocalInputSource — see PlayerSlot.
      // MODE-STICK-FACE (2026-09-07): CAMERA-relative — the team camera looks at the rim (−z) from behind me, and in a
      // left-handed world a raw +x intent is SCREEN-LEFT (measured: stick-right Δscreen −5.6 m). Up = the camera's flat
      // forward, right = screen right, handed to the dribble in its stick space (+Y = −Z).
      let wish = ctx.camDirector.forwardFlat().scale(meIntent.moveY).addInPlace(ctx.camDirector.rightFlat().scale(meIntent.moveX));
      // THE STANCE NOW COSTS AND PAYS. The slide animation was already here and did nothing to the body —
      // a crouched defender covered ground exactly like an upright one. In a stance you slide faster and
      // go forward slower; upright it is the other way round, which is what makes the crossover work.
      {
        const man = carrierId === 'foeTeam' ? (driver ?? nearestLiveFoe()) : null;
        const sitting = !!meIntent.intense;   // L2 HELD — 2K's intense D
        const engaged = inStance({
          onDefense: carrierId === 'foeTeam',
          distToMan: man ? distXZ(me.char.root.position, man.char.root.position) : Infinity,
          speed01: meSpeed01,
          disabled: meStunSec > 0,
          intense: sitting,
        });
        if (carrierId === 'foeTeam') wish = stanceWish(wish, me.char.root.rotation.y, engaged, sitting);
      }
      const drib = me.drib.update(dt, wish.x, -wish.z, sprintOk);
      meSpeed01 = drib.speed01; me.speed01 = drib.speed01;
      meIntensity01 = drib.intensity01; if (drib.gear !== meGear) { console.info(`[3V3-PACE] gear ${meGear} → ${drib.gear} at ${me.drib.vel.length().toFixed(1)} m/s`); meGear = drib.gear; }
      if (drib.paceChange) { SoundKit.play('whoosh', { pitch: 1.25, volume: 0.4 }); ctx.camDirector.pulse(0.2, 0.3); console.info('[3V3-PACE] change of pace'); }
      // THE FLOOR ANSWERS A HARD STOP. Dust existed and ten modes used it — for knockdowns, tackles and
      // landings, never for STOPPING, which is the most violent thing a body does on a court on purpose.
      // `tickScuff` thresholds on DECELERATION rather than a per-frame speed drop, so the same cut puffs at
      // 30 fps and at 144; a per-frame delta would fire on one and not the other.
      {
        const sc = tickScuff(scuff, Math.hypot(me.drib.vel.x, me.drib.vel.z), dt, true);
        scuff = sc.state;
        if (sc.strength > 0) {
          EffectsKit.burst(ctx.scene, me.char.root.position.clone(), 'dust', scuffPuffScale(sc.strength));
          SoundKit.play('squeak', { volume: scuffVolume(sc.strength), pitch: 0.92 + sc.strength * 0.2 });
        }
      }
      // HOOPS-MOVE-KIT-A: never inside a shot / finish — the hand swap moved the finishing hand's ball to the other palm mid-hop
      // (measured on a right-hand layup: the ball to the left hand at +207 ms; 1v1 had this line under its guard)
      // STICK HANDLE (2K17, owner 2026-09-17): the right stick's gestures become moves while the ball is on the floor — a
      // side flick at pace is the MOMENTUM CROSS (a wide cut that keeps the run; chained, the spam escalates), a down
      // flick the MOMENTUM BEHIND THE BACK (slow: the hesi), a hold is PAUSIN' (frozen, the ball out, the release explodes),
      // a half-circle sweep the STEEZO ROLL (the wrap rolled into the spin). In the air the same stick is the trick stick.
      if (stickGestures.length && iAmCarrier && !shooting && !dunking && !finish && !gather && !spin) {
        const nfS = nearestLiveFoe(); const foeDistS = nfS ? distXZ(me.char.root.position, nfS.char.root.position) : Infinity; const foeLiveS = !!nfS;
        for (const g of stickGestures) {
          if (g.kind === 'release') { if (pausedDribble) { pausedDribble = false; me.drib.pause(false); me.tree.releaseHold(); SoundKit.play('whoosh', { pitch: 1.3, volume: 0.4 }); console.info('[3V3-STICK] release — the explode out of the pause'); } continue; }
          const pick = stickMoveFor(g, { speed01: drib.speed01, pressured: foeDistS < 2.0 && foeLiveS, sprint: sprintOk });
          if (!pick) continue;
          console.info(`[3V3-STICK] ${g.kind}${'dir' in g ? ' ' + g.dir : ''} → ${pick.move}${pick.side ? ' ' + pick.side : ''} at ${me.drib.vel.length().toFixed(1)} m/s`);
          if (pick.move === 'momentum_cross') me.drib.momentumCross(pick.side ?? 'right', sprintOk);
          else if (pick.move === 'momentum_btb') me.drib.momentumBtb(pick.side ?? 'right', sprintOk);
          else if (pick.move === 'hesi') me.drib.hesitate();
          else if (pick.move === 'steezo_roll') {
              if (sprintOk && turbo.t01 >= 0.08 && distXZ(me.char.root.position, RIM_FLOOR) <= 6.5) {
                // THE DROP STEP (owner): the sweep with the turbo takes one hard momentum step at the rim first — the body is PULLED
                // toward the iron — and 0.26 s later, inside range, the spin becomes the takeoff (PAUSIN'); out of range it is the roll
                const toRimD = RIM_FLOOR.subtract(me.char.root.position); toRimD.y = 0; toRimD.normalize(); const sideD = pick.side ?? 'right';
                me.drib.dropStep(toRimD.x, toRimD.z, sprintOk); doMove(ctx, 'momentum_cross', sideD); SoundKit.play('whoosh', { pitch: 1.2, volume: 0.45 });
                console.info(`[3V3-STICK] drop step toward the rim at ${me.drib.vel.length().toFixed(1)} m/s (${distXZ(me.char.root.position, RIM_FLOOR).toFixed(1)} m out)`);
                later(260, () => {
                  if (!(carrierId === 'me') || shooting || dunking || spin || finish) return;
                  if (pausinWanted({ sprint: true, dist: distXZ(me.char.root.position, RIM_FLOOR), speed: me.drib.vel.length(), turbo01: Math.max(turbo.t01, 0.1) })) { console.info("[3V3-STICK] PAUSIN' — the spin thrown into the takeoff"); startDunk(ctx, (() => { const nfP = nearestLiveFoe(); return nfP && distXZ(me.char.root.position, nfP.char.root.position) < 2.2 ? 'poster' : 'dunk'; })(), nearestLiveFoe()?.char.root.position ?? null, PAUSIN_DUNK); }
                  else { me.drib.momentumBtb(sideD, true); later(180, () => { if ((carrierId === 'me') && !spin && !shooting && !dunking) { spinCooldown = 0; startSpin(ctx, (nearestLiveFoe()?.char.root.position ?? null), sideD); } }); }
                });
                continue;
              }
              me.drib.momentumBtb(pick.side ?? 'right', sprintOk); const sideS = pick.side ?? undefined; later(180, () => { if (iAmCarrier && !spin && !shooting && !dunking) { spinCooldown = 0; startSpin(ctx, (nearestLiveFoe()?.char.root.position ?? null), sideS); } }); }
          doMove(ctx, pick.move, pick.side ?? undefined);
          SoundKit.play('whoosh', { pitch: pick.move === 'momentum_cross' ? 1.45 : 1.3, volume: 0.4 }); ctx.feel?.impact?.(0.1);
        }
        stickGestures = [];
      } else if (stickGestures.length) stickGestures = [];
      if (drib.crossover && !shooting && !dunking && !finish && !gather && !posting && !spin) {
        carries.get(me)?.switchHand();
        // A CROSSOVER IS A CHAIN LINK, not just a hand swap. In 3v3 it only ever switched hands, so the
        // chain could not exist here, the ankles could never break, and the move vocabulary the owner
        // commissioned lived in 1v1 alone. Same read, same resolver, this mode's clips.
        const toRimFlat = RIM_FLOOR.subtract(me.char.root.position); toRimFlat.y = 0;
        const nf = nearestLiveFoe();
        const nfDist = nf ? distXZ(me.char.root.position, nf.char.root.position) : Infinity;
        doMove(ctx, moveFromContext({
          speed01: drib.speed01,
          retreating: Vector3.Dot(me.drib.vel, toRimFlat) < -0.2,
          pressured: nfDist < 2.0,
          last: chain.last,
          chainLength: chain.length,
          inHisChest: nfDist < OFF_THE_HEAD_RANGE,
        }, handle));
      }
      const nearestFoeDist = foes.reduce((best, f) => f.stunSec > 0 ? best : Math.min(best, Vector3.Distance(f.char.root.position, me.char.root.position)), Infinity);
      if (shooting) {   // BIOMECH-HOOPS-WAVE1 G1: the shooter squares to the rim through the meter
        me.char.root.rotation.y = slewYaw(me.char.root.rotation.y, yawTo(me.char.root.position, RIM), FACE_RIM_RATE, dt); me.drib.setFacing(me.char.root.rotation.y);
      }
      // HOOPS-MOVE-KIT-A M1/M3: the gather moves the body (the pull-up's plant, the step-back), the finish strides and hops
      if (gather) {
        gather.t += dt;
        moveMe(gatherWish(gather.plan, gather.t), dt);
        if (gather.t >= gather.plan.sec) {
          const plan = gather.plan; gather = null;
          // HOOPS-MOVE-KIT-B wave 2: the footwork gathers (step-through / hop / euro) end IN a finish, where the feet land
          if (plan.then && plan.then !== 'rise') startFinish(ctx, plan.then, shotContest, nearestLiveFoe()?.char.root.position ?? null, plan.side, plan.sec);
          else beginRise();
        }
      }
      if (finish) stepFinish(dt);
      // HOOPS-MOVE-KIT-B: M6 the pivot owns the body while it turns; otherwise the POST-UP seal (M4–M6's path)
      spinCooldown = Math.max(0, spinCooldown - dt);
      chain = tickChain(chain, dt, handle);   // the chain expires on its own; a late crossover starts a new one
      passFakeCooldown = Math.max(0, passFakeCooldown - dt);
      threat = tickThreat(threat, dt);

      // ── TRIPLE THREAT (ported from 1v1, owner's stationary-offence ask) ──────────────────────────
      // Standing still with the ball was literally idle in this mode: no stance, no jab, nothing to read.
      // The same stick direction is both the lie and the truth — a TAP jabs, a LEAN drives — which is why
      // the jab cannot have its own button without losing the thing that makes it work.
      if (iAmCarrier) {
        const stickMag = Math.hypot(meIntent.moveX, meIntent.moveY);
        const threatening = inTripleThreat({
          carrying: true, speed01: drib.speed01,
          busy: shooting || dunking || !!finish || !!gather || !!spin, posting,
        });
        if (stickMag > 0.45) {
          // LATCH at the START of the push: the tap itself moves the body past the stance's speed limit, so
          // reading it at the release always said "driving" and no jab ever fired (measured in 1v1).
          if (stickHeld === 0) jabEligible = threatening;
          stickHeld += dt; stickPeak = Math.max(stickPeak, stickMag);
        } else {
          if (jabEligible && stickHeld > 0 && isJabInput(stickHeld, stickPeak) && canJab(threat)) {
            const nf = nearestLiveFoe();
            const odds = nf ? jabBiteOdds({
              defenderDist: distXZ(me.char.root.position, nf.char.root.position),
              defenderClosing: nf.speed01 > 0.25,
              defenderSet: nf.speed01 < 0.1,
              handle,
              shownThisPossession: threat.shown,
            }) : 0;
            const bought = !!nf && Math.random() < odds;
            threat = throwJab(threat, bought);
            burstArmed = bought;
            me.tree.beat('bball_hesi', { fadeSec: 0.05 });
            SoundKit.play('whoosh', { pitch: 1.25, volume: 0.28 });
            if (bought && nf) {
              nf.stunSec = Math.max(nf.stunSec, 0.3);
              nf.tree.beat('bball_contact_react', { fadeSec: 0.07 });
              ctx.feel?.impact?.(0.2);
              ctx.setHud({ banner: 'HE BIT THE JAB — GO!' });
              bannerClearLater(ctx, 600);
            }
            console.info(`[3V3-THREAT] jab #${threat.shown} odds ${odds.toFixed(2)} bought ${bought}`);
          }
          stickHeld = 0; stickPeak = 0; jabEligible = false;
        }
        // ONE impulse on the first step out of the stance, never a per-frame multiplier (that compounds
        // into a teleport — the reason it is written this way in 1v1)
        if (burstArmed && threat.advantage > 0 && drib.speed01 > 0.3) {
          me.drib.vel.scaleInPlace(jabBurst(threat));
          burstArmed = false;
        }
      } else if (stickHeld !== 0 || jabEligible) { stickHeld = 0; stickPeak = 0; jabEligible = false; }
      spinArmed = Math.max(0, spinArmed - dt);
      const postDef = nearestLiveFoe();
      if (spin) stepSpin(ctx, dt);
      else if (iAmCarrier && updatePost(ctx, dt, wish.x, -wish.z, postDef ? postDef.char.root.position : null)) { /* the seal owns the stick */ }
      else if (iAmCarrier && spinArmed > 0 && spinCooldown <= 0 && !shooting && !dunking && !finish && !gather) {
        // M6: on the swing ACROSS MY PATH — against the travel, not the body's yaw (which lags the stick through a turn)
        const heading = me.drib.vel.lengthSquared() > 1 ? Math.atan2(me.drib.vel.x, me.drib.vel.z) : me.char.root.rotation.y;
        const side = postSpinSide(wish.x, wish.z, heading);
        if (side) { spinArmed = 0; startSpin(ctx, postDef ? postDef.char.root.position : null, side); }
      } else if (!iAmCarrier && posting) { posting = false; me.tree.releaseHold(); }
      if (!shooting && !dunking && !spin) {
        if (!finish && !posting) me.char.root.position.addInPlace(me.drib.vel.scale(dt));
        if (!threeVenue?.constrain(me.char.root.position)) clampToHalfCourt(me.char.root.position, 8, 15);   // phase 3: navmesh first
        // OUT OF BOUNDS OFF THE CARRIER — the same rule 1v1 was missing. The clamp above holds every body inside
        // the lines, so carrying into the sideline was an invisible wall you slid along for free: the only way to
        // lose it by leaving the floor was a LOOSE ball. The clamp stays (a body half off the court looks broken);
        // the line is now a line. A grace window keeps a bump into it from being a turnover.
        if (iAmCarrier && !shooting && !dunking && !finish) {
          const p = me.char.root.position;
          const outX = Math.abs(p.x) >= COURT_HALF_WIDTH - OOB_EPSILON;
          const outZ = p.z >= COURT_DEPTH - OOB_EPSILON;
          const pushingOut = (outX && Math.sign(wish.x) === Math.sign(p.x) && Math.abs(wish.x) > 0.3) || (outZ && wish.z > 0.3);
          oobSec = outX || outZ ? oobSec + dt : 0;
          if (pushingOut && oobSec >= OOB_GRACE_SEC) {
            oobSec = 0;
            const call = judge('out_of_bounds', { offense: 'me', shooter: 'me' });
            if (call.whistle) SoundKit.play('whistle');
            console.info(`[3V3-REF] ${call.id} off the carrier at x ${p.x.toFixed(2)} z ${p.z.toFixed(2)} → ${call.ball}`);
            ctx.setHud({ banner: `${call.banner} — ${call.ball === 'me' ? 'YOUR BALL' : 'THEIR BALL'}` });
            bannerClearLater(ctx, 900);
            if (call.ball === 'me') resetPossession(true); else void opponentPossession(ctx);
            return;
          }
        } else oobSec = 0;
        // BIOMECH-HOOPS-WAVE1 G1: on defense my chest stays on the driver (the slides move me sideways); on offense I face my travel
        if (carrierId === 'foeTeam') me.drib.setFacing(facePlay(me.char.root, me.drib.vel, driver ? driver.char.root.position : null, DEFEND_FACE_RANGE, dt));
        else if (!posting) me.char.root.rotation.y = drib.facingRad;

        // ANKLE-BREAKER on the nearest set defender (never inside a finish's hop)
        if (iAmCarrier && drib.crossover && !finish && !posting) {
          SoundKit.play('whoosh', { pitch: 1.4, volume: 0.4 });
          const near = foes.reduce<Body | null>((best, f) =>
            !best || Vector3.Distance(f.char.root.position, me.char.root.position)
              < Vector3.Distance(best.char.root.position, me.char.root.position) ? f : best, null);
          if (near && near.stunSec === 0 && checkAnkleBreak(true, me.char.root.position, near.char.root.position)) {
            near.stunSec = ANKLE_BREAK_STUN_SEC;
            SoundKit.play('impact', { pitch: 0.8, volume: 0.5 });
            SoundKit.play('crowdCheer', { volume: 0.5 });
            ctx.feel?.impact?.(0.35);
            EffectsKit.burst(ctx.scene, near.char.root.position.add(new Vector3(0, 0.2, 0)), 'dust');
            near.tree.beat(ANKLE_STUMBLE_CLIP);   // a STUMBLE, not a karate hit react — nobody punched him
            ctx.setHud({ banner: 'ANKLES!' });
            bannerClearLater(ctx, 800);
          }
        }

        // HESITATION — same vocabulary as 1v1: the pull-back tap plants you,
        // and a defender who has been CLOSING (not one standing set) bites.
        if (iAmCarrier && drib.hesitation && !finish && !posting) {
          // THE PULL-BACK IS A LINK. 3v3 had the hesitation and the bite but never registered it on the
          // chain, so nothing could come OFF the hesi here — the slip-and-slide and the in-and-out read
          // `last === 'hesi'` and it was never set. Hesi into cross is the oldest combo there is.
          doMove(ctx, 'hesi');
          turbo.t01 = Math.max(0, turbo.t01 - 0.05);
          SoundKit.play('whoosh', { pitch: 0.8, volume: 0.3 });
          let bit = false;
          for (let fi = 0; fi < foes.length; fi++) {
            const f = foes[fi];
            if (f.stunSec > 0) continue;
            if (Vector3.Distance(f.char.root.position, me.char.root.position) < 2.4 && (foeCloseMem[fi] ?? 0) > 0.8) {
              f.stunSec = 0.45;
              bit = true;
              f.tree.beat(ANKLE_STUMBLE_CLIP);       // he bit the hesi and had to catch himself
              break;                                   // only the man you shook
            }
          }
          if (bit) {
            SoundKit.play('impact', { pitch: 1.1, volume: 0.35 });
            ctx.feel?.impact?.(0.2);
            ctx.setHud({ banner: 'BIT ON THE HESI!' });
          } else {
            ctx.setHud({ banner: 'HESI…' });
          }
          bannerClearLater(ctx, 700);
        }
      }
      // BIOMECH-HOOPS-WAVE1 G2: the ONE owner of my rig reads the game every frame (dribble / drive / protect / slides; a
      // held shot and the dunk / land beats are mode-owned and never raced)
      const meBoxing = boxingOut && !!meIntent.brace && !finish && !dunking;   // O2: L1 held on a shot = my seal on the nearest foe
      if (meBoxing) { const nf = nearestLiveFoe(); if (nf) me.char.root.rotation.y = slewYaw(me.char.root.rotation.y, yawTo(me.char.root.position, nf.char.root.position), FACE_RATE, dt); }
      if (!dunking) me.tree.update({   // the flight's held launch + the land crouch are mode-owned beats
        // STRIDE MATCHING: real ground speed, because speed01 is normalised and cannot pace a stride
        speedMps: Math.hypot(me.drib.vel.x, me.drib.vel.z),
        speed01: drib.speed01, crossover: drib.crossover && iAmCarrier, crossoverDir: wish.x >= 0 ? 'right' : 'left', moveRate: moveRate(sprintOk), nearestDefender: nearestFoeDist, hasBall: iAmCarrier && !passFlight.active,
        shooting, dunking, driving: iAmCarrier && sprintOk && drib.speed01 > 0.6 && Vector3.Dot(me.drib.vel, RIM.subtract(me.char.root.position)) > 0,
        defending: carrierId === 'foeTeam', bracing: meBoxing, staggered: false, slideDir: slideDirFor(me.char.root.rotation.y, me.drib.vel),
        retreat: retreatFor(me.char.root.position, me.drib.vel, driver?.char.root.position ?? null), closeout: closeoutFor(me.char.root.position, me.drib.vel, driver?.char.root.position ?? null, me.speed01), intense: !!me.slot.intent.intense,   // DEFENSE-LOOK
      });
      bioTick(me, dt, carrierId === 'foeTeam' ? 'defense' : 'offense', iAmCarrier && !passFlight.active, nearestFoeDist, me.tree.held === 'bball_block_reach' || meHandUp);
      Object.assign(me.bio, { posting, spinning: !!spin });   // HOOPS-MOVE-KIT-B: the seal turns the chest AWAY from the rim; the pivot owns it through the turn

      // teammates: move via their brain; if they're carrying, chase the hoop a little
      for (let i = 0; i < mates.length; i++) {
        const body = mates[i];
        const intent = body.slot.intent;
        const vel = new Vector3(intent.moveX, 0, -intent.moveY).scale(4.2);
        mateVel[i]?.copyFrom(vel); body.vel.copyFrom(vel);
        body.char.root.position.addInPlace(vel.scale(dt));
        if (!threeVenue?.constrain(body.char.root.position)) clampToHalfCourt(body.char.root.position, 8, 15);
        const mateId = i === 0 ? 'mate0' : 'mate1';
        // BIOMECH-HOOPS-WAVE1 G1/G2: a cutter faces his travel (slewed); on defense his chest stays on the driver; the tree owns the rig
        // HOOPS-MOVE-KIT-A O1/O3: a SCREENER faces the man he screens and PLANTS (the screen clip held); a boxer faces his man
        const mb = mateBrain(body);
        const setScreen = !!mb && mb.job === 'screen' && mb.screen.phase === 'set';
        if (setScreen !== body.screenHeld) {
          body.screenHeld = setScreen;
          if (setScreen) { body.tree.hold('bball_screen_set', { fadeSec: 0.12 }); const side = mb!.screen.side === 1 ? 'RIGHT' : 'LEFT'; ctx.setHud({ banner: `SCREEN ${side} — DRIVE OFF IT` }); bannerClearLater(ctx, 700); console.info(`[3V3-OFF] screen set by mate${i} side ${side}`); }
          else { body.tree.releaseHold(); console.info(`[3V3-OFF] screen ${mb?.screen.phase ?? 'over'} by mate${i}`); }
        }
        const jobAim = mb?.objective ?? null;
        if (carrierId === 'foeTeam') facePlay(body.char.root, vel, mb?.boxing ? jobAim : driver ? driver.char.root.position : null, DEFEND_FACE_RANGE, dt);
        // O3: a body faces its JOB (the man it screens / seals, the ball it spaces around) — it turns to its TRAVEL only on a
        // hard run (a cut / a crash), never while jogging a step: a spacer with its back to the ball is the wandering mannequin
        else if (jobAim && (setScreen || mb?.boxing || mb?.job === 'screen' || vel.length() < 2.5)) body.char.root.rotation.y = slewYaw(body.char.root.rotation.y, yawTo(body.char.root.position, jobAim), FACE_RATE, dt);
        else if (vel.lengthSquared() > 0.1) body.char.root.rotation.y = slewYaw(body.char.root.rotation.y, Math.atan2(vel.x, vel.z), FACE_RATE, dt);
        body.speed01 = Math.min(1, vel.length() / 4.2);
        body.tree.update({
          speedMps: Math.hypot(vel.x, vel.z),
          speed01: body.speed01, crossover: false, nearestDefender: Infinity, hasBall: carrierId === mateId && !passFlight.active, shooting: false, dunking: false, driving: false,
          defending: carrierId === 'foeTeam', bracing: !!mb?.boxing, staggered: false, slideDir: slideDirFor(body.char.root.rotation.y, vel),
          retreat: retreatFor(body.char.root.position, vel, driver?.char.root.position ?? null),   // DEFENSE-LOOK
        });
        bioTick(body, dt, carrierId === 'foeTeam' ? 'defense' : 'offense', carrierId === mateId && !passFlight.active, Infinity, false);
        if (carrierId === (i === 0 ? 'mate0' : 'mate1') && Vector3.Distance(body.char.root.position, RIM) < 3.5 && Math.random() < 0.01) {
          void teammateShoots(ctx, body, i);
        }
      }

      // THE SWITCH (lock deferred item, 2026-09-03): a beaten defender whose man
      // a teammate is clearly closer to swaps marks with that teammate — the
      // X-out after a help rotation, so beating your man no longer leaves him
      // open forever. Pure and hysteretic in Matchups.ts; announced once.
      if (defenderBrains.length === foes.length && marks.length === foes.length) {
        const next = scramSwitch(marks, foes.map((f) => f.char.root.position), allyPositions());
        if (next !== marks) {
          marks = next; defenderBrains.forEach((b, i) => b.setMark(marks[i]));
          if (performance.now() - switchBannerAt > 4000) { switchBannerAt = performance.now(); bannerFlash(ctx, 'THEY SWITCHED', 700); }
        }
      }
      // defenders (staggered defenders don't move) — and track each one's
      // closing speed on the carrier, decaying, for the hesi bite read
      for (let fi = 0; fi < foes.length; fi++) {
        const f = foes[fi];
        if (f.floored && f.stunSec === 0) { f.floored = false; f.tree.beat('karate_get_up'); }   // BIOMECH-HOOPS-WAVE1: a posterized body gets up when the stun ends
        if (f.stunSec > 0) { foeCloseMem[fi] = Math.max(0, (foeCloseMem[fi] ?? 0) - dt * 2.5); f.speed01 = 0; f.vel.setAll(0); bioTick(f, dt, carrierId === 'foeTeam' ? 'offense' : 'defense', false, Infinity, false); continue; }
        if (f === driver) {
          f.vel.setAll(0);   // the rival driving on their possession: the scripted drive moves him, he faces the rim, his tree carries the ball
          f.char.root.rotation.y = slewYaw(f.char.root.rotation.y, yawTo(f.char.root.position, RIM), FACE_RIM_RATE, dt);
          f.speed01 = driveK < 1 ? 0.9 : 0;
          if (!foeDunkFlight) f.tree.update({ speedMps: Math.hypot(f.vel.x, f.vel.z), speed01: f.speed01, crossover: false, nearestDefender: Infinity, hasBall: !!ball.parent, shooting: false, dunking: false, driving: driveK < 1, defending: false, bracing: false, staggered: false });   // the dunk's launch / land are mode-owned beats
          bioTick(f, dt, 'offense', !!ball.parent, Infinity, false);
          if (foeDunkFlight) f.bio.flight = foeDunkFlight;
          continue;
        }
        const intent = f.slot.intent;
        const vel = new Vector3(intent.moveX, 0, -intent.moveY).scale(3.8);
        f.vel.copyFrom(vel);
        const cb = carrierBody();
        if (cb) {
          const toBall = cb.char.root.position.subtract(f.char.root.position); toBall.y = 0;
          const closing = toBall.lengthSquared() > 1e-4 ? Math.max(0, Vector3.Dot(vel, toBall.normalize())) : 0;
          foeCloseMem[fi] = Math.max(closing, (foeCloseMem[fi] ?? 0) - dt * 2.5);
        }
        f.char.root.position.addInPlace(vel.scale(dt));
        if (!threeVenue?.constrain(f.char.root.position)) clampToHalfCourt(f.char.root.position, 8, 15);
        // BIOMECH-HOOPS-WAVE1 G1: a defender's chest stays ON the carrier inside range (he faced his travel — a sideways-shuffling
        // run through every slide); beyond it he runs to his spot facing the travel; the tree owns the rig (slides / stance)
        // O2/O3: a boxer faces his MAN (the seal), the on-ball man the handler, a helper / denier the ball (the job's objective)
        const db = foeBrain(f);
        const aim = db?.boxing ? db.objective : cb && carrierId !== 'foeTeam' ? cb.char.root.position : db?.objective ?? null;
        facePlay(f.char.root, vel, aim, db?.boxing ? 99 : DEFEND_FACE_RANGE, dt);
        if (db && db.fightingOver !== null && !f.screenHeld) { f.screenHeld = true; console.info(`[3V3-OFF] navigate ${db.fightingOver ? 'over' : 'under'} (foe${fi})`); }
        else if (db && db.fightingOver === null) f.screenHeld = false;
        f.speed01 = Math.min(1, vel.length() / 3.8);
          if (db && db.job !== lastFoeJobs.get(f)) { lastFoeJobs.set(f, db.job); if (db.job === 'closeout' || db.job === 'recover') console.info(`[3V3-DEF] ${f.char.root.name} job ${db.job}`); }   // DEFENSE-LOOK
        f.tree.update({
          speedMps: Math.hypot(vel.x, vel.z),
          speed01: f.speed01, crossover: false, nearestDefender: Infinity, hasBall: false, shooting: false, dunking: false, driving: false,
          defending: carrierId !== 'foeTeam', bracing: !!db?.boxing, staggered: false, slideDir: slideDirFor(f.char.root.rotation.y, vel),
          retreat: retreatFor(f.char.root.position, vel, carrierBody()?.char.root.position ?? null), closeout: db?.job === 'closeout' && distXZ(f.char.root.position, carrierBody()?.char.root.position ?? f.char.root.position) < 2.4, intense: db?.job === 'onball' && distXZ(f.char.root.position, carrierBody()?.char.root.position ?? f.char.root.position) < 2.0,   // DEFENSE-LOOK
        });
        bioTick(f, dt, carrierId === 'foeTeam' ? 'offense' : 'defense', false, Infinity, false);
      }

      // BODY CONTACT — every pair, every frame (15 pairs; cheap XZ math). HOOPS-MOVE-KIT-A M2: not a symmetric push any more —
      // the bodies exchange momentum along the contact normal (the runner bleeds 55 % of the closing speed into a set body,
      // the body is shoved 25 %) and a hard / foul hit is an EVENT the game answers (the react, the whistle in the air)
      const bodies = everyBody();
      const nowMs = performance.now();
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const A = bodies[i], B = bodies[j];
          if (dunking && (A === me || B === me)) { resolveBodyCollision(A.char.root.position, B.char.root.position); continue; }   // the flight's own bump handles the dunk
          const key = `${i}|${j}`;
          const cooling = (contactCooldown.get(key) ?? 0) > nowMs;   // one impulse + one event per collision (the Havok solver's 300 ms pair gate)
          const c = resolveBodyContact(A.char.root.position, B.char.root.position, A === me ? me.drib.vel : A.vel, B === me ? me.drib.vel : B.vel, 0.55,
            { airborneA: A === me && !!finish, airborneB: B === me && !!finish, exchange: !cooling });
          if (!c || cooling || c.closing <= 0.8) continue;
          contactCooldown.set(key, nowMs + 300);
          if (c.severity === 'bump') continue;
          const attacker = c.attacker === 'a' ? A : B, victim = c.attacker === 'a' ? B : A;
          onBodyContact(ctx, attacker, victim, c.closing, Math.max(c.aAlong, c.bAlong), c.severity);
        }
      }

      // pass — target-lock assist (stick aim snaps to the best teammate in
      // the cone, else most-open), defender-in-lane forces the bounce pass,
      // and the ball FLIES (PassFlight) instead of teleporting possession.
      //
      // PASSING IS A READ: an AIMED pass (stick held) into an occupied lane
      // stays a chest pass — the assist no longer saves you from a read you
      // made yourself — and a defender standing in that lane PICKS IT. The
      // unaimed open-man pass keeps the auto-bounce (the assist's job).
      // THE PASS FAKE — B held rather than tapped. It has to come BEFORE the real pass block, or the press
      // that begins the wind-up throws the ball on its own edge and there is nothing left to fake with.
      if (iAmCarrier && !shooting && !dunking && !passFlight.active && meIntent.passFake && passFakeCooldown <= 0) {
        passFakeCooldown = 0.6;
        const targets = mates.map((m, i) => ({ id: i === 0 ? 'mate0' : 'mate1', pos: m.char.root.position }));
        const shown = lockTarget(me.char.root.position, meIntent.moveX, meIntent.moveY, targets, foePositions())
          ?? targets[0];
        const nf = nearestLiveFoe();
        SoundKit.play('uiTick', { pitch: 1.5, volume: 0.5 });
        me.tree.beat('jumpshot', { fadeSec: 0.08 });   // the wind-up, not the throw
        if (shown && nf) {
          const bite = passFakeBite({ passer: me.char.root.position, target: shown.pos, defender: nf.char.root.position });
          if (bite.bit) {
            // he COMMITS toward the lane he was shown — the move is the shift, not the freeze
            nf.char.root.position.copyFrom(passFakeShiftTo(nf.char.root.position, bite));
            nf.stunSec = Math.max(nf.stunSec, PASS_FAKE_STUN);
            ctx.feel?.impact?.(0.2);
            ctx.setHud({ banner: 'HE BIT IT!' });
            bannerClearLater(ctx, 700);
            console.info(`[3V3-FAKE] pass fake bit — lane opens ${bite.lane.x.toFixed(2)},${bite.lane.z.toFixed(2)}`);
          } else {
            // SCORECARD CONTROLS (2026-09-15): a fake nobody buys was a console line and nothing else. It is still a
            // fake — the body sells it — so it reads as one, and the defender's answer is the news.
            ctx.juice.callout("HE DIDN'T BUY IT", '#94a3b8', 420);
            console.info('[3V3-FAKE] pass fake — he did not buy it');
          }
        }
      }
      // …and a fake thrown inside the last one's cooldown did nothing at all: 6 of 11 PASS presses in the rc20 capture
      // were silent, and this is the half of them the lane check never saw.
      else if (iAmCarrier && !shooting && !dunking && !passFlight.active && meIntent.passFake && passFakeCooldown > 0) {
        refuse(ctx, 'ONE FAKE AT A TIME');
      }
      if (iAmCarrier && !shooting && !dunking && meIntent.pass && !meIntent.passFake && !passFlight.active) {
        const targets = mates.map((m, i) => ({ id: i === 0 ? 'mate0' : 'mate1', pos: m.char.root.position }));
        const locked = lockTarget(me.char.root.position, meIntent.moveX, meIntent.moveY, targets, foePositions());
        if (locked) {
          const aimed = Math.hypot(meIntent.moveX, meIntent.moveY) > 0.3;
          // THE ALLEY-OOP (D7, 2026-09-03): an unaimed pass to a teammate cutting
          // hard at the rim goes up as a lob and comes down as a dunk.
          const type = aimed ? 'chest' : choosePassType(me.char.root.position, locked.pos, foePositions(), { rim: RIM, targetVel: mateVel[locked.id === 'mate0' ? 0 : 1] });
          passType = type;
          passTargetId = locked.id as 'mate0' | 'mate1';
          releaseBall(ball);
          passFlight.start(
            ball.getAbsolutePosition(),
            locked.pos.add(new Vector3(0, 1.2, 0)),
            type,
          );
          lastPasserWasMe = true;
          SoundKit.play('uiTick', { pitch: type === 'bounce' ? 1.0 : type === 'lob' ? 0.8 : 1.3 });
          if (type === 'lob') { bannerFlash(ctx, 'LOB!', 500); }
          EffectsKit.burst(ctx.scene, me.char.root.position.add(new Vector3(0, 1.2, 0)), 'sparks');
        } else {
          // NO LANE (2026-09-15). `lockTarget` refuses a pass into a covered lane, and it refused it in silence — 3 of
          // 11 PASS presses in the rc19 capture did nothing at all, which is indistinguishable from a dropped input.
          // The lane is the rule, so the lane is what it says; Refusal throttles it, so a held button is one line.
          refuse(ctx, 'NO LANE — LEAN THE STICK AT A MATE');
        }
      }
      // PASS pressed with the ball but mid-shot, mid-dunk, or with one already in the air: the same silence, same fix.
      else if (iAmCarrier && meIntent.pass && !meIntent.passFake && (shooting || dunking || passFlight.active)) {
        refuse(ctx, passFlight.active ? 'ONE PASS AT A TIME' : dunking ? 'IN THE DUNK' : 'IN THE SHOT');
      }
      if (passFlight.active) {
        // a chest pass through a defender's reach is THEIRS, not a dice roll:
        // they were standing in the lane when you threw it. PLANAR distance —
        // the ball flies at chest height (~1.2m) and a 3D check would measure
        // the defender's feet as forever 1.2m away (the same Y-trap that
        // silenced the AI poke in the shared brain).
        if (passType === 'chest') {
          const picker = foes.find((f) => f.stunSec === 0
            && Math.hypot(f.char.root.position.x - ball.position.x, f.char.root.position.z - ball.position.z) < 0.8);
          if (picker) {
            passFlight.active = false;
            parkCarries();
            attachBallToHand(ball, picker.char.skeleton, 'RightHand');   // the pick reads
            SoundKit.play('impact', { pitch: 1.3, volume: 0.4 });
            SoundKit.play('crowdGroan', { volume: 0.35 });
            ctx.setHud({ banner: 'PICKED OFF! — you threw into coverage' });
            bannerClearLater(ctx, 1100);
            void opponentPossession(ctx);
          }
        }
        if (!passFlight.active) { /* picked */ }
        else if (passFlight.step(dt, ball.position)) {
          if (passType === 'lob') {
            // caught above the rim: the cutter finishes it, no dribble in between
            const idx = passTargetId === 'mate0' ? 0 : 1;
            giveBallTo(passTargetId);
            void teammateShoots(ctx, mates[idx], idx, 'alleyoop');
            return;
          }
          giveBallTo(passTargetId);
          if (passType === 'bounce') {
            ctx.setHud({ banner: 'BOUNCE PASS!' });
            bannerClearLater(ctx, 600);
          }
        }
      }

      // shoot (only while I'm the carrier) — a hot drive DUNKS instead
      // HOOPS-MOVE-KIT-A: the ball must be OURS (not released — the live dribble keeps it un-parented, so `ball.parent` is no
      // test): a trigger still held past the meter's end restarted a shot with the ball in the air (a second gather on top of
      // the arc, measured)
      if (stickShot && !stickShot.started) {   // POST HOOK: the shimmy beat before the hook; a tap let go before the shot is nothing
          if (stickShot.shimmy && !stickShot.shimmied) { stickShot.shimmied = true; me.tree.beat('bball_hesi', { fadeSec: 0.05, speedRatio: 1.5 }); SoundKit.play('whoosh', { pitch: 1.1, volume: 0.3 }); { const nfB = nearestLiveFoe(); if (nfB && distXZ(me.char.root.position, nfB.char.root.position) < 2.0 && roll() < 0.45) { nfB.stunSec = 0.4; nfB.tree.beat('bball_contact_react', { fadeSec: 0.06 }); bannerFlash(ctx, 'SHIMMY — HE BIT!', 600); } } }
          shimmyLeft = Math.max(0, shimmyLeft - dt);
          if (Math.hypot(postStick.x, postStick.y) < 0.35 && shimmyLeft <= 0) stickShot = null;
        }
        if (iAmCarrier && !shooting && !dunking && !finish && !spin && !arc.active && !(ball.metadata as { felReleased?: boolean } | undefined)?.felReleased && (meIntent.actionHeld > 0.02 || (posting && stickShot !== null && !stickShot.started && shimmyLeft <= 0))) {   // POST HOOK (2K20)
        const nearestFoePos = foes.reduce<Vector3 | null>((best, f) =>
          !best || Vector3.Distance(f.char.root.position, me.char.root.position) < Vector3.Distance(best, me.char.root.position)
            ? f.char.root.position : best, null);
        // A+ P0: the gate measures a 3-D distance and the rim sits 3.05 m up — against RIM itself a floor-bound body can
        // NEVER be inside DUNK_RANGE (2.8 m), so the drive dunk had never fired in play (same bug 1v1 fixed in ade7c3f).
        // The range is a floor distance; judge it against the rim's floor point.
        // HOOPS-MOVE-KIT-B M4/M5: with my back to the basket the squeeze is the POST's own shot — the stick pulled off the
        // rim asks for the FADEAWAY, anything else is the JUMP HOOK. (A sealed body is never fast enough to dunk.)
        const toRimNow = RIM_FLOOR.subtract(me.char.root.position); toRimNow.y = 0; toRimNow.normalize();
        const post: PostShot = posting ? (stickShot ? 'hook' : stickBack01(wish.x, wish.z, toRimNow) >= POST_FADE_STICK_MIN ? 'fade' : 'hook') : 'none';   // POST HOOK
        // `sprintOk ? turbo.t01 : 0` — the dunk is the SPRINT finish and the layup is the one off the gas. Handed the
        // raw tank, this gate read "has fuel" rather than "is attacking", and every drive that reached the rim became
        // a dunk while the layup went unreachable. Same fix, same reasoning, as the 1v1 call site.
        const kind = posting ? 'none' : checkDriveDunk(me.char.root.position, me.drib.vel, RIM_FLOOR, sprintOk ? turbo.t01 : 0, nearestFoePos);
        if (kind !== 'none') {
          startDunk(ctx, kind, nearestFoePos);
        // the FOOTWORK reads a frozen body too: a defender who has just BITTEN a pump is the man you step through
        } else if (startFootwork(ctx, wish.x, -wish.z, nearestFoeAny() ?? nearestFoePos)) {   // …and the post's own footwork (2026-09-18)
          // M8 / M13 / M14: the footwork owns this squeeze
        } else {
          shooting = true;
          banked = null;   // M12: each release calls its own glass
          const contest = contestLevel(me.char.root.position, nearestFoePos);
          shotContest = contest;
          currentShot = classifyShot(me.char.root.position, me.drib.vel, RIM, contest, posting ? post : faceUpRead(nearestFoePos));
          console.info(`[3V3-SHOT] gather ${currentShot.style} rim ${distXZ(me.char.root.position, RIM_FLOOR).toFixed(2)} speed ${Math.hypot(me.drib.vel.x, me.drib.vel.z).toFixed(1)} contest ${contest.toFixed(2)}`);
          // HOOPS-MOVE-KIT-A: a layup / floater is a FINISH (M3); a jumper GATHERS first (M1) — a set body rises at once.
          // HOOPS-MOVE-KIT-B: the hook (M5) and the fadeaway (M4) are finishes too — their own clip, their own hop.
          // THE DANGLING ELSE (2026-09-18, the 1v1's): the else bound to the stick check, so every finish also started the rise
          if (isFinishStyle(currentShot.style)) startFinish(ctx, currentShot.style, stickShot?.shimmy ? contest * 0.55 : contest, nearestFoePos, stickShot?.side);
          else startRise(ctx, contest, wish.x, -wish.z);
          if (stickShot) { stickShot.started = true; console.info(`[3V3-STICK] post hook ${stickShot.side}${stickShot.shimmy ? ' (shimmy)' : ''}`); }
          aiContestLoad();   // D1/D3: the nearest defender puts a hand up on the load, or times a block jump to the green
        }
      }
      if (iAmCarrier && shooting) {
        const t = shotMeter.update(dt);
        ctx.setHud({ shotMeterT: t, shotMeterGreen: hudGreen });
        meter3d?.set(t, me.char.root.position.add(new Vector3(0, 1.72, 0)));
        // HOOPS-MOVE-KIT-B M8: let go this early and it is a PUMP FAKE, not a 0.35-pct brick — and he can bite it
        // THE POST PUMP (2026-09-18, the 1v1's): a quick release out of the seal cancels the hook / fade into the pump
        const postPump = !!finish && (finish.plan.style === 'hook' || finish.plan.style === 'fadeaway') && finish.t < PUMP_MAX_SEC;
        if (meIntent.action && isPumpFake(t * shotMeter.durationSec) && (!finish || postPump)) {
          if (finish) { finish = null; me.char.root.position.y = 0; me.tree.release(); }
          pumpFake(ctx, nearestLiveFoe());
        }
        else if (meIntent.action || t >= 1 || (stickShot?.started && Math.hypot(postStick.x, postStick.y) < 0.35)) {   // POST HOOK: the stick let go = the release
          stickShot = null;
          const quality = meterRelease();
          void resolveMyShot(ctx, quality);
        }
      }
      pumpWindow = Math.max(0, pumpWindow - dt);

      // steal (defenders occasionally poke the carrier) — 1.6m, not 1.2:
      // body collision holds two players ~1.1m apart, so a 1.2m application
      // range flickered across the standoff (same trap as 1v1, measured there)
      const carrier = carrierBody();
      if (carrier && carrierId !== 'foeTeam' && !shooting) {
        for (const f of foes) {
          // HOOPS-MOVE-KIT-B: a SEALED post man cannot be poked from behind (the body is between him and the ball) — front
          // him and the poke is live again
          const sealed = carrier === me && posting && facingCos(me.char.root.rotation.y, me.char.root.position, f.char.root.position) < 0.2;
          // THE AI REACH IS A READ WITH A COST (2026-09-17). It was a guaranteed strip: the brain rolls `steal` about once a
          // second inside 1.1 m, and every roll inside 1.6 m took the ball — ten STOLEN! in six of my drives (measured), no
          // exposure read, no cooldown, no foul risk, while my own reach on their drive has all three. Now theirs is mine
          // mirrored: a reach every AI_REACH_COOLDOWN_SEC at most, it takes the ball on a roll (more on the bump, when the
          // ball is out of the hand), a miss stuns the reacher, and a reach through a moving body is the reach-in foul.
          if (f.stunSec === 0 && f.reachCooldown === 0 && f.slot.intent.steal && roll() < AI_REACH_GATE && !finish && !gather && !dunking && !sealed && !board && distXZ(f.char.root.position, carrier.char.root.position) < 1.6) {   // `!board`: no reach at a ball still live off the iron / out of the net
            f.reachCooldown = AI_REACH_COOLDOWN_SEC;
            f.tree.beat('bball_steal_reach', { fadeSec: 0.14 });
            const carrierSpeed = carrier === me ? me.drib.vel.length() : carrier.vel.length();
            const exposed = carrier === me && bumpAge <= BUMP_STRIP_WINDOW_SEC;
            if (roll() < (exposed ? AI_STEAL_ON_BUMP : AI_STEAL_CHANCE)) { stripBall(ctx, f, 'STOLEN!'); break; }   // D2: the ball goes LOOSE from the hand
            f.stunSec = 0.35;
            const onHim = distXZ(f.char.root.position, carrier.char.root.position) <= BODY_STANDOFF + 0.25;
            if (onHim && carrierSpeed >= REACH_FOUL_SPEED) {
              const call = judge('reach_in', { offense: 'me', fouled: 'me' });
              if (call.whistle) SoundKit.play('whistle');
              ctx.setHud({ banner: `${call.banner} — ${call.ball === 'me' ? 'YOUR BALL' : 'THEIR BALL'}` });
              bannerClearLater(ctx, 900);
              console.info(`[3V3-REF] ${call.id} (their reach on ${carrier === me ? 'me' : 'my mate'}) → ${call.ball}`);
              later(700, () => (call.ball === 'me' ? resetPossession(true) : void opponentPossession(ctx)));
            } else console.info('[3V3-DEF] their reach misses');
            break;
          }
        }
      }

      ctx.camDirector.look(lookX, lookY, dt);
      ctx.camDirector.update(me.char.root.position, me.drib.vel, RIM);
    },

    dispose() {
      net?.dispose(); net = null;
      carries.forEach((c) => c.dispose()); carries.clear();
      meReach?.dispose(); meReach = null;
      for (const b of [me, ...mates, ...foes]) { b?.posture?.dispose(); if (b) b.posture = null; }   // BIOMECH-HOOPS-WAVE1
      threeVenue?.dispose(); threeVenue = null;  // M74
      me?.char.dispose(); mates.forEach((m) => m.char.dispose()); foes.forEach((f) => f.char.dispose());
      shotTrail?.dispose(); shotTrail = null;
      ring?.dispose(); ring = null;
      ball?.dispose(); SoundKit.stopAmbient();
      hoopJuice?.dispose(); hoopJuice = null;        // A+ P0: restores any hoop material the punch swapped
      meter3d?.dispose(); meter3d = null;
    },
  };

  async function teammateShoots(ctx: ModeContext, body: Body, _i: number, finish: 'shot' | 'alleyoop' = 'shot'): Promise<void> {
    if (shooting) return;
    shooting = true;
    const dist = Vector3.Distance(body.char.root.position, RIM);
    const points = finish === 'alleyoop' ? 2 : isThree(body.char.root.position, RIM) ? 3 : 2;
    // THE ONE SHOOTER ON THE FLOOR WHO WAS STILL ROLLING DICE.
    //
    // My teammate's shot was `Math.random() < 0.55` regardless of where he stood or who was on him — a
    // wide-open layup and a contested three were the same coin. `dist` was already being computed on the
    // line above and thrown away. The hero reads his own timing and the opponents read `defenseFactor`;
    // this is the last body using a constant, so it now goes through the same `rivalShotPct` the rival
    // uses, against the nearest defender to HIM rather than to me.
    const mateContest = proximityContest01(
      Math.min(...foes.map((f) => distXZ(f.char.root.position, body.char.root.position))),   // Infinity when nobody is on him
    );
    // ...and at the rim it is a LAYUP, not a jumper. Calling everything a jumper made a teammate standing
    // under the basket shoot 0.52 when the same shot from the rival shoots 0.74 — the same class of bug as
    // classifyShot's, which is why LAYUP_RANGE is shared rather than a local number.
    const mateStyle: 'layup' | 'jumper' = dist < LAYUP_RANGE ? 'layup' : 'jumper';
    // a lob caught at the rim is a high-percentage finish — the read was made on the pass, so a contest
    // on the catch matters much less than it does on a jumper
    const made = finish === 'alleyoop'
      ? Math.random() < Math.max(0.55, 0.82 - mateContest * 0.2)
      : Math.random() < rivalShotPct(dist, mateContest, mateStyle);
    releaseBall(ball);
    // BIOMECH-HOOPS-WAVE1: the tree owns the beat; a jumper flows into the held follow-through (G5); the ball FLIES (G6)
    if (finish === 'alleyoop') body.tree.beat(SPORT_CLIP.dunkFinishTomahawk);
    else body.tree.beat('jumpshot', { onSettle: () => body.tree.beat('bball_follow_through', { fadeSec: 0.2 }) });
    body.shotWin = 'release'; body.shotSec = 0;
    // My teammate's miss is readable too, and it is MY team's board to go and get. It used to be three
    // constants, so every teammate miss came off the iron the same way and my team always knew where to
    // stand — the same failure the rival's profile fixed in 1v1. It now reads the contest and the range:
    // a hand in his face or a shot past his limit is short off the front, an open look sprays.
    mateMiss = {
      from: ball.getAbsolutePosition().clone(), team: 'me',
      quality01: Math.max(0.15, 0.85 - mateContest * 0.5 - Math.max(0, dist - 6) * 0.05),
      short: mateContest * 0.8 + Math.max(0, dist - 7) * 0.12,
      lateral: (Math.random() - 0.5) * 0.9,
    };
    mateArc.start(ball.getAbsolutePosition(), RIM, made, finish === 'alleyoop' ? 'layup' : 'jumper');
    if (finish === 'alleyoop') { ctx.juice.shake(0.12, 120); ctx.feel?.impact?.(0.5); }
    if (made) {
      myScore += points;
      if (lastPasserWasMe) { assists++; ctx.setHud({ ast: assists }); }
      SoundKit.play('score'); EffectsKit.burst(ctx.scene, RIM, 'net');
      ctx.setHud({ score: myScore, banner: finish === 'alleyoop' ? 'ALLEY-OOP!' : 'ASSISTED BUCKET' });
    } else {
      SoundKit.play('miss');
      ctx.setHud({ banner: 'MISS' });
    }
    lastPasserWasMe = false;
    bannerClearLater(ctx, 800);
    if (myScore >= TARGET_SCORE) { ended = true; SoundKit.play('whistle'); ctx.end('WIN', myScore, { foeScore, assists }); return; }
    // A MISS IS A REBOUND, NOT A HANDOVER. This used to schedule `opponentPossession` on a miss too, 900 ms
    // after the release — while the arc's own miss branch was setting a LIVE board for the same shot. Two
    // owners for one outcome: six bodies would go and contest the rebound and then the ball was taken off
    // whoever won it and given to the other team anyway. The board decides a miss; only a MAKE is a
    // possession change, and the FORMAT decides that.
    if (!made) return;
    const next = possessionAfterScore(FORMAT, 'me');
    later(200, () => (next === 'me' ? resetPossession(true) : void opponentPossession(ctx)));
  }

  async function resolveMyShot(ctx: ModeContext, quality: ShotQuality): Promise<void> {
    shooting = false;
    const pctMod = currentShot?.pctMod ?? 1;
    // D3: the contest at the RELEASE — the nearest live defender's distance, his hand up, his contest jump — bites the make chance
    // the contesting body: the one that ARMED / jumped for this shot if he is still live, else the nearest (the nearest foe at
    // the release was often not the one who jumped — the block chance read `handUp` off the wrong body and came out 0)
    const armed = foeBlocker && foeBlocker.stunSec === 0 && !foeBlocker.floored ? foeBlocker : null;
    const near = armed ?? (foeHandUp && foeHandUp.stunSec === 0 ? foeHandUp : null) ?? nearestLiveFoe();
    const nearDist = near ? distXZ(near.char.root.position, me.char.root.position) : Infinity;
    const nearFacing = near ? facingCos(near.char.root.rotation.y, near.char.root.position, me.char.root.position) : -1;
    const nearUp = !!near && (foeHandUp === near || near.jumpAge <= HAND_UP_SEC || near === armed);
    shotContest = Math.min(1, handUpContest(contestLevel(me.char.root.position, near ? near.char.root.position : null), near ? near.jumpAge : Infinity) + groundContest(nearDist, nearFacing, foeHandUp === near && !!near));
    // HOOPS-MOVE-KIT-B M5: the shielding shoulder is between him and the ball — the hand that gets there is worth less
    if (currentShot?.style === 'hook') shotContest = hookShield(shotContest);
    // M12: CALLED GLASS — R1 held inside the band routes the ball through the square, and a bank from there is a real edge
    if (!banked && me.slot.intent.glass && inBankBand(me.char.root.position, RIM_FLOOR, BOARD_NORMAL)) banked = bankPoint(me.char.root.position, RIM, BOARD_NORMAL);
    if (banked) console.info(`[3V3-MOVE] called glass at ${banked.x.toFixed(2)}, ${banked.y.toFixed(2)}, ${banked.z.toFixed(2)}`);
    const pct = contestedPct(SHOT_QUALITY_PCT[quality] * pctMod, shotContest) + (banked ? BANK_PCT_BONUS : 0);
    const dist = Vector3.Distance(me.char.root.position, RIM);
    arcPoints = isThree(me.char.root.position, RIM) ? 3 : 2;
    arcLabel = currentShot?.label ?? 'SHOT';
    arcQuality = quality;
    arcMade = Math.random() < Math.min(0.98, pct);
    // D1: the AI's block at the release (a hand up or a jump inside range) — the ball knocked LOOSE from my hand
    const blockChance = near ? aiBlockChance(currentShot?.style ?? 'jumper', nearDist, nearUp, near.vel.length() < 1.0) : 0;
    console.info(`[3V3-DEF] my release ${currentShot?.style} contest ${shotContest.toFixed(2)} handUp ${foeHandUp === near && !!near} jump ${!!near && near.jumpAge <= HAND_UP_SEC} block ${blockChance.toFixed(2)} rim ${distXZ(me.char.root.position, RIM_FLOOR).toFixed(2)} q ${quality} mod ${pctMod.toFixed(2)} pct ${pct.toFixed(2)} made ${arcMade}`);
    if (blockChance > 0 && roll() < blockChance) { blockedShot(ctx, near!); return; }
    releaseBall(ball);
    gather = null;   // HOOPS-MOVE-KIT-A M1: a release inside the gather is a rushed shot
    // BIOMECH-HOOPS-WAVE1 G5: the held jumpshot (at its release frame) flows into the authored follow-through, HELD until the
    // arc resolves. HOOPS-MOVE-KIT-A M3: a layup / floater lets go from its OWN clip at the top of the hop and rides it to
    // feet-down (it used to cut to the dunk launch clip — a two-arm sweep through a T)
    if (finish) finish.released = true;
    else me.tree.beat('bball_follow_through', { fadeSec: 0.2 });
    // HOOPS-MOVE-KIT-B: a fade / a hook keeps its OWN posture window to feet-down (the release stance would stand the lean
    // back up in mid-air, which IS the shot)
    me.shotWin = finish && (finish.plan.style === 'fadeaway' || finish.plan.style === 'hook')
      ? (finish.plan.style === 'fadeaway' ? 'fade' : 'hook') : 'release';
    me.shotSec = 0; me.drib.setFacing(me.char.root.rotation.y);
    ctx.setHud({ shotType: '' });
    // SHOT FEEDBACK (same contract as 1v1): the release names the quality and
    // the contest at the moment you let go — before the arc decides anything.
    const tag = (shotContest >= 0.5 ? ' — CONTESTED' : shotContest <= 0.15 ? ' — WIDE OPEN' : '') + (banked ? ' — OFF THE GLASS' : '');
    if (quality === 'perfect') ctx.setHud({ banner: `GREEN!${tag}` });
    else if (quality === 'early') ctx.setHud({ banner: `EARLY${tag}` });
    else if (quality === 'late') ctx.setHud({ banner: `LATE${tag}` });
    else if (quality === 'brick') ctx.setHud({ banner: `WAY LATE${tag}` });
    // no clear here: the arc's make/miss banner replaces it and owns the timeout
    // the ball flies — score/possession resolve when it lands (update loop)
    arc.start(ball.getAbsolutePosition(), RIM, arcMade, currentShot?.style ?? 'jumper', alteredApex(shotContest), banked);   // D3: a strong contest ALTERS the release; M12: the glass
    startBoxOut('mine');   // O2: the shot is up — the defenders seal their men, the offense crashes
  }

  function startDunk(ctx: ModeContext, kind: 'dunk' | 'poster' | 'standing', defenderPos: Vector3 | null, force?: HoopsDunk): void {   // STICK HANDLE: pausin' forces its 360
    dunking = true; contactLatch = false; finishFoul = false;   // A+ P0: a fresh attempt gets one punch
    me.shotWin = 'none'; dunkFlush = null; let resolved = false; dunkFlight = { k: 0, made: null };   // BIOMECH-HOOPS-WAVE1
    lastDunkKind = 'clean';   // a clean dunk after a poster must not inherit the poster
    turbo.t01 = Math.max(0, turbo.t01 - 0.3);
    const from = me.char.root.position.clone();
    const landing = new Vector3(RIM.x, 0, RIM.z + DRIVE_DUNK.landAheadZ);
    // HOOPS-MOVE-KIT-A M2: the contest is a BODY in the flight's path (the nearest defender; the 1v1's rule)
    const wall = defenderPos ? foes.find((f) => f.char.root.position === defenderPos) ?? null : null;
    const c = contestDrive(from, landing, wall && wall.stunSec === 0 ? wall.char.root.position : null, wall ? wall.vel : null, kind === 'standing' ? 'dunk' : kind);
    if (c.bumpK !== null) c.bumpK = driveDunkKFor(c.bumpK, from, RIM, landing, DRIVE_DUNK.resolveK);   // DUNK-FANATIC: the bump on the flight's clock (the eased approach reaches his spot early)
    driveContest = c;
    // SHOWTIME (owner, 2026-09-17): the stick BACK with R2 on an open lane, or any contact dunk — see ShowtimeDunk.ts
    const showtime = showtimeAsked(kind, lookY);
    const flightTotal = showtime ? SHOWTIME_FLIGHT_MS : DRIVE_DUNK.flightMs;
    let showtimeK: number | null = null; showtimePress = false;
    console.info(`[3V3-CONTACT] drive contest ${kind} contested ${c.contested} t ${c.t.toFixed(2)} lateral ${c.lateral.toFixed(2)} set ${c.set} pct ${c.pct.toFixed(2)} wall ${wall ? (wall.stunSec > 0 ? 'stunned' : 'live') : 'none'}`);
    let made = Math.random() < c.pct;
    let swatted = false;
    // DUNK-FANATIC (2026-09-17): the rim hang and the RIM PROTECTOR — the nearest live defender to the ring may leave the
    // floor to MEET me, timed into the flight; at the meeting he swats it or gets dunked on (see DriveFlight.ts)
    let showtimeJudge: ShowtimeJudge | null = null, hangLeft = 0, hangOn = false;
    const protector = foes.filter((f) => f.stunSec === 0 && !f.floored && f.jumpAge === Infinity).sort((a, b) => distXZ(a.char.root.position, RIM_FLOOR) - distXZ(b.char.root.position, RIM_FLOOR))[0] ?? null;
    const protectorK = protector ? rimProtectorJump({ dist: Math.min(distXZ(protector.char.root.position, RIM_FLOOR), wall === protector && c.contested ? c.lateral + 0.3 : Infinity), set: Math.hypot(protector.vel.x, protector.vel.z) < 1.0, stunned: false, kind: kind === 'poster' ? 'poster' : 'dunk', roll }) : null;
    let protectorUp = false, protectorMet = false;
    if (protectorK !== null) console.info(`[3V3-DEF] rim protector armed at k ${protectorK.toFixed(2)}`);
    // D1: the wall reads the takeoff — a hand up in the lane can SWAT the dunk at the bump
    if (wall && c.contested && foeHandUp !== wall && wall.jumpAge === Infinity && aiHandsUp(distXZ(me.char.root.position, wall.char.root.position), facingCos(wall.char.root.rotation.y, wall.char.root.position, me.char.root.position), roll)) {
      if (foeHandUp) foeHandUp.tree.releaseHold();
      foeHandUp = wall; foeHandUpLeft = 1.2; wall.tree.hold('bball_hand_up', { fadeSec: 0.08 }); console.info('[3V3-DEF] ai hand up on the takeoff');
    }
    SoundKit.play('whoosh', { pitch: 0.85 });
    // BIOMECH-HOOPS-WAVE1 G6: the dribble parked, the ball in the palm through the flight; the launch's last frame HELD to feet-down (the 1v1's)
    carries.get(me)?.update(0, 0, false);
    if (!ball.parent) attachBallToHand(ball, me.char.skeleton, 'RightHand');
    // WHICH DUNK THIS DRIVE EARNED — the same read 1v1 makes, off the same already-registered vocabulary (ClipScope
    // gives this mode the 'dunk' suite too). One clip for every dunk in the game was the fault; see HoopsDunks.
    const toRimNow3 = RIM_FLOOR.subtract(from); toRimNow3.y = 0;
    const driveDir3 = me.drib.vel.clone(); driveDir3.y = 0;
    const speed3 = driveDir3.length();
    const lateral3 = speed3 > 0.1 && toRimNow3.lengthSquared() > 1e-4
      ? Math.min(1, Math.abs(driveDir3.x * toRimNow3.normalize().z - driveDir3.z * toRimNow3.x) / speed3)
      : 0;
    const picked3 = force ?? (showtime ? pickShowtime({ roll, contact: kind === 'poster', momentum01: mbus.score01 }) : pickHoopsDunk({
      speed: speed3, lateral01: lateral3,
      contest01: c.contested ? Math.min(1, Math.max(0, 1 - Math.abs(c.lateral))) : 0,
      // A POSTER IS A SET BODY IN THE WAY, NOT MERELY A BODY NEARBY. checkDriveDunk says 'poster' for any defender
      // inside 1.5 m — and in a one-on-one the defender is ALWAYS near the rim when you drive it, so every drive
      // came back a poster, the picker's first branch won every time, and the vocabulary collapsed back to one
      // dunk: ten angled drives at 6.4 m/s with lateral 0.50 (a windmill by every other measure) all came out
      // TOMAHAWK. contestDrive already draws the distinction the animation needs — a body that is CONTESTED and
      // SET is one you go over; a late-sliding one is a shoulder you went through, and that is a windmill with
      // somebody in the frame.
      poster: kind === 'poster' && c.contested && c.set, momentum01: mbus.score01, roll,
      standing: kind === 'standing',
    }));
    let gatherLeft = kind === 'standing' ? STANDING_GATHER_MS : 0;   // DEFENSE-LOOK: the two-foot squat before a standing dunk's flight
    if (gatherLeft > 0) me.tree.beat('dunk_charge_gather', { fadeSec: 0.06 });
    else me.tree.beat(picked3.clip, { holdEnd: true, speedRatio: dunkSpeedRatio(picked3, flightTotal / 1000) });
    ctx.setHud({ shotType: picked3.label });
    // THE METER ON A DUNK (owner, 2026-09-18): the bar rides the flight clock — see the 1v1's
    hudGreen = showtime ? `${(SHOWTIME_FLUSH_K / SHOWTIME_DEADLINE_K).toFixed(3)},${(SHOWTIME_GOOD_K / SHOWTIME_DEADLINE_K).toFixed(3)}` : `${DRIVE_DUNK.resolveK.toFixed(3)},0.050`;
    meter3d?.begin(showtime ? { center: SHOWTIME_FLUSH_K / SHOWTIME_DEADLINE_K, half: SHOWTIME_GOOD_K / SHOWTIME_DEADLINE_K } : { center: DRIVE_DUNK.resolveK, half: 0.05 });
    if (showtime) {
      const dir = RIM_FLOOR.subtract(from); dir.y = 0; if (dir.lengthSquared() < 1e-4) dir.set(0, 0, -1); dir.normalize();
      const right = new Vector3(dir.z, 0, -dir.x);
      ctx.camDirector.setFixed(RIM_FLOOR.add(right.scale(3.6)).add(dir.scale(-1.4)).add(new Vector3(0, 1.5, 0)), 1.7, true);
      showtimeCam = true;
      bannerFlash(ctx, kind === 'poster' ? 'SHOWTIME — OVER HIM · SQUARE AT THE RIM' : 'SHOWTIME — SQUARE AT THE RIM', 900);
      console.info(`[3V3-SHOWTIME] ${picked3.label} (${picked3.clip}) ${kind === 'poster' ? 'over a body' : 'open'} — time the flush`);
    }
    if (picked3.flashy) ctx.camDirector.pulse(0.35, 0.4);
    console.info(`[3V3-DUNK] ${picked3.label} (${picked3.clip}) speed ${speed3.toFixed(1)} lateral ${lateral3.toFixed(2)} momentum ${mbus.score01.toFixed(2)}`);
    startBoxOut('mine');   // O2
    // the flight's own clock: real time, FROZEN for the bump's hit-stop and slowed for BUMP_SLOW_SEC after it (the velocity kill)
    let flightMs = 0, handShift = 0, last = performance.now(), bumped = false, freezeMs = 0, slowMs = 0;
    const obs = ctx.scene.onBeforeRenderObservable.add(() => {
      const nowMs = performance.now(); const realMs = Math.min(50, nowMs - last); last = nowMs;
      const fdt = realMs / 1000;
      if (gatherLeft > 0) { gatherLeft -= realMs; if (gatherLeft <= 0) me.tree.beat(picked3.clip, { holdEnd: true, speedRatio: dunkSpeedRatio(picked3, flightTotal / 1000) }); return; }
      let scale = 1;
      if (freezeMs > 0) { freezeMs -= realMs; scale = 0; }
      else if (slowMs > 0) { slowMs -= realMs; scale = BUMP_SLOW; }
      else if (hangLeft > 0 && flightMs / flightTotal >= RIM_HANG.k) { hangLeft -= realMs; scale = 0; if (!hangOn) { hangOn = true; me.tree.beat('dunk_score_hang', { fadeSec: 0.08, holdEnd: true }); console.info(`[3V3-DUNK] rim hang ${hangLeft.toFixed(0)} ms`); } }   // DUNK-FANATIC: the hang on the iron
      else if (showtime && flightMs / flightTotal >= SHOWTIME_HANG_FROM && flightMs / flightTotal <= SHOWTIME_HANG_TO) scale = SHOWTIME_HANG_SCALE;   // SHOWTIME: the hang
      flightMs += realMs * scale;
      const k = Math.min(1, flightMs / flightTotal);
      { if (ball.parent && k <= DRIVE_DUNK.resolveK) handShift = stepShift(handShift, handShiftTarget(handForward(from, RIM, me.char.root.position, ball.getAbsolutePosition()), k, DRIVE_DUNK.resolveK)); const p = driveDunkPos(from, RIM, { x: RIM.x, z: RIM.z + DRIVE_DUNK.landAheadZ }, k, DRIVE_DUNK.resolveK, handShift); me.char.root.position.x = p.x; me.char.root.position.z = p.z; }   // DUNK-FANATIC: at the iron BY the resolve
      me.char.root.position.y = driveDunkY(k);
      // BIOMECH-HOOPS-WAVE1 G1/G3/G6 (the 1v1's): the chest eases onto the iron through the flight; the slam resolves AT THE
      // IRON — a make flushes through the net, a miss clanks off the front (it used to let go on the feet-down frame)
      me.char.root.rotation.y = slewYaw(me.char.root.rotation.y, yawTo(me.char.root.position, RIM) + (picked3.reverse ? Math.PI : 0), FACE_RIM_RATE * (picked3.reverse ? 2 : 1), fdt);   // a REVERSE turns its back to the iron
      dunkFlight = { k, made: resolved ? made : null };
      meter3d?.set(showtime ? showtimeMeterT(k) : k, me.char.root.position.add(new Vector3(0, 1.72, 0)));
      meReach?.set(rimReachWeight(k, DRIVE_DUNK.resolveK, swatted));   // HAND AND RIM
      if (!showtime) ctx.setHud({ shotMeterT: k, shotMeterGreen: hudGreen });
      // DUNK-FANATIC: the RIM PROTECTOR leaves the floor to meet me — a swat (REJECTED) or a body to go over
      if (protector && protectorK !== null && !protectorUp && !bumped && k >= protectorK && protector.stunSec === 0 && !protector.floored && distXZ(protector.char.root.position, me.char.root.position) <= RIM_PROTECT.range) {   // in range WHEN he leaves the floor (`!bumped`: the body that took the poster does not also swat it)
        protectorUp = true; protector.jumpAge = 0; if (foeHandUp === protector) { foeHandUp.tree.releaseHold(); foeHandUp = null; }
        protector.tree.beat('bball_block_reach'); SoundKit.play('whoosh', { pitch: 1.15, volume: 0.35 });
        console.info(`[3V3-DEF] rim protector jumps at k ${k.toFixed(2)}`);
      }
      if (protector && protectorUp && !protectorMet && !swatted && !resolved && k >= RIM_PROTECT.meetK) {
        protectorMet = true;
        const dist = Math.min(distXZ(protector.char.root.position, me.char.root.position), distXZ(protector.char.root.position, ball.getAbsolutePosition()));
        if (rimProtectorSwats({ k, jumpAge: protector.jumpAge, dist, set: c.contested ? c.set : true, strength01: c.contested ? c.strength01 : 0.7, roll })) {
          swatted = true; made = false;
          swing('block'); ctx.setHud({ momentum });
          const at = ball.getAbsolutePosition().clone(); releaseBall(ball);
          const away = me.char.root.position.subtract(protector.char.root.position); away.y = 0; if (away.lengthSquared() < 1e-4) away.set(0, 0, 1); away.normalize();
          ballSim.launch(at, away.scale(3.0).add(new Vector3((Math.random() - 0.5) * 2, 1.6, 0)));
          ctx.juice.hitStop(60); ctx.juice.shake(0.12, 140); ctx.feel?.impact?.(0.5); EffectsKit.burst(ctx.scene, at, 'sparks');
          SoundKit.play('impact', { pitch: 0.7, volume: 0.7 }); SoundKit.play('crowdGroan', { volume: 0.6 });
          bannerFlash(ctx, 'MET AT THE RIM — REJECTED!', 1000);
          console.info(`[3V3-DEF] rim protector swat at k ${k.toFixed(2)} dist ${dist.toFixed(2)}`);
        } else {
          console.info(`[3V3-DEF] rim protector beaten at k ${k.toFixed(2)} dist ${dist.toFixed(2)}`);
          if ((c.bumpK === null || bumped || wall !== protector) && dist <= 1.3 && !protector.floored) { protector.stunSec = Math.max(protector.stunSec, 1.0); protector.tree.beat('bball_contact_react', { fadeSec: 0.06, holdEnd: true }); bannerFlash(ctx, 'OVER THE TOP!', 700); }
        }
      }
      // M2: the bodies meet — the bump
      if (!bumped && !swatted && c.bumpK !== null && wall && k >= c.bumpK) {
        bumped = true; freezeMs = 45; slowMs = BUMP_SLOW_SEC * 1000;
        const handUp = foeHandUp === wall || wall.jumpAge <= HAND_UP_SEC;
        const swatChance = aiBlockChance('dunk', 0, handUp, c.set, c.strength01);
        if (swatChance > 0 && roll() < swatChance) {
          swatted = true; made = false;
          swing('block'); ctx.setHud({ momentum });
          const at = ball.getAbsolutePosition().clone(); releaseBall(ball);
          ballSim.launch(at, c.dir.scale(-2.2).add(new Vector3((Math.random() - 0.5) * 2, 1.3, 0)));
          SoundKit.play('impact', { pitch: 0.7, volume: 0.6 }); SoundKit.play('crowdGroan', { volume: 0.5 });
          ctx.feel?.impact?.(0.5); ctx.juice.shake(0.1, 120);
          wall.tree.beat('bball_block_reach', { fadeSec: 0.06 });
          console.info(`[3V3-DEF] ai swat at the bump chance ${swatChance.toFixed(2)}`);
        } else driveBump(ctx, c, wall, made && kind === 'poster', (1 - k) * flightTotal > 320);
      }
      if (showtime) {
        ctx.setHud({ shotMeterT: showtimeMeterT(k), shotMeterGreen: hudGreen });
        if (showtimeK === null && (showtimePress || k >= SHOWTIME_DEADLINE_K)) {
          const j = showtimePress ? judgeShowtime(k) : 'none'; showtimePress = false; showtimeK = k; showtimeJudge = j; meter3d?.end(j === 'none' ? 'held' : j);
          made = roll() < SHOWTIME_PCT[j] * (kind === 'poster' ? Math.max(0.6, c.pct) : 1);
          if (j === 'perfect') { ctx.juice.hitStop(70); ctx.camDirector.pulse(0.7, 0.45); SoundKit.play('crowdCheer', { volume: 0.6 }); }
          ctx.setHud({ banner: j === 'perfect' ? `${picked3.label} — PERFECT!` : j === 'good' ? `${picked3.label}!` : j === 'early' ? 'EARLY — OFF THE FRONT' : j === 'late' ? 'LATE — OFF THE BACK' : picked3.label }); bannerClearLater(ctx, 800);
          console.info(`[3V3-SHOWTIME] flush ${j} at k ${k.toFixed(2)} made ${made}`);
        }
      }
      if (posterVictim && !posterVictim.released && posterVictim.plant && posterVictim.fall && c.bumpK !== null && k > c.bumpK) {   // SHOWTIME: the victim rides the flight
        const ride = posterRide(c.bumpK, POSTER_RELEASE_K, k); const v = posterVictim.body.char.root.position;
        { const r = chestRide(posterVictim.plant, me.char.root.position, c.dir, ride.s); v.x = r.x; v.z = r.z; }   // DUNK-FANATIC: ON my chest, bowled back
        v.y = ride.lift;
        if (!posterVictim.reacted && ride.s > 0.35) { posterVictim.reacted = true; posterVictim.body.tree.beat('bball_contact_react', { fadeSec: 0.14, holdEnd: true }); }
      }
      if (posterVictim && (k >= POSTER_RELEASE_K || (hangLeft > 0 && k >= RIM_HANG.k))) posterVictimRelease(ctx);   // DUNK-FANATIC: down as the ball goes through, BEFORE the hang
      if (!resolved && !swatted && k >= DRIVE_DUNK.resolveK) {
        resolved = true;
        const releasePos = ball.getAbsolutePosition().clone(); releaseBall(ball);
        if (made) dunkFlush = { releasePos, since: 0, kind: kind === 'poster' ? 'poster' : showtime ? 'showtime' : 'dunk' };
        else { missClank(ctx); ballSim.launch(releasePos, clankOffRim(ball, RIM)); }
        meter3d?.end(made ? 'good' : 'brick');   // (a timed flush already stamped its verdict — end() keeps the first)
        hangLeft = hangWanted(made, kind, showtimeJudge, picked3.flashy);   // DUNK-FANATIC
      }
      if (k < 1) return;
      ctx.scene.onBeforeRenderObservable.remove(obs);
      dunking = false; dunkFlight = null; me.landSec = LAND_SEC; driveContest = null; meReach?.set(0);
      if (showtimeCam) { showtimeCam = false; ctx.camDirector.toggle(); ctx.camDirector.snapTo(me.char.root.position, RIM); }   // POLISH: a cut back, not a lerp from the side camera   // SHOWTIME: the follow camera comes back
      ctx.setHud({ shotMeterT: 0 }); meter3d?.end('brick');   // a swat ends the flight with no verdict of its own
      me.tree.beat(SPORT_CLIP.dunkLandCrouch, { fadeSec: 0.08 });   // G5: feet-down is the land crouch
      me.drib.setFacing(me.char.root.rotation.y);
      const fouled = finishFoul; finishFoul = false;
      if (made) {
        // A DUNK IS WORTH TWO. This awarded 1, left over from the old "1 inside
        // the paint, 2 outside" scale that this file's own header says was
        // already fixed once — "a layup scored LESS than a jumper". The jumper
        // path was corrected to 2s and 3s and the dunk path was not, so the
        // highest-percentage and most spectacular shot in the game stayed worth
        // half a jump shot. A dunk is always inside the arc, so it is a two.
        myScore += 2;
        // WHO went down is decided by the CONTACT now, not by proximity at the moment of scoring. This used
        // to pick whichever body happened to be nearest and knock it over — so a bystander could be
        // "posterized" by a dunk he was not part of, and the man actually contested got nothing. The
        // planted victim (driveBump) is already on the floor by here: he is released at POSTER_RELEASE_K,
        // after the ball is through, which is the order those things actually happen in.
        const posterized = isContactDunk(lastDunkKind);
        SoundKit.play('score', { pitch: 0.9 });
        SoundKit.play('crowdCheer', { volume: posterized ? 0.8 : 0.5 });
        contactPunch(ctx);   // A+ P0: hit-stop + shake + flash + the ONE slam thud + HoopJuice (replaces the bare feel.impact, which was a second thud)
        ctx.camDirector.pulse(posterized ? 1 : 0.6, 0.55);
        EffectsKit.burst(ctx.scene, RIM, 'net');
        // the banner comes from the CONTACT too, so a body bag reads as one — hand-writing 'POSTERIZED!'
        // here meant the hardest finish in the game announced itself as the ordinary one
        const slamCall = posterized ? contactBanner(lastDunkKind) : 'THROWN DOWN!';
        ctx.setHud({ score: myScore, banner: fouled ? `${slamCall.replace(/!+$/, '')} — AND ONE!` : slamCall });
        bannerClearLater(ctx, 1000);
        if (myScore >= TARGET_SCORE) { ended = true; SoundKit.play('whistle'); ctx.end('WIN', myScore, { foeScore, assists }); return; }
        later(400, () => void opponentPossession(ctx));
      } else {
        SoundKit.play('miss');
        SoundKit.play('crowdGroan', { volume: 0.4 });
        // the clank and the loose ball fired at the resolve (k 0.55), off the front of the iron — BIOMECH-HOOPS-WAVE1 G6
        if (fouled) {
          ctx.setHud({ banner: 'FOULED AT THE RIM — BALL BACK' });
          bannerClearLater(ctx, 900);
          later(900, () => resetPossession(true));
        } else if (swatted) {   // D1: the ball went loose at the bump
          ctx.setHud({ banner: 'SWATTED AT THE RIM!' });
          bannerClearLater(ctx, 1000);
          later(900, () => boardAfterMiss(ctx));
        } else {
          ctx.setHud({ banner: kind === 'poster' ? 'STUFFED AT THE RIM!' : 'RATTLED OUT' });
          bannerClearLater(ctx, 800);
          later(900, () => boardAfterMiss(ctx));
        }
      }
    });
  }

  // ── HOOPS-MOVE-KIT-A (2026-09-08): M1 the gather, M2 the bump + the floor contact, M3 the finish ────────────────────
  /** Move my body by a planar wish this frame (the court clamp / navmesh as the free run does). */
  function moveMe(wish: Vector3, dt: number): void {
    me.char.root.position.addInPlace(wish.scale(dt));
    if (!threeVenue?.constrain(me.char.root.position)) clampToHalfCourt(me.char.root.position, 8, 15);
  }
  /** M1: the jumper's gather (the 1v1's): a moving body plants on the authored gather clip while the meter runs; a set body
   *  rises at once; contested with the stick pulled off the rim, a step-back. */
  function startRise(ctx: ModeContext, contest: number, mx: number, my: number): void {
    const toRim = RIM_FLOOR.subtract(me.char.root.position); toRim.y = 0; toRim.normalize();
    const plan = planGather(me.drib.vel, me.char.root.position, RIM_FLOOR, contest, stickBack01(mx, -my, toRim));
    meterStart(contest, currentShot?.style ?? 'jumper', plan.sec);
    if (plan.sec > 0) {
      gather = { plan, t: 0 };
      me.shotWin = 'gather'; me.shotSec = 0;
      const clipSec = me.char.animator.durationOf('bball_pullup_gather') ?? 0.3;
      me.tree.beat('bball_pullup_gather', { holdEnd: true, fadeSec: 0.06, speedRatio: clipSec / plan.sec });
      SoundKit.play('whoosh', { pitch: 1.0, volume: 0.2 });
      console.info(`[3V3-MOVE] gather ${plan.kind} ${plan.sec.toFixed(2)} s from ${plan.v0.length().toFixed(1)} m/s`);
    } else { gather = null; beginRise(); }
    ctx.setHud({ shotType: gatherLabel(plan.kind, currentShot?.label ?? 'JUMPER') });
  }
  function beginRise(): void {
    me.shotWin = 'load'; me.shotSec = 0;
    riseHop = { t: 0, dur: shotMeter.riseSec + 0.32 };   // DEFENSE-LOOK: leave the floor with the rise, land a beat after the release
    const clipSec = me.char.animator.durationOf('jumpshot') ?? 1.0;
    const greenInRise01 = (shotMeter.greenCenter01 * shotMeter.durationSec - shotMeter.gatherSec) / shotMeter.riseSec;
    me.tree.hold('jumpshot', { speedRatio: syncedShotSpeed(clipSec, shotMeter.riseSec, greenInRise01, releaseFrameOf(me.char.animator, 'jumpshot', RELEASE_FRAME_01)), fadeSec: 0.08 });
  }
  /** M3: a layup / floater — the ball into the finishing hand, the finish clip paced to the green, the stride and the hop. */
  function startFinish(ctx: ModeContext, style: FinishStyle, contest: number, defenderPos: Vector3 | null, sideIn?: 'left' | 'right', preSec = 0): void {
    // HOOPS-MOVE-KIT-B M5: a hook shoots with the hand AWAY from him (the off shoulder is the shield) — and the shield is
    // worth something before the ball leaves: the contest that reaches the meter is cut. Wave 2: `sideIn` is the hand the
    // FOOTWORK ended on and `preSec` the meter it already spent — the clip is paced to what is left before the green.
    const side = sideIn ?? (style === 'layup' ? pickLayupSide(me.char.root.position, RIM_FLOOR, me.char.root.rotation.y, defenderPos)
      : style === 'hook' ? pickHookSide(me.char.root.position, RIM_FLOOR, me.char.root.rotation.y, defenderPos)
      : style === 'reverse' ? reverseSide(me.char.root.position, RIM_FLOOR, me.char.root.rotation.y, me.drib.vel) : 'right');
    carries.get(me)?.update(0, 0, false);
    attachBallToHand(ball, me.char.skeleton, side === 'left' ? 'LeftHand' : 'RightHand');
    if (preSec <= 0) meterStart(style === 'hook' ? hookShield(contest) : contest, style);
    // M4: the fade's escape line — off the defender when he is on me, straight off the rim otherwise
    const plan = planFinish(style, side, shotMeter.durationSec, shotMeter.greenCenter01,
      // the DIRECTION of the fade reaches the body here (see 1v1) — a baseline fade slides across, not back
      style === 'fadeaway' ? postFadeAway(me.char.root.position, RIM_FLOOR, defenderPos, currentShot?.drift ?? 'none') : undefined, preSec);
    finish = { plan, t: 0, released: false };
    posting = false;
    if (style === 'reverse') banked = bankPoint(me.char.root.position, RIM, BOARD_NORMAL);   // M11/M12: a reverse is laid off the glass
    me.shotWin = style === 'fadeaway' ? 'fade' : style === 'hook' ? 'hook' : 'gather'; me.shotSec = 0;
    me.tree.beat(plan.clip, { holdEnd: true, fadeSec: 0.06, speedRatio: plan.speedRatio });
    SoundKit.play('whoosh', { pitch: 1.1, volume: 0.25 });
    ctx.setHud({ shotType: FINISH_LABEL[style][side] });
    console.info(`[3V3-MOVE] finish ${style} ${side} release ${plan.releaseSec.toFixed(2)} s hop ${plan.hopSec.toFixed(2)} s`);
  }
  function stepFinish(dt: number): void {
    if (!finish) return;
    finish.t += dt;
    const k = finish.t / finish.plan.hopSec;
    // HOOPS-MOVE-KIT-B M4: a fadeaway does not stride at the rim — it GIVES GROUND, ballistically, from the push-off to
    // feet-down (fadeDrift), which is the separation the shot exists to buy.
    moveMe(finish.plan.style === 'fadeaway' ? fadeDrift(finish.plan) : finishStride(finish.plan.style, me.char.root.position, RIM_FLOOR, finish.released), dt);
    me.char.root.position.y = finishHopY(finish.plan.style, k);
    if (k < 1) return;
    me.char.root.position.y = 0;
    if (me.shotWin === 'fade' || me.shotWin === 'hook') { me.shotWin = 'follow'; me.shotSec = 0; }   // the lean / the sweep holds to feet-down, then the follow-through
    finish = null;
    me.tree.release();
    me.drib.setFacing(me.char.root.rotation.y);
  }
  // ── HOOPS-MOVE-KIT-B wave 2 (2026-09-08): M7–M14 (the 1v1's, body for body) ───────────────────────────────────────
  /** M7 / M10 / M11: the face-up read at the squeeze — a drive across the rim finishes REVERSE off the glass, a body in
   *  the way in the paint is a RUNNING HOOK over him, a protected rim is a FLOATER over the length. */
  function faceUpRead(defenderPos: Vector3 | null): PostShot {
    if (isReverseFinish(me.char.root.position, RIM_FLOOR, me.drib.vel)) return 'reverse';
    const onMe = defenderPos ? distXZ(me.char.root.position, defenderPos) : Infinity;
    // he is on my HIP: hook over him. He is waiting AT the rim: float it over him. Same read, two shots — and the order
    // matters (with the hook first it took every floater in the paint).
    if (onMe <= HOOK_ON_ME && runningHook(me.drib.vel, me.char.root.position, RIM_FLOOR, defenderPos)) return 'hook';
    // the floater over length only takes shots that were NOT layups: inside the layup band a drive still finishes at the
    // rim (KIT-A M3 — the contest and the block are what punish driving into a chest, not a silent style swap)
    if (distXZ(me.char.root.position, RIM_FLOOR) >= 2.2 && rimProtected(me.char.root.position, RIM_FLOOR, defenderPos)) return 'floater';
    return 'none';
  }
  /** M8 / M13 / M14: the FOOTWORK squeezes — a step-through inside the pump window, a euro when the stick sells a side
   *  against help, a hop step off an explosive gather. Each is a GatherPlan with real legs that ends IN a finish. */
  function startFootwork(ctx: ModeContext, mx: number, my: number, defenderPos: Vector3 | null): boolean {
    const contest = contestLevel(me.char.root.position, defenderPos);
    const yaw = me.char.root.rotation.y;
    const dist = distXZ(me.char.root.position, RIM_FLOOR);
    let plan: GatherPlan | null = null;
    // THE POST GAME (2026-09-18, the 1v1's): out of the seal — the drop step, the shimmy fade, or the pump's step-through
    if (posting) {
      const toRimP = RIM_FLOOR.subtract(me.char.root.position); toRimP.y = 0; toRimP.normalize();
      if (stickAtRim01(mx, -my, toRimP) >= POST_DROP_STICK_MIN) plan = planDropStep(me.char.root.position, RIM_FLOOR, yaw, defenderPos);
      else if (me.slot.intent.sprint && stickBack01(mx, -my, toRimP) >= POST_FADE_STICK_MIN) plan = planShimmyFade(me.char.root.position, RIM_FLOOR);
      else if (pumpWindow > 0 && defenderPos && dist < 5.4) plan = planStepThrough(me.char.root.position, RIM_FLOOR, yaw, defenderPos);
      if (!plan) return false;
      posting = false;
    }
    else if (pumpWindow > 0 && defenderPos && dist < 5.4) plan = planStepThrough(me.char.root.position, RIM_FLOOR, yaw, defenderPos);
    else if (euroAvailable(me.drib.vel, me.char.root.position, RIM_FLOOR, defenderPos)) {
      const sell = euroSell(mx, -my, yaw);
      if (sell) plan = planEuro(me.char.root.position, RIM_FLOOR, yaw, sell, rimProtected(me.char.root.position, RIM_FLOOR, defenderPos) ? 'floater' : 'layup');
    }
    // M13: the explosive two-foot gather. The face-up READS beat it — a body on my hip is a hook over him, a body sitting
    // at the rim is a floater over him, a drive across the rim is a reverse — because hopping into a chest is not a move.
    // With none of those on, an explosive squeeze is a HOP STEP. (Without this order the hop swallowed every driving
    // squeeze at full stick: 5 of 5 running-hook attempts; with the order inverted it never fired at all in 1v1, where
    // the on-ball defender is on the line the whole way.)
    const read = faceUpRead(defenderPos);
    const onMeNow = defenderPos ? distXZ(me.char.root.position, defenderPos) : Infinity;
    const hopBeaten = read === 'reverse' || read === 'floater' || (read === 'hook' && onMeNow <= HOOK_ON_ME);
    // … and a stick pulled AWAY from the rim is asking for a STEP-BACK (KIT-A M1) or a FADE, never a hop: a hop step goes
    // forward by definition (measured: the KIT-A step-back scenario came out HOP STEP in 3v3).
    const toRimNow = new Vector3(RIM_FLOOR.x - me.char.root.position.x, 0, RIM_FLOOR.z - me.char.root.position.z).normalize();
    const pullingBack = stickBack01(mx, -my, toRimNow) >= STEPBACK_STICK_BACK_MIN;
    if (!plan && !hopBeaten && !pullingBack && me.slot.intent.sprint && dist < HOP_RANGE && me.drib.vel.length() > 2.0) {
      plan = planHopStep(me.drib.vel, me.char.root.position, RIM_FLOOR, dist < 2.8 ? 'layup' : 'rise');
    }
    if (!plan) return false;
    shooting = true;
    shotContest = plan.kind === 'shimmy' ? contest * SHIMMY_CONTEST_CUT : contest;
    pumpWindow = 0;
    carries.get(me)?.update(0, 0, false);
    if (!ball.parent) attachBallToHand(ball, me.char.skeleton, 'RightHand');
    currentShot = plan.then === 'rise' ? classifyShot(me.char.root.position, me.drib.vel, RIM, contest) : { style: plan.then as ShotStyle, label: gatherLabel(plan.kind, 'FINISH'), pctMod: plan.then === 'floater' ? 1.0 : 1.18, drift: 'none' };
    if (plan.then === 'rise' && isFinishStyle(currentShot.style)) plan.then = currentShot.style;   // ACROBATIC LAYUPS (2026-09-18): a hop that classifies as a finish ends IN it (the 1v1's)
    meterStart(contest, currentShot.style, plan.sec);
    gather = { plan, t: 0 };
    me.shotWin = 'footwork'; me.shotSec = 0;
    // THE EURO'S CLIP FOLLOWS THE SIDE IT SELLS. This picked by `plan.kind` alone, so a euro that sold LEFT still
    // played the sell-right shape and the body went one way while the move went the other. `plan.side` is the
    // CROSSING hand, so the sell is its opposite.
    const clip = plan.kind === 'stepthrough' ? 'bball_step_through'
      : plan.kind === 'hop' ? 'bball_hop_step'
      : plan.kind === 'shimmy' ? 'bball_shimmy'
      : plan.kind === 'dropstep' ? (plan.side === 'left' ? 'bball_drop_step_left' : 'bball_drop_step')
      : plan.side === 'left' ? 'bball_euro_step' : 'bball_euro_step_left';
    const clipSec = me.char.animator.durationOf(clip) ?? plan.sec;
    me.tree.beat(clip, { holdEnd: true, fadeSec: 0.06, speedRatio: clipSec / plan.sec });
    SoundKit.play('whoosh', { pitch: 1.15, volume: 0.3 });
    ctx.setHud({ shotType: gatherLabel(plan.kind, currentShot.label) });
    console.info(`[3V3-MOVE] footwork ${plan.kind} ${plan.sec.toFixed(2)} s → ${plan.then} ${plan.side ?? ''} travel ${gatherTravel(plan).toFixed(2)} m`);
    aiContestLoad();
    return true;
  }
  /** M8: the PUMP FAKE — the trigger came up before the meter had run PUMP_MAX_SEC. The shot is off, and a contesting
   *  body inside range can LEAVE ITS FEET (he bit), which opens the step-through window. */
  function pumpFake(ctx: ModeContext, near: Body | null): void {
    shooting = false; gather = null; currentShot = null;
    shotMeter.active = false;
    me.shotWin = 'pump'; me.shotSec = 0;
    pumpWindow = STEP_THROUGH_SEC;
    me.tree.beat('bball_pump_fake', { fadeSec: 0.06 });
    SoundKit.play('whoosh', { pitch: 1.3, volume: 0.25 });
    const bit = !!near && near.stunSec === 0 && !near.floored && distXZ(me.char.root.position, near.char.root.position) <= PUMP_BITE_RANGE && roll() < PUMP_BITE_CHANCE;
    if (bit && near) { near.stunSec = PUMP_BITE_STUN; near.tree.beat('bball_block_reach'); SoundKit.play('whoosh', { pitch: 0.9, volume: 0.4 }); }
    ctx.setHud({ shotType: '', shotMeterT: 0, banner: bit ? 'HE BIT THE PUMP!' : 'PUMP FAKE' });
    setTimeout(() => ctx0?.setHud({ banner: '' }), 500);
    console.info(`[3V3-MOVE] pump fake bit ${bit}`);
  }

  // ── HOOPS-MOVE-KIT-B (2026-09-08): M4–M6's path (the seal) and M6 (the pivot) ──────────────────────────────────────
  /** The POST-UP: L1/LT held with a body to back down inside the post band seals him — the BACK to the basket (slewed), the
   *  authored seal HELD, the stick a slow back-down / a shuffle along the lane instead of a drive. Swing it ACROSS the body
   *  and it is a quick spin off his shoulder (M6). */
  function updatePost(ctx: ModeContext, dt: number, mx: number, my: number, defPos: Vector3 | null): boolean {
    const plant = !!me.slot.intent.brace && !shooting && !dunking && !finish && !gather && !passFlight.active;
    // HOOPS-MOVE-KIT-B M9: L1 is PLANT YOUR FOOT — the seal inside the band with a body, TRIPLE THREAT anywhere else
    // (the stick swung across turns you on the planted foot; across and back is a reverse pivot). No travel either way.
    const want = plant && canPostUp(me.char.root.position, RIM_FLOOR, defPos);
    if (plant && !want) {
      if (posting) { posting = false; me.tree.releaseHold(); }
      if (me.drib.vel.length() < PIVOT_MAX_SPEED && spinCooldown <= 0) {
        const pv = pivotFrom(mx, -my, me.char.root.rotation.y);
        if (pv) { startSpin(ctx, defPos, pv.side, pv); return true; }
      }
      me.drib.vel.scaleInPlace(0);
      return true;
    }
    if (want !== posting) {
      posting = want;
      if (posting) { me.tree.hold('bball_post_up', { fadeSec: 0.12 }); SoundKit.play('whoosh', { pitch: 0.7, volume: 0.2 }); console.info('[3V3-MOVE] post up'); }
      else me.tree.releaseHold();
    }
    if (!posting) return false;
    // the quick spin is read against the LANE (the post's own facing), not the body's transient yaw: through the turn-around
    // into the seal the live yaw sweeps past perpendicular, and a stick held straight at the rim read as fully lateral
    // there — every back-down fired a spin one frame in (measured). And a seal that has not settled cannot spin out of
    // itself yet.
    const seal = postYaw(me.char.root.position, RIM_FLOOR);
    const settled = Math.abs(Math.atan2(Math.sin(me.char.root.rotation.y - seal), Math.cos(me.char.root.rotation.y - seal))) < 0.6;
    const side = postSpinSide(mx, -my, seal);
    if (settled && side && spinCooldown <= 0) { startSpin(ctx, defPos, side); return true; }
    const yaw = slewYaw(me.char.root.rotation.y, seal, FACE_RIM_RATE, dt);
    me.char.root.rotation.y = yaw; me.drib.setFacing(yaw);
    const toRim = RIM_FLOOR.subtract(me.char.root.position); toRim.y = 0; toRim.normalize();
    const wish = postWish(mx, -my, toRim);
    me.drib.vel.copyFrom(wish);   // the seal IS the velocity (the movement layer would otherwise store a full-stick drive)
    moveMe(wish, dt);
    return true;
  }
  /** M6: the SPIN — the foot plants on his side, the body swings a full eased turn around it while the root ARCS out the
   *  far side on the exit line, and the exit hands the drive its speed back so the move ends IN a finish. */
  function startSpin(ctx: ModeContext, defPos: Vector3 | null, side?: 'left' | 'right', pivotRead?: { side: 'left' | 'right'; reverse: boolean }): void {
    if (spin || shooting || dunking || finish || gather) return;
    // M9: a PIVOT is the same machinery with a shorter sweep and NO travel — the planted foot never moves
    const plan = pivotRead ? planPivot(me.char.root.position, me.char.root.rotation.y, pivotRead.side, pivotRead.reverse)
      : planSpin(me.char.root.position, me.char.root.rotation.y, RIM_FLOOR, defPos, side);
    spin = { plan, t: 0, beat: !!pivotRead };
    spinClip = pivotRead ? 'bball_pivot' : 'bball_spin';
    spinCooldown = SPIN_COOLDOWN_SEC;
    posting = false;
    carries.get(me)?.update(0, 0, false);
    if (!ball.parent) attachBallToHand(ball, me.char.skeleton, 'RightHand');
    const clipSec = me.char.animator.durationOf(spinClip) ?? plan.sec;
    me.tree.beat(spinClip, { holdEnd: true, fadeSec: 0.06, speedRatio: clipSec / plan.sec });
    SoundKit.play('whoosh', { pitch: pivotRead ? 0.95 : 1.25, volume: pivotRead ? 0.2 : 0.35 });
    if (pivotRead) { ctx.setHud({ banner: pivotRead.reverse ? 'REVERSE PIVOT' : 'PIVOT' }); setTimeout(() => ctx0?.setHud({ banner: '' }), 400); }
    console.info(`[3V3-MOVE] ${pivotRead ? (pivotRead.reverse ? 'reverse pivot' : 'front pivot') : 'spin'} ${plan.side} yaw ${plan.yaw0.toFixed(2)} sweep ${(plan.sweep * 180 / Math.PI).toFixed(0)}°`);
  }
  function stepSpin(ctx: ModeContext, dt: number): void {
    if (!spin) return;
    spin.t += dt;
    const t = Math.min(spin.t, spin.plan.sec);
    const target = spinPos(spin.plan, t);
    me.char.root.position.x = target.x; me.char.root.position.z = target.z;
    if (!threeVenue?.constrain(me.char.root.position)) clampToHalfCourt(me.char.root.position, 8, 15);
    me.char.root.rotation.y = spinYaw(spin.plan, t);
    if (!spin.beat && t >= spin.plan.sec * SPIN_BEAT_K) {
      spin.beat = true;
      ctx.feel?.impact?.(0.22); ctx.juice.shake(0.05, 90);
      SoundKit.play('whoosh', { pitch: 0.85, volume: 0.45 });
      const near = nearestLiveFoe();
      const beaten = !!near && distXZ(near.char.root.position, me.char.root.position) <= SPIN_TRIGGER_RANGE + 0.5;
      if (beaten && near) { near.stunSec = SPIN_STUN_SEC; near.tree.beat('bball_contact_react', { fadeSec: 0.06 }); }
      ctx.setHud({ banner: beaten ? 'SPIN — BEAT HIM!' : 'SPIN!' });
      setTimeout(() => ctx0?.setHud({ banner: '' }), 500);
      console.info(`[3V3-MOVE] spin shoulder clear beaten ${beaten}`);
    }
    if (spin.t < spin.plan.sec) return;
    const exitYaw = Math.atan2(spin.plan.exit.x, spin.plan.exit.z);
    me.char.root.rotation.y = exitYaw;
    me.drib.setFacing(exitYaw);
    // M6 the spin comes out INTO the drive; M9 a pivot is a turn in place — it hands nothing back
    me.drib.vel.copyFrom(spinClip === 'bball_pivot' ? new Vector3(0, 0, 0) : spin.plan.exit.scale(SPIN_EXIT_SPEED));
    spin = null;
    me.tree.release();
  }

  /** M2: the bodies meet in the dunk's flight — hit-stop micro, the thud, the shove or the knockdown at the contact. */
  function driveBump(ctx: ModeContext, c: DriveContest, wall: Body, floorHim: boolean, banner: boolean): void {
    // PORTED ONTO ContactDunk (2026-09-13). 3v3 had a local poster that knocked the NEAREST body down
    // wherever it happened to be standing, which is "dunked beside" — the exact thing the shared module's
    // header says it exists to fix. It also had no `body_bag` at all: `DriveDunkKind` is none|dunk|poster,
    // so the hardest contested finish in the game read the same as an ordinary one.
    const kind = dunkKindFor({ strength01: c.strength01, set: c.set, present: true });
    lastDunkKind = kind;
    ctx.juice.hitStop(contactHitStopMs(kind));
    ctx.juice.shake(kind === 'body_bag' ? 0.13 : 0.08, kind === 'body_bag' ? 150 : 110);
    ctx.feel?.impact?.(kind === 'body_bag' ? 0.5 : 0.3);
    SoundKit.play('impact', { pitch: kind === 'body_bag' ? 0.82 : 0.95, volume: kind === 'body_bag' ? 0.7 : 0.55 });
    EffectsKit.burst(ctx.scene, wall.char.root.position.add(new Vector3(0, 1.0, 0)), 'dust');

    if (isContactDunk(kind) && !wall.floored) {
      // CHEST TO CHEST: planted BETWEEN me and the ring and squared at me, held through the flight. The
      // shove used to push him off the drive line, so by the flush the slam landed beside a bystander.
      const plant = posterPlant(RIM_FLOOR, me.char.root.position);
      wall.char.root.position.copyFrom(plant.spot);
      wall.char.root.rotation.y = plant.faceYaw;
      wall.stunSec = Math.max(wall.stunSec, 1.2);
      wall.tree.beat('bball_hand_up', { holdEnd: true, fadeSec: 0.05 });   // he is CONTESTING it, arms up
      posterVictim = { body: wall, kind, released: false, plant: plant.spot.clone(), fall: posterFall(RIM_FLOOR, plant.spot, kind), reacted: false };   // SHOWTIME: he rides the flight from here
      console.info(`[3V3-CONTACT] ${kind} — victim planted chest to chest`);
    } else {
      const shove = bumpShove(c);
      if (floorHim) {
        wall.stunSec = 1.4; wall.floored = true;
        wall.tree.beat(SPORT_CLIP.karateKnockdown, { settleTo: { clip: 'karate_floor_hold' } });
      SoundKit.play('thud', { volume: 0.8 });   // a body hits the floor; a floor does not ring
      } else if (!wall.floored) {
        wall.stunSec = Math.max(wall.stunSec, 0.35);
        wall.tree.beat('bball_contact_react', { fadeSec: 0.06 });
      }
      wall.char.root.position.addInPlace(shove.scale(0.16));
      console.info(`[3V3-CONTACT] drive bump ${kind} strength ${c.strength01.toFixed(2)} set ${c.set} floor ${floorHim} shove ${shove.length().toFixed(1)}`);
    }
    if (banner) {
      ctx.setHud({ banner: contactBanner(kind) });
      setTimeout(() => ctx.setHud({ banner: '' }), kind === 'body_bag' ? 1100 : 500);
    }
  }

  /** The victim of a contact dunk goes down at the FLUSH, not at the bump — the ball is through first. */
  function posterVictimRelease(ctx: ModeContext): void {
    if (!posterVictim || posterVictim.released) return;
    posterVictim.released = true;
    const v = posterVictim.body;
    const fall = posterFall(RIM_FLOOR, v.char.root.position, posterVictim.kind);
    v.floored = true;
    v.stunSec = posterVictim.kind === 'body_bag' ? 2.1 : 1.5;
    v.tree.beat(SPORT_CLIP.karateKnockdown, { settleTo: { clip: 'karate_floor_hold' } });
      SoundKit.play('thud', { volume: 0.8 });   // a body hits the floor; a floor does not ring
    v.char.root.position.addInPlace(fall.scale(0.16));
    swing('posterize');
    ctx.setHud({ momentum });
    EffectsKit.burst(ctx.scene, v.char.root.position.add(new Vector3(0, 0.3, 0)), 'dust');
    SoundKit.play('crowdCheer', { volume: 0.7 });
    console.info(`[3V3-CONTACT] ${posterVictim.kind} victim goes down, fall ${fall.length().toFixed(1)}`);
    posterVictim = null;
    victimSlide = fall.lengthSquared() > 1e-4 ? { body: v, dir: fall.clone().normalize(), left: VICTIM_SLIDE.dist } : null;   // DUNK-FANATIC: he goes down AND clears the landing
  }
  // ── HOOPS-MOVE-KIT-A amendment: the DEFENSE contest package (D1–D3) ────────────────────────────────────────────────
  function clearDefense(): void {
    bumpAge = Infinity; foeBlockAt = -1; foeBlocker = null; foeDunkFlight = null; driveStolen = false;
    if (foeHandUp) { foeHandUp.tree.releaseHold(); foeHandUp = null; }
    if (meHandUp) { meHandUp = false; me.tree.releaseHold(); }
    for (const f of foes) if (f.jumpAge !== Infinity) { f.jumpAge = Infinity; f.char.root.position.y = 0; }
  }
  /** O2: a shot is up — every defender inside BOX_OUT_RANGE of the rim seals his man, the shooting team crashes; on THEIR shot my
   *  teammates seal the nearest foes and I seal with L1. */
  function startBoxOut(whose: 'mine' | 'theirs'): void {
    boxingOut = true;
    const allies = allyPositions();
    for (const f of foes) {
      const db = foeBrain(f); if (!db) continue;
      if (whose === 'mine') { const m = db.mark !== null ? allies[db.mark] ?? null : null; db.boxOut(m && distXZ(m, RIM_FLOOR) < BOX_OUT_RANGE + 2 && distXZ(f.char.root.position, RIM_FLOOR) < BOX_OUT_RANGE ? m : null); }
      else db.boxOut(null);
    }
    for (const m of mates) {
      const mb = mateBrain(m); if (!mb) continue;
      if (whose === 'mine') { mb.boxOut(null); mb.setJob('crash'); }
      else { const nf = foes.reduce<Body | null>((b, f) => !b || distXZ(f.char.root.position, m.char.root.position) < distXZ(b.char.root.position, m.char.root.position) ? f : b, null); mb.boxOut(nf && distXZ(m.char.root.position, RIM_FLOOR) < BOX_OUT_RANGE ? nf.char.root.position : null); }
    }
    console.info(`[3V3-OFF] box out (${whose === 'mine' ? 'they seal, we crash' : 'we seal, they crash'})`);
    ctx0?.setHud({ hint: whose === 'theirs' ? 'BOX OUT — hold L1 (Q) to seal your man' : 'CRASH THE GLASS · hold L1 (Q) to box out' });
  }
  /** The ball is someone's again: nobody is chasing it. */
  function endChase(): void {
    for (const f of foes) foeBrain(f)?.chaseBall(null);
    for (const m of mates) mateBrain(m)?.chaseBall(null);
  }
  function endBoxOut(): void {
    if (!boxingOut) return;
    boxingOut = false;
    for (const f of foes) foeBrain(f)?.boxOut(null);
    for (const m of mates) { const mb = mateBrain(m); if (mb) { mb.boxOut(null); if (mb.job === 'crash' || mb.job === 'boxout') mb.setJob('space'); } }
  }
  /**
   * The miss meets the iron it earned (ported from 1v1's HOOPS-LIVE-BALL).
   *
   * Every miss in here used to be `new Vector3((Math.random()-0.5)*3, 2.5, 1.5)` — the ball never
   * touched the ring, so a short shot and a long one rebounded identically and told the shooter
   * nothing. Short is the front iron and comes BACK at the shooter; long is the back iron and runs
   * AWAY; a contested shot misses short. With six bodies on the floor this matters more than in 1v1,
   * because where the ball goes is what decides who had a chance at it.
   */
  function deflectMiss(shooterPos: Vector3, q01: number, short: number, lateral: number): void {
    const toShooter = shooterPos.subtract(RIM); toShooter.y = 0;
    const r = resolveRim(RIM, toShooter, forcedMissProfile(q01, { short, lateral }), 0.06);
    ballSim.launch(r.contact, r.outVel);
    SoundKit.play('rattle', { volume: 0.32 });   // the iron, not a generic thump
    console.info(`[3V3-RIM] ${r.kind} — ${r.label}`);
  }

  /** All six bodies as the loose ball sees them — a floored or stunned body cannot go up for it. */
  function reboundBodies(): BodyRef[] {
    const mk = (id: string, b: Body, boxing: boolean): BodyRef => ({
      id, pos: b.char.root.position, radius: 0.34, reachY: 2.15,
      boxingOut: boxing, unavailable: b.floored || b.stunSec > 0,
    });
    return [
      mk('me', me, !!me.slot.intent.brace),
      ...mates.map((m, i) => mk(`mate${i}`, m, !!mateBrain(m)?.boxing)),
      ...foes.map((f, i) => mk(`foe${i}`, f, !!foeBrain(f)?.boxing)),
    ];
  }

  /**
   * THE LIVE BOARD — the ball is in play off the iron and one of six bodies comes down with it.
   *
   * boardWinner read the ball's position once to compare distances, added a seal bonus and rolled a
   * die. Now the ball bounces off chests on the way down and is secured by whoever physically reaches
   * it, so crashing the glass and sealing your man are positions rather than modifiers.
   * boardAfterMiss survives as the stall guard.
   */
  function liveBoard(ctx: ModeContext, dt: number): void {
    if (!board) return;
    board.age += dt;
    const bodies = reboundBodies();
    // EVERY AI BODY GOES FOR IT. Without this the brains held their seals and crash lanes while the ball
    // rolled away: measured 8-19 m from the ball on all six bodies, and the board fell through to the
    // dice roll. The crash lane is a guess about where a rebound lands; the ball is where it actually is.
    const at = ballSim.pos;
    for (const f of foes) if (!f.floored && f.stunSec <= 0) foeBrain(f)?.chaseBall(at);
    for (const m of mates) if (!m.floored && m.stunSec <= 0) mateBrain(m)?.chaseBall(at);

    const hit = ballVsBodies(ballSim.prevPos as Vector3, ballSim.pos, ballSim.vel, ballSim.radius, bodies);
    if (hit) {
      ballSim.vel.copyFrom(hit.outVel);
      ballSim.pos.copyFrom(hit.contact);
      ball.position.copyFrom(ballSim.pos);
      SoundKit.play('impact', { pitch: 1.1, volume: 0.22 });
      console.info(`[3V3-BOARD] tipped off ${hit.body.id}`);
    }

    // OUT OF PLAY — the REF calls it now, reading the handbook, exactly as 1v1 does. The bodies are
    // clamped inside the court and the ball is not, so waiting for someone to reach it could only ever
    // time out; what changed is that the mode no longer decides the consequence. It reports the fact (the
    // ball left the floor, and who shot it) and carries out the call.
    if (ballOutOfPlay(ballSim.pos, HOOPS_BALL_BOUNDS)) {
      // nobody is carrying during a live board, so the team that shot IS the offence for this call
      const shooter: 'me' | 'foe' = board.shooter === 'foe' ? 'foe' : 'me';
      const call = judge('out_of_bounds', { offense: shooter, shooter });
      board = null; endChase(); endBoxOut(); ballSim.stop();
      console.info(`[3V3-REF] ${call.id} → ${call.ball}`);
      if (call.whistle) SoundKit.play('whistle');
      ctx.setHud({ banner: `${call.banner} — ${call.ball === 'me' ? 'YOUR BALL' : 'THEIR BALL'}` });
      bannerClearLater(ctx, 800);
      if (call.ball === 'me') resetPossession(true); else void opponentPossession(ctx);
      return;
    }

    const r = resolvePickup(ballSim.pos, ballSim.vel, bodies);
    if (r.contested && !board.contestedCalled) {
      board.contestedCalled = true;
      ctx.setHud({ banner: 'CONTESTED BOARD!' });
      bannerClearLater(ctx, 600);
    }
    if (r.winner && r.bobbled) {
      ballSim.vel.copyFrom(bobbleVelocity(ballSim.vel));
      console.info(`[3V3-BOARD] bobbled by ${r.winner.id} — still live`);
      return;
    }
    if (r.winner) {
      const team: 'me' | 'foe' = r.winner.id.startsWith('foe') ? 'foe' : 'me';
      const putback = boardOutcome(team, board.shooter) === 'putback';
      board = null;
      endChase();
      endBoxOut();
      ballSim.stop();
      console.info(`[3V3-BOARD] ${r.winner.id} secures it${r.contested ? ' (contested)' : ''}${putback ? ' — OFFENSIVE, play on' : ''}`);
      ctx.setHud({
        banner: team === 'me'
          ? (putback ? 'OFFENSIVE BOARD — PUT IT BACK!' : r.contested ? 'YOU RIP IT AWAY — YOUR BALL' : 'YOUR BOARD')
          : (putback ? 'THEIR OFFENSIVE BOARD — CONTEST IT!' : 'THEIR BOARD'),
      });
      bannerClearLater(ctx, 700);
      if (team === 'me') resetPossession(true); else void opponentPossession(ctx);
      return;
    }

    if (board.age > 4) {
      const why = bodies.map((x) => `${x.id} d=${Math.hypot(ballSim.pos.x - x.pos.x, ballSim.pos.z - x.pos.z).toFixed(2)}${x.unavailable ? '!' : ''}`).join(' ');
      console.info(`[3V3-BOARD] nobody came down with it (${why}) — falling back to the race`);
      board = null;
      endChase();
      boardAfterMiss(ctx);
    }
  }

  /** O2: the board is a race — the nearest body names the favourite, a seal is worth a body length, the bounce jitters it. */
  function boardAfterMiss(ctx: ModeContext): void {
    const bodies: BoardBody[] = [
      { team: 'me', pos: me.char.root.position, boxing: !!me.slot.intent.brace },
      ...mates.map((m) => ({ team: 'me' as const, pos: m.char.root.position, boxing: !!mateBrain(m)?.boxing })),
      ...foes.map((f) => ({ team: 'foe' as const, pos: f.char.root.position, boxing: !!foeBrain(f)?.boxing })),
    ];
    const winner = boardWinner(bodies, ball.getAbsolutePosition());
    endBoxOut();
    console.info(`[3V3-OFF] board → ${winner}`);
    ctx.setHud({ banner: winner === 'me' ? (me.slot.intent.brace ? 'BOXED OUT — YOUR BOARD' : 'YOUR BOARD') : 'THEIR BOARD' });
    bannerClearLater(ctx, 700);
    if (winner === 'me') resetPossession(true); else void opponentPossession(ctx);
  }
  /** The nearest foe who is still ON HIS FEET — stunned or not (a body you have frozen is still a body to step past). */
  function nearestFoeAny(): Vector3 | null {
    const b = foes.reduce<Body | null>((best, f) => f.floored ? best : !best || distXZ(f.char.root.position, me.char.root.position) < distXZ(best.char.root.position, me.char.root.position) ? f : best, null);
    return b ? b.char.root.position : null;
  }
  /**
   * One handle move, rendered.
   *
   * The DECISION is shared with 1v1 (HandleSystem.resolveHandleMove) — the chain, the window, the odds and
   * the hard-break threshold all live there. What is here is 3v3's own rendering: its nearest defender out
   * of three rather than one man, its clips, its banners.
   */
  function doMove(ctx: ModeContext, move: HandleMove, dirHint?: 'left' | 'right'): void {   // STICK HANDLE
    const foe = nearestLiveFoe();
    const outcome = resolveHandleMove(move, chain, handle, {
      present: !!foe,
      closing: !!foe && foe.char.root.position.subtract(me.char.root.position).length() > 0
        && facingCos(foe.char.root.rotation.y, foe.char.root.position, me.char.root.position) > 0,
      set: !!foe && foe.speed01 < 0.1,
      within: !!foe && distXZ(me.char.root.position, foe.char.root.position) < SHAKE_RANGE,
    });
    if (!outcome.owned) return;                      // not in my hands yet — the gate IS the upgrade
    chain = outcome.chain;

    // THE MOVE ITSELF — see the note in 1v1's doMove. Twelve moves shared the tree's one crossover state, so
    // nothing here had a body of its own. The ball ends on the side away from the man guarding you.
    if (foe) {
      const toHim = foe.char.root.position.subtract(me.char.root.position);
      const right = bodyRight(me.char.root.rotation.y);
      const clip = moveClip(move, dirHint ?? ((toHim.x * right.x + toHim.z * right.z) > 0 ? 'left' : 'right'));
      const turboMove = !!me.slot.intent.sprint;   // MOVE PACE: on the turbo the move SNAPS
      if (clip) me.tree.beat(clip, { fadeSec: moveFadeSec(turboMove), speedRatio: moveRate(turboMove) });
    }

    // OFF THE HEAD resolves here, not through the ankle-break roll: it is the one move where the ball
    // leaves your hands, so it is the one move that can lose it. Same rule in 1v1.
    if (move === 'off_the_head' && carrierId === 'me' && foe && !foe.floored && foe.stunSec <= 0) {
      const odds = offTheHeadOdds({
        handle,
        dist: distXZ(me.char.root.position, foe.char.root.position),
        facingCos: facingCos(foe.char.root.rotation.y, foe.char.root.position, me.char.root.position),
        defenderSpeed: foe.speed01 * 6,
      });
      SoundKit.play('whoosh', { pitch: 1.35, volume: 0.4 });
      if (odds > 0 && Math.random() < odds) {
        foe.stunSec = Math.max(foe.stunSec, 0.8);
        foe.tree.beat('bball_contact_react');
        SoundKit.play('impact', { pitch: 1.2, volume: 0.55 });
        SoundKit.play('crowdCheer', { volume: 0.8 });
        EffectsKit.burst(ctx.scene, foe.char.root.position.add(new Vector3(0, 1.5, 0)), 'sparks');
        ctx.feel?.impact?.(0.5);
        ctx.juice.shake(0.1, 150);
        ctx.setHud({ banner: 'OFF THE HEAD!' });
        bannerClearLater(ctx, 1100);
        console.info(`[3V3-HANDLE] off the head — CLEAN (odds ${odds.toFixed(2)})`);
      } else {
        const dir = offTheHeadLoose(me.char.root.position, foe.char.root.position);
        const from = ball.getAbsolutePosition().clone();
        releaseBall(ball);
        ballSim.launch(from, new Vector3(dir.x * 5.5, 1.2, dir.z * 5.5));
        board = { age: 0, contestedCalled: false, shooter: 'me' };
        SoundKit.play('miss');
        ctx.setHud({ banner: 'OFF THE HEAD — LOST IT' });
        bannerClearLater(ctx, 1000);
        console.info(`[3V3-HANDLE] off the head — MISSED (odds ${odds.toFixed(2)})`);
      }
      return;
    }

    if (outcome.restarted) return;
    // the body goes where the move says (see 1v1) — one shot, lateral sign away from him
    {
      const imp = moveImpulse(move);
      if (imp.forward !== 0 || imp.lateral !== 0) {
        const yaw = me.char.root.rotation.y;
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        const rx = fz, rz = -fx;
        let side = 1;
        if (foe) {
          const toFoe = foe.char.root.position.subtract(me.char.root.position);
          side = (toFoe.x * rx + toFoe.z * rz) > 0 ? -1 : 1;
        }
        me.drib.vel.addInPlace(new Vector3(
          fx * imp.forward + rx * imp.lateral * side, 0, fz * imp.forward + rz * imp.lateral * side,
        ));
      }
    }
    if (outcome.tier !== 'single') {
      SoundKit.play('whoosh', { pitch: 1.1 + chain.length * 0.12, volume: 0.35 });
      ctx.feel?.impact?.(0.08 * chain.length);
    }
    if (outcome.broke === 'none' || !foe) return;

    swing('ankle_break');
    ctx.setHud({ momentum });
    SoundKit.play('impact', { pitch: 0.8, volume: 0.5 });
    SoundKit.play('crowdCheer', { volume: 0.55 });
    EffectsKit.burst(ctx.scene, foe.char.root.position.add(new Vector3(0, 0.2, 0)), 'dust');
    if (outcome.broke === 'hard') {
      // the same knockdown + floor hold every other body-down in this mode uses — one way down, one way up
      foe.floored = true;
      foe.stunSec = ANKLE_BREAK_STUN_SEC * 1.8;
      foe.tree.beat(SPORT_CLIP.karateKnockdown, { settleTo: { clip: 'karate_floor_hold' } });
      SoundKit.play('thud', { volume: 0.8 });   // a body hits the floor; a floor does not ring
      ctx.feel?.impact?.(0.55);
      ctx.juice.shake(0.09, 140);
      ctx.setHud({ banner: 'ANKLES — HE IS DOWN!' });
      bannerClearLater(ctx, 1100);
    } else {
      foe.stunSec = ANKLE_BREAK_STUN_SEC;
      foe.tree.beat('bball_contact_react');
      ctx.feel?.impact?.(0.35);
      ctx.setHud({ banner: outcome.tier === 'highlight' ? 'ANKLES!' : 'SHOOK HIM!' });
      bannerClearLater(ctx, 800);
    }
    console.info(`[3V3-HANDLE] ${move} chain ${chain.length} ${outcome.broke} odds ${outcome.odds.toFixed(2)}`);
  }

  function nearestLiveFoe(): Body | null {
    return foes.reduce<Body | null>((best, f) => f.stunSec > 0 || f.floored ? best : !best || distXZ(f.char.root.position, me.char.root.position) < distXZ(best.char.root.position, me.char.root.position) ? f : best, null);
  }
  /** D1/D3: the nearest defender's read on my load — a hand up inside range facing me, or a block jump timed to the green. */
  function aiContestLoad(): void {
    const near = nearestLiveFoe();
    if (!near) return;
    const dist = distXZ(near.char.root.position, me.char.root.position);
    const facing = facingCos(near.char.root.rotation.y, near.char.root.position, me.char.root.position);
    if (dist <= AI_BLOCK_RANGE + 0.3 && facing >= 0 && roll() < AI_BLOCK_JUMP_CHANCE) {
      foeBlocker = near; foeBlockAt = Math.max(0.05, shotMeter.greenCenter01 * shotMeter.durationSec - 0.15);
      console.info(`[3V3-DEF] ai block jump armed at ${foeBlockAt.toFixed(2)} s`);
    } else if (aiHandsUp(dist, facing, roll)) {
      if (foeHandUp) foeHandUp.tree.releaseHold();
      foeHandUp = near; foeHandUpLeft = shotMeter.durationSec + 0.6;
      near.tree.hold('bball_hand_up', { fadeSec: 0.1 });
      console.info(`[3V3-DEF] ai hand up at ${dist.toFixed(2)} m`);
    }
  }
  /** D1: BLOCKED at the release — the ball knocked loose from my hand, low, back the way it came. */
  function blockedShot(ctx: ModeContext, by: Body): void {
    const from = ball.getAbsolutePosition().clone(); releaseBall(ball);
    const away = me.char.root.position.subtract(by.char.root.position); away.y = 0; away.normalize();
    ballSim.launch(from, away.scale(2.2).add(new Vector3((Math.random() - 0.5) * 1.5, 1.0, 0)));
    gather = null; me.shotWin = 'release'; me.shotSec = 0;
    if (finish) finish.released = true; else me.tree.beat('bball_follow_through', { fadeSec: 0.2 });
    SoundKit.play('impact', { pitch: 0.75, volume: 0.55 }); SoundKit.play('crowdGroan', { volume: 0.4 });
    ctx.feel?.impact?.(0.4); ctx.juice.shake(0.08, 100);
    ctx.setHud({ shotType: '', shotMeterT: 0, banner: by.jumpAge <= HAND_UP_SEC ? 'BLOCKED!' : 'BLOCKED — HAND IN THE SHOT!' });
    bannerClearLater(ctx, 900);
    console.info('[3V3-DEF] blocked at the release');
    startBoxOut('mine');
    later(900, () => boardAfterMiss(ctx));
  }
  /** D2: a defender takes the ball — knocked LOOSE from my hand toward him, the reach on him; the possession follows once it
   *  settles (it used to warp straight to the rival's possession). */
  function stripBall(ctx: ModeContext, by: Body, banner: string): void {
    SoundKit.play('impact', { pitch: 1.2, volume: 0.35 });
    by.tree.beat('bball_steal_reach', { fadeSec: 0.14 });
    parkCarries();
    const from = ball.getAbsolutePosition().clone(); releaseBall(ball);
    const toFoe = by.char.root.position.subtract(me.char.root.position); toFoe.y = 0; toFoe.normalize();
    ballSim.launch(from, toFoe.scale(1.6).add(new Vector3(0, 1.2, 0)));
    ctx.setHud({ banner }); bannerClearLater(ctx, 900);
    console.info(`[3V3-DEF] strip by the ai: ${banner}`);
    later(750, () => void opponentPossession(ctx));
  }
  /** D1: the rival THROWS IT DOWN an open lane — a real flight I can SWAT with a timed jump inside range while he is in the
   *  air; a body in his path is bumped, and floored if he finishes through it. */
  function driverDunk(ctx: ModeContext, shooter: Body): Promise<void> {
    return new Promise<void>((done) => {
      const tok = possessionToken;
      if (!ball.parent) attachBallToHand(ball, shooter.char.skeleton, 'RightHand');
      const from = shooter.char.root.position.clone();
      const landing = new Vector3(RIM.x, 0, RIM.z + DRIVE_DUNK.landAheadZ);
      const meDist = distXZ(me.char.root.position, shooter.char.root.position);
      const inLane = meDist < 1.5 && meStunSec === 0 && !meFloored;
      const c = contestDrive(from, landing, meStunSec > 0 || meFloored ? null : me.char.root.position, me.drib.vel, inLane ? 'poster' : 'dunk');
      if (c.bumpK !== null) c.bumpK = driveDunkKFor(c.bumpK, from, RIM, landing, DRIVE_DUNK.resolveK);   // DUNK-FANATIC: the bump on the flight's clock (the eased approach reaches his spot early)
      const ground = groundContest(meDist, facingCos(me.char.root.rotation.y, me.char.root.position, shooter.char.root.position), meHandUp);
      const contest = Math.min(1, contestLevel(shooter.char.root.position, me.char.root.position) * 0.5 + ground + (myJumpAge <= HAND_UP_SEC ? 0.3 : 0));
      let made = Math.random() < contestedPct(c.pct, contest);
      let swatted = false, bumped = false, resolved = false;
      // the rival dunks out of the same book. His showtime gate is the INVERSE of my momentum: when the game is
      // getting away from me is exactly when he starts throwing 360s, which is what a run feels like from the
      // wrong end of it.
      const theirDir = shooter.vel.clone(); theirDir.y = 0;
      // A CLOCKED DRIVE HAS NO VELOCITY VECTOR to speak of (0–1.4 m/s as a by-product), so every rival dunk here was
      // the picker's standing-start answer — POWER SLAM, ten times in ten (measured). The drive's nominal speed is
      // what he actually arrived at; the vocabulary opens on it the way it does for the 1v1 rival.
      const theirSpeed = Math.max(theirDir.length(), driveMps);
      if (theirDir.lengthSquared() < 1e-4) { const d = RIM_FLOOR.subtract(shooter.char.root.position); d.y = 0; if (d.lengthSquared() > 1e-4) theirDir.copyFrom(d.normalize()); }
      const toRimT = RIM_FLOOR.subtract(shooter.char.root.position); toRimT.y = 0;
      const theirLateral = theirSpeed > 0.1 && toRimT.lengthSquared() > 1e-4
        ? Math.min(1, Math.abs(theirDir.x * toRimT.normalize().z - theirDir.z * toRimT.x) / theirSpeed)
        : 0;
      const theirDunk = pickHoopsDunk({
        speed: theirSpeed, lateral01: theirLateral, contest01: contest,
        poster: inLane, momentum01: 1 - mbus.score01, roll,
      });
      shooter.tree.beat(theirDunk.clip, { holdEnd: true, speedRatio: dunkSpeedRatio(theirDunk, DRIVE_DUNK.flightMs / 1000) });
      console.info(`[3V3-DUNK] rival ${theirDunk.label} (${theirDunk.clip}) speed ${theirSpeed.toFixed(1)}`);
      startBoxOut('theirs');
      SoundKit.play('whoosh', { pitch: 0.85 });
      console.info(`[3V3-DEF] rival dunk ${inLane ? 'poster' : 'open'} contest ${contest.toFixed(2)} pct ${contestedPct(c.pct, contest).toFixed(2)} bumpK ${c.bumpK === null ? 'none' : c.bumpK.toFixed(2)} dist ${distXZ(me.char.root.position, shooter.char.root.position).toFixed(2)} jumpAge ${myJumpAge === Infinity ? 'none' : myJumpAge.toFixed(2)}`);   // suite pass: where WAS the defender when the flight started
      let flightMs = 0, handShift = 0, last = performance.now(), freezeMs = 0, slowMs = 0;
      const obs = ctx.scene.onBeforeRenderObservable.add(() => {
        if (possessionToken !== tok) { ctx.scene.onBeforeRenderObservable.remove(obs); foeDunkFlight = null; done(); return; }
        const nowMs = performance.now(); const realMs = Math.min(50, nowMs - last); last = nowMs;
        const fdt = realMs / 1000;
        let scale = 1;
        if (freezeMs > 0) { freezeMs -= realMs; scale = 0; }
        else if (slowMs > 0) { slowMs -= realMs; scale = BUMP_SLOW; }
        flightMs += realMs * scale;
        const k = Math.min(1, flightMs / DRIVE_DUNK.flightMs);
        { if (ball.parent && k <= DRIVE_DUNK.resolveK) handShift = stepShift(handShift, handShiftTarget(handForward(from, RIM, shooter.char.root.position, ball.getAbsolutePosition()), k, DRIVE_DUNK.resolveK)); const p = driveDunkPos(from, RIM, { x: RIM.x, z: RIM.z + DRIVE_DUNK.landAheadZ }, k, DRIVE_DUNK.resolveK, handShift); shooter.char.root.position.x = p.x; shooter.char.root.position.z = p.z; }   // DUNK-FANATIC
        shooter.char.root.position.y = driveDunkY(k);
        shooter.char.root.rotation.y = slewYaw(shooter.char.root.rotation.y, yawTo(shooter.char.root.position, RIM) + (theirDunk.reverse ? Math.PI : 0), FACE_RIM_RATE * (theirDunk.reverse ? 2 : 1), fdt);
        foeDunkFlight = { k, made: resolved ? made && !swatted : null };
        if (!swatted && !resolved && jumpSwats(k, myJumpAge, Math.min(distXZ(me.char.root.position, shooter.char.root.position), distXZ(me.char.root.position, ball.getAbsolutePosition())))) {
          swatted = true; made = false;
          const at = ball.getAbsolutePosition().clone(); releaseBall(ball);
          const away = shooter.char.root.position.subtract(me.char.root.position); away.y = 0; away.normalize();
          ballSim.launch(at, away.scale(-2.5).add(new Vector3((Math.random() - 0.5) * 2, 1.5, 0)));
          SoundKit.play('impact', { pitch: 0.7, volume: 0.6 }); SoundKit.play('crowdCheer', { volume: 0.7 });
          ctx.feel?.impact?.(0.5); ctx.juice.hitStop(50); ctx.juice.shake(0.1, 120);
          EffectsKit.burst(ctx.scene, at, 'sparks');
          ctx.setHud({ banner: 'REJECTED AT THE RIM!' });
          shooter.tree.beat('bball_contact_react', { fadeSec: 0.06, holdEnd: true }); ctx.camDirector.pulse(0.8, 0.5);   // DUNK-FANATIC: he takes the hit in the air
          console.info(`[3V3-DEF] swat at k ${k.toFixed(2)} jumpAge ${myJumpAge.toFixed(2)}`);
        }
        if (!bumped && !swatted && c.bumpK !== null && k >= c.bumpK) {
          bumped = true; freezeMs = 45; slowMs = BUMP_SLOW_SEC * 1000;
          ctx.juice.hitStop(45); ctx.juice.shake(0.08, 110); ctx.feel?.impact?.(0.3);
          SoundKit.play('impact', { pitch: 0.95, volume: 0.55 });
          if (made && inLane) { meStunSec = 1.4; meFloored = true; meHandUp = false; me.tree.beat(SPORT_CLIP.karateKnockdown, { settleTo: { clip: 'karate_floor_hold' } }); SoundKit.play('thud', { volume: 0.8 }); }
          else if (!meFloored && meStunSec === 0) { meStunSec = 0.3; meHandUp = false; me.tree.beat('bball_contact_react', { fadeSec: 0.06 }); }
          me.char.root.position.addInPlace(bumpShove(c).scale(0.16));
          console.info(`[3V3-DEF] rival dunk bump strength ${c.strength01.toFixed(2)} floorMe ${made && inLane}`);
        }
        if (posterVictim && k >= POSTER_RELEASE_K) posterVictimRelease(ctx);
      if (!resolved && !swatted && k >= DRIVE_DUNK.resolveK) {
          resolved = true;
          const releasePos = ball.getAbsolutePosition().clone(); releaseBall(ball);
          if (made) dunkFlush = { releasePos, since: 0, kind: inLane ? 'poster' : 'dunk' };
          else { missClank(ctx); ballSim.launch(releasePos, clankOffRim(ball, RIM)); }
        }
        if (k < 1) return;
        ctx.scene.onBeforeRenderObservable.remove(obs);
        foeDunkFlight = null; driver = null;
        shooter.tree.beat(SPORT_CLIP.dunkLandCrouch, { fadeSec: 0.08 });
        if (made) {
          foeScore += 2;
          SoundKit.play('score', { pitch: 0.9 }); SoundKit.play('crowdGroan', { volume: 0.5 });
          contactPunch(ctx);
          EffectsKit.burst(ctx.scene, RIM, 'net');
          ctx.setHud({ foeScore, banner: inLane ? 'POSTERIZED — THEY THREW IT DOWN ON YOU' : 'THEY THREW IT DOWN' });
          setTimeout(() => ctx.setHud({ banner: '', hint: 'Work the court · BOTTOM BUTTON (J) passes · CIRCLE (K) calls a screen · HOLD SQUARE (L), release in the green' }), 1000);
          if (foeScore >= TARGET_SCORE) { ended = true; SoundKit.play('whistle'); ctx.end('LOSS', myScore, { foeScore, assists }); done(); return; }
          later(meFloored ? 1600 : 1000, () => resetPossession(true));
        } else {
          if (!swatted) { SoundKit.play('miss'); ctx.setHud({ banner: 'THEY RATTLED IT OUT' }); }
          setTimeout(() => ctx.setHud({ banner: '', hint: 'Work the court · BOTTOM BUTTON (J) passes · CIRCLE (K) calls a screen · HOLD SQUARE (L), release in the green' }), 900);
          later(900, () => boardAfterMiss(ctx));
        }
        done();
      });
    });
  }
  /** M2: a hard / foul contact on the floor between two bodies (the momentum exchange already happened in resolveBodyContact). */
  function onBodyContact(ctx: ModeContext, attacker: Body, victim: Body, closing: number, attackerSpeed: number, severity: 'hard' | 'foul'): void {
    const mine = attacker === me || victim === me;
    if (severity === 'foul' && victim === me && finish && isFoe(attacker) && !finishFoul) {
      // fouled IN THE AIR on a finish: the attempt plays out — a make is an and-one, a miss the ball back
      finishFoul = true; SoundKit.play('whistle');
      bannerFlash(ctx, 'FOUL!', 400);
      console.info(`[3V3-CONTACT] foul in the air (${closing.toFixed(1)} m/s) — and-one pending`);
      return;
    }
    if (closing < HARD_CONTACT_SPEED || !mine) return;   // AI-on-AI bumps exchange momentum silently — the read is the one I feel
    const onBall = carrierId === 'me' && !shooting && !finish && !dunking && !passFlight.active;
    if (severity === 'foul' && onBall && attacker === me && attackerSpeed >= FOUL_CLOSING_SPEED && isFoe(victim) && victim.stunSec === 0 && victim.vel.length() < 1.0) {
      // a sprint THROUGH a set defender is a CHARGE (a foul-speed contact on offense was never read)
      SoundKit.play('whistle');
      bannerFlash(ctx, 'CHARGE — THEIR BALL', 1000);
      console.info(`[3V3-CONTACT] charge ${closing.toFixed(1)} m/s into a set body`);
      void opponentPossession(ctx);
      return;
    }
    // D2: any hard / foul contact with the handler opens the strip window — mine on defense (the poke connects inside it),
    // the AI's on my possession (a set defender I bump strips me on his roll)
    if (carrierId === 'foeTeam' && driver && (attacker === driver || victim === driver) && (attacker === me || victim === me)) bumpAge = 0;
    if (severity === 'hard' && onBall && attacker === me && attackerSpeed >= 4.0 && performance.now() - lastBumpStripAt > 2500 && (lastBumpStripAt = performance.now()) > 0 && isFoe(victim) && victim.stunSec === 0 && !victim.floored && aiBumpStrips(victim.vel.length() < 1.0, facingCos(victim.char.root.rotation.y, victim.char.root.position, me.char.root.position), roll)) {
      stripBall(ctx, victim, 'STRIPPED ON THE BUMP!');
      return;
    }
    // HOOPS-MOVE-KIT-B M6: he did not take it — a drive that MEETS a body still in front of it spins off him
    // a body met at speed ARMS the spin (the stick swung across throws it) — never with the shot trigger already down: a
    // committed squeeze is a shot, not a pivot
    if (onBall && !spin && spinCooldown <= 0 && me.slot.intent.actionHeld <= 0.02 && (attacker === me || victim === me)) {
      const other = attacker === me ? victim : attacker;
      if (isFoe(other) && spinOffContact(me.drib.vel, me.char.root.position, me.char.root.rotation.y, other.char.root.position)) spinArmed = SPIN_ARM_SEC;
    }
    if (severity === 'foul' && onBall && victim === me && isFoe(attacker) && attackerSpeed >= FOUL_CLOSING_SPEED) {
      // a defender running THROUGH the handler at foul speed — the ball back
      SoundKit.play('whistle');
      bannerFlash(ctx, 'FOUL ON THE DEFENDER — BALL BACK', 1000);
      console.info(`[3V3-CONTACT] foul ${closing.toFixed(1)} m/s by the defender`);
      later(600, () => resetPossession(true));
      return;
    }
    // the hit reads on the body that took it; never a floored / stunned one, never a body inside a held beat (a react cut a held
    // follow-through, measured on 1v1), never me while I shoot or finish
    let react = false;
    if (victim !== me && victim.stunSec === 0 && !victim.floored && !victim.tree.busy) { victim.tree.beat('bball_contact_react', { fadeSec: 0.06 }); react = true; }
    else if (victim === me && !shooting && !finish && !dunking && !gather && me.shotWin === 'none' && !me.tree.busy) { me.tree.beat('bball_contact_react', { fadeSec: 0.06 }); react = true; }
    if (mine) { SoundKit.play('impact', { pitch: 1.0, volume: 0.3 }); ctx.feel?.impact?.(0.25); ctx.juice.shake(0.05, 80); }
    console.info(`[3V3-CONTACT] hard ${attacker === me ? 'me' : isFoe(attacker) ? 'foe' : 'mate'} → ${victim === me ? 'me' : isFoe(victim) ? 'foe' : 'mate'} ${closing.toFixed(1)} m/s react ${react}`);
  }

  // ── A+ P0 CONTACT-lite (PM brief THREEVTHREE-A-PLUS-P0, 2026-09-06; mirrors 1v1's ade7c3f) ─────────────────────
  // The dunk contest's CONTACT orchestra is the ceiling; 3v3 takes the lite cut: one make punch, one miss clank.
  // No hang slowMo (3v3 has no hang latch), no FOV gather, no land settle, no trail phases.
  /** The dunk make's flush frame: hit-stop, shake, white-gold flash, ONE slam thud, and the hoop answers. Latched once per attempt. */
  function contactPunch(ctx: ModeContext): void {
    if (contactLatch) return;
    contactLatch = true;
    ctx.juice.hitStop(70);
    ctx.juice.shake(0.12, 140);
    ctx.juice.flash('#fff6dd', 120);
    SoundKit.play('impact', { pitch: 0.7, volume: 0.8 });
    hoopJuice?.punch();
    console.info('[3V3-JUICE] dunk contact punch');
  }
  /** The dunk miss / stuff: a light metallic clank with a small feel hit — never the make's punch, never HoopJuice. */
  function missClank(ctx: ModeContext): void {
    hoopJuice?.graze();   // hoops detail pass: the miss rattles the iron and the net (no flash)
    ctx.feel?.impact?.(0.4);
    SoundKit.play('impact', { pitch: 1.35, volume: 0.45 });
    console.info('[3V3-JUICE] dunk miss clank');
  }

  async function opponentPossession(ctx: ModeContext): Promise<void> {
    if (ended) return;
    possessionToken++;
    goaltendCalled = false; foeShotScored = false;   // …and again for theirs: the latch is per SHOT, not per game
    carrierId = 'foeTeam';
    myJumpAge = Infinity; foeShotBlocked = false;
    ctx.setHud({ hint: 'DEFEND — stay tight · time a jump (A) at the release to BLOCK' });
    // the drive beat is watchable AND contestable: your positioning sets
    // the make%, and a timed block jump at the release erases it outright
    const shooter = foes[Math.floor(Math.random() * foes.length)];
    const t0 = performance.now();
    const from = shooter.char.root.position.clone();
    // the ball rides the driver's hand (lock carry-forward: AI drives were
    // bodies without a ball — visible if you looked for it)
    parkCarries();
    attachBallToHand(ball, shooter.char.skeleton, 'RightHand');
    driver = shooter; driveK = 0; driveStolen = false; bumpAge = Infinity;   // BIOMECH-HOOPS-WAVE1: the foe loop feeds his tree (the dribble run) and faces him at the rim; the AI drive skips him
    const tok = possessionToken;
    // THE DRIVE READS THE DEFENDER (owner, 2026-09-16). It used to be a straight lerp from where he started to
    // the rim, so where you stood changed nothing: measured, a defender who planted and held it for 10.3 s never
    // saw the driver inside 2.70 m. He was not avoiding you — he had a line and took it, and every rule that
    // needs the bodies to meet was a coincidence of geometry.
    //
    // Now he decides ONCE what to do about you, and the read is the rulebook's own: a SET body is one you go
    // around (through it is a charge and a turnover); a MOVING body is one you go through (that foul is his).
    // So planting early finally does something, and it is the thing the handbook says it does.
    const driveEnd = new Vector3(RIM.x, 0, RIM.z + 0.9);
    const driveDir = driveEnd.subtract(from); driveDir.y = 0;
    const driveLen = driveDir.length() || 1; driveDir.scaleInPlace(1 / driveLen);
    const meSet = me.drib.vel.length() < 0.6 && carrierId === 'foeTeam';
    const intent = driveIntent({ defenderSet: meSet || takingCharge, aggression: nerve(foeStanding()).aggression, roll });
    let drivePlanted = takingCharge;   // was he SET when the driver committed? that is what the call turns on
    let contactDone = false;
    // THE OTHER TEAM FEELS THE SCORE NOW, and the two halves of Nerve go on two different mechanisms
    // because that is the only way the invariant survives contact with a game (see core/Nerve.ts).
    //   aggression -> the lane they will take it up in. Down and late they attack the rim on a lane they
    //                 would normally pass up; protecting a lead they wait for a clean one.
    //   mistake    -> the jumper they settle for instead goes in less often.
    const foeNrv = nerve(foeStanding());
    // THE FINISH MIX (suite pass, 2026-09-16). An open lane was ALWAYS a dunk — ten drives, ten slams (measured) — and a
    // rival who only ever dunks is a highlight reel, not a basketball player. Open: a dunk or a layup, on a roll the
    // showtime nerve tilts; contested at the rim: a layup; further out: the jumper.
    const decideFinish = (): 'dunk' | 'layup' | 'jumper' => {
      const nearestAlly = Math.min(...allyPositions().map((p) => distXZ(p, shooter.char.root.position)));
      const lane = 1.6 / Math.max(0.6, foeNrv.aggression);        // pressing takes it up in traffic
      const openLane = nearestAlly > lane || (nearestAlly > lane * 0.69 && roll() < 0.5);
      if (openLane && roll() < DUNK_SHARE * Math.max(0.6, foeNrv.aggression)) return 'dunk';
      const atRim = distXZ(shooter.char.root.position, RIM_FLOOR) < 2.4;
      return openLane || atRim ? 'layup' : 'jumper';
    };
    // THE TELL (2026-09-17). The finish used to be decided and its clip started AT the release, so the man guarding
    // him had nothing to read — the seam said 'gather' for the lab, the screen showed a dribble run to the end. Now the
    // finish is decided GATHER_TELL_SEC before the release and its wind-up plays from there: the dunk's charge gather,
    // the layup's gather stride, the jumper's rise. That is the block's window, and now you can see it.
    let tellPlan: 'dunk' | 'layup' | 'jumper' | null = null;
    // THE DRIVE TAKES AS LONG AS THE DISTANCE (suite pass, 2026-09-16). It was a fixed 1100 ms whatever the start —
    // 6 m in 1.1 s is a 5.5 m/s teleport nobody can drop back on, 2 m in 1.1 s a jog — so the defender's read was
    // decided by where the rival happened to catch it. A sprint drive is DRIVE_MPS, and the clock is the distance.
    driveSec = Math.min(1.6, Math.max(0.8, driveLen / DRIVE_MPS));
    driveMps = driveLen / driveSec;
    console.info(`[3V3-DEF] drive intent ${intent} (defender ${meSet || takingCharge ? 'set' : 'moving'}) ${driveLen.toFixed(1)} m in ${driveSec.toFixed(2)} s`);
    await new Promise<void>((res) => {
      const obs = ctx.scene.onBeforeRenderObservable.add(() => {
        if (driveStolen || possessionToken !== tok) { ctx.scene.onBeforeRenderObservable.remove(obs); res(); return; }   // D2: the poke took it / the possession moved on
        const k = Math.min(1, (performance.now() - t0) / (driveSec * 1000));
        driveK = k;
        if (!tellPlan && k >= 1 - GATHER_TELL_SEC / driveSec) {
          tellPlan = decideFinish();
          const side: 'right' | 'left' = shooter.char.root.position.x < RIM.x ? 'left' : 'right';
          shooter.tree.beat(tellPlan === 'dunk' ? 'dunk_charge_gather' : tellPlan === 'layup' ? FINISH_CLIP.layup[side] : 'jumpshot', { fadeSec: 0.08, holdEnd: tellPlan !== 'jumper' });
          console.info(`[3V3-DEF] rival gather ${tellPlan} at k ${k.toFixed(2)} (${(driveSec * (1 - k)).toFixed(2)} s to the release)`);
        }
        // drive AT the rim, not 5m short of it (was x*0.6, z to RIM.z+2.2 —
        // the same short drive 1v1 shipped; a drive that never arrives makes
        // your positioning irrelevant and the block dance unreachable)
        const baseX = from.x + (driveEnd.x - from.x) * k;
        const baseZ = from.z + (driveEnd.z - from.z) * k;
        // …and BEND it around the man in the way (or do not, if he chose to go through him)
        const bend = driveLateral({ at: { x: baseX, z: baseZ }, defender: me.char.root.position, dir: driveDir, k, intent });
        shooter.char.root.position.x = baseX + driveDir.z * bend;
        shooter.char.root.position.z = baseZ - driveDir.x * bend;
        if (takingCharge) drivePlanted = true;   // he got set before the bodies met

        // THE BODIES MEET. This is the moment the charge and the blocking foul have both been waiting for — one
        // rule for a planted defender, its mirror for one still moving into him.
        // …but not on the FIRST FRAME. Measured: three fouls called at k 0.01, 0.02 and 0.65 — the first two are
        // not collisions at all, they are the possession reset happening to leave the two of us adjacent, and they
        // fire before a defender could possibly plant, which is why every one of them came out a blocking foul and
        // a charge stayed impossible. Contact has to happen DURING the drive to be contact.
        if (!contactDone && k >= CONTACT_MIN_K && intent === 'through' && bodiesMet(shooter.char.root.position, me.char.root.position, BODY_STANDOFF)) {
          contactDone = true;
          const id = drivePlanted ? 'charge' : 'blocking_foul';
          const call = judge(id, { offense: 'foe', fouled: drivePlanted ? 'me' : 'foe' });
          if (call.whistle) SoundKit.play('whistle');
          me.tree.beat(ANKLE_STUMBLE_CLIP, { fadeSec: 0.06 });
          shooter.tree.beat(ANKLE_STUMBLE_CLIP, { fadeSec: 0.06 });
          ctx.feel?.impact?.(0.4); ctx.juice.shake(0.08, 120);
          console.info(`[3V3-REF] ${call.id} on the drive at k ${k.toFixed(2)} (defender ${drivePlanted ? 'set' : 'moving'}) → ${call.ball}`);
          ctx.setHud({ banner: `${call.banner} — ${call.ball === 'me' ? 'YOUR BALL' : 'THEIR BALL'}` });
          bannerClearLater(ctx, 1000);
          driveStolen = true;   // the drive is over either way; the award decides who restarts
          ctx.scene.onBeforeRenderObservable.remove(obs);
          later(700, () => (call.ball === 'me' ? resetPossession(true) : void opponentPossession(ctx)));
          res();
          return;
        }
        if (k >= 1) { ctx.scene.onBeforeRenderObservable.remove(obs); res(); }
      });
    });
    if (contactDone) return;
    if (possessionToken !== tok) return;
    if (driveStolen) {
      // D2: the ball knocked LOOSE from his hand toward me; the possession follows once it settles
      driveStolen = false;
      parkCarries();
      const from = ball.getAbsolutePosition().clone(); releaseBall(ball);
      const toMe = me.char.root.position.subtract(shooter.char.root.position); toMe.y = 0; toMe.normalize();
      ballSim.launch(from, toMe.scale(1.8).add(new Vector3(0, 1.0, 0)));
      shooter.tree.beat('bball_contact_react', { fadeSec: 0.08 });
      SoundKit.play('impact', { pitch: 1.3, volume: 0.4 }); SoundKit.play('crowdCheer', { volume: 0.5 });
      ctx.setHud({ banner: bumpAge <= BUMP_STRIP_WINDOW_SEC ? 'STRIPPED ON THE BUMP!' : 'PICKED THEIR POCKET!' });
      setTimeout(() => ctx.setHud({ banner: '', hint: 'Work the court · BOTTOM BUTTON (J) passes · CIRCLE (K) calls a screen · HOLD SQUARE (L), release in the green' }), 900);
      driver = null;
      later(750, () => resetPossession(true));
      return;
    }
    const plan = tellPlan ?? decideFinish();   // a drive too short for a tell decides here
    if (plan === 'dunk') { await driverDunk(ctx, shooter); return; }
    const finishStyle: 'layup' | 'jumper' = plan;
    // THE BLOCK — a timed jump in range at this exact release moment
    if (checkBlock(me.char.root.position, shooter.char.root.position, myJumpAge)) {
      foeShotBlocked = true;
      SoundKit.play('impact', { pitch: 0.7, volume: 0.6 });
      SoundKit.play('crowdCheer', { volume: 0.6 });
      ctx.feel?.impact?.(0.5);
      EffectsKit.burst(ctx.scene, shooter.char.root.position.add(new Vector3(0, 1.6, 0)), 'sparks');
      shooter.tree.beat('bball_contact_react');
      releaseBall(ball); ballSim.launch(ball.getAbsolutePosition(), new Vector3((Math.random() - 0.5) * 4, 2, 3));   // BIOMECH-HOOPS-WAVE1 G6: a blocked ball goes loose
      ctx.setHud({ banner: 'REJECTED!' });
      setTimeout(() => ctx.setHud({ banner: '', hint: 'Work the court · BOTTOM BUTTON (J) passes · CIRCLE (K) calls a screen · HOLD SQUARE (L), release in the green' }), 900);
      later(1000, () => resetPossession(true));
      return;
    }
    // distXZ: this is the contest that sets their make%, and the shooter is off the floor while it is read — a 3-D
    // distance counted his rise as separation and quietly handed him an easier shot the higher he got (same fault as
    // checkBlock, same fix).
    const nearestD = Math.min(...allyPositions().map((p) => distXZ(p, shooter.char.root.position)));
    // D3: my grounded hand-up inside range, facing him, contests on top of the distance
    const ground = groundContest(distXZ(me.char.root.position, shooter.char.root.position), facingCos(me.char.root.rotation.y, me.char.root.position, shooter.char.root.position), meHandUp);
    const defenseFactor = Math.min(1, proximityContest01(nearestD) + ground);
    const basePct = finishStyle === 'layup' ? 0.62 : 0.5;   // a layup at the rim goes in more often than a pull-up, contested the same way
    const made = Math.random() < contestedPct(basePct - Math.min(0.5, defenseFactor * 0.3), ground) / Math.max(0.5, foeNrv.mistake);
    console.info(`[3V3-DEF] rival release ${finishStyle} contest ${defenseFactor.toFixed(2)} handUp ${ground > 0} dist ${distXZ(me.char.root.position, shooter.char.root.position).toFixed(2)} jumpAge ${myJumpAge === Infinity ? 'none' : myJumpAge.toFixed(2)}`);
    if (ground > 0) { ctx.setHud({ banner: 'CONTESTED — HAND UP!' }); }
    releaseBall(ball);                                          // the shot leaves the hand
    // BIOMECH-HOOPS-WAVE1: the rival's jumper flows into the held follow-through (G5) and the ball FLIES (G6)
    if (finishStyle === 'layup') {
      if (!tellPlan) { const side: 'right' | 'left' = shooter.char.root.position.x < RIM.x ? 'left' : 'right'; shooter.tree.beat(FINISH_CLIP.layup[side], { fadeSec: 0.08, holdEnd: true }); }   // the tell already started it
    } else if (tellPlan) shooter.tree.beat('bball_follow_through', { fadeSec: 0.2 });   // the rise played from the tell; this is the release
    else shooter.tree.beat('jumpshot', { onSettle: () => shooter.tree.beat('bball_follow_through', { fadeSec: 0.2 }) });
    shooter.shotWin = 'release'; shooter.shotSec = 0;
    // the contest my team put on him decides how he misses: a hand in his face is short off the front
    mateMiss = {
      from: shooter.char.root.position.clone(), team: 'foe',
      quality01: Math.max(0.15, 0.85 - defenseFactor * 0.5),
      short: defenseFactor * 0.8, lateral: (Math.random() - 0.5) * 0.9,
    };
    mateArc.start(ball.getAbsolutePosition(), RIM, made, finishStyle, alteredApex(defenseFactor));
    startBoxOut('theirs');   // O2: my team seals their bodies while the ball is up
    if (made) {
      foeScore += 2; foeShotScored = true;
      SoundKit.play('crowdGroan', { volume: 0.4 });
      // your defence is graded on their makes (same contract as 1v1)
      ctx.setHud({
        foeScore,
        banner: defenseFactor >= 0.5 ? 'THEY SCORE — THROUGH THE CONTEST'
          : defenseFactor <= 0.15 ? 'THEY SCORE — LEFT WIDE OPEN' : 'THEY SCORE',
      });
    } else {
      SoundKit.play('impact', { pitch: 0.9, volume: 0.3 });
      ctx.setHud({ banner: 'STOP!' });
      ctx.feel?.impact?.(0.2);
    }
    setTimeout(() => ctx.setHud({ banner: '', hint: 'Work the court · BOTTOM BUTTON (J) passes · CIRCLE (K) calls a screen · HOLD SQUARE (L), release in the green' }), 800);
    if (foeScore >= TARGET_SCORE) { ended = true; SoundKit.play('whistle'); ctx.end('LOSS', myScore, { foeScore, assists }); return; }
    if (made) later(900, () => resetPossession(true)); else later(900, () => boardAfterMiss(ctx));   // O2: their miss is a board too
  }
})();

// HUD fields: foeScore, target, ast, shotMeterT, time, shotType, and NEW
// turbo (0-100 — small fuel bar, same treatment as 1v1's).
