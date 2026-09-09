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
import { MeshBuilder, Vector3 } from '@babylonjs/core';
import { dressBall } from '../visual/meshyProps';
import type { AbstractMesh, TransformNode } from '@babylonjs/core';
import { BasketballAnimTree } from '../anim/basketballTree';
import { mountPostureLayer, type PostureLayer } from '../anim/PostureLayer';
import { hoopsPose, HOOPS_INPUT_IDLE, RELEASE_SEC, LAND_SEC, CELEBRATE_SEC, type HoopsPostureInput, type ShotWindow } from '../core/HoopsPosture';
import { slewYaw, yawTo, playFacing, DRIVE_DUNK, driveDunkY } from '../core/Biomech';
import { flushThroughRim, clankOffRim } from '../anim/ballRig';
import { syncedShotSpeed } from '../core/BallHandling';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { VenueKit } from '../visual/VenueKit';
import { applyOceanCourt } from '../visual/CourtSurface';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';  // M74
import { BallSim } from '../core/BallPhysics';
import { attachBallToHand, releaseBall } from '../anim/ballRig';
import { mountBallCarry, type BallCarry } from '../anim/ballCarry';
import { PlayerSlot, LocalInputSource, AISource } from '../core/PlayerSlot';
import { AgentControlSource } from '../core/AgentControlSource';  // M69: intent play under ?agent=1 (same seam as 1v1)
import { agentBridge } from '../core/AgentBridge';
import {
  DribbleController, ShotMeter, DefenderBrain, TeammateBrain, contestLevel, clampToHalfCourt, isThree,
  resolveBodyCollision, checkAnkleBreak, classifyShot, ANKLE_BREAK_STUN_SEC,
  TurboMeter, ShotArc, checkDriveDunk, checkBlock, DUNK_PCT,
  SHOT_QUALITY_PCT, type ShotQuality, type ShotContext, type PostShot, type ShotStyle,
} from '../core/BasketballCore';
import { lockTarget, choosePassType, PassFlight, type PassType } from '../core/BallHandling';
import { HARD_CONTACT_SPEED, FOUL_CLOSING_SPEED } from '../core/ContactSystem';
import {   // HOOPS-MOVE-KIT-A
  canPostUp, postYaw, postWish, postFadeAway, POST_FADE_STICK_MIN, fadeDrift,   // HOOPS-MOVE-KIT-B (2026-09-08): M4 the fade
  pickHookSide, hookShield,                                                      // M5 the hook
  planSpin, spinYaw, spinPos, spinOffContact, postSpinSide, SPIN_ARM_SEC, SPIN_BEAT_K, SPIN_EXIT_SPEED, SPIN_STUN_SEC, SPIN_TRIGGER_RANGE, SPIN_COOLDOWN_SEC, type SpinPlan,   // M6 the spin
  runningHook, HOOK_ON_ME, isPumpFake, planStepThrough, STEP_THROUGH_SEC, PUMP_BITE_RANGE, PUMP_BITE_CHANCE, PUMP_BITE_STUN,   // wave 2: M7 / M8
  pivotFrom, planPivot, PIVOT_MAX_SPEED, rimProtected, isReverseFinish, reverseSide,                               // M9 / M10 / M11
  inBankBand, bankPoint, BANK_PCT_BONUS, planHopStep, HOP_RANGE, planEuro, euroSell, euroAvailable, gatherTravel,  // M12 / M13 / M14
  planGather, gatherWish, gatherLabel, stickBack01, STEPBACK_STICK_BACK_MIN, type GatherPlan,
  pickLayupSide, planFinish, finishHopY, finishStride, FINISH_LABEL, type FinishPlan, type FinishStyle,
  contestDrive, bumpShove, BUMP_SLOW, BUMP_SLOW_SEC, type DriveContest, resolveBodyContact,
} from '../core/HoopsMoves';
import {   // HOOPS-MOVE-KIT-A amendment (D1–D3): the defense contest package (the 1v1's, on the team game)
  groundContest, aiBlockChance, bumpExposure, aiBumpStrips, jumpSwats, contestedPct, alteredApex, aiHandsUp, facingCos,
  AI_BLOCK_JUMP_CHANCE, AI_BLOCK_RANGE, BUMP_STRIP_WINDOW_SEC,
} from '../core/HoopsDefense';
import { HAND_UP_SEC, handUpContest, distXZ } from '../core/BasketballCore';
import { boardWinner, BOX_OUT_RANGE, jobObjective, type BoardBody } from '../core/HoopsOffball';   // HOOPS-MOVE-KIT-A O1–O3
import { scramSwitch } from '../core/Matchups';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { HoopJuice } from '../visual/HoopJuice';   // A+ P0: the hoop answers the make (shared with Dunk / 1v1; Meshy never scaled)
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
  /** O1–O3: the AI brain (its job / screen / box-out readouts); null for the hero. */
  brain: TeammateBrain | DefenderBrain | null;
  /** O1: the screen clip is held on this body. */
  screenHeld: boolean;
  // BIOMECH-HOOPS-WAVE1: the one animation owner, the Posture Poses layer and the hoops window it reads
  tree: BasketballAnimTree; posture: { layer: PostureLayer; dispose(): void } | null; bio: HoopsPostureInput;
  floored: boolean; shotWin: ShotWindow; shotSec: number; landSec: number; celebrateSec: number; speed01: number;
}

