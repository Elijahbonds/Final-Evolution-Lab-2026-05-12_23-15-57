// DunkMode v5 — REPLACES the M52 file. The comprehensive contest upgrade.
// Everything from v3/v4 is kept unchanged (props, 3-judge scorecard, hype,
// rim-cam cut, chain meter, watchdogs, replay) and four contest-craft
// systems land on top:
//   STYLE TAPS — mid-air, before the SLAM window opens, tap STYLE (B) up
//     to twice: each tap pumps DIFFICULTY (+1.2) but SHRINKS the SLAM
//     window 25% — showboating is real risk for real reward.
//   VARIETY MEMORY — the judges remember. Repeating a style+prop combo
//     you've already thrown scores 20% lower difficulty ("seen it");
//     every FRESH combo gets a +0.5 difficulty nod. Four dunks now demand
//     four ideas, exactly like a real contest.
//   THE NEED — on your final-round dunks the HUD shows the score you NEED
//     to pass the rival's projected pace — the walk-off pressure number
//     every televised final round runs on.
//   RIM HANG — after a flush, HOLD SLAM (A) to hang on the rim: held long
//     enough it pays +1 style ("HANG TIME!") before the judges reveal.
// All additions are animation-independent on purpose (E25/M51-safe).

import { rivalForNight, rivalIntro, type DunkRival } from '../core/DunkRivals';
import {
  freshStakes, call as callTrick, spendAttempt, attemptsLeft, canRetry,
  stakesScale, callLanded, stakesLabel, callPreview, type Stakes,
} from '../core/DunkStakes';
import { readWalkOut, saveWalkOut, countPlay, musicCredential, type WalkOut } from '../music/WalkOut';
import { resolveWalkOut, walkOutLine, type WalkOutCue } from '../music/WalkOutCue';
import { StudioLibrary } from '../music/StudioLibrary';
import { Color3, Color4, MeshBuilder, Vector3, type Mesh } from '@babylonjs/core';
import { TransformNode } from '@babylonjs/core';
import { dressBall } from '../visual/meshyProps';
import type { AbstractMesh, AnimationGroup, Camera, Observer, ParticleSystem, PBRMaterial, Scene } from '@babylonjs/core';
import { type SpawnedCharacter } from '../core/CharacterLibrary';
import { CharacterPipeline } from '../core/characterPipeline';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { BallSim } from '../core/BallPhysics';
import { firstNight, nextNight, cardWon, type NightState } from '../core/ContinuousNight';   // TRY-ONBOARD G1: the GO AGAIN ledger
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { MOCAP_DUNK, DUNK_FINISH_VARIETY } from '../nexus/dressingFlags';
import { attachBallToHand, releaseBall, runEastbayPath, runHandOffPath, handOffK, clankOffRim, palmOffsetOf, type HandOffSpec } from '../anim/ballRig';
import { Matrix, Quaternion } from '@babylonjs/core';
import { bindFrame, type BindFrame } from '../anim/bindFrame';
import { mountBallCarry, type BallCarry } from '../anim/ballCarry';
import { DEFAULT_DRIBBLE } from '../anim/Dribble';
import { LEGS, legPose, easeLegPose, cloneLegPose, arcK, carryU, arcApexT, slamBufferSec, ARC_TOP_FRAC, PLANT_SEC, WINDMILL_RELEASE_T, GATHER_LEAD_SEC, FOOT_PITCH_CAP, atPalm, type LegPose } from '../core/DunkLegs';
import { EASTBAY_TIMING as EB } from '../anim/authored/timing';
import { EASTBAY_TIMING, DUNK_TIMING } from '../anim/authored/timing';
import { HOOPS_STRIDE } from '../core/StrideMatch';   // THE GATHER STRIDE (2026-09-18): the runway loop paces to the run
import { armChain, reachArm, shapeReach, type ArmChain } from '../anim/HandIK';   // A+ P8 H1: the hang wrist reach
import { lagToward, jamWeight, ironContact, hangHold, jamRootStep, jamFollowExtra, WRIST_LAG_TAU, HANG_MAX_SEC } from '../core/DunkHands';
import { CourtMovement, CUT_COST_HOOPS, DEFAULT_MOVEMENT, GEARS_HOOPS } from '../core/CourtMovement';
import { startFlush, stepFlush, sweptTouch, clearOfIron, ringDistance, ringClearance, type FlushState } from '../core/RimFlush';   // DUNK-BALL-ARMS-RIM: the made ball over the lip, down the ring, out of the net   // DUNK-HANDS-RIM: the wrist lag, the jam, the iron contact, the hang
import { hitStop as feelHitStop } from '../core/gameFeel';   // DUNK-HANDS-RIM H3: the mode's own clock stops on the iron too (the harness scales dt by it)
import { chainRotation, frameAbove } from '../anim/TwoBoneIK';
import { BodyMotion, dynamicPose } from '../core/DynamicPosture';   // the runway answers its MOTION
import { POSTURE, posturePose, chestAimCorrection, hipYawStrip, easePose, clonePose, lowPassK, wrapRad, clamp, POSTURE_TAU, AIM_TAU, AIM_SPLIT, EYES_SPLIT, HEAD_YAW_CAP, HEAD_PITCH_CAP, type PosturePose, type PostureWindow, type PostureInput } from '../core/DunkPosture';   // DUNK-POSTURE: the Posture Poses layer
import type { PlayOpts } from '../anim/CharacterAnimator';
import { DunkReplayRecorder } from '../scene/DunkReplayCam';
import { SoundKit } from '../audio/SoundKit';
import { refuse } from '../core/Refusal';   // MECHANICS PASS: a press that cannot act is answered
import { VenueKit } from '../visual/VenueKit';
import { mountPlayerRing, type PlayerRingHandle } from '../visual/PlayerRing';   // PLAYER RING (2026-09-17): stamina at the feet, the creator glyph over the head
import { readPlayerIcon } from '../visual/playerIcon';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';  // M74
import { EffectsKit, applyTrail, type TrailLevel } from '../visual/EffectsKit';
import { HoopJuice } from '../visual/HoopJuice';
import { mountShotMeter3D, type ShotMeter3DHandle } from '../visual/ShotMeter3D';   // THE SLAM METER (owner, 2026-09-18)
import { applyOceanCourt } from '../visual/CourtSurface';
import { applyVeniceDunkLookPass } from '../visual/veniceSurroundVisibility';
import { DUNK_CONFIG as CFG } from './modeConfigs';
import { readDisplaySetting } from '@/lib/controller-link/tvMode';   // TV MODE: the slam window widens on a mirrored display
import { DunkFlight, DunkSpin, runwayTrickFor, cueOf, cueVerdict, cueFireAt, cueLastAt, CUE_BEAT_LABEL, SPIN_RESOLVE_T, doubleUpFits, runwayTeachLine, CATCH_DIFFICULTY, DUNK_TRICK_ID_BY_CLIP, type RunwayTrick, type DunkTrick } from '../core/DunkSystem';
import { paneLobVelocity, lobVelocity, lobFlightTime, runTimeToLine, runTimeToLineGather, type GatherStride, canCatch, LOB_CATCH_CLIP_T, glassLobVelocity, bounceLobVelocity, bounceLobMinTime, bounceOntoVelocity, rimRing, FLOOR_E, FLOOR_FRICTION, GLASS_E_N, GLASS_E_T, type V3 } from '../core/DunkLob';
import { OBSTACLE_SPECS, OBSTACLE_KINDS, PROP_CAM, clipsObstacle, heightAt, nextObstacle, propCamSpot, propCutDue, type ObstacleKind } from '../core/DunkObstacles';
// DUNK PARKOUR (owner brief 2026-09-18): the glass rebound on the runway (a vector-transfer launch), the two launches, the
// backboard double-launch, the overdrive dunk. Pure in core/DunkParkour.
import { GLASS, wallRunMiss, launchProfile, doubleLaunchAllowed, DOUBLE_LAUNCH, overdriveDunk, cornerPanes, paneRebound, BUS_RUN, busRunPose, alongPane, busRunDone, cornerRideFor, type CornerRide, type GlassPane } from '../core/DunkParkour';
import { SKY, skyTierFor, skyTapAllowed, skyTapRefusal, type SkyTier } from '../core/SkyTier';
import { readSeasonLane, specialOpen, specialLockLine, SPECIAL_PROPS, type SeasonLane } from '../core/SeasonSpecials';   // SEASON SPECIALS (owner, 2026-09-18): the PRO lane's   // THE SKY TIER (owner, 2026-09-18): a blimp / a rocket / … over the lane, per court
import { spawnMeshyProp } from '../visual/meshyProps';
import { SceneLoader } from '@babylonjs/core';
import { runwayTrickById, DUNK_TRICKS, slamReadout, slamExecution, signatureFor, landingDustScale, netSplashScale, NET_SPLASH_DROP, type SlamReadout } from '../core/DunkSystem';
import { dunkCard, slamIsClean } from '../core/DunkCard';
import { missBeat } from '../core/MissFlavour';
import { spawnDunkObstacle, type DunkObstacle } from './dunkObstacleProps';
import { LOST_FOUND_HANDOFF, BETWEEN_LEGS_HANDOFF } from '../anim/authored/dunkTricks';
import { boneNode } from '../anim/boneLookup';
import { approachAngle, approachBonus, takeoffFor, takeoffTell } from '../core/DunkApproach';
import { spinBody, spinProgress } from '../core/DunkSpinBody';
import { emptyCard, addAttempt, forWire, nightReport } from '@/lib/mp/dunkCard';
import {
  judgeDunk, ScoreReveal, CrowdEnergy, REVEAL_DURATION_SEC, BAND_TOTAL, JUDGE_COUNT,
  PERFECT_TOTAL, perJudgeAvg, type JudgeScore,
} from '../core/JudgePanel';
import { MomentumBus } from '../core/MomentumBus';
import { rivalNerve, rivalExecution } from '../core/RivalNerve';   // the rival feels the contest too

type Phase = 'approach' | 'charge' | 'cinematic' | 'resolve' | 'judging' | 'rivalTurn' | 'contestOver';
/** Venice DualShock pad (2026-09-05): a miss is one beat, not the full judged reveal — the next run-up follows at once. */
const MISS_BEAT_MS = 1400;
/** HOLD = RUN: the hold ramps the athlete toward the rim at up to the max run (7 m/s) and launches at the gather line. */
const HOLD_RUN_MAX = 7, HOLD_RUN_RAMP = 6, AIR_LEAN_RAD = 0.32, AIR_DRIFT = 0.8;
/** THE GATHER STRIDE (owner 2026-09-18, "fix the gathers and the approaches in the dunk mode"). The hold-run sprinted at up to
 *  7 m/s INTO the takeoff line and the flight then carried at its own ~1.9 m/s from the launch frame — a wall at the line, the
 *  crouch of the launch clip playing while the root was already rising. The last stride is a GATHER now: inside
 *  GATHER_STRIDE_SEC of the line (never under GATHER_MIN_M) the run eases (GATHER_EASE_SEC) to the flight's carry speed and
 *  the charge-gather clip loads the legs ON THE FLOOR, so the launch clip's crouch lands on a body already gathered. */
const GATHER_STRIDE_SEC = 0.3, GATHER_MIN_M = 1.1, GATHER_EASE_SEC = 0.16;
/** How far the plant step keeps rolling toward the rim over PLANT_SEC (≈ the carry speed × the plant: no dead stop at the line). */
const PLANT_DRIFT_M = 0.14;
/** The tucked off arm of a 360 (clip degrees: X pitch, Y yaw, Z roll) and how far the tuck may pull the clip's own arm. */
const SPIN_TUCK_DEG: [number, number, number] = [-18, 26, 34];
const SPIN_TUCK_WEIGHT = 0.55;
/** The runway loop's rate follows the run (the loop ran at one rate from a 2 m/s drift to a 7 m/s sprint: foot slide). */
const strideRate = (mps: number): number => Math.max(0.7, Math.min(1.6, mps / HOOPS_STRIDE.run));
/** HOOPS-DEPTH S8 (2026-09-23): the runway loop. The dunker runs up DRIBBLING, and the shared `run` (SPORT_CLIP.moveLoop) has the
 *  arms of a sprinter with nothing in the hands — straight at the elbow on 631 of 733 approach frames (body smoke). The hoops
 *  dribble run (its capture, 78_06, on the hero) is the one the 1v1 drives on (7 straight-armed frames in 732). Paced against the
 *  same run reference (HOOPS_STRIDE_CAPTURE.run = HOOPS_STRIDE.run, calibrated for these captures). */
const RUNWAY_LOOP = 'bball_dribble_run';
// Dunk play tip (2026-09-07): a full stick runs at APPROACH_SPEED (the hold-run ramps past it to HOLD_RUN_MAX); the
// flight eases the facing onto the rim at FACE_RIM_RATE per second.
const APPROACH_SPEED = 6, FACE_RIM_RATE = 6;
/** The look-orbit deflection a runway beat borrows (a 3/4 view of the kick / the cartwheel / the toss). */
const BEAT_LOOK_X = 0.6;
/** The facing slews to the travel direction at this rate (rad/s): a stick flick reads as a turn, not a snap (~0.3 s for 180°). */
const TURN_RATE = 10;
/** With no auto-drift a pull-back backs off the runway; it stops this far behind the start line. */
const RETREAT_Z = CFG.startZ + 1.5;
/** Keep the Euler yaw in (−π, π] — the slews would otherwise accumulate turns (measured 522° after two strafes). */
const wrapYaw = (y: number): number => Math.atan2(Math.sin(y), Math.cos(y));
const STYLES = ['power', 'flashy', 'sig'] as const;
type Style = (typeof STYLES)[number];
// DUNK-CONTROL-JUICE (2026-09-08): the prop cycle — nothing, a passer's lob, your own lob, and three things to dunk OVER
// (the owner's sedan, a race barrier, a crate). d-pad: up = none, right = alley-oop, left = self-lob, down = the next
// obstacle; X cycles the whole ring. The obstacles are real meshes with hitboxes read off the geometry (dunkObstacleProps).
// DUNK-GLASS-BOUNCE (2026-09-08): two more self-lobs on the ring — OFF THE GLASS (the toss goes at the backboard and comes
// back off it to the hand: WDA "Off The Backboard") and the BOUNCE LOB (thrown down into the floor, up to the hand: WDA
// "Bounce Ball"; from standing it is the bounce-BOUNCE with a RUN cue). d-pad left cycles the lob family.
const PROPS = ['none', 'alleyoop', 'oopglass', 'oopbounce', 'oopcorner', 'oopalien', 'selflob', 'offglass', 'bounce', 'car', 'barrier', 'crate', 'tetris', 'ladder', 'bike', 'bikeroll', 'skate', 'skateroll', 'row3', 'row5', 'wall', 'kangaroo'] as const;
type Prop = (typeof PROPS)[number];
const OBSTACLE_PROPS = new Set<string>(OBSTACLE_KINDS);
const obstacleKindOf = (p: Prop): ObstacleKind | null => (OBSTACLE_PROPS.has(p) ? (p as ObstacleKind) : null);
// FLASHY ALLEY-OOPS (owner, 2026-09-16: "add flashy alley oops"). The oop was one thing — a teammate throws it straight
// up and you catch it. The passer can do everything the SELF-lob can: off the glass, or down off the floor. Three oops
// on the d-pad's right now, and they are worth what they cost to catch.
const OOP_PROPS = ['alleyoop', 'oopglass', 'oopbounce', 'oopcorner', 'oopalien'] as const;   // DUNK PARKOUR: the oop off the corner ride; ORBIT: the lob out of the saucer
type OopProp = (typeof OOP_PROPS)[number];
const isOop = (p: Prop): p is OopProp => (OOP_PROPS as readonly string[]).includes(p);
const nextOop = (p: Prop): OopProp => (isOop(p) ? OOP_PROPS[(OOP_PROPS.indexOf(p) + 1) % OOP_PROPS.length] : 'alleyoop');
const LOB_PROPS = ['selflob', 'offglass', 'bounce'] as const;
type LobProp = (typeof LOB_PROPS)[number];
const lobPropOf = (p: Prop): LobProp | null => (p === 'selflob' || p === 'offglass' || p === 'bounce' ? p : null);
const nextLobProp = (p: Prop): LobProp => { const k = lobPropOf(p); return k ? LOB_PROPS[(LOB_PROPS.indexOf(k) + 1) % LOB_PROPS.length] : 'selflob'; };

const STYLE_CLIP: Record<Style, string> = {
  // POWER launch plays the user's real motion capture when MOCAP_DUNK is on
  // (feature-retargeted 'dunk_mocap'); flips back to the authored launch clip
  // instantly via NEXT_PUBLIC_MOCAP_DUNK=false. Flashy/sig are untouched.
  power: MOCAP_DUNK ? 'dunk_mocap' : SPORT_CLIP.dunkLaunchPower,
  // DUNK-CONTROL-JUICE: FLASHY launched on the ROUNDHOUSE (a karate kick) — now the authored takeoff, both hands thrown
  // overhead, which flows into the held hang; the finish picked at resolve carries the flash.
  flashy: SPORT_CLIP.dunkLaunchPower, sig: SPORT_CLIP.dunkLaunchSig,
};
const STYLE_LABEL: Record<Style, string> = { power: 'POWER', flashy: 'FLASHY', sig: 'SIGNATURE' };
// the obstacle labels and bonuses come from the SPEC TABLE, so a new prop is one entry there and not four (2026-09-16)
const PROP_LABEL: Record<Prop, string> = { none: 'NO PROP', alleyoop: 'ALLEY-OOP', oopglass: 'OOP OFF THE GLASS', oopbounce: 'BOUNCE OOP', oopcorner: 'OOP OFF THE BUS', oopalien: 'LOB FROM THE ALIENS', selflob: 'SELF-LOB', offglass: 'OFF THE GLASS', bounce: 'BOUNCE LOB',
  ...Object.fromEntries(OBSTACLE_KINDS.map((k) => [k, OBSTACLE_SPECS[k].label])) } as Record<Prop, string>;
const STYLE_TIER: Record<Style, number> = { power: 3, flashy: 5.5, sig: 8 };
// EVERY PROP NEEDS A BONUS HERE: the trailing `as Record<Prop, number>` cast silences the missing-key error, and a missing one
// is `undefined` → the card's DIFF reads NaN (measured 2026-09-18, the alien lob's first run).
const PROP_BONUS: Record<Prop, number> = { none: 0, alleyoop: 2, oopglass: 3.2, oopbounce: 3.6, oopcorner: 3.8, oopalien: 4.2, selflob: 1.5, offglass: 2.5, bounce: 2.5,
  ...Object.fromEntries(OBSTACLE_KINDS.map((k) => [k, OBSTACLE_SPECS[k].bonus])) } as Record<Prop, number>;
/** Where the ball hand is at the lob's catch beat (LOB_CATCH_CLIP_T), relative to the root, per launch clip — measured on the
 *  live rig with the reach off through the rise (DUNK-SOFTS-NAMED probe, hand − root at clip 0.62): the mocap POWER gather
 *  holds both hands overhead and a touch behind; the authored FLASHY takeoff has them up and level; the SIG eastbay's ball
 *  hand is already down at the knee. The old single (−0.12, 1.9, −0.3) was tuned against a reach that pulled the hand 0.7 m
 *  forward at the beat — and flipped the arm doing it. */
const CATCH_HAND_OFFSET: Record<Style, Vector3> = {
  power: new Vector3(0.18, 1.49, 0.31), flashy: new Vector3(0.30, 1.35, 0.08), sig: new Vector3(0.01, 0.97, 0.04),
};
/** A queued takeoff leaves this many clip seconds before the runway beat's last key, inside the crossfade. */
const BEAT_TAKEOFF_LEAD = 0.12;
/** A beat that ends inside this many metres of the takeoff line launches out of its last pose (no run loop in between). */
const LAUNCH_OUT_OF_BEAT_M = 1.0;
/** The self-lob prop tosses itself this far before the takeoff line when the runner has not thrown it by hand. */
const AUTO_LOB_AHEAD_M = 2.6;
/** DUNK-GLASS-BOUNCE: the off-glass prop throws itself here — measured on the flight's own catch point: a throw released
 *  2.4–4 m out clears the iron on the way in (0.15–0.5 m) and meets the glass 3.5–3.8 m up; nearer than 2.2 m the ball is
 *  under the rim's front lip (a CLANK, honest), further and it meets the board near its top. */
const AUTO_GLASS_AHEAD_M = 3.8;
/** The off-glass lob is aimed at the HANG beat (the hand still overhead, the body near its apex), not the rise: measured on
 *  the flight's own catch point, a rise-beat throw released inside 0.5 m of the line passes the iron's front lip by 5 cm
 *  or under it (a CLANK on two of three runs); at the hang beat the same release meets the board 3.5–3.8 m up with
 *  0.3–0.5 m over the iron, and a throw 2 m+ out sails over the board's top (OVER THE GLASS, honest). */
const GLASS_CATCH_CLIP_T = 0.8;
/** The corner-billboard oop's catch beat: the plain oop's (the rise runs at the real rate; a catch deep in the hang met a hand
 *  that the slow-mo had not brought there yet — LOST at 1.38 three of three, measured). The throw leaves on the cinematic's
 *  first frame instead, so the mirror path off the sign has the whole rise to fly. */
const CORNER_CATCH_CLIP_T = LOB_CATCH_CLIP_T;
/** The highest a toss onto a prop's top may go (the last hop's apex); beyond it the throw reads as a rocket, not a lob. */
const ENV_TOSS_APEX_CAP = 6.5;
/** The judges see the ball come off something that is not the floor (a car roof, a crate). */
const ENV_BOUNCE_DIFFICULTY = 1;
/** The standing bounce lob is thrown on the ball's own clock: the RUN cue lands when the hold-run (the pad's 2 → 7 m/s
 *  ramp from standing) plus the flight's catch beat exactly fills what is left of the flight. */
const RUN_CUE_MARGIN_SEC = 0.05;
/** The anim windows — one clip owner per window, logged on every change. */
type Win = 'run' | 'gather' | 'takeoff' | 'hang' | 'contact' | 'land';

const DUNKS_PER_ROUND = 2;
const RIVAL_HOP_MS = 1300;                 // the rival's scripted hop bench → rim
/** The re-aimed lob's shortest flight to the catch (a shorter one would need a cannon). */
const LOB_REAIM_MIN_SEC = 0.35;
const RIVAL_AT_RIM_K = 0.62;               // MOCAP DUNKS: the hop reaches the ring by here and hangs (it used to arrive only at the landing — the flush left the palm 1.6 m wide)
const RIVAL_FLUSH_K_MAX = 0.86;
/** Where in the captured finish the flush is (the dunk-finder's peak, ~0.53 of the window). */
const RIVAL_FINISH_KEY_01 = 0.53;            // …and the ball leaves the palm when it is AT the ring's height (the captured finish decides the moment), or here at the latest
                                           // (measured at a fixed 0.68: the ball let go 2.2–2.7 m up, under the iron, while the hand was still rising)
/** The run-up before that hop. A dunk that starts from a standing launch is not a dunk anybody runs up to. */
const RIVAL_RUNUP_MS = 900;
const TOTAL_ROUNDS = 2;
// Every threshold below is derived from the panel, never a bare number. The D1
// bug was exactly this: the judge total was written as a literal tuned to a
// 3-judge ceiling, so moving to five judges would have silently made an
// eruption routine. Derived, they follow the panel wherever it goes.
const CHAIN_THRESHOLD = BAND_TOTAL.approval;   // 40/50 — an "approval" dunk keeps a chain alive
const MONSTER_AVG = 9.6;                       // per-judge avg for the heaviest momentum weight
const FLAT_AVG = 6.35;                         // per-judge avg that reads as a dud to the panel
// Rival pace per dunk, measured from the simulated rival's score distribution
// (~8.5 a card). The player's NEED is quoted against it in the final round.
const RIVAL_PACE = Math.round(7.6 * JUDGE_COUNT);
// The rival's blow rate now comes from `RivalNerve.BASE_BLOWN` and moves with the situation — a rival
// going for one misses more, a rival protecting a lead misses less. The old flat constant lived here.
// ── A+ P8 athlete hands (PM brief VENICE-DUNK-A-PLUS-P8, 2026-09-07) ─────────────────────────────────────────────
/** H1: from the hang rise the ball hand reaches for the rim — weight eased 0 → HAND_IK_MAX over HAND_IK_LAG_SEC of CLIP time
 *  (the hang slow-mo stretches the lag with the flight), held through a make's flush, let go at CONTACT / the clank / a clip. */
const HAND_IK_MAX = 0.6, HAND_IK_LAG_SEC = 0.12, HAND_IK_RIM_UP = 0.08, REACH_POLE_CAP = Math.PI / 2, HAND_IK_FROM = EASTBAY_TIMING.carryUp - 0.05;
/** Dev probes only: `?noreach=1` on /dev/mode/dunk plays the clips with no wrist reach (to tell a clip's own snap from the IK's). */
/** DUNK-POSTURE S3: through the JAM (the slam press → CONTACT) the ball hand sits ON the iron, not 60 % of the way there. */
const HAND_IK_MAX_JAM = 0.95;
const RIM_AIM_OFF = process.env.NODE_ENV === 'development' && typeof location !== 'undefined' && /[?&]norimaim=1/.test(location.search);   // DUNK-BALL-ARMS-RIM dev A/B
const REACH_OFF = process.env.NODE_ENV === 'development' && typeof location !== 'undefined' && /[?&]noreach=1/.test(location.search);
/** Dev probes only: `?noposture=1` plays the clips with no Posture Poses layer (the before / after of DUNK-POSTURE). */
const POSTURE_OFF = process.env.NODE_ENV === 'development' && typeof location !== 'undefined' && /[?&]noposture=1/.test(location.search);
/** Dev: `?finish=windmill|tomahawk|hang` forces a make's finish (the probe proves the windmill's in-hand sweep without a frame-perfect tap). */
const FINISH_FORCE = process.env.NODE_ENV === 'development' && typeof location !== 'undefined' ? (/[?&]finish=(windmill|tomahawk|hang)/.exec(location.search)?.[1] ?? null) : null;
/** DUNK-POSTURE: the clavicle key signs, measured on the shipped hero (rig-diag 2026-09-08): +Z lifts the LEFT clavicle and
 *  drops the right, +Y pulls the left clavicle BACK and the right forward — so a `shrug` / `forward` is mirrored per side. */
const CLAVICLE_SIGN = { Left: { shrug: 1, forward: -1 }, Right: { shrug: -1, forward: 1 } } as const;
/** H5: the root's fall from the release height (the arc's own rate at the release, ~2.6 m/s) — feet-down is where the land clip plays.
 *  Measured before: the root froze at the resolve height (~0.23 m) and the idle loop played there through the judging. */
const FALL_SPEED = 2.6;

// Judges + staged reveal + crowd energy now live in the SHARED JudgePanel
// (lib/babylon/core/JudgePanel.ts) — DunkDuelMode drinks from the same well.

/** How long the night card is deaf to buttons — long enough that a press already in
 *  flight when it lands cannot skip it, short enough that it never feels stuck. */
const CARD_SETTLE_SEC = 0.7;
/** Seconds of run-up kept in front of the takeoff, so the replay has a beat of context before the leap. */
const REPLAY_LEAD_IN_SEC = 0.55;

const BUDGET_SEC: Record<Phase, number> = {
  // TRY-ONBOARD G1: the card has NO budget. It used to be 999 s because it lasted the
  // 40 ms before ctx.end tore the mode down; on a continuous night the guest sits on it
  // for as long as they like, and a tripped watchdog with no case for this phase logs a
  // warning every frame from minute seventeen on.
  approach: 30, charge: 5, cinematic: 4, resolve: 3, judging: 6, rivalTurn: 8, contestOver: Infinity,
};

export const DunkMode: ModeDefinition = (() => {
  let player: SpawnedCharacter, rival: SpawnedCharacter, teammate: SpawnedCharacter | null = null;
  let dunkVenue: VenueHandle | null = null;  // M74
  let obstacle: DunkObstacle | null = null, obstacleToken = 0;   // DUNK-CONTROL-JUICE: a real mesh with a sampled hitbox
  let ball: AbstractMesh, ballSim: BallSim, replay: DunkReplayRecorder;
  let feet: { L: TransformNode | null; R: TransformNode | null } = { L: null, R: null };   // the clear test reads the FEET
  let win: Win = 'run';                       // the anim window in charge of the body
  // ── the lob (self-lob / kick-up / cartwheel toss / the alley-oop pass): one real arc, one fair catch ──
  const lob = { live: false, thrown: false, caught: false, lost: false, label: '', kind: 'plain' as 'plain' | 'glass' | 'bounce' | 'corner', glass: false, over: false, bounces: 0, wantBounces: 0, env: '' as string, clanked: false, t: 0, runCueAt: -1, runCued: false };
  // DUNK-GLASS-BOUNCE: the backboard's front face (read off the venue's board mesh at load; the regulation fallback) and the
  // iron as twelve small colliders — the lob is swept against both every step
  const glass = { z: CFG.rimZ - 0.39, xMin: -0.9, xMax: 0.9, yMin: CFG.rimHeight - 0.075, yMax: CFG.rimHeight + 0.975, found: false };
  const RIM_RING = rimRing({ x: 0, y: CFG.rimHeight, z: CFG.rimZ }, 0.45).map((p) => new Vector3(p.x, p.y, p.z));
  const RIM_IRON_R = 0.03;
  // ── runway tricks (thrown during the hold-run) ──
  let runwayBeat: RunwayTrick | null = null, runwayT = 0, runwayReleased = false, runwayToken = 0;
  let runwayLabels: string[] = [], runwayDifficulty = 0, doubleUp = false, launchQueued = false;
  let teachHint = '';   // the runway's move list, pushed to the HUD only when it changes
  let runwayIds: string[] = [];                  // what was thrown, for the signature table (labels are for people)
  let airTrick: { trick: DunkTrick; t0: number } | null = null;   // the mid-air trick in flight (its own hand-off clock)
  let catchBlend = 1; const catchFrom = new Vector3(), catchWorld = new Vector3(), _invHand = Matrix.Identity();   // a caught ball eases from where the hand met it into the palm (80 ms), no snap
  let catchPending = false;   // DUNK-SOFTS-NAMED: the hand-local start is solved after this frame's animation + reach (update() sees last frame's hand — 0.3 m stale mid wind-up)
  let activeHandOff: { spec: HandOffSpec; t: number } | null = null;   // the transfer in progress (the reach crossfades on it; the ball is re-placed after the IK)
  let ikSideK = 0;                            // the reach: 0 = the right arm, 1 = the left, blended across a hand-off
  const EASTBAY_HANDOFF: HandOffSpec = { at: EB.handOff, from: 'RightHand', to: 'LeftHand' };
  const LOST_FOUND_SPEC: HandOffSpec = { at: LOST_FOUND_HANDOFF, from: 'RightHand', to: 'LeftHand' };
  // BETWEEN THE LEGS is a transfer too — the ball passes under the lead thigh and comes up in the other
  // hand. Without this the clip mimes a swap the ball never makes, which is worse than no clip at all:
  // the body says one thing and the object in it says another.
  const BETWEEN_LEGS_SPEC: HandOffSpec = { at: BETWEEN_LEGS_HANDOFF, from: 'RightHand', to: 'LeftHand' };
  let trail: ParticleSystem | null = null;   // juice soft #5
  let fovCam: Camera | null = null, fovBase = 0, fovT = 0, fovOn = false;   // juice soft #4
  let settleLatch = false;                    // juice soft #3
  let settleArmed = false, settleArmAt = 0;   // A+ P4: the settle waits for feet-down, not the flush frame
  let hoopJuice: HoopJuice | null = null;     // juice LOOK: rim spring, net squash, hoop flash on the make
  // THE SLAM METER (owner, 2026-09-18: "put a shot meter … make it trigger on layups and dunks"): the bar beside the
  // dunker's head rides the CLIP clock with the slam window drawn green — the same window slamNow grades by. The span
  // runs a little past the window's close so the green sits near the top the way a jumper's does.
  let meter3d: ShotMeter3DHandle | null = null; let meterSpan = 1.5;
  function slamWindowNow(): number { return slamWindowBase() * (1 - styleTaps * 0.25) * flight.slamWindowScale; }
  function slamGreen(): { center: number; half: number } { return { center: EASTBAY_TIMING.extend / meterSpan, half: slamWindowNow() / 2 / meterSpan }; }
  let phase: Phase = 'approach';
  let phaseSec = 0;
  let style: Style = 'power';
  let prop: Prop = 'none';
  let charge = 0, clipTime = 0, qteHit = false, qteWindowOpen = false, qteAccuracy = 0;
  let ring: PlayerRingHandle | null = null;   // PLAYER RING
  const NET_THROW_MIN = 4, NET_THROW_MAX = 12;   // NET EXIT (2026-09-17): m/s down the net — a loose slam drops it, a perfect one fires it (and it bounces off the floor and away)
  let sinceRelease = 0, releasePos = new Vector3();
  // DUNK-POSTURE-LEGS: the PERFECT windmill keeps the ball through the sweep — finish-clip seconds to the release (−1 = released on the press)
  let finishRelease = -1, finishT = 0, finishRate = 1;
  // DUNK-POSTURE-LEGS: the runway dribble (ballCarry) and its gather into the plant; the off hand's reach onto the ball
  let dribble: BallCarry | null = null, gatherLatched = false, gatherK = 0, pendingBeat: RunwayTrick | null = null;
  let gatherStride = false;   // THE GATHER STRIDE: the last stride into the line is on
  let llPose: LegPose = cloneLegPose(LEGS.stance);   // LL: this frame's feet, eased between windows
  let styleTaps = 0;                          // mid-air showboat taps (max 2)
  let aHeld = false, hangSec = 0;             // rim-hang tracking
  let runUpPeak = 0;                          // fastest approach speed (m/s) this attempt
  let gatherHeld = false;                     // GATHER (L2) through the run: both feet, by choice (2026-09-19)
  let launchCarry = 1;                        // the foot's carry through the plant (DunkParkour.launchProfile)
  let launchFoot: 'one' | 'two' = 'two';      // which foot left the floor, for the flight and the card
  let gatherTold = '';                        // the last tell shown, so the HUD is not rewritten every frame
  // DUNK PARKOUR: when the run last rebounded off the glass (a launch inside GLASS.carrySec of it is a vector launch), the
  // backboard double-launch (once a flight) and the apex it adds, the glass panels along the runway
  // THE CORNER PROPS (owner: no glass on the sidelines — the hoopbus parked across one front corner, an event tent with the
  // scene's sign across the other; their faces are the rebound / wall-run surfaces the pure panes describe)
  let vectorAt = -1e9, vectorWallRun = false, doubleLaunched = false, doubleLaunchLift = 0, sideProps: TransformNode[] = [], panes: GlassPane[] = [];
  // THE SKY TIER: what hangs over the lane in this court, and whether the dunker has tapped off it this flight
  let skyTier: SkyTier | null = null, skyRoot: TransformNode | null = null, skyTapped = false, skyBob = 0, skyKick = 0;
  // THE BACKBOARD (owner, 2026-09-18): L1 with the d-pad UP is the flip OFF THE TOP OF THE BOARD; L1 HELD after the kick is a RUN
  // across the glass. A sky tap's drop is a backflip into a rim hang. The flips are a pitch layer on the root, like the swing's roll.
  let boardTopFlip = false, boardRan = false, l1DownAt = -1;
  // THE BUS WALL RUN (owner, 2026-09-18: "try a wall run dunk off the bus"): a shallow run into the hoopbus goes up its side and
  // along it to the front end, and the jump off it is the takeoff (core/DunkParkour BUS_RUN)
  let busRun: { t: number; s: number; pane: GlassPane; speed: number } | null = null, busLaunch: { x0: number; y0: number } | null = null, busRan = false;
  let rideMissAt = -1e9;                      // the near-miss tell is throttled: one word per approach, not per frame
  let ride: CornerRide = cornerRideFor(undefined);   // what is parked across the right corner (the hoopbus; a shuttle in Orbit)
  const propLabel = (p: Prop): string => PROP_LABEL[p].replace('THE BUS', `THE ${ride.short}`);
  // SEASON SPECIALS: the animals, the sky tap, the board-top flip and the backboard run are the PRO lane's — read once at
  // load (the dev url can override); until it answers the specials are locked, never silently open
  let seasonLane: SeasonLane = 'guest';
  const specialsOpen = () => specialOpen(seasonLane);
  function pitchFlip(ctx: ModeContext, fromT: number, sec: number): void {
    const obs = ctx.scene.onBeforeRenderObservable.add(() => {
      const u = Math.min(1, Math.max(0, (clipTime - fromT) / sec));
      player.root.rotation.x = -Math.sin(u * Math.PI) * Math.PI * (u < 0.5 ? 1 : 1);   // over the top and back: a full turn read as a flip
      player.root.rotation.x = -u * Math.PI * 2;
      if (u >= 1 || phase !== 'cinematic') { player.root.rotation.x = 0; ctx.scene.onBeforeRenderObservable.remove(obs); }
    });
  }
  /** ORBIT's left corner (owner, 2026-09-18: "replace the red tent with a space station"): a station module — the pressurised
   *  can along the pane, a docking ring at the rim end, radiator wings on a truss ABOVE it. The can is the longest axis on
   *  purpose: parkOnPane scales a prop's longest side to the pane, so wings wider than the module would shrink the whole
   *  station (measured: an 8.2 m wing span scaled it to 61%). */
  function buildSpaceStation(scene: Scene): TransformNode {
    const root = new TransformNode('dunk_station', scene);
    const shell = VenueKit.paint(scene, 'station_shell_m', '#e8edf3', 0.25, 0.45), trim = VenueKit.paint(scene, 'station_trim_m', '#8d9aa8', 0.55, 0.4), panel = VenueKit.paint(scene, 'station_panel_m', '#1b2f6b', 0.25, 0.3), gold = VenueKit.paint(scene, 'station_gold_m', '#e0ad4c', 0.7, 0.35), dark = VenueKit.paint(scene, 'station_dark_m', '#2b3038', 0.3, 0.6);
    const add = (m: Mesh, mat: PBRMaterial, x: number, y: number, z: number): Mesh => { m.parent = root; m.position.set(x, y, z); m.material = mat; m.isPickable = false; m.receiveShadows = true; return m; };
    const can = add(MeshBuilder.CreateCylinder('station_can', { diameter: 1.9, height: 4.4, tessellation: 22 }, scene), shell, 0, 1.45, 0); can.rotation.x = Math.PI / 2;
    for (const z of [-2.2, 2.2]) add(MeshBuilder.CreateCylinder('station_cap', { diameter: 1.95, height: 0.22, tessellation: 22 }, scene), trim, 0, 1.45, z).rotation.x = Math.PI / 2;
    for (const z of [-1.1, 0.4]) add(MeshBuilder.CreateTorus('station_band', { diameter: 2.0, thickness: 0.1, tessellation: 22 }, scene), trim, 0, 1.45, z).rotation.x = Math.PI / 2;
    const dock = add(MeshBuilder.CreateCylinder('station_dock', { diameterTop: 1.0, diameterBottom: 1.4, height: 0.55, tessellation: 20 }, scene), trim, 0, 1.45, 2.6); dock.rotation.x = Math.PI / 2;
    add(MeshBuilder.CreateTorus('station_ring', { diameter: 1.15, thickness: 0.13, tessellation: 20 }, scene), gold, 0, 1.45, 2.9).rotation.x = Math.PI / 2;
    for (const z of [-0.6, 0.9]) add(MeshBuilder.CreateBox('station_port', { width: 0.34, height: 0.34, depth: 0.06 }, scene), dark, 0.92, 1.75, z).rotation.y = Math.PI / 2;
    add(MeshBuilder.CreateBox('station_truss', { width: 0.14, height: 0.14, depth: 4.2 }, scene), trim, 0, 2.75, -0.2);
    for (const z of [-1.6, 1.1]) {   // the radiator wings, both inside the module's own length
      for (const sx of [-1, 1]) {
        add(MeshBuilder.CreateBox('station_wing', { width: 1.7, height: 0.07, depth: 1.15 }, scene), panel, sx * 1.05, 2.75, z);
        add(MeshBuilder.CreateBox('station_wingedge', { width: 1.74, height: 0.11, depth: 0.09 }, scene), gold, sx * 1.05, 2.75, z - 0.58);
        add(MeshBuilder.CreateCylinder('station_wingarm', { diameter: 0.09, height: 0.35, tessellation: 8 }, scene), trim, sx * 0.2, 2.75, z).rotation.z = Math.PI / 2;
      }
    }
    for (const [x, z] of [[-0.7, 1.5], [0.7, 1.5], [-0.7, -1.5], [0.7, -1.5]] as const) add(MeshBuilder.CreateCylinder('station_leg', { diameter: 0.15, height: 1.0, tessellation: 10 }, scene), trim, x, 0.5, z);
    void [can, dock];
    return root;
  }
  /** The court's own thing in the sky, from primitives, hung with its underside at SKY.underY over the lane. */
  function buildSkyTier(scene: Scene, tier: SkyTier, z: number): TransformNode {
    const root = new TransformNode('dunk_sky', scene); root.position.set(0, SKY.underY, z);
    const body = VenueKit.paint(scene, 'sky_body_m', tier.color, 0.12, 0.6), acc = VenueKit.paint(scene, 'sky_acc_m', tier.accent, 0.35, 0.5), dark = VenueKit.paint(scene, 'sky_dark_m', '#33383f', 0.05, 0.8);
    const add = (m: Mesh, mat: PBRMaterial, x: number, y: number, zz: number): Mesh => { m.parent = root; m.position.set(x, y, zz); m.material = mat; m.isPickable = false; return m; };
    if (tier.kind === 'saucer') {
      // ORBIT's ALIEN CRAFT (owner, 2026-09-18): a lobed saucer — the lens hull, a glass dome, the lobes around the rim and the
      // belly ring the lob drops out of. Its LOWEST point is the hull's underside at y 0 (the root hangs at SKY.underY).
      const hull = add(MeshBuilder.CreateSphere('sky_hull', { diameter: 1, segments: 20 }, scene), body, 0, 0.45, 0); hull.scaling.set(5.2, 0.9, 4.2);
      const dome = add(MeshBuilder.CreateSphere('sky_dome', { diameter: 2.1, segments: 16 }, scene), acc, 0, 0.7, 0); dome.scaling.y = 0.85;
      for (let i = 0; i < 8; i++) { const a = (i * Math.PI * 2) / 8; const lobe = add(MeshBuilder.CreateSphere('sky_lobe', { diameter: 0.62, segments: 10 }, scene), acc, Math.sin(a) * 2.35, 0.42, Math.cos(a) * 1.9); lobe.scaling.y = 0.6; }
      add(MeshBuilder.CreateTorus('sky_ring', { diameter: 2.4, thickness: 0.16, tessellation: 24 }, scene), acc, 0, 0.12, 0);
      add(MeshBuilder.CreateCylinder('sky_port', { diameterTop: 1.5, diameterBottom: 0.9, height: 0.22, tessellation: 20 }, scene), dark, 0, 0.1, 0);
      for (let i = 0; i < 3; i++) { const a = (i * Math.PI * 2) / 3; const fin = add(MeshBuilder.CreateBox('sky_rfin', { width: 0.08, height: 1.2, depth: 0.9 }, scene), acc, Math.sin(a) * 0.85, 0.75, Math.cos(a) * 0.85); fin.rotation.y = a; }
      add(MeshBuilder.CreateCylinder('sky_nozzle', { diameterTop: 0.7, diameterBottom: 1.0, height: 0.4, tessellation: 16 }, scene), dark, 0, 0.2, 0);
    } else if (tier.kind === 'balloon') {
      const env = add(MeshBuilder.CreateSphere('sky_env', { diameter: 3.4, segments: 16 }, scene), body, 0, 3.4, 0); env.scaling.y = 1.15;
      add(MeshBuilder.CreateBox('sky_basket', { width: 1.1, height: 0.7, depth: 1.1 }, scene), dark, 0, 0.35, 0);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const r = add(MeshBuilder.CreateCylinder('sky_rope', { diameter: 0.04, height: 1.6 }, scene), acc, sx * 0.5, 1.5, sz * 0.5); r.rotation.x = sz * 0.25; r.rotation.z = -sx * 0.25; }
    } else {
      // the treehouse — and the last kind, so it is the fallback. (The Rooftop's water tower stood here until
      // 2026-09-19: owner, "take out the water tower". The Rooftop hangs nothing now, like Venice.)
      add(MeshBuilder.CreateBox('sky_deck', { width: 3.4, height: 0.3, depth: 2.4 }, scene), body, 0, 0.15, 0);
      add(MeshBuilder.CreateBox('sky_hut', { width: 2.2, height: 1.6, depth: 1.6 }, scene), dark, 0, 1.1, -0.3);
      const roof = add(MeshBuilder.CreateCylinder('sky_roof', { diameterTop: 0, diameterBottom: 3.0, height: 1.0, tessellation: 4 }, scene), acc, 0, 2.4, -0.3); roof.rotation.y = Math.PI / 4;
      for (const sx of [-1, 1]) add(MeshBuilder.CreateBox('sky_rail', { width: 0.06, height: 0.7, depth: 2.4 }, scene), acc, sx * 1.65, 0.65, 0);
    }
    return root;
  }

  // THE RIM SWING (owner: "be able to swing off the rim and off the backboard"): with the SLAM held through the contact the body
  // hangs; the stick swings it under the rim (a pendulum about the iron), and letting go at the swing's reach is a flourish.
  // The BACKBOARD SWING is L1 in the hang beat (after the rise's kick): a pivot off the glass for a little more lift.
  let swingAng = 0, swingVel = 0, swingPeak = 0, hangBase: Vector3 | null = null, boardSwung = false;
  const vectorLive = () => performance.now() - vectorAt < GLASS.carrySec * 1000;
  const launchMult = () => launchProfile(takeoffFor(runUpPeak, gatherHeld), vectorLive(), vectorWallRun).apexMult;
  /** The glass: the run reflects off it with the speed kept — the launch that follows is a vector launch. */
  function tryGlass(ctx: ModeContext, vx: number, vz: number): void {
    if (performance.now() - vectorAt < 600) return;   // one rebound per contact
    const r = paneRebound(player.root.position.x, player.root.position.z, vx, vz, panes);
    if (!r) {
      // A NEAR MISS IS TOLD NOW. Running past the ride's face at speed used to be silence, so there was nothing to
      // correct — the same line caught it one attempt and missed the next with no word either way.
      const miss = wallRunMiss(player.root.position.x, player.root.position.z, vx, vz, panes);
      if (miss && performance.now() - rideMissAt > 1200) {
        rideMissAt = performance.now();
        flash(ctx, miss === 'slow' ? `TOO SLOW FOR THE ${ride.short} — hold the run into it`
          : miss === 'flat' ? `TOO FLAT FOR THE ${ride.short} — angle into its side`
          : `TOO SQUARE FOR THE ${ride.short} — cut across its face, do not hit it head-on`, 900);
      }
      return;
    }
    if (r.pane.side > 0 && r.wallRun) { startBusRun(ctx, r.pane, Math.hypot(vx, vz)); return; }   // THE BUS WALL RUN
    vectorAt = performance.now(); vectorWallRun = false;   // the tent's shallow hit is a rebound (the wall run is the bus's)
    player.root.position.x += r.pane.nx * GLASS.pushM; player.root.position.z += r.pane.nz * GLASS.pushM;
    stickReboundX = Math.sign(r.v.x);   // the next strides carry the reflected x until the stick says otherwise
    stickReboundUntil = performance.now() + 380;
    runUpPeak = Math.max(runUpPeak, Math.hypot(vx, vz));
    SoundKit.play('impact', { pitch: r.wallRun ? 1.2 : 1.5, volume: 0.45 }); ctx.feel?.impact?.(0.25); ctx.juice.flash('#a5f3fc', 50); ctx.camDirector.pulse(0.35, 0.3);
    EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(-r.pane.nx * 0.5, 1.2, -r.pane.nz * 0.5)), 'sparks');
    const what = r.pane.side > 0 ? ride.name : ride.kind === 'shuttle' ? 'THE STATION' : 'THE TENT';
    flash(ctx, `KICKED OFF ${what} — the jump carries it`, 700);
    console.info(`[DUNK-PARKOUR] rebound off ${what.toLowerCase()} at (${player.root.position.x.toFixed(2)}, ${player.root.position.z.toFixed(2)}) v (${vx.toFixed(1)}, ${vz.toFixed(1)})`);
  }
  /** Up the side of the hoopbus and along it: the run owns the body until the front end, where launchDunk takes it. */
  function startBusRun(ctx: ModeContext, pane: GlassPane, speed: number): void {
    if (busRun || busRan) return;
    busRun = { t: 0, s: alongPane(pane, player.root.position.x, player.root.position.z), pane, speed: Math.max(BUS_RUN.speedMin, speed) };
    runUpPeak = Math.max(runUpPeak, busRun.speed);
    endRunwayBeat(true); runwayBeat = null;
    playClip(runLoop(), { loop: true }); player.animator.setPlaybackScale(runLoop(), strideRate(busRun.speed)); setWin('run');
    SoundKit.play('impact', { pitch: 1.2, volume: 0.45 }); ctx.feel?.impact?.(0.25); ctx.juice.flash('#a5f3fc', 50); ctx.camDirector.pulse(0.35, 0.3);
    EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(-pane.nx * 0.5, 1.0, -pane.nz * 0.5)), 'sparks');
    flash(ctx, `WALL RUN ON ${ride.name} — off the front of it`, 800); ctx.setHud({ hint: `RUNNING THE ${ride.short} — the jump is at its front end` });
    console.info(`[DUNK-PARKOUR] bus wall run from s ${busRun.s.toFixed(2)} at (${player.root.position.x.toFixed(2)}, ${player.root.position.z.toFixed(2)}) ${busRun.speed.toFixed(1)} m/s`);
  }
  function busRunTick(ctx: ModeContext, dt: number): void {
    if (!busRun) return;
    busRun.t += dt; busRun.s += busRun.speed * dt;
    const p = busRunPose(busRun.pane, busRun.s, busRun.t);
    player.root.position.set(p.x, p.y, p.z);
    faceVel(new Vector3(p.fx, 0, p.fz).scale(busRun.speed), dt);
    player.root.rotation.z = BUS_RUN.bank * Math.min(1, busRun.t / BUS_RUN.riseSec);   // banked into the panels (the bus is on his left)
    runwayVel.x = p.fx * busRun.speed; runwayVel.z = p.fz * busRun.speed;
    if (busRunDone(busRun.s, busRun.t)) launchDunk(ctx);
  }
  /** Park a prop across a corner pane: its long side on the pane's line, its body behind it. */
  function parkOnPane(root: TransformNode, pane: GlassPane, longM: number): void {
    const { min, max } = root.getHierarchyBoundingVectors(true);
    const ex = max.x - min.x, ez = max.z - min.z;
    const longIs = ex >= ez ? 'x' : 'z';
    const k = longM / Math.max(0.01, longIs === 'x' ? ex : ez);
    root.scaling.setAll(k);
    const wide = (longIs === 'x' ? ez : ex) * k;
    const tx = -pane.nz, tz = pane.nx;
    root.rotation.y = Math.atan2(tx, tz) + (longIs === 'x' ? Math.PI / 2 : 0);
    root.position.set(pane.cx - pane.nx * (wide / 2 + 0.05), -min.y * k, pane.cz - pane.nz * (wide / 2 + 0.05));
  }
  // THE SIGN + BILLBOARD over the tent came out 2026-09-18 (owner: "remove the sign, keep the bus"); the corner oop plays off the bus.
  let stickReboundX = 0, stickReboundUntil = 0;
  let launchSpeed01 = 0;                      // run-up speed as a 0..1 budget input
  let launchTag = '';                          // JUDGE TRANSPARENCY: the takeoff the panel saw (SPEED LAUNCH / POWER LAUNCH / BILLBOARD REBOUND → … / CORNER WALL RUN → …)
  let obstacleClipped = false;                // caught the prop mid-flight — the dunk is dead
  let toppling = false;                       // the prop goes over with you
  const usedCombos = new Set<string>();       // variety memory: "style_prop" combos thrown
  let round = 1, dunkInRound = 0;
  let night = 1;                              // TRY-ONBOARD G1: which card of a continuous Flight Night this is
  let playerTotal = 0, rivalTotal = 0, hype = 0, chain = 0;
  // THE CARD (2026-09-13, owner: "in multiplayer we should see other peoples dunk and score"). A challenge
  // has only ever carried a NUMBER — CompetitionMatch stores player1Score/player2Score and nothing else — so
  // staking a run against somebody told you they got 214 and not one thing about what they threw. The card
  // is the description of each attempt, small enough to ride in the JSON payload MatchEvent already has.
  let card = emptyCard();
  let makes = 0, misses = 0, bestChain = 0;   // PACK #3: the proof card's make/miss line
  /** Every card the player has posted tonight — P8: the standard the rival is watching, not just the scoreboard. */
  const playerCards: number[] = [];
  /** The player's average card so far (0 before the first one). */
  const playerPace = (): number => (playerCards.length ? playerCards.reduce((a, c) => a + c, 0) / playerCards.length : 0);
  let lastScores: JudgeScore[] = [];
  let finishing = false;
  let ended = false;                          // soft-OPEN #3: ctx.end / resultSink once — the watchdog and rivalRound's own end can both reach advanceAfterRivalTurn
  let rivalClipToken = 0;                     // soft-OPEN #3: the rival's clip chains carry the same token guard as the player's
  let rimCamCut = false;                     // broadcast cut latch (per attempt)
  let verdictCamSet = false;                 // the portrait for the confer, placed once per attempt
  let rivalCamCut = false;
  let runHeld = 0;                           // the RUN trigger's LIVE value: a hold that began before the runway opened still counts
  let runPressWas = false;                   // MECHANICS PASS: the RUN hold's press edge (a held trigger streams values)                   // the rival's own broadcast cut, once per his turn
  let hangSlowMoLatch = false;               // JuiceKit.slowMo once per attempt (hang only)
  let contactLatch = false;                  // contactPunch once per attempt (the make's flush frame)
  // ── DUNK-BODY-MID (2026-09-09): the SLAM input contract ──────────────────────────────────────────────────────────
  // A IS THE SLAM BUTTON, and the slam window is 0.24–0.28 clip seconds wide (0.28 base, taxed by every trick) around
  // clip 1.25 — about 14 rendered frames. Before this a press that arrived even three frames early was simply DROPPED,
  // and if a d-pad direction was still held from the trick it had just thrown, that press was spent as a SECOND trick
  // and came back as a refusal banner. Measured on the eye's dump at 99109f7: the windmill fired at clip 0.83, the slam
  // press landed at 0.93 (0.20 s before the window opened at 1.13), the recognizer read it as another windmill, the air
  // budget refused it — `[DUNK-CUE] refused windmill @0.93: air` — and the flight resolved as "WINDMILL — MISSED".
  // The trick had landed. The slam was never seen. Now: the SLAM CUE opens a buffer's width before the window, a press
  // inside it is HELD and fires on the frame the window opens (scored as the early press it was), and a press that
  // resolves to a trick which cannot fire falls through to that buffer instead of a banner.
  const SLAM_BUFFER_SEC = 0.22;              // how early a SLAM press still counts (clip seconds) — the least; slamBufferSec reaches back to the top of the arc
  const SLAM_APEX_T = arcApexT(EASTBAY_TIMING.duration, PLANT_SEC, ARC_TOP_FRAC);   // clip 0.70: the top of the jump the runway hint names (98 % of the height; the apex is 0.80)
  let slamBufferAt = -1;                     // clip second of a SLAM press waiting for the window (−1 = none)
  let slamSeen = false;                      // an A press reached the flight at all (the miss banner names WHAT missed)
  let slamCueOn = false;                     // the SLAM read is up: the buffer's edge through the window's close
  let beatCalled = false;                    // the NOW! call fires once a flight, ON the beat the card scores against
  // ── A+ P8 athlete hands ──
  const arms: { Left: ArmChain | null; Right: ArmChain | null } = { Left: null, Right: null };   // H1: built once at spawn
  let handIkT = 0;                            // H1: 0..1 ease of the wrist reach
  let handIkObs: Observer<Scene> | null = null, ikScene: Scene | null = null;
  const handIkTarget = new Vector3(), handIkPole = new Vector3();
  let clipToken = 0;                          // H5: a superseded clip's onEnd chain is dead (Babylon fires it on stop() too)
  // ── DUNK-HANDS-RIM (2026-09-08): the hands and the rim ──
  // Measured on 7a4cb80 (probe _dunk-hands-rim-probe, six makes): the flight parks the root 0.6 m in front of the rim, out of
  // the arm's reach — the ball hand never got nearer than 0.37 m to the iron at the jam's 0.95 weight, the ball left the palm
  // there and LERPED the last 0.45 m on its own (24–27 floating frames), and CONTACT (the hit-stop, the thud, the hoop) fired
  // when the ball was through the NET, 470 ms after the press (1150 ms with the windmill's sweep). Now the ball rides the
  // palm into the iron: the wrist target LAGS in (τ WRIST_LAG_TAU), the jam weight eases up (jamWeight), the root follows
  // through JAM_FOLLOW_M, the ball lets go on the frame it meets the ring (ironContact, or the short timeout) and THAT is the
  // contact beat — the punch, the ring's dip, the net. SLAM held through the contact is a real rim hang (hangHold).
  const lagTarget = new Vector3(), _reachT = new Vector3(); let lagLive = false;   // H1: the reach point the wrist trails — seeded from the clip's own hand when the reach comes on
  let jamSec = -1;                            // seconds into the JAM (the press, or the windmill's release) — −1 outside it
  let jamContact = false;                     // the ball met the iron this attempt (released there, CONTACT fired)
  // DUNK-BALL-ARMS-RIM (2026-09-14): the make's ball goes over the lip and DOWN THROUGH the ring (RimFlush), out of the net to the
  // floor; from there — and after a clank — it is a LOOSE ball the sim keeps bouncing through the replay's aftermath, the judges
  // and the rival's turn. Measured on 8586f1e: the old lerp slid the ball through the iron and parked it, still, 0.6 m under the
  // ring for 74–171 frames; a miss froze mid-bounce 0.4–0.9 m off the floor the moment the attempt ended.
  let flush: FlushState | null = null, looseBall = false;
  const jamPrevBall = new Vector3(); let jamPrevLive = false;   // last jam frame's ball (the swept touch)
  let punchPending = false;                   // a jam that timed out lets go short of the iron: the CONTACT beat waits for the ball to meet it
  const FLUSH_BEAT_SEC = 0.47;                // the verdict's beat after the contact (the old flush's length — the replay and the card keep their timing)
  let hangOn = false, hangHeldSec = 0;        // the rim hang: SLAM held through the contact — the body stays on the rim, the ring stays pulled
  // The follow-through + the pull-up: measured after the first pass (JAM_FOLLOW 0.2, no lift) the hand still stopped 0.33 m off
  // the iron at a full reach and a late press met the ring from 0.28 m UNDER it (root y 0.95). A dunker pulls himself up on the
  // iron: the root eases to JAM_Y (only ever up) and 0.3 m further in over the jam — from there the arm reaches the ring.
  const JAM_FOLLOW_M = 0.3, JAM_FOLLOW_TAU = 0.07, JAM_Y = 1.15, JAM_LIFT_TAU = 0.08, JAM_DROP_TAU = 0.1, JAM_Y_LEFT_EXTRA = 0.15;
  const RIM_RADIUS = 0.225;
  let airHeld = false;                        // H5: an aerial clip (finish / trick) holds its last frame until feet-down
  let landingClip: string = SPORT_CLIP.dunkLandCrouch;   // H5: the land clip feet-down plays (a make picks it from the score)
  let aerialClip: string = SPORT_CLIP.dunkScoreHang;     // the finish chosen at resolve (the replay re-plays it)
  let dropToFloor = false;                    // H5: the root falls to the floor (a miss from the release; a make after the replay)
  let replayClipNow = 0;                      // DUNK-BALL-ARMS-RIM: the replayed flight's clip second (the reach gate)
  let replaying = false, replayAir = false, replayAerial = false, replayAirSec = 0, replayAerialAt = 0, replayPrevY = 0;   // H5: replay re-drive
  let launchRealMs = 0, resolveRealMs = 0, clipTimeAtResolve = 0;   // the live flight's real timing, for the replay's clip rate
  /** The contact and the ball through the net, on the recorder's clock (seconds). The replay ends on the net —
   *  everything after it is the body parked at rim height for the verdict beat, which played back as a motionless
   *  hero (measured: 0.9 s of it, arms inside a centimetre). 0 = it did not happen this attempt. */
  let flushRealSec = 0, netRealSec = 0;
  const rim = new Vector3(0, CFG.rimHeight, CFG.rimZ);
  const ebState = { inLeftHand: false };
  let stickX = 0, stickY = 0;
  // DUNK-SOFTS-NAMED (2026-09-08): the d-pad direction as it is physically held (any phase) and a trick button tapped before
  // the rise, kept for the rise — a direction held from the run-up or a tap as the feet left the floor was a silent nothing
  let heldDpad: 'up' | 'down' | 'left' | 'right' | null = null;
  let heldDpadKey = false;   // DUNK-GLASS-BOUNCE: the keyboard's arrows are the L stick (ArrowUp = run) — they never pick a runway variant
  let dpadPick: { dir: 'up' | 'down' | 'left' | 'right'; fired: boolean } | null = null;   // a pad d-pad held in the approach: the prop cycles on its RELEASE unless Y threw a variant under it
  // DUNK-BIOMECH (2026-09-08): a trick pressed before its cue beat is ARMED and fires on the beat (it replaces the pre-rise
  // queue: every trick has a named beat now, not just "the rise"); the 360's turn is a yaw LAYER on the hips the mode drives
  // from the cue (DunkSpin) — never authored into a clip, so no crossfade can leave it half-turned at the slam
  let armedAir: DunkTrick | null = null;
  const spin = new DunkSpin();
  let hipsNode: TransformNode | null = null, hipsBf: BindFrame | null = null;
  const hipsBindInv = Quaternion.Identity(), hipsRaw = Quaternion.Identity(), hipsOut = Quaternion.Identity(); let hipsLayered = false;
  let liveTricks: { clip: string; t0: number; speed: number }[] = [], liveSpin = { turns: 0, from: 0, until: 0 };   // this attempt's air tricks, for the replay
  // ── DUNK-POSTURE (2026-09-08): the Posture Poses layer — see core/DunkPosture.ts ──────────────────────────────────
  // The clips key the hips and ONE spine bone: the thoracic chain, the clavicles and the head were never authored and held
  // whatever the run loop last left them (a mid-stride twist) for the whole flight. This layer owns them per window,
  // squares the chest to the rim (the spin subtracted), puts the eyes on the iron and strips the clip's own hip yaw.
  interface PpNode { n: TransformNode; raw: Quaternion; out: Quaternion; layered: boolean; bindChain: Quaternion }
  let ppFrame: TransformNode | null = null;
  const ppNodes: { spine: PpNode | null; spine1: PpNode | null; spine2: PpNode | null; neck: PpNode | null; head: PpNode | null; Left: PpNode | null; Right: PpNode | null; offArm: PpNode | null } = { offArm: null, spine: null, spine1: null, spine2: null, neck: null, head: null, Left: null, Right: null };
  const llNodes: { LeftFoot: PpNode | null; RightFoot: PpNode | null; LeftToeBase: PpNode | null; RightToeBase: PpNode | null } = { LeftFoot: null, RightFoot: null, LeftToeBase: null, RightToeBase: null };
  const llPitch = { Left: 0, Right: 0 };   // the eased ankle correction per side (rad)
  let ppSign: 1 | -1 = 1;                     // world yaw per frame-space yaw (−1 under a mirrored import root)
  let ppPose: PosturePose = clonePose(POSTURE.stance), ppWindow: PostureWindow = 'stance', ppTrick: string | null = null;
  // DYNAMIC POSTURE on the RUNWAY only. The flight windows are choreography — rise / hang / extend / jam / brace
  // are paced to the flight clock and DynamicPosture's allowlist refuses them — but the approach is locomotion:
  // it ramps up to speed and it strafes between the obstacles, so it should lean and bank like a body running.
  const runMotion = new BodyMotion();
  /** This frame's runway velocity, for the posture tracker (the flight writes nothing here). */
  const runwayVel = { x: 0, z: 0 };
  let ppAim = 0, ppHeadYaw = 0, ppHeadPitch = 0, ppClipHipYaw = 0, ppChestYaw = 0;   // smoothed corrections (rad) and the readouts
  let ppOverride: PosturePose | null = null;  // dev probes: a stance forced on the rig (calibration)
  let replayRateNow = 0.5, replayTrickIdx = 0, replaySpinYaw = 0;
  let lookX = 0, lookY = 0, lookSeen = false; // R stick → the director's look orbit (Dunk play tip 2026-09-07)
  let holdRunSpeed = 0, airLean = 0;          // pad: hold-run speed this attempt; smoothed air lean from the stick
  const flight = new DunkFlight();               // Phase 6: trick-input flight
  const reveal = new ScoreReveal();              // Phase 7: staged judge reveal
  const crowd = new CrowdEnergy();               // Phase 7: building voice
  let revealed: JudgeScore[] = [];               // cards shown so far
  let momentum = new MomentumBus();            // Phase 6: shared Game-Breaker
  // YOUR TRACK IS WHAT PLAYS WHEN YOU WALK OUT.
  //
  // The Music Room brief names this as the first of three bindings and says, in capitals, that the room is
  // not the point without them. It was never built: before today DunkMode referenced WalkOut zero times and
  // `musicCredential` was consumed by nothing but its own test. The producer shipped; the consumer did not.
  //
  // The audio is the library's own rendered mixdown -- synthesised by SynthKit, so there is nothing
  // licensed here and nothing to ship. `resolveWalkOut` decides whether there is anything to play at all
  // (the song can have been deleted after it was chosen); this end only owns the element.
  let walkOut: WalkOut | null = null;
  let walkCue: WalkOutCue | null = null;
  let walkAudio: HTMLAudioElement | null = null;
  let walkCounted = false;                       // one play per night, counted when audio actually starts
  function startWalkOut(): void {
    if (!walkCue || typeof Audio === 'undefined') return;
    try {
      if (!walkAudio) { walkAudio = new Audio(walkCue.src); walkAudio.loop = true; walkAudio.volume = 0.45; }
      void walkAudio.play().then(() => {
        // COUNTED WHERE IT HAPPENS, and only if it actually started. An autoplay block is not a play, and
        // an engagement number that counts intentions is not an engagement number.
        if (walkCounted || !walkOut) return;
        walkCounted = true;
        walkOut = countPlay(walkOut); saveWalkOut(walkOut);
        StudioLibrary.countPlay(walkCue!.songId);
      }).catch(() => { /* autoplay refused until a gesture — the contest is not worse for it */ });
    } catch { /* no audio on this device */ }
  }
  function stopWalkOut(): void {
    if (!walkAudio) return;
    try { walkAudio.pause(); walkAudio.currentTime = 0; } catch { /* already gone */ }
  }
  // WHAT THIS DUNK COST YOU TO GET. Three attempts, a growing penalty, and an optional called shot
  // (owner decisions, 2026-09-14). The rules live in core/DunkStakes.ts, including the invariant that
  // calling must never be strictly better than not calling; this end only holds the ledger and the input.
  let stakes: Stakes = freshStakes();
  // WHO YOU ARE FACING TONIGHT. The rival was situational (RivalNerve) but never SOMEBODY -- no name, no
  // style, nothing that changed when you came back. The roster walks rather than rolls, so night 2 is a
  // different opponent instead of a coin-flip that can hand you the same one twice.
  let foe: DunkRival = rivalForNight(1);
  let trickLabels: string[] = [];                // this attempt's thrown tricks
  // TV MODE (CONTROLLER-UNIVERSAL-MULTI, 2026-09-14). Mirroring to a TV delays the PICTURE, not the pad, so a player who
  // presses on what they see presses late. The host's TV MODE toggle widens the slam window by the display factor
  // (tvMode.ts, 1.35x) exactly as 3PT widens its release bands. Read once per jump at takeoff, never inside one — and
  // 1.0 with TV MODE off, so the direct-display window is the tuned 0.28 s byte for byte. Every read of the base window
  // (open/close, the scoring half, the hang pace to the resolve) goes through the one helper so they cannot disagree.
  let tvFactor = 1;
  function slamWindowBase(): number { return CFG.qteWindowSec * tvFactor; }

  function setPhase(p: Phase): void { phase = p; phaseSec = 0; if (typeof window !== 'undefined' && (window as { __FEL_QA__?: unknown }).__FEL_QA__) console.info(`[DUNK-PHASE] ${p}`); }   // QA trace only (agent bridge on)
  function setWin(w: Win): void { if (win === w) return; win = w; console.info(`[DUNK-WIN] ${w}`); }
  // DUNK-SOFTS-NAMED (2026-09-08): ONE banner channel. Every banner used to be `setHud({ banner }) + setTimeout(clear)`, so
  // a stale timeout from an earlier flash blanked whatever came after it (measured: LOST THE SELF-LOB's 1.2 s clear landed
  // on the MISSED verdict; a trick flash's clear cut the make's name). A flash clears only itself; a held line stays until
  // the next banner replaces it.
  let bannerSeq = 0;
  function flash(ctx: ModeContext, text: string, ms = 0): void {
    const id = ++bannerSeq;
    ctx.setHud({ banner: text });
    if (ms > 0) setTimeout(() => { if (id === bannerSeq) ctx.setHud({ banner: '' }); }, ms);
  }
  function clearBanner(ctx: ModeContext): void { bannerSeq++; ctx.setHud({ banner: '' }); }
  /** A press that cannot do what it asked says why — never a silent nothing. */
  function refuse(ctx: ModeContext, why: string): void { SoundKit.play('uiTick', { pitch: 0.6, volume: 0.35 }); flash(ctx, why, 700); }
  /** This attempt's named tricks, runway first — the flash, the make and the miss all read the same name. */
  const namedTricks = (): string => [...runwayLabels, ...trickLabels].join(' → ');
  /** The takeoff line for this attempt: the plain runway's gather line, or the obstacle's own (a car is a long jump). */
  const gatherLine = (): number => { const k = obstacleKindOf(prop); return k ? rim.z + OBSTACLE_SPECS[k].takeoffFromRim : CFG.gatherZ; };
  /** THE GATHER STRIDE as the lob timing sees it (the run eases to the flight's carry over the last stride). */
  const gatherStrideSpec = (): GatherStride => ({ strideSec: GATHER_STRIDE_SEC, minM: GATHER_MIN_M, easeSec: GATHER_EASE_SEC, carryMps: Math.abs(rim.z + FLUSH_Z_AHEAD - gatherLine()) / Math.max(0.2, EASTBAY_TIMING.extend - PLANT_SEC) });
  /** Where the flight lands the body at the flush: the rim's front edge. */
  const FLUSH_Z_AHEAD = 0.6;
  const ballHandNode = (): TransformNode | null => boneNode(player.skeleton, ebState.inLeftHand ? 'LeftHand' : 'RightHand');
  const feetY = (): number => {
    let y = player.root.position.y;
    for (const f of [feet.L, feet.R]) if (f) { f.computeWorldMatrix(true); y = Math.max(y, Math.min(y + 2, f.getAbsolutePosition().y)); }
    // the lowest foot, never below the root: the feet are what clears the mesh
    let lo = Infinity;
    for (const f of [feet.L, feet.R]) if (f) lo = Math.min(lo, f.getAbsolutePosition().y);
    return Number.isFinite(lo) ? Math.max(player.root.position.y, lo - 0.05) : y;
  };

  // ── Dunk play tip (2026-09-07): camera-relative stick, facing from velocity ──
  /** The L stick as a world velocity: up = the camera's flat forward, right = its flat right, magnitude = speed. */
  function stickVel(ctx: ModeContext): Vector3 {
    const mag = Math.hypot(stickX, stickY);
    if (mag < 0.08) return Vector3.Zero();
    const k = (mag > 1 ? 1 / mag : 1) * APPROACH_SPEED;   // a keyboard diagonal is (1, 1) — cap the magnitude at one stick
    const f = ctx.camDirector.forwardFlat(), r = ctx.camDirector.rightFlat();
    return new Vector3((r.x * stickX - f.x * stickY) * k, 0, (r.z * stickX - f.z * stickY) * k);   // up is −y on every source
  }
  /** HOOPS-DEPTH S1: the approach's locomotion model — the hoops gears (walk under `walkStick`, jog, HOLD = sprint), the
   *  loaded first step, the stop that scales with pace and the cut cost, on the dunk's own top speed. `stickVel` gives the
   *  camera-relative WORLD intent; the model takes stick space (+Y = −Z), so the world vector is folded back through the
   *  same top speed. Reset with the attempt (`approachMove.stop()`). */
  const approachMove = new CourtMovement({ ...DEFAULT_MOVEMENT, maxSpeed: APPROACH_SPEED, gears: GEARS_HOOPS, cutCost: CUT_COST_HOOPS });
  function approachStep(stickWorld: Vector3, dt: number): Vector3 {
    const st = approachMove.update(dt, stickWorld.x / APPROACH_SPEED, -stickWorld.z / APPROACH_SPEED, runHeld > 0.02);
    return st.vel;
  }
  /** Face the way we move (OneVOne / KarateEndless); a still hero keeps his last heading. Slewed at TURN_RATE (shortest
   *  arc) so a flick is a turn, not a snap. The root yaws by Euler — a rotationQuaternion (the replay's) would silently
   *  win over rotation.y, so it is cleared here. */
  function faceVel(v: Vector3, dt: number): void {
    if (v.x * v.x + v.z * v.z < 0.05) return;
    if (player.root.rotationQuaternion) player.root.rotationQuaternion = null;
    const want = Math.atan2(v.x, v.z);
    const d = Math.atan2(Math.sin(want - player.root.rotation.y), Math.cos(want - player.root.rotation.y));
    player.root.rotation.y = wrapYaw(player.root.rotation.y + Math.sign(d) * Math.min(Math.abs(d), TURN_RATE * dt));
  }
  /** Ease the Euler yaw toward a world point (k = fraction this frame). */
  function faceToward(target: Vector3, k: number): void {
    const want = Math.atan2(target.x - player.root.position.x, target.z - player.root.position.z);
    let d = want - player.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));   // the short way round
    player.root.rotation.y = wrapYaw(player.root.rotation.y + d * Math.min(1, k));
  }

  function clearProps(): void {
    obstacle?.dispose(); obstacle = null; obstacleToken++;
    // THE DISAPPEARING BALL (owner, 2026-09-19: "the ball needs to not glitch and disappear").
    // The oop passer holds the contest ball in his hand — the ball mesh is PARENTED to his hand bone — and disposing a
    // node in Babylon disposes its descendants. So every prop change that cleared the passer disposed the ball with
    // him, and the re-attach on the next line ran against a dead mesh. Measured with the dunk lab: on oopglass,
    // oopbounce, oopcorner and oopalien the scene held NO mesh named 'ball' for the whole attempt (343 of 343
    // samples), while plain and obstacle props — which have no passer — were clean.
    // Detach first: setParent(null) keeps the ball's world transform, and setupProp hands it back to the player.
    if (teammate && ball) releaseBall(ball);
    teammate?.dispose(); teammate = null;
  }

  async function setupProp(ctx: ModeContext): Promise<void> {
    clearProps();
    dribble?.update(0, 0, false); gatherLatched = false; gatherStride = false;
    if (!lob.live && ball && player) attachBallToHand(ball, player.skeleton, 'RightHand');   // DUNK-SOFTS-NAMED: a prop change hands the ball back (the passer had it)
    const kind = obstacleKindOf(prop);
    if (kind) {
      const token = ++obstacleToken;
      try {
        const o = await spawnDunkObstacle(ctx.scene, kind, rim, 'dunk_obstacle', CFG.heroUrl);   // the TETRIS stack uses the game's own bodies
        if (token !== obstacleToken || ctx.scene.isDisposed) { o.dispose(); return; }   // the prop changed under the load
        obstacle = o;
      } catch { /* scene gone */ }
      return;
    }
    if (prop === 'oopalien') {   // THE ALIENS THROW IT (owner, 2026-09-18: "lob from the aliens") — no passer stands on the floor;
      // the ball waits in the saucer's belly port until the rise
      releaseBall(ball); ballSim.stop();
      ball.position.set(skyRoot ? skyRoot.position.x : 0, SKY.underY - 0.18, skyRoot ? skyRoot.position.z : gatherLine() - SKY.zAhead);
      ball.setEnabled(true);
      console.info('[HANDS] ball → the saucer');
      return;
    }
    if (isOop(prop)) {   // every oop variant needs the passer standing there
      const token = ++obstacleToken;
      const npc = await CharacterPipeline.spawnNpc(ctx.scene, CFG.heroUrl, {
        // the billboard oop's passer stands on the RUNWAY side of the line near the centre: the corner signs face up the runway, and
        // from the rim side there is no bank (the solve refuses a throw from behind the face)
        position: prop === 'oopcorner' ? new Vector3(4.0, 0, gatherLine() + 5.0) : new Vector3(-3.4, 0, CFG.rimZ + 1.6), tint: '#22d3ee', startClip: SPORT_CLIP.teammateIdle,   // the billboard oop: down the left side, so the mirror line meets the sign near its centre (from x −1.2 it crossed 3 m off it, measured)
      });
      if (token !== obstacleToken || ctx.scene.isDisposed) { if (ball) releaseBall(ball); npc.dispose(); return; }   // the prop changed under the load — never let the passer take the ball with him
      teammate = npc;
      neverBindPose(teammate.animator, SPORT_CLIP.teammateIdle);
      installSafePlay(teammate.animator, 'dunk-teammate');
      // DUNK-SOFTS-NAMED: the passer holds the ball from the moment he is picked — the dunker runs up empty-handed and the
      // ball never jumps to the far palm at the takeoff (it sat in the dunker's hand until the launch frame: a 3.4 m pop)
      if (!lob.live && (phase === 'approach' || phase === 'charge')) { attachBallToHand(ball, teammate.skeleton, 'RightHand'); console.info('[HANDS] ball → passer'); }
    }
  }

  const def: ModeDefinition = {
    modeId: 'dunk', mood: 'goldenHour', camPreset: 'contest',  // Phase 8: cinematic, not broadcast
    // CrowdEnergy owns this venue's voice (the hush before an attempt, the roar on a flush), which is
    // better than a meter-driven bed -- see ModeDefinition.ownsCrowd.
    ownsCrowd: true,

    async load(ctx: ModeContext) {
      // ONE BUS PER MOUNT, OWNED BY THE HARNESS. This mode built its own, which worked and was
      // INAUDIBLE: the crowd swell and the tier sting are bound to the harness's bus, and there was
      // exactly one onTierChange subscriber in the game. Same reports, same weights, now heard.
      momentum = ctx.momentum;
      // the walk-out is resolved ONCE at mount against the live library: a song deleted since it was
      // chosen resolves to null, and the card must not print a title nobody can hear.
      foe = rivalForNight(night);
      walkOut = readWalkOut(); walkCounted = false;
      walkCue = resolveWalkOut(walkOut, walkOut ? StudioLibrary.get(walkOut.songId) : null);
      // M74: try Nexus venue first; fallback to VenueKit if no spec
      dunkVenue = mountVenue(ctx, 'basketball_dunk', { keepGameplayCamera: true, location: ctx.location });
      if (!dunkVenue) { VenueKit.buildCourt(ctx.scene); applyOceanCourt(ctx.scene, 'venice'); }
      findGlass(ctx.scene);
      // DUNK PARKOUR: the corner props — the hoopbus across the right front corner, the event tent (with the scene's sign) across
      // the left; their faces are what the run rebounds off / wall-runs along (the pure panes in core/DunkParkour)
      for (const p of sideProps) p.dispose(); sideProps = [];
      panes = cornerPanes(GLASS.halfX, gatherLine());
      // THE SKY TIER: the court's own thing over the lane (a rocket in Orbit, a balloon at Blossom, …), its underside a surface for R1;
      // Venice hangs nothing (the blimp is out — owner: "the grey thing on top of the hoop, its an eye sore")
      skyRoot?.dispose(); skyTier = skyTierFor(ctx.location); skyRoot = skyTier ? buildSkyTier(ctx.scene, skyTier, gatherLine() - SKY.zAhead) : null; skyTapped = false;
      void readSeasonLane().then((lane) => { seasonLane = lane; console.info(`[DUNK-SEASON] lane ${lane} — specials ${specialOpen(lane) ? 'OPEN' : 'LOCKED'}`); ctx.setHud({ specials: specialOpen(lane) ? 'PRO' : 'LOCKED' }); });
      console.info(skyTier ? `[DUNK-SKY] ${skyTier.tag} over the lane (underside ${SKY.underY} m)` : '[DUNK-SKY] nothing over this lane');
      {
        const scene = ctx.scene; const loc = ctx.location;
        ride = cornerRideFor(loc);
        // ORBIT parks a SPACE SHUTTLE where every other court parks the hoopbus (owner, 2026-09-18: "make the bus a space shuttle
        // in the space one", then his own Meshy export: "swap that shuttle in for the other one" — baked to 6.4 m by scripts/meshy/bake-prop.py)
        const rideKey = ride.kind === 'shuttle' ? 'shuttle' : 'hoopbus';
        void spawnMeshyProp(scene, rideKey, null, `dunk_${rideKey}`).then((r) => { if (!r || scene.isDisposed) return; parkOnPane(r, panes[0], 6.4); sideProps.push(r); const { max } = r.getHierarchyBoundingVectors(true); console.info(`[DUNK-PARKOUR] ${rideKey} parked on the right corner (roof ${max.y.toFixed(2)} m)`); });
        if (ride.kind === 'shuttle') {   // ORBIT's other corner (owner, 2026-09-18: "replace the red tent with a space station")
          const st = buildSpaceStation(scene); parkOnPane(st, panes[1], 5.0); sideProps.push(st);
          console.info('[DUNK-PARKOUR] space station on the left corner');
        } else void SceneLoader.ImportMeshAsync('', '/models/props/racing/', 'tent.glb', scene).then((r) => {
          if (scene.isDisposed) { for (const m of r.meshes) m.dispose(); return; }
          const root = new TransformNode('dunk_tent', scene);
          for (const m of r.meshes) if (!m.parent) m.parent = root;
          for (const m of root.getChildMeshes()) { m.isPickable = false; m.receiveShadows = true; }
          parkOnPane(root, panes[1], 4.2); sideProps.push(root);
          console.info('[DUNK-PARKOUR] tent on the left corner (no sign)');
        }).catch((e) => console.warn('[DUNK-PARKOUR] tent did not load', e));
      }
      // spawnPlayer, not CharacterLibrary.spawn — this is the route that applies
      // the player's own identity: closet wardrobe colours, skin tone, and body
      // proportions from a body scan. Football, BoardRun and TimingSport all used
      // it; the dunk contest did not, so nothing a player picked in the Closet
      // ever showed up in the mode that IS the guest onboarding path. The kit
      // colours below stay as the designed fallback for anyone with no identity
      // saved (every guest on /try), and identity overrides them when there is
      // one. Now that the body is skinned, the scan's buildScale/reachScale
      // actually reshape the mesh instead of scaling rigid parts.
      player = await CharacterPipeline.spawnPlayer(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, 0, CFG.startZ), yawRad: Math.PI, startClip: SPORT_CLIP.idle,
        // The hero wears the player's SAVED look (appearanceBridge via the
        // shared spawn layer) — the hardcoded M110 kit is gone: 'use my skin'
        // means the Closet's skin plays.
      });
      neverBindPose(player.animator, SPORT_CLIP.idle);
      installSafePlay(player.animator, 'dunk-player');
      ring?.dispose(); ring = mountPlayerRing(ctx.scene, player.root, { color: '#ffd75e', icon: readPlayerIcon() });   // PLAYER RING: the contest's gold
      ctx.groundLock?.track(player.root, player.skeleton);
      // A+ P8 H1: the arm chains once (the eastbay's left hand carries the ball after the hand-off); the reach is applied
      // AFTER the clips evaluate, on top of the frame's pose — the slot the dribble's HandIK and foot planting use
      arms.Left = armChain(player.skeleton, 'Left'); arms.Right = armChain(player.skeleton, 'Right');
      if (!arms.Right) console.warn('[FEL-DUNK] no Right arm chain on this rig — the hang wrist reach is off');
      feet = { L: boneNode(player.skeleton, 'LeftFoot'), R: boneNode(player.skeleton, 'RightFoot') };   // DUNK-CONTROL-JUICE: the clear test's feet
      // DUNK-BIOMECH: the hips carry the trick spin as a yaw layer (bind-relative, the clips' own degree convention)
      hipsNode = boneNode(player.skeleton, 'Hips'); hipsBf = bindFrame(player.skeleton); hipsLayered = false;
      if (hipsNode) { const b = hipsBf.bind.get(hipsNode)?.q ?? Quaternion.Identity(); hipsBindInv.copyFrom(b).invertInPlace(); } else console.warn('[FEL-DUNK] no Hips node on this rig — the 360 turn is off');
      if (!feet.L || !feet.R) console.warn('[FEL-DUNK] no foot bones on this rig — the obstacle clear reads the root');
      setupPosture();   // DUNK-POSTURE: the thoracic chain, the clavicles and the head, and the frame's yaw sense
      if (ikScene && handIkObs) ikScene.onAfterAnimationsObservable.remove(handIkObs);
      ikScene = ctx.scene; handIkObs = ctx.scene.onAfterAnimationsObservable.add(handIkApply);
      // spawnNpc is explicit: the rival must NEVER wear the player's identity,
      // or you end up dunking against yourself.
      rival = await CharacterPipeline.spawnNpc(ctx.scene, CFG.heroUrl, {
        position: new Vector3(3.2, 0, CFG.rimZ + 3), startClip: SPORT_CLIP.idle,
        // Distinct baked body (elijah-rival.glb) — kit/skin/hair/shoes are in
        // the GLB. No jersey tint wash; that used to clone the hero as a twin.
      });
      neverBindPose(rival.animator, SPORT_CLIP.idle);
      installSafePlay(rival.animator, 'dunk-rival');
      ctx.groundLock?.track(rival.root, rival.skeleton);
      dunkVenue?.hidePlaceholders();  // M74: drop stand-ins now that real chars are in

      ball = MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, ctx.scene);
      (ball.metadata ??= {}).felPalmMirrorLeft = true;   // DUNK-BALL-ARMS-RIM: the left hand's palm is the right's mirror (ballRig.palmOffsetOf)
      void dressBall(ball, 'basketball');   // Meshy ball skin rides the physics sphere (visual only)
      ballSim = new BallSim(ball, 0.12);
      attachBallToHand(ball, player.skeleton, 'RightHand');
      // DUNK-POSTURE-LEGS (A2/A3): the runway is a DRIBBLE — the ball leaves the palm and bounces beside the runner, the ball arm
      // pumps on it (ballCarry, the 1v1's), gathered into two hands a stride before the plant. The runtime rig's right is its
      // local −x (the import mirror is reset at spawn) — ballCarry reads the side off the shoulder now (HOOPS-DEPTH S8), so the
      // bounce side is NOT negated here any more (it used to be, and 1v1 / 3v3, which were not, dribbled across the chest).
      dribble?.dispose();
      dribble = mountBallCarry({ scene: ctx.scene, ball, root: player.root, skeleton: player.skeleton, side: 'Right', params: { ...DEFAULT_DRIBBLE, hzIdle: 1.8, hzFast: 2.8 } });
      // DUNK-BALL-ARMS-RIM: the replay puts the ball back in what it rode — the hand it was in, the body while it dribbled
      replay = new DunkReplayRecorder(ctx.scene, player.root, ball, ctx.camera as never, () => (ball.parent ? ball.parent as TransformNode : dribble?.active ? player.root : null));

      ctx.camDirector.snapTo(player.root.position, rim);
      ctx.heroRef.current = player.root;
      ctx.objectiveRef.current = rim;
      SoundKit.startAmbient('stadium');
      EffectsKit.ambient(ctx.scene, 'venice');
      trail = EffectsKit.ballTrail(ctx.scene, ball); setTrail('soft');
      hoopJuice?.dispose(); hoopJuice = new HoopJuice(ctx.scene, rim);
      meter3d?.dispose(); meter3d = mountShotMeter3D(ctx.scene);
      // `dunkRival` because a probe cannot find the opponent by looking: the nearest body to the hero at floor height is
      // as often a courtside spectator, and one has been measured by mistake before. The mode knows which body it is.
      if (process.env.NODE_ENV === 'development') { const dev = (window as unknown as { __FEL_DEV__?: { hoopJuiceUsed?: unknown; dunkPosture?: unknown; dunkRival?: unknown } }).__FEL_DEV__; if (dev) { dev.hoopJuiceUsed = hoopJuice.used; dev.dunkPosture = postureDevHandle; dev.dunkRival = () => rival?.root ?? null; } }   // OOM-HYGIENE: the handle is gone once the harness is disposed (a load that resolves after an unmount)
      // Venice LOOK: KEEP/HIDE, palm tip ~10m, golden-haze (no GLB edits).
      // Court locations (docs/SPEC-COURT-LOCATIONS.md): the Venice look (golden sky, surround palms) is Venice's own —
      // under any other location the location's environment stands, so the pass steps aside.
      if (!ctx.location || ctx.location === 'venice') await applyVeniceDunkLookPass(ctx.scene);

      ({ night, round, dunkInRound, playerTotal, rivalTotal, makes, misses, bestChain } = firstNight());
      hype = 0; chain = 0; finishing = false; ended = false; rivalClipToken = 0; card = emptyCard();
      style = 'power'; prop = 'none'; rimCamCut = false; hangSlowMoLatch = false; contactLatch = false;
      styleTaps = 0; hangSec = 0; aHeld = false; usedCombos.clear(); momentum.reset(); flight.reset();
      runUpPeak = 0; launchSpeed01 = 0; obstacleClipped = false; toppling = false; gatherHeld = false; gatherTold = '';
      vectorAt = -1e9; vectorWallRun = false; doubleLaunched = false; doubleLaunchLift = 0; boardSwung = false; hangBase = null; swingAng = 0; skyTapped = false; boardTopFlip = false; boardRan = false; l1DownAt = -1; busRun = null; busLaunch = null; busRan = false;
        foe = rivalForNight(night);
    stakes = freshStakes();
      resetLob(); resetRunway(); win = 'run';
      setPhase('approach');
      startWalkOut();
      ctx.setHud({
        round: `${round}/${TOTAL_ROUNDS}`, dunkNum: `${dunkInRound + 1}/${DUNKS_PER_ROUND}`, nightCard: null, nightNum: night,
        score: playerTotal, rivalScore: rivalTotal, style: STYLE_LABEL[style], prop: propLabel(prop), hype: 0, chain: 0,
        // F4 (review): this was a 130-character run-on naming six controls. The first run needs two.
        hint: 'HOLD to run · tap JUMP at the line — then SLAM on NOW!',
        // one line, phrased by the module: a mode must not invent its own wording for somebody's track
        walkOutNow: walkOutLine(walkCue),
        attempt: stakesLabel(stakes, calledLabel()),
        rivalName: foe.name,
      });
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }
      if (e.t === 'dpad') { if (e.pressed) { heldDpad = e.dir; heldDpadKey = e.src === 'key'; } else if (heldDpad === e.dir) heldDpad = null; }
      if (e.t === 'stick' && e.side === 'R') { lookX = e.x; lookY = e.y; if (!lookSeen && (Math.abs(e.x) > 0.12 || Math.abs(e.y) > 0.12)) { lookSeen = true; console.info('[LOOK] R stick live'); } }   // LOOK: read at last (it was emitted and dropped)

      // TRY-ONBOARD G1: on a CONTINUOUS night the card is a beat, not a wall — any
      // button on it is GO AGAIN. Nothing else in the mode reads input here, so the
      // gate returns: a stale hold or a d-pad direction never leaks into night N+1.
      // (START never reaches a mode — the harness spends it on pause.)
      if (phase === 'contestOver') {
        // …but not on the button that was already travelling. A guest ends their last
        // dunk mashing SLAM, and without this the card is dismissed by a press thrown
        // before it existed — the one screen that tells them how the night went, gone
        // in the same frame it arrived. The card has to be READ before it can be left.
        if (e.t === 'button' && e.pressed && phaseSec >= CARD_SETTLE_SEC) goAgain(ctx);
        return;
      }

      // SCORECARD CONTROLS, ROUND 2 (2026-09-15). The contest's OWN waiting phases answered nothing: SLAM and a trick
      // direction pressed while the judges scored, through the replay, or on the rival's turn went into the floor — 4 of
      // 18 SLAM presses and 3 of 8 d-pad presses silent in the rc13 capture, and nothing on screen tells the player the
      // contest simply is not his right now. RUN already said this (the trigger path below); now every input does.
      if ((e.t === 'button' || e.t === 'dpad') && e.pressed && (phase === 'rivalTurn' || phase === 'judging' || phase === 'resolve')) {
        refuse(ctx, phase === 'rivalTurn' ? "RIVAL'S TURN" : 'THE JUDGES ARE SCORING');
        return;
      }
      // A trick direction belongs to the FLIGHT; on the runway the d-pad is the prop picker, and it fires on the release.
      // Tapped during the run-up it can pick nothing, so it says where tricks live instead of going quiet.
      if (e.t === 'dpad' && e.pressed && phase === 'charge') refuse(ctx, 'TRICKS IN THE AIR — PICK THE PROP BEFORE THE RUN');

      // SCORECARD CONTROLS (2026-09-15): the STYLE and PROP pickers belong to the runway; pressed anywhere else they did
      // nothing and said nothing (2 of 9 presses each in the rc14 capture)
      if (e.t === 'button' && (e.btn === 'B' || e.btn === 'X') && e.pressed && phase !== 'approach' && phase !== 'cinematic' && !qteWindowOpen) {
        refuse(ctx, e.btn === 'B' ? 'PICK THE STYLE ON THE RUNWAY' : 'PICK THE PROP ON THE RUNWAY');
      }
      if (e.t === 'button' && e.btn === 'B' && e.pressed && phase === 'approach') {
        style = STYLES[(STYLES.indexOf(style) + 1) % STYLES.length];
        ctx.setHud({ style: STYLE_LABEL[style] });
        SoundKit.play('uiTick');
      }
      // CALL YOUR DUNK (owner decision: optional, with a bonus). Land what you called and the panel pays
      // more; fail it and it costs more than never calling.
      //
      // L1, NOT A FACE BUTTON. All four faces are spoken for on the runway — A jumps, B cycles the style,
      // X picks the prop, and Y is the SELF-LOB runway trick (line ~655, `phase === 'approach' && btn ===
      // 'Y'`). Putting the call on Y would have fired both the call and the lob off one press. L1 is read
      // nowhere in this mode.
      //
      // The cycle passes through NOT CALLED on its way round, so backing out is one more press rather than
      // a trap: a player who scrolls past the one they wanted can reach "no call" again without taking a
      // run they did not want to take.
      if (e.t === 'button' && e.btn === 'L1' && e.pressed && phase === 'approach') {
        const i = stakes.called ? DUNK_TRICKS.findIndex((t) => t.id === stakes.called) : -1;
        const next = i + 1 >= DUNK_TRICKS.length ? null : DUNK_TRICKS[i + 1].id;
        stakes = callTrick(stakes, next);
        ctx.setHud({ attempt: stakesLabel(stakes, calledLabel()) });
        // the bet is PRICED now, not dared -- see DunkStakes.callPreview
        flash(ctx, stakes.called ? callPreview(calledLabel()) : 'NO CALL', 1100);
        SoundKit.play('uiTick', { pitch: stakes.called ? 1.3 : 0.9 });
      }
      // d-pad cycles PROP during approach (up=none, right=alley-oop,
      // down=obstacle); the SAME d-pad, held during the mid-air cinematic
      // phase, arms a TRICK COMBO instead — two different jobs on two
      // different phases, never both at once.
      // Pad: X cycles the prop the way the d-pad picks it — one button, no dead bind on the diamond.
      if (e.t === 'button' && e.btn === 'X' && e.pressed && phase === 'approach') {
        prop = PROPS[(PROPS.indexOf(prop) + 1) % PROPS.length];
        while (prop === 'oopalien' && skyTier?.kind !== 'saucer') { refuse(ctx, 'NO ALIENS OVER THIS COURT'); prop = PROPS[(PROPS.indexOf(prop) + 1) % PROPS.length]; }
        while (SPECIAL_PROPS.has(prop) && !specialsOpen()) { refuse(ctx, specialLockLine(prop as 'kangaroo')); prop = PROPS[(PROPS.indexOf(prop) + 1) % PROPS.length]; }   // SEASON SPECIALS
        ctx.setHud({ prop: propLabel(prop) });
        SoundKit.play('uiTick', { pitch: 1.3 });
        void setupProp(ctx);
      }
      // Keyboard hotfix (2026-09-07): the arrows are the L stick now (InputBus) — ArrowUp RUNS at the rim, it no longer
      // picks the prop; the pad's d-pad, the touch d-pad and X still do. The keyboard arrows keep arming the mid-air
      // trick direction below (flight.feedInput sees every d-pad event), so nothing on the keyboard is lost.
      // DUNK-GLASS-BOUNCE: the pick lands on the d-pad's RELEASE — a direction HELD while Y is tapped throws that variant standing
      // (up = off the glass, down = the bounce lob, onto the prop when one stands there) and leaves the prop alone
      if (e.t === 'dpad' && e.pressed && e.src !== 'key' && phase === 'approach') dpadPick = { dir: e.dir, fired: false };
      if (e.t === 'dpad' && !e.pressed && e.src !== 'key' && dpadPick && dpadPick.dir === e.dir) {
        const pick = dpadPick; dpadPick = null;
        if (!pick.fired && phase === 'approach') {
          prop = e.dir === 'up' ? 'none' : e.dir === 'right' ? nextOop(prop) : e.dir === 'left' ? nextLobProp(prop) : nextObstacle(obstacleKindOf(prop));   // left cycles SELF-LOB → OFF THE GLASS → BOUNCE LOB
          while (prop === 'oopalien' && skyTier?.kind !== 'saucer') { refuse(ctx, 'NO ALIENS OVER THIS COURT'); prop = nextOop(prop); }   // the alien lob is the saucer's (Orbit)
          while (SPECIAL_PROPS.has(prop) && !specialsOpen()) { refuse(ctx, specialLockLine(prop as 'kangaroo')); prop = nextObstacle(obstacleKindOf(prop)); }   // SEASON SPECIALS: the animals skip past a free lane, named
          ctx.setHud({ prop: propLabel(prop) });
          SoundKit.play('uiTick', { pitch: 1.3 });
          void setupProp(ctx);
        }
      }
      // ── RUNWAY TRICKS (DUNK-CONTROL-JUICE): a bare face button while RUN is held — the stick steers, so no direction.
      // Y = SELF-LOB (also standing, in the approach), B = KICK-UP, X = CARTWHEEL (it tosses the lob itself), A = DOUBLE-UP
      // inside the last stretch before the takeoff line at a real run; A anywhere else on the run = jump from here.
      if (e.t === 'button' && e.pressed && (phase === 'charge' || (phase === 'approach' && e.btn === 'Y'))) {
        // DUNK-GLASS-BOUNCE: Y with the d-pad HELD up = off the glass, down = the bounce lob (pad / touch; the keyboard's arrows
        // are the stick); a bare Y throws the variant the PROP ring picked, or the plain self-lob
        const held = heldDpad && !heldDpadKey && (heldDpad === 'up' || heldDpad === 'down') ? heldDpad : null;
        // Y + up/down picks the lob variant (off the glass, off the bounce); B + up is the BACKFLIP (owner, 2026-09-16).
        // Every other button ignores the direction, so a held stick-hand never turns a kick-up into something else.
        const variant = e.btn === 'Y' ? (held ?? (prop === 'offglass' ? 'up' : prop === 'bounce' ? 'down' : null))
          : e.btn === 'B' && held === 'up' ? 'up' : null;
        if (held && dpadPick && dpadPick.dir === held) dpadPick.fired = true;   // the d-pad was the variant, not a prop pick
        const rt = runwayTrickFor(e.btn, variant);
        if (rt && rt.id === 'doubleup') {
          const dist = player.root.position.z - gatherLine();
          if (doubleUpFits(dist, holdRunSpeed) && !runwayBeat) startRunwayBeat(ctx, rt);
          else if (!runwayBeat) launchDunk(ctx);   // tap to jump — from wherever you are
        } else if (rt && !runwayBeat) {
          // DUNK-SOFTS-NAMED: a runway trick that cannot happen says so (it used to be a silent nothing)
          if (isOop(prop)) refuse(ctx, `${rt.label} — THE PASSER HAS THE BALL`);
          else if (lob.thrown) refuse(ctx, `${rt.label} — THE BALL IS ALREADY UP · CATCH IT`);
          else if (rt.id === 'bounce' && phase === 'charge' && !bounceFits()) refuse(ctx, 'BOUNCE LOB — TOO CLOSE TO THE LINE · THROW IT STANDING');   // a bounce needs ~1 s of air: on the run it has to leave as the run starts
          else startRunwayBeat(ctx, rt);
        }
      }
      // TRICK COMBOS (THPS2-style) — mid-air, hold a d-pad direction and tap
      // A/B/Y to throw a named trick (windmill, 360, eastbay, tomahawk,
      // between-the-legs). Each plays its own clip, pumps difficulty, and
      // taxes the slam window. Two before the window = COMBO dunk. Any B
      // press that ISN'T a recognized combo (no direction held, or a
      // direction that has no B trick) falls through to the plain STYLE TAP
      // showboat below instead — one press always does exactly one thing.
      // A trick needs AIR under it. The gate used to be "in the cinematic
      // phase and the slam window isn't open", which includes frame zero — so a
      // trick armed the instant the jump released played out while the dunker
      // was still leaving the floor, nowhere near the rim. An eastbay is a
      // thing you do at the basket; thrown at ankle height it reads as a
      // glitch. EASTBAY_TIMING.rise is when the rig is actually off the ground.
      // DUNK-SOFTS-NAMED: the direction feeds the recognizer whenever it moves in the air (it used to be gated on the rise
      // with the buttons, so a direction held from the run-up was never seen); a trick button tapped BEFORE the rise waits
      // for the rise and fires there — the trick the player asked for, at the beat it belongs to.
      if (phase === 'cinematic' && e.t === 'dpad') flight.recognizer.feed(e);
      // DUNK-BIOMECH: every trick has a cue window — early = ARMED (fires on its beat), late = refused with a banner
      if (phase === 'cinematic' && e.t === 'button' && e.pressed && (e.btn === 'B' || e.btn === 'X' || e.btn === 'Y') && qteWindowOpen && !qteHit) {
        // not the slam button, thrown after the jam's beat opened: say so rather than swallowing it
        refuse(ctx, 'TOO LATE FOR A TRICK — THE JAM IS ON YOU');
      }
      // …and the same courtesy for the two shoulder moves. The parkour ride and the backboard both gate on
      // `!qteWindowOpen`, so a press during the jam did nothing and said nothing — the one thing this pass has been
      // removing everywhere else. They are genuinely too late at that point; being too late is not the same as
      // being ignored.
      if (phase === 'cinematic' && e.t === 'button' && e.pressed && (e.btn === 'R1' || e.btn === 'L1') && qteWindowOpen && !qteHit) {
        refuse(ctx, e.btn === 'L1' ? 'NO GLASS FROM HERE — FINISH IT' : 'NO RIDE LEFT — FINISH IT');
      }
      if (phase === 'cinematic' && e.t === 'button' && e.pressed && (e.btn === 'A' || e.btn === 'B' || e.btn === 'X' || e.btn === 'Y') && !qteWindowOpen) airButton(ctx, e);   // X reads in the air
      // THE SKY TIER (owner, 2026-09-18): R1 in the air is the tap off whatever hangs over the lane — a second lift and the drop into
      // the slam; honest only inside the window with the hand up to its underside (a full run, a rebound or a backboard kick gets there)
      if (phase === 'cinematic' && e.t === 'button' && e.pressed && e.btn === 'R1' && !qteWindowOpen) {
        if (!skyTier) refuse(ctx, 'NOTHING OVER THIS LANE');   // Venice: no tier, no tap
        else if (!specialsOpen()) refuse(ctx, specialLockLine('skyTap'));   // SEASON SPECIALS
        else if (skyTapAllowed(clipTime, skyTapped, player.root.position.y)) {
          skyTapped = true; doubleLaunchLift += SKY.apexAdd; runwayDifficulty += SKY.difficulty; runwayLabels.push(`OFF THE ${skyTier.tag}`); hype = Math.min(100, hype + SKY.hype); skyKick = 1;
          SoundKit.play('impact', { pitch: 1.2, volume: 0.5 }); ctx.feel?.impact?.(0.35); ctx.camDirector.pulse(0.6, 0.45);
          EffectsKit.burst(ctx.scene, new Vector3(player.root.position.x, SKY.underY - 0.1, player.root.position.z), 'sparks');
          pitchFlip(ctx, clipTime + 0.05, 0.55);   // the drop is a BACKFLIP, and the rim takes a hang (the contact below)
          flash(ctx, `${skyTier.call} — DROP FLIP · HANG`, 800); console.info(`[DUNK-SKY] tap off the ${skyTier.tag} @${clipTime.toFixed(2)} root y ${player.root.position.y.toFixed(2)} → drop flip`);
        } else refuse(ctx, skyTapRefusal(clipTime, skyTapped, player.root.position.y, skyTier.tag));
      }
      // THE BACKBOARD RUN: L1 held after the kick (≥ 0.22 s) runs the dunker ACROSS the glass — the root slides to the other side of
      // the board with a little more lift, once a flight
      if (phase === 'cinematic' && e.t === 'button' && !e.pressed && e.btn === 'L1' && l1DownAt >= 0) {
        const held = (performance.now() - l1DownAt) / 1000; l1DownAt = -1;   // REAL seconds: the hang's slow-mo stalls the clip clock (a 400 ms hold read 0.2 clip s, measured)
        if (held >= 0.22 && doubleLaunched && !boardRan && clipTime < 0.95 && !specialsOpen()) refuse(ctx, specialLockLine('boardRun'));   // SEASON SPECIALS
        else if (held >= 0.22 && doubleLaunched && !boardRan && clipTime < 0.95) {
          boardRan = true; doubleLaunchLift += 0.25; runwayDifficulty += 0.8; runwayLabels.push('RAN THE BACKBOARD'); hype = Math.min(100, hype + 8);
          const x0 = player.root.position.x, x1 = Math.max(-0.8, Math.min(0.8, -x0 || 0.8)), t0 = clipTime;
          const obs = ctx.scene.onBeforeRenderObservable.add(() => { const u = Math.min(1, (clipTime - t0) / 0.4); player.root.position.x = x0 + (x1 - x0) * (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2); player.root.rotation.z = Math.sin(u * Math.PI) * 0.25 * Math.sign(x1 - x0 || 1); if (u >= 1 || phase !== 'cinematic') { player.root.rotation.z = 0; ctx.scene.onBeforeRenderObservable.remove(obs); } });
          SoundKit.play('whoosh', { pitch: 1.1, volume: 0.45 }); ctx.feel?.impact?.(0.2); ctx.camDirector.pulse(0.4, 0.4);
          flash(ctx, 'RAN THE BACKBOARD', 700); console.info(`[DUNK-PARKOUR] backboard run @${clipTime.toFixed(2)} x ${x0.toFixed(2)} → ${x1.toFixed(2)}`);
        }
      }
      if (phase === 'cinematic' && e.t === 'button' && e.pressed && e.btn === 'L1' && !qteWindowOpen) {   // DUNK PARKOUR: the backboard double-launch in the rise
        l1DownAt = performance.now();
        // OFF THE TOP OF THE BACKBOARD (owner, 2026-09-18): the d-pad UP with L1 in the rise vaults the dunker to the board's top and
        // BACKFLIPS off it — a big second lift, the flip as a pitch layer; whatever trick is armed still fires on its beat (the variants)
        const upHeld = heldDpad === 'up' && !heldDpadKey;
        if (upHeld && !specialsOpen() && doubleLaunchAllowed(clipTime, doubleLaunched)) refuse(ctx, `${specialLockLine('boardTopFlip')} — the kick is yours (L1 alone)`);   // SEASON SPECIALS
        else if (upHeld && doubleLaunchAllowed(clipTime, doubleLaunched)) {
          doubleLaunched = true; boardTopFlip = true; doubleLaunchLift = DOUBLE_LAUNCH.apexAdd + 0.85; runwayDifficulty += 1.2; runwayLabels.push('OFF THE TOP OF THE BOARD'); hype = Math.min(100, hype + 12);
          pitchFlip(ctx, clipTime + 0.12, 0.6);
          SoundKit.play('impact', { pitch: 1.4, volume: 0.55 }); ctx.feel?.impact?.(0.4); ctx.camDirector.pulse(0.7, 0.5);
          EffectsKit.burst(ctx.scene, new Vector3(player.root.position.x, glass.yMax, glass.z), 'sparks');
          flash(ctx, 'OFF THE TOP OF THE BACKBOARD — BACKFLIP', 800); console.info(`[DUNK-PARKOUR] board-top backflip @${clipTime.toFixed(2)}`);
        } else if (doubleLaunchAllowed(clipTime, doubleLaunched)) {
          doubleLaunched = true; doubleLaunchLift = DOUBLE_LAUNCH.apexAdd; hype = Math.min(100, hype + 8);
          SoundKit.play('impact', { pitch: 1.3, volume: 0.5 }); ctx.feel?.impact?.(0.3); ctx.camDirector.pulse(0.5, 0.4);
          EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(0, 1.6, 0)), 'sparks');
          flash(ctx, 'BACKBOARD KICK — DOUBLE LAUNCH', 700); console.info(`[DUNK-PARKOUR] double-launch @${clipTime.toFixed(2)}`);
        } else if (!boardSwung && clipTime > DOUBLE_LAUNCH.toT && clipTime < 0.95) {
          // THE BACKBOARD SWING: past the rise, a pivot off the glass — a little more lift, a roll flourish, a point of difficulty
          boardSwung = true; doubleLaunchLift += 0.2; hype = Math.min(100, hype + 6); styleTaps = Math.min(2, styleTaps + 1);
          const t0 = clipTime; const obs = ctx.scene.onBeforeRenderObservable.add(() => { const u = Math.min(1, (clipTime - t0) / 0.35); player.root.rotation.z = Math.sin(u * Math.PI) * 0.45; if (u >= 1 || phase !== 'cinematic') { ctx.scene.onBeforeRenderObservable.remove(obs); player.root.rotation.z = 0; } });
          SoundKit.play('impact', { pitch: 1.1, volume: 0.45 }); ctx.feel?.impact?.(0.25); ctx.camDirector.pulse(0.4, 0.35);
          flash(ctx, 'BACKBOARD SWING', 700); console.info(`[DUNK-PARKOUR] backboard swing @${clipTime.toFixed(2)}`);
        } else refuse(ctx, doubleLaunched && boardSwung ? 'THE BOARD IS SPENT' : doubleLaunched ? 'BACKBOARD SWING IN THE HANG' : 'BACKBOARD KICK IN THE RISE');
      }   // (X reads in the air now: it carries the chain pieces, 2026-09-16)

      // GATHER (L2) — the player's call on the foot. Held through the run it plants both; let go and a run fast
      // enough leaves off one. It is read live so the tell can change under the thumb, and it is answered outside the
      // runway like every other press rather than swallowed.
      if (e.t === 'trigger' && e.side === 'L') {
        const now = e.value > 0.5;
        if (now !== gatherHeld) {
          gatherHeld = now;
          if (phase === 'charge' || phase === 'approach') {
            const tell = takeoffTell(runUpPeak, gatherHeld);
            if (tell !== gatherTold) { gatherTold = tell; ctx.setHud({ hint: tell }); }
          } else if (now) refuse(ctx, phase === 'cinematic' ? 'THE FEET HAVE LEFT THE FLOOR' : 'GATHER ON THE RUN');
        }
      }

      if (e.t === 'trigger' && e.side === 'R') {
        // MECHANICS PASS (2026-09-15): RUN (RT) was silent 6 of 6 when held outside the runway — through the judges, the
        // replay, the rival's turn. The first press of a hold is answered with what the contest is doing.
        if (e.value > 0.5 && !runPressWas && phase !== 'approach' && phase !== 'charge' && phase !== 'cinematic') {
          refuse(ctx, phase === 'rivalTurn' ? "RIVAL'S TURN" : phase === 'judging' || phase === 'resolve' ? 'THE JUDGES ARE SCORING' : 'WAIT');
        }
        runPressWas = e.value > 0.5;
        runHeld = e.value;
        if (phase === 'approach' && e.value > 0.02) beginRun(ctx);
        if (phase === 'charge') {
          charge = Math.max(charge, e.value);
          ctx.setHud({ charge: Math.round(charge * 100) });
          if (e.value === 0) { if (runwayBeat?.id === 'doubleup') launchQueued = true; else launchDunk(ctx); }   // a hop in flight lands first, then takes off
        }
      }

      // SLAM needs the ball: a lob still in the air cannot be flushed (the catch is what puts it in the hand)
      if (e.t === 'button' && e.btn === 'A' && e.pressed && qteWindowOpen && !lob.live) slamNow(ctx, clipTime);
      // PHONE CONTROLS (2026-09-15): SLAM tapped on the runway did nothing and said nothing (the phone check: SLAM SILENT)
      else if (e.t === 'button' && e.btn === 'A' && e.pressed && (phase === 'approach' || phase === 'charge')) refuse(ctx, 'SLAM AT THE TOP OF THE JUMP');
      // RIM HANG — hold SLAM through the flush to hang on the iron
      if (e.t === 'button' && e.btn === 'A') aHeld = e.pressed;
    },

    update(ctx: ModeContext, dt: number) {
      // A RUN HELD THROUGH THE WAIT STILL COUNTS (2026-09-19). The run started on a trigger EVENT inside the approach,
      // so a finger already down when the runway opened — held through the judges' card and the rival's turn, which is
      // exactly what a player does between attempts — produced no event and no run: the attempt launched off a walk
      // with no gather and blew. Measured in the lab: attempt 3 of every set, every set, `run → dunk_launch →
      // dunk_finish_blown` with the gather clip missing. The runway now looks at the trigger it can already see.
      if (phase === 'approach' && runHeld > 0.02) beginRun(ctx);
      meter3d?.update(dt);
      ctx0 = ctx;
      fovTick(dt); settleTick(ctx);
      // A+ P5: the fov pinch starts on the APPROACH — inside 3.6 m (horizontal) of the rim during the run, not at takeoff
      if ((phase === 'approach' || phase === 'charge') && !fovOn && Math.hypot(player.root.position.x - rim.x, player.root.position.z - rim.z) <= 3.6) fovGather(ctx);
      phaseSec += dt;
      watchdog(ctx);
      hype = Math.max(0, hype - dt * 1.5);       // slow decay between dunks

      // R stick: orbit / pitch on the RUNWAY (approach + charge run) — the flight's own framing (rimCamCut) and the
      // verdict never inherit it; a centred (or gated-off) stick springs the orbit back to the mode's composition.
      const lookOn = phase === 'approach' || phase === 'charge';
      // DUNK-SOFTS-NAMED: a runway beat (the kick-up's leg, the cartwheel, the toss) swings the follow camera to a 3/4 view
      // for its length — from dead behind the runner the kick was hidden by the body; the orbit springs back as it does
      // for a released stick, and the takeoff's resetLook still drops whatever is left
      const beatLook = runwayBeat && Math.abs(lookX) < 0.12 ? BEAT_LOOK_X : 0;
      ctx.camDirector.look(lookOn ? lookX + beatLook : 0, lookOn ? lookY : 0, dt);
      // Dunk play tip (2026-09-07) — ROOT CAUSE of the "inverted stick": the hero NEVER yawed (rotation.y sat at π
      // while the velocity went wherever it went) and the loco was `(stickX·4, 0, −max(0,−stickY)·5 − 2)`: a
      // centred stick crawled him at the rim at 2 m/s in the IDLE clip (a slide), and stick-right pushed world +x —
      // which is screen-LEFT when the follow camera looks down −Z (Babylon is left-handed). Now the stick is
      // camera-relative (up = the camera's forward = the rim, right = screen right), its magnitude is the speed,
      // and the facing follows the velocity every approach / charge frame (the OneVOne / KarateEndless pattern).
      // HOOPS-DEPTH S1 (2026-09-23): THE APPROACH HAS WEIGHT. The stick used to be a flat 6 m/s the frame it moved and zero
      // the frame it let go (stickVel × APPROACH_SPEED: no ramp, no stop, no gears — measured: speed mean 0.51 / peak 6.0
      // with nothing between), while 1v1 / 3v3 ride CourtMovement's walk / jog / sprint gears, the loaded first step,
      // the speed-scaled stop and the cut cost. The runway now rides the same model: a soft stick walks, a pushed one
      // jogs, HOLD (RUN) is the sprint that hands the charge its speed; a cut at pace is paid for. The charge's own
      // hold-run ramp (holdRunSpeed) is untouched — it starts from whatever pace the approach reached.
      const stickWorld = stickVel(ctx);
      const vel = phase === 'approach' && !busRun ? approachStep(stickWorld, dt) : stickWorld;
      if (busRun && (phase === 'approach' || phase === 'charge')) busRunTick(ctx, dt);   // THE BUS WALL RUN owns the body
      if (phase === 'approach' && !busRun) {
        player.root.position.addInPlace(vel.scale(dt));
        player.root.position.z = Math.max(gatherLine(), Math.min(RETREAT_Z, player.root.position.z));   // the runway: takeoff line … a step behind the start
        player.root.position.x = Math.max(-6, Math.min(6, player.root.position.x));
        if (performance.now() < stickReboundUntil) player.root.position.x += stickReboundX * 3.5 * dt;   // DUNK PARKOUR: the reflected stride
        tryGlass(ctx, vel.x, vel.z);
        faceVel(vel, dt);
        // THE RUN-UP IS PART OF THE DUNK. Peak approach speed feeds the air
        // budget at launch — a walk-up has less air, and less air means fewer
        // tricks fit before the slam window. Live 08's whole ramp, in one number.
        runUpPeak = Math.max(runUpPeak, Math.hypot(vel.x, vel.z));
        const moving = Math.hypot(vel.x, vel.z) > 0.5;
        if (!runwayBeat) { playClip(moving ? runLoop() : SPORT_CLIP.idle, { loop: true }); setWin('run'); if (moving) player.animator.setPlaybackScale(runLoop(), strideRate(Math.hypot(vel.x, vel.z))); }   // a runway beat owns the body until it ends; the loop paces to the run
        if (player.root.position.z <= gatherLine() + 0.2) {
          ctx.setHud({
            hint: runUpPeak < 3.5
              ? 'HOLD to run — come in FASTER: the run-up buys your air'
              : 'HOLD to run — then tap jump',
          });
        }
      }

      if (phase === 'charge' && !busRun) {
        // HOLD = RUN (pad acceptance #2): ramp to the max run, curve toward the rim's x, let the stick steer,
        // and launch the moment the gather line is reached. runUpPeak keeps feeding the air budget.
        {   // THE GATHER STRIDE: ramp until the last stride, then ease to the carry the flight will actually fly at
          const distNow = player.root.position.z - gatherLine();
          const carryMps = Math.abs(rim.z + FLUSH_Z_AHEAD - gatherLine()) / Math.max(0.2, EASTBAY_TIMING.extend - PLANT_SEC);
          if (!gatherStride && !runwayBeat && !launchQueued && distNow <= Math.max(GATHER_MIN_M, holdRunSpeed * GATHER_STRIDE_SEC)) {
            gatherStride = true; setWin('gather');
            // paced to the stride: the 0.5 s clip ran out ~0.23 s before the line and the body froze on its last frame (measured), so it
            // plays at the rate that ends it AT the line — the launch clip's crouch takes over from a body still moving
            const tToLine = runTimeToLineGather(distNow, holdRunSpeed, HOLD_RUN_MAX, HOLD_RUN_RAMP, gatherStrideSpec());
            playClip(SPORT_CLIP.dunkChargeGather, { fadeSec: 0.1, speedRatio: Math.max(0.5, Math.min(2, DUNK_TIMING.chargeSec / Math.max(0.25, tToLine))), onEnd: () => {} });
            console.info(`[DUNK-LL] gather stride at ${distNow.toFixed(2)} m, ${holdRunSpeed.toFixed(1)} m/s → carry ${carryMps.toFixed(1)} m/s`);
          }
          if (gatherStride) holdRunSpeed += (carryMps - holdRunSpeed) * Math.min(1, dt / GATHER_EASE_SEC);
          else holdRunSpeed = Math.min(HOLD_RUN_MAX, holdRunSpeed + dt * HOLD_RUN_RAMP);
        }
        // stick-right steers screen-right (the camera's right in world x), and the facing follows the run
        const steer = ctx.camDirector.rightFlat().x * stickX * 3 + Math.max(-2, Math.min(2, (rim.x - player.root.position.x) * 0.8));
        player.root.position.x = Math.max(-6, Math.min(6, player.root.position.x + steer * dt + (performance.now() < stickReboundUntil ? stickReboundX * 3.5 * dt : 0)));
        tryGlass(ctx, steer, -holdRunSpeed);   // DUNK PARKOUR: into the glass at an angle on the hold-run
        // a runway beat (a toss, a kick, a cartwheel, the hop) runs under the body at its own pace
        const runNow = holdRunSpeed * (runwayBeat ? runwayBeat.runScale : 1);
        player.root.position.z -= runNow * dt;
        faceVel(new Vector3(steer, 0, -runNow), dt);
        // the posture tracker: the run ramping up is a forward lean, the strafe between obstacles is a bank
        runwayVel.x = steer; runwayVel.z = -runNow;
        runMotion.update(steer, -runNow, player.root.rotation.y, dt);
        runUpPeak = Math.max(runUpPeak, Math.hypot(steer, holdRunSpeed));
        if (!runwayBeat && !gatherStride) { setWin('run'); player.animator.setPlaybackScale(runLoop(), strideRate(holdRunSpeed)); }
        // THE RUNWAY TEACHES ITS MOVES (owner, 2026-09-16). Everything a player can throw on the run is a bare face
        // button under a held trigger — undiscoverable — and this pass added three more. The hold-run hint is the move
        // list now, and it turns into DOUBLE-UP the moment the double-up is actually on. Only pushed on CHANGE: a HUD
        // write every frame is a React render every frame.
        if (!runwayBeat) {
          const line = runwayTeachLine({ distToLine: player.root.position.z - gatherLine(), speed: holdRunSpeed, ballThrown: lob.thrown });
          if (line !== teachHint) { teachHint = line; ctx.setHud({ hint: line }); }
        }
        // the SELF-LOB prop tosses itself ahead of the takeoff when the runner has not thrown it by hand
        if (prop === 'selflob' && !lob.thrown && !runwayBeat && player.root.position.z <= gatherLine() + AUTO_LOB_AHEAD_M) startRunwayBeat(ctx, runwayTrickFor('Y')!);
        // DUNK-GLASS-BOUNCE: the off-glass prop throws where the geometry says (AUTO_GLASS_AHEAD_M); the bounce prop throws as the
        // run starts (a single bounce is a ~1 s throw — from standing, Y throws the bounce-BOUNCE with a RUN cue)
        if (prop === 'offglass' && !lob.thrown && !runwayBeat && !pendingBeat && player.root.position.z <= gatherLine() + AUTO_GLASS_AHEAD_M) startRunwayBeat(ctx, runwayTrickById('offglass'));
        if (prop === 'bounce' && !lob.thrown && !runwayBeat && !pendingBeat && phaseSec >= 0.05) startRunwayBeat(ctx, runwayTrickById('bounce'));
        const line = gatherLine();
        if (player.root.position.z <= line) {
          player.root.position.z = line;
          if (runwayBeat) launchQueued = true;   // the beat lands first (the hop's crouch IS the takeoff pose)
          else launchDunk(ctx);
        }
      }
      if (runwayBeat) runwayTick(ctx, dt);
      // DUNK-POSTURE-LEGS (A2/A3): the runway dribble — on while the ball is the runner's (no lob up, no passer, no beat owning the
      // body), at the run's cadence; GATHERED a stride before the line: the bounce that is at the palm inside GATHER_LEAD_SEC of
      // the takeoff line is the last one, the ball stays in the hand (the off hand joins it — gatherK, in handIkApply) and the
      // takeoff owns it from there. A stick run that never holds RUN dribbles on the spot / down the runway the same way.
      if (dribble) {
        const onRunway = phase === 'approach' || phase === 'charge';
        const ballOurs = !lob.live && !lob.thrown && !isOop(prop) && !runwayBeat && !launchQueued;
        const distToLine = player.root.position.z - gatherLine();
        const speed01 = phase === 'charge' ? Math.min(1, holdRunSpeed / HOLD_RUN_MAX) : Math.min(1, Math.hypot(vel.x, vel.z) / APPROACH_SPEED);
        if (onRunway && ballOurs && !gatherLatched && phase === 'charge' && distToLine <= Math.max(1.0, holdRunSpeed * GATHER_LEAD_SEC) && (!dribble.active || atPalm(dribble.phase))) { gatherLatched = true; console.info(`[DUNK-LL] gather at ${distToLine.toFixed(2)} m (phase ${dribble.phase.toFixed(2)})`); }
        const wasActive = dribble.active;
        dribble.update(dt, speed01, onRunway && ballOurs && !gatherLatched);
        if (pendingBeat && onRunway && !runwayBeat) { if (!dribble.active || atPalm(dribble.phase, 0.12)) { const rt = pendingBeat; pendingBeat = null; startRunwayBeat(ctx, rt); } } else if (pendingBeat && !onRunway) pendingBeat = null;
        if (dribble.active !== wasActive) console.info(`[DUNK-LL] dribble ${dribble.active ? 'on' : 'off'}`);
        // DUNK-BALL-ARMS-RIM: the off hand lets go of the ball over the takeoff's first beat (0.18 s), not on the launch frame —
        // the reach was gated to the runway, so the left hand snapped from the ball to the clip's pose in ONE frame (0.34–0.42 m)
        gatherK = Math.max(0, Math.min(1, gatherK + (gatherLatched && onRunway && ballOurs ? dt / 0.15 : -dt / (phase === 'cinematic' ? 0.18 : 0.1))));
      }
      if (lob.live && phase !== 'cinematic' && phase !== 'resolve') stepLob(ctx, dt);   // the lob flies in real time on the runway
      if (phase === 'cinematic') {
        // Hang mid-flight slow-mo: JuiceKit owns animationTimeScale; gate clip advance to it.
        const animScale = ctx.scene.animationTimeScale ?? 1;
        const prevClip = clipTime;
        clipTime += dt * (Number.isFinite(animScale) && animScale > 0 ? animScale : 1);
        if (!hangSlowMoLatch && prevClip < EASTBAY_TIMING.rise && clipTime >= EASTBAY_TIMING.rise) {
          hangSlowMoLatch = true;
          ctx.juice.slowMo(0.4, 400);
          ctx.camDirector.pulse(0.4, 0.45); // ~13% soft push-in; rimCamCut stays the one hard cut
          setTrail('hang');   // A+ P6: the trail brightens at the hang rise, not at takeoff
        }
        if (clipTime >= EASTBAY_TIMING.rise) setWin('hang');
        // THE WINDOW USED TO CANCEL THE DUNK YOU CALLED (2026-09-19). An armed trick could only fire while the slam
        // window was shut, so on a short flight — the window opens early — the called dunk simply never happened and
        // nothing said why: measured in the lab, 2 of 6 called tricks had no [DUNK-CUE] line at all. The window is
        // the JAM's beat, not a cancel: an armed trick still fires inside it while the jam is unthrown and the
        // trick's own last beat is still ahead. Once the jam is away the flight belongs to the finish.
        if (armedAir && clipTime >= cueFireAt(armedAir)
            && (!qteWindowOpen || (!qteHit && clipTime <= cueLastAt(armedAir)))) {
          const a = armedAir; armedAir = null; fireTrick(ctx, a, 'armed');
        }
        spin.update(clipTime);   // the momentum-led turn rides the flight's own clock (the hang slow-mo stretches both)
        // ── the lob: the ball flies in CLIP time through the hang (the slow-mo stretches both), the catch is the hand ──
        if (lob.live) {
          stepLob(ctx, dt * (Number.isFinite(animScale) && animScale > 0 ? animScale : 1));
          const hand = ballHandNode();
          if (hand && clipTime >= 0.12) {   // through the slam window too: a late catch leaves less time to slam, and that is the trade
            hand.computeWorldMatrix(true);
            if (canCatch(hand.getAbsolutePosition(), ball.position)) catchLob(ctx);
          }
        }
        // ── hand-offs: the eastbay's under-the-leg pass (the SIG style) and the lost-and-found's behind-the-back one ──
        activeHandOff = null;
        if (!lob.live) {
          if (airTrick?.trick.id === 'lostfound') {
            const t = clipTime - airTrick.t0; activeHandOff = { spec: LOST_FOUND_SPEC, t };
            if (runHandOffPath(ball, player.skeleton, t, LOST_FOUND_SPEC, ebState)) console.info(`[HANDS] handoff R→L lost&found @${t.toFixed(2)}`);
          } else if (airTrick?.trick.id === 'betweenlegs') {
            const t = clipTime - airTrick.t0; activeHandOff = { spec: BETWEEN_LEGS_SPEC, t };
            if (runHandOffPath(ball, player.skeleton, t, BETWEEN_LEGS_SPEC, ebState)) console.info(`[HANDS] handoff R→L between-the-legs @${t.toFixed(2)}`);
          } else if (style === 'sig') {
            activeHandOff = { spec: EASTBAY_HANDOFF, t: clipTime };
            if (runEastbayPath(ball, player.skeleton, clipTime, ebState)) console.info(`[HANDS] handoff R→L eastbay @${clipTime.toFixed(2)}`);
          }
        }
        ikSideK = activeHandOff ? handOffK(activeHandOff.t, activeHandOff.spec) : (ebState.inLeftHand ? 1 : 0);
        // A+ P8 H4: the ball stays parented to the ball hand through the hang — a lost parent that is not a release re-attaches
        if (!lob.live && !ball.parent && !ball.metadata?.felReleased) { attachBallToHand(ball, player.skeleton, ebState.inLeftHand ? 'LeftHand' : 'RightHand'); console.info('[HANDS] ball re-attached'); }
        // DUNK-POSTURE-LEGS: the PLANT — the root holds on the floor at the line for PLANT_SEC while the launch clip's loaded
        // crouch plays with the feet ON the floor, then the same arc to the same rim point at the same beat (arcK / carryU)
        const k = arcK(clipTime, EASTBAY_TIMING.duration);
        // DUNK-CONTROL-JUICE: a real jump — the height is a parabola (off the floor faster than the old sine), the forward
        // carry is CONSTANT SPEED from the takeoff to the rim's front edge at the extension, whatever the takeoff distance
        // (a car is a 4.3 m jump, the plain runway 2.8 m). Before, an exponential pull (1.6/s) front-loaded the carry and
        // got 86% of the way from one fixed gather line — a car's near door was under the feet 0.2 s after takeoff.
        player.root.position.y = 4 * k * (1 - k) * apexFor();
        const u = carryU(clipTime, EASTBAY_TIMING.extend);
        // THE PLANT MOVES (2026-09-18): the root used to stand dead still at the line for PLANT_SEC (measured: 2.0 m/s → 0.0 → 1.9 m/s
        // on consecutive frames — the wall at the takeoff). The gather step keeps rolling through the plant (PLANT_DRIFT_M over the
        // plant), and the carry runs from where the plant ended to the same rim point on the same beat.
        const carryDir = Math.sign(rim.z + FLUSH_Z_AHEAD - launchZ) || -1;
        // THE FOOT DECIDES HOW MUCH RUN SURVIVES THE PLANT: a one-foot takeoff barely breaks stride (carry 1.6),
        // a two-foot gather plants and spends the run going up instead (0.45). Same line, two different bodies.
        const plantFrom = launchZ + carryDir * PLANT_DRIFT_M * launchCarry * Math.min(1, clipTime / PLANT_SEC);
        player.root.position.z = plantFrom + (rim.z + FLUSH_Z_AHEAD - plantFrom) * u;
        player.root.position.x += (rim.x - player.root.position.x) * 1.6 * dt;
        if (busLaunch) {   // off the bus: 2 m off the centre line and a metre up — the x is driven to the iron on the carry, the height fades by the extension
          player.root.position.x = busLaunch.x0 + (rim.x - busLaunch.x0) * Math.min(1, u * 1.15);
          player.root.position.y += busLaunch.y0 * Math.max(0, 1 - clipTime / EASTBAY_TIMING.extend);
        }
        // Pad acceptance #2: the stick is alive in the hang — a body lean and a small drift before contact;
        // the pull to rim.x above (1.6/s) still wins by the flush, so the contact math is untouched.
        airLean += (stickX - airLean) * Math.min(1, dt * 8);
        player.root.rotation.z = -airLean * AIR_LEAN_RAD;
        player.root.position.x += airLean * AIR_DRIFT * dt;
        faceToward(rim, dt * FACE_RIM_RATE);   // an angled run-up launches yawed off the iron — ease onto it through the rise

        // THE PROP IS PHYSICAL. Crossing the obstacle with your feet below
        // its top is not a scoring penalty — the dunk DIES at the chair,
        // mid-flight, whatever the slam timing was going to be. The jump
        // peaks at 1.05 + charge*0.55, so the chair (1.35m) demands a real
        // charge; the old check (y + 1.0 at the flush, deep past the prop)
        // could never clip anything — measured: "CLIPPED THE PROP" had never
        // displayed, the prop was wallpaper.
        // DUNK-CONTROL-JUICE: the FEET against the MESH — the lowest foot bone under the sampled top of the car / barrier /
        // crate at the body's z. A tucked jump clears what a stiff one clips; the car is a long jump from its own takeoff line.
        if (obstacle && !obstacleClipped) {
          const fy = feetY(), px = player.root.position.x - rim.x, pz = player.root.position.z;
          const h = heightAt(obstacle.profile, px, pz);
          if (h > 0 && !obstacleOver) { obstacleOver = true; console.info(`[DUNK-PROP] over ${obstacle.spec.label}: feet ${fy.toFixed(2)} vs top ${h.toFixed(2)}`); }
          if (h > 0) obstacleMargin = Math.min(obstacleMargin, fy - h);
          if (clipsObstacle(obstacle.profile, fy, px, pz, obstacle.spec.clearance)) {
            obstacleClipped = true; setTrail('off');   // juice soft #5: a clipped air kills the trail
            // deep under the top = ran into its side: bounced back to the floor in front of it; a shin's worth = onto the top
            const deep = h - fy > 0.45 || obstacle.spec.topples;
            clipFloorY = deep ? 0 : h; clipBackZ = deep ? Math.max(pz, obstacle.nearZ + 0.4) : pz;
            console.info(`[DUNK-PROP] CLIPPED ${obstacle.spec.label}: feet ${fy.toFixed(2)} under ${h.toFixed(2)} at z ${pz.toFixed(2)} — ${deep ? 'bounced off it' : 'landed on it'}`);
            clipBlown(ctx);
          } else if (h === 0 && obstacleOver && !obstacleCleared && pz < obstacle.farZ) {
            obstacleCleared = true; onObstacleCleared(ctx);
          }
        }

        // BROADCAST RIM-CAM CUT: one hard cut to a baseline angle as the
        // rise crests, exactly like the wide→under-basket cut on TV. One
        // snapTo, latched; the normal follow resumes on resolve.
        // DUNK-SOFTS-NAMED: a named air trick pulls the cut forward to its own first frame — the scorpion / hide & seek /
        // lost & found played their whole shape under the follow camera from behind and the cut arrived for the flush only
        // DUNK-CAR-CLIP (2026-09-14): OVER AN OBSTACLE THE CUT IS A SIDE-ON PROP CAM, AND IT COMES AT THE NEAR EDGE.
        //
        // The rim cut below lands at clip 0.69; a car is a 4.3 m jump and the body is still over its roof then (measured:
        // root z −7.92 against the car's −6.74 … −8.82). From the cut on, the car had 0 of 8 box corners on screen, and the
        // clear call fires past the far edge at clip ~1.0 — so "OVER THE CAR!" always played over a shot of the rim with no
        // car in it (the eye's HARD: the call with no car under the body). The rim cam also sat 0.5 m off the car's bumper.
        // A car jump reads from the SIDE: the roof, the daylight under the shoes, the rim beyond. One fixed shot (PROP_CAM),
        // cut as the body reaches the near edge, held through the flush (the aim tracks the dunker, pulled toward the rim).
        if (!rimCamCut && obstacle && !obstacleClipped && propCutDue(player.root.position.z, obstacle.nearZ)) {
          rimCamCut = true;
          const spot = propCamSpot(obstacle, rim), at = new Vector3(spot.x, spot.y, spot.z);
          console.info(`[DUNK-CAM] prop cut @${clipTime.toFixed(2)} (z ${player.root.position.z.toFixed(2)}, ${obstacle.spec.label} ${obstacle.nearZ.toFixed(2)} … ${obstacle.farZ.toFixed(2)}) from (${at.x.toFixed(1)}, ${at.y.toFixed(1)}, ${at.z.toFixed(1)})`);
          ctx.camDirector.setFixed(at, PROP_CAM.aimH, true);
          ctx.camDirector.update(player.root.position, Vector3.Zero(), rim);   // aim on the cut frame, not the next
        }
        if (!rimCamCut && !obstacle && (clipTime >= EASTBAY_TIMING.extend * 0.55 || airTrick)) {
          rimCamCut = true; console.info(`[DUNK-CAM] rim cut @${clipTime.toFixed(2)}`);
          // REVIEW F2 (2026-09-14): THE CUT HELD A POINT AND LET THE DUNKER LEAVE THE FRAME.
          //
          // `snapTo(baseline, playerPos)` reads its FIRST argument as the subject, so this framed a fixed
          // spot 2.6 m off the rim and treated the dunker as an angle hint — and then the camera was held
          // for the rest of the flight ("no per-frame follow"), while he travelled another 1.4 m and rose.
          // The review's own screenshot is the result: at the flush, the backboard is half out of the left
          // edge and the dunker is away to the right. The money shot of a dunk contest showed a man jumping
          // NEAR a hoop.
          //
          // A broadcast rim-cam holds its POSITION and pans. `setFixed` is exactly that: the camera sits
          // still and `update()` aims at the subject lerped toward the objective, so the dunker AND the rim
          // stay in shot for the whole flight. Placed low and to the baseline side, which is where the
          // under-basket camera actually lives.
          ctx.camDirector.setFixed(new Vector3(rim.x + 2.9, 1.15, rim.z + 1.9), 1.5, true);
        }

        // alley-oop: teammate releases the toss partway through the rise;
        // ball arcs from their hand to the player's, deterministic timing —
        // cannot desync, cannot stall.
        // DUNK-CONTROL-JUICE: the alley-oop is a real pass now — the teammate's toss arcs to the catch point in clip time and
        // the dunker's hand has to meet it (it used to LERP head-high and parent itself to the palm on a timer)
        if (prop === 'oopalien' && !lob.thrown && clipTime >= 0.02) throwAlienLob(ctx, Math.max(0.45, LOB_CATCH_CLIP_T - clipTime));
        if (isOop(prop) && teammate && !lob.thrown) {
          if (clipTime >= 0.02) teammate.animator.play(SPORT_CLIP.teammateToss, {});   // the passer winds up as the dunker leaves the floor
          if (prop === 'oopcorner' && clipTime >= 0.02) {   // DUNK PARKOUR: the billboard oop leaves at once — the bank needs the whole rise
            throwCornerLob(ctx, ball.getAbsolutePosition().clone(), Math.max(0.45, CORNER_CATCH_CLIP_T - clipTime));
          } else if (clipTime >= EASTBAY_TIMING.rise * 0.9) {
            // the passer can throw everything the self-lob can, and the SAME solvers run it — a lob off the glass is a
            // lob off the glass whoever let go of it
            const from = ball.getAbsolutePosition().clone();
            const t = Math.max(0.35, LOB_CATCH_CLIP_T - clipTime);
            const out = Math.max(0.5, from.z - rim.z);
            if (prop === 'oopglass') throwGlassLob(ctx, from, t + GLASS_CATCH_CLIP_T, true, out);
            else if (prop === 'oopbounce') throwBounceLob(ctx, from, t + LOB_CATCH_CLIP_T, true, out);
            else throwLob(ctx, from, 'ALLEY-OOP', t);
          }
        }

        const wasOpen = qteWindowOpen, wasCue = slamCueOn;
        flight.update(dt * (Number.isFinite(animScale) && animScale > 0 ? animScale : 1));   // the air budget burns in CLIP time — the hang slow-mo stretched the flight but not the budget, so a second trick was refused for air the player could see
        const window = slamWindowBase() * (1 - styleTaps * 0.25) * flight.slamWindowScale;
        const openAt = EASTBAY_TIMING.extend - window / 2, closeAt = EASTBAY_TIMING.extend + window / 2;
        qteWindowOpen = clipTime >= openAt && clipTime <= closeAt;
        if (meter3d) { meter3d.green(slamGreen()); meter3d.set(clipTime / meterSpan, player.root.position.add(new Vector3(0, 1.72, 0))); }
        // DUNK-BODY-MID: the SLAM READ and the accepted input are the same thing. The window is ~14 rendered frames wide;
        // the call used to appear on its opening frame, so the honest reaction — press when you see it — arrived after the
        // press that would have worked. The cue lifts a buffer's width early and every press from there is taken.
        // CLOTHING-SOFT-RESIDUAL R2: the buffer (and the SLAM! read with it) reaches back to the top of the arc — "SLAM at the top"
        const holdSec = slamBufferSec(openAt, SLAM_APEX_T, SLAM_BUFFER_SEC);
        slamCueOn = !lob.live && clipTime >= openAt - holdSec && clipTime <= closeAt;
        // THE BEAT IS MACHINE-READABLE (CLOTHING-SOFT-RESIDUAL R2, 2026-09-21). `slamBeat` names where the flight is against
        // the SLAM window — 'cue' (the read is up, a press is held for the window), 'open' (inside it), 'beat' (its centre,
        // the NOW! call), '' (none) — and the play HUD mirrors it as `data-fel-slam` on its root. The QA eye's "ontime" runs
        // pressed SLAM a fixed 400 ms after letting go of RUN, which landed at clip 0.39–0.54 on the RISE: 574–770 ms before
        // the window, refused TOO EARLY every time, and then filed the frames as "through-rim". A harness that wants an
        // on-time press waits for this to read 'beat' and presses then (scripts/probes/_r2-ontime-probe.mts); nothing about
        // the window itself moved.
        if ((slamCueOn || (qteWindowOpen && lob.live)) && !(wasCue || wasOpen)) ctx.setHud({ hint: lob.live ? 'CATCH IT!' : 'SLAM — OR WAIT FOR THE BEAT', slamPulse: true, slamBeat: lob.live ? 'catch' : 'cue' });
        // P2 (2026-09-16): THE BEAT ITSELF IS AUDIBLE. The read lifts at the top of the arc and every press from there
        // is taken, which is right — a 14-frame window is not a reaction test. But a player who only ever sees one
        // signal can never learn where the perfect beat is: they press on the read, take their 25-40 %, and have no way
        // to find the other 60. The window's own opening now has a tell of its own — a word and a tick — so the beat
        // can be learned by ear the way a rhythm game teaches one.
        // …BUT THE LOUD WORD HAS TO LAND ON THE BEAT, NOT BEFORE IT (owner, 2026-09-19).
        // "NOW!" fired on the window's OPENING frame while the card scores the press against the window's CENTRE, so a
        // player who does exactly what the prompt says is half a window early — every time. Measured with the lab
        // pressing the frame the word appeared: 107 ms, 108 ms, 110 ms, 122 ms EARLY across every run tonight, and
        // "0 slams on time" in every single report.
        // The rhythm lesson the opening tell was added for is kept: the window still announces itself with its own
        // word and tick. The instruction moved to the beat, where obeying it scores.
        if (qteWindowOpen && !wasOpen && !lob.live) {
          ctx.setHud({ hint: 'WINDOW OPEN', slamBeat: 'open' });
          SoundKit.play('uiTick', { pitch: 1.55, volume: 0.4 });
        }
        if (!lob.live && !beatCalled && clipTime >= EASTBAY_TIMING.extend && clipTime <= closeAt) {
          beatCalled = true;
          ctx.setHud({ hint: 'NOW!', slamBeat: 'beat' });
          SoundKit.play('uiTick', { pitch: 1.9, volume: 0.55 });
        }
        if (!slamCueOn && !qteWindowOpen && (wasCue || wasOpen)) ctx.setHud({ slamPulse: false, slamBeat: '' });
        // a press the buffer was holding fires on the frame the window opens — its execution is scored from where the finger was
        if (qteWindowOpen && !wasOpen && slamBufferAt >= 0 && !lob.live && openAt - slamBufferAt <= holdSec + 1e-6) slamNow(ctx, slamBufferAt);   // resolveDunk moves the phase; the resolve block below picks the jam up on this same frame. The hold is measured from the window's EDGE, not the frame that crossed it (a press at the top missed by one frame's overshoot, 316 ms against 310)
        // A PRESS TOO EARLY EVEN FOR THE BUFFER USED TO VANISH. The review measured three attempts out of
        // six that scored nothing and explained nothing, and this is the purest case: the finger moved, the
        // buffer could not hold it that long, and the game said nothing at all. It says so now. The press is
        // still let go — this is feedback, not a second chance.
        else if (qteWindowOpen && !wasOpen && slamBufferAt >= 0 && !lob.live) {
          refuse(ctx, `TOO EARLY — ${Math.round((openAt - slamBufferAt) * 1000)} ms BEFORE THE WINDOW`);
          slamBufferAt = -1;
        }
        if (clipTime >= closeAt) { meter3d?.end(lob.live ? 'brick' : 'late'); if (lob.live) lostLob(ctx); else resolveDunk(ctx); }   // the hand never met the toss — a miss, the ball bounces away
      }

      if (phase === 'resolve') {
        player.root.rotation.z *= Math.max(0, 1 - dt * 6);   // the air lean settles on the landing
        // DUNK-BIOMECH contact facing latch: the root keeps easing onto the rim bearing through the flush / the clank and a
        // turn the flight ended early (the prop, a lost lob) unwinds to rim-facing before the feet come down
        if (!replaying) faceToward(rim, dt * FACE_RIM_RATE);
        sinceRelease += dt;
        if (finishRelease >= 0) {   // DUNK-POSTURE-LEGS: the ball rides the windmill's sweep and leaves at the top of it
          finishT += dt;
          // DUNK-HANDS-RIM: the top of the sweep starts the JAM — the ball stays in the palm and the reach carries it the rest of the
          // way to the iron (it used to let go here, 0.45 m short, and float in)
          if (finishT * finishRate >= finishRelease) { finishRelease = -1; jamSec = 0; jamContact = false; jamPrevLive = false; punchPending = false; console.info(`[HANDS] windmill top at ${finishT.toFixed(2)} s (${ball.getAbsolutePosition().y.toFixed(2)} m) — the jam carries it in`); }
        }
        // a clipped dunk drops the dunker where the prop caught him, and the
        // prop goes over — the failure has to READ as contact, not a teleport
        if (obstacleClipped) {
          // the dunker drops where the prop caught him: back onto the floor in front of a side he ran into, onto the top he
          // caught with his feet, the floor past a toppled barrier / crate
          player.root.position.y = Math.max(clipFloorY, player.root.position.y - 6 * dt);
          player.root.position.z += (clipBackZ - player.root.position.z) * Math.min(1, dt * 6);
        }
        if (qteHit) {
          if (aHeld) hangSec += dt;               // rim hang builds while SLAM stays held
          // DUNK-HANDS-RIM: the JAM — the ball in the palm, the body following through into the iron, the contact on the frame the
          // ball meets the ring (or the short timeout); the release is FROM the hand at the iron, never a float
          if (jamSec >= 0 && !jamContact && !obstacleClipped) {
            jamSec += dt;
            if (!replaying) {
              // DUNK-CAR-CLIP R2: a ball still further out than an on-time carry (a late press's finish) carries the body that much further in
              ball.computeWorldMatrix(true);
              const jamExtra = jamFollowExtra(Math.hypot(ball.getAbsolutePosition().x - rim.x, ball.getAbsolutePosition().z - rim.z));
              player.root.position.z += (rim.z + FLUSH_Z_AHEAD - JAM_FOLLOW_M - jamExtra - player.root.position.z) * Math.min(1, dt / JAM_FOLLOW_TAU);
              // the pull-up on the iron (never down); the LEFT-hand carry (the eastbay after its pass) pulls up further — the pass leaves
              // that palm facing down with the ball riding UNDER the wrist, 0.15 m lower than the right hand's palm-out carry
              const jamY = JAM_Y + (ebState.inLeftHand ? JAM_Y_LEFT_EXTRA : 0);
              // DUNK-CAR-CLIP R2: …and a body still ABOVE the jam height comes DOWN onto the iron. An early press the buffer fired at
              // the window's open edge (clip 1.11) resolves at the top of the arc — root 1.44 against 1.15 on time — and "never down"
              // held the ball 0.33 m over the ring until the 0.28 s timeout let it go 0.35 m off the iron and the flush floated it in
              // (the QA eye's "early windmill ≠ rim"). A slam comes down on the rim; the drop eases slower than the pull-up so it
              // reads as the body dropping onto the iron, not a snap.
              player.root.position.y = jamRootStep(player.root.position.y, jamY, dt, JAM_LIFT_TAU, JAM_DROP_TAU);
            }
            ball.computeWorldMatrix(true);
            const bp = ball.getAbsolutePosition();
            if (ironContact({ ball: bp, rim, rimRadius: RIM_RADIUS, ballRadius: ballSim.radius, sincePress: jamSec })) {
              // DUNK-BALL-ARMS-RIM: let go where the ball TOUCHED the iron on this frame's travel, not where the frame left it (in the metal)
              // …and out of the metal when it was already in it a frame ago (a low catch under the front rim: no clear frame to rewind to)
              const touch = clearOfIron(jamPrevLive ? sweptTouch(jamPrevBall, bp, rim, RIM_RADIUS, ballSim.radius) : bp, rim, RIM_RADIUS, ballSim.radius);
              releaseBall(ball); ball.position.set(touch.x, touch.y, touch.z);
              jamContact = true; flushRealSec = performance.now() / 1000; releasePos.copyFrom(ball.position); sinceRelease = 0; flush = startFlush(ball.position, rim, RIM_RADIUS, ballSim.radius, NET_THROW_MIN + (NET_THROW_MAX - NET_THROW_MIN) * Math.max(0, Math.min(1, qteAccuracy)));   // NET EXIT: a clean slam spits it out
              console.info(`[HANDS] iron contact ${(jamSec * 1000).toFixed(0)} ms into the jam: ball ${Vector3.Distance(bp, rim).toFixed(2)} m from the rim centre (${bp.y.toFixed(2)} m) · iron ${ringDistance(bp, rim, RIM_RADIUS).toFixed(3)} m (last frame ${jamPrevLive ? ringDistance(jamPrevBall, rim, RIM_RADIUS).toFixed(3) : '—'}) → let go at ${ringDistance(touch, rim, RIM_RADIUS).toFixed(3)}`);
              // DUNK-BALL-ARMS-RIM: the CONTACT is the ball ON the iron — a jam that timed out with the ball short of it (a late slam:
              // 9 cm of daylight measured) punches on the flush frame the ball meets the ring, not on the release
              if (ringDistance(ball.position, rim, RIM_RADIUS) <= ringClearance(ballSim.radius) + 0.02) { setWin('contact'); contactPunch(ctx); } else punchPending = true;
              // THE HANG'S CAP COUNTS FROM THE CONTACT, not the press (2026-09-18): the jam takes ~1.0 s from the slam to the iron, so a
              // slam held from the beat arrived at the ring with hangSec already at the 1 s cap and the hang never engaged (measured:
              // 'slam up 0.95 s after the press' on an ON TIME slam). Held on the contact = a hang; the tick caps it from here.
              console.info(`[HANDS] contact: slam ${aHeld ? 'held' : 'up'} ${hangSec.toFixed(2)} s after the press`);
              if (aHeld || skyTapped) { hangOn = true; hangHeldSec = 0; hoopJuice?.hold(true); console.info(`[HANDS] rim hang${skyTapped && !aHeld ? ' (the drop hangs)' : ''}`); }   // THE SKY TIER: the drop-in flip hangs on its own   // SLAM still held on the contact = a hang (a tap that overlaps it is a 20 ms pull, released with the tap)
            } else { jamPrevBall.copyFrom(bp); jamPrevLive = true; }
          }
          if (jamContact) {
            if (flush && flush.phase !== 'free') {
              const st = stepFlush(flush, rim, RIM_RADIUS, ballSim.radius, dt);
              ball.position.set(st.pos.x, st.pos.y, st.pos.z);
              if (punchPending && (ringDistance(st.pos, rim, RIM_RADIUS) <= ringClearance(ballSim.radius) + 0.02 || st.phase !== 'lip')) { punchPending = false; setWin('contact'); contactPunch(ctx); console.info(`[HANDS] contact on the iron ${(sinceRelease * 1000).toFixed(0)} ms after the let-go`); }
              if (st.phase === 'free') { ballSim.launch(ball.position.clone(), new Vector3(st.vel.x, st.vel.y, st.vel.z)); looseBall = true; netRealSec = performance.now() / 1000; console.info(`[HANDS] through the net ${(sinceRelease * 1000).toFixed(0)} ms after the contact`); }
            }
            const through = sinceRelease > FLUSH_BEAT_SEC;
            if (hangOn) {
              hangHeldSec += dt;
              // THE RIM SWING: the stick drives a pendulum under the rim; the body rolls with it and the hips swing out
              if (!hangBase) { hangBase = player.root.position.clone(); swingAng = 0; swingVel = 0; swingPeak = 0; }
              swingVel += (stickX * 18 - swingAng * 9 - swingVel * 2.5) * dt;   // the stick wins: a push reaches the swing's clamp inside ~0.2 s
              swingAng = Math.max(-0.6, Math.min(0.6, swingAng + swingVel * dt));
              swingPeak = Math.max(swingPeak, Math.abs(swingAng));
              player.root.rotation.z = -swingAng * 0.8;
              player.root.position.x = hangBase.x + Math.sin(swingAng) * 0.55; player.root.position.y = hangBase.y - (1 - Math.cos(swingAng)) * 0.55;
              if (!hangHold(aHeld || (skyTapped && hangHeldSec < HANG_MAX_SEC), hangHeldSec, HANG_MAX_SEC + (skyTapped ? 0.8 : 0))) {   // a high-tier drop hangs longer
                hangOn = false; hoopJuice?.hold(false); console.info(`[HANDS] hang release after ${hangHeldSec.toFixed(2)} s`);
                console.info(`[DUNK-PARKOUR] rim swing peak ${swingPeak.toFixed(2)} rad`);
                if (swingPeak > 0.25) { styleTaps = Math.min(2, styleTaps + 1); hype = Math.min(100, hype + 8); flash(ctx, `RIM SWING${swingPeak > 0.5 ? ' · BIG' : ''}`, 700); SoundKit.play('crowdCheer', { volume: 0.4 }); }
                hangBase = null;
              }
            }
            else if (through) void finishAttempt(ctx, true);
          }
        } else {
          if (sinceRelease > 1.2) void finishAttempt(ctx, false);   // the clanked ball is a loose ball (stepped below)
        }
      }

      if (phase !== 'cinematic' && !replaying) { if (spin.active) { const y = spin.settle(dt); if (!spin.active) console.info(`[DUNK-CUE] spin settled ${y.toFixed(2)} rad`); } if (phase !== 'resolve') player.root.rotation.z *= Math.max(0, 1 - dt * 6); }
      obstacle?.tick(dt);
      if (lob.live && phase === 'resolve') stepLob(ctx, dt);   // a lost lob keeps bouncing through the miss beat
      // DUNK-BALL-ARMS-RIM: a loose ball (out of the net, off the rim) keeps its physics in every phase until a hand takes it; the
      // replay owns it while it plays (the sim holds its state and picks up where the replay's last frame left the ball)
      if (looseBall && !ball.parent && !lob.live && !replaying) ballSim.step(dt, 0, FLOOR_E, FLOOR_FRICTION);
      // ── A+ P8 athlete hands: the replay's clips, the fall to feet-down, the reach weight ──────────────────────────
      if (replaying) {
        // H5: the replay re-flies the recorded root at 0.5× for up to 8 s — the clips re-fly with it: the run on the floor, the
        // launch clip from the replayed takeoff (at the live flight's own clip rate: the hang slow-mo stretched it), the finish
        // where the live flight resolved. Before: idle_stand flew the whole replay.
        const y = player.root.position.y;
        if (!replayAir && y > 0.05 && replayPrevY <= 0.05) {
          replayAir = true; replayAirSec = 0; replayAerial = false; replayClipNow = PLANT_SEC;
          const liveSec = Math.max(0.2, (resolveRealMs - launchRealMs) / 1000);
          // DUNK-POSTURE-LEGS: the recorded root leaves the floor PLANT_SEC into the live clip — the replay's clip starts there
          const liveAir = Math.max(0.2, liveSec - PLANT_SEC);
          replayAerialAt = liveAir / 0.5;
          // DUNK-SOFTS-NAMED: the replayed launch clip runs out before the finish is due → it flows into the held hang, as the live
          // flight does (measured: 15 clip-less frames on the replay of every make — a frozen pose mid-replay)
          const replayRate = Math.max(0.2, 0.5 * Math.max(0.2, clipTimeAtResolve - PLANT_SEC) / liveAir);
          replayRateNow = replayRate; replayTrickIdx = 0; replaySpinYaw = 0;
          const rg = playClip(STYLE_CLIP[style], { speedRatio: replayRate, fadeSec: 0.25, onEnd: () => { if (replaying && replayAir && !replayAerial) { playClip(SPORT_CLIP.dunkScoreHang, { speedRatio: replayRate, onEnd: () => {} }); console.info('[HANDS] replay launch → hang'); } } });
          rg?.goToFrame(PLANT_SEC * 30);   // the clip's plant already happened on the floor
          console.info('[HANDS] replay air');
        } else if (!replayAir) playClip(runLoop(), { loop: true });
        if (replayAir) {
          replayAirSec += dt;
          // DUNK-BIOMECH: the replay re-fires the live tricks and the live turn on the replayed flight's clock (the replay used to
          // re-fly only launch → hang → finish, so a 360 replayed as a plain jump) — same facing as live, Euler yaw from the recorder
          const replayClipT = replayAirSec * replayRateNow + PLANT_SEC; replayClipNow = replayClipT;
          while (replayTrickIdx < liveTricks.length && !replayAerial && replayClipT >= liveTricks[replayTrickIdx].t0) { const lt = liveTricks[replayTrickIdx++]; playAir(lt.clip, replayRateNow * lt.speed); console.info(`[HANDS] replay trick ${lt.clip}`); }
          replaySpinYaw = replayAerial ? 0 : DunkSpin.yawAt(liveSpin, replayClipT);
          if (!replayAerial && replayAirSec >= replayAerialAt) { replayAerial = true; replaySpinYaw = 0; playAir(aerialClip, 0.5); console.info('[HANDS] replay aerial'); }
        }
        replayPrevY = y;
      }
      // H5: the fall — a miss from the release height, a make once the replay hands the root back (the chair's own drop stays)
      if (dropToFloor && !replaying && !obstacleClipped) {
        player.root.position.y = Math.max(0, player.root.position.y - FALL_SPEED * dt);
        if (player.root.position.y <= 0) dropToFloor = false;
      }
      // H5: feet-down — the land clip plays when the body is back on the floor, never on the hit frame and never in the air
      const floorY = obstacleClipped ? clipFloorY : 0;
      if (airHeld && !replaying && phase !== 'cinematic' && player.root.position.y <= floorY + 0.05) landNow();
      // H1: the reach weight — up from the hang rise (in clip time), held through a make's flush to CONTACT, down otherwise
      // DUNK-SOFTS-NAMED: the reach starts at the CARRY-UP (the extension toward the iron), not the rise — through the rise and
      // the mocap's wind-up the hand swings past the shoulder and a reach toward the rim whipped it (0.8 m/frame measured;
      // the clip alone moves 0.22 m/frame), so the catch and the wind-up ride the clip's own hand now
      const reachWant = (phase === 'cinematic' && clipTime >= HAND_IK_FROM && !obstacleClipped)
        || (phase === 'resolve' && qteHit && (!contactLatch || hangOn) && !obstacleClipped && finishRelease < 0)   // DUNK-HANDS-RIM: on through the jam to the iron, held through a hang
        || (replaying && replayAir && (replayAerial || replayClipNow >= HAND_IK_FROM));   // DUNK-BALL-ARMS-RIM: the replay reaches on the live flight's clip beat — on from the replay's first airborne frame, the reach whipped the arms 0.31–0.36 m a frame toward a rim 2 m away
      const ikScale = ctx.scene.animationTimeScale ?? 1;
      const ikStep = dt * (phase === 'cinematic' && Number.isFinite(ikScale) && ikScale > 0 ? ikScale : 1) / HAND_IK_LAG_SEC;
      const prevIk = handIkT;
      handIkT = reachWant ? Math.min(1, handIkT + ikStep) : Math.max(0, handIkT - ikStep);
      if (prevIk === 0 && handIkT > 0) { console.info('[HANDS] reach on'); lagLive = false; } else if (prevIk > 0 && handIkT === 0) { console.info('[HANDS] reach off'); lagLive = false; }

      // THE SKY TIER sways, and rocks when it is tapped
      if (skyRoot) { skyBob += dt; skyKick = Math.max(0, skyKick - dt * 1.4); skyRoot.position.y = SKY.underY + Math.sin(skyBob * 0.9) * 0.08 + skyKick * 0.25; skyRoot.rotation.z = Math.sin(skyBob * 0.6) * 0.03 + Math.sin(skyKick * Math.PI) * 0.12; skyRoot.rotation.y = Math.sin(skyBob * 0.35) * 0.05; }
      // the building breathes with the contest every frame
      crowd.update(dt, Math.min(1, hype / 100), chain, momentum.tier === 'on_fire');
      SoundKit.setAmbientLevel(crowd.level);

      if (phase === 'judging') {
        for (const beat of reveal.update(dt)) {
          if (beat.kind === 'confer') {
            ctx.setHud({ hint: 'THE JUDGES CONFER…' });
            SoundKit.play('uiTick', { pitch: 0.7, volume: 0.3 });
          } else if (beat.kind === 'card' && beat.judge) {
            revealed = [...revealed, beat.judge];
            ctx.setHud({ judgeReveal: revealed });
            SoundKit.play('uiTick', { pitch: 1 + beat.judge.score * 0.06, volume: 0.5 });
            ctx.feel?.impact?.(0.12);
          } else if (beat.kind === 'drum') {
            ctx.setHud({ hint: "PRIME'S CARD…" });
            SoundKit.play('uiTick', { pitch: 0.9, volume: 0.4 });
            SoundKit.play('uiTick', { pitch: 0.95, volume: 0.35 });
          } else if (beat.kind === 'total') {
            // THE 50. Raising the ceiling to 50 only means something if the game
            // KNOWS what a 50 is — it is the most recognisable call in the whole
            // event, and a perfect card sweep that scrolled by as an ordinary
            // eruption would waste the entire point of this change.
            const perfect = beat.total === PERFECT_TOTAL;
            // DUNK PARKOUR: a perfect on a hard dunk is an OVERDRIVE — the board goes, the building shakes
            const overdrive = perfect || overdriveDunk(qteAccuracy, lastScores.length ? lastScores.reduce((a, j) => a + j.score, 0) / lastScores.length * 0.8 : 0);
            if (overdrive) { for (let i = 0; i < 3; i++) EffectsKit.burst(ctx.scene, new Vector3(rim.x, rim.y + 0.5 + i * 0.3, rim.z - 0.6), 'glitch', 2); ctx.juice.shake(0.22, 300); ctx.juice.flash('#ffffff', 110); console.info('[DUNK-PARKOUR] OVERDRIVE — the board shatters'); }
            ctx.setHud({ hint: '', judgeReveal: revealed, banner: perfect ? 'FIFTY! · OVERDRIVE' : overdrive ? 'OVERDRIVE DUNK' : '' });
            ctx.camDirector.pulse(perfect ? 1.4 : beat.band === 'eruption' ? 1 : beat.band === 'hush' ? 0.15 : 0.4, 0.6);
            if (perfect) {
              // A 50 has to SOUND like a 50. An eruption already plays a cheer
              // at full volume, so pitch alone would not separate the rarest
              // call in the event from a merely great dunk. Layer it: the cheer
              // stacks, the building keeps going, and the whistle cuts through.
              SoundKit.play('crowdCheer', { volume: 1 });
              SoundKit.play('crowdCheer', { volume: 0.9, pitch: 1.15 });
              SoundKit.play('score', { pitch: 1.5 });
              SoundKit.play('whistle', { volume: 0.5 });
              setTimeout(() => SoundKit.play('crowdCheer', { volume: 0.85, pitch: 0.95 }), 420);
              crowd.level = 1;
              SoundKit.setAmbientLevel(1);
              ctx.feel?.impact?.(0.8);
              for (const dy of [1.6, 2.2, 2.8]) {
                EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(0, dy, 0)), 'confetti');
              }
              setTimeout(() => ctx.setHud({ banner: '' }), 2000);
            } else if (beat.band === 'eruption') {
              SoundKit.play('crowdCheer', { volume: 1 });
              SoundKit.play('score', { pitch: 1.3 });
              ctx.feel?.impact?.(0.5);
              EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(0, 2, 0)), 'confetti');
            } else if (beat.band === 'hush') {
              SoundKit.play('crowdGroan', { volume: 0.6 * crowd.level + 0.2 });
            } else {
              SoundKit.play('crowdCheer', { volume: 0.4 * crowd.level + 0.2 });
            }
          }
        }
      }

      if (phase === 'rivalTurn') {
        // REVIEW (2026-09-14): "the rival dunks offscreen" — he was framed by the gameplay follow camera
        // while the player got a broadcast cut, so his run was a number appearing rather than something you
        // watched him do. He gets the same under-basket cut now: you have to SEE what you are chasing, or
        // the deficit on the HUD is just arithmetic.
        if (!rivalCamCut) {
          rivalCamCut = true;
          ctx.camDirector.setFixed(new Vector3(rim.x + 2.9, 1.15, rim.z + 1.9), 1.5, true);
        }
        ctx.camDirector.update(rival.root.position, Vector3.Zero(), rim);
      } else if (phase === 'cinematic' && rimCamCut) {
        // The position is fixed; the AIM tracks. This is the half that was missing — the camera used to
        // hold both and the subject walked out of frame. See the cut above.
        ctx.camDirector.update(player.root.position, Vector3.Zero(), rim);
      } else if (phase === 'judging') {
        // THE VERDICT. The camera used to be left entirely undriven here, so it
        // froze on whatever angle the replay cam happened to end on — for the
        // full 5.1s of the reveal, which is the mode's dramatic peak. A NULL
        // objective gives a clean hero framing with nothing else pulling on it:
        // the dunker, waiting on his card, which is the shot the broadcast cuts
        // to. Anything else in frame (the ball is the obvious candidate, and it
        // is wherever it bounced) drags the composition somewhere arbitrary.
        // REVIEW (2026-09-14): filmed during the confer, this CROPPED him — the hero cut off at the bottom
        // of frame with the rim half out at the left. A null objective gives the follow preset's own
        // distance and height, and that preset is tuned for gameplay, not for a man standing still waiting
        // on a card. Same class of mistake as the rim cut: the right framing for one phase is the wrong one
        // for another. A fixed three-quarter portrait, placed off his shooting shoulder.
        if (!verdictCamSet) {
          verdictCamSet = true;
          const away = player.root.position.subtract(rim); away.y = 0;
          if (away.lengthSquared() < 0.01) away.set(0, 0, 1); else away.normalize();
          const side = new Vector3(-away.z, 0, away.x);
          ctx.camDirector.setFixed(
            player.root.position.add(away.scale(3.1)).add(side.scale(1.7)).add(new Vector3(0, 1.75, 0)),
            1.25, true,
          );
        }
        ctx.camDirector.update(player.root.position, Vector3.Zero(), null);
      } else if (phase === 'resolve') {
        // THE LANDING IS NOT THE FLIGHT (2026-09-15). The rim cut is a FIXED camera under the basket aimed at the iron,
        // and 'resolve' fell through to the generic branch below — which only re-AIMS a fixed camera, so the verdict
        // beat was filmed from the rim with the dunker on the floor cropped at the bottom edge. Every capture's mid
        // frame since rc10 is that shot, and the Visuals review has charged it as "hero cropped at the frame edge".
        // The judging beat already learned this; the beat before it needs the same release.
        if (rimCamCut) { rimCamCut = false; ctx.camDirector.mode = 'follow'; }
        ctx.camDirector.update(player.root.position, Vector3.Zero(), null);
      } else if (phase === 'contestOver') {
        // TRY-ONBOARD G1: the night card sits on a LIVE shot. The camera used to be
        // left undriven in this phase — which was harmless when the phase was the last
        // 40 ms before ctx.end tore the stage down, and is a frozen frame now that a
        // guest can sit on the card as long as they like. Same framing the verdict
        // uses: the dunker, waiting, with nothing else pulling on the composition.
        ctx.camDirector.update(player.root.position, Vector3.Zero(), null);
      } else {
        // ALWAYS frame against the RIM, never the ball.
        //
        // This used the ball as the objective for every phase except the
        // approach — but through the launch and most of the flight the ball is
        // IN THE DUNKER'S OWN HAND, so subject and objective are the same point.
        // fitTwo then degenerates: the separation is ~0, the back-vector falls
        // through to a fixed world +z, and the camera whips in behind the hero
        // instead of holding a shot of the attack. Measured as 1-2
        // [FEL-FRAME] hero-off-screen lines per contest, every run, always
        // mid-flight.
        //
        // This is the same failure the convergence protocol records against 3PT
        // — "objective was the ball in the shooter's own hands" — which is
        // exactly why the protocol names it. The rim is what the player is
        // attacking and what the shot should be composed against.
        ctx.camDirector.update(player.root.position, vel, rim);
      }
    },

    dispose() {
      skyRoot?.dispose(); skyRoot = null;   // THE SKY TIER
      hoopJuice?.dispose(); hoopJuice = null;
      meter3d?.dispose(); meter3d = null;
      dribble?.dispose(); dribble = null;
      if (ikScene && handIkObs) ikScene.onAfterAnimationsObservable.remove(handIkObs);   // A+ P8 H1
      handIkObs = null; ikScene = null; handIkT = 0;
      ring?.dispose(); ring = null;
      player?.dispose(); rival?.dispose(); replay?.dispose(); ball?.dispose();
      stopWalkOut(); walkAudio = null; walkCue = null; walkOut = null;
      clearProps(); SoundKit.stopAmbient(); feet = { L: null, R: null };
      dunkVenue?.dispose(); dunkVenue = null;  // M74
      for (const p of sideProps) p.dispose(); sideProps = [];
    },
  };

  function watchdog(ctx: ModeContext): void {
    if (phaseSec <= BUDGET_SEC[phase] || finishing) return;
    console.warn(`[FEL-DUNK] watchdog tripped in phase "${phase}" after ${phaseSec.toFixed(1)}s — auto-resolving`);
    switch (phase) {
      case 'approach':
        player.root.position.set(0, 0, gatherLine());
        ctx.setHud({ hint: 'HOLD to run — then tap jump · LOOK stick orbits the camera' });
        phaseSec = 0;
        break;
      case 'charge': launchDunk(ctx); break;
      case 'cinematic': resolveDunk(ctx); break;
      case 'resolve': void finishAttempt(ctx, qteHit); break;
      case 'judging': void advanceAfterJudging(ctx); break;
      case 'rivalTurn': rival.root.position.set(3.2, 0, CFG.rimZ + 3); rival.root.rotation.y = 0; void advanceAfterRivalTurn(ctx); break;   // soft-OPEN #3: the rival is parked + idled by the advance
    }
  }

  // --- M111: performance/timing-driven dunk finish selection -----------------
  // Aerial finish is chosen by QTE TIMING (how well the slam was timed); landing
  // is chosen by PERFORMANCE (the 3-judge total). Gated by DUNK_FINISH_VARIETY —
  // set NEXT_PUBLIC_DUNK_FINISH_VARIETY=false to instantly restore prior behavior.
  /**
   * THE FINISH BELONGS TO THE DUNK YOU CALLED (P4, 2026-09-16).
   *
   * This used to choose a NAMED DUNK from the slam's accuracy alone: call a SCORPION, time it well, and the flush
   * played `dunk_finish_tomahawk` and the banner shouted TOMAHAWK! — at the exact moment the camera is closest to the
   * body. Measured in the lab: `scorpion → dunk_scorpion → dunk_finish_tomahawk`. The project already has a rule
   * against a move playing another move's motion (anim/recognisable); naming the other move out loud is worse.
   *
   * A called trick keeps its own shape through the flush. The accuracy-picked flourish is still there for a PLAIN
   * dunk — earning a windmill by timing a bare dunk perfectly is a reward, and it lies about nothing, because the
   * player called nothing. Quality on a called dunk lives where it belongs now: the card, the rim hang, the room.
   */
  function pickAerialFinish(hit: boolean, acc: number, leftHand = false, called: string | null = null): string {
    if (!DUNK_FINISH_VARIETY) return hit ? SPORT_CLIP.dunkScoreHang : SPORT_CLIP.jumpLand;
    if (!hit) return SPORT_CLIP.dunkFinishBlown;      // mistimed / whiffed slam
    if (FINISH_FORCE) return FINISH_FORCE === 'windmill' ? SPORT_CLIP.dunkFinishWindmill : FINISH_FORCE === 'tomahawk' ? SPORT_CLIP.dunkFinishTomahawk : SPORT_CLIP.dunkScoreHang;
    // DUNK-HANDS-RIM: the windmill and the tomahawk are authored RIGHT-armed — with the ball in the LEFT hand (the eastbay after
    // its under-the-leg pass) the right arm swept while the ball rode the left, and the left arm's reach to the iron was capped
    // by the anti-flip shaping from the finish's own pose (measured: the ball 0.16 m under the ring on the timeout). The
    // left-hand carry finishes on the two-hand hang, which its jam carries to the iron.
    if (leftHand) return SPORT_CLIP.dunkScoreHang;
    if (called === 'windmill') return SPORT_CLIP.dunkFinishWindmill;    // the dunk that was called, finished as itself
    if (called === 'tomahawk') return SPORT_CLIP.dunkFinishTomahawk;
    if (called) return SPORT_CLIP.dunkScoreHang;                        // every other named dunk jams two-handed out of its own shape
    if (acc >= 0.85) return SPORT_CLIP.dunkFinishWindmill;  // a PLAIN dunk, perfectly timed: the flourish is earned
    if (acc >= 0.55) return SPORT_CLIP.dunkFinishTomahawk;  // good timing
    return SPORT_CLIP.dunkScoreHang;                        // clean but late/early
  }
  function finishBanner(hit: boolean, acc: number, leftHand = false, called: string | null = null): string {
    if (!DUNK_FINISH_VARIETY || !hit || leftHand) return '';
    if (called) return '';                                  // the trick's own banner already named it; never rename a dunk
    if (acc >= 0.85) return 'WINDMILL!';
    if (acc >= 0.55) return 'TOMAHAWK!';
    return '';
  }
  /** The last named air trick of this flight — the dunk the player actually called. */
  const calledAirTrick = (): string | null => flight.attempt.tricks.length ? flight.attempt.tricks[flight.attempt.tricks.length - 1].id : null;
  function pickLanding(total: number): string {
    if (!DUNK_FINISH_VARIETY) return SPORT_CLIP.dunkLandCrouch;
    return total >= BAND_TOTAL.eruption ? SPORT_CLIP.dunkCelebrateBig : SPORT_CLIP.dunkLandCrouch;
  }

  /** The jump's height this attempt: the charge and the run-up buy it (the duel's factor), the double-up hop adds to it. */
  /** An obstacle that needs a bigger jump gets one — the take-off line already moves back for it, and the arc moves with it. */
  function apexLift(): number { const k = obstacleKindOf(prop); return k ? (OBSTACLE_SPECS[k].apexLift ?? 0) : 0; }
  function apexFor(): number { return ((1.05 + charge * 0.55) * (0.85 + launchSpeed01 * 0.3) + (doubleUp ? 0.15 : 0) + apexLift()) * launchMult() + doubleLaunchLift; }   // DUNK PARKOUR: the launch's multiplier and the double-launch's lift
  /** The jump a toss on the runway is aimed at: the charge the hold will have reached by the takeoff, the run-up so far. */
  let chargeAtLaunch = 0;
  function apexPredicted(): number { return ((1.05 + Math.max(charge, chargeAtLaunch) * 0.55) * (0.85 + Math.min(1, Math.max(runUpPeak, holdRunSpeed) / 7) * 0.3) + (doubleUp ? 0.15 : 0) + apexLift()) * launchMult() + doubleLaunchLift; }
  let launchZ = CFG.gatherZ;                  // where the flight left the floor (the carry is measured from here)
  let obstacleOver = false, obstacleCleared = false, obstacleMargin = Infinity;   // the clear, once per attempt
  /** The last slam's timing verdict, shown on the card. Null until a slam is pressed this attempt. */
  let slamTiming: SlamReadout | null = null;
  let clipFloorY = 0, clipBackZ = 0;          // where a clipped dunker comes down (the top he caught, or the floor before the side he hit)

  /** DUNK-BODY-MID: the SLAM lands. Called on the press inside the window, and from the window's opening frame for a
   *  press the buffer was holding — an early press is scored as the early press it was, never dropped. `at` is the clip
   *  second the FINGER moved, not the frame this runs on. */
  function slamNow(ctx: ModeContext, at: number): void {
    if (phase !== 'cinematic' || lob.live) return;
    slamBufferAt = -1; slamSeen = true;
    const center = EASTBAY_TIMING.extend;
    const window = slamWindowBase() * (1 - styleTaps * 0.25) * flight.slamWindowScale;
    // The execution curve is ONE curve over the whole accepted press — late of centre it falls across the window's own
    // half, early of centre across that half PLUS the buffer. A press is scored by how far it was from the perfect
    // beat, and being earlier is always worth less than being later-but-still-early; a two-branch version (a flat floor
    // for a buffered press) put a cliff on the window's opening edge where pressing one frame EARLIER scored better.
    // P2 (2026-09-16): the curve's early reach is the BUFFER'S OWN reach, so the invitation and the scoring can never
    // disagree again. It used to fall to zero a fixed SLAM_BUFFER_SEC before the window while the buffer reached all
    // the way back to the top of the arc — so the game raised SLAM, took the press, flushed the dunk, and paid 0 %.
    const half = window / 2;
    const openAt = center - half;
    const reach = slamBufferSec(openAt, SLAM_APEX_T, SLAM_BUFFER_SEC);
    qteAccuracy = slamExecution(at, center, half, reach);
    meter3d?.end(qteAccuracy >= 0.85 ? 'perfect' : qteAccuracy >= 0.5 ? 'good' : at < center ? 'early' : 'late');
    // P3: THE RIM IS HONEST. Every accepted press used to flush, so the only miss in the mode was never pressing, and
    // the card carried the entire difference between a great dunk and a flinch. A jam thrown at the iron before you
    // have got there hits iron — only the earliest sliver of the buffer (execution under RIM_CLEAN) does.
    qteHit = slamIsClean(qteAccuracy);
    const early = Math.max(0, openAt - at);   // how far in front of the window the finger actually was
    // AND NOW THE PLAYER IS TOLD. This exact information went to console.info and nowhere else, which is the
    // single loudest complaint in the review: three attempts out of six scored nothing and explained nothing.
    slamTiming = slamReadout(at, center, qteAccuracy, half);
    if (early > 0) console.info(`[DUNK-SLAM] buffered press @${at.toFixed(2)} fired at the window (${(early * 1000).toFixed(0)} ms early, execution ${qteAccuracy.toFixed(2)})`);
    // every accepted press, on the record (CLOTHING-SOFT-RESIDUAL R2): the probe names its frames by THIS, not by hope
    console.info(`[DUNK-SLAM] press @${at.toFixed(2)} · window ${openAt.toFixed(2)}–${(center + half).toFixed(2)} centre ${center.toFixed(2)} · ${slamTiming.zone} ${Math.round((at - center) * 1000)} ms · execution ${qteAccuracy.toFixed(2)} · ${qteHit ? 'CLEAN' : 'IRON'}`);
    // DUNK-POSTURE S3: the slam resolves ON THE PRESS. It used to wait for the window to close (clip 1.41 — the body
    // 0.3 m off the floor on the way down), so the ball left a hand at chest height and lerped 2.7 m up into the iron on
    // its own; the "jam" the eye saw was a reach forward at knee height. Pressed inside the window the hand IS at the
    // rim (the extension rides the top of the arc); the release, the finish and the flush follow from there, the root
    // hangs at that height until the replay hands it back (the rim hang), the accuracy read above is unchanged.
    resolveDunk(ctx);
  }
  /** DUNK-BODY-MID: a SLAM press the window has not opened for yet. Held (the newest press wins) and fired on the frame
   *  it opens, if it is still inside SLAM_BUFFER_SEC by then. A press earlier than that is a genuine mistime — it is
   *  logged and let go, never turned into a banner for a trick the player did not ask for. */
  function bufferSlam(): void {
    if (phase !== 'cinematic' || lob.live) return;
    slamSeen = true; slamBufferAt = clipTime;
    console.info(`[DUNK-SLAM] buffered @${clipTime.toFixed(2)} (window opens @${(EASTBAY_TIMING.extend - slamWindowBase() * (1 - styleTaps * 0.25) * flight.slamWindowScale / 2).toFixed(2)})`);
  }

  /** A trick button in the air: the cue table decides — before the trick's beat it is ARMED (fires on the beat), inside
   *  its window it fires now, after its last beat it is refused with a banner. A bare button (no direction) after the rise
   *  is the style tap. DUNK-BIOMECH (2026-09-08): a 360 tapped at the carry-up used to spin through the flush. */
  function airButton(ctx: ModeContext, e: FelInput): void {
    const isA = e.t === 'button' && e.btn === 'A';
    const trick = flight.peek(e);
    // DUNK-BODY-MID: A IS THE SLAM. Three presses used to be swallowed here — a bare A (nothing matched, nothing
    // happened), an A under a direction the last trick had already spent, and an A under a direction whose trick could
    // no longer fire. All three are the player asking to slam; all three go to the buffer now. Only a FRESH direction
    // (pressed since the last trick fired) still speaks for the trick, and only B / Y — which are not the slam button —
    // still earn a refusal banner when their beat has passed.
    if (!trick || (isA && flight.recognizer.dirSpent)) {
      if (clipTime >= EASTBAY_TIMING.rise) styleTap(ctx, e);
      if (isA) { if (trick) console.info(`[DUNK-CUE] ${trick.id}'s direction is spent — the press is the SLAM`); bufferSlam(); }
      return;
    }
    const v = cueVerdict(trick, clipTime), cue = cueOf(trick);
    if (v === 'early') {
      if (armedAir) return;   // one cue armed at a time — the first press is the one that fires
      armedAir = trick;
      console.info(`[DUNK-CUE] armed ${trick.id} @${clipTime.toFixed(2)} → fires @${cueFireAt(trick).toFixed(2)} (${cue.fire})`);
      flash(ctx, `${trick.label} ARMED · ${CUE_BEAT_LABEL[cue.fire]}`, 600);
      SoundKit.play('uiTick', { pitch: 1.4, volume: 0.3 });
      return;
    }
    if (v === 'late') {
      console.info(`[DUNK-CUE] late ${trick.id} @${clipTime.toFixed(2)} (window ${cueFireAt(trick).toFixed(2)}–${cueLastAt(trick).toFixed(2)})`);
      if (isA) { bufferSlam(); return; }   // the beat has gone; the button in his hand is still the slam
      refuse(ctx, `TOO LATE FOR THE ${trick.label} — ARM IT BY ${CUE_BEAT_LABEL[cue.last]}`);
      return;
    }
    fireTrick(ctx, trick, 'window');
  }
  /** The named trick fires: the air budget pays for it (or says why not), its body plays, a spinThrough trick starts the
   *  turn that resolves rim-facing by SPIN_RESOLVE_T whatever flight is left (momentum-led: later = quicker). */
  function fireTrick(ctx: ModeContext, trick: DunkTrick, how: 'window' | 'armed'): void {
    const got = flight.take(trick);
    if (!got) {
      // the run-up didn't buy the air that trick needs (or two are already in the air) — SAY so, or it reads as a dropped input
      // SAY WHAT WOULD HAVE BOUGHT IT (2026-09-16). "TWO TRICKS A FLIGHT" is a rule; a player who has just been refused
      // a third wants to know what buys one. The budget is the run-up and the style called, so name both.
      if (flight.refusal === 'limit') refuse(ctx, flight.capacity < 3 ? 'TWO TRICKS A FLIGHT — MORE RUN-UP AND A BIGGER STYLE BUYS A THIRD' : 'THREE TRICKS A FLIGHT — SLAM IT');
      else if (flight.rejectedForAir) { flight.rejectedForAir = false; refuse(ctx, 'NOT ENOUGH AIR — come in faster'); }
      console.info(`[DUNK-CUE] refused ${trick.id} @${clipTime.toFixed(2)}: ${flight.refusal ?? 'phase'}`);
      return;
    }
    trickLabels.push(trick.label);
    flight.recognizer.spend();            // DUNK-BODY-MID: one direction, one trick — the next A under this same hold is the SLAM
    airTrick = { trick, t0: clipTime };   // the trick's own clock (the lost-and-found's hand-off is keyed to it)
    liveTricks.push({ clip: trick.clip, t0: clipTime, speed: 1.05 });
    console.info(`[DUNK-TRICK] air ${trick.id} @${clipTime.toFixed(2)} (${how}, cue ${cueOf(trick).fire}→${cueOf(trick).last})`);
    const cue = cueOf(trick);
    if (cue.facing === 'spinThrough' && cue.turns) {
      spin.start(cue.turns, clipTime, SPIN_RESOLVE_T); liveSpin = spin.record;
      console.info(`[DUNK-CUE] spin ${cue.turns} turn(s) @${clipTime.toFixed(2)} → rim-facing by ${SPIN_RESOLVE_T.toFixed(2)}`);
    }
    playAir(trick.clip, 1.05);   // A+ P8 H5: a trick that ends in the air holds its last frame (it used to fall to idle mid-flight)
    hype = Math.min(100, hype + 6);
    SoundKit.play('whoosh', { pitch: 1.1 + trick.difficulty * 0.08, volume: 0.45 });
    SoundKit.play('crowdCheer', { volume: 0.3 + trick.difficulty * 0.05 });
    EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(0, 1.8, 0)), 'sparks');
    flash(ctx, trickLabels.length > 1 ? `COMBO: ${trickLabels.join(' → ')}!` : `${trick.label}!`, 700);
    ctx.camDirector.pulse(trickLabels.length > 1 ? 0.7 : 0.45, 0.5);
  }
  function styleTap(ctx: ModeContext, e: FelInput): void {
    if (e.t === 'button' && e.btn === 'B' && e.pressed && styleTaps < 2) {
      // STYLE TAPS — mid-air showboating before the SLAM window opens: +1.2 difficulty each, SLAM window shrinks 25% per tap (max 2)
      styleTaps++;
      SoundKit.play('whoosh', { pitch: 1.6, volume: 0.35 });
      ctx.feel?.impact?.(0.1);
      EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(0, 1.4, 0)), 'sparks');
      flash(ctx, `+STYLE TAP x${styleTaps}`, 450);
    }
  }

  function launchDunk(ctx: ModeContext): void {
    if (phase === 'cinematic') return;
    if (runwayBeat && runwayBeat.id !== 'doubleup') endRunwayBeat(true);   // a toss / kick / cartwheel still running gives the body to the takeoff (no run loop in between — the launch clip crossfades out of the beat)
    runwayBeat = null; launchQueued = false;
    if (busRun) {   // THE BUS WALL RUN: the jump off the front of the bus — from up its side, the flight a diagonal to the iron
      busLaunch = { x0: player.root.position.x, y0: player.root.position.y }; busRan = true; busRun = null; player.root.rotation.z = 0;
      vectorAt = performance.now(); vectorWallRun = true; doubleLaunchLift += BUS_RUN.apexAdd; runwayDifficulty += BUS_RUN.difficulty; runwayLabels.push(`RAN THE ${ride.short}`); hype = Math.min(100, hype + BUS_RUN.hype);
      console.info(`[DUNK-PARKOUR] off the bus at (${busLaunch.x0.toFixed(2)}, ${busLaunch.y0.toFixed(2)}, ${player.root.position.z.toFixed(2)})`);
    }
    // THE RUNWAY'S TEACHING LINE ENDS AT THE RUNWAY (caught in the hang frame, 2026-09-16): "DOUBLE-UP — tap A" was
    // still sitting under the dunker in mid-air, offering a move that is no longer available and standing where the
    // flight's own read is about to appear. The runway teaches; the air reads.
    teachHint = ''; ctx.setHud({ hint: '' });
    setPhase('cinematic'); setWin('takeoff');
    { const f = readDisplaySetting().factor; if (f !== tvFactor) console.info(`[DUNK] TV MODE slam window x${f.toFixed(2)}`); tvFactor = f; }
    launchZ = player.root.position.z; airTrick = null; obstacleOver = false; obstacleCleared = false; obstacleMargin = Infinity;
    activeHandOff = null; ikSideK = 0;
    clipTime = 0; qteHit = false; qteWindowOpen = false; qteAccuracy = 0; ebState.inLeftHand = false;
    meterSpan = EASTBAY_TIMING.extend + slamWindowNow() / 2 + 0.16; meter3d?.begin(slamGreen());
    // the broadcast cut is per-attempt: hand the follow camera back or the next runway is shot from the rim
    ctx.camDirector.mode = 'follow';
    rimCamCut = false; verdictCamSet = false; rivalCamCut = false; hangSlowMoLatch = false; contactLatch = false; styleTaps = 0; hangSec = 0; trickLabels = []; obstacleClipped = false;
    slamBufferAt = -1; slamSeen = false; slamCueOn = false; beatCalled = false;   // DUNK-BODY-MID: the slam buffer is per attempt
    settleLatch = false; settleArmed = false; setTrail('soft');   // A+ P5/P6: no gather at takeoff, the runway trail stays soft through it
    airHeld = false; dropToFloor = false; replaying = false; replayAir = false; launchRealMs = performance.now();   // A+ P8
    jamSec = -1; jamContact = false; flushRealSec = 0; netRealSec = 0; hangOn = false; hangHeldSec = 0; lagLive = false; hoopJuice?.hold(false);   // DUNK-HANDS-RIM
    console.info('[JUICE-SOFT] launch');
    ctx.camDirector.resetLook();   // the takeoff → rimCamCut framing never inherits a look orbit
    ctx.setHud({ bannerHigh: true });   // DUNK-CAR-CLIP R2: the flight's banners ride at the top of the frame, clear of the rim (finishAttempt puts them back)
    launchSpeed01 = Math.min(1, runUpPeak / 7);
    // THE LOB RE-AIMS AT THE LAUNCH (2026-09-18): a runway toss is timed on a PREDICTED launch, and the beat's real end, the gather
    // stride and the line all move it (measured: the cartwheel's self-lob arrived 0.12 s after the hand on every run — LOST).
    // Once the flight clock exists the catch point and its beat are exact, so a plain lob still in the air is re-thrown from
    // where it is to arrive on the catch beat (a ball already close to the catch keeps its arc: nothing to fix).
    if (lob.live && !lob.caught && !lob.lost && lob.kind === 'plain' && !lob.glass && ballSim.active) {
      const from = ballSim.pos.clone();
      const to = catchPointNow(LOB_CATCH_CLIP_T);
      const tf = Math.max(LOB_REAIM_MIN_SEC, LOB_CATCH_CLIP_T - 0.03);
      const gap = Vector3.Distance(from, to);
      if (gap > 0.35) {
        const v = lobVelocity(from, to, tf);
        ballSim.launch(from, new Vector3(v.x, v.y, v.z));
        console.info(`[LOB] re-aimed at the launch: ${gap.toFixed(2)} m to the catch in ${tf.toFixed(2)} s`);
      }
    }
    console.info(`[DUNK-LAUNCH] charge ${charge.toFixed(2)} run ${runUpPeak.toFixed(1)} apex ${apexFor().toFixed(2)} from z ${launchZ.toFixed(2)} to line ${gatherLine().toFixed(2)}${doubleUp ? ' DOUBLE-UP' : ''}${lob.live ? ' lob live' : ''}`);
    // The run-up, not the stick at the release instant: during the charge the
    // stick is usually neutral, so the old `hypot(stickX, stickY)` read ~0 and
    // EVERY dunk launched as a walk-up. Peak measured approach speed is the
    // approach. (Max run is ~7 m/s; the mode auto-drifts at 2.)
    launchSpeed01 = Math.min(1, runUpPeak / 7);
    // FREE APPROACH (owner decision 2026-09-03): where you came from and how
    // you left the floor are judged, as in the real contest. The angle is read
    // from where you actually are; one-foot needs a real run.
    // HOW FAR OUT HE LEFT THE FLOOR is the third thing judged now. It was judged nowhere before, so the
    // free-throw-line dunk -- the most iconic moment the event has -- paid exactly what a standing dunk
    // paid. XZ only: the rim is 3.05 m up and counting that would make every dunk read as "from range".
    const takeoffRange = Math.hypot(player.root.position.x - rim.x, player.root.position.z - rim.z);
    const approach = approachBonus(
      approachAngle(player.root.position.x, player.root.position.z, rim.x, rim.z),
      takeoffFor(runUpPeak, gatherHeld),
      takeoffRange,
    );
    const prof = launchProfile(approach.takeoff, vectorLive(), vectorWallRun);   // DUNK PARKOUR: the foot's launch, and the corner prop if it was just used
    console.info(`[DUNK-PARKOUR] ${prof.label} apex x${prof.apexMult.toFixed(2)} +${prof.difficulty.toFixed(1)} diff`);
    launchTag = prof.label; launchCarry = prof.carryMult; launchFoot = approach.takeoff;
    flight.launch(Math.min(1, charge * 0.5 + launchSpeed01 * 0.5), STYLE_TIER[style], approach.difficulty + prof.difficulty);
    armedAir = null; spin.reset(); liveTricks = []; liveSpin = { turns: 0, from: 0, until: 0 };
    if (heldDpad) flight.recognizer.feed({ t: 'dpad', dir: heldDpad, pressed: true });   // a direction held through the takeoff is still held
    if (launchSpeed01 < 0.3 && charge > 0.4) flash(ctx, 'WALK-UP — short air', 900);
    else if (approach.difficulty > 0 || vectorLive()) flash(ctx, `${vectorLive() ? (vectorWallRun ? `OFF THE ${ride.short} RUN · ` : 'OFF THE REBOUND · ') : ''}${approach.label}${approach.angleDeg >= 10 ? ` · ${approach.angleDeg}°` : ''}`, 900);
    dribble?.update(0, 0, false); gatherLatched = false; gatherStride = false; finishRelease = -1;   // DUNK-POSTURE-LEGS: the dribble is parked (the ball back in the palm) before the takeoff takes it
    if (prop === 'oopalien') { /* the ball waits in the saucer (setupProp put it there) */ }
    else if (isOop(prop)) { if (teammate) attachBallToHand(ball, teammate.skeleton, 'RightHand'); else releaseBall(ball); }   // the ball rides the passer's palm until the toss (it used to wait at his idle hand and teleport 0.87 m up on the throw)
    else if (!lob.live) attachBallToHand(ball, player.skeleton, 'RightHand');   // a lob already in the air stays there — the catch is the hand's job
    // the track plays you OUT; it does not play under the dunk. The crowd owns the flight.
    stopWalkOut();
    SoundKit.play('whoosh', { pitch: 0.85 });
    // Soft-OPEN #2 (2026-09-07, measured by fel-full-app-50 + this probe): the launch clip (dunk_mocap 1.3 s) ran out ~3 frames
    // BEFORE the resolve, so for 34–50 ms NO clip played on the athlete — a held pose (pose Δ 0.000) that the finish then
    // crossfaded out of. A launch clip that ends while the flight is still in the air now flows into the held hang; the
    // resolve's finish supersedes it (the token guard kills this chain once superseded). Ends at the flush → nothing here.
    playClip(STYLE_CLIP[style], { speedRatio: 1, onEnd: () => { if (phase === 'cinematic') { console.info('[HANDS] launch → hang'); playAir(SPORT_CLIP.dunkScoreHang, hangRateToResolve(), HANG_FLOW_FADE_SEC); } } });
  }

  /** The dunk dies at the prop: clip it mid-flight and the attempt is blown
   *  on contact — clank, stumble, the chair goes over, judges score what they
   *  saw (the miss path), crowd drops. This is the contest's signature risk. */
  function clipBlown(ctx: ModeContext): void {
    toppling = true; obstacle?.hit();
    SoundKit.play('impact', { pitch: 0.6, volume: 0.6 }); console.info('[JUICE-SFX] impact chair');   // the prop is the miss's one hit (missClank skips)
    SoundKit.play('crowdGroan', { volume: 0.7 });
    ctx.feel?.impact?.(0.6);
    resolveDunk(ctx);   // qteHit is false → the clank path; judging follows (the MISSED line is the resolve's)
  }

  /** Why the attempt died, for the banner: the toss the hand never met, the prop the feet caught, or the iron.
   *  DUNK-BODY-MID: the miss is named after WHAT MISSED. This used to return the attempt's trick list, so a windmill that
   *  had landed perfectly read as "WINDMILL — MISSED" — the one line the eye saw on the flight where the trick fired and
   *  the SLAM press was eaten (99109f7). The trick is what you did; the slam is what you missed. The name still leads,
   *  because the judges scored it and the card names it, but it no longer wears the failure. */
  function missWhy(): string {
    if (obstacleClipped) return `CAUGHT THE ${obstacle?.spec.label ?? 'PROP'}`;   // the prop ended it, whatever the toss was doing
    if (lob.live || lob.lost) return lob.clanked ? `${lob.label} OFF THE IRON` : lob.over ? `${lob.label} OVER THE GLASS` : `LOST THE ${lob.label}`;
    // Every press inside the accepted window (the buffer's edge through the close) is a MAKE, so a miss with a press on
    // the record is a press that came in front of it — say that, not "off the iron": it is the one thing the player can fix.
    const named = namedTricks();
    const why = slamSeen ? 'THREW IT AT THE IRON TOO EARLY' : 'NO SLAM';
    return named ? `${named} · ${why}` : why;
  }
  function resolveDunk(ctx: ModeContext): void {
    if (phase === 'resolve') return;
    setPhase('resolve');
    sinceRelease = 0;
    qteWindowOpen = false;
    // DUNK-CAR-CLIP R2: the flush is filmed from the flight's cut. This used to snapTo the behind-the-back follow on the resolve —
    // one frame before the CONTACT — while the director stayed in 'fixed' and eased straight back to the cut over ~0.5 s: a whip
    // away and back at the money shot, and the frame at the iron was a head-height shot from behind with the grass behind the rim,
    // where the dunker reads as STANDING on the court (the QA eye's "early windmill on court"). A resolve with no cut (a clip
    // before it) is still in the follow and keeps the snap.
    if (!rimCamCut) ctx.camDirector.snapTo(player.root.position, rim);
    rimCamCut = false;
    ctx.setHud({ slamPulse: false, hint: '', slamBeat: '' });   // DUNK-SOFTS-NAMED: no SLAM! / CATCH IT! left standing under the verdict
    releasePos.copyFrom(ball.getAbsolutePosition());
    aerialClip = pickAerialFinish(qteHit, qteAccuracy, ebState.inLeftHand, calledAirTrick()); resolveRealMs = performance.now(); clipTimeAtResolve = clipTime;
    // DUNK-POSTURE-LEGS (L3a): the PERFECT windmill keeps the ball in the hand through the cock-back and the sweep and lets go at
    // the top of it (WINDMILL_RELEASE_T into the finish); every other finish releases on the press as before
    finishRelease = qteHit && !lob.live && aerialClip === SPORT_CLIP.dunkFinishWindmill ? WINDMILL_RELEASE_T : -1; finishT = 0;
    // the finish is paced so it ends with the flush (release + the 0.47 s flush), never a held clip-less pose before CONTACT
    finishRate = finishRelease >= 0 ? Math.min(1, (player.animator.durationOf(aerialClip) ?? 0.85) / (finishRelease + 0.5)) : 1;
    if (lob.live) { setTrail('off'); armSettle(); }   // the lost lob is already bouncing — no clank, the miss is the ball on the floor
    else if (!qteHit) { releaseBall(ball); ballSim.launch(releasePos, clankOffRim(ball, rim)); looseBall = true; missClank(ctx); setTrail('off'); armSettle(); }   // juice soft #2, #5; A+ P4
    else if (finishRelease < 0) { jamSec = 0; jamContact = false; jamPrevLive = false; punchPending = false; }   // DUNK-HANDS-RIM: a make keeps the ball IN THE PALM — the jam carries it to the iron and lets go there (the windmill's sweep starts its jam at the top)
    armedAir = null;
    if (spin.active) console.info(`[DUNK-CUE] contact latch: turn still ${spin.yaw.toFixed(2)} rad at the resolve — settling`);
    if (!qteHit) dropToFloor = true;   // A+ P8 H5: a miss falls from the release height — feet-down is where the stumble lands
    // DUNK-SOFTS-NAMED: the miss reads the frame it happens — the lost lob, the prop, or the iron, under the dunk's name — and
    // the line holds until the panel's number replaces it (the three miss paths used to flash three different banners whose
    // clears raced the verdict, with 1.2 s of nothing on a plain clank)
    if (!qteHit) flash(ctx, `${missWhy()} — MISSED`);
    else { const banner = finishBanner(qteHit, qteAccuracy, ebState.inLeftHand, calledAirTrick()); if (banner) flash(ctx, banner); }
    playAir(aerialClip, finishRate);   // A+ P8 H5: holds its last frame in the air; the land clip is feet-down's, the idle loop is the land's
  }

  // ── A+ P8 athlete hands (PM brief VENICE-DUNK-A-PLUS-P8, 2026-09-07) ─────────────────────────────────────────────
  /** DUNK-BALL-ARMS-RIM: where the reach sends the ball this frame — the centre over the ring once the ball is above the iron
   *  (or already inside the ring), otherwise a point in front of the front rim and over it, so the ball never climbs through it. */
  const _aim = { x: 0, y: 0, z: 0 };
  function rimApproachAim(bw: Vector3 | null): { x: number; y: number; z: number } {
    const c = ballSim.radius + 0.01;
    _aim.x = rim.x; _aim.y = rim.y + ballSim.radius + 0.02; _aim.z = rim.z;
    if (!bw || RIM_AIM_OFF) return _aim;
    const dx = bw.x - rim.x, dz = bw.z - rim.z, r = Math.hypot(dx, dz);
    if (bw.y >= rim.y + 0.02 || r <= RIM_RADIUS - c || r >= RIM_RADIUS + c + 0.25) return _aim;   // over the ring's plane, inside it, or still well short: straight in
    const ux = r > 1e-3 ? dx / r : 0, uz = r > 1e-3 ? dz / r : 1, out = RIM_RADIUS + c + 0.01;
    _aim.x = rim.x + ux * out; _aim.y = rim.y + c * 0.8; _aim.z = rim.z + uz * out;
    return _aim;
  }
  /** H1: on top of the frame's clip pose (after-animations) the ball hand reaches for the rim with the eased weight, so the
   *  wrist LAGS the root into the iron instead of riding the clip rigidly. Pole: outward and slightly back, the dribble's own.
   *  Rotations only (shoulder / elbow) — never a bone translation, never a scale (TwoBoneIK's node-space solve). */
  function handIkApply(): void {
    // DUNK-HANDS-RIM H4: the jam weight EASES from the hang's reach to the jam's over JAM_RAMP_SEC (it stepped 0.6 → 0.95 on the press frame)
    const wMax = phase === 'resolve' && qteHit && (!contactLatch || hangOn) && !obstacleClipped && finishRelease < 0 ? jamWeight(jamSec, HAND_IK_MAX, HAND_IK_MAX_JAM) : HAND_IK_MAX;
    const w = wMax * handIkT * handIkT * (3 - 2 * handIkT);
    if (!player) return;
    postureTick();         // DUNK-POSTURE: this frame's stance (eased between windows) — the spin layer reads its hip-yaw keep
    applySpinLayer();
    applyPostureLayer();   // DUNK-POSTURE: thoracic / clavicles / head, the rim-locked chest aim, the eyes — before the reach

    // DUNK-POSTURE-LEGS (A1): the GATHER — from the last bounce to the takeoff the off hand comes onto the ball (two hands into
    // the plant, a stride out), eased in over 0.15 s and out as the takeoff's own hands take over
    if (gatherK > 0.001 && arms.Left && ball.parent && (phase === 'approach' || phase === 'charge' || phase === 'cinematic') && !REACH_OFF) {
      player.root.computeWorldMatrix(true); ball.computeWorldMatrix(true);
      const bp = ball.getAbsolutePosition();
      _gatherT.set(0.12, 0.02, 0.02).applyRotationQuaternionInPlace(player.root.absoluteRotationQuaternion).addInPlace(bp);   // on the ball's near (left) side: the rig's left is its local +x
      _gatherP.set(0.7, -0.2, -0.5).applyRotationQuaternionInPlace(player.root.absoluteRotationQuaternion);
      const arm = arms.Left; arm.shoulder.computeWorldMatrix(true); arm.elbow.computeWorldMatrix(true); arm.hand.computeWorldMatrix(true);
      reachArm(arm, _gatherT, _gatherP, gatherK * gatherK * (3 - 2 * gatherK) * 0.9);
    }
    if (w > 0.001 && !REACH_OFF) {
      player.root.computeWorldMatrix(true);
      // DUNK-HANDS-RIM H1: the wrist LAGS into the iron — the reach point is a first-order lag (τ WRIST_LAG_TAU, on the flight's
      // own clock through the hang slow-mo) from the clip's hand where the reach came on toward the rim, so the hand trails the
      // body in and decelerates onto the ring instead of riding the weight ramp rigidly
      if (!lagLive) { const seedArm = arms[ikSideK > 0.5 ? 'Left' : 'Right'] ?? arms.Right; if (seedArm) { seedArm.hand.computeWorldMatrix(true); lagTarget.copyFrom(seedArm.hand.getAbsolutePosition()); } else lagTarget.set(rim.x, rim.y + HAND_IK_RIM_UP, rim.z); lagLive = true; }
      { const lagScale = phase === 'cinematic' ? (ikScene?.animationTimeScale ?? 1) : 1; const lagDt = (ikScene?.getEngine().getDeltaTime() ?? 16) / 1000 * (Number.isFinite(lagScale) && lagScale > 0 ? lagScale : 1);
        // the reach point is where the BALL goes: resting on the ring (its centre a radius + 2 cm over the rim's centre line) —
        // DUNK-BALL-ARMS-RIM: and it comes OVER the front of the ring. A ball in the palm under the ring's height and inside the
        // iron's shadow aims first at a point just in front of and above the front rim; the straight line to the centre ran it
        // up through the underside of the iron (measured on a late slam: 4–6 frames inside the metal before the contact)
        const over = rimApproachAim(ball.parent ? ball.getAbsolutePosition() : null);
        lagToward(lagTarget, over, lagDt, WRIST_LAG_TAU, lagTarget); }
      handIkTarget.copyFrom(lagTarget);
      // DUNK-CONTROL-JUICE: the reach crossfades between the arms across a hand-off (ikSideK) — a one-frame arm swap moved
      // both hands 0.66 m and threw the ball 0.9 m with them (measured on the eastbay's under-the-leg pass)
      for (const side of ['Right', 'Left'] as const) {
        const ws = w * (side === 'Left' ? ikSideK : 1 - ikSideK);
        const arm = arms[side]; if (!arm || ws <= 0.001) continue;
        handIkPole.set(side === 'Left' ? -0.7 : 0.7, -0.2, -0.5).applyRotationQuaternionInPlace(player.root.absoluteRotationQuaternion);
        // DUNK-SOFTS-NAMED: the weight lives in the TARGET, not in a rotation slerp — the hand is solved at full weight toward
        // the point `ws` of the way from the clip's hand to the rim, the elbow's twist capped in proportion (shapeReach). The
        // old partial-weight slerp flipped the arm 60° in one frame whenever the mocap wind-up put the hand behind the
        // shoulder (aim / pole deltas near ±180°: hand 3.40 → 2.92 m in 17 ms, POWER only); the pull it gave is kept.
        arm.shoulder.computeWorldMatrix(true); arm.elbow.computeWorldMatrix(true); arm.hand.computeWorldMatrix(true);
        const sh = arm.shoulder.getAbsolutePosition(), el = arm.elbow.getAbsolutePosition(), hd = arm.hand.getAbsolutePosition();
        // DUNK-HANDS-RIM H4: the arm that CARRIES the ball is aimed so the BALL meets the iron — the wrist target is pulled back
        // by this frame's palm offset (ball − hand, world), so the ball's centre goes where the reach point is and the hand
        // rides under it (measured before: the wrist ON target with the ball 0.14 m under the ring on the eastbay's left hand)
        _reachT.copyFrom(handIkTarget);
        if (ball.parent === arm.hand) { ball.computeWorldMatrix(true); _reachT.subtractInPlace(ball.getAbsolutePosition().subtract(hd)); }
        const want = hd.add(_reachT.subtract(hd).scale(ws));
        const shaped = shapeReach(sh, el, hd, want, handIkPole, undefined, REACH_POLE_CAP * ws);
        reachArm(arm, shaped.target, shaped.pole, 1);
      }
    }
    // the ball is placed AFTER the reach with this frame's hand matrices — the palm-to-palm blend never lags the arms
    if (activeHandOff && phase === 'cinematic' && !lob.live) runHandOffPath(ball, player.skeleton, activeHandOff.t, activeHandOff.spec, ebState);
    if (catchPending && ball.parent) {   // where the hand met the ball, in the frame of the hand that is about to be rendered — the ease starts from there, not one frame of hand motion away
      catchPending = false; const hand = ball.parent as TransformNode; hand.computeWorldMatrix(true); hand.getWorldMatrix().invertToRef(_invHand); Vector3.TransformCoordinatesToRef(catchWorld, _invHand, catchFrom); ball.position.copyFrom(catchFrom);
    }
    if (catchBlend < 1 && ball.parent) { catchBlend = Math.min(1, catchBlend + (ikScene?.getEngine().getDeltaTime() ?? 16) / 80); const k = catchBlend * catchBlend * (3 - 2 * catchBlend); Vector3.LerpToRef(catchFrom, palmOffsetOf(ball, (ball.parent as TransformNode).name) as Vector3, k, ball.position); }
  }
  /** DUNK-BIOMECH: the trick turn, written onto the hips AFTER the clips evaluate (before the wrist reach, which aims at
   *  the world rim). A yaw about the parent's up in the clips' own bind convention (bindFrame.keyedQ), so +1 turn here is
   *  the same sense a Hips [0, 360, 0] key would be. A held pose (an aerial clip that ended) is not re-written by any
   *  animation, so the layer remembers what it wrote and starts from the clip's own value again — never compounds. */
  function applySpinLayer(): void {
    const n = hipsNode; if (!n || !hipsBf || !n.rotationQuaternion) return;
    const spinYaw = replaying ? replaySpinYaw : spin.yaw;
    const q = n.rotationQuaternion;
    const held = hipsLayered && Math.abs(q.x - hipsOut.x) < 1e-6 && Math.abs(q.y - hipsOut.y) < 1e-6 && Math.abs(q.z - hipsOut.z) < 1e-6 && Math.abs(q.w - hipsOut.w) < 1e-6;
    if (!held) hipsRaw.copyFrom(q);
    // DUNK-POSTURE: the hip-yaw strip — the clip's OWN hip yaw (the mocap gather swings the hips ±35°, the fakes turn them
    // 30°) is read off the clip's value in frame space and only `hipYawKeep` of it survives; the turn is added on top. A
    // function of the clip's value (never of the last write), so a held pose cannot compound it.
    const keep = POSTURE_OFF ? 1 : ppPose.hipYawKeep;
    ppClipHipYaw = keep < 0.999 && ppFrame ? frameYawOf(n, hipsRaw, hipsBindChain) : 0;
    const yaw = spinYaw + hipYawStrip(ppClipHipYaw, keep);
    if (Math.abs(yaw) < 1e-4) { if (held) q.copyFrom(hipsRaw); hipsLayered = false; return; }
    const D = hipsBf.keyedQ(n, Quaternion.RotationAxis(Vector3.Up(), yaw)).multiply(hipsBindInv);
    D.multiplyToRef(hipsRaw, q); hipsOut.copyFrom(q); hipsLayered = true;
    n.computeWorldMatrix(true);   // an in-place quaternion write leaves the cached world matrix stale — the reach and any probe read the turned hips
  }

  // ── DUNK-POSTURE (2026-09-08): the Posture Poses layer ──────────────────────────────────────────────────────────
  // Frame space = the product of the LOCAL rotations from the topmost node down (TwoBoneIK's chainRotation, bindFrame's
  // convention): the space every degree key is written in, so a yaw here is the same sense as a Hips [0, +deg, 0] key and
  // the spin layer's own yaw. World enters only through the root's error to the rim (mapped by ppSign) and the head's
  // elevation to the iron (y is y in every frame).
  const hipsBindChain = Quaternion.Identity();
  const _gatherT = new Vector3(), _gatherP = new Vector3();
  const _ppQ = Quaternion.Identity(), _ppD = Quaternion.Identity(), _ppV = new Vector3(), _ppRho = Quaternion.Identity();
  /** The frame-space yaw of a node's rotation `local` against its bind chain (the clip's own turn: 0 at bind). */
  function frameYawOf(n: TransformNode, local: Quaternion, bindChain: Quaternion): number {
    const par = n.parent as TransformNode | null; const Rp = par && par !== ppFrame ? chainRotation(par, ppFrame!) : Quaternion.Identity();
    Rp.multiplyToRef(local, _ppQ); _ppQ.multiplyToRef(Quaternion.Inverse(bindChain), _ppD);
    Vector3.Forward().rotateByQuaternionToRef(_ppD, _ppV);
    return Math.atan2(_ppV.x, _ppV.z);
  }
  /** The frame-space forward of a node NOW against its bind chain: x/z = the yaw, y = the elevation. */
  function frameForwardOf(p: PpNode, out: Vector3): Vector3 {
    chainRotation(p.n, ppFrame!).multiplyToRef(Quaternion.Inverse(p.bindChain), _ppD);
    return Vector3.Forward().rotateByQuaternionToRef(_ppD, out);
  }
  /** Rotate a node by `rho` in frame space (q' = Rp⁻¹ ∘ ρ ∘ Rp ∘ q): the node turns about the frame's axis, wherever the
   *  chain above it is — the way the solver writes a world delta back as a local. */
  function rotateInFrame(n: TransformNode, rho: Quaternion): void {
    const par = n.parent as TransformNode | null; const Rp = par && par !== ppFrame ? chainRotation(par, ppFrame!) : Quaternion.Identity();
    const q = n.rotationQuaternion!;
    Quaternion.Inverse(Rp).multiply(rho).multiply(Rp).multiplyToRef(q, _ppQ); q.copyFrom(_ppQ);
  }
  const qEq = (a: Quaternion, b: Quaternion): boolean => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.z - b.z) < 1e-6 && Math.abs(a.w - b.w) < 1e-6;
  /** The clip's value this frame — or, on a held pose (no animation rewrote the node), the value it held before this layer
   *  wrote it. The layer's own last write is never mistaken for a clip's: it cannot compound. */
  function ppBase(p: PpNode): Quaternion { const q = p.n.rotationQuaternion!; if (!(p.layered && qEq(q, p.out))) p.raw.copyFrom(q); return p.raw; }
  function ppCommit(p: PpNode): void { p.out.copyFrom(p.n.rotationQuaternion!); p.layered = true; }
  function ppNodeFor(name: string): PpNode | null {
    const n = boneNode(player.skeleton, name); if (!n || !hipsBf) return null;
    if (!n.rotationQuaternion) n.rotationQuaternion = Quaternion.FromEulerVector(n.rotation);
    const b = hipsBf.bind.get(n); const Rp = hipsBf.parentRot.get(n) ?? Quaternion.Identity();
    return { n, raw: n.rotationQuaternion.clone(), out: n.rotationQuaternion.clone(), layered: false, bindChain: b ? Rp.multiply(b.q) : Quaternion.Identity() };
  }
  function setupPosture(): void {
    ppFrame = hipsNode ? frameAbove(hipsNode) : null;
    ppNodes.spine = ppNodeFor('Spine'); ppNodes.spine1 = ppNodeFor('Spine1'); ppNodes.spine2 = ppNodeFor('Spine2'); ppNodes.neck = ppNodeFor('Neck'); ppNodes.head = ppNodeFor('Head');
    ppNodes.Left = ppNodeFor('LeftShoulder'); ppNodes.Right = ppNodeFor('RightShoulder');
    ppNodes.offArm = ppNodeFor('LeftArm');   // THE 360's TUCK rides the off arm only — the right carries the ball
    for (const k of ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'] as const) llNodes[k] = ppNodeFor(k);   // DUNK-POSTURE-LEGS: the feet and the toes
    llPose = cloneLegPose(LEGS.stance);
    ppPose = clonePose(POSTURE.stance); ppWindow = 'stance'; ppTrick = null; ppAim = 0; ppHeadYaw = 0; ppHeadPitch = 0;
    if (hipsNode && hipsBf) { const b = hipsBf.bind.get(hipsNode); const Rp = hipsBf.parentRot.get(hipsNode) ?? Quaternion.Identity(); hipsBindChain.copyFrom(b ? Rp.multiply(b.q) : Quaternion.Identity()); }
    // the frame's yaw sense: a +yaw in frame space is a +yaw in world unless the import root reflects (Babylon's glTF
    // (1, 1, −1) root) — read off the frame's own world matrix rather than assumed
    ppSign = ppFrame && ppFrame.getWorldMatrix().determinant() < 0 ? -1 : 1;
    const missing = (['spine', 'spine1', 'spine2', 'neck', 'head', 'Left', 'Right'] as const).filter((k) => !ppNodes[k]);
    if (missing.length) console.warn(`[FEL-DUNK] posture layer: no ${missing.join(' / ')} on this rig — that part of the stance is off`);
    else console.info(`[DUNK-PP] posture layer on (frame ${ppFrame?.name ?? '?'}, yaw sense ${ppSign})`);
  }
  /** This frame's stance: the window on the flight's clock (the replay's own clock when it re-flies), the trick's chest
   *  over it while its body plays, eased between windows so a change is a movement, never a pop. */
  function postureTick(): void {
    const dt = clamp((ikScene?.getEngine().getDeltaTime() ?? 16) / 1000, 0, 0.05);
    const rep = replaying && replayAir;
    const t = rep ? replayAirSec * replayRateNow : clipTime;
    let trick: PostureInput['trick'] = null;
    if (rep) { const lt = liveTricks[replayTrickIdx - 1]; const id = lt ? DUNK_TRICK_ID_BY_CLIP[lt.clip] : undefined; if (lt && id) trick = { id, t0: lt.t0, sec: (player.animator.durationOf(lt.clip) ?? 0.8) / lt.speed }; }
    else if (airTrick) trick = { id: airTrick.trick.id, t0: airTrick.t0, sec: (player.animator.durationOf(airTrick.trick.clip) ?? 0.8) / 1.05 };
    const inp: PostureInput = {
      phase: rep ? (replayAerial ? 'resolve' : 'cinematic') : phase === 'approach' || phase === 'charge' || phase === 'cinematic' || phase === 'resolve' ? phase : 'other',
      clipTime: t, made: rep ? true : phase === 'resolve' ? qteHit : null, clipped: obstacleClipped && !rep,
      landed: win === 'land', celebrate: landingClip === SPORT_CLIP.dunkCelebrateBig, trick,
    };
    const { window, pose, trick: trickId } = posturePose(inp);
    if (window !== ppWindow || trickId !== ppTrick) { ppWindow = window; ppTrick = trickId; console.info(`[DUNK-PP] ${window}${trickId ? ' · ' + trickId : ''}`); }
    // Modulated BEFORE the ease, so easePose smooths the MODULATED target rather than chasing a raw one. The
    // allowlist means only 'stance' (the runway) is touched; every flight beat is returned untouched.
    const speed01 = Math.min(1, Math.hypot(runwayVel.x, runwayVel.z) / Math.max(0.1, HOLD_RUN_MAX));
    const dyn = dynamicPose(pose, runMotion.signals(speed01, 0, window !== 'stance'), window);
    ppPose = ppOverride ? clonePose(ppOverride) : easePose(ppPose, dyn, lowPassK(dt, POSTURE_TAU));
    // the feet flatten on the way DOWN (a miss's fall, a make's drop after the replay), not on the feet-down frame
    llPose = easeLegPose(llPose, legPose(dropToFloor && !rep && window !== 'land' && window !== 'celebrate' ? 'brace' : window, trickId), lowPassK(dt, POSTURE_TAU));
  }
  /** Commit to the runway: the hold drives it toward the rim (the stick steers), the jump loads while you run, and the
   *  launch fires at the gather line — or on release, from wherever you are. Called by the press AND by a hold that was
   *  already down when the runway opened. */
  function beginRun(ctx: ModeContext): void {
    if (phase !== 'approach') return;
    setPhase('charge');
    obstacle?.start();   // a rolling prop comes when you commit to the run (owner, 2026-09-16)
    holdRunSpeed = Math.max(2, runUpPeak);
    playClip(runLoop(), { loop: true });
    ctx.setHud({ hint: 'HOLD — running to the rim · GATHER (L2) to go up off two feet · steer with the stick · release early to jump from here' });
  }

  function applyPostureLayer(): void {
    if (!ppFrame || !hipsBf || !hipsNode) return;
    const dt = clamp((ikScene?.getEngine().getDeltaTime() ?? 16) / 1000, 0, 0.05);
    const P = ppPose, w = POSTURE_OFF ? 0 : clamp(P.weight, 0, 1);
    const bf = hipsBf;
    // 1) the stance: thoracic, clavicles, head — absolute from bind, the clip's (or the held) value under it by 1 − w
    const stanceW = (p: PpNode | null, deg: [number, number, number], ww: number) => { if (!p) return; const base = ppBase(p); Quaternion.SlerpToRef(base, bf.keyed(p.n, deg), ww, _ppQ); p.n.rotationQuaternion!.copyFrom(_ppQ); ppCommit(p); };
    const stance = (p: PpNode | null, deg: [number, number, number]) => stanceW(p, deg, w);
    // 0) the lumbar lean, ADDED to the clip's Spine (a pitch about the bone's own right axis in frame space, +X = forward)
    if (ppNodes.spine && Math.abs(P.lean) * w > 0.05) {
      const sp = ppNodes.spine; const base = ppBase(sp); sp.n.rotationQuaternion!.copyFrom(base);
      chainRotation(sp.n, ppFrame).multiplyToRef(Quaternion.Inverse(sp.bindChain), _ppD);
      const axis = Vector3.Right().rotateByQuaternionToRef(_ppD, new Vector3()).normalize();
      Quaternion.RotationAxisToRef(axis, P.lean * w * Math.PI / 180, _ppRho); rotateInFrame(sp.n, _ppRho); ppCommit(sp);
    } else if (ppNodes.spine) { const sp = ppNodes.spine; const base = ppBase(sp); sp.n.rotationQuaternion!.copyFrom(base); ppCommit(sp); }
    stance(ppNodes.spine1, P.spine1); stance(ppNodes.spine2, P.spine2);
    for (const side of ['Left', 'Right'] as const) stance(ppNodes[side], [0, CLAVICLE_SIGN[side].forward * P.forward, CLAVICLE_SIGN[side].shrug * P.shrug]);
    stance(ppNodes.neck, P.neck); stance(ppNodes.head, P.head);
    // 1b) THE BODY AROUND THE 360 (DunkSpinBody): the off arm tucks to drive the turn and opens at the catch to stop it,
    //     the axis leans into the rotation, and the head lets the rim go and finds it again. Only while a turn is live.
    const spinRec = replaying ? null : spin.record;
    const sb = spinRec ? spinBody(spinProgress(spinRec, clipTime), spinRec.turns) : { tuck: 0, tilt: 0, spot: 1 };
    if (sb.tuck > 0.02 && ppNodes.offArm) {
      // the clip's own arm is still under it: this pulls TOWARD a tucked elbow by the tuck's weight, never replaces it
      stanceW(ppNodes.offArm, SPIN_TUCK_DEG, clamp(sb.tuck * SPIN_TUCK_WEIGHT * w, 0, 1));
    }
    if (Math.abs(sb.tilt) > 0.05) {
      for (const [pnode, k] of [[ppNodes.spine1, 0.45], [ppNodes.spine2, 0.55]] as [PpNode | null, number][]) {
        if (!pnode) continue;
        chainRotation(pnode.n, ppFrame).multiplyToRef(Quaternion.Inverse(pnode.bindChain), _ppD);
        const axis = Vector3.Forward().rotateByQuaternionToRef(_ppD, new Vector3()).normalize();
        Quaternion.RotationAxisToRef(axis, sb.tilt * k * w * Math.PI / 180, _ppRho); rotateInFrame(pnode.n, _ppRho); ppCommit(pnode);
      }
    }
    // 2) the rim-locked chest aim: the chest's frame-space yaw vs where the rim is (the turn subtracted), split over the two
    //    thoracic bones, capped at a hip–shoulder separation, eased so the aim never jitters against the clip
    const rootYaw = player.root.rotationQuaternion ? player.root.rotationQuaternion.toEulerAngles().y : player.root.rotation.y;
    const rootErr = wrapRad(Math.atan2(rim.x - player.root.position.x, rim.z - player.root.position.z) - rootYaw);
    const spinYaw = replaying ? replaySpinYaw : spin.yaw;
    const kAim = lowPassK(dt, AIM_TAU);
    if (ppNodes.spine2) {
      frameForwardOf(ppNodes.spine2, _ppV); ppChestYaw = Math.atan2(_ppV.x, _ppV.z);
      const want = chestAimCorrection(ppChestYaw, spinYaw, rootErr, ppSign) * P.chestAim * w;
      ppAim += (want - ppAim) * kAim;
      if (Math.abs(ppAim) > 1e-4) {
        const parts: [PpNode | null, number][] = [[ppNodes.spine1, AIM_SPLIT[0]], [ppNodes.spine2, AIM_SPLIT[1]]];
        for (const [p, k] of parts) { if (!p) continue; Quaternion.RotationAxisToRef(Vector3.Up(), ppAim * k, _ppRho); rotateInFrame(p.n, _ppRho); ppCommit(p); }
      }
    }
    // 3) the eyes: the neck and the head turn and tilt toward the iron on top of the chest (a dunker watches the rim, not the
    //    floor) — measured on the head, split over the two bones
    if (ppNodes.head) {
      const hp = ppNodes.head;
      frameForwardOf(hp, _ppV);
      const headYaw = Math.atan2(_ppV.x, _ppV.z), headEl = Math.asin(clamp(_ppV.y, -1, 1));
      hp.n.computeWorldMatrix(true); const hw = hp.n.getAbsolutePosition();
      const el = Math.atan2(rim.y - hw.y, Math.max(0.3, Math.hypot(rim.x - hw.x, rim.z - hw.z)));
      // the spot: through a turn the head holds the rim, loses it as the shoulders pass, and snaps back on
      const eyeW = P.eyes * w * sb.spot;
      const wantYaw = clamp(wrapRad(spinYaw + ppSign * rootErr - headYaw), -HEAD_YAW_CAP, HEAD_YAW_CAP) * eyeW;
      const wantPitch = clamp(el - headEl, -HEAD_PITCH_CAP, HEAD_PITCH_CAP) * eyeW;
      ppHeadYaw += (wantYaw - ppHeadYaw) * kAim; ppHeadPitch += (wantPitch - ppHeadPitch) * kAim;
      const parts: [PpNode | null, number][] = [[ppNodes.neck, EYES_SPLIT[0]], [hp, EYES_SPLIT[1]]];
      for (const [p, k] of parts) {
        if (!p) continue;
        if (Math.abs(ppHeadYaw) > 1e-4) { Quaternion.RotationAxisToRef(Vector3.Up(), ppHeadYaw * k, _ppRho); rotateInFrame(p.n, _ppRho); }
        if (Math.abs(ppHeadPitch) > 1e-4) {
          // pitch about the bone's own right axis in frame space (+X = forward / down in every clip key, so up is −pitch)
          chainRotation(p.n, ppFrame).multiplyToRef(Quaternion.Inverse(p.bindChain), _ppD);
          const axis = Vector3.Right().rotateByQuaternionToRef(_ppD, new Vector3()).normalize();
          Quaternion.RotationAxisToRef(axis, -ppHeadPitch * k, _ppRho); rotateInFrame(p.n, _ppRho);
        }
        ppCommit(p);
      }
    }
    // 3b) LL — the feet and the toes (DUNK-POSTURE-LEGS): no pose clip keys them, so they held the run loop's last frame through
    //     the flight and the land stood on the toes; an absolute pose per window (0 weight on the runway: the loops own their feet)
    //     The foot's target is a WORLD elevation (0 = the sole flat on the floor whatever the shin does, − = pointed): measured
    //     on the foot's own forward in frame space (y is y in every frame), corrected about its right axis, capped, eased.
    { const L = llPose, wl = POSTURE_OFF ? 0 : clamp(L.weight, 0, 1);
      for (const side of ['Left', 'Right'] as const) {
        const pf = llNodes[`${side}Foot`];
        if (pf) {
          const base = ppBase(pf); pf.n.rotationQuaternion!.copyFrom(base);   // the clip's (or the held) ankle, this frame
          let want = 0;
          if (wl > 0.001) {
            frameForwardOf(pf, _ppV); const el = Math.asin(clamp(_ppV.y, -1, 1));
            want = clamp(L.footPitch * Math.PI / 180 - el, -FOOT_PITCH_CAP * Math.PI / 180, FOOT_PITCH_CAP * Math.PI / 180) * wl;
          }
          llPitch[side] += (want - llPitch[side]) * kAim;
          if (Math.abs(llPitch[side]) > 1e-4) {
            chainRotation(pf.n, ppFrame).multiplyToRef(Quaternion.Inverse(pf.bindChain), _ppD);
            const axis = Vector3.Right().rotateByQuaternionToRef(_ppD, new Vector3()).normalize();
            Quaternion.RotationAxisToRef(axis, -llPitch[side], _ppRho); rotateInFrame(pf.n, _ppRho);   // +X tips the toes down: up is −pitch
          }
          ppCommit(pf);
        }
        if (wl > 0.001) stanceW(llNodes[`${side}ToeBase`], [L.toeCurl, 0, 0], wl);
      }
    }
    // 4) fresh world matrices top-down from the hips (a forced compute reads the parent's CACHED matrix): the reach solves
    //    against this frame's shoulders, the ball rides this frame's hand
    const walk = (n: TransformNode) => { n.computeWorldMatrix(true); for (const c of n.getChildTransformNodes(true)) walk(c); };
    walk(hipsNode);
  }
  /** Dev probes (`__FEL_DEV__.dunkPosture`): the live window / stance / corrections, and an override to force a stance. */
  const postureDevHandle = {
    get: () => ({ rim: { x: rim.x, y: rim.y, z: rim.z }, ballRadius: ballSim?.radius ?? 0.12, replayRider: replay?.riderName ?? '', replayRiderLocal: replay ? { x: replay.riderLocal.x, y: replay.riderLocal.y, z: replay.riderLocal.z } : null, handOff: !!activeHandOff, window: ppWindow, trick: ppTrick, pose: ppPose, legs: llPose, phase, clipTime, replaying, lob: { ...lob }, prop, glass: { ...glass }, dribble: dribble ? { active: dribble.active, phase: dribble.phase } : null, gather: gatherLatched, gatherK, finishRelease, jamSec, jamContact, hangOn, hangSec, handIkT, aimDeg: ppAim * 180 / Math.PI, chestYawDeg: ppChestYaw * 180 / Math.PI, clipHipYawDeg: ppClipHipYaw * 180 / Math.PI, headYawDeg: ppHeadYaw * 180 / Math.PI, headPitchDeg: ppHeadPitch * 180 / Math.PI, sign: ppSign, off: POSTURE_OFF,
      obstacle: obstacle ? { label: obstacle.spec.label, clearance: obstacle.spec.clearance, nearZ: obstacle.nearZ, farZ: obstacle.farZ, peak: obstacle.peak, profile: obstacle.profile } : null, obstacleOver, obstacleCleared, obstacleClipped, obstacleMargin: Number.isFinite(obstacleMargin) ? obstacleMargin : null, rimCamCut }),
    set override(p: PosturePose | null) { ppOverride = p; },
    get override(): PosturePose | null { return ppOverride; },
  };
  /** H5: every player clip goes through here. Babylon raises a group's end observable on stop() as well, so a chained onEnd
   *  used to fire the moment its clip was superseded — measured: the land crouch was cut to idle 150 ms in by the aerial's
   *  own chain. A superseded clip's chain is dead; only a clip that ends on its own runs it (and, with no chain, the idle
   *  loop — neverBindPose's contract, gated the same way). */
  /** HOOPS-DEPTH S8: the runway's loop — the dribbling run when the body owns it (a body built outside the dunk scope keeps `run`). */
  function runLoop(): string {
    const owned = player.animator.clipNames;
    return owned.has(RUNWAY_LOOP) || owned.has('bball_mc_dribble_run') ? RUNWAY_LOOP : SPORT_CLIP.moveLoop;
  }
  function playClip(name: string, opts: PlayOpts = {}): AnimationGroup | null {
    // DUNK-HANDS-RIM H5: the idle / rest loop is refused while the body is in the air on a flight — the dunk clip (or its held
    // last frame) owns the body through CONTACT and the fall; feet-down is the only way to the land clip and the idle
    if (opts.loop && name === SPORT_CLIP.idle && (phase === 'cinematic' || phase === 'resolve') && player.root.position.y > 0.05) { console.warn(`[HANDS] idle refused in the air (${phase}, y ${player.root.position.y.toFixed(2)})`); return null; }
    const token = ++clipToken;
    if (opts.loop) return player.animator.play(name, opts);
    return player.animator.play(name, { ...opts, onEnd: () => {
      if (token !== clipToken) return;
      if (opts.onEnd) opts.onEnd(); else player.animator.play(SPORT_CLIP.idle, { loop: true });
    } });
  }
  /** H5: an aerial clip — the finish at resolve, a trick in the hang. Ends on its own in the air → holds its last frame
   *  (nothing else writes the pose; there is no bind pose to fall to); feet-down plays the land clip. */
  /** DUNK-BALL-ARMS-RIM: the flow INTO the hang from a clip that ran out (the launch, a trick) is a short fade. A clip ended on its
   *  own holds its last frame, so the hang's fade reads as a blend from that held pose — but a finish that supersedes the hang
   *  mid-fade restarts the animator's ramp at the hang's FULL weight, and the half-faded pose snapped onto the hang in one frame
   *  (measured: both hands 0.41–0.61 m in a frame on the resolve, the miss's clank and the self-lob's tomahawk, noreach and
   *  noposture alike). A fade that is over before a resolve can land leaves nothing to snap. */
  const HANG_FLOW_FADE_SEC = 0.05;
  function playAir(name: string, speedRatio = 1, fadeSec?: number): void {
    airHeld = true;
    playClip(name, { speedRatio, ...(fadeSec != null ? { fadeSec } : {}), onEnd: () => {
      // DUNK-CONTROL-JUICE: a trick that runs out while the flight is still rising flows into the hang (measured: the scorpion
      // left 19 frames with no clip on the body before the finish); the hang itself, or any aerial after the resolve, holds
      if (phase === 'cinematic' && name !== SPORT_CLIP.dunkScoreHang) { console.info(`[HANDS] ${name} → hang`); playAir(SPORT_CLIP.dunkScoreHang, hangRateToResolve(), HANG_FLOW_FADE_SEC); return; }
      // DUNK-BIOMECH: the replay's re-fired trick flows into the hang too (it held a frozen last frame for ~0.5 s of replay — 46 clip-less frames measured)
      if (replaying && replayAir && !replayAerial && name !== SPORT_CLIP.dunkScoreHang) { console.info(`[HANDS] replay ${name} → hang`); playAir(SPORT_CLIP.dunkScoreHang, replayRateNow); return; }
      if (replaying || player.root.position.y > 0.05) console.info(`[HANDS] hold ${name}`); else landNow();
    } });
  }
  /** The hang paced to last until the resolve (the rival's hop trick): a 0.35 s takeoff flowed into a 0.8 s hang that ran out
   *  0.24 s before the finish — 12 frames with no clip on the body (measured on the duel's plain launch). */
  function hangRateToResolve(): number {
    const left = Math.max(0.3, EASTBAY_TIMING.extend + slamWindowBase() / 2 + 0.05 - clipTime);
    const hang = player.animator.durationOf(SPORT_CLIP.dunkScoreHang) ?? 0.8;
    return Math.max(0.35, Math.min(1, hang / left));
  }
  /** H5: feet-down — the land clip, then the idle loop. Once per attempt. */
  function landNow(): void {
    if (!airHeld) return;
    airHeld = false; setWin('land');
    console.info(`[HANDS] land ${landingClip}`);
    playClip(landingClip, { onEnd: () => { playClip(SPORT_CLIP.idle, { loop: true }); setWin('run'); } });
  }

  // ── DUNK-CONTROL-JUICE (2026-09-08): runway tricks, the lob, the catch ──────────────────────────────────────────
  function resetLob(): void { lob.live = false; lob.thrown = false; lob.caught = false; lob.lost = false; lob.label = ''; lob.kind = 'plain'; lob.glass = false; lob.over = false; lob.bounces = 0; lob.wantBounces = 0; lob.env = ''; lob.clanked = false; lob.t = 0; lob.runCueAt = -1; lob.runCued = false; }
  function resetRunway(): void { teachHint = ''; pendingBeat = null; runwayBeat = null; runwayT = 0; runwayReleased = false; runwayLabels = []; runwayDifficulty = 0; doubleUp = false; launchQueued = false; airTrick = null; runwayToken++; }
  /** A runway beat owns the body until it ends (the per-frame run / idle loops stand aside); the run keeps going under it. */
  function startRunwayBeat(ctx: ModeContext, rt: RunwayTrick): void {
    // DUNK-POSTURE-LEGS: a beat's clip takes the ball from the PALM — mid-bounce it waits for the ball to come back up (a snap from
    // the floor to the hand was a 0.53 m ball jump on the self-lob's auto-toss)
    if (dribble?.active && !atPalm(dribble.phase, 0.12)) { pendingBeat = rt; return; }
    pendingBeat = null;
    dribble?.update(0, 0, false); gatherLatched = false; gatherStride = false;
    runwayBeat = rt; runwayT = 0; runwayReleased = false;
    const token = ++runwayToken;
    setWin('gather');
    console.info(`[DUNK-TRICK] runway ${rt.id}`);
    playClip(rt.clip, { fadeSec: 0.08, onEnd: () => { if (token === runwayToken) endRunwayBeat(); } });
    if (rt.id === 'doubleup') doubleUp = true;
    flash(ctx, rt.id === 'doubleup' ? 'DOUBLE-UP' : rt.label, 650);
    runwayLabels.push(rt.label); runwayIds.push(rt.id); runwayDifficulty += rt.difficulty;
    SoundKit.play('whoosh', { pitch: rt.id === 'cartwheel' ? 0.8 : 1.2, volume: 0.4 });
    ctx.camDirector.pulse(0.3, 0.35);
    // the kick-up drops the ball to the foot: it leaves the hand at once, the kick launches it from wherever it fell
    if (rt.id === 'kickup') { releasePos.copyFrom(ball.getAbsolutePosition()); releaseBall(ball); ballSim.launch(releasePos, new Vector3(0, -0.4, -holdRunSpeed * 0.4)); lob.live = true; lob.thrown = true; lob.label = rt.label; }
  }
  function runwayTick(ctx: ModeContext, dt: number): void {
    if (!runwayBeat) return;
    runwayT += dt;
    const rt = runwayBeat;
    if (rt.releaseAt != null && !runwayReleased && runwayT >= rt.releaseAt) {
      runwayReleased = true;
      const from = ball.getAbsolutePosition().clone();
      if (rt.id === 'kickup') { ballSim.stop(); }   // the drop ends at the foot — the kick takes over from where the ball is
      // the toss arrives at the catch beat: the run to the takeoff line (slower under the rest of this beat, and the beat must
      // end before the takeoff), then the flight's own catch beat — real seconds on the runway, clip seconds in the air
      // the beat ends when its CLIP ends: the back handspring's clip is shorter than the trick's nominal sec (0.63 vs 0.8 measured), so
      // a toss timed on the nominal beat arrived 0.12 s after the hand — the cartwheel's self-lob LOST on every run
      const beatLeft = (player.animator.durationOf(rt.clip) ?? rt.sec) - runwayT;
      // DUNK-SOFTS-NAMED: the run to the line on the HOLD-RUN RAMP (2 → 7 m/s at 6 m/s²) — the toss was timed at the speed of the
      // throw frame as if it held, so a RUN pressed from standing (the pad's way: no stick pre-run, speed 3.4 at the throw)
      // reached the line 0.6 s before the ball did — the kick-up was caught at 0.81, the self-lob at 0.91, the cartwheel LOST
      const dist = Math.max(0, player.root.position.z - gatherLine());
      // THE GATHER STRIDE (2026-09-18): the beat OWNS the body until it ends (no gather under it), so the run under the beat is the ramp
      // at the beat's runScale, and only the remainder is run with the gather — timing the whole distance on the gather threw the
      // kick-up 0.37 s long and the cartwheel's self-lob 5 m high (both LOST, measured)
      const vEnd = Math.min(HOLD_RUN_MAX, holdRunSpeed + HOLD_RUN_RAMP * beatLeft);
      const dBeat = rt.runScale * (holdRunSpeed * beatLeft + 0.5 * (vEnd - holdRunSpeed) * beatLeft);
      const runTime = phase === 'charge'
        ? beatLeft + runTimeToLineGather(Math.max(0, dist - dBeat), vEnd, HOLD_RUN_MAX, HOLD_RUN_RAMP, gatherStrideSpec())
        : lobFlightTime(dist, 6.5, false, 0) + 0.15 + beatLeft * (1 - rt.runScale);   // a standing thrower runs in at the stick's 6 m/s, then the hold ramps past it
      const tLaunch = Math.max(runTime, beatLeft);
      chargeAtLaunch = Math.max(charge, Math.min(1, (phaseSec + tLaunch) / 1.1));   // the keyboard's hold ramps over 1.1 s; a pad's depth is what it is
      if (rt.id === 'offglass') throwGlassLob(ctx, from, tLaunch + GLASS_CATCH_CLIP_T, phase !== 'charge', dist);
      else if (rt.id === 'bounce') throwBounceLob(ctx, from, tLaunch + LOB_CATCH_CLIP_T, phase !== 'charge', dist);
      else throwLob(ctx, from, rt.id === 'cartwheel' ? 'SELF-LOB' : rt.label, tLaunch + LOB_CATCH_CLIP_T);
    }
    // DUNK-SOFTS-NAMED: a queued takeoff leaves while the beat is still playing, so the launch clip crossfades out of its last
    // pose — launched from the beat's END (the hop's crouch, the cartwheel's upright) that pose was already gone and the takeoff
    // faded in from nothing (measured: a 0.49 m hand pop four frames in on the double-up, 0.38 m on the cartwheel)
    if (launchQueued && runwayT >= rt.sec - BEAT_TAKEOFF_LEAD && runwayBeat === rt) { endRunwayBeat(); return; }
    if (runwayT >= rt.sec + 0.1 && runwayBeat === rt) endRunwayBeat();   // the clip's own end normally gets here first
  }
  function endRunwayBeat(forLaunch = false): void {
    if (!runwayBeat) return;
    const was = runwayBeat; runwayBeat = null; runwayToken++;
    console.info(`[DUNK-TRICK] runway ${was.id} done`);
    if (forLaunch) return;   // the takeoff owns the body from here (an early release used to start the run loop under the launch clip: a 0.39 m hand pop on the first frame)
    if (phase === 'charge' || phase === 'approach') {
      // a beat that ends a stride from the line takes off out of its last pose — two frames of run loop and a launch over a
      // fade still in flight popped the hand 0.36 m on the keyboard's cartwheel (its beat ends ~0.9 m out at a 6 m/s start)
      if (launchQueued || (phase === 'charge' && player.root.position.z <= gatherLine() + LAUNCH_OUT_OF_BEAT_M)) launchDunk(ctx0!);
      else { playClip(phase === 'charge' ? runLoop() : SPORT_CLIP.idle, { loop: true }); setWin('run'); }
    }
  }
  let ctx0: ModeContext | null = null;   // the mode context for the beat-end path (the harness hands it to every hook)
  /** The toss: a real arc from `from` to the catch point, timed to arrive with the ball hand. */
  function throwLob(ctx: ModeContext, from: Vector3, label: string, tf: number): void {
    const line = phase === 'cinematic' ? launchZ : gatherLine();
    const carry = carryU(LOB_CATCH_CLIP_T, EASTBAY_TIMING.extend);
    const kk = arcK(LOB_CATCH_CLIP_T, EASTBAY_TIMING.duration);
    const off = CATCH_HAND_OFFSET[style];
    const to = new Vector3(rim.x + off.x, 4 * kk * (1 - kk) * (phase === 'cinematic' ? apexFor() : apexPredicted()) + off.y, line + (rim.z + FLUSH_Z_AHEAD - line) * carry + off.z);
    const v = lobVelocity(from, to, tf);
    if (ball.parent) { releasePos.copyFrom(ball.getAbsolutePosition()); releaseBall(ball); ball.position.copyFrom(releasePos); }
    ballSim.launch(from, new Vector3(v.x, v.y, v.z));
    lob.live = true; lob.thrown = true; lob.caught = false; lob.lost = false; lob.label = label; catchBlend = 1; catchPending = false;
    setTrail('soft');
    console.info(`[LOB] ${label} from (${from.x.toFixed(2)},${from.y.toFixed(2)},${from.z.toFixed(2)}) to (${to.x.toFixed(2)},${to.y.toFixed(2)},${to.z.toFixed(2)}) in ${tf.toFixed(2)} s`);
  }
  /** ORBIT (owner, 2026-09-18: "lob from the aliens"): the saucer drops the oop out of its belly port onto the catch beat. */
  function throwAlienLob(ctx: ModeContext, tf: number): void {
    const from = new Vector3(skyRoot ? skyRoot.position.x : 0, SKY.underY - 0.18, skyRoot ? skyRoot.position.z : gatherLine() - SKY.zAhead);
    throwLob(ctx, from, 'ALIEN OOP', tf);
    skyKick = 1; runwayDifficulty += 0.5;
    SoundKit.play('whoosh', { pitch: 1.5, volume: 0.5 }); ctx.juice.flash('#7cf7a0', 60); ctx.camDirector.pulse(0.4, 0.35);
    EffectsKit.burst(ctx.scene, from, 'sparks');
    flash(ctx, 'THE ALIENS DROP IT — GO GET IT', 800);
  }
  /** DUNK-GLASS-BOUNCE: the flight's catch point for a lob thrown now (throwLob's aim, shared by the glass and bounce throws). */
  function catchPointNow(catchT = LOB_CATCH_CLIP_T): Vector3 {
    const line = phase === 'cinematic' ? launchZ : gatherLine();
    const carry = carryU(catchT, EASTBAY_TIMING.extend);
    const kk = arcK(catchT, EASTBAY_TIMING.duration);
    const off = CATCH_HAND_OFFSET[style];
    return new Vector3(rim.x + off.x, 4 * kk * (1 - kk) * (phase === 'cinematic' ? apexFor() : apexPredicted()) + off.y, line + (rim.z + FLUSH_Z_AHEAD - line) * carry + off.z);
  }
  /** The backboard's front face, read off the venue's board mesh (the Nexus hoop's `board`, VenueKit's `backboard`). */
  function findGlass(scene: Scene): void {
    const boards = scene.meshes.filter((m) => /^(board|backboard)(\.|$)/.test(m.name) && m.getTotalVertices() > 0);
    let best: AbstractMesh | null = null, bestD = Infinity;
    for (const m of boards) { m.computeWorldMatrix(true); const c = m.getBoundingInfo().boundingBox.centerWorld; const d = Math.hypot(c.x - rim.x, c.z - rim.z); if (d < 3 && d < bestD) { best = m; bestD = d; } }
    if (!best) { console.warn(`[FEL-DUNK] no backboard mesh near the rim — the off-glass throw uses the regulation face at z ${glass.z.toFixed(2)}`); return; }
    best.refreshBoundingInfo({}); best.computeWorldMatrix(true);
    const b = best.getBoundingInfo().boundingBox;
    glass.z = b.maximumWorld.z; glass.xMin = b.minimumWorld.x; glass.xMax = b.maximumWorld.x; glass.yMin = b.minimumWorld.y; glass.yMax = b.maximumWorld.y; glass.found = true;
    console.info(`[LOB] glass = ${best.name} face z ${glass.z.toFixed(2)} x ${glass.xMin.toFixed(2)}..${glass.xMax.toFixed(2)} y ${glass.yMin.toFixed(2)}..${glass.yMax.toFixed(2)}`);
  }
  const v3 = (v: Vector3): V3 => ({ x: v.x, y: v.y, z: v.z });
  /** Can a bounce lob thrown NOW (on the run) still bounce once and reach the hand at the catch beat? */
  function bounceFits(): boolean {
    const dist = Math.max(0, player.root.position.z - gatherLine());
    const tf = runTimeToLineGather(dist, holdRunSpeed, HOLD_RUN_MAX, HOLD_RUN_RAMP, gatherStrideSpec()) + LOB_CATCH_CLIP_T;
    const from = ball.getAbsolutePosition(); from.y = Math.max(from.y, 0.7); from.z -= 0.3 * holdRunSpeed * 0.85;
    return bounceLobVelocity(v3(from), v3(catchPointNow()), tf, 1) != null;
  }
  /** The first point along the throw's line (from → the catch) where the prop's sampled top reads as the prop (≥ half its
   *  peak and ≥ 0.6 m), a step in from the edge; null when the line never crosses it. */
  function roofPointAlong(f: V3, c: V3): { x: number; z: number; h: number } | null {
    if (!obstacle) return null;
    const dz = c.z - f.z; if (Math.abs(dz) < 1e-6) return null;
    for (let z = obstacle.nearZ; z >= obstacle.farZ; z -= 0.05) {
      const k = (z - f.z) / dz; if (k <= 0 || k >= 1) continue;
      const x = f.x + (c.x - f.x) * k; const h = heightAt(obstacle.profile, x, z);
      // the car's flank / hood (≥ half its roof, ≥ 0.6 m) is the car too — the roof proper sits past the catch point on the car line
      if (h >= Math.max(0.6, obstacle.peak * 0.5)) { const zz = z - 0.15; const hh = heightAt(obstacle.profile, x, zz); return hh >= h * 0.9 ? { x, z: zz, h: hh } : { x, z, h }; }
    }
    return null;
  }
  /** The floor under the ball: a prop's top when the ball is over it (the same profile the feet are tested against). */
  function groundUnderBall(): number { return obstacle ? Math.max(0, heightAt(obstacle.profile, ballSim.pos.x, ballSim.pos.z)) : 0; }
  /** A standing throw: the run cue lands when the hold-run from here + the catch beat fills what is left of the flight. */
  function armRunCue(tf: number, dist: number, catchT = LOB_CATCH_CLIP_T): void {
    const run = runTimeToLineGather(dist, 2, HOLD_RUN_MAX, HOLD_RUN_RAMP, gatherStrideSpec()) + 0.15;   // the pad's ramp from standing, a beat to react
    lob.runCueAt = Math.max(0, tf - catchT - run); lob.runCued = false;
    console.info(`[LOB] RUN cue in ${lob.runCueAt.toFixed(2)} s (flight ${tf.toFixed(2)} s, run ${run.toFixed(2)} s)`);
    ctx0?.setHud({ hint: 'WAIT FOR IT…' });
  }
  /** OFF THE GLASS: the toss goes AT the board and comes back off it to the catch point on the flight's clock. On the run
   *  the throw's timing is the run's (a throw too near the line meets the iron — a CLANK — and one too far the board's top);
   *  standing, the flight time is picked so the ball meets the glass 0.7 m over the iron and the run is cued to it. */
  function throwGlassLob(ctx: ModeContext, from: Vector3, tf: number, standing: boolean, dist: number): void {
    const to = catchPointNow(GLASS_CATCH_CLIP_T);
    let t = tf;
    if (standing) {   // bisect the flight time for a hit 0.7 m over the rim (the mid-board), then cue the run to it
      const want = rim.y + 0.7; let lo = 0.45, hi = 2.5;
      for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; const g = glassLobVelocity(v3(from), v3(to), glass.z, mid); if (!g || g.hit.y < want) lo = mid; else hi = mid; }
      t = hi;
    }
    const g = glassLobVelocity(v3(from), v3(to), glass.z, t);
    if (!g) { console.warn('[LOB] off-glass throw impossible from here — a plain self-lob instead'); throwLob(ctx, from, 'SELF-LOB', tf); return; }
    if (ball.parent) { releasePos.copyFrom(ball.getAbsolutePosition()); releaseBall(ball); ball.position.copyFrom(releasePos); }
    ballSim.launch(from, new Vector3(g.v.x, g.v.y, g.v.z));
    lob.live = true; lob.thrown = true; lob.caught = false; lob.lost = false; lob.label = 'OFF-GLASS LOB'; lob.kind = 'glass'; lob.t = 0; catchBlend = 1; catchPending = false;
    setTrail('soft');
    const onBoard = g.hit.x >= glass.xMin && g.hit.x <= glass.xMax && g.hit.y >= glass.yMin && g.hit.y <= glass.yMax;
    console.info(`[LOB] OFF-GLASS LOB from (${from.x.toFixed(2)},${from.y.toFixed(2)},${from.z.toFixed(2)}) at the glass (${g.hit.x.toFixed(2)},${g.hit.y.toFixed(2)}) @${g.t1.toFixed(2)} s${onBoard ? '' : ' — OFF THE BOARD'} then to (${to.x.toFixed(2)},${to.y.toFixed(2)},${to.z.toFixed(2)}) in ${t.toFixed(2)} s${standing ? ' (standing)' : ''}`);
    if (standing) armRunCue(t, dist, GLASS_CATCH_CLIP_T);
  }
  /** DUNK PARKOUR (owner, 2026-09-18: "throw alley oops off that and dunk it"): the passer's toss off a CORNER BILLBOARD — solved
   *  in the sign's own frame (core/DunkLob.paneLobVelocity), flown in the world, reflected by the sign (BallPhysics.sweptPaneHit). */
  function throwCornerLob(ctx: ModeContext, from: Vector3, tf: number): void {
    const to = catchPointNow(CORNER_CATCH_CLIP_T);
    const pane = panes.reduce<GlassPane | null>((b, p) => !b || Math.hypot(p.cx - from.x, p.cz - from.z) < Math.hypot(b.cx - from.x, b.cz - from.z) ? p : b, null);
    const g = pane ? paneLobVelocity(v3(from), v3(to), pane, tf) : null;
    const along = pane && g ? Math.abs((g.hitWorld.x - pane.cx) * -pane.nz + (g.hitWorld.z - pane.cz) * pane.nx) : Infinity;
    if (!pane || !g || along > pane.half + 0.3 || g.hitWorld.y < 0.3 || g.hitWorld.y > 4.3) {
      console.warn(`[LOB] bus oop impossible from here (${!g ? 'no solve' : `off the sign: along ${along.toFixed(2)} y ${g.hitWorld.y.toFixed(2)}`}) — a plain oop instead`);
      throwLob(ctx, from, 'ALLEY-OOP', Math.max(0.35, tf)); return;
    }
    if (ball.parent) { releasePos.copyFrom(ball.getAbsolutePosition()); releaseBall(ball); ball.position.copyFrom(releasePos); }
    ballSim.launch(from, new Vector3(g.v.x, g.v.y, g.v.z));
    lob.live = true; lob.thrown = true; lob.caught = false; lob.lost = false; lob.label = `${ride.short} OOP`; lob.kind = 'corner'; lob.t = 0; catchBlend = 1; catchPending = false;
    setTrail('soft');
    console.info(`[LOB] BILLBOARD OOP from (${from.x.toFixed(2)},${from.y.toFixed(2)},${from.z.toFixed(2)}) off the ${pane.side > 0 ? 'right' : 'left'} sign at (${g.hitWorld.x.toFixed(2)},${g.hitWorld.y.toFixed(2)},${g.hitWorld.z.toFixed(2)}) @${g.t1.toFixed(2)} s then to (${to.x.toFixed(2)},${to.y.toFixed(2)},${to.z.toFixed(2)}) in ${tf.toFixed(2)} s`);
  }
  /** The BOUNCE LOB: thrown DOWN into the floor and up to the catch point. On the run one bounce on the run's clock (the beat
   *  is refused when it cannot fit); standing, the bounce-BOUNCE on the ball's own clock with a RUN cue — and when a prop's
   *  top lies under the bounce it is the floor: OFF THE CAR. */
  function throwBounceLob(ctx: ModeContext, from: Vector3, tf: number, standing: boolean, dist: number): void {
    const to = catchPointNow();
    const f = v3(from), c = v3(to);
    let b = null as ReturnType<typeof bounceLobVelocity>, t = tf, n: 1 | 2 = 1, floorY = 0;
    if (standing) {
      // the env bounce first: with a prop on the runway the one contact is pinned ONTO its top (the first point along the
      // throw where the sampled profile reads as the roof), the throw on its own clock — a toss up onto the car, back up to
      // the hand; out of reach from here (a near-vertical drop) it falls through to the plain bounce-bounce
      if (obstacle) {
        const roof = roofPointAlong(f, c);
        // a toss over ENV_TOSS_APEX_CAP reads as a rocket; a contact inside 0.35 m / 0.35 s of the catch is the ball falling into
        // the hand before it meets the roof (measured: an 11 m toss "caught" on its way down) — both fall through to the floor
        if (roof) { const bo = bounceOntoVelocity(f, c, roof.z, roof.h, ballSim.radius, FLOOR_E, FLOOR_FRICTION, ENV_TOSS_APEX_CAP); if (bo && bo.tf != null && roof.z - c.z >= 0.35 && bo.tf - bo.times[0] >= 0.35) { b = bo; t = bo.tf; n = 1; floorY = roof.h; } else console.info(`[LOB] the ${obstacle.spec.label}'s top at z ${roof.z.toFixed(2)} is out of reach from here (${bo ? `toss ${bo.apex.toFixed(1)} m, contact ${(roof.z - c.z).toFixed(2)} m / ${(bo.tf! - bo.times[0]).toFixed(2)} s before the catch` : 'no toss under the cap'}) — a floor bounce instead`); }
      }
      if (!b) {
        n = 2; let min = bounceLobMinTime(f, c, 2);
        if (min == null) { n = 1; min = bounceLobMinTime(f, c, 1); }
        if (min != null) { t = Math.max(min + RUN_CUE_MARGIN_SEC, tf); b = bounceLobVelocity(f, c, t, n); }
      }
    } else b = bounceLobVelocity(f, c, tf, 1);
    if (!b) { console.warn('[LOB] bounce lob cannot fit — a plain self-lob instead'); throwLob(ctx, from, 'SELF-LOB', tf); return; }
    if (ball.parent) { releasePos.copyFrom(ball.getAbsolutePosition()); releaseBall(ball); ball.position.copyFrom(releasePos); }
    ballSim.launch(from, new Vector3(b.v.x, b.v.y, b.v.z));
    lob.live = true; lob.thrown = true; lob.caught = false; lob.lost = false; lob.label = n === 2 ? 'BOUNCE-BOUNCE LOB' : 'BOUNCE LOB'; lob.kind = 'bounce'; lob.wantBounces = n; lob.t = 0; catchBlend = 1; catchPending = false;
    setTrail('soft');
    console.info(`[LOB] ${lob.label} from (${from.x.toFixed(2)},${from.y.toFixed(2)},${from.z.toFixed(2)}) ${b.bounces.map((p, i) => `bounce ${i + 1} at (${p.x.toFixed(2)},${p.z.toFixed(2)}) @${b!.times[i].toFixed(2)} s${floorY > 0 ? ` on the ${obstacle?.spec.label} (${floorY.toFixed(2)} m)` : ''}`).join(', ')} then to (${to.x.toFixed(2)},${to.y.toFixed(2)},${to.z.toFixed(2)}) in ${t.toFixed(2)} s, last apex ${b.apex.toFixed(2)}${standing ? ' (standing)' : ''}`);
    if (standing) armRunCue(t, dist);
  }
  /** One step of a live lob on the ball's clock (real seconds on the runway, clip seconds in the air): the floor / a prop's
   *  top under it, the glass, the iron, and the words for each. */
  function stepLob(ctx: ModeContext, dt: number): void {
    if (!lob.live) return;
    lob.t += dt;
    const wasOverProp = obstacle ? heightAt(obstacle.profile, ballSim.pos.x, ballSim.pos.z) : 0;
    const prevZ = ballSim.pos.z;
    const ground = groundUnderBall();
    ballSim.step(dt, ground, FLOOR_E, FLOOR_FRICTION);
    // a ball flying INTO a prop's side (it was beside the prop, now inside its footprint below the top) comes back off the side
    if (obstacle && !wasOverProp) { const h = heightAt(obstacle.profile, ballSim.pos.x, ballSim.pos.z); if (h > 0 && ballSim.pos.y - ballSim.radius < h - 0.02) { ballSim.pos.z = prevZ; ballSim.vel.z = -ballSim.vel.z * 0.5; ballSim.vel.x *= 0.8; ballSim.mesh.position.copyFrom(ballSim.pos); if (!lob.env) { lob.env = obstacle.spec.label; console.info(`[LOB] off the side of the ${obstacle.spec.label}`); flash(ctx, `OFF THE ${obstacle.spec.label}`, 500); SoundKit.play('impact', { pitch: 0.9, volume: 0.4 }); } } }
    if (ballSim.bounced) {
      lob.bounces++;
      if (ground > 0 && obstacle) { lob.env = obstacle.spec.label; runwayDifficulty += ENV_BOUNCE_DIFFICULTY; console.info(`[LOB] BOUNCE ${lob.bounces} off the ${obstacle.spec.label} (${ground.toFixed(2)} m) @${lob.t.toFixed(2)} s`); flash(ctx, `OFF THE ${obstacle.spec.label}!`, 600); SoundKit.play('impact', { pitch: 1.1, volume: 0.45 }); EffectsKit.burst(ctx.scene, ball.getAbsolutePosition(), 'sparks'); ctx.camDirector.pulse(0.25, 0.25); }
      else if (lob.kind === 'bounce') { console.info(`[LOB] BOUNCE ${lob.bounces} @${lob.t.toFixed(2)} s at z ${ballSim.pos.z.toFixed(2)}`); flash(ctx, lob.bounces >= 2 ? 'BOUNCE · BOUNCE' : 'BOUNCE', 450); SoundKit.play('impact', { pitch: 1.4, volume: 0.3 }); }
    }
    // the glass: the front face inside the board, or over / beside it
    if (!lob.glass && !lob.over) {
      const hit = ballSim.sweptPanelHit(glass.z, glass.xMin, glass.xMax, glass.yMin, glass.yMax, GLASS_E_N, GLASS_E_T);
      if (hit) { lob.glass = true; console.info(`[LOB] OFF THE GLASS at (${hit.x.toFixed(2)},${hit.y.toFixed(2)}) @${lob.t.toFixed(2)} s`); flash(ctx, 'OFF THE GLASS!', 600); SoundKit.play('impact', { pitch: 1.6, volume: 0.45 }); EffectsKit.burst(ctx.scene, hit, 'sparks'); ctx.camDirector.pulse(0.3, 0.3); hoopJuice?.punch(); }
      else if (ballSim.prevPos.z >= glass.z + ballSim.radius && ballSim.pos.z < glass.z + ballSim.radius && lob.kind === 'glass') { lob.over = true; const y = ballSim.pos.y; console.info(`[LOB] ${y > glass.yMax ? 'OVER' : 'WIDE OF'} THE GLASS (${ballSim.pos.x.toFixed(2)},${y.toFixed(2)}) @${lob.t.toFixed(2)} s`); flash(ctx, y > glass.yMax ? 'OVER THE GLASS' : 'WIDE OF THE GLASS', 700); SoundKit.play('crowdGroan', { volume: 0.4 }); }
    }
    // the corner billboards (DUNK PARKOUR): the toss off a sign comes back off it
    if (lob.kind === 'corner' && !lob.glass) for (const pn of panes) {
      const hit = ballSim.sweptPaneHit(pn.cx, pn.cz, pn.nx, pn.nz, pn.half + 0.3, 0.2, 4.3, GLASS_E_N, GLASS_E_T);
      if (hit) { lob.glass = true; runwayDifficulty += 0.6; console.info(`[LOB] OFF THE BUS at (${hit.x.toFixed(2)},${hit.y.toFixed(2)},${hit.z.toFixed(2)}) @${lob.t.toFixed(2)} s`); flash(ctx, `OFF THE ${ride.short}!`, 600); SoundKit.play('impact', { pitch: 1.6, volume: 0.45 }); EffectsKit.burst(ctx.scene, hit, 'sparks'); break; }
    }
    // the iron: a toss through the rim's ring clanks off it
    if (!lob.clanked) for (const c of RIM_RING) { const h = ballSim.sweptHit(c, RIM_IRON_R); if (h) { const n = ballSim.pos.subtract(c); if (n.lengthSquared() < 1e-6) n.set(0, 1, 0); ballSim.deflect(n, 0.55); ballSim.pos.copyFrom(h); ballSim.mesh.position.copyFrom(h); lob.clanked = true; console.info(`[LOB] CLANK off the iron @${lob.t.toFixed(2)} s (${h.x.toFixed(2)},${h.y.toFixed(2)},${h.z.toFixed(2)})`); flash(ctx, 'OFF THE IRON', 600); SoundKit.play('impact', { pitch: 1.2, volume: 0.5 }); break; } }
    // the standing throw's RUN cue
    if (lob.runCueAt >= 0 && !lob.runCued && lob.t >= lob.runCueAt) { lob.runCued = true; if (phase === 'approach') { console.info(`[LOB] RUN! @${lob.t.toFixed(2)} s`); flash(ctx, 'RUN!', 700); ctx.setHud({ hint: 'RUN! HOLD to run — then tap jump' }); SoundKit.play('whoosh', { pitch: 1.3, volume: 0.5 }); ctx.camDirector.pulse(0.3, 0.3); } }
  }
  function catchLob(ctx: ModeContext): void {
    if (!lob.live) return;
    lob.live = false; lob.caught = true;
    ballSim.stop();
    const world = ball.getAbsolutePosition().clone();
    attachBallToHand(ball, player.skeleton, ebState.inLeftHand ? 'LeftHand' : 'RightHand');
    const hand = ballHandNode();
    if (hand) { catchWorld.copyFrom(world); catchPending = true; hand.computeWorldMatrix(true); hand.getWorldMatrix().invertToRef(_invHand); Vector3.TransformCoordinatesToRef(world, _invHand, catchFrom); catchBlend = 0; ball.position.copyFrom(catchFrom); }
    runwayDifficulty += CATCH_DIFFICULTY;
    console.info(`[LOB] CAUGHT ${lob.label} @${clipTime.toFixed(2)}`);
    ctx.feel?.impact?.(0.15);
    SoundKit.play('whoosh', { pitch: 1.5, volume: 0.35 });
    EffectsKit.burst(ctx.scene, ball.getAbsolutePosition(), 'sparks');
    flash(ctx, `${lob.label} — CAUGHT`, 600);
  }
  function lostLob(ctx: ModeContext): void {
    if (!lob.live) return;
    lob.lost = true;
    console.info(`[LOB] LOST ${lob.label} @${clipTime.toFixed(2)}`);
    SoundKit.play('crowdGroan', { volume: 0.6 });
    ctx.feel?.impact?.(0.3);
    resolveDunk(ctx);   // no ball in hand → the miss path (its LOST THE … — MISSED line); the lob keeps bouncing
  }
  /** The feet came down past the far edge with the mesh under them: one clean beat, no second slow-mo. */
  function onObstacleCleared(ctx: ModeContext): void {
    if (!obstacle) return;
    console.info(`[DUNK-PROP] CLEARED ${obstacle.spec.label} by ${obstacleMargin.toFixed(2)} m`);
    SoundKit.play('crowdCheer', { volume: 0.35 });
    ctx.camDirector.pulse(0.35, 0.3);
    EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(0, 0.3, 0)), 'sparks');
    flash(ctx, `OVER THE ${obstacle.spec.label}!`, 700);
  }
  /** Soft-OPEN #3 (2026-09-07): the rival's clips get the player's token guard. Its hop launch and verdict clips were raw
   *  `play(clip, { onEnd: idle })` chains — Babylon raises a group's end observable on stop() too, so whenever a verdict clip
   *  superseded a still-playing launch (a longer launch clip, a stalled frame loop) the launch's chain cut the celebrate /
   *  crouch to idle on its first frame. A superseded rival chain is dead; the idle loop follows only a clip that ends on
   *  its own. A loop bumps the token so any pending chain dies with it (the turn-end idle). */
  function rivalClip(name: string, opts: PlayOpts = {}): void {
    const token = ++rivalClipToken;
    if (opts.loop) { rival.animator.play(name, opts); return; }
    rival.animator.play(name, { ...opts, onEnd: () => {
      if (token !== rivalClipToken) return;
      if (opts.onEnd) opts.onEnd(); else rival.animator.play(SPORT_CLIP.idle, { loop: true });
    } });
  }


  /** CONTACT (PM brief VENICE-JUICE-P0, 2026-09-06): console juice on the make's flush frame — one hit-stop, one shake,
   *  one white-gold flash, one rim thud — latched once per attempt so judge cards and FIFTY bursts never re-fire it.
   *  Never a second slow-mo: the hang already spent it at rise. Miss path: nothing here (the clank stays honest). */
  // ── Venice juice soft #2–#5 (PM brief VENICE-JUICE-SOFT, 2026-09-06) ─────────────────────────────────────────────
  /** #2 miss clank weight: a light metallic hit and a small feel impact on the clank — never the make's contactPunch. */
  function missClank(ctx: ModeContext): void {
    hoopJuice?.graze();   // hoops detail pass: the miss rattles the iron and the net (no flash)
    if (obstacleClipped) { console.info('[JUICE-SFX] clank skipped — the chair thud was the one hit'); return; }   // A+ P2: one hit per miss
    // A MISS TELLS YOU HOW CLOSE YOU WERE NOW (review, 2026-09-14). Every miss used to be one impact sound
    // whether the press was 40 ms out or half a second out, which throws away the best feedback a
    // basketball game has: the ball. The flavour is DETERMINISTIC on the timing -- a rolled rattle would be
    // prettier and would teach nothing. See core/MissFlavour.
    const beat = missBeat(slamTiming?.offsetMs ?? null);
    ctx.feel.impact(beat.punch);
    if (beat.ringIt) {
      // it actually touched the iron: spring the ring and rattle it, rather than a flat clank in the air
      hoopJuice?.punch();
      SoundKit.play('rattle', { pitch: beat.flavour === 'in_and_out' ? 0.95 : 1.1, volume: 0.55 });
      SoundKit.play('clang', { pitch: 1.2, volume: 0.35 });
    } else {
      SoundKit.play('impact', { pitch: 1.35, volume: 0.45 });
    }
    SoundKit.play('crowdGroan', { volume: beat.groan });
    ctx.momentum.report({ kind: 'miss', weight: beat.flavour === 'in_and_out' ? -3 : -6 });   // an in-and-out barely cools the room
    console.info(`[JUICE-SOFT] miss ${beat.flavour} (${slamTiming?.offsetMs ?? 'no press'} ms)`);
  }
  /** #3 land settle: a micro shake (amp 0.05) and dust at the feet, once per attempt; the miss keeps its one-breath retry. */
  /** A+ P4: armed at CONTACT (make) or at the clank (miss); fires from update() once the body is back on the floor. */
  function armSettle(): void { settleArmed = true; settleArmAt = performance.now(); }
  function settleTick(ctx: ModeContext): void {
    if (!settleArmed) return;
    const since = performance.now() - settleArmAt;
    // feet-down (root back on the floor) or, failing that, the land clip's plant beat ~0.45 s after the hit — never the hit frame
    if (since < 220 || (player.root.position.y > 0.05 && since < 450)) return;
    settleArmed = false; landSettle(ctx);
  }
  function landSettle(ctx: ModeContext): void {
    if (settleLatch) return;
    settleLatch = true;
    fovRelease();   // A+ P5: a miss restores the fov at the land
    const dust = landingDustScale(apexFor());
    ctx.juice.shake(0.03 + dust * 0.03, 110);
    EffectsKit.burst(ctx.scene, player.root.position.clone(), 'dust', dust);
    console.info(`[JUICE-SOFT] land settle (apex ${apexFor().toFixed(2)} → dust x${dust.toFixed(2)})`);
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
  // THE TRAIL'S LOOK LIVES IN EffectsKit (visuals pass, 2026-09-16) — four levels, one table, taper included. The old
  // numbers here (170/s at 0.2 m, no taper) were what put a dozen fat orange orbs in the sky at the hang.
  function setTrail(level: TrailLevel): void {
    if (!trail) return;
    console.info(`[JUICE-SOFT] trail ${level}`);
    applyTrail(trail, level);
  }
  function trailFlash(): void {
    if (!trail) return;
    console.info('[JUICE-SOFT] trail flash');
    applyTrail(trail, 'flash', '#ffffff');
    setTimeout(() => setTrail('off'), 130);
  }

  function contactPunch(ctx: ModeContext): void {
    if (contactLatch) return;
    contactLatch = true;
    ctx.juice.hitStop(70);
    feelHitStop(70);   // DUNK-HANDS-RIM H3: the mode's clock stops on the iron too (the ball on the ring, the body) — one beat, composed; never a second slow-mo
    ctx.juice.shake(0.12, 140);
    ctx.juice.flash('#fff6dd', 120);
    ctx.camDirector.pulse(0.9, 0.32);   // DUNK-BODY-MID: the CONTACT is a camera beat too — a short hard push onto the iron under the hit-stop, so the punch reads from behind (the flight had a push-in at the hang rise and nothing at the rim)
    SoundKit.play('impact', { pitch: 0.7, volume: 0.8 }); console.info('[JUICE-SFX] impact slam');   // A+ P2: the ONE slam thud of the attempt
    // THE NET SPLASH BELONGS TO THE FLUSH. It used to fire in the judges' scoring step, seconds later, with the camera
    // on the player: a net effect at a rim nobody was looking at. It goes off under the ring, on the frame the ball is
    // through it, at the size the jam earned.
    EffectsKit.burst(ctx.scene, rim.add(new Vector3(0, -NET_SPLASH_DROP, 0)), 'net', netSplashScale(qteAccuracy));
    fovRelease(); trailFlash();   // juice soft #4, #5: CONTACT restores the fov and cuts the trail with a flash
    armSettle();                  // A+ P4: the settle fires at feet-down, not on this frame
    hoopJuice?.punch();           // juice LOOK #1–#3: the hoop answers the make (never on a miss — this is the flush frame)
  }

  async function finishAttempt(ctx: ModeContext, made: boolean): Promise<void> {
    if (finishing) return;
    finishing = true;
    ctx.setHud({ bannerHigh: false });   // the flush is through: the replay and the judges' banners sit back in the middle

    if (!made) {
      // A+ P2: the clank is the miss's one hit — no buzzer on the same beat; the crowd groans a breath later, quietly
      setTimeout(() => SoundKit.play('crowdGroan', { volume: 0.35 }), 260);
      crowd.level = 0.15;                                 // the building hushes
      SoundKit.setAmbientLevel(crowd.level);
      hype = Math.max(0, hype - 15);
      chain = 0;                                          // a miss breaks the chain
      lastScores = [];
      // A BLOWN DUNK IS STILL JUDGED. This awarded a flat ZERO, which is not
      // how the event works and is not survivable: the rival paces ~40 a dunk,
      // so one miss put the player unrecoverably behind — measured at "FINAL
      // ROUND — you need big numbers (down 48)" after a single round.
      //
      // In the real contest the judges score what they saw. The panel's floor is
      // five sixes, so a blown attempt lands around 30 while a good one lands in
      // the low 40s and a great one at 50. That IS the benchmark's scale — the
      // 6-10 card is what compresses it — and it keeps a miss expensive without
      // ending the contest.
      // DUNK-BIOMECH fold (JUDGES 31 soft): the panel scores what it SAW — the tricks thrown, a prop actually cleared (or a
      // lob actually caught) count on a miss too, so a blown 360 over the car is not the same card as a plain clank
      // (measured: plain clank 31, a missed 360 32, a missed 360 over the car ~35; at the old ×0.30 every miss rounded to 31)
      const propSeen = obstacleKindOf(prop) ? (obstacleCleared ? PROP_BONUS[prop] : 0) : (prop === 'none' || lob.caught ? PROP_BONUS[prop] : 0);
      const seen = flight.attempt.tricks.reduce((a, t) => a + t.difficulty, 0) + runwayDifficulty + (obstacleCleared ? 1 : 0);
      const missDiff = Math.max(0, (STYLE_TIER[style] + propSeen + seen) * 0.60);   // they saw the attempt
      const missStyle = Math.max(0, STYLE_TIER[style] * 0.22 + styleTaps * 0.4);
      const missScores = judgeDunk(missDiff, 0, missStyle);                          // and they saw it fail
      // A RETRY IS NOT SCORED. In a real contest only the attempt you finish on is judged, which is what
      // makes burning one cost something without costing everything. The miss is judged only when there is
      // nothing left to try.
      stakes = spendAttempt(stakes);
      if (canRetry(stakes, false)) {
        SoundKit.play('crowdGroan', { volume: 0.35 });
        flash(ctx, `${missWhy()} — MISSED · ${attemptsLeft(stakes)} LEFT`);
        ctx.setHud({ judgeReveal: null, hint: '', attempt: stakesLabel(stakes, calledLabel()) });
        landingClip = SPORT_CLIP.dunkLandCrouch; landNow();
        setPhase('judging');
        setTimeout(() => { clearBanner(ctx); void retryThisDunk(ctx); }, MISS_BEAT_MS);
        finishing = false;
        return;
      }
      const missTotal = Math.round(missScores.reduce((a, j) => a + j.score, 0)
        * stakesScale(stakes, flight.attempt.tricks.map((t) => t.id), false));
      playerTotal += missTotal; misses++; playerCards.push(missTotal);   // a miss is part of the standard too
      card = addAttempt(card, {
        round, style: STYLE_LABEL[style], prop: propLabel(prop),
        finish: SPORT_CLIP.dunkFinishBlown, label: 'BLOWN',
        judges: missScores.map((j) => j.score), total: missTotal, made: false,
        diff: missDiff, exec: 0, look: missStyle,   // P9: a miss is part of the night's numbers too
      });
      lastScores = missScores;
      crowd.onScore(missTotal);
      revealed = [];
      // DUNK-SOFTS-NAMED: one honest line — the miss under its name and what the panel gave it, so the score line's jump is
      // explained; no card flip for the one-beat miss (the reveal's CONFER hint used to stack under the banner)
      // a MISS is where the silence hurt most: three of six measured attempts scored nothing and said
      // nothing. If the finger moved at all, say what it did.
      const mb = missBeat(slamTiming?.offsetMs ?? null);
      flash(ctx, slamTiming ? `${missWhy()} — ${mb.label} · ${slamTiming.label}` : `${missWhy()} — ${mb.label} · JUDGES ${missTotal}`);
      ctx.setHud({ slamTiming: slamTiming?.label ?? '' });
      ctx.setHud({ judgeReveal: [], hint: '', score: playerTotal, chain, hype: Math.round(hype) });
      landingClip = SPORT_CLIP.dunkLandCrouch; landNow();   // A+ P8 H5: normally landed at feet-down already (~0.1 s after the release); this is the floor
      setPhase('judging');
      // Pad acceptance #4: a miss is one beat, then the next run-up — no reveal wait, no card, no re-press
      // (a hold still down streams the trigger and starts the next run the frame the approach resets).
      setTimeout(() => { clearBanner(ctx); void advanceAfterJudging(ctx); }, MISS_BEAT_MS);
      finishing = false;
      return;
    }

    // VARIETY MEMORY — the judges remember what they've seen this contest
    const combo = `${style}_${prop}_${[...runwayLabels, ...trickLabels].join('+') || 'plain'}`;
    const isRepeat = usedCombos.has(combo);
    usedCombos.add(combo);
    // DUNK-SOFTS-NAMED: the make's verdict is ONE line (the dunk's name first, then the calls) held through the replay and the
    // confer until the panel's total — five banners used to overwrite each other in one tick and clear each other's timeouts
    const verdictParts: string[] = [];
    if (isRepeat) verdictParts.push('THE JUDGES HAVE SEEN THAT ONE…');

    // RIM HANG — held through the flush pays style before the reveal
    const hangBonus = hangSec >= 0.5 ? 1 : 0;
    if (hangBonus > 0) {
      SoundKit.play('crowdCheer', { volume: 0.4 });
      verdictParts.push('HANG TIME!');
    }

    // Phase 6: trick gestures carry the difficulty (style tier is the base
    // inside flight.attempt.difficulty; combo chains get their 1.35x there).
    // The run-up is judged too: a full-speed runway attack reads harder than
    // a walk-up, exactly as the real panel reads it.
    // A NAMED DUNK (2026-09-16): some combinations are not a combo, they are somebody's dunk. The first is the owner's
    // own — the KICK-UP EASTBAY — announced by its name and its author instead of "KICK-UP → EASTBAY DUNK!", and worth
    // a nod on top of its parts for doing the whole thing.
    const signature = signatureFor(runwayIds, flight.attempt.tricks.map((t) => t.id));
    const trickDifficulty = flight.attempt.difficulty - STYLE_TIER[style];
    // DUNK-CONTROL-JUICE: the runway tricks (a toss, a kick, a cartwheel, the hop) and a caught lob are judged on top; an
    // obstacle pays only CLEARED (a clip never reaches this path)
    // P3 (2026-09-16): the three numbers are computed in one pure place (core/DunkCard) and they mean what their names
    // say. DIFFICULTY is WHAT YOU TRIED — the vocabulary carries it, the run-up is a qualifier worth about a point —
    // and the STYLE TIER moved to STYLE, where calling your signature belongs. Measured before: every attempt in the
    // lab scored DIFF 10.0, the cap, so a WINDMILL and a BETWEEN THE LEGS off a self-lob were the same dunk.
    const { difficulty, execution, style: styleScore } = dunkCard({
      trickDifficulty, runwayDifficulty: runwayDifficulty + (signature?.nod ?? 0) + (doubleLaunched ? DOUBLE_LAUNCH.difficulty : 0), propBonus: PROP_BONUS[prop],
      charge, launchSpeed01, styleTier: STYLE_TIER[style], styleTaps,
      hype, hang: hangBonus > 0, repeat: isRepeat, execution01: qteAccuracy,
      chainTricks: Math.max(0, flight.attempt.tricks.length - 1),
    });

    // THE BUILDING IS PART OF THE PANEL. Momentum reached the score only as hype into the NEXT attempt's
    // style term; the judges themselves never heard the room, in the one mode on the platform that has
    // judges. `CROWD_SWAY` is sized to move the marginal card and nothing else.
    // THE THREE NUMBERS THE JUDGES ACTUALLY USED. A player got a total between 30 and 50 and no way to know
    // whether they lost it on difficulty, execution or style -- so they could not know what to change. The
    // panel already weights these three; showing them costs nothing and is the difference between a score
    // and a lesson.
    // JUDGE TRANSPARENCY (owner's pillars brief, 2026-09-18 §4): the panel's four reads, in words — the APPROACH (the run, the
    // takeoff, the runway beats, the caught toss), the AIR (the tricks, the taps, the hang), the PRECISION (the slam's timing)
    // and the room (HYPE, and whether the panel has seen this one) — so a card is a lesson, not a number
    const approachBits = [launchSpeed01 >= 0.8 ? 'FULL RUN' : launchSpeed01 >= 0.45 ? 'JOG' : 'WALK-UP', launchTag, ...runwayLabels, lob.caught ? lob.label : '', doubleLaunched && !boardTopFlip ? 'DOUBLE-LAUNCH' : ''].filter(Boolean);   // the sky tap, the board top and the board run are runway labels
    const airBits = [...flight.attempt.tricks.map((t) => t.id.toUpperCase()), styleTaps > 0 ? `${styleTaps} STYLE TAP${styleTaps > 1 ? 'S' : ''}` : '', hangBonus > 0 ? 'HANG' : ''].filter(Boolean);
    const judgeWhy = `APPROACH ${approachBits.join(' · ')} │ AIR ${airBits.join(' · ') || 'straight up'} │ PRECISION ${Math.round(qteAccuracy * 100)}% │ HYPE ${Math.round(momentum.score01 * 100)}%${isRepeat ? ' · SEEN IT' : ''}`;
    ctx.setHud({
      slamTiming: slamTiming?.label ?? '',
      breakdown: `DIFF ${difficulty.toFixed(1)} · EXEC ${execution.toFixed(1)} · STYLE ${styleScore.toFixed(1)}`,
      judgeWhy,
    });
    console.info(`[JUDGE-WHY] ${judgeWhy}`);
    const scores = judgeDunk(difficulty, execution, styleScore, momentum.score01);
    lastScores = scores;
    // THE STAKES SCALE THE PANEL, they do not replace it: the judges still judge the dunk, and then what
    // it cost to get there is applied on top. A called trick that fired pays a bonus; one that did not
    // costs more than never calling. See core/DunkStakes.ts for why the penalty is bigger than the bonus.
    stakes = spendAttempt(stakes);
    const landedIds = flight.attempt.tricks.map((t) => t.id);
    const scale = stakesScale(stakes, landedIds, true);
    const dunkTotal = Math.round(scores.reduce((s, j) => s + j.score, 0) * scale);   // MIN_TOTAL..PERFECT_TOTAL (30..50)
    if (stakes.called) {
      flash(ctx, callLanded(stakes, landedIds, true) ? `CALLED IT — ${calledLabel()}!` : `CALLED ${calledLabel()} — DIDN'T SHOW IT`, 1100);
    }

    // CHAIN: consecutive approval-band dunks build the multiplier; each link
    // pumps extra hype (which feeds the NEXT dunk's style score — real teeth)
    // Game-Breaker: an eruption-band dunk is a highlight that shifts the building
    if (dunkTotal >= BAND_TOTAL.eruption) {
      momentum.report({ kind: 'highlight_dunk', weight: perJudgeAvg(dunkTotal) >= MONSTER_AVG ? 30 : 18 });
    } else if (perJudgeAvg(dunkTotal) <= FLAT_AVG) {
      momentum.report({ kind: 'contest_low' });
    }
    momentum.update(0); // settle tier for this beat
    const tier = momentum.tier;
    if (tier === 'on_fire' || tier === 'hot') {
      hype = Math.min(100, hype + (tier === 'on_fire' ? 14 : 7));
      verdictParts.push(tier === 'on_fire' ? 'THE BUILDING IS ON FIRE' : 'HEATING UP…');
    }

    if (dunkTotal >= CHAIN_THRESHOLD) {
      chain++;
      if (chain >= 2) {
        hype = Math.min(100, hype + chain * 5);
        verdictParts.push(`CHAIN x${chain}!`);
        SoundKit.play('uiTick', { pitch: 1 + chain * 0.15 });
      }
    } else {
      chain = 0;
    }

    playerTotal += dunkTotal; makes++; bestChain = Math.max(bestChain, chain); playerCards.push(dunkTotal);
    // the FINISH CLIP goes in, not only a label: the body's finish is picked deterministically from these
    // same values, so the card is enough to re-perform the attempt if a replay is ever built
    card = addAttempt(card, {
      round, style: STYLE_LABEL[style], prop: propLabel(prop),
      finish: aerialClip, label: finishBanner(true, qteAccuracy, ebState.inLeftHand, calledAirTrick()).replace('!', '') || STYLE_LABEL[style],
      judges: scores.map((j) => j.score), total: dunkTotal, made: true,
      diff: difficulty, exec: execution, look: styleScore,   // P9: the night's report reads these back
    });
    // Hype is fed by the QUALITY of the dunk, not the raw total — the total's
    // range moved with the ceiling and `dunkTotal * 2` would now fill the meter
    // almost instantly, quietly wrecking the momentum curve. Per-judge average
    // is scale-free: this yields the same 36..60 it always did.
    hype = Math.min(100, hype + perJudgeAvg(dunkTotal) * 6);

    ctx.feel?.impact?.(0.2 + execution / 15);
    SoundKit.play('score', { pitch: 1 + Math.min(1, hype / 100) });
    const named = [...runwayLabels, ...trickLabels];
    if (named.length) {   // P1: the card juice scales with the named dunk — the banner names it, the building answers it
      ctx.camDirector.pulse(Math.min(1.2, 0.5 + named.length * 0.25), 0.5);
      SoundKit.play('crowdCheer', { volume: Math.min(0.9, 0.4 + difficulty * 0.05) });
    }
    flash(ctx, [signature ? `${signature.name} — ${signature.by.toUpperCase()}`
      : named.length ? `${named.join(' → ')} DUNK!` : finishBanner(qteHit, qteAccuracy, ebState.inLeftHand, calledAirTrick()), ...verdictParts].filter(Boolean).join(' · '));
    if (dunkTotal >= BAND_TOTAL.eruption) { SoundKit.play('crowdCheer'); EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(0, 1.8, 0)), 'confetti'); }
    landingClip = pickLanding(dunkTotal);   // A+ P8 H5: plays at feet-down after the replay hands the root back, not on the flush frame

    // A+ P8 H5: the replay re-flies the recorded root for up to 8 s (a 4 s window at 0.5×) and outlives this 3.5 s race; the
    // un-raced promise is what knows when the root is the mode's again — then it falls to the floor and lands. The replay
    // writes a rotationQuaternion the mode never uses (it yaws by Euler), so the Euler yaw is handed back with the root.
    replaying = true; replayAir = false; replayAerial = false; replayPrevY = player.root.position.y;
    // THE REPLAY IS THE FLIGHT, not the walk to the baseline. Filmed for a review (2026-09-14): the 4 s
    // buffer played whole at 0.5x was eight seconds of replay, most of it the dunker jogging up the floor
    // with the ball on the ground behind him. The mode knows exactly how long this flight took --
    // `launchRealMs` to now -- so it trims to that plus a beat of run-up for context, which is the shape a
    // broadcast actually cuts.
    const flightSec = Math.max(0, (performance.now() - launchRealMs) / 1000);
    const replayDone = replay.play(rim, Math.min(4, flightSec + REPLAY_LEAD_IN_SEC), (netRealSec || (flushRealSec && flushRealSec + 0.2)) || undefined).then(() => { replaying = false; replayAir = false; player.root.rotationQuaternion = null; dropToFloor = true; console.info('[HANDS] replay end'); });
    ctx.camDirector.suspended = true;
    await Promise.race([replayDone, new Promise((r) => setTimeout(r, 3500))]);
    ctx.camDirector.suspended = false;

    // Phase 7: STAGED REVEAL — confer, Silk, Doc, the long Prime beat,
    // then the total + eruption/hush. Not a number flash.
    crowd.onScore(dunkTotal);
    revealed = [];
    reveal.start(scores);
    ctx.setHud({ score: playerTotal, hype: Math.round(hype), chain, judgeReveal: [] });
    setPhase('judging');
    setTimeout(() => void advanceAfterJudging(ctx), REVEAL_DURATION_SEC * 1000 + 400);
    finishing = false;
  }

  /** The label of the trick the player called, or '' — one place, so the banner and the bezel agree. */
  function calledLabel(): string {
    return stakes.called ? (DUNK_TRICKS.find((t) => t.id === stakes.called)?.label ?? '') : '';
  }

  /**
   * SAME DUNK, ONE FEWER TRY.
   *
   * Deliberately NOT advanceAfterJudging: `dunkInRound` does not move, the round does not move, and the
   * stakes ledger survives — it is the thing counting down. Everything else about the runway resets
   * exactly as it does between dunks, so a retry starts from the same standing position as a first
   * attempt and the only difference is what it is worth.
   */
  function retryThisDunk(ctx: ModeContext): void {
    if (phase !== 'judging') return;
    clearBanner(ctx); ctx.setHud({ judgeReveal: null });
    resetForNextAttempt(ctx);
  }

  async function advanceAfterJudging(ctx: ModeContext): Promise<void> {
    if (phase !== 'judging') return;   // already advanced (watchdog vs normal path race)
    clearBanner(ctx); ctx.setHud({ judgeReveal: null });
    // the dunk is over however it ended: fresh attempts, and the call cleared. A call belongs to one dunk.
    stakes = freshStakes();
    dunkInRound++;
    if (dunkInRound < DUNKS_PER_ROUND) {
      resetForNextAttempt(ctx);
      return;
    }
    dunkInRound = 0;
    await rivalRound(ctx);
  }

  function resetForNextAttempt(ctx: ModeContext): void {
    ctx.setHud({ bannerHigh: false });
    player.root.position.set(0, 0, CFG.startZ);
    player.root.rotation.y = Math.PI;
    player.root.rotation.z = 0; airLean = 0; holdRunSpeed = 0; approachMove.stop();
    airHeld = false; dropToFloor = false; replaying = false; replayAir = false; player.root.rotationQuaternion = null;   // A+ P8
    armedAir = null; spin.reset(); replaySpinYaw = 0;
    playClip(SPORT_CLIP.idle, { loop: true });
    charge = 0; qteHit = false; qteWindowOpen = false; qteAccuracy = 0; rimCamCut = false; hangSlowMoLatch = false; contactLatch = false;
    jamSec = -1; jamContact = false; flushRealSec = 0; netRealSec = 0; hangOn = false; hangHeldSec = 0; lagLive = false; hoopJuice?.hold(false);   // DUNK-HANDS-RIM
    styleTaps = 0; hangSec = 0; revealed = []; slamTiming = null;
    runUpPeak = 0; obstacleClipped = false; toppling = false; runwayIds = [];
    // THE FLIGHT'S ONCE-A-FLIGHT FLAGS ARE PER ATTEMPT (2026-09-18, measured: the bus wall run refused attempt 2 of a night — busRan, like
    // doubleLaunched / skyTapped / boardRan, was reset at the mode's start only, so every second flight of a night found its board / sky / bus 'spent')
    vectorAt = -1e9; vectorWallRun = false; doubleLaunched = false; doubleLaunchLift = 0; boardSwung = false; hangBase = null; swingAng = 0; skyTapped = false; boardTopFlip = false; boardRan = false; l1DownAt = -1; busRun = null; busLaunch = null; busRan = false;
    resetLob(); resetRunway(); ballSim.stop(); looseBall = false; flush = null; jamPrevLive = false; punchPending = false; dribble?.update(0, 0, false); gatherLatched = false; gatherStride = false; gatherK = 0; finishRelease = -1; attachBallToHand(ball, player.skeleton, 'RightHand'); ebState.inLeftHand = false; setWin('run');
    settleLatch = false; settleArmed = false; fovRelease(); setTrail('soft');   // juice soft: back to the runway
    void setupProp(ctx);
    // P7 (2026-09-16): THE RUNWAY GETS ITS CAMERA BACK. `snapTo` places and aims the camera but never touches the
    // director's MODE, and the verdict portrait is a FIXED camera — so the whole next run-up was filmed from the spot
    // the last dunk was judged from, and the dunker drifted to the edge of frame as he walked back to the top of the
    // runway. Measured in the lab: an attempt's opening frame is the hero half out of shot at the left edge with the
    // rim not in the picture at all. (The rival-round path already knew to do this; the player's own did not.)
    ctx.camDirector.mode = 'follow';
    ctx.camDirector.snapTo(player.root.position, rim);
    setPhase('approach');
    // THE NEED — final-round pressure number: what this dunk must average
    // to stay ahead of the rival's pace (they dunk after you)
    const isFinalRound = round === TOTAL_ROUNDS;
    const deficit = rivalTotal - playerTotal;
    const need = isFinalRound ? Math.max(0, deficit + RIVAL_PACE) : 0;
    ctx.setHud({
      dunkNum: `${dunkInRound + 1}/${DUNKS_PER_ROUND}`,
      attempt: stakesLabel(stakes, calledLabel()),
      // the LAST attempt's verdict must not hang over this one: measured on the probe, the readout from
      // attempt 1 was still on screen through attempt 2 because only a resolve ever wrote the field.
      slamTiming: '', breakdown: '', judgeWhy: '',
      need: need > 0 ? need : 0,
      hint: need > 0
        ? `FINAL ROUND — you need big numbers (${deficit > 0 ? `down ${deficit}` : `up ${-deficit}`})`
        : 'HOLD to run · tap JUMP at the line — then SLAM on NOW!',   // F4 (review): six controls in one line taught none of them
      charge: 0, slamPulse: false,
    });
  }

  async function rivalRound(ctx: ModeContext): Promise<void> {
    setPhase('rivalTurn');
    // THE PLAYER WATCHES FROM THE SIDE (2026-09-15). The comment below says he "is standing off-camera by design", and
    // nothing ever moved him: he stayed wherever his last dunk ended — under the rim — and the rival landed his own
    // verdict in the same half-metre. Every rc capture's late frame is the two bodies drawn through each other (the
    // Visuals review has charged it since rc10). He takes the bench opposite the rival's, facing the ring, in the idle.
    player.root.position.set(-3.2, 0, CFG.rimZ + 3);
    player.root.rotation.y = Math.atan2(rim.x - -3.2, rim.z - (CFG.rimZ + 3));
    player.root.rotation.z = 0; player.root.rotationQuaternion = null;
    playClip(SPORT_CLIP.idle, { loop: true });
    // The camera follows the rival for this stretch, so the rival IS the hero
    // on screen. FrameGuard watches heroRef and would otherwise spend the whole
    // rival round reporting the player — who is standing off-camera by design —
    // as lost, and after two strikes would recenter the camera off the rival
    // mid-dunk. Point the guard at whoever the camera is actually following.
    ctx.heroRef.current = rival.root;
    ctx.setHud({ hint: 'RIVAL ROUND', judgeReveal: null });
    for (let i = 0; i < DUNKS_PER_ROUND; i++) {
      ctx.camDirector.snapTo(rival.root.position, rim);
      // THE RIVAL'S CARD IS ROLLED BEFORE THE JUMP (2026-09-13, owner: "we need the ai's animations to look
      // good too during the dunk contest"). It used to be rolled AFTER the hop, which meant the body could
      // not perform the dunk it was about to be scored for: every rival attempt played dunkLaunchPower ->
      // dunkScoreHang -> celebrate, the IDENTICAL animation whether it scored a 48 or blew it. The player
      // has had finish variety since M111 — windmill, tomahawk, hang, blown, picked by how well the slam was
      // timed — and the rival simply did not, so the contest looked like a person competing against a loop.
      // Rolling first lets the rival run the SAME pickAerialFinish vocabulary off its own execution score.
      // THE RIVAL FEELS THE CONTEST NOW. These were three fixed random ranges: identical on the first dunk
      // and the last, identical twenty up and twenty down. It never went for one, never played it safe and
      // never choked — most of what a dunk contest is to watch. `rivalNerve` moves reach and risk TOGETHER,
      // so falling behind is never strictly better than leading.
      const nerve = rivalNerve({
        deficit: rivalTotal - playerTotal,
        isFinalRound: round === TOTAL_ROUNDS,
        attemptsLeft: DUNKS_PER_ROUND - i + (TOTAL_ROUNDS - round) * DUNKS_PER_ROUND,
        // P8: the standard the player is setting tonight. A rival level on points against a player posting 46s used to
        // feel nothing at all — he was level, so he played his neutral band and got outscored on every exchange.
        playerPace: playerPace(),
      });
      const rExecBand = rivalExecution(nerve);
      // THE OPPONENT'S OWN TEMPERAMENT, on top of the situation. `reach` and `risk` move together across the
      // whole roster (DunkRivals holds the same invariant RivalNerve does), so a showman who goes for more
      // also blows more -- otherwise a personality is just a difficulty increase with a name on it, and
      // drawing the steady one becomes a punishment.
      const rivalBlew = Math.random() < Math.min(0.85, nerve.blownChance * foe.risk);
      const rDiff = rivalBlew ? 0.4 : (nerve.diffMin + Math.random() * (nerve.diffMax - nerve.diffMin)) * foe.reach;
      const rExec = rivalBlew ? 0 : rExecBand.min + Math.random() * (rExecBand.max - rExecBand.min);
      const rStyle = rivalBlew ? 0.5 : 2.2 + Math.random() * 3.2;
      if (nerve.label) console.info(`[DUNK-RIVAL] ${nerve.label} (deficit ${rivalTotal - playerTotal})`);
      // exec runs 3.4..6.8 on a made dunk; map it onto the same 0..1 accuracy the player's timing produces
      // map onto the same 0..1 accuracy the player's timing produces — off the BAND that was actually
      // rolled, not the old hardcoded 3.4..6.8, or a reaching rival reads as a clean one
      const rAcc = rivalBlew ? 0
        : Math.max(0, Math.min(1, (rExec - rExecBand.min) / Math.max(0.1, rExecBand.max - rExecBand.min)));
      const rAerial = pickAerialFinish(!rivalBlew, rAcc);

      const from = rival.root.position.clone();
      // Soft-OPEN #3 (fel-full-app-50's measurement): the rival spawns at yaw 0 — facing the CAMERA — and flew its whole
      // hop backwards (the rim sits at −139° from the bench spot); its 0.35 s launch clip then chained to idle IN THE AIR
      // (219 of 288 airborne frames in idle_stand). Face the rim for the hop; launch → held hang until the verdict clip.
      rival.root.rotation.y = Math.atan2(rim.x - from.x, rim.z - from.z);

      // THE RUN-UP. The rival used to launch from a standstill at the bench and slide to the rim with the
      // launch clip playing over the translation — the body was never running, so the approach read as a
      // dolly rather than an athlete. It now covers the first third of the gap on the shared run loop and
      // gathers where the hop begins, which is the same shape the player's runway has.
      const gather = from.add(new Vector3(rim.x - from.x, 0, rim.z - from.z).scale(0.34));
      rivalClip(SPORT_CLIP.moveLoop, { loop: true });
      await new Promise<void>((res) => {
        const r0 = performance.now();
        const obs = ctx.scene.onBeforeRenderObservable.add(() => {
          const k = Math.min(1, (performance.now() - r0) / RIVAL_RUNUP_MS);
          rival.root.position.x = from.x + (gather.x - from.x) * k;
          rival.root.position.z = from.z + (gather.z - from.z) * k;
          if (k >= 1) { ctx.scene.onBeforeRenderObservable.remove(obs); res(); }
        });
      });
      if (phase !== 'rivalTurn') return;
      const liftOff = rival.root.position.clone();
      // The hang is paced to span the rest of the hop (+150 ms so the verdict clip supersedes it, never a held pose): measured
      // at speed 1 it ran out ~130 ms before the landing and the rival flew those frames with no clip at all.
      const hopLeft = RIVAL_HOP_MS / 1000 - (rival.animator.durationOf(SPORT_CLIP.dunkLaunchPower) ?? 0.35) + 0.15;
      // MOCAP DUNKS (2026-09-18): the finish's FLUSH key (~0.53 of the captured tomahawk / windmill) lands at the TOP of the hop
      // (k 0.5), the clip's end holds the flush pose to the landing — spread across the whole rest of the hop it was still cocked
      // back on the way down (measured: the ball let go at 1.8 m on the fallback beat, frames showing the hand at the hip)
      const aerialDur = rival.animator.durationOf(rAerial) ?? hopLeft;
      const launchDur = rival.animator.durationOf(SPORT_CLIP.dunkLaunchPower) ?? 0.35;
      const hangRate = Math.max(0.5, Math.min(1.5, (aerialDur * RIVAL_FINISH_KEY_01) / Math.max(0.15, (RIVAL_HOP_MS / 1000) * 0.5 - launchDur)));
      // launch -> the finish this attempt actually earned, rate-matched to span the rest of the hop so the
      // body is never clip-less in the air (the measured failure this pacing exists for: the hang ran out
      // ~130 ms early and the rival flew those frames with no clip at all)
      // MOCAP DUNKS (2026-09-18, owner: "animate the rivals dunk to be something impressive … have the ball go through the rim"):
      // the rival dunks WITH the ball. It rides his right palm up the hop (the captured tomahawk / windmill carries it over the
      // iron) and at the top it FLUSHES through the ring on the player's own RimFlush — or clanks off the iron when he blows it.
      // He used to hop empty-handed under the launch clip while the ball sat in the player's hand at the bench.
      const rivalBall = !!ball && !lob.live;
      let rivalFlush: FlushState | null = null, rivalReleased = false, rivalLastMs = performance.now();
      if (rivalBall) { ballSim.stop(); looseBall = false; flush = null; attachBallToHand(ball, rival.skeleton, 'RightHand'); console.info('[DUNK-RIVAL] ball in hand'); }
      rivalClip(SPORT_CLIP.dunkLaunchPower, { onEnd: () => rivalClip(rAerial, { speedRatio: hangRate, onEnd: () => {} }) });
      const hopT0 = performance.now();
      await new Promise<void>((res) => {
        const obs = ctx.scene.onBeforeRenderObservable.add(() => {
          const nowMs = performance.now(); const rdt = Math.min(0.05, (nowMs - rivalLastMs) / 1000); rivalLastMs = nowMs;
          const k = Math.min(1, (nowMs - hopT0) / RIVAL_HOP_MS);
          // the hop ARRIVES at the ring by the flush beat and hangs there (it used to reach the rim only at the landing, so the
          // flush left the palm mid-hop, 1.6 m wide of the iron — measured)
          const ku = Math.min(1, k / RIVAL_AT_RIM_K);
          rival.root.position.x = liftOff.x + (rim.x - liftOff.x) * ku;
          rival.root.position.z = liftOff.z + (rim.z + 0.7 - liftOff.z) * ku;
          rival.root.position.y = Math.sin(k * Math.PI) * 1.2;
          ball.computeWorldMatrix(true);
          const bpNow = ball.getAbsolutePosition();
          if (rivalBall && !rivalReleased && k >= 0.25 && (bpNow.y >= rim.y - 0.06 || k >= RIVAL_FLUSH_K_MAX)) {
            rivalReleased = true;
            const at = clearOfIron(bpNow, rim, RIM_RADIUS, ballSim.radius);
            releaseBall(ball); ball.position.set(at.x, at.y, at.z);
            if (rivalBlew) { ballSim.launch(ball.position.clone(), clankOffRim(ball, rim)); looseBall = true; hoopJuice?.graze(); SoundKit.play('rattle', { volume: 0.3 }); console.info(`[DUNK-RIVAL] clank off the iron at k ${k.toFixed(2)} from (${at.x.toFixed(2)}, ${at.y.toFixed(2)}, ${at.z.toFixed(2)})`); }
            else {
              rivalFlush = startFlush(ball.position, rim, RIM_RADIUS, ballSim.radius, NET_THROW_MIN + (NET_THROW_MAX - NET_THROW_MIN) * rAcc);
              hoopJuice?.punch(); SoundKit.play('swish', { volume: 0.5 }); EffectsKit.burst(ctx.scene, rim, 'net');
              console.info(`[DUNK-RIVAL] flush from (${at.x.toFixed(2)}, ${at.y.toFixed(2)}, ${at.z.toFixed(2)}) at k ${k.toFixed(2)}`);
            }
          }
          if (rivalFlush && rivalFlush.phase !== 'free') {
            const st = stepFlush(rivalFlush, rim, RIM_RADIUS, ballSim.radius, rdt);
            ball.position.set(st.pos.x, st.pos.y, st.pos.z);
            if (st.phase === 'free') { ballSim.launch(ball.position.clone(), new Vector3(st.vel.x, st.vel.y, st.vel.z)); looseBall = true; console.info('[DUNK-RIVAL] through the net'); }
          }
          if (k >= 1 && (!rivalFlush || rivalFlush.phase === 'free')) { ctx.scene.onBeforeRenderObservable.remove(obs); res(); }
          else if (k >= 1 && nowMs - hopT0 > RIVAL_HOP_MS + 1500) { ctx.scene.onBeforeRenderObservable.remove(obs); res(); }   // a flush that never frees still ends the hop
        });
      });
      if (phase !== 'rivalTurn') return;   // soft-OPEN #3: the watchdog advanced the contest under this hop — its end owns the rest
      // The rival is a CONTENDER, not a wall. These inputs used to average a ~43 card, near the top of what
      // a good player can produce, on every single attempt — so the contest was decided before the player
      // took their second dunk. A real field is beatable and streaky: this averages high-30s, swings, and
      // BLOWS one now and then. (The roll itself now happens before the jump — see above.)
      const rScores = judgeDunk(rDiff, rExec, rStyle);
      const rTotal = rScores.reduce((s, j) => s + j.score, 0);
      rivalTotal += rTotal;
      SoundKit.play(rivalBlew ? 'miss' : 'crowdGroan', { volume: 0.35 });
      // the landing reads the CARD, exactly as the player's pickLanding does — a rival that just posted an
      // eruption celebrates like one, and one that blew it does not
      rivalClip(rivalBlew ? SPORT_CLIP.dunkFinishBlown : pickLanding(rTotal));   // soft-OPEN #3: the verdict clip plays out, then idle
      ctx.setHud({ rivalScore: rivalTotal }); flash(ctx, rivalBlew ? `RIVAL BLOWS IT — ${rTotal}` : `RIVAL SCORES ${rTotal}`);
      // The verdict plays out WHERE HE LANDED. He used to be teleported to the bench spot for this beat — which is
      // behind the under-basket cut's lens — so the celebration was never seen and FrameGuard logged the rival round
      // as a lost hero on every dunk (FINISH-RELEASE gauntlet: `hero off-screen 2x (BEHIND camera)` on /play/dunk
      // and /try). Back to the bench only as the next run-up starts, or as the turn hands back to the player.
      rival.root.position.y = 0;
      await new Promise((r) => setTimeout(r, 1200));
      if (phase !== 'rivalTurn') return;   // soft-OPEN #3: same — never a second advance from this loop
      rival.root.position.set(3.2, 0, CFG.rimZ + 3);
      rival.root.rotation.y = 0;   // back at the bench spot, facing the court as it spawned
    }
    clearBanner(ctx);
    await advanceAfterRivalTurn(ctx);
  }

  /** Round hand-off / contest end. Soft-OPEN #3: reached by rivalRound's own end AND by the rivalTurn watchdog (8 s) — the
   *  phase gate makes it run once, so round++ never double-fires and ctx.end (the guest claim modal, the resultSink) fires
   *  once per contest. The rival is left in the idle loop with any pending chain dead, whichever path got here. */
  async function advanceAfterRivalTurn(ctx: ModeContext): Promise<void> {
    if (phase !== 'rivalTurn' || ended) return;
    ctx.heroRef.current = player.root;          // the player is the hero again (on the watchdog path too)
    // …and the CAMERA comes back with him, as a cut. The rival's under-basket shot is a FIXED camera; the next-round path
    // re-snaps in resetForNextAttempt, but the contest-over path did not, so the night card opened on the rival's rim shot
    // aimed at a player standing behind its right shoulder — FrameGuard's intermittent "hero off-screen (off RIGHT)" on the
    // production gauntlet (rc4, rc5: identical camera 2.08, 1.49, -4.77 each time).
    rivalCamCut = false;
    ctx.camDirector.mode = 'follow';
    ctx.camDirector.snapTo(player.root.position, rim);
    rivalClip(SPORT_CLIP.idle, { loop: true });
    if (round < TOTAL_ROUNDS) {
      round++;
      ctx.setHud({ round: `${round}/${TOTAL_ROUNDS}` }); flash(ctx, `ROUND ${round}`, 1400);
      resetForNextAttempt(ctx);
      return;
    }
    setPhase('contestOver');
    SoundKit.play('whistle');
    const won = cardWon({ playerTotal, rivalTotal });
    if (won) { SoundKit.play('crowdCheer'); EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(0, 2, 0)), 'confetti'); }
    // the card rides out with the result, which is what the arena submit forwards
    const stats = { rivalTotal, rounds: TOTAL_ROUNDS, makes, misses, bestChain, night };
    // the card goes out on `detail`, not `stats` — stats is numbers-only because the reward layer reads it
    const detail = { card: forWire(card) };
    // TRY-ONBOARD G1 (BUG-001). The card is finite by design — 2 rounds x 2 dunks
    // against the rival — and that part is right: it is the contest. What was wrong
    // is what the card DID. `ctx.end` parks the harness in 'ended', which stops
    // update() and drops every input on the floor, and the only answer a host has to
    // that is to throw the whole mode away and boot a new one. So a guest's night
    // died on a modal, and the way back was a cold reload of the venue, the rig, the
    // clips and the 3-2-1 — for a game whose entire pitch is "go again".
    // On a continuous night the card REPORTS (the host still gets the same
    // SessionResult, so the run is banked and the claim can be offered) and the mode
    // keeps the stage: any button starts night N+1 as a soft reset in place.
    if (ctx.continuous) {
      ctx.card(won ? 'CONTEST_WON' : 'CONTEST_LOST', playerTotal, stats, detail);
      showNightCard(ctx, won);
      return;
    }
    ended = true;
    ctx.end(won ? 'CONTEST_WON' : 'CONTEST_LOST', playerTotal, stats, detail);
  }

  /** The night's scoreboard, held on a live shot until the player says GO AGAIN. */
  function showNightCard(ctx: ModeContext, won: boolean): void {
    clearBanner(ctx);
    ctx.setHud({
      nightCard: won ? 'WON' : 'OVER', nightNum: night,
      rivalName: foe.name,
      nightMakes: makes, nightMisses: misses, nightBest: bestChain,
      // the Passion Pipeline credential -- engagement, stated as engagement, never a rating and never a gate
      walkOut: walkCue ? musicCredential(walkOut, StudioLibrary.list().length).label : '',
      judgeReveal: null, hint: '', charge: 0, slamPulse: false, need: 0,
    });
    // P9 (2026-09-16): THE NIGHT SAYS WHAT IT WAS. The contest used to end on a number and a WON / OVER, and a player
    // who lost by four had no way to know whether it went on the beat, on ambition, or on the two they threw at the
    // iron early — which is the one thing that decides whether the next night goes better. The panel already publishes
    // the three numbers per attempt; the card carries them now, and the report names ONE thing to change.
    const report = nightReport(card);
    console.info(`[DUNK-NIGHT] ${report.headline} · ${report.lines.join(' · ')} · ${report.advice}`);
    setTimeout(() => { if (phase === 'contestOver') flash(ctx, `${report.headline} — ${report.advice}`); }, 1400);
  }

  /** GO AGAIN — the whole contest resets INSIDE the mode. Nothing is disposed and
   *  nothing is re-loaded: the venue, the rig, the clips, the ball and the camera are
   *  the ones already on screen, so the next night starts on the very next frame. */
  function goAgain(ctx: ModeContext): void {
    if (phase !== 'contestOver') return;
    // the ledger owns what survives a night (lib/babylon/core/ContinuousNight.ts):
    // the night number, and nothing else a contest scored
    const led: NightState = nextNight({ night, round, dunkInRound, playerTotal, rivalTotal, makes, misses, bestChain });
    ({ night, round, dunkInRound, playerTotal, rivalTotal, makes, misses, bestChain } = led);
    hype = 0; chain = 0;
    ended = false; finishing = false;
    usedCombos.clear(); momentum.reset(); flight.reset();
    lastScores = []; revealed = [];
    // the run's own held state — a button or a stick still down when the card came up
    stickX = 0; stickY = 0; lookX = 0; lookY = 0; heldDpad = null; dpadPick = null; aHeld = false;
    // the rival goes back to the bench spot he spawned on, in the idle loop
    rival.root.position.set(3.2, 0, CFG.rimZ + 3);
    rival.root.rotation.y = 0;
    rivalClipToken++; rivalClip(SPORT_CLIP.idle, { loop: true });
    ctx.heroRef.current = player.root;
    ctx.camDirector.suspended = false;
    ctx.setHud({
      nightCard: null, nightNum: night, nightMakes: null, nightMisses: null, nightBest: null,
      round: `1/${TOTAL_ROUNDS}`, score: 0, rivalScore: 0, hype: 0, chain: 0,
    });
    crowd.onScore(0);
    SoundKit.play('uiTick', { pitch: 1.4 });
    resetForNextAttempt(ctx);           // -> phase 'approach', the runway HUD, a fresh prop
    flash(ctx, `NIGHT ${night}`, 1400);
    // who walked in tonight — phrased by the module so no surface writes its own version of a name
    setTimeout(() => flash(ctx, rivalIntro(foe), 1600), 1500);
  }

  return def;
})();

// HUD CONTRACT — same as M52 (round, dunkNum, score, rivalScore, style, prop,
// hype, charge, slamPulse, hint, banner, judgeReveal, chain) plus NEW:
//   need: number — 0 normally; on final-round attempts, the judge total this
//     dunk should hit to hold off the rival's pace (bezel: "NEED N" chip)
