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

import { Color3, Color4, MeshBuilder, Vector3 } from '@babylonjs/core';
import { dressBall } from '../visual/meshyProps';
import type { AbstractMesh, AnimationGroup, Camera, Observer, ParticleSystem, Scene } from '@babylonjs/core';
import { type SpawnedCharacter } from '../core/CharacterLibrary';
import { CharacterPipeline } from '../core/characterPipeline';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { BallSim } from '../core/BallPhysics';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { MOCAP_DUNK, DUNK_FINISH_VARIETY } from '../nexus/dressingFlags';
import { attachBallToHand, releaseBall, runEastbayPath, flushThroughRim, clankOffRim } from '../anim/ballRig';
import { EASTBAY_TIMING } from '../anim/authored/timing';
import { armChain, reachArm, type ArmChain } from '../anim/HandIK';   // A+ P8 H1: the hang wrist reach
import type { PlayOpts } from '../anim/CharacterAnimator';
import { DunkReplayRecorder } from '../scene/DunkReplayCam';
import { SoundKit } from '../audio/SoundKit';
import { VenueKit } from '../visual/VenueKit';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';  // M74
import { EffectsKit } from '../visual/EffectsKit';
import { HoopJuice } from '../visual/HoopJuice';
import { applyOceanCourt } from '../visual/CourtSurface';
import { applyVeniceDunkLookPass } from '../visual/veniceSurroundVisibility';
import { DUNK_CONFIG as CFG } from './modeConfigs';
import { DunkFlight } from '../core/DunkSystem';
import { approachAngle, approachBonus, takeoffFor } from '../core/DunkApproach';
import {
  judgeDunk, ScoreReveal, CrowdEnergy, REVEAL_DURATION_SEC, BAND_TOTAL, JUDGE_COUNT,
  PERFECT_TOTAL, perJudgeAvg, type JudgeScore,
} from '../core/JudgePanel';
import { MomentumBus } from '../core/MomentumBus';

type Phase = 'approach' | 'charge' | 'cinematic' | 'resolve' | 'judging' | 'rivalTurn' | 'contestOver';
/** Venice DualShock pad (2026-09-05): a miss is one beat, not the full judged reveal — the next run-up follows at once. */
const MISS_BEAT_MS = 1400;
/** HOLD = RUN: the hold ramps the athlete toward the rim at up to the max run (7 m/s) and launches at the gather line. */
const HOLD_RUN_MAX = 7, HOLD_RUN_RAMP = 6, AIR_LEAN_RAD = 0.32, AIR_DRIFT = 0.8;
// Dunk play tip (2026-09-07): a full stick runs at APPROACH_SPEED (the hold-run ramps past it to HOLD_RUN_MAX); the
// flight eases the facing onto the rim at FACE_RIM_RATE per second.
const APPROACH_SPEED = 6, FACE_RIM_RATE = 6;
/** The facing slews to the travel direction at this rate (rad/s): a stick flick reads as a turn, not a snap (~0.3 s for 180°). */
const TURN_RATE = 10;
/** With no auto-drift a pull-back backs off the runway; it stops this far behind the start line. */
const RETREAT_Z = CFG.startZ + 1.5;
/** Keep the Euler yaw in (−π, π] — the slews would otherwise accumulate turns (measured 522° after two strafes). */
const wrapYaw = (y: number): number => Math.atan2(Math.sin(y), Math.cos(y));
const STYLES = ['power', 'flashy', 'sig'] as const;
type Style = (typeof STYLES)[number];
const PROPS = ['none', 'alleyoop', 'obstacle'] as const;
type Prop = (typeof PROPS)[number];

const STYLE_CLIP: Record<Style, string> = {
  // POWER launch plays the user's real motion capture when MOCAP_DUNK is on
  // (feature-retargeted 'dunk_mocap'); flips back to the authored launch clip
  // instantly via NEXT_PUBLIC_MOCAP_DUNK=false. Flashy/sig are untouched.
  power: MOCAP_DUNK ? 'dunk_mocap' : SPORT_CLIP.dunkLaunchPower,
  flashy: SPORT_CLIP.dunkLaunchFlashy, sig: SPORT_CLIP.dunkLaunchSig,
};
const STYLE_LABEL: Record<Style, string> = { power: 'POWER', flashy: 'FLASHY', sig: 'SIGNATURE' };
const PROP_LABEL: Record<Prop, string> = { none: 'NO PROP', alleyoop: 'ALLEY-OOP', obstacle: 'OBSTACLE' };
const STYLE_TIER: Record<Style, number> = { power: 3, flashy: 5.5, sig: 8 };
const PROP_BONUS: Record<Prop, number> = { none: 0, alleyoop: 2, obstacle: 2 };

const DUNKS_PER_ROUND = 2;
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
/** How often the rival blows a dunk. Real contests are full of missed attempts. */
const RIVAL_BLOWN_CHANCE = 0.18;
// ── A+ P8 athlete hands (PM brief VENICE-DUNK-A-PLUS-P8, 2026-09-07) ─────────────────────────────────────────────
/** H1: from the hang rise the ball hand reaches for the rim — weight eased 0 → HAND_IK_MAX over HAND_IK_LAG_SEC of CLIP time
 *  (the hang slow-mo stretches the lag with the flight), held through a make's flush, let go at CONTACT / the clank / a clip. */
const HAND_IK_MAX = 0.6, HAND_IK_LAG_SEC = 0.12, HAND_IK_RIM_UP = 0.08;
/** H5: the root's fall from the release height (the arc's own rate at the release, ~2.6 m/s) — feet-down is where the land clip plays.
 *  Measured before: the root froze at the resolve height (~0.23 m) and the idle loop played there through the judging. */
const FALL_SPEED = 2.6;

// Judges + staged reveal + crowd energy now live in the SHARED JudgePanel
// (lib/babylon/core/JudgePanel.ts) — DunkDuelMode drinks from the same well.

const BUDGET_SEC: Record<Phase, number> = {
  approach: 30, charge: 5, cinematic: 4, resolve: 3, judging: 6, rivalTurn: 8, contestOver: 999,
};

