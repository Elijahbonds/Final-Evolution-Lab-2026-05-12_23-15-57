// DunkDuelMode — NEW mode (`modeId: 'dunkduel'`, route `/play/dunkduel`).
// The head-to-head dunk contest: TWO HUMANS, one device, pass-and-play.
// Player 1 dunks, hands the device over, Player 2 answers, alternating two
// dunks each; the same five judges (Silk/Doc/Mac/Reign/Prime, raw 30–50) score every attempt,
// and the higher total takes the duel.
//
// HONEST SCOPE: this is real local head-to-head — the strongest two-player
// experience shippable without networking infrastructure this repo can't
// see (same boundary as M48/M50). A remote/IRL-video variant would ride on
// the M36 cash-arena ghost/recording pipeline and is deliberately NOT
// faked here.
//
// The attempt flow is the proven M47/M52 single-player loop, trimmed for
// duel pacing: approach → charge (trigger) → cinematic with SLAM QTE →
// judged reveal. Rim-cam broadcast cut and per-phase watchdogs from M52.
//
// Owner re-lock (2026-09-01): "head to head irl dunk is supposed to be a
// REAL dunk contest platform" — the same NBA Live 08 contest bar as Dunk
// Contest, played head-to-head. What that adds to the trimmed loop:
//   VARIETY MEMORY — the judges remember EACH player's dunks; repeating
//     yourself costs you ("THE JUDGES HAVE SEEN THAT ONE…").
//   THE RUN-UP IS PART OF THE DUNK — peak approach speed feeds the jump
//     apex AND the judges' difficulty read. A walk-up caps your dunk.
//   THE CHAIR IS PHYSICAL — both players get the identical option to arm
//     the obstacle; clearing it pays, clipping it KILLS the dunk mid-air.
// (The bench-toss alley-oop — P2 throwing P1's lob — is the duel-native
// prop and is DEFERRED: it needs a second input surface mid-attempt.)
//
// BIOMECH-HOOPS-WAVE1 (2026-09-08): the contest's Posture Poses + feet (DUNK-POSTURE / DUNK-POSTURE-LEGS) on BOTH duel
// bodies through the shared anim/PostureLayer — the same stance table (core/DunkPosture) on the same flight clock, the
// chest on the iron, the eyes on the rim, the hip-yaw strip, the feet pointed in the air and flat for the land; the
// facing keeps easing onto the rim through the resolve (it stopped at the takeoff). The bench body stands in the hoops
// idle stance, chest and eyes on the dunker.