export const ThreeVThreeMode: ModeDefinition = (() => {
  let threeVenue: VenueHandle | null = null;  // M74
  let ctx0: ModeContext | null = null;        // O2: the HUD from the box-out helper
  let me: Body;
  let mates: Body[] = [];
  let foes: Body[] = [];
  let ball: AbstractMesh, ballSim: BallSim;
  let localSource: LocalInputSource;
  let agentCtl: AgentControlSource | null = null;   // M69: the hero slot's source under ?agent=1; null for human play
  let shotMeter: ShotMeter;
  let turbo: TurboMeter;
  let arc: ShotArc;
  let arcMade = false, arcPoints = 0, arcLabel = '', arcQuality: ShotQuality = 'good';
  let myScore = 0, foeScore = 0, assists = 0, timeLeft = POSSESSION_SEC;
  let carrierId: 'me' | 'mate0' | 'mate1' | 'foeTeam' = 'me';
  let shooting = false, dunking = false, ended = false, lastPasserWasMe = false;
  let currentShot: ShotContext | null = null;
  /** Contest at shot start — so the release banner can say why. */
  let shotContest = 0;
  /** Per-foe closing-speed memory for the hesi bite (same read as 1v1). */
  let foeCloseMem: number[] = [];
  let myJumpAge = Infinity;                      // block-jump timer (defense)
  const passFlight = new PassFlight();
  const carries = new Map<Body, BallCarry>();   // live dribble per body on my team
  let meSpeed01 = 0;
  let lookX = 0, lookY = 0;   // R stick → camera look (MODE-STICK-FACE family, 2026-09-07)
  let passTargetId: 'mate0' | 'mate1' = 'mate0';
  let passType: PassType = 'chest';
  /** Each teammate's velocity this frame — the lob needs to know who is CUTTING (D7). */
  const mateVel: Vector3[] = [new Vector3(), new Vector3()];
  /** The defenders' brains and their current marks — the scram switch re-marks them (lock: defensive switching). */
  const defenderBrains: DefenderBrain[] = [];
  let marks: number[] = [];
  let switchBannerAt = 0;
  let foeShotBlocked = false;
  let hoopJuice: HoopJuice | null = null;        // A+ P0 CONTACT-lite: rim spring / net squash / hoop flash on a make
  let contactLatch = false;                      // A+ P0: the dunk's ONE punch per attempt — never re-fired by the banner or the stun
  // ── BIOMECH-HOOPS-WAVE1 ──
  let driver: Body | null = null;                // the rival driving on their possession (its tree carries the ball, it faces the rim, the AI drive skips it)
  let driveK = 0;                                // the rival drive's clock 0..1 (the block window is its end)
  let dunkFlight: { k: number; made: boolean | null } | null = null;
  let dunkFlush: { releasePos: Vector3; since: number } | null = null;
  // ── HOOPS-MOVE-KIT-A ──
  let gather: { plan: GatherPlan; t: number } | null = null;                         // M1: the jumper's gather before the rise
  let finish: { plan: FinishPlan; t: number; released: boolean } | null = null;      // M3: a layup / floater in flight
  // ── HOOPS-MOVE-KIT-B: the post kit (M4–M6) ──
  let posting = false;                                                               // the seal I hold (the path into the fade / the hook / the quick spin)
  let spin: { plan: SpinPlan; t: number; beat: boolean } | null = null;              // M6: the pivot in flight
  let spinCooldown = 0, spinArmed = 0;   // M6: a body I meet ARMS the spin; the stick swung across throws it
  let spinClip = 'bball_spin';           // M9: the same machinery turns a PIVOT (a shorter sweep, no travel)
  let pumpWindow = 0;                    // M8: seconds left in which a squeeze is a STEP-THROUGH (he bit the fake)
  let banked: Vector3 | null = null;     // M12: the glass point this release is routed through
  let driveContest: DriveContest | null = null;                                      // M2: the body in the dunk's path
  let finishFoul = false;                                                            // M2: fouled in the air — and-one / the ball back
  const contactCooldown = new Map<string, number>();                                 // M2: one contact event per pair per 300 ms (the Havok solver's own gate)
  /** Bumped on every possession change; every timer that changes possession checks it (the 1v1's rule) — a stale
   *  setTimeout(resetPossession) from the rival's possession fired INTO my next one and teleported me mid-meter (measured). */
  let possessionToken = 0;
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
    return { pose, legs, aim: objectiveFor(b), eyes: def ? ballWorld() : RIM, window };
  }
  /** Face a body the play's way, slewed: the objective inside range, else the travel, else the heading. */
  const facePlay = (root: TransformNode, vel: Vector3, objective: Vector3 | null, range: number, dt: number, rate = FACE_RATE): number => {
    root.rotation.y = slewYaw(root.rotation.y, playFacing(root.position, vel, objective, range, root.rotation.y), rate, dt); return root.rotation.y;
  };
  const slideDirFor = (yaw: number, vel: Vector3): 'left' | 'right' => (vel.x * Math.cos(yaw) - vel.z * Math.sin(yaw) > 0.3 ? 'right' : 'left');
  /** The per-frame window clocks and the layer's input for one body. */
  function bioTick(b: Body, dt: number, role: HoopsPostureInput['role'], hasBall: boolean, nearestDefender: number, reaching: boolean): void {
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

  /** A possession-changing timer: only fires if the possession it was scheduled in is still the live one. */
  function later(ms: number, fn: () => void): void {
    const tok = possessionToken;
    setTimeout(() => { if (!ended && possessionToken === tok) fn(); }, ms);
  }
  function resetPossession(toMe = true): void {
    possessionToken++;
    me.char.root.position.set(0, 0, 6);
    // MODE-STICK-FACE (2026-09-07): face the rim AND tell the dribble so. The movement layer's facing starts at 0 no
    // matter which way the model spawned, and a push AGAINST the facing is a back-pedal that keeps the chest where it
    // is (DribbleController) — so with the hero spawned facing +z and the rim at −z, push-forward ran him BACKWARDS
    // to the rim for the whole drive (measured: facing·travel −1 for 4.4 m/s). 1v1 has always called setFacing(π).
    me.char.root.rotation.y = Math.PI; me.drib.setFacing(Math.PI);
    mates[0].char.root.position.set(-3.5, 0, 4);
    mates[1].char.root.position.set(3.5, 0, 4);
    foes.forEach((f, i) => f.char.root.position.set((i - 1) * 3, 0, 2));
    shooting = false; currentShot = null;
    if (gather || finish || spin || posting) me.tree.release();   // HOOPS-MOVE-KIT-A/B: a held gather / finish / seal / pivot is lifted with the possession
    gather = null; finish = null; spin = null; posting = false; spinCooldown = 0; spinArmed = 0; pumpWindow = 0; banked = null; driveContest = null; finishFoul = false; me.char.root.position.y = 0;
    clearDefense();
    // BIOMECH-HOOPS-WAVE1: the possession's clocks; a held shot is lifted, a floored body gets up
    driver = null; driveK = 0; dunkFlight = null; dunkFlush = null; mateArc.active = false;
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
      ctx0 = ctx;
      threeVenue = mountVenue(ctx, 'basketball_3v3', { keepGameplayCamera: true, location: ctx.location });
      if (!threeVenue) { VenueKit.buildCourt(ctx.scene, 'venice'); applyOceanCourt(ctx.scene, 'venice'); }
      const spawnBody = async (
        pos: Vector3, tint: string | undefined, ai: boolean,
        aiKind: 'teammate' | 'defender', slotAngle = 0, markIndex: number | null = null,
      ): Promise<Body> => {
        const char = await CharacterLibrary.spawn(ctx.scene, cfg.heroUrl, { position: pos, tint, startClip: SPORT_CLIP.idle });
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
        const slot = ai && brain
          ? new PlayerSlot('ai', new AISource(char.root.position, world, brain), false)
          : new PlayerSlot('me', agentCtl ?? localSource, true);
        // BIOMECH-HOOPS-WAVE1: one animation owner per rig, and the Posture Poses layer (mounted here, BEFORE the carries —
        // the dribble arm solves against the posed shoulders); the layer owns the eyes
        char.secondary?.setLookTarget(() => null);
        const body: Body = { char, slot, drib: new DribbleController(), stunSec: 0, vel: new Vector3(), jumpAge: Infinity, brain, screenHeld: false, tree: new BasketballAnimTree(char.animator), posture: null, bio: { ...HOOPS_INPUT_IDLE }, floored: false, shotWin: 'none', shotSec: 0, landSec: 0, celebrateSec: 0, speed01: 0 };
        body.posture = mountPostureLayer(ctx.scene, char.skeleton, char.root, () => feedFor(body), `3V3-PP-${ai ? aiKind : 'me'}`);
        return body;
      };

      localSource = new LocalInputSource();
      // M69 (mirrors 1v1): when driven by an agent (?agent=1), the hero slot reads from the AgentControlSource
      // instead of local input. Human play is untouched — the bridge is only installed under the dev flag.
      agentCtl = agentBridge() ? new AgentControlSource() : null;
      if (agentCtl) { ctx.agent.control = agentCtl; ctx.agent.getScore = () => myScore; }
      me = await spawnBody(new Vector3(0, 0, 6), undefined, false, 'teammate');
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
      carries.forEach((c) => c.dispose()); carries.clear();
      for (const b of [me, ...mates]) carries.set(b, mountBallCarry({ scene: ctx.scene, ball, root: b.char.root, skeleton: b.char.skeleton }));
      ballSim = new BallSim(ball, 0.12);
      shotMeter = new ShotMeter();
      turbo = new TurboMeter();
      arc = new ShotArc();
      EffectsKit.ambient(ctx.scene, 'venice');
      EffectsKit.ballTrail(ctx.scene, ball);
      hoopJuice?.dispose(); hoopJuice = new HoopJuice(ctx.scene, RIM);   // A+ P0: juice-only ring + net, material clones — no meshy_hoop_* transform is touched
      if (process.env.NODE_ENV === 'development') { const dev = (window as unknown as { __FEL_DEV__?: { hoopJuiceUsed?: unknown } }).__FEL_DEV__; if (dev) dev.hoopJuiceUsed = hoopJuice.used; }
      SoundKit.startAmbient('stadium');

      myScore = 0; foeScore = 0; assists = 0; timeLeft = POSSESSION_SEC; ended = false;
      shotContest = 0; foeCloseMem = foes.map(() => 0);
      ctx.heroRef.current = me.char.root;
      ctx.objectiveRef.current = RIM;
      ctx.camDirector.snapTo(me.char.root.position, RIM);
      threeVenue?.hidePlaceholders();  // M74: drop stand-ins now that real chars are in
      assertSpawned(ctx.scene, { hero: me.char.root, minWorldMeshes: 6, modeId: 'threevthree' });
      resetPossession(true);
      if (process.env.NODE_ENV === 'development') { const dev = (window as unknown as { __FEL_DEV__?: { hoopsPosture?: unknown } }).__FEL_DEV__; if (dev) dev.hoopsPosture = { me: () => me.posture?.layer.get() ?? null, foe: () => foes[0]?.posture?.layer.get() ?? null, bio: () => ({ me: { ...me.bio }, foe: { ...(foes[0]?.bio ?? {}) } }), carrier: () => carrierId, offense: () => { if (!ended) resetPossession(true); }, luck: (v: number | null) => { defenseLuck = v; }, bumpAge: () => bumpAge, handUp: () => ({ me: meHandUp, foe: !!foeHandUp }), post: () => { const n = nearestLiveFoe(); return { posting, spinning: !!spin, brace: !!me.slot.intent.brace, can: canPostUp(me.char.root.position, RIM_FLOOR, n ? n.char.root.position : null), carrying: carrierId === 'me', shooting, finish: !!finish, gather: !!gather, foeStun: n ? n.stunSec : -1, armed: spinArmed, pump: pumpWindow, glass: !!banked, held: me.tree.held ?? '' }; }, driverRoot: () => driver?.char.root ?? null, ended: () => ended, boxing: () => boxingOut,
          // O3: every body's job, its objective and how squarely it faces it (the probes' awareness read)
          jobs: () => everyBody().map((b, i) => { const mb = mateBrain(b), db = foeBrain(b); const obj = b === me ? (carrierId === 'me' ? RIM : (driver?.char.root.position ?? ballWorld())) : objectiveFor(b); const p = bodyPos(b); const yaw = b.char.root.rotation.y; const v = b === me ? me.drib.vel : b.vel; return { id: b === me ? 'me' : isFoe(b) ? `foe${foes.indexOf(b)}` : `mate${mates.indexOf(b)}`, i, job: jobOf(b), phase: mb?.screen.phase ?? (db ? (db.fightingOver === null ? '' : db.fightingOver ? 'over' : 'under') : ''), x: p.x, z: p.z, y: p.y, speed: Math.hypot(v.x, v.z), facing: facingCos(yaw, p, obj), objX: obj.x, objZ: obj.z, boxing: !!(mb?.boxing || db?.boxing), root: b.char.root }; }), foeRoot: foes[0]?.char.root ?? null, nearestFoeRoot: () => foes.reduce<Body | null>((b, f) => !b || Vector3.Distance(f.char.root.position, me.char.root.position) < Vector3.Distance(b.char.root.position, me.char.root.position) ? f : b, null)?.char.root ?? null }; }   // BIOMECH-HOOPS-WAVE1 probes
      ctx.setHud({
        score: myScore, foeScore, target: TARGET_SCORE, time: timeLeft, ast: assists,
        hint: 'Work the court · PASS to the open man · snap the stick to break ankles · HOLD SHOOT, release in the green · hold L1/LT on the block to POST UP (shoot = HOOK, pull off the rim = FADEAWAY, stick across = SPIN)',
      });
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      localSource.feed(e);
      if (e.t === 'stick' && e.side === 'R') { lookX = e.x; lookY = e.y; }   // MODE-STICK-FACE: R stick → the director's look orbit
      // BLOCK jump while defending an opponent possession
      if (carrierId === 'foeTeam' && e.t === 'button' && e.btn === 'A' && e.pressed && myJumpAge === Infinity) {
        myJumpAge = 0;
        me.tree.beat('bball_block_reach');   // BIOMECH-HOOPS-WAVE1: the block reach (was jump_up → idle, two owners on the rig)
        SoundKit.play('whoosh', { pitch: 1.2, volume: 0.35 });
        if (driveK < 0.6) ctx.setHud({ banner: 'JUMPED EARLY — WAIT FOR THE RELEASE' }), setTimeout(() => ctx.setHud({ banner: '' }), 600);   // G4: a wasted jump says so
      }
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;
      timeLeft -= dt;
      if (timeLeft <= 0) {
        ended = true; SoundKit.play('whistle');
        return ctx.end(myScore >= foeScore ? 'WIN' : 'LOSS', myScore, { foeScore, assists });
      }
      ctx.setHud({ time: Math.ceil(timeLeft) });
      // the carrier dribbles (ball off the palm, arm reaches); everyone else's
      // carry is idle. Shots, dunks and passes put the ball back in the palm.
      const cbNow = carrierBody();
      // HOOPS-MOVE-KIT-A: never while the ball is in the air or on a finish — an active carry on the release frame yanked the
      // flying ball to the dribble point (carrierId stays 'me' until the next possession)
      const ballReleased = !!(ball.metadata as { felReleased?: boolean } | undefined)?.felReleased;
      for (const [b, c] of carries) c.update(dt, b === me ? meSpeed01 : 0.5, cbNow === b && !shooting && !dunking && !passFlight.active && !arc.active && !finish && !gather && !ballReleased && !(b === me && !!spin));

      // poll every body; tick stagger timers
      for (const b of everyBody()) { b.slot.poll(dt); b.stunSec = Math.max(0, b.stunSec - dt); if (b.jumpAge !== Infinity) { b.jumpAge += dt; b.char.root.position.y = jumpY(b.jumpAge); if (b.jumpAge >= JUMP_SEC) { b.jumpAge = Infinity; b.char.root.position.y = 0; } } }
      if (myJumpAge !== Infinity) myJumpAge += dt;
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
        const wantHandUp = !!me.slot.intent.contest && myJumpAge === Infinity && !meFloored && meStunSec === 0;
        if (wantHandUp !== meHandUp) { meHandUp = wantHandUp; if (meHandUp) console.info('[3V3-DEF] hand up (me)'); else me.tree.releaseHold(); }
        if (meHandUp && !me.tree.busy) me.tree.hold('bball_hand_up', { fadeSec: 0.1 });
        if (me.slot.intent.steal && driver && !driveStolen && !foeDunkFlight && meStunSec === 0 && distXZ(me.char.root.position, driver.char.root.position) < 1.6) {
          me.tree.beat('bball_steal_reach');
          const exposure = bumpExposure(0.3, bumpAge);
          if (exposure >= 0.5 || roll() < 0.3) { driveStolen = true; console.info(`[3V3-DEF] strip by me ${bumpAge <= BUMP_STRIP_WINDOW_SEC ? 'on the bump' : 'on the roll'} bumpAge ${bumpAge.toFixed(2)}`); }
          else { meStunSec = 0.35; ctx.setHud({ banner: 'REACH — THEY GO BY' }); setTimeout(() => ctx.setHud({ banner: '' }), 600); }
        }
      } else if (meHandUp) { meHandUp = false; me.tree.releaseHold(); }

      // the ball in flight (my arced attempt)
      // BIOMECH-HOOPS-WAVE1 G6: teammate / rival shots fly; the drive dunk's make flushes through the iron
      if (mateArc.active) { const r = mateArc.step(dt, ball.position); if (r === 'missed') ballSim.launch(ball.position.clone(), new Vector3((Math.random() - 0.5) * 3, 2.5, 1.5)); else if (r === 'made') ballSim.launch(ball.position.clone(), new Vector3(0, -0.5, 0.6)); }
      else if (dunkFlush) { dunkFlush.since += dt; if (flushThroughRim(ball, RIM, dunkFlush.releasePos, dunkFlush.since)) { ballSim.launch(ball.position.clone(), new Vector3(0, -0.5, 0.6)); dunkFlush = null; } }
      else if (!ball.parent && !arc.active && !passFlight.active && !dunking) ballSim.step(dt);
      if (arc.active) {
        const res = arc.step(dt, ball.position);
        if (res === 'made') {
          myScore += arcPoints;
          me.shotWin = 'none'; me.celebrateSec = CELEBRATE_SEC; me.tree.beat('bball_score_celebrate', { fadeSec: 0.15 });   // BIOMECH-HOOPS-WAVE1 G5
          // A THREE is not a routine bucket and must not land like one. The mode
          // had no camera pulse anywhere, so a deep splash and a two-foot layup
          // produced identical feedback — Phase 7's bar is that the big moment
          // is distinguishable, and Phase 8's is that the moments which earn it
          // get the juice.
          const bigShot = arcPoints === 3;
          SoundKit.play('score', { pitch: arcQuality === 'perfect' ? 1.2 : 1 });
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
          const andOne = finishFoul; finishFoul = false;   // HOOPS-MOVE-KIT-A M2: fouled on the finish
          ctx.setHud({ score: myScore, banner: andOne ? `${arcLabel} — AND ONE!` : arcQuality === 'perfect' ? `${arcLabel} — SPLASH!` : `${arcLabel} — GOOD!` });
          setTimeout(() => ctx.setHud({ banner: '' }), 800);
          if (myScore >= TARGET_SCORE) { ended = true; SoundKit.play('whistle'); ctx.end('WIN', myScore, { foeScore, assists }); return; }
          later(300, () => void opponentPossession(ctx));
        } else if (res === 'missed') {
          SoundKit.play('miss');
          me.shotWin = 'none';
          ballSim.launch(ball.position.clone(), new Vector3((Math.random() - 0.5) * 3, 2.5, 1.5));
          if (finishFoul) {   // HOOPS-MOVE-KIT-A M2: fouled in the air on a miss — the ball back
            finishFoul = false; ctx.setHud({ banner: 'FOULED ON THE FINISH — BALL BACK' });
            setTimeout(() => ctx.setHud({ banner: '' }), 900);
            later(900, () => resetPossession(true));
          } else {
            ctx.setHud({ banner: 'RIMS OUT' });
            setTimeout(() => ctx.setHud({ banner: '' }), 700);
            later(900, () => boardAfterMiss(ctx));   // O2: the board is a race
          }
        }
      }

      const iAmCarrier = carrierId === 'me';
      const meIntent = me.slot.intent;
      const moving = Math.hypot(meIntent.moveX, meIntent.moveY) > 0.1;
      const sprintOk = turbo.gate(dt, meIntent.sprint, moving);
      ctx.setHud({ turbo: Math.round(turbo.t01 * 100) });
        // Stick-space is normalised in LocalInputSource — see PlayerSlot.
      // MODE-STICK-FACE (2026-09-07): CAMERA-relative — the team camera looks at the rim (−z) from behind me, and in a
      // left-handed world a raw +x intent is SCREEN-LEFT (measured: stick-right Δscreen −5.6 m). Up = the camera's flat
      // forward, right = screen right, handed to the dribble in its stick space (+Y = −Z).
      const wish = ctx.camDirector.forwardFlat().scale(meIntent.moveY).addInPlace(ctx.camDirector.rightFlat().scale(meIntent.moveX));
      const drib = me.drib.update(dt, wish.x, -wish.z, sprintOk);
      meSpeed01 = drib.speed01; me.speed01 = drib.speed01;
      // HOOPS-MOVE-KIT-A: never inside a shot / finish — the hand swap moved the finishing hand's ball to the other palm mid-hop
      // (measured on a right-hand layup: the ball to the left hand at +207 ms; 1v1 had this line under its guard)
      if (drib.crossover && !shooting && !dunking && !finish && !gather && !posting && !spin) carries.get(me)?.switchHand();
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
            near.tree.beat(SPORT_CLIP.karateHitReact);   // BIOMECH-HOOPS-WAVE1: the tree owns the react (it was cut to a frame by the per-frame run / idle play)
            ctx.setHud({ banner: 'ANKLES!' });
            setTimeout(() => ctx.setHud({ banner: '' }), 800);
          }
        }

        // HESITATION — same vocabulary as 1v1: the pull-back tap plants you,
        // and a defender who has been CLOSING (not one standing set) bites.
        if (iAmCarrier && drib.hesitation && !finish && !posting) {
          turbo.t01 = Math.max(0, turbo.t01 - 0.05);
          SoundKit.play('whoosh', { pitch: 0.8, volume: 0.3 });
          let bit = false;
          for (let fi = 0; fi < foes.length; fi++) {
            const f = foes[fi];
            if (f.stunSec > 0) continue;
            if (Vector3.Distance(f.char.root.position, me.char.root.position) < 2.4 && (foeCloseMem[fi] ?? 0) > 0.8) {
              f.stunSec = 0.45;
              bit = true;
              f.tree.beat(SPORT_CLIP.karateHitReact);
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
          setTimeout(() => ctx.setHud({ banner: '' }), 700);
        }
      }
      // BIOMECH-HOOPS-WAVE1 G2: the ONE owner of my rig reads the game every frame (dribble / drive / protect / slides; a
      // held shot and the dunk / land beats are mode-owned and never raced)
      const meBoxing = boxingOut && !!meIntent.brace && !finish && !dunking;   // O2: L1 held on a shot = my seal on the nearest foe
      if (meBoxing) { const nf = nearestLiveFoe(); if (nf) me.char.root.rotation.y = slewYaw(me.char.root.rotation.y, yawTo(me.char.root.position, nf.char.root.position), FACE_RATE, dt); }
      if (!dunking) me.tree.update({   // the flight's held launch + the land crouch are mode-owned beats
        speed01: drib.speed01, crossover: drib.crossover && iAmCarrier, nearestDefender: nearestFoeDist, hasBall: iAmCarrier && !passFlight.active,
        shooting, dunking, driving: iAmCarrier && sprintOk && drib.speed01 > 0.6 && Vector3.Dot(me.drib.vel, RIM.subtract(me.char.root.position)) > 0,
        defending: carrierId === 'foeTeam', bracing: meBoxing, staggered: false, slideDir: slideDirFor(me.char.root.rotation.y, me.drib.vel),
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
          if (setScreen) { body.tree.hold('bball_screen_set', { fadeSec: 0.12 }); const side = mb!.screen.side === 1 ? 'RIGHT' : 'LEFT'; ctx.setHud({ banner: `SCREEN ${side} — DRIVE OFF IT` }); setTimeout(() => ctx.setHud({ banner: '' }), 700); console.info(`[3V3-OFF] screen set by mate${i} side ${side}`); }
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
          speed01: body.speed01, crossover: false, nearestDefender: Infinity, hasBall: carrierId === mateId && !passFlight.active, shooting: false, dunking: false, driving: false,
          defending: carrierId === 'foeTeam', bracing: !!mb?.boxing, staggered: false, slideDir: slideDirFor(body.char.root.rotation.y, vel),
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
          if (performance.now() - switchBannerAt > 4000) { switchBannerAt = performance.now(); ctx.setHud({ banner: 'THEY SWITCHED' }); setTimeout(() => ctx.setHud({ banner: '' }), 700); }
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
          if (!foeDunkFlight) f.tree.update({ speed01: f.speed01, crossover: false, nearestDefender: Infinity, hasBall: !!ball.parent, shooting: false, dunking: false, driving: driveK < 1, defending: false, bracing: false, staggered: false });   // the dunk's launch / land are mode-owned beats
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
        f.tree.update({
          speed01: f.speed01, crossover: false, nearestDefender: Infinity, hasBall: false, shooting: false, dunking: false, driving: false,
          defending: carrierId !== 'foeTeam', bracing: !!db?.boxing, staggered: false, slideDir: slideDirFor(f.char.root.rotation.y, vel),
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
      if (iAmCarrier && !shooting && !dunking && meIntent.pass && !passFlight.active) {
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
          if (type === 'lob') { ctx.setHud({ banner: 'LOB!' }); setTimeout(() => ctx.setHud({ banner: '' }), 500); }
          EffectsKit.burst(ctx.scene, me.char.root.position.add(new Vector3(0, 1.2, 0)), 'sparks');
        }
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
            setTimeout(() => ctx.setHud({ banner: '' }), 1100);
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
            setTimeout(() => ctx.setHud({ banner: '' }), 600);
          }
        }
      }

      // shoot (only while I'm the carrier) — a hot drive DUNKS instead
      // HOOPS-MOVE-KIT-A: the ball must be OURS (not released — the live dribble keeps it un-parented, so `ball.parent` is no
      // test): a trigger still held past the meter's end restarted a shot with the ball in the air (a second gather on top of
      // the arc, measured)
      if (iAmCarrier && !shooting && !dunking && !finish && !spin && !arc.active && !(ball.metadata as { felReleased?: boolean } | undefined)?.felReleased && meIntent.actionHeld > 0.02) {
        const nearestFoePos = foes.reduce<Vector3 | null>((best, f) =>
          !best || Vector3.Distance(f.char.root.position, me.char.root.position) < Vector3.Distance(best, me.char.root.position)
            ? f.char.root.position : best, null);
        // A+ P0: the gate measures a 3-D distance and the rim sits 3.05 m up — against RIM itself a floor-bound body can
        // NEVER be inside DUNK_RANGE (2.8 m), so the drive dunk had never fired in play (same bug 1v1 fixed in ade7c3f).
        // The range is a floor distance; judge it against the rim's floor point.
        // HOOPS-MOVE-KIT-B M4/M5: with my back to the basket the squeeze is the POST's own shot — the stick pulled off the
        // rim asks for the FADEAWAY, anything else is the JUMP HOOK. (A sealed body is never fast enough to dunk.)
        const toRimNow = RIM_FLOOR.subtract(me.char.root.position); toRimNow.y = 0; toRimNow.normalize();
        const post: PostShot = posting ? (stickBack01(wish.x, wish.z, toRimNow) >= POST_FADE_STICK_MIN ? 'fade' : 'hook') : 'none';
        const kind = posting ? 'none' : checkDriveDunk(me.char.root.position, me.drib.vel, RIM_FLOOR, turbo.t01, nearestFoePos);
        if (kind !== 'none') {
          startDunk(ctx, kind, nearestFoePos);
        // the FOOTWORK reads a frozen body too: a defender who has just BITTEN a pump is the man you step through
        } else if (!posting && startFootwork(ctx, wish.x, -wish.z, nearestFoeAny() ?? nearestFoePos)) {
          // M8 / M13 / M14: the footwork owns this squeeze
        } else {
          shooting = true;
          banked = null;   // M12: each release calls its own glass
          const contest = contestLevel(me.char.root.position, nearestFoePos);
          shotContest = contest;
          currentShot = classifyShot(me.char.root.position, me.drib.vel, RIM, contest, posting ? post : faceUpRead(nearestFoePos));
          // HOOPS-MOVE-KIT-A: a layup / floater is a FINISH (M3); a jumper GATHERS first (M1) — a set body rises at once.
          // HOOPS-MOVE-KIT-B: the hook (M5) and the fadeaway (M4) are finishes too — their own clip, their own hop.
          if (currentShot.style === 'layup' || currentShot.style === 'floater' || currentShot.style === 'hook' || currentShot.style === 'fadeaway' || currentShot.style === 'reverse') startFinish(ctx, currentShot.style, contest, nearestFoePos);
          else startRise(ctx, contest, wish.x, -wish.z);
          aiContestLoad();   // D1/D3: the nearest defender puts a hand up on the load, or times a block jump to the green
        }
      }
      if (iAmCarrier && shooting) {
        const t = shotMeter.update(dt);
        ctx.setHud({ shotMeterT: t });
        // HOOPS-MOVE-KIT-B M8: let go this early and it is a PUMP FAKE, not a 0.35-pct brick — and he can bite it
        if (meIntent.action && isPumpFake(t * shotMeter.durationSec) && !finish) pumpFake(ctx, nearestLiveFoe());
        else if (meIntent.action || t >= 1) {
          const quality = shotMeter.release();
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
          if (f.stunSec === 0 && f.slot.intent.steal && !finish && !gather && !dunking && !sealed && Vector3.Distance(f.char.root.position, carrier.char.root.position) < 1.6) {
            stripBall(ctx, f, 'STOLEN!');   // D2: the ball goes LOOSE from the hand (it used to warp to the rival's possession)
            break;
          }
        }
      }

      ctx.camDirector.look(lookX, lookY, dt);
      ctx.camDirector.update(me.char.root.position, me.drib.vel, RIM);
    },

    dispose() {
      carries.forEach((c) => c.dispose()); carries.clear();
      for (const b of [me, ...mates, ...foes]) { b?.posture?.dispose(); if (b) b.posture = null; }   // BIOMECH-HOOPS-WAVE1
      threeVenue?.dispose(); threeVenue = null;  // M74
      me?.char.dispose(); mates.forEach((m) => m.char.dispose()); foes.forEach((f) => f.char.dispose());
      ball?.dispose(); SoundKit.stopAmbient();
      hoopJuice?.dispose(); hoopJuice = null;        // A+ P0: restores any hoop material the punch swapped
    },
  };

  async function teammateShoots(ctx: ModeContext, body: Body, _i: number, finish: 'shot' | 'alleyoop' = 'shot'): Promise<void> {
    if (shooting) return;
    shooting = true;
    const dist = Vector3.Distance(body.char.root.position, RIM);
    const points = finish === 'alleyoop' ? 2 : isThree(body.char.root.position, RIM) ? 3 : 2;
    // a lob caught at the rim is a high-percentage finish — the read was made on the pass
    const made = Math.random() < (finish === 'alleyoop' ? 0.82 : 0.55);
    releaseBall(ball);
    // BIOMECH-HOOPS-WAVE1: the tree owns the beat; a jumper flows into the held follow-through (G5); the ball FLIES (G6)
    if (finish === 'alleyoop') body.tree.beat(SPORT_CLIP.dunkFinishTomahawk);
    else body.tree.beat('jumpshot', { onSettle: () => body.tree.beat('bball_follow_through', { fadeSec: 0.1 }) });
    body.shotWin = 'release'; body.shotSec = 0;
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
    setTimeout(() => ctx.setHud({ banner: '' }), 800);
    if (myScore >= TARGET_SCORE) { ended = true; SoundKit.play('whistle'); ctx.end('WIN', myScore, { foeScore, assists }); return; }
    later(made ? 200 : 900, () => void opponentPossession(ctx));
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
    console.info(`[3V3-DEF] my release ${currentShot?.style} contest ${shotContest.toFixed(2)} handUp ${foeHandUp === near && !!near} jump ${!!near && near.jumpAge <= HAND_UP_SEC} block ${blockChance.toFixed(2)}`);
    if (blockChance > 0 && roll() < blockChance) { blockedShot(ctx, near!); return; }
    releaseBall(ball);
    gather = null;   // HOOPS-MOVE-KIT-A M1: a release inside the gather is a rushed shot
    // BIOMECH-HOOPS-WAVE1 G5: the held jumpshot (at its release frame) flows into the authored follow-through, HELD until the
    // arc resolves. HOOPS-MOVE-KIT-A M3: a layup / floater lets go from its OWN clip at the top of the hop and rides it to
    // feet-down (it used to cut to the dunk launch clip — a two-arm sweep through a T)
    if (finish) finish.released = true;
    else me.tree.beat('bball_follow_through', { fadeSec: 0.1 });
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

  function startDunk(ctx: ModeContext, kind: 'dunk' | 'poster', defenderPos: Vector3 | null): void {
    dunking = true; contactLatch = false; finishFoul = false;   // A+ P0: a fresh attempt gets one punch
    me.shotWin = 'none'; dunkFlush = null; let resolved = false; dunkFlight = { k: 0, made: null };   // BIOMECH-HOOPS-WAVE1
    turbo.t01 = Math.max(0, turbo.t01 - 0.3);
    const from = me.char.root.position.clone();
    const landing = new Vector3(RIM.x, 0, RIM.z + DRIVE_DUNK.landAheadZ);
    // HOOPS-MOVE-KIT-A M2: the contest is a BODY in the flight's path (the nearest defender; the 1v1's rule)
    const wall = defenderPos ? foes.find((f) => f.char.root.position === defenderPos) ?? null : null;
    const c = contestDrive(from, landing, wall && wall.stunSec === 0 ? wall.char.root.position : null, wall ? wall.vel : null, kind);
    driveContest = c;
    console.info(`[3V3-CONTACT] drive contest ${kind} contested ${c.contested} t ${c.t.toFixed(2)} lateral ${c.lateral.toFixed(2)} set ${c.set} pct ${c.pct.toFixed(2)} wall ${wall ? (wall.stunSec > 0 ? 'stunned' : 'live') : 'none'}`);
    let made = Math.random() < c.pct;
    let swatted = false;
    // D1: the wall reads the takeoff — a hand up in the lane can SWAT the dunk at the bump
    if (wall && c.contested && foeHandUp !== wall && wall.jumpAge === Infinity && aiHandsUp(distXZ(me.char.root.position, wall.char.root.position), facingCos(wall.char.root.rotation.y, wall.char.root.position, me.char.root.position), roll)) {
      if (foeHandUp) foeHandUp.tree.releaseHold();
      foeHandUp = wall; foeHandUpLeft = 1.2; wall.tree.hold('bball_hand_up', { fadeSec: 0.08 }); console.info('[3V3-DEF] ai hand up on the takeoff');
    }
    SoundKit.play('whoosh', { pitch: 0.85 });
    // BIOMECH-HOOPS-WAVE1 G6: the dribble parked, the ball in the palm through the flight; the launch's last frame HELD to feet-down (the 1v1's)
    carries.get(me)?.update(0, 0, false);
    if (!ball.parent) attachBallToHand(ball, me.char.skeleton, 'RightHand');
    me.tree.beat(SPORT_CLIP.dunkLaunchPower, { holdEnd: true });
    startBoxOut('mine');   // O2
    // the flight's own clock: real time, FROZEN for the bump's hit-stop and slowed for BUMP_SLOW_SEC after it (the velocity kill)
    let flightMs = 0, last = performance.now(), bumped = false, freezeMs = 0, slowMs = 0;
    const obs = ctx.scene.onBeforeRenderObservable.add(() => {
      const nowMs = performance.now(); const realMs = Math.min(50, nowMs - last); last = nowMs;
      const fdt = realMs / 1000;
      let scale = 1;
      if (freezeMs > 0) { freezeMs -= realMs; scale = 0; }
      else if (slowMs > 0) { slowMs -= realMs; scale = BUMP_SLOW; }
      flightMs += realMs * scale;
      const k = Math.min(1, flightMs / DRIVE_DUNK.flightMs);
      me.char.root.position.x = from.x + (RIM.x - from.x) * k;
      me.char.root.position.z = from.z + (RIM.z + DRIVE_DUNK.landAheadZ - from.z) * k;
      me.char.root.position.y = driveDunkY(k);
      // BIOMECH-HOOPS-WAVE1 G1/G3/G6 (the 1v1's): the chest eases onto the iron through the flight; the slam resolves AT THE
      // IRON — a make flushes through the net, a miss clanks off the front (it used to let go on the feet-down frame)
      me.char.root.rotation.y = slewYaw(me.char.root.rotation.y, yawTo(me.char.root.position, RIM), FACE_RIM_RATE, fdt);
      dunkFlight = { k, made: resolved ? made : null };
      // M2: the bodies meet — the bump
      if (!bumped && c.bumpK !== null && wall && k >= c.bumpK) {
        bumped = true; freezeMs = 45; slowMs = BUMP_SLOW_SEC * 1000;
        const handUp = foeHandUp === wall || wall.jumpAge <= HAND_UP_SEC;
        const swatChance = aiBlockChance('dunk', 0, handUp, c.set, c.strength01);
        if (swatChance > 0 && roll() < swatChance) {
          swatted = true; made = false;
          const at = ball.getAbsolutePosition().clone(); releaseBall(ball);
          ballSim.launch(at, c.dir.scale(-2.2).add(new Vector3((Math.random() - 0.5) * 2, 1.3, 0)));
          SoundKit.play('impact', { pitch: 0.7, volume: 0.6 }); SoundKit.play('crowdGroan', { volume: 0.5 });
          ctx.feel?.impact?.(0.5); ctx.juice.shake(0.1, 120);
          wall.tree.beat('bball_block_reach', { fadeSec: 0.06 });
          console.info(`[3V3-DEF] ai swat at the bump chance ${swatChance.toFixed(2)}`);
        } else driveBump(ctx, c, wall, made && kind === 'poster', (1 - k) * DRIVE_DUNK.flightMs > 320);
      }
      if (!resolved && !swatted && k >= DRIVE_DUNK.resolveK) {
        resolved = true;
        const releasePos = ball.getAbsolutePosition().clone(); releaseBall(ball);
        if (made) dunkFlush = { releasePos, since: 0 };
        else { missClank(ctx); ballSim.launch(releasePos, clankOffRim(ball, RIM)); }
      }
      if (k < 1) return;
      ctx.scene.onBeforeRenderObservable.remove(obs);
      dunking = false; dunkFlight = null; me.landSec = LAND_SEC; driveContest = null;
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
        const posterized = kind === 'poster' && defenderPos !== null;
        SoundKit.play('score', { pitch: 0.9 });
        SoundKit.play('crowdCheer', { volume: posterized ? 0.8 : 0.5 });
        contactPunch(ctx);   // A+ P0: hit-stop + shake + flash + the ONE slam thud + HoopJuice (replaces the bare feel.impact, which was a second thud)
        ctx.camDirector.pulse(posterized ? 1 : 0.6, 0.55);
        EffectsKit.burst(ctx.scene, RIM, 'net');
        if (posterized) {
          const victim = wall ?? foes.reduce<Body | null>((best, f) =>
            !best || Vector3.Distance(f.char.root.position, me.char.root.position)
              < Vector3.Distance(best.char.root.position, me.char.root.position) ? f : best, null);
          if (victim && !victim.floored) {   // M2: a contested poster put him down AT THE BUMP
            victim.stunSec = 1.4; victim.floored = true;
            victim.tree.beat(SPORT_CLIP.karateKnockdown, { settleTo: { clip: 'karate_floor_hold' } });   // BIOMECH-HOOPS-WAVE1 G5: to the floor, up when the stun ends
            EffectsKit.burst(ctx.scene, victim.char.root.position.add(new Vector3(0, 0.3, 0)), 'dust');
          }
        }
        ctx.setHud({ score: myScore, banner: fouled ? (posterized ? 'POSTERIZED — AND ONE!' : 'THROWN DOWN — AND ONE!') : posterized ? 'POSTERIZED!' : 'THROWN DOWN!' });
        setTimeout(() => ctx.setHud({ banner: '' }), 1000);
        if (myScore >= TARGET_SCORE) { ended = true; SoundKit.play('whistle'); ctx.end('WIN', myScore, { foeScore, assists }); return; }
        later(400, () => void opponentPossession(ctx));
      } else {
        SoundKit.play('miss');
        SoundKit.play('crowdGroan', { volume: 0.4 });
        // the clank and the loose ball fired at the resolve (k 0.55), off the front of the iron — BIOMECH-HOOPS-WAVE1 G6
        if (fouled) {
          ctx.setHud({ banner: 'FOULED AT THE RIM — BALL BACK' });
          setTimeout(() => ctx.setHud({ banner: '' }), 900);
          later(900, () => resetPossession(true));
        } else if (swatted) {   // D1: the ball went loose at the bump
          ctx.setHud({ banner: 'SWATTED AT THE RIM!' });
          setTimeout(() => ctx.setHud({ banner: '' }), 1000);
          later(900, () => boardAfterMiss(ctx));
        } else {
          ctx.setHud({ banner: kind === 'poster' ? 'STUFFED AT THE RIM!' : 'RATTLED OUT' });
          setTimeout(() => ctx.setHud({ banner: '' }), 800);
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
    shotMeter.start(contest, currentShot?.style ?? 'jumper', plan.sec);
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
    const clipSec = me.char.animator.durationOf('jumpshot') ?? 1.0;
    const greenInRise01 = (shotMeter.greenCenter01 * shotMeter.durationSec - shotMeter.gatherSec) / shotMeter.riseSec;
    me.tree.hold('jumpshot', { speedRatio: syncedShotSpeed(clipSec, shotMeter.riseSec, greenInRise01), fadeSec: 0.08 });
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
    if (preSec <= 0) shotMeter.start(style === 'hook' ? hookShield(contest) : contest, style);
    // M4: the fade's escape line — off the defender when he is on me, straight off the rim otherwise
    const plan = planFinish(style, side, shotMeter.durationSec, shotMeter.greenCenter01,
      style === 'fadeaway' ? postFadeAway(me.char.root.position, RIM_FLOOR, defenderPos) : undefined, preSec);
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
    if (pumpWindow > 0 && defenderPos && dist < 5.4) plan = planStepThrough(me.char.root.position, RIM_FLOOR, yaw, defenderPos);
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
    shotContest = contest;
    pumpWindow = 0;
    carries.get(me)?.update(0, 0, false);
    if (!ball.parent) attachBallToHand(ball, me.char.skeleton, 'RightHand');
    currentShot = plan.then === 'rise' ? classifyShot(me.char.root.position, me.drib.vel, RIM, contest) : { style: plan.then as ShotStyle, label: gatherLabel(plan.kind, 'FINISH'), pctMod: plan.then === 'floater' ? 1.0 : 1.18 };
    shotMeter.start(contest, currentShot.style, plan.sec);
    gather = { plan, t: 0 };
    me.shotWin = 'footwork'; me.shotSec = 0;
    const clip = plan.kind === 'stepthrough' ? 'bball_step_through' : plan.kind === 'hop' ? 'bball_hop_step' : 'bball_euro_step';
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
      if (beaten && near) { near.stunSec = SPIN_STUN_SEC; near.tree.beat(SPORT_CLIP.karateHitReact, { fadeSec: 0.06 }); }
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
    ctx.juice.hitStop(45);
    ctx.juice.shake(0.08, 110);
    ctx.feel?.impact?.(0.3);
    SoundKit.play('impact', { pitch: 0.95, volume: 0.55 });
    EffectsKit.burst(ctx.scene, wall.char.root.position.add(new Vector3(0, 1.0, 0)), 'dust');
    const shove = bumpShove(c);
    if (floorHim) {
      wall.stunSec = 1.4; wall.floored = true;
      wall.tree.beat(SPORT_CLIP.karateKnockdown, { settleTo: { clip: 'karate_floor_hold' } });
    } else if (!wall.floored) {
      wall.stunSec = Math.max(wall.stunSec, 0.35);
      wall.tree.beat(SPORT_CLIP.karateHitReact, { fadeSec: 0.06 });
    }
    wall.char.root.position.addInPlace(shove.scale(0.16));
    if (banner) { ctx.setHud({ banner: c.set ? 'CONTACT!' : 'BUMP!' }); setTimeout(() => ctx.setHud({ banner: '' }), 260); }
    console.info(`[3V3-CONTACT] drive bump strength ${c.strength01.toFixed(2)} set ${c.set} floor ${floorHim} shove ${shove.length().toFixed(1)}`);
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
    ctx0?.setHud({ hint: whose === 'theirs' ? 'BOX OUT — hold L1 to seal your man' : 'CRASH THE GLASS · hold L1 to box out' });
  }
  function endBoxOut(): void {
    if (!boxingOut) return;
    boxingOut = false;
    for (const f of foes) foeBrain(f)?.boxOut(null);
    for (const m of mates) { const mb = mateBrain(m); if (mb) { mb.boxOut(null); if (mb.job === 'crash' || mb.job === 'boxout') mb.setJob('space'); } }
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
    setTimeout(() => ctx.setHud({ banner: '' }), 700);
    if (winner === 'me') resetPossession(true); else void opponentPossession(ctx);
  }
  /** The nearest foe who is still ON HIS FEET — stunned or not (a body you have frozen is still a body to step past). */
  function nearestFoeAny(): Vector3 | null {
    const b = foes.reduce<Body | null>((best, f) => f.floored ? best : !best || distXZ(f.char.root.position, me.char.root.position) < distXZ(best.char.root.position, me.char.root.position) ? f : best, null);
    return b ? b.char.root.position : null;
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
    if (finish) finish.released = true; else me.tree.beat('bball_follow_through', { fadeSec: 0.1 });
    SoundKit.play('impact', { pitch: 0.75, volume: 0.55 }); SoundKit.play('crowdGroan', { volume: 0.4 });
    ctx.feel?.impact?.(0.4); ctx.juice.shake(0.08, 100);
    ctx.setHud({ shotType: '', shotMeterT: 0, banner: by.jumpAge <= HAND_UP_SEC ? 'BLOCKED!' : 'BLOCKED — HAND IN THE SHOT!' });
    setTimeout(() => ctx.setHud({ banner: '' }), 900);
    console.info('[3V3-DEF] blocked at the release');
    startBoxOut('mine');
    later(900, () => boardAfterMiss(ctx));
  }
  /** D2: a defender takes the ball — knocked LOOSE from my hand toward him, the reach on him; the possession follows once it
   *  settles (it used to warp straight to the rival's possession). */
  function stripBall(ctx: ModeContext, by: Body, banner: string): void {
    SoundKit.play('impact', { pitch: 1.2, volume: 0.35 });
    by.tree.beat('bball_steal_reach');
    parkCarries();
    const from = ball.getAbsolutePosition().clone(); releaseBall(ball);
    const toFoe = by.char.root.position.subtract(me.char.root.position); toFoe.y = 0; toFoe.normalize();
    ballSim.launch(from, toFoe.scale(1.6).add(new Vector3(0, 1.2, 0)));
    ctx.setHud({ banner }); setTimeout(() => ctx.setHud({ banner: '' }), 900);
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
      const ground = groundContest(meDist, facingCos(me.char.root.rotation.y, me.char.root.position, shooter.char.root.position), meHandUp);
      const contest = Math.min(1, contestLevel(shooter.char.root.position, me.char.root.position) * 0.5 + ground + (myJumpAge <= HAND_UP_SEC ? 0.3 : 0));
      let made = Math.random() < contestedPct(c.pct, contest);
      let swatted = false, bumped = false, resolved = false;
      shooter.tree.beat(SPORT_CLIP.dunkLaunchPower, { holdEnd: true });
      startBoxOut('theirs');
      SoundKit.play('whoosh', { pitch: 0.85 });
      console.info(`[3V3-DEF] rival dunk ${inLane ? 'poster' : 'open'} contest ${contest.toFixed(2)} pct ${contestedPct(c.pct, contest).toFixed(2)} bumpK ${c.bumpK === null ? 'none' : c.bumpK.toFixed(2)}`);
      let flightMs = 0, last = performance.now(), freezeMs = 0, slowMs = 0;
      const obs = ctx.scene.onBeforeRenderObservable.add(() => {
        if (possessionToken !== tok) { ctx.scene.onBeforeRenderObservable.remove(obs); foeDunkFlight = null; done(); return; }
        const nowMs = performance.now(); const realMs = Math.min(50, nowMs - last); last = nowMs;
        const fdt = realMs / 1000;
        let scale = 1;
        if (freezeMs > 0) { freezeMs -= realMs; scale = 0; }
        else if (slowMs > 0) { slowMs -= realMs; scale = BUMP_SLOW; }
        flightMs += realMs * scale;
        const k = Math.min(1, flightMs / DRIVE_DUNK.flightMs);
        shooter.char.root.position.x = from.x + (RIM.x - from.x) * k;
        shooter.char.root.position.z = from.z + (RIM.z + DRIVE_DUNK.landAheadZ - from.z) * k;
        shooter.char.root.position.y = driveDunkY(k);
        shooter.char.root.rotation.y = slewYaw(shooter.char.root.rotation.y, yawTo(shooter.char.root.position, RIM), FACE_RIM_RATE, fdt);
        foeDunkFlight = { k, made: resolved ? made && !swatted : null };
        if (!swatted && !resolved && jumpSwats(k, myJumpAge, distXZ(me.char.root.position, shooter.char.root.position))) {
          swatted = true; made = false;
          const at = ball.getAbsolutePosition().clone(); releaseBall(ball);
          const away = shooter.char.root.position.subtract(me.char.root.position); away.y = 0; away.normalize();
          ballSim.launch(at, away.scale(-2.5).add(new Vector3((Math.random() - 0.5) * 2, 1.5, 0)));
          SoundKit.play('impact', { pitch: 0.7, volume: 0.6 }); SoundKit.play('crowdCheer', { volume: 0.7 });
          ctx.feel?.impact?.(0.5); ctx.juice.hitStop(50); ctx.juice.shake(0.1, 120);
          EffectsKit.burst(ctx.scene, at, 'sparks');
          ctx.setHud({ banner: 'REJECTED AT THE RIM!' });
          console.info(`[3V3-DEF] swat at k ${k.toFixed(2)} jumpAge ${myJumpAge.toFixed(2)}`);
        }
        if (!bumped && !swatted && c.bumpK !== null && k >= c.bumpK) {
          bumped = true; freezeMs = 45; slowMs = BUMP_SLOW_SEC * 1000;
          ctx.juice.hitStop(45); ctx.juice.shake(0.08, 110); ctx.feel?.impact?.(0.3);
          SoundKit.play('impact', { pitch: 0.95, volume: 0.55 });
          if (made && inLane) { meStunSec = 1.4; meFloored = true; meHandUp = false; me.tree.beat(SPORT_CLIP.karateKnockdown, { settleTo: { clip: 'karate_floor_hold' } }); }
          else if (!meFloored && meStunSec === 0) { meStunSec = 0.3; meHandUp = false; me.tree.beat(SPORT_CLIP.karateHitReact, { fadeSec: 0.06 }); }
          me.char.root.position.addInPlace(bumpShove(c).scale(0.16));
          console.info(`[3V3-DEF] rival dunk bump strength ${c.strength01.toFixed(2)} floorMe ${made && inLane}`);
        }
        if (!resolved && !swatted && k >= DRIVE_DUNK.resolveK) {
          resolved = true;
          const releasePos = ball.getAbsolutePosition().clone(); releaseBall(ball);
          if (made) dunkFlush = { releasePos, since: 0 };
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
          setTimeout(() => ctx.setHud({ banner: '', hint: 'Work the court · PASS to the open man · HOLD SHOOT, release in the green' }), 1000);
          if (foeScore >= TARGET_SCORE) { ended = true; SoundKit.play('whistle'); ctx.end('LOSS', myScore, { foeScore, assists }); done(); return; }
          later(meFloored ? 1600 : 1000, () => resetPossession(true));
        } else {
          if (!swatted) { SoundKit.play('miss'); ctx.setHud({ banner: 'THEY RATTLED IT OUT' }); }
          setTimeout(() => ctx.setHud({ banner: '', hint: 'Work the court · PASS to the open man · HOLD SHOOT, release in the green' }), 900);
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
      ctx.setHud({ banner: 'FOUL!' }); setTimeout(() => ctx.setHud({ banner: '' }), 400);
      console.info(`[3V3-CONTACT] foul in the air (${closing.toFixed(1)} m/s) — and-one pending`);
      return;
    }
    if (closing < HARD_CONTACT_SPEED || !mine) return;   // AI-on-AI bumps exchange momentum silently — the read is the one I feel
    const onBall = carrierId === 'me' && !shooting && !finish && !dunking && !passFlight.active;
    if (severity === 'foul' && onBall && attacker === me && attackerSpeed >= FOUL_CLOSING_SPEED && isFoe(victim) && victim.stunSec === 0 && victim.vel.length() < 1.0) {
      // a sprint THROUGH a set defender is a CHARGE (a foul-speed contact on offense was never read)
      SoundKit.play('whistle');
      ctx.setHud({ banner: 'CHARGE — THEIR BALL' }); setTimeout(() => ctx.setHud({ banner: '' }), 1000);
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
      ctx.setHud({ banner: 'FOUL ON THE DEFENDER — BALL BACK' }); setTimeout(() => ctx.setHud({ banner: '' }), 1000);
      console.info(`[3V3-CONTACT] foul ${closing.toFixed(1)} m/s by the defender`);
      later(600, () => resetPossession(true));
      return;
    }
    // the hit reads on the body that took it; never a floored / stunned one, never a body inside a held beat (a react cut a held
    // follow-through, measured on 1v1), never me while I shoot or finish
    let react = false;
    if (victim !== me && victim.stunSec === 0 && !victim.floored && !victim.tree.busy) { victim.tree.beat(SPORT_CLIP.karateHitReact, { fadeSec: 0.06 }); react = true; }
    else if (victim === me && !shooting && !finish && !dunking && !gather && me.shotWin === 'none' && !me.tree.busy) { me.tree.beat(SPORT_CLIP.karateHitReact, { fadeSec: 0.06 }); react = true; }
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
    ctx.feel?.impact?.(0.4);
    SoundKit.play('impact', { pitch: 1.35, volume: 0.45 });
    console.info('[3V3-JUICE] dunk miss clank');
  }

  async function opponentPossession(ctx: ModeContext): Promise<void> {
    if (ended) return;
    possessionToken++;
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
    await new Promise<void>((res) => {
      const obs = ctx.scene.onBeforeRenderObservable.add(() => {
        if (driveStolen || possessionToken !== tok) { ctx.scene.onBeforeRenderObservable.remove(obs); res(); return; }   // D2: the poke took it / the possession moved on
        const k = Math.min(1, (performance.now() - t0) / 1100);
        driveK = k;
        // drive AT the rim, not 5m short of it (was x*0.6, z to RIM.z+2.2 —
        // the same short drive 1v1 shipped; a drive that never arrives makes
        // your positioning irrelevant and the block dance unreachable)
        shooter.char.root.position.x = from.x + (RIM.x - from.x) * k;
        shooter.char.root.position.z = from.z + (RIM.z + 0.9 - from.z) * k;
        if (k >= 1) { ctx.scene.onBeforeRenderObservable.remove(obs); res(); }
      });
    });
    if (possessionToken !== tok) return;
    if (driveStolen) {
      // D2: the ball knocked LOOSE from his hand toward me; the possession follows once it settles
      driveStolen = false;
      parkCarries();
      const from = ball.getAbsolutePosition().clone(); releaseBall(ball);
      const toMe = me.char.root.position.subtract(shooter.char.root.position); toMe.y = 0; toMe.normalize();
      ballSim.launch(from, toMe.scale(1.8).add(new Vector3(0, 1.0, 0)));
      shooter.tree.beat(SPORT_CLIP.karateHitReact, { fadeSec: 0.08 });
      SoundKit.play('impact', { pitch: 1.3, volume: 0.4 }); SoundKit.play('crowdCheer', { volume: 0.5 });
      ctx.setHud({ banner: bumpAge <= BUMP_STRIP_WINDOW_SEC ? 'STRIPPED ON THE BUMP!' : 'PICKED THEIR POCKET!' });
      setTimeout(() => ctx.setHud({ banner: '', hint: 'Work the court · PASS to the open man · HOLD SHOOT, release in the green' }), 900);
      driver = null;
      later(750, () => resetPossession(true));
      return;
    }
    // D1: an OPEN lane at the rim is a DUNK — a real flight I can swat
    const nearestAlly = Math.min(...allyPositions().map((p) => distXZ(p, shooter.char.root.position)));
    if (nearestAlly > 1.6 || (nearestAlly > 1.1 && roll() < 0.5)) { await driverDunk(ctx, shooter); return; }
    // THE BLOCK — a timed jump in range at this exact release moment
    if (checkBlock(me.char.root.position, shooter.char.root.position, myJumpAge)) {
      foeShotBlocked = true;
      SoundKit.play('impact', { pitch: 0.7, volume: 0.6 });
      SoundKit.play('crowdCheer', { volume: 0.6 });
      ctx.feel?.impact?.(0.5);
      EffectsKit.burst(ctx.scene, shooter.char.root.position.add(new Vector3(0, 1.6, 0)), 'sparks');
      shooter.tree.beat(SPORT_CLIP.karateHitReact);
      releaseBall(ball); ballSim.launch(ball.getAbsolutePosition(), new Vector3((Math.random() - 0.5) * 4, 2, 3));   // BIOMECH-HOOPS-WAVE1 G6: a blocked ball goes loose
      ctx.setHud({ banner: 'REJECTED!' });
      setTimeout(() => ctx.setHud({ banner: '', hint: 'Work the court · PASS to the open man · HOLD SHOOT, release in the green' }), 900);
      later(1000, () => resetPossession(true));
      return;
    }
    const nearestD = Math.min(...allyPositions().map((p) => Vector3.Distance(p, shooter.char.root.position)));
    // D3: my grounded hand-up inside range, facing him, contests on top of the distance
    const ground = groundContest(distXZ(me.char.root.position, shooter.char.root.position), facingCos(me.char.root.rotation.y, me.char.root.position, shooter.char.root.position), meHandUp);
    const defenseFactor = Math.min(1, Math.max(0, Math.min(1, 1 - nearestD / 3)) + ground);
    const made = Math.random() < contestedPct(0.5 - Math.min(0.5, defenseFactor * 0.3), ground);
    console.info(`[3V3-DEF] rival release jumper contest ${defenseFactor.toFixed(2)} handUp ${ground > 0}`);
    if (ground > 0) { ctx.setHud({ banner: 'CONTESTED — HAND UP!' }); }
    releaseBall(ball);                                          // the shot leaves the hand
    // BIOMECH-HOOPS-WAVE1: the rival's jumper flows into the held follow-through (G5) and the ball FLIES (G6)
    shooter.tree.beat('jumpshot', { onSettle: () => shooter.tree.beat('bball_follow_through', { fadeSec: 0.1 }) });
    shooter.shotWin = 'release'; shooter.shotSec = 0;
    mateArc.start(ball.getAbsolutePosition(), RIM, made, 'jumper', alteredApex(defenseFactor));
    startBoxOut('theirs');   // O2: my team seals their bodies while the ball is up
    if (made) {
      foeScore += 2;
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
    setTimeout(() => ctx.setHud({ banner: '', hint: 'Work the court · PASS to the open man · HOLD SHOOT, release in the green' }), 800);
    if (foeScore >= TARGET_SCORE) { ended = true; SoundKit.play('whistle'); ctx.end('LOSS', myScore, { foeScore, assists }); return; }
    if (made) later(900, () => resetPossession(true)); else later(900, () => boardAfterMiss(ctx));   // O2: their miss is a board too
  }
})();

// HUD fields: foeScore, target, ast, shotMeterT, time, shotType, and NEW
// turbo (0-100 — small fuel bar, same treatment as 1v1's).
