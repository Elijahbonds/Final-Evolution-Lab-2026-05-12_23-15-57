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

import { MeshBuilder, Quaternion, TransformNode as BABYLON_TransformNode, Vector3 } from '@babylonjs/core';
import { dressBall } from '../visual/meshyProps';
import type { AbstractMesh, TransformNode } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { VenueKit } from '../visual/VenueKit';
import { applyOceanCourt } from '../visual/CourtSurface';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';  // M74
import { BallSim } from '../core/BallPhysics';
import { attachBallToHand, releaseBall, flushThroughRim, clankOffRim } from '../anim/ballRig';
import { mountPostureLayer, type PostureLayer } from '../anim/PostureLayer';   // BIOMECH-HOOPS-WAVE1: the dunk's Posture Poses, shared
import { hoopsPose, HOOPS_INPUT_IDLE, RELEASE_SEC, LAND_SEC, CELEBRATE_SEC, type HoopsPostureInput, type ShotWindow } from '../core/HoopsPosture';
import { slewYaw, yawTo, playFacing, DRIVE_DUNK, driveDunkY } from '../core/Biomech';
import { PlayerSlot, LocalInputSource, AISource } from '../core/PlayerSlot';
import { AgentControlSource } from '../core/AgentControlSource';  // M69: intent play under ?agent=1
import { agentBridge } from '../core/AgentBridge';
import {
  DribbleController, ShotMeter, DefenderBrain, contestLevel, clampToHalfCourt, isThree,
  resolveBodyCollision, checkAnkleBreak, classifyShot, ANKLE_BREAK_STUN_SEC,
  TurboMeter, ShotArc, checkDriveDunk, checkBlock, BLOCK_RANGE, DUNK_PCT,
  STEAL_EXPOSURE_MIN, AttackerBrain, RIVAL_DRIVE_SPEED, rivalShotPct, handUpContest, distXZ, HAND_UP_SEC,
  SHOT_QUALITY_PCT, type ShotQuality, type ShotContext,
} from '../core/BasketballCore';
import { DribbleStateMachine, syncedShotSpeed } from '../core/BallHandling';
import { ContactSystem, HARD_CONTACT_SPEED, FOUL_CLOSING_SPEED } from '../core/ContactSystem';
import {   // HOOPS-MOVE-KIT-A (2026-09-08): the gather, the finish kit, the drive contest
  planGather, gatherWish, gatherLabel, stickBack01, type GatherPlan,
  pickLayupSide, planFinish, finishHopY, finishStride, FINISH_LABEL, type FinishPlan, type FinishStyle,
  contestDrive, bumpShove, BUMP_SLOW, BUMP_SLOW_SEC, type DriveContest,
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
import { EffectsKit } from '../visual/EffectsKit';
import { HoopJuice } from '../visual/HoopJuice';   // A+ P0: the hoop answers the make (shared with Dunk; Meshy never scaled)
import { assertSpawned } from '../core/FrameGuard';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { DUNK_CONFIG as SHARED_CFG } from './modeConfigs';

/** Exported so hoop-alignment-tests can check it against the venue's hoop. */
export const RIM = new Vector3(0, 3.05, -0.6);
/** The rim's point on the floor — what a drive's range is measured against (see the checkDriveDunk call). */
const RIM_FLOOR = new Vector3(RIM.x, 0, RIM.z);
const TARGET_SCORE = 11;
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
const BOX_OUT_EDGE = 1.6;
/** How much a board is decided by the bounce rather than by position. */
const REBOUND_JITTER = 2.6;
/** My possession: I take it back to the top, the rival sets 3 m in. */
const MY_SPAWN = new Vector3(0, 0, 5), FOE_SPAWN = new Vector3(0, 0, 2);
/** Their possession: the CHECK. The rival checks up beyond the arc (top 7.24 m → z 6.64); I set 2 m inside him. */
const CHECK_FOE = new Vector3(0, 0, 9.2), CHECK_ME = new Vector3(0, 0, 7.2);
/** A poke's reach. Body collision holds two players ~1.1 m apart; 1.2 sat ON the standoff and flickered. */
const STEAL_RANGE = 1.6;
const REACH_COOLDOWN_SEC = 0.4;          // a reach is a commitment, not a mash
const REACH_WHIFF_STUN_SEC = 0.45;       // a whiffed reach costs your feet
const JUMP_SEC = 0.75;                   // the contest jump's clock (physics lands the body)
const JUMP_VY = 3.0;                     // m/s — ~0.46 m apex, 0.6 s of air
/** BIOMECH-HOOPS-WAVE1: the facing slew (rad/s) — a turn, never a snap; the shooter / dunker eases onto the rim at this rate. */
const FACE_RATE = 10, FACE_RIM_RATE = 6;
/** A defender inside this range of the handler keeps his chest on him (beyond it he runs to his spot, facing the travel). */
const DEFEND_FACE_RANGE = 6;
const HINT_OFFENCE = 'Drive fast at the rim to DUNK · snap the stick for ankles · pull BACK for a HESI · lose the ball and you DEFEND';
const HINT_DEFENCE = 'STAY IN FRONT — they sidestep, you slide · X: STEAL as the ball crosses over · A: JUMP on the gather to BLOCK · hold L1/LT: BOX OUT';

type Possession = 'mine' | 'defense';
/** Their possession: the check, the drive (incl. sidestep / blow-by / gather), the shot in the air, over. */
type DefensePhase = 'check' | 'drive' | 'shot' | 'over';

export const OneVOneMode: ModeDefinition = (() => {
  let me: SpawnedCharacter, foe: SpawnedCharacter, ball: AbstractMesh, ballSim: BallSim;
  let onevoneVenue: VenueHandle | null = null;  // M74
  let meSlot: PlayerSlot, foeSlot: PlayerSlot, localSource: LocalInputSource;
  let meDribble: DribbleController;
  let meDribbleSM: DribbleStateMachine;
  let meAnimTree: BasketballAnimTree, foeAnimTree: BasketballAnimTree;
  let meFootPlant: FootPlant;
  let meCarry: BallCarry | null = null, foeCarry: BallCarry | null = null;   // live dribble (ball off the palm)
  let wasPlanting = false;
  let shotMeter: ShotMeter;
  let turbo: TurboMeter;
  let arc: ShotArc;
  let arcPoints = 0, arcLabel = '';
  let myScore = 0, foeScore = 0, momentum = 0;
  const mbus = new MomentumBus();               // Phase 6: shared Game-Breaker
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
  let gatherShown = false, stepbackShown = false;
  let myJumpAge = Infinity;                 // seconds since my contest jump left the floor
  let meStunSec = 0;                        // whiffed reach costs you your feet
  let reachCooldown = 0;
  let contact: ContactSystem | null = null;      // Phase 4: Havok bodies when ready
  let hoopJuice: HoopJuice | null = null;        // A+ P0 CONTACT-lite: rim spring / net squash / hoop flash on a make
  let contactLatch = false;                      // A+ P0: the dunk's ONE punch per attempt — never re-fired by the banner or the stun
  let hud: ModeContext['setHud'] = () => {};
  // ── BIOMECH-HOOPS-WAVE1 (2026-09-08): the Posture Poses layer per body, and the hoops windows it reads ──
  let mePosture: { layer: PostureLayer; dispose(): void } | null = null, foePosture: { layer: PostureLayer; dispose(): void } | null = null;
  const meBio: HoopsPostureInput = { ...HOOPS_INPUT_IDLE }, foeBio: HoopsPostureInput = { ...HOOPS_INPUT_IDLE };
  let meShotWin: ShotWindow = 'none', meShotSec = 0, foeShotWin: ShotWindow = 'none', foeShotSec = 0;   // load (the meter / the gather) → release → follow (until the arc resolves)
  let meLandSec = 0, meCelebrateSec = 0, meSpeed01 = 0, foeSpeed01 = 0;
  let dunkFlight: { k: number; made: boolean | null } | null = null;                 // the drive dunk's flight clock (the posture windows ride it)
  let dunkFlush: { releasePos: Vector3; since: number } | null = null;               // the make's ball through the iron (G6)
  // ── HOOPS-MOVE-KIT-A ──
  let gather: { plan: GatherPlan; t: number } | null = null;                         // M1: the jumper's gather before the rise (the body still moves)
  let finish: { plan: FinishPlan; t: number; released: boolean } | null = null;      // M3: a layup / floater in flight (the stride, the hop, the finish clip)
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
  let foeBrain: DefenderBrain | null = null;     // O2/O3: the rival's brain (his job / box-out readouts)
  let lastBumpStripAt = 0;                       // D2: one bump-strip roll per 1.5 s
  const ballWorld = (): Vector3 => ball.getAbsolutePosition();
  /** The layer's feed: the window's stance and feet, the chest on the rim (offense) or the handler (defense), the eyes on the
   *  iron (offense) or the ball (defense). */
  const feedFor = (bio: HoopsPostureInput, aim: Vector3, eyes: Vector3) => { const { window, pose, legs } = hoopsPose(bio); return { pose, legs, aim, eyes, window }; };
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
    currentShot = null; myJumpAge = Infinity; meStunSec = 0; reachCooldown = 0;
    arc.active = false;
    meShotWin = 'none'; foeShotWin = 'none'; dunkFlight = null; dunkFlush = null; meLandSec = 0; meCelebrateSec = 0;   // BIOMECH-HOOPS-WAVE1
    if (gather || finish) meAnimTree.release();   // HOOPS-MOVE-KIT-A: a held gather / finish beat is lifted with the possession
    gather = null; finish = null; driveContest = null; finishFoul = false; contact?.setAirborne('me', false);
    clearDefense();
    place('me', me.root, MY_SPAWN, Math.PI);
    place('foe', foe.root, FOE_SPAWN, 0);
    if (!contact?.isReady) me.root.position.y = 0;
    meDribble.setFacing(Math.PI);           // reset means facing the rim again
    giveBall('me');
    meAnimTree.releaseHold();                // a reach / a layup finish in flight plays out; only a held shot is lifted
    if (!foeFloored) foeAnimTree.releaseHold();
    hud({ hint: HINT_OFFENCE, shotType: '', shotMeterT: 0 });
  }

  function bannerFlash(ctx: ModeContext, text: string, ms = 800): void {
    ctx.setHud({ banner: text });
    setTimeout(() => ctx.setHud({ banner: '' }), ms);
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
      hud = (u) => ctx.setHud(u);
      onevoneVenue = mountVenue(ctx, 'basketball_h2h', { keepGameplayCamera: true, location: ctx.location });
      if (!onevoneVenue) { VenueKit.buildCourt(ctx.scene, 'venice'); applyOceanCourt(ctx.scene, 'venice'); }
      me = await CharacterLibrary.spawn(ctx.scene, cfg.heroUrl, { position: MY_SPAWN.clone(), yawRad: Math.PI, startClip: SPORT_CLIP.idle });
      me.secondary?.setLookTarget(() => ball?.position ?? null);    // Phase 2: eyes on the ball
      neverBindPose(me.animator, SPORT_CLIP.idle); installSafePlay(me.animator, 'onevone-me');
      ctx.groundLock?.track(me.root, me.skeleton);
      foe = await CharacterLibrary.spawn(ctx.scene, cfg.heroUrl, { position: FOE_SPAWN.clone(), tint: '#ff2d78', startClip: SPORT_CLIP.idle });
      foe.secondary?.setLookTarget(() => ball?.position ?? null);
      neverBindPose(foe.animator, SPORT_CLIP.idle); installSafePlay(foe.animator, 'onevone-foe');
      ctx.groundLock?.track(foe.root, foe.skeleton);
      onevoneVenue?.hidePlaceholders();  // M74

      ball = MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, ctx.scene);
      void dressBall(ball, 'basketball');   // Meshy ball skin rides the physics sphere (visual only)
      ballSim = new BallSim(ball, 0.12);
      attachBallToHand(ball, me.skeleton, 'RightHand');
      EffectsKit.ambient(ctx.scene, 'venice');
      EffectsKit.ballTrail(ctx.scene, ball);
      hoopJuice?.dispose(); hoopJuice = new HoopJuice(ctx.scene, RIM);   // A+ P0: juice-only ring + net, material clones — no meshy_hoop_* transform is touched
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
      foeSlot = new PlayerSlot('foe', new AISource(foe.root.position, {
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
      mePosture?.dispose(); foePosture?.dispose();
      mePosture = mountPostureLayer(ctx.scene, me.skeleton, me.root, () => feedFor(meBio, possession === 'mine' ? RIM : foe.root.position, possession === 'mine' ? RIM : ballWorld()), '1V1-PP');
      foePosture = mountPostureLayer(ctx.scene, foe.skeleton, foe.root, () => feedFor(foeBio, possession === 'mine' ? me.root.position : RIM, possession === 'mine' ? ballWorld() : RIM), '1V1-PP-FOE');
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
        (ctx.scene.metadata ??= {}).onevone = { possession: () => possession, defPhase: () => defPhase, attackPhase: () => attacker.phase, foeRoot: foe.root, myJumpAge: () => myJumpAge, contacts: () => devContacts.slice(), luck: (v: number | null) => { defenseLuck = v; }, bumpAge: () => bumpAge, handUp: () => ({ me: meHandUp, foe: foeHandUp }), ended: () => ended, foeJob: () => (foeBrain?.boxing ? 'boxout' : foeBrain?.job ?? ''), foeBoxing: () => !!foeBrain?.boxing, defend: () => { if (!ended && possession === 'mine') startDefense(ctx, 'PROBE — DEFEND!'); }, offense: () => { if (!ended) resetPositions(); } };   // BIOMECH-HOOPS-WAVE1: `defend()` / `offense()` let a probe reach either possession deterministically
        const dev = (window as unknown as { __FEL_DEV__?: { hoopsPosture?: unknown } }).__FEL_DEV__;
        if (dev) dev.hoopsPosture = { me: () => mePosture?.layer.get() ?? null, foe: () => foePosture?.layer.get() ?? null, bio: () => ({ me: { ...meBio }, foe: { ...foeBio } }) };   // BIOMECH-HOOPS-WAVE1 probes
      }
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      localSource.feed(e);
      if (e.t === 'stick' && e.side === 'R') { lookX = e.x; lookY = e.y; }   // MODE-STICK-FACE: R stick → the director's look orbit
      // BLOCK / contest jump on defense: A leaves the floor. Time it on their GATHER and it erases the shot; jump at
      // nothing and they drive past you while you land.
      if (possession === 'defense' && e.t === 'button' && e.btn === 'A' && e.pressed && myJumpAge === Infinity && meStunSec === 0 && defPhase !== 'over') {
        myJumpAge = 0;
        meAnimTree.beat('bball_block_reach');
        if (contact?.isReady) contact.hop('me', JUMP_VY);
        SoundKit.play('whoosh', { pitch: 1.2, volume: 0.35 });
        // BIOMECH-HOOPS-WAVE1 G4: a jump outside the gather is a wasted one — say so (the whiffed reach already does)
        if (attacker.phase !== 'gather') bannerFlash(ctx, 'JUMPED EARLY — WAIT FOR THE GATHER', 600);
      }
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;
      mbus.update(dt);
      SoundKit.setAmbientLevel(0.3 + mbus.score01 * 0.7);
      meSlot.poll(dt);
      foeSlot.poll(dt);
      foeStunSec = Math.max(0, foeStunSec - dt);
      reachCooldown = Math.max(0, reachCooldown - dt);
      // the contest jump's clock; the kinematic fallback flies the root itself (physics lands the Havok body)
      if (myJumpAge !== Infinity) {
        myJumpAge += dt;
        if (!contact?.isReady) me.root.position.y = Math.max(0, Math.sin(Math.min(1, myJumpAge / JUMP_SEC) * Math.PI) * 0.46);
        if (myJumpAge >= JUMP_SEC) { myJumpAge = Infinity; if (!contact?.isReady) me.root.position.y = 0; }
      }
      // a posterized rival gets up when the stun ends (the tree held the floor)
      if (foeFloored && foeStunSec === 0) { foeFloored = false; foeAnimTree.beat('karate_get_up'); }
      if (meFloored && meStunSec === 0) { meFloored = false; meAnimTree.beat('karate_get_up'); }   // D1: posterized by the rival, back up
      bumpAge += dt;   // D2: the strip window's clock
      if (foeBlockJumpAge !== Infinity) { foeBlockJumpAge += dt; if (foeBlockJumpAge >= JUMP_SEC) foeBlockJumpAge = Infinity; }   // D1: the AI's contest jump
      if (foeHandUp) { foeHandUpLeft -= dt; if (foeHandUpLeft <= 0) { foeHandUp = false; foeAnimTree.releaseHold(); } }

      // ── the ball in flight (either end's shot) ──
      if (arc.active) {
        const res = arc.step(dt, ball.position);
        if (res !== 'flying') foeBrain?.boxOut(null);   // O2: the seal ends with the ball
        if (res === 'made') {
          SoundKit.play('score', { pitch: 1 });
          EffectsKit.burst(ctx.scene, RIM, 'net');
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
            ctx.setHud({ score: myScore, momentum, banner: finishFoul ? `${arcLabel} +${arcPoints} — AND ONE!` : `${arcLabel} +${arcPoints}` });   // HOOPS-MOVE-KIT-A M2: fouled on the finish
            if (finishFoul) { finishFoul = false; SoundKit.play('crowdCheer', { volume: 0.5 }); }
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
            later(900, () => { ctx.setHud({ banner: '' }); startDefense(ctx, 'MAKE IT, TAKE IT — DEFEND!'); });
          }
        } else if (res === 'missed') {
          SoundKit.play('miss');
          meShotWin = 'none'; foeShotWin = 'none';   // BIOMECH-HOOPS-WAVE1: the follow-through ends when the arc does
          launchLoose(ball.position.clone(), new Vector3((Math.random() - 0.5) * 3, 2.5, 1.5 + Math.random()));
          // HOOPS-MOVE-KIT-A M2: fouled in the air on a finish that missed — the ball back, no board race
          if (finishFoul && possession === 'mine') { finishFoul = false; bannerFlash(ctx, 'FOULED ON THE FINISH — BALL BACK', 1000); later(900, () => resetPositions()); return; }
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
          later(900, () => boardRace(ctx));
        }
      } else if (loose && !dunking) {
        ballSim.step(dt);
      }
      // BIOMECH-HOOPS-WAVE1 G6: the drive dunk's make flushes THROUGH the iron from the release, then drops out of the net
      if (dunkFlush) {
        dunkFlush.since += dt;
        if (flushThroughRim(ball, RIM, dunkFlush.releasePos, dunkFlush.since)) { launchLoose(ball.position.clone(), new Vector3(0, -0.5, 0.6)); dunkFlush = null; }
      }

      // ══ MY POSSESSION ══
      if (possession === 'mine') {
        const intent = meSlot.intent;
        const moving = Math.hypot(intent.moveX, intent.moveY) > 0.1;
        const sprintOk = turbo.gate(dt, intent.sprint, moving);
        ctx.setHud({ turbo: Math.round(turbo.t01 * 100) });
        // Stick-space is normalised in LocalInputSource — see PlayerSlot.
        const [mx, my] = camRel(ctx, intent.moveX, intent.moveY);
        const drib = meDribble.update(dt, mx, my, sprintOk);
        meSpeed01 = drib.speed01;
        if (shooting) {   // BIOMECH-HOOPS-WAVE1 G1: the shooter squares to the rim through the meter (he kept the last dribble heading)
          const yaw = slewYaw(me.root.rotation.y, yawTo(me.root.position, RIM), FACE_RIM_RATE, dt); face(me.root, yaw); meDribble.setFacing(yaw);
        }
        // HOOPS-MOVE-KIT-A M1: the GATHER moves the body — the pull-up's plant bleeds the speed to zero, the step-back goes
        // away from the rim — then the rise starts (the meter has been running since the squeeze)
        if (gather) {
          gather.t += dt;
          driveBody('me', me.root, gatherWish(gather.plan, gather.t), dt);
          if (gather.t >= gather.plan.sec) { gather = null; beginRise(); }
        }
        if (finish) stepFinish(dt);   // M3: the finish's stride and hop (before and after the release, to feet-down)
        if (!shooting && !dunking) {
          if (!finish) { driveBody('me', me.root, meDribble.vel, dt); face(me.root, drib.facingRad); }
          const nearestDef = foeStunSec > 0 ? Infinity : Vector3.Distance(me.root.position, foe.root.position);
          meAnimTree.update({
            speed01: drib.speed01, crossover: drib.crossover, nearestDefender: nearestDef,
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
          if (drib.crossover && !finish) meCarry?.switchHand();   // HOOPS-MOVE-KIT-A: no size-up reads inside a finish's hop
          if (drib.crossover && !finish) {
            SoundKit.play('whoosh', { pitch: 1.4, volume: 0.4 });
            ctx.feel?.impact?.(0.1);
            if (foeStunSec === 0 && checkAnkleBreak(true, me.root.position, foe.root.position)) {
              foeStunSec = ANKLE_BREAK_STUN_SEC;
              swing('ankle_break');
              SoundKit.play('impact', { pitch: 0.8, volume: 0.5 });
              SoundKit.play('crowdCheer', { volume: 0.5 });
              ctx.feel?.impact?.(0.35);
              EffectsKit.burst(ctx.scene, foe.root.position.add(new Vector3(0, 0.2, 0)), 'dust');
              foeAnimTree.beat(SPORT_CLIP.karateHitReact);
              ctx.setHud({ momentum });
              bannerFlash(ctx, 'ANKLES!');
            }
          }
          // HESITATION — the pullback plant. You spent your momentum; if the
          // defender was CLOSING on you, they bite and you own the next beat
          // (the controller's explode-out window is already armed). A set
          // defender standing off does NOT bite — that's the read.
          if (drib.hesitation && !finish) {
            turbo.t01 = Math.max(0, turbo.t01 - 0.05);
            SoundKit.play('whoosh', { pitch: 0.8, volume: 0.3 });
            ctx.setHud({ turbo: Math.round(turbo.t01 * 100) });
            // 2.4m: the defender's settle point on a stationary handler is
            // ~2m out (deny lever 0.35), so 1.9m put the bite permanently
            // one step out of reach — measured live, it could never trigger.
            const inRange = Vector3.Distance(me.root.position, foe.root.position) < 2.4;
            if (foeStunSec === 0 && inRange && foeCloseMemory > 0.8) {
              foeStunSec = 0.45;
              SoundKit.play('impact', { pitch: 1.1, volume: 0.35 });
              ctx.feel?.impact?.(0.2);
              foeAnimTree.beat(SPORT_CLIP.karateHitReact);
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
        foeAnimTree.update({
          speed01: Math.min(1, foeVel.length() / 3.6), crossover: false, nearestDefender: Infinity,
          hasBall: false, shooting: false, dunking: false, driving: false,
          defending: true, bracing: !!foeBrain?.boxing, staggered: false, slideDir: slideDirFor(foe.root.rotation.y, foeVel),   // O2: the seal stance while boxing
        });
        // same standoff fix as the defensive poke: bodies rest ~1.1m apart
        if (foeStunSec === 0 && carrying && !shooting && !dunking && !finish && !gather && foeIntent.steal && Vector3.Distance(me.root.position, foe.root.position) < 1.6) {
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
        }

        // shot start — drive context first: a hot drive DUNKS instead of metering
        if (!shooting && !dunking && carrying && meSlot.intent.actionHeld > 0.02) {
          const defenderPos = foeStunSec > 0 ? null : foe.root.position;
          // A+ P0: the gate measures a 3-D distance and the rim sits 3.05 m up — against RIM itself a floor-bound body can
          // NEVER be inside DUNK_RANGE (2.8 m), so the drive dunk had never fired in play (measured: every squeeze at speed
          // inside 2.6 m of the rim metered a jumper). The range is a floor distance; judge it against the rim's floor point.
          const kind = checkDriveDunk(me.root.position, meDribble.vel, RIM_FLOOR, turbo.t01, defenderPos);
          if (kind !== 'none') { startDunk(ctx, kind); }
          else {
            shooting = true;
            // G6: the live dribble is PARKED — the ball comes back to the palm for the meter and leaves the HAND at the release
            // (the carry's deactivate sat inside the !shooting guard, so the ball stayed at its last bounce point on the floor
            // through the whole meter and the arc started from there — measured ball–hand 1.56 m in the load)
            meCarry?.update(0, 0, false);
            if (!ball.parent) attachBallToHand(ball, me.skeleton, 'RightHand');
            const contest = contestLevel(me.root.position, defenderPos);
            shotContest = contest;
            currentShot = classifyShot(me.root.position, meDribble.vel, RIM, contest);
            // HOOPS-MOVE-KIT-A: a layup / floater is a FINISH (M3); a jumper GATHERS first (M1) — a set body rises at once
            if (currentShot.style === 'layup' || currentShot.style === 'floater') startFinish(ctx, currentShot.style, contest, defenderPos);
            else startRise(ctx, contest, mx, my);
            aiContestLoad(ctx);   // D1/D3: the AI puts a hand up on the load, or times a block jump to the green
          }
        }
        if (shooting) {
          const t = shotMeter.update(dt);
          ctx.setHud({ shotMeterT: t });
          if (meSlot.intent.action || t >= 1) releaseJumper(ctx, shotMeter.release());
        }

        ctx.camDirector.look(lookX, lookY, dt);
        ctx.camDirector.update(me.root.position, meDribble.vel, RIM);
      }

      // ── Phase 4: contact events (fouls/hard contact) from Havok ──
      if (contact?.isReady) {
        for (const c of contact.drainContacts()) {
          if (process.env.NODE_ENV === 'development') { devContacts.push({ t: performance.now(), severity: c.severity, closing: c.closingSpeed, attacker: c.attacker, victim: c.victim, attackerSpeed: c.attackerSpeed }); if (devContacts.length > 40) devContacts.shift(); }
          if (c.severity === 'foul') {
            if (possession === 'mine' && (dunking || finish) && c.victim === 'me') {
              // HOOPS-MOVE-KIT-A M2: fouled IN THE AIR — the attempt plays out (it used to reset the possession mid-flight, with
              // the flight observer still flying the body): a make is an AND-ONE, a miss is the ball back
              if (!finishFoul) { finishFoul = true; SoundKit.play('whistle'); bannerFlash(ctx, 'FOUL!', 400); console.info(`[1V1-CONTACT] foul in the air (${c.closingSpeed.toFixed(1)} m/s) — and-one pending`); }
            } else if (possession === 'mine' && !shooting && !dunking && !finish && carrying && c.attacker === 'me' && c.attackerSpeed >= FOUL_CLOSING_SPEED && foeVelLast.length() < 1.0 && foeStunSec === 0) {
              // HOOPS-MOVE-KIT-A M2: a sprint THROUGH a set defender is a CHARGE (a foul-speed contact on offense was never
              // read — the handler ran through bodies for free); a moving defender who gets hit is just beaten (below)
              SoundKit.play('whistle');
              swing('turnover');
              ctx.setHud({ momentum });
              bannerFlash(ctx, 'CHARGE — THEIR BALL', 1000);
              console.info(`[1V1-CONTACT] charge ${c.closingSpeed.toFixed(1)} m/s into a set body`);
              later(900, () => startDefense(ctx, 'CHECK UP — DEFEND!'));
            } else if (possession === 'mine' && !shooting && !dunking && !finish && carrying && c.attacker === 'foe' && c.victim === 'me' && c.attackerSpeed >= FOUL_CLOSING_SPEED) {
              // M2: a defender running THROUGH the handler at foul speed — the ball back
              SoundKit.play('whistle');
              bannerFlash(ctx, 'FOUL ON THE DEFENDER — BALL BACK', 1000);
              console.info(`[1V1-CONTACT] foul ${c.closingSpeed.toFixed(1)} m/s by the defender`);
              resetPositions();
            } else if (possession === 'mine' && (c.attacker === 'me' || c.attacker === 'foe') && !shooting && !dunking && !finish) {
              hardHit(ctx, c.attacker, c.victim, c.closingSpeed);   // a foul-speed collision with a MOVING defender: a hard hit, no whistle
            } else if (possession === 'mine' && shooting && c.victim === 'me') {
              SoundKit.play('whistle');
              mbus.report({ kind: 'big_make', weight: 8 }); momentum = Math.round(mbus.score01 * 100);
              ctx.setHud({ momentum });
              bannerFlash(ctx, 'FOUL! — BALL BACK', 1000);
              resetPositions();
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
        ctx.setHud({ turbo: Math.round(turbo.t01 * 100) });
        // Stick-space is normalised in LocalInputSource — see PlayerSlot.
        const [mx, my] = camRel(ctx, intent.moveX, intent.moveY);
        const drib = meStunSec > 0
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
          speed01: drib.speed01, crossover: false, nearestDefender: Infinity,
          hasBall: false, shooting: false, dunking: false, driving: false,
          defending: true, bracing: intent.brace ?? false, staggered: false, slideDir: slideDirFor(defYaw, meDribble.vel),
        });
        const dist = Vector3.Distance(me.root.position, foe.root.position);
        // D3: X HELD = the grounded hand-up (verticality) — a hold the tree never interrupts; re-held after a reach beat
        const wantHandUp = !!intent.contest && myJumpAge === Infinity && meStunSec === 0 && !meFloored && defPhase !== 'over';
        if (wantHandUp !== meHandUp) { meHandUp = wantHandUp; if (meHandUp) console.info('[1V1-DEF] hand up (me)'); else meAnimTree.releaseHold(); }
        if (meHandUp && !meAnimTree.busy) meAnimTree.hold('bball_hand_up', { fadeSec: 0.1 });

        if (defPhase === 'check' || defPhase === 'drive') {
          // the rival attacks — reading ME: contained → sidestep, open → drive, held → pull-up, a jump at nothing → blow-by
          const dec = attacker.decide(dt, foe.root.position, me.root.position, RIM_FLOOR, { defenderAirborne: myJumpAge !== Infinity && myJumpAge < 0.6 });
          if (defPhase === 'check' && dec.phase !== 'check') defPhase = 'drive';
          const sp = dec.wish.length();
          foeSpeed01 = Math.min(1, sp / RIVAL_DRIVE_SPEED);
          if (dec.phase === 'gather' || dec.phase === 'stepback') { if (foeShotWin === 'none') foeShotWin = 'load'; }   // BIOMECH-HOOPS-WAVE1: the telegraph is the load
          driveBody('foe', foe.root, dec.wish, dt);
          // a driver faces the rim through a sidestep (a crossover, not a run sideways); a blow-by runs its line
          face(foe.root, dec.phase === 'blowby' && sp > 0.5 ? Math.atan2(dec.wish.x, dec.wish.z) : Math.atan2(RIM.x - foe.root.position.x, RIM.z - foe.root.position.z));
          // the gather / step-back are mode-owned beats — the tree's loop choice must not race them (a 'protect'
          // stance played on the gather's first frame popped the hand 0.45 m)
          if (dec.phase !== 'gather' && dec.phase !== 'stepback') foeAnimTree.update({
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
            meAnimTree.beat('bball_steal_reach');
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
              foeAnimTree.beat(SPORT_CLIP.karateHitReact, { fadeSec: 0.08 });
              bannerFlash(ctx, onBump ? 'STRIPPED ON THE BUMP!' : 'PICKED THEIR POCKET!');
              console.info(`[1V1-DEF] strip by me ${onBump ? 'on the bump' : 'on the crossover'} exposure ${exposure.toFixed(2)} bumpAge ${bumpAge.toFixed(2)}`);
              later(750, () => resetPositions());
              return;
            }
            meStunSec = REACH_WHIFF_STUN_SEC;
            if (dist < 2.4) attacker.blowBy();
            SoundKit.play('whoosh', { pitch: 0.7, volume: 0.3 });
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
        ctx.camDirector.look(lookX, lookY, dt);
        ctx.camDirector.update(me.root.position, meDribble.vel, look);
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
      me?.dispose(); foe?.dispose(); ball?.dispose();
      meSlot?.dispose(); foeSlot?.dispose();
      SoundKit.stopAmbient();
      hoopJuice?.dispose(); hoopJuice = null;        // A+ P0: restores any hoop material the punch swapped
      onevoneVenue?.dispose(); onevoneVenue = null;  // M74
    },
  };

  /** THEIR possession: the check. The rival checks up beyond the arc, I set inside him, the drive starts after
   *  CHECK_HOLD_SEC. No timer decides the release — the AttackerBrain reads my body. */
  function startDefense(ctx: ModeContext, banner: string): void {
    possessionToken++;
    possession = 'defense'; carrying = false; shooting = false; dunking = false; currentShot = null;
    defPhase = 'check'; attacker.reset(); gatherShown = false; stepbackShown = false;
    myJumpAge = Infinity; meStunSec = 0; reachCooldown = 0; defContest = 0;
    arc.active = false;
    meShotWin = 'none'; foeShotWin = 'none'; dunkFlight = null; dunkFlush = null; meLandSec = 0; meCelebrateSec = 0;   // BIOMECH-HOOPS-WAVE1
    if (gather || finish) meAnimTree.release();   // HOOPS-MOVE-KIT-A: a held gather / finish beat is lifted with the possession
    gather = null; finish = null; driveContest = null; finishFoul = false; contact?.setAirborne('me', false);
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
    if (checkBlock(me.root.position, foe.root.position, myJumpAge) && Vector3.Distance(me.root.position, foe.root.position) <= blockRange) {
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
    const made = Math.random() < rivalShotPct(range, contest, style);
    arcPoints = style === 'layup' ? 2 : isThree(foe.root.position, RIM) ? 3 : 2;
    arc.start(ball.getAbsolutePosition(), RIM, made, style, alteredApex(contest));   // a strong contest ALTERS the release
    console.info(`[1V1-DEF] rival release ${style} contest ${contest.toFixed(2)} handUp ${ground > 0} pct ${rivalShotPct(range, contest, style).toFixed(2)}`);
    // the read at the release, before the arc lands — same as the hero's GREEN / CONTESTED tags
    if (contest >= 0.5) bannerFlash(ctx, ground > 0 ? 'CONTESTED — HAND UP!' : 'CONTESTED!', 500);
    else if (contest <= 0.15) bannerFlash(ctx, 'WIDE OPEN…', 500);
  }

  function startDunk(ctx: ModeContext, kind: 'dunk' | 'poster'): void {
    dunking = true; shooting = false; contactLatch = false; finishFoul = false;   // A+ P0: a fresh attempt gets one punch
    meShotWin = 'none'; dunkFlush = null; let resolved = false; dunkFlight = { k: 0, made: null };   // BIOMECH-HOOPS-WAVE1
    turbo.t01 = Math.max(0, turbo.t01 - 0.3);           // dunks spend fuel
    const from = me.root.position.clone();
    const landing = new Vector3(RIM.x, 0, RIM.z + DRIVE_DUNK.landAheadZ);
    // HOOPS-MOVE-KIT-A M2: the contest is a BODY in the flight's path — where the bump lands, how square he is, whether he is
    // set; the make chance follows the body (a set wall on a poster: 0.62; a late, moving one: nearer the open 0.78)
    const defenderPos = foeStunSec > 0 ? null : foe.root.position;
    const c = contestDrive(from, landing, defenderPos, defenderPos ? foeVelLast : null, kind);
    driveContest = c;
    console.info(`[1V1-CONTACT] drive contest ${kind} contested ${c.contested} t ${c.t.toFixed(2)} lateral ${c.lateral.toFixed(2)} set ${c.set} pct ${c.pct.toFixed(2)}`);
    let made = Math.random() < c.pct;
    let swatted = false;
    // D1: the AI reads the takeoff — a hand up (or a live contest jump) in the lane can SWAT the dunk at the bump
    if (c.contested && defenderPos && !foeHandUp && foeBlockJumpAge === Infinity && aiHandsUp(distXZ(me.root.position, foe.root.position), facingCos(foe.root.rotation.y, foe.root.position, me.root.position), roll)) {
      foeHandUp = true; foeHandUpLeft = 1.2; foeAnimTree.hold('bball_hand_up', { fadeSec: 0.08 }); console.info('[1V1-DEF] ai hand up on the takeoff');
    }
    SoundKit.play('whoosh', { pitch: 0.85 });
    // BIOMECH-HOOPS-WAVE1 G6: the live dribble is PARKED first — the ball comes back to the palm and rides the hand through
    // the flight (it used to stay at the last bounce point on the floor while the body flew, measured ballY 0.85 through the
    // whole flight); the launch's last frame is HELD to feet-down (the 0.35 s clip ran out mid-air into the run loop)
    meCarry?.update(0, 0, false);
    if (!ball.parent) attachBallToHand(ball, me.skeleton, 'RightHand');
    meAnimTree.beat(SPORT_CLIP.dunkLaunchPower, { holdEnd: true });
    contact?.setAirborne('me', true);
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
      me.root.position.x = from.x + (RIM.x - from.x) * k;
      me.root.position.z = from.z + (RIM.z + DRIVE_DUNK.landAheadZ - from.z) * k;
      me.root.position.y = driveDunkY(k);
      // BIOMECH-HOOPS-WAVE1 G1/G3: the chest eases onto the iron through the flight (it kept the drive's heading — a slam
      // from a body yawed 40° off the rim); the posture windows ride the flight clock (rise / hang / extend / jam / brace)
      face(me.root, slewYaw(me.root.rotation.y, yawTo(me.root.position, RIM), FACE_RIM_RATE, fdt));
      dunkFlight = { k, made: resolved ? made : null };
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
        } else driveBump(ctx, c, made && kind === 'poster', (1 - k) * DRIVE_DUNK.flightMs > 320);
      }
      if (!resolved && !swatted && k >= DRIVE_DUNK.resolveK) {
        // G6: the slam resolves AT THE IRON — the ball leaves the hand at the rim; a make flushes through the net, a miss
        // clanks off the front (it used to let go on the feet-down frame, from a hand at hip height, and float there)
        resolved = true;
        const releasePos = ball.getAbsolutePosition().clone(); releaseBall(ball);
        if (made) dunkFlush = { releasePos, since: 0 };
        else { missClank(ctx); launchLoose(releasePos, clankOffRim(ball, RIM)); }
      }
      if (k < 1) return;
      ctx.scene.onBeforeRenderObservable.remove(obs);
      dunking = false; dunkFlight = null; meLandSec = LAND_SEC; driveContest = null;
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
    shotMeter.start(contest, currentShot?.style ?? 'jumper', plan.sec);
    if (plan.sec > 0) {
      gather = { plan, t: 0 };
      meShotWin = 'gather'; meShotSec = 0;
      const clipSec = me.animator.durationOf('bball_pullup_gather') ?? 0.3;
      meAnimTree.beat('bball_pullup_gather', { holdEnd: true, fadeSec: 0.06, speedRatio: clipSec / plan.sec });
      SoundKit.play('whoosh', { pitch: 1.0, volume: 0.2 });
      console.info(`[1V1-MOVE] gather ${plan.kind} ${plan.sec.toFixed(2)} s from ${plan.v0.length().toFixed(1)} m/s`);
    } else { gather = null; beginRise(); }
    ctx.setHud({ shotType: gatherLabel(plan.kind, currentShot?.label ?? 'JUMPER') });
  }
  /** The rise: the jumpshot HELD, paced so its release frame lands on the meter's green (ShotReleaseSync) — after the gather. */
  function beginRise(): void {
    meShotWin = 'load'; meShotSec = 0;   // BIOMECH-HOOPS-WAVE1: the shot's posture clock
    const clipSec = me.animator.durationOf('jumpshot') ?? 1.0;
    const greenInRise01 = (shotMeter.greenCenter01 * shotMeter.durationSec - shotMeter.gatherSec) / shotMeter.riseSec;
    meAnimTree.hold('jumpshot', { speedRatio: syncedShotSpeed(clipSec, shotMeter.riseSec, greenInRise01), fadeSec: 0.08 });
  }
  /** M3: a layup / floater. The ball into the finishing hand (the side the drive comes from, or away from the defender),
   *  the finish clip paced so its release key (the top of the hop) is the green, the body strides the last step and hops. */
  function startFinish(ctx: ModeContext, style: FinishStyle, contest: number, defenderPos: Vector3 | null): void {
    const side = style === 'layup' ? pickLayupSide(me.root.position, RIM_FLOOR, me.root.rotation.y, defenderPos) : 'right';
    attachBallToHand(ball, me.skeleton, side === 'left' ? 'LeftHand' : 'RightHand');
    shotMeter.start(contest, style);
    const plan = planFinish(style, side, shotMeter.durationSec, shotMeter.greenCenter01);
    finish = { plan, t: 0, released: false };
    meShotWin = 'gather'; meShotSec = 0;
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
    driveBody('me', me.root, finishStride(finish.plan.style, me.root.position, RIM_FLOOR, finish.released), dt);
    me.root.position.y = finishHopY(finish.plan.style, k);
    if (k < 1) return;
    me.root.position.y = 0;
    finish = null;
    contact?.setAirborne('me', false);
    meAnimTree.release();   // the landing key → the loop the game asks for
    meDribble.setFacing(me.root.rotation.y);
  }
  /** M2: a hard hit on the floor READS on the body that took it (the solver already bleeds the runner's momentum) — never on
   *  a body the dunk's own bump is handling, never on a floored one, never on a body inside a held beat (the follow-through,
   *  a reach: a react cut the held follow-through, measured). */
  function hardHit(ctx: ModeContext, attacker: string, victim: string, closing: number): void {
    SoundKit.play('impact', { pitch: 1.0, volume: 0.3 });
    ctx.feel?.impact?.(0.25);
    if (dunking || closing < HARD_CONTACT_SPEED) return;
    let react = false;
    if (victim === 'foe' && foeStunSec === 0 && !foeFloored && !foeAnimTree.busy) { foeAnimTree.beat(SPORT_CLIP.karateHitReact, { fadeSec: 0.06 }); react = true; }
    else if (victim === 'me' && meStunSec === 0 && !shooting && !finish && !gather && meShotWin === 'none' && !meAnimTree.busy) { meAnimTree.beat(SPORT_CLIP.karateHitReact, { fadeSec: 0.06 }); react = true; }
    ctx.juice.shake(0.05, 80);
    console.info(`[1V1-CONTACT] hard ${attacker} → ${victim} ${closing.toFixed(1)} m/s react ${react}`);
  }
  /** M2: the bodies meet in the flight — hit-stop micro (the flight clock freezes with the clips), the thud, the shove or
   *  the knockdown. CONTACT you feel before the iron, not a make% number. */
  function driveBump(ctx: ModeContext, c: DriveContest, floorHim: boolean, banner: boolean): void {
    ctx.juice.hitStop(45);
    ctx.juice.shake(0.08, 110);
    ctx.feel.impact(0.3);
    SoundKit.play('impact', { pitch: 0.95, volume: 0.55 });
    EffectsKit.burst(ctx.scene, foe.root.position.add(new Vector3(0, 1.0, 0)), 'dust');
    const shove = bumpShove(c);
    if (floorHim) {
      foeStunSec = 1.4; foeFloored = true;
      foeAnimTree.beat(SPORT_CLIP.karateKnockdown, { settleTo: { clip: 'karate_floor_hold' } });
    } else if (!foeFloored) {
      foeStunSec = Math.max(foeStunSec, 0.35);
      foeAnimTree.beat(SPORT_CLIP.karateHitReact, { fadeSec: 0.06 });
    }
    if (contact?.isReady) contact.shove('foe', shove); else foe.root.position.addInPlace(shove.scale(0.16));
    if (banner) bannerFlash(ctx, c.set ? 'CONTACT!' : 'BUMP!', 260);
    console.info(`[1V1-CONTACT] drive bump strength ${c.strength01.toFixed(2)} set ${c.set} floor ${floorHim} shove ${shove.length().toFixed(1)}`);
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
    const pct = contestedPct(SHOT_QUALITY_PCT[quality] * pctMod * mbus.multiplier(), shotContest);
    arcPoints = isThree(me.root.position, RIM) ? 3 : 2;
    arcLabel = currentShot?.label ?? 'SHOT';
    const made = Math.random() < Math.min(0.98, pct);
    // D1: the AI's block at the release — a hand up (or a jump) inside range; the ball is knocked LOOSE from the hand
    const blockChance = foeStunSec > 0 || foeFloored ? 0 : aiBlockChance(currentShot?.style ?? 'jumper', foeDist, foeUp, foeVelLast.length() < 1.0);
    console.info(`[1V1-DEF] my release ${currentShot?.style} contest ${shotContest.toFixed(2)} handUp ${foeHandUp} jump ${foeBlockJumpAge <= HAND_UP_SEC} block ${blockChance.toFixed(2)}`);
    if (blockChance > 0 && roll() < blockChance) { blockedShot(ctx); return; }
    releaseBall(ball);
    meShotWin = 'release'; meShotSec = 0;   // BIOMECH-HOOPS-WAVE1: release → follow-through until the arc resolves
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
    const tag = shotContest >= 0.5 ? ' — CONTESTED' : shotContest <= 0.15 ? ' — WIDE OPEN' : '';
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
    carrying = false;
    arc.start(ball.getAbsolutePosition(), RIM, made, currentShot?.style ?? 'jumper', alteredApex(shotContest));   // D3: a strong contest ALTERS the release
    // O2: the shot is up — the rival SEALS me (the box-out between me and the rim, his chest on me) until the ball comes down
    if (foeStunSec === 0 && !foeFloored && distXZ(foe.root.position, RIM_FLOOR) < BOX_OUT_RANGE) { foeBrain?.boxOut(me.root.position); console.info('[1V1-OFF] box out (the rival seals me)'); }
  }

  // ── HOOPS-MOVE-KIT-A amendment: the DEFENSE contest package (D1–D3) ────────────────────────────────────────────────
  function clearDefense(): void {
    bumpAge = Infinity; foeBlockJumpAge = Infinity; foeBlockAt = -1; foeDunkFlight = null;
    if (foeHandUp) { foeHandUp = false; foeAnimTree.releaseHold(); }
    if (meHandUp) { meHandUp = false; meAnimTree.releaseHold(); }
    contact?.setAirborne('foe', false);
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
    foeAnimTree.beat('bball_steal_reach');
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
      foeAnimTree.hold('bball_hand_up', { fadeSec: 0.1 });
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
      if (!swatted && !resolved && jumpSwats(k, myJumpAge, distXZ(me.root.position, foe.root.position))) {
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
        if (made && inLane) { meStunSec = 1.4; meFloored = true; meHandUp = false; meAnimTree.beat(SPORT_CLIP.karateKnockdown, { settleTo: { clip: 'karate_floor_hold' } }); }
        else if (!meFloored && meStunSec === 0) { meStunSec = Math.max(meStunSec, 0.3); meAnimTree.beat(SPORT_CLIP.karateHitReact, { fadeSec: 0.06 }); meHandUp = false; }
        if (contact?.isReady) contact.shove('me', bumpShove(c)); else me.root.position.addInPlace(bumpShove(c).scale(0.16));
        console.info(`[1V1-DEF] rival dunk bump strength ${c.strength01.toFixed(2)} floorMe ${made && inLane}`);
      }
      if (!resolved && !swatted && k >= DRIVE_DUNK.resolveK) {
        resolved = true;
        const releasePos = ball.getAbsolutePosition().clone(); releaseBall(ball);
        if (made) dunkFlush = { releasePos, since: 0 };
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