import { Color3, Color4, MeshBuilder, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, AnimationGroup, Camera, Observer, ParticleSystem, Scene, TransformNode } from '@babylonjs/core';
import { tintGarmentSlot, SLOT_KEYS } from '../core/playerIdentity';   // IMPROVE (2026-10-06) #1: P2 wears P2's colour
import { mountPlayerRing, type PlayerRingHandle } from '../visual/PlayerRing';   // IMPROVE (2026-10-06) #2: a ring per duellist
import { readPlayerIcon } from '../visual/playerIcon';
import { dressBall } from '../visual/meshyProps';   // IMPROVE (2026-10-06) #10: the duel ball is a basketball
import { mountShotMeter3D, type ShotMeter3DHandle } from '../visual/ShotMeter3D';   // IMPROVE (2026-10-06) #7: the contest's slam meter
import { DunkReplayRecorder, pausableDelay } from '../scene/DunkReplayCam';   // IMPROVE (2026-10-06) #12: the make, replayed
import { TRIPLE_CUT, tripleCutSec } from '../core/DunkCuts';
import { DunkFlight, DUNK_TRICKS, cueOf, cueVerdict, cueFireAt, CUE_BEAT_LABEL, type DunkTrick } from '../core/DunkSystem';   // IMPROVE (2026-10-06) #8: air tricks
import { trickInput } from '../core/DunkAssist';
import type { AmbientHandle } from '../visual/EffectsKit';
import { duelNext, duelNeed, needLine, nextMatchLength, reportedScore, styleTierFor, type DuelState } from './dunkDuelRules';   // IMPROVE (2026-10-06) #3 #4 #5 #9
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { FirstPress, PRESS_GRACE } from '../core/timingPress';
import { TakeoffEcho, type LaunchCause } from '../core/slamPress';   // HOTFIX (2026-09-24): the take-off's A is not the slam
import { refuse } from '../core/Refusal';   // HOTFIX (2026-09-24): a slam thrown too early is answered
import type { BodyView, ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import type { BodyEvent } from '@/lib/pose/BodyReader';
import { DUNK_BODY, DunkBodyBinder } from '@/lib/move/dunkBody';
import { BallSim } from '../core/BallPhysics';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { MOCAP_DUNK } from '../nexus/dressingFlags';
import { attachBallToHand, releaseBall, runHandOffPath, handOffK, flushThroughRim, clankOffRim, EASTBAY_PASSES, handOffSpecAt, type HandOffSpec } from '../anim/ballRig';
import { OBSTACLE_SPECS, clipsObstacle, heightAt, nextObstacle, type ObstacleKind, OBSTACLE_KINDS } from '../core/DunkObstacles';
import { spawnDunkObstacle, type DunkObstacle } from './dunkObstacleProps';
import { boneNode } from '../anim/boneLookup';
import { EASTBAY_TIMING } from '../anim/authored/timing';
import { armChain, reachArm, shapeReach, type ArmChain } from '../anim/HandIK';   // A+ P8 H1 (dunk mirror): the hang wrist reach
import { hitStop as feelHitStop } from '../core/gameFeel';   // DUNK-HANDS-RIM H3 (dunk mirror)
import { PostureLayer } from '../anim/PostureLayer';   // BIOMECH-HOOPS-WAVE1: the contest's Posture Poses, shared
import { mountMotionLayers, type MotionMount } from '../anim/motionLayers';   // HOOPS MOTION phase 3c: the hinged arm, the arms' last writer
import { posturePose, type PostureInput } from '../core/DunkPosture';
import { legPose, arcHeight } from '../core/DunkLegs';
import { mirrorGroupsInPlace, mirrorSide } from '../anim/groupMirror';
import { HOOPS_LEGS, HOOPS_POSTURE } from '../core/HoopsPosture';
import type { PlayOpts } from '../anim/CharacterAnimator';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { HoopJuice } from '../visual/HoopJuice';
import { applyVeniceDunkLookPass } from '../visual/veniceSurroundVisibility';
import { VenueKit } from '../visual/VenueKit';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { applyOceanCourt } from '../visual/CourtSurface';
import { DUNK_CONFIG as CFG } from './modeConfigs';

let modeVenue: VenueHandle | null = null;   // ship pass 4: the mounted venue spec, disposed with the mode
import { judgeDunk, BAND_TOTAL, ScoreReveal, MIN_TOTAL, PERFECT_TOTAL, type JudgeScore } from '../core/JudgePanel';  // Phase 7: shared judges (IMPROVE 2026-10-06 #6: and their staged reveal)
import { ModeMic } from '../audio/mic/ModeMic';   // THE MIC (2026-09-24): the court's MC, the sidekick and the crowd, on the mic
import { dunkStingers } from '../audio/mic/names';

type Phase = 'handoff' | 'approach' | 'charge' | 'cinematic' | 'resolve' | 'judging' | 'matchOver';
const STYLES = ['power', 'flashy', 'sig'] as const;
type Style = (typeof STYLES)[number];
// DUNK-CONTROL-JUICE: the duel launches on the same bodies as the contest — the owner's mocap takeoff (it TUCKS the feet,
// which is what clears a car: the 0.35 s authored takeoff leaves the legs nearly straight and the trail foot caught the roof
// at 1.36 m); FLASHY launched on the ROUNDHOUSE kick before.
const STYLE_CLIP: Record<Style, string> = {
  power: MOCAP_DUNK ? 'dunk_mocap' : SPORT_CLIP.dunkLaunchPower, flashy: MOCAP_DUNK ? 'dunk_mocap' : SPORT_CLIP.dunkLaunchPower, sig: SPORT_CLIP.dunkLaunchSig,
};
const STYLE_LABEL: Record<Style, string> = { power: 'POWER', flashy: 'FLASHY', sig: 'SIGNATURE' };
const STYLE_TIER: Record<Style, number> = { power: 3, flashy: 5.5, sig: 8 };

const DUNKS_EACH = 2;
// IMPROVE (2026-10-06) #2: the duellists' own colours — the bezel's P1 cyan / P2 pink, on the jersey and the ring
const P_HEX = ['#22d3ee', '#ff2d78'] as const;
// IMPROVE (2026-10-06) #11: the hand-off card and the verdict beats run on the MODE's clock (update() does not run while the game
// is paused), never on a wall-clock setTimeout: pausing on "PASS TO P2" used to start P2's runway behind the pause card
const HANDOFF_SEC = 2.2, HANDOFF_FIRST_SEC = 4, MISS_BEAT_SEC = 1.4, REVEAL_TAIL_SEC = 1.2;
// IMPROVE (2026-10-06) #16: the bench body's stance eases at this rate (it stands in one spot in the idle loop)
const BENCH_TICK_SEC = 1 / 15;
// IMPROVE (2026-10-06) #8: the trick pace, the contest's (DunkMode TRICK_RATE_MIN / MAX)
const TRICK_RATE_MIN = 0.8, TRICK_RATE_MAX = 1.35;
/** IMPROVE (2026-10-06) #3: the trick the FLASHY hint names (the tomahawk: D-PAD UP + Y). */
const FLASHY_EXAMPLE = trickInput(DUNK_TRICKS.find((t) => t.id === 'tomahawk') ?? { dir: 'up', btn: 'Y' });

// DUNK-CONTROL-JUICE (2026-09-08): the chair box is gone — the duel dunks over the same car / barrier / crate as the contest
// (dunkObstacleProps: real meshes, hitboxes sampled off them, the feet against the top). X and d-pad down cycle them.
type Prop = 'none' | ObstacleKind;
// off the SPEC TABLE, so PROVE IT gets a new prop the moment the contest does (these were written out kind by kind and
// went stale the first time the table grew — the typechecker is what said so)
const PROP_LABEL: Record<Prop, string> = { none: 'NO PROP', ...Object.fromEntries(OBSTACLE_KINDS.map((k) => [k, OBSTACLE_SPECS[k].label])) } as Record<Prop, string>;
const PROP_BONUS: Record<Prop, number> = { none: 0, ...Object.fromEntries(OBSTACLE_KINDS.map((k) => [k, OBSTACLE_SPECS[k].bonus])) } as Record<Prop, number>;
const FLUSH_Z_AHEAD = 0.6;
const APPROACH_SPEED = 6, FACE_RIM_RATE = 6;   // Dunk play tip (2026-09-07): the dunk mirror's stick speed / rim-facing ease
const TURN_RATE = 10, RETREAT_Z = CFG.startZ + 1.5;   // the facing slew (rad/s); how far a pull-back may back off the runway
const wrapYaw = (y: number): number => Math.atan2(Math.sin(y), Math.cos(y));   // the Euler yaw stays in (−π, π]
// A+ P8 athlete hands, mirrored from DunkMode (PM brief VENICE-DUNK-A-PLUS-P8, 2026-09-07): the reach weight ramp, the fall rate.
/** DUNK MOTION phase 11 (owner decision, 2026-09-23: right-handed "every dunk, every body"). The spawn resets the importer's root
 *  mirror, so a body renders as its model's mirror image and a dunker authored around RightHand dunks left-handed; the contest's
 *  fix (DunkMode, phase 8): mirror the dunk family onto the other side of each body and carry the ball in the rig's LEFT hand. */
const RIGHT_HANDED = true;
const hand = (n: 'LeftHand' | 'RightHand'): 'LeftHand' | 'RightHand' => (RIGHT_HANDED ? mirrorSide(n) as 'LeftHand' | 'RightHand' : n);
/** The eastbay's two passes (ballRig.EASTBAY_PASSES) on the right-handed body. */
const DUEL_EASTBAY: HandOffSpec[] = EASTBAY_PASSES.map((sp) => ({ ...sp, from: hand(sp.from), to: hand(sp.to) }));
const HAND_IK_MAX = 0.6, HAND_IK_LAG_SEC = 0.12, HAND_IK_RIM_UP = 0.08, REACH_POLE_CAP = Math.PI / 2, HAND_IK_FROM = EASTBAY_TIMING.carryUp - 0.05, FALL_SPEED = 2.6;
/** HOLD = RUN (the contest's): the hold ramps the athlete toward the rim at up to the max run and launches at the takeoff line. */
const HOLD_RUN_MAX = 7, HOLD_RUN_RAMP = 6;


const BUDGET_SEC: Record<Phase, number> = {
  handoff: 6, approach: 30, charge: 5, cinematic: 4, resolve: 3, judging: 6, matchOver: 999,
};

export const DunkDuelMode: ModeDefinition = (() => {
  let p1: SpawnedCharacter, p2: SpawnedCharacter;
  let ball: AbstractMesh, ballSim: BallSim;
  let trail: ParticleSystem | null = null;   // juice soft #5
  let fovCam: Camera | null = null, fovBase = 0, fovT = 0, fovOn = false;   // juice soft #4
  let settleLatch = false;                    // juice soft #3
  let settleArmed = false, settleArmAt = 0;   // A+ P4 (P10 mirror): the settle waits for feet-down, not the flush frame
  let hoopJuice: HoopJuice | null = null;     // juice LOOK: rim spring, net squash, hoop flash on the make
  let phase: Phase = 'handoff';
  let phaseSec = 0;
  let activeIdx: 0 | 1 = 0;                       // whose turn
  let attemptNum: [number, number] = [0, 0];      // dunks taken per player
  let totals: [number, number] = [0, 0];
  // ── IMPROVE (2026-10-06) ──
  let dunksEach = DUNKS_EACH;                     // #9: the match length, picked on the first hand-off card
  let offScores: [number[], number[]] = [[], []]; // #4: the dunk-off's scores (never added to the totals)
  let inDunkOff = false, lastDunk = 0;            // #4: this attempt is a dunk-off dunk; what it scored
  let rings: PlayerRingHandle[] = [];             // #2: one ring per duellist
  let meter3d: ShotMeter3DHandle | null = null, meterSpan = 1.5, beatCalled = false;   // #7
  const _meterHead = new Vector3();
  const reveal = new ScoreReveal();               // #6: confer → cards → drum → total
  let revealed: JudgeScore[] = [], revealScores: JudgeScore[] = [], judgeHold = -1, verdictBanner = '', revealOn = false;
  let replay: DunkReplayRecorder | null = null, cutting = false, contactAt = 0;   // #12
  let modeGen = 0;                                // #13: bumped on dispose — a promise that resolves after it touches nothing
  let modeClock = 0, bannerUntil = 0;             // #11: the mode's own clock (it stops with the game) and the banner's expiry
  const later: { at: number; fn: () => void }[] = [];
  let ambient: AmbientHandle | null = null;       // #14
  const flight = new DunkFlight();                // #8: the contest's air budget and d-pad recognizer
  let armedAir: DunkTrick | null = null, airTricks: DunkTrick[] = [];
  let loopClip: string | null = null;             // #19: the loop the active body is on (playClip on change only)
  let benchAcc = BENCH_TICK_SEC;                  // #16
  const _vel = new Vector3(), _faceV = new Vector3(), _want = new Vector3(), _camPos = new Vector3(), _camAt = new Vector3();   // #18 #20
  let style: Style = 'power';
  let charge = 0, clipTime = 0, qteHit = false, qteWindowOpen = false, qteAccuracy = 0;
  // A SLAM PRESSED A BEAT EARLY USED TO VANISH. The gate was `if (A && pressed && qteWindowOpen)`, so a player who
  // read the rise correctly and pressed slightly before the window got nothing at all — no slam, no miss, no word.
  // The press waits now and is scored from WHEN IT WAS PRESSED (core/timingPress), so early lands and lands badly,
  // which is what happens to somebody who jumps a beat. Late is still never buffered: after the moment, no moment.
  // HOTFIX (2026-09-24, BASELINE.md:244): and the FIRST press decides, as in the contest (DunkMode's SlamLatch, core/slamPress). Every A in the
  // flight used to be judged until one hit, so a re-press after a too-early one still scored (the owner's dunk hit on its third A).
  const slamPress = new FirstPress();
  // P5: the same body binding as the contest. The duel reads the same RT / A / B.
  const dunkBody = new DunkBodyBinder();
  let bodySlamClip: number | null = null;
  // HOTFIX (2026-09-24): …and the take-off's own A is not that first press. On the keyboard the take-off is the Space release,
  // which InputBus sends as R 0 and then an A: the R 0 launched, the A became the flight's first press, was held, and missed at
  // the window, and the real J in the window came back spent — every keyboard dunk clanked. A Space still held at the line
  // comes up later in the air the same way. core/slamPress TakeoffEcho drops the A that jumped, the "tap jump" that lands just
  // after the line launched the run itself, and the Space's own A (tagged by InputBus) until a slam could count (SLAM_FROM).
  const slamEcho = new TakeoffEcho();
  /** The earliest flight-clock second a press still scores (the window's opening less the grace): from here letting go of
   *  Space is a slam press, as it always was — before it, it is the run key coming up (HOTFIX 2026-09-24). */
  const SLAM_FROM = EASTBAY_TIMING.extend - CFG.qteWindowSec / 2 - PRESS_GRACE;
  /** IMPROVE (2026-10-06) #8: the slam window, tightened by each air trick's tax (DunkFlight.slamWindowScale — the contest's rule);
   *  with no trick thrown it is the tuned CFG.qteWindowSec, byte for byte. */
  const slamWindowSec = (): number => CFG.qteWindowSec * flight.slamWindowScale;
  /** IMPROVE (2026-10-06) #7: the meter's green, in the bar's 0..1 (the contest's slamGreen). */
  const slamGreen = (): { center: number; half: number } => ({ center: EASTBAY_TIMING.extend / meterSpan, half: slamWindowSec() / 2 / meterSpan });
  /** IMPROVE (2026-10-06) #7: the bar's verdict for a judged press at flight second `at` (the contest's bands). */
  function meterVerdict(at: number, v: { hit: boolean; accuracy: number }): void {
    const side = at < EASTBAY_TIMING.extend ? 'early' : 'late';
    meter3d?.end(v.hit ? (v.accuracy >= 0.85 ? 'perfect' : v.accuracy >= 0.5 ? 'good' : side) : side);
  }
  let sinceRelease = 0, releasePos = new Vector3();
  let finishing = false, rimCamCut = false, ended = false;
  let hangSlowMoLatch = false;
  let contactLatch = false;                  // contactPunch once per attempt (the make's flush frame)
  // ── A+ P8 athlete hands (dunk mirror; the make is replayed since IMPROVE 2026-10-06 #12 — makeShow) ──
  const armsOf = new WeakMap<SpawnedCharacter, { Left: ArmChain | null; Right: ArmChain | null }>();   // H1: per body, built once
  let handIkT = 0;                            // H1: 0..1 ease of the wrist reach
  let handIkObs: Observer<Scene> | null = null, ikScene: Scene | null = null;
  let hinges: MotionMount[] = [];   // HOOPS MOTION phase 3c: each duellist's hinged arm, after the reach
  const handIkTarget = new Vector3(), handIkPole = new Vector3();
  let clipToken = 0;                          // H5: a superseded clip's onEnd chain is dead (Babylon fires it on stop() too)
  let airHeld = false;                        // H5: the aerial clip holds its last frame until feet-down
  let dropToFloor = false;                    // H5: the root falls from the release height (a miss at the clank, a make at CONTACT)
  // ── BIOMECH-HOOPS-WAVE1: the Posture Poses layer per body (the contest's windows on the active dunker, the idle stance on the bench) ──
  const postureOf = new WeakMap<SpawnedCharacter, PostureLayer>();
  let landed = false;                         // feet-down: the land crouch owns the stance until its idle returns
  // IMPROVE (2026-10-06) #17: the feeds are two objects kept for the mode's life, refilled each frame (they were four new objects a
  // frame, twice over: the input and the result, for each body)
  const actIn: PostureInput = { phase: 'other', clipTime: 0, made: null, clipped: false, landed: false, celebrate: false, trick: null };
  const actFeed = { pose: HOOPS_POSTURE.idle, legs: HOOPS_LEGS.idle, aim: null as Vector3 | null, eyes: null as Vector3 | null, window: 'stance' as string };
  const benchFeedObj = { pose: HOOPS_POSTURE.idle, legs: HOOPS_LEGS.idle, aim: null as Vector3 | null, eyes: null as Vector3 | null, window: 'bench' };
  function activeFeed() {
    actIn.phase = phase === 'approach' || phase === 'charge' || phase === 'cinematic' || phase === 'resolve' ? phase : 'other';
    actIn.clipTime = clipTime; actIn.made = phase === 'resolve' ? qteHit : null; actIn.clipped = obstacleClipped; actIn.landed = landed;
    const { window, pose } = posturePose(actIn);
    actFeed.pose = pose; actFeed.legs = legPose(dropToFloor && window !== 'land' ? 'brace' : window, null); actFeed.window = window;
    actFeed.aim = rim; actFeed.eyes = rim;
    return actFeed;
  }
  function benchFeed(c: SpawnedCharacter) {
    const other = c === p1 ? p2 : p1;
    benchFeedObj.aim = other.root.position; benchFeedObj.eyes = ball.getAbsolutePosition();
    return benchFeedObj;
  }
  // the contest systems (owner re-lock: the real dunk-contest bar)
  let prop: Prop = 'none';
  let obstacle: DunkObstacle | null = null, obstacleToken = 0;
  let obstacleClipped = false, toppling = false, obstacleOver = false, obstacleCleared = false, clipFloorY = 0, clipBackZ = 0;
  let launchZ = CFG.gatherZ, ikSideK = 0, activeHandOff: { spec: HandOffSpec; t: number } | null = null;
  const feetOf = new WeakMap<SpawnedCharacter, { L: TransformNode | null; R: TransformNode | null }>();
  const gatherLine = (): number => (prop === 'none' ? CFG.gatherZ : rim.z + OBSTACLE_SPECS[prop].takeoffFromRim);
  const feetY = (): number => {
    const c = active(); let f = feetOf.get(c);
    if (!f) { f = { L: boneNode(c.skeleton, 'LeftFoot'), R: boneNode(c.skeleton, 'RightFoot') }; feetOf.set(c, f); }
    let lo = Infinity; for (const n of [f.L, f.R]) if (n) { n.computeWorldMatrix(true); lo = Math.min(lo, n.getAbsolutePosition().y); }
    return Number.isFinite(lo) ? Math.max(c.root.position.y, lo - 0.05) : c.root.position.y;
  };
  let runUpPeak = 0, launchSpeed01 = 0, holdRunSpeed = 0;
  const usedCombos: [Set<string>, Set<string>] = [new Set(), new Set()]; // per-player variety memory
  const rim = new Vector3(0, CFG.rimHeight, CFG.rimZ);
  const ebState = { inLeftHand: false };
  let stickX = 0, stickY = 0;
  let lookX = 0, lookY = 0, lookSeen = false; // R stick → the director's look orbit (Dunk play tip 2026-09-07)
  // THE MIC (owner, 2026-09-24: "add a MC announcer on the mic at the events"): the court's MC calls the duel — the welcome, who
  // takes the device, the run, the make with the dunk's name and the number, the misses, the winner — and the stands shout. No
  // player voices: P1 and P2 are the two people holding the pad. Silent from take-off to the iron (the SLAM is the player's).
  let mic: ModeMic | null = null, micOpened = false, micFiller = false;

  const active = (): SpawnedCharacter => (activeIdx === 0 ? p1 : p2);
  const bench = (): SpawnedCharacter => (activeIdx === 0 ? p2 : p1);
  const label = (): string => (activeIdx === 0 ? 'P1' : 'P2');
  function setPhase(p: Phase): void { phase = p; phaseSec = 0; }
  /** IMPROVE (2026-10-06) #11/#13: a beat on the mode's clock — it holds while the game is paused, and dies with the mode (dispose
   *  empties the queue). Every raw setTimeout the duel had (banner clears, the verdict's advance, the trail cut, the groan) is one. */
  function after(sec: number, fn: () => void): void { later.push({ at: modeClock + sec, fn }); }
  function runLater(ctx: ModeContext, dt: number): void {
    modeClock += dt;
    for (let i = 0; i < later.length;) {
      if (later[i].at <= modeClock) { const t = later.splice(i, 1)[0]; t.fn(); } else i++;
    }
    if (bannerUntil > 0 && modeClock >= bannerUntil) { bannerUntil = 0; ctx.setHud({ banner: '' }); }
  }
  /** IMPROVE (2026-10-06) #11: ONE banner channel. Each banner cleared itself on its own timer, so an older timer wiped a newer banner;
   *  a banner set here replaces the last one AND its expiry (`sec` 0: it stays until the next). */
  function setBanner(ctx: ModeContext, text: string, sec = 0): void {
    bannerUntil = sec > 0 ? modeClock + sec : 0;
    ctx.setHud({ banner: text });
  }
  /** IMPROVE (2026-10-06) #4 #5: the duel as the pure rules read it. */
  const duelState = (): DuelState => ({ dunksEach, attempts: attemptNum, totals, off: offScores });
  /** The hand-off's count line: the dunk of the match length, or the dunk-off round — and the number, on the deciding dunk. */
  function dunkNumLine(): string {
    const st = duelState();
    const need = duelNeed(st, activeIdx);
    const count = inDunkOff ? `OFF · ROUND ${offScores[0].length + (activeIdx === 0 ? 1 : 0)}` : `${attemptNum[activeIdx] + 1}/${dunksEach}`;
    return need === null ? count : `${count} · ${needLine(need, MIN_TOTAL, PERFECT_TOTAL)}`;
  }

  // ── Dunk play tip (2026-09-07), the dunk mirror: camera-relative stick, facing from velocity ──
  // IMPROVE (2026-10-06) #18: one scratch vector, read the same frame (it was a new Vector3 a frame, or Vector3.Zero())
  function stickVel(ctx: ModeContext): Vector3 {
    const mag = Math.hypot(stickX, stickY);
    if (mag < 0.08) return _vel.setAll(0);
    const k = (mag > 1 ? 1 / mag : 1) * APPROACH_SPEED;
    const f = ctx.camDirector.forwardFlat(), r = ctx.camDirector.rightFlat();
    return _vel.set((r.x * stickX - f.x * stickY) * k, 0, (r.z * stickX - f.z * stickY) * k);
  }
  function faceVel(v: Vector3, dt: number): void {   // slewed at TURN_RATE, shortest arc; the Euler yaw wins over any stale quat
    if (v.x * v.x + v.z * v.z < 0.05) return;
    const root = active().root;
    if (root.rotationQuaternion) root.rotationQuaternion = null;
    const want = Math.atan2(v.x, v.z);
    const d = Math.atan2(Math.sin(want - root.rotation.y), Math.cos(want - root.rotation.y));
    root.rotation.y = wrapYaw(root.rotation.y + Math.sign(d) * Math.min(Math.abs(d), TURN_RATE * dt));
  }
  function faceToward(target: Vector3, k: number): void {
    const root = active().root;
    const want = Math.atan2(target.x - root.position.x, target.z - root.position.z);
    let d = want - root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    root.rotation.y = wrapYaw(root.rotation.y + d * Math.min(1, k));
  }

  function setProp(ctx: ModeContext, p: Prop): void {
    prop = p;
    obstacle?.dispose(); obstacle = null; obstacleToken++;
    if (p !== 'none') {
      const token = ++obstacleToken;
      void spawnDunkObstacle(ctx.scene, p, rim, 'duel_obstacle').then((o) => { if (token !== obstacleToken || ctx.scene.isDisposed) o.dispose(); else obstacle = o; }, () => undefined);
    }
    ctx.setHud({ prop: PROP_LABEL[prop] });
  }

  /** True on the very first card of a duel: the one that offers the match length (#9). */
  const firstCard = (): boolean => attemptNum[0] === 0 && attemptNum[1] === 0 && !inDunkOff;
  function enterHandoff(ctx: ModeContext, dunkOffOpens = false): void {
    setPhase('handoff');
    armedAir = null; airTricks = []; flight.reset(); beatCalled = false; meter3d?.end(null); judgeHold = -1;   // IMPROVE (2026-10-06) #7 #8
    benchAcc = BENCH_TICK_SEC;   // IMPROVE (2026-10-06) #16: the new bench body's feed is filled on its first frame
    style = 'power'; charge = 0; qteHit = false; qteWindowOpen = false; qteAccuracy = 0; rimCamCut = false; hangSlowMoLatch = false; contactLatch = false;
    dunkBody.reset(); bodySlamClip = null;
    runUpPeak = 0; launchSpeed01 = 0; holdRunSpeed = 0; obstacleClipped = false; toppling = false; obstacleOver = false; obstacleCleared = false;
    settleLatch = false; settleArmed = false; fovRelease(); setTrail('soft');   // juice soft: back to the runway
    setProp(ctx, 'none');
    active().root.position.set(0, 0, CFG.startZ);
    active().root.rotation.y = Math.PI;
    airHeld = false; dropToFloor = false; handIkT = 0; landed = false;   // A+ P8
    playClip(SPORT_CLIP.idle, { loop: true });
    bench().root.position.set(4.2, 0, CFG.rimZ + 4);
    bench().animator.play(SPORT_CLIP.idle, { loop: true });
    attachBallToHand(ball, active().skeleton, hand('RightHand')); ebState.inLeftHand = hand('RightHand') === 'LeftHand';
    // the camera AND FrameGuard follow whose turn it is — before this, P2's
    // whole game was framed against P1 idling on the bench spot
    ctx.heroRef.current = active().root;
    ctx.camDirector.snapTo(active().root.position, rim);
    // IMPROVE (2026-10-06) #12: the recorder rides whoever has the device — a fresh buffer each hand-off (only this flight is replayed)
    replay?.dispose();
    replay = new DunkReplayRecorder(ctx.scene, active().root, ball, ctx.camera as never, () => (ball.parent ? ball.parent as TransformNode : null));
    { const nodes = active().skeleton.bones.map((b) => b.getTransformNode()).filter((n): n is TransformNode => !!n);
      const hi = nodes.findIndex((n) => /Hips/.test(n.name)); if (hi > 0) nodes.unshift(...nodes.splice(hi, 1));
      replay.setPoseNodes(nodes); }
    SoundKit.play('uiTick', { pitch: 0.9 });
    // IMPROVE (2026-10-06) #5: the deciding dunk carries its number; #9: the first card offers the match length
    const need = duelNeed(duelState(), activeIdx);
    ctx.setHud({
      activePlayer: label(), p1Score: totals[0], p2Score: totals[1],
      dunkNum: dunkNumLine(), style: STYLE_LABEL[style], charge: 0,
      prop: PROP_LABEL[prop],
      hint: firstCard() ? matchLengthHint()
        : `${label()} — take the device${need !== null ? ` · ${needLine(need, MIN_TOTAL, PERFECT_TOTAL)}` : ''}`,
    });
    setBanner(ctx, dunkOffOpens ? `DEAD LEVEL — DUNK-OFF! PASS TO ${label()}` : `PASS TO ${label()}`);
    // THE MIC: who takes the device, once the booth has finished the last dunk's call (the first hand-off comes during the load,
    // before the mic can speak: the welcome calls P1 up instead)
    if (micOpened) mic?.then({ moment: 'duel.pass', tags: [`p:${activeIdx + 1}`], priority: 1 });
    // IMPROVE (2026-10-06) #11: the card hands over to the runway from update() (handoffTick), on the mode's clock
  }
  const matchLengthHint = (): string => `B — MATCH LENGTH: ${dunksEach} DUNKS EACH (2 / 3 / 5) · any other button starts`;
  /** The runway's opening line (with the number on a deciding dunk). */
  function runwayHint(): string {
    const need = duelNeed(duelState(), activeIdx);
    return `${need !== null ? `${needLine(need, MIN_TOTAL, PERFECT_TOTAL)} · ` : ''}STYLE to cycle · X / D-PAD down picks the CAR, BARRIER or CRATE · LOOK stick orbits the camera · HOLD to run — then tap jump`;
  }
  /** IMPROVE (2026-10-06) #11: the hand-off card's own beat — 2.2 s (4 s on the first card, which offers the match length), counted on
   *  phaseSec in update(), so a game paused on "PASS TO P2" stays on the card. */
  function handoffTick(ctx: ModeContext): void {
    if (phase !== 'handoff' || ended || phaseSec < (firstCard() ? HANDOFF_FIRST_SEC : HANDOFF_SEC)) return;
    setBanner(ctx, ''); ctx.setHud({ hint: runwayHint() });
    setPhase('approach');
  }

  /** `cause`: the player's press launched it (RUN let go, A on the run) or the mode did (the line, the watchdog) — core/slamPress. */
  function launchDunk(ctx: ModeContext, cause: LaunchCause = 'auto'): void {
    if (phase === 'cinematic') return;
    setPhase('cinematic');
    clipTime = 0; qteHit = false; qteWindowOpen = false; qteAccuracy = 0; slamPress.clear(); ebState.inLeftHand = hand('RightHand') === 'LeftHand'; rimCamCut = false; hangSlowMoLatch = false; contactLatch = false;
    settleLatch = false; settleArmed = false; setTrail('soft');   // A+ P5/P6: no gather at takeoff, the runway trail stays soft through it
    airHeld = false; dropToFloor = false;   // A+ P8
    launchZ = active().root.position.z; obstacleOver = false; obstacleCleared = false; activeHandOff = null; ikSideK = 0;
    console.info('[JUICE-SOFT] launch');
    console.info(`[DUNK-LAUNCH] charge ${charge.toFixed(2)} run ${runUpPeak.toFixed(1)} apex ${((1.05 + charge * 0.55) * (0.85 + launchSpeed01 * 0.3)).toFixed(2)} from z ${launchZ.toFixed(2)} to line ${gatherLine().toFixed(2)}`);
    ctx.camDirector.resetLook();   // the takeoff → rimCamCut framing never inherits a look orbit
    // IMPROVE (2026-10-06) #8: the run-up buys the air (the contest's budget: a walk-up holds one trick, a real run-up two); #7: the
    // slam meter rises with the flight, the green drawn where the window is
    flight.launch(Math.min(1, charge * 0.5 + launchSpeed01 * 0.5), STYLE_TIER[style]); armedAir = null; airTricks = []; beatCalled = false;
    meterSpan = EASTBAY_TIMING.extend + slamWindowSec() / 2 + 0.16; meter3d?.begin(slamGreen());
    SoundKit.play('whoosh', { pitch: 0.85 });   // the ONE whoosh — never re-triggered on CONTACT
    // THE MIC: nothing from the booth through the flight — the SLAM is the player's (released on the iron, the clank or the prop);
    // the make call is decoded now so it lands on the flush
    mic?.hold(4);
    for (const t of [0, 1, 2] as const) mic?.expect({ moment: 'dunk.make', tier: t, stinger: dunkStingers(duelDunkName()) });
    // Soft-OPEN #2 mirror (see DunkMode.launchDunk): a launch clip that runs out in the air flows into the held hang, not into nothing
    playClip(STYLE_CLIP[style], { speedRatio: 1, onEnd: () => { if (phase === 'cinematic') { console.info('[HANDS] launch → hang'); playAir(SPORT_CLIP.dunkScoreHang, hangRateToResolve()); } } });
    slamEcho.launched(performance.now(), cause);   // HOTFIX (2026-09-24): stamped LAST — a slow first launch must not age a same-frame A's echo
  }

  function resolveDunk(ctx: ModeContext): void {
    if (phase === 'resolve') return;
    setPhase('resolve');
    sinceRelease = 0; qteWindowOpen = false; rimCamCut = false;
    ctx.camDirector.snapTo(active().root.position, rim);
    ctx.setHud({ slamPulse: false });
    if (!slamPress.spent) meter3d?.end(obstacleClipped ? 'brick' : 'late');   // IMPROVE (2026-10-06) #7: the bar ran out with no press (a judged press ended it already)
    releasePos.copyFrom(ball.getAbsolutePosition());
    releaseBall(ball);
    if (!qteHit) { ballSim.launch(releasePos, clankOffRim(ball, rim)); missClank(ctx); setTrail('off'); armSettle(); }   // juice soft #2, #5; A+ P4
    if (!qteHit) dropToFloor = true;   // A+ P8 H5: a miss falls from the release height — feet-down is where the stumble lands
    playAir(qteHit ? SPORT_CLIP.dunkScoreHang : SPORT_CLIP.jumpLand);   // A+ P8 H5: holds its last frame in the air; the land clip is feet-down's
  }

  // ── A+ P8 athlete hands, mirrored from DunkMode (see there for the measurements) ─────────────────────────────────
  /** H1: after the clips evaluate, the ball hand reaches for the rim with the eased weight — the wrist lags the root into the iron. */
  function handIkApply(): void {
    const w = HAND_IK_MAX * handIkT * handIkT * (3 - 2 * handIkT);
    if (!p1 || !p2) return;
    const c = active();
    // BIOMECH-HOOPS-WAVE1: the Posture Poses (thoracic / clavicles / head / hips strip / feet) BEFORE the reach — the wrist
    // solves against the posed shoulders (the contest's order: postureTick → spin → posture → reach)
    { const pdt = (ikScene?.getEngine().getDeltaTime() ?? 16) / 1000;
      const La = postureOf.get(c); if (La) La.step(pdt, activeFeed());
      // IMPROVE (2026-10-06) #16: the bench body stands in one spot in the idle loop — its stance and its feed are eased at ~15 Hz.
      // The bone write still runs every frame: the idle clip re-poses the bones each frame, so a skipped write would show the raw
      // clip through the posture on three frames of four (a 15 Hz flicker), not save anything worth that.
      const b = c === p1 ? p2 : p1, Lb = postureOf.get(b);
      if (Lb) {
        benchAcc += pdt;
        if (benchAcc >= BENCH_TICK_SEC) { Lb.tick(benchAcc, benchFeed(b)); benchAcc = 0; }
        Lb.apply(pdt, benchFeedObj.aim, benchFeedObj.eyes, 0);
      } }
    if (w > 0.001) {
      let arms = armsOf.get(c);
      if (!arms) { arms = { Left: armChain(c.skeleton, 'Left'), Right: armChain(c.skeleton, 'Right') }; armsOf.set(c, arms); }
      c.root.computeWorldMatrix(true);
      handIkTarget.set(rim.x, rim.y + HAND_IK_RIM_UP, rim.z);
      // DUNK-CONTROL-JUICE: the reach crossfades between the arms across the eastbay hand-off (an arm swap on one frame threw the ball)
      for (const side of ['Right', 'Left'] as const) {
        const ws = w * (side === 'Left' ? ikSideK : 1 - ikSideK);
        const arm = arms[side]; if (!arm || ws <= 0.001) continue;
        handIkPole.set(side === 'Left' ? -0.7 : 0.7, -0.2, -0.5).applyRotationQuaternionInPlace(c.root.absoluteRotationQuaternion);
        // DUNK-SOFTS-NAMED: the weight lives in the TARGET, not in a rotation slerp — the hand is solved at full weight toward
        // the point `ws` of the way from the clip's hand to the rim, the elbow's twist capped in proportion (shapeReach). The
        // old partial-weight slerp flipped the arm 60° in one frame whenever the mocap wind-up put the hand behind the
        // shoulder (aim / pole deltas near ±180°: hand 3.40 → 2.92 m in 17 ms, POWER only); the pull it gave is kept.
        arm.shoulder.computeWorldMatrix(true); arm.elbow.computeWorldMatrix(true); arm.hand.computeWorldMatrix(true);
        const sh = arm.shoulder.getAbsolutePosition(), el = arm.elbow.getAbsolutePosition(), hd = arm.hand.getAbsolutePosition();
        // IMPROVE (2026-10-06) #20: the point `ws` of the way to the rim, in one scratch vector (it was three new vectors per arm per frame)
        const want = _want.copyFrom(handIkTarget).subtractInPlace(hd).scaleInPlace(ws).addInPlace(hd);
        const shaped = shapeReach(sh, el, hd, want, handIkPole, undefined, REACH_POLE_CAP * ws);
        reachArm(arm, shaped.target, shaped.pole, 1);
      }
    }
    if (activeHandOff && phase === 'cinematic' && !cutting) runHandOffPath(ball, c.skeleton, activeHandOff.t, activeHandOff.spec, ebState);   // the ball after the reach, this frame's hands
  }
  /** H5: every active-player clip goes through here — a superseded clip's onEnd chain is dead (Babylon raises it on stop()). */
  function playClip(name: string, opts: PlayOpts = {}): AnimationGroup | null {
    const token = ++clipToken;
    loopClip = opts.loop ? name : null;   // IMPROVE (2026-10-06) #19: what the runway's per-frame pick compares against
    if (opts.loop) return active().animator.play(name, opts);
    return active().animator.play(name, { ...opts, onEnd: () => {
      if (token !== clipToken) return;
      if (opts.onEnd) opts.onEnd(); else active().animator.play(SPORT_CLIP.idle, { loop: true });
    } });
  }
  /** H5: the aerial clip — ends on its own in the air → holds its last frame; feet-down plays the land clip. */
  function playAir(name: string, speedRatio = 1): void {
    airHeld = true;
    playClip(name, { speedRatio, onEnd: () => { if (active().root.position.y > 0.05) console.info(`[HANDS] hold ${name}`); else landNow(); } });
  }
  /** The hang paced to last until the resolve — the 0.35 s takeoff's 0.8 s hang ran out 0.24 s before the finish (12 clip-less frames). */
  function hangRateToResolve(): number {
    const left = Math.max(0.3, EASTBAY_TIMING.extend + CFG.qteWindowSec / 2 + 0.05 - clipTime);
    const hang = active().animator.durationOf(SPORT_CLIP.dunkScoreHang) ?? 0.8;
    return Math.max(0.35, Math.min(1, hang / left));
  }
  /** H5: feet-down — the land crouch, then the idle loop. Once per attempt. */
  function landNow(): void {
    if (!airHeld) return;
    airHeld = false; landed = true;
    console.info('[HANDS] land dunk_land_crouch');
    playClip(SPORT_CLIP.dunkLandCrouch, { onEnd: () => { landed = false; playClip(SPORT_CLIP.idle, { loop: true }); } });
  }

  // ── IMPROVE (2026-10-06) #8: MID-AIR TRICKS (the contest's flight.recognizer / fireTrick, trimmed to the duel) ─────────────────
  /** A trick button in the air (B / Y / X — A is the slam): the d-pad direction held picks the trick; the cue table decides when. */
  function airTrickPress(ctx: ModeContext, e: FelInput): void {
    if (obstacleClipped || slamPress.spent) return;   // the dunk is dead, or the slam is already thrown
    const trick = flight.peek(e);
    if (!trick || flight.recognizer.dirSpent) return;   // a bare button, or a direction that already threw its trick
    // the whole-body turns (360 / 720) need the contest's spin layer (rim-facing by the carry-up) — not in the duel yet
    if (cueOf(trick).facing === 'spinThrough') { refuse(ctx, `NO ${trick.label} IN THE DUEL — TRY ${FLASHY_EXAMPLE}`); return; }
    if (clipTime >= EASTBAY_TIMING.extend - slamWindowSec() / 2) { refuse(ctx, 'TOO LATE FOR A TRICK — THE JAM IS ON YOU'); return; }
    const v = cueVerdict(trick, clipTime);
    if (v === 'early') {
      if (armedAir) return;   // one armed at a time — the first press is the one that fires
      armedAir = trick;
      ctx.juice.callout(`${trick.label} ARMED · ${CUE_BEAT_LABEL[cueOf(trick).fire]}`, '#ffd75e', 600);
      SoundKit.play('uiTick', { pitch: 1.4, volume: 0.3 });
      return;
    }
    if (v === 'late') { refuse(ctx, `TOO LATE FOR THE ${trick.label} — ARM IT BY ${CUE_BEAT_LABEL[cueOf(trick).last]}`); return; }
    fireTrick(ctx, trick);
  }
  /** The trick fires: the air budget pays for it (or says why not), its body plays paced to land its finish on the slam's beat, and
   *  the hang takes over when it ends in the air. Its difficulty is judged (finishAttempt) and its tax tightens the slam window. */
  function fireTrick(ctx: ModeContext, trick: DunkTrick): void {
    if (!flight.take(trick)) {
      refuse(ctx, flight.refusal === 'limit' ? 'TWO TRICKS A FLIGHT — SLAM IT' : 'NOT ENOUGH AIR — come in faster');
      return;
    }
    flight.recognizer.spend();   // one direction, one trick
    airTricks.push(trick);
    const ready = active().animator.durationOf(trick.clip) ?? 0.8, left = EASTBAY_TIMING.extend - 0.04 - clipTime;
    const rate = left <= 0.25 ? TRICK_RATE_MAX : Math.max(TRICK_RATE_MIN, Math.min(TRICK_RATE_MAX, ready / left));
    console.info(`[DUEL-TRICK] air ${trick.id} @${clipTime.toFixed(2)} x${rate.toFixed(2)}`);
    playClip(trick.clip, { speedRatio: rate, onEnd: () => { if (phase === 'cinematic') playAir(SPORT_CLIP.dunkScoreHang, hangRateToResolve()); } });
    SoundKit.play('whoosh', { pitch: 1.1 + trick.difficulty * 0.08, volume: 0.45 });
    mic?.crowd('crowd.ooh', airTricks.length);   // the stands gasp at the trick (the booth holds through the flight)
    EffectsKit.burst(ctx.scene, active().root.position.add(new Vector3(0, 1.8, 0)), 'sparks');
    ctx.juice.callout(airTricks.length > 1 ? `COMBO: ${airTricks.map((t) => t.label).join(' → ')}!` : `${trick.label}!`, '#ffd75e', 700);
    ctx.camDirector.pulse(airTricks.length > 1 ? 0.7 : 0.45, 0.5);
    if (meter3d) meter3d.green(slamGreen());   // the window just narrowed: the bar's green says so
  }

  /** The chair caught the dunker mid-flight — the dunk DIES here, whatever
   *  the slam timing was going to be. Same physics as Dunk Contest's prop. */
  function clipBlown(ctx: ModeContext): void {
    toppling = true; obstacle?.hit();
    SoundKit.play('impact', { pitch: 0.6, volume: 0.6 }); console.info('[JUICE-SFX] impact chair');   // the prop is the miss's one hit (missClank skips)
    SoundKit.play('crowdGroan', { volume: 0.7 });
    ctx.feel?.impact?.(0.6);
    setBanner(ctx, `${label()} CAUGHT THE ${obstacle?.spec.label ?? 'PROP'} — BLOWN`, 1.2);   // IMPROVE (2026-10-06) #11: the one banner channel
    // THE MIC: the dunk is dead here (no SLAM left to hear), so the booth calls it now — the clank path's 1.2 s is its window
    mic?.release();
    mic?.say({ moment: 'dunk.miss.prop', priority: 2, side: 0.15, crowd: { moment: Math.random() < 0.5 ? 'crowd.groan' : 'crowd.heckle', n: 1 } });
    resolveDunk(ctx); // qteHit false → the clank path; a blown dunk judges at 0
  }


  /** CONTACT (PM brief VENICE-JUICE-P0, 2026-09-06): console juice on the make's flush frame — one hit-stop, one shake,
   *  one white-gold flash, one rim thud — latched once per attempt so judge cards and FIFTY bursts never re-fire it.
   *  Never a second slow-mo: the hang already spent it at rise. Miss path: nothing here (the clank stays honest). */
  // ── Venice juice soft #2–#5 (PM brief VENICE-JUICE-SOFT, 2026-09-06) ─────────────────────────────────────────────
  /** #2 miss clank weight: a light metallic hit and a small feel impact on the clank — never the make's contactPunch. */
  function missClank(ctx: ModeContext): void {
    if (obstacleClipped) { console.info('[JUICE-SFX] clank skipped — the chair thud was the one hit'); return; }   // A+ P2: one hit per miss
    ctx.feel.impact(0.4);
    ctx.momentum.report({ kind: 'miss' });   // the duel's meter cools on a clank, the way the contest's does
    SoundKit.play('impact', { pitch: 1.35, volume: 0.45 });
    console.info('[JUICE-SOFT] miss clank'); console.info('[JUICE-SFX] impact clank');
  }
  /** #3 land settle: a micro shake (amp 0.05) and dust at the feet, once per attempt; the miss keeps its one-breath retry. */
  /** A+ P4: armed at CONTACT (make) or at the clank (miss); fires from update() once the body is back on the floor. */
  function armSettle(): void { settleArmed = true; settleArmAt = performance.now(); }
  function settleTick(ctx: ModeContext): void {
    if (!settleArmed) return;
    const since = performance.now() - settleArmAt;
    // feet-down (root back on the floor) or, failing that, the land clip's plant beat ~0.45 s after the hit — never the hit frame
    if (since < 220 || (active().root.position.y > 0.05 && since < 450)) return;
    settleArmed = false; landSettle(ctx);
  }
  function landSettle(ctx: ModeContext): void {
    if (settleLatch) return;
    settleLatch = true;
    fovRelease();   // A+ P5: a miss restores the fov at the land
    ctx.juice.shake(0.05, 110);
    EffectsKit.burst(ctx.scene, active().root.position.clone(), 'dust');
    console.info('[JUICE-SOFT] land settle');
  }
  /** #4 FOV gather: the active camera's fov eases −10% over the gather into the hang and back on CONTACT or land. Only
   *  the fov moves — rimCamCut, the hang target locks and the follow distance beat are untouched. */
  function fovGather(ctx: ModeContext): void {
    const cam = ctx.scene.activeCamera; if (!cam) return;
    if (fovCam !== cam) { fovCam = cam; fovBase = cam.fov; fovT = 0; }
    fovOn = true;
    console.info('[JUICE-SOFT] fov gather');
  }
  function fovRelease(): void { if (fovOn) console.info('[JUICE-SOFT] fov release'); fovOn = false; }
  function fovTick(dt: number): void {
    if (!fovCam) return;
    const target = fovOn ? 1 : 0; const rate = dt / (fovOn ? 0.35 : 0.25);
    fovT = fovT < target ? Math.min(target, fovT + rate) : Math.max(target, fovT - rate);
    const k = fovT * fovT * (3 - 2 * fovT);
    fovCam.fov = fovBase * (1 - 0.10 * k);
    if (!fovOn && fovT === 0) { fovCam.fov = fovBase; fovCam = null; }
  }
  /** #5 trail ramp: soft on the runway, bright in the hang, a white flash cut on the make, dead on a miss or a clipped air. */
  function setTrail(level: 'soft' | 'hang' | 'off'): void {
    if (!trail) return;
    console.info(`[JUICE-SOFT] trail ${level}`);
    if (level === 'off') { trail.emitRate = 0; return; }
    const hang = level === 'hang'; const c = Color3.FromHexString('#ffb36b');
    trail.emitRate = hang ? 170 : 45; trail.maxSize = hang ? 0.2 : 0.1; trail.minSize = hang ? 0.07 : 0.04;
    trail.color1 = new Color4(c.r, c.g, c.b, hang ? 0.95 : 0.5);
  }
  function trailFlash(): void {
    if (!trail) return;
    console.info('[JUICE-SOFT] trail flash');
    trail.color1 = new Color4(1, 1, 1, 1); trail.emitRate = 260; trail.maxSize = 0.3;
    after(0.13, () => { if (trail) trail.emitRate = 0; });   // IMPROVE (2026-10-06) #11 #13: on the mode's clock
  }

  function contactPunch(ctx: ModeContext): void {
    if (contactLatch) return;
    contactLatch = true;
    ctx.juice.hitStop(70, { gameplay: true });   // HOTFIX (2026-09-24): paired with the gameplay freeze below — reduced motion keeps both 70 ms (the dunk's contact, mirrored)
    feelHitStop(70);   // DUNK-HANDS-RIM H3 (dunk mirror): the mode's clock stops on the iron too — one composed beat, no second slow-mo
    ctx.juice.shake(0.12, 140);
    ctx.juice.flash('#fff6dd', 120);
    SoundKit.play('impact', { pitch: 0.7, volume: 0.8 }); console.info('[JUICE-SFX] impact slam');   // A+ P2: the ONE slam thud of the attempt
    fovRelease(); trailFlash();   // juice soft #4, #5
    armSettle();                  // A+ P4: the settle fires at feet-down, not on this frame
    hoopJuice?.punch();           // juice LOOK #1–#3 (make only)
    contactAt = performance.now() / 1000;   // IMPROVE (2026-10-06) #12: the iron, on the recorder's clock — the triple cut centres on it
  }

  function finishAttempt(ctx: ModeContext, made: boolean): void {
    if (finishing) return;
    finishing = true;
    let dunkTotal = 0;
    let scores: JudgeScore[] = [];
    let isRepeat = false;
    if (made) {
      // VARIETY MEMORY — the judges remember what THIS player has thrown.
      // Repeating your own combo costs you; the other player's dunks are not
      // your burden (answering a dunk with the same dunk is a legit duel
      // play — execution decides it).
      // IMPROVE (2026-10-06) #8: the air tricks thrown are part of the combo (a tomahawk over the car is not a plain one)
      const combo = `${style}_${prop}` + airTricks.map((t) => `+${t.id}`).join('');
      isRepeat = usedCombos[activeIdx].has(combo);
      usedCombos[activeIdx].add(combo);
      const varietyMod = isRepeat ? 0.8 : 1;
      const varietyBonus = isRepeat ? 0 : 0.5;
      // NB: no standalone banner here — the score banner below would clobber
      // it in the same tick (measured: the repeat note never survived a
      // frame). The repeat is named IN the result banner instead.
      // The run-up is judged too (the real panel reads the runway attack),
      // and the chair pays its bonus — but only cleared, never clipped.
      // IMPROVE (2026-10-06) #3 (TUNED): FLASHY's tier is paid for flash — an air trick — and a FLASHY with none is judged at POWER's
      // (dunkDuelRules.styleTierFor); #8: each trick thrown adds its own difficulty, as in the contest
      const tier = styleTierFor(style, airTricks.length, STYLE_TIER);
      const airDifficulty = airTricks.reduce((sum, t) => sum + t.difficulty, 0);
      const difficulty = Math.max(0, Math.min(10,
        (tier + PROP_BONUS[prop] + charge * 2 + launchSpeed01 * 1.0 + varietyBonus + airDifficulty) * varietyMod));
      const execution = Math.max(0, Math.min(10, qteAccuracy * 10));
      const styleScore = Math.max(0, Math.min(10, tier * 0.8));
      scores = judgeDunk(difficulty, execution, styleScore);
      dunkTotal = scores.reduce((s, j) => s + j.score, 0);
      if (!inDunkOff) totals[activeIdx] += dunkTotal;   // IMPROVE (2026-10-06) #4: a dunk-off dunk decides the duel, never the totals
      SoundKit.play('score', { pitch: 1.1 });
      EffectsKit.burst(ctx.scene, rim, 'net');
      // the contest's eruption band (45 of 50): this was `>= 27`, the THREE-judge band, and five judges never card under 30 —
      // every make got the full cheer and confetti, so a 31 landed like a 50
      if (dunkTotal >= BAND_TOTAL.eruption) { SoundKit.play('crowdCheer'); EffectsKit.burst(ctx.scene, active().root.position.add(new Vector3(0, 1.8, 0)), 'confetti'); }
    } else {
      after(0.26, () => SoundKit.play('crowdGroan', { volume: 0.35 }));   // A+ P2: the clank was the one hit; the crowd groans a breath later, quietly (IMPROVE 2026-10-06 #11: on the mode's clock)
    }
    lastDunk = dunkTotal;
    if (made) dropToFloor = true; else landNow();   // A+ P8 H5: a make lets go of the iron and falls to feet-down; a miss has normally landed already
    // IMPROVE (2026-10-06) #6: THE VERDICT IS STAGED, the contest's way. The five cards and the total used to land in one setHud the
    // frame the ball went through. A make now plays its replay (#12), then the judges confer, card by card, Prime last on the drum,
    // then the number — the banner and the scoreboard move on that beat. A miss is said at once.
    const tricks = airTricks.length ? `${airTricks.map((t) => t.label).join(' → ')} · ` : '';
    verdictBanner = made
      ? (isRepeat ? `${tricks}${label()} SCORES ${dunkTotal} — JUDGES HAVE SEEN THAT ONE` : `${tricks}${label()} SCORES ${dunkTotal}`)
      : '';
    if (!made) { ctx.setHud({ p1Score: totals[0], p2Score: totals[1], judgeReveal: null }); setBanner(ctx, `${label()} — MISSED, 0 pts`); }
    // THE MIC: the booth may speak again (the iron, or the clank) — the make with its name (its number waits for the total), or the
    // miss (a clipped prop was called when it happened)
    mic?.release();
    if (made) micMake(dunkTotal, isRepeat);
    else if (!obstacleClipped) mic?.say({ moment: 'dunk.miss', priority: 2, side: 0.15, crowd: { moment: Math.random() < 0.5 ? 'crowd.groan' : 'crowd.heckle', n: 1 } });
    setPhase('judging');
    // IMPROVE (2026-10-06) #11: the advance is counted in update() (judgeHold), on the mode's clock — it was a 2.6 / 1.4 s setTimeout
    // that ran on through a pause and, after an unmount, called advance() on disposed bodies (#13)
    if (made) { revealScores = scores; void makeShow(ctx); } else judgeHold = MISS_BEAT_SEC;
  }

  /** IMPROVE (2026-10-06) #12: THE MAKE, REPLAYED. "No replay in the duel" — so the player holding the device next only ever saw the
   *  other's dunk from the follow camera. The make plays the contest's triple cut out of the recorded pose (under the rim, on the
   *  iron, from the stands; the ball in the hand it rode), skippable with A / B, a tap or Space, and frozen while the game is
   *  paused — then the judges' reveal (#6). A fuller version would add the contest's poster freeze for a big one. */
  async function makeShow(ctx: ModeContext): Promise<void> {
    const gen = modeGen, rec = replay;
    const paused = (): boolean => typeof ctx.phase === 'function' && ctx.phase() === 'paused';
    if (rec) {
      cutting = true; ctx.camDirector.suspended = true;
      const cutDone = rec.playCuts(rim, contactAt, TRIPLE_CUT, {
        onCut: (i, c) => { ctx.setHud({ hint: `REPLAY ${i + 1}/${TRIPLE_CUT.length} · ${c.label} — A skips` }); if (i > 0) SoundKit.play('whoosh', { pitch: 1.6 + i * 0.2, volume: 0.25 }); },
        paused,
      });
      await Promise.race([cutDone, pausableDelay(tripleCutSec() * 1000 + 1200, paused)]);   // the net does not run through a pause
      if (gen !== modeGen) return;   // left mid-replay: nothing below may touch the disposed scene (#13)
      rec.stop(); cutting = false; ctx.camDirector.suspended = false;
      ctx.setHud({ hint: '' });
      dropToFloor = true;   // the cut hands the root back where it was at the iron — the fall to feet-down resumes from there
    }
    if (phase !== 'judging' || ended) return;
    revealed = []; reveal.start(revealScores); revealOn = true;
    ctx.setHud({ judgeReveal: [] });
  }
  /** IMPROVE (2026-10-06) #6: the reveal's beats (DunkMode's, trimmed to the duel): confer → each card → the drum → the total, then
   *  REVEAL_TAIL_SEC to read the number before the device is passed. */
  function revealTick(ctx: ModeContext, dt: number): void {
    for (const beat of reveal.update(dt)) {
      if (beat.kind === 'confer') {
        ctx.setHud({ hint: 'THE JUDGES CONFER…' });
        SoundKit.play('uiTick', { pitch: 0.7, volume: 0.3 });
      } else if (beat.kind === 'card' && beat.judge) {
        revealed = [...revealed, beat.judge];
        ctx.setHud({ judgeReveal: revealed });
        SoundKit.play('uiTick', { pitch: 1 + beat.judge.score * 0.06, volume: 0.5 });
      } else if (beat.kind === 'drum') {
        ctx.setHud({ hint: "PRIME'S CARD…" });
        SoundKit.play('uiTick', { pitch: 0.9, volume: 0.4 });
      } else if (beat.kind === 'total') {
        ctx.setHud({ hint: '', p1Score: totals[0], p2Score: totals[1] });
        setBanner(ctx, verdictBanner);
        micNumber(beat.total ?? 0);
        ctx.camDirector.pulse(beat.band === 'eruption' ? 1 : beat.band === 'hush' ? 0.15 : 0.4, 0.6);
      }
    }
    if (revealOn && !reveal.active) { revealOn = false; judgeHold = REVEAL_TAIL_SEC; }
  }

  function advance(ctx: ModeContext): void {
    if (phase !== 'judging' || ended) return;
    if (inDunkOff) offScores[activeIdx].push(lastDunk); else attemptNum[activeIdx]++;
    // IMPROVE (2026-10-06) #4 #9: the pure rules say who is next — the match length, then a dunk-off on a level total
    const next = duelNext(duelState());
    if (next.kind === 'over') {
      setPhase('matchOver');
      ended = true;
      SoundKit.play('whistle');
      const tie = next.winner === null;
      const winner = next.winner === 1 ? 'P2' : 'P1';
      if (!tie) { SoundKit.play('crowdCheer'); EffectsKit.burst(ctx.scene, rim, 'confetti'); }
      setBanner(ctx, tie ? (next.byDunkOff ? 'DEAD HEAT — EVEN THE DUNK-OFF!' : 'DEAD HEAT!') : next.byDunkOff ? `${winner} TAKES THE DUNK-OFF!` : `${winner} TAKES THE DUEL!`);
      // THE MIC: the result, before ctx.end parks the mode (the voice plays on after it)
      mic?.hush();
      mic?.say(tie
        ? { moment: 'duel.tie', priority: 3, crowd: { moment: 'crowd.ooh', n: 2 } }
        : { moment: 'duel.win', tags: [winner === 'P1' ? 'p:1' : 'p:2'], priority: 3, crowd: { moment: 'crowd.erupt', n: 3 } });
      // IMPROVE (2026-10-06) #9: the server bounds a duel at DUNKS_EACH dunks (lib/sessions/modeScoreRules) — a longer match reports
      // its totals at that scale (dunkDuelRules.reportedScore); the default length reports them unchanged
      const s1 = reportedScore(totals[0], dunksEach, DUNKS_EACH), s2 = reportedScore(totals[1], dunksEach, DUNKS_EACH);
      ctx.end(tie ? 'DUEL_TIED' : `${winner}_WINS`, Math.max(s1, s2), { p1: s1, p2: s2, p1Total: totals[0], p2Total: totals[1], dunksEach, dunkOffRounds: offScores[1].length });
      return;
    }
    // alternate: whoever has fewer attempts goes next (dunkDuelRules.duelNext)
    const opens = next.dunkOff && !inDunkOff;
    inDunkOff = next.dunkOff;
    activeIdx = next.idx;
    enterHandoff(ctx, opens);
  }

  // ── THE MIC ──────────────────────────────────────────────────────────────────────────────────────────────────────
  /** Every frame: the mic's clock, the welcome on the first live frame, and filler only while the runway waits on a player. */
  function micTick(ctx: ModeContext): void {
    if (!mic) return;
    mic.update();
    if (!micOpened && ctx.phase() === 'playing') {
      micOpened = true;
      // the welcome, then P1 is up (a runner already on the way skips it: the booth never talks over the run-up to a flight)
      if (phase === 'handoff' || phase === 'approach') {
        mic.say({ moment: 'intro.court', priority: 2, crowd: { moment: 'crowd.hype', n: 2 } });
        mic.then({ moment: 'duel.pass', tags: [`p:${activeIdx + 1}`], priority: 1 });
      }
    }
    const quiet = (phase === 'handoff' || phase === 'approach') && ctx.phase() === 'playing' && !ended;
    if (quiet !== micFiller) {
      micFiller = quiet;
      mic.setFiller(quiet ? ['filler.banter', 'filler.crowd'] : null);
      mic.setCrowdIdle(quiet ? 'crowd.idle' : null);
    }
  }
  /** The name the MC calls. The duel shows only the style, which is no dunk's name, so the style is named by what the body does:
   *  SIGNATURE flies the contest's eastbay clip; POWER and FLASHY fly the owner's two-foot capture, called the contest's way
   *  (a clean slam is a hammer). */
  function duelDunkName(): string {
    if (airTricks.length) return airTricks.map((t) => t.label).join(' → ');   // IMPROVE (2026-10-06) #8: the tricks name the dunk
    if (style === 'sig') return 'EASTBAY';
    return qteAccuracy >= 0.85 ? 'TWO-HAND HAMMER' : style === 'power' ? 'POWER SLAM' : 'TWO-HAND FLUSH';
  }
  /** The make, called: the MC's line and the dunk's name (the size from the panel's raw sum, the contest's bands). IMPROVE
   *  (2026-10-06) #6: the number waits for the total's beat (micNumber) — the cards are staged now, so the read follows them. */
  function micMake(total: number, isRepeat: boolean): void {
    if (!mic) return;
    const tier = total >= BAND_TOTAL.eruption ? 2 : total >= BAND_TOTAL.approval ? 1 : 0;
    if (isRepeat) mic.say({ moment: 'dunk.repeat', priority: 2, crowd: { moment: 'crowd.cheer', n: 1 } });
    else mic.say({ moment: 'dunk.make', tier, stinger: dunkStingers(duelDunkName()), side: tier === 2 ? 0.4 : 0, crowd: { moment: tier === 2 ? 'crowd.erupt' : 'crowd.cheer', n: tier + 1 } });
  }
  /** The number, on the total's beat; a fifty gets its own. */
  function micNumber(total: number): void {
    if (!mic) return;
    if (total >= 50) mic.say({ moment: 'dunk.fifty', priority: 3, side: 0.6, crowd: { moment: 'crowd.erupt', n: 3 } });
    else mic.say({ moment: 'stinger', stinger: [`num:${total}`], priority: 3 });
  }

  function watchdog(ctx: ModeContext): void {
    if (phaseSec <= BUDGET_SEC[phase] || finishing || ended) return;
    console.warn(`[FEL-DUNK] duel watchdog tripped in "${phase}" — auto-advancing`);
    switch (phase) {
      case 'handoff': setBanner(ctx, ''); setPhase('approach'); break;
      case 'approach': active().root.position.set(0, 0, gatherLine()); phaseSec = 0; break;
      case 'charge': launchDunk(ctx); break;
      case 'cinematic': resolveDunk(ctx); break;
      case 'resolve': finishAttempt(ctx, qteHit); break;
      case 'judging': ctx.setHud({ judgeReveal: null }); setBanner(ctx, ''); advance(ctx); break;
    }
  }

  const def: ModeDefinition = {
    modeId: 'dunkduel', mood: 'goldenHour', camPreset: 'court',
    body: DUNK_BODY,
    onBody(ctx: ModeContext, ev: BodyEvent, _view: BodyView): boolean {
      if (phase !== 'approach' && phase !== 'charge' && phase !== 'cinematic') return false;
      const act = dunkBody.see(ev);
      for (const e of act.now) def.onInput(ctx, e);
      if (act.slamClip !== null) bodySlamClip = act.slamClip;
      return act.took;
    },

    async load(ctx: ModeContext) {
      // ship pass 4: the venue spec (with its baked map) first; the kit venue only if no spec
      modeVenue = mountVenue(ctx, 'basketball_dunk', { keepGameplayCamera: true, location: ctx.location });
      if (!modeVenue) VenueKit.buildCourt(ctx.scene);
      applyOceanCourt(ctx.scene, 'venice');
      p1 = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, 0, CFG.startZ), yawRad: Math.PI, startClip: SPORT_CLIP.idle,
      });
      neverBindPose(p1.animator, SPORT_CLIP.idle);
      installSafePlay(p1.animator, 'dunkduel-p1');
      ctx.groundLock?.track(p1.root, p1.skeleton);
      p2 = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(4.2, 0, CFG.rimZ + 4), startClip: SPORT_CLIP.idle,
      });
      neverBindPose(p2.animator, SPORT_CLIP.idle);
      installSafePlay(p2.animator, 'dunkduel-p2');
      ctx.groundLock?.track(p2.root, p2.skeleton);
      // IMPROVE (2026-10-06) #1: both duellists spawned from the one hero with no tint — two identical bodies. P2 wears P2's pink
      // jersey (the 1v1 rival's tint, the bezel's P2 colour); P1 keeps the hero's own kit.
      tintGarmentSlot(p2, SLOT_KEYS.jersey, P_HEX[1]);
      // IMPROVE (2026-10-06) #2: a ring per duellist in that player's colour (P1 cyan, P2 pink) — the harness's one ring followed whoever
      // had the device and was rebuilt in the device owner's colour every hand-off. Mounted here, the harness stands aside.
      for (const r of rings) r.dispose();
      rings = [mountPlayerRing(ctx.scene, p1.root, { color: P_HEX[0], icon: readPlayerIcon() }), mountPlayerRing(ctx.scene, p2.root, { color: P_HEX[1], icon: 'basketball' })];
      if (RIGHT_HANDED) for (const c of [p1, p2]) {   // DUNK MOTION phase 11: both duellists right-handed
        const groups = (c.animator as unknown as { groups: Map<string, AnimationGroup> }).groups;
        const done = mirrorGroupsInPlace([...groups.values()].filter((g) => g.name.startsWith('dunk_')), c.skeleton);
        console.info(`[DUNK-HAND] duel body right-handed: ${done.length} dunk clips mirrored`);
      }
      if (ikScene && handIkObs) ikScene.onAfterAnimationsObservable.remove(handIkObs);   // A+ P8 H1: the reach, after the clips
      ikScene = ctx.scene; handIkObs = ctx.scene.onAfterAnimationsObservable.add(handIkApply);
      // HOOPS MOTION phase 3c (plan §3: "hingeArmApply is the last writer on every hoops body, and on Dunk Duel"): after the reach — the
      // elbow bends about its hinge, the forearm's twist no faster than a forearm turns (the contest's phase-9 layer; the duel had none)
      for (const h of hinges) h.dispose();
      hinges = [p1, p2].map((c) => mountMotionLayers({ scene: ctx.scene, skeleton: c.skeleton, root: c.root, drag: false, lean: false }));
      // BIOMECH-HOOPS-WAVE1: one Posture Poses layer per body; the layer owns the eyes (the secondary head-look stands down)
      postureOf.set(p1, new PostureLayer(p1.skeleton, p1.root, 'DUEL-PP-P1')); postureOf.set(p2, new PostureLayer(p2.skeleton, p2.root, 'DUEL-PP-P2'));
      p1.secondary?.setLookTarget(() => null); p2.secondary?.setLookTarget(() => null);
      if (process.env.NODE_ENV === 'development') { const dev = (window as unknown as { __FEL_DEV__?: { hoopsPosture?: unknown; dunkPosture?: unknown } }).__FEL_DEV__; if (dev) { const h = { me: () => postureOf.get(active())?.get() ?? null, bench: () => postureOf.get(bench())?.get() ?? null, foe: () => postureOf.get(bench())?.get() ?? null, get: () => postureOf.get(active())?.get() ?? null }; dev.hoopsPosture = h; dev.dunkPosture = h; } }

      ball = MeshBuilder.CreateSphere('duel_ball', { diameter: 0.24 }, ctx.scene);
      ballSim = new BallSim(ball, 0.12);
      void dressBall(ball, 'basketball');   // IMPROVE (2026-10-06) #10: the Meshy ball skin rides the physics sphere, as in the other four hoops modes
      meter3d?.dispose(); meter3d = mountShotMeter3D(ctx.scene);   // IMPROVE (2026-10-06) #7: the contest's slam meter
      ctx.heroRef.current = active().root;
      ctx.objectiveRef.current = rim;
      SoundKit.startAmbient('stadium');
      ambient?.dispose(); ambient = EffectsKit.ambient(ctx.scene, 'venice');   // IMPROVE (2026-10-06) #14: kept, so dispose() takes the gulls
      trail?.dispose(); trail = EffectsKit.ballTrail(ctx.scene, ball); setTrail('soft');
      hoopJuice?.dispose(); hoopJuice = new HoopJuice(ctx.scene, rim);
      mic?.dispose(); mic = new ModeMic(ctx, { groups: ['dunk', 'names'], court: ctx.location }); micOpened = false; micFiller = false;   // THE MIC
      if (process.env.NODE_ENV === 'development') { const dev = (window as unknown as { __FEL_DEV__?: { hoopJuiceUsed?: unknown } }).__FEL_DEV__; if (dev) dev.hoopJuiceUsed = hoopJuice.used; }   // OOM-HYGIENE: the handle is gone once the harness is disposed (a load that resolves after an unmount)
      // Court locations (docs/SPEC-COURT-LOCATIONS.md): the Venice look (golden sky, surround palms) is Venice's own —
      // under any other location the location's environment stands, so the pass steps aside.
      if (!ctx.location || ctx.location === 'venice') await applyVeniceDunkLookPass(ctx.scene);

      activeIdx = 0; attemptNum = [0, 0]; totals = [0, 0]; ended = false; finishing = false;
      dunksEach = DUNKS_EACH; offScores = [[], []]; inDunkOff = false; lastDunk = 0; cutting = false; revealOn = false; judgeHold = -1;   // IMPROVE (2026-10-06)
      later.length = 0; modeClock = 0; bannerUntil = 0;
      enterHandoff(ctx);
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      slamEcho.see();   // HOTFIX (2026-09-24): a new input — first, before anything in here can launch
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }
      if (e.t === 'stick' && e.side === 'R') { lookX = e.x; lookY = e.y; if (!lookSeen && (Math.abs(e.x) > 0.12 || Math.abs(e.y) > 0.12)) { lookSeen = true; console.info('[LOOK] R stick live'); } }
      // IMPROVE (2026-10-06) #12: A or B during the replay cuts it (a tap / Space already did — a pad or a phone could only sit through it)
      if (cutting && e.t === 'button' && e.pressed && (e.btn === 'A' || e.btn === 'B')) { replay?.stop(); console.info('[DUEL-SHOW] triple cut skipped on the pad'); return; }
      // IMPROVE (2026-10-06) #9: the FIRST card offers the match length — B steps 2 → 3 → 5 dunks each (and gives the card its time again)
      if (phase === 'handoff' && firstCard() && e.t === 'button' && e.btn === 'B' && e.pressed) {
        dunksEach = nextMatchLength(dunksEach); phaseSec = 0;
        ctx.setHud({ dunkNum: dunkNumLine(), hint: matchLengthHint() });
        SoundKit.play('uiTick', { pitch: 1.1 });
        return;
      }
      if (phase === 'handoff' && e.t === 'button' && e.pressed) {
        // any button skips the handoff card
        setBanner(ctx, ''); ctx.setHud({ hint: runwayHint() });
        setPhase('approach');
        return;
      }
      if (e.t === 'button' && e.btn === 'B' && e.pressed && phase === 'approach') {
        style = STYLES[(STYLES.indexOf(style) + 1) % STYLES.length];
        // IMPROVE (2026-10-06) #3: FLASHY says what it asks for — an air trick, or it is judged as POWER
        ctx.setHud({ style: STYLE_LABEL[style], ...(style === 'flashy' ? { hint: `FLASHY — throw a trick in the air (${FLASHY_EXAMPLE}) or the judges see a POWER dunk` } : {}) });
        SoundKit.play('uiTick');
      }
      // THE CHAIR — d-pad (keyboard/couch) or X (touch/Controller Link: the
      // pad's d-pad IS the movement stick there, so the prop needed a face
      // button) arms/clears it during the approach. Both players get the
      // identical option, so the duel stays the identical test.
      // Keyboard hotfix (2026-09-07): the arrows are the L stick (InputBus) — ArrowUp runs at the rim, ArrowDown backs
      // off; the chair is the pad / touch d-pad or X. Mirrors DunkMode.
      if (e.t === 'dpad' && e.pressed && e.src !== 'key' && phase === 'approach') {
        if (e.dir === 'down') { setProp(ctx, nextObstacle(prop === 'none' ? null : prop)); SoundKit.play('uiTick', { pitch: 0.8 }); }
        if (e.dir === 'up' && prop !== 'none') { setProp(ctx, 'none'); SoundKit.play('uiTick', { pitch: 1.2 }); }
      }
      if (e.t === 'button' && e.btn === 'X' && e.pressed && phase === 'approach') {
        setProp(ctx, prop === 'crate' ? 'none' : nextObstacle(prop === 'none' ? null : prop));   // none → car → barrier → crate → none
        SoundKit.play('uiTick', { pitch: prop === 'none' ? 1.2 : 0.8 });
      }
      if (e.t === 'trigger' && e.side === 'R') {
        if (phase === 'approach' && e.value > 0.02) {
          // DUNK-CONTROL-JUICE: HOLD = RUN, the contest's own (the duel's charge phase used to stand still in the gather crouch and
          // launch on the release — its HUD promised the hold-run it never had)
          setPhase('charge');
          holdRunSpeed = Math.max(2, runUpPeak);
          playClip(SPORT_CLIP.moveLoop, { loop: true });
          ctx.setHud({ hint: 'HOLD — running to the rim · steer with the stick · release early to jump from here' });
          // THE MIC: the run is the player's — whatever the booth was saying stops, and one short word sends him
          mic?.hush();
          mic?.say({ moment: 'dunk.run', priority: 2, crowd: { moment: 'crowd.hype', n: 2 } });
        }
        if (phase === 'charge') {
          charge = Math.max(charge, e.value);
          ctx.setHud({ charge: Math.round(charge * 100) });
          if (e.value === 0) launchDunk(ctx, 'press');
        }
      }
      // HOTFIX (2026-09-24): A ON THE RUN IS THE TAKE-OFF, as in the contest (DunkMode: "tap JUMP at the line"). Every duel hint
      // says "HOLD to run — then tap jump", and A never jumped here: the tap landed in the flight after the line had launched the
      // run, and with the first press deciding it was the slam, refused TOO EARLY. The same press then reaches the flight below,
      // where TakeoffEcho drops it as the take-off's own.
      if (e.t === 'button' && e.btn === 'A' && e.pressed && phase === 'charge') launchDunk(ctx, 'press');
      if (e.t === 'button' && e.btn === 'A' && e.pressed && phase === 'cinematic') {
        const echo = slamEcho.of(e, performance.now(), clipTime >= SLAM_FROM);
        if (echo) console.info(`[DUEL-SLAM] ${echo === 'space' ? "the Space release's own A" : echo === 'late' ? 'the jump pressed after the line took off' : "the take-off's own A"} @${clipTime.toFixed(2)} — not the slam`);
        else {
          const v = slamPress.press(clipTime, { centre: EASTBAY_TIMING.extend, width: slamWindowSec() });   // too early to judge yet: held for the window
          if (v === 'spent') console.info(`[DUEL-SLAM] a second press @${clipTime.toFixed(2)} ignored — the first press decides`);
          else if (v !== 'held') { meterVerdict(clipTime, v); if (v.hit) { qteHit = true; qteAccuracy = v.accuracy; } }   // IMPROVE (2026-10-06) #7: the bar says how it landed
        }
      }
      // IMPROVE (2026-10-06) #8: MID-AIR TRICKS, the contest's grammar — hold a d-pad direction, tap B / Y / X. A stays the slam (the
      // duel's one timing press is untouched); the cue table says when each trick may fire (early: armed for its beat; late: refused).
      if (phase === 'cinematic' && e.t === 'dpad') flight.recognizer.feed(e);
      if (phase === 'cinematic' && e.t === 'button' && e.pressed && (e.btn === 'B' || e.btn === 'X' || e.btn === 'Y')) airTrickPress(ctx, e);
    },

    update(ctx: ModeContext, dt: number) {
      runLater(ctx, dt);   // IMPROVE (2026-10-06) #11: the mode's own beats (they hold while paused: update() does not run then)
      meter3d?.update(dt);   // IMPROVE (2026-10-06) #7
      fovTick(dt); if (!cutting) settleTick(ctx);
      // A+ P5: the fov pinch starts on the APPROACH — inside 3.6 m (horizontal) of the rim during the run, not at takeoff
      if ((phase === 'approach' || phase === 'charge') && !fovOn && Math.hypot(active().root.position.x - rim.x, active().root.position.z - rim.z) <= 3.6) fovGather(ctx);
      phaseSec += dt;
      watchdog(ctx);
      micTick(ctx);
      if (ended) return;
      handoffTick(ctx);   // IMPROVE (2026-10-06) #11: the card's beat on phaseSec
      if (phase === 'judging') {   // IMPROVE (2026-10-06) #6 #11: the staged reveal, then the beat before the device is passed
        if (!cutting) revealTick(ctx, dt);
        if (judgeHold >= 0) {
          judgeHold -= dt;
          if (judgeHold < 0) { ctx.setHud({ judgeReveal: null }); setBanner(ctx, ''); advance(ctx); finishing = false; }
        }
        if (ended) return;
      }

      const lookOn = phase === 'approach' || phase === 'charge';   // R look on the runway only (the rim cut / verdict keep their framing)
      ctx.camDirector.look(lookOn ? lookX : 0, lookOn ? lookY : 0, dt);
      // Dunk play tip (2026-09-07): camera-relative stick, no auto-drift, the facing follows the velocity — see DunkMode
      const vel = stickVel(ctx);
      if (phase === 'approach') {
        const c = active();
        c.root.position.addInPlaceFromFloats(vel.x * dt, 0, vel.z * dt);   // IMPROVE (2026-10-06) #18: no scaled copy
        c.root.position.z = Math.max(gatherLine(), Math.min(RETREAT_Z, c.root.position.z));
        c.root.position.x = Math.max(-6, Math.min(6, c.root.position.x));
        faceVel(vel, dt);
        // THE RUN-UP IS PART OF THE DUNK. Peak approach speed feeds the apex
        // at launch and the judges' difficulty read — a walk-up caps both.
        runUpPeak = Math.max(runUpPeak, Math.hypot(vel.x, vel.z));
        launchSpeed01 = Math.max(0, Math.min(1, (runUpPeak - 2) / 6));
        // IMPROVE (2026-10-06) #19: only on a change — every frame's call bumped clipToken and ran the animator's clip resolution and
        // scope check before its own same-clip early-out
        const runClip = Math.hypot(vel.x, vel.z) > 0.5 ? SPORT_CLIP.moveLoop : SPORT_CLIP.idle;
        if (runClip !== loopClip) playClip(runClip, { loop: true });
        if (c.root.position.z <= gatherLine() + 0.2) {
          ctx.setHud({
            hint: runUpPeak < 3.5
              ? 'HOLD to run — come in FASTER: the run-up buys your air'
              : 'HOLD to run — then tap jump',
          });
        }
      }

      if (phase === 'charge') {
        const c = active();
        holdRunSpeed = Math.min(HOLD_RUN_MAX, holdRunSpeed + dt * HOLD_RUN_RAMP);
        const steer = ctx.camDirector.rightFlat().x * stickX * 3 + Math.max(-2, Math.min(2, (rim.x - c.root.position.x) * 0.8));
        c.root.position.x = Math.max(-6, Math.min(6, c.root.position.x + steer * dt));
        c.root.position.z -= holdRunSpeed * dt;
        faceVel(_faceV.set(steer, 0, -holdRunSpeed), dt);   // IMPROVE (2026-10-06) #18: a scratch vector
        runUpPeak = Math.max(runUpPeak, Math.hypot(steer, holdRunSpeed));
        launchSpeed01 = Math.max(0, Math.min(1, (runUpPeak - 2) / 6));
        const line = gatherLine();
        if (c.root.position.z <= line) { c.root.position.z = line; launchDunk(ctx); }
      }
      if (phase === 'cinematic') {
        const animScale = ctx.scene.animationTimeScale ?? 1;
        const prevClip = clipTime;
        clipTime += dt * (Number.isFinite(animScale) && animScale > 0 ? animScale : 1);
        if (bodySlamClip !== null && clipTime >= bodySlamClip) {
          bodySlamClip = null;
          def.onInput(ctx, { t: 'button', btn: 'A', pressed: true, src: 'body' });
        }
        // IMPROVE (2026-10-06) #8: the air budget burns in clip time; a trick armed early fires on its beat
        flight.update(dt * (Number.isFinite(animScale) && animScale > 0 ? animScale : 1));
        if (armedAir && clipTime >= cueFireAt(armedAir)) { const a = armedAir; armedAir = null; if (!obstacleClipped && !slamPress.spent) fireTrick(ctx, a); }
        if (!hangSlowMoLatch && prevClip < EASTBAY_TIMING.rise && clipTime >= EASTBAY_TIMING.rise) {
          hangSlowMoLatch = true;
          ctx.juice.slowMo(0.4, 400, { gameplay: true });   // HOTFIX (2026-09-24): clipTime rides it (the slam window) — reduced motion keeps it whole
          ctx.camDirector.pulse(0.4, 0.45);
          setTrail('hang');   // A+ P6: the trail brightens at the hang rise, not at takeoff
        }
        const c = active();
        activeHandOff = style === 'sig' && !airTricks.length ? { spec: handOffSpecAt(DUEL_EASTBAY, clipTime), t: clipTime } : null;   // (IMPROVE 2026-10-06 #8: an air trick's body owns the hands from its press)   // DUNK MOTION phase 10b: up the front to the off hand, back under the thigh (phase 11: on the right-handed body)
        if (activeHandOff && runHandOffPath(ball, c.skeleton, clipTime, activeHandOff.spec, ebState)) console.info(`[HANDS] handoff ${activeHandOff.spec.from[0]}→${activeHandOff.spec.to[0]} eastbay @${clipTime.toFixed(2)}`);
        ikSideK = activeHandOff ? handOffK(activeHandOff.t, activeHandOff.spec) : (ebState.inLeftHand ? 1 : 0);
        // A+ P8 H4: the ball stays parented to the ball hand through the hang — a lost parent that is not a release re-attaches
        if (!ball.parent && !ball.metadata?.felReleased) { attachBallToHand(ball, c.skeleton, ebState.inLeftHand ? 'LeftHand' : 'RightHand'); console.info('[HANDS] ball re-attached'); }
        // DUNK-CONTROL-JUICE (the contest's mirror): a parabola off the floor, a constant-speed carry from the takeoff line
        // to the rim's front edge at the extension — the car is a long jump from its own line. The run-up buys air.
        // DUNK MOTION phase 11: the contest's flight — the top AT the rim (DunkLegs.arcHeight); the parabola peaked at clip 0.75 and the
        // slam at 1.25 met the iron at 56 % of the jump, on the way down, the hand coming up at the ring from under it
        c.root.position.y = arcHeight(clipTime, EASTBAY_TIMING.extend) * (1.05 + charge * 0.55) * (0.85 + launchSpeed01 * 0.3);
        const u = Math.min(1, clipTime / EASTBAY_TIMING.extend);
        c.root.position.z = launchZ + (rim.z + FLUSH_Z_AHEAD - launchZ) * u;
        faceToward(rim, dt * FACE_RIM_RATE);   // ease the facing onto the iron through the rise

        // THE OBSTACLE IS PHYSICAL: the lowest foot against the sampled top of the mesh under it — the dunk DIES on a clip
        if (obstacle && !obstacleClipped) {
          const fy = feetY(), px = c.root.position.x - rim.x, pz = c.root.position.z;
          const h = heightAt(obstacle.profile, px, pz);
          if (h > 0 && !obstacleOver) { obstacleOver = true; console.info(`[DUNK-PROP] over ${obstacle.spec.label}: feet ${fy.toFixed(2)} vs top ${h.toFixed(2)}`); }
          if (clipsObstacle(obstacle.profile, fy, px, pz, obstacle.spec.clearance)) {
            obstacleClipped = true; setTrail('off');   // juice soft #5: a clipped air kills the trail
            const deep = h - fy > 0.45 || obstacle.spec.topples;
            clipFloorY = deep ? 0 : h; clipBackZ = deep ? Math.max(pz, obstacle.nearZ + 0.4) : pz;
            console.info(`[DUNK-PROP] CLIPPED ${obstacle.spec.label}: feet ${fy.toFixed(2)} under ${h.toFixed(2)} at z ${pz.toFixed(2)}`);
            clipBlown(ctx);
          } else if (h === 0 && obstacleOver && !obstacleCleared && pz < obstacle.farZ) {
            obstacleCleared = true;
            console.info(`[DUNK-PROP] CLEARED ${obstacle.spec.label}`);
            SoundKit.play('crowdCheer', { volume: 0.35 }); ctx.camDirector.pulse(0.35, 0.3);
            mic?.crowd('crowd.ooh', 1);   // THE MIC: the stands gasp at the clear (the booth holds)
            setBanner(ctx, `${label()} OVER THE ${obstacle.spec.label}!`, 0.7);   // IMPROVE (2026-10-06) #11: the one banner channel
          }
        }

        if (!rimCamCut && clipTime >= EASTBAY_TIMING.extend * 0.55) {
          rimCamCut = true;
          ctx.camDirector.snapTo(_camPos.set(rim.x + 2.6, 0.4, rim.z - 1.2), _camAt.copyFrom(c.root.position).addInPlaceFromFloats(0, 1.4, 0));   // IMPROVE (2026-10-06) #18
        }

        const wasOpen = qteWindowOpen, win = slamWindowSec();
        qteWindowOpen = clipTime >= EASTBAY_TIMING.extend - win / 2
          && clipTime <= EASTBAY_TIMING.extend + win / 2;
        // IMPROVE (2026-10-06) #7: the contest's slam meter rides beside the dunker's head, the green where the window is
        if (meter3d) meter3d.set(clipTime / meterSpan, _meterHead.copyFrom(c.root.position).addInPlaceFromFloats(0, 1.72, 0));
        if (qteWindowOpen && !wasOpen) {
          // the press that beat the window: honoured here, scored from when it actually landed
          const early = slamPress.open({ centre: EASTBAY_TIMING.extend, width: win });
          if (early) meterVerdict(slamPress.pressedAt ?? clipTime, early);   // IMPROVE (2026-10-06) #7
          if (early?.hit && !qteHit) { qteHit = true; qteAccuracy = early.accuracy; }
          // HOTFIX (2026-09-24): a press too early even for the grace was the slam, and it missed — say so, and do not raise a
          // SLAM! the next press cannot answer
          if (early && !early.hit) refuse(ctx, `TOO EARLY — ${Math.round((EASTBAY_TIMING.extend - win / 2 - (slamPress.pressedAt ?? 0)) * 1000)} ms BEFORE THE WINDOW`);
          else ctx.setHud({ hint: 'SLAM!', slamPulse: true });
        }
        // IMPROVE (2026-10-06) #7: "NOW!" ON THE BEAT. The duel said SLAM! on the window's opening frame while the press is scored against
        // its CENTRE — the contest measured players pressing on the opening cue landing ~110 ms early. The word and its tick land on the
        // centre (the opening keeps its SLAM! read); nothing about the window itself moves.
        if (qteWindowOpen && !beatCalled && !slamPress.spent && clipTime >= EASTBAY_TIMING.extend) {
          beatCalled = true;
          ctx.setHud({ hint: 'NOW!' });
          SoundKit.play('uiTick', { pitch: 1.9, volume: 0.55 });
        }
        if (!qteWindowOpen && wasOpen) ctx.setHud({ slamPulse: false });
        if (clipTime >= EASTBAY_TIMING.extend + win / 2) resolveDunk(ctx);
      }

      if (phase === 'resolve') {
        sinceRelease += dt;
        if (!obstacleClipped) faceToward(rim, dt * FACE_RIM_RATE);   // BIOMECH-HOOPS-WAVE1 G1: the chest stays on the iron through the jam (the ease stopped at the takeoff)
        // a clipped dunk drops the dunker where the chair caught him, and the
        // chair goes over — the failure has to READ as contact
        if (obstacleClipped) {   // down where the prop caught him: the floor before the side he hit, or the top he caught
          active().root.position.y = Math.max(clipFloorY, active().root.position.y - 6 * dt);
          active().root.position.z += (clipBackZ - active().root.position.z) * Math.min(1, dt * 6);
        }
        if (qteHit) {
          if (flushThroughRim(ball, rim, releasePos, sinceRelease)) { contactPunch(ctx); finishAttempt(ctx, true); }
        } else {
          ballSim.step(dt);
          if (sinceRelease > 1.2) finishAttempt(ctx, false);
        }
      }

      obstacle?.tick(dt);
      // ── A+ P8 athlete hands: the fall to feet-down, the reach weight (dunk mirror) ──────────────────────────────
      if (dropToFloor && !obstacleClipped && !cutting) {   // (IMPROVE 2026-10-06 #12: the replay owns the root while it plays)
        active().root.position.y = Math.max(0, active().root.position.y - FALL_SPEED * dt);
        if (active().root.position.y <= 0) dropToFloor = false;
      }
      if (airHeld && phase !== 'cinematic' && !cutting && active().root.position.y <= (obstacleClipped ? clipFloorY : 0) + 0.05) landNow();
      // DUNK-SOFTS-NAMED: the reach starts at the CARRY-UP (the extension toward the iron), not the rise — through the rise and
      // the mocap's wind-up the hand swings past the shoulder and a reach toward the rim whipped it (0.8 m/frame measured;
      // the clip alone moves 0.22 m/frame), so the catch and the wind-up ride the clip's own hand now
      const reachWant = (phase === 'cinematic' && clipTime >= HAND_IK_FROM && !obstacleClipped)
        || (phase === 'resolve' && qteHit && !contactLatch && !obstacleClipped);
      const ikScale = ctx.scene.animationTimeScale ?? 1;
      const ikStep = dt * (phase === 'cinematic' && Number.isFinite(ikScale) && ikScale > 0 ? ikScale : 1) / HAND_IK_LAG_SEC;
      const prevIk = handIkT;
      handIkT = reachWant ? Math.min(1, handIkT + ikStep) : Math.max(0, handIkT - ikStep);
      if (prevIk === 0 && handIkT > 0) console.info('[HANDS] reach on'); else if (prevIk > 0 && handIkT === 0) console.info('[HANDS] reach off');

      if (phase === 'cinematic' && rimCamCut) {
        // hold the rim-cam angle through the flush
      } else if (phase !== 'judging' && phase !== 'matchOver' && phase !== 'handoff') {
        ctx.camDirector.update(active().root.position, vel, phase === 'approach' ? rim : ball.position);
      }
    },

    dispose() {
      // IMPROVE (2026-10-06) #13: the mode is over — `ended` stops every beat that checks it, the generation stops the replay's await,
      // and the mode-clock queue (every former setTimeout) is emptied: the judging beat used to call advance() → enterHandoff on
      // disposed bodies
      ended = true; modeGen++; later.length = 0; bannerUntil = 0; cutting = false; revealOn = false; judgeHold = -1;
      replay?.dispose(); replay = null;
      // IMPROVE (2026-10-06) #14: everything load() made — the trail, the gulls (planes, material, observers), the meter, the rings;
      // the posture layers hold no scene resource of their own (the reach observer that steps them is removed below), and are dropped
      trail?.dispose(); trail = null;
      ambient?.dispose(); ambient = null;
      meter3d?.dispose(); meter3d = null;
      for (const r of rings) r.dispose(); rings = [];
      if (p1) postureOf.delete(p1); if (p2) postureOf.delete(p2);
      hoopJuice?.dispose(); hoopJuice = null;
      mic?.dispose(); mic = null;   // THE MIC stops with the mode
      modeVenue?.dispose?.(); modeVenue = null;
      if (ikScene && handIkObs) ikScene.onAfterAnimationsObservable.remove(handIkObs);   // A+ P8 H1
      handIkObs = null; ikScene = null; handIkT = 0;
      for (const h of hinges) h.dispose(); hinges = [];   // HOOPS MOTION phase 3c
      p1?.dispose(); p2?.dispose(); ball?.dispose();
      obstacle?.dispose(); obstacle = null; obstacleToken++;
      SoundKit.stopAmbient();
    },
  };
  return def;
})();

// HUD CONTRACT (bare values): activePlayer ('P1'/'P2'), p1Score/p2Score,
// dunkNum, style, prop, charge, slamPulse, judgeReveal (same shape as Dunk
// Contest's), banner, hint.