export const DunkMode: ModeDefinition = (() => {
  let player: SpawnedCharacter, rival: SpawnedCharacter, teammate: SpawnedCharacter | null = null;
  let dunkVenue: VenueHandle | null = null;  // M74
  let obstacle: AbstractMesh | null = null;
  let ball: AbstractMesh, ballSim: BallSim, replay: DunkReplayRecorder;
  let trail: ParticleSystem | null = null;   // juice soft #5
  let fovCam: Camera | null = null, fovBase = 0, fovT = 0, fovOn = false;   // juice soft #4
  let settleLatch = false;                    // juice soft #3
  let settleArmed = false, settleArmAt = 0;   // A+ P4: the settle waits for feet-down, not the flush frame
  let hoopJuice: HoopJuice | null = null;     // juice LOOK: rim spring, net squash, hoop flash on the make
  let phase: Phase = 'approach';
  let phaseSec = 0;
  let style: Style = 'power';
  let prop: Prop = 'none';
  let charge = 0, clipTime = 0, qteHit = false, qteWindowOpen = false, qteAccuracy = 0;
  let sinceRelease = 0, releasePos = new Vector3();
  let styleTaps = 0;                          // mid-air showboat taps (max 2)
  let aHeld = false, hangSec = 0;             // rim-hang tracking
  let runUpPeak = 0;                          // fastest approach speed (m/s) this attempt
  let launchSpeed01 = 0;                      // run-up speed as a 0..1 budget input
  let obstacleClipped = false;                // caught the prop mid-flight — the dunk is dead
  let toppling = false;                       // the prop goes over with you
  const usedCombos = new Set<string>();       // variety memory: "style_prop" combos thrown
  let round = 1, dunkInRound = 0;
  let playerTotal = 0, rivalTotal = 0, hype = 0, chain = 0;
  let makes = 0, misses = 0, bestChain = 0;   // PACK #3: the proof card's make/miss line
  let lastScores: JudgeScore[] = [];
  let finishing = false;
  let rimCamCut = false;                     // broadcast cut latch (per attempt)
  let hangSlowMoLatch = false;               // JuiceKit.slowMo once per attempt (hang only)
  let contactLatch = false;                  // contactPunch once per attempt (the make's flush frame)
  // ── A+ P8 athlete hands ──
  const arms: { Left: ArmChain | null; Right: ArmChain | null } = { Left: null, Right: null };   // H1: built once at spawn
  let handIkT = 0;                            // H1: 0..1 ease of the wrist reach
  let handIkObs: Observer<Scene> | null = null, ikScene: Scene | null = null;
  const handIkTarget = new Vector3(), handIkPole = new Vector3();
  let clipToken = 0;                          // H5: a superseded clip's onEnd chain is dead (Babylon fires it on stop() too)
  let airHeld = false;                        // H5: an aerial clip (finish / trick) holds its last frame until feet-down
  let landingClip: string = SPORT_CLIP.dunkLandCrouch;   // H5: the land clip feet-down plays (a make picks it from the score)
  let aerialClip: string = SPORT_CLIP.dunkScoreHang;     // the finish chosen at resolve (the replay re-plays it)
  let dropToFloor = false;                    // H5: the root falls to the floor (a miss from the release; a make after the replay)
  let replaying = false, replayAir = false, replayAerial = false, replayAirSec = 0, replayAerialAt = 0, replayPrevY = 0;   // H5: replay re-drive
  let launchRealMs = 0, resolveRealMs = 0, clipTimeAtResolve = 0;   // the live flight's real timing, for the replay's clip rate
  const rim = new Vector3(0, CFG.rimHeight, CFG.rimZ);
  const ebState = { inLeftHand: false };
  let stickX = 0, stickY = 0;
  let lookX = 0, lookY = 0, lookSeen = false; // R stick → the director's look orbit (Dunk play tip 2026-09-07)
  let holdRunSpeed = 0, airLean = 0;          // pad: hold-run speed this attempt; smoothed air lean from the stick
  const flight = new DunkFlight();               // Phase 6: trick-input flight
  const reveal = new ScoreReveal();              // Phase 7: staged judge reveal
  const crowd = new CrowdEnergy();               // Phase 7: building voice
  let revealed: JudgeScore[] = [];               // cards shown so far
  const momentum = new MomentumBus();            // Phase 6: shared Game-Breaker
  let trickLabels: string[] = [];                // this attempt's thrown tricks

  function setPhase(p: Phase): void { phase = p; phaseSec = 0; }
  const obstacleClearHeight = 1.35;

  // ── Dunk play tip (2026-09-07): camera-relative stick, facing from velocity ──
  /** The L stick as a world velocity: up = the camera's flat forward, right = its flat right, magnitude = speed. */
  function stickVel(ctx: ModeContext): Vector3 {
    const mag = Math.hypot(stickX, stickY);
    if (mag < 0.08) return Vector3.Zero();
    const k = (mag > 1 ? 1 / mag : 1) * APPROACH_SPEED;   // a keyboard diagonal is (1, 1) — cap the magnitude at one stick
    const f = ctx.camDirector.forwardFlat(), r = ctx.camDirector.rightFlat();
    return new Vector3((r.x * stickX - f.x * stickY) * k, 0, (r.z * stickX - f.z * stickY) * k);   // up is −y on every source
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
    obstacle?.dispose(); obstacle = null;
    teammate?.dispose(); teammate = null;
  }

  async function setupProp(ctx: ModeContext): Promise<void> {
    clearProps();
    if (prop === 'obstacle') {
      obstacle = MeshBuilder.CreateBox('dunk_obstacle', { width: 1.1, height: obstacleClearHeight, depth: 0.5 }, ctx.scene);
      obstacle.position.set(0, obstacleClearHeight / 2, CFG.rimZ + 1.4);
    }
    if (prop === 'alleyoop') {
      teammate = await CharacterPipeline.spawnNpc(ctx.scene, CFG.heroUrl, {
        position: new Vector3(-3.4, 0, CFG.rimZ + 1.6), tint: '#22d3ee', startClip: SPORT_CLIP.teammateIdle,
      });
      neverBindPose(teammate.animator, SPORT_CLIP.teammateIdle);
      installSafePlay(teammate.animator, 'dunk-teammate');
    }
  }

  const def: ModeDefinition = {
    modeId: 'dunk', mood: 'goldenHour', camPreset: 'contest',  // Phase 8: cinematic, not broadcast

    async load(ctx: ModeContext) {
      // M74: try Nexus venue first; fallback to VenueKit if no spec
      dunkVenue = mountVenue(ctx, 'basketball_dunk', { keepGameplayCamera: true, location: ctx.location });
      if (!dunkVenue) { VenueKit.buildCourt(ctx.scene); applyOceanCourt(ctx.scene, 'venice'); }
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
      ctx.groundLock?.track(player.root, player.skeleton);
      // A+ P8 H1: the arm chains once (the eastbay's left hand carries the ball after the hand-off); the reach is applied
      // AFTER the clips evaluate, on top of the frame's pose — the slot the dribble's HandIK and foot planting use
      arms.Left = armChain(player.skeleton, 'Left'); arms.Right = armChain(player.skeleton, 'Right');
      if (!arms.Right) console.warn('[FEL-DUNK] no Right arm chain on this rig — the hang wrist reach is off');
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
      void dressBall(ball, 'basketball');   // Meshy ball skin rides the physics sphere (visual only)
      ballSim = new BallSim(ball, 0.12);
      attachBallToHand(ball, player.skeleton, 'RightHand');
      replay = new DunkReplayRecorder(ctx.scene, player.root, ball, ctx.camera as never);

      ctx.camDirector.snapTo(player.root.position, rim);
      ctx.heroRef.current = player.root;
      ctx.objectiveRef.current = rim;
      SoundKit.startAmbient('stadium');
      EffectsKit.ambient(ctx.scene, 'venice');
      trail = EffectsKit.ballTrail(ctx.scene, ball); setTrail('soft');
      hoopJuice?.dispose(); hoopJuice = new HoopJuice(ctx.scene, rim);
      if (process.env.NODE_ENV === 'development') (window as unknown as { __FEL_DEV__?: { hoopJuiceUsed?: unknown } }).__FEL_DEV__!.hoopJuiceUsed = hoopJuice.used;
      // Venice LOOK: KEEP/HIDE, palm tip ~10m, golden-haze (no GLB edits).
      // Court locations (docs/SPEC-COURT-LOCATIONS.md): the Venice look (golden sky, surround palms) is Venice's own —
      // under any other location the location's environment stands, so the pass steps aside.
      if (!ctx.location || ctx.location === 'venice') await applyVeniceDunkLookPass(ctx.scene);

      round = 1; dunkInRound = 0; playerTotal = 0; rivalTotal = 0; hype = 0; chain = 0; finishing = false; makes = 0; misses = 0; bestChain = 0;
      style = 'power'; prop = 'none'; rimCamCut = false; hangSlowMoLatch = false; contactLatch = false;
      styleTaps = 0; hangSec = 0; aHeld = false; usedCombos.clear(); momentum.reset(); flight.reset();
      runUpPeak = 0; launchSpeed01 = 0; obstacleClipped = false; toppling = false;
      setPhase('approach');
      ctx.setHud({
        round: `${round}/${TOTAL_ROUNDS}`, dunkNum: `${dunkInRound + 1}/${DUNKS_PER_ROUND}`,
        score: playerTotal, rivalScore: rivalTotal, style: STYLE_LABEL[style], prop: PROP_LABEL[prop], hype: 0, chain: 0,
        hint: 'Pick your PROP (X / d-pad) · STYLE to cycle · RUN-UP SPEED buys your air · HOLD to run — then tap jump',
      });
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }
      if (e.t === 'stick' && e.side === 'R') { lookX = e.x; lookY = e.y; if (!lookSeen && (Math.abs(e.x) > 0.12 || Math.abs(e.y) > 0.12)) { lookSeen = true; console.info('[LOOK] R stick live'); } }   // LOOK: read at last (it was emitted and dropped)

      if (e.t === 'button' && e.btn === 'B' && e.pressed && phase === 'approach') {
        style = STYLES[(STYLES.indexOf(style) + 1) % STYLES.length];
        ctx.setHud({ style: STYLE_LABEL[style] });
        SoundKit.play('uiTick');
      }
      // d-pad cycles PROP during approach (up=none, right=alley-oop,
      // down=obstacle); the SAME d-pad, held during the mid-air cinematic
      // phase, arms a TRICK COMBO instead — two different jobs on two
      // different phases, never both at once.
      // Pad: X cycles the prop the way the d-pad picks it — one button, no dead bind on the diamond.
      if (e.t === 'button' && e.btn === 'X' && e.pressed && phase === 'approach') {
        prop = prop === 'none' ? 'alleyoop' : prop === 'alleyoop' ? 'obstacle' : 'none';
        ctx.setHud({ prop: PROP_LABEL[prop] });
        SoundKit.play('uiTick', { pitch: 1.3 });
        void setupProp(ctx);
      }
      // Keyboard hotfix (2026-09-07): the arrows are the L stick now (InputBus) — ArrowUp RUNS at the rim, it no longer
      // picks the prop; the pad's d-pad, the touch d-pad and X still do. The keyboard arrows keep arming the mid-air
      // trick direction below (flight.feedInput sees every d-pad event), so nothing on the keyboard is lost.
      if (e.t === 'dpad' && e.pressed && e.src !== 'key' && phase === 'approach') {
        prop = e.dir === 'up' ? 'none' : e.dir === 'right' ? 'alleyoop' : 'obstacle';
        ctx.setHud({ prop: PROP_LABEL[prop] });
        SoundKit.play('uiTick', { pitch: 1.3 });
        void setupProp(ctx);
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
      if (phase === 'cinematic' && !qteWindowOpen && clipTime >= EASTBAY_TIMING.rise) {
        const trick = flight.feedInput(e);
        if (!trick && flight.rejectedForAir) {
          // the run-up didn't buy the air that trick needs — SAY so, or it
          // reads as a dropped input
          flight.rejectedForAir = false;
          SoundKit.play('uiTick', { pitch: 0.6, volume: 0.35 });
          ctx.setHud({ banner: 'NOT ENOUGH AIR — come in faster' });
          setTimeout(() => ctx.setHud({ banner: '' }), 900);
        }
        if (trick) {
          trickLabels.push(trick.label);
          playAir(trick.clip, 1.05);   // A+ P8 H5: a trick that ends in the air holds its last frame (it used to fall to idle mid-flight)
          hype = Math.min(100, hype + 6);
          SoundKit.play('whoosh', { pitch: 1.1 + trick.difficulty * 0.08, volume: 0.45 });
          SoundKit.play('crowdCheer', { volume: 0.3 + trick.difficulty * 0.05 });
          EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(0, 1.8, 0)), 'sparks');
          ctx.setHud({ banner: trickLabels.length > 1 ? `COMBO: ${trickLabels.join(' → ')}!` : `${trick.label}!` });
          ctx.camDirector.pulse(trickLabels.length > 1 ? 0.7 : 0.45, 0.5);
          setTimeout(() => ctx.setHud({ banner: '' }), 700);
        } else if (e.t === 'button' && e.btn === 'B' && e.pressed && styleTaps < 2) {
          // STYLE TAPS — mid-air showboating before the SLAM window opens:
          // +1.2 difficulty each, SLAM window shrinks 25% per tap (max 2)
          styleTaps++;
          SoundKit.play('whoosh', { pitch: 1.6, volume: 0.35 });
          ctx.feel?.impact?.(0.1);
          EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(0, 1.4, 0)), 'sparks');
          ctx.setHud({ banner: `+STYLE TAP x${styleTaps}` });
          setTimeout(() => ctx.setHud({ banner: '' }), 450);
        }
      }

      if (e.t === 'trigger' && e.side === 'R') {
        if (phase === 'approach' && e.value > 0.02) {
          // Venice DualShock pad: HOLD = RUN. The hold drives the runway toward the rim (stick steers), the jump
          // loads while you run, and the launch fires at the gather line — or on release, from wherever you are.
          setPhase('charge');
          holdRunSpeed = Math.max(2, runUpPeak);
          playClip(SPORT_CLIP.moveLoop, { loop: true });
          ctx.setHud({ hint: 'HOLD — running to the rim · steer with the stick · release early to jump from here' });
        }
        if (phase === 'charge') {
          charge = Math.max(charge, e.value);
          ctx.setHud({ charge: Math.round(charge * 100) });
          if (e.value === 0) launchDunk(ctx);
        }
      }

      if (e.t === 'button' && e.btn === 'A' && e.pressed && qteWindowOpen) {
        qteHit = true;
        const center = EASTBAY_TIMING.extend;
        const window = CFG.qteWindowSec * (1 - styleTaps * 0.25) * flight.slamWindowScale;
        qteAccuracy = Math.max(0, 1 - Math.abs(clipTime - center) / (window / 2));
      }
      // RIM HANG — hold SLAM through the flush to hang on the iron
      if (e.t === 'button' && e.btn === 'A') aHeld = e.pressed;
    },

    update(ctx: ModeContext, dt: number) {
      fovTick(dt); settleTick(ctx);
      // A+ P5: the fov pinch starts on the APPROACH — inside 3.6 m (horizontal) of the rim during the run, not at takeoff
      if ((phase === 'approach' || phase === 'charge') && !fovOn && Math.hypot(player.root.position.x - rim.x, player.root.position.z - rim.z) <= 3.6) fovGather(ctx);
      phaseSec += dt;
      watchdog(ctx);
      hype = Math.max(0, hype - dt * 1.5);       // slow decay between dunks

      // R stick: orbit / pitch on the RUNWAY (approach + charge run) — the flight's own framing (rimCamCut) and the
      // verdict never inherit it; a centred (or gated-off) stick springs the orbit back to the mode's composition.
      const lookOn = phase === 'approach' || phase === 'charge';
      ctx.camDirector.look(lookOn ? lookX : 0, lookOn ? lookY : 0, dt);
      // Dunk play tip (2026-09-07) — ROOT CAUSE of the "inverted stick": the hero NEVER yawed (rotation.y sat at π
      // while the velocity went wherever it went) and the loco was `(stickX·4, 0, −max(0,−stickY)·5 − 2)`: a
      // centred stick crawled him at the rim at 2 m/s in the IDLE clip (a slide), and stick-right pushed world +x —
      // which is screen-LEFT when the follow camera looks down −Z (Babylon is left-handed). Now the stick is
      // camera-relative (up = the camera's forward = the rim, right = screen right), its magnitude is the speed,
      // and the facing follows the velocity every approach / charge frame (the OneVOne / KarateEndless pattern).
      const vel = stickVel(ctx);
      if (phase === 'approach') {
        player.root.position.addInPlace(vel.scale(dt));
        player.root.position.z = Math.max(CFG.gatherZ, Math.min(RETREAT_Z, player.root.position.z));   // the runway: gather line … a step behind the start
        player.root.position.x = Math.max(-6, Math.min(6, player.root.position.x));
        faceVel(vel, dt);
        // THE RUN-UP IS PART OF THE DUNK. Peak approach speed feeds the air
        // budget at launch — a walk-up has less air, and less air means fewer
        // tricks fit before the slam window. Live 08's whole ramp, in one number.
        runUpPeak = Math.max(runUpPeak, Math.hypot(vel.x, vel.z));
        const moving = Math.hypot(vel.x, vel.z) > 0.5;
        playClip(moving ? SPORT_CLIP.moveLoop : SPORT_CLIP.idle, { loop: true });
        if (player.root.position.z <= CFG.gatherZ + 0.2) {
          ctx.setHud({
            hint: runUpPeak < 3.5
              ? 'HOLD to run — come in FASTER: the run-up buys your air'
              : 'HOLD to run — then tap jump',
          });
        }
      }

      if (phase === 'charge') {
        // HOLD = RUN (pad acceptance #2): ramp to the max run, curve toward the rim's x, let the stick steer,
        // and launch the moment the gather line is reached. runUpPeak keeps feeding the air budget.
        holdRunSpeed = Math.min(HOLD_RUN_MAX, holdRunSpeed + dt * HOLD_RUN_RAMP);
        // stick-right steers screen-right (the camera's right in world x), and the facing follows the run
        const steer = ctx.camDirector.rightFlat().x * stickX * 3 + Math.max(-2, Math.min(2, (rim.x - player.root.position.x) * 0.8));
        player.root.position.x = Math.max(-6, Math.min(6, player.root.position.x + steer * dt));
        player.root.position.z -= holdRunSpeed * dt;
        faceVel(new Vector3(steer, 0, -holdRunSpeed), dt);
        runUpPeak = Math.max(runUpPeak, Math.hypot(steer, holdRunSpeed));
        if (player.root.position.z <= CFG.gatherZ) { player.root.position.z = CFG.gatherZ; launchDunk(ctx); }
      }
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
        if (style === 'sig') runEastbayPath(ball, player.skeleton, clipTime, ebState);
        // A+ P8 H4: the ball stays parented to the ball hand through the hang — a lost parent that is not a release re-attaches
        if (!ball.parent && !ball.metadata?.felReleased) { attachBallToHand(ball, player.skeleton, ebState.inLeftHand ? 'LeftHand' : 'RightHand'); console.info('[HANDS] ball re-attached'); }
        const k = Math.min(1, clipTime / EASTBAY_TIMING.duration);
        player.root.position.y = Math.sin(k * Math.PI) * (1.05 + charge * 0.55);
        // the flight curves in to the rim on BOTH axes: an angled approach
        // used to fly straight and flush a metre wide of the iron
        player.root.position.z += (rim.z + 0.6 - player.root.position.z) * 1.6 * dt;
        player.root.position.x += (rim.x - player.root.position.x) * 1.6 * dt;
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
        if (prop === 'obstacle' && obstacle && !obstacleClipped) {
          const overProp = Math.abs(player.root.position.z - obstacle.position.z) < 0.45;
          // feet must genuinely clear the chair: 1.30m demands ~55% charge
          // (crossing happens near apex, y ≈ 0.975 × (1.05 + 0.55·charge))
          if (overProp && player.root.position.y < obstacleClearHeight - 0.05) {
            obstacleClipped = true; setTrail('off');   // juice soft #5: a clipped air kills the trail
            clipBlown(ctx);
          }
        }

        // BROADCAST RIM-CAM CUT: one hard cut to a baseline angle as the
        // rise crests, exactly like the wide→under-basket cut on TV. One
        // snapTo, latched; the normal follow resumes on resolve.
        if (!rimCamCut && clipTime >= EASTBAY_TIMING.extend * 0.55) {
          rimCamCut = true;
          const baseline = new Vector3(rim.x + 2.6, 0.4, rim.z - 1.2);
          ctx.camDirector.snapTo(baseline, player.root.position.add(new Vector3(0, 1.4, 0)));
        }

        // alley-oop: teammate releases the toss partway through the rise;
        // ball arcs from their hand to the player's, deterministic timing —
        // cannot desync, cannot stall.
        if (prop === 'alleyoop' && teammate) {
          const tossAt = EASTBAY_TIMING.extend * 0.45;
          const catchAt = EASTBAY_TIMING.extend * 0.85;
          if (clipTime >= tossAt && clipTime < catchAt) {
            teammate.animator.play(SPORT_CLIP.teammateToss, {});
            const tt = Math.min(1, (clipTime - tossAt) / (catchAt - tossAt));
            ball.position = Vector3.Lerp(
              teammate.root.position.add(new Vector3(0, 1.6, 0)),
              player.root.position.add(new Vector3(0, 1.9, 0)), tt,
            );
          } else if (clipTime >= catchAt) {
            attachBallToHand(ball, player.skeleton, 'RightHand');
          }
        }

        const wasOpen = qteWindowOpen;
        flight.update(dt);
        const window = CFG.qteWindowSec * (1 - styleTaps * 0.25) * flight.slamWindowScale;
        qteWindowOpen = clipTime >= EASTBAY_TIMING.extend - window / 2
          && clipTime <= EASTBAY_TIMING.extend + window / 2;
        if (qteWindowOpen && !wasOpen) ctx.setHud({ hint: 'SLAM!', slamPulse: true });
        if (!qteWindowOpen && wasOpen) ctx.setHud({ slamPulse: false });
        if (clipTime >= EASTBAY_TIMING.extend + window / 2) resolveDunk(ctx);
      }

      if (phase === 'resolve') {
        player.root.rotation.z *= Math.max(0, 1 - dt * 6);   // the air lean settles on the landing
        sinceRelease += dt;
        // a clipped dunk drops the dunker where the prop caught him, and the
        // prop goes over — the failure has to READ as contact, not a teleport
        if (obstacleClipped) {
          player.root.position.y = Math.max(0, player.root.position.y - 6 * dt);
          if (toppling && obstacle) {
            obstacle.rotation.x = Math.min(1.45, obstacle.rotation.x + dt * 4);
            if (obstacle.rotation.x >= 1.45) toppling = false;
          }
        }
        if (qteHit) {
          if (aHeld) hangSec += dt;               // rim hang builds while SLAM stays held
          if (flushThroughRim(ball, rim, releasePos, sinceRelease)) { contactPunch(ctx); void finishAttempt(ctx, true); }
        } else {
          ballSim.step(dt);
          if (sinceRelease > 1.2) void finishAttempt(ctx, false);
        }
      }

      // ── A+ P8 athlete hands: the replay's clips, the fall to feet-down, the reach weight ──────────────────────────
      if (replaying) {
        // H5: the replay re-flies the recorded root at 0.5× for up to 8 s — the clips re-fly with it: the run on the floor, the
        // launch clip from the replayed takeoff (at the live flight's own clip rate: the hang slow-mo stretched it), the finish
        // where the live flight resolved. Before: idle_stand flew the whole replay.
        const y = player.root.position.y;
        if (!replayAir && y > 0.05 && replayPrevY <= 0.05) {
          replayAir = true; replayAirSec = 0; replayAerial = false;
          const liveSec = Math.max(0.2, (resolveRealMs - launchRealMs) / 1000);
          replayAerialAt = liveSec / 0.5;
          playClip(STYLE_CLIP[style], { speedRatio: Math.max(0.2, 0.5 * clipTimeAtResolve / liveSec), onEnd: () => {} });
          console.info('[HANDS] replay air');
        } else if (!replayAir) playClip(SPORT_CLIP.moveLoop, { loop: true });
        if (replayAir) { replayAirSec += dt; if (!replayAerial && replayAirSec >= replayAerialAt) { replayAerial = true; playAir(aerialClip, 0.5); console.info('[HANDS] replay aerial'); } }
        replayPrevY = y;
      }
      // H5: the fall — a miss from the release height, a make once the replay hands the root back (the chair's own drop stays)
      if (dropToFloor && !replaying && !obstacleClipped) {
        player.root.position.y = Math.max(0, player.root.position.y - FALL_SPEED * dt);
        if (player.root.position.y <= 0) dropToFloor = false;
      }
      // H5: feet-down — the land clip plays when the body is back on the floor, never on the hit frame and never in the air
      if (airHeld && !replaying && phase !== 'cinematic' && player.root.position.y <= 0.05) landNow();
      // H1: the reach weight — up from the hang rise (in clip time), held through a make's flush to CONTACT, down otherwise
      const reachWant = (phase === 'cinematic' && clipTime >= EASTBAY_TIMING.rise && !obstacleClipped)
        || (phase === 'resolve' && qteHit && !contactLatch && !obstacleClipped)
        || (replaying && replayAir);
      const ikScale = ctx.scene.animationTimeScale ?? 1;
      const ikStep = dt * (phase === 'cinematic' && Number.isFinite(ikScale) && ikScale > 0 ? ikScale : 1) / HAND_IK_LAG_SEC;
      const prevIk = handIkT;
      handIkT = reachWant ? Math.min(1, handIkT + ikStep) : Math.max(0, handIkT - ikStep);
      if (prevIk === 0 && handIkT > 0) console.info('[HANDS] reach on'); else if (prevIk > 0 && handIkT === 0) console.info('[HANDS] reach off');

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
            ctx.setHud({ hint: '', judgeReveal: revealed, banner: perfect ? 'FIFTY!' : '' });
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
        ctx.camDirector.update(rival.root.position, Vector3.Zero(), rim);
      } else if (phase === 'cinematic' && rimCamCut) {
        // hold the rim-cam angle through the flush — no per-frame follow
      } else if (phase === 'judging') {
        // THE VERDICT. The camera used to be left entirely undriven here, so it
        // froze on whatever angle the replay cam happened to end on — for the
        // full 5.1s of the reveal, which is the mode's dramatic peak. A NULL
        // objective gives a clean hero framing with nothing else pulling on it:
        // the dunker, waiting on his card, which is the shot the broadcast cuts
        // to. Anything else in frame (the ball is the obvious candidate, and it
        // is wherever it bounced) drags the composition somewhere arbitrary.
        ctx.camDirector.update(player.root.position, Vector3.Zero(), null);
      } else if (phase !== 'contestOver') {
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
      hoopJuice?.dispose(); hoopJuice = null;
      if (ikScene && handIkObs) ikScene.onAfterAnimationsObservable.remove(handIkObs);   // A+ P8 H1
      handIkObs = null; ikScene = null; handIkT = 0;
      player?.dispose(); rival?.dispose(); replay?.dispose(); ball?.dispose();
      clearProps(); SoundKit.stopAmbient();
      dunkVenue?.dispose(); dunkVenue = null;  // M74
    },
  };

  function watchdog(ctx: ModeContext): void {
    if (phaseSec <= BUDGET_SEC[phase] || finishing) return;
    console.warn(`[FEL-DUNK] watchdog tripped in phase "${phase}" after ${phaseSec.toFixed(1)}s — auto-resolving`);
    switch (phase) {
      case 'approach':
        player.root.position.set(0, 0, CFG.gatherZ);
        ctx.setHud({ hint: 'HOLD to run — then tap jump' });
        phaseSec = 0;
        break;
      case 'charge': launchDunk(ctx); break;
      case 'cinematic': resolveDunk(ctx); break;
      case 'resolve': void finishAttempt(ctx, qteHit); break;
      case 'judging': void advanceAfterJudging(ctx); break;
      case 'rivalTurn': void advanceAfterRivalTurn(ctx); break;
    }
  }

  // --- M111: performance/timing-driven dunk finish selection -----------------
  // Aerial finish is chosen by QTE TIMING (how well the slam was timed); landing
  // is chosen by PERFORMANCE (the 3-judge total). Gated by DUNK_FINISH_VARIETY —
  // set NEXT_PUBLIC_DUNK_FINISH_VARIETY=false to instantly restore prior behavior.
  function pickAerialFinish(hit: boolean, acc: number): string {
    if (!DUNK_FINISH_VARIETY) return hit ? SPORT_CLIP.dunkScoreHang : SPORT_CLIP.jumpLand;
    if (!hit) return SPORT_CLIP.dunkFinishBlown;      // mistimed / whiffed slam
    if (acc >= 0.85) return SPORT_CLIP.dunkFinishWindmill;  // perfect timing
    if (acc >= 0.55) return SPORT_CLIP.dunkFinishTomahawk;  // good timing
    return SPORT_CLIP.dunkScoreHang;                        // clean but late/early
  }
  function finishBanner(hit: boolean, acc: number): string {
    if (!DUNK_FINISH_VARIETY || !hit) return '';
    if (acc >= 0.85) return 'WINDMILL!';
    if (acc >= 0.55) return 'TOMAHAWK!';
    return '';
  }
  function pickLanding(total: number): string {
    if (!DUNK_FINISH_VARIETY) return SPORT_CLIP.dunkLandCrouch;
    return total >= BAND_TOTAL.eruption ? SPORT_CLIP.dunkCelebrateBig : SPORT_CLIP.dunkLandCrouch;
  }

  function launchDunk(ctx: ModeContext): void {
    if (phase === 'cinematic') return;
    setPhase('cinematic');
    clipTime = 0; qteHit = false; qteWindowOpen = false; qteAccuracy = 0; ebState.inLeftHand = false;
    rimCamCut = false; hangSlowMoLatch = false; contactLatch = false; styleTaps = 0; hangSec = 0; trickLabels = []; obstacleClipped = false;
    settleLatch = false; settleArmed = false; setTrail('soft');   // A+ P5/P6: no gather at takeoff, the runway trail stays soft through it
    airHeld = false; dropToFloor = false; replaying = false; replayAir = false; launchRealMs = performance.now();   // A+ P8
    console.info('[JUICE-SOFT] launch');
    ctx.camDirector.resetLook();   // the takeoff → rimCamCut framing never inherits a look orbit
    // The run-up, not the stick at the release instant: during the charge the
    // stick is usually neutral, so the old `hypot(stickX, stickY)` read ~0 and
    // EVERY dunk launched as a walk-up. Peak measured approach speed is the
    // approach. (Max run is ~7 m/s; the mode auto-drifts at 2.)
    launchSpeed01 = Math.min(1, runUpPeak / 7);
    // FREE APPROACH (owner decision 2026-09-03): where you came from and how
    // you left the floor are judged, as in the real contest. The angle is read
    // from where you actually are; one-foot needs a real run.
    const approach = approachBonus(approachAngle(player.root.position.x, player.root.position.z, rim.x, rim.z), takeoffFor(runUpPeak));
    flight.launch(Math.min(1, charge * 0.5 + launchSpeed01 * 0.5), STYLE_TIER[style], approach.difficulty);
    if (launchSpeed01 < 0.3 && charge > 0.4) {
      ctx.setHud({ banner: 'WALK-UP — short air' });
      setTimeout(() => ctx.setHud({ banner: '' }), 900);
    } else if (approach.difficulty > 0) {
      ctx.setHud({ banner: `${approach.label}${approach.angleDeg >= 10 ? ` · ${approach.angleDeg}°` : ''}` });
      setTimeout(() => ctx.setHud({ banner: '' }), 900);
    }
    if (prop !== 'alleyoop') attachBallToHand(ball, player.skeleton, 'RightHand');
    else releaseBall(ball);   // ball waits at the teammate's hand until the toss beat
    SoundKit.play('whoosh', { pitch: 0.85 });
    playClip(STYLE_CLIP[style], { speedRatio: 1, onEnd: () => {} });   // the no-op chain holds the last frame if the clip ends in the air
  }

  /** The dunk dies at the prop: clip it mid-flight and the attempt is blown
   *  on contact — clank, stumble, the chair goes over, judges score what they
   *  saw (the miss path), crowd drops. This is the contest's signature risk. */
  function clipBlown(ctx: ModeContext): void {
    toppling = true;
    SoundKit.play('impact', { pitch: 0.6, volume: 0.6 }); console.info('[JUICE-SFX] impact chair');   // the chair is the miss's one hit (missClank skips)
    SoundKit.play('crowdGroan', { volume: 0.7 });
    ctx.feel?.impact?.(0.6);
    ctx.setHud({ banner: 'CAUGHT THE PROP — BLOWN' });
    setTimeout(() => ctx.setHud({ banner: '' }), 1200);
    resolveDunk(ctx);   // qteHit is false → the clank path; judging follows
  }

  function resolveDunk(ctx: ModeContext): void {
    if (phase === 'resolve') return;
    setPhase('resolve');
    sinceRelease = 0;
    qteWindowOpen = false;
    rimCamCut = false;
    ctx.camDirector.snapTo(player.root.position, rim);   // back to the follow after the cut
    ctx.setHud({ slamPulse: false });
    releasePos.copyFrom(ball.getAbsolutePosition());
    releaseBall(ball);
    if (!qteHit) { ballSim.launch(releasePos, clankOffRim(ball, rim)); missClank(ctx); setTrail('off'); armSettle(); }   // juice soft #2, #5; A+ P4
    aerialClip = pickAerialFinish(qteHit, qteAccuracy); resolveRealMs = performance.now(); clipTimeAtResolve = clipTime;
    if (!qteHit) dropToFloor = true;   // A+ P8 H5: a miss falls from the release height — feet-down is where the stumble lands
    const banner = finishBanner(qteHit, qteAccuracy);
    if (banner) ctx.setHud({ banner });
    playAir(aerialClip);   // A+ P8 H5: holds its last frame in the air; the land clip is feet-down's, the idle loop is the land's
  }

  // ── A+ P8 athlete hands (PM brief VENICE-DUNK-A-PLUS-P8, 2026-09-07) ─────────────────────────────────────────────
  /** H1: on top of the frame's clip pose (after-animations) the ball hand reaches for the rim with the eased weight, so the
   *  wrist LAGS the root into the iron instead of riding the clip rigidly. Pole: outward and slightly back, the dribble's own.
   *  Rotations only (shoulder / elbow) — never a bone translation, never a scale (TwoBoneIK's node-space solve). */
  function handIkApply(): void {
    const w = HAND_IK_MAX * handIkT * handIkT * (3 - 2 * handIkT);
    if (w <= 0.001 || !player) return;
    const side = ebState.inLeftHand ? 'Left' : 'Right';
    const arm = arms[side] ?? arms.Right; if (!arm) return;
    const sx = side === 'Left' ? -1 : 1;
    player.root.computeWorldMatrix(true);
    handIkTarget.set(rim.x, rim.y + HAND_IK_RIM_UP, rim.z);
    handIkPole.set(sx * 0.7, -0.2, -0.5).applyRotationQuaternionInPlace(player.root.absoluteRotationQuaternion);
    reachArm(arm, handIkTarget, handIkPole, w);
  }
  /** H5: every player clip goes through here. Babylon raises a group's end observable on stop() as well, so a chained onEnd
   *  used to fire the moment its clip was superseded — measured: the land crouch was cut to idle 150 ms in by the aerial's
   *  own chain. A superseded clip's chain is dead; only a clip that ends on its own runs it (and, with no chain, the idle
   *  loop — neverBindPose's contract, gated the same way). */
  function playClip(name: string, opts: PlayOpts = {}): AnimationGroup | null {
    const token = ++clipToken;
    if (opts.loop) return player.animator.play(name, opts);
    return player.animator.play(name, { ...opts, onEnd: () => {
      if (token !== clipToken) return;
      if (opts.onEnd) opts.onEnd(); else player.animator.play(SPORT_CLIP.idle, { loop: true });
    } });
  }
  /** H5: an aerial clip — the finish at resolve, a trick in the hang. Ends on its own in the air → holds its last frame
   *  (nothing else writes the pose; there is no bind pose to fall to); feet-down plays the land clip. */
  function playAir(name: string, speedRatio = 1): void {
    airHeld = true;
    playClip(name, { speedRatio, onEnd: () => { if (replaying || player.root.position.y > 0.05) console.info(`[HANDS] hold ${name}`); else landNow(); } });
  }
  /** H5: feet-down — the land clip, then the idle loop. Once per attempt. */
  function landNow(): void {
    if (!airHeld) return;
    airHeld = false;
    console.info(`[HANDS] land ${landingClip}`);
    playClip(landingClip, { onEnd: () => playClip(SPORT_CLIP.idle, { loop: true }) });
  }


  /** CONTACT (PM brief VENICE-JUICE-P0, 2026-09-06): console juice on the make's flush frame — one hit-stop, one shake,
   *  one white-gold flash, one rim thud — latched once per attempt so judge cards and FIFTY bursts never re-fire it.
   *  Never a second slow-mo: the hang already spent it at rise. Miss path: nothing here (the clank stays honest). */
  // ── Venice juice soft #2–#5 (PM brief VENICE-JUICE-SOFT, 2026-09-06) ─────────────────────────────────────────────
  /** #2 miss clank weight: a light metallic hit and a small feel impact on the clank — never the make's contactPunch. */
  function missClank(ctx: ModeContext): void {
    if (obstacleClipped) { console.info('[JUICE-SFX] clank skipped — the chair thud was the one hit'); return; }   // A+ P2: one hit per miss
    ctx.feel.impact(0.4);
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
    if (since < 220 || (player.root.position.y > 0.05 && since < 450)) return;
    settleArmed = false; landSettle(ctx);
  }
  function landSettle(ctx: ModeContext): void {
    if (settleLatch) return;
    settleLatch = true;
    fovRelease();   // A+ P5: a miss restores the fov at the land
    ctx.juice.shake(0.05, 110);
    EffectsKit.burst(ctx.scene, player.root.position.clone(), 'dust');
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
    setTimeout(() => { if (trail) trail.emitRate = 0; }, 130);
  }

  function contactPunch(ctx: ModeContext): void {
    if (contactLatch) return;
    contactLatch = true;
    ctx.juice.hitStop(70);
    ctx.juice.shake(0.12, 140);
    ctx.juice.flash('#fff6dd', 120);
    SoundKit.play('impact', { pitch: 0.7, volume: 0.8 }); console.info('[JUICE-SFX] impact slam');   // A+ P2: the ONE slam thud of the attempt
    fovRelease(); trailFlash();   // juice soft #4, #5: CONTACT restores the fov and cuts the trail with a flash
    armSettle();                  // A+ P4: the settle fires at feet-down, not on this frame
    hoopJuice?.punch();           // juice LOOK #1–#3: the hoop answers the make (never on a miss — this is the flush frame)
  }

  async function finishAttempt(ctx: ModeContext, made: boolean): Promise<void> {
    if (finishing) return;
    finishing = true;

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
      const missScores = judgeDunk(
        Math.max(0, (STYLE_TIER[style] + PROP_BONUS[prop]) * 0.30),   // they saw the attempt
        0,                                                            // and they saw it fail
        Math.max(0, STYLE_TIER[style] * 0.22 + styleTaps * 0.4),
      );
      const missTotal = missScores.reduce((a, j) => a + j.score, 0);
      playerTotal += missTotal; misses++;
      lastScores = missScores;
      crowd.onScore(missTotal);
      revealed = [];
      reveal.start(missScores);
      ctx.setHud({
        banner: 'MISSED — the judges saw it', judgeReveal: [],
        score: playerTotal, chain, hype: Math.round(hype),
      });
      landingClip = SPORT_CLIP.dunkLandCrouch; landNow();   // A+ P8 H5: normally landed at feet-down already (~0.1 s after the release); this is the floor
      setPhase('judging');
      // Pad acceptance #4: a miss is one beat, then the next run-up — no reveal wait, no card, no re-press
      // (a hold still down streams the trigger and starts the next run the frame the approach resets).
      setTimeout(() => { ctx.setHud({ banner: '' }); void advanceAfterJudging(ctx); }, MISS_BEAT_MS);
      finishing = false;
      return;
    }

    // VARIETY MEMORY — the judges remember what they've seen this contest
    const combo = `${style}_${prop}_${trickLabels.join('+') || 'plain'}`;
    const isRepeat = usedCombos.has(combo);
    usedCombos.add(combo);
    const varietyMod = isRepeat ? 0.8 : 1;
    const varietyBonus = isRepeat ? 0 : 0.5;
    if (isRepeat) {
      ctx.setHud({ banner: 'THE JUDGES HAVE SEEN THAT ONE…' });
      setTimeout(() => ctx.setHud({ banner: '' }), 900);
    }

    // RIM HANG — held through the flush pays style before the reveal
    const hangBonus = hangSec >= 0.5 ? 1 : 0;
    if (hangBonus > 0) {
      SoundKit.play('crowdCheer', { volume: 0.4 });
      ctx.setHud({ banner: 'HANG TIME!' });
      setTimeout(() => ctx.setHud({ banner: '' }), 700);
    }

    // Phase 6: trick gestures carry the difficulty (style tier is the base
    // inside flight.attempt.difficulty; combo chains get their 1.35x there).
    // The run-up is judged too: a full-speed runway attack reads harder than
    // a walk-up, exactly as the real panel reads it.
    const trickDifficulty = flight.attempt.difficulty - STYLE_TIER[style];
    const difficulty = Math.max(0, Math.min(10,
      (STYLE_TIER[style] + trickDifficulty + PROP_BONUS[prop] + charge * 2 + launchSpeed01 * 1.0
        + styleTaps * 1.2 + varietyBonus) * varietyMod));
    const execution = Math.max(0, Math.min(10, qteAccuracy * 10));
    const styleScore = Math.max(0, Math.min(10, STYLE_TIER[style] * 0.6 + Math.min(2, hype / 50) + styleTaps * 0.8 + hangBonus));

    const scores = judgeDunk(difficulty, execution, styleScore);
    lastScores = scores;
    const dunkTotal = scores.reduce((s, j) => s + j.score, 0);   // MIN_TOTAL..PERFECT_TOTAL (30..50)

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
      ctx.setHud({ banner: tier === 'on_fire' ? 'THE BUILDING IS ON FIRE' : 'HEATING UP…' });
    }

    if (dunkTotal >= CHAIN_THRESHOLD) {
      chain++;
      if (chain >= 2) {
        hype = Math.min(100, hype + chain * 5);
        ctx.setHud({ banner: `CHAIN x${chain}!` });
        SoundKit.play('uiTick', { pitch: 1 + chain * 0.15 });
      }
    } else {
      chain = 0;
    }

    playerTotal += dunkTotal; makes++; bestChain = Math.max(bestChain, chain);
    // Hype is fed by the QUALITY of the dunk, not the raw total — the total's
    // range moved with the ceiling and `dunkTotal * 2` would now fill the meter
    // almost instantly, quietly wrecking the momentum curve. Per-judge average
    // is scale-free: this yields the same 36..60 it always did.
    hype = Math.min(100, hype + perJudgeAvg(dunkTotal) * 6);

    ctx.feel?.impact?.(0.2 + execution / 15);
    SoundKit.play('score', { pitch: 1 + Math.min(1, hype / 100) });
    EffectsKit.burst(ctx.scene, rim, 'net');
    if (dunkTotal >= BAND_TOTAL.eruption) { SoundKit.play('crowdCheer'); EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(0, 1.8, 0)), 'confetti'); }
    landingClip = pickLanding(dunkTotal);   // A+ P8 H5: plays at feet-down after the replay hands the root back, not on the flush frame

    // A+ P8 H5: the replay re-flies the recorded root for up to 8 s (a 4 s window at 0.5×) and outlives this 3.5 s race; the
    // un-raced promise is what knows when the root is the mode's again — then it falls to the floor and lands. The replay
    // writes a rotationQuaternion the mode never uses (it yaws by Euler), so the Euler yaw is handed back with the root.
    replaying = true; replayAir = false; replayAerial = false; replayPrevY = player.root.position.y;
    const replayDone = replay.play(rim).then(() => { replaying = false; replayAir = false; player.root.rotationQuaternion = null; dropToFloor = true; console.info('[HANDS] replay end'); });
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

  async function advanceAfterJudging(ctx: ModeContext): Promise<void> {
    if (phase !== 'judging') return;   // already advanced (watchdog vs normal path race)
    ctx.setHud({ judgeReveal: null, banner: '' });
    dunkInRound++;
    if (dunkInRound < DUNKS_PER_ROUND) {
      resetForNextAttempt(ctx);
      return;
    }
    dunkInRound = 0;
    await rivalRound(ctx);
  }

  function resetForNextAttempt(ctx: ModeContext): void {
    player.root.position.set(0, 0, CFG.startZ);
    player.root.rotation.y = Math.PI;
    player.root.rotation.z = 0; airLean = 0; holdRunSpeed = 0;
    airHeld = false; dropToFloor = false; replaying = false; replayAir = false; player.root.rotationQuaternion = null;   // A+ P8
    playClip(SPORT_CLIP.idle, { loop: true });
    charge = 0; qteHit = false; qteWindowOpen = false; qteAccuracy = 0; rimCamCut = false; hangSlowMoLatch = false; contactLatch = false;
    styleTaps = 0; hangSec = 0; revealed = [];
    runUpPeak = 0; obstacleClipped = false; toppling = false;
    settleLatch = false; settleArmed = false; fovRelease(); setTrail('soft');   // juice soft: back to the runway
    void setupProp(ctx);
    ctx.camDirector.snapTo(player.root.position, rim);
    setPhase('approach');
    // THE NEED — final-round pressure number: what this dunk must average
    // to stay ahead of the rival's pace (they dunk after you)
    const isFinalRound = round === TOTAL_ROUNDS;
    const deficit = rivalTotal - playerTotal;
    const need = isFinalRound ? Math.max(0, deficit + RIVAL_PACE) : 0;
    ctx.setHud({
      dunkNum: `${dunkInRound + 1}/${DUNKS_PER_ROUND}`,
      need: need > 0 ? need : 0,
      hint: need > 0
        ? `FINAL ROUND — you need big numbers (${deficit > 0 ? `down ${deficit}` : `up ${-deficit}`})`
        : 'Pick your PROP (X / d-pad) · STYLE to cycle · mid-air STYLE taps for difficulty · HOLD SLAM to hang',
      charge: 0, slamPulse: false,
    });
  }

  async function rivalRound(ctx: ModeContext): Promise<void> {
    setPhase('rivalTurn');
    // The camera follows the rival for this stretch, so the rival IS the hero
    // on screen. FrameGuard watches heroRef and would otherwise spend the whole
    // rival round reporting the player — who is standing off-camera by design —
    // as lost, and after two strikes would recenter the camera off the rival
    // mid-dunk. Point the guard at whoever the camera is actually following.
    ctx.heroRef.current = rival.root;
    ctx.setHud({ hint: 'RIVAL ROUND', judgeReveal: null });
    for (let i = 0; i < DUNKS_PER_ROUND; i++) {
      ctx.camDirector.snapTo(rival.root.position, rim);
      rival.animator.play(SPORT_CLIP.dunkLaunchPower, { onEnd: () => rival.animator.play(SPORT_CLIP.idle, { loop: true }) });
      const t0 = performance.now();
      const from = rival.root.position.clone();
      await new Promise<void>((res) => {
        const obs = ctx.scene.onBeforeRenderObservable.add(() => {
          const k = Math.min(1, (performance.now() - t0) / 1300);
          rival.root.position.x = from.x + (rim.x - from.x) * k;
          rival.root.position.z = from.z + (rim.z + 0.7 - from.z) * k;
          rival.root.position.y = Math.sin(k * Math.PI) * 1.2;
          if (k >= 1) { ctx.scene.onBeforeRenderObservable.remove(obs); res(); }
        });
      });
      // The rival is a CONTENDER, not a wall. These inputs used to average a
      // ~43 card, which is near the top of what a good player can produce, on
      // every single attempt — so the contest was effectively decided before the
      // player took their second dunk. A real field is beatable and streaky:
      // this averages high-30s, swings, and BLOWS one now and then, which is
      // also what real dunk contests look like.
      const rivalBlew = Math.random() < RIVAL_BLOWN_CHANCE;
      const rDiff = rivalBlew ? 0.4 : 2.6 + Math.random() * 3.4;
      const rExec = rivalBlew ? 0 : 3.4 + Math.random() * 3.4;
      const rStyle = rivalBlew ? 0.5 : 2.2 + Math.random() * 3.2;
      const rScores = judgeDunk(rDiff, rExec, rStyle);
      const rTotal = rScores.reduce((s, j) => s + j.score, 0);
      rivalTotal += rTotal;
      SoundKit.play(rivalBlew ? 'miss' : 'crowdGroan', { volume: 0.35 });
      rival.animator.play(rivalBlew ? SPORT_CLIP.dunkLandCrouch : SPORT_CLIP.scoreCelebrate,
        { onEnd: () => rival.animator.play(SPORT_CLIP.idle, { loop: true }) });
      ctx.setHud({ rivalScore: rivalTotal, banner: rivalBlew ? `RIVAL BLOWS IT — ${rTotal}` : `RIVAL SCORES ${rTotal}` });
      rival.root.position.set(3.2, 0, CFG.rimZ + 3);
      await new Promise((r) => setTimeout(r, 1200));
    }
    ctx.setHud({ banner: '' });
    ctx.heroRef.current = player.root;          // the player is the hero again
    await advanceAfterRivalTurn(ctx);
  }

  async function advanceAfterRivalTurn(ctx: ModeContext): Promise<void> {
    if (round < TOTAL_ROUNDS) {
      round++;
      ctx.setHud({ round: `${round}/${TOTAL_ROUNDS}`, banner: `ROUND ${round}` });
      setTimeout(() => ctx.setHud({ banner: '' }), 1400);
      resetForNextAttempt(ctx);
      return;
    }
    setPhase('contestOver');
    SoundKit.play('whistle');
    const won = playerTotal >= rivalTotal;
    if (won) { SoundKit.play('crowdCheer'); EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(0, 2, 0)), 'confetti'); }
    ctx.end(won ? 'CONTEST_WON' : 'CONTEST_LOST', playerTotal, { rivalTotal, rounds: TOTAL_ROUNDS, makes, misses, bestChain });
  }

  return def;
})();

// HUD CONTRACT — same as M52 (round, dunkNum, score, rivalScore, style, prop,
// hype, charge, slamPulse, hint, banner, judgeReveal, chain) plus NEW:
//   need: number — 0 normally; on final-round attempts, the judge total this
//     dunk should hit to hold off the rival's pace (bezel: "NEED N" chip)
